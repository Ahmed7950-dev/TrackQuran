import { supabase } from '../lib/supabase';

export interface GrammarNote {
  id: string;
  indices: number[];
  note: string;
  needsStudy: boolean;
}

export interface VocabWord {
  id: string;
  text: string;
  translation: string;
  transliteration: string;
  clicks: number; // 0=normal, 1=practice more, 2=practice most
  category: string;
}

export interface VocabPhrase {
  id: string;
  text: string;
  translation: string;
  clicks: number;
  grammarNotes: GrammarNote[];
}

export interface VocabList {
  id: string;
  student_id: string;
  name: string;
  words: VocabWord[];
  phrases: VocabPhrase[];
  /** ISO date strings for each completed practice session, up to 5 (spaced-rep schedule) */
  srs_attempts?: string[];
  created_at: string;
  updated_at: string;
}

export const getVocabularyLists = async (studentId: string): Promise<VocabList[]> => {
  const { data, error } = await supabase
    .from('vocabulary_lists')
    .select('*')
    .eq('student_id', studentId)
    .order('updated_at', { ascending: false });
  if (error) { console.error('getVocabularyLists:', error.message); return []; }
  return (data ?? []) as VocabList[];
};

export const saveVocabularyList = async (list: Omit<VocabList, 'created_at' | 'updated_at'>): Promise<void> => {
  const { error } = await supabase
    .from('vocabulary_lists')
    .upsert({
      ...list,
      srs_attempts: list.srs_attempts ?? [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (error) console.error('saveVocabularyList:', error.message);
};

export const deleteVocabularyList = async (listId: string): Promise<void> => {
  const { error } = await supabase.from('vocabulary_lists').delete().eq('id', listId);
  if (error) console.error('deleteVocabularyList:', error.message);
};

/** Returns total custom-vocab word count keyed by student_id, for a batch of students. */
export const getCustomVocabWordCountsForStudents = async (
  studentIds: string[]
): Promise<Record<string, number>> => {
  if (studentIds.length === 0) return {};
  const { data, error } = await supabase
    .from('vocabulary_lists')
    .select('student_id, words')
    .in('student_id', studentIds);
  if (error) { console.error('getCustomVocabWordCountsForStudents:', error.message); return {}; }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.student_id] = (counts[row.student_id] ?? 0) + ((row.words as any[])?.length ?? 0);
  }
  return counts;
};

/** Returns total custom-vocab word count for a single student. */
export const getCustomVocabWordCount = async (studentId: string): Promise<number> => {
  const counts = await getCustomVocabWordCountsForStudents([studentId]);
  return counts[studentId] ?? 0;
};

/** The list words added from the Free Talk tab go into (made the first time). */
export const FREE_TALK_LIST_NAME = 'Free Talk words';

/** Add one word to the student's "Free Talk words" list, creating the list if
 *  needed. Returns an error message, or null when saved: a word typed during a
 *  conversation must not vanish quietly. */
export const addWordToFreeTalkList = async (
  studentId: string,
  word: { text: string; translation: string; transliteration: string },
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('vocabulary_lists').select('*')
    .eq('student_id', studentId).eq('name', FREE_TALK_LIST_NAME)
    .order('created_at', { ascending: true }).limit(1);
  if (error) return error.message;
  const now = new Date().toISOString();
  const existing = (data ?? [])[0] as VocabList | undefined;
  const entry: VocabWord = {
    id: crypto.randomUUID(), text: word.text.trim(), translation: word.translation.trim(),
    transliteration: word.transliteration.trim(), clicks: 0, category: 'other',
  };
  const row = existing
    ? { ...existing, words: [...(existing.words ?? []), entry], updated_at: now }
    : { id: crypto.randomUUID(), student_id: studentId, name: FREE_TALK_LIST_NAME, words: [entry], phrases: [], srs_attempts: [], created_at: now, updated_at: now };
  const { error: saveErr } = await supabase.from('vocabulary_lists').upsert(row, { onConflict: 'id' });
  return saveErr ? saveErr.message : null;
};

/** Change one word of a word list (Free Talk: the (i) of a found word). Reads
 *  the list fresh so a word added meanwhile on the other side is kept.
 *  Returns an error message, or null when saved. */
export const updateListWord = async (
  listId: string, wordId: string,
  word: { text: string; translation: string; transliteration: string },
): Promise<string | null> => {
  const { data, error } = await supabase.from('vocabulary_lists').select('words').eq('id', listId).maybeSingle();
  if (error) return error.message;
  if (!data) return 'That word list is gone.';
  const words = (data.words ?? []) as VocabWord[];
  if (!words.some(w => w.id === wordId)) return 'That word is not in the list any more.';
  const next = words.map(w => (w.id === wordId
    ? { ...w, text: word.text.trim(), translation: word.translation.trim(), transliteration: word.transliteration.trim() }
    : w));
  const { error: saveErr } = await supabase.from('vocabulary_lists')
    .update({ words: next, updated_at: new Date().toISOString() }).eq('id', listId);
  return saveErr ? saveErr.message : null;
};

/** Take one word out of a word list. Returns an error message, or null. */
export const removeListWord = async (listId: string, wordId: string): Promise<string | null> => {
  const { data, error } = await supabase.from('vocabulary_lists').select('words').eq('id', listId).maybeSingle();
  if (error) return error.message;
  if (!data) return 'That word list is gone.';
  const words = (data.words ?? []) as VocabWord[];
  const { error: saveErr } = await supabase.from('vocabulary_lists')
    .update({ words: words.filter(w => w.id !== wordId), updated_at: new Date().toISOString() }).eq('id', listId);
  return saveErr ? saveErr.message : null;
};
