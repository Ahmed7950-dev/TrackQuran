-- ============================================================
-- Per-student teacher note for Arabic students.
--
-- The teacher's note used to live on each arabic_lessons row (one note per
-- lesson, shared across all students). The tutor wants ONE note per student,
-- editable/previewable from any of that student's lessons. Add a teacher_note
-- column on arabic_students to hold it.
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) for the feature
-- to take effect — it's a schema change, not app code.
-- ============================================================

alter table public.arabic_students
  add column if not exists teacher_note text;
