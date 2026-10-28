// utils/quranHomework.ts
// -----------------------------------------------------------------------------
// How a piece of Quran homework ended.
//
// It used to be a single `isDone` flag, which could only say "closed" — so a
// homework the student never did and one the tutor withdrew both read as done,
// with a green tick on the student's portal.
//
// `isDone` still means CLOSED, and everything that counts open homework or
// decides whether to nag about it keeps reading exactly that. `outcome` says
// which kind of closed it is, and anything that SHOWS a result reads this
// instead. Homework closed before the field existed has none, and reads as
// done — which is what the flag meant at the time.
// -----------------------------------------------------------------------------
import type { QuranHomework } from '../types';

export type HomeworkOutcome = 'open' | 'done' | 'missed' | 'removed';

export const outcomeOf = (hw: Pick<QuranHomework, 'isDone' | 'outcome'>): HomeworkOutcome =>
  !hw.isDone ? 'open' : (hw.outcome ?? 'done');

export const OUTCOME_LABEL: Record<HomeworkOutcome, string> = {
  open: 'Open',
  done: 'Done',
  missed: "Wasn't done",
  removed: 'Removed',
};

/** Tailwind for the status pill, in both themes. */
export const OUTCOME_PILL: Record<HomeworkOutcome, string> = {
  open:    'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  done:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  missed:  'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  removed: 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300',
};

/** True when the student actually did it — the only case worth a tick. */
export const wasDone = (hw: Pick<QuranHomework, 'isDone' | 'outcome'>): boolean =>
  outcomeOf(hw) === 'done';

/* ── Deadlines ────────────────────────────────────────────────────────── */

export type DueState = 'none' | 'later' | 'soon' | 'overdue';

/** Under a day left is "soon" — the point at which it is worth a colour. */
const SOON_MS = 24 * 60 * 60 * 1000;

export function dueStateOf(
  hw: Pick<QuranHomework, 'dueAt'>, now: number = Date.now(),
): DueState {
  if (!hw.dueAt) return 'none';
  const left = Date.parse(hw.dueAt) - now;
  if (Number.isNaN(left)) return 'none';
  if (left < 0) return 'overdue';
  return left < SOON_MS ? 'soon' : 'later';
}

/**
 * How long is left, said the way a person says it: "2 days 3 hours",
 * "4 hours", "under an hour". Shared by the badge and the push, so the tutor
 * and the student are never told two different numbers.
 */
export function timeLeft(ms: number): string {
  if (ms <= 0) return 'no time';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'under an hour';
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  const days = d ? `${d} day${d === 1 ? '' : 's'}` : '';
  const hrs = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  return [days, hrs].filter(Boolean).join(' ');
}

/** "Thu 30 Oct, 18:00" — the deadline itself, for the homework card. */
export const dueLabel = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

/** Tailwind for the deadline chip, in both themes. */
export const DUE_PILL: Record<Exclude<DueState, 'none'>, string> = {
  later:   'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300',
  soon:    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  overdue: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
};
