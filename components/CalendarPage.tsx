import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  GCalEvent,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGCalEvents,
  getStoredToken,
  silentRefresh,
} from '../services/googleCalendarService';
import { AvailabilitySlot } from '../services/availabilityService';
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
const GCAL_COLOURS: Record<string, string> = {
  '1': 'bg-sky-400',
  '2': 'bg-green-400',
  '3': 'bg-violet-400',
  '4': 'bg-rose-400',
  '5': 'bg-yellow-400',
  '6': 'bg-orange-400',
  '7': 'bg-teal-400',
  '8': 'bg-slate-500',
  '9': 'bg-blue-500',
  '10': 'bg-emerald-500',
  '11': 'bg-red-500',
};

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
}) => {
  const [monday,      setMonday]      = useState<Date>(() => getMonday(new Date()));
  const [events,      setEvents]      = useState<GCalEvent[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [connecting,  setConnecting]  = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const currentTimeRef  = useRef<HTMLDivElement>(null);
  const calendarGridRef = useRef<HTMLDivElement>(null);

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
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGCalEvents(token, weekMonday, addDays(weekMonday, 7));
      setEvents(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load events.';
      if (msg.includes('reconnect')) {
        // Token expired mid-session — attempt silent re-auth before showing an error
        silentRefresh(
          newToken => {
            onTokenChange(newToken);
            // Retry the fetch with the fresh token
            fetchGCalEvents(newToken, weekMonday, addDays(weekMonday, 7))
              .then(data => { setEvents(data); setLoading(false); })
              .catch(() => { setLoading(false); });
          },
          () => {
            // Silent refresh failed — clear token so Connect button reappears
            onTokenChange(null);
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

  useEffect(() => {
    if (gcalToken) loadEvents(gcalToken, monday);
    else           setEvents([]);
  }, [gcalToken, monday, loadEvents]);

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

  const eventsForDay = (day: Date): GCalEvent[] =>
    events.filter(ev => {
      const start = ev.start.dateTime ?? ev.start.date ?? '';
      if (!start) return false;
      return isSameDay(new Date(start), day);
    });

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

        {/* Student view */}
        {isStudentView && !gcalToken && (
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

      {/* Calendar grid */}
      <div ref={calendarGridRef} className="flex-1 overflow-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        {/* Day header row */}
        <div
          className="grid sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700"
          style={{ gridTemplateColumns: showDualTZ ? '80px repeat(7, 1fr)' : '56px repeat(7, 1fr)' }}
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
          style={{ gridTemplateColumns: showDualTZ ? '80px repeat(7, 1fr)' : '56px repeat(7, 1fr)' }}
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

                  const colourClass = GCAL_COLOURS[ev.colorId ?? ''] ?? 'bg-teal-400';
                  return (
                    <div
                      key={ev.id}
                      title={`${ev.summary}\n${new Date(startDT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(endDT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 overflow-hidden z-10 cursor-default ${colourClass} opacity-75 hover:opacity-90 transition-opacity border-l-2 border-dashed border-white/50`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <p className="text-[10px] font-bold text-white leading-tight truncate pr-3">{ev.summary}</p>
                      <p className="text-[9px] text-white/80 leading-tight">
                        {new Date(startDT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: TUTOR_TIMEZONE })}
                      </p>
                      <span className="absolute top-0.5 right-1 text-[8px] text-white/60 font-bold leading-none">G</span>
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
    </div>
  );
};

export default CalendarPage;
