-- Web push subscriptions — one row per browser/device that opted in.
-- Tutor first; the student columns are here so the same table serves the
-- portal later (a portal visitor has no auth session, hence share_token).

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  recipient   text not null check (recipient in ('tutor', 'student')),
  teacher_id  text,                       -- tutor: their auth uid; student: their tutor
  student_id  text,                       -- student rows only
  label       text,                       -- "iPhone · Safari", for the tutor's own list
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_error  text
);

create index if not exists push_subscriptions_tutor_idx
  on push_subscriptions (recipient, teacher_id);
create index if not exists push_subscriptions_student_idx
  on push_subscriptions (recipient, student_id);

alter table push_subscriptions enable row level security;

-- Signed-in tutors manage their own devices. Students (no session) come later.
drop policy if exists "push subs authenticated" on push_subscriptions;
create policy "push subs authenticated" on push_subscriptions
  for all to authenticated using (true) with check (true);
