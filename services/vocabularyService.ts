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
    .upsert({ ...list, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) console.error('saveVocabularyList:', error.message);
};

export const deleteVocabularyList = async (listId: string): Promise<void> => {
  const { error } = await supabase.from('vocabulary_lists').delete().eq('id', listId);
  if (error) console.error('deleteVocabularyList:', error.message);
};
