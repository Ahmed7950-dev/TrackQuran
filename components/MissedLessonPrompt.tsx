// components/MissedLessonPrompt.tsx
// -----------------------------------------------------------------------------
// Tutor-only nudge: when a calendar lesson has FULLY finished and nothing was
// logged for that student that day, ask what happened. Mounted at the app
// shell so it appears on any page (including the students list).
//
// A lesson counts as "unlogged" when, on the lesson's own day, the student has
//   * no reading / hifz / tafsir achievement, AND
//   * no attendance record at all (present, absent or rescheduled).
// Answering writes that day's attendance; "Ignore" only silences the occurrence
// (kept in localStorage, so it never nags twice for the same lesson).
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
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-100 dark:border-amber-900/50">
          <p className="text-3xl">📋</p>
          <h3 className="mt-2 font-black text-lg text-slate-800 dark:text-slate-100 leading-snug">
            No progress was logged for {current.student.name}
          </h3>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {when} · {at} — {current.title}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-2">
          <button
            onClick={() => record(AttendanceStatus.Absent)}
            disabled={busy}
            className="w-full py-3 rounded-2xl font-black text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            Absent
          </button>
          <button
            onClick={() => record(AttendanceStatus.Rescheduled)}
            disabled={busy}
            className="w-full py-3 rounded-2xl font-black text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 transition-colors"
          >
            Agreed to reschedule
          </button>
          <button
            onClick={ignore}
            disabled={busy}
            className="w-full py-3 rounded-2xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            Ignore
          </button>
          {queue.length > 1 && (
            <p className="pt-1 text-center text-[11px] font-bold text-slate-400">
              {queue.length - 1} more lesson{queue.length - 1 === 1 ? '' : 's'} to review
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissedLessonPrompt;
