// services/speakingHomeworkService.ts
// -----------------------------------------------------------------------------
// Speaking homework — a dialogue the student answers out loud.
//
// The tutor builds it in the homework library: ONE photo of a speaker and a
// list of lines, each a recording, its English meaning and a hint for the
// answer. The student hears a line, answers it into the microphone, and goes
// on to the next; when every line has an answer he sends it in. The tutor
// marks each answer right or wrong and sends the wrong ones back, which makes
// a second try holding only those lines — the same shape as the Quran
// recitation homework, and for the same reason: nobody re-records what was
// already right.
//
//   arabic_homework_templates (kind 'speaking', content)   what the tutor wrote
//   speaking_attempts                                       one try by one student
//   storage `speaking-homework/<attempt id>/…`              his answers
//   storage `tajweed-assets/speaking-homework/<template>/…` the speaker's side
//
// Everything a try needs is copied INTO the try when it is made (`lines`), so
// rewriting the dialogue later never changes what a student was asked or what
// the marks beside his answers mean.
//
// Migration: supabase/migrations/20261112_speaking_homework.sql
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';
import { createNotification } from './notificationService';
import { trimToWebmHeader } from './recitationHomeworkService';

/** How long one answer may run. Long enough for a real reply, short enough
 *  that a forgotten microphone does not fill the storage. */
export const MAX_ANSWER_MS = 90_000;
/** Recordings go this long after the whole homework is right… */
export const KEEP_AFTER_PASS_DAYS = 7;
/** …and this long after the last sign of life on one that never got there. */
export const KEEP_ABANDONED_DAYS = 60;

const ANSWER_BUCKET = 'speaking-homework';
const ASSET_BUCKET = 'tajweed-assets';
const SITE = typeof window !== 'undefined' ? window.location.origin : '';

/* ── What the tutor writes ─────────────────────────────────────────────── */

export interface SpeakingLine {
  id: string;
  /** What the speaker says, in English — the student can ask to see it. */
  text: string;
  /** A nudge towards the answer — the student can ask to see that too. */
  hint: string;
  audioUrl: string | null;
  audioMs?: number;
}

export interface SpeakingContent {
  avatarUrl: string | null;
  lines: SpeakingLine[];
}

export const emptyLine = (): SpeakingLine => ({
  id: `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  text: '', hint: '', audioUrl: null,
});

export const emptyContent = (): SpeakingContent => ({ avatarUrl: null, lines: [emptyLine()] });

/** Whatever is in the column, as a usable dialogue. */
export function toContent(raw: unknown): SpeakingContent {
  const c = (raw ?? {}) as Partial<SpeakingContent>;
  return {
    avatarUrl: typeof c.avatarUrl === 'string' && c.avatarUrl ? c.avatarUrl : null,
    lines: Array.isArray(c.lines) ? c.lines.filter(l => l && typeof l.id === 'string').map(l => ({
      id: l.id, text: l.text ?? '', hint: l.hint ?? '', audioUrl: l.audioUrl || null, audioMs: l.audioMs,
    })) : [],
  };
}

/** The lines a student can actually be asked: a line with no recording has
 *  nothing to answer. */
export const playableLines = (c: SpeakingContent): SpeakingLine[] => c.lines.filter(l => !!l.audioUrl);

/** Why this cannot be given to a student yet, or '' when it can. */
export function notReadyReason(c: SpeakingContent): string {
  if (!c.lines.length) return 'Add at least one line.';
  const silent = c.lines.filter(l => !l.audioUrl).length;
  if (silent === c.lines.length) return 'Add the audio for the lines first.';
  if (silent) return `${silent} line${silent === 1 ? ' has' : 's have'} no audio yet.`;
  return '';
}

export async function saveSpeakingContent(templateId: string, content: SpeakingContent): Promise<boolean> {
  const { error } = await supabase.from('arabic_homework_templates')
    .update({ content, updated_at: new Date().toISOString() }).eq('id', templateId);
  if (error) { console.error('saveSpeakingContent:', error.message); return false; }
  return true;
}

/** The photo, shrunk first. It is shown large — up to ~700px wide on a desk —
 *  so it keeps 960px square, which is still only ~150 KB as a JPEG. */
export async function uploadSpeakingAvatar(file: File, templateId: string): Promise<string | null> {
  const blob = await shrinkSquare(file, 960, 0.86).catch(() => file as Blob);
  const path = `speaking-homework/${templateId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(ASSET_BUCKET)
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) { console.error('uploadSpeakingAvatar:', error.message); return null; }
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** A line's audio — a file the tutor picked, or one he just recorded. */
export async function uploadSpeakingLineAudio(blob: Blob, templateId: string, lineId: string): Promise<string | null> {
  const type = (blob.type || 'audio/webm').split(';')[0];
  if (type.includes('webm')) blob = await trimToWebmHeader(blob);
  const ext = type.includes('mpeg') || type.includes('mp3') ? 'mp3'
    : type.includes('mp4') || type.includes('m4a') || type.includes('aac') ? 'm4a'
    : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
  const path = `speaking-homework/${templateId}/${lineId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(ASSET_BUCKET)
    .upload(path, blob, { upsert: true, contentType: type, cacheControl: '31536000' });
  if (error) { console.error('uploadSpeakingLineAudio:', error.message); return null; }
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Centre-crop to a square and take the JPEG back out. */
function shrinkSquare(file: File, size: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const out = Math.min(size, side);
      const c = document.createElement('canvas');
      c.width = out; c.height = out;
      const ctx = c.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
      c.toBlob(b => (b ? resolve(b) : reject(new Error('no blob'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

/* ── One try ───────────────────────────────────────────────────────────── */

export type AttemptStatus = 'open' | 'submitted' | 'needs_revision' | 'passed';

export interface AnswerTake { path: string; url: string; ms: number; at: string }

/** What the student reached for before answering one line. */
export interface LineAids { hint?: boolean; text?: boolean; listens?: number }

export interface LineMark { ok: boolean; note?: string }

/** A line as it stands in ONE try: on a second try it also carries what the
 *  tutor said about the first answer, and that answer. */
export interface AttemptLine extends SpeakingLine {
  note?: string;
  prev?: { url: string; ms: number } | null;
}

export interface SpeakingAttempt {
  id: string;
  rootId: string;
  parentId: string | null;
  templateId: string;
  teacherId: string;
  studentId: string;
  studentName?: string;
  homeworkId: string | null;
  lessonId: string | null;
  title: string;
  avatarUrl: string | null;
  lines: AttemptLine[];
  answers: Record<string, AnswerTake>;
  aids: Record<string, LineAids>;
  marks: Record<string, LineMark>;
  status: AttemptStatus;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  purgedAt: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const fromRow = (r: any): SpeakingAttempt => ({
  id: r.id, rootId: r.root_id ?? r.id, parentId: r.parent_id ?? null,
  templateId: r.template_id, teacherId: r.teacher_id, studentId: r.student_id,
  studentName: r.student_name ?? undefined,
  homeworkId: r.homework_id ?? null, lessonId: r.lesson_id ?? null,
  title: r.title ?? 'Speaking homework', avatarUrl: r.avatar_url ?? null,
  lines: Array.isArray(r.lines) ? r.lines : [],
  answers: r.answers ?? {}, aids: r.aids ?? {}, marks: r.marks ?? {},
  status: r.status ?? 'open',
  createdAt: r.created_at, submittedAt: r.submitted_at ?? null,
  reviewedAt: r.reviewed_at ?? null, purgedAt: r.purged_at ?? null,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The link a student opens to do it — no session needed. */
export const speakUrl = (attemptId: string): string => `${SITE}/speak/${attemptId}`;

export const answeredCount = (a: SpeakingAttempt): number => a.lines.filter(l => a.answers[l.id]).length;
export const isFullyAnswered = (a: SpeakingAttempt): boolean =>
  a.lines.length > 0 && a.lines.every(l => !!a.answers[l.id]);
export const wrongLines = (a: SpeakingAttempt, marks = a.marks): AttemptLine[] =>
  a.lines.filter(l => marks[l.id] && !marks[l.id].ok);
export const unmarkedCount = (a: SpeakingAttempt, marks = a.marks): number =>
  a.lines.filter(l => !marks[l.id]).length;

export async function getAttempt(id: string): Promise<SpeakingAttempt | null> {
  const { data, error } = await supabase.from('speaking_attempts').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getAttempt:', error.message); return null; }
  return data ? fromRow(data) : null;
}

/** Every try by one student, oldest first — the Homework tab groups them. */
export async function listAttemptsForStudent(studentId: string): Promise<SpeakingAttempt[]> {
  const { data, error } = await supabase.from('speaking_attempts').select('*')
    .eq('student_id', studentId).order('created_at', { ascending: true });
  if (error) { console.error('listAttemptsForStudent:', error.message); return []; }
  return (data ?? []).map(fromRow);
}

/** Every try over one homework, oldest first. */
export async function listChain(rootId: string): Promise<SpeakingAttempt[]> {
  const { data, error } = await supabase.from('speaking_attempts').select('*')
    .eq('root_id', rootId).order('created_at', { ascending: true });
  if (error) { console.error('listChain:', error.message); return []; }
  return (data ?? []).map(fromRow);
}

/** The tries over one homework, in order, grouped by the first of them. */
export interface SpeakingChain {
  rootId: string;
  tries: SpeakingAttempt[];
  /** The one that matters now: the last. */
  latest: SpeakingAttempt;
  /** Every line of the homework is right. */
  passed: boolean;
}

export function toChains(attempts: SpeakingAttempt[]): SpeakingChain[] {
  const by = new Map<string, SpeakingAttempt[]>();
  for (const a of attempts) {
    const list = by.get(a.rootId) ?? [];
    list.push(a);
    by.set(a.rootId, list);
  }
  return [...by.entries()].map(([rootId, tries]) => {
    tries.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    const latest = tries[tries.length - 1];
    return { rootId, tries, latest, passed: latest.status === 'passed' };
  }).sort((x, y) => y.latest.createdAt.localeCompare(x.latest.createdAt));
}

/** Where every line of the homework stands across all the tries: the first
 *  try's lines, each with the last VERDICT given on it. A line sent back stays
 *  'no' while its redo is being recorded or waiting to be marked — it is not
 *  unmarked, it is wrong until someone says otherwise. */
export function chainProgress(chain: SpeakingChain): Array<{ id: string; state: 'ok' | 'no' | 'wait' }> {
  const first = chain.tries[0];
  return first.lines.map(l => {
    let state: 'ok' | 'no' | 'wait' = 'wait';
    for (const t of chain.tries) {
      const marked = t.status === 'passed' || t.status === 'needs_revision';
      const m = t.marks[l.id];
      if (marked && m && t.lines.some(x => x.id === l.id)) state = m.ok ? 'ok' : 'no';
    }
    return { id: l.id, state };
  });
}

/** Start a first try. `lines` are copied in from the homework as it is now. */
export async function createAttempt(input: {
  templateId: string; title: string; content: SpeakingContent;
  teacherId: string; studentId: string; studentName?: string;
  homeworkId?: string | null; lessonId?: string | null;
}): Promise<SpeakingAttempt | null> {
  const lines = playableLines(input.content);
  if (!lines.length) return null;
  const id = crypto.randomUUID();
  const { data, error } = await supabase.from('speaking_attempts').insert({
    id, root_id: id, template_id: input.templateId, teacher_id: input.teacherId,
    student_id: input.studentId, student_name: input.studentName ?? null,
    homework_id: input.homeworkId ?? null, lesson_id: input.lessonId ?? null,
    title: input.title, avatar_url: input.content.avatarUrl, lines,
  }).select('*').single();
  if (error) { console.error('createAttempt:', error.message); return null; }
  return fromRow(data);
}

/**
 * The try a student should be on when he opens this homework from a lesson:
 * the last try of his unfinished go at it if there is one, otherwise a new
 * first try. A finished one is left alone — opening the card again starts over,
 * because a lesson's homework is there to be practised more than once.
 */
export async function openLessonAttempt(input: {
  templateId: string; title: string; content: SpeakingContent; lessonId: string;
  teacherId: string; studentId: string; studentName?: string;
}): Promise<SpeakingAttempt | null> {
  const { data, error } = await supabase.from('speaking_attempts').select('*')
    .eq('template_id', input.templateId).eq('student_id', input.studentId)
    .eq('lesson_id', input.lessonId).is('homework_id', null)
    .order('created_at', { ascending: true });
  if (error) { console.error('openLessonAttempt:', error.message); return null; }
  const chains = toChains((data ?? []).map(fromRow));
  const unfinished = chains.find(c => !c.passed);
  if (unfinished) return unfinished.latest;
  return createAttempt(input);
}

/** The try behind an assigned homework — the last of its chain. */
export async function getAttemptForHomework(homeworkId: string): Promise<SpeakingAttempt | null> {
  const { data, error } = await supabase.from('speaking_attempts').select('*')
    .eq('homework_id', homeworkId).order('created_at', { ascending: false }).limit(1);
  if (error) { console.error('getAttemptForHomework:', error.message); return null; }
  return data?.[0] ? fromRow(data[0]) : null;
}

/* ── The student's side ────────────────────────────────────────────────── */

/**
 * Keep one answer. The new file replaces the old one — an answer recorded
 * again is the answer, and the take it replaces would only be storage nobody
 * will ever listen to.
 */
export async function saveAnswer(
  attemptId: string, lineId: string, blob: Blob, ms: number,
): Promise<SpeakingAttempt | null> {
  blob = await trimToWebmHeader(blob);
  const type = (blob.type || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  const path = `${attemptId}/${lineId}-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(ANSWER_BUCKET).upload(path, blob, {
    contentType: type, cacheControl: '31536000', upsert: false,
  });
  if (upErr) { console.error('saveAnswer upload:', upErr.message); return null; }
  const url = supabase.storage.from(ANSWER_BUCKET).getPublicUrl(path).data.publicUrl;

  const current = await getAttempt(attemptId);
  if (!current || current.status !== 'open') {
    await supabase.storage.from(ANSWER_BUCKET).remove([path]);
    return null;
  }
  const previous = current.answers[lineId];
  const answers = { ...current.answers, [lineId]: { path, url, ms, at: new Date().toISOString() } };
  const { data, error } = await supabase.from('speaking_attempts')
    .update({ answers }).eq('id', attemptId).select('*').single();
  if (error) {
    console.error('saveAnswer row:', error.message);
    await supabase.storage.from(ANSWER_BUCKET).remove([path]);
    return null;
  }
  if (previous?.path) await supabase.storage.from(ANSWER_BUCKET).remove([previous.path]);
  return fromRow(data);
}

/** What he opened and how often he listened. Best effort — it is a note for
 *  the tutor, and never worth interrupting an answer for. */
export async function saveAids(attemptId: string, aids: Record<string, LineAids>): Promise<void> {
  const { error } = await supabase.from('speaking_attempts').update({ aids }).eq('id', attemptId).eq('status', 'open');
  if (error) console.error('saveAids:', error.message);
}

/** Hand it in. Refused unless every line has an answer. */
export async function submitAttempt(attempt: SpeakingAttempt): Promise<SpeakingAttempt | null> {
  const fresh = await getAttempt(attempt.id);
  if (!fresh || fresh.status !== 'open' || !isFullyAnswered(fresh)) return null;
  const { data, error } = await supabase.from('speaking_attempts')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', attempt.id).eq('status', 'open').select('*').single();
  if (error) { console.error('submitAttempt:', error.message); return null; }
  const done = fromRow(data);
  const n = done.lines.length;
  await createNotification({
    teacherId: done.teacherId, studentId: done.studentId, recipient: 'tutor', bookingId: null,
    type: 'speaking_homework_submitted',
    title: `${done.studentName ?? 'Your student'} has completed his speaking homework`,
    body: `${done.title} · ${n} line${n === 1 ? '' : 's'}${done.parentId ? ' redone' : ''}. Tap to listen and mark.`,
    metadata: { attemptId: done.id },
  });
  return done;
}

/* ── The tutor's side ──────────────────────────────────────────────────── */

/** Marks as they stand, so a tutor called away mid-marking loses nothing. */
export async function saveMarks(attemptId: string, marks: Record<string, LineMark>): Promise<boolean> {
  const { error } = await supabase.from('speaking_attempts').update({ marks }).eq('id', attemptId);
  if (error) { console.error('saveMarks:', error.message); return false; }
  return true;
}

/** The student's bell is keyed by his share link, not his row. */
async function studentBellId(studentId: string): Promise<string | null> {
  const { data } = await supabase.from('arabic_students').select('share_token').eq('id', studentId).maybeSingle();
  if (data?.share_token) return data.share_token as string;
  return (await import('./arabicService')).ensureShareTokenById(studentId);
}

/** Every line right: the homework is finished, for good. */
export async function passAttempt(
  attempt: SpeakingAttempt, marks: Record<string, LineMark>,
): Promise<SpeakingAttempt | null> {
  if (attempt.lines.some(l => !marks[l.id]?.ok)) return null;
  const { data, error } = await supabase.from('speaking_attempts')
    .update({ marks, status: 'passed', reviewed_at: new Date().toISOString() })
    .eq('id', attempt.id).select('*').single();
  if (error) { console.error('passAttempt:', error.message); return null; }
  const done = fromRow(data);
  if (done.homeworkId) {
    const { error: hwErr } = await supabase.from('arabic_vocab_homework')
      .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', done.homeworkId).eq('status', 'assigned');
    if (hwErr) console.error('passAttempt homework:', hwErr.message);
  }
  const bell = await studentBellId(done.studentId).catch(() => null);
  if (bell) {
    await createNotification({
      teacherId: done.teacherId, studentId: bell, recipient: 'student', bookingId: null,
      type: 'speaking_homework_reviewed',
      title: 'Speaking homework — all correct',
      body: `Well done! Every line of “${done.title}” is right.`,
      metadata: { attemptId: done.id, url: speakUrl(done.id) },
    });
  }
  return done;
}

/**
 * Send the wrong lines back. This try is closed as "needs revision" and a new
 * one is made holding only those lines, each with the tutor's note and the
 * answer it replaces — so the student hears what he said, reads why it was
 * wrong, and records that line and nothing else.
 */
export async function reassignWrongLines(
  attempt: SpeakingAttempt, marks: Record<string, LineMark>,
): Promise<{ closed: SpeakingAttempt; next: SpeakingAttempt } | null> {
  const wrong = wrongLines(attempt, marks);
  if (!wrong.length || unmarkedCount(attempt, marks) > 0) return null;

  const lines: AttemptLine[] = wrong.map(l => ({
    id: l.id, text: l.text, hint: l.hint, audioUrl: l.audioUrl, audioMs: l.audioMs,
    note: (marks[l.id]?.note ?? '').trim() || undefined,
    prev: attempt.answers[l.id] ? { url: attempt.answers[l.id].url, ms: attempt.answers[l.id].ms } : null,
  }));
  const { data: child, error: childErr } = await supabase.from('speaking_attempts').insert({
    root_id: attempt.rootId, parent_id: attempt.id, template_id: attempt.templateId,
    teacher_id: attempt.teacherId, student_id: attempt.studentId, student_name: attempt.studentName ?? null,
    homework_id: attempt.homeworkId, lesson_id: attempt.lessonId,
    title: attempt.title, avatar_url: attempt.avatarUrl, lines,
  }).select('*').single();
  if (childErr) { console.error('reassignWrongLines child:', childErr.message); return null; }

  const { data, error } = await supabase.from('speaking_attempts')
    .update({ marks, status: 'needs_revision', reviewed_at: new Date().toISOString() })
    .eq('id', attempt.id).select('*').single();
  if (error) {
    console.error('reassignWrongLines:', error.message);
    await supabase.from('speaking_attempts').delete().eq('id', child.id);
    return null;
  }
  const next = fromRow(child);
  const total = attempt.lines.length;
  const bell = await studentBellId(attempt.studentId).catch(() => null);
  if (bell) {
    await createNotification({
      teacherId: attempt.teacherId, studentId: bell, recipient: 'student', bookingId: null,
      type: 'speaking_homework_reviewed',
      title: 'Speaking homework — a little more to do',
      body: `Your teacher marked “${attempt.title}”: ${total - wrong.length} of ${total} right. Tap to redo the other ${wrong.length === 1 ? 'line' : `${wrong.length} lines`}.`,
      metadata: { attemptId: next.id, url: speakUrl(next.id) },
    });
  }
  return { closed: fromRow(data), next };
}

/** Take a whole go at a homework away — every try and every recording. */
export async function deleteChain(rootId: string): Promise<boolean> {
  const { data } = await supabase.from('speaking_attempts').select('*').eq('root_id', rootId);
  const paths = (data ?? []).map(fromRow).flatMap(a => Object.values(a.answers).map(t => t.path)).filter(Boolean);
  if (paths.length) await supabase.storage.from(ANSWER_BUCKET).remove(paths);
  const { error } = await supabase.from('speaking_attempts').delete().eq('root_id', rootId);
  if (error) { console.error('deleteChain:', error.message); return false; }
  return true;
}

/* ── Keeping the storage small ─────────────────────────────────────────── */

/**
 * Clear the recordings nobody needs any more: every try of a homework that
 * was finished more than a week ago, and every try of one that has shown no
 * sign of life for two months. The rows stay — the marks and the notes are the
 * record — only the audio goes. Runs once per tutor app load.
 */
export async function purgeOldSpeaking(teacherId: string): Promise<number> {
  const { data, error } = await supabase.from('speaking_attempts').select('*')
    .eq('teacher_id', teacherId).is('purged_at', null);
  if (error) { console.warn('purgeOldSpeaking:', error.message); return 0; }
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  let n = 0;
  for (const chain of toChains((data ?? []).map(fromRow))) {
    const lastSign = Math.max(...chain.tries.map(t =>
      Date.parse(t.reviewedAt ?? t.submittedAt ?? t.createdAt)));
    const due = chain.passed
      ? now - Date.parse(chain.latest.reviewedAt ?? chain.latest.createdAt) > KEEP_AFTER_PASS_DAYS * day
      : now - lastSign > KEEP_ABANDONED_DAYS * day;
    if (!due) continue;
    for (const t of chain.tries) {
      const paths = Object.values(t.answers).map(a => a.path).filter(Boolean);
      if (paths.length) {
        const { error: rmErr } = await supabase.storage.from(ANSWER_BUCKET).remove(paths);
        if (rmErr) { console.warn('purgeOldSpeaking remove:', rmErr.message); continue; }
      }
      await supabase.from('speaking_attempts')
        .update({ answers: {}, purged_at: new Date().toISOString() }).eq('id', t.id);
      n++;
    }
  }
  return n;
}
