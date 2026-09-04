// services/qaedahPdfService.ts
// -----------------------------------------------------------------------------
// One lesson PDF per Qaedah topic — uploaded by an admin, opened on the same
// board as the Tajweed lessons (PdfPager + whiteboard) before the word list.
//
// Storage-only (public `tajweed-assets` bucket), so this needs no migration:
// the admin writes while signed in, and tutors + the student portal read the
// public URLs anonymously.
//
//   qaedah-pdfs/index.json                     ← topicId → { url, path, name }
//   qaedah-pdfs/<topicId>-<ts>-<filename>.pdf  ← the file itself
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'qaedah-pdfs';
const INDEX  = `${FOLDER}/index.json`;

export interface QaedahLessonPdf {
  url:  string;
  path: string;      // storage path, so the file can be deleted with the entry
  name: string;      // original filename, shown in the admin panel
  uploadedAt: string;
}

/** topicId → its lesson PDF. */
export type QaedahPdfIndex = Record<string, QaedahLessonPdf>;

const publicUrl = (path: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

const slug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').slice(0, 80);

/** Every lesson PDF. Empty when nothing has been uploaded yet. */
export async function loadQaedahPdfs(): Promise<QaedahPdfIndex> {
  try {
    const res = await fetch(`${publicUrl(INDEX)}?t=${Date.now()}`);
    if (!res.ok) return {};                       // never created
    const data = (await res.json()) as QaedahPdfIndex;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};                                    // offline — the words still work
  }
}

async function saveIndex(index: QaedahPdfIndex): Promise<boolean> {
  const blob = new Blob([JSON.stringify(index)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(INDEX, blob, {
    upsert: true, cacheControl: '30', contentType: 'application/json',
  });
  if (error) { console.error('saveQaedahPdfIndex:', error.message); return false; }
  return true;
}

/**
 * Upload a PDF for one topic, replacing whatever was there. Returns the new
 * entry, or null if either the upload or the index write failed.
 */
export async function uploadQaedahLessonPdf(
  topicId: string,
  file: File,
): Promise<QaedahLessonPdf | null> {
  const path = `${FOLDER}/${topicId}-${Date.now()}-${slug(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600', upsert: false, contentType: 'application/pdf',
  });
  if (error) { console.error('uploadQaedahLessonPdf:', error.message); return null; }

  const index    = await loadQaedahPdfs();
  const previous = index[topicId];
  const entry: QaedahLessonPdf = {
    url:  publicUrl(path),
    path,
    name: file.name,
    uploadedAt: new Date().toISOString(),
  };
  index[topicId] = entry;
  if (!await saveIndex(index)) {
    await supabase.storage.from(BUCKET).remove([path]);   // drop the orphan
    return null;
  }
  // The index is the source of truth, so the old file is already unreachable.
  // Deleting it is best-effort: the bucket policy lets signed-in users upload
  // but not always delete, and a leftover file harms nothing.
  if (previous?.path) await supabase.storage.from(BUCKET).remove([previous.path]);
  return entry;
}

/** Detach and delete this topic's PDF. */
export async function removeQaedahLessonPdf(topicId: string): Promise<boolean> {
  const index = await loadQaedahPdfs();
  const entry = index[topicId];
  if (!entry) return true;
  delete index[topicId];
  if (!await saveIndex(index)) return false;   // the entry is what tutors read
  if (entry.path) await supabase.storage.from(BUCKET).remove([entry.path]);   // best-effort
  return true;
}
