-- Add meet_url column to lesson_bookings table
-- Run once in Supabase SQL Editor
ALTER TABLE lesson_bookings ADD COLUMN IF NOT EXISTS meet_url TEXT;
