// services/tadabburService.ts
// Tadabbur (تدبر) — per-verse student reflection notes.
// Notes are stored in `quran_verse_notes` keyed by student_id + surah + ayah.
// Both tutor (live session) and student (shared report) can read notes;
// only the student (readOnly mode in SharedReportPage) can write them.

import { supabase } from '../lib/supabase';

export interface VerseNote {
  surah: number;
  ayah: number;
  noteText: string;
  updatedAt: string;
}

/**
 * Load all verse notes for a student, returned as a map of "surah:ayah" → note text.
 */
export async function loadVerseNotes(studentId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('quran_verse_notes')
    .select('surah, ayah, note_text')
    .eq('student_id', studentId);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of (data ?? [])) {
    map[`${row.surah}:${row.ayah}`] = row.note_text;
  }
  return map;
}

/**
 * Upsert a verse note. Passing an empty / whitespace-only text deletes the note.
 */
export async function saveVerseNote(
  studentId: string,
  surah: number,
  ayah: number,
  noteText: string,
): Promise<void> {
  const trimmed = noteText.trim();
  if (!trimmed) {
    await deleteVerseNote(studentId, surah, ayah);
    return;
  }
  const { error } = await supabase
    .from('quran_verse_notes')
    .upsert(
      { student_id: studentId, surah, ayah, note_text: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'student_id,surah,ayah' },
    );
  if (error) throw error;
}

/**
 * Delete a verse note (e.g. when the student clears the text and saves).
 */
export async function deleteVerseNote(
  studentId: string,
  surah: number,
  ayah: number,
): Promise<void> {
  const { error } = await supabase
    .from('quran_verse_notes')
    .delete()
    .eq('student_id', studentId)
    .eq('surah', surah)
    .eq('ayah', ayah);
  if (error) throw error;
}

// ─── Tutor side: word meanings + per-verse tutor notes ─────────────────────
// Keys: word meanings "surah:ayah:wordIndex" (splitVerseWords index);
// tutor notes "surah:ayah". Students read both; only the tutor writes.

export interface WordMeaning { meaning: string; wordText: string }

export async function loadWordMeanings(studentId: string): Promise<Record<string, WordMeaning>> {
  const { data, error } = await supabase
    .from('quran_word_meanings')
    .select('surah, ayah, word_index, word_text, meaning')
    .eq('student_id', studentId);
  if (error) throw error;
  const map: Record<string, WordMeaning> = {};
  for (const r of data ?? []) map[`${r.surah}:${r.ayah}:${r.word_index}`] = { meaning: r.meaning, wordText: r.word_text };
  return map;
}

/** Empty meaning deletes it. */
export async function saveWordMeaning(
  studentId: string, surah: number, ayah: number, wordIndex: number, wordText: string, meaning: string,
): Promise<void> {
  const trimmed = meaning.trim();
  if (!trimmed) {
    const { error } = await supabase.from('quran_word_meanings').delete()
      .eq('student_id', studentId).eq('surah', surah).eq('ayah', ayah).eq('word_index', wordIndex);
    if (error) throw error;
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('quran_word_meanings').upsert(
    { student_id: studentId, surah, ayah, word_index: wordIndex, word_text: wordText, meaning: trimmed,
      teacher_id: user.id, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,surah,ayah,word_index' },
  );
  if (error) throw error;
}

/** Meanings this tutor already gave the same word (any student, any verse) — offered as suggestions. */
export async function loadMyMeaningsForWord(wordText: string): Promise<{ meaning: string; surah: number; ayah: number }[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !wordText) return [];
  const { data, error } = await supabase
    .from('quran_word_meanings')
    .select('meaning, surah, ayah')
    .eq('teacher_id', user.id)
    .eq('word_text', wordText)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return [];
  const seen = new Set<string>();
  const out: { meaning: string; surah: number; ayah: number }[] = [];
  for (const r of data ?? []) {
    const k = (r.meaning as string).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ meaning: r.meaning, surah: r.surah, ayah: r.ayah });
  }
  return out;
}

export async function loadTutorVerseNotes(studentId: string): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('quran_verse_tutor_notes')
    .select('surah, ayah, note_text')
    .eq('student_id', studentId);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const r of data ?? []) map[`${r.surah}:${r.ayah}`] = r.note_text;
  return map;
}

/** Empty text deletes the note. */
export async function saveTutorVerseNote(studentId: string, surah: number, ayah: number, noteText: string): Promise<void> {
  const trimmed = noteText.trim();
  if (!trimmed) {
    const { error } = await supabase.from('quran_verse_tutor_notes').delete()
      .eq('student_id', studentId).eq('surah', surah).eq('ayah', ayah);
    if (error) throw error;
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('quran_verse_tutor_notes').upsert(
    { student_id: studentId, surah, ayah, note_text: trimmed, teacher_id: user.id, updated_at: new Date().toISOString() },
    { onConflict: 'student_id,surah,ayah' },
  );
  if (error) throw error;
}
