import { supabase } from '../lib/supabase';
import { createOrUpdateSharedReport } from './dataService';
import { ensureShareTokenById } from './arabicService';

/**
 * A unified portal pairing: one student's Quran profile + Arabic profile behind
 * a single permanent token. Opening /portal/<token> lets the student choose and
 * switch between their two portals.
 */
export interface PortalPair {
  token: string;
  studentName: string;
  quranReportId: string;
  arabicShareToken: string;
}

interface PairRow {
  token: string;
  student_name: string | null;
  quran_report_id: string | null;
  arabic_share_token: string | null;
  arabic_student_id?: string | null;
}

/**
 * Ensure a permanent unified link exists for this student's Quran + Arabic
 * profiles. Idempotent: the token is created once (on first pairing) and reused
 * forever. Also ensures the underlying Quran shared report and Arabic share
 * token exist so both portals load.
 */
export async function ensurePortalPair(
  teacherId: string,
  quranStudentId: string,
  arabicStudentId: string,
  studentName: string,
): Promise<PortalPair | null> {
  // 1. Make sure both underlying portals are reachable.
  const quranReportId = await createOrUpdateSharedReport(teacherId, quranStudentId, studentName, {
    studentName,
    generatedAt: new Date().toISOString(),
  });
  const arabicShareToken = await ensureShareTokenById(arabicStudentId);
  if (!quranReportId || !arabicShareToken) return null;

  // 2. Upsert the pairing. token is NOT in the payload, so on conflict the
  //    existing (permanent) token is preserved; on insert the column default
  //    generates a fresh one.
  const { data, error } = await supabase
    .from('student_portal_pairs')
    .upsert(
      {
        teacher_id:         teacherId,
        quran_student_id:   quranStudentId,
        arabic_student_id:  arabicStudentId,
        quran_report_id:    quranReportId,
        arabic_share_token: arabicShareToken,
        student_name:       studentName,
      },
      { onConflict: 'teacher_id,quran_student_id,arabic_student_id' },
    )
    .select('token, student_name, quran_report_id, arabic_share_token')
    .single();
  if (error || !data) { console.error('ensurePortalPair:', error?.message); return null; }
  const row = data as PairRow;
  return { token: row.token, studentName, quranReportId, arabicShareToken };
}

/**
 * If this student (Quran or Arabic profile) has been paired, return the
 * permanent unified portal token; otherwise null. Used so "copy student link"
 * on either dashboard yields the SAME paired link once a pairing exists.
 */
export async function getPortalTokenForStudent(kind: 'quran' | 'arabic', studentId: string): Promise<string | null> {
  const col = kind === 'quran' ? 'quran_student_id' : 'arabic_student_id';
  const { data, error } = await supabase
    .from('student_portal_pairs')
    .select('token')
    .eq(col, studentId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { token: string }).token;
}

/** Resolve a unified portal token to its two underlying portals (no auth). */
export async function getPortalPairByToken(token: string): Promise<PortalPair | null> {
  const { data, error } = await supabase
    .from('student_portal_pairs')
    .select('token, student_name, quran_report_id, arabic_share_token, arabic_student_id')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as PairRow;
  if (!row.quran_report_id) return null;

  // The Arabic token cached on the pair can go STALE if the student's share
  // token was regenerated after pairing — then the Arabic portal shows
  // "link not found" even though the pairing is valid. Re-resolve it from the
  // stable arabic_student_id (the student row is the source of truth for which
  // token opens the portal); fall back to the cached column if the lookup fails.
  let arabicShareToken = row.arabic_share_token ?? null;
  if (row.arabic_student_id) {
    const { data: st } = await supabase
      .from('arabic_students')
      .select('share_token')
      .eq('id', row.arabic_student_id)
      .maybeSingle();
    const live = (st as { share_token: string | null } | null)?.share_token;
    if (live) arabicShareToken = live;
  }
  if (!arabicShareToken) return null;

  return {
    token: row.token,
    studentName: row.student_name ?? 'Student',
    quranReportId: row.quran_report_id,
    arabicShareToken,
  };
}
