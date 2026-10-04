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
// Migration: supabase/migrations/20261005_arabic_homework_templates.sql
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabase';
import { getHomeworkItems, createHomeworkItem } from './arabicService';
import { createArabicHomework } from './arabicHomeworkService';
import type { VocabHomework } from './vocabHomeworkService';

export interface HomeworkTemplate {
  id: string;
  teacherId: string;
  title: string;
  topic?: string;
  createdAt: string;
  updatedAt: string;
  /** Filled in by listHomeworkTemplates — how much is in it. */
  itemCount?: number;
  questionCount?: number;
}

interface Row {
  id: string; teacher_id: string; title: string; topic: string | null;
  created_at: string; updated_at: string;
}

const fromRow = (r: Row): HomeworkTemplate => ({
  id: r.id, teacherId: r.teacher_id, title: r.title, topic: r.topic ?? undefined,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

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
  return templates.map(t => ({
    ...t,
    itemCount: counts.get(t.id)?.all ?? 0,
    questionCount: counts.get(t.id)?.questions ?? 0,
  }));
}

export async function createHomeworkTemplate(
  teacherId: string, title: string, topic?: string,
): Promise<HomeworkTemplate | null> {
  const { data, error } = await supabase.from('arabic_homework_templates')
    .insert({ teacher_id: teacherId, title: title.trim() || 'Untitled homework', topic: topic?.trim() || null })
    .select('*').single();
  if (error) { console.error('createHomeworkTemplate:', error.message); return null; }
  return fromRow(data as Row);
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
  const { error } = await supabase.from('arabic_homework_templates').delete().eq('id', id);
  if (error) console.error('deleteHomeworkTemplate:', error.message);
}

/** A copy to change without touching the original — the quickest way to make
 *  the same homework for a different topic or a different level. */
export async function duplicateHomeworkTemplate(
  template: HomeworkTemplate,
): Promise<HomeworkTemplate | null> {
  const copy = await createHomeworkTemplate(template.teacherId, `${template.title} (copy)`, template.topic);
  if (!copy) return null;
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
  return createArabicHomework({
    teacherId: input.teacherId,
    studentId: input.studentId,
    studentName: input.studentName,
    kind: 'custom',
    title: input.template.title,
    deadline: input.deadline,
    lessonId: input.template.id,
  });
}
