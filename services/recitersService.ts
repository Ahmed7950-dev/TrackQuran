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

export type ReciterKey = 'minshawi' | 'dukhain' | 'binhumaid' | 'nufais' | 'ustadh';

export interface Reciter {
  key: ReciterKey;
  name: string;
  nameAr: string;
  mode: 'perAyah' | 'timedSurah' | 'fullSurah';
}

export const RECITERS: Reciter[] = [
  { key: 'minshawi',  name: 'Al-Minshawi',        nameAr: 'المنشاوي',          mode: 'perAyah' },
  { key: 'dukhain',   name: 'Haitham Al-Dukhain', nameAr: 'هيثم الدخين',       mode: 'timedSurah' },
  { key: 'binhumaid', name: 'Ahmad bin Humaid',   nameAr: 'أحمد طالب بن حميد', mode: 'fullSurah' },
  { key: 'nufais',    name: 'Ahmad Al-Nufais',    nameAr: 'أحمد النفيس',       mode: 'fullSurah' },
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

// Al-Dukhain and Al-Nufais live on mp3quran's server16 — unlike bin Humaid's
// moshaf there, both were probed complete (114/114 files, ACAO:*,
// accept-ranges: bytes — 2026-08-11).
const MP3QURAN_S16 = 'https://server16.mp3quran.net';

export const dukhainSurahUrl = (surah: number): string =>
  `${MP3QURAN_S16}/h_dukhain/Rewayat-Hafs-A-n-Assem/${String(surah).padStart(3, '0')}.mp3`;

export const nufaisSurahUrl = (surah: number): string =>
  `${MP3QURAN_S16}/nufais/Rewayat-Hafs-A-n-Assem/${String(surah).padStart(3, '0')}.mp3`;

export const fullSurahUrl = (key: ReciterKey, surah: number): string =>
  key === 'nufais' ? nufaisSurahUrl(surah) : binHumaidSurahUrl(surah);

// ─── Al-Dukhain ayat timing (mp3quran read 273) ──────────────────────────────

export interface AyahTiming {
  ayah: number;
  startMs: number;
  endMs: number;
}

const DUKHAIN_READ = 273;

/** Measured against the audio: read 273's cuts sit 40–340ms AFTER the real
 *  verse onset (they clip the first syllable). Pulling every boundary forward
 *  by this much lands the cuts inside the silence gaps. */
const CUT_EARLY_MS = 150;

const timingCache = new Map<number, Promise<AyahTiming[]>>();

export const dukhainTimings = (surah: number): Promise<AyahTiming[]> => {
  const hit = timingCache.get(surah);
  if (hit) return hit;
  const p = fetch(`https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${DUKHAIN_READ}`)
    .then(r => {
      if (!r.ok) throw new Error(`ayat_timing ${r.status}`);
      return r.json();
    })
    .then((rows: Array<{ ayah: number; start_time: number; end_time: number }>) => {
      const out = rows
        .filter(r => typeof r.ayah === 'number' && r.ayah >= 1)
        .map(r => ({
          ayah: r.ayah,
          startMs: Math.max(0, r.start_time - CUT_EARLY_MS),
          endMs: Math.max(0, r.end_time - CUT_EARLY_MS),
        }))
        .sort((a, b) => a.ayah - b.ayah);
      if (!out.length) throw new Error('ayat_timing empty');
      return out;
    });
  // Cache the promise so parallel taps share one request, but drop it on
  // failure so a flaky network doesn't poison the surah forever.
  p.catch(() => timingCache.delete(surah));
  timingCache.set(surah, p);
  return p;
};
