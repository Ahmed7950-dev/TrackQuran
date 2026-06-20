import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Corrective-font rendering for Quranic marks the bundled fonts get wrong.
//
// The fix is now done entirely via CSS @font-face unicode-range rules defined
// in index.html (the 'QuranMarkFix' font family). That keeps Arabic text in a
// single unbroken text run so Safari/iOS correctly connects letter forms.
//
// renderQuranicMarks now returns the string unchanged — callers no longer need
// to do anything special as long as the element (or an ancestor) carries the
// 'font-quranic' class or has 'QuranMarkFix' in its font-family stack.
// ─────────────────────────────────────────────────────────────────────────────

/** True if the text contains any mark that needs a corrective font. */
export const hasSpecialQuranMark = (text: string): boolean =>
  text.includes('۪') || text.includes('۫') || text.includes('۟');

/**
 * Returns the text unchanged. Font substitution for special Quranic marks
 * (U+06DF silent marker, U+06EA imāla, U+06EB ishmām, U+06D6–U+06DE waqf
 * signs) is handled by the 'QuranMarkFix' @font-face unicode-range rules in
 * index.html, which lets the browser select the right glyph without splitting
 * the text into separate spans.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const renderQuranicMarks = (text: string, _keyPrefix = ''): React.ReactNode => text;
