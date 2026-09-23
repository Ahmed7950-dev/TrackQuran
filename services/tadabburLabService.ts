// services/tadabburLabService.ts
// -----------------------------------------------------------------------------
// Tadabbur Lab — the words a student has a meaning for, how well they know each
// one, and the decks the tutor sends to revise.
//
//   quran_word_reviews   one row per flashcard answer; the last ten per word
//                        draw the same red/green strength bar as the Arabic
//                        vocabulary ([[VocabStrengthBar]]).
//   quran_word_homework  a picked deck, assigned → completed with a score.
//
// Both are anon-writable: the student portal has no auth session.
// Word audio is the Quran.com word-by-word recitation, addressed by position.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { STRENGTH_SLOTS } from './vocabHomeworkService';

/** "surah:ayah:wordIndex" — the same key shape as a word meaning. */
export const wordKey = (surah: number, ayah: number, wordIndex: number) => `${surah}:${ayah}:${wordIndex}`;

export const parseWordKey = (key: string) => {
  const [surah, ayah, wordIndex] = key.split(':').map(Number);
  return { surah, ayah, wordIndex };
};

// ── Strength ────────────────────────────────────────────────────────────────

/** wordKey → the student's answers, OLDEST first, at most STRENGTH_SLOTS each. */
export type WordStrength = Map<string, boolean[]>;

export async function loadWordStrength(studentId: string): Promise<WordStrength> {
  const out: WordStrength = new Map();
  if (!studentId) return out;
  const newestFirst = new Map<string, boolean[]>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('quran_word_reviews')
      .select('surah, ayah, word_index, correct')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('loadWordStrength:', error.message); break; }
    for (const r of data ?? []) {
      const k = wordKey(r.surah, r.ayah, r.word_index);
      const list = newestFirst.get(k) ?? [];
      if (list.length < STRENGTH_SLOTS) list.push(r.correct);
      newestFirst.set(k, list);
    }
    if (!data || data.length < PAGE) break;
  }
  for (const [k, list] of newestFirst) out.set(k, list.reverse());
  return out;
}

/** Record one flashcard answer. Best-effort — a failed write never blocks the run. */
export async function recordWordReview(studentId: string, key: string, correct: boolean): Promise<void> {
  if (!studentId) return;
  const { surah, ayah, wordIndex } = parseWordKey(key);
  const { error } = await supabase.from('quran_word_reviews').insert({
    student_id: studentId, surah, ayah, word_index: wordIndex, correct,
  });
  if (error) console.error('recordWordReview:', error.message);
}

/** Append one answer without refetching (keeps the last ten). */
export function withWordReview(map: WordStrength, key: string, correct: boolean): WordStrength {
  const next = new Map(map);
  next.set(key, [...(map.get(key) ?? []), correct].slice(-STRENGTH_SLOTS));
  return next;
}

/** A word nobody has answered yet counts as neither weak nor strong. */
export const isWeak = (answers: boolean[] | undefined): boolean =>
  !!answers?.length && answers.slice(-3).some(a => !a);

// ── Word audio (Quran.com word-by-word recitation) ──────────────────────────

const AUDIO_BASE = 'https://audio.qurancdn.com/';

/** `position` is the word's 1-based place among the verse's words on Quran.com. */
export const wordAudioUrl = (surah: number, ayah: number, position: number): string => {
  const p = (n: number) => String(n).padStart(3, '0');
  return `${AUDIO_BASE}wbw/${p(surah)}_${p(ayah)}_${p(position)}.mp3`;
};

// ── Homework decks ──────────────────────────────────────────────────────────

export interface DeckWord { surah: number; ayah: number; wordIndex: number; wordText: string }

export interface WordHomework {
  id: string;
  studentId: string;
  words: DeckWord[];
  note: string | null;
  status: 'assigned' | 'completed';
  assignedAt: string;
  completedAt: string | null;
  scoreCorrect: number | null;
  scoreTotal: number | null;
}

const rowToHomework = (r: any): WordHomework => ({
  id: r.id,
  studentId: r.student_id,
  words: (r.words ?? []).map((w: any) => ({
    surah: w.surah, ayah: w.ayah, wordIndex: w.word_index ?? w.wordIndex, wordText: w.word_text ?? w.wordText ?? '',
  })),
  note: r.note,
  status: r.status,
  assignedAt: r.assigned_at,
  completedAt: r.completed_at,
  scoreCorrect: r.score_correct,
  scoreTotal: r.score_total,
});

export async function listWordHomework(studentId: string): Promise<WordHomework[]> {
  const { data, error } = await supabase
    .from('quran_word_homework')
    .select('*')
    .eq('student_id', studentId)
    .order('assigned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToHomework);
}

export async function assignWordHomework(studentId: string, words: DeckWord[], note?: string): Promise<WordHomework | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('quran_word_homework')
    .insert({
      student_id: studentId,
      teacher_id: user.id,
      note: note?.trim() || null,
      words: words.map(w => ({ surah: w.surah, ayah: w.ayah, word_index: w.wordIndex, word_text: w.wordText })),
    })
    .select()
    .single();
  if (error) throw error;
  return data ? rowToHomework(data) : null;
}

export async function completeWordHomework(id: string, correct: number, total: number): Promise<boolean> {
  const { error } = await supabase
    .from('quran_word_homework')
    .update({ status: 'completed', completed_at: new Date().toISOString(), score_correct: correct, score_total: total })
    .eq('id', id)
    .eq('status', 'assigned');
  if (error) { console.error('completeWordHomework:', error.message); return false; }
  return true;
}

export async function deleteWordHomework(id: string): Promise<boolean> {
  const { error } = await supabase.from('quran_word_homework').delete().eq('id', id);
  if (error) { console.error('deleteWordHomework:', error.message); return false; }
  return true;
}
