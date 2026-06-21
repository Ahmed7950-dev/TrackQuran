-- ============================================================
-- Allow GCal event → student linking for QURAN students too.
--
-- arabic_lesson_sessions.student_id was a FK to arabic_students(id), so linking
-- a Quran student (id lives in the `students` table) violated the constraint and
-- silently failed. Drop the FK — student_id stays a plain text id that the app
-- resolves against the right roster (arabic_students or students).
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`).
-- ============================================================

alter table public.arabic_lesson_sessions
  drop constraint if exists arabic_lesson_sessions_student_id_fkey;
