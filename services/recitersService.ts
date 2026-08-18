// ─── Recitation sources for the student portal's tap-to-listen ───────────────
// Three kinds of source:
//   perAyah    — one mp3 per ayah (islamic.network CDN, global-ayah numbering).
//                Tap a verse → that verse plays; taps chain ayah-to-ayah.
//   timedSurah — one mp3 per surah PLUS mp3quran's ayat-timing table: playback
//                seeks to the tapped verse and an rAF watcher stops (or walks
//                the highlight) at verse boundaries. Only offered where the
//                timing table measured accurate against the audio.
//   fullSurah  — one mp3 per surah, played whole. Any tap in the surah starts
//                it from the beginning; tapping again stops.
//
// Timing accuracy is PER READ and must be measured before trusting it (distance
// from each cut to the nearest real silence gap, checked 2026-08-11):
//   bin Humaid (read 137): cuts 700–1000ms off → tutor rejected by ear → fullSurah.
//   Al-Dukhain (read 273): cuts 40–340ms, consistently ~150ms LATE → timedSurah,
//     with CUT_EARLY_MS pulling every boundary forward to compensate.
//   Al-Nufais  (read 259): mixed, and he chains verses with no pause in places,
//     so seek cuts would land mid-melody → fullSurah by the tutor's choice.

export type ReciterKey = 'minshawi' | 'dukhain' | 'salimi' | 'dussary' | 'qatami' | 'abbad' | 'juhany' | 'binhumaid' | 'nufais' | 'qurafi' | 'ustadh';

export interface Reciter {
  key: ReciterKey;
  name: string;
  nameAr: string;
  mode: 'perAyah' | 'timedSurah' | 'fullSurah';
  /** everyayah.com folder — set on perAyah reciters served from there. */
  everyayah?: string;
  /** timedSurah mode: which mp3quran ayat-timing read to use, where the surah
   *  files live, and how far to pull every cut forward (measured per read). */
  timing?: { read: number; folder: string; cutEarlyMs: number };
}

export const RECITERS: Reciter[] = [
  { key: 'minshawi',  name: 'Al-Minshawi',        nameAr: 'المنشاوي',          mode: 'perAyah' },
  // everyayah.com per-ayah sets — all four verified complete (the final ayah
  // of all 114 surahs resolves), CORS-open and range-capable, 2026-08-14.
  { key: 'dussary',   name: 'Yasser Ad-Dussary',  nameAr: 'ياسر الدوسري',      mode: 'perAyah', everyayah: 'Yasser_Ad-Dussary_128kbps' },
  { key: 'qatami',    name: 'Nasser Al-Qatami',   nameAr: 'ناصر القطامي',      mode: 'perAyah', everyayah: 'Nasser_Alqatami_128kbps' },
  { key: 'abbad',     name: 'Fares Abbad',        nameAr: 'فارس عباد',         mode: 'perAyah', everyayah: 'Fares_Abbad_64kbps' },
  { key: 'juhany',    name: 'Abdullah Al-Juhany', nameAr: 'عبد الله الجهني',   mode: 'perAyah', everyayah: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps' },
  { key: 'dukhain',   name: 'Haitham Al-Dukhain', nameAr: 'هيثم الدخين',       mode: 'timedSurah',
    timing: { read: 273, folder: 'https://server16.mp3quran.net/h_dukhain/Rewayat-Hafs-A-n-Assem', cutEarlyMs: 150 } },
  { key: 'salimi',    name: 'Mansour Al-Salimi',  nameAr: 'منصور السالمي',     mode: 'timedSurah',
    timing: { read: 245, folder: 'https://server14.mp3quran.net/mansor', cutEarlyMs: 0 } },
  { key: 'binhumaid', name: 'Ahmad bin Humaid',   nameAr: 'أحمد طالب بن حميد', mode: 'fullSurah' },
  { key: 'nufais',    name: 'Ahmad Al-Nufais',    nameAr: 'أحمد النفيس',       mode: 'fullSurah' },
  { key: 'qurafi',    name: 'Abdullah Al-Qurafi', nameAr: 'عبدالله القرافي',   mode: 'fullSurah' },
  // The tutor's own recitation, recorded in the admin Quran Lab. Real per-ayah
  // files in Supabase Storage — only offered in the picker once the lab's
  // manifest says published (StudentProgressPage filters it).
  { key: 'ustadh',    name: 'Ustadh Ahmed',       nameAr: 'الأستاذ أحمد',      mode: 'perAyah' },
];

export const reciterOf = (key: string | null | undefined): Reciter =>
  RECITERS.find(r => r.key === key) ?? RECITERS[0];

// Hosted on way2quran's media CDN — chosen over mp3quran (read 137) because
// mp3quran only carries 107 of his surahs (9, 14, 16, 17, 23, 24 and 33 are
// 404s there), while this host has all 114. Same recording either way: every
// public distribution of this recitation is the same ~128 kbps master — the
// "320 kbps" some sites advertise measured 128 (surah 112: 18.0s on both hosts,
// near-identical sizes). ACAO:* + range requests verified 2026-08-10.
const BIN_HUMAID_BASE = 'https://media.way2quran.com/ahmed-bin-talib-hamid/hafs-an-asim';

export const binHumaidSurahUrl = (surah: number): string =>
  `${BIN_HUMAID_BASE}/${String(surah).padStart(3, '0')}.mp3`;

// Al-Nufais lives on mp3quran's server16 — unlike bin Humaid's moshaf there,
// it was probed complete (114/114 files, ACAO:*, accept-ranges: bytes).
const MP3QURAN_S16 = 'https://server16.mp3quran.net';

export const nufaisSurahUrl = (surah: number): string =>
  `${MP3QURAN_S16}/nufais/Rewayat-Hafs-A-n-Assem/${String(surah).padStart(3, '0')}.mp3`;

// Coverage verified 2026-08-18: all 114 files live, incl. the surahs missing
// from other server16 moshafs (9/14/16/17/23/24/33). No ayat-timing read and
// no per-ayah catalogue entry exists for him, hence full-surah mode.
export const qurafiSurahUrl = (surah: number): string =>
  `${MP3QURAN_S16}/a_alqrafi/Rewayat-Hafs-A-n-Assem/${String(surah).padStart(3, '0')}.mp3`;

/** Surah file for a timedSurah reciter. */
export const timedSurahUrl = (rec: Reciter, surah: number): string =>
  `${rec.timing!.folder}/${String(surah).padStart(3, '0')}.mp3`;

export const fullSurahUrl = (key: ReciterKey, surah: number): string =>
  key === 'qurafi' ? qurafiSurahUrl(surah) : key === 'nufais' ? nufaisSurahUrl(surah) : binHumaidSurahUrl(surah);

// everyayah.com names its files SSSAAA.mp3 (3-digit surah + 3-digit ayah),
// unlike islamic.network's single global-ayah number.
const EVERYAYAH_BASE = 'https://everyayah.com/data';

export const everyayahUrl = (folder: string, surah: number, ayah: number): string =>
  `${EVERYAYAH_BASE}/${folder}/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

// ─── Ayat timing (mp3quran) ──────────────────────────────────────────────────
// Accuracy is measured per read before a reciter is offered in timedSurah mode:
// download the audio, map the real silence gaps, and check where each cut lands.
//   Al-Dukhain (273): 40–340ms consistently LATE → cutEarlyMs 150.
//   Al-Salimi  (245): 202 cuts over 6 surahs, 61% dead inside a pause, median
//                     and p90 offset 0ms → no correction needed.
//   bin Humaid (137): 700–1000ms off → rejected, kept as fullSurah.

export interface AyahTiming {
  ayah: number;
  startMs: number;
  endMs: number;
}

const timingCache = new Map<string, Promise<AyahTiming[]>>();

export const timedTimings = (rec: Reciter, surah: number): Promise<AyahTiming[]> => {
  const { read, cutEarlyMs } = rec.timing!;
  const cacheKey = `${read}:${surah}`;
  const hit = timingCache.get(cacheKey);
  if (hit) return hit;
  const p = fetch(`https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${read}`)
    .then(r => {
      if (!r.ok) throw new Error(`ayat_timing ${r.status}`);
      return r.json();
    })
    .then((rows: Array<{ ayah: number; start_time: number; end_time: number }>) => {
      const out = rows
        .filter(r => typeof r.ayah === 'number' && r.ayah >= 1)
        .map(r => ({
          ayah: r.ayah,
          startMs: Math.max(0, r.start_time - cutEarlyMs),
          endMs: Math.max(0, r.end_time - cutEarlyMs),
        }))
        .sort((a, b) => a.ayah - b.ayah);
      if (!out.length) throw new Error('ayat_timing empty');
      return out;
    });
  // Cache the promise so parallel taps share one request, but drop it on
  // failure so a flaky network doesn't poison the surah forever.
  p.catch(() => timingCache.delete(cacheKey));
  timingCache.set(cacheKey, p);
  return p;
};
