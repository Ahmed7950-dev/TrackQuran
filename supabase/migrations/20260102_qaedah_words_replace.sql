-- ─── Replace Qaedah syllables with complete Arabic words ─────────────────────
-- Run this in the Supabase SQL Editor.
-- It wipes the old syllable entries and inserts real words for each topic.

delete from public.qaedah_words;

do $$
declare
  t1  uuid; t2  uuid; t3  uuid; t4  uuid; t5  uuid;
  t6  uuid; t7  uuid; t8  uuid; t9  uuid; t10 uuid;
begin
  select id into t1  from public.qaedah_topics where order_index = 1;
  select id into t2  from public.qaedah_topics where order_index = 2;
  select id into t3  from public.qaedah_topics where order_index = 3;
  select id into t4  from public.qaedah_topics where order_index = 4;
  select id into t5  from public.qaedah_topics where order_index = 5;
  select id into t6  from public.qaedah_topics where order_index = 6;
  select id into t7  from public.qaedah_topics where order_index = 7;
  select id into t8  from public.qaedah_topics where order_index = 8;
  select id into t9  from public.qaedah_topics where order_index = 9;
  select id into t10 from public.qaedah_topics where order_index = 10;

  -- ── Topic 1: Short Vowels – Fatha ────────────────────────────────────────────
  -- فَعَلَ pattern: every letter carries fatha — pure short-'a' drilling
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t1,'كَتَبَ', 1),(t1,'فَتَحَ', 2),(t1,'ذَهَبَ', 3),(t1,'نَصَرَ', 4),(t1,'ضَرَبَ', 5),
    (t1,'أَكَلَ', 6),(t1,'دَخَلَ', 7),(t1,'خَرَجَ', 8),(t1,'نَزَلَ', 9),(t1,'جَعَلَ',10),
    (t1,'وَجَدَ',11),(t1,'بَعَثَ',12),(t1,'خَلَقَ',13),(t1,'سَأَلَ',14),(t1,'وَلَدَ',15),
    (t1,'عَبَدَ',16),(t1,'حَمَدَ',17),(t1,'ذَكَرَ',18),(t1,'رَفَعَ',19),(t1,'شَكَرَ',20);

  -- ── Topic 2: Short Vowels – Kasrah ───────────────────────────────────────────
  -- فَعِلَ pattern: kasra on the middle letter — short-'i' drilling
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t2,'عَلِمَ', 1),(t2,'سَمِعَ', 2),(t2,'شَرِبَ', 3),(t2,'فَهِمَ', 4),(t2,'رَحِمَ', 5),
    (t2,'شَهِدَ', 6),(t2,'غَضِبَ', 7),(t2,'كَسِبَ', 8),(t2,'وَرِثَ', 9),(t2,'حَفِظَ',10),
    (t2,'فَرِحَ',11),(t2,'كَرِهَ',12),(t2,'حَمِلَ',13),(t2,'لَعِبَ',14),(t2,'رَكِبَ',15),
    (t2,'جَلِسَ',16),(t2,'حَسِبَ',17),(t2,'لَبِسَ',18),(t2,'رَضِيَ',19),(t2,'بَخِلَ',20);

  -- ── Topic 3: Short Vowels – Dammah ───────────────────────────────────────────
  -- فَعُلَ pattern: damma on the middle letter — short-'u' drilling
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t3,'كَرُمَ', 1),(t3,'شَرُفَ', 2),(t3,'حَسُنَ', 3),(t3,'كَبُرَ', 4),(t3,'صَغُرَ', 5),
    (t3,'قَرُبَ', 6),(t3,'بَعُدَ', 7),(t3,'عَظُمَ', 8),(t3,'كَثُرَ', 9),(t3,'لَطُفَ',10),
    (t3,'قَدُمَ',11),(t3,'طَهُرَ',12),(t3,'صَعُبَ',13),(t3,'جَهُلَ',14),(t3,'ظَرُفَ',15),
    (t3,'خَشُنَ',16),(t3,'عَدُلَ',17),(t3,'حَمُضَ',18),(t3,'مَلُحَ',19),(t3,'ثَقُلَ',20);

  -- ── Topic 4: Madd – Alif (long ā) ────────────────────────────────────────────
  -- Common Quranic verbs containing fatha + alif madd
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t4,'قَالَ', 1),(t4,'كَانَ', 2),(t4,'جَاءَ', 3),(t4,'نَامَ', 4),(t4,'صَامَ', 5),
    (t4,'سَارَ', 6),(t4,'مَاتَ', 7),(t4,'قَامَ', 8),(t4,'زَادَ', 9),(t4,'صَارَ',10),
    (t4,'بَاعَ',11),(t4,'رَاحَ',12),(t4,'تَابَ',13),(t4,'طَالَ',14),(t4,'نَالَ',15),
    (t4,'فَازَ',16),(t4,'شَاءَ',17),(t4,'عَادَ',18),(t4,'خَافَ',19),(t4,'سَادَ',20);

  -- ── Topic 5: Madd – Yaa (long ī) ─────────────────────────────────────────────
  -- فَعِيلٌ adjectives — the most common Divine-name pattern in the Quran
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t5,'كَبِيرٌ', 1),(t5,'صَغِيرٌ', 2),(t5,'خَبِيرٌ', 3),(t5,'بَصِيرٌ', 4),(t5,'قَدِيرٌ', 5),
    (t5,'عَلِيمٌ', 6),(t5,'حَكِيمٌ', 7),(t5,'رَحِيمٌ', 8),(t5,'كَرِيمٌ', 9),(t5,'عَظِيمٌ',10),
    (t5,'سَمِيعٌ',11),(t5,'جَمِيلٌ',12),(t5,'لَطِيفٌ',13),(t5,'قَرِيبٌ',14),(t5,'بَعِيدٌ',15),
    (t5,'مُنِيرٌ',16),(t5,'بَشِيرٌ',17),(t5,'نَذِيرٌ',18),(t5,'حَبِيبٌ',19),(t5,'أَمِيرٌ',20);

  -- ── Topic 6: Madd – Waw (long ū) ─────────────────────────────────────────────
  -- Words containing damma + waw madd (Prophet names, Quranic nouns, sound plurals)
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t6,'نُورٌ',   1),(t6,'رُوحٌ',   2),(t6,'صُورَةٌ', 3),(t6,'سُورَةٌ', 4),(t6,'يُوسُفُ', 5),
    (t6,'نُوحٌ',   6),(t6,'لُوطٌ',   7),(t6,'هُودٌ',   8),(t6,'كُوثَرٌ', 9),(t6,'قُلُوبٌ',10),
    (t6,'عُيُونٌ',11),(t6,'بُيُوتٌ',12),(t6,'جُنُودٌ',13),(t6,'عُلُومٌ',14),(t6,'حُدُودٌ',15),
    (t6,'شُهُودٌ',16),(t6,'صُفُوفٌ',17),(t6,'فُرُوعٌ',18),(t6,'طُوبَى', 19),(t6,'قُوَّةٌ', 20);

  -- ── Topic 7: Sukoon ───────────────────────────────────────────────────────────
  -- Common nouns with a prominent closed syllable; sukoon marked with ۡ (U+06E1)
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t7,'قَلۡبٌ', 1),(t7,'نَفۡسٌ', 2),(t7,'أَرۡضٌ', 3),(t7,'عِلۡمٌ', 4),(t7,'بَحۡرٌ', 5),
    (t7,'شَمۡسٌ', 6),(t7,'نَهۡرٌ', 7),(t7,'مَلۡكٌ', 8),(t7,'وَقۡتٌ', 9),(t7,'صَبۡرٌ',10),
    (t7,'بَيۡتٌ',11),(t7,'عَيۡنٌ',12),(t7,'خَيۡرٌ',13),(t7,'لَيۡلٌ',14),(t7,'يَوۡمٌ',15),
    (t7,'كَوۡنٌ',16),(t7,'فَوۡزٌ',17),(t7,'حَرۡفٌ',18),(t7,'شَعۡبٌ',19),(t7,'جَمۡعٌ',20);

  -- ── Topic 8: Tanween ─────────────────────────────────────────────────────────
  -- Common nouns with all three tanween forms (ٌ ً ٍ) for varied practice
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t8,'رَجُلٌ',    1),(t8,'كِتَابٌ',   2),(t8,'وَلَدٌ',    3),(t8,'مَكَانٌ',   4),(t8,'زَمَانٌ',   5),
    (t8,'إِنۡسَانٌ', 6),(t8,'نِعۡمَةٌ',  7),(t8,'حِكۡمَةٌ',  8),(t8,'مَدِينَةٌ', 9),(t8,'جَنَّةٌ',  10),
    (t8,'سَمَاءٌ',  11),(t8,'بَلَدٌ',   12),(t8,'جَبَلٌ',   13),(t8,'شَجَرَةٌ', 14),(t8,'قَمَرٌ',   15),
    (t8,'رِيحٌ',    16),(t8,'نَهۡرًا',  17),(t8,'كِتَابًا', 18),(t8,'رَجُلًا',  19),(t8,'بَلَدًا',  20);

  -- ── Topic 9: Shaddah ─────────────────────────────────────────────────────────
  -- Words with shaddah (geminated consonant): nouns, Divine name, فَعَّلَ verbs
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t9,'رَبٌّ',   1),(t9,'حَقٌّ',   2),(t9,'جَنَّةٌ', 3),(t9,'مَكَّةُ', 4),(t9,'اللَّهُ', 5),
    (t9,'إِنَّ',   6),(t9,'أَنَّ',   7),(t9,'عَلَّمَ', 8),(t9,'نَزَّلَ', 9),(t9,'بَيَّنَ',10),
    (t9,'كَرَّمَ',11),(t9,'قَدَّرَ',12),(t9,'حَذَّرَ',13),(t9,'بَشَّرَ',14),(t9,'صَدَّقَ',15),
    (t9,'كَذَّبَ',16),(t9,'فَصَّلَ',17),(t9,'قَوَّمَ',18),(t9,'ظَنَّ',  19),(t9,'مَدَّ',  20);

  -- ── Topic 10: Hamzatul-Wasl ───────────────────────────────────────────────────
  -- Words beginning with ٱ (U+0671 ARABIC LETTER ALEF WASLA)
  -- Includes: common nouns, imperative verbs, and al- definite-article forms
  insert into public.qaedah_words (topic_id, word, order_index) values
    (t10,'ٱسۡمٌ',        1),(t10,'ٱبۡنٌ',        2),(t10,'ٱبۡنَةٌ',      3),(t10,'ٱثۡنَانِ',     4),
    (t10,'ٱنطَلَقَ',     5),(t10,'ٱقۡرَأۡ',      6),(t10,'ٱكۡتُبۡ',      7),(t10,'ٱدۡخُلۡ',      8),
    (t10,'ٱلۡبَيۡتُ',   9),(t10,'ٱلۡكِتَابُ',  10),(t10,'ٱلۡعِلۡمُ',   11),(t10,'ٱلۡقُرۡآنُ',   12),
    (t10,'ٱلرَّحۡمَانُ',13),(t10,'ٱلرَّحِيمُ',  14),(t10,'ٱفۡعَلۡ',     15),(t10,'ٱنظُرۡ',      16),
    (t10,'ٱسۡمَعۡ',     17),(t10,'ٱبۡدَأۡ',     18),(t10,'ٱسۡتَغۡفِرۡ', 19),(t10,'ٱعۡلَمۡ',     20);

end $$;
