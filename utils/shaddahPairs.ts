// utils/shaddahPairs.ts
// -----------------------------------------------------------------------------
// Reading practice for the Shaddah lesson: two random letters, the SECOND one
// doubled — بَتَّ, سِمُّ, إِلَّ. The first letter takes a random short vowel, the
// second a shaddah and a random short vowel.
//
// Marks are written letter + shaddah + vowel, the order the lesson's own words
// are stored in, so the Hafs font draws them the same way.
// -----------------------------------------------------------------------------

const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const SHADDA = 'ّ';
const VOWELS = [FATHA, KASRA, DAMMA];

/** The alphabet without alif (a stretching letter: no vowel, no shaddah) and
 *  without hamzah, which is added to the first letters only — a doubled hamzah
 *  is too rare to drill. */
const LETTERS = [...'بتثجحخدذرزسشصضطظعغفقكلمنهوي'];

/** Which Qaedah lesson this is, by title, so it survives the lesson being recreated. */
export const isShaddahTopic = (titleEn = '', titleAr = ''): boolean =>
  /shadd?ah?/i.test(titleEn) || titleAr.includes('الشدة') || titleAr.includes('الشّدة');

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A first letter with its vowel. Hamzah at the start of a word sits on an
 *  alif: أَ, أُ, and إِ with the kasrah below. */
function opening(letter: string, vowel: string): string {
  if (letter !== 'ء') return letter + vowel;
  return (vowel === KASRA ? 'إ' : 'أ') + vowel;
}

/**
 * `count` different pairs. The doubled letters are dealt from a shuffled deck,
 * so a run of 20 doubles 20 different letters before any comes back; the
 * first letter is never the same as the second.
 */
export function shaddahPairs(count = 20, rng: () => number = Math.random): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let doubled: string[] = [];
  let firsts: string[] = [];
  for (let guard = 0; out.length < count && guard < count * 20; guard++) {
    if (!doubled.length) doubled = shuffled(LETTERS, rng);
    if (!firsts.length) firsts = shuffled([...LETTERS, 'ء'], rng);
    const second = doubled[doubled.length - 1];
    let i = firsts.length - 1;
    while (i >= 0 && firsts[i] === second) i--;
    if (i < 0) { firsts = []; continue; }
    const first = firsts.splice(i, 1)[0];
    const pair = opening(first, VOWELS[Math.floor(rng() * 3)])
      + second + SHADDA + VOWELS[Math.floor(rng() * 3)];
    if (seen.has(pair)) continue;
    doubled.pop();
    seen.add(pair);
    out.push(pair);
  }
  return out;
}
