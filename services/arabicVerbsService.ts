// ─────────────────────────────────────────────────────────────────────────────
// Verbs — conjugation tables a tutor writes for ONE student (table
// arabic_verbs, keyed by student_id), plus each student's reading choice
// (arabic_verb_prefs). Migrations: supabase/migrations/20261116_arabic_verbs.sql
// and 20261117_arabic_verbs_per_student.sql (verbs are not shared).
//
// The tutor writes to the table; the student writes through two functions
// that take their link token (20261118_arabic_verbs_student_write.sql).
//
// Every write returns an error message instead of failing quietly: a verb
// typed out cell by cell must never vanish without the tutor knowing.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../lib/supabase';

export type VerbVariety = 'levantine' | 'msa';
export type VerbScript = 'arabic' | 'translit';
export type TenseKey = 'past' | 'present' | 'imperative';
export const TENSES: TenseKey[] = ['past', 'present', 'imperative'];

export interface VerbCell { ar?: string; tr?: string }
export interface VerbTable {
  dual: boolean;
  plural: boolean;
  cells: Record<string, VerbCell>;   // pronoun key → both writings
}
export interface ArabicVerb {
  id: string;
  teacherId: string;
  studentId: string;
  variety: VerbVariety;
  meaning: string;
  conjugations: Partial<Record<TenseKey, VerbTable>>;
  createdAt: string;
  updatedAt: string;
}
export interface VerbPrefs { script: VerbScript; variety: VerbVariety }

const fromRow = (r: any): ArabicVerb => ({
  id: r.id, teacherId: r.teacher_id, studentId: r.student_id, variety: r.variety, meaning: r.meaning,
  conjugations: r.conjugations ?? {}, createdAt: r.created_at, updatedAt: r.updated_at,
});

/** One student's verbs of one variety, oldest first (the order they were added). */
export async function listVerbs(studentId: string, variety: VerbVariety): Promise<ArabicVerb[]> {
  const { data, error } = await supabase
    .from('arabic_verbs')
    .select('*')
    .eq('student_id', studentId)
    .eq('variety', variety)
    .order('created_at', { ascending: true });
  if (error) { console.error('listVerbs:', error.message); return []; }
  return (data ?? []).map(fromRow);
}

/** Insert (no id) or update a verb. Returns the saved verb, or an error message.
 *  `studentToken` = the student is the one writing (their portal has no
 *  sign-in): it goes through student_save_verb, which only touches their verbs. */
export async function saveVerb(
  v: Omit<ArabicVerb, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  studentToken?: string,
): Promise<ArabicVerb | string> {
  if (studentToken) {
    const { data, error } = await supabase.rpc('student_save_verb', {
      p_token: studentToken, p_id: v.id ?? null, p_variety: v.variety,
      p_meaning: v.meaning.trim(), p_conjugations: v.conjugations,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return error?.message ?? 'The verb was not saved.';
    return fromRow(row);
  }
  const row = {
    teacher_id: v.teacherId, student_id: v.studentId, variety: v.variety, meaning: v.meaning.trim(),
    conjugations: v.conjugations, updated_at: new Date().toISOString(),
  };
  const q = v.id
    ? supabase.from('arabic_verbs').update(row).eq('id', v.id).select('*').single()
    : supabase.from('arabic_verbs').insert(row).select('*').single();
  const { data, error } = await q;
  if (error || !data) return error?.message ?? 'The verb was not saved.';
  return fromRow(data);
}

export async function deleteVerb(id: string, studentToken?: string): Promise<string | null> {
  if (studentToken) {
    const { error } = await supabase.rpc('student_delete_verb', { p_token: studentToken, p_id: id });
    return error ? error.message : null;
  }
  const { error } = await supabase.from('arabic_verbs').delete().eq('id', id);
  return error ? error.message : null;
}

/** null = the tutor has not set Verbs up for this student yet. */
export async function getVerbPrefs(studentId: string): Promise<VerbPrefs | null> {
  const { data, error } = await supabase
    .from('arabic_verb_prefs').select('script, variety').eq('student_id', studentId).maybeSingle();
  if (error) { console.error('getVerbPrefs:', error.message); return null; }
  return data ? { script: data.script, variety: data.variety } : null;
}

export async function saveVerbPrefs(studentId: string, prefs: VerbPrefs): Promise<string | null> {
  const { error } = await supabase.from('arabic_verb_prefs').upsert({
    student_id: studentId, script: prefs.script, variety: prefs.variety, updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id' });
  return error ? error.message : null;
}

/**
 * Live changes to one student's Free Talk: their verbs and their word lists
 * (migration 20261119_free_talk_realtime.sql). A verb the tutor saves shows
 * on the student's open page at once, and the other way round.
 *
 * Supabase does not filter DELETE events by column, so deletes arrive for
 * every row of the table; `isMine` tells whether a deleted id was on screen.
 * Returns an unsubscribe function.
 */
export function subscribeFreeTalk(
  studentId: string,
  on: { verbs: () => void; lists: () => void },
  isMine: { verb: (id: string) => boolean; list: (id: string) => boolean },
): () => void {
  const filter = `student_id=eq.${studentId}`;
  const ch = supabase
    .channel(`free-talk-${studentId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'arabic_verbs', filter }, () => on.verbs())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'arabic_verbs', filter }, () => on.verbs())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'arabic_verbs' },
      (p: any) => { if (p?.old?.id && isMine.verb(p.old.id)) on.verbs(); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vocabulary_lists', filter }, () => on.lists())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vocabulary_lists', filter }, () => on.lists())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vocabulary_lists' },
      (p: any) => { if (p?.old?.id && isMine.list(p.old.id)) on.lists(); })
    .subscribe();
  return () => { void supabase.removeChannel(ch); };
}
