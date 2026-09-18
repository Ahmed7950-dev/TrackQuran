-- ─── Recitation homework: reassigning only the verses with mistakes ──────────
-- Reviewing used to end in "needs revision" on the whole range. Now the tutor
-- reassigns just the verses they logged mistakes in, which creates a FOLLOW-UP
-- homework holding that list of verses.
--
--   verses            explicit list of "surah:ayah" (null = the whole range)
--   parent_id         the homework this one was reassigned from
--   reassigned_count  how many verses were sent back from this homework

alter table public.quran_recitation_homework
  add column if not exists verses           text[],
  add column if not exists parent_id        uuid references public.quran_recitation_homework(id) on delete set null,
  add column if not exists reassigned_count integer;
