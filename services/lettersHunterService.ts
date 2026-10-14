// services/lettersHunterService.ts
// -----------------------------------------------------------------------------
// Letters Hunter — the run of sub-challenges built around two or three letters
// a reader keeps mixing up (ر and ز, د and ذ, ص and ض …).
//
// The tutor picks the letters on the alphabet table, chooses which rounds to
// run, and the whole thing plays through in order. Everything here is the
// CONTENT: which letters land in which cell, which one is being asked for.
// Nothing here talks to the database — a run in the lesson leaves only a
// logbook line, the way the other challenges do.
//
// The one rule that shapes the whole file: a distractor must be a letter the
// student actually confuses with the target, never a random letter of the
// alphabet. That is why every cell comes from the chosen letters and nowhere
// else, and why a vowel round's distractors include the RIGHT letter wearing
// the WRONG vowel — that is the mistake being hunted.
// -----------------------------------------------------------------------------
import type { LetterAudioSet } from './letterAudioService';
import { SET_MARK } from './letterAudioService';

/** The three short vowels. No sukoon, no tanween — this is a beginner's ear. */
export type HunterVowel = Extract<LetterAudioSet, 'fatha' | 'kasra' | 'damma'>;
export const HUNTER_VOWELS: HunterVowel[] = ['fatha', 'kasra', 'damma'];

export const VOWEL_NAME: Record<HunterVowel, string> = {
  fatha: 'fatha',
  kasra: 'kasrah',
  damma: 'dammah',
};

/** The seven rounds, in the order they are played. */
export type SubId = 'spot' | 'sounds' | 'say' | 'write' | 'syllables' | 'words' | 'ayat';

export interface SubMeta {
  id: SubId;
  /** 1-7, shown in the rail. */
  n: number;
  name: string;
  blurb: string;
  defaultRounds: number;
  /** How the rounds are counted, for the stepper's label. */
  unit: string;
  /** False for the rounds that need someone listening — those never go home. */
  asHomework: boolean;
  /** Not built yet: hidden from the chooser rather than offered and broken. */
  ready: boolean;
}

export const SUBS: SubMeta[] = [
  { id: 'spot',      n: 1, name: 'Spot the letter you hear', blurb: 'Ten cells, he calls out the numbers', defaultRounds: 5,  unit: 'rounds',    asHomework: true,  ready: true },
  { id: 'sounds',    n: 2, name: 'Sound discrimination',     blurb: 'The letter carrying a vowel',          defaultRounds: 5,  unit: 'rounds',    asHomework: true,  ready: true },
  { id: 'say',       n: 3, name: 'Say the letter',           blurb: 'He reads it, you mark it',             defaultRounds: 10, unit: 'letters',   asHomework: false, ready: false },
  { id: 'write',     n: 4, name: 'Write',                    blurb: 'A board you both draw on',             defaultRounds: 5,  unit: 'letters',   asHomework: true,  ready: false },
  { id: 'syllables', n: 5, name: 'Syllables',                blurb: 'Both letters in one breath',           defaultRounds: 10, unit: 'syllables', asHomework: false, ready: false },
  { id: 'words',     n: 6, name: "Qur'anic words",           blurb: 'Real words carrying the letters',      defaultRounds: 10, unit: 'words',     asHomework: false, ready: false },
  { id: 'ayat',      n: 7, name: 'Ayat',                     blurb: 'A verse to read them in',              defaultRounds: 5,  unit: 'verses',    asHomework: false, ready: false },
];

export const subMeta = (id: SubId): SubMeta => SUBS.find(s => s.id === id) as SubMeta;

/** Rounds are bounded so a slip on the stepper cannot start a 200-round run. */
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 20;

export interface SubPlan { on: boolean; rounds: number; }
export type HunterPlan = Record<SubId, SubPlan>;

/** Everything on, every count at its default — what the popup opens with. */
export const defaultPlan = (): HunterPlan =>
  SUBS.reduce((p, s) => {
    p[s.id] = { on: s.ready, rounds: s.defaultRounds };
    return p;
  }, {} as HunterPlan);

/** The rounds that will actually be played, in order. */
export const playOrder = (plan: HunterPlan): SubMeta[] =>
  SUBS.filter(s => s.ready && plan[s.id].on);

/* ── Picking the letters ─────────────────────────────────────────────────── */

/** Two at the least — one letter cannot be confused with itself — and three at
 *  the most, because a fourth makes the row of ten too thin to prove anything. */
export const MIN_LETTERS = 2;
export const MAX_LETTERS = 3;

export const enoughLetters = (letters: string[]): boolean =>
  letters.length >= MIN_LETTERS && letters.length <= MAX_LETTERS;

/* ── A cell ──────────────────────────────────────────────────────────────── */

/** One cell of the row: a letter, bare or wearing a vowel. */
export interface HunterCell {
  letter: string;
  /** null in round 1 — the bare letter, no mark at all. */
  vowel: HunterVowel | null;
}

/** What the cell shows. */
export const cellText = (c: HunterCell): string =>
  c.vowel ? c.letter + SET_MARK[c.vowel] : c.letter;

/** Two cells are the same thing only when BOTH the letter and the vowel match:
 *  زُ is not زَ, and a tap on it is a miss. That distinction is round 2. */
export const sameCell = (a: HunterCell, b: HunterCell): boolean =>
  a.letter === b.letter && a.vowel === b.vowel;

/** Which recording says this cell out loud. */
export const cellAudioSet = (c: HunterCell): LetterAudioSet => c.vowel ?? 'plain';

export interface HunterRow {
  /** Always ten. Numbered 1-10 on screen, so he can call them out. */
  cells: HunterCell[];
  /** The one he hears. */
  target: HunterCell;
}

export const ROW_SIZE = 10;

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

const shuffled = <T,>(xs: T[]): T[] => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * One row of ten.
 *
 * How often the target appears is an even share of the row, give or take one:
 * with two letters that is four to six cells, with three it is two to four.
 * A fixed small number would leave a row of nine cells of the OTHER letter —
 * which is not a hunt, it is a spot-the-odd-one-out, and it gives the answer
 * away before the sound has finished playing. Never one hit either: one can be
 * found by luck.
 *
 * With vowels on, the fillers deliberately include the target's own letter
 * wearing a different vowel — زَ beside زُ — because telling those apart is
 * the whole exercise. Without that the round collapses into round 1.
 */
export function buildRow(letters: string[], withVowels: boolean): HunterRow {
  const make = (): HunterCell => ({
    letter: pick(letters),
    vowel: withVowels ? pick(HUNTER_VOWELS) : null,
  });

  const target = make();
  const share = Math.round(ROW_SIZE / letters.length);
  const hits = Math.max(2, Math.min(ROW_SIZE - 2, share - 1 + Math.floor(Math.random() * 3)));

  const fillers: HunterCell[] = [];
  // Half the fillers are the near-miss when there is one to make.
  const nearMisses = withVowels ? Math.floor((ROW_SIZE - hits) / 2) : 0;
  for (let i = 0; i < nearMisses; i++) {
    fillers.push({
      letter: target.letter,
      vowel: pick(HUNTER_VOWELS.filter(v => v !== target.vowel)),
    });
  }
  let guard = 0;
  while (fillers.length < ROW_SIZE - hits && guard++ < 500) {
    const c = make();
    if (!sameCell(c, target)) fillers.push(c);
  }
  // A guard that ran out (one letter, one vowel) still gets a full row.
  while (fillers.length < ROW_SIZE - hits) fillers.push(make());

  const cells = shuffled([...Array.from({ length: hits }, () => ({ ...target })), ...fillers]);
  return { cells, target };
}

/** Where the target sits — the cells that have to be found. */
export const targetsOf = (row: HunterRow): number[] =>
  row.cells.reduce<number[]>((acc, c, i) => (sameCell(c, row.target) ? [...acc, i] : acc), []);

/* ── Telling them apart, in words ────────────────────────────────────────── */

/** What sits on the letter. The student is told this before anything starts,
 *  because most of these pairs differ by nothing else. */
const DOTS: Record<string, string> = {
  'ب': 'one dot below', 'ت': 'two dots above', 'ث': 'three dots above',
  'ج': 'one dot below', 'ح': 'no dots',        'خ': 'one dot above',
  'د': 'no dots',       'ذ': 'one dot above',
  'ر': 'no dots',       'ز': 'one dot above',
  'س': 'no dots',       'ش': 'three dots above',
  'ص': 'no dots',       'ض': 'one dot above',
  'ط': 'no dots',       'ظ': 'one dot above',
  'ع': 'no dots',       'غ': 'one dot above',
  'ف': 'one dot above', 'ق': 'two dots above',
  'ن': 'one dot above', 'ي': 'two dots below',
  'ا': 'no dots',       'ك': 'no dots', 'ل': 'no dots', 'م': 'no dots',
  'ه': 'no dots',       'و': 'no dots', 'ء': 'no dots',
};

/** Letters drawn on the same body. Within a family only the dots differ, which
 *  is worth saying out loud; across families the shapes themselves differ. */
const FAMILIES: string[][] = [
  ['ب', 'ت', 'ث', 'ن', 'ي'],
  ['ج', 'ح', 'خ'],
  ['د', 'ذ'],
  ['ر', 'ز'],
  ['س', 'ش'],
  ['ص', 'ض'],
  ['ط', 'ظ'],
  ['ع', 'غ'],
  ['ف', 'ق'],
];

export const dotsOf = (letter: string): string => DOTS[letter] ?? '';

/** True when every chosen letter is drawn on the same body. */
export const shareABody = (letters: string[]): boolean =>
  letters.length > 1 && FAMILIES.some(f => letters.every(l => f.includes(l)));

export const introLine = (letters: string[]): string =>
  shareABody(letters)
    ? 'Same body, every one of them. The dots are the whole difference.'
    : 'Look at the shape of each one before you hear it.';

/* ── What a run adds up to ───────────────────────────────────────────────── */

/** One round is right only when every target was found and nothing else was
 *  tapped. Partial credit would hide exactly the confusion being measured. */
export interface SubScore { id: SubId; right: number; rounds: number; }

export interface HunterResult {
  letters: string[];
  scores: SubScore[];
  right: number;
  total: number;
}

export const tally = (letters: string[], scores: SubScore[]): HunterResult => ({
  letters,
  scores,
  right: scores.reduce((n, s) => n + s.right, 0),
  total: scores.reduce((n, s) => n + s.rounds, 0),
});

/** The line that lands in the student's logbook, and so on the calendar. */
export const logTitle = (letters: string[]): string =>
  `${letters.length} letters hunted — ${letters.join(' ')}`;

export const logDetail = (r: HunterResult): string =>
  [`${r.right}/${r.total} rounds right`, ...r.scores.map(s => `${subMeta(s.id).name} ${s.right}/${s.rounds}`)].join(' · ');
