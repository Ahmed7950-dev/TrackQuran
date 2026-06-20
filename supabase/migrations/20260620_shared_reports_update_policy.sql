-- ============================================================
-- Fix: assigned homework (and any later edit) never reached the student's
-- shared report.
--
-- shared_reports has RLS enabled with SELECT / INSERT / DELETE policies but NO
-- UPDATE policy. With RLS on, a missing UPDATE policy denies every update, so:
--   • createOrUpdateSharedReport()'s upsert succeeds the first time (INSERT) but
--     its conflict path (UPDATE) is blocked on every subsequent save;
--   • updateHomeworkVerses(), updateQuranHomeworkInReport() and
--     syncStudentDataInReport() — all UPDATEs — fail silently.
-- The report is therefore frozen at creation, and homework assigned afterwards
-- never appears when the student opens their shared link.
--
-- Allow the owning teacher to update their own reports.
-- ============================================================

DROP POLICY IF EXISTS "Teachers update own reports" ON shared_reports;
CREATE POLICY "Teachers update own reports"
  ON shared_reports FOR UPDATE
  USING (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);
