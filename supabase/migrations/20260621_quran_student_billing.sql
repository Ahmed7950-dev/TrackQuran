-- ============================================================
-- Per-student billing / scheduling fields for Quran students (tutor-only).
--   timezone           — IANA tz id for the student's city
--   hourly_rate        — tutor's hourly rate for this student
--   student_type       — 'preply' | 'platform'
--   preply_percentage  — Preply commission % (preply students only; default 18)
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

alter table public.students
  add column if not exists timezone          text,
  add column if not exists hourly_rate        numeric,
  add column if not exists student_type       text,
  add column if not exists preply_percentage  numeric;
