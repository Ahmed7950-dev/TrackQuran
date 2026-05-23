-- Migration: add active_meet_url column to arabic_students
-- Run once in your Supabase SQL Editor.
--
-- This stores the Google Meet link that the tutor generates for the next
-- scheduled lesson. The student portal reads this field and shows a
-- "Join Lesson" button when the link is present.

ALTER TABLE arabic_students
  ADD COLUMN IF NOT EXISTS active_meet_url TEXT;
