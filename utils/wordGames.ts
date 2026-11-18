// utils/wordGames.ts
// -----------------------------------------------------------------------------
// Plain helpers for the Arabic word games that sit beside the crossword:
// Letter wheel, Quick match, Word search and Word snake. No AI anywhere —
// shuffles, look-alike letters and a small word-search layout search.
//
// The words come in as CrosswordEntry (utils/crossword.ts): one letter per
// box, harakat stripped, phrases and affixes already left out.
// -----------------------------------------------------------------------------
import type { CrosswordEntry, CrosswordMode } from './crossword';

export type Rng = () => number;

export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `n` entries for one run, the ones not played last time first. */
export function pickRun(entries: CrosswordEntry[], n: number, playedBefore: Set<string> = new Set(), rng: Rng = Math.random): CrosswordEntry[] {
  const fresh = shuffle(entries.filter(e => !playedBefore.has(e.id)), rng);
  const again = shuffle(entries.filter(e => playedBefore.has(e.id)), rng);
  return [...fresh, ...again].slice(0, n);
}

// ── Decoy letters ───────────────────────────────────────────────────────────

/** Letters that are easy to mix up. A decoy from the same family as a letter
 *  of the word makes the student look at the dots, not just the outline. */
const FAMILIES = ['بتثني', 'جحخ', 'دذ', 'رز', 'سش', 'صض', 'طظ', 'عغ', 'فق', 'كل', 'هة', 'اأإآ', 'وؤ', 'ىيئ'];
const ARABIC_ALPHABET = [...'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'];
const LATIN_LETTERS = [...'abdefghijklmnorstuwyz'];

/** `count` letters that are not in the word, look-alikes first. */
export function decoyLetters(answer: string[], mode: CrosswordMode, count: number, rng: Rng = Math.random): string[] {
  if (count <= 0) return [];
  const inWord = new Set(answer);
  const lookAlikes = mode === 'arabic'
    ? answer.flatMap(ch => [...(FAMILIES.find(f => f.includes(ch)) ?? '')]).filter(ch => !inWord.has(ch))
    : [];
  const rest = (mode === 'arabic' ? ARABIC_ALPHABET : LATIN_LETTERS).filter(ch => !inWord.has(ch));
  const out: string[] = [];
  for (const ch of [...shuffle(lookAlikes, rng), ...shuffle(rest, rng)]) {
    if (out.length >= count) break;
    if (!out.includes(ch)) out.push(ch);
  }
  return out;
}

// ── Word search ─────────────────────────────────────────────────────────────

/** Rows read in READING order: column 0 is where a word starts — the right
 *  edge in Arabic (the renderer mirrors it), the left edge in Latin. Words run
 *  across (in reading direction) or down; never backwards, never diagonal. */
export interface SearchPlacement {
  entry: CrosswordEntry;
  row: number;
  col: number;
  dir: 'across' | 'down';
  cells: string[];
}

export interface SearchGrid {
  size: number;
  letters: string[][];
  placements: SearchPlacement[];
}

export const searchKey = (r: number, c: number) => `${r},${c}`;

export const WORDS_PER_SEARCH = 6;
export const SEARCH_ROUNDS = 3;
const MAX_SEARCH_SIDE = 11;

function cellsOf(row: number, col: number, dir: 'across' | 'down', len: number): Array<[number, number]> {
  return Array.from({ length: len }, (_, i) => (dir === 'across' ? [row, col + i] : [row + i, col]) as [number, number]);
}

/** How many times `word` can be read in the grid, across or down. */
function occurrences(letters: string[][], word: string[]): number {
  const n = letters.length;
  let count = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      for (const dir of ['across', 'down'] as const) {
        const cells = cellsOf(r, c, dir, word.length);
        if (cells.some(([rr, cc]) => rr >= n || cc >= n)) continue;
        if (cells.every(([rr, cc], i) => letters[rr][cc] === word[i])) count++;
      }
    }
  }
  return count;
}

/** One grid for up to WORDS_PER_SEARCH words. Words that do not fit come back
 *  in `leftOut` for the next grid. */
export function buildSearch(entries: CrosswordEntry[], mode: CrosswordMode, rng: Rng = Math.random): { grid: SearchGrid; leftOut: CrosswordEntry[] } {
  const usable = entries.filter(e => e.answer.length <= MAX_SEARCH_SIDE);
  const longest = Math.max(3, ...usable.map(e => e.answer.length));
  const letterCount = usable.reduce((n, e) => n + e.answer.length, 0);
  const size = Math.min(MAX_SEARCH_SIDE, Math.max(7, longest + 1, Math.ceil(Math.sqrt(letterCount * 2.2))));

  let best: { grid: SearchGrid; leftOut: CrosswordEntry[] } | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const letters: string[][] = Array.from({ length: size }, () => Array<string>(size).fill(''));
    const placements: SearchPlacement[] = [];
    const leftOut: CrosswordEntry[] = entries.filter(e => e.answer.length > MAX_SEARCH_SIDE);
    // Longest first: they are the hardest to fit.
    for (const entry of [...usable].sort((a, b) => b.answer.length - a.answer.length || rng() - 0.5)) {
      const len = entry.answer.length;
      const spots: Array<{ row: number; col: number; dir: 'across' | 'down'; shared: number }> = [];
      for (const dir of ['across', 'down'] as const) {
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            const cells = cellsOf(row, col, dir, len);
            if (cells.some(([r, c]) => r >= size || c >= size)) continue;
            let shared = 0, ok = true;
            cells.forEach(([r, c], i) => {
              if (!letters[r][c]) return;
              if (letters[r][c] === entry.answer[i]) shared++; else ok = false;
            });
            // Sharing every letter would hide the word inside another one.
            if (ok && shared < len) spots.push({ row, col, dir, shared });
          }
        }
      }
      if (!spots.length) { leftOut.push(entry); continue; }
      // Mostly random, a little drawn to crossings so the grid feels woven.
      const crossing = spots.filter(s => s.shared > 0);
      const pick = crossing.length && rng() < 0.35
        ? crossing[Math.floor(rng() * crossing.length)]
        : spots[Math.floor(rng() * spots.length)];
      const cells = cellsOf(pick.row, pick.col, pick.dir, len);
      cells.forEach(([r, c], i) => { letters[r][c] = entry.answer[i]; });
      placements.push({ entry, row: pick.row, col: pick.col, dir: pick.dir, cells: cells.map(([r, c]) => searchKey(r, c)) });
    }

    // Fill the gaps with letters that look like the round's own, so the words
    // do not stand out from a background of strangers.
    const own = [...new Set(usable.flatMap(e => e.answer))];
    const alphabet = mode === 'arabic' ? ARABIC_ALPHABET : LATIN_LETTERS;
    let unique = false;
    for (let fillTry = 0; fillTry < 12 && !unique; fillTry++) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const placed = placements.some(p => p.cells.includes(searchKey(r, c)));
          if (!placed) letters[r][c] = rng() < 0.55 ? own[Math.floor(rng() * own.length)] : alphabet[Math.floor(rng() * alphabet.length)];
        }
      }
      // A word must be findable in exactly one place, or the student finds the
      // "wrong" copy and is told no.
      unique = placements.every(p => occurrences(letters, p.entry.answer) === 1);
    }
    // Still a double somewhere: that word waits for the next grid.
    const doubled = placements.filter(p => occurrences(letters, p.entry.answer) !== 1);
    const result = {
      grid: { size, letters, placements: placements.filter(p => !doubled.includes(p)) },
      leftOut: [...leftOut, ...doubled.map(p => p.entry)],
    };
    if (!best || result.leftOut.length < best.leftOut.length) best = result;
    if (!best.leftOut.length) break;
  }
  return best!;
}

/** The straight line of cells from `a` towards `b`: across or down, whichever
 *  the drag leans to. Coordinates in reading order. */
export function lineBetween(a: [number, number], b: [number, number]): Array<[number, number]> {
  const dr = b[0] - a[0], dc = b[1] - a[1];
  if (Math.abs(dc) >= Math.abs(dr)) {
    const step = Math.sign(dc) || 1;
    return Array.from({ length: Math.abs(dc) + 1 }, (_, i) => [a[0], a[1] + i * step] as [number, number]);
  }
  const step = Math.sign(dr);
  return Array.from({ length: Math.abs(dr) + 1 }, (_, i) => [a[0] + i * step, a[1]] as [number, number]);
}
