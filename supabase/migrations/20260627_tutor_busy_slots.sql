-- 20260627_tutor_busy_slots.sql
-- Lets students see the tutor's Google Calendar busy times as "Booked" without
-- needing the tutor's Google token (which only lives in the tutor's browser).
-- The tutor's browser (which has the token) writes the busy time ranges here when
-- it loads its calendar; the student portal reads them on any device.
-- Only start/end times are stored — never event titles/details (privacy).

create table if not exists public.tutor_busy_slots (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  created_at timestamptz default now()
);

create index if not exists tutor_busy_slots_tid_start on public.tutor_busy_slots (teacher_id, start_at);

alter table public.tutor_busy_slots enable row level security;

-- The tutor manages only their own busy rows.
drop policy if exists tutor_busy_owner on public.tutor_busy_slots;
create policy tutor_busy_owner on public.tutor_busy_slots
  for all to authenticated
  using (auth.uid() = teacher_id)
  with check (auth.uid() = teacher_id);

-- Anyone (incl. anonymous students opening a shared link) may read busy times.
drop policy if exists tutor_busy_public_read on public.tutor_busy_slots;
create policy tutor_busy_public_read on public.tutor_busy_slots
  for select to anon, authenticated
  using (true);
