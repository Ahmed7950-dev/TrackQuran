-- ─── Qaedah · Hamzatul-Wasl lesson word list ─────────────────────────────────
-- ALREADY APPLIED to the live project on 2026-09-04 (via the REST API); this
-- file is the record, so the list survives a rebuild from migrations.
--
-- Replaces the twenty words the lesson shipped with, which were hand-spelt
-- rather than Qur'anic (ٱلۡقُرۡآنُ with a madda alef, ٱبۡنَةٌ, ٱثۡنَانِ …).
--
-- This is the last of the ten lessons, so everything earlier is allowed and
-- nothing is out of bounds. The two levels teach the two halves of the rule:
--
--   level 1  30 words that BEGIN with the wasla, where it IS pronounced —
--            12 verbs and nouns (ٱقۡرَأۡ, ٱذۡهَبۡ, ٱسۡمَ, ٱبۡنُ …), 9 moon-letter ٱل…
--            words where the lam takes a sukoon, and 9 sun-letter ones where
--            the lam falls silent and the next letter doubles (ٱلنَّاسِ, ٱلشَّمۡسَ).
--   level 2  30 pairs where the SECOND word starts with the wasla, so the
--            hamza is dropped in the join — يَـٰٓأَيُّهَا ٱلَّذِينَ, خَلَقَ ٱلسَّمَـٰوَٰتِ,
--            عَلَى ٱللَّهِ. This is the same shape as the word challenge's
--            hamzatWasl category (isHamzatWaslPair).
--
-- The sukoon is stored as U+06E1, as everywhere else in this table.
-- Re-running this DELETES the lesson's words; qaedah_attempts cascades.

do $$
declare
  t uuid;
begin
  select id into t from public.qaedah_topics where title_en = 'Hamzatul-Wasl' limit 1;
  if t is null then
    raise notice 'No "Hamzatul-Wasl" topic — nothing to do.';
    return;
  end if;

  delete from public.qaedah_words where topic_id = t;

  insert into public.qaedah_words (topic_id, word, level, order_index)
  select t, w.word, w.level, w.order_index
  from (values
  ('ٱتَّخَذَ', 1, 1),
  ('ٱفۡتَرَىٰ', 1, 2),
  ('ٱبۡنُ', 1, 3),
  ('ٱثۡنَيۡنِ', 1, 4),
  ('ٱسۡمَ', 1, 5),
  ('ٱهۡتَدَىٰ', 1, 6),
  ('ٱغۡفِرۡ', 1, 7),
  ('ٱدۡعُ', 1, 8),
  ('ٱئۡتُونِى', 1, 9),
  ('ٱذۡهَبۡ', 1, 10),
  ('ٱضۡطُرَّ', 1, 11),
  ('ٱمۡرَأَتَهُۥ', 1, 12),
  ('ٱلَّذِينَ', 1, 13),
  ('ٱلۡأَرۡضِ', 1, 14),
  ('ٱلۡكِتَـٰبَ', 1, 15),
  ('ٱلۡحَقُّ', 1, 16),
  ('ٱلۡعَزِيزُ', 1, 17),
  ('ٱلَّتِى', 1, 18),
  ('ٱلۡيَوۡمَ', 1, 19),
  ('ٱلۡقَوۡمِ', 1, 20),
  ('ٱلۡجَنَّةِ', 1, 21),
  ('ٱللَّهِ', 1, 22),
  ('ٱلدُّنۡيَا', 1, 23),
  ('ٱلنَّاسِ', 1, 24),
  ('ٱلسَّمَآءِ', 1, 25),
  ('ٱلصَّلَوٰةَ', 1, 26),
  ('ٱلرَّحِيمُ', 1, 27),
  ('ٱلزَّكَوٰةَ', 1, 28),
  ('ٱلثَّمَرَٰتِ', 1, 29),
  ('ٱلشَّمۡسَ', 1, 30),
  ('يَـٰٓأَيُّهَا ٱلَّذِينَ', 2, 31),
  ('عَلَى ٱللَّهِ', 2, 32),
  ('فَإِنَّ ٱللَّهَ', 2, 33),
  ('يَوۡمَ ٱلۡقِيَـٰمَةِ', 2, 34),
  ('وَكَانَ ٱللَّهُ', 2, 35),
  ('ٱلۡحَيَوٰةِ ٱلدُّنۡيَا', 2, 36),
  ('تَحۡتِهَا ٱلۡأَنۡهَـٰرُ', 2, 37),
  ('ٱلۡعَزِيزُ ٱلۡحَكِيمُ', 2, 38),
  ('خَلَقَ ٱلسَّمَـٰوَٰتِ', 2, 39),
  ('وَهُوَ ٱلَّذِى', 2, 40),
  ('وَٱلۡيَوۡمِ ٱلۡـَٔاخِرِ', 2, 41),
  ('يَهۡدِى ٱلۡقَوۡمَ', 2, 42),
  ('أَكۡثَرَ ٱلنَّاسِ', 2, 43),
  ('ٱلسَّمِيعُ ٱلۡعَلِيمُ', 2, 44),
  ('أَصۡحَـٰبُ ٱلنَّارِ', 2, 45),
  ('أَهۡلِ ٱلۡكِتَـٰبِ', 2, 46),
  ('ٱلۡفَوۡزُ ٱلۡعَظِيمُ', 2, 47),
  ('بِذَاتِ ٱلصُّدُورِ', 2, 48),
  ('شَدِيدُ ٱلۡعِقَابِ', 2, 49),
  ('ٱلۡمَسۡجِدِ ٱلۡحَرَامِ', 2, 50),
  ('مُوسَى ٱلۡكِتَـٰبَ', 2, 51),
  ('مِمَّنِ ٱفۡتَرَىٰ', 2, 52),
  ('بِغَيۡرِ ٱلۡحَقِّ', 2, 53),
  ('أَسَـٰطِيرُ ٱلۡأَوَّلِينَ', 2, 54),
  ('وَبِئۡسَ ٱلۡمَصِيرُ', 2, 55),
  ('يَبۡسُطُ ٱلرِّزۡقَ', 2, 56),
  ('سَرِيعُ ٱلۡحِسَابِ', 2, 57),
  ('ٱلۡبَلَـٰغُ ٱلۡمُبِينُ', 2, 58),
  ('إِلَى ٱلنُّورِ', 2, 59),
  ('لَكُمُ ٱلۡـَٔايَـٰتِ', 2, 60)
  ) as w(word, level, order_index);
end $$;
