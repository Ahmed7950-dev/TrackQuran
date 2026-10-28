// components/DeadlinePicker.tsx
// -----------------------------------------------------------------------------
// When is this homework due?
//
// Two panels, both a single row read left to right: the week, then the hours of
// the day picked. Across both, the student's own lessons are coloured — because
// a deadline is nearly always "before our next lesson", and the tutor should be
// able to see which day that is without counting on a calendar.
//
// The row is the whole point: a month grid makes you hunt for a date, where a
// week laid out flat is read in one glance, and the lesson days stand out of it
// by themselves.
//
// Nothing is chosen until an hour is pressed. "No deadline" is a first-class
// answer, sitting in the same panel rather than hidden behind a cancel.
// -----------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getStudentUpcomingSessions } from '../services/lessonSessionService';

interface Props {
  studentId: string;
  studentName: string;
  /** What is already set, so re-opening the picker shows where you were. */
  value?: string | null;
  /** An ISO string, or null for "leave it open". */
  onPick: (iso: string | null) => void;
  onClose: () => void;
}

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** Monday of the week that holds `d`. */
const weekStart = (d: Date) => {
  const x = startOfDay(d);
  const back = (x.getDay() + 6) % 7;          // Sun=0 → 6, Mon=1 → 0
  x.setDate(x.getDate() - back);
  return x;
};

const DeadlinePicker: React.FC<Props> = ({ studentId, studentName, value, onPick, onClose }) => {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [weekOf, setWeekOf] = useState(() => weekStart(value ? new Date(value) : new Date()));
  const [day, setDay] = useState<Date | null>(() => (value ? startOfDay(new Date(value)) : null));
  const [lessons, setLessons] = useState<Date[]>([]);
  const [loading, setLoading] = useState(true);
  const hourStrip = useRef<HTMLDivElement>(null);

  // The student's lessons, so the week can colour the days they already meet.
  useEffect(() => {
    let dead = false;
    getStudentUpcomingSessions(studentId)
      .then(rows => { if (!dead) setLessons(rows.map(r => new Date(r.startAt))); })
      .catch(() => { /* no calendar is not an error — the picker still works */ })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [studentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); day ? setDay(null) : onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [day, onClose]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekOf.getTime() + i * DAY_MS)),
    [weekOf],
  );
  const lessonsOn = (d: Date) => lessons.filter(l => sameDay(l, d));
  const canGoBack = weekOf.getTime() > weekStart(today).getTime();

  // Open the hour strip where the day actually starts being useful: on the
  // lesson if there is one, otherwise at the morning.
  useEffect(() => {
    if (!day || !hourStrip.current) return;
    const lesson = lessonsOn(day)[0];
    const target = lesson ? lesson.getHours() : 8;
    const el = hourStrip.current.querySelector<HTMLElement>(`[data-hour="${target}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [day, lessons]);

  const pickHour = (h: number) => {
    if (!day) return;
    const at = new Date(day);
    at.setHours(h, 0, 0, 0);
    onPick(at.toISOString());
  };

  const ribbon = 'rounded-2xl border px-3 py-2.5 transition-all';

  return (
    <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="Set a deadline"
        className="w-full sm:max-w-5xl bg-white dark:bg-gray-800 shadow-2xl rounded-t-3xl sm:rounded-3xl
                   border border-slate-200 dark:border-gray-700 overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* ── header ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 sm:px-7 pt-5 pb-4 border-b border-slate-100 dark:border-gray-700">
          {day && (
            <button type="button" onClick={() => setDay(null)} aria-label="Back to the week"
              className="w-9 h-9 -ms-1 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5.5L8 12l6.5 6.5" /></svg>
            </button>
          )}
          <div className="min-w-0 flex-grow">
            <p className="m-0 text-[11px] font-black uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
              {day ? 'Step 2 · what time' : 'Step 1 · which day'}
            </p>
            <h3 className="m-0 mt-0.5 text-lg font-black text-slate-800 dark:text-slate-100 truncate">
              {day
                ? day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
                : `When is this due for ${studentName}?`}
            </h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* ── the week ─────────────────────────────────────────────── */}
        {!day ? (
          <div className="px-5 sm:px-7 py-5">
            <div className="flex items-center justify-between mb-3">
              <button type="button" disabled={!canGoBack}
                onClick={() => setWeekOf(w => new Date(w.getTime() - 7 * DAY_MS))}
                className="h-9 px-3 rounded-xl text-[13px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-gray-600">
                ← Earlier
              </button>
              <span className="text-[12.5px] font-bold text-slate-400 dark:text-slate-500">
                {days[0].toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </span>
              <button type="button" onClick={() => setWeekOf(w => new Date(w.getTime() + 7 * DAY_MS))}
                className="h-9 px-3 rounded-xl text-[13px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600">
                Later →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
              {days.map(d => {
                const past = d.getTime() < today.getTime();
                const mine = lessonsOn(d);
                const isToday = sameDay(d, today);
                const chosen = value ? sameDay(d, new Date(value)) : false;
                return (
                  <button key={d.toISOString()} type="button" disabled={past}
                    onClick={() => setDay(d)}
                    aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${mine.length ? ` — ${mine.length} lesson` : ''}`}
                    className={`${ribbon} flex flex-col items-center gap-1 ${
                      past ? 'opacity-35 cursor-not-allowed border-slate-200 dark:border-gray-700'
                        : mine.length
                          ? 'border-teal-400 dark:border-teal-500 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50'
                          : 'border-slate-200 dark:border-gray-600 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                    } ${chosen ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-gray-800' : ''}`}>
                    <span className={`text-[10.5px] font-black uppercase tracking-wider ${mine.length ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500'}`}>
                      {d.toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className={`text-xl sm:text-2xl font-black leading-none ${mine.length ? 'text-teal-800 dark:text-teal-200' : 'text-slate-700 dark:text-slate-200'}`}>
                      {d.getDate()}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      {d.toLocaleDateString(undefined, { month: 'short' })}
                    </span>
                    {/* A dot per lesson that day — the thing the tutor is aiming at. */}
                    <span className="h-2 flex items-center gap-[3px]">
                      {mine.slice(0, 3).map((_, i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-teal-500 dark:bg-teal-400" />
                      ))}
                      {isToday && !mine.length && <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-gray-600" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4">
              <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                {loading ? 'looking up the lessons…' : `${studentName} has a lesson`}
              </span>
              <span className="flex-grow" />
              <button type="button" onClick={() => onPick(null)}
                className="h-10 px-4 rounded-xl text-[13.5px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
                Leave it open — no deadline
              </button>
            </div>
          </div>
        ) : (
          /* ── the hours ──────────────────────────────────────────── */
          <div className="px-5 sm:px-7 py-5">
            <div ref={hourStrip} className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
              {Array.from({ length: 24 }, (_, h) => {
                const mine = lessonsOn(day).some(l => l.getHours() === h);
                const gone = sameDay(day, today) && h <= new Date().getHours();
                const chosen = value ? sameDay(day, new Date(value)) && new Date(value).getHours() === h : false;
                return (
                  <button key={h} type="button" data-hour={h} disabled={gone}
                    onClick={() => pickHour(h)}
                    aria-label={`${String(h).padStart(2, '0')}:00${mine ? ' — lesson time' : ''}`}
                    className={`${ribbon} flex-shrink-0 w-[62px] sm:w-[72px] flex flex-col items-center gap-0.5 ${
                      gone ? 'opacity-30 cursor-not-allowed border-slate-200 dark:border-gray-700'
                        : mine
                          ? 'border-teal-400 dark:border-teal-500 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50'
                          : 'border-slate-200 dark:border-gray-600 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20'
                    } ${chosen ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-gray-800' : ''}`}>
                    <span className={`text-base sm:text-lg font-black leading-none ${mine ? 'text-teal-800 dark:text-teal-200' : 'text-slate-700 dark:text-slate-200'}`}>
                      {String(h).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">:00</span>
                    <span className="h-2 flex items-center">
                      {mine && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 dark:bg-teal-400" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
              <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                {lessonsOn(day).length
                  ? `lesson at ${lessonsOn(day).map(l => l.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })).join(', ')}`
                  : `no lesson for ${studentName} on this day`}
              </span>
              <span className="flex-grow" />
              <button type="button" onClick={() => onPick(null)}
                className="h-10 px-4 rounded-xl text-[13.5px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
                Leave it open — no deadline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeadlinePicker;
