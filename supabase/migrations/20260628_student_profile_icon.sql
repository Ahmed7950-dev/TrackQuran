-- 20260628_student_profile_icon.sql
-- Store the chosen animated avatar's path (e.g. /avatars/boys/cat.json) on the
-- student. Avatars are bundled with the app (public/avatars/), so no storage
-- bucket or policy is needed.

alter table public.students add column if not exists profile_icon text;
