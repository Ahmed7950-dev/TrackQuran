-- Tadabbur mode: the tutor's word meanings and per-verse notes for a student.
-- Read by the student's portal (anon), written only by the signed-in tutor.

create table if not exists public.quran_word_meanings (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  surah int not null,
  ayah int not null,
  word_index int not null,          -- splitVerseWords index, same as mistake keys
  word_text text not null default '',
  meaning text not null,
  teacher_id uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (student_id, surah, ayah, word_index)
);
create index if not exists quran_word_meanings_teacher_idx on public.quran_word_meanings (teacher_id);

create table if not exists public.quran_verse_tutor_notes (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  surah int not null,
  ayah int not null,
  note_text text not null,
  teacher_id uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (student_id, surah, ayah)
);

alter table public.quran_word_meanings enable row level security;
alter table public.quran_verse_tutor_notes enable row level security;

create policy "read word meanings" on public.quran_word_meanings for select to anon, authenticated using (true);
create policy "tutor writes word meanings" on public.quran_word_meanings for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy "read tutor verse notes" on public.quran_verse_tutor_notes for select to anon, authenticated using (true);
create policy "tutor writes verse notes" on public.quran_verse_tutor_notes for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
