-- ─── Homework items — rich builder model (mirrors arabic_exam_items) ─────────
-- Run in the Supabase SQL Editor.
--
-- Replaces the flat homework_questions model with a rich ordered-item list
-- identical in structure to arabic_exam_items:
--   section / divider / headline / instruction / paragraph / image / question
--
-- arabic_lessons.id is TEXT (not UUID).

create table if not exists public.homework_items (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      text not null references public.arabic_lessons(id) on delete cascade,
  item_type      text not null,           -- ArabicExamItemType
  order_index    int  not null default 1,
  content        text,                    -- text for non-image items; question prompt for question
  image_url      text,                    -- for image items
  question_type  text,                    -- HomeworkQuestionType (only for item_type = 'question')
  options        text[],                  -- for multiple_choice / fill_blank_options
  correct_answer text,                    -- for auto-graded question types
  marks          int,                     -- for question items
  created_at     timestamptz not null default now()
);

create index if not exists homework_items_lesson_idx       on public.homework_items(lesson_id);
create index if not exists homework_items_order_idx        on public.homework_items(lesson_id, order_index);

-- ── RLS (same permissive style as arabic_exam_items) ─────────────────────────
alter table public.homework_items enable row level security;

create policy "homework_items_read"  on public.homework_items for select to anon, authenticated using (true);
create policy "homework_items_write" on public.homework_items for all    to anon, authenticated using (true) with check (true);
