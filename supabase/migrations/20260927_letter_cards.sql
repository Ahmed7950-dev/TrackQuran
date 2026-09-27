-- ─── Letter-shape card game ──────────────────────────────────────────────────
-- The tutor holds the isolated letters, the student the same letters in the
-- chosen shape. The tutor throws a card, the student answers with the same
-- letter. Played together over a link, or by the tutor alone with both hands
-- face up. The student's link has no auth session, so the row is anon-writable
-- like the other practice tables; the board itself never touches the database —
-- it lives on the realtime channel `letter-cards:<id>`.
create table if not exists public.letter_cards_games (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    text not null,
  student_id    text not null,
  student_name  text,
  letters       text[] not null,
  form          text not null check (form in ('initial', 'medial', 'final')),
  lives         integer,                 -- null = unlimited
  mode          text not null default 'multiplayer' check (mode in ('multiplayer', 'tutor')),
  status        text not null default 'created' check (status in ('created', 'playing', 'completed')),
  score         integer,                 -- letters the student answered correctly
  mistakes      integer,
  wrong_letters jsonb,                   -- {"ب": 2, ...}
  ended_reason  text,                    -- 'done' | 'lives'
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);
create index if not exists letter_cards_games_student_idx
  on public.letter_cards_games (student_id, created_at desc);

alter table public.letter_cards_games enable row level security;
drop policy if exists letter_cards_games_all on public.letter_cards_games;
create policy letter_cards_games_all on public.letter_cards_games for all using (true) with check (true);
