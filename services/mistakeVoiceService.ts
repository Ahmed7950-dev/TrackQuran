// services/mistakeVoiceService.ts
// ---------------------------------------------------------------------------
// The tutor's spoken correction on one marked letter.
//
// A written note ("Long") tells the student WHAT he got wrong. For tajweed,
// ten seconds of the tutor actually saying it is worth more than any wording,
// so the mistake ring can record one and the student's homework page plays it
// back on the word instead of the word-by-word recitation.
//
// The file goes to its own bucket (`mistake-notes`, tutor-writable, publicly
// readable — the student arrives on an unauthenticated link). The pointer goes
// on the mistake itself: students.mistakes[key].voice. Nothing else changes, so
// every surface that already reads a mistake keeps working untouched.
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import type { MistakeVoice } from '../types';
import { pickRecorderMime, RECORDER_BITRATE, trimToWebmHeader } from './recitationHomeworkService';

export const MISTAKE_VOICE_BUCKET = 'mistake-notes';

/** A correction, not a lesson. Long enough to say it twice and stop. */
export const MAX_VOICE_MS = 30_000;

export { pickRecorderMime, RECORDER_BITRATE };

const extOf = (type: string): string =>
  type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';

/**
 * Upload one take and return the pointer to store on the mistake. Every take
 * gets a fresh path — a file is never written over, because the year-long
 * cache header means a browser that saw the old bytes would keep them.
 */
export async function uploadMistakeVoice(
  studentId: string, mistakeKey: string, blob: Blob, ms: number,
): Promise<MistakeVoice | null> {
  blob = await trimToWebmHeader(blob);
  const type = (blob.type || 'audio/webm').split(';')[0];
  const path = `${studentId}/${mistakeKey.replace(/:/g, '-')}-${Date.now()}.${extOf(type)}`;
  const { error } = await supabase.storage.from(MISTAKE_VOICE_BUCKET).upload(path, blob, {
    contentType: type, cacheControl: '31536000', upsert: false,
  });
  if (error) { console.error('uploadMistakeVoice:', error.message); return null; }
  const url = supabase.storage.from(MISTAKE_VOICE_BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, url, ms: Math.max(0, Math.round(ms)), at: new Date().toISOString() };
}

/** Drop the audio of a note that is going away. Best effort: a leftover file
 *  is a few kilobytes, while a failed delete must never block the mark from
 *  being cleared. */
export async function deleteMistakeVoice(voice?: MistakeVoice | null): Promise<void> {
  if (!voice?.path) return;
  const { error } = await supabase.storage.from(MISTAKE_VOICE_BUCKET).remove([voice.path]);
  if (error) console.warn('deleteMistakeVoice:', error.message);
}

/** "4s" — these are seconds long, so minutes would be noise. */
export const voiceLength = (ms: number): string => `${Math.max(1, Math.round(ms / 1000))}s`;
