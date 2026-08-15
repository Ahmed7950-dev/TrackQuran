import React, { useCallback, useEffect, useState } from 'react';
import LottieIcon from './LottieIcon';
import { getStudentUpcomingSessions } from '../services/lessonSessionService';
import { getConfirmedBookingsFor, istanbulDayOfWeek, istanbulDateString, BookingPortal } from '../services/lessonBookingService';
import { loadInstantMeeting, subscribeInstantMeeting } from '../services/instantMeetingService';

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
// It also covers "meet now" invitations the tutor starts outside any scheduled
// lesson (instantMeetingService) — those live for one hour and then vanish.
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

/** Entrance animation for the join card (injected once, like the fluency page). */
const useJoinCardStyles = () => {
  useEffect(() => {
    const id = 'ljp-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes ljp-fade { from { opacity: 0 } to { opacity: 1 } }
      @keyframes ljp-rise { from { opacity: 0; transform: translateY(14px) scale(.96) } to { opacity: 1; transform: none } }
      .ljp-fade { animation: ljp-fade .18s ease-out both; }
      .ljp-rise { animation: ljp-rise .34s cubic-bezier(.34,1.4,.64,1) both; }
    `;
    document.head.appendChild(el);
  }, []);
};

const LessonJoinPopup: React.FC<{
  /** arabic_lesson_sessions student id (Quran or Arabic profile id). */
  studentId?: string;
  /** lesson_bookings key: Arabic portal = share token, Quran portal = student id. */
  bookingKey?: string;
  bookingPortal?: BookingPortal;
}> = ({ studentId, bookingKey, bookingPortal }) => {
  const [active, setActive] = useState<ActiveLesson | null>(null);
  const [minimized, setMinimized] = useState(false);
  useJoinCardStyles();

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

    // A tutor-started "meet now" — outside any schedule, live for an hour.
    if (bookingKey && bookingPortal) {
      const inst = await loadInstantMeeting(bookingPortal, bookingKey);
      if (inst) {
        found.push({
          key: `i:${inst.createdAt}`,
          title: inst.title,
          meetUrl: inst.meetUrl,
          startAt: new Date(inst.createdAt),
          endAt: new Date(inst.expiresAt),
        });
      }
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
    const id = setInterval(() => { void check(); }, 30_000);
    return () => clearInterval(id);
  }, [check]);

  // Pushed delivery: the tutor's "meet now" wakes this portal immediately, so
  // the card appears without a refresh and without waiting for the poll.
  useEffect(() => {
    if (!bookingKey || !bookingPortal) return;
    return subscribeInstantMeeting(bookingPortal, bookingKey, () => { void check(); });
  }, [bookingKey, bookingPortal, check]);

  // Coming back to the tab re-checks at once (phones suspend timers).
  useEffect(() => {
    const wake = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
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
        className="fixed bottom-5 right-5 z-[400] flex items-center gap-2 pl-2 pr-4 py-2 rounded-full bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm shadow-xl shadow-emerald-900/40 ring-1 ring-white/20 transition-colors"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        <span className="w-8 h-8 flex items-center justify-center">
          <LottieIcon src="/video-conference.json" size={32} loop autoplay playOnHover={false} />
        </span>
        Join lesson
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center px-4 ljp-fade"
      style={{ background: 'rgba(4,17,12,0.62)', backdropFilter: 'blur(6px)' }}
    >
      <div className="ljp-rise w-full max-w-[380px] rounded-[28px] overflow-hidden bg-white dark:bg-gray-800 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.55)] ring-1 ring-black/5 dark:ring-white/10">

        {/* Header — animated icon on a soft field, no heavy colour block */}
        <div className="relative px-7 pt-8 pb-7 text-center bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-900/25 dark:to-gray-800">
          {/* live dot */}
          <span className="absolute top-5 left-5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/80 dark:bg-gray-900/60 ring-1 ring-emerald-200 dark:ring-emerald-800">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Live</span>
          </span>

          <div className="mx-auto w-[104px] h-[104px] flex items-center justify-center">
            <LottieIcon src="/video-conference.json" size={104} loop autoplay playOnHover={false} />
          </div>

          <h2 className="mt-3 text-[26px] leading-tight font-black text-slate-800 dark:text-white tracking-tight">
            Your lesson is on
          </h2>
          <p className="mt-1.5 text-[15px] font-bold text-emerald-700/90 dark:text-emerald-400" dir="rtl">
            درسك بدأ — انضم الآن
          </p>
        </div>

        {/* Details + actions */}
        <div className="px-7 pb-7">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 dark:bg-gray-700/40 px-4 py-3">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{active.title}</span>
            <span className="text-xs font-bold text-slate-400 dark:text-slate-400 tabular-nums whitespace-nowrap">{timeRange}</span>
          </div>

          <button
            onClick={join}
            className="group mt-4 w-full py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-[17px] shadow-lg shadow-emerald-900/25 ring-1 ring-white/15 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Join with Google Meet
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
          <button
            onClick={dismiss}
            className="mt-2 w-full py-2.5 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
};

export default LessonJoinPopup;
