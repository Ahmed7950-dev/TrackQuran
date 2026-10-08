-- The listening challenge: a Qaedah lesson's vowel, every letter of the
-- alphabet, one sound at a time.
--
-- A row exists only for a challenge SENT AS A LINK. Running it with the
-- student in the lesson needs no row — it opens on the tutor's screen and is
-- written to the student's logbook like any other lesson activity.
--
-- Anon-readable and anon-updatable, like the other share-link tables: the
-- student opening the link has no session. Creating one is the tutor's, so it
-- is written only by an authenticated owner.
create table if not exists public.letter_sound_challenges (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references auth.users(id) on delete cascade,
  -- students.id is TEXT. No foreign key: a challenge may be sent to a student
  -- whose row is later removed, and the link should die quietly, not 500.
  student_id  text not null,
  student_name text,
  topic_id    uuid not null,
  topic_title text not null,
  -- which recording set to play: 'fatha' | 'kasra' | 'damma'
  vowel       text not null check (vowel in ('fatha', 'kasra', 'damma')),
  -- which shape to draw: 'isolated' | 'initial' | 'medial' | 'final'
  form        text not null check (form in ('isolated', 'initial', 'medial', 'final')),
  created_at  timestamptz not null default now(),
  -- set the first time the student opens it, and when they reach the last letter
  opened_at   timestamptz,
  finished_at timestamptz
);

create index if not exists letter_sound_challenges_student
  on public.letter_sound_challenges (student_id, created_at desc);

alter table public.letter_sound_challenges enable row level security;

drop policy if exists letter_sound_read   on public.letter_sound_challenges;
drop policy if exists letter_sound_insert on public.letter_sound_challenges;
drop policy if exists letter_sound_update on public.letter_sound_challenges;

-- Anyone holding the link may read it and mark it opened/finished…
create policy letter_sound_read on public.letter_sound_challenges
  for select to anon, authenticated using (true);
create policy letter_sound_update on public.letter_sound_challenges
  for update to anon, authenticated using (true) with check (true);
-- …but only the tutor who owns it may create one.
create policy letter_sound_insert on public.letter_sound_challenges
  for insert to authenticated with check (teacher_id = auth.uid());
