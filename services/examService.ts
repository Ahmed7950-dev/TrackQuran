// services/examService.ts
// ---------------------------------------------------------------------------
// Data layer for the Arabic student exam system.
//
//   arabic_exams          → exam definitions (per level × version)
//   arabic_exam_items     → ordered content (sections / questions / images / …)
//   arabic_exam_unlocks   → per-student per-level gate
//   arabic_exam_attempts  → one row per student attempt
//   Images                → Supabase Storage bucket `tajweed-assets` / arabic-exam-images/
//
// Mirrors the conventions in arabicService.ts (row↔camel mappers, {data,error}
// handling, console.error on failure).
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import {
  ArabicExam, ArabicExamItem, ArabicExamItemType, ExamVersion,
  ArabicExamUnlock, ArabicExamAttempt, ExamAttemptStatus, ExamItemGrading,
  HomeworkQuestionType, LeaderboardPrivacy, LeaderboardEntry,
} from '../types';
import { createNotification } from './notificationService';

const BUCKET = 'tajweed-assets';
const IMG_PREFIX = 'arabic-exam-images';

// ── Answer matching (shared with homework auto-grading) ──────────────────────
function stripDiacritics(s: string) {
  return s.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g, '');
}
export function answersMatch(correct: string, user: string): boolean {
  const n = (s: string) => stripDiacritics(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  return n(correct) === n(user);
}

// ── Row types & mappers ──────────────────────────────────────────────────────
interface ExamRow {
  id: string; level: number; version: string; title: string;
  time_limit_minutes: number | null; passing_percentage: number;
  status: string; total_marks: number; leaderboard_privacy: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}
function rowToExam(r: ExamRow): ArabicExam {
  return {
    id: r.id,
    level: r.level as 1 | 2 | 3,
    version: r.version as ExamVersion,
    title: r.title,
    timeLimitMinutes: r.time_limit_minutes ?? undefined,
    passingPercentage: r.passing_percentage,
    status: r.status as 'draft' | 'published',
    totalMarks: r.total_marks,
    leaderboardPrivacy: (r.leaderboard_privacy ?? 'first_name') as LeaderboardPrivacy,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface ExamItemRow {
  id: string; exam_id: string; item_type: string; order_index: number;
  content: string | null; image_url: string | null; question_type: string | null;
  options: string[] | null; correct_answer: string | null; marks: number | null;
  created_at: string;
}
function rowToItem(r: ExamItemRow): ArabicExamItem {
  return {
    id: r.id,
    examId: r.exam_id,
    itemType: r.item_type as ArabicExamItemType,
    orderIndex: r.order_index,
    content: r.content ?? undefined,
    imageUrl: r.image_url ?? undefined,
    questionType: (r.question_type ?? undefined) as HomeworkQuestionType | undefined,
    options: r.options ?? undefined,
    correctAnswer: r.correct_answer ?? undefined,
    marks: r.marks ?? undefined,
    createdAt: r.created_at,
  };
}

interface UnlockRow {
  id: string; student_id: string; level: number; unlocked_by: string | null;
  unlocked_at: string; retake_allowed: boolean;
}
function rowToUnlock(r: UnlockRow): ArabicExamUnlock {
  return {
    id: r.id, studentId: r.student_id, level: r.level,
    unlockedBy: r.unlocked_by ?? undefined, unlockedAt: r.unlocked_at,
    retakeAllowed: r.retake_allowed,
  };
}

interface AttemptRow {
  id: string; exam_id: string; student_id: string; student_name: string | null;
  level: number; version: string;
  attempt_number: number; status: string; started_at: string;
  submitted_at: string | null; marked_at: string | null; published_at: string | null;
  answers: Record<string, string> | null; grading: Record<string, ExamItemGrading> | null;
  total_score: number | null; percentage: number | null; passed: boolean | null;
  general_feedback: string | null; created_at: string;
}
function rowToAttempt(r: AttemptRow): ArabicExamAttempt {
  return {
    id: r.id, examId: r.exam_id, studentId: r.student_id, studentName: r.student_name ?? undefined,
    level: r.level,
    version: r.version as ExamVersion, attemptNumber: r.attempt_number,
    status: r.status as ExamAttemptStatus, startedAt: r.started_at,
    submittedAt: r.submitted_at ?? undefined, markedAt: r.marked_at ?? undefined,
    publishedAt: r.published_at ?? undefined,
    answers: r.answers ?? {}, grading: r.grading ?? {},
    totalScore: r.total_score ?? undefined, percentage: r.percentage ?? undefined,
    passed: r.passed ?? undefined, generalFeedback: r.general_feedback ?? undefined,
    createdAt: r.created_at,
  };
}

// ── Exams CRUD ───────────────────────────────────────────────────────────────
export async function listExams(): Promise<ArabicExam[]> {
  const { data, error } = await supabase
    .from('arabic_exams').select('*')
    .order('level', { ascending: true }).order('version', { ascending: true });
  if (error) { console.error('listExams:', error.message); return []; }
  return (data ?? []).map(rowToExam);
}

export async function getExam(id: string): Promise<ArabicExam | null> {
  const { data, error } = await supabase.from('arabic_exams').select('*').eq('id', id).single();
  if (error) { console.error('getExam:', error.message); return null; }
  return rowToExam(data as ExamRow);
}

/** The single published exam for a level + version, if any. */
export async function getPublishedExam(level: number, version: ExamVersion): Promise<ArabicExam | null> {
  const { data, error } = await supabase
    .from('arabic_exams').select('*')
    .eq('level', level).eq('version', version).eq('status', 'published')
    .order('updated_at', { ascending: false }).limit(1);
  if (error) { console.error('getPublishedExam:', error.message); return null; }
  const row = (data ?? [])[0];
  return row ? rowToExam(row as ExamRow) : null;
}

/** Which versions have a published exam for a level (for the chooser). */
export async function getPublishedVersions(level: number): Promise<ExamVersion[]> {
  const { data, error } = await supabase
    .from('arabic_exams').select('version')
    .eq('level', level).eq('status', 'published');
  if (error) { console.error('getPublishedVersions:', error.message); return []; }
  return Array.from(new Set((data ?? []).map((r: { version: string }) => r.version as ExamVersion)));
}

export async function createExam(input: {
  level: number; version: ExamVersion; title: string;
  timeLimitMinutes?: number; passingPercentage?: number; createdBy?: string;
}): Promise<ArabicExam | null> {
  const { data, error } = await supabase.from('arabic_exams').insert({
    level: input.level,
    version: input.version,
    title: input.title,
    time_limit_minutes: input.timeLimitMinutes ?? null,
    passing_percentage: input.passingPercentage ?? 70,
    status: 'draft',
    total_marks: 0,
    leaderboard_privacy: 'first_name',
    created_by: input.createdBy ?? null,
  }).select().single();
  if (error) { console.error('createExam:', error.message); return null; }
  return rowToExam(data as ExamRow);
}

export async function updateExam(id: string, patch: Partial<Pick<ArabicExam,
  'title' | 'level' | 'version' | 'timeLimitMinutes' | 'passingPercentage' | 'status' | 'leaderboardPrivacy'>>): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title             !== undefined) update.title              = patch.title;
  if (patch.level             !== undefined) update.level              = patch.level;
  if (patch.version           !== undefined) update.version            = patch.version;
  if (patch.timeLimitMinutes  !== undefined) update.time_limit_minutes = patch.timeLimitMinutes ?? null;
  if (patch.passingPercentage !== undefined) update.passing_percentage = patch.passingPercentage;
  if (patch.status            !== undefined) update.status             = patch.status;
  if (patch.leaderboardPrivacy!== undefined) update.leaderboard_privacy = patch.leaderboardPrivacy;
  const { error } = await supabase.from('arabic_exams').update(update).eq('id', id);
  if (error) { console.error('updateExam:', error.message); return false; }
  return true;
}

export async function deleteExam(id: string): Promise<boolean> {
  const { error } = await supabase.from('arabic_exams').delete().eq('id', id);
  if (error) { console.error('deleteExam:', error.message); return false; }
  return true;
}

// ── Items CRUD ───────────────────────────────────────────────────────────────
export async function getExamItems(examId: string): Promise<ArabicExamItem[]> {
  const { data, error } = await supabase
    .from('arabic_exam_items').select('*')
    .eq('exam_id', examId).order('order_index', { ascending: true });
  if (error) { console.error('getExamItems:', error.message); return []; }
  return (data ?? []).map(rowToItem);
}

export async function createExamItem(input: {
  examId: string; itemType: ArabicExamItemType; content?: string; imageUrl?: string;
  questionType?: HomeworkQuestionType; options?: string[]; correctAnswer?: string; marks?: number;
}): Promise<ArabicExamItem | null> {
  const { data: existing } = await supabase
    .from('arabic_exam_items').select('order_index')
    .eq('exam_id', input.examId).order('order_index', { ascending: false }).limit(1);
  const maxOrder = (existing?.[0] as { order_index?: number } | undefined)?.order_index ?? 0;
  const { data, error } = await supabase.from('arabic_exam_items').insert({
    exam_id: input.examId,
    item_type: input.itemType,
    order_index: maxOrder + 1,
    content: input.content ?? null,
    image_url: input.imageUrl ?? null,
    question_type: input.questionType ?? null,
    options: input.options ?? null,
    correct_answer: input.correctAnswer ?? null,
    marks: input.marks ?? null,
  }).select().single();
  if (error) { console.error('createExamItem:', error.message); return null; }
  if (input.itemType === 'question') await recalcTotalMarks(input.examId);
  return rowToItem(data as ExamItemRow);
}

export async function updateExamItem(id: string, patch: Partial<Pick<ArabicExamItem,
  'content' | 'imageUrl' | 'questionType' | 'options' | 'correctAnswer' | 'marks'>>,
  examId?: string): Promise<boolean> {
  const update: Record<string, unknown> = {};
  if (patch.content       !== undefined) update.content        = patch.content ?? null;
  if (patch.imageUrl      !== undefined) update.image_url      = patch.imageUrl ?? null;
  if (patch.questionType  !== undefined) update.question_type  = patch.questionType ?? null;
  if (patch.options       !== undefined) update.options        = patch.options ?? null;
  if (patch.correctAnswer !== undefined) update.correct_answer = patch.correctAnswer ?? null;
  if (patch.marks         !== undefined) update.marks          = patch.marks ?? null;
  const { error } = await supabase.from('arabic_exam_items').update(update).eq('id', id);
  if (error) { console.error('updateExamItem:', error.message); return false; }
  if (patch.marks !== undefined && examId) await recalcTotalMarks(examId);
  return true;
}

export async function deleteExamItem(id: string, examId: string): Promise<boolean> {
  const { error } = await supabase.from('arabic_exam_items').delete().eq('id', id);
  if (error) { console.error('deleteExamItem:', error.message); return false; }
  await recalcTotalMarks(examId);
  return true;
}

/** Persist a new ordering. `orderedIds` is the items in their new order. */
export async function reorderExamItems(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, i) =>
    supabase.from('arabic_exam_items').update({ order_index: i + 1 }).eq('id', id),
  ));
}

export async function recalcTotalMarks(examId: string): Promise<void> {
  const { data, error } = await supabase
    .from('arabic_exam_items').select('marks').eq('exam_id', examId).eq('item_type', 'question');
  if (error) return;
  const total = (data ?? []).reduce((sum: number, r: { marks: number | null }) => sum + (r.marks ?? 0), 0);
  await supabase.from('arabic_exams').update({ total_marks: total }).eq('id', examId);
}

export async function uploadExamImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `${IMG_PREFIX}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) { console.error('uploadExamImage:', error.message); return null; }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ── Unlocks ──────────────────────────────────────────────────────────────────
export async function getUnlocksForStudent(studentId: string): Promise<ArabicExamUnlock[]> {
  const { data, error } = await supabase
    .from('arabic_exam_unlocks').select('*').eq('student_id', studentId);
  if (error) { console.error('getUnlocksForStudent:', error.message); return []; }
  return (data ?? []).map(rowToUnlock);
}

export async function setExamUnlock(
  studentId: string, level: number, tutorId: string, retakeAllowed = false, teacherId?: string,
): Promise<boolean> {
  const { error } = await supabase.from('arabic_exam_unlocks').upsert({
    student_id: studentId, level, unlocked_by: tutorId,
    unlocked_at: new Date().toISOString(), retake_allowed: retakeAllowed,
  }, { onConflict: 'student_id,level' });
  if (error) { console.error('setExamUnlock:', error.message); return false; }
  await createNotification({
    teacherId: teacherId ?? tutorId, studentId, recipient: 'student', bookingId: null,
    type: 'exam_unlocked', title: 'Exam unlocked',
    body: `Your tutor unlocked the Level ${level} exam. Tap "Do Exam" to start.`,
  });
  return true;
}

export async function setRetakeAllowed(
  studentId: string, level: number, allowed: boolean, teacherId?: string,
): Promise<boolean> {
  const { error } = await supabase.from('arabic_exam_unlocks')
    .update({ retake_allowed: allowed }).eq('student_id', studentId).eq('level', level);
  if (error) { console.error('setRetakeAllowed:', error.message); return false; }
  if (allowed && teacherId) {
    await createNotification({
      teacherId, studentId, recipient: 'student', bookingId: null,
      type: 'exam_retake_allowed', title: 'Retake allowed',
      body: `Your tutor allowed you to retake the Level ${level} exam.`,
    });
  }
  return true;
}

export async function removeExamUnlock(studentId: string, level: number): Promise<boolean> {
  const { error } = await supabase.from('arabic_exam_unlocks')
    .delete().eq('student_id', studentId).eq('level', level);
  if (error) { console.error('removeExamUnlock:', error.message); return false; }
  return true;
}

// ── Attempts ─────────────────────────────────────────────────────────────────
export async function getAttempt(id: string): Promise<ArabicExamAttempt | null> {
  const { data, error } = await supabase.from('arabic_exam_attempts').select('*').eq('id', id).single();
  if (error) { console.error('getAttempt:', error.message); return null; }
  return rowToAttempt(data as AttemptRow);
}

export async function getAttemptsForStudent(studentId: string): Promise<ArabicExamAttempt[]> {
  const { data, error } = await supabase
    .from('arabic_exam_attempts').select('*')
    .eq('student_id', studentId).order('created_at', { ascending: false });
  if (error) { console.error('getAttemptsForStudent:', error.message); return []; }
  return (data ?? []).map(rowToAttempt);
}

/** Latest attempt for a (student, exam) pair, or null. */
export async function getLatestAttempt(studentId: string, examId: string): Promise<ArabicExamAttempt | null> {
  const { data, error } = await supabase
    .from('arabic_exam_attempts').select('*')
    .eq('student_id', studentId).eq('exam_id', examId)
    .order('attempt_number', { ascending: false }).limit(1);
  if (error) { console.error('getLatestAttempt:', error.message); return null; }
  const row = (data ?? [])[0];
  return row ? rowToAttempt(row as AttemptRow) : null;
}

/** Submitted-but-not-yet-published attempts across a tutor's students. */
export async function getAttemptsForStudents(studentIds: string[]): Promise<ArabicExamAttempt[]> {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from('arabic_exam_attempts').select('*')
    .in('student_id', studentIds).order('submitted_at', { ascending: false });
  if (error) { console.error('getAttemptsForStudents:', error.message); return []; }
  return (data ?? []).map(rowToAttempt);
}

/**
 * Resume the in-progress attempt for (student, exam), or create a new one.
 * A new attempt is created when there is no attempt yet, or when the latest is
 * finished AND a retake has been allowed for that level.
 */
export async function getOrCreateAttempt(
  exam: ArabicExam, studentId: string, retakeAllowed: boolean,
  studentName?: string, teacherId?: string,
): Promise<ArabicExamAttempt | null> {
  const latest = await getLatestAttempt(studentId, exam.id);
  if (latest && latest.status === 'in_progress') return latest;
  if (latest && !retakeAllowed) return latest; // finished + no retake → return as-is (read-only states handle it)
  const attemptNumber = latest ? latest.attemptNumber + 1 : 1;
  const { data, error } = await supabase.from('arabic_exam_attempts').insert({
    exam_id: exam.id, student_id: studentId, student_name: studentName ?? null,
    level: exam.level, version: exam.version,
    attempt_number: attemptNumber, status: 'in_progress',
    answers: {}, grading: {},
  }).select().single();
  if (error) { console.error('getOrCreateAttempt:', error.message); return null; }
  // Notify the tutor that the student has started the exam.
  if (teacherId) {
    await createNotification({
      teacherId, studentId, recipient: 'tutor', bookingId: null,
      type: 'exam_started', title: 'Exam started',
      body: `A student started the Level ${exam.level} ${exam.version} exam${attemptNumber > 1 ? ` (attempt #${attemptNumber})` : ''}.`,
    });
  }
  return rowToAttempt(data as AttemptRow);
}

export async function saveAttemptAnswers(attemptId: string, answers: Record<string, string>): Promise<void> {
  const { error } = await supabase.from('arabic_exam_attempts').update({ answers }).eq('id', attemptId);
  if (error) console.error('saveAttemptAnswers:', error.message);
}

/**
 * Submit an attempt. Auto-grades objective questions (multiple_choice,
 * true_false) against their correct answer and pre-fills the grading map; the
 * rest is left for the tutor (correct=false, awarded=0 until marked).
 */
export async function submitAttempt(
  attempt: ArabicExamAttempt, items: ArabicExamItem[], teacherId: string,
): Promise<boolean> {
  const grading: Record<string, ExamItemGrading> = { ...attempt.grading };
  for (const item of items) {
    if (item.itemType !== 'question') continue;
    const ans = attempt.answers[item.id] ?? '';
    const objective = item.questionType === 'multiple_choice' || item.questionType === 'true_false';
    if (objective && item.correctAnswer != null) {
      const correct = answersMatch(item.correctAnswer, ans);
      grading[item.id] = { awarded: correct ? (item.marks ?? 0) : 0, correct };
    } else if (!grading[item.id]) {
      grading[item.id] = { awarded: 0, correct: false };
    }
  }
  const { error } = await supabase.from('arabic_exam_attempts').update({
    status: 'submitted', submitted_at: new Date().toISOString(), grading,
    ...(attempt.studentName ? { student_name: attempt.studentName } : {}),
  }).eq('id', attempt.id);
  if (error) { console.error('submitAttempt:', error.message); return false; }
  await createNotification({
    teacherId, studentId: attempt.studentId, recipient: 'tutor', bookingId: null,
    type: 'exam_submitted', title: 'Exam submitted',
    body: `A student submitted the Level ${attempt.level} ${attempt.version} exam. Ready to mark.`,
  });
  return true;
}

/** All attempts for one exam (admin "view all results"). */
export async function getAttemptsForExam(examId: string): Promise<ArabicExamAttempt[]> {
  const { data, error } = await supabase
    .from('arabic_exam_attempts').select('*')
    .eq('exam_id', examId).order('percentage', { ascending: false });
  if (error) { console.error('getAttemptsForExam:', error.message); return []; }
  return (data ?? []).map(rowToAttempt);
}

/**
 * Reopen a submitted/published attempt so the student can edit and resubmit.
 * Resets it to in-progress and notifies the student.
 */
export async function reopenAttempt(attempt: ArabicExamAttempt, teacherId: string): Promise<boolean> {
  const { error } = await supabase.from('arabic_exam_attempts').update({
    status: 'in_progress', submitted_at: null, marked_at: null, published_at: null,
  }).eq('id', attempt.id);
  if (error) { console.error('reopenAttempt:', error.message); return false; }
  await createNotification({
    teacherId, studentId: attempt.studentId, recipient: 'student', bookingId: null,
    type: 'exam_retake_allowed', title: 'Resubmission allowed',
    body: `Your tutor reopened the Level ${attempt.level} ${attempt.version} exam so you can edit and resubmit.`,
  });
  return true;
}

function formatName(name: string | undefined, privacy: LeaderboardPrivacy, index: number): string {
  if (privacy === 'anonymous') return `Student ${index + 1}`;
  const full = (name ?? 'Student').trim();
  if (privacy === 'first_name') return full.split(/\s+/)[0] || 'Student';
  return full;
}

/**
 * Leaderboard for a level + version: best published attempt per student, ranked
 * by percentage then earliest completion. Names formatted per the exam's privacy
 * setting. Only published results are included.
 */
export async function getLeaderboard(
  level: number, version: ExamVersion, selfStudentId?: string,
): Promise<{ exam: ArabicExam | null; entries: LeaderboardEntry[] }> {
  const exam = await getPublishedExam(level, version);
  if (!exam) return { exam: null, entries: [] };
  const { data, error } = await supabase
    .from('arabic_exam_attempts').select('*')
    .eq('exam_id', exam.id).eq('status', 'result_published');
  if (error) { console.error('getLeaderboard:', error.message); return { exam, entries: [] }; }
  const attempts = (data ?? []).map(rowToAttempt);

  // Best attempt per student (highest %, then earliest completion)
  const best = new Map<string, ArabicExamAttempt>();
  for (const a of attempts) {
    const cur = best.get(a.studentId);
    const aPct = a.percentage ?? 0, cPct = cur?.percentage ?? -1;
    if (!cur || aPct > cPct) best.set(a.studentId, a);
  }
  const ranked = [...best.values()].sort((x, y) => {
    const d = (y.percentage ?? 0) - (x.percentage ?? 0);
    if (d !== 0) return d;
    return (x.publishedAt ?? x.submittedAt ?? '').localeCompare(y.publishedAt ?? y.submittedAt ?? '');
  });

  const entries: LeaderboardEntry[] = ranked.map((a, i) => ({
    rank: i + 1,
    studentId: a.studentId,
    displayName: a.studentId === selfStudentId ? 'You' : formatName(a.studentName, exam.leaderboardPrivacy, i),
    score: a.totalScore ?? 0,
    percentage: a.percentage ?? 0,
    passed: !!a.passed,
    attemptNumber: a.attemptNumber,
    completedAt: a.publishedAt ?? a.submittedAt,
    isSelf: a.studentId === selfStudentId,
  }));
  return { exam, entries };
}

/** Save tutor's grading + feedback (without publishing yet). */
export async function gradeAttempt(
  attemptId: string, grading: Record<string, ExamItemGrading>, generalFeedback: string,
): Promise<boolean> {
  const { error } = await supabase.from('arabic_exam_attempts').update({
    grading, general_feedback: generalFeedback,
    status: 'under_review', marked_at: new Date().toISOString(),
  }).eq('id', attemptId);
  if (error) { console.error('gradeAttempt:', error.message); return false; }
  return true;
}

/** Publish the result to the student: compute score/percentage/pass and notify. */
export async function publishResult(
  attempt: ArabicExamAttempt, grading: Record<string, ExamItemGrading>,
  generalFeedback: string, exam: ArabicExam, teacherId: string,
): Promise<boolean> {
  const totalScore = Object.values(grading).reduce((s, g) => s + (g.awarded ?? 0), 0);
  const percentage = exam.totalMarks > 0 ? Math.round((totalScore / exam.totalMarks) * 100) : 0;
  const passed = percentage >= exam.passingPercentage;
  const { error } = await supabase.from('arabic_exam_attempts').update({
    grading, general_feedback: generalFeedback,
    total_score: totalScore, percentage, passed,
    status: 'result_published', marked_at: new Date().toISOString(),
    published_at: new Date().toISOString(),
  }).eq('id', attempt.id);
  if (error) { console.error('publishResult:', error.message); return false; }
  await createNotification({
    teacherId, studentId: attempt.studentId, recipient: 'student', bookingId: null,
    type: 'exam_result_published', title: 'Exam result ready',
    body: `Your Level ${attempt.level} ${attempt.version} exam result is ready: ${percentage}% — ${passed ? 'Passed 🎉' : 'Not passed'}.`,
  });
  return true;
}
