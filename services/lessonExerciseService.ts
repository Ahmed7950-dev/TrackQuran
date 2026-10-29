// services/lessonExerciseService.ts
// -----------------------------------------------------------------------------
// The exercises an admin can put on an Arabic lesson, beside its written
// homework.
//
// The first kind, 'pronoun_pictures': four pictures in a fixed order — He,
// You (M), You (F), She — each swapping to a second picture and saying its
// pronoun when the student points at it. The student reads a question ("who
// ate the cheese?"), works out which of the four did it, and writes that
// pronoun. A round is one question; an exercise is a handful of rounds.
//
// The order of the four is part of the exercise, not a guess: slot 1 is always
// "He" and slot 4 always "She", so what the student must write is known from
// the picture the admin ticked, and the app can mark the answer itself.
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

export type SlotKey = 'he' | 'youM' | 'youF' | 'she';

/** The four, left to right, as they are always shown. */
export const SLOTS: { key: SlotKey; english: string }[] = [
  { key: 'he',   english: 'He' },
  { key: 'youM', english: 'You (M)' },
  { key: 'youF', english: 'You (F)' },
  { key: 'she',  english: 'She' },
];

export interface ExerciseSlot {
  key: SlotKey;
  /** What the student should write, and what the recording says. */
  arabic: string;
  translit: string;
  audioUrl: string | null;
}

export interface RoundPic { url: string | null; hoverUrl: string | null }

export interface ExerciseRound {
  id: string;
  question: string;
  /** Which of the four did it: an index into SLOTS. */
  correct: number;
  pics: RoundPic[];
}

export interface LessonExercise {
  id: string;
  lessonId: string;
  kind: 'pronoun_pictures';
  title: string;
  published: boolean;
  slots: ExerciseSlot[];
  rounds: ExerciseRound[];
  orderIndex: number;
}

export interface ExerciseSubmission {
  id: string;
  exerciseId: string;
  studentId: string;
  answers: Record<string, string>;
  marks: Record<string, { correct: boolean; auto: boolean }>;
  score: number;
  total: number;
  status: 'submitted' | 'returned';
  tutorNote: string | null;
  submittedAt: string;
  returnedAt: string | null;
}

export const emptySlots = (): ExerciseSlot[] =>
  SLOTS.map(s => ({ key: s.key, arabic: '', translit: '', audioUrl: null }));

export const emptyRound = (): ExerciseRound => ({
  id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  question: '',
  correct: 0,
  pics: [0, 1, 2, 3].map(() => ({ url: null, hoverUrl: null })),
});

/* ── Marking ──────────────────────────────────────────────────────────── */

const HARAKAT = /[ً-ْٰـ]/g;

/**
 * Loose enough to be fair, tight enough to mean something: harakat are
 * dropped (a student typing هو should not be marked wrong against هُوَ),
 * the alif forms are levelled, case and spacing go, and the Arabic and the
 * transliteration are both accepted — the admin writes each anyway.
 */
export function normalizeAnswer(s: string): string {
  return (s ?? '')
    .replace(HARAKAT, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function isRightAnswer(typed: string, slot: ExerciseSlot | undefined): boolean {
  if (!slot) return false;
  const want = [slot.arabic, slot.translit].filter(Boolean).map(normalizeAnswer);
  const got = normalizeAnswer(typed);
  return !!got && want.includes(got);
}

/** Mark a whole attempt. The tutor can still change any of it afterwards. */
export function markAttempt(ex: LessonExercise, answers: Record<string, string>) {
  const marks: Record<string, { correct: boolean; auto: boolean }> = {};
  let score = 0;
  for (const round of ex.rounds) {
    const ok = isRightAnswer(answers[round.id] ?? '', ex.slots[round.correct]);
    marks[round.id] = { correct: ok, auto: true };
    if (ok) score++;
  }
  return { marks, score, total: ex.rounds.length };
}

/* ── Reading and writing ──────────────────────────────────────────────── */

/* eslint-disable @typescript-eslint/no-explicit-any */
const toExercise = (r: any): LessonExercise => ({
  id: r.id,
  lessonId: r.lesson_id,
  kind: r.kind,
  title: r.title,
  published: !!r.published,
  slots: Array.isArray(r.slots) && r.slots.length === 4 ? r.slots : emptySlots(),
  rounds: Array.isArray(r.rounds) ? r.rounds : [],
  orderIndex: r.order_index ?? 0,
});

const toSubmission = (r: any): ExerciseSubmission => ({
  id: r.id,
  exerciseId: r.exercise_id,
  studentId: r.student_id,
  answers: r.answers ?? {},
  marks: r.marks ?? {},
  score: r.score ?? 0,
  total: r.total ?? 0,
  status: r.status ?? 'submitted',
  tutorNote: r.tutor_note ?? null,
  submittedAt: r.submitted_at,
  returnedAt: r.returned_at ?? null,
});

/**
 * The exercises on a lesson. `all` is the admin's view — everything, including
 * what is still being built; everyone else sees only what has been published.
 */
export async function listLessonExercises(lessonId: string, all = false): Promise<LessonExercise[]> {
  let q = supabase.from('lesson_exercises').select('*').eq('lesson_id', lessonId);
  if (!all) q = q.eq('published', true);
  const { data, error } = await q.order('order_index', { ascending: true });
  if (error) { console.error('listLessonExercises:', error.message); return []; }
  return (data ?? []).map(toExercise);
}

export async function createLessonExercise(lessonId: string, title: string): Promise<LessonExercise | null> {
  const { data, error } = await supabase.from('lesson_exercises')
    .insert({ lesson_id: lessonId, title, slots: emptySlots(), rounds: [emptyRound()] })
    .select('*').single();
  if (error) { console.error('createLessonExercise:', error.message); return null; }
  return toExercise(data);
}

export async function saveLessonExercise(
  id: string, patch: Partial<Pick<LessonExercise, 'title' | 'published' | 'slots' | 'rounds' | 'orderIndex'>>,
): Promise<boolean> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.published !== undefined) row.published = patch.published;
  if (patch.slots !== undefined) row.slots = patch.slots;
  if (patch.rounds !== undefined) row.rounds = patch.rounds;
  if (patch.orderIndex !== undefined) row.order_index = patch.orderIndex;
  const { error } = await supabase.from('lesson_exercises').update(row).eq('id', id);
  if (error) { console.error('saveLessonExercise:', error.message); return false; }
  return true;
}

export async function deleteLessonExercise(id: string): Promise<boolean> {
  const { error } = await supabase.from('lesson_exercises').delete().eq('id', id);
  if (error) { console.error('deleteLessonExercise:', error.message); return false; }
  return true;
}

/** Every attempt at one exercise by one student, newest first. */
export async function listSubmissions(exerciseId: string, studentId: string): Promise<ExerciseSubmission[]> {
  const { data, error } = await supabase.from('lesson_exercise_submissions')
    .select('*').eq('exercise_id', exerciseId).eq('student_id', studentId)
    .order('submitted_at', { ascending: false });
  if (error) { console.error('listSubmissions:', error.message); return []; }
  return (data ?? []).map(toSubmission);
}

/** The latest attempt by each student — what a tutor opens the exercise to see. */
export async function listExerciseInbox(exerciseId: string): Promise<ExerciseSubmission[]> {
  const { data, error } = await supabase.from('lesson_exercise_submissions')
    .select('*').eq('exercise_id', exerciseId).order('submitted_at', { ascending: false });
  if (error) { console.error('listExerciseInbox:', error.message); return []; }
  const seen = new Set<string>();
  return (data ?? []).map(toSubmission).filter(s => {
    if (seen.has(s.studentId)) return false;
    seen.add(s.studentId); return true;
  });
}

/**
 * The latest attempt at each of several exercises, for one student — what the
 * cards in the Homework tab show, in a single query rather than one per card.
 */
export async function latestByExercise(
  exerciseIds: string[], studentId: string,
): Promise<Map<string, ExerciseSubmission>> {
  const out = new Map<string, ExerciseSubmission>();
  if (!exerciseIds.length || !studentId) return out;
  const { data, error } = await supabase.from('lesson_exercise_submissions')
    .select('*').in('exercise_id', exerciseIds).eq('student_id', studentId)
    .order('submitted_at', { ascending: false });
  if (error) { console.error('latestByExercise:', error.message); return out; }
  for (const row of data ?? []) {
    const s = toSubmission(row);
    if (!out.has(s.exerciseId)) out.set(s.exerciseId, s);
  }
  return out;
}

/** Hand it in. Marked on the way, so the student sees a score at once. */
export async function submitAttempt(
  ex: LessonExercise, studentId: string, answers: Record<string, string>,
): Promise<ExerciseSubmission | null> {
  const { marks, score, total } = markAttempt(ex, answers);
  const { data, error } = await supabase.from('lesson_exercise_submissions')
    .insert({ exercise_id: ex.id, student_id: studentId, answers, marks, score, total })
    .select('*').single();
  if (error) { console.error('submitAttempt:', error.message); return null; }
  return toSubmission(data);
}

/** The tutor's word on it — any round can be flipped, and the score follows. */
export async function returnAttempt(
  id: string, marks: Record<string, { correct: boolean; auto: boolean }>, tutorNote: string,
): Promise<boolean> {
  const score = Object.values(marks).filter(m => m.correct).length;
  const { error } = await supabase.from('lesson_exercise_submissions')
    .update({ marks, score, tutor_note: tutorNote || null, status: 'returned', returned_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('returnAttempt:', error.message); return false; }
  return true;
}

/* ── Files ────────────────────────────────────────────────────────────── */

const BUCKET = 'tajweed-assets';

/**
 * Pictures are shrunk before they go up. A phone photo is three or four
 * megabytes and this exercise wants eight of them per round; storage on this
 * project has been full once already. 1200px on the long side is more than a
 * picture shown at a few hundred is ever asked for.
 */
export async function uploadExerciseImage(file: File, exerciseId: string): Promise<string | null> {
  const blob = await shrink(file, 1200, 0.82).catch(() => file as Blob);
  const path = `lesson-exercises/${exerciseId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
  if (error) { console.error('uploadExerciseImage:', error.message); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function uploadExerciseAudio(blob: Blob, exerciseId: string, slot: SlotKey): Promise<string | null> {
  const path = `lesson-exercises/${exerciseId}/voice-${slot}-${Date.now()}.webm`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'audio/webm' });
  if (error) { console.error('uploadExerciseAudio:', error.message); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Draw it smaller on a canvas and take the JPEG back out. */
function shrink(file: File, max: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('no blob'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}
