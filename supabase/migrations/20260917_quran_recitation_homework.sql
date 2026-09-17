-- ─── Quran recitation homework ("prepare reading" with recordings) ───────────
-- The tutor assigns a range; the student records every verse on /recite/<id>
-- (no auth session), submits, and the tutor reviews: mistakes go into the
-- student's normal mistakes map, then Passed / Needs revision.
--
-- Recordings live in the public `quran-recitations` bucket under <id>/…, as
-- small mono Opus/AAC files (~3 KB per second). The tutor app deletes them 30
-- days after the review (60 days for homework never submitted) — see
-- purgeOldRecitations in services/recitationHomeworkService.ts.

create table if not exists public.quran_recitation_homework (
  id            uuid primary key default gen_random_uuid(),
  homework_id   text not null,            -- QuranHomework.id in students.quran_homework
  teacher_id    text not null,
  student_id    text not null,
  student_name  text,
  report_id     text,                     -- the student's /report link, for "see mistakes"
  start_surah   integer not null,
  start_ayah    integer not null,
  end_surah     integer not null,
  end_ayah      integer not null,
  note          text,
  status        text not null default 'assigned'
                check (status in ('assigned', 'submitted', 'passed', 'needs_revision')),
  recordings    jsonb not null default '{}'::jsonb,   -- {"2:5": {path, url, ms, at}}
  created_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  purged_at     timestamptz
);
create index if not exists quran_recitation_homework_student_idx
  on public.quran_recitation_homework (student_id, created_at desc);
create index if not exists quran_recitation_homework_teacher_idx
  on public.quran_recitation_homework (teacher_id, purged_at);

alter table public.quran_recitation_homework enable row level security;
drop policy if exists quran_recitation_homework_all on public.quran_recitation_homework;
create policy quran_recitation_homework_all on public.quran_recitation_homework
  for all using (true) with check (true);

-- Storage bucket for the recordings (public read; anyone may add/replace/delete
-- inside it — paths are unguessable ids, same model as the other practice data).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quran-recitations', 'quran-recitations', true, 10485760,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "quran recitations read" on storage.objects;
create policy "quran recitations read" on storage.objects for select
  using (bucket_id = 'quran-recitations');
drop policy if exists "quran recitations insert" on storage.objects;
create policy "quran recitations insert" on storage.objects for insert
  with check (bucket_id = 'quran-recitations');
drop policy if exists "quran recitations update" on storage.objects;
create policy "quran recitations update" on storage.objects for update
  using (bucket_id = 'quran-recitations') with check (bucket_id = 'quran-recitations');
drop policy if exists "quran recitations delete" on storage.objects;
create policy "quran recitations delete" on storage.objects for delete
  using (bucket_id = 'quran-recitations');
