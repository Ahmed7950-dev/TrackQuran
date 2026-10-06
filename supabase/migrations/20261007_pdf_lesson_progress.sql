-- Where a Tajweed or Qaedah PDF lesson was left off.
--
-- NOT on arabic_lesson_progress, which was the obvious thought: that table has
-- foreign keys to BOTH arabic_lessons and arabic_students, and these rows point
-- at tajweed_lessons / qaedah_topics and at a Quran-side student. Every insert
-- would be rejected.
--
-- lesson_id carries no foreign key of its own because it names a row in one of
-- two different tables depending on `kind`.
create table if not exists public.pdf_lesson_progress (
  id             uuid primary key default gen_random_uuid(),
  -- students.id is TEXT, not uuid; tajweed_lessons.id and qaedah_topics.id are
  -- uuid. Matching those exactly is the whole reason this table exists.
  student_id     text not null references public.students(id) on delete cascade,
  lesson_id      uuid not null,
  kind           text not null check (kind in ('tajweed', 'qaedah')),
  status         text not null default 'in_progress' check (status in ('in_progress', 'done')),
  last_slide     int  not null default 1,
  total_slides   int,
  revision_count int  not null default 0,
  updated_at     timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create index if not exists pdf_lesson_progress_student_kind
  on public.pdf_lesson_progress (student_id, kind);

alter table public.pdf_lesson_progress enable row level security;

-- The same permissive pair arabic_lesson_progress uses: the tutor app and the
-- student's share link both read and write it, and neither carries a session
-- this table could key off.
drop policy if exists pdf_lesson_progress_read  on public.pdf_lesson_progress;
drop policy if exists pdf_lesson_progress_write on public.pdf_lesson_progress;
create policy pdf_lesson_progress_read  on public.pdf_lesson_progress for select using (true);
create policy pdf_lesson_progress_write on public.pdf_lesson_progress for all using (true) with check (true);

-- Undo the column added by the first attempt at this.
alter table public.arabic_lesson_progress drop column if exists kind;
