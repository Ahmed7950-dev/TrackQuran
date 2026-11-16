// ─────────────────────────────────────────────────────────────────────────────
// The pronouns that head a verb table, per variety, in both writings.
//
// Keys are stable across varieties (s1 = "I", p2 = "you all"…) so a cell is
// always found by the same key. Palestinian has no dual and one "you all" /
// "they" for both genders; MSA has the dual and gendered plurals. Imperative
// tables carry only the "you" pronouns: nothing else has an imperative.
// ─────────────────────────────────────────────────────────────────────────────
import type { TenseKey, VerbScript, VerbVariety } from '../services/arabicVerbsService';

export interface Pronoun { key: string; ar: string; tr: string }
export type PronounGroup = 'singular' | 'dual' | 'plural';

const MSA: Record<PronounGroup, Pronoun[]> = {
  singular: [
    { key: 's1',  ar: 'أنا',  tr: 'ana' },
    { key: 's2m', ar: 'أنتَ', tr: 'anta' },
    { key: 's2f', ar: 'أنتِ', tr: 'anti' },
    { key: 's3m', ar: 'هو',   tr: 'huwa' },
    { key: 's3f', ar: 'هي',   tr: 'hiya' },
  ],
  dual: [
    { key: 'd2',  ar: 'أنتما',    tr: 'antumā' },
    { key: 'd3m', ar: 'هما (م)', tr: 'humā (m)' },
    { key: 'd3f', ar: 'هما (ث)', tr: 'humā (f)' },
  ],
  plural: [
    { key: 'p1',  ar: 'نحن',  tr: 'naḥnu' },
    { key: 'p2m', ar: 'أنتم', tr: 'antum' },
    { key: 'p2f', ar: 'أنتنّ', tr: 'antunna' },
    { key: 'p3m', ar: 'هم',   tr: 'hum' },
    { key: 'p3f', ar: 'هنّ',  tr: 'hunna' },
  ],
};

const LEVANTINE: Record<PronounGroup, Pronoun[]> = {
  singular: [
    { key: 's1',  ar: 'أنا',  tr: 'ana' },
    { key: 's2m', ar: 'إنتَ', tr: 'inta' },
    { key: 's2f', ar: 'إنتِ', tr: 'inti' },
    { key: 's3m', ar: 'هو',   tr: 'huwwe' },
    { key: 's3f', ar: 'هي',   tr: 'hiyye' },
  ],
  dual: [],
  plural: [
    { key: 'p1', ar: 'إحنا', tr: 'iḥna' },
    { key: 'p2', ar: 'إنتو', tr: 'intu' },
    { key: 'p3', ar: 'هم',   tr: 'humme' },
  ],
};

const YOU = new Set(['s2m', 's2f', 'd2', 'p2m', 'p2f', 'p2']);

/** The pronouns of one group of one table. */
export function pronounsFor(variety: VerbVariety, tense: TenseKey, group: PronounGroup): Pronoun[] {
  const list = (variety === 'msa' ? MSA : LEVANTINE)[group];
  return tense === 'imperative' ? list.filter(p => YOU.has(p.key)) : list;
}

/** Whether this variety has a dual at all (Palestinian does not). */
export const hasDual = (variety: VerbVariety) => variety === 'msa';

/** Every pronoun a table currently shows, in reading order. */
export function tableOrder(variety: VerbVariety, tense: TenseKey, dual: boolean, plural: boolean): Pronoun[] {
  return [
    ...pronounsFor(variety, tense, 'singular'),
    ...(dual && hasDual(variety) ? pronounsFor(variety, tense, 'dual') : []),
    ...(plural ? pronounsFor(variety, tense, 'plural') : []),
  ];
}

export const pronounLabel = (p: Pronoun, script: VerbScript) => (script === 'arabic' ? p.ar : p.tr);

/** Loose matching for search: no harakat, one alif, one yaa/taa marbuta, no
 *  accents on transliteration, lower case. */
export function normForSearch(s: string): string {
  return (s || '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ʿʾ'’`]/g, '')
    .toLowerCase().trim();
}
