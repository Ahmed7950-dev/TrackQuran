-- ─── Verbs: a tutor's conjugation tables, shared by every student of a variety ─
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- arabic_verbs   one row per verb. It belongs to the tutor who wrote it and to
--                ONE variety ('levantine' or 'msa'): every student of that
--                tutor learning that variety sees it, nobody else does.
--                `conjugations` holds up to three tables (past, present,
--                imperative); each cell keeps BOTH writings, Arabic script and
--                transliteration, because the script is chosen per student:
--                {"past": {"dual": false, "plural": true,
--                          "cells": {"s1": {"ar": "كتبت", "tr": "katabt"}, …}},
--                 "present": {…}, "imperative": {…}}
--
-- arabic_verb_prefs  how one student's Verbs tab reads: the script the tutor
--                picked the first time (once), and the variety shown.
--
-- Both are read from the student's portal, which has no sign-in, so reading
-- is open (conjugation tables and a script choice, nothing personal). Writing
-- is the tutor's only.

create table if not exists public.arabic_verbs (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    text not null,
  variety       text not null check (variety in ('levantine', 'msa')),
  meaning       text not null,
  conjugations  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists arabic_verbs_teacher_variety
  on public.arabic_verbs (teacher_id, variety, created_at);

alter table public.arabic_verbs enable row level security;
drop policy if exists arabic_verbs_read on public.arabic_verbs;
create policy arabic_verbs_read on public.arabic_verbs
  for select using (true);
drop policy if exists arabic_verbs_write on public.arabic_verbs;
create policy arabic_verbs_write on public.arabic_verbs
  for all using (teacher_id = auth.uid()::text) with check (teacher_id = auth.uid()::text);

create table if not exists public.arabic_verb_prefs (
  student_id  text primary key,          -- arabic_students.id
  script      text not null default 'arabic' check (script in ('arabic', 'translit')),
  variety     text not null default 'levantine' check (variety in ('levantine', 'msa')),
  updated_at  timestamptz not null default now()
);

alter table public.arabic_verb_prefs enable row level security;
drop policy if exists arabic_verb_prefs_read on public.arabic_verb_prefs;
create policy arabic_verb_prefs_read on public.arabic_verb_prefs
  for select using (true);
drop policy if exists arabic_verb_prefs_write on public.arabic_verb_prefs;
create policy arabic_verb_prefs_write on public.arabic_verb_prefs
  for all
  using (exists (select 1 from public.arabic_students s
                 where s.id::text = arabic_verb_prefs.student_id and s.teacher_id::text = auth.uid()::text))
  with check (exists (select 1 from public.arabic_students s
                 where s.id::text = arabic_verb_prefs.student_id and s.teacher_id::text = auth.uid()::text));
