-- ============================================================
-- Billing fields for Arabic students (same as Quran students):
--   hourly_rate, student_type ('preply'|'platform'), preply_percentage.
-- (timezone already exists on arabic_students.)
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

alter table public.arabic_students
  add column if not exists hourly_rate        numeric,
  add column if not exists student_type       text,
  add column if not exists preply_percentage  numeric;
