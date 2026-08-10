// ─── Recitation sources for the student portal's tap-to-listen ───────────────
// Two kinds of source:
//   perAyah    — one mp3 per ayah (islamic.network CDN, global-ayah numbering).
//                Tap a verse → that verse plays; taps chain ayah-to-ayah.
//   fullSurah  — one mp3 per surah, played whole. Any tap in the surah starts
//                it from the beginning; tapping again stops.
//
// Ahmad Talib bin Humaid exists NOWHERE as per-ayah files (checked everyayah,
// islamic.network, alquran.cloud and Quran.com in Aug 2026). mp3quran's
// ayat-timing API for him (read 137) was tried for seek-based per-verse
// playback and REMOVED: the tutor found the timings inaccurate against the
// actual audio, so he is offered as full-surah recitation only.

export type ReciterKey = 'minshawi' | 'binhumaid';

export interface Reciter {
  key: ReciterKey;
  name: string;
  nameAr: string;
  mode: 'perAyah' | 'fullSurah';
}

export const RECITERS: Reciter[] = [
  { key: 'minshawi',  name: 'Al-Minshawi',      nameAr: 'المنشاوي',        mode: 'perAyah' },
  { key: 'binhumaid', name: 'Ahmad bin Humaid', nameAr: 'أحمد طالب بن حميد', mode: 'fullSurah' },
];

export const reciterOf = (key: string | null | undefined): Reciter =>
  RECITERS.find(r => r.key === key) ?? RECITERS[0];

// mp3quran read id 137 = أحمد طالب بن حميد, Hafs ʿan ʿĀṣim. The host sends
// Access-Control-Allow-Origin: * and honours range requests (verified 2026-08-09).
const BIN_HUMAID_BASE = 'https://server16.mp3quran.net/a_binhameed/Rewayat-Hafs-A-n-Assem';

export const binHumaidSurahUrl = (surah: number): string =>
  `${BIN_HUMAID_BASE}/${String(surah).padStart(3, '0')}.mp3`;
