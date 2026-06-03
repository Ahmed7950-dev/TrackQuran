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
