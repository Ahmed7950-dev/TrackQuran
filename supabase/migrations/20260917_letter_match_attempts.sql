-- ─── Letter shapes match: repeat attempts ─────────────────────────────────────
-- A challenge link can now be played again ("Try again"). Every finished run is
-- one row here; letter_match_challenges keeps the LATEST result for quick
-- display. Anon-writable like the challenge table (the student's link has no
-- auth session).

create table if not exists public.letter_match_attempts (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references public.letter_match_challenges(id) on delete cascade,
  attempt_no    integer not null,
  correct       integer not null,
  total         integer not null,
  mistakes      integer not null,
  wrong_letters jsonb not null default '{}'::jsonb,
  unmatched     text[] not null default '{}',
  ended_reason  text not null,
  duration_ms   integer not null,
  completed_at  timestamptz not null default now()
);
create index if not exists letter_match_attempts_challenge_idx
  on public.letter_match_attempts (challenge_id, attempt_no);

alter table public.letter_match_attempts enable row level security;
drop policy if exists letter_match_attempts_all on public.letter_match_attempts;
create policy letter_match_attempts_all on public.letter_match_attempts for all using (true) with check (true);

-- Challenges finished before attempts existed become attempt #1.
insert into public.letter_match_attempts
  (challenge_id, attempt_no, correct, total, mistakes, wrong_letters, unmatched, ended_reason, duration_ms, completed_at)
select c.id, 1, coalesce(c.correct, 0), coalesce(array_length(c.letters, 1), 0), coalesce(c.mistakes, 0),
       coalesce(c.wrong_letters, '{}'::jsonb), coalesce(c.unmatched, '{}'), coalesce(c.ended_reason, 'done'),
       coalesce(c.duration_ms, 0), coalesce(c.completed_at, now())
from public.letter_match_challenges c
where c.status = 'completed'
  and not exists (select 1 from public.letter_match_attempts a where a.challenge_id = c.id);
