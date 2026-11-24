// ─────────────────────────────────────────────────────────────────────────────
// Small pieces shared by the Free Talk verb views: the cards and the editor
// (components/ArabicVerbsTab.tsx), the table (FreeTalkVerbTable.tsx) and the
// practice (FreeTalkPractice.tsx).
// ─────────────────────────────────────────────────────────────────────────────
import { ArabicVerb, TENSES, TenseKey, VerbScript, VerbTable } from '../services/arabicVerbsService';
import { tableOrder } from './arabicVerbPronouns';

export const TENSE_NAME: Record<TenseKey, string> = { past: 'Past', present: 'Present', imperative: 'Imperative' };

/** One colour per tense, the same in the table and the practice. */
export const TENSE_TONE: Record<TenseKey, string> = {
  past: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  present: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  imperative: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
};

export const AR_FONT = "'Amiri', 'Amiri Regular', serif";

export const otherScript = (s: VerbScript): VerbScript => (s === 'arabic' ? 'translit' : 'arabic');

export const cellText = (t: VerbTable | undefined, key: string, script: VerbScript) =>
  ((script === 'arabic' ? t?.cells[key]?.ar : t?.cells[key]?.tr) ?? '').trim();

/** The pronouns of one tense that actually have a form in this script. */
export function filledKeys(v: ArabicVerb, tense: TenseKey, script: VerbScript): string[] {
  const t = v.conjugations[tense];
  if (!t) return [];
  return tableOrder(v.variety, tense, t.dual, t.plural).map(p => p.key).filter(k => cellText(t, k, script));
}

/** The form that names a verb: "he" in the past, as a dictionary does. */
export function headword(v: ArabicVerb, script: VerbScript): string {
  const he = cellText(v.conjugations.past, 's3m', script);
  if (he) return he;
  for (const tense of TENSES) {
    const k = filledKeys(v, tense, script)[0];
    if (k) return cellText(v.conjugations[tense], k, script);
  }
  return '';
}

/** The meaning is stored as "to write"; the editor shows "To" fixed and keeps
 *  only the verb, and the cards show "To Write". */
export const verbPart = (meaning: string) => meaning.replace(/^\s*to\s+/i, '').trim();
export const showMeaning = (meaning: string) => {
  const v = verbPart(meaning);
  return v ? `To ${v.charAt(0).toUpperCase()}${v.slice(1)}` : '';
};
