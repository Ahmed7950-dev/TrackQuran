// services/vocabHomeworkService.ts
// -----------------------------------------------------------------------------
// Arabic vocabulary — word strength and homework assignments.
//
//   arabic_vocab_reviews   one row per answer the student gives on a single
//                          word — a flashcard turned over, or a word thrown in
//                          the card game. The last ten per word draw the
//                          red/green strength bar.
//   arabic_vocab_homework  lesson, flashcard and word-card assignments + history.
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
  await recordVocabAnswer(studentId, word.id, correct, crypto.randomUUID()).catch(console.error);
}

/** Record one answer on one word the moment it is given — a card judged in
 *  the word-cards game, a flashcard turned over — and not at the end of the
 *  run, so a game or a deck left half-finished still leaves its record.
 *  The word may not belong to a lesson (a custom vocabulary word), hence no
 *  lesson id. Best-effort: a failed write never interrupts the practice. */
export async function recordVocabAnswer(
  studentId: string, wordId: string, correct: boolean, answerKey?: string,
): Promise<void> {
  if (!studentId || !wordId) return;
  const key = answerKey ?? crypto.randomUUID();
  const row = { student_id: studentId, word_id: wordId, lesson_id: null, correct, answer_key: key, created_at: new Date().toISOString() };
  // Keep failed writes until a later answer or a reopened page can retry them.
  try { const pending = JSON.parse(localStorage.getItem('arabicPendingVocabAnswers') ?? '{}'); pending[key] = row; localStorage.setItem('arabicPendingVocabAnswers', JSON.stringify(pending)); } catch { /* storage unavailable */ }
  const { error } = await supabase.from('arabic_vocab_reviews').upsert(row, { onConflict: 'answer_key', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  try { const pending = JSON.parse(localStorage.getItem('arabicPendingVocabAnswers') ?? '{}'); delete pending[key]; localStorage.setItem('arabicPendingVocabAnswers', JSON.stringify(pending)); } catch { /* optional */ }
}

/** Retry interrupted strength writes without producing duplicate marks. */
export async function flushPendingVocabAnswers(): Promise<void> {
  let rows: Array<{ answer_key: string }> = [];
  try { rows = Object.values(JSON.parse(localStorage.getItem('arabicPendingVocabAnswers') ?? '{}')); } catch { return; }
  if (!rows.length) return;
  const { error } = await supabase.from('arabic_vocab_reviews').upsert(rows, { onConflict: 'answer_key', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  try {
    const pending = JSON.parse(localStorage.getItem('arabicPendingVocabAnswers') ?? '{}');
    rows.forEach(row => delete pending[row.answer_key]);
    localStorage.setItem('arabicPendingVocabAnswers', JSON.stringify(pending));
  } catch { /* optional */ }
}

/** wordId → the student's answers, OLDEST first, at most STRENGTH_SLOTS each. */
export type StrengthMap = Map<string, boolean[]>;

/** One day on which the student revised vocabulary. */
export interface VocabRevisionDay {
  /** How many DISTINCT words were turned over that day. */
  words: number;
  /** How many of those they knew on their last answer of the day. */
  known: number;
}

/**
 * The days this student revised vocabulary, keyed by `Date.toDateString()`.
 *
 * Derived from the answers themselves rather than written as a separate log
 * when a deck is played: the answers are already one row per card with a
 * timestamp, so counting them is exact, costs no extra write per card, and
 * lights up the revision this student did before any of this existed.
 *
 * Counted by DISTINCT word, so turning the same card over twice in a session
 * is one word revised, not two. "Known" takes the LAST answer on a word that
 * day — getting it on the second try is knowing it.
 *
 * Every way of answering a word lands in this table — the lesson flashcards,
 * the Vocabulary tab, the student's assigned homework (through the
 * answer_arabic_flashcard function) and the word-cards game — so all of them
 * mark the day without each needing its own hook.
 */
export async function getVocabRevisionDays(studentId: string): Promise<Map<string, VocabRevisionDay>> {
  const out = new Map<string, VocabRevisionDay>();
  if (!studentId) return out;

  // day -> word -> last answer that day
  const byDay = new Map<string, Map<string, boolean>>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('arabic_vocab_reviews')
      .select('word_id, correct, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error('getVocabRevisionDays:', error.message); break; }
    const rows = (data ?? []) as Array<{ word_id: string; correct: boolean; created_at: string }>;
    for (const r of rows) {
      const day = new Date(r.created_at).toDateString();
      const words = byDay.get(day) ?? new Map<string, boolean>();
      words.set(r.word_id, r.correct);     // ascending, so the last one wins
      byDay.set(day, words);
    }
    if (rows.length < PAGE) break;
  }

  for (const [day, words] of byDay) {
    let known = 0;
    for (const correct of words.values()) if (correct) known += 1;
    out.set(day, { words: words.size, known });
  }
  return out;
}

export async function getVocabStrength(studentId: string): Promise<StrengthMap> {
  await flushPendingVocabAnswers().catch(console.error);
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
export type HomeworkStatus = 'draft' | 'assigned' | 'completed' | 'missed' | 'cancelled';
export type HomeworkKind = 'orbit' | 'flashcards' | 'word_cards' | 'lesson' | 'custom';

export interface VocabHomework {
  id: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  status: HomeworkStatus;
  kind: HomeworkKind;
  title: string;
  lessonId: string | null;
  gameId: string | null;
  progress: { results?: HomeworkResult[]; [key: string]: unknown } | null;
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
  kind?: HomeworkKind; title?: string; lesson_id?: string; game_id?: string; progress?: VocabHomework["progress"];
  id: string; teacher_id: string; student_id: string; student_name: string | null;
  status: HomeworkStatus; words: HomeworkWord[] | null; distractors: string[] | null;
  deadline: string | null; results: HomeworkResult[] | null;
  correct_count: number | null; total_count: number | null;
  created_at: string; assigned_at: string | null; completed_at: string | null;
}

export const homeworkFromRow = (r: Row): VocabHomework => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id, studentName: r.student_name ?? undefined,
  kind: r.kind ?? 'orbit', title: r.title ?? 'Vocabulary homework',
  lessonId: r.lesson_id ?? null, gameId: r.game_id ?? null, progress: r.progress ?? null,
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

/** Every homework row of this student (legacy drafts included), newest first. */
export async function listVocabHomework(studentId: string): Promise<VocabHomework[]> {
  const rows: VocabHomework[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('arabic_vocab_homework').select('*')
      .eq('student_id', studentId).order('created_at', { ascending: false }).order('id').range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data as Row[]).map(homeworkFromRow));
    if (data.length < 1000) return rows;
  }
}

export async function getVocabHomework(id: string): Promise<VocabHomework | null> {
  const { data, error } = await supabase
    .from('arabic_vocab_homework').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getVocabHomework:', error.message); return null; }
  return data ? homeworkFromRow(data as Row) : null;
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
  const done = homeworkFromRow(data as Row);
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
