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
