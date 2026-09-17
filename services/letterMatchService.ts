// services/letterMatchService.ts
// -----------------------------------------------------------------------------
// Letter-shape matching challenge: the student matches each isolated letter to
// its beginning / middle / end shape.
//
//   letter_match_challenges  settings + result of one challenge (the link's row)
//   letter_form_misses       wrong matches per student × shape × letter — the red
//                            numbers on the alphabet table for THAT shape only
//
// Live watching needs no table: the student's device broadcasts snapshots on
// the realtime channel `letter-match:<id>` (see LetterMatchChallenge.tsx).
// Migration: supabase/migrations/20260916_letter_match.sql (anon-writable).
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';

export type MatchForm = 'initial' | 'medial' | 'final';
export type EndReason = 'done' | 'time' | 'lives';

export const LETTER_MATCH_SITE = 'https://www.lisanquran.com';
export const letterMatchUrl = (id: string): string => `${LETTER_MATCH_SITE}/letter-match/${id}`;
export const letterMatchChannel = (id: string): string => `letter-match:${id}`;

export interface LetterMatchChallenge {
  id: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  letters: string[];
  form: MatchForm;
  timerSeconds: number | null;
  lives: number | null;
  status: 'created' | 'playing' | 'completed';
  correct: number | null;
  mistakes: number | null;
  wrongLetters: Record<string, number> | null;
  unmatched: string[] | null;
  endedReason: EndReason | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface Row {
  id: string; teacher_id: string; student_id: string; student_name: string | null;
  letters: string[]; form: MatchForm; timer_seconds: number | null; lives: number | null;
  status: LetterMatchChallenge['status']; correct: number | null; mistakes: number | null;
  wrong_letters: Record<string, number> | null; unmatched: string[] | null;
  ended_reason: EndReason | null; duration_ms: number | null;
  created_at: string; completed_at: string | null;
}

const fromRow = (r: Row): LetterMatchChallenge => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id, studentName: r.student_name ?? undefined,
  letters: r.letters ?? [], form: r.form, timerSeconds: r.timer_seconds, lives: r.lives,
  status: r.status, correct: r.correct, mistakes: r.mistakes, wrongLetters: r.wrong_letters,
  unmatched: r.unmatched, endedReason: r.ended_reason, durationMs: r.duration_ms,
  createdAt: r.created_at, completedAt: r.completed_at,
});

export async function createLetterMatch(input: {
  teacherId: string; studentId: string; studentName: string;
  letters: string[]; form: MatchForm; timerSeconds: number | null; lives: number | null;
}): Promise<LetterMatchChallenge | null> {
  const { data, error } = await supabase.from('letter_match_challenges').insert({
    teacher_id: input.teacherId, student_id: input.studentId, student_name: input.studentName,
    letters: input.letters, form: input.form, timer_seconds: input.timerSeconds, lives: input.lives,
  }).select('*').single();
  if (error) { console.error('createLetterMatch:', error.message); return null; }
  return fromRow(data as Row);
}

export async function getLetterMatch(id: string): Promise<LetterMatchChallenge | null> {
  const { data, error } = await supabase.from('letter_match_challenges').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getLetterMatch:', error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

export async function markLetterMatchStarted(id: string): Promise<void> {
  await supabase.from('letter_match_challenges')
    .update({ status: 'playing', started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'created');
}

export interface LetterMatchResult {
  correct: number;
  mistakes: number;
  wrongLetters: Record<string, number>;
  unmatched: string[];
  endedReason: EndReason;
  durationMs: number;
}

export interface LetterMatchAttempt {
  id: string;
  challengeId: string;
  attemptNo: number;
  correct: number;
  total: number;
  mistakes: number;
  wrongLetters: Record<string, number>;
  unmatched: string[];
  endedReason: EndReason;
  durationMs: number;
  completedAt: string;
}

interface AttemptRow {
  id: string; challenge_id: string; attempt_no: number; correct: number; total: number; mistakes: number;
  wrong_letters: Record<string, number> | null; unmatched: string[] | null; ended_reason: EndReason;
  duration_ms: number; completed_at: string;
}

const attemptFromRow = (r: AttemptRow): LetterMatchAttempt => ({
  id: r.id, challengeId: r.challenge_id, attemptNo: r.attempt_no, correct: r.correct, total: r.total,
  mistakes: r.mistakes, wrongLetters: r.wrong_letters ?? {}, unmatched: r.unmatched ?? [],
  endedReason: r.ended_reason, durationMs: r.duration_ms, completedAt: r.completed_at,
});

export const attemptResult = (a: LetterMatchAttempt): LetterMatchResult => ({
  correct: a.correct, mistakes: a.mistakes, wrongLetters: a.wrongLetters,
  unmatched: a.unmatched, endedReason: a.endedReason, durationMs: a.durationMs,
});

/** Every attempt of a challenge, oldest first. */
export async function listLetterMatchAttempts(challengeId: string): Promise<LetterMatchAttempt[]> {
  const { data, error } = await supabase.from('letter_match_attempts').select('*')
    .eq('challenge_id', challengeId).order('attempt_no', { ascending: true });
  if (error) { console.error('listLetterMatchAttempts:', error.message); return []; }
  return (data as AttemptRow[]).map(attemptFromRow);
}

/** A student's challenges, newest first, each with its attempt count. */
export async function listLetterMatchesForStudent(studentId: string): Promise<Array<LetterMatchChallenge & { attempts: number }>> {
  const { data, error } = await supabase.from('letter_match_challenges')
    .select('*, letter_match_attempts(count)').eq('student_id', studentId)
    .order('created_at', { ascending: false }).limit(30);
  if (error) { console.error('listLetterMatchesForStudent:', error.message); return []; }
  return (data as Array<Row & { letter_match_attempts?: Array<{ count: number }> }>)
    .map(r => ({ ...fromRow(r), attempts: r.letter_match_attempts?.[0]?.count ?? 0 }));
}

/**
 * Save one finished attempt: a new attempts row, the challenge row's latest
 * result, the wrong matches added to the student's per-shape tally, and a note
 * to the tutor. Every attempt counts — a redo is real practice.
 */
export async function completeLetterMatch(ch: LetterMatchChallenge, r: LetterMatchResult): Promise<LetterMatchAttempt | null> {
  const { count } = await supabase.from('letter_match_attempts')
    .select('id', { count: 'exact', head: true }).eq('challenge_id', ch.id);
  const attemptNo = (count ?? 0) + 1;
  const { data, error } = await supabase.from('letter_match_attempts').insert({
    challenge_id: ch.id, attempt_no: attemptNo, correct: r.correct, total: ch.letters.length,
    mistakes: r.mistakes, wrong_letters: r.wrongLetters, unmatched: r.unmatched,
    ended_reason: r.endedReason, duration_ms: r.durationMs,
  }).select('*').single();
  if (error) { console.error('completeLetterMatch attempt:', error.message); return null; }

  await supabase.from('letter_match_challenges').update({
    status: 'completed', correct: r.correct, mistakes: r.mistakes, wrong_letters: r.wrongLetters,
    unmatched: r.unmatched, ended_reason: r.endedReason, duration_ms: r.durationMs,
    completed_at: new Date().toISOString(),
  }).eq('id', ch.id);

  if (Object.keys(r.wrongLetters).length) {
    const { error: e } = await supabase.rpc('bump_letter_form_misses', {
      p_student: ch.studentId, p_form: ch.form, p_counts: r.wrongLetters,
    });
    if (e) console.error('bump_letter_form_misses:', e.message);
  }

  const total = ch.letters.length;
  const why = r.endedReason === 'time' ? ' (time ran out)' : r.endedReason === 'lives' ? ' (out of lives)' : '';
  await createNotification({
    teacherId: ch.teacherId, studentId: ch.studentId, recipient: 'tutor', bookingId: null,
    type: 'letter_match_completed',
    title: attemptNo > 1 ? `Letter shapes challenge — attempt ${attemptNo}` : 'Letter shapes challenge done',
    body: `${ch.studentName ?? 'Your student'} matched ${r.correct} of ${total} letters with ${r.mistakes} mistake${r.mistakes === 1 ? '' : 's'}${why}.`,
    metadata: { challengeId: ch.id, attempt: String(attemptNo) },
  });
  return attemptFromRow(data as AttemptRow);
}

/** Wrong-match tallies for one student: shape → letter → count. */
export type FormMisses = Partial<Record<MatchForm, Record<string, number>>>;

export async function getFormMisses(studentId: string): Promise<FormMisses> {
  if (!studentId) return {};
  const { data, error } = await supabase
    .from('letter_form_misses').select('form, letter, count').eq('student_id', studentId);
  if (error) { console.error('getFormMisses:', error.message); return {}; }
  const out: FormMisses = {};
  for (const r of (data ?? []) as Array<{ form: MatchForm; letter: string; count: number }>) {
    if (r.count <= 0) continue;
    (out[r.form] ??= {})[r.letter] = r.count;
  }
  return out;
}

/** Wipe the tally for one shape — one letter, or all of them. */
export async function clearFormMisses(studentId: string, form: MatchForm, letter?: string): Promise<void> {
  let q = supabase.from('letter_form_misses').delete().eq('student_id', studentId).eq('form', form);
  if (letter) q = q.eq('letter', letter);
  const { error } = await q;
  if (error) console.error('clearFormMisses:', error.message);
}
