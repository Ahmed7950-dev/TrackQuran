-- Tadabbur Lab: flashcard answers per word, and a deck the tutor sends as homework.
-- Both are anon-writable: the student portal has no auth session.

create table if not exists public.quran_word_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  surah int not null,
  ayah int not null,
  word_index int not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists quran_word_reviews_student_idx
  on public.quran_word_reviews (student_id, created_at desc);

create table if not exists public.quran_word_homework (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  teacher_id uuid not null default auth.uid(),
  -- [{surah, ayah, word_index, word_text}] — the meaning is read live from
  -- quran_word_meanings, so tidying a meaning updates the deck too.
  words jsonb not null,
  note text,
  status text not null default 'assigned',
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  score_correct int,
  score_total int
);
create index if not exists quran_word_homework_student_idx
  on public.quran_word_homework (student_id, assigned_at desc);

alter table public.quran_word_reviews  enable row level security;
alter table public.quran_word_homework enable row level security;

create policy "read word reviews"  on public.quran_word_reviews for select to anon, authenticated using (true);
create policy "write word reviews" on public.quran_word_reviews for insert to anon, authenticated with check (true);

create policy "read word homework"   on public.quran_word_homework for select to anon, authenticated using (true);
create policy "tutor writes homework" on public.quran_word_homework for all to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
-- The student finishes a deck: an assigned one may only be marked completed.
create policy "student completes homework" on public.quran_word_homework for update to anon
  using (status = 'assigned') with check (status = 'completed');
