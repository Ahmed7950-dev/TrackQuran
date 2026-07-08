-- Leaderboard for the "Find the Odd Letter" alphabet game (1-player time trial).
-- Anon-writable, matching the other game/content tables in this project.
create table if not exists public.odd_letter_scores (
  id          text primary key,
  player_name text not null,
  total_ms    integer not null,
  rounds      integer not null default 5,
  created_at  timestamptz not null default now()
);

-- fast leaderboard ordering (fastest first)
create index if not exists odd_letter_scores_total_ms_idx on public.odd_letter_scores (total_ms asc);

alter table public.odd_letter_scores enable row level security;

drop policy if exists odd_letter_scores_all on public.odd_letter_scores;
create policy odd_letter_scores_all on public.odd_letter_scores
  for all using (true) with check (true);
