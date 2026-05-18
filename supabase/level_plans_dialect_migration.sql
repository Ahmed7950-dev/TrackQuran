-- Migration: add dialect column to arabic_level_plans
-- Run this once in Supabase → SQL Editor before deploying the code update.

-- 1. Add the dialect column (existing rows get 'levantine' by default)
ALTER TABLE arabic_level_plans
  ADD COLUMN IF NOT EXISTS dialect TEXT NOT NULL DEFAULT 'levantine';

-- 2. Drop the old single-column primary key
ALTER TABLE arabic_level_plans
  DROP CONSTRAINT IF EXISTS arabic_level_plans_pkey;

-- 3. Add composite primary key (level + dialect)
ALTER TABLE arabic_level_plans
  ADD PRIMARY KEY (level, dialect);
