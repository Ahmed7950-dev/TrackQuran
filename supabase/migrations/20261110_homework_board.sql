-- ─── The homework board (monthly leaderboard) ────────────────────────────────
-- NOT `homework_submissions`: that name is already the Arabic lesson homework
-- a student hands in (lesson_id, answers, grading). This is the Quran side's
-- tally of hand-ins, and nothing else reads or writes it.
-- One row per piece of homework a student HANDS IN, kept on purpose in a table
-- of its own rather than counted off the homework tables themselves:
--
--   * the homework rows get deleted. "Clear old recordings" removes every
--     reviewed recitation of one student, and withdrawing one deletes its row.
--     Counting those would make a student's place on the board fall because the
--     tutor tidied up, which is the one thing a leaderboard must never do.
--   * a row here is ~100 bytes and nothing is ever deleted from it, so the
--     whole year of a busy tutor is well under a megabyte.
--   * `kind` means any other homework can join the count with one call —
--     recitation and letter hunts to begin with.
--
-- `ref` is the source row's id, and it is UNIQUE per kind: a student who
-- resubmits the same homework after "needs revision" has still only handed in
-- one piece of homework, so the second hand-in moves `sent_at` instead of adding a
-- new one.
--
-- The table is closed (the tutor who owns the rows, and nobody else). The
-- student has no session, so his two ways in are security-definer functions:
-- one to log a hand-in, one that returns the board ALREADY AGGREGATED — a
-- count per student, never anybody else's rows.

create table if not exists public.homework_handins (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   text not null,
  student_id   text not null,
  student_name text,
  kind         text not null default 'recitation',
  ref          text,                       -- the source homework row's id
  items        integer,                    -- verses / letters in it, for the detail line
  sent_at      timestamptz not null default now()
);

create index if not exists homework_handins_board_idx
  on public.homework_handins (teacher_id, sent_at desc);
create unique index if not exists homework_handins_one_per_ref
  on public.homework_handins (kind, ref) where ref is not null;

alter table public.homework_handins enable row level security;

-- The tutor whose students these are, and nobody else.
drop policy if exists homework_handins_owner on public.homework_handins;
create policy homework_handins_owner on public.homework_handins
  for all using (teacher_id = auth.uid()::text) with check (teacher_id = auth.uid()::text);

-- ── The student's two ways in ───────────────────────────────────────────────

-- Handing one in. Idempotent per (kind, ref): a resubmission is the same piece
-- of homework, handed in again.
create or replace function public.log_homework_submission(
  p_teacher text, p_student text, p_name text, p_kind text, p_ref text, p_items integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_teacher, '') = '' or coalesce(p_student, '') = '' then return; end if;
  insert into public.homework_handins (teacher_id, student_id, student_name, kind, ref, items)
  values (p_teacher, p_student, nullif(p_name, ''),
          coalesce(nullif(p_kind, ''), 'recitation'), nullif(p_ref, ''), p_items)
  on conflict (kind, ref) where ref is not null do update
    set sent_at = now(),
        items = coalesce(excluded.items, homework_handins.items),
        student_name = coalesce(excluded.student_name, homework_handins.student_name);
end;
$$;

-- The board for a month, already counted: one row per student who handed
-- something in between p_from (inclusive) and p_to (exclusive).
create or replace function public.homework_board(
  p_teacher text, p_from timestamptz, p_to timestamptz
) returns table (student_id text, student_name text, sent bigint, items bigint, last_at timestamptz)
language sql security definer set search_path = public as $$
  select s.student_id,
         (array_agg(s.student_name order by s.sent_at desc))[1] as student_name,
         count(*)                                         as sent,
         coalesce(sum(s.items), 0)                        as items,
         max(s.sent_at)                                    as last_at
    from public.homework_handins s
   where s.teacher_id = p_teacher
     and s.sent_at >= p_from
     and s.sent_at <  p_to
   group by s.student_id
   order by count(*) desc, coalesce(sum(s.items), 0) desc, max(s.sent_at) asc;
$$;

grant execute on function public.log_homework_submission(text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.homework_board(text, timestamptz, timestamptz) to anon, authenticated;

-- ── Everything already handed in ────────────────────────────────────────────
-- So the board reads true from the day it opens instead of starting empty.
-- `items` is the number of takes sent in, which for a finished homework is its
-- verse count (one take per verse; a hifz homework is one take for the range).
insert into public.homework_handins (teacher_id, student_id, student_name, kind, ref, items, sent_at)
select r.teacher_id, r.student_id, r.student_name, 'recitation', r.id::text,
       (select count(*) from jsonb_object_keys(coalesce(r.recordings, '{}'::jsonb))),
       r.submitted_at
  from public.quran_recitation_homework r
 where r.submitted_at is not null
on conflict do nothing;

insert into public.homework_handins (teacher_id, student_id, student_name, kind, ref, items, sent_at)
select h.teacher_id, h.student_id, h.student_name, 'hunt', h.id::text,
       coalesce(array_length(h.letters, 1), 0),
       h.submitted_at
  from public.letters_hunter_homework h
 where h.submitted_at is not null
on conflict do nothing;
