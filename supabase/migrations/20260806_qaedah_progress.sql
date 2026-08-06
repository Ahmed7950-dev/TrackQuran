-- ─── Qaedah practice history ─────────────────────────────────────────────────
-- Two tables, both written from the tutor side AND from the student portal
-- (which is unauthenticated), so both are anon-writable like the other
-- practice/game tables in this project.
--
--   qaedah_attempts    one row per word, per "Correct"/"Wrong" tap. Renders the
--                      tiny green/red squares under each word in the lesson.
--   qaedah_completions one row per finished challenge. Feeds the progress
--                      calendar on the student's main page.

create table if not exists public.qaedah_attempts (
  id         uuid primary key default gen_random_uuid(),
  student_id text not null,
  topic_id   uuid not null references public.qaedah_topics(id) on delete cascade,
  word_id    uuid not null references public.qaedah_words(id) on delete cascade,
  correct    boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists qaedah_attempts_student_topic_idx
  on public.qaedah_attempts (student_id, topic_id, created_at);

create table if not exists public.qaedah_completions (
  id            uuid primary key default gen_random_uuid(),
  student_id    text not null,
  topic_id      uuid not null references public.qaedah_topics(id) on delete cascade,
  topic_title   text not null,
  words_count   integer not null default 0,
  correct_count integer not null default 0,
  wrong_count   integer not null default 0,
  completed_at  timestamptz not null default now()
);

create index if not exists qaedah_completions_student_idx
  on public.qaedah_completions (student_id, completed_at);

alter table public.qaedah_attempts    enable row level security;
alter table public.qaedah_completions enable row level security;

drop policy if exists qaedah_attempts_all on public.qaedah_attempts;
create policy qaedah_attempts_all on public.qaedah_attempts
  for all using (true) with check (true);

drop policy if exists qaedah_completions_all on public.qaedah_completions;
create policy qaedah_completions_all on public.qaedah_completions
  for all using (true) with check (true);
