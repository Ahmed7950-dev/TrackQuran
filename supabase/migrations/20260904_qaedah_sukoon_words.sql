-- ─── Qaedah · Sukoon lesson word list ────────────────────────────────────────
-- ALREADY APPLIED to the live project on 2026-09-04 (via the REST API); this
-- file is the record, so the list survives a rebuild from migrations.
--
-- Replaces the twenty words the lesson shipped with — every one of which
-- carried a TANWEEN (قَلۡبٌ, نَفۡسٌ …), a rule three lessons further on.
--
-- Every word below is real Qur'anic text and carries nothing past lesson 7:
-- fatha, kasra, damma, the madd letters and the sukoon. No tanween, no shadda,
-- no hamzat al-wasl. Checked with the app's own predicate — wordFitsLesson(w, 7)
-- in utils/quranWordCategories.ts — so the lesson and the word challenge agree.
--
--   level 1  30 single words, ONE PER SAKIN LETTER, in alphabetical order:
--            أ ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي ؤ ئ
--   level 2  30 pairs — consecutive words of the same verse, both carrying a
--            written sukoon.
--
-- The sukoon is stored as U+06E1 (the khaa-head the Uthmani fonts draw), which
-- is what the rest of the table already uses.
--
-- Re-running this DELETES the lesson's words, and qaedah_attempts cascades with
-- them, so the little practice squares under each word start over.

do $$
declare
  t uuid;
begin
  select id into t from public.qaedah_topics where title_en = 'Sukoon' limit 1;
  if t is null then
    raise notice 'No "Sukoon" topic — nothing to do.';
    return;
  end if;

  delete from public.qaedah_words where topic_id = t;

  insert into public.qaedah_words (topic_id, word, level, order_index)
  select t, w.word, w.level, w.order_index
  from (values
  ('يَأۡتِ', 1, 1),
  ('قَبۡلَ', 1, 2),
  ('قَالَتۡ', 1, 3),
  ('مِثۡلَ', 1, 4),
  ('أَجۡرَ', 1, 5),
  ('نَحۡنُ', 1, 6),
  ('أُخۡرَىٰ', 1, 7),
  ('فَقَدۡ', 1, 8),
  ('فَخُذۡ', 1, 9),
  ('مَرۡيَمَ', 1, 10),
  ('وِزۡرَ', 1, 11),
  ('بِسۡمِ', 1, 12),
  ('بُشۡرَىٰ', 1, 13),
  ('نَصۡرُ', 1, 14),
  ('فَضۡلُ', 1, 15),
  ('شَطۡرَ', 1, 16),
  ('أَظۡلَمُ', 1, 17),
  ('بَعۡدَ', 1, 18),
  ('أَغۡنَىٰ', 1, 19),
  ('تَخَفۡ', 1, 20),
  ('أَقۡرَبُ', 1, 21),
  ('ذِكۡرِ', 1, 22),
  ('فَقُلۡ', 1, 23),
  ('أَلَمۡ', 1, 24),
  ('مِنۡهُ', 1, 25),
  ('أَهۡلُ', 1, 26),
  ('يَوۡمَ', 1, 27),
  ('بَيۡنَ', 1, 28),
  ('يُؤۡمِنُ', 1, 29),
  ('بِئۡسَ', 1, 30),
  ('بَيۡنَ يَدَيۡهِ', 2, 31),
  ('وَمَنۡ أَظۡلَمُ', 2, 32),
  ('تُتۡلَىٰ عَلَيۡهِمۡ', 2, 33),
  ('وَإِذۡ قُلۡنَا', 2, 34),
  ('بَيۡنَهُمۡ يَوۡمَ', 2, 35),
  ('بَعۡدَ مَوۡتِهَا', 2, 36),
  ('وَيَغۡفِرۡ لَكُمۡ', 2, 37),
  ('وَلَوۡلَا فَضۡلُ', 2, 38),
  ('أَلَمۡ يَأۡتِكُمۡ', 2, 39),
  ('وِزۡرَ أُخۡرَىٰ', 2, 40),
  ('وَلَقَدۡ خَلَقۡنَا', 2, 41),
  ('قَبۡلَهُمۡ قَوۡمُ', 2, 42),
  ('لِقَوۡمِهِۦ يَـٰقَوۡمِ', 2, 43),
  ('إِثۡمَ عَلَيۡهِ', 2, 44),
  ('كَسَبَتۡ وَهُمۡ', 2, 45),
  ('فَأَعۡرِضۡ عَنۡهُمۡ', 2, 46),
  ('لَهُمۡ أَخُوهُمۡ', 2, 47),
  ('أَنۡعَمۡتُ عَلَيۡكُمۡ', 2, 48),
  ('مِنۡهَا حَيۡثُ', 2, 49),
  ('وَجۡهَكَ شَطۡرَ', 2, 50),
  ('فَإِنۡ خِفۡتُمۡ', 2, 51),
  ('يَحۡكُمُ بَيۡنَكُمۡ', 2, 52),
  ('وَمِنۡ خَلۡفِهِمۡ', 2, 53),
  ('مَدۡيَنَ أَخَاهُمۡ', 2, 54),
  ('وَلَوۡ شِئۡنَا', 2, 55),
  ('يَهۡتَدِى لِنَفۡسِهِۦ', 2, 56),
  ('لَقَدۡ عَلِمۡتَ', 2, 57),
  ('تَخۡرُجۡ بَيۡضَآءَ', 2, 58),
  ('وَضُرِبَتۡ عَلَيۡهِمُ', 2, 59),
  ('فَلَهُمۡ أَجۡرُهُمۡ', 2, 60)
  ) as w(word, level, order_index);
end $$;
