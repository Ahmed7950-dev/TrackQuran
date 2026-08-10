// ─── Recitation sources for the student portal's tap-to-listen ───────────────
// Two kinds of source exist:
//   perAyah     — one mp3 per ayah (islamic.network CDN, global-ayah numbering).
//   surahTimed  — one mp3 per surah + mp3quran's official ayat-timing API
//                 (millisecond start/end per ayah), played by seeking into the
//                 surah file and pausing at the ayah's end.
// Ahmad Talib bin Humaid exists NOWHERE as per-ayah files (checked everyayah,
// islamic.network, alquran.cloud and Quran.com in Aug 2026) — the timing API is
// the only way to offer him per-verse.

export type ReciterKey = 'minshawi' | 'binhumaid';

export interface Reciter {
  key: ReciterKey;
  name: string;
  nameAr: string;
  mode: 'perAyah' | 'surahTimed';
}

export const RECITERS: Reciter[] = [
  { key: 'minshawi',  name: 'Al-Minshawi',      nameAr: 'المنشاوي',        mode: 'perAyah' },
  { key: 'binhumaid', name: 'Ahmad bin Humaid', nameAr: 'أحمد طالب بن حميد', mode: 'surahTimed' },
];

export const reciterOf = (key: string | null | undefined): Reciter =>
  RECITERS.find(r => r.key === key) ?? RECITERS[0];

// mp3quran read id 137 = أحمد طالب بن حميد, Hafs ʿan ʿĀṣim. Both hosts send
// Access-Control-Allow-Origin: * and the audio server honours range requests,
// so seeking works straight from the browser (verified 2026-08-09).
const BIN_HUMAID_READ = 137;
const BIN_HUMAID_BASE = 'https://server16.mp3quran.net/a_binhameed/Rewayat-Hafs-A-n-Assem';

export const binHumaidSurahUrl = (surah: number): string =>
  `${BIN_HUMAID_BASE}/${String(surah).padStart(3, '0')}.mp3`;

export interface AyahTiming { ayah: number; startMs: number; endMs: number }

const timingCache = new Map<number, Promise<AyahTiming[]>>();

/** Per-ayah millisecond bounds inside the surah file. Cached per surah; a
 *  failed fetch is evicted so the next tap retries instead of caching the
 *  failure forever. Note: ayah 1's start comes AFTER the basmalah. */
export function getBinHumaidTimings(surah: number): Promise<AyahTiming[]> {
  const hit = timingCache.get(surah);
  if (hit) return hit;
  const p = fetch(`https://www.mp3quran.net/api/v3/ayat_timing?surah=${surah}&read=${BIN_HUMAID_READ}`)
    .then(r => {
      if (!r.ok) throw new Error(`timing http ${r.status}`);
      return r.json();
    })
    .then((rows: Array<{ ayah: number; start_time: number; end_time: number }>) => {
      const t = rows
        .filter(r => typeof r.ayah === 'number' && r.ayah >= 1)
        .map(r => ({ ayah: r.ayah, startMs: r.start_time, endMs: r.end_time }))
        .sort((a, b) => a.ayah - b.ayah);
      if (t.length === 0) throw new Error('empty timings');
      return t;
    });
  p.catch(() => timingCache.delete(surah));
  timingCache.set(surah, p);
  return p;
}
