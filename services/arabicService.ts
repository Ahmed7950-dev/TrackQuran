// services/arabicService.ts
// ---------------------------------------------------------------------------
// Data layer for the Arabic-language-teaching feature.
//
// Arabic students  → localStorage, keyed per teacher
//   `arabic_students_{teacherId}` → ArabicStudent[]
//
// Arabic lessons   → localStorage (shared, admin-managed)
//   `arabic_lessons` → ArabicLesson[]
//   PDF files       → Supabase Storage bucket `tajweed-assets` / arabic-pdfs/
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { ArabicStudent, ArabicLesson } from '../types';

// ── keys ────────────────────────────────────────────────────────────────────

const studentsKey = (tid: string) => `arabic_students_${tid}`;
const LESSONS_KEY = 'arabic_lessons';
const PDF_BUCKET  = 'tajweed-assets';          // reuse existing bucket
const PDF_PREFIX  = 'arabic-pdfs';

// ── Arabic students ──────────────────────────────────────────────────────────

export function getArabicStudents(teacherId: string): ArabicStudent[] {
  try {
    const raw = localStorage.getItem(studentsKey(teacherId));
    return raw ? (JSON.parse(raw) as ArabicStudent[]) : [];
  } catch {
    return [];
  }
}

export function saveArabicStudent(teacherId: string, student: ArabicStudent): void {
  const all = getArabicStudents(teacherId);
  const idx = all.findIndex(s => s.id === student.id);
  if (idx >= 0) all[idx] = student; else all.push(student);
  localStorage.setItem(studentsKey(teacherId), JSON.stringify(all));
}

export function deleteArabicStudent(teacherId: string, studentId: string): void {
  const all = getArabicStudents(teacherId).filter(s => s.id !== studentId);
  localStorage.setItem(studentsKey(teacherId), JSON.stringify(all));
}

// ── Arabic lessons ───────────────────────────────────────────────────────────

export function getArabicLessons(): ArabicLesson[] {
  try {
    const raw = localStorage.getItem(LESSONS_KEY);
    return raw ? (JSON.parse(raw) as ArabicLesson[]) : [];
  } catch {
    return [];
  }
}

function persistLessons(lessons: ArabicLesson[]): void {
  localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons));
}

export function createArabicLesson(input: {
  title: string;
  description?: string;
  pdfUrl?: string;
  createdBy?: string;
}): ArabicLesson {
  const all = getArabicLessons();
  const maxOrder = all.reduce((m, l) => Math.max(m, l.orderIndex), 0);
  const lesson: ArabicLesson = {
    id:          `al-${Date.now()}`,
    title:       input.title,
    description: input.description,
    orderIndex:  maxOrder + 1,
    pdfUrl:      input.pdfUrl,
    createdBy:   input.createdBy,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };
  persistLessons([...all, lesson]);
  return lesson;
}

export function updateArabicLesson(
  id: string,
  patch: Partial<Pick<ArabicLesson, 'title' | 'description' | 'pdfUrl' | 'orderIndex'>>,
): boolean {
  const all = getArabicLessons();
  const idx = all.findIndex(l => l.id === id);
  if (idx < 0) return false;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
  persistLessons(all);
  return true;
}

export function deleteArabicLesson(id: string): boolean {
  const all = getArabicLessons();
  const filtered = all.filter(l => l.id !== id);
  if (filtered.length === all.length) return false;
  persistLessons(filtered);
  return true;
}

export function reorderArabicLessons(ordered: ArabicLesson[]): void {
  const updated = ordered.map((l, i) => ({ ...l, orderIndex: i + 1, updatedAt: new Date().toISOString() }));
  persistLessons(updated);
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

// ── Lesson completion helpers ────────────────────────────────────────────────

/** Mark or unmark a lesson as completed for a student; persists to localStorage. */
export function setArabicLessonCompletion(
  teacherId: string,
  studentId: string,
  lessonId: string,
  done: boolean,
): void {
  const all = getArabicStudents(teacherId);
  const student = all.find(s => s.id === studentId);
  if (!student) return;

  const ids = new Set(student.completedLessonIds);
  if (done) ids.add(lessonId); else ids.delete(lessonId);
  student.completedLessonIds = [...ids];
  saveArabicStudent(teacherId, student);
}
