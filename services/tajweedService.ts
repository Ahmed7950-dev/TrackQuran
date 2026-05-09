// services/tajweedService.ts
// -----------------------------------------------------------------------------
// All client-side data access for the Tajweed lessons feature.
//
// • Lessons live in `tajweed_lessons` (admins write, all teachers read)
// • Completions in `tajweed_lesson_completions` (one row per student/lesson)
// • Uploaded PDFs live in the public `tajweed-assets` bucket
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { TajweedLesson, TajweedCompletion } from '../types';

const BUCKET = 'tajweed-assets';

// ── Lessons CRUD ────────────────────────────────────────────────────────────

export async function listLessons(): Promise<TajweedLesson[]> {
  const { data, error } = await supabase
    .from('tajweed_lessons')
    .select('*')
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.error('listLessons:', error.message); return []; }
  return (data ?? []).map(rowToLesson);
}

export async function createLesson(input: {
  title: string;
  description?: string;
  pdfUrl?: string;
}): Promise<TajweedLesson | null> {
  const { data: maxRow } = await supabase
    .from('tajweed_lessons').select('order_index')
    .order('order_index', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = ((maxRow?.order_index as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from('tajweed_lessons')
    .insert({
      title:       input.title,
      description: input.description ?? null,
      pdf_url:     input.pdfUrl ?? null,
      order_index: nextOrder,
      slides:      [],
    })
    .select()
    .single();
  if (error) { console.error('createLesson:', error.message); return null; }
  return rowToLesson(data);
}

export async function updateLesson(
  id: string,
  patch: Partial<{ title: string; description: string; pdfUrl: string; orderIndex: number }>,
): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (patch.title       !== undefined) update.title       = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.pdfUrl      !== undefined) update.pdf_url     = patch.pdfUrl;
  if (patch.orderIndex  !== undefined) update.order_index = patch.orderIndex;

  const { error } = await supabase.from('tajweed_lessons').update(update).eq('id', id);
  if (error) { console.error('updateLesson:', error.message); return false; }
  return true;
}

export async function deleteLesson(id: string): Promise<boolean> {
  const { error } = await supabase.from('tajweed_lessons').delete().eq('id', id);
  if (error) { console.error('deleteLesson:', error.message); return false; }
  return true;
}

// ── Storage: PDF upload ──────────────────────────────────────────────────────

export async function uploadLessonPdf(file: File): Promise<string | null> {
  const path = `pdfs/${Date.now()}-${slug(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: 'application/pdf',
  });
  if (error) { console.error('uploadLessonPdf:', error.message); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Completions ─────────────────────────────────────────────────────────────

export async function markLessonCompleted(
  studentId: string, lessonId: string, tutorId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('tajweed_lesson_completions')
    .upsert({ student_id: studentId, lesson_id: lessonId, tutor_id: tutorId }, {
      onConflict: 'student_id,lesson_id',
    });
  if (error) { console.error('markLessonCompleted:', error.message); return false; }
  return true;
}

export async function unmarkLessonCompleted(
  studentId: string, lessonId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('tajweed_lesson_completions').delete()
    .eq('student_id', studentId).eq('lesson_id', lessonId);
  if (error) { console.error('unmarkLessonCompleted:', error.message); return false; }
  return true;
}

export async function getStudentCompletions(studentId: string): Promise<TajweedCompletion[]> {
  const { data, error } = await supabase.rpc('get_student_tajweed_completions', {
    p_student_id: studentId,
  });
  if (error) { console.error('getStudentCompletions:', error.message); return []; }
  return (data ?? []).map((r: { lesson_id: string; lesson_title: string; completed_at: string }) => ({
    lessonId:    r.lesson_id,
    lessonTitle: r.lesson_title,
    completedAt: r.completed_at,
  }));
}

export async function getCompletedLessonIds(studentId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tajweed_lesson_completions').select('lesson_id').eq('student_id', studentId);
  if (error) { console.error('getCompletedLessonIds:', error.message); return new Set(); }
  return new Set((data ?? []).map(r => r.lesson_id as string));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToLesson(row: Record<string, unknown>): TajweedLesson {
  return {
    id:          row.id as string,
    title:       row.title as string,
    description: (row.description as string | null) ?? undefined,
    orderIndex:  row.order_index as number,
    pdfUrl:      (row.pdf_url as string | null) ?? undefined,
    createdBy:   (row.created_by as string | null) ?? undefined,
    createdAt:   row.created_at as string,
    updatedAt:   row.updated_at as string,
  };
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').slice(0, 80);
}
