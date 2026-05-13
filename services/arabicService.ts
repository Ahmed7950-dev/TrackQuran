// services/arabicService.ts
// ---------------------------------------------------------------------------
// Data layer for the Arabic-language-teaching feature.
//
// arabic_students  → Supabase table `arabic_students`  (per teacher)
// arabic_lessons   → Supabase table `arabic_lessons`   (shared, admin-managed)
// PDF files        → Supabase Storage bucket `tajweed-assets` / arabic-pdfs/
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import {
  ArabicStudent, ArabicLesson, ArabicDialect, WeeklySlot,
  HomeworkQuestion, HomeworkQuestionType,
  VocabWord, VocabMode, VocabAttempt, VocabMistakeDetail,
} from '../types';

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
  video_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface HomeworkRow {
  id: string;
  lesson_id: string;
  question_type: string;
  question: string;
  options: string[] | null;
  correct_answer: string;
  order_index: number;
  created_at: string;
}

interface VocabWordRow {
  id: string;
  lesson_id: string;
  arabic: string;
  transliteration: string;
  english: string;
  order_index: number;
  created_at: string;
}

interface VocabAttemptRow {
  id: string;
  student_id: string;
  word_id: string;
  lesson_id: string;
  attempt_number: number;
  mode: string;
  scheduled_at: string;
  completed_at: string | null;
  created_at: string;
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
    videoUrl:    r.video_url   ?? undefined,
    createdBy:   r.created_by  ?? undefined,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

function rowToHomework(r: HomeworkRow): HomeworkQuestion {
  return {
    id:            r.id,
    lessonId:      r.lesson_id,
    type:          r.question_type as HomeworkQuestionType,
    question:      r.question,
    options:       r.options ?? undefined,
    correctAnswer: r.correct_answer,
    orderIndex:    r.order_index,
    createdAt:     r.created_at,
  };
}

function rowToVocabWord(r: VocabWordRow): VocabWord {
  return {
    id:              r.id,
    lessonId:        r.lesson_id,
    arabic:          r.arabic,
    transliteration: r.transliteration,
    english:         r.english,
    orderIndex:      r.order_index,
    createdAt:       r.created_at,
  };
}

function rowToVocabAttempt(r: VocabAttemptRow): VocabAttempt {
  return {
    id:            r.id,
    studentId:     r.student_id,
    wordId:        r.word_id,
    lessonId:      r.lesson_id,
    attemptNumber: r.attempt_number,
    mode:          r.mode as VocabMode,
    scheduledAt:   r.scheduled_at,
    completedAt:   r.completed_at ?? undefined,
    createdAt:     r.created_at,
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
    video_url:   null,
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
  patch: Partial<Pick<ArabicLesson, 'title' | 'description' | 'pdfUrl' | 'orderIndex' | 'videoUrl'>>,
): Promise<boolean> {
  const update: Partial<ArabicLessonRow> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title       !== undefined) update.title       = patch.title;
  if (patch.description !== undefined) update.description = patch.description ?? null;
  if (patch.pdfUrl      !== undefined) update.pdf_url     = patch.pdfUrl ?? null;
  if (patch.orderIndex  !== undefined) update.order_index = patch.orderIndex;
  if (patch.videoUrl    !== undefined) update.video_url   = patch.videoUrl ?? null;

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

// ── Homework questions ───────────────────────────────────────────────────────

export async function getHomeworkQuestions(lessonId: string): Promise<HomeworkQuestion[]> {
  const { data, error } = await supabase
    .from('arabic_lesson_homework')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true });
  if (error) { console.error('getHomeworkQuestions:', error.message); return []; }
  return (data ?? []).map(rowToHomework);
}

export async function createHomeworkQuestion(input: {
  lessonId: string;
  type: HomeworkQuestionType;
  question: string;
  options?: string[];
  correctAnswer: string;
}): Promise<HomeworkQuestion | null> {
  const { data: existing } = await supabase
    .from('arabic_lesson_homework')
    .select('order_index')
    .eq('lesson_id', input.lessonId)
    .order('order_index', { ascending: false })
    .limit(1);
  const maxOrder = (existing?.[0] as any)?.order_index ?? 0;

  const row: HomeworkRow = {
    id:            `hw-${Date.now()}`,
    lesson_id:     input.lessonId,
    question_type: input.type,
    question:      input.question,
    options:       input.options ?? null,
    correct_answer: input.correctAnswer,
    order_index:   maxOrder + 1,
    created_at:    new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('arabic_lesson_homework')
    .insert(row).select().single();
  if (error) { console.error('createHomeworkQuestion:', error.message); return null; }
  return rowToHomework(data as HomeworkRow);
}

export async function updateHomeworkQuestion(
  id: string,
  patch: Partial<Pick<HomeworkQuestion, 'question' | 'options' | 'correctAnswer'>>,
): Promise<boolean> {
  const update: any = {};
  if (patch.question      !== undefined) update.question       = patch.question;
  if (patch.options       !== undefined) update.options        = patch.options ?? null;
  if (patch.correctAnswer !== undefined) update.correct_answer = patch.correctAnswer;
  const { error } = await supabase.from('arabic_lesson_homework').update(update).eq('id', id);
  if (error) { console.error('updateHomeworkQuestion:', error.message); return false; }
  return true;
}

export async function deleteHomeworkQuestion(id: string): Promise<boolean> {
  const { error } = await supabase.from('arabic_lesson_homework').delete().eq('id', id);
  if (error) { console.error('deleteHomeworkQuestion:', error.message); return false; }
  return true;
}

// ── Vocabulary words ─────────────────────────────────────────────────────────

export async function getVocabWords(lessonId: string): Promise<VocabWord[]> {
  const { data, error } = await supabase
    .from('arabic_lesson_vocabulary')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('order_index', { ascending: true });
  if (error) { console.error('getVocabWords:', error.message); return []; }
  return (data ?? []).map(rowToVocabWord);
}

export async function createVocabWord(input: {
  lessonId: string;
  arabic: string;
  transliteration: string;
  english: string;
}): Promise<VocabWord | null> {
  const { data: existing } = await supabase
    .from('arabic_lesson_vocabulary')
    .select('order_index')
    .eq('lesson_id', input.lessonId)
    .order('order_index', { ascending: false })
    .limit(1);
  const maxOrder = (existing?.[0] as any)?.order_index ?? 0;

  const row: VocabWordRow = {
    id:              `vw-${Date.now()}`,
    lesson_id:       input.lessonId,
    arabic:          input.arabic,
    transliteration: input.transliteration,
    english:         input.english,
    order_index:     maxOrder + 1,
    created_at:      new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('arabic_lesson_vocabulary')
    .insert(row).select().single();
  if (error) { console.error('createVocabWord:', error.message); return null; }
  return rowToVocabWord(data as VocabWordRow);
}

export async function updateVocabWord(
  id: string,
  patch: Partial<Pick<VocabWord, 'arabic' | 'transliteration' | 'english'>>,
): Promise<boolean> {
  const { error } = await supabase.from('arabic_lesson_vocabulary').update(patch).eq('id', id);
  if (error) { console.error('updateVocabWord:', error.message); return false; }
  return true;
}

export async function deleteVocabWord(id: string): Promise<boolean> {
  const { error } = await supabase.from('arabic_lesson_vocabulary').delete().eq('id', id);
  if (error) { console.error('deleteVocabWord:', error.message); return false; }
  return true;
}

// ── Vocab spaced-rep attempts ────────────────────────────────────────────────

export async function getVocabAttempts(studentId: string, lessonId: string): Promise<VocabAttempt[]> {
  const { data, error } = await supabase
    .from('arabic_vocab_attempts')
    .select('*')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .order('attempt_number', { ascending: true });
  if (error) { console.error('getVocabAttempts:', error.message); return []; }
  return (data ?? []).map(rowToVocabAttempt);
}

export async function saveVocabAttempts(attempts: VocabAttempt[]): Promise<void> {
  if (!attempts.length) return;
  const rows: VocabAttemptRow[] = attempts.map(a => ({
    id:             a.id,
    student_id:     a.studentId,
    word_id:        a.wordId,
    lesson_id:      a.lessonId,
    attempt_number: a.attemptNumber,
    mode:           a.mode,
    scheduled_at:   a.scheduledAt,
    completed_at:   a.completedAt ?? null,
    created_at:     a.createdAt,
  }));
  const { error } = await supabase
    .from('arabic_vocab_attempts')
    .upsert(rows, { onConflict: 'id' });
  if (error) console.error('saveVocabAttempts:', error.message);
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

// ── All vocab attempts for a student (cross-lesson) ──────────────────────────

export async function getAllVocabAttemptsForStudent(studentId: string): Promise<VocabAttempt[]> {
  const { data, error } = await supabase
    .from('arabic_vocab_attempts')
    .select('*')
    .eq('student_id', studentId);
  if (error) { console.error('getAllVocabAttemptsForStudent:', error.message); return []; }
  return (data ?? []).map(rowToVocabAttempt);
}

// ── Vocab word counts per lesson (lightweight) ────────────────────────────────

export async function getVocabWordCountsByLesson(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('arabic_lesson_vocabulary')
    .select('id, lesson_id');
  if (error) { console.error('getVocabWordCountsByLesson:', error.message); return {}; }
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    counts[r.lesson_id] = (counts[r.lesson_id] ?? 0) + 1;
  });
  return counts;
}

// ── Vocab mistakes ────────────────────────────────────────────────────────────

export async function getVocabMistakesForStudent(studentId: string): Promise<VocabMistakeDetail[]> {
  const { data, error } = await supabase
    .from('arabic_vocab_mistakes')
    .select('*, word:arabic_lesson_vocabulary(arabic, transliteration, english)')
    .eq('student_id', studentId)
    .order('last_missed_at', { ascending: false });
  if (error) { console.error('getVocabMistakesForStudent:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id:              r.id,
    studentId:       r.student_id,
    wordId:          r.word_id,
    lessonId:        r.lesson_id,
    missCount:       r.miss_count,
    lastMissedAt:    r.last_missed_at,
    createdAt:       r.created_at,
    arabic:          r.word?.arabic          ?? '',
    transliteration: r.word?.transliteration ?? '',
    english:         r.word?.english         ?? '',
  }));
}

export async function saveVocabMistakes(
  studentId: string,
  words: Array<{ wordId: string; lessonId: string }>,
): Promise<void> {
  if (!words.length) return;
  const now = new Date().toISOString();
  await Promise.all(words.map(async ({ wordId, lessonId }) => {
    const { data: existing } = await supabase
      .from('arabic_vocab_mistakes')
      .select('id, miss_count')
      .eq('student_id', studentId)
      .eq('word_id', wordId)
      .maybeSingle();
    if (existing) {
      await supabase
        .from('arabic_vocab_mistakes')
        .update({ miss_count: (existing as any).miss_count + 1, last_missed_at: now })
        .eq('id', (existing as any).id);
    } else {
      await supabase
        .from('arabic_vocab_mistakes')
        .insert({
          id:             `vm-${Date.now()}-${wordId}`,
          student_id:     studentId,
          word_id:        wordId,
          lesson_id:      lessonId,
          miss_count:     1,
          last_missed_at: now,
          created_at:     now,
        });
    }
  }));
}

export async function removeVocabMistakes(studentId: string, wordIds: string[]): Promise<void> {
  if (!wordIds.length) return;
  const { error } = await supabase
    .from('arabic_vocab_mistakes')
    .delete()
    .eq('student_id', studentId)
    .in('word_id', wordIds);
  if (error) console.error('removeVocabMistakes:', error.message);
}

// ── Homework completions ──────────────────────────────────────────────────────
// Table: arabic_homework_completions(id, student_id, lesson_id, completed_at)

export async function getHomeworkCompletionsForStudent(studentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('arabic_homework_completions')
    .select('lesson_id')
    .eq('student_id', studentId);
  if (error) { console.error('getHomeworkCompletionsForStudent:', error.message); return []; }
  return (data ?? []).map((r: any) => r.lesson_id);
}

export async function markHomeworkComplete(studentId: string, lessonId: string): Promise<void> {
  const id = `hwc-${studentId}-${lessonId}`;
  const { error } = await supabase
    .from('arabic_homework_completions')
    .upsert(
      { id, student_id: studentId, lesson_id: lessonId, completed_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) {
    console.error('markHomeworkComplete failed:', error.message,
      '\n→ Make sure the arabic_homework_completions table exists (run the SQL migration).');
  }
}

// ── Homework question counts per lesson ───────────────────────────────────────

export async function getHomeworkCountsByLesson(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('arabic_homework_questions')
    .select('id, lesson_id');
  if (error) { console.error('getHomeworkCountsByLesson:', error.message); return {}; }
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    counts[r.lesson_id] = (counts[r.lesson_id] ?? 0) + 1;
  });
  return counts;
}

// ── Vocab rounds completed per lesson for a student ───────────────────────────
// Returns: { lessonId → number of spaced-rep rounds (attempt numbers) completed }

export async function getVocabRoundsByLesson(studentId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('arabic_vocab_attempts')
    .select('lesson_id, attempt_number')
    .eq('student_id', studentId)
    .not('completed_at', 'is', null);
  if (error) { console.error('getVocabRoundsByLesson:', error.message); return {}; }
  const maxRound: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    const cur = maxRound[r.lesson_id] ?? 0;
    if (r.attempt_number > cur) maxRound[r.lesson_id] = r.attempt_number;
  });
  return maxRound;
}
