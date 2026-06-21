-- ============================================================
-- Pairs a student's Quran profile and Arabic profile under ONE permanent,
-- shareable portal link. Created automatically when a tutor links both
-- profiles (same name) to the same Google Calendar event.
--
-- The `token` is generated once and never changes, so the link can be shared
-- with the student permanently. Opening /portal/<token> lets the student pick
-- (and switch between) their Arabic and Quran portals.
--
-- Apply to the Supabase DB (SQL editor or `supabase db push`) to take effect.
-- ============================================================

create table if not exists public.student_portal_pairs (
  id                 uuid primary key default gen_random_uuid(),
  teacher_id         text not null,
  token              text not null unique default gen_random_uuid()::text,
  quran_student_id   text not null,
  arabic_student_id  text not null,
  quran_report_id    text,
  arabic_share_token text,
  student_name       text,
  created_at         timestamptz not null default now(),
  unique (teacher_id, quran_student_id, arabic_student_id)
);

alter table public.student_portal_pairs enable row level security;

-- Anyone with the token can open the unified portal.
drop policy if exists "public read portal pairs" on public.student_portal_pairs;
create policy "public read portal pairs"
  on public.student_portal_pairs for select using (true);

-- Only the owning teacher can create / update a pair.
drop policy if exists "teacher insert portal pairs" on public.student_portal_pairs;
create policy "teacher insert portal pairs"
  on public.student_portal_pairs for insert
  with check (auth.uid()::text = teacher_id);

drop policy if exists "teacher update portal pairs" on public.student_portal_pairs;
create policy "teacher update portal pairs"
  on public.student_portal_pairs for update
  using (auth.uid()::text = teacher_id)
  with check (auth.uid()::text = teacher_id);
