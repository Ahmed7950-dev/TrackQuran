// utils/tajweedExercises.ts
// -----------------------------------------------------------------------------
// The ten rules the tajweed exercise drills, and the search that finds verses
// for them.
//
// EIGHT of the ten are read straight off services/tajweedColorService — the
// verse engine already validated against Quran.com's annotations (99.87%). This
// module never re-implements what that engine decides; it asks it which rule
// coloured which letter and keeps the verses where the answer matches.
//
// The two it has to find itself are the IZHAR pair, and for a good reason: izhar
// means "say it plainly", so nothing is coloured for it and the engine has no
// label to give. They are detected here with the engine's own segmentation
// (segmentWord / splitTajweedWords), so word and unit indices line up exactly
// with what the engine returns for the other eight.
// -----------------------------------------------------------------------------

import {
  analyzeVerseTajweed, segmentWord, splitTajweedWords, isArabicLetterUnit,
  type TajweedRule,
} from '../services/tajweedColorService';
import { getVersesForSurah } from '../services/dataService';

// ── Codepoints (same inventory the engine uses) ─────────────────────────────
const SUKUN = 'ْ', SUKUN_Q = 'ۡ', SHADDA = 'ّ';
const TANWEEN = ['ً', 'ٌ', 'ٍ'];
const HIGH_MEEM = 'ۢ', LOW_MEEM = 'ۭ';
const SILENT0 = '۟', SILENT2 = '۠';
const VOWELS = ['َ', 'ُ', 'ِ'];

/** Nūn sākinah + these six throat letters is izhār halqi. */
export const IZHAR_LETTERS = ['ء', 'أ', 'إ', 'ؤ', 'ئ', 'آ', 'ه', 'ع', 'ح', 'غ', 'خ'];
/** What the tutor sees for that rule — the six, written plainly. */
export const IZHAR_LETTERS_LABEL = 'أ ه ع ح غ خ';

export type TajweedExerciseRuleId =
  | 'ghunnah' | 'qalqalah' | 'izhar' | 'idghamGhunnah' | 'idghamNoGhunnah'
  | 'iqlab' | 'ikhfa' | 'ikhfaShafawi' | 'idghamShafawi' | 'izharShafawi';

export interface TajweedExerciseRule {
  id: TajweedExerciseRuleId;
  /** The colour engine's label for this rule, when it has one. */
  engine?: TajweedRule;
  /** The letters that trigger it, for the chip's subtitle. */
  letters?: string;
  /** Colour to paint the matched word in (falls back to a neutral for izhar). */
  color: string;
  colorDark: string;
}

/** In the order the tutor asked for them — the order these rules are taught. */
export const TAJWEED_EXERCISE_RULES: readonly TajweedExerciseRule[] = [
  { id: 'ghunnah',         engine: 'ghunnah',           letters: 'نّ  مّ',        color: '#FF7E1E', colorDark: '#FF9A4D' },
  { id: 'qalqalah',        engine: 'qalaqah',           letters: 'ق ط ب ج د',      color: '#DD0008', colorDark: '#FF5A61' },
  { id: 'izhar',                                        letters: IZHAR_LETTERS_LABEL, color: '#6B7280', colorDark: '#D1D5DB' },
  { id: 'idghamGhunnah',   engine: 'idgham_ghunnah',    letters: 'ي ن م و',        color: '#169777', colorDark: '#35C79F' },
  { id: 'idghamNoGhunnah', engine: 'idgham_wo_ghunnah', letters: 'ل ر',            color: '#169200', colorDark: '#4BC72E' },
  { id: 'iqlab',           engine: 'iqlab',             letters: 'ب',              color: '#26BFFD', colorDark: '#5FD1FF' },
  { id: 'ikhfa',           engine: 'ikhafa',            letters: 'ص ذ ث ك ج ش ق س د ط ز ف ت ض ظ', color: '#9400A8', colorDark: '#D46BE3' },
  { id: 'ikhfaShafawi',    engine: 'ikhafa_shafawi',    letters: 'ب',              color: '#D500B7', colorDark: '#FF63E4' },
  { id: 'idghamShafawi',   engine: 'idgham_shafawi',    letters: 'م',              color: '#58B800', colorDark: '#7EDC2A' },
  { id: 'izharShafawi',                                 letters: 'ما عدا ب م',     color: '#6B7280', colorDark: '#D1D5DB' },
] as const;

export const TAJWEED_EXERCISE_RULE_IDS: readonly TajweedExerciseRuleId[] =
  TAJWEED_EXERCISE_RULES.map(r => r.id);

const RULE_BY_ID = new Map(TAJWEED_EXERCISE_RULES.map(r => [r.id, r]));
export const tajweedExerciseRule = (id: TajweedExerciseRuleId) => RULE_BY_ID.get(id);

// ─────────────────────────────────────────────────────────────────────────────
// The two izhār rules — the engine colours nothing for them, so they are found
// here on the same units it walks.
// ─────────────────────────────────────────────────────────────────────────────

interface Unit { wi: number; ui: number; u: string; base: string }

const unitsOf = (verse: string): Unit[] => {
  const flat: Unit[] = [];
  splitTajweedWords(verse).forEach((w, wi) =>
    segmentWord(w).forEach((u, ui) => flat.push({ wi, ui, u, base: u[0] })));
  return flat;
};

const marksOf = (u: Unit) => u.u.slice(1);
const isWaqf = (u: Unit) => !isArabicLetterUnit(u.base);
const isSilent = (u: Unit) => marksOf(u).includes(SILENT0) || marksOf(u).includes(SILENT2);
const hasTanween = (u: Unit) => TANWEEN.some(t => marksOf(u).includes(t));

/** Bare of every vowel, sukun, shadda and tanween — how Madani writes a nūn that
 *  assimilates. An EXPLICIT sukun means izhār, so both forms count as sākinah. */
const noVowel = (u: Unit) => {
  const m = marksOf(u);
  return !VOWELS.some(v => m.includes(v)) && !m.includes(SHADDA) && !TANWEEN.some(t => m.includes(t));
};

/** The next letter actually pronounced — skips waqf signs, silent letters and
 *  the bare alif seat a fathatan writes. Mirrors the engine's nextPron. */
const nextPronounced = (flat: Unit[], i: number): number => {
  let j = i + 1;
  while (j < flat.length && (isWaqf(flat[j]) || isSilent(flat[j])
    || (['ا', 'ى'].includes(flat[j].base) && marksOf(flat[j]).replace(/[ۖ-ۜ]/g, '') === ''))) j++;
  return j < flat.length ? j : -1;
};

/**
 * Word indices where a nūn sākinah or tanwīn meets a throat letter — izhār halqi.
 * A nūn carrying an iqlāb meem is excluded: that is the engine's iqlāb, not this.
 */
export function findIzhar(verse: string): number[] {
  const flat = unitsOf(verse);
  const out = new Set<number>();
  for (let i = 0; i < flat.length; i++) {
    const u = flat[i];
    if (!isArabicLetterUnit(u.base)) continue;
    const m = marksOf(u);
    if (m.includes(HIGH_MEEM) || m.includes(LOW_MEEM)) continue;      // iqlab
    const noonSakin = u.base === 'ن' && !m.includes(SHADDA)
      && (m.includes(SUKUN) || m.includes(SUKUN_Q) || noVowel(u));
    if (!noonSakin && !hasTanween(u)) continue;
    const j = nextPronounced(flat, i);
    if (j === -1 || hasTanween(flat[j])) continue;
    if (IZHAR_LETTERS.includes(flat[j].base)) out.add(u.wi);
  }
  return [...out];
}

/**
 * Word indices where a mīm sākinah meets anything but ب or م — izhār shafawi.
 * The engine labels the other two (ikhfā / idghām shafawi), so this is the rest.
 */
export function findIzharShafawi(verse: string): number[] {
  const flat = unitsOf(verse);
  const out = new Set<number>();
  for (let i = 0; i < flat.length; i++) {
    const u = flat[i];
    if (u.base !== 'م') continue;
    const m = marksOf(u);
    // Madani writes a mīm sākinah bare before ب/م and with a sukun elsewhere;
    // the engine only treats the bare form as sākinah, so izhār has to accept
    // the written sukun as well — that IS how izhār is spelt.
    if (m.includes(SHADDA)) continue;
    const sakin = m.includes(SUKUN) || m.includes(SUKUN_Q)
      || (!VOWELS.some(v => m.includes(v)) && !TANWEEN.some(t => m.includes(t)));
    if (!sakin) continue;
    const j = nextPronounced(flat, i);
    if (j === -1) continue;
    const nb = flat[j].base;
    if (nb === 'ب' || nb === 'م') continue;                            // the other two rules
    if (!isArabicLetterUnit(nb)) continue;
    out.add(u.wi);
  }
  return [...out];
}

// ─────────────────────────────────────────────────────────────────────────────
// Which of the ten rules a verse carries
// ─────────────────────────────────────────────────────────────────────────────

/** rule → the indices of the words that carry it, in `splitVerseWords` order. */
export function findRulesInVerse(verse: string): Map<TajweedExerciseRuleId, number[]> {
  const found = new Map<TajweedExerciseRuleId, number[]>();
  const coloured = analyzeVerseTajweed(verse);
  const byEngineRule = new Map<TajweedRule, Set<number>>();
  for (const [key, rule] of coloured) {
    const wi = parseInt(key.split(':')[0], 10);
    const set = byEngineRule.get(rule) ?? new Set<number>();
    set.add(wi);
    byEngineRule.set(rule, set);
  }
  for (const rule of TAJWEED_EXERCISE_RULES) {
    if (!rule.engine) continue;
    const words = byEngineRule.get(rule.engine);
    if (words?.size) found.set(rule.id, [...words]);
  }
  const izhar = findIzhar(verse);
  if (izhar.length) found.set('izhar', izhar);
  const izharShafawi = findIzharShafawi(verse);
  if (izharShafawi.length) found.set('izharShafawi', izharShafawi);
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE BUILDER — same bounded, shuffled scan the word challenge uses, so no
// configuration can hang: it walks a shuffled list of the 114 surahs and stops
// when every selected rule has its share (or the list runs out).
// ─────────────────────────────────────────────────────────────────────────────

export interface TajweedExerciseItem {
  verseKey: string;
  text: string;
  /** The rule this item is asking about. */
  rule: TajweedExerciseRuleId;
  /** Word indices carrying it, for the highlight. */
  words: number[];
  /** The slice of the verse worth showing — the rule plus a couple of words of
   *  context either side. Inclusive, in `splitVerseWords` indices. A whole verse
   *  is a wall of text on a drill card; the rule is what the student is reading
   *  for. `trimmedStart` / `trimmedEnd` say where the verse continues. */
  from: number;
  to: number;
  trimmedStart: boolean;
  trimmedEnd: boolean;
}

/** Words of context kept on each side of the rule. A rule that already spans
 *  two words (iqlāb, the idghāms) gets one word of context instead of two: the
 *  card draws the excerpt on a single line, so every extra word costs size. */
const contextFor = (spanWords: number) => (spanWords >= 2 ? 1 : 2);

/**
 * The occurrence to show: the first matched word plus any matched words running
 * straight on from it (iqlāb and the idghāms span two), then the context.
 */
export function excerptRange(
  matched: number[], wordCount: number,
): { from: number; to: number; span: number[] } {
  const sorted = [...matched].sort((a, b) => a - b);
  const span = [sorted[0]];
  for (let i = 1; i < sorted.length && sorted[i] === span[span.length - 1] + 1; i++) span.push(sorted[i]);
  const pad = contextFor(span.length);
  return {
    from: Math.max(0, span[0] - pad),
    to: Math.min(wordCount - 1, span[span.length - 1] + pad),
    span,
  };
}

export interface TajweedRuleReport {
  id: TajweedExerciseRuleId;
  wanted: number;
  used: number;
  /** Nothing found anywhere — the UI has to say so. */
  empty: boolean;
}

export interface TajweedExerciseBuild {
  items: TajweedExerciseItem[];
  reports: TajweedRuleReport[];
  scanned: number;
}

type VerseLike = { verse_key: string; text_uthmani: string };
export type VerseFetcher = (surah: number) => Promise<VerseLike[]>;

const SURAH_COUNT = 114;
const SCAN_BATCH = 8;
/** Per-rule pool cap — a run never needs more than a few times its quota. */
const POOL_CAP = 120;
/** Only a window of the verse is shown, so length barely matters now — this cap
 *  just keeps the pool away from the handful of enormous verses (2:282 is 129
 *  words) where a two-word window would lose the reader completely. */
const MAX_WORDS = 45;

const shuffle = <T,>(arr: T[], rnd: () => number): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export interface BuildTajweedOptions {
  rules: TajweedExerciseRuleId[];
  count?: number;
  fetchVerses?: VerseFetcher;
  random?: () => number;
}

export async function buildTajweedExercise(
  opts: BuildTajweedOptions,
): Promise<TajweedExerciseBuild> {
  const rules = (opts.rules ?? []).filter(id => RULE_BY_ID.has(id));
  const count = opts.count ?? 15;
  const rnd = opts.random ?? Math.random;
  const fetchVerses = opts.fetchVerses ?? (getVersesForSurah as unknown as VerseFetcher);
  if (count <= 0 || rules.length === 0) return { items: [], reports: [], scanned: 0 };

  // Quotas: floor share, the remainder handed to a random subset.
  const quota = new Map<TajweedExerciseRuleId, number>();
  const base = Math.floor(count / rules.length);
  let rest = count - base * rules.length;
  for (const id of shuffle(rules, rnd)) {
    quota.set(id, base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }

  const pools = new Map<TajweedExerciseRuleId, TajweedExerciseItem[]>(rules.map(id => [id, []]));
  const seen = new Set<string>();

  const satisfied = () => rules.every(id => (pools.get(id)!.length) >= (quota.get(id) ?? 0));

  const scanVerse = (v: VerseLike) => {
    const words = splitTajweedWords(v.text_uthmani);
    if (words.length > MAX_WORDS || words.length < 2) return;
    const found = findRulesInVerse(v.text_uthmani);
    for (const id of rules) {
      const hit = found.get(id);
      if (!hit?.length) continue;
      const pool = pools.get(id)!;
      if (pool.length >= POOL_CAP) continue;
      const key = `${id}|${v.verse_key}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { from, to, span } = excerptRange(hit, words.length);
      pool.push({
        verseKey: v.verse_key, text: v.text_uthmani, rule: id, words: span,
        from, to, trimmedStart: from > 0, trimmedEnd: to < words.length - 1,
      });
    }
  };

  const order = shuffle(Array.from({ length: SURAH_COUNT }, (_, i) => i + 1), rnd);
  let scanned = 0;
  for (let i = 0; i < order.length && !satisfied(); i += SCAN_BATCH) {
    const batch = order.slice(i, i + SCAN_BATCH);
    const results = await Promise.all(batch.map(s => fetchVerses(s).catch(() => [] as VerseLike[])));
    scanned += batch.length;
    for (const verses of results) for (const v of verses) scanVerse(v);
  }

  // ── selection ──────────────────────────────────────────────────────────────
  const items: TajweedExerciseItem[] = [];
  const usedVerses = new Set<string>();
  const take = (list: TajweedExerciseItem[], n: number): number => {
    let got = 0;
    for (const it of list) {
      if (got >= n || items.length >= count) break;
      if (usedVerses.has(it.verseKey)) continue;      // never the same verse twice
      usedVerses.add(it.verseKey);
      items.push(it);
      got++;
    }
    return got;
  };

  const reports: TajweedRuleReport[] = [];
  const shuffled = new Map(rules.map(id => [id, shuffle(pools.get(id)!, rnd)]));
  for (const id of rules) {
    const want = quota.get(id) ?? 0;
    const used = take(shuffled.get(id)!, want);
    reports.push({ id, wanted: want, used, empty: used === 0 && pools.get(id)!.length === 0 });
  }
  // A rule that came up short hands its share to the others.
  for (const id of rules) {
    if (items.length >= count) break;
    const before = items.length;
    take(shuffled.get(id)!, count - items.length);
    const r = reports.find(x => x.id === id)!;
    r.used += items.length - before;
  }

  return { items: shuffle(items, rnd), reports, scanned };
}
