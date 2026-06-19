-- ─── Homework submissions v2 — multiple attempts per student ─────────────────
-- Run in the Supabase SQL Editor.
--
-- Adds attempt_number so each submission is a new row (not overwritten).
-- Drops the old unique(lesson_id, student_id) constraint.

ALTER TABLE public.homework_submissions
  ADD COLUMN IF NOT EXISTS attempt_number int NOT NULL DEFAULT 1;

-- Drop old single-attempt unique constraint (ignore error if it doesn't exist)
ALTER TABLE public.homework_submissions
  DROP CONSTRAINT IF EXISTS homework_submissions_lesson_id_student_id_key;

-- New constraint: one row per (lesson, student, attempt)
CREATE UNIQUE INDEX IF NOT EXISTS homework_submissions_attempt_idx
  ON public.homework_submissions (lesson_id, student_id, attempt_number);
