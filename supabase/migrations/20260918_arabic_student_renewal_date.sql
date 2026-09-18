-- ─── Arabic students: subscription renewal date ──────────────────────────────
-- studentToRow has been sending `subscription_renewal_date` since renewal
-- reminders were added, but the column only ever existed on `students`
-- (Quran). PostgREST rejects the whole row for an unknown column, so EVERY
-- Arabic student save — adding a student, editing one — failed silently:
-- the student lived in the browser's memory until the next reload, and their
-- share link never existed. Adding the column makes those saves work and lets
-- Arabic students carry a renewal date like Quran ones.

alter table public.arabic_students
  add column if not exists subscription_renewal_date date;
