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
  ArabicStudent, ArabicLesson, ArabicDialect, ArabicCourseDialect, WeeklySlot,
  ArabicLevelPlan,
  HomeworkQuestion, HomeworkQuestionType,
  HomeworkItem, ArabicExamItemType,
  VocabWord, VocabMode, VocabAttempt, VocabMistakeDetail,
  ArabicLessonProgress, ArabicLessonLog,
} from '../types';

const PDF_BUCKET = 'tajweed-assets';
const PDF_PREFIX = 'arabic-pdfs';

// ── DB row types ─────────────────────────────────────────────────────────────

interface ArabicStudentRow {
  id: string;
  teacher_id: string;
  name: string;
  profile_icon: string | null;
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
  share_token: string | null;
  active_meet_url: string | null;
  hourly_rate: number | null;
  currency: string | null;
  student_type: string | null;
  preply_percentage: number | null;
  auth_user_id?: string | null;
  self_registered?: boolean | null;
  approval_status?: string | null;
  created_at: string;
}

interface ArabicLessonRow {
  id: string;
  title: string;
  description: string | null;
  order_index: number;
  level: number;
  dialect: string;          // 'levantine' | 'msa' — default 'levantine' for legacy rows
  pdf_url: string | null;
  video_url: string | null;
  teacher_note: string | null;
  grammar_summary: string | null;
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
    profileIcon:         r.profile_icon ?? undefined,
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
    shareToken:          r.share_token      ?? undefined,
    activeMeetUrl:       r.active_meet_url  ?? undefined,
    hourlyRate:          r.hourly_rate       ?? undefined,
    currency:            (r.currency as ArabicStudent['currency']) ?? undefined,
    studentType:         (r.student_type as ArabicStudent['studentType']) ?? undefined,
    preplyPercentage:    r.preply_percentage ?? undefined,
    authUserId:          r.auth_user_id      ?? undefined,
    selfRegistered:      r.self_registered   ?? undefined,
    approvalStatus:      (r.approval_status as ArabicStudent['approvalStatus']) ?? undefined,
    createdAt:           r.created_at,
  };
}

function studentToRow(s: ArabicStudent): ArabicStudentRow {
  return {
    id:                  s.id,
    teacher_id:          s.teacherId,
    name:                s.name,
    profile_icon:        s.profileIcon ?? null,
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
    share_token:         s.shareToken      ?? null,
    active_meet_url:     s.activeMeetUrl   ?? null,
    hourly_rate:         s.hourlyRate       ?? null,
    currency:            s.currency         ?? null,
    student_type:        s.studentType      ?? null,
    preply_percentage:   s.preplyPercentage ?? null,
    auth_user_id:        s.authUserId       ?? null,
    self_registered:     s.selfRegistered   ?? false,
    approval_status:     s.approvalStatus   ?? 'active',
    created_at:          s.createdAt,
  };
}

function rowToLesson(r: ArabicLessonRow): ArabicLesson {
  return {
    id:             r.id,
    title:          r.title,
    description:    r.description     ?? undefined,
    orderIndex:     r.order_index,
    level:          (r.level as 1|2|3) ?? 1,
    dialect:        (r.dialect as ArabicCourseDialect) ?? 'levantine',
    pdfUrl:         r.pdf_url         ?? undefined,
    videoUrl:       r.video_url       ?? undefined,
    teacherNote:    r.teacher_note    ?? undefined,
    grammarSummary: r.grammar_summary ?? undefined,
    createdBy:      r.created_by      ?? undefined,
    createdAt:      r.created_at,
    updatedAt:      r.updated_at,
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

/** Approve / reject a self-registered Arabic student's join request. */
export async function setArabicStudentApprovalStatus(
  teacherId: string, studentId: string, status: 'active' | 'rejected',
): Promise<void> {
  const { error } = await supabase
    .from('arabic_students')
    .update({ approval_status: status })
    .eq('id', studentId)
    .eq('teacher_id', teacherId);
  if (error) console.error('setArabicStudentApprovalStatus:', error.message);
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
  level?: 1 | 2 | 3;
  dialect?: ArabicCourseDialect;
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
    id:              `al-${Date.now()}`,
    title:           input.title,
    description:     input.description ?? null,
    order_index:     maxOrder + 1,
    level:           input.level   ?? 1,
    dialect:         input.dialect ?? 'levantine',
    pdf_url:         input.pdfUrl  ?? null,
    video_url:       null,
    teacher_note:    null,
    grammar_summary: null,
    created_by:      input.createdBy ?? null,
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString(),
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
  patch: Partial<Pick<ArabicLesson, 'title' | 'description' | 'pdfUrl' | 'orderIndex' | 'videoUrl' | 'level' | 'dialect'>>,
): Promise<boolean> {
  const update: Partial<ArabicLessonRow> & { updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (patch.title       !== undefined) update.title       = patch.title;
  if (patch.description !== undefined) update.description = patch.description ?? null;
  if (patch.pdfUrl      !== undefined) update.pdf_url     = patch.pdfUrl ?? null;
  if (patch.orderIndex  !== undefined) update.order_index = patch.orderIndex;
  if (patch.videoUrl    !== undefined) update.video_url   = patch.videoUrl ?? null;
  if (patch.level       !== undefined) update.level       = patch.level;
  if (patch.dialect     !== undefined) update.dialect     = patch.dialect;

  const { error } = await supabase
    .from('arabic_lessons')
    .update(update)
    .eq('id', id);
  if (error) { console.error('updateArabicLesson:', error.message); return false; }
  return true;
}

/** Save teacher's note or grammar summary for a lesson. */
export async function saveLessonNote(
  lessonId: string,
  field: 'teacherNote' | 'grammarSummary',
  value: string,
): Promise<boolean> {
  const col = field === 'teacherNote' ? 'teacher_note' : 'grammar_summary';
  const { error } = await supabase
    .from('arabic_lessons')
    .update({ [col]: value || null, updated_at: new Date().toISOString() })
    .eq('id', lessonId);
  if (error) { console.error('saveLessonNote:', error.message); return false; }
  return true;
}

/** The teacher's note is now ONE per student (shared across all that student's
 *  lessons), stored on arabic_students.teacher_note. */
export async function getArabicStudentNote(studentId: string): Promise<string> {
  const { data, error } = await supabase
    .from('arabic_students')
    .select('teacher_note')
    .eq('id', studentId)
    .maybeSingle();
  if (error) { console.error('getArabicStudentNote:', error.message); return ''; }
  return ((data as { teacher_note?: string } | null)?.teacher_note) ?? '';
}

export async function saveArabicStudentNote(studentId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('arabic_students')
    .update({ teacher_note: note || null })
    .eq('id', studentId);
  if (error) console.error('saveArabicStudentNote:', error.message);
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

// ── Homework items (rich builder model — mirrors arabic_exam_items) ───────────

interface HomeworkItemRow {
  id: string;
  lesson_id: string;
  item_type: string;
  order_index: number;
  content: string | null;
  image_url: string | null;
  question_type: string | null;
  options: string[] | null;
  correct_answer: string | null;
  marks: number | null;
  created_at: string;
}

function rowToHomeworkItem(r: HomeworkItemRow): HomeworkItem {
  return {
    id: r.id,
    lessonId: r.lesson_id,
    itemType: r.item_type as ArabicExamItemType,
    orderIndex: r.order_index,
    content: r.content ?? undefined,
    imageUrl: r.image_url ?? undefined,
    questionType: (r.question_type as HomeworkQuestionType) ?? undefined,
    options: r.options ?? undefined,
    correctAnswer: r.correct_answer ?? undefined,
    marks: r.marks ?? undefined,
    createdAt: r.created_at,
  };
}

export async function getHomeworkItems(lessonId: string): Promise<HomeworkItem[]> {
  const { data, error } = await supabase
    .from('homework_items').select('*')
    .eq('lesson_id', lessonId).order('order_index', { ascending: true });
  if (error) { console.error('getHomeworkItems:', error.message); return []; }
  return (data ?? []).map(rowToHomeworkItem);
}

export async function createHomeworkItem(input: {
  lessonId: string; itemType: ArabicExamItemType; content?: string; imageUrl?: string;
  questionType?: HomeworkQuestionType; options?: string[]; correctAnswer?: string; marks?: number;
}): Promise<HomeworkItem | null> {
  const { data: existing } = await supabase
    .from('homework_items').select('order_index')
    .eq('lesson_id', input.lessonId).order('order_index', { ascending: false }).limit(1);
  const maxOrder = (existing?.[0] as { order_index?: number } | undefined)?.order_index ?? 0;
  const { data, error } = await supabase.from('homework_items').insert({
    lesson_id:     input.lessonId,
    item_type:     input.itemType,
    order_index:   maxOrder + 1,
    content:       input.content ?? null,
    image_url:     input.imageUrl ?? null,
    question_type: input.questionType ?? null,
    options:       input.options ?? null,
    correct_answer: input.correctAnswer ?? null,
    marks:         input.marks ?? null,
  }).select().single();
  if (error) { console.error('createHomeworkItem:', error.message); return null; }
  return rowToHomeworkItem(data as HomeworkItemRow);
}

export async function updateHomeworkItem(id: string, patch: Partial<Pick<HomeworkItem,
  'content' | 'imageUrl' | 'questionType' | 'options' | 'correctAnswer' | 'marks'>>): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (patch.content       !== undefined) update.content        = patch.content ?? null;
  if (patch.imageUrl      !== undefined) update.image_url      = patch.imageUrl ?? null;
  if (patch.questionType  !== undefined) update.question_type  = patch.questionType ?? null;
  if (patch.options       !== undefined) update.options        = patch.options ?? null;
  if (patch.correctAnswer !== undefined) update.correct_answer = patch.correctAnswer ?? null;
  if (patch.marks         !== undefined) update.marks          = patch.marks ?? null;
  const { error } = await supabase.from('homework_items').update(update).eq('id', id);
  if (error) { console.error('updateHomeworkItem:', error.message); return false; }
  return true;
}

export async function deleteHomeworkItem(id: string): Promise<boolean> {
  const { error } = await supabase.from('homework_items').delete().eq('id', id);
  if (error) { console.error('deleteHomeworkItem:', error.message); return false; }
  return true;
}

export async function reorderHomeworkItems(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('homework_items').update({ order_index: i + 1 }).eq('id', id),
  ));
}

export async function uploadHomeworkImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `homework-images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('tajweed-assets').upload(path, file, { upsert: true });
  if (error) { console.error('uploadHomeworkImage:', error.message); return null; }
  return supabase.storage.from('tajweed-assets').getPublicUrl(path).data.publicUrl;
}

// ── Homework submissions ──────────────────────────────────────────────────────

export interface HomeworkSubmission {
  id: string;
  lessonId: string;
  studentId: string;
  teacherId: string;
  attemptNumber: number;
  answers: Record<string, string>;
  subAnswers: Record<string, Record<number, string>>;
  grading: Record<string, { correct: boolean; note?: string }>;
  submittedAt: string;
  gradedAt?: string;
}

interface HWSubmissionRow {
  id: string;
  lesson_id: string;
  student_id: string;
  teacher_id: string;
  attempt_number: number;
  answers: Record<string, string>;
  sub_answers: Record<string, Record<number, string>>;
  grading: Record<string, { correct: boolean; note?: string }>;
  submitted_at: string;
  graded_at: string | null;
}

function rowToSubmission(r: HWSubmissionRow): HomeworkSubmission {
  return {
    id: r.id,
    lessonId: r.lesson_id,
    studentId: r.student_id,
    teacherId: r.teacher_id,
    attemptNumber: r.attempt_number ?? 1,
    answers: r.answers ?? {},
    subAnswers: r.sub_answers ?? {},
    grading: r.grading ?? {},
    submittedAt: r.submitted_at,
    gradedAt: r.graded_at ?? undefined,
  };
}

export async function saveHomeworkSubmission(
  lessonId: string,
  studentId: string,
  teacherId: string,
  answers: Record<string, string>,
  subAnswers: Record<string, Record<number, string>>,
  autoGrading: Record<string, { correct: boolean }> = {},
): Promise<void> {
  // Count existing attempts to derive next attempt number (avoids ordering by attempt_number column
  // which may not exist yet if the v2 migration hasn't been run).
  const { count } = await supabase
    .from('homework_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId);
  const nextAttempt = (count ?? 0) + 1;

  const row = {
    lesson_id: lessonId,
    student_id: studentId,
    teacher_id: teacherId,
    attempt_number: nextAttempt,
    answers,
    sub_answers: subAnswers,
    grading: autoGrading,
    submitted_at: new Date().toISOString(),
    graded_at: null,
  };

  // Try INSERT first (works after v2 migration that drops the old unique(lesson_id, student_id) constraint).
  const { error } = await supabase.from('homework_submissions').insert(row);
  if (error) {
    // Fallback: upsert without attempt_number for when the migration hasn't been run yet.
    const { attempt_number: _drop, ...rowWithout } = row;
    await supabase
      .from('homework_submissions')
      .upsert(rowWithout, { onConflict: 'lesson_id,student_id' });
  }
}

/** Returns all attempts for a student on a lesson, newest first */
export async function getHomeworkSubmissions(
  lessonId: string,
  studentId: string,
): Promise<HomeworkSubmission[]> {
  const { data, error } = await supabase
    .from('homework_submissions')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: true });
  if (error || !data) return [];
  // Assign attempt numbers based on chronological order (oldest = 1)
  return (data as HWSubmissionRow[]).map((row, i) => ({
    ...rowToSubmission(row),
    attemptNumber: i + 1,
  })).reverse(); // return newest first
}

/** Returns the latest attempt only (for tutor review) */
export async function getHomeworkSubmission(
  lessonId: string,
  studentId: string,
): Promise<HomeworkSubmission | null> {
  const { data, error } = await supabase
    .from('homework_submissions')
    .select('*')
    .eq('lesson_id', lessonId)
    .eq('student_id', studentId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return rowToSubmission(data as HWSubmissionRow);
}

export async function updateHomeworkGrading(
  submissionId: string,
  grading: Record<string, { correct: boolean; note?: string }>,
): Promise<void> {
  await supabase
    .from('homework_submissions')
    .update({ grading, graded_at: new Date().toISOString() })
    .eq('id', submissionId);
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

// ── Lesson progress & dated activity logs ────────────────────────────────────
// Backed by arabic_lesson_progress + arabic_lesson_logs
// (migration: supabase/migrations/20260301_arabic_lesson_progress.sql)

function mapProgress(r: any): ArabicLessonProgress {
  return {
    studentId:     r.student_id,
    lessonId:      r.lesson_id,
    status:        r.status,
    lastSlide:     r.last_slide ?? 1,
    totalSlides:   r.total_slides ?? undefined,
    revisionCount: r.revision_count ?? 0,
    updatedAt:     r.updated_at,
  };
}

/** All lesson-progress rows for a student, keyed by lessonId. */
export async function getLessonProgressForStudent(studentId: string): Promise<Map<string, ArabicLessonProgress>> {
  const { data, error } = await supabase
    .from('arabic_lesson_progress')
    .select('*')
    .eq('student_id', studentId);
  if (error) { console.error('getLessonProgressForStudent:', error.message); return new Map(); }
  return new Map((data ?? []).map((r: any) => [r.lesson_id as string, mapProgress(r)]));
}

/** Append-only dated activity log for a student (newest first). Feeds the calendar. */
export async function getLessonLogsForStudent(studentId: string): Promise<ArabicLessonLog[]> {
  const { data, error } = await supabase
    .from('arabic_lesson_logs')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getLessonLogsForStudent:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    id: r.id, studentId: r.student_id, lessonId: r.lesson_id,
    kind: r.kind, slide: r.slide ?? undefined, createdAt: r.created_at,
  }));
}

async function appendLessonLog(studentId: string, lessonId: string, kind: ArabicLessonLog['kind'], slide?: number): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_logs')
    .insert({ student_id: studentId, lesson_id: lessonId, kind, slide: slide ?? null });
  if (error) console.error('appendLessonLog:', error.message);
}

/** Save in-progress position on a non-final slide and log a 'progress' event. */
export async function markLessonProgress(studentId: string, lessonId: string, slide: number, totalSlides?: number): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_progress')
    .upsert({
      student_id: studentId, lesson_id: lessonId,
      status: 'in_progress', last_slide: slide, total_slides: totalSlides ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,lesson_id' });
  if (error) { console.error('markLessonProgress:', error.message); return; }
  await appendLessonLog(studentId, lessonId, 'progress', slide);
}

/** First completion: mark 'done', log a 'done' event, and keep completed_lesson_ids in sync. */
export async function markLessonDone(teacherId: string | null, studentId: string, lessonId: string, totalSlides?: number): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_progress')
    .upsert({
      student_id: studentId, lesson_id: lessonId,
      status: 'done', last_slide: totalSlides ?? 1, total_slides: totalSlides ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,lesson_id' });
  if (error) { console.error('markLessonDone:', error.message); return; }
  await appendLessonLog(studentId, lessonId, 'done', totalSlides);
  if (teacherId) await setArabicLessonCompletion(teacherId, studentId, lessonId, true);
}

/** A revision of an already-done lesson: bump revision_count and log a 'revision' event. */
export async function logLessonRevision(studentId: string, lessonId: string): Promise<void> {
  const { data, error } = await supabase
    .from('arabic_lesson_progress')
    .select('revision_count')
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId)
    .single();
  if (error || !data) { console.error('logLessonRevision fetch:', error?.message); return; }
  const next = ((data as any).revision_count ?? 0) + 1;
  const { error: upErr } = await supabase
    .from('arabic_lesson_progress')
    .update({ status: 'done', revision_count: next, updated_at: new Date().toISOString() })
    .eq('student_id', studentId)
    .eq('lesson_id', lessonId);
  if (upErr) { console.error('logLessonRevision update:', upErr.message); return; }
  await appendLessonLog(studentId, lessonId, 'revision');
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
    .from('arabic_lesson_homework')
    .select('id, lesson_id');
  if (error) { console.error('getHomeworkCountsByLesson:', error.message); return {}; }
  const counts: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    counts[r.lesson_id] = (counts[r.lesson_id] ?? 0) + 1;
  });
  return counts;
}

// ── Share-token helpers ────────────────────────────────────────────────────────

/** Look up a student by their share token (no auth required). */
export async function getStudentByShareToken(token: string): Promise<ArabicStudent | null> {
  const { data, error } = await supabase
    .from('arabic_students')
    .select('*')
    .eq('share_token', token)
    .single();
  if (error || !data) return null;
  return rowToStudent(data as ArabicStudentRow);
}

/** Generate (or return existing) share token for a student, persist it, return the token. */
export async function ensureShareToken(student: ArabicStudent): Promise<string> {
  if (student.shareToken) return student.shareToken;
  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('arabic_students')
    .update({ share_token: token })
    .eq('id', student.id);
  if (error) console.error('ensureShareToken:', error.message);
  return token;
}

/**
 * Like ensureShareToken but resolved by id only (no full student object needed).
 * Returns the existing token if present, otherwise generates + persists one.
 */
export async function ensureShareTokenById(studentId: string): Promise<string | null> {
  const { data } = await supabase
    .from('arabic_students')
    .select('share_token')
    .eq('id', studentId)
    .maybeSingle();
  if (data?.share_token) return data.share_token as string;
  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('arabic_students')
    .update({ share_token: token })
    .eq('id', studentId);
  if (error) { console.error('ensureShareTokenById:', error.message); return null; }
  return token;
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

// ── Lesson whiteboard persistence ─────────────────────────────────────────────
// Table: arabic_lesson_whiteboard(lesson_id, author_id, strokes TEXT, objects JSONB, updated_at)
// author_id = student_id or teacher_id — both sides share the same whiteboard row.

export interface WhiteboardData {
  strokes: string;       // base64 PNG data URL of canvas strokes
  texts:   any[];        // TextObj[]
  tables:  any[];        // TableObj[]
  images:  any[];        // WBImageObj[]
}

export async function getWhiteboardData(lessonId: string, authorId: string): Promise<WhiteboardData | null> {
  const { data, error } = await supabase
    .from('arabic_lesson_whiteboard')
    .select('strokes, objects')
    .eq('lesson_id', lessonId)
    .eq('author_id', authorId)
    .single();
  if (error || !data) return null;
  const d = data as any;
  return {
    strokes: d.strokes ?? '',
    texts:   d.objects?.texts  ?? [],
    tables:  d.objects?.tables ?? [],
    images:  d.objects?.images ?? [],
  };
}

export async function saveWhiteboardData(lessonId: string, authorId: string, wb: WhiteboardData): Promise<void> {
  const { error } = await supabase
    .from('arabic_lesson_whiteboard')
    .upsert(
      {
        lesson_id:  lessonId,
        author_id:  authorId,
        strokes:    wb.strokes,
        objects:    { texts: wb.texts, tables: wb.tables, images: wb.images },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lesson_id,author_id' },
    );
  if (error) console.error('saveWhiteboardData:', error.message);
}

export async function uploadNoteImage(lessonId: string, authorId: string, file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `arabic-notes/${lessonId}/${authorId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, file, { upsert: true });
  if (error) { console.error('uploadNoteImage:', error.message); return null; }
  const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── Level plans (plan image per dialect × level) ─────────────────────────────
// Table: arabic_level_plans(level INT, dialect TEXT, plan_image_url TEXT)
//   PRIMARY KEY (level, dialect)
// Run supabase/level_plans_dialect_migration.sql once before deploying this.

export async function getLevelPlans(): Promise<ArabicLevelPlan[]> {
  const { data, error } = await supabase
    .from('arabic_level_plans')
    .select('level, dialect, plan_image_url');
  if (error) { console.error('getLevelPlans:', error.message); return []; }
  return (data ?? []).map((r: any) => ({
    level:        r.level as 1|2|3,
    dialect:      (r.dialect ?? 'levantine') as ArabicCourseDialect,
    planImageUrl: r.plan_image_url ?? undefined,
  }));
}

export async function uploadLevelPlanImage(
  level: 1|2|3,
  dialect: ArabicCourseDialect,
  file: File,
): Promise<string | null> {
  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `arabic-level-plans/${dialect}-level-${level}.${ext}`;
  await supabase.storage.from(PDF_BUCKET).remove([path]);
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, file, { upsert: true });
  if (error) { console.error('uploadLevelPlanImage:', error.message); return null; }
  const { data } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function saveLevelPlan(
  level: 1|2|3,
  dialect: ArabicCourseDialect,
  planImageUrl: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('arabic_level_plans')
    .upsert({ level, dialect, plan_image_url: planImageUrl }, { onConflict: 'level,dialect' });
  if (error) { console.error('saveLevelPlan:', error.message); return false; }
  return true;
}

/** Save or clear the active Google Meet link for a student */
export async function saveActiveMeetUrl(studentId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from('arabic_students')
    .update({ active_meet_url: url })
    .eq('id', studentId);
  if (error) console.error('saveActiveMeetUrl:', error.message);
}
