// services/letterCardsService.ts
// -----------------------------------------------------------------------------
// Letter-shape CARD game. The tutor holds every letter in its isolated form,
// the student the same letters in the shape chosen before the game. The tutor
// throws a card; the student answers with the same letter. Right: the pair goes
// to the student and both draw again. Wrong: the pair goes back to the pile and
// a life is spent.
//
//   letter_cards_games  one row per game: settings, then the result.
//
// The board never touches the database — it lives on the realtime channel
// `letter-cards:<id>`, broadcast by whoever is holding the game (the tutor).
// Migration: supabase/migrations/20260927_letter_cards.sql (anon-writable).
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import type { MatchForm } from './letterMatchService';
import type { CardsMode, CardsEnd } from './letterCardsDeck';

const SITE = 'https://www.lisanquran.com';
export const letterCardsUrl = (id: string): string => `${SITE}/letter-cards/${id}`;
export const letterCardsChannel = (id: string): string => `letter-cards:${id}`;

export {
  HAND_SIZE, ANIMALS, animalSrc, CARD_BACK_STUDENT, CARD_BACK_TUTOR, BOARD_BACKGROUND,
  SOUND_THROW, SOUND_POINT,
} from './letterCardsDeck';
export type { Animal, CardsMode, CardsEnd } from './letterCardsDeck';

export interface LetterCardsGame {
  id: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  letters: string[];
  form: MatchForm;
  lives: number | null;
  mode: CardsMode;
  status: 'created' | 'playing' | 'completed';
  score: number | null;
  mistakes: number | null;
  wrongLetters: Record<string, number> | null;
  endedReason: CardsEnd | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface Row {
  id: string; teacher_id: string; student_id: string; student_name: string | null;
  letters: string[]; form: MatchForm; lives: number | null; mode: CardsMode;
  status: LetterCardsGame['status']; score: number | null; mistakes: number | null;
  wrong_letters: Record<string, number> | null; ended_reason: CardsEnd | null;
  duration_ms: number | null; created_at: string; completed_at: string | null;
}

const fromRow = (r: Row): LetterCardsGame => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id,
  studentName: r.student_name ?? undefined, letters: r.letters ?? [], form: r.form,
  lives: r.lives, mode: r.mode, status: r.status, score: r.score, mistakes: r.mistakes,
  wrongLetters: r.wrong_letters, endedReason: r.ended_reason, durationMs: r.duration_ms,
  createdAt: r.created_at, completedAt: r.completed_at,
});

export async function createLetterCardsGame(input: {
  teacherId: string; studentId: string; studentName: string;
  letters: string[]; form: MatchForm; lives: number | null; mode: CardsMode;
}): Promise<LetterCardsGame | null> {
  const { data, error } = await supabase.from('letter_cards_games').insert({
    teacher_id: input.teacherId, student_id: input.studentId, student_name: input.studentName,
    letters: input.letters, form: input.form, lives: input.lives, mode: input.mode,
  }).select('*').single();
  if (error) { console.error('createLetterCardsGame:', error.message); return null; }
  return fromRow(data as Row);
}

export async function getLetterCardsGame(id: string): Promise<LetterCardsGame | null> {
  const { data, error } = await supabase.from('letter_cards_games').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getLetterCardsGame:', error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

export async function markLetterCardsStarted(id: string): Promise<void> {
  await supabase.from('letter_cards_games')
    .update({ status: 'playing', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'created');
}

export async function completeLetterCardsGame(input: {
  id: string; score: number; mistakes: number; wrongLetters: Record<string, number>;
  endedReason: CardsEnd; durationMs: number;
}): Promise<void> {
  const { error } = await supabase.from('letter_cards_games').update({
    status: 'completed', score: input.score, mistakes: input.mistakes,
    wrong_letters: input.wrongLetters, ended_reason: input.endedReason,
    duration_ms: input.durationMs, completed_at: new Date().toISOString(),
  }).eq('id', input.id);
  if (error) console.error('completeLetterCardsGame:', error.message);
}

export async function listLetterCardsGames(studentId: string): Promise<LetterCardsGame[]> {
  const { data, error } = await supabase.from('letter_cards_games').select('*')
    .eq('student_id', studentId).order('created_at', { ascending: false }).limit(20);
  if (error) { console.error('listLetterCardsGames:', error.message); return []; }
  return (data as Row[]).map(fromRow);
}

/** Tell the student a game is waiting, with the link that opens it. */
export async function notifyLetterCardsInvite(game: LetterCardsGame): Promise<void> {
  await createNotification({
    teacherId: game.teacherId, studentId: game.studentId, recipient: 'student', bookingId: null,
    type: 'letter_cards_invite',
    title: '🃏 Letter cards',
    body: `Your teacher is waiting to play letter cards with you — ${game.letters.length} letters.`,
    metadata: { gameId: game.id, url: letterCardsUrl(game.id) },
  });
}
