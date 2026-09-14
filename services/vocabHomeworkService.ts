// services/vocabHomeworkService.ts
// -----------------------------------------------------------------------------
// Arabic vocabulary — word strength and the homework basket.
//
//   arabic_vocab_reviews   one row per FLASHCARD answer (never games). The last
//                          ten per word draw the red/green strength bar.
//   arabic_vocab_homework  the basket ('draft', one per student) → an assigned
//                          homework with a link → completed with a score.
//
// Both tables are anon-writable (migration 20260914_arabic_vocab_homework.sql)
// because the student portal and the homework link have no auth session.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import type { VocabWord } from '../types';

/** How many answers the strength bar shows. */
export const STRENGTH_SLOTS = 10;
/** Seconds the student gets per word in the homework game. */
export const HOMEWORK_SECONDS_PER_WORD = 10;
/** Arabic options flying around each English word (the right one included). */
export const HOMEWORK_OPTIONS = 10;

// ── Flashcard answers → strength ────────────────────────────────────────────

/** Record one flashcard answer. Best-effort: a failed write never blocks the run. */
export async function recordVocabReview(
  studentId: string, word: Pick<VocabWord, 'id' | 'lessonId'>, correct: boolean,
): Promise<void> {
  if (!studentId || !word?.id) return;
  const { error } = await supabase.from('arabic_vocab_reviews').insert({
    student_id: studentId, word_id: word.id, lesson_id: word.lessonId ?? null, correct,
  });
  if (error) console.error('recordVocabReview:', error.message);
}

/** wordId → the student's answers, OLDEST first, at most STRENGTH_SLOTS each. */
export type StrengthMap = Map<string, boolean[]>;

export async function getVocabStrength(studentId: string): Promise<StrengthMap> {
  const out: StrengthMap = new Map();
  if (!studentId) return out;
  const PAGE = 1000;
  const newestFirst = new Map<string, boolean[]>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('arabic_vocab_reviews')
      .select('word_id, correct')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('getVocabStrength:', error.message); break; }
    for (const r of (data ?? []) as Array<{ word_id: string; correct: boolean }>) {
      const list = newestFirst.get(r.word_id) ?? [];
      if (list.length < STRENGTH_SLOTS) list.push(r.correct);
      newestFirst.set(r.word_id, list);
    }
    if (!data || data.length < PAGE) break;
  }
  for (const [id, list] of newestFirst) out.set(id, list.reverse());
  return out;
}

/** Append one answer to a strength map without refetching (keeps the last ten). */
export function withReview(map: StrengthMap, wordId: string, correct: boolean): StrengthMap {
  const next = new Map(map);
  next.set(wordId, [...(map.get(wordId) ?? []), correct].slice(-STRENGTH_SLOTS));
  return next;
}

// ── Homework ────────────────────────────────────────────────────────────────

export interface HomeworkWord { id: string; arabic: string; english: string; transliteration?: string }
export interface HomeworkResult { wordId: string; correct: boolean }
export type HomeworkStatus = 'draft' | 'assigned' | 'completed';

export interface VocabHomework {
  id: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  status: HomeworkStatus;
  words: HomeworkWord[];
  distractors: string[];
  deadline: string | null;
  results: HomeworkResult[] | null;
  correctCount: number | null;
  totalCount: number | null;
  createdAt: string;
  assignedAt: string | null;
  completedAt: string | null;
}

interface Row {
  id: string; teacher_id: string; student_id: string; student_name: string | null;
  status: HomeworkStatus; words: HomeworkWord[] | null; distractors: string[] | null;
  deadline: string | null; results: HomeworkResult[] | null;
  correct_count: number | null; total_count: number | null;
  created_at: string; assigned_at: string | null; completed_at: string | null;
}

const fromRow = (r: Row): VocabHomework => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id, studentName: r.student_name ?? undefined,
  status: r.status, words: r.words ?? [], distractors: r.distractors ?? [],
  deadline: r.deadline, results: r.results, correctCount: r.correct_count, totalCount: r.total_count,
  createdAt: r.created_at, assignedAt: r.assigned_at, completedAt: r.completed_at,
});

export const toHomeworkWord = (w: VocabWord): HomeworkWord =>
  ({ id: w.id, arabic: w.arabic, english: w.english, transliteration: w.transliteration });

export const homeworkUrl = (id: string): string => `${window.location.origin}/vocab-homework/${id}`;

/** A homework whose deadline has passed and that the student never finished. */
export const isHomeworkExpired = (hw: Pick<VocabHomework, 'status' | 'deadline'>, now = Date.now()): boolean =>
  hw.status === 'assigned' && !!hw.deadline && new Date(hw.deadline).getTime() < now;

/** Every homework row of this student (the draft basket included), newest first. */
export async function listVocabHomework(studentId: string): Promise<VocabHomework[]> {
  const { data, error } = await supabase
    .from('arabic_vocab_homework')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) { console.error('listVocabHomework:', error.message); return []; }
  return (data as Row[]).map(fromRow);
}

export async function getVocabHomework(id: string): Promise<VocabHomework | null> {
  const { data, error } = await supabase
    .from('arabic_vocab_homework').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getVocabHomework:', error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

/** Save the basket's words, creating the draft row the first time. */
export async function saveHomeworkBasket(input: {
  draftId: string | null; teacherId: string; studentId: string; studentName: string; words: HomeworkWord[];
}): Promise<VocabHomework | null> {
  if (input.draftId) {
    const { data, error } = await supabase
      .from('arabic_vocab_homework')
      .update({ words: input.words })
      .eq('id', input.draftId)
      .select('*').maybeSingle();
    if (error) { console.error('saveHomeworkBasket:', error.message); return null; }
    return data ? fromRow(data as Row) : null;
  }
  const { data, error } = await supabase
    .from('arabic_vocab_homework')
    .insert({
      teacher_id: input.teacherId, student_id: input.studentId, student_name: input.studentName,
      status: 'draft', words: input.words,
    })
    .select('*').single();
  if (error) { console.error('saveHomeworkBasket:', error.message); return null; }
  return fromRow(data as Row);
}

/**
 * Turn the basket into homework: stamp the deadline and the distractor pool,
 * then tell the student (their portal bell) with a button to the game.
 */
export async function assignHomework(input: {
  draft: VocabHomework;
  deadline: string | null;
  distractors: string[];
  /** The Arabic portal's bell listens on the share token, not the DB id. */
  studentNotifyId: string | null;
}): Promise<VocabHomework | null> {
  const { draft } = input;
  const { data, error } = await supabase
    .from('arabic_vocab_homework')
    .update({
      status: 'assigned', deadline: input.deadline, distractors: input.distractors,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', draft.id)
    .select('*').single();
  if (error) { console.error('assignHomework:', error.message); return null; }
  const hw = fromRow(data as Row);

  if (input.studentNotifyId) {
    // No clock time in the text: it would be written in the TUTOR's timezone.
    // The homework page shows the deadline in the student's own time.
    const due = hw.deadline ? ' before the deadline' : '';
    await createNotification({
      teacherId: hw.teacherId,
      studentId: input.studentNotifyId,
      recipient: 'student',
      bookingId: null,
      type: 'vocab_homework_assigned',
      title: 'New vocabulary homework',
      body: `You have ${hw.words.length} word${hw.words.length === 1 ? '' : 's'} to practise${due}. Tap to start.`,
      metadata: { homeworkId: hw.id, url: homeworkUrl(hw.id) },
    });
  }
  return hw;
}

/** The student finished: store the score and tell the tutor. Only the first finish counts. */
export async function completeHomework(hw: VocabHomework, results: HomeworkResult[]): Promise<VocabHomework | null> {
  const correct = results.filter(r => r.correct).length;
  const { data, error } = await supabase
    .from('arabic_vocab_homework')
    .update({
      status: 'completed', results, correct_count: correct, total_count: results.length,
      completed_at: new Date().toISOString(),
    })
    .eq('id', hw.id)
    .eq('status', 'assigned')          // a second tab can't overwrite the first score
    .select('*').maybeSingle();
  if (error) { console.error('completeHomework:', error.message); return null; }
  if (!data) return null;
  const done = fromRow(data as Row);
  await createNotification({
    teacherId: done.teacherId,
    studentId: done.studentId,
    recipient: 'tutor',
    bookingId: null,
    type: 'vocab_homework_completed',
    title: 'Vocabulary homework done',
    body: `${done.studentName ?? 'Your student'} finished their vocabulary homework: ${correct} of ${results.length} words correct.`,
    metadata: { homeworkId: done.id },
  });
  return done;
}

export async function deleteVocabHomework(id: string): Promise<boolean> {
  const { error } = await supabase.from('arabic_vocab_homework').delete().eq('id', id);
  if (error) { console.error('deleteVocabHomework:', error.message); return false; }
  return true;
}

// ── Game helpers (pure) ─────────────────────────────────────────────────────

const stripMarks = (s: string): string => (s ?? '').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').trim();

/**
 * The options for one word: the right answer plus up to HOMEWORK_OPTIONS-1
 * other Arabic words, shuffled. Candidates come from the other homework words
 * first, then the course pool; anything that reads the same as the answer
 * (ignoring vowel marks) is left out so two options can never both be right.
 */
export function homeworkOptions(
  target: HomeworkWord, words: HomeworkWord[], distractors: string[], rand: () => number = Math.random,
): string[] {
  const answerKey = stripMarks(target.arabic);
  const seen = new Set<string>([answerKey]);
  const shuffle = <T,>(a: T[]): T[] => {
    const c = [...a];
    for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
    return c;
  };
  const picked: string[] = [];
  for (const cand of [...shuffle(words.map(w => w.arabic)), ...shuffle(distractors)]) {
    if (picked.length >= HOMEWORK_OPTIONS - 1) break;
    const key = stripMarks(cand);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    picked.push(cand);
  }
  return shuffle([target.arabic, ...picked]);
}
