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
export const splitVerseWords = (textUthmani: string): string[] => {
  const raw = textUthmani.replace(/ْ/g, 'ۡ').split(' ');
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

/**
 * Render a word as React nodes. Returns the plain string unless it carries an
 * imāla / ishmām mark (whole word in a corrective font) or an iqlab LOW meem
 * (U+06ED) — that unit is re-drawn with the below-overlay, with ZWJ at the
 * seams so the word stays cursively joined on every platform.
 * `lineHeight` = the unitless leading of the surrounding Quran text block.
 */
export const renderWordWithMarks = (word: string, _keyPrefix = '', lineHeight = 2.6): React.ReactNode => {
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
