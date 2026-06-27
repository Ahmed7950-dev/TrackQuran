import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  GCalEvent,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGCalEvents,
  getStoredToken,
  silentRefresh,
  reconnectGoogleCalendar,
  wasConnected,
} from '../services/googleCalendarService';
import { AvailabilitySlot } from '../services/availabilityService';
import { getTutorBusy, syncTutorBusy, BusySlot } from '../services/tutorBusyService';
import { safeCopy } from '../utils';
import {
  LessonBooking,
  getTeacherBookings,
  getStudentBookings,
  updateBookingStatus,
  cancelBooking,
  isHourTaken,
  studentAlreadyBooked,
  istanbulDateString,
  isSlotInPast,
} from '../services/lessonBookingService';
import { ArabicStudent, LessonSession, Student } from '../types';
import { linkAllEventsByTitle, getSessionsListByGcalId, unlinkSessionsByStudentAndTitle, linkGCalSession, setSessionFamily } from '../services/lessonSessionService';
import { ensurePortalPair } from '../services/portalPairService';
import { ensureFamilyLink, FamilyStudentRef } from '../services/familyLinkService';
import { netEarning } from '../utils/timezones';
import BookingModal from './BookingModal';
import { supabase } from '../lib/supabase';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const HOUR_HEIGHT_PX  = 64;
const HOURS           = Array.from({ length: 25 }, (_, i) => i); // 0 … 24
const DAYS            = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TUTOR_TIMEZONE  = 'Europe/Istanbul'; // always UTC+3 (Turkey abolished DST 2016)

/** Google Calendar colorId → Tailwind background class */

/* ------------------------------------------------------------------ */
/*  Timezone helpers                                                    */
/* ------------------------------------------------------------------ */

/** "America/New_York" → "New York",  "Asia/Riyadh" → "Riyadh" */
function shortTZName(tz: string): string {
  const city = tz.split('/').pop() ?? tz;
  return city.replace(/_/g, ' ');
}

/**
 * Convert an Istanbul hour (0-23) to the student's local time string.
 * Istanbul is always UTC+3.
 */
function istanbulHourToStudentTime(hour: number, studentTZ: string): string {
  const now = new Date();
  // Build a UTC date at (hour - 3) so it's `hour:00` in Istanbul (UTC+3)
  const utcHour = ((hour - 3) % 24 + 24) % 24;
  const utcDate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    utcHour, 0, 0,
  ));
  return utcDate.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: studentTZ,
  });
}

/** Return pixel offset for an event dateTime, measured in Istanbul time. */
function timeToOffsetInTZ(dateTime: string, timezone: string): number {
  const d = new Date(dateTime);
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', hour12: false, timeZone: timezone,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === 'hour')?.value   ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return (h + m / 60) * HOUR_HEIGHT_PX;
}

/** Return event height in pixels given start/end in Istanbul time. */
function eventHeightInTZ(start: string, end: string): number {
  const startD = new Date(start);
  const endD   = new Date(end);
  const mins   = (endD.getTime() - startD.getTime()) / 60000;
  return Math.max((mins / 60) * HOUR_HEIGHT_PX, 20);
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                        */
/* ------------------------------------------------------------------ */

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatMonthYear(monday: Date): string {
  const sunday = addDays(monday, 6);
  if (monday.getMonth() === sunday.getMonth()) {
    return monday.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return `${monday.toLocaleDateString(undefined, { month: 'short' })} – ${sunday.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
}

/* ------------------------------------------------------------------ */
/*  Booking helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Decide which bookings should appear in a given day column.
 * - Single bookings: shown on their specificDate.
 * - Weekly bookings: shown on every matching dayOfWeek on/after
 *   the confirmed/requested date.
 */
function bookingsForDay(bookings: LessonBooking[], day: Date, dayIdx: number): LessonBooking[] {
  const dateStr = istanbulDateString(day);
  return bookings.filter(b => {
    if (b.status === 'cancelled') return false;
    if (b.bookingType === 'single') {
      return b.specificDate === dateStr;
    }
    // weekly
    if (b.dayOfWeek !== dayIdx) return false;
    const startFrom = (b.status === 'confirmed' && b.confirmedAt)
      ? b.confirmedAt
      : b.requestedAt;
    const startDateStr = istanbulDateString(new Date(startFrom));
    return dateStr >= startDateStr;
  });
}

/* ------------------------------------------------------------------ */
/*  Booking block colours                                               */
/* ------------------------------------------------------------------ */

function bookingBlockStyle(
  b:           LessonBooking,
  isMyBooking: boolean,
  isDeclined:  boolean,
): { bg: string; border: string; text: string; label: string } {
  if (isDeclined) {
    return { bg: 'bg-red-100 dark:bg-red-900/40', border: 'border-red-300 dark:border-red-700', text: 'text-red-700 dark:text-red-300', label: '✗ Declined' };
  }
  if (!isMyBooking) {
    // Another student's confirmed slot — grey
    return { bg: 'bg-slate-200 dark:bg-slate-700', border: 'border-slate-300 dark:border-slate-600', text: 'text-slate-600 dark:text-slate-300', label: 'Booked' };
  }
  switch (b.status) {
    case 'pending':
      return { bg: 'bg-amber-100 dark:bg-amber-900/40', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-200', label: '⏳ Waiting approval' };
    case 'confirmed':
      if (b.bookingType === 'weekly') {
        return { bg: 'bg-purple-100 dark:bg-purple-900/40', border: 'border-purple-300 dark:border-purple-700', text: 'text-purple-800 dark:text-purple-200', label: '🔁 Weekly lesson' };
      }
      return { bg: 'bg-blue-100 dark:bg-blue-900/40', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-800 dark:text-blue-200', label: '✓ Lesson' };
    default:
      return { bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700', text: 'text-slate-500', label: '' };
  }
}

/** Tutor-side booking block colours */
function tutorBlockStyle(b: LessonBooking): { bg: string; text: string } {
  switch (b.status) {
    case 'pending':
      return { bg: 'bg-amber-400 dark:bg-amber-500', text: 'text-amber-900 dark:text-amber-950' };
    case 'confirmed':
      return b.bookingType === 'weekly'
        ? { bg: 'bg-purple-500 dark:bg-purple-600', text: 'text-white' }
        : { bg: 'bg-blue-500 dark:bg-blue-600',     text: 'text-white' };
    default:
      return { bg: 'bg-slate-400', text: 'text-white' };
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface CalendarPageProps {
  gcalToken:          string | null;
  onTokenChange:      (token: string | null) => void;
  /** When true: hides connect button, shows booking UI for the student */
  isStudentView?:     boolean;
  /** IANA timezone string from the student's profile, e.g. "America/New_York" */
  studentTimezone?:   string;
  /** Tutor's working hours — shown as light teal background in each day column */
  availabilitySlots?: AvailabilitySlot[];
  // ── Booking props (all optional — CalendarPage works without them) ──
  /** Teacher's Supabase user id */
  teacherId?:         string;
  /** Opaque student identifier (share token / report id) */
  studentId?:         string;
  /** Student's display name */
  studentName?:       string;
  /** Student's WhatsApp number — Arabic portal only */
  studentWhatsApp?:   string;
  /** Which portal the student is using */
  portalType?:        'arabic' | 'quran';
  /** Called whenever the count of pending bookings changes (for nav badge) */
  onPendingCountChange?: (n: number) => void;
  /** Arabic students list — enables GCal event → student linking */
  arabicStudents?: ArabicStudent[];
  /** Quran students — enables GCal linking with billing (rate/timezone/type) */
  quranStudents?: Student[];
  /** Called when a GCal event is successfully linked to a student */
  onSessionLinked?: () => void;
  /** Student's own linked lessons — rendered read-only on the grid (student view). */
  studentLessons?: LessonSession[];
}

/** Chain-link icon for linked events (inherits text colour via currentColor). */
const ChainLinkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
    <path d="m26.60645 5.39355a7.50909 7.50909 0 0 0 -10.60645 0l-.70721.707a1 1 0 0 0 -.00013 1.41431l1.41394 1.41391a1 1 0 0 0 1.41407.00012l.70745-.70721a3.50032 3.50032 0 0 1 4.9502 4.9502l-3.53613 3.53512a3.52193 3.52193 0 0 1 -4.7124.2168l-.7674-.64093a.99994.99994 0 0 0 -1.40875.12671l-1.28164 1.53555a1.00009 1.00009 0 0 0 .12695 1.40857l.7674.64044a7.458 7.458 0 0 0 10.10449-.459l3.53609-3.53514a7.50023 7.50023 0 0 0 -.00048-10.60645z" />
    <path d="m15.2934 23.07123a1 1 0 0 0 -1.41407-.00012l-.70745.70721a3.50032 3.50032 0 0 1 -4.9502-4.9502l3.53613-3.53512a3.51972 3.51972 0 0 1 4.7124-.2168l.7674.64093a.99994.99994 0 0 0 1.40875-.12671l1.28164-1.53555a1.00009 1.00009 0 0 0 -.127-1.40857l-.7674-.64044a7.4576 7.4576 0 0 0 -10.10449.459l-3.53604 3.53514a7.50006 7.50006 0 0 0 10.60693 10.60645l.70721-.707a1 1 0 0 0 .00013-1.41431z" />
  </svg>
);

/** Unified shape used for GCal event linking + earnings, from either list. */
interface LinkStudent {
  id: string;
  name: string;
  kind: 'quran' | 'arabic';
  timezone?: string;
  hourlyRate?: number;
  studentType?: 'preply' | 'platform';
  preplyPercentage?: number;
}

const CalendarPage: React.FC<CalendarPageProps> = ({
  gcalToken,
  onTokenChange,
  isStudentView = false,
  studentTimezone,
  availabilitySlots = [],
  teacherId,
  studentId,
  studentName,
  studentWhatsApp,
  portalType,
  onPendingCountChange,
  arabicStudents = [],
  quranStudents = [],
  onSessionLinked,
  studentLessons = [],
}) => {
  // Unified linkable-student list — BOTH Quran and Arabic students, so the two
  // calendars act as one unit (same linked events + combined weekly earnings).
  const linkStudents: LinkStudent[] = useMemo(() => [
    ...quranStudents.map(s => ({ id: s.id, name: s.name, kind: 'quran' as const, timezone: s.timezone, hourlyRate: s.hourlyRate, studentType: s.studentType, preplyPercentage: s.preplyPercentage })),
    ...arabicStudents.map(s => ({ id: s.id, name: s.name, kind: 'arabic' as const, timezone: s.timezone, hourlyRate: s.hourlyRate, studentType: s.studentType, preplyPercentage: s.preplyPercentage })),
  ], [quranStudents, arabicStudents]);
  const linkStudentById = useMemo(() => {
    const m = new Map<string, LinkStudent>();
    linkStudents.forEach(s => m.set(s.id, s));
    return m;
  }, [linkStudents]);
  // Tutor with a connected calendar + students can link by clicking an event
  // directly (no separate "link mode" toggle).
  const canLink = !isStudentView && !!gcalToken && linkStudents.length > 0;
  const [monday,      setMonday]      = useState<Date>(() => getMonday(new Date()));
  const [events,      setEvents]      = useState<GCalEvent[]>([]);
  const [tutorBusy,   setTutorBusy]   = useState<BusySlot[]>([]); // student view: tutor's Google busy times (from DB)
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [connecting,  setConnecting]  = useState(false);
  const [exporting,   setExporting]   = useState(false);
  // ── GCal event linking (tutor only) ──────────────────────────────────────
  const [linkTarget,        setLinkTarget]        = useState<{ id: string; summary: string } | null>(null);
  const [linkSearch,        setLinkSearch]        = useState('');
  const [linkGroup,         setLinkGroup]         = useState<'quran' | 'arabic'>('quran');
  const [linking,           setLinking]           = useState(false);
  // One event can be linked to MORE THAN ONE student (a student's Quran + Arabic
  // profiles), so sessions are grouped per gcal_event_id.
  const [linkedSessions,    setLinkedSessions]    = useState<Record<string, LessonSession[]>>({});
  const [linkedStudentNames, setLinkedStudentNames] = useState<Record<string, string>>({}); // gcalEventId → student name
  /** Set when user clicks a linked event — shows the manage-links modal (add / remove profiles) */
  const [manageTarget, setManageTarget] = useState<{ gcalId: string; summary: string } | null>(null);
  /** Pending link to a DIFFERENT-named student → prompts to group them as a family */
  const [familyPrompt, setFamilyPrompt] = useState<{ studentId: string; existingNames: string[] } | null>(null);
  const [familyName, setFamilyName] = useState('');
  /** Generated unified link to show the tutor (portal pair or family link) */
  const [generatedLink, setGeneratedLink] = useState<{ url: string; family: boolean } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  /** Set when silent refresh has failed — shows the reconnect banner */
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const currentTimeRef  = useRef<HTMLDivElement>(null);
  const calendarGridRef = useRef<HTMLDivElement>(null);
  // Per-week cache of fetched GCal events so revisiting a week is instant
  // (stale-while-revalidate: show cached immediately, refresh in the background).
  const eventsCacheRef  = useRef<Map<string, GCalEvent[]>>(new Map());
  const latestWeekRef   = useRef<string>(''); // guards late fetches from overwriting a newer week

  // ── Booking state ────────────────────────────────────────────────────────
  /** All bookings for this teacher (loaded once + kept live via Realtime) */
  const [myBookings,    setMyBookings]    = useState<LessonBooking[]>([]);
  const [otherBookings, setOtherBookings] = useState<LessonBooking[]>([]);
  /** IDs of just-declined bookings (student view) — shown briefly in red */
  const [declinedIds,   setDeclinedIds]   = useState<Set<string>>(new Set());
  /** Slot the student clicked — triggers BookingModal */
  const [bookingSlot,   setBookingSlot]   = useState<{ day: Date; dayIdx: number; hour: number; minute: 0 | 30 } | null>(null);
  /** Booking ID being actioned by the tutor (confirm / decline) */
  const [actioningId,   setActioningId]   = useState<string | null>(null);
  /** Booking ID awaiting inline cancel confirmation */
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  /** Booking whose detail panel is open */
  const [selectedBooking, setSelectedBooking] = useState<LessonBooking | null>(null);

  // Use profile timezone if provided, otherwise fall back to browser timezone
  const studentTZ  = studentTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showDualTZ = isStudentView;

  // Build a quick-lookup Set: "dayOfWeek-hour" (Mon=0 … Sun=6, same as DAYS index)
  const availSet = new Set(availabilitySlots.map(s => `${s.dayOfWeek}-${s.hour}`));

  // Booking is enabled when we have both teacherId and (student context OR tutor)
  const bookingEnabled = !!teacherId;

  /* ---------------------------------------------------------------- */
  /*  Fetch GCal events                                                 */
  /* ---------------------------------------------------------------- */

  const loadEvents = useCallback(async (token: string, weekMonday: Date) => {
    const cacheKey = weekMonday.toISOString().slice(0, 10);
    latestWeekRef.current = cacheKey;
    const cached = eventsCacheRef.current.get(cacheKey);
    if (cached) {
      // Show the cached week instantly, then refresh in the background (no spinner).
      setEvents(cached);
      setNeedsReconnect(false);
      fetchGCalEvents(token, weekMonday, addDays(weekMonday, 7))
        .then(data => { eventsCacheRef.current.set(cacheKey, data); if (latestWeekRef.current === cacheKey) setEvents(data); })
        .catch(() => { /* keep showing cached data */ });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGCalEvents(token, weekMonday, addDays(weekMonday, 7));
      eventsCacheRef.current.set(cacheKey, data);
      if (latestWeekRef.current === cacheKey) { setEvents(data); }
      setNeedsReconnect(false); // success — hide banner if it was up
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load events.';
      if (msg.includes('reconnect')) {
        // Token expired mid-session — try silent re-auth, then show banner if it fails
        silentRefresh(
          newToken => {
            onTokenChange(newToken);
            setNeedsReconnect(false);
            fetchGCalEvents(newToken, weekMonday, addDays(weekMonday, 7))
              .then(data => { setEvents(data); setLoading(false); })
              .catch(() => { setLoading(false); });
          },
          () => {
            // Silent refresh failed (third-party cookies blocked, etc.)
            // Keep token state but show the reconnect banner
            setNeedsReconnect(true);
            setLoading(false);
          },
        );
        return; // loading state managed by the callbacks above
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [onTokenChange]);

  /** One-click reconnect handler for the banner */
  const handleReconnect = useCallback(() => {
    setConnecting(true);
    reconnectGoogleCalendar(
      token => {
        onTokenChange(token);
        setNeedsReconnect(false);
        setConnecting(false);
      },
      err => {
        setError(err);
        setConnecting(false);
      },
    );
  }, [onTokenChange]);

  /** Detect "user was connected but no current token" — show banner */
  useEffect(() => {
    if (!gcalToken && wasConnected() && !isStudentView) {
      setNeedsReconnect(true);
    }
  }, [gcalToken, isStudentView]);

  useEffect(() => {
    if (gcalToken) loadEvents(gcalToken, monday);
    else           setEvents([]);
  }, [gcalToken, monday, loadEvents]);

  // Tutor side: mirror a 4-week window of Google busy times into the DB so
  // students can see them as "Booked" on any device (the Google token never
  // leaves this browser). Covers the typical booking horizon, refreshing as the
  // tutor opens / navigates the calendar.
  useEffect(() => {
    if (isStudentView || !teacherId || !gcalToken) return;
    let cancelled = false;
    const start = monday, end = addDays(monday, 28);
    (async () => {
      try {
        const evs = await fetchGCalEvents(gcalToken, start, end);
        if (cancelled) return;
        const slots: BusySlot[] = evs
          .filter(e => e.start.dateTime && e.end.dateTime)
          .map(e => ({ startAt: e.start.dateTime!, endAt: e.end.dateTime! }));
        await syncTutorBusy(teacherId, start.toISOString(), end.toISOString(), slots);
      } catch { /* offline / token expired — ignore */ }
    })();
    return () => { cancelled = true; };
  }, [teacherId, isStudentView, gcalToken, monday]);

  // Student side: read the tutor's mirrored busy times for the shown week.
  useEffect(() => {
    if (!isStudentView || !teacherId) { setTutorBusy([]); return; }
    getTutorBusy(teacherId, monday.toISOString(), addDays(monday, 7).toISOString()).then(setTutorBusy);
  }, [isStudentView, teacherId, monday]);

  /* ---------------------------------------------------------------- */
  /*  Fetch lesson bookings + Realtime subscription                     */
  /* ---------------------------------------------------------------- */

  const notifyPendingCount = useCallback((bookings: LessonBooking[]) => {
    if (!onPendingCountChange) return;
    const n = bookings.filter(b => b.status === 'pending').length;
    onPendingCountChange(n);
  }, [onPendingCountChange]);

  const loadBookings = useCallback(async () => {
    if (!teacherId) return;
    try {
      if (isStudentView && studentId) {
        const { mine, others } = await getStudentBookings(teacherId, studentId);
        setMyBookings(mine);
        setOtherBookings(others);
        // Mark newly declined as transient
        mine.filter(b => b.status === 'declined').forEach(b => {
          setDeclinedIds(prev => {
            if (prev.has(b.id)) return prev;
            const next = new Set(prev);
            next.add(b.id);
            setTimeout(() => setDeclinedIds(p => { const s = new Set(p); s.delete(b.id); return s; }), 3000);
            return next;
          });
        });
      } else if (!isStudentView) {
        const all = await getTeacherBookings(teacherId);
        setMyBookings(all);
        notifyPendingCount(all);
      }
    } catch (e) {
      console.error('Failed to load bookings:', e);
    }
  }, [teacherId, isStudentView, studentId, notifyPendingCount]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // Realtime subscription
  useEffect(() => {
    if (!teacherId) return;
    const channel = supabase
      .channel(`lesson_bookings_${teacherId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lesson_bookings', filter: `teacher_id=eq.${teacherId}` },
        (payload) => {
          // Re-fetch on any change; simple and reliable
          loadBookings();
          // If student's booking was just declined, flash it
          if (isStudentView && studentId && payload.eventType === 'UPDATE') {
            const row = payload.new as { id?: string; status?: string; student_id?: string };
            if (row.status === 'declined' && row.student_id === studentId && row.id) {
              const id = row.id;
              setDeclinedIds(prev => {
                const next = new Set(prev);
                next.add(id);
                return next;
              });
              setTimeout(() => {
                setDeclinedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
              }, 3000);
            }
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teacherId, isStudentView, studentId, loadBookings]);

  // Load already-linked sessions so linked events render coloured.
  useEffect(() => {
    if (!canLink || !teacherId) return;
    getSessionsListByGcalId(teacherId).then(map => {
      setLinkedSessions(map);
    }).catch(console.error);
  }, [canLink, teacherId]);

  // Build a studentName lookup from linkedSessions (one display name per event;
  // dual-linked profiles share the same name, so the first resolvable wins).
  useEffect(() => {
    if (!linkStudents.length) return;
    const names: Record<string, string> = {};
    for (const [gcalId, sessionList] of Object.entries(linkedSessions) as Array<[string, LessonSession[]]>) {
      for (const session of sessionList) {
        const student = linkStudentById.get(session.studentId);
        if (student) { names[gcalId] = student.name; break; }
      }
    }
    setLinkedStudentNames(names);
  }, [linkedSessions, linkStudents, linkStudentById]);

  /* ---------------------------------------------------------------- */
  /*  Current-time indicator                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const update = () => {
      if (!currentTimeRef.current) return;
      const now    = new Date();
      // Position indicator using Istanbul time (tutor's grid)
      const offset = timeToOffsetInTZ(now.toISOString(), TUTOR_TIMEZONE);
      currentTimeRef.current.style.top = `${offset}px`;
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Connect / disconnect (tutor-only)                                 */
  /* ---------------------------------------------------------------- */

  const handleConnect = () => {
    setConnecting(true);
    connectGoogleCalendar(
      token => { onTokenChange(token); setConnecting(false); },
      err   => { setError(err); setConnecting(false); },
    );
  };

  const handleDisconnect = () => {
    disconnectGoogleCalendar();
    onTokenChange(null);
    setEvents([]);
  };

  /* ---------------------------------------------------------------- */
  /*  PDF export                                                        */
  /* ---------------------------------------------------------------- */

  const handleExportPDF = async () => {
    if (!calendarGridRef.current) return;
    setExporting(true);
    try {
      const sunday    = addDays(monday, 6);
      const filename  = `Tutor_Availability_${monday.toLocaleDateString('en-CA')}_to_${sunday.toLocaleDateString('en-CA')}.pdf`;
      const html2pdf  = (window as any).html2pdf;
      await html2pdf()
        .set({
          margin:      [8, 8, 8, 8],
          filename,
          image:       { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
          jsPDF:       { unit: 'mm', format: 'a3', orientation: 'landscape' },
        })
        .from(calendarGridRef.current)
        .save();
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Tutor actions — confirm / decline                                 */
  /* ---------------------------------------------------------------- */

  const handleTutorAction = async (bookingId: string, status: 'confirmed' | 'declined') => {
    setActioningId(bookingId);
    try {
      const booking = myBookings.find(b => b.id === bookingId);
      await updateBookingStatus(bookingId, status, booking);
      await loadBookings();
    } catch (e) {
      console.error('Failed to update booking status:', e);
    } finally {
      setActioningId(null);
    }
  };

  const handleTutorCancel = async (b: LessonBooking) => {
    try {
      await cancelBooking(b, 'tutor');
      await loadBookings();
    } catch (e) {
      console.error('Failed to cancel booking:', e);
    } finally {
      setCancelConfirmId(null);
      setSelectedBooking(null);
    }
  };

  const handleStudentCancel = async (b: LessonBooking) => {
    try {
      await cancelBooking(b, 'student');
      setMyBookings(prev => prev.filter(x => x.id !== b.id));
    } catch (e) {
      console.error('Failed to cancel booking:', e);
    } finally {
      setCancelConfirmId(null);
      setSelectedBooking(null);
    }
  };

  /**
   * Picker click. Linking the SAME person (same name — e.g. their Quran +
   * Arabic profile) links directly. Linking a DIFFERENT-named student to an
   * event that already has someone prompts to group them as a FAMILY.
   */
  function requestLink(studentId: string) {
    if (!linkTarget) return;
    const newName = linkStudentById.get(studentId)?.name ?? '';
    const others = (linkedSessions[linkTarget.id] ?? []).filter(s => s.studentId !== studentId);
    const differentNamed = others
      .map(s => linkStudentById.get(s.studentId))
      .filter(b => b && newName && b.name.trim().toLowerCase() !== newName.trim().toLowerCase()) as LinkStudent[];
    if (differentNamed.length > 0) {
      // Prefill with an existing family name on the event if one is set.
      const existingFamily = others.find(s => s.familyName)?.familyName ?? '';
      setFamilyName(existingFamily);
      setFamilyPrompt({ studentId, existingNames: differentNamed.map(b => b.name) });
      return;
    }
    handleLinkToStudent(studentId);
  }

  /** Link a single event-title to a student (and, for a same-person Q+A, pair). */
  async function linkStudentToTarget(studentId: string): Promise<Record<string, LessonSession[]> | null> {
    if (!linkTarget || !gcalToken || !teacherId) return null;
    const clicked = events.find(e => e.id === linkTarget.id);
    if (clicked) {
      await linkGCalSession(
        teacherId, studentId, clicked.id, clicked.summary,
        clicked.start.dateTime ?? clicked.start.date ?? '',
        clicked.end.dateTime ?? clicked.end.date ?? undefined,
      );
    }
    const count = await linkAllEventsByTitle(teacherId, studentId, linkTarget.summary, gcalToken);
    if (!clicked && count === 0) {
      setError(`No calendar events titled "${linkTarget.summary}" were found to link.`);
    }
    const map = await getSessionsListByGcalId(teacherId);
    setLinkedSessions(map);
    return map;
  }

  async function handleLinkToStudent(studentId: string) {
    if (!linkTarget || !gcalToken || !teacherId) return;
    setLinking(true);
    try {
      const map = await linkStudentToTarget(studentId);
      if (!map) return;

      // If this event now has the SAME person's Quran AND Arabic profile,
      // ensure the permanent unified portal link and surface it to the tutor.
      const profiles = (map[linkTarget.id] ?? [])
        .map(s => linkStudentById.get(s.studentId)).filter(Boolean) as LinkStudent[];
      const q = profiles.find(p => p.kind === 'quran');
      const a = profiles.find(p => p.kind === 'arabic');
      if (q && a && q.name.trim().toLowerCase() === a.name.trim().toLowerCase()) {
        const pair = await ensurePortalPair(teacherId, q.id, a.id, q.name);
        if (pair) setGeneratedLink({ url: `${window.location.origin}/portal/${pair.token}`, family: false });
      }

      onSessionLinked?.();
      setLinkTarget(null);
      setLinkSearch('');
    } catch (err) {
      console.error('[Link] failed:', err);
    } finally {
      setLinking(false);
    }
  }

  /** Link the student AND group everyone on the event as a named family. */
  async function handleLinkAsFamily(studentId: string, name: string) {
    if (!linkTarget || !teacherId) return;
    setLinking(true);
    try {
      const map = await linkStudentToTarget(studentId);
      if (!map) return;

      // Everyone now linked to this event → family members.
      const sessionsForEvent = map[linkTarget.id] ?? [];
      const refs: FamilyStudentRef[] = sessionsForEvent
        .map(s => linkStudentById.get(s.studentId))
        .filter(Boolean)
        .map(b => ({ kind: (b as LinkStudent).kind, studentId: (b as LinkStudent).id, name: (b as LinkStudent).name }));
      const existingFamilyId = sessionsForEvent.find(s => s.familyLinkId)?.familyLinkId;
      const familyId = await ensureFamilyLink(teacherId, name.trim() || 'Family', refs, existingFamilyId);
      if (familyId) {
        await setSessionFamily(teacherId, linkTarget.summary, name.trim() || 'Family', familyId);
        setLinkedSessions(await getSessionsListByGcalId(teacherId));
        setGeneratedLink({ url: `${window.location.origin}/family/${familyId}`, family: true });
      }

      onSessionLinked?.();
      setLinkTarget(null);
      setLinkSearch('');
    } catch (err) {
      console.error('[Link family] failed:', err);
    } finally {
      setLinking(false);
    }
  }

  /** Remove one student's link (all events with this title) from the manage modal. */
  async function handleUnlinkStudent(studentId: string, title: string) {
    if (!teacherId) return;
    setLinking(true);
    try {
      await unlinkSessionsByStudentAndTitle(teacherId, studentId, title);
      const map = await getSessionsListByGcalId(teacherId);
      setLinkedSessions(map);
      onSessionLinked?.();
      // Close the manage modal if nothing is linked to this event anymore.
      if (manageTarget && !(map[manageTarget.gcalId]?.length)) setManageTarget(null);
    } catch (err) {
      console.error('[Unlink] failed:', err);
    } finally {
      setLinking(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Student slot click                                                */
  /* ---------------------------------------------------------------- */

  const handleSlotClick = (dayIdx: number, day: Date, hour: number, minute: 0 | 30) => {
    if (!isStudentView || !studentId || !teacherId || !studentName) return;
    if (isSlotInPast(day, hour)) return;
    const dateStr = istanbulDateString(day);
    // Don't allow clicking a slot already taken by another confirmed booking
    if (isHourTaken([...myBookings, ...otherBookings], dayIdx, hour, minute, dateStr, studentId)) return;
    // Don't allow duplicate booking for the student themselves
    if (studentAlreadyBooked(myBookings.filter(b => b.status !== 'declined'), dayIdx, hour, minute, dateStr)) return;
    setBookingSlot({ day, dayIdx, hour, minute });
  };

  /* ---------------------------------------------------------------- */
  /*  Navigation                                                        */
  /* ---------------------------------------------------------------- */

  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today            = new Date();

  // Tutor's net earnings for the selected week: linked GCal events + Platform
  // students' scheduled bookings. A lesson is billed in 50-minute units, so a
  // 25-min event = half the net rate (e.g. 15/h, 18% Preply → 12.30 net; a
  // 25-min lesson → 6.15). Platform bookings are matched to a student by name.
  const weekEarnings = useMemo(() => {
    if (isStudentView) return null;
    let total = 0;
    const linkedNames = new Set<string>();
    // Linked GCal events in this week (the `events` state holds this week's events).
    // A dual-linked event (same student's Quran + Arabic profile) is ONE lesson
    // slot, so it is counted ONCE using the linked profile's rate.
    for (const ev of events) {
      const sessionList = linkedSessions[ev.id];
      if (!sessionList || !sessionList.length) continue;
      const billings = sessionList.map(s => linkStudentById.get(s.studentId)).filter(Boolean) as LinkStudent[];
      billings.forEach(b => linkedNames.add(b.name));
      const b = billings.find(x => x.hourlyRate != null);
      if (!b?.hourlyRate) continue;
      const startMs = new Date(ev.start.dateTime ?? ev.start.date ?? '').getTime();
      const endMs   = new Date(ev.end.dateTime   ?? ev.end.date   ?? '').getTime();
      const minutes = endMs > startMs ? (endMs - startMs) / 60_000 : 50;
      total += netEarning(b.hourlyRate, b.studentType, b.preplyPercentage) * (minutes / 50);
    }
    // Platform students' confirmed bookings this week — skip any whose lessons are
    // already counted via a linked GCal event (avoid double-counting).
    for (let i = 0; i < 7; i++) {
      const day = addDays(monday, i);
      for (const bk of bookingsForDay(myBookings, day, i)) {
        if (bk.status !== 'confirmed' || linkedNames.has(bk.studentName)) continue;
        const stu = linkStudents.find(s => s.studentType === 'platform' && s.name === bk.studentName && s.hourlyRate);
        if (!stu?.hourlyRate) continue;
        total += netEarning(stu.hourlyRate, 'platform', undefined) * (bk.durationMinutes / 50);
      }
    }
    return total;
  }, [isStudentView, events, linkedSessions, linkStudentById, linkStudents, myBookings, monday]);

  const eventsForDay = (day: Date): GCalEvent[] =>
    events.filter(ev => {
      const start = ev.start.dateTime ?? ev.start.date ?? '';
      if (!start) return false;
      return isSameDay(new Date(start), day);
    });

  const lessonsForDay = (day: Date): LessonSession[] =>
    studentLessons.filter(l => l.startAt && isSameDay(new Date(l.startAt), day));

  const busyForDay = (day: Date): BusySlot[] =>
    tutorBusy.filter(b => b.startAt && isSameDay(new Date(b.startAt), day));

  /* ---------------------------------------------------------------- */
  /*  Render                                                            */
  /* ---------------------------------------------------------------- */

  // All bookings to consider for student view = mine + others
  const allBookingsForStudent = [...myBookings, ...otherBookings];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonday(m => addDays(m, -7))}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Previous week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-base font-semibold text-slate-700 dark:text-slate-200 min-w-[180px] text-center">
            {formatMonthYear(monday)}
          </span>
          <button
            onClick={() => setMonday(m => addDays(m, 7))}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Next week"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={() => setMonday(getMonday(new Date()))}
            className="ml-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
          >
            Today
          </button>
          {/* Weekly earnings (tutor) — linked Preply events + Platform bookings */}
          {weekEarnings !== null && weekEarnings > 0 && (
            <span className="ml-1 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-sm font-extrabold whitespace-nowrap" title="Your net earnings this week (linked events + platform bookings)">
              💰 {weekEarnings.toFixed(2)} / wk
            </span>
          )}
        </div>

        {/* Timezone legend (student view) */}
        {isStudentView && (
          <div className="flex items-center gap-3 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              {shortTZName(studentTZ)}
            </span>
            <span className="flex items-center gap-1.5 text-teal-600 dark:text-teal-400">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" />
              {shortTZName(TUTOR_TIMEZONE)}
            </span>
          </div>
        )}

        {/* Legend row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Working hours legend */}
          {availabilitySlots.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-300">
              <span className="w-4 h-4 rounded bg-teal-100 dark:bg-teal-900/40 border border-teal-300 dark:border-teal-700 inline-block flex-shrink-0" />
              {isStudentView && bookingEnabled ? 'Click a slot to book' : 'Tutor\'s working hours'}
            </div>
          )}
          {/* Student booking legend */}
          {isStudentView && bookingEnabled && (
            <>
              <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <span className="w-3 h-3 rounded bg-amber-200 dark:bg-amber-800 border border-amber-400 inline-block" />
                Pending
              </span>
              <span className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                <span className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800 border border-blue-400 inline-block" />
                Confirmed
              </span>
              <span className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-400">
                <span className="w-3 h-3 rounded bg-purple-200 dark:bg-purple-800 border border-purple-400 inline-block" />
                Weekly
              </span>
            </>
          )}
        </div>

        {/* Connect / disconnect (tutor only) */}
        {!isStudentView && (
          gcalToken ? (
            <div className="flex items-center gap-2">
              {loading && (
                <svg className="animate-spin w-4 h-4 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              )}
              <span className="text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Google Calendar connected
              </span>
              <button
                onClick={handleDisconnect}
                className="text-xs px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors shadow-sm disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {connecting ? 'Connecting…' : 'Connect Google Calendar'}
            </button>
          )
        )}

        {/* Student view — only say "not set up" when there's genuinely nothing
            to show (no availability AND no synced calendar) */}
        {isStudentView && !gcalToken && availabilitySlots.length === 0 && (
          <span className="text-sm text-slate-400 dark:text-slate-500 italic">
            Your tutor hasn't set up calendar sharing yet.
          </span>
        )}
        {isStudentView && gcalToken && loading && (
          <svg className="animate-spin w-4 h-4 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        )}

        {/* Export PDF — student view only */}
        {isStudentView && (
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && !isStudentView && (
        <div className="mb-3 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {error}
        </div>
      )}

      {/* Reconnect banner — shown when silent refresh fails (third-party cookies blocked, etc.) */}
      {needsReconnect && !isStudentView && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              Google Calendar session expired
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Your browser blocked automatic refresh. Click to restore the connection — no account picker, just a quick consent.
            </p>
          </div>
          <button
            onClick={handleReconnect}
            disabled={connecting}
            className="flex-shrink-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {connecting && (
              <svg className="animate-spin w-3.5 h-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            )}
            {connecting ? 'Reconnecting…' : 'Reconnect'}
          </button>
        </div>
      )}

      {/* Linking hint */}
      {canLink && (
        <div className="mx-0 mb-2 px-4 py-2.5 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-xl text-sm text-violet-700 dark:text-violet-300 font-medium flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
          Click any Google Calendar event to link it (and all events with the same title) to a student. Click a linked event to unlink.
        </div>
      )}

      {/* Calendar grid */}
      <div ref={calendarGridRef} className={`${isStudentView ? 'h-[68vh]' : 'flex-1'} overflow-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm`}>
        {/* Day header row */}
        <div
          className="grid sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700"
          style={{ gridTemplateColumns: showDualTZ ? '64px repeat(7, minmax(76px, 1fr))' : '56px repeat(7, minmax(76px, 1fr))' }}
        >
          {/* Corner: timezone label */}
          <div className="border-e border-slate-200 dark:border-gray-700 flex flex-col items-end justify-end pb-1 pe-1.5">
            {showDualTZ && (
              <>
                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 leading-tight">{shortTZName(studentTZ)}</span>
                <span className="text-[9px] font-semibold text-teal-600 dark:text-teal-400 leading-tight">{shortTZName(TUTOR_TIMEZONE)}</span>
              </>
            )}
          </div>
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            return (
              <div key={i} className={`py-3 text-center border-e border-slate-200 dark:border-gray-700 last:border-e-0 ${isToday ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}>
                <p className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {DAYS[i]}
                </p>
                <p className={`text-lg font-bold mt-0.5 ${isToday ? 'text-teal-600 dark:text-teal-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  {formatHeaderDate(day)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid body */}
        <div
          className="grid"
          style={{ gridTemplateColumns: showDualTZ ? '64px repeat(7, minmax(76px, 1fr))' : '56px repeat(7, minmax(76px, 1fr))' }}
        >
          {/* Time labels column */}
          <div className="border-e border-slate-200 dark:border-gray-700 relative">
            {HOURS.map(h => (
              <div
                key={h}
                style={{ height: `${HOUR_HEIGHT_PX}px` }}
                className="flex flex-col items-end justify-start pe-1.5 pt-1 gap-0"
              >
                {h < 24 && showDualTZ ? (
                  <>
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 leading-tight">
                      {istanbulHourToStudentTime(h, studentTZ)}
                    </span>
                    <span className="text-[9px] font-semibold text-teal-600 dark:text-teal-400 leading-tight">
                      {String(h).padStart(2, '0')}:00
                    </span>
                  </>
                ) : h < 24 ? (
                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold leading-tight">
                    {String(h).padStart(2, '0')}:00
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day, dayIdx) => {
            const isToday    = isSameDay(day, today);
            const dayEvents  = eventsForDay(day);
            const dayBookings = bookingEnabled
              ? bookingsForDay(
                  isStudentView ? allBookingsForStudent : myBookings,
                  day,
                  dayIdx,
                )
              : [];

            return (
              <div
                key={dayIdx}
                className={`relative border-e border-slate-200 dark:border-gray-700 last:border-e-0 ${isToday ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''}`}
                style={{ height: `${HOUR_HEIGHT_PX * 25}px` }}
              >
                {/* Availability / working-hour background — split into two 30-min clickable halves */}
                {HOURS.slice(0, 24).map(h => {
                  const isAvail = availSet.has(`${dayIdx}-${h}`);
                  if (!isAvail) return null;
                  const dateStr   = istanbulDateString(day);
                  const halfH     = HOUR_HEIGHT_PX / 2; // 32px per 30-min slot

                  return (
                    <React.Fragment key={`avail-${h}`}>
                      {([0, 30] as const).map(m => {
                        const canBook     = isStudentView && bookingEnabled && !!studentId && !!studentName && !isSlotInPast(day, h);
                        const taken       = canBook && isHourTaken([...myBookings, ...otherBookings], dayIdx, h, m, dateStr, studentId!);
                        const alreadyMine = canBook && studentAlreadyBooked(myBookings.filter(b => b.status !== 'declined'), dayIdx, h, m, dateStr);
                        const clickable   = canBook && !taken && !alreadyMine;
                        const topPx       = h * HOUR_HEIGHT_PX + (m === 30 ? halfH : 0);

                        return (
                          <div
                            key={`avail-${h}-${m}`}
                            style={{ top: `${topPx}px`, height: `${halfH}px` }}
                            className={`absolute w-full bg-teal-100/60 dark:bg-teal-900/25 ${
                              clickable
                                ? 'cursor-pointer hover:bg-teal-200/80 dark:hover:bg-teal-800/50 transition-colors group'
                                : 'pointer-events-none'
                            } ${m === 30 ? 'border-t border-teal-200/50 dark:border-teal-700/30' : ''}`}
                            onClick={clickable ? () => handleSlotClick(dayIdx, day, h, m) : undefined}
                            title={clickable ? `Book ${String(h).padStart(2,'0')}:${m === 0 ? '00' : '30'}` : undefined}
                          >
                            {clickable && (
                              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[8px] font-bold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/60 px-1 rounded">
                                  {String(h).padStart(2,'0')}:{m === 0 ? '00' : '30'}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}

                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    style={{ top: `${h * HOUR_HEIGHT_PX}px` }}
                    className="absolute w-full border-t border-slate-100 dark:border-gray-700/60 pointer-events-none"
                  />
                ))}

                {/* Current-time indicator */}
                {isToday && (
                  <div
                    ref={currentTimeRef}
                    className="absolute w-full flex items-center z-10 pointer-events-none"
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500 -ms-1.5 flex-shrink-0" />
                    <div className="flex-1 h-0.5 bg-teal-500" />
                  </div>
                )}

                {/* ── Booking blocks ── */}
                {dayBookings.map(b => {
                  const isDeclined  = declinedIds.has(b.id);
                  const isMyBooking = isStudentView ? b.studentId === studentId : true;

                  // Bug fix 1: hide declined — student view shows briefly in red, tutor view removes immediately
                  if (b.status === 'declined') {
                    if (isStudentView && !isDeclined) return null;  // student: hide after 3s fade
                    if (!isStudentView) return null;                // tutor: remove right away
                  }

                  const topPx    = b.hour * HOUR_HEIGHT_PX + (b.minute / 60) * HOUR_HEIGHT_PX;
                  // Bug fix 2: use exact duration height — no forced minimum
                  const heightPx = (b.durationMinutes / 60) * HOUR_HEIGHT_PX;
                  // Compact mode when the block is too short to show multi-line content
                  const isCompact = heightPx < 44;

                  // Helper: format end time label
                  const endTotalMin = b.hour * 60 + b.minute + b.durationMinutes;
                  const endLabel    = `${String(Math.floor(endTotalMin / 60)).padStart(2,'0')}:${String(endTotalMin % 60).padStart(2,'0')}`;
                  const startLabel  = `${String(b.hour).padStart(2,'0')}:${String(b.minute).padStart(2,'0')}`;

                  if (isStudentView) {
                    const style = bookingBlockStyle(b, isMyBooking, isDeclined);
                    const canClick = isMyBooking && !isDeclined;
                    return (
                      <div
                        key={b.id}
                        style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                        onClick={canClick ? () => setSelectedBooking(b) : undefined}
                        className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-0.5 overflow-hidden z-20 border ${style.bg} ${style.border} ${isDeclined ? 'animate-pulse' : ''} ${canClick ? 'cursor-pointer hover:brightness-95 transition-all' : ''}`}
                      >
                        <p className={`text-[10px] font-bold leading-tight truncate ${style.text}`}>
                          {isCompact ? `${style.label} ${startLabel}` : style.label}
                        </p>
                        {!isCompact && (
                          <p className={`text-[9px] leading-tight ${style.text} opacity-75`}>
                            {startLabel}–{endLabel}
                          </p>
                        )}
                      </div>
                    );
                  }

                  // ── Tutor view ──
                  const { bg, text } = tutorBlockStyle(b);
                  return (
                    <div
                      key={b.id}
                      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                      onClick={() => setSelectedBooking(b)}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-0.5 overflow-hidden z-20 cursor-pointer hover:brightness-90 transition-all ${bg}`}
                    >
                      <p className={`text-[10px] font-bold leading-tight truncate ${text}`}>
                        {b.studentName}
                      </p>
                      {!isCompact && (
                        <p className={`text-[9px] leading-tight ${text} opacity-80`}>
                          {startLabel}–{endLabel} · {b.durationMinutes}min
                        </p>
                      )}
                      {isCompact && (
                        <p className={`text-[9px] leading-tight ${text} opacity-80`}>{startLabel}</p>
                      )}
                    </div>
                  );
                })}

                {/* GCal Events */}
                {dayEvents.map(ev => {
                  const startDT = ev.start.dateTime;
                  const endDT   = ev.end.dateTime;

                  // All-day events
                  if (!startDT || !endDT) {
                    return (
                      <div
                        key={ev.id}
                        title={isStudentView ? 'Booked' : ev.summary}
                        className={`absolute top-1 left-1 right-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white truncate z-10 ${isStudentView ? 'bg-slate-400 dark:bg-slate-500' : 'bg-teal-500 dark:bg-teal-600'}`}
                      >
                        {isStudentView ? 'Booked' : ev.summary}
                      </div>
                    );
                  }

                  const top    = timeToOffsetInTZ(startDT, TUTOR_TIMEZONE);
                  const height = eventHeightInTZ(startDT, endDT);

                  if (isStudentView) {
                    return (
                      <div
                        key={ev.id}
                        title="Booked"
                        className="absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 overflow-hidden z-10 bg-slate-300 dark:bg-slate-600 opacity-80"
                        style={{ top: `${top}px`, height: `${height}px` }}
                      >
                        <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 leading-tight">Booked</p>
                      </div>
                    );
                  }

                  const sessionList: LessonSession[] = linkedSessions[ev.id] ?? [];
                  const isLinked    = sessionList.length > 0;
                  const linkedName  = linkedStudentNames[ev.id];
                  const billings    = sessionList.map(s => linkStudentById.get(s.studentId)).filter(Boolean) as LinkStudent[];
                  // Representative billing for colour/rate: prefer a profile with a rate.
                  const linkedBilling = billings.find(b => b.hourlyRate != null) ?? billings[0];
                  const isPaired    = billings.some(b => b.kind === 'quran') && billings.some(b => b.kind === 'arabic');
                  // A family groups several DIFFERENT students under one name.
                  const familyName  = sessionList.find(s => s.familyName)?.familyName;
                  const displayName = familyName ?? linkedName;

                  const fmtT = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TUTOR_TIMEZONE });
                  const timeRange = `${fmtT(startDT)} - ${fmtT(endDT)}`;
                  const rateStr = linkedBilling?.hourlyRate != null ? `${linkedBilling.hourlyRate}$/h` : null;
                  // Background by state: Platform-linked = green, Preply-linked = pink, unlinked = white.
                  const isPlatform     = isLinked && linkedBilling?.studentType === 'platform';
                  const isPreplyLinked = isLinked && !isPlatform;

                  const handleEvClick = () => {
                    if (!canLink) return;
                    if (isLinked) {
                      // Manage the event's linked profile(s): add another or remove.
                      setManageTarget({ gcalId: ev.id, summary: ev.summary });
                    } else {
                      setLinkTarget({ id: ev.id, summary: ev.summary });
                    }
                  };

                  return (
                    <div
                      key={ev.id}
                      title={`${isLinked && displayName ? displayName + ' — ' : ''}${ev.summary}\n${timeRange}${rateStr ? `\n${rateStr}` : ''}`}
                      onClick={canLink ? handleEvClick : undefined}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-2 py-1 overflow-hidden z-10 shadow-sm transition-all
                        ${isPlatform
                          ? 'bg-green-500 text-white'
                          : isPreplyLinked
                          ? 'text-rose-950'
                          : 'bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-gray-500'}
                        ${canLink && !isLinked ? 'cursor-pointer hover:ring-2 hover:ring-violet-400 hover:ring-offset-1' : ''}
                        ${canLink && isLinked ? 'cursor-pointer hover:ring-2 hover:ring-red-400 hover:ring-offset-1' : ''}
                        ${!canLink ? 'cursor-default' : ''}
                      `}
                      style={{ top: `${top}px`, height: `${height}px`, ...(isPreplyLinked ? { background: '#FE9FC3' } : {}) }}
                    >
                      {isLinked && displayName ? (
                        <div className="flex items-center gap-1 leading-tight">
                          <ChainLinkIcon className="w-3 h-3 flex-shrink-0" />
                          <span className="text-[11px] font-bold truncate">{displayName}</span>
                          {familyName && <span className="text-[8px] font-extrabold px-1 rounded bg-black/15 leading-none py-0.5 flex-shrink-0">👪</span>}
                          {!familyName && isPaired && <span className="text-[8px] font-extrabold px-1 rounded bg-black/15 leading-none py-0.5 flex-shrink-0">Q+A</span>}
                        </div>
                      ) : (
                        <p className="text-[11px] font-bold leading-tight truncate">{ev.summary}</p>
                      )}
                      <p className={`text-[11px] font-semibold leading-tight mt-0.5 ${isLinked ? '' : 'opacity-80'}`}>{timeRange}</p>
                      {rateStr && (
                        <span className="absolute bottom-0.5 right-1.5 text-[9px] font-bold leading-none opacity-90">{rateStr}</span>
                      )}
                    </div>
                  );
                })}

                {/* Student's own linked lessons — read-only blocks (times in the student's timezone) */}
                {lessonsForDay(day).map(lesson => {
                  const top    = timeToOffsetInTZ(lesson.startAt, TUTOR_TIMEZONE);
                  const height = lesson.endAt ? eventHeightInTZ(lesson.startAt, lesson.endAt) : (50 / 60) * HOUR_HEIGHT_PX;
                  // Lesson times are shown in the STUDENT's timezone (matching the amber axis).
                  const fmtT = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: studentTZ });
                  const range = lesson.endAt ? `${fmtT(lesson.startAt)} - ${fmtT(lesson.endAt)}` : fmtT(lesson.startAt);
                  const title = lesson.title ?? 'Lesson';
                  const isShort = height < 40; // 25-min lessons → keep everything on one small line
                  return (
                    <div
                      key={`lesson-${lesson.id}`}
                      title={`${title}\n${range}`}
                      className={`absolute left-0.5 right-0.5 rounded-lg overflow-hidden z-20 bg-teal-500 dark:bg-teal-600 text-white shadow-sm ${isShort ? 'px-1 py-0' : 'px-2 py-1'}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      {isShort ? (
                        <p className="text-[8px] font-bold leading-[1.05] truncate">{title} · {range}</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 leading-tight">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 flex-shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                            <span className="text-[11px] font-bold truncate">{title}</span>
                          </div>
                          <p className="text-[10px] font-semibold leading-tight mt-0.5 opacity-90">{range}</p>
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Tutor's Google Calendar busy times → shown to students as "Booked" */}
                {isStudentView && busyForDay(day).map((b, i) => {
                  const top    = timeToOffsetInTZ(b.startAt, TUTOR_TIMEZONE);
                  const height = eventHeightInTZ(b.startAt, b.endAt);
                  const fmtT = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: studentTZ });
                  return (
                    <div
                      key={`busy-${day.toDateString()}-${i}`}
                      title={`Booked — ${fmtT(b.startAt)} to ${fmtT(b.endAt)}`}
                      className="absolute left-0.5 right-0.5 rounded-lg overflow-hidden z-10 bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-100 px-2 py-1 shadow-sm"
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <p className="text-[11px] font-bold leading-tight truncate">Booked</p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom hint */}
      {!gcalToken && !isStudentView && (
        <p className="mt-3 text-center text-sm text-slate-400 dark:text-slate-500">
          Connect Google Calendar above to display your events on this calendar.
        </p>
      )}

      {/* Booking detail / cancel modal */}
      {selectedBooking && (() => {
        const b          = selectedBooking;
        const isMine     = isStudentView ? b.studentId === studentId : true;
        const startLabel = `${String(b.hour).padStart(2,'0')}:${String(b.minute).padStart(2,'0')}`;
        const endMin     = b.hour * 60 + b.minute + b.durationMinutes;
        const endLabel   = `${String(Math.floor(endMin / 60)).padStart(2,'0')}:${String(endMin % 60).padStart(2,'0')}`;
        const isActioning     = actioningId === b.id;
        const isCancelling    = cancelConfirmId === b.id;
        const canCancel       = isMine && (b.status === 'confirmed' || b.status === 'pending');
        const WEEKDAY_NAMES   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
        const statusChip: Record<string, string> = {
          pending:   'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
          confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
          declined:  'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
        };

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) { setSelectedBooking(null); setCancelConfirmId(null); } }}
          >
            <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-700">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-blue-600 dark:text-blue-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Lesson Details</h2>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${statusChip[b.status] ?? statusChip.cancelled}`}>
                      {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                      {b.bookingType === 'weekly' ? ' · Weekly' : ''}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedBooking(null); setCancelConfirmId(null); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-3">
                {/* Student name (tutor view) */}
                {!isStudentView && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">
                      {b.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{b.studentName}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{b.portalType} student</p>
                    </div>
                    {b.whatsapp && (
                      <a
                        href={`https://wa.me/${b.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto px-2.5 py-1.5 rounded-lg bg-[#25d366] hover:bg-[#1da851] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        WhatsApp
                      </a>
                    )}
                  </div>
                )}

                {/* Time info */}
                <div className="bg-slate-50 dark:bg-gray-700/60 rounded-xl px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {b.bookingType === 'weekly'
                      ? `Every ${WEEKDAY_NAMES[b.dayOfWeek]}`
                      : `${WEEKDAY_NAMES[b.dayOfWeek]}${b.specificDate ? ', ' + new Date(b.specificDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : ''}`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {startLabel} – {endLabel} · {b.durationMinutes} min (tutor time)
                  </p>
                </div>

                {/* Student note */}
                {b.studentNote && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mb-0.5">Student note</p>
                    <p className="text-xs text-amber-800 dark:text-amber-200 italic">"{b.studentNote}"</p>
                  </div>
                )}

                {/* Tutor pending actions */}
                {!isStudentView && b.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { handleTutorAction(b.id, 'confirmed'); setSelectedBooking(null); }}
                      disabled={isActioning}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-60"
                    >
                      {isActioning ? '…' : '✓ Confirm'}
                    </button>
                    <button
                      onClick={() => { handleTutorAction(b.id, 'declined'); setSelectedBooking(null); }}
                      disabled={isActioning}
                      className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
                    >
                      ✗ Decline
                    </button>
                  </div>
                )}

                {/* Cancel section */}
                {canCancel && b.status !== 'pending' && (
                  !isCancelling ? (
                    <button
                      onClick={() => setCancelConfirmId(b.id)}
                      className="w-full py-2 rounded-xl text-sm font-semibold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Cancel this lesson
                    </button>
                  ) : (
                    <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 space-y-2">
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300 text-center">Cancel this lesson?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => isStudentView ? handleStudentCancel(b) : handleTutorCancel(b)}
                          className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                          Yes, cancel
                        </button>
                        <button
                          onClick={() => setCancelConfirmId(null)}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  )
                )}

                {/* Student pending: just show cancel option */}
                {canCancel && b.status === 'pending' && (
                  !isCancelling ? (
                    <button
                      onClick={() => setCancelConfirmId(b.id)}
                      className="w-full py-2 rounded-xl text-sm font-semibold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Cancel request
                    </button>
                  ) : (
                    <div className="rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3 space-y-2">
                      <p className="text-sm font-semibold text-red-700 dark:text-red-300 text-center">Cancel this request?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStudentCancel(b)}
                          className="flex-1 py-2 rounded-xl text-sm font-bold bg-red-600 hover:bg-red-700 text-white transition-colors"
                        >
                          Yes, cancel
                        </button>
                        <button
                          onClick={() => setCancelConfirmId(null)}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Keep it
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Booking modal */}
      {bookingSlot && studentId && studentName && teacherId && portalType && (
        <BookingModal
          day={bookingSlot.day}
          dayIdx={bookingSlot.dayIdx}
          hour={bookingSlot.hour}
          minute={bookingSlot.minute}
          teacherId={teacherId}
          studentId={studentId}
          studentName={studentName}
          whatsapp={studentWhatsApp}
          portalType={portalType}
          studentTZ={studentTimezone}
          otherBookings={otherBookings}
          availabilitySlots={availabilitySlots}
          onClose={() => setBookingSlot(null)}
          onBooked={booking => {
            setMyBookings(prev => [booking, ...prev]);
            setBookingSlot(null);
          }}
        />
      )}

      {/* ── GCal Link: student picker modal ──────────────────────────────── */}
      {linkTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-sm overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Link events to student</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 truncate">"{linkTarget.summary}"</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">All events with this title (next 60 days) will be linked.</p>
              {/* Group selector: Quran / Arabic students */}
              <div className="mt-3 flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-gray-700">
                {(['quran', 'arabic'] as const).map(g => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setLinkGroup(g)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${linkGroup === g ? 'bg-white dark:bg-gray-800 text-violet-700 dark:text-violet-300 shadow' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {g === 'quran' ? 'Quran' : 'Arabic'}
                  </button>
                ))}
              </div>
              {/* Search */}
              <input
                type="text"
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                placeholder="Search students…"
                className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            {/* Student list */}
            <div className="overflow-y-auto max-h-72 divide-y divide-slate-100 dark:divide-gray-700">
              {(() => {
                const linkedStudentIds = new Set((Object.values(linkedSessions).flat() as LessonSession[]).map(s => s.studentId));
                // Show ALL students of the selected group. A student may already be
                // linked to a different event title — we still list them (with a
                // "Linked" badge) so they can be linked to this event too.
                const q = linkSearch.trim().toLowerCase();
                const available = linkStudents.filter(s =>
                  s.kind === linkGroup &&
                  (!q || s.name.toLowerCase().includes(q)));
                if (available.length === 0) {
                  return (
                    <div className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                      {q ? 'No students match your search.' : `No ${linkGroup === 'quran' ? 'Quran' : 'Arabic'} students yet.`}
                    </div>
                  );
                }
                return available.map(s => {
                  const alreadyLinked = linkedStudentIds.has(s.id);
                  return (
                  <button
                    key={s.id}
                    onClick={() => requestLink(s.id)}
                    disabled={linking}
                    className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-sm flex-shrink-0">
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-800 dark:text-slate-100 text-sm">{s.name}</span>
                    {alreadyLinked && !linking && (
                      <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">Linked</span>
                    )}
                    {linking && <svg className="ml-auto w-4 h-4 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                  </button>
                  );
                });
              })()}
            </div>
            {/* Cancel */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-gray-700">
              <button
                onClick={() => { setLinkTarget(null); setLinkSearch(''); }}
                className="w-full py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GCal manage-links modal (linked event: add / remove profiles) ──── */}
      {manageTarget && (() => {
        const list = linkedSessions[manageTarget.gcalId] ?? [];
        const profiles = list.map(s => ({ session: s, billing: linkStudentById.get(s.studentId) }));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">Linked profiles</p>
                <p className="font-bold text-slate-800 dark:text-slate-100 truncate">"{manageTarget.summary}"</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Applies to all events with this title.</p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-gray-700 max-h-60 overflow-y-auto">
                {profiles.map(({ session, billing }) => (
                  <div key={session.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-sm flex-shrink-0">
                      {(billing?.name ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{billing?.name ?? 'Unknown'}</p>
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{billing?.kind ?? ''}</p>
                    </div>
                    <button
                      onClick={() => handleUnlinkStudent(session.studentId, manageTarget.summary)}
                      disabled={linking}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 flex flex-col gap-2 border-t border-slate-100 dark:border-gray-700">
                <button
                  onClick={() => {
                    // Default the picker to the kind not yet linked (so the same person's
                    // other profile is easy to find).
                    const kinds = profiles.map(p => p.billing?.kind);
                    setLinkGroup(kinds.includes('quran') && !kinds.includes('arabic') ? 'arabic' : 'quran');
                    setLinkTarget({ id: manageTarget.gcalId, summary: manageTarget.summary });
                    setManageTarget(null);
                  }}
                  className="w-full py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  + Link another profile
                </button>
                <button
                  onClick={() => setManageTarget(null)}
                  className="w-full py-2 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Link a different-named student → group as a FAMILY ────────────── */}
      {familyPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">👪 Link as family</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                This event is already linked to <span className="font-bold">{familyPrompt.existingNames.join(', ')}</span>. Group them with <span className="font-bold">{linkStudentById.get(familyPrompt.studentId)?.name}</span> as a family? The family name shows on the event and all members share one family link.
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Family name</label>
                <input
                  type="text"
                  autoFocus
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                  placeholder="e.g. Al-Hassan Family"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
              </div>
              <div className="flex gap-3">
                <button
                  disabled={linking || !familyName.trim()}
                  onClick={() => { const id = familyPrompt.studentId; const n = familyName; setFamilyPrompt(null); handleLinkAsFamily(id, n); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white transition-colors disabled:opacity-50"
                >
                  {linking ? 'Linking…' : 'Link as family'}
                </button>
                <button
                  onClick={() => setFamilyPrompt(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Unified link generated (portal pair or family) ────────────────── */}
      {generatedLink && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-gray-700 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-gray-700">
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                {generatedLink.family ? '👪 Family link' : '🔗 Unified portal link'}
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                {generatedLink.family
                  ? 'These students are now grouped as a family. Share this permanent link — copying any member’s link copies this same family link.'
                  : 'This student’s Quran and Arabic profiles are now paired. Share this permanent link — they can switch between both portals from it.'}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-xs font-mono text-slate-700 dark:text-slate-200 break-all">{generatedLink.url}</div>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await safeCopy(generatedLink.url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  {linkCopied ? '✓ Copied!' : 'Copy link'}
                </button>
                <button
                  onClick={() => { setGeneratedLink(null); setLinkCopied(false); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
