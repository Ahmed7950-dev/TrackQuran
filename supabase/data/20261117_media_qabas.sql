-- The Qabas Anime channel (youtube.com/@qabasanime/videos) on the Media shelf:
-- its 30 videos, no shorts, titled "QABAS : <name>". Newest upload first on
-- the shelf, as on the channel. Safe to run twice (a link already on the
-- shelf is skipped).
-- Run: supabase db query --linked -f supabase/data/20261117_media_qabas.sql

insert into public.media_items (teacher_id, category_id, title, kind, youtube_id, url, created_at)
select 'b5d65c07-a511-48e7-8f38-abc781819795'::uuid, null, v.title, 'video', v.id,
       'https://www.youtube.com/watch?v=' || v.id,
       now() - make_interval(secs => v.ord)
from (values
  ('swmRrNm89ww', 'QABAS : Those Who Demanded to See Allah', 0),
  ('SzQ2tGf_oMI', 'QABAS : Cain and Abel', 1),
  ('2A-dgdDH0jc', 'QABAS : Dhul-Qarnayn and the Wall', 2),
  ('O9DGeOwQ_TM', 'QABAS : The Man Who Died for 100 Years', 3),
  ('rA99MmMYZZY', 'QABAS : The Race of Abu Bakr and Umar', 4),
  ('XETg6vJ7qGY', 'QABAS : Ibrahim and the Fire', 5),
  ('5raJU6cjRMU', 'QABAS : The Lamp That Went Out', 6),
  ('WWhw0BZH4lA', 'QABAS : The Army of the Elephant', 7),
  ('lI00VGPhldU', 'QABAS : Prophet Isa (Jesus)', 8),
  ('vgt1DrtXzLI', 'QABAS : Musa and al-Khidr', 9),
  ('aQLZxzLN7ZQ', 'QABAS : The Thief Who Taught a Verse', 10),
  ('UlD9A1OrzUA', 'QABAS : Gog and Magog', 11),
  ('ML9YcAs4S00', 'QABAS : The Captive Chief', 12),
  ('15wkuJf18pM', 'QABAS : Pharaoh''s Magicians', 13),
  ('hSyq_dJ6juQ', 'QABAS : The Sabbath Trap', 14),
  ('OmQl-_Et78w', 'QABAS : The Worshipper and the Sinner', 15),
  ('xwmW9J_39oI', 'QABAS : The Jar of Gold', 16),
  ('I0tInZyQmgc', 'QABAS : The People of the Cave', 17),
  ('Ya99N4Pgfus', 'QABAS : The Mother Who Lost Her Child', 18),
  ('TR4AHQlk_VI', 'QABAS : The Man Who Killed 99', 19),
  ('cIbvaDVy7AY', 'QABAS : Prophet Yusuf (Joseph)', 20),
  ('zeRp7TdzKVw', 'QABAS : The 1,000 Dinar Loan', 21),
  ('_o4yFlJ1h74', 'QABAS : The King and the Grateful Minister', 22),
  ('ueCx4Kd3shU', 'QABAS : The Hadith of Jibril', 23),
  ('SyGA5e0zi8M', 'QABAS : Juraij and His Mother', 24),
  ('194WA-dq7ww', 'QABAS : The Boy and the King', 25),
  ('WPJEoDLD86A', 'QABAS : Charity on Three Nights', 26),
  ('lSryj49Bm-o', 'QABAS : The Cow That Exposed a Killer', 27),
  ('vSg16ppI4tw', 'QABAS : Three Men Trapped in a Cave', 28),
  ('DGDfXKlvDZ4', 'QABAS : The Leper, the Bald and the Blind', 29)
) as v(id, title, ord)
on conflict (teacher_id, kind, youtube_id) do nothing;
