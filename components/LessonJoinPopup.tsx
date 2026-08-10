import React, { useCallback, useEffect, useState } from 'react';
import { getStudentUpcomingSessions } from '../services/lessonSessionService';
import { getConfirmedBookingsFor, istanbulDayOfWeek, istanbulDateString, BookingPortal } from '../services/lessonBookingService';

// ─────────────────────────────────────────────────────────────────────────────
// "Your lesson is on — join!" popup for the student portals.
//
// Shown while the clock is inside one of the student's scheduled lessons AND
// the tutor has generated a Google Meet link for it — a lesson without a link
// never pops. Covers both scheduling systems:
//   · calendar-linked sessions (arabic_lesson_sessions — Preply & platform
//     students the tutor linked from the calendar), and
//   · platform bookings (lesson_bookings, single or weekly, Istanbul times).
//
// It refetches every 90s rather than trusting the parent's one-shot load, so a
// Meet link the tutor generates AFTER the student opened the page still pops
// within a minute and a half. Dismissing collapses to a floating "Join" pill
// (per lesson, remembered for the browser session) — the student can still
// join late without the modal nagging.
// ─────────────────────────────────────────────────────────────────────────────

interface ActiveLesson {
  key: string;        // stable per occurrence — the dismissal is scoped to it
  title: string;
  meetUrl: string;
  startAt: Date;
  endAt: Date;
}

const DEFAULT_SESSION_MIN = 60;   // gcal sessions without an end time

const LessonJoinPopup: React.FC<{
  /** arabic_lesson_sessions student id (Quran or Arabic profile id). */
  studentId?: string;
  /** lesson_bookings key: Arabic portal = share token, Quran portal = student id. */
  bookingKey?: string;
  bookingPortal?: BookingPortal;
}> = ({ studentId, bookingKey, bookingPortal }) => {
  const [active, setActive] = useState<ActiveLesson | null>(null);
  const [minimized, setMinimized] = useState(false);

  const check = useCallback(async () => {
    const now = new Date();
    const found: ActiveLesson[] = [];

    if (studentId) {
      try {
        const sessions = await getStudentUpcomingSessions(studentId);
        for (const s of sessions) {
          if (!s.meetUrl) continue;
          const start = new Date(s.startAt);
          const end = s.endAt ? new Date(s.endAt) : new Date(start.getTime() + DEFAULT_SESSION_MIN * 60_000);
          if (now >= start && now <= end) {
            found.push({ key: `s:${s.id}:${s.startAt}`, title: s.title ?? 'Your lesson', meetUrl: s.meetUrl, startAt: start, endAt: end });
          }
        }
      } catch { /* offline — try again next tick */ }
    }

    if (bookingKey && bookingPortal) {
      try {
        const bookings = await getConfirmedBookingsFor(bookingKey, bookingPortal);
        for (const b of bookings) {
          if (!b.meetUrl) continue;
          const hh = String(b.hour).padStart(2, '0'), mm = String(b.minute).padStart(2, '0');
          // Booking times are fixed to Istanbul (+03). Check yesterday/today/
          // tomorrow in the Istanbul calendar so timezone edges can't miss a
          // window that is running right now.
          const starts: Date[] = [];
          if (b.bookingType === 'single' && b.specificDate) {
            starts.push(new Date(`${b.specificDate}T${hh}:${mm}:00+03:00`));
          } else if (b.bookingType === 'weekly') {
            for (const off of [-1, 0, 1]) {
              const cand = new Date(now.getTime() + off * 86_400_000);
              if (istanbulDayOfWeek(cand) !== b.dayOfWeek) continue;
              starts.push(new Date(`${istanbulDateString(cand)}T${hh}:${mm}:00+03:00`));
            }
          }
          for (const start of starts) {
            const end = new Date(start.getTime() + b.durationMinutes * 60_000);
            if (now >= start && now <= end) {
              found.push({ key: `b:${b.id}:${start.toISOString()}`, title: 'Your lesson', meetUrl: b.meetUrl, startAt: start, endAt: end });
            }
          }
        }
      } catch { /* offline — try again next tick */ }
    }

    const lesson = found.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;
    setActive(prev => (prev?.key === lesson?.key ? prev : lesson));
    if (lesson) {
      let dismissed = false;
      try { dismissed = sessionStorage.getItem(`ljp:${lesson.key}`) === '1'; } catch { /* private mode */ }
      setMinimized(dismissed);
    }
  }, [studentId, bookingKey, bookingPortal]);

  useEffect(() => {
    void check();
    const id = setInterval(() => { void check(); }, 90_000);
    return () => clearInterval(id);
  }, [check]);

  // DEV-only inspection hook for the browser test harness.
  useEffect(() => {
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as unknown as Record<string, unknown>).__ljpForce = (l: ActiveLesson | null) => { setActive(l); setMinimized(false); };
    }
  }, []);

  if (!active) return null;

  const timeRange = `${active.startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${active.endAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const join = () => window.open(active.meetUrl, '_blank', 'noopener');
  const dismiss = () => {
    setMinimized(true);
    try { sessionStorage.setItem(`ljp:${active.key}`, '1'); } catch { /* private mode */ }
  };

  if (minimized) {
    return (
      <button
        onClick={join}
        className="fixed bottom-5 right-5 z-[400] flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-900/30 animate-pulse hover:animate-none transition-colors"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <span className="text-base">🎥</span> Join lesson
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center px-4" style={{ background: 'rgba(2,20,12,0.55)', backdropFilter: 'blur(3px)' }}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden text-center">
        <div className="pt-8 pb-5 px-6 bg-gradient-to-b from-emerald-500 to-emerald-600 text-white">
          <div className="text-5xl mb-2">🎥</div>
          <p className="text-2xl font-black leading-tight">Your lesson is on!</p>
          <p className="text-sm font-semibold opacity-90 mt-1" dir="rtl">درسك بدأ — انضم الآن</p>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold">
            {active.title} · {timeRange}
          </p>
          <button
            onClick={join}
            className="mt-4 w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98]"
          >
            Join with Google Meet →
          </button>
          <button
            onClick={dismiss}
            className="mt-3 w-full py-2 text-sm font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonJoinPopup;
