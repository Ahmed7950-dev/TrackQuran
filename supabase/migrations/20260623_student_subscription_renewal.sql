-- ============================================================
-- Preply monthly subscription renewal date for Quran students.
-- The tutor gets a reminder notification one day before each monthly renewal.
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

alter table public.students
  add column if not exists subscription_renewal_date date;
