-- ─── Verbs belong to ONE student ────────────────────────────────────────────
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- 20261116 shared a tutor's verbs with every student of the same variety. The
-- tutor changed their mind: each student has their own verbs. A verb now
-- carries the student it was written for, and the app lists by student.
-- `variety` stays: it picks the pronouns (Palestinian has no dual).
--
-- Rows saved before this have no student; the app no longer shows them.

alter table public.arabic_verbs
  add column if not exists student_id text;          -- arabic_students.id

create index if not exists arabic_verbs_student
  on public.arabic_verbs (student_id, variety, created_at);
