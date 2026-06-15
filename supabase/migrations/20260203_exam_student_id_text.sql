-- arabic_exam_unlocks.student_id and arabic_exam_attempts.student_id were
-- declared as uuid, but Arabic student IDs use a custom format (e.g.
-- "ar-1778670118558") that is not a valid UUID. Change both to text.

alter table public.arabic_exam_unlocks
  alter column student_id type text using student_id::text;

alter table public.arabic_exam_attempts
  alter column student_id type text using student_id::text;
