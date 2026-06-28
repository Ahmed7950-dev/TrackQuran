-- 20260628_student_profile_icon.sql
-- Animated student profile icons (Lottie JSON).

-- 1) Store the chosen icon's public URL on the student.
alter table public.students add column if not exists profile_icon text;

-- 2) Let authenticated tutors upload/list/delete icons in the existing public
--    `tajweed-assets` bucket under the profile-icons/ prefix. (Public read is
--    already enabled on that bucket, so anonymous family/student links can fetch.)
drop policy if exists profile_icons_write on storage.objects;
create policy profile_icons_write on storage.objects
  for all to authenticated
  using (bucket_id = 'tajweed-assets' and name like 'profile-icons/%')
  with check (bucket_id = 'tajweed-assets' and name like 'profile-icons/%');
