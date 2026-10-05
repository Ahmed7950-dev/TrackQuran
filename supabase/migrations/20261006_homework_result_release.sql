-- The tutor decides when a marked homework goes back to the student.
--
-- Until now every autosave of the marking screen fired a "homework marked"
-- notification at the student — one per tick, per note, per keystroke batch.
-- Marks are now released deliberately: this stamps the moment it happened, and
-- the student is told once.
alter table public.homework_submissions
  add column if not exists result_sent_at timestamptz;

comment on column public.homework_submissions.result_sent_at is
  'When the tutor sent the marked result to the student. Null = still marking.';
