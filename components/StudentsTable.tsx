// ─────────────────────────────────────────────────────────────────────────────
// StudentsTable — the roster as one list instead of cards in three age groups:
// every student in a row, with the things the tutor checks before a lesson —
// when they next meet, whether the lesson is linked to the calendar, whether
// the portal link exists, homework still open, reminders switched on, and a
// recording waiting to be listened to.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo } from 'react';
import { Student } from '../types';
import StudentProfileIcon from './StudentProfileIcon';

export interface RosterRowData {
  /** The student's next lesson, from the calendar. */
  nextLesson?: Date;
  linked: boolean;
  hasPortal: boolean;
  openHomework: number;
  notifications: boolean;
  awaitingReview: boolean;
}

const dayLabel = (d: Date): string => {
  const now = new Date();
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(d) - midnight(now)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
};

/** A tick, a dash, or a warning — the three answers every column gives. */
const Mark: React.FC<{ on: boolean; label: string; warn?: boolean }> = ({ on, label, warn }) => (
  <span title={label} aria-label={label}
    className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${
      on ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
        : warn ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
        : 'bg-slate-100 text-slate-400 dark:bg-gray-700 dark:text-slate-500'}`}>
    {on ? (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
    ) : (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>
    )}
  </span>
);

const StudentsTable: React.FC<{
  students: Student[];
  data: Map<string, RosterRowData>;
  onSelectStudent: (id: string) => void;
}> = ({ students, data, onSelectStudent }) => {
  // Soonest lesson first — the order the tutor's day runs in; students with no
  // lesson booked fall to the bottom, alphabetically.
  const rows = useMemo(() => {
    const at = (s: Student) => data.get(s.id)?.nextLesson?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return [...students].sort((a, b) => at(a) - at(b) || a.name.localeCompare(b.name));
  }, [students, data]);

  const head = 'px-3 py-3 text-start text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap';
  const cell = 'px-3 py-2.5 align-middle whitespace-nowrap';

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="bg-slate-50 dark:bg-gray-700/40 border-b border-slate-200 dark:border-gray-700">
          <tr>
            <th scope="col" className={head}>Student</th>
            <th scope="col" className={head}>Next lesson</th>
            <th scope="col" className={`${head} text-center`}>Linked</th>
            <th scope="col" className={`${head} text-center`}>Portal</th>
            <th scope="col" className={`${head} text-center`}>Homework</th>
            <th scope="col" className={`${head} text-center`}>Reminders</th>
            <th scope="col" className={`${head} text-center`}>To review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
          {rows.map(s => {
            const d = data.get(s.id);
            const next = d?.nextLesson;
            const soon = !!next && next.getTime() - Date.now() < 24 * 3_600_000;
            return (
              <tr key={s.id}
                onClick={() => onSelectStudent(s.id)}
                className="cursor-pointer hover:bg-teal-50/60 dark:hover:bg-gray-700/40 transition-colors">
                <td className={cell}>
                  <span className="flex items-center gap-2.5">
                    <StudentProfileIcon src={(s as { profileIcon?: string }).profileIcon} size={30} mode="always" />
                    <span className="font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                  </span>
                </td>
                <td className={cell}>
                  {next ? (
                    <span className={`text-sm font-semibold ${soon ? 'text-teal-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-300'}`}>
                      {dayLabel(next)}
                    </span>
                  ) : (
                    <span className="text-sm text-slate-400 dark:text-slate-500">Not booked</span>
                  )}
                </td>
                <td className={`${cell} text-center`}>
                  <Mark on={!!d?.linked} label={d?.linked ? 'Linked to the calendar' : 'No lesson linked'} />
                </td>
                <td className={`${cell} text-center`}>
                  <Mark on={!!d?.hasPortal} label={d?.hasPortal ? 'Portal link created' : 'No portal link yet'} />
                </td>
                <td className={`${cell} text-center`}>
                  {d?.openHomework ? (
                    <span title={`${d.openHomework} not done yet`}
                      className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 text-[13px] font-extrabold">
                      {d.openHomework}
                    </span>
                  ) : (
                    <Mark on={false} label="Nothing open" />
                  )}
                </td>
                <td className={`${cell} text-center`}>
                  <Mark on={!!d?.notifications} label={d?.notifications ? 'Reminders on' : 'Reminders off — the phone is not registered'} />
                </td>
                <td className={`${cell} text-center`}>
                  {d?.awaitingReview ? (
                    <span title="A recording is waiting for you"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
                    </span>
                  ) : (
                    <Mark on={false} label="Nothing to review" />
                  )}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 italic">No students to show.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentsTable;
