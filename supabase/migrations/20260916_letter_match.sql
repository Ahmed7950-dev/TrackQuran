-- ─── Letter-shape matching challenge ─────────────────────────────────────────
-- The tutor picks letters and a shape (beginning / middle / end), sets a timer
-- and lives, and sends a link. The student matches each ISOLATED letter to that
-- shape. Written by the tutor AND by the student's link (no auth session), so
-- both tables are anon-writable like the other practice tables.
--
--   letter_match_challenges  one row per challenge: settings, status, result.
--   letter_form_misses       running tally of wrong matches per student, shape
--                            and letter — the red numbers on the alphabet table
--                            when that shape is selected.

create table if not exists public.letter_match_challenges (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    text not null,
  student_id    text not null,
  student_name  text,
  letters       text[] not null,
  form          text not null check (form in ('initial', 'medial', 'final')),
  timer_seconds integer,                 -- null = no timer
  lives         integer,                 -- null = unlimited
  status        text not null default 'created' check (status in ('created', 'playing', 'completed')),
  correct       integer,
  mistakes      integer,
  wrong_letters jsonb,                   -- {"ب": 2, ...}
  unmatched     text[],                  -- letters never matched (time / lives ran out)
  ended_reason  text,                    -- 'done' | 'time' | 'lives'
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  completed_at  timestamptz
);
create index if not exists letter_match_challenges_student_idx
  on public.letter_match_challenges (student_id, created_at desc);

create table if not exists public.letter_form_misses (
  student_id text not null,
  form       text not null check (form in ('initial', 'medial', 'final')),
  letter     text not null,
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (student_id, form, letter)
);

alter table public.letter_match_challenges enable row level security;
alter table public.letter_form_misses      enable row level security;
drop policy if exists letter_match_challenges_all on public.letter_match_challenges;
create policy letter_match_challenges_all on public.letter_match_challenges for all using (true) with check (true);
drop policy if exists letter_form_misses_all on public.letter_form_misses;
create policy letter_form_misses_all on public.letter_form_misses for all using (true) with check (true);

-- Add a finished challenge's wrong matches to the tally in one atomic step.
create or replace function public.bump_letter_form_misses(p_student text, p_form text, p_counts jsonb)
returns void language sql as $$
  insert into public.letter_form_misses (student_id, form, letter, count, updated_at)
  select p_student, p_form, key, value::int, now() from jsonb_each_text(p_counts) where value::int > 0
  on conflict (student_id, form, letter)
  do update set count = public.letter_form_misses.count + excluded.count, updated_at = now();
$$;
grant execute on function public.bump_letter_form_misses(text, text, jsonb) to anon, authenticated;
