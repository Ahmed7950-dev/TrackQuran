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
  family_name?: string | null;
  family_link_id?: string | null;
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
    familyName:   r.family_name    ?? undefined,
    familyLinkId: r.family_link_id ?? undefined,
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

/**
 * All distinct student_ids that have ANY (non-cancelled) linked session for a
 * teacher — used to show the "Linked" badge on dashboard cards regardless of
 * whether the linked lesson is upcoming or already past.
 */
export async function getLinkedStudentIds(teacherId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .select('student_id')
    .eq('teacher_id', teacherId)
    .neq('status', 'cancelled');
  if (error) throw error;
  return new Set((data as { student_id: string }[]).map(r => r.student_id));
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
 * Uses upsert on (teacher_id, gcal_event_id, student_id) so ONE event can be
 * linked to more than one student profile (e.g. a student's Quran AND Arabic
 * profiles), while re-linking the same (event, student) stays idempotent.
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
      { onConflict: 'teacher_id,gcal_event_id,student_id' },
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
  // Search a wide window around now (incl. recent past) so the event the tutor
  // just clicked in the current week is found, plus the future recurring series.
  const min = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);  // 31 days back
  const max = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000); // 120 days ahead
  const allEvents = await fetchGCalEvents(gcalToken, min, max);
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
 * Auto-relink: keep session rows in step with the live Google Calendar.
 *
 * Linking is per-event-id, but Google issues NEW ids when a recurring series
 * renews, an event is re-created, or new occurrences roll into view — so a
 * student the tutor linked before silently shows as unlinked again. This takes
 * the freshly-fetched events and, for any event whose TITLE was previously
 * linked to student(s), creates the missing session rows automatically
 * (carrying the family stamp). It also refreshes start/end times on existing
 * rows when the event was rescheduled under the same id.
 *
 * A title the tutor deliberately unlinked has NO remaining rows (unlink deletes
 * by title), so it never resurrects. Rows that exist with any status (incl.
 * cancelled) are left alone.
 *
 * Returns the number of rows created or time-refreshed (0 = nothing to do).
 */
type AutoSyncRow = Pick<SessionRow,
  'id' | 'student_id' | 'gcal_event_id' | 'title' | 'start_at' | 'end_at' | 'status' | 'family_name' | 'family_link_id'>;

/** Pure planner for autoSyncGCalLinks — exported for testing. */
export function planAutoSyncLinks(
  teacherId: string,
  rows: AutoSyncRow[],
  events: import('./googleCalendarService').GCalEvent[],
): { inserts: Record<string, unknown>[]; timeFixes: Array<{ id: string; start_at: string; end_at: string | null }> } {
  // Which students (and family stamp) each linked title maps to.
  const byTitle = new Map<string, { studentIds: Set<string>; familyName: string | null; familyLinkId: string | null }>();
  // Every (event, student) pair that already has a row — any status — is left alone.
  const existing = new Map<string, AutoSyncRow>();
  for (const r of rows) {
    if (r.gcal_event_id) existing.set(`${r.gcal_event_id}|${r.student_id}`, r);
    if (r.status === 'cancelled' || !r.title) continue;
    const t = byTitle.get(r.title) ?? { studentIds: new Set<string>(), familyName: null, familyLinkId: null };
    t.studentIds.add(r.student_id);
    t.familyName   = t.familyName   ?? r.family_name    ?? null;
    t.familyLinkId = t.familyLinkId ?? r.family_link_id ?? null;
    byTitle.set(r.title, t);
  }

  const inserts: Record<string, unknown>[] = [];
  const timeFixes: Array<{ id: string; start_at: string; end_at: string | null }> = [];
  for (const ev of events) {
    const info = ev.summary ? byTitle.get(ev.summary) : undefined;
    if (!info) continue;
    const startAt = ev.start.dateTime ?? ev.start.date ?? '';
    const endAt   = ev.end.dateTime   ?? ev.end.date   ?? null;
    if (!startAt) continue;
    for (const studentId of info.studentIds) {
      const row = existing.get(`${ev.id}|${studentId}`);
      if (!row) {
        inserts.push({
          teacher_id: teacherId, student_id: studentId, gcal_event_id: ev.id,
          title: ev.summary, start_at: startAt, end_at: endAt, status: 'confirmed',
          family_name: info.familyName, family_link_id: info.familyLinkId,
        });
      } else if (row.status !== 'cancelled') {
        // Same event id, moved time (rescheduled occurrence) → refresh.
        const drifted =
          new Date(row.start_at).getTime() !== new Date(startAt).getTime() ||
          (row.end_at ? new Date(row.end_at).getTime() : null) !== (endAt ? new Date(endAt).getTime() : null);
        if (drifted) timeFixes.push({ id: row.id, start_at: startAt, end_at: endAt });
      }
    }
  }
  return { inserts, timeFixes };
}

export async function autoSyncGCalLinks(
  teacherId: string,
  events: import('./googleCalendarService').GCalEvent[],
): Promise<number> {
  if (!events.length) return 0;
  try {
    const { data, error } = await supabase
      .from('arabic_lesson_sessions')
      .select('id, student_id, gcal_event_id, title, start_at, end_at, status, family_name, family_link_id')
      .eq('teacher_id', teacherId);
    if (error) throw error;
    const { inserts, timeFixes } = planAutoSyncLinks(teacherId, (data ?? []) as AutoSyncRow[], events);

    if (inserts.length) {
      const { error: insErr } = await supabase
        .from('arabic_lesson_sessions')
        .upsert(inserts, { onConflict: 'teacher_id,gcal_event_id,student_id' });
      if (insErr) throw insErr;
    }
    await Promise.all(timeFixes.map(fx =>
      supabase.from('arabic_lesson_sessions').update({ start_at: fx.start_at, end_at: fx.end_at }).eq('id', fx.id),
    ));
    return inserts.length + timeFixes.length;
  } catch (e) {
    console.warn('[autoSyncGCalLinks] skipped:', e);
    return 0;
  }
}

/**
 * Load all sessions for a teacher keyed by gcal_event_id.
 * Used by CalendarPage to show which events are already linked.
 */
export async function getSessionsByGcalId(teacherId: string): Promise<Record<string, LessonSession>> {
  // Wide window (not just "upcoming") so linked events in the current week —
  // including earlier days — still render as linked.
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .neq('status', 'cancelled')
    .gte('start_at', since);
  if (error) throw error;
  const map: Record<string, LessonSession> = {};
  for (const r of data as SessionRow[]) {
    const s = rowToSession(r);
    if (s.gcalEventId) map[s.gcalEventId] = s;
  }
  return map;
}

/**
 * Load all sessions for a teacher grouped by gcal_event_id, allowing MULTIPLE
 * linked students per event (dual-linked Quran + Arabic profiles of one student).
 */
export async function getSessionsListByGcalId(teacherId: string): Promise<Record<string, LessonSession[]>> {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .select('*')
    .eq('teacher_id', teacherId)
    .neq('status', 'cancelled')
    .gte('start_at', since);
  if (error) throw error;
  const map: Record<string, LessonSession[]> = {};
  for (const r of data as SessionRow[]) {
    const s = rowToSession(r);
    if (!s.gcalEventId) continue;
    (map[s.gcalEventId] ??= []).push(s);
  }
  return map;
}

/**
 * Stamp a family name + family_links id onto every session for an event title
 * (so the calendar shows the family name and any member resolves to the family
 * link). Pass nulls to clear the grouping.
 */
export async function setSessionFamily(
  teacherId: string,
  title: string,
  familyName: string | null,
  familyLinkId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_sessions')
    .update({ family_name: familyName, family_link_id: familyLinkId })
    .eq('teacher_id', teacherId)
    .eq('title', title);
  if (error) throw error;
}

/** If this student belongs to a calendar-created family, return its family_links id. */
export async function getFamilyLinkIdForStudent(studentId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('arabic_lesson_sessions')
    .select('family_link_id')
    .eq('student_id', studentId)
    .not('family_link_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { family_link_id: string | null }).family_link_id ?? null;
}

/**
 * Delete all sessions for a given teacher + student + event title.
 * Used when the tutor wants to unlink a student from all events with a specific title.
 */
export async function unlinkSessionsByStudentAndTitle(
  teacherId: string,
  studentId: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_sessions')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .eq('title', title);
  if (error) throw error;
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
