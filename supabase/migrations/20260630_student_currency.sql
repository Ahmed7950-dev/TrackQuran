-- 20260630_student_currency.sql
-- Per-student billing currency for the hourly rate ('USD' or 'TRY'). Defaults to
-- USD for existing rows (NULL is treated as USD in the app).

alter table public.students        add column if not exists currency text;
alter table public.arabic_students add column if not exists currency text;
