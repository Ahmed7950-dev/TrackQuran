/**
 * Notification service — creates and retrieves booking notifications stored in
 * the `booking_notifications` Supabase table.
 *
 * All writes are best-effort (errors are swallowed) so they never break the
 * primary booking flow.
 */

import { supabase } from '../lib/supabase';
import type { LessonBooking } from './lessonBookingService';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'booking_requested'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_cancelled_by_student'
  | 'booking_cancelled_by_tutor';

export interface BookingNotification {
  id:         string;
  teacherId:  string;
  studentId:  string;
  recipient:  'tutor' | 'student';
  bookingId:  string | null;
  type:       NotificationType;
  title:      string;
  body:       string;
  isRead:     boolean;
  createdAt:  string;
}

// ── DB row ────────────────────────────────────────────────────────────────────

interface NotificationRow {
  id:          string;
  teacher_id:  string;
  student_id:  string;
  recipient:   string;
  booking_id:  string | null;
  type:        string;
  title:       string;
  body:        string;
  is_read:     boolean;
  created_at:  string;
}

function rowToNotification(r: NotificationRow): BookingNotification {
  return {
    id:        r.id,
    teacherId: r.teacher_id,
    studentId: r.student_id,
    recipient: r.recipient as 'tutor' | 'student',
    bookingId: r.booking_id,
    type:      r.type as NotificationType,
    title:     r.title,
    body:      r.body,
    isRead:    r.is_read,
    createdAt: r.created_at,
  };
}

// ── Format helper ─────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function formatBookingTime(b: LessonBooking): string {
  const t = `${String(b.hour).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}`;
  if (b.bookingType === 'weekly') return `every ${DAYS[b.dayOfWeek]} at ${t}`;
  const d = b.specificDate
    ? new Date(b.specificDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
        weekday: 'short',
        day:     'numeric',
        month:   'short',
      })
    : DAYS[b.dayOfWeek];
  return `on ${d} at ${t}`;
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createNotification(input: {
  teacherId:  string;
  studentId:  string;
  recipient:  'tutor' | 'student';
  bookingId:  string | null;
  type:       NotificationType;
  title:      string;
  body:       string;
}): Promise<void> {
  try {
    await supabase.from('booking_notifications').insert({
      teacher_id: input.teacherId,
      student_id: input.studentId,
      recipient:  input.recipient,
      booking_id: input.bookingId,
      type:       input.type,
      title:      input.title,
      body:       input.body,
      is_read:    false,
    });
  } catch {
    // best-effort — never surface notification errors to the user
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getTutorNotifications(
  teacherId: string,
): Promise<BookingNotification[]> {
  const { data, error } = await supabase
    .from('booking_notifications')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('recipient', 'tutor')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function getStudentNotifications(
  teacherId: string,
  studentId: string,
): Promise<BookingNotification[]> {
  const { data, error } = await supabase
    .from('booking_notifications')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .eq('recipient', 'student')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data as NotificationRow[]).map(rowToNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await supabase
      .from('booking_notifications')
      .update({ is_read: true })
      .eq('id', id);
  } catch {
    // best-effort
  }
}

export async function markAllTutorNotificationsRead(teacherId: string): Promise<void> {
  try {
    await supabase
      .from('booking_notifications')
      .update({ is_read: true })
      .eq('teacher_id', teacherId)
      .eq('recipient', 'tutor')
      .eq('is_read', false);
  } catch {
    // best-effort
  }
}

export async function markAllStudentNotificationsRead(
  teacherId: string,
  studentId: string,
): Promise<void> {
  try {
    await supabase
      .from('booking_notifications')
      .update({ is_read: true })
      .eq('teacher_id', teacherId)
      .eq('student_id', studentId)
      .eq('recipient', 'student')
      .eq('is_read', false);
  } catch {
    // best-effort
  }
}

/*
 * ── SQL (run once in Supabase SQL editor) ────────────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS booking_notifications (
 *   id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
 *   teacher_id  uuid        NOT NULL,
 *   student_id  text        NOT NULL,
 *   recipient   text        NOT NULL CHECK (recipient IN ('tutor', 'student')),
 *   booking_id  uuid,
 *   type        text        NOT NULL,
 *   title       text        NOT NULL,
 *   body        text        NOT NULL,
 *   is_read     boolean     NOT NULL DEFAULT false,
 *   created_at  timestamptz NOT NULL DEFAULT now()
 * );
 *
 * ALTER TABLE booking_notifications ENABLE ROW LEVEL SECURITY;
 *
 * -- Tutor: full access to their own rows
 * CREATE POLICY "tutor_all" ON booking_notifications
 *   FOR ALL TO authenticated
 *   USING  (teacher_id = auth.uid())
 *   WITH CHECK (teacher_id = auth.uid());
 *
 * -- Anyone (anon/authenticated): can insert notifications
 * CREATE POLICY "anyone_insert" ON booking_notifications
 *   FOR INSERT TO anon, authenticated
 *   WITH CHECK (true);
 *
 * -- Students (anon): can read their own notifications
 * CREATE POLICY "student_read" ON booking_notifications
 *   FOR SELECT TO anon
 *   USING (recipient = 'student');
 *
 * -- Students (anon): can mark their own notifications read
 * CREATE POLICY "student_update" ON booking_notifications
 *   FOR UPDATE TO anon
 *   USING (recipient = 'student')
 *   WITH CHECK (recipient = 'student');
 *
 * -- Enable Realtime on this table (Dashboard → Database → Replication → booking_notifications)
 */
