-- Tadabbur notes appear on the other side while the lesson is running: the
-- tutor sees the student's reflection as it is written, the student sees the
-- tutor's note and word meanings. Realtime needs the tables published, and
-- REPLICA IDENTITY FULL so a delete says WHICH verse was cleared.
alter table public.quran_verse_notes       replica identity full;
alter table public.quran_verse_tutor_notes replica identity full;
alter table public.quran_word_meanings     replica identity full;

alter publication supabase_realtime add table public.quran_verse_notes;
alter publication supabase_realtime add table public.quran_verse_tutor_notes;
alter publication supabase_realtime add table public.quran_word_meanings;
