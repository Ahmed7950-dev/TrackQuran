// services/letterAudioService.ts
// -----------------------------------------------------------------------------
// Storage-only persistence for Arabic letter pronunciation audio.
//
// Files live in the public `tajweed-assets` bucket under `letter-audio/`,
// one file per letter with a deterministic name (`u<hex codepoint>.audio`).
// No DB table needed: existence of the file == the letter has audio.
// The game constructs the public URL directly and falls back to speech
// synthesis if the file fails to load, so anonymous students never need
// to list the bucket.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'letter-audio';

export const ARABIC_LETTERS = [
  'ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص',
  'ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي',
];

const fileNameFor = (letter: string): string =>
  `u${(letter.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}.audio`;

const pathFor = (letter: string): string => `${FOLDER}/${fileNameFor(letter)}`;

/** Public URL for a letter's audio. The file may or may not exist — callers
 *  should handle playback errors (the game falls back to speech synthesis). */
export const letterAudioUrl = (letter: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(pathFor(letter)).data.publicUrl;

/** Returns the set of letters that currently have an uploaded audio file. */
export async function listLettersWithAudio(): Promise<Set<string>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(FOLDER, { limit: 100 });
  if (!error && data) {
    const names = new Set(data.map(f => f.name));
    return new Set(ARABIC_LETTERS.filter(l => names.has(fileNameFor(l))));
  }
  // Listing can be blocked by storage RLS for some roles — probe the public
  // URLs instead (28 lightweight HEAD requests, admin-panel only).
  const found = await Promise.all(
    ARABIC_LETTERS.map(async l => {
      try {
        const res = await fetch(letterAudioUrl(l), { method: 'HEAD' });
        return res.ok ? l : null;
      } catch { return null; }
    }),
  );
  return new Set(found.filter((l): l is string => l !== null));
}

/** Upload (or replace) the audio for a letter. Returns the public URL or null. */
export async function uploadLetterAudio(letter: string, blob: Blob): Promise<string | null> {
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(letter), blob, {
    cacheControl: '60',
    upsert: true,
    contentType: blob.type || 'audio/webm',
  });
  if (error) { console.error('uploadLetterAudio:', error.message); return null; }
  return letterAudioUrl(letter);
}

export async function deleteLetterAudio(letter: string): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([pathFor(letter)]);
  if (error) { console.error('deleteLetterAudio:', error.message); return false; }
  return true;
}

// ── TTS hygiene ───────────────────────────────────────────────────────────────
// WebKit (Safari/iOS) runs speechSynthesis.getVoices() SYNCHRONOUSLY on the
// main thread — enumerating the system voice list can stall 100-400ms. Calling
// it per utterance mid-game froze Letter Race on iPhones (measured in the
// WebKit perf lab: 13-18fps with per-round 170-400ms stalls; steady with audio
// hygiene). Resolve the voice ONCE at module scope and reuse it.
let cachedArVoice: SpeechSynthesisVoice | null | undefined; // undefined = not looked up yet
function arabicVoice(): SpeechSynthesisVoice | null {
  if (cachedArVoice !== undefined) return cachedArVoice;
  const pick = () => {
    cachedArVoice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('ar')) ?? null;
  };
  pick(); // one-time cost, accepted here
  if (!cachedArVoice) {
    // voice list often arrives async — refine once when it does
    window.speechSynthesis.addEventListener?.('voiceschanged', pick, { once: true });
  }
  return cachedArVoice ?? null;
}

/** Warm the TTS engine from a user gesture (e.g. a game's Start button): the
 *  FIRST speak() initializes the platform engine — hundreds of ms on WebKit —
 *  so pay that cost on a menu tap instead of mid-game. Safe to call anytime. */
export function warmSpeech(): void {
  try {
    if (!('speechSynthesis' in window)) return;
    arabicVoice(); // resolve + cache the voice list now
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch { /* no TTS */ }
}

/** Speak a letter using the browser's Arabic TTS voice. Used as the automatic
 *  fallback when no audio file has been uploaded for the letter. */
export function speakLetter(letter: string): void {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel(); // don't churn the engine when idle
  const u = new SpeechSynthesisUtterance(letter);
  u.lang = 'ar-SA';
  u.rate = 0.7;
  const v = arabicVoice();
  if (v) u.voice = v;
  synth.speak(u);
}
