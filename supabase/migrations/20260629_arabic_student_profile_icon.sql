-- 20260629_arabic_student_profile_icon.sql
-- Store the chosen animated avatar's path (e.g. /avatars/boys/cat.json) on the
-- Arabic student, mirroring the Quran students.profile_icon column. Avatars are
-- bundled with the app (public/avatars/), so no storage bucket is needed.

alter table public.arabic_students add column if not exists profile_icon text;
