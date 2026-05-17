/**
 * BookingModal — shown when a student clicks an available slot on the calendar.
 * Lets them choose 25 or 50 minutes, single or weekly, add an optional note,
 * then submits a pending booking request.
 */

import React, { useState } from 'react';
import {
  createLessonBooking,
  LessonBooking,
  BookingPortal,
} from '../services/lessonBookingService';

/* ------------------------------------------------------------------ */
/*  Timezone helpers (mirrors CalendarPage)                             */
/* ------------------------------------------------------------------ */

const ISTANBUL_TZ = 'Europe/Istanbul';

/** Convert Istanbul hour+minute to student's local time string HH:MM */
function istanbulTimeToLocal(hour: number, minute: number, studentTZ: string): string {
  const now      = new Date();
  const totalMin = hour * 60 + minute - 3 * 60; // subtract Istanbul offset (UTC+3)
  const utcH     = Math.floor(((totalMin % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
  const utcM     = ((totalMin % 60) + 60) % 60;
  const utcDate  = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    utcH, utcM, 0,
  ));
  return utcDate.toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: studentTZ,
  });
}

/** Format Istanbul HH:MM string from hour + minute */
function fmtIstanbul(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function istanbulDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL_TZ }).format(date);
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/* ------------------------------------------------------------------ */
/*  Props                                                               */
/* ------------------------------------------------------------------ */

interface BookingModalProps {
  /** The calendar day that was clicked */
  day:          Date;
  /** 0 = Mon … 6 = Sun (calendar column index) */
  dayIdx:       number;
  /** Istanbul hour (0-23) that was clicked */
  hour:         number;
  /** 0 or 30 — which half of the hour was clicked */
  minute:       0 | 30;
  teacherId:    string;
  studentId:    string;
  studentName:  string;
  whatsapp?:    string;
  portalType:   BookingPortal;
  /** Student's IANA timezone for display */
  studentTZ?:   string;
  onClose:      () => void;
  onBooked:     (booking: LessonBooking) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

const BookingModal: React.FC<BookingModalProps> = ({
  day,
  dayIdx,
  hour,
  minute,
  teacherId,
  studentId,
  studentName,
  whatsapp,
  portalType,
  studentTZ,
  onClose,
  onBooked,
}) => {
  const [duration,     setDuration]     = useState<25 | 50>(25);
  const [bookingType,  setBookingType]  = useState<'single' | 'weekly'>('single');
  const [note,         setNote]         = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const resolvedTZ  = studentTZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Calculate end time (hour + minute + duration)
  const startTotalMin = hour * 60 + minute;
  const endTotalMin   = startTotalMin + duration;
  const endHour       = Math.floor(endTotalMin / 60);
  const endMin        = endTotalMin % 60;

  const istanbulStr    = fmtIstanbul(hour, minute);
  const endIstanbul    = fmtIstanbul(endHour, endMin);
  const localStr       = istanbulTimeToLocal(hour, minute, resolvedTZ);
  const localEndStr    = istanbulTimeToLocal(endHour, endMin, resolvedTZ);
  const dateStr        = istanbulDateString(day);
  const weekdayName    = WEEKDAY_NAMES[dayIdx] ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const booking = await createLessonBooking({
        teacherId,
        studentName,
        studentId,
        portalType,
        whatsapp,
        dayOfWeek:       dayIdx,
        hour,
        minute,
        durationMinutes: duration,
        bookingType,
        specificDate:    bookingType === 'single' ? dateStr : undefined,
        studentNote:     note.trim() || undefined,
      });
      onBooked(booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send booking request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Book a Lesson</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Request pending tutor approval</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Slot info */}
          <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3 space-y-1">
            <p className="text-sm font-semibold text-teal-800 dark:text-teal-200">
              {weekdayName}, {new Date(dateStr).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
            </p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                Your time: {localStr}–{localEndStr}
              </span>
              <span className="flex items-center gap-1 text-teal-700 dark:text-teal-300 font-medium">
                <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />
                Tutor: {istanbulStr}–{endIstanbul}
              </span>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Duration
            </label>
            <div className="flex gap-2">
              {([25, 50] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                    duration === d
                      ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                      : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-teal-400'
                  }`}
                >
                  {d} min
                </button>
              ))}
            </div>
          </div>

          {/* Booking type */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Frequency
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBookingType('single')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  bookingType === 'single'
                    ? 'bg-teal-600 border-teal-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-teal-400'
                }`}
              >
                ✓ One-time
              </button>
              <button
                type="button"
                onClick={() => setBookingType('weekly')}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  bookingType === 'weekly'
                    ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-purple-400'
                }`}
              >
                🔁 Weekly
              </button>
            </div>
            {bookingType === 'weekly' && (
              <p className="mt-2 text-xs text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-lg">
                Repeats every <strong>{weekdayName}</strong> at <strong>{istanbulStr}</strong> tutor time once confirmed.
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Note <span className="font-normal normal-case">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. I'd like to focus on grammar this session…"
              className="w-full text-sm rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-200 px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-slate-300 dark:placeholder-slate-500"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
              )}
              {loading ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingModal;
