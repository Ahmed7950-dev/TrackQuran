// services/homeworkBoardService.ts
// -----------------------------------------------------------------------------
// The homework board — who FINISHED the most homework this calendar month.
//
// A month is the 1st to the last day, in the viewer's own clock, and it starts
// level again on the 1st. Counting lives in `homework_handins`, one row per
// piece of homework FINISHED, and read back ALREADY COUNTED by the
// homework_board function — so a student's browser can show the board without
// being able to read another student's homework.
//
// A recitation is finished when the tutor passes it (log_recitation_pass, one
// row per chain of reassignments, so going back and forth over one homework is
// still one homework). A letter hunt is finished when it is handed in
// (log_homework_submission) — there is nothing to send back.
// Migration: supabase/migrations/20261110_homework_board.sql
//
// ── The order ────────────────────────────────────────────────────────────────
// More homework is ahead. Level on homework, whoever got there FIRST is ahead.
// Two rules, both sayable out loud, and together they order the board strictly
// — no two students share a place. It also means a student who has just handed
// one finished sits at the BOTTOM of his new count (his last one is the most
// recent there is), so he only ever climbs by doing MORE than the student above
// him, never by drawing level. That is what makes "you passed Zakaria" true.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

/** How many the students themselves see. The tutor sees everyone. */
export const TOP_N = 5;

/** Which kind of homework it was. One count, whatever kind. */
export type SubmissionKind = 'recitation' | 'hunt';

export interface BoardEntry {
  studentId: string;
  /** As it was stored when it counted; '' when the row never carried one. */
  name: string;
  sent: number;
  /** Verses / letters across them — detail, never part of the order. */
  items: number;
  lastAt: string;
}

export interface RankedEntry extends BoardEntry { rank: number }

/* ── The month ──────────────────────────────────────────────────────────── */

/** The half-open window [1st 00:00, next 1st 00:00) around a date, local. */
export function monthWindow(d: Date): { from: string; to: string } {
  return {
    from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString(),
    to: new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString(),
  };
}

export const monthLabel = (d: Date): string =>
  d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export const monthName = (d: Date): string =>
  d.toLocaleDateString(undefined, { month: 'long' });

/** The month after this one, used to grey out "next" on the current month. */
export const isThisMonth = (d: Date, now: Date = new Date()): boolean =>
  d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();

/** The month after this one, for "everyone starts level again on the 1st of —". */
export const nextMonthName = (d: Date): string =>
  monthName(new Date(d.getFullYear(), d.getMonth() + 1, 1));

/* ── Reading and writing ────────────────────────────────────────────────── */

interface BoardRow {
  student_id: string; student_name: string | null;
  sent: number | string; items: number | string; last_at: string;
}

/**
 * The board for one month. `null` means the read failed — which is NOT the
 * same as an empty month, and the callers show nothing rather than an empty
 * board that looks like nobody did any work.
 */
export async function fetchBoard(teacherId: string, month: Date): Promise<BoardEntry[] | null> {
  const { from, to } = monthWindow(month);
  const { data, error } = await supabase.rpc('homework_board', {
    p_teacher: teacherId, p_from: from, p_to: to,
  });
  if (error) { console.error('fetchBoard:', error.message); return null; }
  return ((data ?? []) as BoardRow[]).map(r => ({
    studentId: r.student_id,
    name: r.student_name ?? '',
    sent: Number(r.sent) || 0,
    items: Number(r.items) || 0,
    lastAt: r.last_at,
  }));
}

/**
 * A letter hunt handed in. Idempotent per (kind, ref). Never throws and never
 * blocks the hand-in it belongs to. Recitations do NOT come through here —
 * they count when they are passed, via logRecitationPass.
 */
export async function logHomeworkSubmission(input: {
  teacherId: string; studentId: string; studentName?: string | null;
  kind: SubmissionKind; ref: string; items?: number;
}): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_homework_submission', {
      p_teacher: input.teacherId,
      p_student: input.studentId,
      p_name: input.studentName ?? null,
      p_kind: input.kind,
      p_ref: input.ref,
      p_items: input.items ?? null,
    });
    if (error) console.error('logHomeworkSubmission:', error.message);
  } catch (e) {
    console.error('logHomeworkSubmission:', e);
  }
}

/**
 * A recitation homework the tutor has just passed. The server walks up the
 * chain of reassignments and writes ONE row against the homework it started
 * as, so a homework sent back three times and finally right is one point, not
 * four — and a homework still being revised is none.
 */
export async function logRecitationPass(recitationId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_recitation_pass', { p_rec: recitationId });
    if (error) console.error('logRecitationPass:', error.message);
  } catch (e) {
    console.error('logRecitationPass:', e);
  }
}

/* ── The order ──────────────────────────────────────────────────────────── */

const cmp = (a: BoardEntry, b: BoardEntry): number =>
  b.sent - a.sent
  || a.lastAt.localeCompare(b.lastAt)
  || a.name.localeCompare(b.name)
  || a.studentId.localeCompare(b.studentId);

export const rankBoard = (rows: BoardEntry[]): RankedEntry[] =>
  [...rows].sort(cmp).map((e, i) => ({ ...e, rank: i + 1 }));

/**
 * The board as it stood the moment before this student's latest homework was
 * marked right: the same rows with one taken off his count. He drops off it
 * altogether when that one was his first of the month.
 *
 * His last time is left as it is. It is only a tie-break, and leaving
 * it puts him at the bottom of the count he had — exactly where he was before,
 * since every student at that count got there before he did.
 */
export const boardBefore = (rows: BoardEntry[], studentId: string): BoardEntry[] =>
  rows
    .map(r => (r.studentId === studentId ? { ...r, sent: r.sent - 1 } : r))
    .filter(r => r.sent > 0);

export interface Standing {
  /** Every student with homework finished this month, in order. */
  all: RankedEntry[];
  /** False while the homework in hand is still waiting to be marked: these
   *  numbers do not include it yet, so nothing may claim that they do. */
  scored: boolean;
  /** The first TOP_N of them — what a student is shown. */
  top: RankedEntry[];
  me: RankedEntry | null;
  /** Where he was before this one counted; null when it was his first. */
  rankBefore: number | null;
  /** How many places it won him. 0 when it won none. */
  movedUp: number;
  /** The students he went past with it, nearest first. */
  passed: RankedEntry[];
  /** The student one place above him, and one place below. */
  ahead: RankedEntry | null;
  behind: RankedEntry | null;
  /** How many more he must finish to pass the student above / reach fifth. */
  toNext: number;
  toTop5: number;
}

/**
 * `scored` says whether the homework the student has in hand is already in
 * these numbers. It is, when he is being shown the board because the tutor
 * has just passed one; it is not, when he has only handed one in and it is
 * waiting to be marked — and then there is no climb to claim, so the before /
 * after comparison is not made at all.
 */
export function standingOf(rows: BoardEntry[], studentId: string, scored = true): Standing {
  const all = rankBoard(rows);
  const me = all.find(r => r.studentId === studentId) ?? null;
  const before = scored ? rankBoard(boardBefore(rows, studentId)) : [];
  const meBefore = scored ? before.find(r => r.studentId === studentId) ?? null : null;

  const ahead = me && me.rank > 1 ? all[me.rank - 2] : null;
  const behind = me && me.rank < all.length ? all[me.rank] : null;
  const fifth = all[TOP_N - 1] ?? null;

  // Who he went past: above him before, below him now.
  const passed: RankedEntry[] = [];
  if (me && meBefore) {
    const rankNow = new Map(all.map(r => [r.studentId, r.rank]));
    for (const r of before) {
      if (r.studentId === studentId) continue;
      const now = rankNow.get(r.studentId);
      if (r.rank < meBefore.rank && now !== undefined && now > me.rank) passed.push(all[now - 1]);
    }
    passed.sort((a, b) => a.rank - b.rank);
  }

  return {
    all,
    scored,
    top: all.slice(0, TOP_N),
    me,
    rankBefore: meBefore?.rank ?? null,
    movedUp: me && meBefore ? Math.max(0, meBefore.rank - me.rank) : 0,
    passed,
    ahead,
    behind,
    // One MORE than the gap: level is not past, so passing takes the gap + 1.
    toNext: me && ahead ? ahead.sent - me.sent + 1 : 0,
    toTop5: me && fifth && me.rank > TOP_N ? fifth.sent - me.sent + 1 : 0,
  };
}

/* ── Names and numbers ─────────────────────────────────────────────────── */

/** What a student is called on a board another student can see. */
export const firstName = (name: string): string => (name || 'A student').trim().split(/\s+/)[0];

export const ordinal = (n: number): string => {
  const two = n % 100;
  if (two >= 11 && two <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** Just the suffix, for a numeral drawn big with the suffix beside it. */
export const ordinalSuffix = (n: number): string => ordinal(n).replace(String(n), '');
