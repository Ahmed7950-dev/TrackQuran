-- 20260630_bill_fields.sql
-- "Bill" tab fields (platform students only).
--   Per-student (students): payer/guardian name, improvement note, lessons & price overrides.
--   Per-tutor reusable (profiles): receiver name + IBAN (identical on every invoice the tutor issues).

alter table public.students
  add column if not exists bill_payer_name        text,
  add column if not exists bill_improvement_note  text,
  add column if not exists bill_lessons_override   numeric,
  add column if not exists bill_price_override      numeric;

alter table public.profiles
  add column if not exists bill_receiver_name      text,
  add column if not exists bill_iban               text;
