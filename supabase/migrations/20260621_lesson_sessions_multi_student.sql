-- ============================================================
-- Allow ONE Google Calendar event to be linked to MORE THAN ONE student.
--
-- Use case: a student who takes both Quran AND Arabic lessons has two
-- profiles (one in `students`, one in `arabic_students`). Linking both
-- profiles to the same calendar event pairs them so a single unified portal
-- link can be generated.
--
-- Previously arabic_lesson_sessions had UNIQUE(teacher_id, gcal_event_id),
-- which forced one student per event (a 2nd link replaced the 1st). We widen
-- the uniqueness to include student_id so each (event, student) is its own row
-- but re-linking the same pair stays idempotent (matches the upsert onConflict
-- 'teacher_id,gcal_event_id,student_id').
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

alter table public.arabic_lesson_sessions
  drop constraint if exists arabic_lesson_sessions_teacher_id_gcal_event_id_key;

-- Some environments named the constraint differently; drop that too if present.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'arabic_lesson_sessions_teacher_gcal_unique'
  ) then
    alter table public.arabic_lesson_sessions
      drop constraint arabic_lesson_sessions_teacher_gcal_unique;
  end if;
end $$;

alter table public.arabic_lesson_sessions
  add constraint arabic_lesson_sessions_teacher_gcal_student_key
  unique (teacher_id, gcal_event_id, student_id);
