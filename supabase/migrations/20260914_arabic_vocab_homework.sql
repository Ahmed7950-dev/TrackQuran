-- ─── Arabic vocabulary: word strength + homework basket ─────────────────────
-- Both tables are written from the tutor side AND from the student portal
-- (which is unauthenticated), so both are anon-writable like the other
-- practice tables in this project (qaedah_attempts, …).
--
--   arabic_vocab_reviews   one row per flashcard answer ("I know" = correct,
--                          "Review later" = wrong). The last ten per word are
--                          the red/green strength bar in Lessons Vocabulary.
--                          Games never write here.
--   arabic_vocab_homework  the homework basket. One 'draft' row per student is
--                          the basket being filled; generating a link turns it
--                          'assigned'; the student finishing it makes it
--                          'completed' with the score. Words are snapshotted so
--                          the homework still plays if the lesson list changes.

create table if not exists public.arabic_vocab_reviews (
  id         uuid primary key default gen_random_uuid(),
  student_id text not null,
  word_id    text not null,
  lesson_id  text,
  correct    boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists arabic_vocab_reviews_student_idx
  on public.arabic_vocab_reviews (student_id, created_at desc);

create table if not exists public.arabic_vocab_homework (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    text not null,
  student_id    text not null,
  student_name  text,
  status        text not null default 'draft'
                check (status in ('draft', 'assigned', 'completed')),
  words         jsonb not null default '[]'::jsonb,   -- [{id, arabic, english, transliteration}]
  distractors   jsonb not null default '[]'::jsonb,   -- Arabic words from the course, for the wrong options
  deadline      timestamptz,                          -- null = open, no deadline
  results       jsonb,                                -- [{wordId, correct}]
  correct_count integer,
  total_count   integer,
  created_at    timestamptz not null default now(),
  assigned_at   timestamptz,
  completed_at  timestamptz
);

create index if not exists arabic_vocab_homework_student_idx
  on public.arabic_vocab_homework (student_id, created_at desc);

alter table public.arabic_vocab_reviews  enable row level security;
alter table public.arabic_vocab_homework enable row level security;

drop policy if exists arabic_vocab_reviews_all on public.arabic_vocab_reviews;
create policy arabic_vocab_reviews_all on public.arabic_vocab_reviews
  for all using (true) with check (true);

drop policy if exists arabic_vocab_homework_all on public.arabic_vocab_homework;
create policy arabic_vocab_homework_all on public.arabic_vocab_homework
  for all using (true) with check (true);
