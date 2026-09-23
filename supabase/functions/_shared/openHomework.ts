/**
 * What a student still has to do — shared by the two push reminders
 * (lesson-reminders, 20 minutes before a lesson; homework-reminders, the daily
 * nudge), so both agree on what counts as "not done yet".
 */
import { SURAH_NAMES } from './surahNames.ts';

/** Homework older than this is treated as abandoned, not outstanding. */
export const RECENT_DAYS = 30;

export const surahName = (n: number) => SURAH_NAMES[n - 1] ?? `Surah ${n}`;

export const rangeLabel = (h: { startSurah: number; startAyah: number; endSurah: number; endAyah: number }) =>
  h.startSurah === h.endSurah
    ? `${surahName(h.startSurah)} ${h.startAyah}–${h.endAyah}`
    : `${surahName(h.startSurah)} ${h.startAyah} – ${surahName(h.endSurah)} ${h.endAyah}`;

export const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export interface OpenHomework { items: string[]; reciteId?: string }

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Who these ids are. A student_id is students.id (Quran) or arabic_students.id
 * (Arabic); an Arabic portal registers its phone under the share token, so
 * `pushIdOf` maps across.
 */
export async function loadStudents(db: any, ids: string[]) {
  const [{ data: quran }, { data: arabic }] = await Promise.all([
    db.from('students').select('id, name, teacher_id, timezone, quran_homework').in('id', ids),
    db.from('arabic_students').select('id, name, share_token, timezone, completed_lesson_ids').in('id', ids),
  ]);
  const quranById = new Map<string, any>((quran ?? []).map((q: any) => [q.id, q]));
  const arabicById = new Map<string, any>((arabic ?? []).map((a: any) => [a.id, a]));
  const pushIdOf = (studentId: string): string | null =>
    quranById.has(studentId) ? studentId : (arabicById.get(studentId)?.share_token ?? null);
  return { quranById, arabicById, pushIdOf };
}

/**
 * Everything still open for these students: recorded and prepared Quran
 * homework, the last Arabic lesson's homework, vocabulary, letter shapes.
 * `sinceIso` is the oldest assignment date still worth mentioning.
 */
export async function loadOpenHomework(
  db: any, studentIds: string[], sinceIso: string,
  quranById: Map<string, any>, arabicById: Map<string, any>,
) {
  const quranIds = studentIds.filter(id => quranById.has(id));
  const arabicIds = studentIds.filter(id => arabicById.has(id));

  const recitationIds = quranIds.flatMap(id =>
    ((quranById.get(id)?.quran_homework ?? []) as any[]).map(h => h.recitationId).filter(Boolean));

  const [recitations, vocab, letterMatch, lessonHw, completions, reports] = await Promise.all([
    recitationIds.length
      ? db.from('quran_recitation_homework').select('id, status').in('id', recitationIds)
      : Promise.resolve({ data: [] as any[] }),
    arabicIds.length
      ? db.from('arabic_vocab_homework').select('student_id, words').in('student_id', arabicIds).eq('status', 'assigned').gte('created_at', sinceIso)
      : Promise.resolve({ data: [] as any[] }),
    studentIds.length
      ? db.from('letter_match_challenges').select('student_id').in('student_id', studentIds).neq('status', 'completed').gte('created_at', sinceIso)
      : Promise.resolve({ data: [] as any[] }),
    arabicIds.length
      ? db.from('arabic_lesson_homework').select('lesson_id').in('lesson_id',
          [...new Set(arabicIds.flatMap(id => arabicById.get(id)?.completed_lesson_ids ?? []))])
      : Promise.resolve({ data: [] as any[] }),
    arabicIds.length
      ? db.from('arabic_homework_completions').select('student_id, lesson_id')
          .in('student_id', [...arabicIds, ...arabicIds.map(id => arabicById.get(id)?.share_token).filter(Boolean)])
      : Promise.resolve({ data: [] as any[] }),
    quranIds.length
      ? db.from('shared_reports').select('id, student_id, created_at').in('student_id', quranIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const recitationStatus = new Map((recitations.data ?? []).map((r: any) => [r.id, r.status]));
  const lessonsWithHw = new Set((lessonHw.data ?? []).map((r: any) => r.lesson_id));
  const doneLessons = new Set((completions.data ?? []).map((r: any) => `${r.student_id}|${r.lesson_id}`));
  const reportOf = new Map<string, string>();
  for (const r of (reports.data ?? []) as any[]) if (!reportOf.has(r.student_id)) reportOf.set(r.student_id, r.id);

  // Titles only for lessons we might mention.
  const lastLessonIds = arabicIds
    .map(id => [...(arabicById.get(id)?.completed_lesson_ids ?? [])].reverse().find((l: string) => lessonsWithHw.has(l)))
    .filter(Boolean) as string[];
  const { data: lessonRows } = lastLessonIds.length
    ? await db.from('arabic_lessons').select('id, title').in('id', lastLessonIds)
    : { data: [] as any[] };
  const lessonTitle = new Map((lessonRows ?? []).map((l: any) => [l.id, l.title]));

  const homeworkFor = (studentId: string): OpenHomework => {
    const items: string[] = [];
    let reciteId: string | undefined;

    const q = quranById.get(studentId);
    if (q) {
      for (const h of (q.quran_homework ?? []) as any[]) {
        if (h.isDone || (h.assignedAt && h.assignedAt < sinceIso)) continue;
        if (h.recitationId) {
          // Recorded homework is only open while it has not been submitted.
          if (recitationStatus.get(h.recitationId) !== 'assigned') continue;
          items.push(`record ${rangeLabel(h)}`);
          reciteId ??= h.recitationId;
        } else {
          items.push(`prepare ${rangeLabel(h)}`);
        }
      }
    }

    const a = arabicById.get(studentId);
    if (a) {
      // The homework from the most recently covered lesson, if not done.
      const last = [...(a.completed_lesson_ids ?? [])].reverse().find((l: string) => lessonsWithHw.has(l));
      if (last && !doneLessons.has(`${a.id}|${last}`) && !doneLessons.has(`${a.share_token}|${last}`)) {
        items.push(`the homework for "${lessonTitle.get(last) ?? 'your last lesson'}"`);
      }
      for (const v of (vocab.data ?? []) as any[]) {
        if (v.student_id === a.id) items.push(`your vocabulary homework (${(v.words ?? []).length} words)`);
      }
    }

    if ((letterMatch.data ?? []).some((m: any) => m.student_id === studentId)) items.push('your letter shapes challenge');
    return { items, reciteId };
  };

  return { homeworkFor, reportOf };
}

/** Where a student should land when they tap the push. */
export function pushUrl(opts: { isQuran: boolean; reciteId?: string; reportId?: string; pushId: string }): string {
  if (opts.reciteId) return `/recite/${opts.reciteId}`;
  if (opts.isQuran) return opts.reportId ? `/report/${opts.reportId}` : '/';
  return `/arabic/s/${opts.pushId}`;
}
