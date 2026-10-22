-- ─── "Nothing logged for …" — answered once, on every device ────────────────
-- The card that asks what happened to an unlogged lesson kept its answer in
-- localStorage, which is one browser on one device. A tutor who marked the
-- lesson absent on the laptop was asked about it again on the phone, and again
-- on the tablet — the same lesson, as many times as they had devices.
--
-- The occurrence key is already stable everywhere ("<session id>:<ISO start>"),
-- so it only ever needed somewhere shared to live. One row per lesson the tutor
-- has settled, whichever way they settled it.
--
-- localStorage is still written as well: it answers instantly and offline, and
-- it keeps every card already dismissed on this device dismissed.

create table if not exists public.missed_lesson_dismissals (
  teacher_id     text        not null,
  occurrence_key text        not null,
  -- 'absent' | 'rescheduled' | 'ignored' — what the tutor chose, kept because
  -- it costs nothing and answers "did I ever say what happened to that one?"
  outcome        text,
  dismissed_at   timestamptz not null default now(),
  primary key (teacher_id, occurrence_key)
);

create index if not exists missed_lesson_dismissals_teacher_idx
  on public.missed_lesson_dismissals (teacher_id, dismissed_at desc);

alter table public.missed_lesson_dismissals enable row level security;

-- The tutor's own, and nobody else's.
drop policy if exists missed_lesson_dismissals_owner on public.missed_lesson_dismissals;
create policy missed_lesson_dismissals_owner on public.missed_lesson_dismissals
  for all using (teacher_id = auth.uid()::text) with check (teacher_id = auth.uid()::text);
