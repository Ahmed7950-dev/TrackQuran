// utils/arabicJoining.ts
// ---------------------------------------------------------------------------
// Does a word join between two of its letters? Answered with the Unicode
// joining types (ArabicShaping.txt), the same rules every browser shapes
// Arabic with. A word drawn letter by letter (each letter its own span, so a
// mistake or a tajweed colour can sit on one letter) puts a joiner at every
// seam where the plain word joins and a non-joiner where it doesn't, so it
// must agree with the browser exactly, or the word comes apart.
//
// The hand-written list this replaced got two things wrong:
//  - ى (alef maksura) joins on BOTH sides. Everyday spelling only puts it at
//    the end of a word, but the Quran text has it inside a word 338 times
//    (أَرَىٰكَ, هَدَىٰكُمْ, ٱلتَّوْرَىٰةَ). Listed as "never joins the next
//    letter", those words were drawn with ىٰ and the letter after it apart.
//  - ۥ (small waw) and ۦ (small yeh) are not marks to the shaper: they never
//    join, so the letter after them starts unjoined (لِيَسُـۥٓـُٔوا۟). The seam
//    looks at the last character of the letter before it that is not a mark,
//    not only at its base letter.
// Checked over the whole Quran (Quran.com Hafs text, 334,550 letters, and the
// Turkish mushaf text, 329,994): every letter drawn on its own with these seams
// joins exactly as in the plain word.
// ---------------------------------------------------------------------------

export const ZWJ = '‍';
export const ZWNJ = '‌';

/** Join the letter before them, never the one after: the alif forms, د ذ ر ز,
 *  the waw forms, ة, and their extended (Persian, Urdu...) relatives. */
const RIGHT_JOINING = /[آ-إاةد-زوٱ-ٳٵ-ٷڈ-ڙۀۃ-ۋۍۏےۓەۮۯ]/;
/** Join on both sides: every other letter (ى and ئ included) and the tatweel ـ.
 *  The zero width joiner joins both sides too. */
const DUAL_JOINING = /[ؠئبت-خس-ؿـ-هىيٮٯٸ-ڇښ-ڿہۂیێېۑۺ-ۼۿ‍]/;
/** Marks and invisible format characters: joining looks straight through them.
 *  (The few format characters that block joining are listed after it.) */
const TRANSPARENT = /[\p{Mn}\p{Me}\p{Cf}]/u;
const BLOCKING_FORMAT = /[‌؀-؅۝܏࢐࢑࣢]/;

type JoiningType = 'dual' | 'right' | 'none' | 'transparent';

const joiningType = (ch: string): JoiningType => {
  if (DUAL_JOINING.test(ch)) return 'dual';
  if (RIGHT_JOINING.test(ch)) return 'right';
  if (TRANSPARENT.test(ch) && !BLOCKING_FORMAT.test(ch)) return 'transparent';
  return 'none'; // ء, ۥ, ۦ, ۞, the non-joiner, spaces, digits
};

/** The character of a letter unit that joining sees at its end: the last one
 *  that is not a mark. */
const lastSolid = (unit: string): string | undefined => {
  const chars = Array.from(unit);
  for (let k = chars.length - 1; k >= 0; k--) if (joiningType(chars[k]) !== 'transparent') return chars[k];
  return undefined;
};

/** The character of a letter unit that joining sees at its start. */
const firstSolid = (unit: string): string | undefined =>
  Array.from(unit).find(ch => joiningType(ch) !== 'transparent');

/** Does the plain word join between letter unit `a` and the unit `b` right
 *  after it? (Units = a letter with its marks, as parseWordIntoLetters splits.) */
export const joinsAcross = (a: string, b: string): boolean => {
  const x = lastSolid(a);
  const y = firstSolid(b);
  if (!x || !y || joiningType(x) !== 'dual') return false;
  const t = joiningType(y);
  return t === 'dual' || t === 'right';
};
