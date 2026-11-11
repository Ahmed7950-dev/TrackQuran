-- ─── The homework library grows two kinds, and a homework can live in a lesson ─
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- Until now a library entry (arabic_homework_templates) was always written
-- questions. It can now be one of three things:
--
--   written           the questions in homework_items, keyed by the template id
--   pronoun_pictures  one lesson_exercises row, keyed by the template id the
--                     same way — so the editor, the runner and the marking the
--                     Lesson 3 exercise already has work on it unchanged
--   speaking          a dialogue: one speaker's photo and a list of lines, each
--                     a recording, its English meaning and a hint. Small and
--                     always loaded whole, so it lives in `content` on the row.
--
-- And any entry can be given out two ways: assigned to one student once (as
-- before — a row in arabic_vocab_homework), or ADDED TO A LESSON, where it is
-- a card in that lesson's Homework tab for every student who reaches it.

alter table public.arabic_homework_templates
  add column if not exists kind text not null default 'written';
alter table public.arabic_homework_templates
  drop constraint if exists arabic_homework_templates_kind_check;
alter table public.arabic_homework_templates
  add constraint arabic_homework_templates_kind_check
  check (kind in ('written', 'pronoun_pictures', 'speaking'));
-- speaking: {"avatarUrl": "...", "lines": [{"id","text","hint","audioUrl","audioMs"}]}
alter table public.arabic_homework_templates
  add column if not exists content jsonb not null default '{}'::jsonb;

-- ── A homework added to a lesson ────────────────────────────────────────────
-- A link, not a copy: change the homework in the library and the lesson shows
-- the change. The lessons are shared by every tutor, and so is this — whoever
-- reaches the lesson sees the card, and hands the work in to their OWN tutor.
create table if not exists public.lesson_homework_links (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   text not null,
  template_id uuid not null references public.arabic_homework_templates(id) on delete cascade,
  added_by    text,
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (lesson_id, template_id)
);
create index if not exists lesson_homework_links_lesson
  on public.lesson_homework_links (lesson_id, order_index);

alter table public.lesson_homework_links enable row level security;
drop policy if exists lesson_homework_links_all on public.lesson_homework_links;
create policy lesson_homework_links_all on public.lesson_homework_links
  for all using (true) with check (true);

-- ── One try at a speaking homework ──────────────────────────────────────────
-- The student answers every line out loud; the tutor marks each answer right
-- or wrong; the wrong ones go back as a NEW try holding only those lines. All
-- the tries over one homework share `root_id`, which is the first try's id.
--
-- `lines` is a snapshot taken when the try is made, not a pointer into the
-- library: a tutor who rewrites the dialogue next week must not change what a
-- student was asked last week, or what the marks beside his answers refer to.
-- On a second try each line also carries the tutor's note and the answer it
-- replaces.
create table if not exists public.speaking_attempts (
  id            uuid primary key default gen_random_uuid(),
  root_id       uuid not null,
  parent_id     uuid,
  template_id   uuid not null,          -- no FK: the try outlives a deleted homework
  teacher_id    text not null,          -- the STUDENT's tutor — who marks it
  student_id    text not null,          -- arabic_students.id
  student_name  text,
  homework_id   uuid,                   -- arabic_vocab_homework.id when it was assigned
  lesson_id     text,                   -- the lesson it was done from, when it was
  title         text not null,
  avatar_url    text,
  lines         jsonb not null default '[]'::jsonb,  -- [{id,text,hint,audioUrl,note?,prev?}]
  answers       jsonb not null default '{}'::jsonb,  -- {lineId: {path,url,ms,at}}
  aids          jsonb not null default '{}'::jsonb,  -- {lineId: {hint,text,listens}}
  marks         jsonb not null default '{}'::jsonb,  -- {lineId: {ok,note}}
  status        text not null default 'open'
                check (status in ('open', 'submitted', 'needs_revision', 'passed')),
  created_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  purged_at     timestamptz
);
create index if not exists speaking_attempts_student
  on public.speaking_attempts (student_id, created_at desc);
create index if not exists speaking_attempts_teacher
  on public.speaking_attempts (teacher_id, purged_at);
create index if not exists speaking_attempts_root
  on public.speaking_attempts (root_id, created_at);

-- Open, like the rest of the Arabic homework: the student has no session.
alter table public.speaking_attempts enable row level security;
drop policy if exists speaking_attempts_all on public.speaking_attempts;
create policy speaking_attempts_all on public.speaking_attempts
  for all using (true) with check (true);

-- ── Where the answers are kept ──────────────────────────────────────────────
-- Small mono recordings (~3 KB a second), under <attempt id>/…, cleared by the
-- tutor's app a week after the whole homework is right — purgeOldSpeaking in
-- services/speakingHomeworkService.ts. Same model as `quran-recitations`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('speaking-homework', 'speaking-homework', true, 5242880,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "speaking homework read" on storage.objects;
create policy "speaking homework read" on storage.objects for select
  using (bucket_id = 'speaking-homework');
drop policy if exists "speaking homework insert" on storage.objects;
create policy "speaking homework insert" on storage.objects for insert
  with check (bucket_id = 'speaking-homework');
drop policy if exists "speaking homework update" on storage.objects;
create policy "speaking homework update" on storage.objects for update
  using (bucket_id = 'speaking-homework') with check (bucket_id = 'speaking-homework');
drop policy if exists "speaking homework delete" on storage.objects;
create policy "speaking homework delete" on storage.objects for delete
  using (bucket_id = 'speaking-homework');
