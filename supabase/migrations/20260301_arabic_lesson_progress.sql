-- ─── Arabic lesson progress + dated activity logs ───────────────────────────
-- Run in the Supabase SQL Editor.
--
-- Tracks, per student per lesson:
--   • status         — 'in_progress' | 'done'  (no row = not started)
--   • last_slide     — 1-based PDF page to resume on
--   • total_slides   — page count at the time of the last update (for display)
--   • revision_count — completed revisions AFTER the first 'done'
-- and an append-only activity log of dated events that powers the progress
-- calendar (one row per "Mark progress" / "Mark done" / "Log revision" action).
--
-- arabic_students.id is TEXT (see arabic_lesson_sessions_migration.sql);
-- arabic_lessons.id is TEXT.

create table if not exists public.arabic_lesson_progress (
  id             uuid primary key default gen_random_uuid(),
  student_id     text not null references public.arabic_students(id) on delete cascade,
  lesson_id      text not null references public.arabic_lessons(id)  on delete cascade,
  status         text not null default 'in_progress',  -- 'in_progress' | 'done'
  last_slide     int  not null default 1,
  total_slides   int,
  revision_count int  not null default 0,
  updated_at     timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create table if not exists public.arabic_lesson_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  text not null references public.arabic_students(id) on delete cascade,
  lesson_id   text not null references public.arabic_lessons(id)  on delete cascade,
  kind        text not null,            -- 'progress' | 'done' | 'revision'
  slide       int,
  created_at  timestamptz not null default now()
);

create index if not exists arabic_lesson_progress_student_idx on public.arabic_lesson_progress(student_id);
create index if not exists arabic_lesson_logs_student_idx      on public.arabic_lesson_logs(student_id);
create index if not exists arabic_lesson_logs_created_idx      on public.arabic_lesson_logs(created_at);

-- ── RLS (mirrors the permissive style of the exam tables) ───────────────────
alter table public.arabic_lesson_progress enable row level security;
alter table public.arabic_lesson_logs     enable row level security;

create policy "arabic_lesson_progress_read"  on public.arabic_lesson_progress for select to anon, authenticated using (true);
create policy "arabic_lesson_progress_write" on public.arabic_lesson_progress for all    to anon, authenticated using (true) with check (true);
create policy "arabic_lesson_logs_read"      on public.arabic_lesson_logs     for select to anon, authenticated using (true);
create policy "arabic_lesson_logs_write"     on public.arabic_lesson_logs     for all    to anon, authenticated using (true) with check (true);
