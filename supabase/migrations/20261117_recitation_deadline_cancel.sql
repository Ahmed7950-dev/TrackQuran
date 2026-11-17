-- ─── Recitation homework: deadlines that close it, and "cancelled" links ─────
-- 1. due_at: the homework's deadline, copied from QuranHomework.dueAt when it
--    is assigned. Once it has passed, the student can no longer record or
--    submit a homework that is still 'assigned' (/recite locks, and the
--    trigger below refuses a late write from a tab left open).
--    A reassigned follow-up has no deadline, and neither does a homework sent
--    back as 'needs_revision': the tutor asked for that redo.
-- 2. quran_recitation_cancelled: the tutor's Remove still deletes the row and
--    its recordings (storage), but leaves the id here, so a student opening the
--    old notification is told the homework was cancelled, not "not found".

alter table public.quran_recitation_homework
  add column if not exists due_at timestamptz;

-- Homework set before this column existed: take the deadline from the
-- student's homework list.
update public.quran_recitation_homework h
set due_at = (e->>'dueAt')::timestamptz
from public.students s
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(s.quran_homework) = 'array' then s.quran_homework else '[]'::jsonb end
) e
where s.id = h.student_id
  and h.due_at is null
  and h.parent_id is null
  and e->>'recitationId' = h.id::text
  and coalesce(e->>'dueAt', '') <> '';

create or replace function public.recitation_deadline_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'assigned'
     and new.due_at is not null and now() > new.due_at
     and (
       (new.status = 'submitted')
       or (new.status = 'assigned'
           and new.recordings is distinct from old.recordings
           and new.recordings <> '{}'::jsonb)
     )
  then
    raise exception 'recitation_deadline_passed' using errcode = 'P0001';
  end if;
  return new;
end
$$;

drop trigger if exists recitation_deadline_guard on public.quran_recitation_homework;
create trigger recitation_deadline_guard
  before update on public.quran_recitation_homework
  for each row execute function public.recitation_deadline_guard();

create table if not exists public.quran_recitation_cancelled (
  id            uuid primary key,          -- the deleted quran_recitation_homework.id
  teacher_id    text not null,
  cancelled_at  timestamptz not null default now()
);

alter table public.quran_recitation_cancelled enable row level security;

-- The /recite page has no session: anyone holding the id may ask about it.
drop policy if exists quran_recitation_cancelled_read on public.quran_recitation_cancelled;
create policy quran_recitation_cancelled_read on public.quran_recitation_cancelled
  for select using (true);

-- Only the tutor writes, and only for their own homework.
drop policy if exists quran_recitation_cancelled_insert on public.quran_recitation_cancelled;
create policy quran_recitation_cancelled_insert on public.quran_recitation_cancelled
  for insert to authenticated with check (teacher_id = auth.uid()::text);
