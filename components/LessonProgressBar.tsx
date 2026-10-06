// components/LessonProgressBar.tsx
// ---------------------------------------------------------------------------
// How far through a PDF lesson a student has got, on the row in the lesson
// list — so the tutor can see where everyone is without opening anything.
//
// Qaedah lessons add a second line: one small fixed segment per word in the
// lesson, filled for the ones that have been practised. Same size everywhere,
// so a long lesson and a short one can be compared by eye.
// ---------------------------------------------------------------------------
import React from 'react';

interface Props {
  /** 0–1. */
  fraction: number;
  done?: boolean;
  /** e.g. "slide 4 of 12" — the words beside the bar. */
  label?: string;
  revisions?: number;
  /** Qaedah only: one entry per word, true where it has been practised. */
  words?: boolean[];
}

const LessonProgressBar: React.FC<Props> = ({ fraction, done, label, revisions = 0, words }) => {
  const pct = Math.max(0, Math.min(100, fraction * 100));
  const practised = words?.filter(Boolean).length ?? 0;
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-gray-600 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${
              done ? 'bg-emerald-500' : 'bg-teal-500'}`}
            // A lesson that has been opened at all shows a sliver, so "started"
            // and "never touched" never look the same.
            style={{ width: `${pct > 0 && pct < 3 ? 3 : pct}%` }}
          />
        </div>
        {label && (
          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
            {label}
          </span>
        )}
        {revisions > 0 && (
          <span className="flex-shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400">
            ×{revisions}
          </span>
        )}
      </div>

      {words && words.length > 0 && (
        <div className="flex items-center gap-2">
          <div dir="ltr" className="flex flex-wrap gap-[2px] min-w-0">
            {words.map((on, i) => (
              <span key={i}
                title={`Word ${i + 1}${on ? ' · practised' : ''}`}
                className={`w-1.5 h-2.5 rounded-[1px] flex-shrink-0 ${
                  on ? 'bg-teal-500' : 'bg-slate-200 dark:bg-gray-600'}`} />
            ))}
          </div>
          <span className="flex-shrink-0 text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
            {practised}/{words.length} words
          </span>
        </div>
      )}
    </div>
  );
};

export default LessonProgressBar;
