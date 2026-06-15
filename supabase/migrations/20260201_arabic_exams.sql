-- ─── Arabic Student Exam System ──────────────────────────────────────────────
-- Run this in the Supabase SQL Editor.
--
-- Tables:
--   arabic_exams          — the exam definition (per level × version)
--   arabic_exam_items     — ordered content (sections/headlines/.../questions)
--   arabic_exam_unlocks   — per-student per-level gate for the "Do Exam" button
--   arabic_exam_attempts  — one row per student attempt (answers, grading, score)
--
-- RLS follows the existing house pattern: everyone (anon + authenticated) can
-- read; admins/tutors (authenticated) write exams/items/unlocks; the anonymous
-- student portal needs to write its own attempts, so attempts allow anon write.
-- Access is enforced in the app layer (unlock rows + share token), matching the
-- other Arabic tables.

-- ─── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.arabic_exams (
  id                  uuid primary key default gen_random_uuid(),
  level               integer not null,                       -- 1 | 2 | 3
  version             text    not null,                       -- 'arabic' | 'transliteration'
  title               text    not null,
  time_limit_minutes  integer,                                -- null = no time limit
  passing_percentage  integer not null default 70,
  status              text    not null default 'draft',       -- 'draft' | 'published'
  total_marks         integer not null default 0,
  created_by          uuid,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists public.arabic_exam_items (
  id             uuid primary key default gen_random_uuid(),
  exam_id        uuid not null references public.arabic_exams(id) on delete cascade,
  item_type      text not null,   -- section | divider | headline | instruction | paragraph | image | question
  order_index    integer not null default 0,
  content        text,            -- text for section/headline/instruction/paragraph + the question prompt
  image_url      text,            -- for image items
  question_type  text,            -- HomeworkQuestionType for question items
  options        jsonb,           -- for multiple_choice / fill_blank_options
  correct_answer text,            -- for auto-grading objective questions
  marks          integer,         -- marks for question items
  created_at     timestamptz default now()
);

create table if not exists public.arabic_exam_unlocks (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null,
  level          integer not null,
  unlocked_by    uuid,            -- tutor id
  unlocked_at    timestamptz default now(),
  retake_allowed boolean not null default false,
  unique (student_id, level)
);

create table if not exists public.arabic_exam_attempts (
  id               uuid primary key default gen_random_uuid(),
  exam_id          uuid not null references public.arabic_exams(id) on delete cascade,
  student_id       uuid not null,
  level            integer not null,
  version          text not null,
  attempt_number   integer not null default 1,
  status           text not null default 'in_progress',  -- in_progress | submitted | under_review | result_published
  started_at       timestamptz default now(),
  submitted_at     timestamptz,
  marked_at        timestamptz,
  published_at     timestamptz,
  answers          jsonb not null default '{}'::jsonb,    -- { itemId: answer }
  grading          jsonb not null default '{}'::jsonb,    -- { itemId: { awarded, correct, correction } }
  total_score      integer,
  percentage       numeric,
  passed           boolean,
  general_feedback text,
  created_at       timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists arabic_exam_items_exam_idx     on public.arabic_exam_items(exam_id, order_index);
create index if not exists arabic_exams_level_version_idx  on public.arabic_exams(level, version, status);
create index if not exists arabic_exam_unlocks_student_idx on public.arabic_exam_unlocks(student_id);
create index if not exists arabic_exam_attempts_student_idx on public.arabic_exam_attempts(student_id, level);
create index if not exists arabic_exam_attempts_exam_idx    on public.arabic_exam_attempts(exam_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table public.arabic_exams         enable row level security;
alter table public.arabic_exam_items    enable row level security;
alter table public.arabic_exam_unlocks  enable row level security;
alter table public.arabic_exam_attempts enable row level security;

-- Public read for everyone (students access anonymously via share link)
create policy "arabic_exams_public_read"        on public.arabic_exams         for select to anon, authenticated using (true);
create policy "arabic_exam_items_public_read"   on public.arabic_exam_items    for select to anon, authenticated using (true);
create policy "arabic_exam_unlocks_public_read" on public.arabic_exam_unlocks  for select to anon, authenticated using (true);
create policy "arabic_exam_attempts_public_read"on public.arabic_exam_attempts for select to anon, authenticated using (true);

-- Admin/tutor write (authenticated)
create policy "arabic_exams_auth_write"        on public.arabic_exams        for all to authenticated using (true) with check (true);
create policy "arabic_exam_items_auth_write"   on public.arabic_exam_items   for all to authenticated using (true) with check (true);
create policy "arabic_exam_unlocks_auth_write" on public.arabic_exam_unlocks for all to authenticated using (true) with check (true);

-- Attempts: students are anonymous, so they must be able to insert/update their
-- own attempts. App enforces which attempt belongs to which student.
create policy "arabic_exam_attempts_write" on public.arabic_exam_attempts
  for all to anon, authenticated using (true) with check (true);
