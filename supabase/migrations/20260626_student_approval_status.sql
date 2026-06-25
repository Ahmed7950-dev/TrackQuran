-- ============================================================
-- Approval status for self-registered students.
--
-- A self-registered student picks a tutor, then waits: the student stays
-- 'pending' until that tutor confirms them (then 'active'), or 'rejected'.
-- Tutor-created students default to 'active' so existing rows are unaffected.
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

alter table public.students
  add column if not exists approval_status text not null default 'active';

alter table public.arabic_students
  add column if not exists approval_status text not null default 'active';
