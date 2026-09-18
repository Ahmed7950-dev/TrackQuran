// services/recitationHomeworkService.ts
// -----------------------------------------------------------------------------
// Quran recitation homework — the student records every verse of a "prepare
// reading" homework on /recite/<id>, submits, and the tutor reviews it:
// mistakes are logged into the student's normal mistakes map on the Quran page,
// then Passed / Needs revision.
//
//   quran_recitation_homework  one row per homework (status + recording index)
//   storage: quran-recitations/<id>/<surah>-<ayah>-<ts>.<ext>
//
// Storage stays small: recordings are mono speech at 24 kbps (~3 KB/s, a
// 20-verse homework ≈ 1 MB), a re-recording replaces the old file at once, and
// purgeOldRecitations (run from the tutor's app) deletes every recording 30
// days after the review, or 60 days after assignment if never submitted.
// Migration: supabase/migrations/20260917_quran_recitation_homework.sql
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import { QURAN_METADATA } from '../constants';

export const RECITATION_BUCKET = 'quran-recitations';
export const KEEP_AFTER_REVIEW_DAYS = 30;
export const KEEP_UNSUBMITTED_DAYS = 60;
const SITE = 'https://www.lisanquran.com';

export type RecitationStatus = 'assigned' | 'submitted' | 'passed' | 'needs_revision';

export interface VerseRecording { path: string; url: string; ms: number; at: string }

export interface RecitationHomework {
  id: string;
  homeworkId: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  reportId?: string;
  startSurah: number; startAyah: number; endSurah: number; endAyah: number;
  note?: string;
  status: RecitationStatus;
  /** Explicit verse list ("surah:ayah") — set on a reassigned homework, where
   *  the verses are the ones the student got wrong and are not a range. */
  verses?: string[];
  parentId?: string;
  reassignedCount?: number;
  recordings: Record<string, VerseRecording>;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  purgedAt: string | null;
}

interface Row {
  id: string; homework_id: string; teacher_id: string; student_id: string; student_name: string | null;
  report_id: string | null; start_surah: number; start_ayah: number; end_surah: number; end_ayah: number;
  note: string | null; status: RecitationStatus; recordings: Record<string, VerseRecording> | null;
  verses: string[] | null; parent_id: string | null; reassigned_count: number | null;
  created_at: string; submitted_at: string | null; reviewed_at: string | null; purged_at: string | null;
}

const fromRow = (r: Row): RecitationHomework => ({
  id: r.id, homeworkId: r.homework_id, teacherId: r.teacher_id, studentId: r.student_id,
  studentName: r.student_name ?? undefined, reportId: r.report_id ?? undefined,
  startSurah: r.start_surah, startAyah: r.start_ayah, endSurah: r.end_surah, endAyah: r.end_ayah,
  note: r.note ?? undefined, status: r.status, recordings: r.recordings ?? {},
  verses: r.verses ?? undefined, parentId: r.parent_id ?? undefined,
  reassignedCount: r.reassigned_count ?? undefined,
  createdAt: r.created_at, submittedAt: r.submitted_at, reviewedAt: r.reviewed_at, purgedAt: r.purged_at,
});

export const recitationUrl = (id: string): string => `${SITE}/recite/${id}`;
/** The student's portal, opened on this homework (SharedReportPage reads ?hw=). */
export const portalHomeworkUrl = (reportId: string, homeworkId: string): string =>
  `${SITE}/report/${reportId}?hw=${encodeURIComponent(homeworkId)}`;

/** The verses this homework covers: its own list when it has one (a reassigned
 *  homework holds only the verses to redo), otherwise the whole range. */
export function versesOf(r: Pick<RecitationHomework, 'startSurah' | 'startAyah' | 'endSurah' | 'endAyah' | 'verses'>): Array<[number, number]> {
  if (r.verses?.length) {
    return r.verses.map(k => k.split(':').map(Number) as [number, number]).filter(([s, a]) => !!s && !!a);
  }
  return versesOfRange(r);
}

export const verseKey = ([s, a]: [number, number]): string => `${s}:${a}`;

/** Every verse of the range, in order, as [surah, ayah]. */
export function versesOfRange(r: Pick<RecitationHomework, 'startSurah' | 'startAyah' | 'endSurah' | 'endAyah'>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let s = r.startSurah; s <= r.endSurah; s++) {
    const n = QURAN_METADATA.find(m => m.number === s)?.numberOfAyahs ?? 0;
    const a0 = s === r.startSurah ? r.startAyah : 1;
    const a1 = s === r.endSurah ? r.endAyah : n;
    for (let a = a0; a <= a1; a++) out.push([s, a]);
  }
  return out;
}

export const rangeLabel = (r: Pick<RecitationHomework, 'startSurah' | 'startAyah' | 'endSurah' | 'endAyah' | 'verses'>): string => {
  const name = (s: number) => QURAN_METADATA.find(m => m.number === s)?.transliteratedName ?? `Surah ${s}`;
  // A reassigned homework is a handful of verses, not a range — name them.
  if (r.verses?.length) {
    const vs = versesOf(r);
    const shown = vs.slice(0, 4).map(([s, a]) => `${name(s)} ${a}`).join(', ');
    return vs.length > 4 ? `${shown} +${vs.length - 4}` : shown;
  }
  if (r.startSurah === r.endSurah) {
    return r.startAyah === r.endAyah ? `${name(r.startSurah)} ${r.startAyah}` : `${name(r.startSurah)} ${r.startAyah}–${r.endAyah}`;
  }
  return `${name(r.startSurah)} ${r.startAyah} → ${name(r.endSurah)} ${r.endAyah}`;
};

// ── Rows ────────────────────────────────────────────────────────────────────

export async function createRecitationHomework(input: {
  homeworkId: string; teacherId: string; studentId: string; studentName: string; reportId: string | null;
  startSurah: number; startAyah: number; endSurah: number; endAyah: number; note?: string;
  /** Only for a reassigned homework: the verses to record again. */
  verses?: string[]; parentId?: string;
}): Promise<RecitationHomework | null> {
  const { data, error } = await supabase.from('quran_recitation_homework').insert({
    homework_id: input.homeworkId, teacher_id: input.teacherId, student_id: input.studentId,
    student_name: input.studentName, report_id: input.reportId,
    start_surah: input.startSurah, start_ayah: input.startAyah, end_surah: input.endSurah, end_ayah: input.endAyah,
    note: input.note ?? null, verses: input.verses ?? null, parent_id: input.parentId ?? null,
  }).select('*').single();
  if (error) { console.error('createRecitationHomework:', error.message); return null; }
  return fromRow(data as Row);
}

export async function getRecitationHomework(id: string): Promise<RecitationHomework | null> {
  const { data, error } = await supabase.from('quran_recitation_homework').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getRecitationHomework:', error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

export async function listRecitationHomework(studentId: string): Promise<RecitationHomework[]> {
  const { data, error } = await supabase.from('quran_recitation_homework').select('*')
    .eq('student_id', studentId).order('created_at', { ascending: false });
  if (error) { console.error('listRecitationHomework:', error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function deleteRecitationHomework(rec: RecitationHomework): Promise<void> {
  const paths = Object.values(rec.recordings).map(r => r.path);
  if (paths.length) await supabase.storage.from(RECITATION_BUCKET).remove(paths);
  await supabase.from('quran_recitation_homework').delete().eq('id', rec.id);
}

// ── Recording ───────────────────────────────────────────────────────────────

/** The smallest speech format this browser records: Opus where it can (Chrome,
 *  Firefox, Android), AAC in MP4 on Safari/iOS. */
export function pickRecorderMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm'];
  if (typeof MediaRecorder === 'undefined') return '';
  return options.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) ?? '';
}
export const RECORDER_BITRATE = 24_000;

/**
 * Upload one verse's recording and put it in the row, replacing (and deleting)
 * the previous take. Reads the row fresh so two verses saved back to back can't
 * overwrite each other's entry. Returns the updated row.
 */
export async function saveVerseRecording(
  id: string, surah: number, ayah: number, blob: Blob, ms: number,
): Promise<RecitationHomework | null> {
  const type = (blob.type || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  const path = `${id}/${surah}-${ayah}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(RECITATION_BUCKET).upload(path, blob, {
    contentType: type, cacheControl: '31536000', upsert: false,
  });
  if (upErr) { console.error('saveVerseRecording upload:', upErr.message); return null; }
  const url = supabase.storage.from(RECITATION_BUCKET).getPublicUrl(path).data.publicUrl;

  const current = await getRecitationHomework(id);
  if (!current) return null;
  const key = `${surah}:${ayah}`;
  const previous = current.recordings[key];
  const recordings = { ...current.recordings, [key]: { path, url, ms, at: new Date().toISOString() } };
  const { data, error } = await supabase.from('quran_recitation_homework')
    .update({ recordings }).eq('id', id).select('*').single();
  if (error) {
    console.error('saveVerseRecording row:', error.message);
    await supabase.storage.from(RECITATION_BUCKET).remove([path]);
    return null;
  }
  if (previous?.path) await supabase.storage.from(RECITATION_BUCKET).remove([previous.path]);
  return fromRow(data as Row);
}

// ── Submit & review ─────────────────────────────────────────────────────────

export async function submitRecitationHomework(rec: RecitationHomework): Promise<RecitationHomework | null> {
  const { data, error } = await supabase.from('quran_recitation_homework')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', rec.id).select('*').single();
  if (error) { console.error('submitRecitationHomework:', error.message); return null; }
  const done = fromRow(data as Row);
  const verses = versesOf(done).length;
  await createNotification({
    teacherId: done.teacherId, studentId: done.studentId, recipient: 'tutor', bookingId: null,
    type: 'quran_recitation_submitted',
    title: 'Recitation homework submitted',
    body: `${done.studentName ?? 'Your student'} recorded ${rangeLabel(done)} (${verses} verse${verses === 1 ? '' : 's'}). Tap to review.`,
    metadata: { recitationId: done.id, homeworkId: done.homeworkId },
  });
  return done;
}

export async function reviewRecitationHomework(
  rec: RecitationHomework, verdict: 'passed' | 'needs_revision',
): Promise<RecitationHomework | null> {
  const { data, error } = await supabase.from('quran_recitation_homework')
    .update({ status: verdict, reviewed_at: new Date().toISOString() })
    .eq('id', rec.id).select('*').single();
  if (error) { console.error('reviewRecitationHomework:', error.message); return null; }
  const done = fromRow(data as Row);
  if (verdict === 'passed') {
    await createNotification({
      teacherId: done.teacherId, studentId: done.studentId, recipient: 'student', bookingId: null,
      type: 'quran_recitation_reviewed',
      title: '✅ Recitation homework passed',
      body: `Well done! Your teacher reviewed ${rangeLabel(done)}. Tap to see any notes.`,
      metadata: {
        recitationId: done.id, homeworkId: done.homeworkId,
        verse: `${done.startSurah}:${done.startAyah}`,
        ...(done.reportId ? { url: portalHomeworkUrl(done.reportId, done.homeworkId) } : {}),
      },
    });
  }
  return done;
}

/**
 * Send back only the verses the tutor logged mistakes in: this homework is
 * closed as 'needs_revision' and a FOLLOW-UP homework is created holding just
 * those verses. Returns the new row, which the caller adds to the student's
 * homework list (so it shows in their portal) before the student is told.
 */
export async function reassignRecitationVerses(input: {
  rec: RecitationHomework;
  wrongVerses: string[];          // "surah:ayah", in order
  newHomeworkId: string;          // the QuranHomework id the caller will create
  note?: string;
}): Promise<RecitationHomework | null> {
  const { rec, wrongVerses } = input;
  if (wrongVerses.length === 0) return null;
  const total = versesOf(rec).length;
  const parsed = wrongVerses.map(k => k.split(':').map(Number) as [number, number]);
  const first = parsed[0], last = parsed[parsed.length - 1];

  const child = await createRecitationHomework({
    homeworkId: input.newHomeworkId, teacherId: rec.teacherId, studentId: rec.studentId,
    studentName: rec.studentName ?? '', reportId: rec.reportId ?? null,
    startSurah: first[0], startAyah: first[1], endSurah: last[0], endAyah: last[1],
    note: input.note ?? 'Record these verses again — your teacher marked mistakes in them.',
    verses: wrongVerses, parentId: rec.id,
  });
  if (!child) return null;

  await supabase.from('quran_recitation_homework').update({
    status: 'needs_revision', reviewed_at: new Date().toISOString(), reassigned_count: wrongVerses.length,
  }).eq('id', rec.id);

  await createNotification({
    teacherId: rec.teacherId, studentId: rec.studentId, recipient: 'student', bookingId: null,
    type: 'quran_recitation_reviewed',
    title: '🔁 Homework reassigned',
    body: `Your teacher checked your homework and reassigned ${wrongVerses.length} of ${total} verse${total === 1 ? '' : 's'}. Tap to see the mistakes, then record them again.`,
    metadata: {
      recitationId: child.id, homeworkId: child.homeworkId,
      verse: wrongVerses[0],
      url: recitationUrl(child.id),
    },
  });
  return child;
}

/** Tell the student a new recitation homework is waiting. */
export async function notifyRecitationAssigned(rec: RecitationHomework): Promise<void> {
  await createNotification({
    teacherId: rec.teacherId, studentId: rec.studentId, recipient: 'student', bookingId: null,
    type: 'quran_recitation_assigned',
    title: '🎙 New recitation homework',
    body: `Record your recitation of ${rangeLabel(rec)}, one verse at a time.`,
    metadata: { recitationId: rec.id, homeworkId: rec.homeworkId, url: recitationUrl(rec.id) },
  });
}

/**
 * Clear a student's recitation history: every homework already reviewed
 * (passed or reassigned), with its recordings. Homework still waiting or
 * submitted is left alone. Returns how many were removed.
 */
export async function clearRecitationHistory(studentId: string): Promise<number> {
  const all = await listRecitationHomework(studentId);
  const old = all.filter(r => r.status === 'passed' || r.status === 'needs_revision');
  for (const rec of old) await deleteRecitationHomework(rec);
  return old.length;
}

// ── Retention ───────────────────────────────────────────────────────────────

/**
 * Delete the recordings of homework reviewed more than KEEP_AFTER_REVIEW_DAYS
 * ago, or assigned more than KEEP_UNSUBMITTED_DAYS ago and never submitted. The
 * row stays (its status and the logged mistakes are the record); only the audio
 * goes. Returns how many homeworks were cleared.
 */
export async function purgeOldRecitations(teacherId: string): Promise<number> {
  const day = 24 * 60 * 60 * 1000;
  const reviewedBefore = new Date(Date.now() - KEEP_AFTER_REVIEW_DAYS * day).toISOString();
  const assignedBefore = new Date(Date.now() - KEEP_UNSUBMITTED_DAYS * day).toISOString();
  const { data, error } = await supabase.from('quran_recitation_homework').select('*')
    .eq('teacher_id', teacherId).is('purged_at', null)
    .or(`reviewed_at.lt.${reviewedBefore},and(status.eq.assigned,created_at.lt.${assignedBefore})`);
  if (error) { console.warn('purgeOldRecitations:', error.message); return 0; }
  let n = 0;
  for (const rec of (data as Row[]).map(fromRow)) {
    const paths = Object.values(rec.recordings).map(r => r.path);
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from(RECITATION_BUCKET).remove(paths);
      if (rmErr) { console.warn('purgeOldRecitations remove:', rmErr.message); continue; }
    }
    await supabase.from('quran_recitation_homework')
      .update({ recordings: {}, purged_at: new Date().toISOString() }).eq('id', rec.id);
    n++;
  }
  return n;
}
