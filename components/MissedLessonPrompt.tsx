// components/MissedLessonPrompt.tsx
// -----------------------------------------------------------------------------
// Tutor-only nudge: when a calendar lesson has FULLY finished and nothing was
// logged for that student that day, ask what happened. Mounted at the app
// shell so it appears on any page (including the students list).
//
// A lesson counts as "unlogged" when, on the lesson's own day, the student has
//   * no reading / hifz / tafsir achievement, AND
//   * no attendance record at all (present, absent or rescheduled).
// Answering writes that day's attendance; dismissing with ✕ only silences the
// occurrence (kept in localStorage, so it never nags twice for the same lesson).
//
// It sits in the bottom-LEFT corner rather than over the page: the tutor can
// carry on working, and a queue of several misses is answered one card at a
// time without the screen being blocked.
// -----------------------------------------------------------------------------

import React, { useEffect, useState, useCallback } from 'react';
import { Student, AttendanceRecord, AttendanceStatus } from '../types';
import { fetchGCalEvents, getStoredToken } from '../services/googleCalendarService';
import { getSessionsListByGcalId } from '../services/lessonSessionService';

/** How far back to look. Older misses are water under the bridge. */
const LOOKBACK_DAYS = 14;
const DISMISS_KEY = 'missedLesson:dismissed';

interface Missed {
  key: string;          // stable per occurrence
  student: Student;
  title: string;
  startAt: Date;
  endAt: Date;
}

const readDismissed = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
};
const rememberDismissed = (key: string) => {
  try {
    const all = readDismissed();
    all.add(key);
    // keep the list from growing without bound
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...all].slice(-300)));
  } catch { /* private mode — it will just ask again next session */ }
};

/** Did this student have anything logged on that calendar day? */
const hasProgressOn = (student: Student, day: Date): boolean => {
  const ds = day.toDateString();
  const on = (d: string) => new Date(d).toDateString() === ds;
  return (student.recitationAchievements ?? []).some(a => on(a.date))
    || (student.memorizationAchievements ?? []).some(a => on(a.date))
    || (student.tafsirReviews ?? []).some(a => on(a.date))
    || (student.attendance ?? []).some(a => on(a.date));
};

/** Minimal shapes the finder needs — keeps it testable without the network. */
export interface CalEventLike {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}
export interface SessionLike { id: string; studentId?: string }

/**
 * Pure core: which finished lessons have nothing logged?
 * Exported so it can be exercised directly with fabricated calendars.
 */
export function findMissedLessons(
  events: CalEventLike[],
  sessionMap: Record<string, SessionLike[]>,
  students: Student[],
  dismissed: Set<string>,
  now: Date,
): Missed[] {
  const found: Missed[] = [];
  for (const ev of events) {
    const startStr = ev.start.dateTime ?? ev.start.date;
    if (!startStr) continue;
    const start = new Date(startStr);
    const endStr = ev.end?.dateTime ?? ev.end?.date;
    const end = endStr ? new Date(endStr) : new Date(start.getTime() + 60 * 60_000);
    if (end.getTime() > now.getTime()) continue;      // still running / upcoming
    for (const session of sessionMap[ev.id] ?? []) {
      const student = students.find(s => s.id === session.studentId);
      if (!student) continue;                          // Arabic session — not ours
      const key = `${session.id}:${start.toISOString()}`;
      if (dismissed.has(key)) continue;
      if (hasProgressOn(student, start)) continue;
      found.push({ key, student, title: ev.summary ?? 'Lesson', startAt: start, endAt: end });
    }
  }
  return found.sort((a, b) => b.startAt.getTime() - a.startAt.getTime());  // newest first
}

interface Props {
  teacherId?: string;
  students: Student[];
  onUpdateStudent: (s: Student) => void;
}

const MissedLessonPrompt: React.FC<Props> = ({ teacherId, students, onUpdateStudent }) => {
  const [queue, setQueue] = useState<Missed[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teacherId || students.length === 0) { setQueue([]); return; }
    const token = getStoredToken();
    if (!token) return;                       // calendar not connected — nothing to check
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const from = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
        const [events, sessionMap] = await Promise.all([
          fetchGCalEvents(token, from, now),
          getSessionsListByGcalId(teacherId),
        ]);
        if (cancelled) return;
        setQueue(findMissedLessons(
          events as unknown as CalEventLike[],
          sessionMap as unknown as Record<string, SessionLike[]>,
          students, readDismissed(), now,
        ));
      } catch (err) {
        console.error('[MissedLessonPrompt] check failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [teacherId, students]);

  // DEV-only: lets the browser harness seed the queue and exercise the UI.
  useEffect(() => {
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as unknown as Record<string, unknown>).__mlpSeed = setQueue;
    }
  }, []);

  const current = queue[0];

  const next = useCallback(() => setQueue(q => q.slice(1)), []);

  const record = (status: AttendanceStatus) => {
    if (!current) return;
    setBusy(true);
    const day = new Date(current.startAt);
    day.setHours(12, 0, 0, 0);                 // noon — same convention as logging
    const rec: AttendanceRecord = { id: `att-${Date.now()}`, date: day.toISOString(), status };
    const sameDay = day.toDateString();
    const kept = (current.student.attendance ?? []).filter(a => new Date(a.date).toDateString() !== sameDay);
    onUpdateStudent({ ...current.student, attendance: [...kept, rec] });
    rememberDismissed(current.key);            // answered → never ask again
    setBusy(false);
    next();
  };

  const ignore = () => {
    if (!current) return;
    rememberDismissed(current.key);
    next();
  };

  if (!current) return null;

  const when = current.startAt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const at = current.startAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    // A corner card, not a modal: the tutor can keep working while it waits.
    // Physically left in both directions — the tutor asked for that corner.
    <div className="fixed bottom-4 left-4 right-4 sm:right-auto z-[130] sm:w-80" dir="ltr">
      <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden">
        <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2.5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-100 dark:border-amber-900/50">
          <span className="text-lg leading-none mt-0.5">📋</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 leading-snug">
              Nothing logged for {current.student.name}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              {when} · {at} — {current.title}
            </p>
          </div>
          <button
            onClick={ignore}
            disabled={busy}
            title="Ignore"
            className="flex-shrink-0 -me-1 -mt-0.5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-2.5 flex items-center gap-2">
          <button
            onClick={() => record(AttendanceStatus.Absent)}
            disabled={busy}
            className="flex-1 py-2 rounded-xl text-xs font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            Absent
          </button>
          <button
            onClick={() => record(AttendanceStatus.Rescheduled)}
            disabled={busy}
            className="flex-1 py-2 rounded-xl text-xs font-black text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            Rescheduled
          </button>
        </div>

        {queue.length > 1 && (
          <p className="px-3 pb-2.5 -mt-0.5 text-[10px] font-bold text-slate-400">
            {queue.length - 1} more lesson{queue.length - 1 === 1 ? '' : 's'} to review
          </p>
        )}
      </div>
    </div>
  );
};

export default MissedLessonPrompt;
