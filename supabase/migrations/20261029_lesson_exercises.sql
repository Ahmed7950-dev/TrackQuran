-- ─── Special exercises on an Arabic lesson ──────────────────────────────────
-- A lesson's Homework tab has always shown exactly one thing: the written
-- homework. This lets the admin put other exercises beside it, so the tab
-- becomes a short list of cards — the writing, plus whatever else the lesson
-- needs — and stays exactly as it is when a lesson has none.
--
-- The first kind is 'pronoun_pictures': four pictures in a fixed order
-- (He · You (M) · You (F) · She), each swapping to a second picture and saying
-- its pronoun when the student points at it. A round is a question and which
-- of the four answers it.
--
-- Rounds live in JSONB rather than their own table. A round is never queried
-- on its own — the exercise is always loaded whole, by the admin editing it or
-- by a student working through it — and the lesson content around here is kept
-- the same way (grammar_summary, quran_homework).
--
-- The pictures belong to the ROUND and the recordings to the EXERCISE: a new
-- round is a new scene, but it is the same four voices saying the same four
-- pronouns every time, so they are recorded once.

create table if not exists public.lesson_exercises (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   text not null,
  kind        text not null default 'pronoun_pictures',
  title       text not null,
  -- Hidden from tutors and students until the admin says it is ready.
  published   boolean not null default false,
  -- [{key,arabic,translit,audioUrl}] — four, in the order they are shown.
  slots       jsonb not null default '[]'::jsonb,
  -- [{id,question,correct,pics:[{url,hoverUrl} ×4]}]
  rounds      jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists lesson_exercises_lesson
  on public.lesson_exercises (lesson_id, order_index);

-- ── One student's go at one exercise ────────────────────────────────────
create table if not exists public.lesson_exercise_submissions (
  id           uuid primary key default gen_random_uuid(),
  exercise_id  uuid not null references public.lesson_exercises(id) on delete cascade,
  -- arabic_students.id. No foreign key: a student reaches this through their
  -- share link, where nothing else about them is loaded.
  student_id   text not null,
  -- {roundId: "what they typed"}
  answers      jsonb not null default '{}'::jsonb,
  -- {roundId: {correct: bool, auto: bool}} — auto=false once a tutor has said
  -- otherwise, so an override is never quietly recomputed.
  marks        jsonb not null default '{}'::jsonb,
  score        integer not null default 0,
  total        integer not null default 0,
  status       text not null default 'submitted' check (status in ('submitted', 'returned')),
  tutor_note   text,
  submitted_at timestamptz not null default now(),
  returned_at  timestamptz
);

create index if not exists lesson_exercise_submissions_who
  on public.lesson_exercise_submissions (exercise_id, student_id, submitted_at desc);

alter table public.lesson_exercises            enable row level security;
alter table public.lesson_exercise_submissions enable row level security;

-- Open, like the rest of the Arabic lesson homework: a student works through
-- these from a share link with no session of their own, so there is no
-- auth.uid() to key a policy on. The same shape as homework_items and
-- homework_submissions beside them.
drop policy if exists lesson_exercises_all on public.lesson_exercises;
create policy lesson_exercises_all on public.lesson_exercises
  for all using (true) with check (true);

drop policy if exists lesson_exercise_submissions_all on public.lesson_exercise_submissions;
create policy lesson_exercise_submissions_all on public.lesson_exercise_submissions
  for all using (true) with check (true);
