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
import type { CardsKind, WordCard } from './letterCardsDeck';
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
export type { Animal, CardsMode, CardsEnd, CardsKind, WordCard } from './letterCardsDeck';

export interface LetterCardsGame {
  id: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  /** The pile's keys: the letters themselves, or the ids of the words. */
  letters: string[];
  /** Only a letters game has a shape. */
  form: MatchForm | null;
  kind: CardsKind;
  /** A words game: what each card says, by id. */
  words: WordCard[] | null;
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
  letters: string[]; form: MatchForm | null; kind: CardsKind | null; words: WordCard[] | null;
  lives: number | null; mode: CardsMode;
  status: LetterCardsGame['status']; score: number | null; mistakes: number | null;
  wrong_letters: Record<string, number> | null; ended_reason: CardsEnd | null;
  duration_ms: number | null; created_at: string; completed_at: string | null;
}

const fromRow = (r: Row): LetterCardsGame => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id,
  studentName: r.student_name ?? undefined, letters: r.letters ?? [], form: r.form,
  kind: r.kind ?? 'letters', words: r.words ?? null,
  lives: r.lives, mode: r.mode, status: r.status, score: r.score, mistakes: r.mistakes,
  wrongLetters: r.wrong_letters, endedReason: r.ended_reason, durationMs: r.duration_ms,
  createdAt: r.created_at, completedAt: r.completed_at,
});

export async function createLetterCardsGame(input: {
  teacherId: string; studentId: string; studentName: string;
  letters: string[]; form: MatchForm | null; lives: number | null; mode: CardsMode;
  kind?: CardsKind; words?: WordCard[] | null;
}): Promise<LetterCardsGame | null> {
  const { data, error } = await supabase.from('letter_cards_games').insert({
    teacher_id: input.teacherId, student_id: input.studentId, student_name: input.studentName,
    letters: input.letters, form: input.form, lives: input.lives, mode: input.mode,
    kind: input.kind ?? 'letters', words: input.words ?? null,
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

/** One finished run of a homework game. The row keeps the last one; this
 *  keeps them all, because the student may play as often as they like. */
export interface LetterCardsAttempt {
  id: string;
  gameId: string;
  score: number;
  total: number;
  mistakes: number;
  endedReason: CardsEnd | null;
  durationMs: number | null;
  createdAt: string;
}

export async function recordLetterCardsAttempt(input: {
  gameId: string; studentId: string; score: number; total: number; mistakes: number;
  wrongLetters: Record<string, number>; endedReason: CardsEnd; durationMs: number;
}): Promise<void> {
  const { error } = await supabase.from('letter_cards_attempts').insert({
    game_id: input.gameId, student_id: input.studentId, score: input.score, total: input.total,
    mistakes: input.mistakes, wrong_letters: input.wrongLetters,
    ended_reason: input.endedReason, duration_ms: input.durationMs,
  });
  if (error) console.error('recordLetterCardsAttempt:', error.message);
}

/** The homework a student has been set: the solo games, newest first. */
export async function listLetterCardsHomework(studentId: string): Promise<LetterCardsGame[]> {
  if (!studentId) return [];
  const { data, error } = await supabase.from('letter_cards_games').select('*')
    .eq('student_id', studentId).eq('mode', 'solo')
    .order('created_at', { ascending: false }).limit(20);
  if (error) { console.error('listLetterCardsHomework:', error.message); return []; }
  return (data as Row[]).map(fromRow);
}

/** Every run of those games, newest first, keyed by the game they belong to. */
export async function listLetterCardsAttempts(gameIds: string[]): Promise<Record<string, LetterCardsAttempt[]>> {
  const out: Record<string, LetterCardsAttempt[]> = {};
  if (!gameIds.length) return out;
  const { data, error } = await supabase.from('letter_cards_attempts')
    .select('id, game_id, score, total, mistakes, ended_reason, duration_ms, created_at')
    .in('game_id', gameIds).order('created_at', { ascending: false });
  if (error) { console.error('listLetterCardsAttempts:', error.message); return out; }
  for (const r of (data ?? []) as Array<{
    id: string; game_id: string; score: number; total: number; mistakes: number;
    ended_reason: CardsEnd | null; duration_ms: number | null; created_at: string;
  }>) {
    (out[r.game_id] ??= []).push({
      id: r.id, gameId: r.game_id, score: r.score, total: r.total, mistakes: r.mistakes,
      endedReason: r.ended_reason, durationMs: r.duration_ms, createdAt: r.created_at,
    });
  }
  return out;
}

/** Tell the student a game is waiting, with the link that opens it. */
export async function notifyLetterCardsInvite(game: LetterCardsGame): Promise<void> {
  await createNotification({
    teacherId: game.teacherId, studentId: game.studentId, recipient: 'student', bookingId: null,
    type: 'letter_cards_invite',
    title: game.kind === 'words' ? '🃏 Word cards' : '🃏 Letter cards',
    body: game.kind === 'words'
      ? `Your teacher is waiting to play word cards with you — ${game.letters.length} words.`
      : `Your teacher is waiting to play letter cards with you — ${game.letters.length} letters.`,
    metadata: { gameId: game.id, url: letterCardsUrl(game.id) },
  });
}

/** Tell the student a card game has been set as homework. Same notice type —
 *  the table checks it — with the wording and the link of a homework. */
export async function notifyLetterCardsHomework(game: LetterCardsGame): Promise<void> {
  await createNotification({
    teacherId: game.teacherId, studentId: game.studentId, recipient: 'student', bookingId: null,
    type: 'letter_cards_invite',
    title: game.kind === 'words' ? '🃏 Word cards homework' : '🃏 Letter cards homework',
    body: `Play the ${game.kind === 'words' ? 'word' : 'letter'} cards against the computer — `
      + `${game.letters.length} ${game.kind === 'words' ? 'words' : 'letters'}. As many times as you like.`,
    metadata: { gameId: game.id, url: letterCardsUrl(game.id) },
  });
}
