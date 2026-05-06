-- ============================================================
-- TRACKQURAN — Supabase Schema
-- Run this entire file in the Supabase SQL Editor once.
-- ============================================================

-- 1. Teacher profile table (extends auth.users)
create table if not exists public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  name       text not null,
  tajweed_rules text[] not null default array[
    'Izhar', 'Idgham', 'Iqlab', 'Ikhfa',
    'Qalqalah (Sughra & Kubra)', 'Madd (Natural, Muttasil, Munfasil)',
    'Rules of Noon Sakinah & Tanween', 'Rules of Meem Sakinah',
    'Tafkhim & Tarqiq (Raa)', 'Ghunnah',
    'Lam Shamsiyyah & Qamariyyah', 'Sifaat al-Huruf (Letter Attributes)',
    'Makharij al-Huruf (Articulation Points)'
  ],
  created_at timestamptz not null default now()
);

-- 2. Students table — one row per student, all nested data as JSONB
create table if not exists public.students (
  id                          text primary key,
  teacher_id                  uuid references auth.users(id) on delete cascade not null,
  name                        text not null,
  dob                         text not null,
  recitation_achievements     jsonb not null default '[]'::jsonb,
  memorization_achievements   jsonb not null default '[]'::jsonb,
  attendance                  jsonb not null default '[]'::jsonb,
  mastered_tajweed_rules      text[] not null default array[]::text[],
  tafsir_reviews              jsonb not null default '[]'::jsonb,
  tafsir_memorization_reviews jsonb not null default '[]'::jsonb,
  mistakes                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);

-- ============================================================
-- 3. Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.students enable row level security;

-- Profiles: users can only access their own row
create policy "Own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "Own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "Own profile update" on public.profiles for update using (auth.uid() = id);

-- Students: teachers can only access their own students
create policy "Teacher student read"   on public.students for select  using (auth.uid() = teacher_id);
create policy "Teacher student insert" on public.students for insert  with check (auth.uid() = teacher_id);
create policy "Teacher student update" on public.students for update  using (auth.uid() = teacher_id);
create policy "Teacher student delete" on public.students for delete  using (auth.uid() = teacher_id);

-- ============================================================
-- 4. RPC: student self-login (name + dob, no auth account)
-- Runs with SECURITY DEFINER so it can bypass RLS to search
-- across all teachers. Returns only the matched student's data.
-- ============================================================
create or replace function public.find_student_by_name_and_dob(
  p_first_name text,
  p_last_name  text,
  p_dob        text
)
returns table (
  student_data jsonb,
  teacher_id   uuid
)
language sql
security definer
stable
as $$
  select
    jsonb_build_object(
      'id',                          s.id,
      'name',                        s.name,
      'dob',                         s.dob,
      'recitation_achievements',     s.recitation_achievements,
      'memorization_achievements',   s.memorization_achievements,
      'attendance',                  s.attendance,
      'mastered_tajweed_rules',      to_jsonb(s.mastered_tajweed_rules),
      'tafsir_reviews',              s.tafsir_reviews,
      'tafsir_memorization_reviews', s.tafsir_memorization_reviews,
      'mistakes',                    s.mistakes
    ) as student_data,
    s.teacher_id
  from public.students s
  where lower(s.name) = lower(trim(p_first_name) || ' ' || trim(p_last_name))
    and s.dob = p_dob
  limit 1;
$$;

-- ============================================================
-- 5. Auto-create profile row when a new user signs up
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- name comes from raw_user_meta_data set during sign-up
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Shared student mistake reports ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  report_data JSONB NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shared_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can read a report by its ID
CREATE POLICY "Public read shared reports"
  ON shared_reports FOR SELECT
  USING (true);

-- Only the owning teacher can insert
CREATE POLICY "Teachers insert own reports"
  ON shared_reports FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

-- Only the owning teacher can delete
CREATE POLICY "Teachers delete own reports"
  ON shared_reports FOR DELETE
  USING (auth.uid() = teacher_id);
