-- Lesson reminders: pushed ~20 minutes before each lesson by the
-- lesson-reminders Edge Function, run every minute by pg_cron.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One row per reminder already sent, so a lesson is reminded once.
create table if not exists push_reminders_sent (
  key      text primary key,              -- 'lesson:<arabic_lesson_sessions.id>'
  sent_at  timestamptz not null default now(),
  devices  int not null default 0
);
alter table push_reminders_sent enable row level security;   -- service role only: no policies
