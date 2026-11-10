// utils/leaderboardCheer.ts
// -----------------------------------------------------------------------------
// What the board SAYS to a student about his place on it — on the screen he
// gets when he hands homework in, and again when his teacher marks it right.
//
// One headline and one line under it, chosen from a pool per place — several
// for every one of the five, several for outside them, and a pool of their own
// for the moment he goes past somebody, which is the whole point of a board.
//
// Rules the pools keep:
//   * always true. Every number in them comes from the standing, so a line can
//     never congratulate a student on something that did not happen.
//   * always forward. Even last place is told what the next step is, never
//     what he failed to do.
//   * one voice for a seven-year-old and his father. No baby talk, no slang,
//     nothing that would embarrass an adult learner reading it on his phone.
//   * the choice is a pure function of the standing, so it does not flicker on
//     a re-render, and it does move on as he climbs.
// -----------------------------------------------------------------------------

import { ordinal } from '../services/homeworkBoardService';

export interface CheerCtx {
  rank: number;
  /** How many pieces of homework he has FINISHED this month. */
  sent: number;
  /** How many students are on the board at all. */
  total: number;
  /** Places won by the homework just marked right. 0 when it won none. */
  movedUp: number;
  /** The nearest student he went past, if he went past anybody. */
  passed: string | null;
  aheadName: string | null;
  /** How many more he must finish to go past the student above him. */
  toNext: number;
  behindName: string | null;
  /** How far ahead of the student below him he is. */
  behindGap: number;
  fifthName: string | null;
  /** How many more he must finish to reach fifth place, when he is below it. */
  toTop5: number;
  /** His first finished homework of the month. */
  firstEver: boolean;
}

export interface Cheer { headline: string; line: string }

/** One candidate line. Returns null when the standing cannot fill it. */
type Candidate = (c: CheerCtx) => string | null;

/** The first pool entry whose text can be filled, counting from the seed. */
const choose = (pool: Candidate[], c: CheerCtx, seed: number): string => {
  const usable = pool.map(f => f(c)).filter((s): s is string => !!s);
  if (!usable.length) return '';
  return usable[seed % usable.length];
};

/* ── Headlines ─────────────────────────────────────────────────────────── */

const PASSED_FIRST: Candidate[] = [
  c => `You took first place from ${c.passed}!`,
  c => `First place is yours now!`,
  c => `You passed ${c.passed} — you are first!`,
];

const PASSED: Candidate[] = [
  c => `You passed ${c.passed}!`,
  c => `${c.passed} is behind you now.`,
  c => `That one took you past ${c.passed}.`,
  c => (c.movedUp > 1 ? `Up ${c.movedUp} places — past ${c.passed}!` : null),
];

const FIRST_IN: Candidate[] = [
  () => 'Your name is on the board.',
  () => 'That is your first one this month.',
  c => (c.rank === 1 ? 'First one in, and straight to the top.' : null),
];

const HEAD: Record<number, Candidate[]> = {
  1: [
    () => 'First place is yours.',
    () => 'Nobody above you.',
    () => 'Top of the board.',
    () => 'Still first.',
  ],
  2: [
    () => 'Second place.',
    () => 'One step from the top.',
    () => 'Second, and climbing.',
  ],
  3: [
    () => 'Third on the board.',
    () => 'You are in the top three.',
    () => 'Third place this month.',
  ],
  4: [
    () => 'Fourth, and in the five.',
    () => 'Your name is on the board.',
    () => 'Fourth place this month.',
  ],
  5: [
    () => 'Fifth — you are in the five.',
    () => 'Your name is on the board.',
    () => 'Fifth place, and holding it.',
  ],
  0: [
    c => `${ordinal(c.rank)} this month.`,
    c => `${c.sent} finished this month.`,
    () => 'Every one of them counts.',
  ],
};

/* ── Lines ─────────────────────────────────────────────────────────────── */

const PASSED_LINE_FIRST: Candidate[] = [
  c => `Be the first always — and do not let ${c.passed} take it back.`,
  c => `${c.passed} will want that place back. Stay first, one homework at a time.`,
  c => `The top is the hardest place to hold. Keep ${c.passed} behind you.`,
];

const PASSED_LINE: Candidate[] = [
  c => `Well done. Now do not let ${c.passed} take it back.`,
  c => (c.aheadName ? `Congratulations — and ${c.aheadName} is only ${c.toNext} away.` : null),
  c => `${c.passed} will be working to pass you back. Keep going.`,
  c => (c.aheadName ? `One place up, and ${c.toNext} more takes you past ${c.aheadName}.` : null),
];

const LINE: Record<number, Candidate[]> = {
  1: [
    c => (c.behindName && c.behindGap > 0 ? `${c.behindName} is ${c.behindGap} behind. Be the first always.` : null),
    c => `${c.sent} finished this month. Keep the habit and keep the top.`,
    c => (c.behindName ? `Staying first is harder than getting there — and you are staying. Keep ${c.behindName} behind you.` : null),
    () => 'Be the first always. Nobody has caught you yet.',
  ],
  2: [
    c => (c.aheadName ? `${c.toNext} more and you take first from ${c.aheadName}.` : null),
    c => (c.aheadName ? `${c.aheadName} is first for now. ${c.toNext} more homework changes that.` : null),
    () => 'Second is a good place to push from, and the month is not over.',
  ],
  3: [
    c => (c.aheadName ? `${c.toNext} more and ${c.aheadName} is behind you.` : null),
    c => (c.aheadName && c.behindName
      ? `${c.aheadName} is ${c.toNext} away. Keep going, and keep ${c.behindName} behind you.`
      : null),
    () => 'Top three this month. Keep sending them in.',
  ],
  4: [
    c => (c.aheadName ? `${c.toNext} more and you are third.` : null),
    c => (c.aheadName ? `${c.aheadName} is within reach — just ${c.toNext} more.` : null),
    () => 'You are in the five. Hold it, then climb.',
  ],
  5: [
    c => (c.aheadName ? `${c.toNext} more and fourth is yours.` : null),
    c => (c.behindName ? `Hold on to it — ${c.behindName} wants your place.` : null),
    () => 'You made the five. Every homework from here keeps you in it.',
  ],
  0: [
    c => (c.toTop5 > 0 && c.fifthName
      ? `${c.toTop5} more and you take fifth place from ${c.fifthName}.`
      : null),
    c => (c.toTop5 > 0 ? `${c.toTop5} more and your name is on the board.` : null),
    c => (c.aheadName ? `Just ${c.toNext} more and you go past ${c.aheadName}.` : null),
    () => 'The month is still open, and every homework counts.',
  ],
};

/* ── The one thing this module is for ──────────────────────────────────── */

export function cheerFor(c: CheerCtx): Cheer {
  // Moves on as he climbs, stays put while he is where he is.
  const seed = c.sent * 3 + c.rank;
  const bucket = c.rank >= 1 && c.rank <= 5 ? c.rank : 0;
  const first = c.rank === 1;

  const headPool = c.passed ? (first ? PASSED_FIRST : PASSED)
    : c.firstEver ? FIRST_IN
    : HEAD[bucket];
  const linePool = c.passed ? (first ? PASSED_LINE_FIRST : PASSED_LINE) : LINE[bucket];

  return {
    headline: choose(headPool, c, seed) || choose(HEAD[bucket], c, seed),
    // A step along from the headline's, so the two pools cannot land on the
    // same thought twice in a row.
    line: choose(linePool, c, seed + 1) || choose(LINE[bucket], c, seed + 1),
  };
}

/** The chip beside his place: what the finished homework just did to it. */
export type Move = 'up' | 'held' | 'new';

export const moveOf = (c: { firstEver: boolean; movedUp: number }): Move =>
  c.firstEver ? 'new' : c.movedUp > 0 ? 'up' : 'held';

export const MOVE_LABEL: Record<Move, (c: CheerCtx) => string> = {
  up: c => (c.movedUp === 1 ? 'Up one place' : `Up ${c.movedUp} places`),
  held: c => (c.rank === 1 ? 'Still first' : 'Place held'),
  new: () => 'On the board',
};
