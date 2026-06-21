-- ============================================================
-- Family grouping for linked calendar events.
--
-- When a tutor links two or more DIFFERENT students (siblings, etc.) to the
-- same event, they can be grouped as a "family": the event box shows the
-- family name instead of each student's name, and a unified family_links row
-- is created so any member's shared link resolves to the same /family/<id>.
--
--   family_name     — display name shown on the event box for the group.
--   family_link_id  — id of the family_links row joining these students.
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

alter table public.arabic_lesson_sessions
  add column if not exists family_name    text,
  add column if not exists family_link_id text;
