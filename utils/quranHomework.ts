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
