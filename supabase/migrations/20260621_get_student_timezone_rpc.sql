-- ============================================================
-- Public read of just a student's timezone, for the shared (unauthenticated)
-- student portal calendar. The `students` table is tutor-only under RLS, so a
-- SECURITY DEFINER function exposes ONLY the timezone (no other columns) by id.
--
-- Requires the `timezone` column from 20260621_quran_student_billing.sql.
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

create or replace function public.get_student_timezone(p_student_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select timezone from public.students where id = p_student_id limit 1;
$$;

grant execute on function public.get_student_timezone(text) to anon, authenticated;
