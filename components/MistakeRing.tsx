import React from 'react';
import { Mistake } from '../types';
import { PERM_MISTAKE_FLAGS_KEY, isLetterMistakeKey } from '../constants';
import { useI18n } from '../context/I18nProvider';

// ─────────────────────────────────────────────────────────────────────────────
// MistakeRing — the letter-click mistake logger as a two-ring donut chart.
//
//   OUTER ring  — 4 permanent habits (toggles; on/off, not per-occurrence).
//   MIDDLE ring — the mistake areas for the ACTIVE mode, each ONE slice in its
//                 own hue with its variants stacked as concentric layers.
//   CENTER      — free-text box + cancel (or a summary in readOnly mode).
//
// Two sets of areas share the same ring: MISTAKE_AREAS (reading errors, the "r"
// key) and TAJWEED_AREAS (tajweed errors, the "t" key). Which one is drawn is
// purely the `areas` prop — everything else about the component is identical.
// ─────────────────────────────────────────────────────────────────────────────

export interface MistakeArea {
  name: string;
  title: string;          // human label (study page)
  color: string;          // base hex
  subs: string[];         // logged errorText labels, in order
}

/** Sentinel meaning "log this letter with no comment at all" — pressing Enter
 *  on the empty text box picks it, and the parent turns it into an EMPTY
 *  errorText. It is deliberately NOT one of MISTAKE_AREAS: a plain highlight
 *  gets no ring segment and is not counted. */
export const EMPTY_MISTAKE_LABEL = '(No comment)';

/** Custom (free-text) mistakes only count from this moment on — the tutor asked
 *  for a clean ring, since years of old free-text notes were noise. Notes that
 *  map onto a FIXED label (Fatha, sukoon → Sakin, letter names, …) are
 *  unaffected and still fold in from all of history. Clear this constant to
 *  bring the old custom notes back. */
export const CUSTOM_MISTAKES_SINCE = Date.parse('2026-07-30T18:00:00Z');

// Fixed areas in the tutor's required order. Letter recognition logs the bare
// transliteration of the letter ("meem"), not a sentence — see onPick.
export const MISTAKE_AREAS: MistakeArea[] = [
  { name: 'length',   title: 'Length',        color: '#0ea5a4', subs: ['Short', 'Long'] },
  { name: 'hold',     title: 'Hold',          color: '#7c86f8', subs: ['Hold', 'No Hold'] },
  { name: 'harakah',  title: 'Harakah',       color: '#f0a626', subs: ['Fatha', 'Kasrah', 'Dammah'] },
  { name: 'ignoreVowel', title: 'Ignore vowel', color: '#d64550', subs: ['Ignore vowel'] },
  { name: 'sakin',    title: 'Sakin',         color: '#a8763e', subs: ['Sakin'] },
  { name: 'tanween',  title: 'Tanween',       color: '#c2569e', subs: ['Tanween'] },
  { name: 'silence',  title: 'Silence',       color: '#f26d8c', subs: ['Silent', 'Not Silent'] },
  { name: 'weight',   title: 'Weight',        color: '#a186f2', subs: ['Heavy', 'Light'] },
  { name: 'change',   title: 'Letter change', color: '#3cb2ec', subs: ['Change to Alif', 'Change to Ha'] },
  { name: 'weakLetter', title: 'Weak letter',  color: '#16a34a', subs: ['Weak letter'] },
  { name: 'stop',     title: 'Stop',          color: '#8fc93a', subs: ['Stop', 'No Stop'] },
  { name: 'recognition', title: 'Letter recognition', color: '#f59a63', subs: ['Letter recognition'] },
];
export const FIXED_MISTAKE_LABELS = new Set(MISTAKE_AREAS.flatMap(a => a.subs));

// ── Tajweed areas (the "t" mode) ─────────────────────────────────────────────
// One slice per rule. Colours are lifted from the QPC tajweed palette used by
// the on-screen colouring (services/tajweedColorService), so a rule looks the
// same in the ring as it does in the verse. Izhar and oral izhar have no QPC
// colour (they are the "pronounce it plainly" rules) — they get neutral hues.
export const TAJWEED_AREAS: MistakeArea[] = [
  { name: 'ghunnah',      title: 'Ghunnah',          color: '#FF7E1E', subs: ['Ghunnah'] },
  { name: 'qalqalah',     title: 'Qalqalah',         color: '#DD0008', subs: ['Qalqalah'] },
  { name: 'madd',         title: 'Madd',             color: '#537FFF', subs: ['Madd'] },
  { name: 'izhar',        title: 'Izhar',            color: '#0e9488', subs: ['Izhar'] },
  { name: 'idghamGh',     title: 'Idgham w/ ghunnah', color: '#169777', subs: ['Idgham with ghunnah'] },
  { name: 'idghamNoGh',   title: 'Idgham w/o ghunnah', color: '#169200', subs: ['Idgham without ghunnah'] },
  { name: 'ikhfa',        title: 'Ikhfa',            color: '#9400A8', subs: ['Ikhfa'] },
  { name: 'iqlab',        title: 'Iqlab',            color: '#26BFFD', subs: ['Iqlab'] },
  { name: 'oralIzhar',    title: 'Oral izhar',       color: '#8b5cf6', subs: ['Oral izhar'] },
  { name: 'oralIdgham',   title: 'Oral idgham',      color: '#58B800', subs: ['Oral idgham'] },
  { name: 'oralIkhfa',    title: 'Oral ikhfa',       color: '#D500B7', subs: ['Oral ikhfa'] },
];
export const TAJWEED_MISTAKE_LABELS = new Set(TAJWEED_AREAS.flatMap(a => a.subs));

export const PERMANENT_MISTAKES = ['Fast reading', 'Choppy reading', 'Breaking up words', 'Articulation points'];

// ── Display translations ─────────────────────────────────────────────────────
// The English labels above are STORED in mistake data as keys — they must
// never change. Translation is display-only: run any label through
// mistakeLabel(text, language) at render time.
const LABELS_AR: Record<string, string> = {
  'Length': 'المدّ الطبيعي', 'Short': 'قصير', 'Long': 'طويل',
  'Hold': 'تمكين', 'No Hold': 'بدون تمكين',
  'Harakah': 'الحركة', 'Fatha': 'فتحة', 'Kasrah': 'كسرة', 'Dammah': 'ضمة',
  'Sakin': 'ساكن', 'Tanween': 'تنوين',
  'Silence': 'الإسكات', 'Silent': 'ساكت', 'Not Silent': 'غير ساكت',
  'Weight': 'التفخيم', 'Heavy': 'مفخّم', 'Light': 'مرقّق',
  'Letter change': 'تغيير حرف', 'Change to Alif': 'إبدال ألفاً', 'Change to Ha': 'إبدال هاءً',
  'Stop': 'الوقف', 'No Stop': 'بدون وقف',
  'Letter recognition': 'معرفة الحرف',
  'Ignore vowel': 'إهمال الحركة', 'Weak letter': 'حرف علة',
  'Ghunnah': 'غنّة', 'Qalqalah': 'قلقلة', 'Madd': 'مدّ', 'Izhar': 'إظهار',
  'Idgham w/ ghunnah': 'إدغام بغنّة', 'Idgham with ghunnah': 'إدغام بغنّة',
  'Idgham w/o ghunnah': 'إدغام بلا غنّة', 'Idgham without ghunnah': 'إدغام بلا غنّة',
  'Ikhfa': 'إخفاء', 'Iqlab': 'إقلاب',
  'Oral izhar': 'إظهار شفوي', 'Oral idgham': 'إدغام شفوي', 'Oral ikhfa': 'إخفاء شفوي',
  'Fast reading': 'قراءة سريعة', 'Choppy reading': 'قراءة متقطعة',
  'Breaking up words': 'تقطيع الكلمات', 'Articulation points': 'مخارج الحروف',
  '(No comment)': '(بدون تعليق)',
};
const LABELS_TR: Record<string, string> = {
  'Length': 'Uzatma', 'Short': 'Kısa', 'Long': 'Uzun',
  'Hold': 'Tutma', 'No Hold': 'Tutmasız',
  'Harakah': 'Hareke', 'Fatha': 'Fetha', 'Kasrah': 'Kesra', 'Dammah': 'Ötre',
  'Sakin': 'Sâkin', 'Tanween': 'Tenvin',
  'Silence': 'Susma', 'Silent': 'Sessiz', 'Not Silent': 'Sessiz değil',
  'Weight': 'Kalınlık', 'Heavy': 'Kalın', 'Light': 'İnce',
  'Letter change': 'Harf değişimi', 'Change to Alif': 'Elife çevirme', 'Change to Ha': 'He’ye çevirme',
  'Stop': 'Vakıf', 'No Stop': 'Vakıfsız',
  'Letter recognition': 'Harf tanıma',
  'Ignore vowel': 'Hareke atlama', 'Weak letter': 'İllet harfi',
  'Ghunnah': 'Ğunne', 'Qalqalah': 'Kalkale', 'Madd': 'Med', 'Izhar': 'İzhar',
  'Idgham w/ ghunnah': 'Ğunneli idğam', 'Idgham with ghunnah': 'Ğunneli idğam',
  'Idgham w/o ghunnah': 'Ğunnesiz idğam', 'Idgham without ghunnah': 'Ğunnesiz idğam',
  'Ikhfa': 'İhfa', 'Iqlab': 'İklab',
  'Oral izhar': 'Şefevî izhar', 'Oral idgham': 'Şefevî idğam', 'Oral ikhfa': 'Şefevî ihfa',
  'Fast reading': 'Hızlı okuma', 'Choppy reading': 'Kesik okuma',
  'Breaking up words': 'Kelime bölme', 'Articulation points': 'Mahreçler',
  '(No comment)': '(Yorum yok)',
};

/** Display-translate a stored mistake label. Unknown labels pass through. */
export const mistakeLabel = (text: string, language: string): string => {
  if (language === 'ar') return LABELS_AR[text] ?? text;
  if (language === 'tr') return LABELS_TR[text] ?? text;
  return text;
};

// ── Letter transliteration (Letter recognition + history normalization) ──────
export const TRANSLIT: Record<string, string> = {
  'ا': 'alif', 'أ': 'alif', 'إ': 'alif', 'آ': 'alif', 'ٱ': 'alif', 'ب': 'ba', 'ت': 'ta',
  'ث': 'tha', 'ج': 'jeem', 'ح': 'haa', 'خ': 'kha', 'د': 'dal', 'ذ': 'dhal', 'ر': 'ra',
  'ز': 'zay', 'س': 'seen', 'ش': 'sheen', 'ص': 'saad', 'ض': 'daad', 'ط': 'taa', 'ظ': 'dhaa',
  'ع': 'ayn', 'غ': 'ghayn', 'ف': 'fa', 'ق': 'qaf', 'ك': 'kaf', 'ل': 'lam', 'م': 'meem',
  'ن': 'noon', 'ه': 'ha', 'و': 'waw', 'ي': 'ya', 'ى': 'ya', 'ئ': 'hamza', 'ؤ': 'hamza',
  'ء': 'hamza', 'ة': 'ta marbuta',
};
/** translit → the base Arabic glyph (first spelling wins, so alif is ا not آ).
 *  Lets a report show the letter itself next to the transliteration. */
export const ARABIC_LETTER_OF: Record<string, string> = Object.entries(TRANSLIT)
  .reduce((acc, [glyph, translit]) => {
    if (!(translit in acc)) acc[translit] = glyph;
    return acc;
  }, {} as Record<string, string>);

export const translitOf = (glyph: string): string => {
  for (const ch of glyph) { const t = TRANSLIT[ch]; if (t) return t; }
  return glyph.replace(/[ً-ٰٟۖ-ۭ‍]/g, '') || glyph;
};

const LETTER_NAMES = new Set([
  ...Object.values(TRANSLIT),
  'hamzah', 'alef', 'aleph', 'jim', 'geem', 'ain', 'ayin', 'ghain', 'zain', 'thal',
  'dhaal', 'sad', 'dad', 'shin', 'sin', 'teh', 'tah', 'heh', 'mim', 'miim', 'nun',
  'baa', 'yaa', 'waaw', 'raa', 'daal', 'kaaf', 'laam', 'qaaf', 'faa', 'khaa',
]);

export interface RingData {
  counts: Record<string, number>;              // fixed reading label → count
  customAll: Array<[string, number]>;          // every reading custom (study page)
  permFlags: string[];
  letterConfusions: Array<[string, number]>;   // translit → count (Letter ?)
  total: number;                               // all counted reading mistakes
  tajweedCounts: Record<string, number>;       // fixed tajweed label → count
  tajweedCustomAll: Array<[string, number]>;   // free-text tajweed notes
  tajweedTotal: number;                        // all counted tajweed mistakes
}

/** Shared history → ring-data folding. Case-insensitive against the fixed
 *  labels, aliases fold in (Stretch → Long), bare letter names count as
 *  Letter recognition, green tajweed-mode logs go to the tajweed ring. */
const FIXED_BY_LC = new Map([...FIXED_MISTAKE_LABELS].map(l => [l.toLowerCase(), l] as const));
const ALIASES: Record<string, string> = { 'stretch': 'Long', 'sukoon': 'Sakin', 'saakin': 'Sakin', 'sukun': 'Sakin', 'sakinah': 'Sakin', 'tanwin': 'Tanween', 'tanveen': 'Tanween', 'tanwīn': 'Tanween' };

const TAJWEED_BY_LC = new Map([...TAJWEED_MISTAKE_LABELS].map(l => [l.toLowerCase(), l] as const));
/** Older / shorthand spellings that fold onto a fixed tajweed label. */
const TAJWEED_ALIASES: Record<string, string> = {
  'ikhafa': 'Ikhfa', 'ikhfaa': 'Ikhfa', 'ekhfa': 'Ikhfa',
  'qalaqah': 'Qalqalah', 'qalqala': 'Qalqalah',
  'madd tabee': 'Madd', 'mad': 'Madd', 'madda': 'Madd',
  'idgham': 'Idgham with ghunnah',
  'idgham bighunnah': 'Idgham with ghunnah', 'idgham with ghunna': 'Idgham with ghunnah',
  'idgham bila ghunnah': 'Idgham without ghunnah', 'idgham without ghunna': 'Idgham without ghunnah',
  'idgham shafawi': 'Oral idgham', 'shafawi idgham': 'Oral idgham',
  'ikhfa shafawi': 'Oral ikhfa', 'ikhafa shafawi': 'Oral ikhfa', 'shafawi ikhfa': 'Oral ikhfa',
  'izhar shafawi': 'Oral izhar', 'shafawi izhar': 'Oral izhar',
  'idhar': 'Izhar', 'izhaar': 'Izhar',
  'iklab': 'Iqlab', 'qalb': 'Iqlab',
  'ghunna': 'Ghunnah', 'ghunnah': 'Ghunnah',
};

/** What one logged mistake counts as. null = not counted at all (green tajweed
 *  log, highlight-only mark, or a pre-cutoff free-text note).
 *  Single source of truth for the reading ring AND the session table — they
 *  must never disagree about what a mistake is. */
export type MistakeClass =
  | { kind: 'fixed'; label: string }
  | { kind: 'letter'; letter: string }
  | { kind: 'custom'; label: string };

/** A free-text note only counts once it is recent enough — see CUSTOM_MISTAKES_SINCE. */
const customIsRecent = (m: Mistake): boolean => {
  const t = m.date ? Date.parse(m.date) : NaN;
  return !isNaN(t) && t >= CUSTOM_MISTAKES_SINCE;
};

export const classifyMistake = (m: Mistake): MistakeClass | null => {
  if (m.errorType === 'tajweed') return null;   // green logs go to classifyTajweed
  const raw = m.errorText?.trim();
  if (!raw) return null;                        // highlight-only mark
  const lc = raw.toLowerCase();
  // "Letter recognition (meem)" is the pre-2026-08 format; a bare letter name
  // ("meem") is what the ring logs now. Both land on the same letter row.
  const recogMatch = lc.match(/^letter recognition\s*\(?\s*([^)]*)/);
  if (recogMatch || LETTER_NAMES.has(lc)) {
    return { kind: 'letter', letter: (recogMatch ? recogMatch[1].trim() : lc) || 'unknown' };
  }
  if (FIXED_BY_LC.has(lc)) return { kind: 'fixed', label: FIXED_BY_LC.get(lc)! };
  if (ALIASES[lc]) return { kind: 'fixed', label: ALIASES[lc] };
  // Free-text: only from the cutoff on (older ones are ignored entirely).
  return customIsRecent(m) ? { kind: 'custom', label: raw } : null;
};

/** Tajweed counterpart: only green (errorType 'tajweed') logs, folded onto the
 *  eleven fixed rules, with anything else kept as a recent free-text note. */
export type TajweedClass = { kind: 'fixed'; label: string } | { kind: 'custom'; label: string };

export const classifyTajweed = (m: Mistake): TajweedClass | null => {
  if (m.errorType !== 'tajweed') return null;
  const raw = m.errorText?.trim();
  if (!raw) return null;                        // highlight-only green mark
  const lc = raw.toLowerCase();
  if (TAJWEED_BY_LC.has(lc)) return { kind: 'fixed', label: TAJWEED_BY_LC.get(lc)! };
  if (TAJWEED_ALIASES[lc]) return { kind: 'fixed', label: TAJWEED_ALIASES[lc] };
  return customIsRecent(m) ? { kind: 'custom', label: raw } : null;
};

export const computeRingData = (mistakes: Record<string, Mistake>, excludeKey?: string | null): RingData => {
  const counts: Record<string, number> = {};
  const custom = new Map<string, number>();
  const confusions = new Map<string, number>();
  const tajweedCounts: Record<string, number> = {};
  const tajweedCustom = new Map<string, number>();
  for (const [k, m] of Object.entries(mistakes)) {
    if (!isLetterMistakeKey(k)) continue;
    if (excludeKey && k === excludeKey) continue;   // the letter being edited right now
    if (m.errorType === 'tajweed') {
      const tj = classifyTajweed(m);
      if (!tj) continue;
      if (tj.kind === 'fixed') tajweedCounts[tj.label] = (tajweedCounts[tj.label] ?? 0) + 1;
      else tajweedCustom.set(tj.label, (tajweedCustom.get(tj.label) ?? 0) + 1);
      continue;
    }
    const cls = classifyMistake(m);
    if (!cls) continue;
    if (cls.kind === 'letter') {
      counts['Letter recognition'] = (counts['Letter recognition'] ?? 0) + 1;
      confusions.set(cls.letter, (confusions.get(cls.letter) ?? 0) + 1);
    } else if (cls.kind === 'fixed') {
      counts[cls.label] = (counts[cls.label] ?? 0) + 1;
    } else {
      custom.set(cls.label, (custom.get(cls.label) ?? 0) + 1);
    }
  }
  const customAll = [...custom.entries()].sort((a, b) => b[1] - a[1]);
  const tajweedCustomAll = [...tajweedCustom.entries()].sort((a, b) => b[1] - a[1]);
  const permFlags = mistakes[PERM_MISTAKE_FLAGS_KEY]?.errorText?.split('|').filter(Boolean) ?? [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + customAll.reduce((a, [, c]) => a + c, 0);
  const tajweedTotal = Object.values(tajweedCounts).reduce((a, b) => a + b, 0)
    + tajweedCustomAll.reduce((a, [, c]) => a + c, 0);
  return {
    counts,
    customAll,
    permFlags,
    letterConfusions: [...confusions.entries()].sort((a, b) => b[1] - a[1]),
    total,
    tajweedCounts,
    tajweedCustomAll,
    tajweedTotal,
  };
};

// Short display names so labels fit the arc (logged text stays the full label).
const DISPLAY: Record<string, string> = {
  'No Hold': 'No hold', 'Not Silent': 'Not silent', 'Change to Alif': 'To Alif',
  'Change to Ha': 'To Ha', 'No Stop': 'No stop', 'Letter recognition': 'Letter ?',
  'Ignore vowel': 'Ign. vowel', 'Weak letter': 'Weak ltr',
};
/** Labels too long for a single arc get stacked on two arcs inside their layer. */
const DISPLAY_2LINE: Record<string, [string, string]> = {
  'Idgham with ghunnah': ['Idgham', 'with ghunnah'],
  'Idgham without ghunnah': ['Idgham', 'no ghunnah'],
  'Ignore vowel': ['Ignore', 'vowel'],
  'Weak letter': ['Weak', 'letter'],
};
const FLAG_DISPLAY: Record<string, string> = {
  'Fast reading': 'Fast', 'Choppy reading': 'Choppy',
  'Breaking up words': 'Breaks words', 'Articulation points': 'Articulation',
};

const CX = 215, CY = 215;
// Two rings only. The middle band reaches almost to the centre hole now that the
// custom-mistake inner ring is gone, so every label gets a fatter arc to sit on.
const R_HOLE = 78, R_MID0 = 86, R_MID1 = 176, R_OUT0 = 192, R_OUT1 = 212;

const pt = (r: number, aDeg: number): [number, number] => {
  const a = ((aDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
/** Annular sector path from angle a0→a1 (degrees clockwise, 0 = top). */
const sector = (r0: number, r1: number, a0: number, a1: number): string => {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
};

/** Text following the ring's curve. Bottom-half arcs run reversed so the
 *  text never renders upside down; the font auto-fits the arc length. */
const ArcText: React.FC<{ id: string; r: number; a0: number; a1: number; text: string; fill: string; size?: number; weight?: number }> =
  ({ id, r, a0, a1, text, fill, size = 10, weight = 700 }) => {
    const mid = (a0 + a1) / 2;
    const flip = mid > 90 && mid < 270;
    const arcLen = (r * (a1 - a0) * Math.PI) / 180;
    size = Math.max(6, Math.min(size, (arcLen - 3) / (text.length * 0.58)));
    const rr = flip ? r + size * 0.38 : r - size * 0.38;
    const [x0, y0] = pt(rr, flip ? a1 : a0);
    const [x1, y1] = pt(rr, flip ? a0 : a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    const d = `M${x0.toFixed(2)},${y0.toFixed(2)} A${rr},${rr} 0 ${large} ${flip ? 0 : 1} ${x1.toFixed(2)},${y1.toFixed(2)}`;
    return (
      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <path id={id} d={d} fill="none" />
        <text fill={fill} fontSize={size} fontWeight={weight}>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
        </text>
      </g>
    );
  };

interface MistakeRingProps {
  counts: Record<string, number>;
  permFlags: string[];
  /** Which set of areas the middle ring draws. Defaults to reading mistakes. */
  areas?: MistakeArea[];
  /** Only changes the wording/tint — the ring itself is mode-agnostic. */
  mode?: 'reading' | 'tajweed';
  translit?: string;
  errorText?: string;
  readOnly?: boolean;                          // study view: no logging, summary center
  onTextChange?: (v: string) => void;
  onPick?: (label: string) => void;
  onToggleFlag?: (flag: string) => void;
  onSubmitText?: () => void;
  onCancel?: () => void;
}

const GAP = 1.4;   // degrees between slices
const RGAP = 2;    // radial gap between stacked layers

const MistakeRing: React.FC<MistakeRingProps> = ({
  counts, permFlags, areas = MISTAKE_AREAS, mode = 'reading', translit = '',
  errorText = '', readOnly = false, onTextChange, onPick, onToggleFlag, onSubmitText, onCancel,
}) => {
  const { language } = useI18n();
  const inputRef = React.useRef<HTMLInputElement>(null);
  // <textPath href="#id"> resolves against the whole document, so two rings on
  // one page (the study view shows reading + tajweed side by side) would share
  // arcs and print their labels on top of each other. Namespace every id.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  React.useEffect(() => { if (!readOnly) inputRef.current?.focus({ preventScroll: true }); }, [readOnly]);
  React.useEffect(() => {
    if (readOnly) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const totalFixed = areas.reduce((s, a) => s + a.subs.reduce((x, l) => x + (counts[l] ?? 0), 0), 0);

  const areaWeight = (a: MistakeArea) => {
    const c = a.subs.reduce((x, l) => x + (counts[l] ?? 0), 0);
    return totalFixed === 0 ? 1 : 0.55 + 3.2 * (c / totalFixed);
  };
  const weights = areas.map(areaWeight);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const isTajweed = mode === 'tajweed';

  // Middle ring: one slice per area, subs stacked as concentric layers.
  const middle: React.ReactNode[] = [];
  let angle = 0;
  areas.forEach((area, ai) => {
    const span = (weights[ai] / wSum) * 360;
    const a0 = angle + GAP / 2, a1 = angle + span - GAP / 2;
    const n = area.subs.length;
    const layerH = (R_MID1 - R_MID0 - RGAP * (n - 1)) / n;
    area.subs.forEach((label, si) => {
      const r1 = R_MID1 - si * (layerH + RGAP);
      const r0 = r1 - layerH;
      const on = (counts[label] ?? 0) > 0;
      // Stored labels stay English; only what's DRAWN follows the site language.
      const display = language === 'en' ? (DISPLAY[label] ?? label) : mistakeLabel(label, language);
      const twoLine = language === 'en' && layerH >= 44 ? DISPLAY_2LINE[label] : undefined;
      const ink = on ? '#ffffff' : '#3f4c5e';
      middle.push(
        <g key={`m-${label}`} className={readOnly ? undefined : 'mr-seg'} onClick={() => { if (!readOnly) onPick?.(label); }}>
          <title>{mistakeLabel(label, language)}{(counts[label] ?? 0) > 0 ? ` · ${counts[label]}×` : ''}</title>
          <path d={sector(r0, r1, a0, a1)}
            fill={on ? area.color : '#ffffff'} fillOpacity={on ? 0.92 - si * 0.16 : 0.92}
            stroke={on ? '#ffffff' : '#dbe2ea'} strokeOpacity={0.9} strokeWidth={1.5} />
          {twoLine ? (() => {
            // On the bottom half of the ring a LARGER radius sits lower on
            // screen, so the two lines have to swap to keep reading top-down.
            const mid = (a0 + a1) / 2;
            const flip = mid > 90 && mid < 270;
            const far = r0 + layerH * 0.68, near = r0 + layerH * 0.30;
            return (
              <>
                <ArcText id={`mr-${uid}-m-${ai}-${si}a`} r={flip ? near : far} a0={a0} a1={a1} text={twoLine[0]} fill={ink} size={12} />
                <ArcText id={`mr-${uid}-m-${ai}-${si}b`} r={flip ? far : near} a0={a0} a1={a1} text={twoLine[1]} fill={ink} size={10} />
              </>
            );
          })() : (
            <ArcText id={`mr-${uid}-m-${ai}-${si}`} r={(r0 + r1) / 2} a0={a0} a1={a1} text={display} fill={ink} size={11} />
          )}
        </g>
      );
    });
    angle += span;
  });

  // Outer ring — permanent habit toggles (4 × 90°).
  const outer = PERMANENT_MISTAKES.map((flag, i) => {
    const a0 = i * 90, a1 = (i + 1) * 90;
    const on = permFlags.includes(flag);
    return (
      <g key={`o-${flag}`} className={readOnly ? undefined : 'mr-seg'} onClick={() => { if (!readOnly) onToggleFlag?.(flag); }}>
        <title>{flag}</title>
        <path d={sector(R_OUT0, R_OUT1, a0 + GAP / 2, a1 - GAP / 2)}
          fill={on ? '#10b981' : '#ffffff'} fillOpacity={on ? 0.9 : 0.88}
          stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.5} />
        <ArcText id={`mr-${uid}-o-${i}`} r={(R_OUT0 + R_OUT1) / 2} a0={a0 + GAP / 2} a1={a1 - GAP / 2}
          text={`${on ? '✓ ' : ''}${FLAG_DISPLAY[flag]}`} fill={on ? '#ffffff' : '#475569'} size={11} />
      </g>
    );
  });

  return (
    <div dir="ltr" className="relative pointer-events-auto" style={{ width: 'min(88vw, 78vh, 560px)', height: 'min(88vw, 78vh, 560px)' }}>
      <svg viewBox="0 0 430 430" className="w-full h-full" style={{ filter: 'drop-shadow(0 10px 24px rgba(15,23,42,0.30))' }}>
        <circle cx={CX} cy={CY} r={R_OUT1 + 3} fill={isTajweed ? '#f0fdf4' : '#f6f8fb'} fillOpacity={0.75} />
        <circle cx={CX} cy={CY} r={(R_MID1 + R_OUT0) / 2} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={2} />
        <circle cx={CX} cy={CY} r={R_HOLE} fill="#ffffff" fillOpacity={0.97}
          stroke={isTajweed ? '#86efac' : '#e2e8f0'} strokeWidth={isTajweed ? 2.5 : 1} />
        {!readOnly && <style>{`.mr-seg { cursor: pointer; } .mr-seg:hover path { filter: brightness(0.92) saturate(1.35); }`}</style>}
        {outer}
        {middle}
      </svg>
      {/* Center hole */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto flex flex-col items-center gap-1 text-center" style={{ width: '31%' }}>
          {readOnly ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-none">
                {isTajweed ? 'Tajweed' : 'Mistakes'}
              </p>
              <p className="text-2xl font-black text-slate-700 leading-none">{totalFixed}</p>
            </>
          ) : (
            <>
              <p className={`text-[9px] font-black uppercase tracking-wide leading-none ${isTajweed ? 'text-emerald-600' : 'text-rose-500'}`}>
                {isTajweed ? 'Tajweed' : 'Reading'}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 leading-none">{translit}</p>
              <input
                ref={inputRef}
                type="text"
                value={errorText}
                onChange={e => onTextChange?.(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    // Enter with nothing typed = highlight-only mistake.
                    if (errorText.trim()) onSubmitText?.(); else onPick?.(EMPTY_MISTAKE_LABEL);
                  }
                  else if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
                }}
                placeholder="Other…"
                className={`w-full text-center text-[11px] bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none border-b border-slate-200 pb-0.5 ${isTajweed ? 'focus:border-emerald-400' : 'focus:border-teal-400'}`}
              />
              <div className="flex items-center gap-1 mt-0.5 flex-wrap justify-center">
                {errorText.trim() && (
                  <button type="button" onClick={() => onSubmitText?.()}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500 text-white hover:bg-teal-600">Log</button>
                )}
                <button type="button" onClick={() => onCancel?.()}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 hover:bg-slate-300">Cancel</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MistakeRing;
