import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Corrective-font rendering for Quranic marks the bundled fonts get wrong.
//
// Three marks need a different font than the user-selected Quranic font:
//   • U+06EA imāla  (only Hud 11:41  مَجْر۪ىٰهَا) → a small DOT under the letter.
//     The bundled fonts ship a broken glyph (aliased to U+0600); only
//     'Uthmanic HAFS v22' draws the authentic dot. Amiri draws a diamond.
//   • U+06EB ishmām (only Yusuf 12:11 تَأْمَ۫نَّا) → 'Amiri Quran' renders this
//     correctly; the bundled fonts show a broken disc.
//   • U+06DF silent marker (Small High Rounded Zero) → 'Amiri Regular' shows a
//     clean circle. This is the existing behaviour, preserved here.
//
// A base letter and its combining mark MUST shape in a single font, so the
// imāla/ishmām overrides wrap the whole grapheme cluster (base + mark). The
// silent marker, by contrast, keeps its long-standing per-character treatment
// so the base letter stays in the selected font (changing it would alter many
// verses across the muṣḥaf).
// ─────────────────────────────────────────────────────────────────────────────

const IMALA_MARK  = '۪';
const ISHMAM_MARK = '۫';
const SILENT_MARK = '۟';

const UTHMANIC_V22_STACK = "'Uthmanic HAFS v22', 'Amiri Quran', serif"; // imāla: dot under
const AMIRI_QURAN_STACK  = "'Amiri Quran', 'Amiri Regular', serif";     // ishmām
const AMIRI_REGULAR      = "'Amiri Regular', serif";                    // silent marker

/** True if the text contains any mark that needs a corrective font. */
export const hasSpecialQuranMark = (text: string): boolean =>
  text.includes(IMALA_MARK) || text.includes(ISHMAM_MARK) || text.includes(SILENT_MARK);

/** Split into grapheme clusters so combining marks stay attached to their base. */
const splitGraphemes = (text: string): string[] => {
  if (typeof Intl !== 'undefined' && typeof (Intl as Record<string, unknown>).Segmenter === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seg = new (Intl as any).Segmenter('ar', { granularity: 'grapheme' });
    return [...seg.segment(text)].map((s: { segment: string }) => s.segment);
  }
  const parts: string[] = [];
  let cur = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const isCombining =
      (cp >= 0x0610 && cp <= 0x061a) ||
      (cp >= 0x064b && cp <= 0x065f) ||
      cp === 0x0670 ||
      (cp >= 0x06d6 && cp <= 0x06ed);
    if (isCombining && cur) cur += ch;
    else { if (cur) parts.push(cur); cur = ch; }
  }
  if (cur) parts.push(cur);
  return parts;
};

/** Per-character U+06DF → 'Amiri Regular' (the pre-existing silent-marker fix). */
const renderSilentMarker = (text: string, keyPrefix: string): React.ReactNode => {
  if (!text.includes(SILENT_MARK)) return text;
  const out: React.ReactNode[] = [];
  let buf = '';
  let i = 0;
  for (const ch of text) {
    if (ch === SILENT_MARK) {
      if (buf) { out.push(<span key={`${keyPrefix}b${i++}`}>{buf}</span>); buf = ''; }
      out.push(<span key={`${keyPrefix}s${i++}`} style={{ fontFamily: AMIRI_REGULAR }}>{ch}</span>);
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(<span key={`${keyPrefix}b${i++}`}>{buf}</span>);
  return <>{out}</>;
};

/**
 * Render Quranic text, switching only the affected clusters to a corrective
 * font. Returns the original string untouched when nothing special is present.
 */
export const renderQuranicMarks = (text: string, keyPrefix = ''): React.ReactNode => {
  if (!hasSpecialQuranMark(text)) return text;
  // Fast path: only silent markers → keep the simple per-character treatment.
  if (!text.includes(IMALA_MARK) && !text.includes(ISHMAM_MARK)) {
    return renderSilentMarker(text, keyPrefix);
  }
  return splitGraphemes(text).map((cluster, idx) => {
    const chars = [...cluster];
    if (chars.includes(IMALA_MARK)) {
      return <span key={`${keyPrefix}${idx}`} style={{ fontFamily: UTHMANIC_V22_STACK, lineHeight: 1, verticalAlign: 'baseline' }}>{cluster}</span>;
    }
    if (chars.includes(ISHMAM_MARK)) {
      return <span key={`${keyPrefix}${idx}`} style={{ fontFamily: AMIRI_QURAN_STACK, lineHeight: 1, verticalAlign: 'baseline' }}>{cluster}</span>;
    }
    // Other clusters: preserve the per-character silent-marker handling.
    return <React.Fragment key={`${keyPrefix}${idx}`}>{renderSilentMarker(cluster, `${keyPrefix}${idx}-`)}</React.Fragment>;
  });
};
