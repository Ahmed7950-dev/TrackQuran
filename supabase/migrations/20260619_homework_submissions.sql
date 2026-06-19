-- ─── Homework submissions — stores student answers & tutor grading ─────────
-- Run in the Supabase SQL Editor.
--
-- Also adds a `metadata` jsonb column to booking_notifications so homework
-- notifications can carry { lessonId } for deep-link navigation.

-- ── Homework submissions table ────────────────────────────────────────────────

create table if not exists public.homework_submissions (
  id           uuid        primary key default gen_random_uuid(),
  lesson_id    text        not null references public.arabic_lessons(id) on delete cascade,
  student_id   text        not null,
  teacher_id   uuid        not null,
  answers      jsonb       not null default '{}',      -- Record<itemId, string>
  sub_answers  jsonb       not null default '{}',      -- Record<itemId, Record<number, string>>
  grading      jsonb       not null default '{}',      -- Record<itemId, {correct: boolean, note?: string}>
  submitted_at timestamptz not null default now(),
  graded_at    timestamptz,
  unique (lesson_id, student_id)
);

create index if not exists hw_submissions_lesson_idx  on public.homework_submissions (lesson_id);
create index if not exists hw_submissions_student_idx on public.homework_submissions (student_id);
create index if not exists hw_submissions_teacher_idx on public.homework_submissions (teacher_id);

alter table public.homework_submissions enable row level security;

-- Anyone can insert / update (student submits, tutor grades)
create policy "hw_submissions_read"  on public.homework_submissions
  for select to anon, authenticated using (true);
create policy "hw_submissions_write" on public.homework_submissions
  for all    to anon, authenticated using (true) with check (true);

-- ── booking_notifications: add metadata column ────────────────────────────────

alter table public.booking_notifications
  add column if not exists metadata jsonb;
