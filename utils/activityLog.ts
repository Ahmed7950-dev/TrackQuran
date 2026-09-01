// utils/activityLog.ts
// -----------------------------------------------------------------------------
// The student logbook. Every trackable activity — fluency tests, tajweed lessons
// marked done, letters-trainer challenges and letter games — is written as an
// ATTENDANCE record carrying an `activity` payload. One array, one source of
// truth: the calendar, the attendance stats and the student portal all already
// read `student.attendance`, so nothing else needs a new data path and no
// migration is required (the column is jsonb).
//
// Everything here is pure so it can be unit-tested and reused by any caller.
// -----------------------------------------------------------------------------

import { Student, AttendanceRecord, AttendanceStatus, ActivityLog } from '../types';

/** Same day, ignoring clock time. */
export const sameDay = (a: string | Date, b: string | Date): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** Build an activity attendance record. Noon-stamped like every other log the
 *  app writes, so a timezone shift can never slide it into the wrong day. */
export function makeActivityRecord(activity: ActivityLog, when: Date = new Date()): AttendanceRecord {
  const day = new Date(when);
  day.setHours(12, 0, 0, 0);
  return {
    id: `act-${activity.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: day.toISOString(),
    status: AttendanceStatus.Present,
    activity,
  };
}

/** True when this exact event was already logged (same kind + sourceId, same day). */
export function alreadyLogged(student: Student, activity: ActivityLog, when: Date = new Date()): boolean {
  return (student.attendance ?? []).some(a =>
    a.activity?.kind === activity.kind
    && (activity.sourceId ? a.activity?.sourceId === activity.sourceId : a.activity?.title === activity.title)
    && sameDay(a.date, when));
}

/** Append an activity to the student's logbook. Returns the SAME student object
 *  when the event was already logged, so callers can skip a pointless save. */
export function withActivityLog(student: Student, activity: ActivityLog, when: Date = new Date()): Student {
  if (alreadyLogged(student, activity, when)) return student;
  return { ...student, attendance: [...(student.attendance ?? []), makeActivityRecord(activity, when)] };
}

/** Remove one log by record id. */
export function withoutAttendanceRecord(student: Student, recordId: string): Student {
  return { ...student, attendance: (student.attendance ?? []).filter(a => a.id !== recordId) };
}

/** Edit an activity log's wording (tutor-only correction). */
export function withEditedActivity(student: Student, recordId: string, patch: Partial<ActivityLog>): Student {
  return {
    ...student,
    attendance: (student.attendance ?? []).map(a =>
      a.id === recordId && a.activity ? { ...a, activity: { ...a.activity, ...patch } } : a),
  };
}

/** Icon + badge colour per activity kind, shared by the calendar and day view. */
export const ACTIVITY_STYLE: Record<ActivityLog['kind'], { icon: string; badgeCls: string }> = {
  'fluency':         { icon: '⏱️', badgeCls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  'tajweed':         { icon: '🎨', badgeCls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300' },
  'letters':         { icon: '✍️', badgeCls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' },
  'letters-tajweed': { icon: '🖍️', badgeCls: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-300' },
  'game':            { icon: '🎮', badgeCls: 'bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-300' },
};
