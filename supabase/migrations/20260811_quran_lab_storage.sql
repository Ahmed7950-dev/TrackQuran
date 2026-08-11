-- Quran Lab storage access (vowel adjustments JSON + tutor recitation mp3s).
--
-- The lab writes to two NEW folders in the existing public `tajweed-assets`
-- bucket:
--   quran-overrides/…    vowel-adjustments.json
--   tutor-recitation/…   manifest.json + <surah>/<ayah>.mp3
--
-- ONLY RUN THIS IF SAVING FROM THE ADMIN QURAN LAB FAILS with an RLS error —
-- if your existing storage policy already allows authenticated writes to the
-- whole bucket (it does if the Word Audio / Letter Audio admin tabs can
-- upload), nothing here is needed.

drop policy if exists "quran_lab_writes" on storage.objects;
create policy "quran_lab_writes" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'tajweed-assets'
    and (name like 'quran-overrides/%' or name like 'tutor-recitation/%')
  )
  with check (
    bucket_id = 'tajweed-assets'
    and (name like 'quran-overrides/%' or name like 'tutor-recitation/%')
  );
