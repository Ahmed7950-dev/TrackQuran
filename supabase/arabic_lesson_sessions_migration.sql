-- Run once in your Supabase SQL Editor.
-- Creates the arabic_lesson_sessions table for tracking scheduled lessons.

CREATE TABLE IF NOT EXISTS arabic_lesson_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     UUID        NOT NULL,
  student_id     UUID        NOT NULL REFERENCES arabic_students(id) ON DELETE CASCADE,
  gcal_event_id  TEXT,
  title          TEXT,
  start_at       TIMESTAMPTZ NOT NULL,
  end_at         TIMESTAMPTZ,
  meet_url       TEXT,
  status         TEXT        NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, gcal_event_id)
);

CREATE INDEX IF NOT EXISTS idx_arabic_lesson_sessions_teacher
  ON arabic_lesson_sessions (teacher_id, start_at);

CREATE INDEX IF NOT EXISTS idx_arabic_lesson_sessions_student
  ON arabic_lesson_sessions (student_id, start_at);
