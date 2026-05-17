import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  GCalEvent,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  fetchGCalEvents,
  getStoredToken,
} from '../services/googleCalendarService';

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
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface CalendarPageProps {
  gcalToken:     string | null;
  onTokenChange: (token: string | null) => void;
  /** When true: hides connect button, shows events as grey "Booked" blocks */
  isStudentView?: boolean;
}

const CalendarPage: React.FC<CalendarPageProps> = ({
  gcalToken,
  onTokenChange,
  isStudentView = false,
}) => {
  const [monday,     setMonday]     = useState<Date>(() => getMonday(new Date()));
  const [events,     setEvents]     = useState<GCalEvent[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const currentTimeRef = useRef<HTMLDivElement>(null);

  // Student's local timezone — always show dual in student view
  const studentTZ  = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showDualTZ = isStudentView;

  /* ---------------------------------------------------------------- */
  /*  Fetch events                                                      */
  /* ---------------------------------------------------------------- */

  const loadEvents = useCallback(async (token: string, weekMonday: Date) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGCalEvents(token, weekMonday, addDays(weekMonday, 7));
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events.');
      if (err instanceof Error && err.message.includes('reconnect')) onTokenChange(null);
    } finally {
      setLoading(false);
    }
  }, [onTokenChange]);

  useEffect(() => {
    if (gcalToken) loadEvents(gcalToken, monday);
    else           setEvents([]);
  }, [gcalToken, monday, loadEvents]);

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
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600 dark:bg-slate-300 inline-block" />
              Your local time
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" />
              Tutor (Istanbul)
            </span>
          </div>
        )}

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

        {/* Student view — no token info */}
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
      <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        {/* Day header row */}
        <div
          className="grid sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700"
          style={{ gridTemplateColumns: showDualTZ ? '80px repeat(7, 1fr)' : '56px repeat(7, 1fr)' }}
        >
          {/* Corner: timezone label */}
          <div className="border-e border-slate-200 dark:border-gray-700 flex flex-col items-end justify-end pb-1 pe-1.5">
            {showDualTZ ? (
              <>
                <span className="text-[9px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">Your time</span>
                <span className="text-[9px] text-teal-500 dark:text-teal-400 leading-tight">Istanbul</span>
              </>
            ) : null}
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
                    {/* Student view: local time primary, Istanbul secondary */}
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">
                      {istanbulHourToStudentTime(h, studentTZ)}
                    </span>
                    <span className="text-[9px] text-teal-500 dark:text-teal-400 leading-tight">
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
            return (
              <div
                key={dayIdx}
                className={`relative border-e border-slate-200 dark:border-gray-700 last:border-e-0 ${isToday ? 'bg-teal-50/30 dark:bg-teal-900/10' : ''}`}
                style={{ height: `${HOUR_HEIGHT_PX * 25}px` }}
              >
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    style={{ top: `${h * HOUR_HEIGHT_PX}px` }}
                    className="absolute w-full border-t border-slate-100 dark:border-gray-700/60"
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

                {/* Events */}
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

                  const colourClass = GCAL_COLOURS[ev.colorId ?? ''] ?? 'bg-teal-500';
                  return (
                    <div
                      key={ev.id}
                      title={`${ev.summary}\n${new Date(startDT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(endDT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 overflow-hidden z-10 cursor-default ${colourClass} opacity-90 hover:opacity-100 transition-opacity`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                    >
                      <p className="text-[10px] font-bold text-white leading-tight truncate">{ev.summary}</p>
                      <p className="text-[9px] text-white/80 leading-tight">
                        {new Date(startDT).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: TUTOR_TIMEZONE })}
                      </p>
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
    </div>
  );
};

export default CalendarPage;
