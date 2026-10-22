// services/missedLessonService.ts
// -----------------------------------------------------------------------------
// Which "nothing logged for …" cards the tutor has already settled.
//
// The answer used to live only in this browser's localStorage, so the same
// lesson was asked about again on every other device the tutor opened. The
// occurrence key ("<session id>:<ISO start>") is the same everywhere, so it
// only needed somewhere shared to live.
//
// localStorage is still written alongside: it answers instantly, it works
// offline, and it keeps whatever was dismissed before this table existed.
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

export type MissedOutcome = 'absent' | 'rescheduled' | 'ignored';

/** Every occurrence this tutor has settled, on any device. */
export const listMissedLessonDismissals = async (teacherId: string): Promise<Set<string>> => {
  const { data, error } = await supabase
    .from('missed_lesson_dismissals')
    .select('occurrence_key')
    .eq('teacher_id', teacherId);
  if (error) {
    console.error('listMissedLessonDismissals:', error.message);
    return new Set();           // the local list still applies
  }
  return new Set((data ?? []).map(r => (r as { occurrence_key: string }).occurrence_key));
};

/** Settle one, for every device. Upserted, so answering twice is harmless. */
export const dismissMissedLesson = async (
  teacherId: string, occurrenceKey: string, outcome: MissedOutcome,
): Promise<boolean> => {
  const { error } = await supabase
    .from('missed_lesson_dismissals')
    .upsert(
      { teacher_id: teacherId, occurrence_key: occurrenceKey, outcome },
      { onConflict: 'teacher_id,occurrence_key' },
    );
  if (error) {
    console.error('dismissMissedLesson:', error.message, '| key:', occurrenceKey);
    return false;
  }
  return true;
};
