// services/letterSoundsService.ts
// ---------------------------------------------------------------------------
// The listening challenge: a Qaedah lesson's vowel, every letter of the
// alphabet, one sound at a time. The student does nothing but listen.
//
// Two ways to run it, and only one of them needs a row in the database:
//
//   together   the tutor opens it on their own screen during the lesson. No
//              row — it is written to the student's logbook instead, the way
//              a finished Qaedah lesson is.
//   by link    a row, so the link can be opened later. Finishing it sends the
//              tutor a notification; it does NOT mark the calendar, because
//              the tutor was not there.
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import type { LetterAudioSet } from './letterAudioService';
import { SET_MARK } from './letterAudioService';

/** The three lessons that have recordings. 'plain' is not a lesson. */
export type Vowel = Extract<LetterAudioSet, 'fatha' | 'kasra' | 'damma'>;

/** Which shape of the letter to draw. Matches MatchForm plus 'isolated'. */
export type LetterForm = 'isolated' | 'initial' | 'medial' | 'final';

export const FORM_LABEL: Record<LetterForm, string> = {
  isolated: 'Alone',
  initial:  'Beginning',
  medial:   'Middle',
  final:    'End',
};

export const VOWEL_LABEL: Record<Vowel, string> = {
  fatha: 'Fatha',
  kasra: 'Kasrah',
  damma: 'Dammah',
};

/**
 * Which vowel a Qaedah topic teaches, or null when it teaches none.
 *
 * Matched on the title rather than the id so the mapping survives the topics
 * being recreated, and so adding the next lesson is a line here. Only these
 * three have recordings today.
 */
export function vowelForTopic(titleEn: string, titleAr?: string): Vowel | null {
  const en = (titleEn ?? '').toLowerCase();
  const ar = titleAr ?? '';
  if (en.includes('fatha') || ar.includes('الفتحة')) return 'fatha';
  if (en.includes('kasrah') || en.includes('kasra') || ar.includes('الكسرة')) return 'kasra';
  if (en.includes('dammah') || en.includes('damma') || ar.includes('الضمة')) return 'damma';
  return null;
}

const ZWJ = '‍';

/** Letters that never join to the left, so they have no initial or medial shape. */
const NON_CONNECTORS = new Set(['ا', 'د', 'ذ', 'ر', 'ز', 'و']);

/**
 * One letter, drawn in a position and carrying its vowel.
 *
 * The joiners go OUTSIDE the vowel mark: the mark belongs to the letter, and
 * putting a ZWJ between them breaks the shaping on iOS.
 */
export function glyphFor(letter: string, form: LetterForm, vowel: Vowel): string {
  let f = form;
  if (NON_CONNECTORS.has(letter)) {
    if (f === 'initial') f = 'isolated';
    if (f === 'medial') f = 'final';
  }
  const body = letter + SET_MARK[vowel];
  switch (f) {
    case 'initial': return body + ZWJ;
    case 'medial':  return ZWJ + body + ZWJ;
    case 'final':   return ZWJ + body;
    default:        return body;
  }
}

/* ── The link ────────────────────────────────────────────────────────── */

export const LETTER_SOUNDS_SITE = 'https://www.lisanquran.com';
export const letterSoundsUrl = (id: string): string => `${LETTER_SOUNDS_SITE}/letter-sounds/${id}`;

export interface LetterSoundChallenge {
  id: string;
  teacherId: string;
  studentId: string;
  studentName: string | null;
  topicId: string;
  topicTitle: string;
  vowel: Vowel;
  form: LetterForm;
  createdAt: string;
  openedAt: string | null;
  finishedAt: string | null;
}

type Row = {
  id: string; teacher_id: string; student_id: string; student_name: string | null;
  topic_id: string; topic_title: string; vowel: Vowel; form: LetterForm;
  created_at: string; opened_at: string | null; finished_at: string | null;
};

const fromRow = (r: Row): LetterSoundChallenge => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id, studentName: r.student_name,
  topicId: r.topic_id, topicTitle: r.topic_title, vowel: r.vowel, form: r.form,
  createdAt: r.created_at, openedAt: r.opened_at, finishedAt: r.finished_at,
});

const COLS = 'id, teacher_id, student_id, student_name, topic_id, topic_title, vowel, form, created_at, opened_at, finished_at';

export async function createLetterSounds(input: {
  teacherId: string; studentId: string; studentName?: string;
  topicId: string; topicTitle: string; vowel: Vowel; form: LetterForm;
}): Promise<LetterSoundChallenge | null> {
  const { data, error } = await supabase.from('letter_sound_challenges').insert({
    teacher_id: input.teacherId,
    student_id: input.studentId,
    student_name: input.studentName ?? null,
    topic_id: input.topicId,
    topic_title: input.topicTitle,
    vowel: input.vowel,
    form: input.form,
  }).select(COLS).single();
  if (error) { console.error('createLetterSounds:', error.message); return null; }
  return fromRow(data as Row);
}

export async function getLetterSounds(id: string): Promise<LetterSoundChallenge | null> {
  const { data, error } = await supabase.from('letter_sound_challenges')
    .select(COLS).eq('id', id).maybeSingle();
  if (error) { console.error('getLetterSounds:', error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

/** First open. Best-effort — never block the student from listening. */
export async function markLetterSoundsOpened(id: string): Promise<void> {
  const { error } = await supabase.from('letter_sound_challenges')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', id).is('opened_at', null);
  if (error) console.error('markLetterSoundsOpened:', error.message);
}

/**
 * They reached the last letter. Tells the tutor, once.
 *
 * `.is('finished_at', null)` in the filter is what makes it once: a second
 * pass through the last letter updates no row, so no second notification.
 */
export async function markLetterSoundsFinished(c: LetterSoundChallenge): Promise<void> {
  const { data, error } = await supabase.from('letter_sound_challenges')
    .update({ finished_at: new Date().toISOString() })
    .eq('id', c.id).is('finished_at', null)
    .select('id');
  if (error) { console.error('markLetterSoundsFinished:', error.message); return; }
  if (!data || data.length === 0) return;      // already finished — stay quiet

  await createNotification({
    teacherId: c.teacherId,
    studentId: c.studentId,
    recipient: 'tutor',
    bookingId: null,
    type: 'letter_sounds_completed',
    title: 'Listened to the letters',
    body: `${c.studentName ?? 'Your student'} listened through ${c.topicTitle} — ${FORM_LABEL[c.form].toLowerCase()}.`,
    metadata: { challengeId: c.id, topicId: c.topicId, vowel: c.vowel, form: c.form },
  });
}
