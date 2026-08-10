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

// Hosted on way2quran's media CDN — chosen over mp3quran (read 137) because
// mp3quran only carries 107 of his surahs (9, 14, 16, 17, 23, 24 and 33 are
// 404s there), while this host has all 114. Same recording either way: every
// public distribution of this recitation is the same ~128 kbps master — the
// "320 kbps" some sites advertise measured 128 (surah 112: 18.0s on both hosts,
// near-identical sizes). ACAO:* + range requests verified 2026-08-10.
const BIN_HUMAID_BASE = 'https://media.way2quran.com/ahmed-bin-talib-hamid/hafs-an-asim';

export const binHumaidSurahUrl = (surah: number): string =>
  `${BIN_HUMAID_BASE}/${String(surah).padStart(3, '0')}.mp3`;
