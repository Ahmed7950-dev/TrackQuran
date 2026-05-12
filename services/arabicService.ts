// services/arabicService.ts
// ---------------------------------------------------------------------------
// Data layer for the Arabic-language-teaching feature.
//
// arabic_students  → Supabase table `arabic_students`  (per teacher)
// arabic_lessons   → Supabase table `arabic_lessons`   (shared, admin-managed)
// PDF files        → Supabase Storage bucket `tajweed-assets` / arabic-pdfs/
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { ArabicStudent, ArabicLesson, ArabicDialect, WeeklySlot } from '../types';

const PDF_BUCKET = 'tajweed-assets';
const PDF_PREFIX = 'arabic-pdfs';

// ── DB row types ─────────────────────────────────────────────────────────────

interface ArabicStudentRow {
  id: string;
  teacher_id: string;
  name: string;
  dob: string | null;
  for_self: boolean;
  for_whom: string | null;
  arabic_dialects: ArabicDialect[];
  whatsapp: string | null;
  arabic_level: string;
  learning_purposes: string[];
  topics_to_focus: string[];
  nationality: string | null;
  timezone: string;
  availability: WeeklySlot[];
  goal_deadline: string | null;
  completed_lesson_ids: string[];
  created_at: string;
}

interface ArabicLessonRow {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Converters ───────────────────────────────────────────────────────────────

function rowToStudent(r: ArabicStudentRow): ArabicStudent {
  return {
    id:                  r.id,
    teacherId:           r.teacher_id,
    name:                r.name,
    dob:                 r.dob        ?? undefined,
    forSelf:             r.for_self,
    forWhom:             r.for_whom   ?? undefined,
    arabicDialects:      r.arabic_dialects,
    whatsapp:            r.whatsapp   ?? undefined,
    arabicLevel:         r.arabic_level,
    learningPurposes:    r.learning_purposes,
    topicsToFocus:       r.topics_to_focus,
    nationality:         r.nationality ?? undefined,
    timezone:            r.timezone,
    availability:        r.availability,
    goalDeadline:        r.goal_deadline ?? undefined,
    completedLessonIds:  r.completed_lesson_ids,
    createdAt:           r.created_at,
  };
}

function studentToRow(s: ArabicStudent): ArabicStudentRow {
  return {
    id:                  s.id,
    teacher_id:          s.teacherId,
    name:                s.name,
    dob:                 s.dob         ?? null,
    for_self:            s.forSelf,
    for_whom:            s.forWhom     ?? null,
    arabic_dialects:     s.arabicDialects,
    whatsapp:            s.whatsapp    ?? null,
    arabic_level:        s.arabicLevel,
    learning_purposes:   s.learningPurposes,
    topics_to_focus:     s.topicsToFocus,
    nationality:         s.nationality ?? null,
    timezone:            s.timezone,
    availability:        s.availability,
    goal_deadline:       s.goalDeadline ?? null,
    completed_lesson_ids: s.completedLessonIds,
    created_at:          s.createdAt,
  };
}

function rowToLesson(r: ArabicLessonRow): ArabicLesson {
  return {
    id:          r.id,
    title:       r.title,
    description: r.description ?? undefined,
    orderIndex:  r.order_index,
    pdfUrl:      r.pdf_url     ?? undefined,
    createdBy:   r.created_by  ?? undefined,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

// ── Arabic students ──────────────────────────────────────────────────────────

export async function getArabicStudents(teacherId: string): Promise<ArabicStudent[]> {
  const { data, error } = await supabase
    .from('arabic_students')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getArabicStudents:', error.message); return []; }
  return (data ?? []).map(rowToStudent);
}

export async function saveArabicStudent(teacherId: string, student: ArabicStudent): Promise<void> {
  const { error } = await supabase
    .from('arabic_students')
    .upsert(studentToRow(student), { onConflict: 'id' });
  if (error) console.error('saveArabicStudent:', error.message);
}

export async function deleteArabicStudent(teacherId: string, studentId: string): Promise<void> {
  const { error } = await supabase
    .from('arabic_students')
    .delete()
    .eq('id', studentId)
    .eq('teacher_id', teacherId);
  if (error) console.error('deleteArabicStudent:', error.message);
}

// ── Arabic lessons ───────────────────────────────────────────────────────────

export async function getArabicLessons(): Promise<ArabicLesson[]> {
  const { data, error } = await supabase
    .from('arabic_lessons')
    .select('*')
    .order('order_index', { ascending: true });
  if (error) { console.error('getArabicLessons:', error.message); return []; }
  return (data ?? []).map(rowToLesson);
}

export async function createArabicLesson(input: {
  title: string;
  description?: string;
  pdfUrl?: string;
  createdBy?: string;
}): Promise<ArabicLesson | null> {
  // Get current max order_index
  const { data: existing } = await supabase
    .from('arabic_lessons')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1);
  const maxOrder = (existing?.[0] as any)?.order_index ?? 0;

  const row: ArabicLessonRow = {
    id:          `al-${Date.now()}`,
    title:       input.title,
    description: input.description ?? null,
    order_index: maxOrder + 1,
    pdf_url:     input.pdfUrl    ?? null,
    created_by:  input.createdBy ?? null,
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('arabic_lessons')
    .insert(row)
    .select()
    .single();
  if (error) { console.error('createArabicLesson:', error.message); return null; }
  return rowToLesson(data as ArabicLessonRow);
}

export async function updateArabicLesson(
  id: string,
  patch: Partial<Pick<ArabicLesson, 'title' | 'description' | 'pdfUrl' | 'orderIndex'>>,
): Promise<boolean> {
  const update: Partial<ArabicLessonRow> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title       !== undefined) update.title       = patch.title;
  if (patch.description !== undefined) update.description = patch.description ?? null;
  if (patch.pdfUrl      !== undefined) update.pdf_url     = patch.pdfUrl ?? null;
  if (patch.orderIndex  !== undefined) update.order_index = patch.orderIndex;

  const { error } = await supabase
    .from('arabic_lessons')
    .update(update)
    .eq('id', id);
  if (error) { console.error('updateArabicLesson:', error.message); return false; }
  return true;
}

export async function deleteArabicLesson(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('arabic_lessons')
    .delete()
    .eq('id', id);
  if (error) { console.error('deleteArabicLesson:', error.message); return false; }
  return true;
}

export async function reorderArabicLessons(ordered: ArabicLesson[]): Promise<void> {
  await Promise.all(
    ordered.map((l, i) =>
      supabase
        .from('arabic_lessons')
        .update({ order_index: i + 1, updated_at: new Date().toISOString() })
        .eq('id', l.id)
    )
  );
}

// ── PDF upload (Supabase Storage) ────────────────────────────────────────────

export async function uploadArabicLessonPdf(file: File): Promise<string | null> {
  const slug = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').slice(0, 80);
  const path = `${PDF_PREFIX}/${Date.now()}-${slug}`;
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: 'application/pdf',
  });
  if (error) { console.error('uploadArabicLessonPdf:', error.message); return null; }
  return supabase.storage.from(PDF_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Lesson completion ────────────────────────────────────────────────────────

export async function setArabicLessonCompletion(
  teacherId: string,
  studentId: string,
  lessonId: string,
  done: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from('arabic_students')
    .select('completed_lesson_ids')
    .eq('id', studentId)
    .eq('teacher_id', teacherId)
    .single();
  if (error || !data) { console.error('setArabicLessonCompletion fetch:', error?.message); return; }

  const ids = new Set<string>((data as any).completed_lesson_ids ?? []);
  if (done) ids.add(lessonId); else ids.delete(lessonId);

  const { error: updateError } = await supabase
    .from('arabic_students')
    .update({ completed_lesson_ids: [...ids] })
    .eq('id', studentId)
    .eq('teacher_id', teacherId);
  if (updateError) console.error('setArabicLessonCompletion update:', updateError.message);
}
