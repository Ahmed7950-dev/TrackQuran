// services/pdfLessonProgressService.ts
// ---------------------------------------------------------------------------
// Where a Tajweed or Qaedah PDF lesson was left off.
//
// The Arabic lessons have had this for a while: the tutor marks the slide they
// stopped on, and opening the lesson again picks up there instead of at page
// one. This is the same thing for the other two courses.
//
// It gets its OWN table rather than riding arabic_lesson_progress, which was
// the obvious thought and is impossible: that one has foreign keys to both
// arabic_lessons and arabic_students, and these rows name a tajweed_lessons or
// qaedah_topics row and a Quran-side student. Every insert would be rejected.
// Migration: 20261007_pdf_lesson_progress.sql
//
// The CALENDAR is not fed from here. Marking progress on the Quran side writes
// an ActivityLog onto the student, which lands in `student.attendance` — the
// one array the calendar, the attendance stats and the student's own portal
// link all already read. See utils/activityLog.ts.
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

export type PdfLessonKind = 'tajweed' | 'qaedah';

export interface PdfLessonProgress {
  lessonId: string;
  status: 'in_progress' | 'done';
  lastSlide: number;
  totalSlides?: number;
  revisionCount: number;
  updatedAt: string;
}

const TABLE = 'pdf_lesson_progress';

interface Row {
  lesson_id: string;
  status: string;
  last_slide: number | null;
  total_slides: number | null;
  revision_count: number | null;
  updated_at: string;
}

const fromRow = (r: Row): PdfLessonProgress => ({
  lessonId: r.lesson_id,
  status: r.status === 'done' ? 'done' : 'in_progress',
  lastSlide: r.last_slide ?? 1,
  totalSlides: r.total_slides ?? undefined,
  revisionCount: r.revision_count ?? 0,
  updatedAt: r.updated_at,
});

/** Every lesson of one course this student has started, keyed by lesson id. */
export async function getPdfLessonProgress(
  studentId: string, kind: PdfLessonKind,
): Promise<Map<string, PdfLessonProgress>> {
  if (!studentId) return new Map();
  const { data, error } = await supabase
    .from(TABLE).select('*')
    .eq('student_id', studentId).eq('kind', kind);
  if (error) { console.error('getPdfLessonProgress:', error.message); return new Map(); }
  return new Map((data ?? []).map(r => [(r as Row).lesson_id, fromRow(r as Row)]));
}

/** Stopped part way: remember the slide. */
export async function markPdfLessonProgress(
  studentId: string, lessonId: string, kind: PdfLessonKind,
  slide: number, totalSlides?: number,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({
    student_id: studentId, lesson_id: lessonId, kind,
    status: 'in_progress', last_slide: slide, total_slides: totalSlides ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,lesson_id' });
  if (error) throw new Error(error.message);
}

/** Reached the end. */
export async function markPdfLessonDone(
  studentId: string, lessonId: string, kind: PdfLessonKind, totalSlides?: number,
): Promise<void> {
  const { error } = await supabase.from(TABLE).upsert({
    student_id: studentId, lesson_id: lessonId, kind,
    status: 'done', last_slide: totalSlides ?? 1, total_slides: totalSlides ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,lesson_id' });
  if (error) throw new Error(error.message);
}

/** Been through a finished lesson again. */
export async function logPdfLessonRevision(
  studentId: string, lessonId: string, kind: PdfLessonKind,
): Promise<void> {
  const { data } = await supabase.from(TABLE)
    .select('revision_count')
    .eq('student_id', studentId).eq('lesson_id', lessonId).maybeSingle();
  const next = ((data as { revision_count?: number } | null)?.revision_count ?? 0) + 1;
  const { error } = await supabase.from(TABLE).upsert({
    student_id: studentId, lesson_id: lessonId, kind,
    status: 'done', revision_count: next, updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,lesson_id' });
  if (error) throw new Error(error.message);
}

/** 0–1, for the bar on a lesson in the list. A lesson marked done is full even
 *  when no slide count was ever recorded for it. */
export const progressFraction = (p?: PdfLessonProgress): number => {
  if (!p) return 0;
  if (p.status === 'done') return 1;
  if (!p.totalSlides || p.totalSlides < 1) return 0;
  return Math.max(0, Math.min(1, p.lastSlide / p.totalSlides));
};
