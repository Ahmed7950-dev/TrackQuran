import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QaedahTopic {
  id: string;
  titleEn: string;
  titleAr: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface QaedahWord {
  id: string;
  topicId: string;
  word: string;
  level: 1 | 2 | 3;
  orderIndex: number;
  createdAt: string;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

interface TopicRow {
  id: string;
  title_en: string;
  title_ar: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

interface WordRow {
  id: string;
  topic_id: string;
  word: string;
  level: number;
  order_index: number;
  created_at: string;
}

function rowToTopic(r: TopicRow): QaedahTopic {
  return {
    id:         r.id,
    titleEn:    r.title_en,
    titleAr:    r.title_ar ?? '',
    orderIndex: r.order_index,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
  };
}

function rowToWord(r: WordRow): QaedahWord {
  return {
    id:         r.id,
    topicId:    r.topic_id,
    word:       r.word,
    level:      (r.level === 2 ? 2 : r.level === 3 ? 3 : 1) as 1 | 2 | 3,
    orderIndex: r.order_index,
    createdAt:  r.created_at,
  };
}

// ─── Topics CRUD ──────────────────────────────────────────────────────────────

export async function listQaedahTopics(): Promise<QaedahTopic[]> {
  const { data, error } = await supabase
    .from('qaedah_topics')
    .select('*')
    .order('order_index', { ascending: true });
  if (error) { console.error('listQaedahTopics:', error); return []; }
  return (data ?? []).map((r: TopicRow) => rowToTopic(r));
}

export async function createQaedahTopic(input: {
  titleEn: string;
  titleAr?: string;
}): Promise<QaedahTopic | null> {
  const { data: maxRow } = await supabase
    .from('qaedah_topics')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.order_index as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from('qaedah_topics')
    .insert({ title_en: input.titleEn, title_ar: input.titleAr ?? null, order_index: nextOrder })
    .select()
    .single();
  if (error) { console.error('createQaedahTopic:', error); return null; }
  return rowToTopic(data as TopicRow);
}

export async function updateQaedahTopic(
  id: string,
  patch: { titleEn?: string; titleAr?: string; orderIndex?: number },
): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.titleEn   !== undefined) update.title_en    = patch.titleEn;
  if (patch.titleAr   !== undefined) update.title_ar    = patch.titleAr;
  if (patch.orderIndex !== undefined) update.order_index = patch.orderIndex;
  const { error } = await supabase.from('qaedah_topics').update(update).eq('id', id);
  if (error) console.error('updateQaedahTopic:', error);
  return !error;
}

export async function deleteQaedahTopic(id: string): Promise<boolean> {
  const { error } = await supabase.from('qaedah_topics').delete().eq('id', id);
  if (error) console.error('deleteQaedahTopic:', error);
  return !error;
}

export async function reorderQaedahTopics(topics: QaedahTopic[]): Promise<void> {
  await Promise.all(topics.map((t, i) => updateQaedahTopic(t.id, { orderIndex: i + 1 })));
}

// ─── Words CRUD ───────────────────────────────────────────────────────────────

export async function listQaedahWords(topicId: string): Promise<QaedahWord[]> {
  const { data, error } = await supabase
    .from('qaedah_words')
    .select('*')
    .eq('topic_id', topicId)
    .order('order_index', { ascending: true });
  if (error) { console.error('listQaedahWords:', error); return []; }
  return (data ?? []).map((r: WordRow) => rowToWord(r));
}

/** All Qaedah words across every topic — used by games that need a word pool. */
export async function listAllQaedahWords(): Promise<string[]> {
  const { data, error } = await supabase
    .from('qaedah_words')
    .select('word');
  if (error) { console.error('listAllQaedahWords:', error); return []; }
  return (data ?? []).map((r: { word: string }) => r.word).filter(Boolean);
}

export async function createQaedahWord(input: {
  topicId: string;
  word: string;
  level?: 1 | 2 | 3;
}): Promise<QaedahWord | null> {
  const { data: maxRow } = await supabase
    .from('qaedah_words')
    .select('order_index')
    .eq('topic_id', input.topicId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow?.order_index as number | undefined) ?? 0) + 1;

  const { data, error } = await supabase
    .from('qaedah_words')
    .insert({ topic_id: input.topicId, word: input.word, level: input.level ?? 1, order_index: nextOrder })
    .select()
    .single();
  if (error) { console.error('createQaedahWord:', error); return null; }
  return rowToWord(data as WordRow);
}

export async function createQaedahWordsBulk(
  topicId: string,
  words: string[],
  level: 1 | 2 | 3 = 1,
): Promise<number> {
  if (words.length === 0) return 0;

  const { data: maxRow } = await supabase
    .from('qaedah_words')
    .select('order_index')
    .eq('topic_id', topicId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextOrder = ((maxRow?.order_index as number | undefined) ?? 0) + 1;

  const rows = words.map(w => ({ topic_id: topicId, word: w, level, order_index: nextOrder++ }));
  const { error, data } = await supabase.from('qaedah_words').insert(rows).select();
  if (error) { console.error('createQaedahWordsBulk:', error); return 0; }
  return (data ?? []).length;
}

export async function updateQaedahWord(id: string, word: string): Promise<boolean> {
  const { error } = await supabase.from('qaedah_words').update({ word }).eq('id', id);
  if (error) console.error('updateQaedahWord:', error);
  return !error;
}

/** Assign a level to one or more existing words in one DB call. */
export async function updateQaedahWordsLevel(
  ids: string[],
  level: 1 | 2 | 3,
): Promise<boolean> {
  if (ids.length === 0) return true;
  const { error } = await supabase.from('qaedah_words').update({ level }).in('id', ids);
  if (error) console.error('updateQaedahWordsLevel:', error);
  return !error;
}

export async function deleteQaedahWord(id: string): Promise<boolean> {
  const { error } = await supabase.from('qaedah_words').delete().eq('id', id);
  if (error) console.error('deleteQaedahWord:', error);
  return !error;
}

// ─── Practice history ─────────────────────────────────────────────────────────
// Every Correct/Wrong tap during a challenge is one attempt; finishing a
// challenge writes one completion, which is what the progress calendar shows.
// Both tables are anon-writable — the student portal has no auth session.

export interface QaedahAttempt {
  wordId: string;
  correct: boolean;
  at: string;
}

export interface QaedahCompletion {
  id: string;
  topicId: string;
  topicTitle: string;
  wordsCount: number;
  correctCount: number;
  wrongCount: number;
  completedAt: string;
}

/** Fire-and-forget: a wrong answer restarts the queue, so this must not block. */
export async function logQaedahAttempt(
  studentId: string,
  topicId: string,
  wordId: string,
  correct: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('qaedah_attempts')
    .insert({ student_id: studentId, topic_id: topicId, word_id: wordId, correct });
  if (error) console.error('logQaedahAttempt:', error.message);
}

/** Attempts for one lesson, oldest first — the order the squares are drawn in. */
export async function listQaedahAttempts(
  studentId: string,
  topicId: string,
): Promise<QaedahAttempt[]> {
  const { data, error } = await supabase
    .from('qaedah_attempts')
    .select('word_id, correct, created_at')
    .eq('student_id', studentId)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: true });
  if (error) { console.error('listQaedahAttempts:', error.message); return []; }
  return (data ?? []).map((r: { word_id: string; correct: boolean; created_at: string }) =>
    ({ wordId: r.word_id, correct: r.correct, at: r.created_at }));
}

export async function logQaedahCompletion(input: {
  studentId: string;
  topicId: string;
  topicTitle: string;
  wordsCount: number;
  correctCount: number;
  wrongCount: number;
}): Promise<void> {
  const { error } = await supabase.from('qaedah_completions').insert({
    student_id:    input.studentId,
    topic_id:      input.topicId,
    topic_title:   input.topicTitle,
    words_count:   input.wordsCount,
    correct_count: input.correctCount,
    wrong_count:   input.wrongCount,
  });
  if (error) console.error('logQaedahCompletion:', error.message);
}

/** Remove one finished challenge — the tutor deleting it from the day logbook. */
export async function deleteQaedahCompletion(id: string): Promise<boolean> {
  const { error } = await supabase.from('qaedah_completions').delete().eq('id', id);
  if (error) { console.error('deleteQaedahCompletion:', error.message); return false; }
  return true;
}

/**
 * Which DAYS each of these students finished a Qaedah challenge on. One request
 * for the whole roster — the missed-lesson prompt needs it for a handful of
 * students at once, and a per-student call would be a request each.
 * Returns studentId → set of `toDateString()` days.
 */
export async function listQaedahCompletionDays(
  studentIds: string[],
  since: Date,
): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (studentIds.length === 0) return out;
  const { data, error } = await supabase
    .from('qaedah_completions')
    .select('student_id, completed_at')
    .in('student_id', studentIds)
    .gte('completed_at', since.toISOString());
  if (error) { console.error('listQaedahCompletionDays:', error.message); return out; }
  for (const r of (data ?? []) as { student_id: string; completed_at: string }[]) {
    const day = new Date(r.completed_at).toDateString();
    const set = out.get(r.student_id) ?? new Set<string>();
    set.add(day);
    out.set(r.student_id, set);
  }
  return out;
}

/** Finished challenges for a student — one calendar badge each. */
export async function listQaedahCompletions(studentId: string): Promise<QaedahCompletion[]> {
  const { data, error } = await supabase
    .from('qaedah_completions')
    .select('*')
    .eq('student_id', studentId)
    .order('completed_at', { ascending: true });
  if (error) { console.error('listQaedahCompletions:', error.message); return []; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id:           r.id,
    topicId:      r.topic_id,
    topicTitle:   r.topic_title,
    wordsCount:   r.words_count,
    correctCount: r.correct_count,
    wrongCount:   r.wrong_count,
    completedAt:  r.completed_at,
  }));
}
