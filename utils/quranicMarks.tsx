import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Corrective-font handling for three Quranic marks the bundled fonts get wrong:
//   • U+06DF silent marker (Small High Rounded Zero) — Hafs / Uthmanic HAFS v22
//     render it as a detached "dotted circle" placeholder. Amiri Regular draws
//     it as a clean circle.
//   • U+06EA imāla  (only Hud 11:41 مَجْر۪ىٰهَا) — only 'Uthmanic HAFS v22' draws
//     the authentic dot under the letter.
//   • U+06EB ishmām (only Yusuf 12:11 تَأْمَ۫نَّا) — Amiri renders it correctly.
//
// A combining mark only attaches to a base letter shaped in the SAME font run,
// and iOS/Safari stops joining Arabic letters across a font boundary. So to fix
// a mark we must render its base letter in the corrective font too — the open
// question is how MUCH text to switch.
//
//   • If the marked letter does not join to its neighbours (e.g. a silent alif
//     at word end, preceded by a wāw — as in قَالُوا۟), we can switch JUST that
//     letter + its mark and leave the rest of the word in the selected font. No
//     join is broken because none existed across those boundaries.
//   • If a connecting letter sits right before the marked letter (e.g. the alif
//     in أَنَا۟, preceded by a joining nūn), switching only that letter would
//     break the join on Safari, so we fall back to rendering the WHOLE word in
//     the corrective font (one font run → letters stay joined, mark attaches).
//
// wordMarkPlan() decides which case applies; renderWordWithMarks() applies it
// for plain-text word render sites, and correctiveFontForUnit() + the plan let
// per-letter render sites do the same.
// ─────────────────────────────────────────────────────────────────────────────

const SILENT_MARK = '۟'; // U+06DF
const IMALA_MARK  = '۪'; // U+06EA
const ISHMAM_MARK = '۫'; // U+06EB

const AMIRI_REGULAR_STACK = "'Amiri Regular', 'Amiri Quran', serif";   // silent + ishmām
const UTHMANIC_V22_STACK  = "'Uthmanic HAFS v22', 'Amiri Quran', serif"; // imāla dot

// Letters that never connect to the FOLLOWING letter (right-joining / non-joining
// forms). If a marked letter is one of these AND the preceding base letter is too
// (or the marked letter starts the word), the marked letter shares no join with
// its neighbours and can be switched to a corrective font on its own.
const NON_JOINING_TO_NEXT = new Set([
  'ا', 'أ', 'إ', 'آ', 'ٱ', // alif forms (U+0627/0623/0625/0622/0671)
  'د', 'ذ',                // dāl, dhāl
  'ر', 'ز',                // rā, zāy
  'و', 'ؤ',                // wāw, wāw-hamza
  'ة',                     // tāʾ marbūṭa
  'ى',                     // alif maqṣūra
  'ء',                     // hamza
]);

const isCombiningMark = (cp: number): boolean =>
  (cp >= 0x0610 && cp <= 0x061a) ||
  (cp >= 0x064b && cp <= 0x065f) ||
  cp === 0x0670 ||
  (cp >= 0x06d6 && cp <= 0x06ed);

/** True if the text contains any mark that needs a corrective font. */
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

/** Corrective font for a single letter unit based on the mark it carries, else null. */
export const correctiveFontForUnit = (unit: string): string | null => {
  if (unit.includes(IMALA_MARK)) return UTHMANIC_V22_STACK;
  if (unit.includes(SILENT_MARK) || unit.includes(ISHMAM_MARK)) return AMIRI_REGULAR_STACK;
  return null;
};

/** Whole-word corrective font (used when a marked letter can't be isolated). */
export const correctiveWordFont = (word: string): string | null => {
  if (word.includes(IMALA_MARK)) return UTHMANIC_V22_STACK;
  if (word.includes(SILENT_MARK) || word.includes(ISHMAM_MARK)) return AMIRI_REGULAR_STACK;
  return null;
};

export type WordMarkPlan =
  | { mode: 'none' }
  | { mode: 'perLetter' }          // switch only the marked letter units
  | { mode: 'wholeWord'; font: string }; // switch the whole word

/**
 * iOS / iPadOS WebKit does not shape Arabic across an inline font boundary: any
 * letter rendered in a different font than its neighbours detaches from them —
 * even at boundaries that should be safe. Desktop Safari / Chrome shape across
 * the boundary fine. So on iOS we never use the per-letter switch; we render the
 * whole marked word in the corrective font (one font run → letters stay joined).
 * iPadOS reports as "MacIntel", so it's distinguished from a real Mac by touch.
 */
const isIOSWebKit = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isAppleTouch =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  // Chrome/Firefox on iOS are still WebKit under the hood, so don't exclude them.
  return isAppleTouch;
};

/**
 * Decide how to render a word's marks: leave it alone, switch only the marked
 * letters (when each is isolatable without breaking a join), or switch the
 * whole word (when a marked letter connects to its neighbour, or always on iOS).
 */
export const wordMarkPlan = (word: string): WordMarkPlan => {
  if (!hasSpecialQuranMark(word)) return { mode: 'none' };
  // iOS can't keep letters joined across a per-letter font switch — use whole word.
  if (isIOSWebKit()) return { mode: 'wholeWord', font: correctiveWordFont(word) as string };
  const units = splitLetterUnits(word);
  for (let i = 0; i < units.length; i++) {
    if (!correctiveFontForUnit(units[i])) continue; // not a marked unit
    const base = firstBaseLetter(units[i]);
    const prevBase = i > 0 ? firstBaseLetter(units[i - 1]) : undefined;
    const baseIsolatable = !!base && NON_JOINING_TO_NEXT.has(base); // doesn't join next
    const prevIsolatable = !prevBase || NON_JOINING_TO_NEXT.has(prevBase); // prev doesn't join in
    if (!(baseIsolatable && prevIsolatable)) {
      return { mode: 'wholeWord', font: correctiveWordFont(word) as string };
    }
  }
  return { mode: 'perLetter' };
};

/**
 * Render a word as React nodes, switching fonts per the plan. Use at plain-text
 * word render sites (where the word is otherwise printed as a single string).
 */
export const renderWordWithMarks = (word: string, keyPrefix = ''): React.ReactNode => {
  const plan = wordMarkPlan(word);
  if (plan.mode === 'none') return word;
  if (plan.mode === 'wholeWord') {
    return <span style={{ fontFamily: plan.font }}>{word}</span>;
  }
  // perLetter: keep unmarked runs in the selected font, switch only marked units.
  const units = splitLetterUnits(word);
  const out: React.ReactNode[] = [];
  let buf = '';
  let k = 0;
  const flush = () => {
    if (buf) { out.push(<React.Fragment key={`${keyPrefix}t${k++}`}>{buf}</React.Fragment>); buf = ''; }
  };
  for (const unit of units) {
    const font = correctiveFontForUnit(unit);
    if (font) {
      flush();
      out.push(<span key={`${keyPrefix}m${k++}`} style={{ fontFamily: font }}>{unit}</span>);
    } else {
      buf += unit;
    }
  }
  flush();
  return <>{out}</>;
};

/**
 * Returns the text unchanged. Kept for legacy call sites that already wrap their
 * output appropriately; new code should use renderWordWithMarks / wordMarkPlan.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const renderQuranicMarks = (text: string, _keyPrefix = ''): React.ReactNode => text;
