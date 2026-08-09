-- ─── Fluency test results ────────────────────────────────────────────────────
-- One row per finished attempt at a fluency level. The tutor-side Fluency Test
-- tab reads a student's best time per level (fastest row) and whether the level
-- was ever passed. Anon-writable, matching the other practice tables in this
-- project (qaedah_attempts, odd_letter_scores).

create table if not exists public.fluency_results (
  id         uuid primary key default gen_random_uuid(),
  student_id text not null,
  level      integer not null check (level between 1 and 10),
  time_ms    integer not null,
  buzzes     integer not null default 0,
  passed     boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists fluency_results_student_level_idx
  on public.fluency_results (student_id, level, time_ms);

alter table public.fluency_results enable row level security;

drop policy if exists fluency_results_all on public.fluency_results;
create policy fluency_results_all on public.fluency_results
  for all using (true) with check (true);
