-- ─── Qaedah · Shaddah lesson word list ───────────────────────────────────────
-- ALREADY APPLIED to the live project on 2026-09-04 (via the REST API); this
-- file is the record, so the list survives a rebuild from migrations.
--
-- Replaces the twenty words the lesson shipped with, which were mostly made-up
-- drill forms rather than Qur'anic text and included اللَّهُ spelt with a plain
-- alef instead of the wasla.
--
-- Every word carries a shadda and nothing from LATER than lesson 9: the short
-- vowels, the madd letters, the sukoon, the tanween and the shadda itself. No
-- hamzat al-wasl — that is lesson 10 — which is why ٱللَّهُ and every ٱل… word is
-- absent here and لِلَّهِ (no wasla) stands in.
--
--   level 1  30 single words, one for each letter that takes a shadda in the
--            Qur'an: ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع ف ق ك ل م ن ه و ى ي
--            (غ never carries one), plus three common extras.
--            No word STARTS with a shadda — those are idgham leftovers that
--            only make sense with the word before them.
--   level 2  30 pairs — consecutive words of the same verse, BOTH carrying a
--            shadda (إِنَّا كُنَّا, أَوَّلَ مَرَّةٍ, سِتَّةِ أَيَّامٍ …), which is also where a
--            leading shadda does belong: عَدُوٌّ مُّبِينٌ shows why it is there.
--
-- The sukoon is stored as U+06E1, as everywhere else in this table.
-- Re-running this DELETES the lesson's words; qaedah_attempts cascades.

do $$
declare
  t uuid;
begin
  select id into t from public.qaedah_topics where title_en = 'Shaddah' limit 1;
  if t is null then
    raise notice 'No "Shaddah" topic — nothing to do.';
    return;
  end if;

  delete from public.qaedah_words where topic_id = t;

  insert into public.qaedah_words (topic_id, word, level, order_index)
  select t, w.word, w.level, w.order_index
  from (values
  ('رَبِّكَ', 1, 1),
  ('حَتَّىٰ', 1, 2),
  ('وَبَثَّ', 1, 3),
  ('سُجَّدًا', 1, 4),
  ('أَشِحَّةً', 1, 5),
  ('وَسَخَّرَ', 1, 6),
  ('أَشَدُّ', 1, 7),
  ('كَذَّبَ', 1, 8),
  ('حَرَّمَ', 1, 9),
  ('نَزَّلَ', 1, 10),
  ('مَسَّهُ', 1, 11),
  ('وَبَشِّرِ', 1, 12),
  ('نُفَصِّلُ', 1, 13),
  ('فَضَّلۡنَا', 1, 14),
  ('حِطَّةٌ', 1, 15),
  ('حَظًّا', 1, 16),
  ('فَعَّالٌ', 1, 17),
  ('صَفًّا', 1, 18),
  ('حَقًّا', 1, 19),
  ('وَتَوَكَّلۡ', 1, 20),
  ('إِلَّا', 1, 21),
  ('فَلَمَّا', 1, 22),
  ('إِنَّهُۥ', 1, 23),
  ('وَهَّاجًا', 1, 24),
  ('عَدُوٌّ', 1, 25),
  ('فَبِأَىِّ', 1, 26),
  ('أَيَّامٍ', 1, 27),
  ('إِنَّا', 1, 28),
  ('لِلَّهِ', 1, 29),
  ('إِنَّمَا', 1, 30),
  ('إِنَّا كُنَّا', 2, 31),
  ('وَإِنَّ رَبَّكَ', 2, 32),
  ('مُصَدِّقًا لِّمَا', 2, 33),
  ('أَوَّلَ مَرَّةٍ', 2, 34),
  ('عَدُوٌّ مُّبِينٌ', 2, 35),
  ('سِتَّةِ أَيَّامٍ', 2, 36),
  ('لَعَلَّكُمۡ تَتَّقُونَ', 2, 37),
  ('رَبَّنَآ إِنَّكَ', 2, 38),
  ('رَبِّىٓ إِنَّهُۥ', 2, 39),
  ('إِنَّمَا حَرَّمَ', 2, 40),
  ('حَتَّىٰ يَتَبَيَّنَ', 2, 41),
  ('لَعَلَّهُمۡ يَتَّقُونَ', 2, 42),
  ('رَبِّهِمۡ إِلَّا', 2, 43),
  ('وَلِكُلِّ أُمَّةٍ', 2, 44),
  ('ءَامَنَّا بِرَبِّ', 2, 45),
  ('فَإِنَّمَا يَضِلُّ', 2, 46),
  ('كَذَّبَ وَتَوَلَّىٰ', 2, 47),
  ('رَبَّهُۥٓ أَنِّى', 2, 48),
  ('كَلَّآ إِنَّهَا', 2, 49),
  ('سَبَّحَ لِلَّهِ', 2, 50),
  ('زُيِّنَ لِلَّذِينَ', 2, 51),
  ('فَلَمَّا تَبَيَّنَ', 2, 52),
  ('تَوَّابًا رَّحِيمًا', 2, 53),
  ('عَدُوًّا مُّبِينًا', 2, 54),
  ('حَظًّا مِّمَّا', 2, 55),
  ('لِكُلِّ نَبِىٍّ', 2, 56),
  ('ضَرَّآءَ مَسَّتۡهُ', 2, 57),
  ('عَلَىَّ هَيِّنٌ', 2, 58),
  ('صِدِّيقًا نَّبِيًّا', 2, 59),
  ('رَبُّكُمۡ وَرَبُّ', 2, 60)
  ) as w(word, level, order_index);
end $$;
