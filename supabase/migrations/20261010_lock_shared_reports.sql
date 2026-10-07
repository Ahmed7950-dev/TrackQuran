-- Step 2: close the door the portal no longer uses.
--
-- "Public read shared reports" was `using (true)` — every student's whole
-- record, readable by anyone, no link and no account needed. The portal now
-- goes through get_shared_report(id), so the table itself can be owner-only.
--
-- Three ways in remain, all of them named:
--   the teacher who owns the report, a self-registered student reading their
--   own, and an admin.
drop policy if exists "Public read shared reports" on public.shared_reports;

create policy shared_reports_select on public.shared_reports
for select using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.students st
    where st.id = shared_reports.student_id
      and st.auth_user_id = auth.uid()
  )
  or get_my_role() = 'admin'
);
