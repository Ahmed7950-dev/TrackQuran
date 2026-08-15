// services/archiveService.ts
// -----------------------------------------------------------------------------
// Archiving students — finished, paused or long-gone learners get tucked away
// so the roster only shows who is actually studying now. Nothing is deleted:
// an archived student keeps every log, mistake and report, and restoring is
// one click.
//
// Stored as one small JSON per tutor in the public `tajweed-assets` bucket
// (same approach as the meet-now invitations), so it needs no migration and
// works the moment it ships:
//
//   student-archive/<teacherId>.json  →  { quran: [ids], arabic: [ids] }
//
// It is tutor-private organisational state — students never read it, and the
// roster is already loaded client-side, so filtering happens in the app.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'student-archive';

export type ArchiveSubject = 'quran' | 'arabic';

export interface StudentArchive {
  quran: string[];
  arabic: string[];
}

export const EMPTY_ARCHIVE: StudentArchive = { quran: [], arabic: [] };

const pathFor = (teacherId: string): string => `${FOLDER}/${encodeURIComponent(teacherId)}.json`;

const publicUrl = (path: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Everything this tutor has archived. Missing file → nothing archived yet. */
export async function loadArchive(teacherId: string): Promise<StudentArchive> {
  try {
    const res = await fetch(`${publicUrl(pathFor(teacherId))}?t=${Date.now()}`);
    if (!res.ok) return { ...EMPTY_ARCHIVE };
    const a = (await res.json()) as Partial<StudentArchive>;
    return {
      quran: Array.isArray(a?.quran) ? a.quran : [],
      arabic: Array.isArray(a?.arabic) ? a.arabic : [],
    };
  } catch {
    return { ...EMPTY_ARCHIVE };
  }
}

export async function saveArchive(teacherId: string, archive: StudentArchive): Promise<boolean> {
  const blob = new Blob([JSON.stringify(archive)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(teacherId), blob, {
    upsert: true, cacheControl: '30', contentType: 'application/json',
  });
  if (error) { console.error('saveArchive:', error.message); return false; }
  return true;
}

/** Pure helper — flip one student's archived state in an archive object. */
export function withArchived(
  archive: StudentArchive,
  subject: ArchiveSubject,
  studentId: string,
  archived: boolean,
): StudentArchive {
  const current = new Set(archive[subject]);
  if (archived) current.add(studentId); else current.delete(studentId);
  return { ...archive, [subject]: [...current] };
}

export const isArchived = (archive: StudentArchive, subject: ArchiveSubject, id: string): boolean =>
  archive[subject].includes(id);
