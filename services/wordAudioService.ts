// services/wordAudioService.ts
// -----------------------------------------------------------------------------
// Storage-only persistence for Qaedah word pronunciation audio.
//
// Files live in the public `tajweed-assets` bucket under `qaedah-word-audio/`,
// one file per word with a deterministic name derived from the word's Unicode
// code points (`w<hex><hex>….audio`). No DB table needed: existence of the file
// == the word has audio. The Crane Builder game constructs the public URL
// directly and falls back to speech synthesis if the file fails to load, so
// anonymous students never need to list the bucket.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'qaedah-word-audio';

/** Deterministic, filesystem-safe name for a word: its code points in hex.
 *  Handles letters + diacritics identically, so كُتِبَ always maps to one file. */
const fileNameFor = (word: string): string => {
  const hex = Array.from(word.trim())
    .map(ch => (ch.codePointAt(0) ?? 0).toString(16).padStart(4, '0'))
    .join('');
  return `w${hex}.audio`;
};

const pathFor = (word: string): string => `${FOLDER}/${fileNameFor(word)}`;

/** Public URL for a word's audio. The file may or may not exist — callers should
 *  handle playback errors (the game falls back to speech synthesis). */
export const wordAudioUrl = (word: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(pathFor(word)).data.publicUrl;

/** Given a candidate list of words, returns the subset that has an uploaded file.
 *  Lists the folder first (one call); falls back to HEAD probes if storage RLS
 *  blocks listing for the current role (admin panel only). */
export async function listWordsWithAudio(words: string[]): Promise<Set<string>> {
  const unique = Array.from(new Set(words.map(w => w.trim()).filter(Boolean)));
  const { data, error } = await supabase.storage.from(BUCKET).list(FOLDER, { limit: 1000 });
  if (!error && data) {
    const names = new Set(data.map(f => f.name));
    return new Set(unique.filter(w => names.has(fileNameFor(w))));
  }
  const found = await Promise.all(
    unique.map(async w => {
      try {
        const res = await fetch(wordAudioUrl(w), { method: 'HEAD' });
        return res.ok ? w : null;
      } catch { return null; }
    }),
  );
  return new Set(found.filter((w): w is string => w !== null));
}

/** Upload (or replace) the audio for a word. Returns the public URL or null. */
export async function uploadWordAudio(word: string, blob: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(word), blob, {
    cacheControl: '60',
    upsert: true,
    contentType: blob.type || 'audio/webm',
  });
  if (error) { console.error('uploadWordAudio:', error.message); return null; }
  return wordAudioUrl(word);
}

export async function deleteWordAudio(word: string): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([pathFor(word)]);
  if (error) { console.error('deleteWordAudio:', error.message); return false; }
  return true;
}

/** Speak a word using the browser's Arabic TTS voice. Used as the automatic
 *  fallback when no audio file has been uploaded for the word. */
export function speakWord(word: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(word);
  u.lang = 'ar-SA';
  u.rate = 0.7;
  const arVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('ar'));
  if (arVoice) u.voice = arVoice;
  window.speechSynthesis.speak(u);
}
