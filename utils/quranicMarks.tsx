import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Corrective-font handling for three Quranic marks the bundled fonts get wrong:
//   • U+06DF silent marker (Small High Rounded Zero) — Hafs / Uthmanic HAFS v22
//     render it as a detached "dotted circle" placeholder. Amiri Regular and
//     UthmanTN v2-0 draw it correctly.
//   • U+06EA imāla  (only Hud 11:41 مَجْر۪ىٰهَا) — only 'Uthmanic HAFS v22' draws
//     the authentic dot under the letter.
//   • U+06EB ishmām (only Yusuf 12:11 تَأْمَ۫نَّا) — Amiri renders it correctly.
//
// Why per-WORD and not per-mark: a combining mark only attaches to a base letter
// that is shaped in the SAME font run. Putting just the mark (or the mark's
// cluster) in a different font from its neighbours either (a) detaches the mark
// into a dotted circle when the base is in a font lacking the glyph, or (b)
// breaks Arabic letter-joining on iOS/Safari at the font boundary. Rendering the
// WHOLE word in the corrective font keeps every letter + its mark in one font:
// the letters stay joined and the mark attaches. Only the few words that carry
// these marks switch font; everything else stays in the user-selected font.
// ─────────────────────────────────────────────────────────────────────────────

const SILENT_MARK = '۟';
const IMALA_MARK  = '۪';
const ISHMAM_MARK = '۫';

const AMIRI_REGULAR_STACK = "'Amiri Regular', 'Amiri Quran', serif"; // silent + ishmām
const UTHMANIC_V22_STACK  = "'Uthmanic HAFS v22', 'Amiri Quran', serif"; // imāla dot

/** True if the text contains any mark that needs a corrective font. */
export const hasSpecialQuranMark = (text: string): boolean =>
  text.includes(IMALA_MARK) || text.includes(ISHMAM_MARK) || text.includes(SILENT_MARK);

/**
 * If a word contains one of the three problem marks, returns the font-family
 * stack the ENTIRE word should be rendered in so the mark renders correctly and
 * the letters stay joined. Returns null for normal words (keep selected font).
 */
export const correctiveWordFont = (word: string): string | null => {
  if (word.includes(IMALA_MARK)) return UTHMANIC_V22_STACK;
  if (word.includes(SILENT_MARK) || word.includes(ISHMAM_MARK)) return AMIRI_REGULAR_STACK;
  return null;
};

/**
 * Returns the text unchanged (kept for existing call sites). Corrective fonts
 * are now applied at the word level via {@link correctiveWordFont}; this no
 * longer wraps characters in spans, so letters stay connected on iOS/Safari.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const renderQuranicMarks = (text: string, _keyPrefix = ''): React.ReactNode => text;
