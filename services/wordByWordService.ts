// Word-by-word meanings from quran.com (free, no key) and their alignment with
// the page's own word numbering (splitVerseWords indices).
import { isArabicLetter } from '../utils/mistakeLetters';

export interface WbwWord { text: string; translation: string; transliteration: string }

const hasLetter = (s: string) => [...s].some(c => isArabicLetter(c));

const cache = new Map<string, Promise<Map<string, WbwWord[]>>>();

/** verse_key → the verse's words (char_type 'word' only), one surah at a time. */
export const fetchSurahWbw = (surah: number, language = 'en'): Promise<Map<string, WbwWord[]>> => {
  const key = `${surah}:${language}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const out = new Map<string, WbwWord[]>();
      for (let page = 1; page < 20; page++) {
        const res = await fetch(`https://api.quran.com/api/v4/verses/by_chapter/${surah}?words=true&word_fields=text_uthmani&language=${language}&per_page=50&page=${page}`);
        if (!res.ok) throw new Error(`quran.com ${res.status}`);
        const j = await res.json();
        for (const v of j.verses ?? []) {
          out.set(v.verse_key, (v.words ?? [])
            .filter((w: any) => w.char_type_name === 'word')
            .map((w: any) => ({
              text: w.text_uthmani ?? w.text ?? '',
              translation: w.translation?.text ?? '',
              transliteration: w.transliteration?.text ?? '',
            })));
        }
        if (!j.pagination?.next_page) break;
      }
      return out;
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
};

/**
 * For each page word (splitVerseWords order) the index of the quran.com word
 * it belongs to, or -1. Page tokens without a letter ("" or a lone ۞) get -1;
 * a quran.com word spanning several page words ("بَعْدَ مَا", 2:181) is shared.
 * Returns null when the two can't be lined up.
 */
export const alignWbw = (pageWords: string[], apiWords: WbwWord[]): number[] | null => {
  const expanded: number[] = [];
  apiWords.forEach((w, i) => {
    const parts = Math.max(1, w.text.split(/\s+/).filter(hasLetter).length);
    for (let k = 0; k < parts; k++) expanded.push(i);
  });
  const out: number[] = [];
  let j = 0;
  for (const w of pageWords) {
    if (!hasLetter(w)) { out.push(-1); continue; }
    out.push(j < expanded.length ? expanded[j] : -1);
    j++;
  }
  if (j === expanded.length) return out;
  // quran.com's text has a stray space inside a word in a few places (5:52
  // "دَآئِرَ ةٌ") — if the plain counts agree, pair them one to one.
  if (j !== apiWords.length) return null;
  let k = 0;
  return pageWords.map(w => (hasLetter(w) ? k++ : -1));
};
