/**
 * Lesson booking service — students can request 25- or 50-minute slots
 * in the tutor's available hours. The tutor confirms or declines via the
 * CalendarPage. Supabase Realtime keeps both sides in sync.
 *
 * Table required in Supabase:
 *   lesson_bookings  (see SQL at the bottom of this file)
 */

import { supabase } from '../lib/supabase';
import { createNotification, formatBookingTime } from './notificationService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled';
export type BookingType   = 'single' | 'weekly';
export type BookingPortal = 'arabic' | 'quran';

export interface LessonBooking {
  id:              string;
  teacherId:       string;
  studentName:     string;
  /** Opaque identifier — share token for Arabic, report UUID for Quran */
  studentId:       string;
  portalType:      BookingPortal;
  /** WhatsApp number — Arabic students only */
  whatsapp?:       string;
  /** 0 = Monday … 6 = Sunday, in Istanbul time */
  dayOfWeek:       number;
  /** 0-23, Istanbul hour */
  hour:            number;
  /** 0 or 30 — start minute within the hour */
  minute:          0 | 30;
  durationMinutes: 25 | 50;
  bookingType:     BookingType;
  /** ISO date YYYY-MM-DD in Istanbul tz — required when bookingType === 'single' */
  specificDate?:   string;
  status:          BookingStatus;
  studentNote?:    string;
  /** ISO timestamp */
  requestedAt:     string;
  /** ISO timestamp — set when tutor confirms */
  confirmedAt?:    string;
  meetUrl?:        string;
}

// ── DB row ────────────────────────────────────────────────────────────────────

interface BookingRow {
  id:               string;
  teacher_id:       string;
  student_name:     string;
  student_id:       string;
  portal_type:      string;
  whatsapp:         string | null;
  day_of_week:      number;
  hour:             number;
  minute:           number;
  duration_minutes: number;
  booking_type:     string;
  specific_date:    string | null;
  status:           string;
  student_note:     string | null;
  requested_at:     string;
  confirmed_at:     string | null;
  meet_url:         string | null;
}

function rowToBooking(r: BookingRow): LessonBooking {
  return {
    id:              r.id,
    teacherId:       r.teacher_id,
    studentName:     r.student_name,
    studentId:       r.student_id,
    portalType:      r.portal_type as BookingPortal,
    whatsapp:        r.whatsapp    ?? undefined,
    dayOfWeek:       r.day_of_week,
    hour:            r.hour,
    minute:          (r.minute === 30 ? 30 : 0) as 0 | 30,
    durationMinutes: r.duration_minutes as 25 | 50,
    bookingType:     r.booking_type  as BookingType,
    specificDate:    r.specific_date ?? undefined,
    status:          r.status        as BookingStatus,
    studentNote:     r.student_note  ?? undefined,
    requestedAt:     r.requested_at,
    confirmedAt:     r.confirmed_at  ?? undefined,
    meetUrl:         r.meet_url      ?? undefined,
  };
}

// ── Istanbul timezone helpers ─────────────────────────────────────────────────

const ISTANBUL_TZ = 'Europe/Istanbul';

/**
 * Returns the weekday index (0 = Monday … 6 = Sunday) for the given Date
 * evaluated in Istanbul time.
 */
export function istanbulDayOfWeek(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday:  'short',
    timeZone: ISTANBUL_TZ,
  }).formatToParts(date);
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  return ({ Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as Record<string, number>)[wd] ?? 0;
}

/**
 * Returns the ISO date string YYYY-MM-DD for the given Date evaluated in
 * Istanbul time (en-CA locale gives YYYY-MM-DD format).
 */
export function istanbulDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISTANBUL_TZ }).format(date);
}

/**
 * Returns true when the Istanbul date+hour of the given slot is in the past.
 */
export function isSlotInPast(day: Date, hour: number): boolean {
  const now             = new Date();
  const todayIstanbul   = istanbulDateString(now);
  const slotDateIstanbul = istanbulDateString(day);
  if (slotDateIstanbul < todayIstanbul) return true;
  if (slotDateIstanbul > todayIstanbul) return false;
  // Same day — compare hour
  const nowHour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: ISTANBUL_TZ }).format(now)
  );
  return hour <= nowHour;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** All non-cancelled bookings for a teacher (used in the tutor's CalendarPage). */
export async function getTeacherBookings(teacherId: string): Promise<LessonBooking[]> {
  const { data, error } = await supabase
    .from('lesson_bookings')
    .select('*')
    .eq('teacher_id', teacherId)
    .neq('status', 'cancelled')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return (data as BookingRow[]).map(rowToBooking);
}

/**
 * All non-cancelled bookings for a teacher, split into the student's own
 * bookings vs. other students' confirmed bookings (student CalendarPage).
 */
export async function getStudentBookings(
  teacherId: string,
  studentId: string,
): Promise<{ mine: LessonBooking[]; others: LessonBooking[] }> {
  const { data, error } = await supabase
    .from('lesson_bookings')
    .select('*')
    .eq('teacher_id', teacherId)
    .neq('status', 'cancelled')
    .order('requested_at', { ascending: false });
  if (error) throw error;
  const all    = (data as BookingRow[]).map(rowToBooking);
  const mine   = all.filter(b => b.studentId === studentId);
  const others = all.filter(b => b.studentId !== studentId && b.status === 'confirmed');
  return { mine, others };
}

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateBookingInput {
  teacherId:       string;
  studentName:     string;
  studentId:       string;
  portalType:      BookingPortal;
  whatsapp?:       string;
  dayOfWeek:       number;
  hour:            number;
  minute:          0 | 30;
  durationMinutes: 25 | 50;
  bookingType:     BookingType;
  specificDate?:   string;
  studentNote?:    string;
}

export async function createLessonBooking(input: CreateBookingInput): Promise<LessonBooking> {
  const { data, error } = await supabase
    .from('lesson_bookings')
    .insert({
      teacher_id:       input.teacherId,
      student_name:     input.studentName,
      student_id:       input.studentId,
      portal_type:      input.portalType,
      whatsapp:         input.whatsapp       ?? null,
      day_of_week:      input.dayOfWeek,
      hour:             input.hour,
      minute:           input.minute,
      duration_minutes: input.durationMinutes,
      booking_type:     input.bookingType,
      specific_date:    input.specificDate   ?? null,
      status:           'pending',
      student_note:     input.studentNote    ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const result = rowToBooking(data as BookingRow);
  // Best-effort notification to the tutor
  await createNotification({
    teacherId: input.teacherId,
    studentId: input.studentId,
    recipient: 'tutor',
    bookingId: result.id,
    type:      'booking_requested',
    title:     'New Lesson Request',
    body:      `${input.studentName} requested a ${input.durationMinutes}min ${input.bookingType} lesson ${formatBookingTime(result)}`,
  });
  return result;
}

// ── Status update ─────────────────────────────────────────────────────────────

export async function updateBookingStatus(
  bookingId: string,
  status: 'confirmed' | 'declined' | 'cancelled',
  booking?: LessonBooking,
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (status === 'confirmed') update.confirmed_at = new Date().toISOString();
  const { error } = await supabase
    .from('lesson_bookings')
    .update(update)
    .eq('id', bookingId);
  if (error) throw error;
  // Best-effort notifications to the student
  if (booking) {
    if (status === 'confirmed') {
      await createNotification({
        teacherId: booking.teacherId,
        studentId: booking.studentId,
        recipient: 'student',
        bookingId: booking.id,
        type:      'booking_confirmed',
        title:     'Lesson Confirmed ✓',
        body:      `Your ${booking.durationMinutes}min lesson ${formatBookingTime(booking)} has been confirmed!`,
      });
    } else if (status === 'declined') {
      await createNotification({
        teacherId: booking.teacherId,
        studentId: booking.studentId,
        recipient: 'student',
        bookingId: booking.id,
        type:      'booking_declined',
        title:     'Lesson Request Declined',
        body:      `Your ${booking.durationMinutes}min lesson request ${formatBookingTime(booking)} was not accepted`,
      });
    }
  }
}

/** Cancel a booking and notify the other party. */
export async function cancelBooking(
  booking:     LessonBooking,
  cancelledBy: 'tutor' | 'student',
): Promise<void> {
  const { error } = await supabase
    .from('lesson_bookings')
    .update({ status: 'cancelled' })
    .eq('id', booking.id);
  if (error) throw error;

  if (cancelledBy === 'student') {
    await createNotification({
      teacherId: booking.teacherId,
      studentId: booking.studentId,
      recipient: 'tutor',
      bookingId: booking.id,
      type:      'booking_cancelled_by_student',
      title:     'Lesson Cancelled',
      body:      `${booking.studentName} cancelled their ${booking.durationMinutes}min ${booking.bookingType} lesson ${formatBookingTime(booking)}`,
    });
  } else {
    await createNotification({
      teacherId: booking.teacherId,
      studentId: booking.studentId,
      recipient: 'student',
      bookingId: booking.id,
      type:      'booking_cancelled_by_tutor',
      title:     'Lesson Cancelled',
      body:      `Your ${booking.durationMinutes}min lesson ${formatBookingTime(booking)} was cancelled by the tutor`,
    });
  }
}

// ── Slot-conflict helpers ─────────────────────────────────────────────────────

/** Convert hour+minute to total minutes from midnight */
function toMins(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * Returns true if the proposed slot (hour, minute) overlaps with an existing
 * confirmed booking by a different student.
 *
 * Overlap: existing booking's time range intersects the proposed slot range
 * (we assume minimum 25-min duration for the proposed slot to check overlap).
 */
export function isHourTaken(
  bookings:    LessonBooking[],
  dayOfWeek:   number,
  hour:        number,
  minute:      0 | 30,
  dateStr:     string,
  myStudentId: string,
): boolean {
  const slotStart = toMins(hour, minute);
  const slotEnd   = slotStart + 25; // minimum duration for overlap check
  return bookings.some(b => {
    if (b.status    !== 'confirmed') return false;
    if (b.studentId === myStudentId) return false;
    // Check same day
    const sameDay = b.bookingType === 'weekly'
      ? b.dayOfWeek === dayOfWeek
      : b.specificDate === dateStr;
    if (!sameDay) return false;
    // Check time overlap
    const bStart = toMins(b.hour, b.minute);
    const bEnd   = bStart + b.durationMinutes;
    return bStart < slotEnd && bEnd > slotStart;
  });
}

/**
 * Returns true if the student already has a booking (any non-declined status)
 * that overlaps the proposed slot — prevents duplicate requests.
 */
export function studentAlreadyBooked(
  myBookings: LessonBooking[],
  dayOfWeek:  number,
  hour:       number,
  minute:     0 | 30,
  dateStr:    string,
): boolean {
  const slotStart = toMins(hour, minute);
  const slotEnd   = slotStart + 25;
  return myBookings.some(b => {
    const sameDay = b.bookingType === 'weekly'
      ? b.dayOfWeek === dayOfWeek
      : b.specificDate === dateStr;
    if (!sameDay) return false;
    const bStart = toMins(b.hour, b.minute);
    const bEnd   = bStart + b.durationMinutes;
    return bStart < slotEnd && bEnd > slotStart;
  });
}

/** Update the Google Meet URL on a platform booking */
export async function updateBookingMeetUrl(bookingId: string, meetUrl: string | null): Promise<void> {
  const { error } = await supabase
    .from('lesson_bookings')
    .update({ meet_url: meetUrl })
    .eq('id', bookingId);
  if (error) throw error;
}

/** Get all confirmed Arabic portal bookings for a student (by their share token) */
export async function getConfirmedArabicBookingsByToken(shareToken: string): Promise<LessonBooking[]> {
  const { data, error } = await supabase
    .from('lesson_bookings')
    .select('*')
    .eq('student_id', shareToken)
    .eq('portal_type', 'arabic')
    .eq('status', 'confirmed');
  if (error) throw error;
  return (data as BookingRow[]).map(rowToBooking);
}

/*
 * ── SQL (run once in Supabase SQL editor) ────────────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS lesson_bookings (
 *   id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   teacher_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 *   student_name     text        NOT NULL,
 *   student_id       text        NOT NULL,
 *   portal_type      text        NOT NULL CHECK (portal_type IN ('arabic', 'quran')),
 *   whatsapp         text,
 *   day_of_week      integer     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
 *   hour             integer     NOT NULL CHECK (hour BETWEEN 0 AND 23),
 *   duration_minutes integer     NOT NULL CHECK (duration_minutes IN (25, 50)),
 *   booking_type     text        NOT NULL CHECK (booking_type IN ('single', 'weekly')),
 *   specific_date    date,
 *   status           text        NOT NULL DEFAULT 'pending'
 *                                CHECK (status IN ('pending','confirmed','declined','cancelled')),
 *   student_note     text,
 *   requested_at     timestamptz NOT NULL DEFAULT now(),
 *   confirmed_at     timestamptz,
 *   CONSTRAINT single_needs_date CHECK (booking_type <> 'single' OR specific_date IS NOT NULL)
 * );
 *
 * ALTER TABLE lesson_bookings ENABLE ROW LEVEL SECURITY;
 *
 * -- Tutor: full access to their own rows
 * CREATE POLICY "teacher_all" ON lesson_bookings
 *   FOR ALL TO authenticated
 *   USING  (teacher_id = auth.uid())
 *   WITH CHECK (teacher_id = auth.uid());
 *
 * -- Students (anonymous): can insert new bookings
 * CREATE POLICY "student_insert" ON lesson_bookings
 *   FOR INSERT TO anon
 *   WITH CHECK (true);
 *
 * -- Anyone: can read non-cancelled bookings (student sees "Booked" slots)
 * CREATE POLICY "public_read" ON lesson_bookings
 *   FOR SELECT TO anon
 *   USING (status <> 'cancelled');
 *
 * -- Enable Realtime on this table (Dashboard → Database → Replication → lesson_bookings)
 */
