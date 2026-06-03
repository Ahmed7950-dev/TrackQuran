-- ─── Add level column to qaedah_words ────────────────────────────────────────
-- Run this in the Supabase SQL Editor.
-- Adds a difficulty level (1 = beginner, 2 = intermediate, 3 = advanced)
-- to every word. Existing words default to level 1.

alter table public.qaedah_words
  add column if not exists level smallint not null default 1
  constraint qaedah_words_level_check check (level between 1 and 3);

create index if not exists qaedah_words_level_idx on public.qaedah_words(level);
