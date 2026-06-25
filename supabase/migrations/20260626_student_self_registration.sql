-- ============================================================
-- Student self-registration foundation.
--
-- Students can register on the website with Google sign-in, enter their own
-- details, choose Arabic and/or Quran, fill subject-specific onboarding, and
-- pick a tutor. Self-registered students are linked to their Google auth user
-- (auth_user_id) and own their own record (no shareable link needed).
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

-- ── Profiles: allow the 'student' role + tutor-directory fields ──────────────
alter table public.profiles
  add column if not exists photo_url text,
  add column if not exists bio       text,
  add column if not exists subjects  text[];  -- e.g. {'quran','arabic'} — what the tutor teaches

-- Permit 'student' alongside 'teacher'/'admin' (role column added in an earlier migration).
do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
exception when others then null;
end $$;
alter table public.profiles
  add constraint profiles_role_check check (role in ('teacher','admin','student'));

-- ── Quran students: link to a Google account + self-registration onboarding ──
alter table public.students
  add column if not exists auth_user_id     uuid,
  add column if not exists self_registered  boolean not null default false,
  add column if not exists lessons_for_self boolean,           -- true = for themselves
  add column if not exists lessons_for_whom text,              -- e.g. "my child", "a friend"
  add column if not exists lessons_per_week  int,
  add column if not exists quran_level       int,              -- 1..10
  add column if not exists study_focus       text[],           -- qaedah | recitation_fluency | basic_reading | advanced_tajweed | ijazah
  add column if not exists study_addons      text[];           -- aqeedah | seerah | fiqh | tafseer
create index if not exists idx_students_auth_user on public.students(auth_user_id);

-- ── Arabic students: link to a Google account ───────────────────────────────
alter table public.arabic_students
  add column if not exists auth_user_id    uuid,
  add column if not exists self_registered boolean not null default false;
create index if not exists idx_arabic_students_auth_user on public.arabic_students(auth_user_id);

-- ── RLS: a self-registered student owns their own row ───────────────────────
drop policy if exists "student reads own row"   on public.students;
create policy "student reads own row"   on public.students for select using (auth_user_id = auth.uid());
drop policy if exists "student inserts own row" on public.students;
create policy "student inserts own row" on public.students for insert with check (auth_user_id = auth.uid());
drop policy if exists "student updates own row" on public.students;
create policy "student updates own row" on public.students for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

drop policy if exists "ar student reads own row"   on public.arabic_students;
create policy "ar student reads own row"   on public.arabic_students for select using (auth_user_id = auth.uid());
drop policy if exists "ar student inserts own row" on public.arabic_students;
create policy "ar student inserts own row" on public.arabic_students for insert with check (auth_user_id = auth.uid());
drop policy if exists "ar student updates own row" on public.arabic_students;
create policy "ar student updates own row" on public.arabic_students for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

-- ── Public tutor directory: list all tutors for the student to choose from ──
-- SECURITY DEFINER so the (unauthenticated) registration page can read just the
-- safe directory fields without exposing the whole profiles table.
create or replace function public.list_tutors()
returns table (id uuid, name text, photo_url text, bio text, subjects text[])
language sql stable security definer set search_path = public as $$
  select id, name, photo_url, bio, subjects
  from public.profiles
  where coalesce(role, 'teacher') <> 'student'
  order by name;
$$;
grant execute on function public.list_tutors() to anon, authenticated;
