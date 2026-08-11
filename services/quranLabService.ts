// services/quranLabService.ts
// -----------------------------------------------------------------------------
// Storage-only persistence for the admin Quran Lab (no DB tables — same
// pattern as wordAudioService): everything lives in the public
// `tajweed-assets` bucket.
//
//   quran-overrides/vowel-adjustments.json   one JSON map for every font's
//                                            vowel-position corrections
//   tutor-recitation/manifest.json           which verses are recorded +
//                                            the published flag
//   tutor-recitation/<surah>/<ayah>.mp3      one mastered take per verse
//
// The JSON files are fetched with a cache-busting query so the portals see
// edits within a page load; the mp3s get a short CDN TTL so re-records
// propagate quickly.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';
import { VowelAdjMap } from '../utils/quranicMarks';

const BUCKET = 'tajweed-assets';
const ADJ_PATH = 'quran-overrides/vowel-adjustments.json';
const REC_FOLDER = 'tutor-recitation';
const MANIFEST_PATH = `${REC_FOLDER}/manifest.json`;

const publicUrl = (path: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${publicUrl(path)}?t=${Date.now()}`);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function saveJson(path: string, data: unknown): Promise<boolean> {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true, cacheControl: '60', contentType: 'application/json',
  });
  if (error) { console.error(`saveJson ${path}:`, error.message); return false; }
  return true;
}

// ── Vowel adjustments ─────────────────────────────────────────────────────────

export const loadVowelAdjustments = (): Promise<VowelAdjMap> => loadJson<VowelAdjMap>(ADJ_PATH, {});

export const saveVowelAdjustments = (map: VowelAdjMap): Promise<boolean> => saveJson(ADJ_PATH, map);

// ── Tutor recitation ──────────────────────────────────────────────────────────

export interface RecitationManifest {
  published: boolean;
  /** "surah:ayah" → { d: duration ms } */
  verses: Record<string, { d: number }>;
  updatedAt?: string;
}

export const EMPTY_MANIFEST: RecitationManifest = { published: false, verses: {} };

export const loadRecitationManifest = (): Promise<RecitationManifest> =>
  loadJson<RecitationManifest>(MANIFEST_PATH, { ...EMPTY_MANIFEST, verses: {} });

export const saveRecitationManifest = (m: RecitationManifest): Promise<boolean> =>
  saveJson(MANIFEST_PATH, { ...m, updatedAt: new Date().toISOString() });

const versePath = (surah: number, ayah: number): string => `${REC_FOLDER}/${surah}/${ayah}.mp3`;

/** Public URL of a recorded verse. `bust` forces a fresh fetch after re-recording. */
export const recitationVerseUrl = (surah: number, ayah: number, bust?: number): string =>
  publicUrl(versePath(surah, ayah)) + (bust ? `?t=${bust}` : '');

export async function uploadRecitationVerse(surah: number, ayah: number, blob: Blob): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).upload(versePath(surah, ayah), blob, {
    upsert: true, cacheControl: '60', contentType: 'audio/mpeg',
  });
  if (error) { console.error('uploadRecitationVerse:', error.message); return false; }
  return true;
}

export async function deleteRecitationVerse(surah: number, ayah: number): Promise<boolean> {
  const { error } = await supabase.storage.from(BUCKET).remove([versePath(surah, ayah)]);
  if (error) { console.error('deleteRecitationVerse:', error.message); return false; }
  return true;
}
