// utils/crossword.ts
// -----------------------------------------------------------------------------
// Crossword maker for the Arabic vocabulary. No AI, nothing on a server: an
// ordinary layout search that runs on the phone in a few milliseconds.
//
//   1. Each word is turned into the letters that go in the boxes
//      (arabicAnswer / translitAnswer). Arabic drops harakat and shadda, one
//      box per written letter, the way printed Arabic crosswords are.
//   2. buildRounds splits the words into small crosswords (MAX_PER_ROUND each,
//      a phone cannot show more) and, for each, tries many arrangements:
//      longest word first, then every place where the next word can cross a
//      letter already down, keeping the tightest grid with the most crossings.
//
// Coordinates are in READING order: an across word runs col, col+1, col+2 …
// whichever way the script reads. Arabic draws column 0 on the RIGHT, so the
// same layout serves both modes and the mirroring lives only in the renderer.
//
// formAt / shapeLetter give a letter its joined shape (initial, medial, final,
// isolated) from its neighbours, following Arabic's real joining rules.
// -----------------------------------------------------------------------------

export type CrosswordMode = 'arabic' | 'translit';
export type Dir = 'across' | 'down';

export interface CrosswordSource {
  id: string;
  arabic: string;
  transliteration?: string | null;
  english: string;
}

export interface CrosswordEntry {
  id: string;
  /** The letters that go in the boxes, one per box. */
  answer: string[];
  clue: string;
  /** The word as written in the lesson, harakat and all — shown once solved. */
  written: string;
}

export interface Placement {
  entry: CrosswordEntry;
  row: number;
  col: number;
  dir: Dir;
  /** The clue number printed in the first box. */
  number: number;
}

export interface CrosswordPuzzle {
  width: number;
  height: number;
  /** Across first then down, each in number order — the order clues are read. */
  placements: Placement[];
}

export const MAX_PER_ROUND = 9;
/** Widest / tallest grid a phone shows at a readable size. */
const MAX_SIDE = 12;

// ── Answers ─────────────────────────────────────────────────────────────────

/** Harakat, Quranic marks, tatweel and invisible formatting characters. */
const NOT_A_LETTER = /[ؐ-ًؚ-ٰٟۖ-ۭـ​-‏؜﻿]/g;
const ARABIC_LETTER = /^[ء-غف-يٱ-ۓ]$/;

/** The part a crossword can use: the first of "a / b", without "(…)". */
const firstSpelling = (s: string): string => s.replace(/\([^)]*\)/g, ' ').split('/')[0].trim();

/** An ending or prefix ("ـي", "الـ", "- كَ", "أوّل -") is not a word to fill in. */
const isAffix = (s: string): boolean => s.includes('ـ') || /^\s*-|-\s*$/.test(s);

export function arabicAnswer(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  // NFC folds a separately typed hamza or madda into its letter (ا + ٓ → آ).
  const s0 = raw.normalize('NFC');
  if (isAffix(s0)) return null;
  const s = firstSpelling(s0).replace(NOT_A_LETTER, '');
  if (!s || /\s/.test(s)) return null;                 // phrases stay out
  const letters = [...s];
  if (letters.length < 2 || !letters.every(ch => ARABIC_LETTER.test(ch))) return null;
  return letters;
}

export function translitAnswer(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const s0 = raw.normalize('NFC').toLowerCase();
  if (isAffix(s0)) return null;
  const s = firstSpelling(s0);
  if (!s || !/^[a-z0-9']+$/.test(s)) return null;      // spaces, hyphens: phrases
  const letters = [...s];
  return letters.length >= 2 ? letters : null;
}

/** The words a crossword can use, one per answer (a repeated word keeps its first clue). */
export function crosswordEntries(words: CrosswordSource[], mode: CrosswordMode): CrosswordEntry[] {
  const seen = new Set<string>();
  const out: CrosswordEntry[] = [];
  for (const w of words) {
    const clue = (w.english ?? '').trim();
    const answer = mode === 'arabic' ? arabicAnswer(w.arabic) : translitAnswer(w.transliteration);
    if (!answer || !clue) continue;
    const key = answer.join('');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: w.id, answer,
      clue: clue.charAt(0).toUpperCase() + clue.slice(1),
      written: mode === 'arabic'
        ? firstSpelling(w.arabic.normalize('NFC'))
        : firstSpelling(w.transliteration ?? ''),
    });
  }
  return out;
}

// ── Layout ──────────────────────────────────────────────────────────────────

type Rng = () => number;

/** A small seeded generator, so a layout can be reproduced in a test. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Cell { ch: string; across?: number; down?: number }
interface Placed { entry: CrosswordEntry; row: number; col: number; dir: Dir }

const key = (r: number, c: number) => `${r},${c}`;

class Board {
  cells = new Map<string, Cell>();
  placed: Placed[] = [];
  minR = 0; maxR = -1; minC = 0; maxC = -1;
  crossings = 0;

  constructor(readonly maxW: number, readonly maxH: number) {}

  get width() { return this.placed.length ? this.maxC - this.minC + 1 : 0; }

  /** Two answers to the same clue ("Where": وين and أين) can't share a round —
   *  the student would have no way to tell which box wants which. */
  hasClue(e: CrosswordEntry): boolean {
    const c = e.clue.toLowerCase();
    return this.placed.some(p => p.entry.clue.toLowerCase() === c);
  }
  get height() { return this.placed.length ? this.maxR - this.minR + 1 : 0; }

  clone(): Board {
    const b = new Board(this.maxW, this.maxH);
    for (const [k, v] of this.cells) b.cells.set(k, { ...v });
    b.placed = [...this.placed];
    b.minR = this.minR; b.maxR = this.maxR; b.minC = this.minC; b.maxC = this.maxC;
    b.crossings = this.crossings;
    return b;
  }

  /** How many letters this word would share with the grid, or -1 if it cannot go there. */
  fit(word: string[], r: number, c: number, dir: Dir): number {
    const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
    const n = word.length;
    // Inside the size limit.
    const minR = Math.min(this.minR, r), maxR = Math.max(this.maxR, r + dr * (n - 1));
    const minC = Math.min(this.minC, c), maxC = Math.max(this.maxC, c + dc * (n - 1));
    if (this.placed.length && (maxR - minR + 1 > this.maxH || maxC - minC + 1 > this.maxW)) return -1;
    // Nothing touching either end, or the word would run on into another.
    if (this.cells.has(key(r - dr, c - dc)) || this.cells.has(key(r + dr * n, c + dc * n))) return -1;
    let crossings = 0;
    for (let k = 0; k < n; k++) {
      const rr = r + dr * k, cc = c + dc * k;
      const cell = this.cells.get(key(rr, cc));
      if (cell) {
        if (cell.ch !== word[k]) return -1;
        if (dir === 'across' ? cell.across !== undefined : cell.down !== undefined) return -1;
        crossings++;
      } else if (dir === 'across'
        ? this.cells.has(key(rr - 1, cc)) || this.cells.has(key(rr + 1, cc))
        : this.cells.has(key(rr, cc - 1)) || this.cells.has(key(rr, cc + 1))) {
        return -1;                                   // a new letter beside an old one spells nonsense
      }
    }
    return crossings;
  }

  place(entry: CrosswordEntry, r: number, c: number, dir: Dir, crossings: number) {
    const [dr, dc] = dir === 'across' ? [0, 1] : [1, 0];
    const idx = this.placed.length;
    entry.answer.forEach((ch, k) => {
      const rr = r + dr * k, cc = c + dc * k;
      const cell = this.cells.get(key(rr, cc)) ?? { ch };
      cell[dir] = idx;
      this.cells.set(key(rr, cc), cell);
    });
    const endR = r + dr * (entry.answer.length - 1), endC = c + dc * (entry.answer.length - 1);
    if (!this.placed.length) { this.minR = r; this.maxR = endR; this.minC = c; this.maxC = endC; }
    else {
      this.minR = Math.min(this.minR, r); this.maxR = Math.max(this.maxR, endR);
      this.minC = Math.min(this.minC, c); this.maxC = Math.max(this.maxC, endC);
    }
    this.placed.push({ entry, row: r, col: c, dir });
    this.crossings += crossings;
  }

  /** The best spot for this word, or null if it crosses nothing it can. */
  bestSpot(entry: CrosswordEntry, rng: Rng): { r: number; c: number; dir: Dir; crossings: number } | null {
    const word = entry.answer;
    let best: { r: number; c: number; dir: Dir; crossings: number; score: number } | null = null;
    const area0 = this.width * this.height;
    for (const [k, cell] of this.cells) {
      // A box already crossed has no free direction left.
      if (cell.across !== undefined && cell.down !== undefined) continue;
      const dir: Dir = cell.across !== undefined ? 'down' : 'across';
      const [r0, c0] = k.split(',').map(Number);
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== cell.ch) continue;
        const r = dir === 'down' ? r0 - i : r0;
        const c = dir === 'across' ? c0 - i : c0;
        const crossings = this.fit(word, r, c, dir);
        if (crossings < 1) continue;
        const n = word.length;
        const w = Math.max(this.maxC, c + (dir === 'across' ? n - 1 : 0)) - Math.min(this.minC, c) + 1;
        const h = Math.max(this.maxR, r + (dir === 'down' ? n - 1 : 0)) - Math.min(this.minR, r) + 1;
        const score = crossings * 12 - (w * h - area0) * 0.6 - Math.abs(w - h) * 0.8 + rng() * 3;
        if (!best || score > best.score) best = { r, c, dir, crossings, score };
      }
    }
    return best;
  }
}

function attempt(pool: CrosswordEntry[], target: number, maxW: number, maxH: number, rng: Rng): Board {
  // Long words first (they give the rest something to cross), shuffled a little.
  const order = pool
    .map(e => ({ e, k: e.answer.length + rng() * 3 }))
    .sort((a, b) => b.k - a.k)
    .map(x => x.e);
  const board = new Board(maxW, maxH);
  const first = order.find(e => e.answer.length <= maxW);
  if (!first) return board;
  board.place(first, 0, 0, 'across', 0);
  // Words that found no place may fit once later ones are down: a few passes.
  for (let pass = 0; pass < 3 && board.placed.length < target; pass++) {
    let added = false;
    for (const e of order) {
      if (board.placed.length >= target) break;
      if (board.placed.some(p => p.entry === e) || board.hasClue(e)) continue;
      const spot = board.bestSpot(e, rng);
      if (spot) { board.place(e, spot.r, spot.c, spot.dir, spot.crossings); added = true; }
    }
    if (!added) break;
  }
  return board;
}

const boardScore = (b: Board) =>
  b.placed.length * 1000 + b.crossings * 8 - b.width * b.height - Math.abs(b.width - b.height) * 3;

function finish(board: Board): CrosswordPuzzle {
  const starts = new Map<string, number>();
  const firstBoxes = [...board.placed]
    .map(p => ({ r: p.row - board.minR, c: p.col - board.minC }))
    .sort((a, b) => a.r - b.r || a.c - b.c);
  for (const s of firstBoxes) if (!starts.has(key(s.r, s.c))) starts.set(key(s.r, s.c), starts.size + 1);
  const placements: Placement[] = board.placed.map(p => {
    const row = p.row - board.minR, col = p.col - board.minC;
    return { entry: p.entry, row, col, dir: p.dir, number: starts.get(key(row, col))! };
  });
  placements.sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'across' ? -1 : 1) || a.number - b.number);
  return { width: board.width, height: board.height, placements };
}

/**
 * Split the words into small crosswords and lay each one out. Words that
 * share no letter with anything (rare) come back in `leftOut`.
 */
export function buildRounds(
  entries: CrosswordEntry[],
  opts: { perRound?: number; attempts?: number; tries?: number; rng?: Rng } = {},
): { rounds: CrosswordPuzzle[]; leftOut: CrosswordEntry[] } {
  const rng = opts.rng ?? Math.random;
  const longest = entries.reduce((m, e) => Math.max(m, e.answer.length), 0);
  const side = Math.min(16, Math.max(MAX_SIDE, longest));

  // Even rounds: 23 words make 8 + 8 + 7, not 9 + 9 + 5.
  const perRound = opts.perRound ?? MAX_PER_ROUND;
  const roundCount = Math.max(1, Math.ceil(entries.length / perRound));
  const target = Math.ceil(entries.length / roundCount);

  // The whole split is tried several times and the best one kept: the first
  // round always grabs the words that cross easily, and which words those are
  // decides whether the last round is a proper crossword or two lonely words.
  let best: Split | null = null;
  // 12 × 40 measured best on the real course (589 rounds, 4 of them small,
  // 12 words of ~4,500 left out; 45 ms a lesson on a laptop).
  for (let t = 0; t < (opts.tries ?? 12); t++) {
    const s = splitOnce(entries, target, side, opts.attempts ?? 40, rng);
    if (!best || s.score > best.score) best = s;
  }
  return { rounds: best!.boards.map(finish), leftOut: best!.leftOut };
}

interface Split { boards: Board[]; leftOut: CrosswordEntry[]; score: number }

/** Fewer than this many words is not much of a crossword. */
const SMALL_ROUND = 4;

function splitOnce(entries: CrosswordEntry[], target: number, side: number, attempts: number, rng: Rng): Split {
  let pool = [...entries];
  let boards: Board[] = [];
  while (pool.length >= 2) {
    let best: Board | null = null;
    const want = Math.min(target, pool.length);
    for (let i = 0; i < attempts; i++) {
      const b = attempt(pool, want, side, side, rng);
      if (!best || boardScore(b) > boardScore(best)) best = b;
      // Everything placed already: half the tries is plenty to find a tidy one.
      if (best.placed.length >= want && i >= attempts / 2) break;
    }
    if (!best || best.placed.length < 2) break;
    boards.push(best);
    const used = new Set(best.placed.map(p => p.entry));
    pool = pool.filter(e => !used.has(e));
  }

  // Leftovers: squeeze each into a round with room for it.
  const leftOut: CrosswordEntry[] = [];
  for (const e of pool) if (!squeeze(boards, e, rng)) leftOut.push(e);

  // A round of two or three words: hand its words to the other rounds if they
  // can all find a place there.
  // (Looked up afresh each time: a success swaps every board for a clone.)
  const tried = new Set<CrosswordEntry>();
  for (;;) {
    const small = boards.find(b => b.placed.length < SMALL_ROUND && !tried.has(b.placed[0].entry));
    if (!small) break;
    tried.add(small.placed[0].entry);
    const others = boards.filter(b => b !== small).map(b => b.clone());
    if (others.length && small.placed.every(p => squeeze(others, p.entry, rng))) boards = others;
  }

  const placed = boards.reduce((n, b) => n + b.placed.length, 0);
  const smallRounds = boards.filter(b => b.placed.length < SMALL_ROUND).length;
  const tidiness = boards.reduce((n, b) => n + b.crossings * 2 - Math.abs(b.width - b.height), 0);
  return { boards, leftOut, score: placed * 100 - smallRounds * 70 - boards.length * 5 + tidiness };
}

/** Put a word into the least full round that has a place for it. */
function squeeze(boards: Board[], e: CrosswordEntry, rng: Rng): boolean {
  for (const b of [...boards].sort((x, y) => x.placed.length - y.placed.length)) {
    if (b.placed.length >= MAX_PER_ROUND + 2 || b.hasClue(e)) continue;
    const spot = b.bestSpot(e, rng);
    if (spot) { b.place(e, spot.r, spot.c, spot.dir, spot.crossings); return true; }
  }
  return false;
}

// ── Letter shapes ───────────────────────────────────────────────────────────

export type LetterForm = 'isolated' | 'initial' | 'medial' | 'final';

/** Letters that join only to the letter BEFORE them — the next one starts afresh. */
const JOINS_BACK_ONLY = new Set([...'اأإآٱدذرزوؤةژ']);
/** Letters that join to nothing. */
const JOINS_NOTHING = new Set(['ء']);

/** An empty box is assumed to hold a joining letter, so a letter typed into
 *  the middle of a word shows its middle shape straight away. */
const joinsForward = (ch: string | null) => ch == null || (!JOINS_BACK_ONLY.has(ch) && !JOINS_NOTHING.has(ch));
const joinsBackward = (ch: string | null) => ch == null || !JOINS_NOTHING.has(ch);

/** The shape of the letter at `i`, given the letters of its word (null = empty box). */
export function formAt(seq: Array<string | null>, i: number): LetterForm {
  const ch = seq[i];
  const prev = i > 0 && joinsForward(seq[i - 1]) && joinsBackward(ch);
  const next = i < seq.length - 1 && joinsForward(ch) && joinsBackward(seq[i + 1]);
  return prev && next ? 'medial' : prev ? 'final' : next ? 'initial' : 'isolated';
}

const ZWJ = '‍';
/** The letter written in that shape: the zero-width joiner makes the font
 *  draw the joined form even though the letter stands alone in its box. */
export function shapeLetter(ch: string, form: LetterForm): string {
  const before = form === 'medial' || form === 'final' ? ZWJ : '';
  const after = form === 'medial' || form === 'initial' ? ZWJ : '';
  return before + ch + after;
}

// ── Keyboards ───────────────────────────────────────────────────────────────

/** Arabic keys in alphabet order, hamza forms beside their letter. */
export const ARABIC_KEY_ROWS: string[][] = [
  [...'اأإآءبتثج'],
  [...'حخدذرزسشص'],
  [...'ضطظعغفقكل'],
  [...'منهةوؤيىئ'],
];

/** Latin keys. The digits the transliteration uses for ء ع خ ح get a row of
 *  their own on top (squeezed in beside z they made every key too narrow). */
export const TRANSLIT_KEY_ROWS: string[][] = [
  [...'2357'],
  [...'qwertyuiop'],
  [...'asdfghjkl'],
  [...'zxcvbnm'],
];

/** The Arabic letter each transliteration digit stands for, shown on its key. */
export const DIGIT_LETTER: Record<string, string> = { '2': 'ء', '3': 'ع', '5': 'خ', '6': 'ط', '7': 'ح', '9': 'ص' };

/** The keyboard for a set of answers: the standard rows, plus any letter an
 *  answer needs that they lack (so no puzzle is ever unsolvable). A missing
 *  digit joins the digit row; anything else gets a row of its own. */
export function keyRows(mode: CrosswordMode, entries: CrosswordEntry[]): string[][] {
  const rows = (mode === 'arabic' ? ARABIC_KEY_ROWS : TRANSLIT_KEY_ROWS).map(r => [...r]);
  const have = new Set(rows.flat());
  const extra = [...new Set(entries.flatMap(e => e.answer))].filter(ch => !have.has(ch)).sort();
  if (mode === 'translit') {
    rows[0].push(...extra.filter(ch => /[0-9]/.test(ch)));
    rows[0].sort();
  }
  const rest = mode === 'translit' ? extra.filter(ch => !/[0-9]/.test(ch)) : extra;
  if (rest.length) rows.push(rest);
  return rows;
}
