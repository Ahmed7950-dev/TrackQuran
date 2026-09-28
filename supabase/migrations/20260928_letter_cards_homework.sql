-- ─── Letter cards as homework ────────────────────────────────────────────────
-- A third way to play: the student alone, against the computer, from a link or
-- from the homework tab, as many times as they like. The assignment is one row
-- in letter_cards_games with mode 'solo'; every run the student finishes is a
-- row in letter_cards_attempts, so the tutor sees the whole history and not
-- just the last try.
alter table public.letter_cards_games drop constraint if exists letter_cards_games_mode_check;
alter table public.letter_cards_games
  add constraint letter_cards_games_mode_check check (mode in ('multiplayer', 'tutor', 'solo'));

create table if not exists public.letter_cards_attempts (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.letter_cards_games(id) on delete cascade,
  student_id    text not null,
  score         integer not null,
  total         integer not null,
  mistakes      integer not null,
  wrong_letters jsonb,
  ended_reason  text,                    -- 'done' | 'lives'
  duration_ms   integer,
  created_at    timestamptz not null default now()
);
create index if not exists letter_cards_attempts_game_idx
  on public.letter_cards_attempts (game_id, created_at desc);

-- The student's link carries no auth session, like the other practice tables.
alter table public.letter_cards_attempts enable row level security;
drop policy if exists letter_cards_attempts_all on public.letter_cards_attempts;
create policy letter_cards_attempts_all on public.letter_cards_attempts for all using (true) with check (true);
