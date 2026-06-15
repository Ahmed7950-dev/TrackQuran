-- ─── Arabic Exam System — Phase 2 additive columns ───────────────────────────
-- Run this in the Supabase SQL Editor after 20260201_arabic_exams.sql.
-- Both columns are additive and nullable/defaulted, so existing rows are safe.

-- Denormalised student name on each attempt. Lets the leaderboard, certificate
-- and admin results display names without reading arabic_students (which the
-- anonymous student portal cannot list).
alter table public.arabic_exam_attempts
  add column if not exists student_name text;

-- Per-exam leaderboard name privacy: 'full' | 'first_name' | 'anonymous'.
alter table public.arabic_exams
  add column if not exists leaderboard_privacy text not null default 'first_name';
