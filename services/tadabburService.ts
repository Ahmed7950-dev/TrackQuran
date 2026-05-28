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
