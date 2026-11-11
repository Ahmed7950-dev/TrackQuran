// services/arabicHomeworkTemplateService.ts
// ---------------------------------------------------------------------------
// The tutor's homework library: a piece of homework written once, on its own
// topic, and given to whichever student needs it.
//
// A template's questions live in homework_items keyed by the template's id,
// exactly as a lesson's homework does — which is the whole point. The builder,
// the student's runner and the marking screen all work on "a lesson_id", so a
// template is simply another id to hand them, and nothing had to be rewritten
// to make standalone homework work.
//
// The library belongs to the TUTOR, not to a student: homework written on one
// student's page is there on every other student's page too.
//
// An entry is one of three KINDS (migration 20261112_speaking_homework.sql):
//   written           questions in homework_items, keyed by the template id
//   pronoun_pictures  one lesson_exercises row, keyed by the template id too —
//                     the same trick, so the Lesson 3 editor, runner and
//                     marking work on it without knowing it is not a lesson
//   speaking          a dialogue kept in `content` on the row itself
//
// And it can be given out two ways: ASSIGNED to one student once, or ADDED TO
// A LESSON (lesson_homework_links), where it is a card in that lesson's
// Homework tab for every student who reaches it. Both are links, not copies.
//
// Migrations: supabase/migrations/20261005_arabic_homework_templates.sql,
//             supabase/migrations/20261112_speaking_homework.sql
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabase';
import { getHomeworkItems, createHomeworkItem } from './arabicService';
import { createArabicHomework } from './arabicHomeworkService';
import type { VocabHomework } from './vocabHomeworkService';
import { emptyRound, emptySlots } from './lessonExerciseService';
import {
  createAttempt, emptyContent, notReadyReason, toContent, type SpeakingContent,
} from './speakingHomeworkService';

export type TemplateKind = 'written' | 'pronoun_pictures' | 'speaking';

export const KIND_LABEL: Record<TemplateKind, string> = {
  written: 'Written questions',
  pronoun_pictures: 'Pronoun pictures',
  speaking: 'Speaking dialogue',
};

export interface HomeworkTemplate {
  id: string;
  teacherId: string;
  title: string;
  topic?: string;
  kind: TemplateKind;
  /** The dialogue, on a speaking homework. */
  speaking?: SpeakingContent;
  createdAt: string;
  updatedAt: string;
  /** Filled in by listHomeworkTemplates — how much is in it. */
  itemCount?: number;
  questionCount?: number;
  /** Rounds in a pronoun exercise. */
  roundCount?: number;
  /** The lessons it has been added to. */
  lessonIds?: string[];
}

interface Row {
  id: string; teacher_id: string; title: string; topic: string | null;
  kind?: TemplateKind | null; content?: unknown;
  created_at: string; updated_at: string;
}

// `kind` is absent on a database the 20261112 migration has not reached yet —
// every entry there is written questions, which is what it defaults to.
const fromRow = (r: Row): HomeworkTemplate => {
  const kind: TemplateKind = r.kind ?? 'written';
  return {
    id: r.id, teacherId: r.teacher_id, title: r.title, topic: r.topic ?? undefined,
    kind, speaking: kind === 'speaking' ? toContent(r.content) : undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
};

/** One entry, by id — a student opening an assigned homework has only that. */
export async function getHomeworkTemplate(id: string): Promise<HomeworkTemplate | null> {
  const { data, error } = await supabase.from('arabic_homework_templates').select('*').eq('id', id).maybeSingle();
  if (error) { console.error('getHomeworkTemplate:', error.message); return null; }
  return data ? fromRow(data as Row) : null;
}

/** Several entries by id, as a map — the Homework tab asks what kind each of
 *  a student's assigned homework is in one go. */
export async function getHomeworkTemplates(ids: string[]): Promise<Map<string, HomeworkTemplate>> {
  const out = new Map<string, HomeworkTemplate>();
  const wanted = [...new Set(ids)].filter(Boolean);
  if (!wanted.length) return out;
  const { data, error } = await supabase.from('arabic_homework_templates').select('*').in('id', wanted);
  if (error) { console.error('getHomeworkTemplates:', error.message); return out; }
  for (const r of data ?? []) { const t = fromRow(r as Row); out.set(t.id, t); }
  return out;
}

/** Every homework this tutor has written, newest change first, each with a
 *  count of what is inside it so the list says something before it is opened. */
export async function listHomeworkTemplates(teacherId: string): Promise<HomeworkTemplate[]> {
  const { data, error } = await supabase
    .from('arabic_homework_templates').select('*')
    .eq('teacher_id', teacherId).order('updated_at', { ascending: false });
  if (error) { console.error('listHomeworkTemplates:', error.message); return []; }
  const templates = (data ?? []).map(r => fromRow(r as Row));
  if (!templates.length) return templates;

  const { data: items } = await supabase
    .from('homework_items').select('lesson_id, item_type')
    .in('lesson_id', templates.map(t => t.id));
  const counts = new Map<string, { all: number; questions: number }>();
  for (const it of (items ?? []) as Array<{ lesson_id: string; item_type: string }>) {
    const c = counts.get(it.lesson_id) ?? { all: 0, questions: 0 };
    c.all += 1;
    if (it.item_type === 'question' || it.item_type === 'picture') c.questions += 1;
    counts.set(it.lesson_id, c);
  }
  // Rounds in each pronoun exercise, and the lessons each entry sits in.
  const ids = templates.map(t => t.id);
  const rounds = new Map<string, number>();
  const pictureIds = templates.filter(t => t.kind === 'pronoun_pictures').map(t => t.id);
  if (pictureIds.length) {
    const { data: exs } = await supabase.from('lesson_exercises').select('lesson_id, rounds').in('lesson_id', pictureIds);
    for (const e of (exs ?? []) as Array<{ lesson_id: string; rounds: unknown }>) {
      rounds.set(e.lesson_id, Array.isArray(e.rounds) ? e.rounds.length : 0);
    }
  }
  const lessonsOf = await lessonsByTemplate(ids);

  return templates.map(t => ({
    ...t,
    itemCount: counts.get(t.id)?.all ?? 0,
    questionCount: counts.get(t.id)?.questions ?? 0,
    roundCount: rounds.get(t.id) ?? 0,
    lessonIds: lessonsOf.get(t.id) ?? [],
  }));
}

export async function createHomeworkTemplate(
  teacherId: string, title: string, topic?: string, kind: TemplateKind = 'written',
): Promise<HomeworkTemplate | null> {
  const clean = title.trim() || 'Untitled homework';
  const row: Record<string, unknown> = { teacher_id: teacherId, title: clean, topic: topic?.trim() || null };
  // Written is the column's default, so it is left unsaid: that insert still
  // works on a database the new columns have not reached.
  if (kind !== 'written') row.kind = kind;
  if (kind === 'speaking') row.content = emptyContent();
  const { data, error } = await supabase.from('arabic_homework_templates').insert(row).select('*').single();
  if (error) { console.error('createHomeworkTemplate:', error.message); return null; }
  const made = fromRow(data as Row);
  if (kind === 'pronoun_pictures') {
    // The exercise itself, keyed by this entry the way a lesson's is by the
    // lesson. Published from the start: here the library IS the draft stage.
    const { error: exErr } = await supabase.from('lesson_exercises')
      .insert({ lesson_id: made.id, title: clean, slots: emptySlots(), rounds: [emptyRound()], published: true });
    if (exErr) {
      console.error('createHomeworkTemplate exercise:', exErr.message);
      await supabase.from('arabic_homework_templates').delete().eq('id', made.id);
      return null;
    }
  }
  return made;
}

export async function updateHomeworkTemplate(
  id: string, patch: { title?: string; topic?: string | null },
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title.trim() || 'Untitled homework';
  if (patch.topic !== undefined) row.topic = patch.topic?.trim() || null;
  const { error } = await supabase.from('arabic_homework_templates').update(row).eq('id', id);
  if (error) console.error('updateHomeworkTemplate:', error.message);
}

/** The template and everything written in it. The items used to go with it
 *  through a foreign key; that key had to go when the column stopped always
 *  naming a lesson, so they are cleared here instead. */
export async function deleteHomeworkTemplate(id: string): Promise<void> {
  const { error: itemErr } = await supabase.from('homework_items').delete().eq('lesson_id', id);
  if (itemErr) console.error('deleteHomeworkTemplate items:', itemErr.message);
  // A pronoun exercise hangs off the entry the same way (its submissions go
  // with it by foreign key); the lesson links go by theirs.
  const { error: exErr } = await supabase.from('lesson_exercises').delete().eq('lesson_id', id);
  if (exErr) console.error('deleteHomeworkTemplate exercise:', exErr.message);
  const { error } = await supabase.from('arabic_homework_templates').delete().eq('id', id);
  if (error) console.error('deleteHomeworkTemplate:', error.message);
}

/** A copy to change without touching the original — the quickest way to make
 *  the same homework for a different topic or a different level. */
export async function duplicateHomeworkTemplate(
  template: HomeworkTemplate,
): Promise<HomeworkTemplate | null> {
  const copy = await createHomeworkTemplate(template.teacherId, `${template.title} (copy)`, template.topic, template.kind);
  if (!copy) return null;
  if (template.kind === 'speaking') {
    // The same recordings and photo, pointed at rather than uploaded again.
    const content = template.speaking ?? emptyContent();
    await supabase.from('arabic_homework_templates').update({ content }).eq('id', copy.id);
    return { ...copy, speaking: content };
  }
  if (template.kind === 'pronoun_pictures') {
    const { data: src } = await supabase.from('lesson_exercises').select('slots, rounds').eq('lesson_id', template.id).maybeSingle();
    if (src) await supabase.from('lesson_exercises').update({ slots: src.slots, rounds: src.rounds }).eq('lesson_id', copy.id);
    return { ...copy, roundCount: Array.isArray(src?.rounds) ? src.rounds.length : 0 };
  }
  const items = await getHomeworkItems(template.id);
  for (const item of items) {
    await createHomeworkItem({
      lessonId: copy.id, itemType: item.itemType, content: item.content,
      imageUrl: item.imageUrl, questionType: item.questionType,
      options: item.options, correctAnswer: item.correctAnswer, marks: item.marks,
    });
  }
  return { ...copy, itemCount: items.length, questionCount: items.filter(i => i.itemType === 'question' || i.itemType === 'picture').length };
}

/** Give it to a student. The homework row points back at the template, so the
 *  student opens the very thing the tutor wrote — and a template edited later
 *  shows the change, the same way lesson homework always has. */
export async function assignHomeworkTemplate(input: {
  template: HomeworkTemplate;
  teacherId: string;
  studentId: string;
  studentName: string;
  deadline: string | null;
}): Promise<VocabHomework> {
  const { template } = input;
  if (template.kind === 'speaking') {
    const why = notReadyReason(template.speaking ?? emptyContent());
    if (why) throw new Error(`This dialogue is not ready to assign. ${why}`);
  }
  const hw = await createArabicHomework({
    teacherId: input.teacherId,
    studentId: input.studentId,
    studentName: input.studentName,
    kind: 'custom',
    title: template.title,
    deadline: input.deadline,
    lessonId: template.id,
  });
  if (template.kind === 'speaking') {
    // His first try is made now, so the dialogue he is asked is the one that
    // was assigned — not whatever it has been edited into by the time he opens it.
    const made = await createAttempt({
      templateId: template.id, title: template.title, content: template.speaking ?? emptyContent(),
      teacherId: input.teacherId, studentId: input.studentId, studentName: input.studentName,
      homeworkId: hw.id,
    });
    if (!made) throw new Error('The homework was assigned but its recording page could not be made. Cancel it and assign again.');
  }
  return hw;
}

/* ── In a lesson ───────────────────────────────────────────────────────── */

/** templateId → the lessons it has been added to. */
export async function lessonsByTemplate(templateIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!templateIds.length) return out;
  const { data, error } = await supabase.from('lesson_homework_links')
    .select('lesson_id, template_id').in('template_id', templateIds);
  // Quiet on a database the table has not reached yet: nothing is in a lesson.
  if (error) { console.warn('lessonsByTemplate:', error.message); return out; }
  for (const r of (data ?? []) as Array<{ lesson_id: string; template_id: string }>) {
    out.set(r.template_id, [...(out.get(r.template_id) ?? []), r.lesson_id]);
  }
  return out;
}

/** The library entries added to one lesson, in the order they were added. */
export async function listLessonHomework(lessonId: string): Promise<HomeworkTemplate[]> {
  const { data, error } = await supabase.from('lesson_homework_links')
    .select('template_id, order_index, created_at').eq('lesson_id', lessonId)
    .order('order_index', { ascending: true }).order('created_at', { ascending: true });
  if (error) { console.warn('listLessonHomework:', error.message); return []; }
  const ids = (data ?? []).map(r => r.template_id as string);
  const byId = await getHomeworkTemplates(ids);
  return ids.map(id => byId.get(id)).filter((t): t is HomeworkTemplate => !!t);
}

export async function addTemplateToLesson(templateId: string, lessonId: string, addedBy: string): Promise<boolean> {
  const { error } = await supabase.from('lesson_homework_links')
    .upsert({ template_id: templateId, lesson_id: lessonId, added_by: addedBy }, { onConflict: 'lesson_id,template_id', ignoreDuplicates: true });
  if (error) { console.error('addTemplateToLesson:', error.message); return false; }
  return true;
}

export async function removeTemplateFromLesson(templateId: string, lessonId: string): Promise<boolean> {
  const { error } = await supabase.from('lesson_homework_links')
    .delete().eq('template_id', templateId).eq('lesson_id', lessonId);
  if (error) { console.error('removeTemplateFromLesson:', error.message); return false; }
  return true;
}
