import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Quranic mark handling.
//
// U+06DF (silent circle) used to render wrong in the bundled fonts (it shipped
// as a full-width base glyph with no positioning). That is now fixed in the FONT
// files themselves: the cmap entry for U+06DF was remapped to each font's own
// sukun glyph — a proper zero-width, GPOS-anchored combining mark — so the
// silent circle now renders correctly inline, on every base letter, in every
// font, on every platform (incl. iOS). No special-casing needed for it here.
//
// The only marks still wrong in the bundled fonts are imāla (U+06EA, Hud 11:41)
// and ishmām (U+06EB, Yusuf 12:11) — two words in the whole muṣḥaf. For those we
// render the WHOLE word in a corrective font (a single font run keeps the
// letters joined and the mark renders correctly).
// ─────────────────────────────────────────────────────────────────────────────

// Waqf signs U+06D6–U+06DC are GDEF=3 combining marks in the bundled fonts.
// Safari won't render them unless a base character precedes them in the same
// text run. When the Quran API returns them as standalone space-delimited tokens
// (e.g. ['رسالته', 'ۜ', 'سيصيب']), Safari drops them entirely. Fix: merge any
// standalone waqf token into the end of the preceding word before splitting into
// render units, so GPOS can anchor the mark above that word's final letter.
const STANDALONE_WAQF_RE = /^[ۖ-ۜ]+$/;

/**
 * Split verse text on spaces, then merge any standalone waqf-sign tokens
 * (U+06D6–U+06DC) into the end of the preceding word.
 * Use this instead of a bare `.split(' ')` when splitting verse text.
 */
export const TURKISH_FONT = 'Hamdullah';

export const splitVerseWords = (textUthmani: string, turkish = false): string[] => {
  // The Uthmani text draws sukun as the khaa-head (U+06E1); the Turkish text
  // uses the round U+0652 natively — keep it.
  const raw = (turkish ? textUthmani : textUthmani.replace(/ْ/g, 'ۡ')).split(' ');
  const out: string[] = [];
  for (const w of raw) {
    if (STANDALONE_WAQF_RE.test(w) && out.length > 0) {
      out[out.length - 1] += w;
    } else {
      out.push(w);
    }
  }
  return out;
};

const IMALA_MARK  = '۪'; // U+06EA
const ISHMAM_MARK = '۫'; // U+06EB

const AMIRI_REGULAR_STACK = "'Amiri Regular', 'Amiri Quran', serif";   // ishmām
const UTHMANIC_V22_STACK  = "'Uthmanic HAFS v22', 'Amiri Quran', serif"; // imāla dot

/** True if the word needs the whole-word corrective font (imāla / ishmām). */
export const hasSpecialQuranMark = (text: string): boolean =>
  text.includes(IMALA_MARK) || text.includes(ISHMAM_MARK);

/** Corrective font stack for a word carrying imāla / ishmām, else null. */
export const correctiveWordFont = (word: string): string | null => {
  // The corrective fonts exist for TWO words in the Uthmani text whose marks
  // the bundled fonts draw wrong. The TURKISH text uses the same codepoints as
  // its own everyday marks (U+06EA = the small vertical stroke under a long-i,
  // 10k+ of them; U+06EB similar) and the Hamdullah font draws both natively —
  // hijacking those words into Uthmanic/Amiri shows a DOT instead.
  if (currentQuranicFont() === TURKISH_FONT) return null;
  if (word.includes(IMALA_MARK)) return UTHMANIC_V22_STACK;
  if (word.includes(ISHMAM_MARK)) return AMIRI_REGULAR_STACK;
  return null;
};

// ── Iqlab low meem (U+06ED) repositioning ────────────────────────────────────
// In every bundled QPC-style font the kasratan (U+064D) and the small low meem
// (U+06ED) share the same below-base anchor, so they overprint each other and
// collide with the letter (e.g. 104:9 مُّمَدَّدَةٍۭ). Fix: strip the meem from the
// inline text and re-draw it as an absolutely-positioned overlay BELOW the
// unit. The per-unit clearance below was MEASURED by rendering every distinct
// U+06ED-bearing letter unit in the whole Quran (29 of them) in each bundled
// font on a canvas and taking the ink bottom (em below the text middle):
// QPC table = max across Hafs / Uthmanic v22 / both Elgharibs / UthmanTN;
// Amiri hangs its marks lower and gets its own table.
export const LOW_MEEM = '\u06ED';
const LOW_MEEM_BOTTOM_QPC: Record<string, number> = { 'تٍۭ': 0.51, 'نٍۭ': 0.75, 'ةٍۭ': 0.55, 'بٍۭ': 0.68, 'سٍۭ': 0.74, 'ءٍۭ': 0.45, 'ذٍۭ': 0.51, 'مٍۭ': 0.6, 'لٍۭ': 0.75, 'قٍۭ': 0.72, 'ثٍۭ': 0.56, 'حٍۭ': 0.73, 'جٍۭ': 0.69, 'رٍۭۚ': 0.8, 'رٍۭ': 0.8, 'فٍۭ': 0.53, 'ءٍۭۚ': 0.45, 'ةٍۭۚ': 0.55, 'دٍۭ': 0.51, 'هٍۭ': 0.51, 'إٍۭ': 0.68, 'دٍۭۚ': 0.51, 'نٍۭۖ': 0.75, 'مٍۭۚ': 0.6, 'ئٍۭ': 0.66, 'طٍۭ': 0.49, 'شٍۭ': 0.75, 'لٍّۭ': 0.75, 'ظٍۭ': 0.49 };
const LOW_MEEM_BOTTOM_AMIRI: Record<string, number> = { 'تٍۭ': 0.76, 'نٍۭ': 0.83, 'ةٍۭ': 0.76, 'بٍۭ': 0.76, 'سٍۭ': 0.83, 'ءٍۭ': 0.41, 'ذٍۭ': 0.76, 'مٍۭ': 0.83, 'لٍۭ': 0.81, 'قٍۭ': 0.76, 'ثٍۭ': 0.76, 'حٍۭ': 0.65, 'جٍۭ': 1, 'رٍۭۚ': 0.76, 'رٍۭ': 0.76, 'فٍۭ': 0.76, 'ءٍۭۚ': 0.41, 'ةٍۭۚ': 0.76, 'دٍۭ': 0.76, 'هٍۭ': 0.76, 'إٍۭ': 0.79, 'دٍۭۚ': 0.76, 'نٍۭۖ': 0.83, 'مٍۭۚ': 0.76, 'ئٍۭ': 0.76, 'طٍۭ': 0.76, 'شٍۭ': 0.76, 'لٍّۭ': 0.81, 'ظٍۭ': 0.76 };

export const hasLowMeem = (unit: string): boolean => unit.includes(LOW_MEEM);

/**
 * Overlay `top` (in em) for the low meem below a letter unit. `lineHeight` is
 * the unitless leading of the surrounding Quran text block (2.6 main reader,
 * 2.8 with translation, 2.2 focus mode) — the overlay's origin is the inline
 * box top, which scales with leading; CAL = lineHeight/2 − 0.6 was calibrated
 * visually so the meem tucks just under the kasratan at every leading.
 */
export const lowMeemTopEm = (unit: string, lineHeight: number): number => {
  const amiri = typeof localStorage !== 'undefined' && localStorage.getItem('quranicFont') === 'Amiri Regular';
  const key = unit.replace(/\u200D/g, '');
  const bottom = (amiri ? LOW_MEEM_BOTTOM_AMIRI : LOW_MEEM_BOTTOM_QPC)[key] ?? 0.85;
  return +(lineHeight / 2 - 0.6 + bottom).toFixed(2);
};

/**
 * Render a letter unit that carries the low meem: inline text without the
 * meem + the meem re-drawn centred below at the measured clearance.
 * `text` should already include any ZWJ joiners.
 */
export const renderLowMeemUnit = (text: string, unitForTable: string, lineHeight: number): React.ReactNode => (
  <span style={{ position: 'relative', display: 'inline' }}>
    {text.replace(new RegExp(LOW_MEEM, 'g'), '')}
    <span style={{
      position: 'absolute', top: `${lowMeemTopEm(unitForTable, lineHeight)}em`, left: 0, right: 0,
      textAlign: 'center', fontSize: '1em', lineHeight: 1, pointerEvents: 'none', fontFamily: 'inherit',
    }}>{LOW_MEEM}</span>
  </span>
);

// ── Iqlab HIGH meem (U+06E2) repositioning ───────────────────────────────────
// The small high meem sits on top of a tanween (U+064B/U+064C) and every bundled
// font overprints the two, so the meem is stripped from the inline text and
// re-drawn in an absolutely-positioned overlay above the unit (see
// LetterWithError). The overlay used to sit at a flat -0.34em for every unit —
// but the tanween's ink top varies by 0.5em across letters (ءًۢ 0.67em vs لٌّۢ
// 1.18em above the baseline in Hafs), so one constant necessarily collided on
// the tall ones and floated free on the short ones.
//
// The table below is the MEASURED overlay `top` (em) for each of the 45 distinct
// high-meem units in the muṣḥaf, per bundled font. It was generated by drawing
// each unit (meem stripped) on a canvas at 300px, scanning for the ink top, and
// solving  top = -(1-(ascent+descent))/2 + meemInkBottom - inkTop - 0.06
// so the meem's own ink bottom lands 0.06em clear of the tanween. UthmanTN and
// Amiri draw a lone U+06E2 far higher than the QPC fonts, which is why their
// numbers look nothing like the rest — that is real, not a mistake.
export const HIGH_MEEM = '\u06E2';

/** True when a unit carries the high meem stacked on a tanween. */
export const hasIqlabHighMeem = (unit: string): boolean =>
  unit.includes(HIGH_MEEM) && (unit.includes('\u064B') || unit.includes('\u064C'));

const HIGH_MEEM_TOP: Record<string, Record<string, number>> = {
  'Hafs': {
    'مٌۢ':-0.44, 'رٌۢ':-0.38, 'ةٌۢ':-0.47, 'رًۢ':-0.3, 'مًۢ':-0.36, 'دًۢ':-0.4,
    'ةًۢ':-0.39, 'لًۢ':-0.59, 'ءًۢ':-0.28, 'عٌۢ':-0.54, 'عًۢ':-0.46, 'تٌۢ':-0.47,
    'قٌۢ':-0.54, 'دٌۢ':-0.48, 'لٌۢ':-0.67, 'فٌۢ':-0.64, 'يًۢ':-0.29, 'بًۢ':-0.33,
    'طٌۢ':-0.43, 'نٌۢ':-0.52, 'بٌۢ':-0.41, 'نًۢ':-0.44, 'ـًٔۢ':-0.36, 'مٌّۢ':-0.55,
    'كٌۢ':-0.46, 'حٌۢ':-0.46, 'قًۢ':-0.46, 'سًۢ':-0.37, 'سٌۢ':-0.46, 'رًّۢ':-0.45,
    'مًّۢ':-0.51, 'تًۢ':-0.39, 'يًّۢ':-0.44, 'وًۢ':-0.3, 'ضًۢ':-0.44, 'هًۢ':-0.31,
    'لًّۢ':-0.75, 'ذٌۢ':-0.59, 'نٌّۢ':-0.62, 'وٌّۢ':-0.49, 'زًۢ':-0.35, 'حًۢ':-0.37,
    'نًّۢ':-0.59, 'ظٌۢ':-0.5, 'لٌّۢ':-0.78,
  },
  'Amiri Regular': {
    'مٌۢ':-0.13, 'رٌۢ':-0.13, 'ةٌۢ':-0.13, 'رًۢ':-0.03, 'مًۢ':-0.03, 'دًۢ':-0.03,
    'ةًۢ':-0.03, 'لًۢ':-0.03, 'ءًۢ':0.43, 'عٌۢ':-0.13, 'عًۢ':-0.03, 'تٌۢ':-0.13,
    'قٌۢ':-0.13, 'دٌۢ':-0.13, 'لٌۢ':-0.13, 'فٌۢ':-0.13, 'يًۢ':-0.03, 'بًۢ':-0.03,
    'طٌۢ':-0.13, 'نٌۢ':-0.13, 'بٌۢ':-0.13, 'نًۢ':-0.03, 'ـًٔۢ':-0.03, 'مٌّۢ':-0.25,
    'كٌۢ':-0.13, 'حٌۢ':-0.13, 'قًۢ':-0.03, 'سًۢ':-0.03, 'سٌۢ':-0.13, 'رًّۢ':-0.11,
    'مًّۢ':-0.11, 'تًۢ':-0.03, 'يًّۢ':-0.11, 'وًۢ':-0.03, 'ضًۢ':-0.03, 'هًۢ':-0.03,
    'لًّۢ':-0.11, 'ذٌۢ':-0.13, 'نٌّۢ':-0.25, 'وٌّۢ':-0.25, 'زًۢ':-0.03, 'حًۢ':-0.03,
    'نًّۢ':-0.11, 'ظٌۢ':-0.13, 'لٌّۢ':-0.25,
  },
  'Elgharib KFGQPCHafs V10': {
    'مٌۢ':-0.47, 'رٌۢ':-0.39, 'ةٌۢ':-0.54, 'رًۢ':-0.34, 'مًۢ':-0.41, 'دًۢ':-0.45,
    'ةًۢ':-0.49, 'لًۢ':-0.6, 'ءًۢ':-0.33, 'عٌۢ':-0.52, 'عًۢ':-0.47, 'تٌۢ':-0.5,
    'قٌۢ':-0.56, 'دٌۢ':-0.5, 'لٌۢ':-0.65, 'فٌۢ':-0.71, 'يًۢ':-0.33, 'بًۢ':-0.4,
    'طٌۢ':-0.45, 'نٌۢ':-0.52, 'بٌۢ':-0.45, 'نًۢ':-0.47, 'ـًٔۢ':-0.45, 'مٌّۢ':-0.59,
    'كٌۢ':-0.5, 'حٌۢ':-0.47, 'قًۢ':-0.51, 'سًۢ':-0.45, 'سٌۢ':-0.5, 'رًّۢ':-0.51,
    'مًّۢ':-0.58, 'تًۢ':-0.45, 'يًّۢ':-0.5, 'وًۢ':-0.33, 'ضًۢ':-0.5, 'هًۢ':-0.35,
    'لًّۢ':-0.77, 'ذٌۢ':-0.66, 'نٌّۢ':-0.65, 'وٌّۢ':-0.5, 'زًۢ':-0.45, 'حًۢ':-0.42,
    'نًّۢ':-0.64, 'ظٌۢ':-0.6, 'لٌّۢ':-0.78,
  },
  'Elgharib HAFSTharwatEmara': {
    'مٌۢ':-0.39, 'رٌۢ':-0.34, 'ةٌۢ':-0.58, 'رًۢ':-0.2, 'مًۢ':-0.24, 'دًۢ':-0.39,
    'ةًۢ':-0.43, 'لًۢ':-0.33, 'ءًۢ':-0.25, 'عٌۢ':-0.56, 'عًۢ':-0.41, 'تٌۢ':-0.6,
    'قٌۢ':-0.6, 'دٌۢ':-0.53, 'لٌۢ':-0.33, 'فٌۢ':-0.66, 'يًۢ':-0.27, 'بًۢ':-0.33,
    'طٌۢ':-0.43, 'نٌۢ':-0.54, 'بٌۢ':-0.48, 'نًۢ':-0.4, 'ـًٔۢ':-0.44, 'مٌّۢ':-0.54,
    'كٌۢ':-0.52, 'حٌۢ':-0.46, 'قًۢ':-0.45, 'سًۢ':-0.22, 'سٌۢ':-0.36, 'رًّۢ':-0.35,
    'مًّۢ':-0.4, 'تًۢ':-0.45, 'يًّۢ':-0.42, 'وًۢ':-0.21, 'ضًۢ':-0.42, 'هًۢ':-0.25,
    'لًّۢ':-0.33, 'ذٌۢ':-0.65, 'نٌّۢ':-0.7, 'وٌّۢ':-0.51, 'زًۢ':-0.4, 'حًۢ':-0.31,
    'نًّۢ':-0.55, 'ظٌۢ':-0.65, 'لٌّۢ':-0.45,
  },
  'UthmanTN v2-0': {
    'مٌۢ':0.19, 'رٌۢ':0.22, 'ةٌۢ':0.14, 'رًۢ':0.32, 'مًۢ':0.3, 'دًۢ':0.25,
    'ةًۢ':0.25, 'لًۢ':0.08, 'ءًۢ':0.37, 'عٌۢ':0.07, 'عًۢ':0.18, 'تٌۢ':0.14,
    'قٌۢ':0.09, 'دٌۢ':0.14, 'لٌۢ':-0.03, 'فٌۢ':0, 'يًۢ':0.32, 'بًۢ':0.27,
    'طٌۢ':0.22, 'نٌۢ':0.13, 'بٌۢ':0.17, 'نًۢ':0.24, 'ـًٔۢ':0.47, 'مٌّۢ':0.1,
    'كٌۢ':0.17, 'حٌۢ':0.17, 'قًۢ':0.2, 'سًۢ':0.27, 'سٌۢ':0.17, 'رًّۢ':0.17,
    'مًّۢ':0.14, 'تًۢ':0.25, 'يًّۢ':0.17, 'وًۢ':0.37, 'ضًۢ':0.24, 'هًۢ':0.34,
    'لًّۢ':-0.08, 'ذٌۢ':0.04, 'نٌّۢ':0.04, 'وٌّۢ':0.18, 'زًۢ':0.31, 'حًۢ':0.27,
    'نًّۢ':0.08, 'ظٌۢ':0.14, 'لٌّۢ':-0.12,
  },
  'Uthmanic HAFS v22': {
    'مٌۢ':-0.44, 'رٌۢ':-0.38, 'ةٌۢ':-0.47, 'رًۢ':-0.3, 'مًۢ':-0.36, 'دًۢ':-0.4,
    'ةًۢ':-0.39, 'لًۢ':-0.59, 'ءًۢ':-0.33, 'عٌۢ':-0.54, 'عًۢ':-0.46, 'تٌۢ':-0.47,
    'قٌۢ':-0.54, 'دٌۢ':-0.48, 'لٌۢ':-0.67, 'فٌۢ':-0.64, 'يًۢ':-0.29, 'بًۢ':-0.33,
    'طٌۢ':-0.43, 'نٌۢ':-0.52, 'بٌۢ':-0.41, 'نًۢ':-0.44, 'ـًٔۢ':-0.36, 'مٌّۢ':-0.6,
    'كٌۢ':-0.46, 'حٌۢ':-0.46, 'قًۢ':-0.46, 'سًۢ':-0.37, 'سٌۢ':-0.46, 'رًّۢ':-0.46,
    'مًّۢ':-0.52, 'تًۢ':-0.39, 'يًّۢ':-0.45, 'وًۢ':-0.25, 'ضًۢ':-0.44, 'هًۢ':-0.31,
    'لًّۢ':-0.75, 'ذٌۢ':-0.59, 'نٌّۢ':-0.67, 'وٌّۢ':-0.49, 'زًۢ':-0.35, 'حًۢ':-0.37,
    'نًّۢ':-0.59, 'ظٌۢ':-0.5, 'لٌّۢ':-0.83,
  },
};

/** Overlay `top` (em) for the high meem above a letter unit, for the font the
 *  reader is currently set to. Unknown unit → the highest placement in that
 *  font's table, which can never overlap. */
export const highMeemTopEm = (unit: string): number => {
  let font = 'Hafs';
  try { font = localStorage.getItem('quranicFont') || 'Hafs'; } catch { /* SSR / private mode */ }
  const table = HIGH_MEEM_TOP[font] ?? HIGH_MEEM_TOP['Hafs'];
  const key = unit.replace(/\u200D/g, '');
  const hit = table[key];
  if (hit !== undefined) return hit;
  return Math.min(...Object.values(table));
};

// ── Admin vowel repositioning ────────────────────────────────────────────────
// The admin Quran Lab lets the tutor nudge a specific combining mark on a
// specific letter unit, per font. Offsets are em values for the same overlay
// technique the iqlab meems use: the mark is stripped from the inline text and
// re-drawn absolutely, centred on the unit, at (dx, dy). dy follows the
// HIGH_MEEM convention (top of the unit's inline box, leading-independent).
export interface VowelAdjustment { dx: number; dy: number }
/** font → letterKey ("s:a:w:l") → mark char → offset */
export type VowelAdjMap = Record<string, Record<string, Record<string, VowelAdjustment>>>;

export const currentQuranicFont = (): string => {
  try { return localStorage.getItem('quranicFont') || 'Hafs'; } catch { return 'Hafs'; }
};

export const MARK_NAMES: Record<string, string> = {
  'ً': 'Fathatan', 'ٌ': 'Dammatan', 'ٍ': 'Kasratan',
  'َ': 'Fatha', 'ُ': 'Damma', 'ِ': 'Kasra',
  'ّ': 'Shadda', 'ْ': 'Sukoon', 'ٓ': 'Maddah',
  'ٔ': 'Hamza above', 'ٕ': 'Hamza below', 'ٖ': 'Small low alef',
  'ٰ': 'Small high alef', 'ۖ': 'Waqf ṣla', 'ۗ': 'Waqf qla',
  'ۘ': 'Waqf meem', 'ۙ': 'Waqf lā', 'ۚ': 'Waqf jeem',
  'ۛ': 'Waqf three dots', 'ۜ': 'Small high seen',
  '۟': 'Silent circle', '۠': 'Rectangular zero',
  'ۡ': 'Sukoon (khaa head)', 'ۢ': 'Small high meem',
  'ۣ': 'Small low seen', 'ۥ': 'Small waw', 'ۦ': 'Small yeh',
  'ۧ': 'Small high yeh', 'ۨ': 'Small high noon',
  '۪': 'Imāla dot', '۫': 'Ishmām dot', '۬': 'Rounded filled stop',
  'ۭ': 'Small low meem', 'ࣰ': 'Open fathatan', 'ࣱ': 'Open dammatan',
  'ࣲ': 'Open kasratan',
};

/** Marks that sit BELOW the letter — the editor starts their overlay low. */
export const BELOW_MARKS = new Set(['ِ', 'ٍ', 'ٕ', 'ٖ', 'ۣ', 'ۭ', 'ࣲ']);

/** The combining marks present in a letter unit (base letters + ZWJ excluded). */
export const marksInUnit = (unit: string): string[] =>
  Array.from(unit).filter(ch => ch !== ZWJ && !isArabicLetterCh(ch));

export interface UnitOverlay { mark: string; top: number; dx?: number }

/**
 * Overlay plan for a letter unit: the shipped iqlab meem overlays plus any
 * admin vowel adjustments for this unit. An adjustment for a meem replaces the
 * measured-table position. Returns null when the unit renders as plain text.
 */
export const unitOverlayPlan = (
  unit: string,
  lineHeight: number,
  adj?: Record<string, VowelAdjustment>,
): UnitOverlay[] | null => {
  const adjMarks = adj ? Object.keys(adj).filter(m => unit.includes(m)) : [];
  const overlays: UnitOverlay[] = [];
  // The Hamdullah font stacks marks natively (mark-to-mark GPOS) and has no
  // measured overlay tables — only admin adjustments apply there.
  const turkishFont = currentQuranicFont() === TURKISH_FONT;
  if (!turkishFont && hasLowMeem(unit) && !adjMarks.includes(LOW_MEEM)) {
    overlays.push({ mark: LOW_MEEM, top: lowMeemTopEm(unit, lineHeight) });
  }
  if (!turkishFont && hasIqlabHighMeem(unit) && !adjMarks.includes(HIGH_MEEM)) {
    overlays.push({ mark: HIGH_MEEM, top: highMeemTopEm(unit), dx: -0.06 });
  }
  for (const m of adjMarks) overlays.push({ mark: m, top: adj![m].dy, dx: adj![m].dx });
  return overlays.length ? overlays : null;
};

/**
 * Render a unit with its overlay marks: inline text with the overlay marks
 * stripped (first occurrence each), plus one absolutely-positioned span per
 * mark, centred on the unit (the same technique as the iqlab meems — combining
 * marks centre on their base, so left:0/right:0 + text-align:center is
 * width-independent). `textWithJoiners` should already carry any ZWJ seams.
 */
export const renderUnitOverlays = (textWithJoiners: string, overlays: UnitOverlay[]): React.ReactNode => {
  let inline = textWithJoiners;
  for (const o of overlays) inline = inline.replace(o.mark, '');
  return (
    <span style={{ position: 'relative', display: 'inline' }}>
      {inline}
      {overlays.map((o, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', top: `${o.top}em`, left: 0, right: 0, textAlign: 'center',
            transform: `translateX(${o.dx ?? 0}em)`, fontSize: '1em', lineHeight: 1,
            pointerEvents: 'none', fontFamily: 'inherit',
          }}
        >{o.mark}</span>
      ))}
    </span>
  );
};

export type WordMarkPlan =
  | { mode: 'none' }
  | { mode: 'wholeWord'; font: string };

/** Decide how to render a word: untouched, or whole word in a corrective font. */
export const wordMarkPlan = (word: string): WordMarkPlan => {
  const font = correctiveWordFont(word);
  return font ? { mode: 'wholeWord', font } : { mode: 'none' };
};

// Minimal copies of the reader's segmentation helpers (needed to cut a word
// at its low-meem unit without breaking cursive joining).
const ZWJ = '\u200D';
const isArabicLetterCh = (ch: string): boolean => {
  const c = ch.charCodeAt(0);
  return (c >= 0x0621 && c <= 0x064A) || (c >= 0x0671 && c <= 0x06D3) || c === 0x06D5 || (c >= 0x06EE && c <= 0x06EF) || (c >= 0x06FA && c <= 0x06FC);
};
const NON_FWD_JOIN = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ء', 'ة', 'ى']);
const toUnits = (word: string): string[] => {
  const out: string[] = [];
  for (const ch of word) {
    if (isArabicLetterCh(ch)) out.push(ch);
    else if (out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
};

// ── Tanween-on-seat display convention ───────────────────────────────────────
// The Quran.com uthmani text writes fathatan on the letter BEFORE its silent
// seat alif (رَسُولًا: U+064B attached to the ل). The tutor prefers the tanween
// drawn on the alif itself (رَسُولاً), so swap the adjacency at DISPLAY time
// only — the stored verse text, tajweed segmentation and mistake letter
// indices all keep the original order (the swap never changes base-letter
// count or order). Iqlab words (a small meem ۢ/ۭ sits between the tanween and
// the alif, so the pair isn't adjacent) are naturally left untouched — the
// meem must stay with its tanween and the meem-overlay clearance tables are
// calibrated for those exact units.
export const tanweenOnSeatAlif = (word: string): string =>
  word.replace(/ًا/g, 'اً');

// ── iOS tatweel-seated hamza fix (3:179 فَـَٔامِنُوا۟ and 771 sister words) ────
// U+0640 TATWEEL is Script=Common and combining marks (hamza U+0654, harakat)
// are Script=Inherited — so a split-out tatweel letter unit ("‍ـَٔ‍", ZWJ seams
// included) contains NO Script=Arabic character at all. CoreText (every iOS
// browser + desktop Safari) itemizes that run as non-Arabic and skips the
// font's Arabic mark/mkmk GPOS features entirely: the hamza and its vowel pile
// up unpositioned at the tatweel's origin, so the fatha lands at the baseline
// under the hamza and reads as a kasra. Chrome never shows it because Blink
// merges same-styled sibling spans into ONE shaping run — the whole word, which
// contains real Arabic letters. (Measured with CoreText: in `‍ـَٔ‍` alone GPOS
// never fires for ANY mark, in ف + the same run every mark anchors perfectly —
// mark ORDER was irrelevant, so a UTR#53-style reorder would fix nothing.)
//
// The fix: seed the unit's span text with U+061C ARABIC LETTER MARK — an
// invisible, zero-width, joining-TRANSPARENT format character whose script IS
// Arabic. It flips the run's script itemization to Arabic and CoreText then
// anchors hamza + fatha/fathatan/damma/kasra/sukun exactly as it does mid-word
// (verified per-font: Hafs, KFGQPC, uthmanic v22, both Elgharibs). It must be
// the FIRST character of the span — CoreText ignores it after the lead ZWJ.
// HarfBuzz proof of no regression: Chrome's merged-run glyph stream with the
// ALM is identical to today's (one extra invisible zero-advance glyph), and
// ف+ALM+ـ still yields the initial ف form. Display-time only: base-letter
// count, unit order and mistake-key letter indices are untouched.
export const ALM = '؜';
/** Invisible Arabic-script seed for letter units whose base is the TATWEEL. */
export const almSeedForUnit = (unit: string): string =>
  unit.charCodeAt(0) === 0x0640 ? ALM : '';

/**
 * Render a word as React nodes. Returns the plain string unless it carries an
 * imāla / ishmām mark (whole word in a corrective font) or an iqlab LOW meem
 * (U+06ED) — that unit is re-drawn with the below-overlay, with ZWJ at the
 * seams so the word stays cursively joined on every platform.
 * `lineHeight` = the unitless leading of the surrounding Quran text block.
 */
export const renderWordWithMarks = (word: string, _keyPrefix = '', lineHeight = 2.6): React.ReactNode => {
  word = tanweenOnSeatAlif(word);
  const font = correctiveWordFont(word);
  if (font) return <span style={{ fontFamily: font }}>{word}</span>;
  if (!hasLowMeem(word)) return word;
  const units = toUnits(word);
  const nodes: React.ReactNode[] = [];
  let buf = '';
  units.forEach((u, i) => {
    if (!hasLowMeem(u)) { buf += u; return; }
    const lead = i > 0 && isArabicLetterCh(units[i - 1][0]) && !NON_FWD_JOIN.has(units[i - 1][0]);
    const trail = i < units.length - 1 && isArabicLetterCh(u[0]) && !NON_FWD_JOIN.has(u[0]);
    if (buf) { nodes.push(buf + (lead ? ZWJ : '')); buf = ''; }
    nodes.push(
      <React.Fragment key={`lm${i}`}>
        {renderLowMeemUnit((lead ? ZWJ : '') + u + (trail ? ZWJ : ''), u, lineHeight)}
      </React.Fragment>
    );
    if (trail) buf = ZWJ;
  });
  if (buf) nodes.push(buf);
  return <>{nodes}</>;
};
