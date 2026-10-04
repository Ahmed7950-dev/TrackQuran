import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import { getStudentUnifiedLessons } from './lessonSessionService';
import { homeworkFromRow, getVocabHomework, homeworkUrl, type HomeworkKind, type HomeworkWord, type HomeworkStatus, type VocabHomework } from './vocabHomeworkService';

export function homeworkStatus(hw: Pick<VocabHomework, 'status' | 'deadline'>, now = Date.now()): string {
  if (hw.status === 'completed') return 'Done';
  if (hw.status === 'cancelled') return 'Cancelled';
  if (hw.status === 'missed' || (hw.status === 'assigned' && hw.deadline && Date.parse(hw.deadline) < now)) return "Wasn’t done";
  return 'With student';
}

export async function notifyArabicHomework(hw: VocabHomework, title: string, body: string) {
  const { data, error } = await supabase.from('arabic_students').select('share_token').eq('id', hw.studentId).single();
  if (error) throw new Error(error.message);
  const token = data?.share_token ?? await (await import('./arabicService')).ensureShareTokenById(hw.studentId);
  if (!token) throw new Error('Could not create the student portal link.');
  await createNotification({ teacherId: hw.teacherId, studentId: token, recipient: 'student', bookingId: null,
    type: 'vocab_homework_assigned', title, body, metadata: { homeworkId: hw.id, url: homeworkUrl(hw.id) } });
}

export async function createArabicHomework(input: {
  teacherId: string; studentId: string; studentName: string; kind: HomeworkKind;
  title: string; words?: HomeworkWord[]; deadline: string | null; gameId?: string; lessonId?: string;
}): Promise<VocabHomework> {
  const { data, error } = await supabase.from('arabic_vocab_homework').insert({
    teacher_id: input.teacherId, student_id: input.studentId, student_name: input.studentName,
    status: 'assigned', kind: input.kind, title: input.title, words: input.words ?? [],
    total_count: input.words?.length || null, deadline: input.deadline, game_id: input.gameId ?? null, lesson_id: input.lessonId ?? null,
    assigned_at: new Date().toISOString(),
  }).select('id').single();
  // Lesson completion is idempotent, including two simultaneous completion calls.
  if (error?.code === '23505' && (input.lessonId || input.gameId)) {
    const query = supabase.from('arabic_vocab_homework').select('id').eq('student_id', input.studentId);
    const { data: existing } = input.lessonId
      ? await query.eq('lesson_id', input.lessonId).eq('kind', 'lesson').single()
      : await query.eq('game_id', input.gameId).single();
    const hw = existing && await getVocabHomework(existing.id);
    if (hw) return hw;
  }
  if (error) throw new Error(error.message);
  const hw = await getVocabHomework(data.id);
  if (!hw) throw new Error('Could not reload the homework.');
  await notifyArabicHomework(hw, 'New Arabic homework', `${hw.title}${hw.deadline ? ' · Due before your next deadline.' : ' · No deadline.'}`).catch(console.error);
  return hw;
}

export async function setArabicHomeworkStatus(hw: VocabHomework, status: Exclude<HomeworkStatus, 'draft' | 'assigned'>) {
  const { data, error } = await supabase.from('arabic_vocab_homework').update({ status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', hw.id).eq('status', hw.status).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('This homework changed. Refresh and try again.');
  if (hw.kind === 'lesson' && hw.lessonId && status === 'completed') await (await import('./arabicService')).markHomeworkComplete(hw.studentId, hw.lessonId);
  await notifyArabicHomework(hw, 'Arabic homework updated', `${hw.title}: ${homeworkStatus({ status, deadline: hw.deadline })}.`).catch(console.error);
}

export async function assignCompletedLessonHomework(teacherId: string, studentId: string, lessonId: string) {
  const [{ data: student, error }, { data: lesson, error: lessonError }, { count, error: contentError }] = await Promise.all([
    supabase.from('arabic_students').select('name, share_token').eq('id', studentId).eq('teacher_id', teacherId).single(),
    supabase.from('arabic_lessons').select('title').eq('id', lessonId).single(),
    supabase.from('homework_items').select('id', { count: 'exact', head: true }).eq('lesson_id', lessonId),
  ]);
  if (error) throw new Error(error.message);
  if (lessonError) throw new Error(lessonError.message);
  if (contentError) throw new Error(contentError.message);
  if (!count || !lesson) return;
  const upcoming = await getStudentUnifiedLessons(studentId, student.share_token);
  const next = upcoming.map(l => new Date(l.startAt)).filter(d => d.getTime() > Date.now()).sort((a,b) => +a - +b)[0];
  await createArabicHomework({ teacherId, studentId, studentName: student.name, kind: 'lesson',
    title: lesson.title, lessonId, deadline: next?.toISOString() ?? null });
}

export async function finishLessonHomework(studentId: string, lessonId: string) {
  const { error } = await supabase.from('arabic_vocab_homework')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('lesson_id', lessonId).eq('kind', 'lesson').eq('status', 'assigned');
  if (error) throw new Error(error.message);
}

export async function saveHomeworkProgress(id: string, progress: VocabHomework['progress']) {
  const { error } = await supabase.from('arabic_vocab_homework').update({ progress, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'assigned');
  if (error) throw new Error(error.message);
}

export async function answerAssignedFlashcard(hw: VocabHomework, wordId: string, correct: boolean, index: number): Promise<VocabHomework> {
  const { data, error } = await supabase.rpc('answer_arabic_flashcard', {
    homework_id: hw.id, word_id: wordId, correct, expected_index: index,
  });
  if (error) throw new Error(error.message);
  const saved = homeworkFromRow(data.homework);
  if (data.completed_now) await createNotification({ teacherId: saved.teacherId, studentId: saved.studentId,
    recipient: 'tutor', bookingId: null, type: 'vocab_homework_completed', title: 'Flashcards homework done',
    body: `${saved.studentName ?? 'Your student'} finished flashcards: ${saved.correctCount}/${saved.totalCount} correct.`, metadata: { homeworkId: saved.id } });
  return saved;
}
