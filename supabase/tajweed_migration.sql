-- ============================================================
-- TAJWEED LESSONS — Supabase Migration
-- Run this entire file in the Supabase SQL Editor once.
-- Then create a public storage bucket named 'tajweed-assets'
-- in Storage → New bucket → Public.
-- ============================================================

-- 1. Tajweed lessons table — created/edited only by admins, viewable by all teachers
create table if not exists public.tajweed_lessons (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  description  text,
  order_index  integer not null default 0,
  pdf_url      text,                                 -- Supabase Storage public URL of original PDF
  slides       jsonb not null default '[]'::jsonb,   -- Array<Slide>
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tajweed_lessons_order_idx on public.tajweed_lessons (order_index, created_at);

-- 2. Lesson completion tracking — one row per (student, lesson) marked done by a tutor
create table if not exists public.tajweed_lesson_completions (
  id           uuid primary key default gen_random_uuid(),
  student_id   text references public.students(id) on delete cascade not null,
  lesson_id    uuid references public.tajweed_lessons(id) on delete cascade not null,
  tutor_id     uuid references auth.users(id) not null,
  completed_at timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create index if not exists tajweed_completions_student_idx on public.tajweed_lesson_completions (student_id);
create index if not exists tajweed_completions_lesson_idx  on public.tajweed_lesson_completions (lesson_id);

-- ============================================================
-- 3. Helper: is_admin()  — checks if current user has admin role
--    Stores admin status in profiles.role column
-- ============================================================
alter table public.profiles add column if not exists role text not null default 'teacher';

create or replace function public.is_admin() returns boolean
language sql stable security definer as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- 4. Row Level Security
-- ============================================================
alter table public.tajweed_lessons             enable row level security;
alter table public.tajweed_lesson_completions  enable row level security;

-- Lessons: any authenticated user can read; only admins can write
drop policy if exists "Anyone can read lessons" on public.tajweed_lessons;
create policy "Anyone can read lessons"
  on public.tajweed_lessons for select
  using (auth.role() = 'authenticated');

drop policy if exists "Admins manage lessons" on public.tajweed_lessons;
create policy "Admins manage lessons"
  on public.tajweed_lessons for all
  using (public.is_admin())
  with check (public.is_admin());

-- Completions: tutors can read+write completions for their own students
drop policy if exists "Tutor read own completions" on public.tajweed_lesson_completions;
create policy "Tutor read own completions"
  on public.tajweed_lesson_completions for select
  using (
    auth.uid() = tutor_id
    or exists (select 1 from public.students s where s.id = student_id and s.teacher_id = auth.uid())
  );

drop policy if exists "Tutor insert own completions" on public.tajweed_lesson_completions;
create policy "Tutor insert own completions"
  on public.tajweed_lesson_completions for insert
  with check (
    auth.uid() = tutor_id
    and exists (select 1 from public.students s where s.id = student_id and s.teacher_id = auth.uid())
  );

drop policy if exists "Tutor delete own completions" on public.tajweed_lesson_completions;
create policy "Tutor delete own completions"
  on public.tajweed_lesson_completions for delete
  using (auth.uid() = tutor_id);

-- ============================================================
-- 5. RPC: get all completions for a student (used by SharedReportPage)
--    Returns lesson info joined with completion timestamp.
-- ============================================================
create or replace function public.get_student_tajweed_completions(p_student_id text)
returns table (
  lesson_id    uuid,
  lesson_title text,
  completed_at timestamptz
)
language sql security definer stable as $$
  select c.lesson_id, l.title, c.completed_at
  from public.tajweed_lesson_completions c
  join public.tajweed_lessons l on l.id = c.lesson_id
  where c.student_id = p_student_id
  order by c.completed_at desc;
$$;

grant execute on function public.get_student_tajweed_completions(text) to anon, authenticated;

-- ============================================================
-- 6. Auto-update timestamp trigger on lessons
-- ============================================================
create or replace function public.touch_lesson_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_touch_tajweed_lessons on public.tajweed_lessons;
create trigger trg_touch_tajweed_lessons before update on public.tajweed_lessons
for each row execute function public.touch_lesson_updated_at();

-- ============================================================
-- DONE.
-- After running:
--   1. Storage → New bucket: name = 'tajweed-assets', Public = ON
--   2. Make a user an admin:
--        update public.profiles set role = 'admin' where id = '<your-user-uuid>';
-- ============================================================
