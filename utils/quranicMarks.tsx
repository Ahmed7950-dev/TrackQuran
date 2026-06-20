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

export type WordMarkPlan =
  | { mode: 'none' }
  | { mode: 'wholeWord'; font: string };

/** Decide how to render a word: untouched, or whole word in a corrective font. */
export const wordMarkPlan = (word: string): WordMarkPlan => {
  const font = correctiveWordFont(word);
  return font ? { mode: 'wholeWord', font } : { mode: 'none' };
};

/**
 * Render a word as React nodes. Returns the plain string unless it carries an
 * imāla / ishmām mark, in which case the whole word is wrapped in a corrective
 * font. (U+06DF is handled by the font, so it needs nothing here.)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const renderWordWithMarks = (word: string, _keyPrefix = ''): React.ReactNode => {
  const font = correctiveWordFont(word);
  return font ? <span style={{ fontFamily: font }}>{word}</span> : word;
};
