import { supabase } from '../lib/supabase';
import { LessonSession } from '../types';

interface SessionRow {
  id: string;
  teacher_id: string;
  student_id: string;
  gcal_event_id: string | null;
  title: string | null;
  start_at: string;
  end_at: string | null;
  meet_url: string | null;
  status: string;
  created_at: string;
}

function rowToSession(r: SessionRow): LessonSession {
  return {
    id:           r.id,
    teacherId:    r.teacher_id,
    studentId:    r.student_id,
    gcalEventId:  r.gcal_event_id  ?? undefined,
    title:        r.title          ?? undefined,
    startAt:      r.start_at,
    endAt:        r.end_at         ?? undefined,
    meetUrl:      r.meet_url       ?? undefined,
    status:       r.status as LessonSession['status'],
    createdAt:    r.created_at,
  };
}

/** Fetch all upcoming (or recently started) sessions for a teacher */
export async function getUpcomingSessions(teacherId: string): Promise<LessonSession[]> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hrs ago
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .neq('status', 'cancelled')
    .gte('start_at', since)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data as SessionRow[]).map(rowToSession);
}

/** Fetch upcoming sessions for a single student (used by student portal) */
export async function getStudentUpcomingSessions(studentId: string): Promise<LessonSession[]> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .select('*')
    .eq('student_id', studentId)
    .neq('status', 'cancelled')
    .gte('start_at', since)
    .order('start_at', { ascending: true });
  if (error) throw error;
  return (data as SessionRow[]).map(rowToSession);
}

/**
 * Link (or re-link) a Google Calendar event to a student.
 * Uses upsert on (teacher_id, gcal_event_id).
 */
export async function linkGCalSession(
  teacherId: string,
  studentId: string,
  gcalEventId: string,
  title: string,
  startAt: string,
  endAt?: string,
): Promise<LessonSession> {
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .upsert(
      {
        teacher_id:    teacherId,
        student_id:    studentId,
        gcal_event_id: gcalEventId,
        title,
        start_at:      startAt,
        end_at:        endAt ?? null,
        status:        'confirmed',
      },
      { onConflict: 'teacher_id,gcal_event_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return rowToSession(data as SessionRow);
}

/** Remove a linked session */
export async function unlinkSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_sessions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

/** Store the Google Meet URL on a session */
export async function updateSessionMeetUrl(id: string, meetUrl: string | null): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_sessions')
    .update({ meet_url: meetUrl })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Links ALL Google Calendar events whose summary matches `eventTitle`
 * (fetched for the next 60 days) to the given student.
 * Returns the number of sessions created/updated.
 */
export async function linkAllEventsByTitle(
  teacherId: string,
  studentId: string,
  eventTitle: string,
  gcalToken: string,
): Promise<number> {
  // Import fetchGCalEvents dynamically to avoid circular deps
  const { fetchGCalEvents } = await import('./googleCalendarService');
  const now = new Date();
  const max = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days
  const allEvents = await fetchGCalEvents(gcalToken, now, max);
  const matching  = allEvents.filter(ev => ev.summary === eventTitle);
  if (!matching.length) return 0;

  await Promise.all(matching.map(ev => {
    const startAt = ev.start.dateTime ?? ev.start.date ?? '';
    const endAt   = ev.end.dateTime   ?? ev.end.date   ?? undefined;
    return linkGCalSession(teacherId, studentId, ev.id, ev.summary, startAt, endAt);
  }));
  return matching.length;
}

/**
 * Load all sessions for a teacher keyed by gcal_event_id.
 * Used by CalendarPage to show which events are already linked.
 */
export async function getSessionsByGcalId(teacherId: string): Promise<Record<string, LessonSession>> {
  const sessions = await getUpcomingSessions(teacherId);
  const map: Record<string, LessonSession> = {};
  for (const s of sessions) {
    if (s.gcalEventId) map[s.gcalEventId] = s;
  }
  return map;
}

// ── Unified lesson type (GCal session OR platform booking) ───────────────────

export interface UnifiedLesson {
  id: string;
  source: 'gcal' | 'platform';
  startAt: Date;
  endAt?: Date;
  title: string;
  meetUrl?: string;
  /** Set when source === 'gcal' */
  sessionId?: string;
  /** Set when source === 'platform' */
  bookingId?: string;
}

/** Generate all future occurrences of a booking within the next `maxDays` days */
function getBookingOccurrences(
  booking: import('./lessonBookingService').LessonBooking,
  maxDays = 90,
): Date[] {
  const now   = new Date();
  const dates: Date[] = [];

  if (booking.bookingType === 'single' && booking.specificDate) {
    const d = new Date(
      `${booking.specificDate}T${String(booking.hour).padStart(2, '0')}:${String(booking.minute).padStart(2, '0')}:00+03:00`,
    );
    if (d > now) dates.push(d);
  } else if (booking.bookingType === 'weekly') {
    const targetDay = booking.dayOfWeek; // 0 = Mon … 6 = Sun (Istanbul)
    for (let i = 0; i <= maxDays; i++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + i);
      const jsDay  = candidate.getDay(); // 0 = Sun … 6 = Sat
      const monDay = jsDay === 0 ? 6 : jsDay - 1; // Mon=0 … Sun=6
      if (monDay !== targetDay) continue;
      const iso = `${candidate.toISOString().slice(0, 10)}T${String(booking.hour).padStart(2, '0')}:${String(booking.minute).padStart(2, '0')}:00+03:00`;
      const d = new Date(iso);
      if (d > now) dates.push(d);
    }
  }
  return dates;
}

/**
 * Returns all upcoming lessons for a student, combining GCal-linked sessions
 * and platform bookings, sorted by startAt ascending.
 *
 * @param studentId   - arabic_students.id (for sessions)
 * @param shareToken  - student's share token (for platform bookings); optional
 */
export async function getStudentUnifiedLessons(
  studentId: string,
  shareToken?: string,
): Promise<UnifiedLesson[]> {
  const { getConfirmedArabicBookingsByToken } = await import('./lessonBookingService');
  const results: UnifiedLesson[] = [];
  const now = new Date();

  // 1. GCal-linked sessions
  const sessions = await getStudentUpcomingSessions(studentId);
  for (const s of sessions) {
    const startAt = new Date(s.startAt);
    if (startAt <= now) continue;
    results.push({
      id:        `session-${s.id}`,
      source:    'gcal',
      startAt,
      endAt:     s.endAt ? new Date(s.endAt) : undefined,
      title:     s.title ?? 'Arabic Lesson',
      meetUrl:   s.meetUrl,
      sessionId: s.id,
    });
  }

  // 2. Platform bookings (matched by share token)
  if (shareToken) {
    try {
      const bookings = await getConfirmedArabicBookingsByToken(shareToken);
      for (const b of bookings) {
        const occurrences = getBookingOccurrences(b);
        for (const startAt of occurrences) {
          const endAt = new Date(startAt.getTime() + b.durationMinutes * 60 * 1000);
          results.push({
            id:        `booking-${b.id}-${startAt.toISOString()}`,
            source:    'platform',
            startAt,
            endAt,
            title:     'Arabic Lesson (Platform)',
            meetUrl:   b.meetUrl,
            bookingId: b.id,
          });
        }
      }
    } catch (err) {
      console.warn('[UnifiedLessons] bookings fetch failed:', err);
    }
  }

  // Sort ascending and deduplicate by approximate time (within 5 min)
  results.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return results;
}
