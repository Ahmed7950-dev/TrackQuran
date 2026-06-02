-- ─── Qaedah Nooraniyya Tables ────────────────────────────────────────────────
-- Run this in the Supabase SQL Editor

-- Topics table
create table if not exists public.qaedah_topics (
  id           uuid primary key default gen_random_uuid(),
  title_en     text not null,
  title_ar     text,
  order_index  integer not null default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Words table (belongs to a topic, cascades on delete)
create table if not exists public.qaedah_words (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.qaedah_topics(id) on delete cascade,
  word         text not null,
  order_index  integer not null default 0,
  created_at   timestamptz default now()
);

-- Indexes for fast lookups
create index if not exists qaedah_words_topic_id_idx on public.qaedah_words(topic_id);
create index if not exists qaedah_topics_order_idx   on public.qaedah_topics(order_index);

-- Row Level Security
alter table public.qaedah_topics enable row level security;
alter table public.qaedah_words   enable row level security;

-- Public read (everyone can see lessons)
create policy "qaedah_topics_public_read" on public.qaedah_topics
  for select to anon, authenticated using (true);

create policy "qaedah_words_public_read" on public.qaedah_words
  for select to anon, authenticated using (true);

-- Authenticated write (admin only in practice)
create policy "qaedah_topics_auth_write" on public.qaedah_topics
  for all to authenticated using (true) with check (true);

create policy "qaedah_words_auth_write" on public.qaedah_words
  for all to authenticated using (true) with check (true);


-- ─── Seed: Initial 10 Topics + Words ─────────────────────────────────────────
-- Uses Quranic sukoon ۡ (U+06E1), not the regular circle ْ (U+0652)

do $$
declare
  t1  uuid; t2  uuid; t3  uuid; t4  uuid; t5  uuid;
  t6  uuid; t7  uuid; t8  uuid; t9  uuid; t10 uuid;
begin

-- Insert topics
insert into public.qaedah_topics (id, title_en, title_ar, order_index) values
  (gen_random_uuid(), 'Short Vowels: Fatha',            'الحركات القصيرة: الفتحة',   1),
  (gen_random_uuid(), 'Short Vowels: Kasrah',           'الحركات القصيرة: الكسرة',   2),
  (gen_random_uuid(), 'Short Vowels: Dammah',           'الحركات القصيرة: الضمة',    3),
  (gen_random_uuid(), 'Madd: Alif and small Alif',      'المد: الألف والألف الصغيرة', 4),
  (gen_random_uuid(), 'Madd: Yaa and small Yaa',        'المد: الياء والياء الصغيرة', 5),
  (gen_random_uuid(), 'Madd: Waw and small Waw',        'المد: الواو والواو الصغيرة', 6),
  (gen_random_uuid(), 'Sukoon',                         'السكون',                    7),
  (gen_random_uuid(), 'Tanween',                        'التنوين',                   8),
  (gen_random_uuid(), 'Shaddah',                        'الشدة',                     9),
  (gen_random_uuid(), 'Hamzatul-Wasl',                  'همزة الوصل',               10);

-- Re-select IDs by order
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

-- Topic 1: Short Vowels - Fatha (single letters with fatha)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t1, 'بَ',  1),(t1, 'تَ',  2),(t1, 'ثَ',  3),(t1, 'جَ',  4),(t1, 'حَ',  5),
  (t1, 'خَ',  6),(t1, 'دَ',  7),(t1, 'ذَ',  8),(t1, 'رَ',  9),(t1, 'زَ', 10),
  (t1, 'سَ', 11),(t1, 'شَ', 12),(t1, 'صَ', 13),(t1, 'ضَ', 14),(t1, 'طَ', 15),
  (t1, 'ظَ', 16),(t1, 'عَ', 17),(t1, 'غَ', 18),(t1, 'فَ', 19),(t1, 'قَ', 20),
  (t1, 'كَ', 21),(t1, 'لَ', 22),(t1, 'مَ', 23),(t1, 'نَ', 24),(t1, 'هَ', 25),
  (t1, 'وَ', 26),(t1, 'يَ', 27),(t1, 'أَ', 28);

-- Topic 2: Short Vowels - Kasrah (single letters with kasra)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t2, 'بِ',  1),(t2, 'تِ',  2),(t2, 'ثِ',  3),(t2, 'جِ',  4),(t2, 'حِ',  5),
  (t2, 'خِ',  6),(t2, 'دِ',  7),(t2, 'ذِ',  8),(t2, 'رِ',  9),(t2, 'زِ', 10),
  (t2, 'سِ', 11),(t2, 'شِ', 12),(t2, 'صِ', 13),(t2, 'ضِ', 14),(t2, 'طِ', 15),
  (t2, 'ظِ', 16),(t2, 'عِ', 17),(t2, 'غِ', 18),(t2, 'فِ', 19),(t2, 'قِ', 20),
  (t2, 'كِ', 21),(t2, 'لِ', 22),(t2, 'مِ', 23),(t2, 'نِ', 24),(t2, 'هِ', 25),
  (t2, 'وِ', 26),(t2, 'يِ', 27),(t2, 'إِ', 28);

-- Topic 3: Short Vowels - Dammah (single letters with damma)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t3, 'بُ',  1),(t3, 'تُ',  2),(t3, 'ثُ',  3),(t3, 'جُ',  4),(t3, 'حُ',  5),
  (t3, 'خُ',  6),(t3, 'دُ',  7),(t3, 'ذُ',  8),(t3, 'رُ',  9),(t3, 'زُ', 10),
  (t3, 'سُ', 11),(t3, 'شُ', 12),(t3, 'صُ', 13),(t3, 'ضُ', 14),(t3, 'طُ', 15),
  (t3, 'ظُ', 16),(t3, 'عُ', 17),(t3, 'غُ', 18),(t3, 'فُ', 19),(t3, 'قُ', 20),
  (t3, 'كُ', 21),(t3, 'لُ', 22),(t3, 'مُ', 23),(t3, 'نُ', 24),(t3, 'هُ', 25),
  (t3, 'وُ', 26),(t3, 'يُ', 27);

-- Topic 4: Madd Alif (letter + fatha + alef = long ā)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t4, 'بَا',  1),(t4, 'تَا',  2),(t4, 'ثَا',  3),(t4, 'جَا',  4),(t4, 'حَا',  5),
  (t4, 'خَا',  6),(t4, 'دَا',  7),(t4, 'ذَا',  8),(t4, 'رَا',  9),(t4, 'زَا', 10),
  (t4, 'سَا', 11),(t4, 'شَا', 12),(t4, 'صَا', 13),(t4, 'ضَا', 14),(t4, 'طَا', 15),
  (t4, 'ظَا', 16),(t4, 'عَا', 17),(t4, 'غَا', 18),(t4, 'فَا', 19),(t4, 'قَا', 20),
  (t4, 'كَا', 21),(t4, 'لَا', 22),(t4, 'مَا', 23),(t4, 'نَا', 24),(t4, 'هَا', 25),
  (t4, 'وَا', 26),(t4, 'يَا', 27);

-- Topic 5: Madd Yaa (letter + kasra + yaa = long ī)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t5, 'بِي',  1),(t5, 'تِي',  2),(t5, 'ثِي',  3),(t5, 'جِي',  4),(t5, 'حِي',  5),
  (t5, 'خِي',  6),(t5, 'دِي',  7),(t5, 'ذِي',  8),(t5, 'رِي',  9),(t5, 'زِي', 10),
  (t5, 'سِي', 11),(t5, 'شِي', 12),(t5, 'صِي', 13),(t5, 'ضِي', 14),(t5, 'طِي', 15),
  (t5, 'ظِي', 16),(t5, 'عِي', 17),(t5, 'غِي', 18),(t5, 'فِي', 19),(t5, 'قِي', 20),
  (t5, 'كِي', 21),(t5, 'لِي', 22),(t5, 'مِي', 23),(t5, 'نِي', 24),(t5, 'هِي', 25),
  (t5, 'وِي', 26),(t5, 'يِي', 27);

-- Topic 6: Madd Waw (letter + damma + waw = long ū)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t6, 'بُو',  1),(t6, 'تُو',  2),(t6, 'ثُو',  3),(t6, 'جُو',  4),(t6, 'حُو',  5),
  (t6, 'خُو',  6),(t6, 'دُو',  7),(t6, 'ذُو',  8),(t6, 'رُو',  9),(t6, 'زُو', 10),
  (t6, 'سُو', 11),(t6, 'شُو', 12),(t6, 'صُو', 13),(t6, 'ضُو', 14),(t6, 'طُو', 15),
  (t6, 'ظُو', 16),(t6, 'عُو', 17),(t6, 'غُو', 18),(t6, 'فُو', 19),(t6, 'قُو', 20),
  (t6, 'كُو', 21),(t6, 'لُو', 22),(t6, 'مُو', 23),(t6, 'نُو', 24),(t6, 'هُو', 25),
  (t6, 'وُو', 26),(t6, 'يُو', 27);

-- Topic 7: Sukoon — closed syllables using Quranic sukoon ۡ (U+06E1)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t7, 'بَبۡ',  1),(t7, 'بِبۡ',  2),(t7, 'بُبۡ',  3),
  (t7, 'تَبۡ',  4),(t7, 'تِبۡ',  5),(t7, 'تُبۡ',  6),
  (t7, 'ثَبۡ',  7),(t7, 'ثِبۡ',  8),(t7, 'ثُبۡ',  9),
  (t7, 'جَبۡ', 10),(t7, 'جِبۡ', 11),(t7, 'جُبۡ', 12),
  (t7, 'حَبۡ', 13),(t7, 'حِبۡ', 14),(t7, 'حُبۡ', 15),
  (t7, 'خَبۡ', 16),(t7, 'خِبۡ', 17),(t7, 'خُبۡ', 18),
  (t7, 'دَبۡ', 19),(t7, 'ذَبۡ', 20),(t7, 'رَبۡ', 21),
  (t7, 'زَبۡ', 22),(t7, 'سَبۡ', 23),(t7, 'شَبۡ', 24),
  (t7, 'صَبۡ', 25),(t7, 'ضَبۡ', 26),(t7, 'طَبۡ', 27),
  (t7, 'ظَبۡ', 28),(t7, 'عَبۡ', 29),(t7, 'غَبۡ', 30);

-- Topic 8: Tanween (all three: fath/kasr/damm with nunation)
insert into public.qaedah_words (topic_id, word, order_index) values
  -- Tanwin fath (بًا form)
  (t8, 'بًا',  1),(t8, 'تًا',  2),(t8, 'ثًا',  3),(t8, 'جًا',  4),(t8, 'حًا',  5),
  (t8, 'خًا',  6),(t8, 'دًا',  7),(t8, 'ذًا',  8),(t8, 'رًا',  9),(t8, 'زًا', 10),
  -- Tanwin kasr (بٍ form)
  (t8, 'بٍ', 11),(t8, 'تٍ', 12),(t8, 'ثٍ', 13),(t8, 'جٍ', 14),(t8, 'حٍ', 15),
  (t8, 'خٍ', 16),(t8, 'سٍ', 17),(t8, 'شٍ', 18),(t8, 'صٍ', 19),(t8, 'ضٍ', 20),
  -- Tanwin damm (بٌ form)
  (t8, 'بٌ', 21),(t8, 'تٌ', 22),(t8, 'ثٌ', 23),(t8, 'جٌ', 24),(t8, 'حٌ', 25),
  (t8, 'خٌ', 26),(t8, 'سٌ', 27),(t8, 'شٌ', 28),(t8, 'صٌ', 29),(t8, 'ضٌ', 30);

-- Topic 9: Shaddah (letter with shaddah + all three harakat)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t9, 'بَّ',  1),(t9, 'بِّ',  2),(t9, 'بُّ',  3),
  (t9, 'تَّ',  4),(t9, 'تِّ',  5),(t9, 'تُّ',  6),
  (t9, 'ثَّ',  7),(t9, 'ثِّ',  8),(t9, 'ثُّ',  9),
  (t9, 'جَّ', 10),(t9, 'جِّ', 11),(t9, 'جُّ', 12),
  (t9, 'حَّ', 13),(t9, 'حِّ', 14),(t9, 'حُّ', 15),
  (t9, 'خَّ', 16),(t9, 'خِّ', 17),(t9, 'خُّ', 18),
  (t9, 'دَّ', 19),(t9, 'دِّ', 20),(t9, 'دُّ', 21),
  (t9, 'ذَّ', 22),(t9, 'رَّ', 23),(t9, 'رِّ', 24),
  (t9, 'زَّ', 25),(t9, 'سَّ', 26),(t9, 'سِّ', 27),
  (t9, 'شَّ', 28),(t9, 'شِّ', 29),(t9, 'شُّ', 30);

-- Topic 10: Hamzatul-Wasl — ٱلـ prefix with each letter + standalone wasl words
-- ٱ = U+0671 (ARABIC LETTER ALEF WASLA), ۡ = U+06E1 (Quranic sukoon)
insert into public.qaedah_words (topic_id, word, order_index) values
  (t10, 'ٱلۡبَ',  1),(t10, 'ٱلۡتَ',  2),(t10, 'ٱلۡثَ',  3),(t10, 'ٱلۡجَ',  4),
  (t10, 'ٱلۡحَ',  5),(t10, 'ٱلۡخَ',  6),(t10, 'ٱلۡدَ',  7),(t10, 'ٱلۡذَ',  8),
  (t10, 'ٱلۡرَ',  9),(t10, 'ٱلۡزَ', 10),(t10, 'ٱلۡسَ', 11),(t10, 'ٱلۡشَ', 12),
  (t10, 'ٱلۡصَ', 13),(t10, 'ٱلۡضَ', 14),(t10, 'ٱلۡطَ', 15),(t10, 'ٱلۡظَ', 16),
  (t10, 'ٱلۡعَ', 17),(t10, 'ٱلۡغَ', 18),(t10, 'ٱلۡفَ', 19),(t10, 'ٱلۡقَ', 20),
  (t10, 'ٱلۡكَ', 21),(t10, 'ٱلۡلَ', 22),(t10, 'ٱلۡمَ', 23),(t10, 'ٱلۡنَ', 24),
  (t10, 'ٱلۡهَ', 25),(t10, 'ٱلۡوَ', 26),(t10, 'ٱلۡيَ', 27),
  -- Standalone wasl words
  (t10, 'ٱبۡنٌ', 28),(t10, 'ٱسۡمٌ', 29),(t10, 'ٱمۡرَأَةٌ', 30);

end $$;
