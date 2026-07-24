-- ============================================================================
--  Subscription renewal dates — bulk set for all current students
--  Run in Supabase → SQL Editor.  Written 24 Jul 2026.
--
--  Renewals repeat every 28 days from the date stored here, and the tutor is
--  reminded 1 day before each one. All dates below are the NEXT upcoming
--  renewal, so the first reminder lands the day before each.
--
--  RUN THE STEPS IN ORDER. Step 1 and 2 change nothing — they let you confirm
--  the names match before Step 3 writes anything.
-- ============================================================================

-- ── STEP 0 ── Arabic students need a column that doesn't exist yet ──────────
ALTER TABLE arabic_students
  ADD COLUMN IF NOT EXISTS subscription_renewal_date date;


-- ── The data ────────────────────────────────────────────────────────────────
-- Kept in temp tables so the preview and the update use exactly one source.
DROP TABLE IF EXISTS _quran_renewals;
CREATE TEMP TABLE _quran_renewals (name text, renews date);
INSERT INTO _quran_renewals (name, renews) VALUES
  ('Idrees',           '2026-07-26'),
  ('Ibrahim',          '2026-07-29'),
  ('Uthman',           '2026-07-30'),
  ('Ihsan',            '2026-07-31'),
  ('Ali Ishaq',        '2026-08-01'),
  ('Abdullah Jaafar',  '2026-08-01'),
  ('Jawaad',           '2026-08-01'),
  ('Morad',            '2026-08-02'),
  ('Liyana',           '2026-08-02'),
  ('Naba',             '2026-08-03'),
  ('Lander',           '2026-08-06'),
  ('Najib',            '2026-08-07'),
  ('Adam',             '2026-08-09'),
  ('Idrees Snober',    '2026-08-09'),
  ('Asim',             '2026-08-10'),
  ('Nihaal',           '2026-08-11'),
  ('Yusuf Dawood',     '2026-08-14'),
  ('Sireen',           '2026-08-16'),
  ('Sulaiman ishaq',   '2026-08-16'),
  ('Taha',             '2026-08-17'),
  ('Ameer Jaafar',     '2026-08-18'),
  ('Zakaria',          '2026-08-18'),
  ('Adnan',            '2026-08-19'),
  ('Mustafa',          '2026-08-20'),
  ('Ali Hammaamy',     '2026-08-25');

DROP TABLE IF EXISTS _arabic_renewals;
CREATE TEMP TABLE _arabic_renewals (name text, renews date);
INSERT INTO _arabic_renewals (name, renews) VALUES
  -- ⚠ 'veiga' matches NO arabic student. The 11 on the platform are:
  --   Aleyna, Ameer, Aubrey, Bilkis, Brandon, Liyana, Mark, Nathan,
  --   Safi Abdullah, Sena, Uxio.
  -- 'Uxio' is the likely one (Uxío Veiga) but NOT assumed here. If that's
  -- right, comment the 'veiga' line out and uncomment the 'Uxio' line.
  ('veiga',   '2026-07-27'),
--('Uxio',    '2026-07-27'),
  ('Nathan',  '2026-08-19'),   -- verified: exists
  ('Aubrey',  '2026-08-17'),   -- verified: exists
  ('Mark',    '2026-08-08');   -- verified: exists


-- ── STEP 1 ── PREVIEW (read-only): how many students match each name? ───────
--  Check this before Step 3.
--    matches = 1  → will be updated
--    matches = 0  → NAME NOT FOUND: the platform spells it differently
--    matches > 1  → AMBIGUOUS: two students share the name; fix by hand
SELECT 'quran' AS list, r.name, r.renews,
       count(s.id) AS matches,
       string_agg(s.name || ' [' || left(s.id::text, 8) || ']', ' | ') AS matched_students
FROM _quran_renewals r
LEFT JOIN students s ON lower(btrim(s.name)) = lower(btrim(r.name))
GROUP BY r.name, r.renews
UNION ALL
SELECT 'arabic', r.name, r.renews,
       count(a.id),
       string_agg(a.name || ' [' || left(a.id::text, 8) || ']', ' | ')
FROM _arabic_renewals r
LEFT JOIN arabic_students a ON lower(btrim(a.name)) = lower(btrim(r.name))
GROUP BY r.name, r.renews
ORDER BY matches, renews;


-- ── STEP 2 ── PREVIEW (read-only): students NOT in the lists above ──────────
--  Anyone here keeps whatever date they already had. Confirm that's intended.
SELECT 'quran' AS list, s.name, s.subscription_renewal_date AS current_date_kept
FROM students s
WHERE lower(btrim(s.name)) NOT IN (SELECT lower(btrim(name)) FROM _quran_renewals)
UNION ALL
SELECT 'arabic', a.name, a.subscription_renewal_date
FROM arabic_students a
WHERE lower(btrim(a.name)) NOT IN (SELECT lower(btrim(name)) FROM _arabic_renewals)
ORDER BY list, name;


-- ── STEP 3 ── APPLY. Only run once Step 1 shows matches = 1 on every row. ───
--  Also forces student_type = 'preply', because the renewal field only shows
--  in the UI (and only fires reminders) for Preply students.
BEGIN;

UPDATE students s
   SET subscription_renewal_date = r.renews,
       student_type = 'preply'
  FROM _quran_renewals r
 WHERE lower(btrim(s.name)) = lower(btrim(r.name));

UPDATE arabic_students a
   SET subscription_renewal_date = r.renews,
       student_type = 'preply'
  FROM _arabic_renewals r
 WHERE lower(btrim(a.name)) = lower(btrim(r.name));

-- Final check inside the transaction — every row should show a date.
SELECT 'quran' AS list, s.name, s.subscription_renewal_date
FROM students s
WHERE lower(btrim(s.name)) IN (SELECT lower(btrim(name)) FROM _quran_renewals)
UNION ALL
SELECT 'arabic', a.name, a.subscription_renewal_date
FROM arabic_students a
WHERE lower(btrim(a.name)) IN (SELECT lower(btrim(name)) FROM _arabic_renewals)
ORDER BY subscription_renewal_date, name;

COMMIT;   -- ← change to ROLLBACK; if the check above looks wrong
