-- ─── Qaedah · Tanween lesson word list ───────────────────────────────────────
-- ALREADY APPLIED to the live project on 2026-09-04 (via the REST API); this
-- file is the record, so the list survives a rebuild from migrations.
--
-- Replaces the twenty words the lesson shipped with — which had no kasratan at
-- all, and included جَنَّةٌ, a shadda word from the lesson AFTER this one.
--
-- Every word below is real Qur'anic text carrying nothing past lesson 8: the
-- three short vowels, the madd letters, the sukoon and the tanween. No shadda,
-- no hamzat al-wasl. Checked with the app's own predicate —
-- wordFitsLesson(w, 8) in utils/quranWordCategories.ts — so the lesson and the
-- word challenge agree. The earlier lessons really are revised here: 35 of the
-- 90 words also carry a sukoon and 43 a madd.
--
--   level 1  30 single words, ten of each tanween in the order the earlier
--            lessons teach the vowels: ـً fathatan, ـٍ kasratan, ـٌ dammatan.
--   level 2  30 pairs — consecutive words of the same verse, BOTH carrying a
--            tanween (عَزِيزٌ حَكِيمٌ, عَمَلًا صَـٰلِحًا …).
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
  select id into t from public.qaedah_topics where title_en = 'Tanween' limit 1;
  if t is null then
    raise notice 'No "Tanween" topic — nothing to do.';
    return;
  end if;

  delete from public.qaedah_words where topic_id = t;

  insert into public.qaedah_words (topic_id, word, level, order_index)
  select t, w.word, w.level, w.order_index
  from (values
  ('قَلِيلًا', 1, 1),
  ('كَثِيرًا', 1, 2),
  ('جَمِيعًا', 1, 3),
  ('عَذَابًا', 1, 4),
  ('خَيۡرًا', 1, 5),
  ('قَوۡمًا', 1, 6),
  ('سَبِيلًا', 1, 7),
  ('نَارًا', 1, 8),
  ('أَجۡرًا', 1, 9),
  ('هُدًى', 1, 10),
  ('يَوۡمٍ', 1, 11),
  ('عِلۡمٍ', 1, 12),
  ('بَعۡضٍ', 1, 13),
  ('نَفۡسٍ', 1, 14),
  ('قَوۡمٍ', 1, 15),
  ('أَجَلٍ', 1, 16),
  ('عَظِيمٍ', 1, 17),
  ('حِينٍ', 1, 18),
  ('خَيۡرٍ', 1, 19),
  ('أَحَدٍ', 1, 20),
  ('خَيۡرٌ', 1, 21),
  ('عَذَابٌ', 1, 22),
  ('عَلِيمٌ', 1, 23),
  ('غَفُورٌ', 1, 24),
  ('قَدِيرٌ', 1, 25),
  ('قَوۡمٌ', 1, 26),
  ('رَسُولٌ', 1, 27),
  ('كِتَـٰبٌ', 1, 28),
  ('نَفۡسٌ', 1, 29),
  ('وَلَدٌ', 1, 30),
  ('عَزِيزٌ حَكِيمٌ', 2, 31),
  ('إِلَـٰهٌ وَٰحِدٌ', 2, 32),
  ('وَيۡلٌ يَوۡمَئِذٍ', 2, 33),
  ('عَلِيمًا حَكِيمًا', 2, 34),
  ('بِعَذَابٍ أَلِيمٍ', 2, 35),
  ('قَرۡضًا حَسَنًا', 2, 36),
  ('شَىۡءٍ شَهِيدٌ', 2, 37),
  ('أَجۡرٌ عَظِيمٌ', 2, 38),
  ('وَهُدًى وَرَحۡمَةً', 2, 39),
  ('وَرِزۡقٌ كَرِيمٌ', 2, 40),
  ('صَيۡحَةً وَٰحِدَةً', 2, 41),
  ('خَوۡفًا وَطَمَعًا', 2, 42),
  ('حُكۡمًا وَعِلۡمًا', 2, 43),
  ('إِلَـٰهًا وَٰحِدًا', 2, 44),
  ('فَوۡزًا عَظِيمًا', 2, 45),
  ('لَعِبٌ وَلَهۡوٌ', 2, 46),
  ('نُوحٍ وَعَادٍ', 2, 47),
  ('عَمَلًا صَـٰلِحًا', 2, 48),
  ('وَأَجۡرٌ كَبِيرٌ', 2, 49),
  ('عَذَابٍ غَلِيظٍ', 2, 50),
  ('خَلۡقٍ جَدِيدٍ', 2, 51),
  ('بَأۡسٍ شَدِيدٍ', 2, 52),
  ('ثَوَابًا وَخَيۡرٌ', 2, 53),
  ('أُسۡوَةٌ حَسَنَةٌ', 2, 54),
  ('بُكۡمٌ عُمۡىٌ', 2, 55),
  ('طَوۡعًا وَكَرۡهًا', 2, 56),
  ('مَتَـٰعٌ قَلِيلٌ', 2, 57),
  ('قَوۡلًا سَدِيدًا', 2, 58),
  ('هُزُوًا وَلَعِبًا', 2, 59),
  ('حَمِيمٍ وَعَذَابٌ', 2, 60)
  ) as w(word, level, order_index);
end $$;
