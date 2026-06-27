// services/tutorBusyService.ts
// Mirrors the tutor's Google Calendar busy times into the DB so STUDENTS can see
// them as "Booked" on any device (the Google token only lives in the tutor's
// browser). The tutor's browser writes the busy ranges for a week; the student
// portal reads them. Only start/end times are stored — no event details.

import { supabase } from '../lib/supabase';

export interface BusySlot { startAt: string; endAt: string }

/** Read the tutor's busy ranges that start within [fromIso, toIso). */
export async function getTutorBusy(teacherId: string, fromIso: string, toIso: string): Promise<BusySlot[]> {
  const { data, error } = await supabase
    .from('tutor_busy_slots')
    .select('start_at, end_at')
    .eq('teacher_id', teacherId)
    .gte('start_at', fromIso)
    .lt('start_at', toIso)
    .order('start_at', { ascending: true });
  if (error) { console.error('getTutorBusy:', error.message); return []; }
  return (data ?? []).map((r: { start_at: string; end_at: string }) => ({ startAt: r.start_at, endAt: r.end_at }));
}

/** Replace the tutor's busy ranges for the [fromIso, toIso) window with `slots`. */
export async function syncTutorBusy(teacherId: string, fromIso: string, toIso: string, slots: BusySlot[]): Promise<void> {
  const del = await supabase
    .from('tutor_busy_slots')
    .delete()
    .eq('teacher_id', teacherId)
    .gte('start_at', fromIso)
    .lt('start_at', toIso);
  if (del.error) { console.error('syncTutorBusy delete:', del.error.message); return; }
  if (slots.length) {
    const ins = await supabase.from('tutor_busy_slots').insert(
      slots.map(s => ({ teacher_id: teacherId, start_at: s.startAt, end_at: s.endAt })),
    );
    if (ins.error) console.error('syncTutorBusy insert:', ins.error.message);
  }
}
