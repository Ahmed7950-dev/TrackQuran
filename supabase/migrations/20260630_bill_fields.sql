-- 20260630_bill_fields.sql
-- "Bill" tab fields (platform students only).
--   Per-student (students): editable invoice name, payer/guardian name, improvement note,
--     per-60-min-lesson price override, and per-lesson durations (minutes, keyed by date).
--   Per-tutor reusable (profiles): receiver name + IBAN (identical on every invoice).

alter table public.students
  add column if not exists bill_student_name      text,
  add column if not exists bill_payer_name        text,
  add column if not exists bill_improvement_note  text,
  add column if not exists bill_price_override     numeric,
  add column if not exists bill_durations          jsonb;

alter table public.profiles
  add column if not exists bill_receiver_name      text,
  add column if not exists bill_iban               text;
