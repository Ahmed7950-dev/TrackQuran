import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Corrective rendering for three Quranic marks the bundled fonts get wrong:
//   • U+06DF silent marker (Small High Rounded Zero) — a small circle above the
//     letter. Hafs / Uthmanic HAFS v22 render it as a detached "dotted circle".
//   • U+06EA imāla  (only Hud 11:41 مَجْر۪ىٰهَا) — a dot under the letter; only
//     'Uthmanic HAFS v22' draws it correctly.
//   • U+06EB ishmām (only Yusuf 12:11 تَأْمَ۫نَّا) — Amiri renders it correctly.
//
// Approach
// --------
// We must never change the font of a single letter inside a word: iOS/iPadOS
// WebKit refuses to shape Arabic across an inline font boundary, so the marked
// letter detaches from its neighbours on iPad.
//
//   • U+06DF (the common case): keep the ENTIRE word in the user's selected
//     font (one font run → letters stay joined on every platform), strip the
//     U+06DF code point so the wrong glyph never renders, and draw the little
//     circle as an absolutely-positioned overlay above the letter (font-family
//     only affects the overlay, which is decorative and outside the text run).
//     → mode 'overlay'.
//   • U+06EA / U+06EB (only two verses in the muṣḥaf): render the WHOLE word in
//     the corrective font. One font run, so letters stay joined, and the mark
//     renders correctly. → mode 'wholeWord'.
// ─────────────────────────────────────────────────────────────────────────────

const SILENT_MARK = '۟'; // U+06DF
const IMALA_MARK  = '۪'; // U+06EA
const ISHMAM_MARK = '۫'; // U+06EB

const AMIRI_REGULAR_STACK = "'Amiri Regular', 'Amiri Quran', serif";   // silent circle + ishmām
const UTHMANIC_V22_STACK  = "'Uthmanic HAFS v22', 'Amiri Quran', serif"; // imāla dot

const isCombiningMark = (cp: number): boolean =>
  (cp >= 0x0610 && cp <= 0x061a) ||
  (cp >= 0x064b && cp <= 0x065f) ||
  cp === 0x0670 ||
  (cp >= 0x06d6 && cp <= 0x06ed);

/** True if the text contains any mark that needs corrective handling. */
export const hasSpecialQuranMark = (text: string): boolean =>
  text.includes(IMALA_MARK) || text.includes(ISHMAM_MARK) || text.includes(SILENT_MARK);

/** Split a word into letter units: each base letter plus its trailing marks. */
const splitLetterUnits = (text: string): string[] => {
  const parts: string[] = [];
  let cur = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isCombiningMark(cp) && cur) cur += ch;
    else { if (cur) parts.push(cur); cur = ch; }
  }
  if (cur) parts.push(cur);
  return parts;
};

/** First base (non-combining, non-space) letter in a unit, if any. */
const firstBaseLetter = (unit: string): string | undefined => {
  for (const ch of unit) {
    const cp = ch.codePointAt(0) ?? 0;
    if (!isCombiningMark(cp) && ch !== ' ') return ch;
  }
  return undefined;
};

// Letters that never connect to the FOLLOWING letter (right-joining / non-joining).
const NON_JOINING_TO_NEXT = new Set([
  'ا', 'أ', 'إ', 'آ', 'ٱ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ة', 'ى', 'ء',
]);

/** Whole-word corrective font (imāla / ishmām verses). */
export const correctiveWordFont = (word: string): string | null => {
  if (word.includes(IMALA_MARK)) return UTHMANIC_V22_STACK;
  if (word.includes(ISHMAM_MARK)) return AMIRI_REGULAR_STACK;
  if (word.includes(SILENT_MARK)) return AMIRI_REGULAR_STACK;
  return null;
};

export type WordMarkPlan =
  | { mode: 'none' }
  | { mode: 'overlay' }                   // selected font + overlaid silent circle(s)
  | { mode: 'wholeWord'; font: string };  // whole word in a corrective font

/**
 * Decide how to render a word's marks.
 *  • imāla / ishmām  → wholeWord (corrective font).
 *  • silent marker only, every marked letter isolatable → overlay.
 *  • silent marker on a connecting letter (rare) → wholeWord, so the inline-block
 *    overlay box can't detach a real join.
 */
export const wordMarkPlan = (word: string): WordMarkPlan => {
  if (!hasSpecialQuranMark(word)) return { mode: 'none' };
  if (word.includes(IMALA_MARK) || word.includes(ISHMAM_MARK)) {
    return { mode: 'wholeWord', font: correctiveWordFont(word) as string };
  }
  // Silent marker only. Overlay works when each marked letter is isolated from
  // its neighbours (so the inline-block overlay box breaks no visible join).
  const units = splitLetterUnits(word);
  for (let i = 0; i < units.length; i++) {
    if (!units[i].includes(SILENT_MARK)) continue;
    const base = firstBaseLetter(units[i]);
    const prevBase = i > 0 ? firstBaseLetter(units[i - 1]) : undefined;
    const baseIsolatable = !!base && NON_JOINING_TO_NEXT.has(base);
    const prevIsolatable = !prevBase || NON_JOINING_TO_NEXT.has(prevBase);
    if (!(baseIsolatable && prevIsolatable)) {
      return { mode: 'wholeWord', font: correctiveWordFont(word) as string };
    }
  }
  return { mode: 'overlay' };
};

/**
 * The silent-marker circle, drawn in Amiri as an absolute overlay above a
 * letter. The wrapping element must be position:relative; display:inline-block;
 * line-height:1 so the offset hugs the glyph. Colour inherits (so greyed silent
 * letters keep their colour).
 */
export const SilentCircleOverlay: React.FC = () => (
  <span
    aria-hidden="true"
    style={{
      position: 'absolute',
      left: '40%',
      top: '0.16em',
      transform: 'translate(-50%, -50%)',
      fontFamily: AMIRI_REGULAR_STACK,
      fontSize: '0.72em',
      lineHeight: 1,
      pointerEvents: 'none',
    }}
  >
    {SILENT_MARK}
  </span>
);

/**
 * Render one letter unit with the silent circle overlaid (U+06DF stripped from
 * the text so the wrong glyph never shows). Keeps the base letter in whatever
 * font it inherits. `className` is applied to the inline-block wrapper.
 */
export const renderSilentLetter = (unit: string, key?: React.Key, className?: string): React.ReactNode => (
  <span
    key={key}
    className={className}
    style={{ position: 'relative', display: 'inline-block', lineHeight: 1 }}
  >
    {unit.replace(/۟/g, '')}
    <SilentCircleOverlay />
  </span>
);

/** True if this letter unit carries the silent marker. */
export const hasSilentMark = (unit: string): boolean => unit.includes(SILENT_MARK);

/**
 * Render a word as React nodes per its plan. Use at plain-text word render
 * sites (where the word would otherwise be printed as a single string).
 */
export const renderWordWithMarks = (word: string, keyPrefix = ''): React.ReactNode => {
  const plan = wordMarkPlan(word);
  if (plan.mode === 'none') return word;
  if (plan.mode === 'wholeWord') {
    return <span style={{ fontFamily: plan.font }}>{word}</span>;
  }
  // overlay: keep the whole word in the selected font; overlay circles on the
  // silent-marked letters. Unmarked runs stay as plain text (one shaping run).
  const units = splitLetterUnits(word);
  const out: React.ReactNode[] = [];
  let buf = '';
  let k = 0;
  const flush = () => {
    if (buf) { out.push(<React.Fragment key={`${keyPrefix}t${k++}`}>{buf}</React.Fragment>); buf = ''; }
  };
  for (const unit of units) {
    if (hasSilentMark(unit)) {
      flush();
      out.push(renderSilentLetter(unit, `${keyPrefix}m${k++}`));
    } else {
      buf += unit;
    }
  }
  flush();
  return <>{out}</>;
};

/**
 * Returns the text unchanged. Kept for legacy call sites; new code should use
 * renderWordWithMarks / wordMarkPlan.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const renderQuranicMarks = (text: string, _keyPrefix = ''): React.ReactNode => text;
