-- ─── Standalone homework: written once, given to any Arabic student ──────────
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- The tutor builds a piece of homework on its own, not hanging off a lesson,
-- and assigns it to whichever student needs it — from any student's page,
-- because the library belongs to the tutor and not to one student.
--
-- A template's items live in homework_items exactly as a lesson's do, keyed by
-- the template's id, so the builder, the student's runner and the marking all
-- work on it unchanged. That is why the two lesson_id foreign keys go: the id
-- in that column is now either a lesson or a template.

create table if not exists public.arabic_homework_templates (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  text        not null,
  title       text        not null,
  topic       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists arabic_hw_templates_teacher_idx
  on public.arabic_homework_templates (teacher_id, updated_at desc);

alter table public.arabic_homework_templates enable row level security;
drop policy if exists arabic_hw_templates_read  on public.arabic_homework_templates;
drop policy if exists arabic_hw_templates_write on public.arabic_homework_templates;
create policy arabic_hw_templates_read  on public.arabic_homework_templates
  for select to anon, authenticated using (true);
create policy arabic_hw_templates_write on public.arabic_homework_templates
  for all    to anon, authenticated using (true) with check (true);

alter table public.homework_items       drop constraint if exists homework_items_lesson_id_fkey;
alter table public.homework_submissions drop constraint if exists homework_submissions_lesson_id_fkey;

-- An assigned standalone homework is a homework row pointing at the template.
alter table public.arabic_vocab_homework drop constraint if exists arabic_vocab_homework_kind_check;
alter table public.arabic_vocab_homework
  add constraint arabic_vocab_homework_kind_check
  check (kind in ('orbit','flashcards','word_cards','lesson','custom'));
