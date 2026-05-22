-- Migration: add teacher_note column to students table
-- Run once in Supabase SQL Editor before deploying this update.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS teacher_note TEXT;
