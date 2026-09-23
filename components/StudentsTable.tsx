// ─────────────────────────────────────────────────────────────────────────────
// StudentsTable — the roster as one list instead of cards in three age groups:
// every student in a row, with the things the tutor checks before a lesson —
// when they next meet, whether the lesson is linked to the calendar, homework
// still open, reminders switched on, a recording waiting — and how they are
// doing: pages, quality, mistakes, fluency level and rank.
// Any column sorts by its header.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { Student } from '../types';
import StudentProfileIcon from './StudentProfileIcon';

export interface RosterRowData {
  /** The student's next lesson, from the calendar. */
  nextLesson?: Date;
  linked: boolean;
  openHomework: number;
  notifications: boolean;
  awaitingReview: boolean;
  pagesRead: number;
  pagesMemorized: number;
  /** Average reading quality out of 10, or null when nothing is logged. */
  quality: number | null;
  /** Counted mistakes per page covered, or null when no pages are covered. */
  mistakeRate: number | null;
  /** Highest fluency level passed, or null. */
  fluency: number | null;
  /** Place among all students by score. */
  rank: number;
}

type SortKey =
  | 'name' | 'nextLesson' | 'linked' | 'homework' | 'reminders' | 'review'
  | 'pagesRead' | 'pagesMemorized' | 'quality' | 'mistakes' | 'fluency' | 'rank';

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

/** A tick or a dash — the answer every yes/no column gives. */
const Mark: React.FC<{ on: boolean; label: string }> = ({ on, label }) => (
  <span title={label} aria-label={label}
    className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${
      on ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
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
  archivedIds?: Set<string>;
  onToggleArchive?: (studentId: string, archived: boolean) => void;
  /** Ring the student's phone: "check your homework". */
  onRemind?: (studentId: string) => Promise<void>;
}> = ({ students, data, onSelectStudent, archivedIds, onToggleArchive, onRemind }) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nextLesson', dir: 'asc' });
  /** studentId → 'sending' while it goes, 'sent' for a few seconds after. */
  const [reminded, setReminded] = useState<Record<string, 'sending' | 'sent'>>({});

  const remind = async (studentId: string) => {
    if (!onRemind || reminded[studentId]) return;
    setReminded(r => ({ ...r, [studentId]: 'sending' }));
    await onRemind(studentId);
    setReminded(r => ({ ...r, [studentId]: 'sent' }));
    window.setTimeout(() => setReminded(r => {
      const next = { ...r };
      delete next[studentId];
      return next;
    }), 8000);   // the tick sticks around, so a double tap can't double-send
  };

  /** Text sorts A→Z first, everything else biggest-first. */
  const clickHeader = (key: SortKey) => setSort(cur =>
    cur.key === key
      ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'name' || key === 'nextLesson' || key === 'rank' || key === 'mistakes' ? 'asc' : 'desc' });

  const rows = useMemo(() => {
    const LAST = Number.MAX_SAFE_INTEGER;
    const valueOf = (s: Student): number | string => {
      const d = data.get(s.id);
      switch (sort.key) {
        case 'name': return s.name.toLocaleLowerCase();
        case 'nextLesson': return d?.nextLesson?.getTime() ?? LAST;
        case 'linked': return d?.linked ? 1 : 0;
        case 'homework': return d?.openHomework ?? 0;
        case 'reminders': return d?.notifications ? 1 : 0;
        case 'review': return d?.awaitingReview ? 1 : 0;
        case 'pagesRead': return d?.pagesRead ?? 0;
        case 'pagesMemorized': return d?.pagesMemorized ?? 0;
        case 'quality': return d?.quality ?? -1;
        // Nothing covered yet sorts last either way, not as a perfect score.
        case 'mistakes': return d?.mistakeRate ?? (sort.dir === 'asc' ? LAST : -1);
        case 'fluency': return d?.fluency ?? -1;
        case 'rank': return d?.rank ?? LAST;
        default: return 0;
      }
    };
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...students].sort((a, b) => {
      const va = valueOf(a), vb = valueOf(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va).localeCompare(String(vb)) * sign || a.name.localeCompare(b.name);
      }
      return (va - vb) * sign || a.name.localeCompare(b.name);
    });
  }, [students, data, sort]);

  const head = 'px-3 py-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap';
  const cell = 'px-3 py-2.5 align-middle whitespace-nowrap';

  const Header: React.FC<{ id: SortKey; label: string; title?: string; align?: 'start' | 'center' }> = ({ id, label, title, align = 'center' }) => (
    <th scope="col" className={`${head} ${align === 'start' ? 'text-start' : 'text-center'}`}>
      <button onClick={() => clickHeader(id)} title={title ?? `Sort by ${label}`}
        aria-label={`Sort by ${label}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-slate-800 dark:hover:text-slate-200 transition-colors ${
          sort.key === id ? 'text-teal-700 dark:text-orange-400' : ''}`}>
        {label}
        <svg className={`w-3 h-3 transition-opacity ${sort.key === id ? 'opacity-100' : 'opacity-0'} ${sort.key === id && sort.dir === 'desc' ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <table className="w-full min-w-[1180px] border-collapse">
        <thead className="bg-slate-50 dark:bg-gray-700/40 border-b border-slate-200 dark:border-gray-700">
          <tr>
            <Header id="name" label="Student" align="start" />
            <Header id="nextLesson" label="Next lesson" align="start" />
            <Header id="linked" label="Linked" title="Linked to a calendar lesson" />
            <Header id="homework" label="Homework" title="Homework still not done" />
            <Header id="reminders" label="Remind" title="Ring their phone: check your homework" />
            <Header id="review" label="To review" title="A recording is waiting for you" />
            <Header id="pagesRead" label="Read" title="Pages read" />
            <Header id="pagesMemorized" label="Hifz" title="Pages memorized" />
            <Header id="quality" label="Quality" title="Average reading quality out of 10" />
            <Header id="mistakes" label="Mistakes" title="Counted mistakes per page covered" />
            <Header id="fluency" label="Fluency" title="Highest fluency level passed" />
            <Header id="rank" label="Rank" title="Place among all students" />
            {onToggleArchive && <th scope="col" className={`${head} text-center`}>Archive</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
          {rows.map(s => {
            const d = data.get(s.id);
            const next = d?.nextLesson;
            const soon = !!next && next.getTime() - Date.now() < 24 * 3_600_000;
            const archived = !!archivedIds?.has(s.id);
            const num = 'text-sm font-semibold text-slate-700 dark:text-slate-200';
            const dim = 'text-sm text-slate-400 dark:text-slate-500';
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
                    <span className={dim}>Not booked</span>
                  )}
                </td>
                <td className={`${cell} text-center`}>
                  <Mark on={!!d?.linked} label={d?.linked ? 'Linked to the calendar' : 'No lesson linked'} />
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
                  {!d?.notifications ? (
                    <Mark on={false} label="Reminders off — the phone is not registered" />
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); remind(s.id); }}
                      disabled={!onRemind || !!reminded[s.id]}
                      title={reminded[s.id] === 'sent' ? 'Reminder sent' : `Remind ${s.name} to check their homework`}
                      aria-label={reminded[s.id] === 'sent' ? 'Reminder sent' : `Remind ${s.name} to check their homework`}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors ${
                        reminded[s.id] === 'sent'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/70'} ${
                        reminded[s.id] === 'sending' ? 'opacity-60' : ''}`}>
                      {reminded[s.id] === 'sent' ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
                      ) : (
                        <svg className={`w-[18px] h-[18px] ${reminded[s.id] === 'sending' ? 'animate-pulse' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 8a6 6 0 0 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" /><path d="M10.5 20a2 2 0 0 0 3 0" />
                        </svg>
                      )}
                    </button>
                  )}
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
                <td className={`${cell} text-center ${num}`}>{d?.pagesRead || <span className={dim}>—</span>}</td>
                <td className={`${cell} text-center ${num}`}>{d?.pagesMemorized || <span className={dim}>—</span>}</td>
                <td className={`${cell} text-center`}>
                  {d?.quality == null ? <span className={dim}>—</span> : (
                    <span className={`text-sm font-semibold ${d.quality >= 8 ? 'text-emerald-700 dark:text-emerald-400' : d.quality >= 6 ? 'text-slate-700 dark:text-slate-200' : 'text-amber-700 dark:text-amber-400'}`}>
                      {d.quality.toFixed(1)}
                    </span>
                  )}
                </td>
                <td className={`${cell} text-center`}>
                  {d?.mistakeRate == null ? <span className={dim}>—</span> : (
                    <span title="Counted mistakes per page covered"
                      className={`text-sm font-semibold ${d.mistakeRate <= 0.5 ? 'text-emerald-700 dark:text-emerald-400' : d.mistakeRate <= 1.5 ? 'text-slate-700 dark:text-slate-200' : 'text-amber-700 dark:text-amber-400'}`}>
                      {d.mistakeRate.toFixed(1)}
                    </span>
                  )}
                </td>
                <td className={`${cell} text-center`}>
                  {d?.fluency == null ? <span className={dim}>—</span> : (
                    <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 text-[13px] font-extrabold">
                      {d.fluency}
                    </span>
                  )}
                </td>
                <td className={`${cell} text-center ${num}`}>
                  {d?.rank ? <span title={`${d.rank} of ${students.length}`}>#{d.rank}</span> : <span className={dim}>—</span>}
                </td>
                {onToggleArchive && (
                  <td className={`${cell} text-center`}>
                    <button
                      onClick={e => { e.stopPropagation(); onToggleArchive(s.id, !archived); }}
                      title={archived ? `Bring ${s.name} back` : `Archive ${s.name}`}
                      aria-label={archived ? `Bring ${s.name} back` : `Archive ${s.name}`}
                      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
                        archived
                          ? 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30'
                          : 'border-slate-200 dark:border-gray-600 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>
                      {archived ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h18v4H3zM5 11v9h14v-9M12 18V8m0 0-3 3m3-3 3 3" /></svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h18v4H3zM5 11v9h14v-9M10 15h4" /></svg>
                      )}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 italic">No students to show.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default StudentsTable;
