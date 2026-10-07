-- Step 1 of closing the shared-report hole: give the portal its own door.
--
-- shared_reports.report_data holds a student's whole record — their name, their
-- mistakes, their homework, their progress — and the table's SELECT policy was
-- `true`. A share link is meant to be "anyone with THIS link sees THIS student",
-- but row-level security cannot express that: it never sees which id the client
-- asked for, so "anyone may read one row" is the same grant as "anyone may read
-- every row". Someone who never had a link could simply select them all.
--
-- A function can express it, because the id is an argument. This returns one
-- row, by id, and nothing else. The lock on the table itself comes next, once
-- the portal is running against this.
create or replace function public.get_shared_report(p_id uuid)
returns table (
  student_name text,
  student_id   text,
  report_data  jsonb,
  teacher_id   uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select r.student_name, r.student_id, r.report_data, r.teacher_id
  from public.shared_reports r
  where r.id = p_id
$$;

revoke all on function public.get_shared_report(uuid) from public;
grant execute on function public.get_shared_report(uuid) to anon, authenticated;
