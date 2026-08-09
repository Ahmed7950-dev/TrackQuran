import { supabase } from '../lib/supabase';

// ─── Fluency test persistence ────────────────────────────────────────────────
// Every finished attempt is one row; the page derives "best per level" and
// "passed" from the rows, so nothing here ever needs updating in place.

export interface FluencyResult {
  id: string;
  studentId: string;
  level: number;
  timeMs: number;
  buzzes: number;
  passed: boolean;
  createdAt: string;
}

export async function saveFluencyResult(input: {
  studentId: string;
  level: number;
  timeMs: number;
  buzzes: number;
  passed: boolean;
}): Promise<void> {
  const { error } = await supabase.from('fluency_results').insert({
    student_id: input.studentId,
    level:      input.level,
    time_ms:    input.timeMs,
    buzzes:     input.buzzes,
    passed:     input.passed,
  });
  if (error) console.error('saveFluencyResult:', error.message);
}

/** Every attempt for the given students — the page aggregates client-side. */
export async function listFluencyResults(studentIds: string[]): Promise<FluencyResult[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('fluency_results')
    .select('*')
    .in('student_id', studentIds)
    .order('created_at', { ascending: true });
  if (error) { console.error('listFluencyResults:', error.message); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, studentId: r.student_id, level: r.level,
    timeMs: r.time_ms, buzzes: r.buzzes, passed: r.passed, createdAt: r.created_at,
  }));
}
