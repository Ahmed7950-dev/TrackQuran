-- A tutor's spoken correction on ONE marked letter.
--
-- Ten seconds of "say it like this" beats a paragraph describing it, so the
-- mistake ring can record one, and the student hears it when he taps that word
-- on his homework page instead of the word-by-word recitation.
--
-- Only the audio lives here. The pointer lives on the mistake itself, inside
-- students.mistakes -> '<surah>:<ayah>:<word>:<letter>' -> 'voice', so there is
-- nothing to migrate: that column is jsonb and every entry written before today
-- simply has no `voice` key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mistake-notes', 'mistake-notes', true, 2097152,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Read is open: the student reaches his homework through an unauthenticated
-- link and holds nothing but the file's public URL.
drop policy if exists "mistake notes read" on storage.objects;
create policy "mistake notes read" on storage.objects for select
  using (bucket_id = 'mistake-notes');

-- Writing is the tutor's alone. This is the opposite way round from
-- `quran-recitations`, where the STUDENT is the one uploading and the policies
-- therefore have to admit anon.
drop policy if exists "mistake notes insert" on storage.objects;
create policy "mistake notes insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'mistake-notes');

drop policy if exists "mistake notes update" on storage.objects;
create policy "mistake notes update" on storage.objects for update to authenticated
  using (bucket_id = 'mistake-notes') with check (bucket_id = 'mistake-notes');

drop policy if exists "mistake notes delete" on storage.objects;
create policy "mistake notes delete" on storage.objects for delete to authenticated
  using (bucket_id = 'mistake-notes');
