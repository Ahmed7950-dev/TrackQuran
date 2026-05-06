import { Student, AttendanceStatus, RecitationAchievement, MemorizationAchievement, AttendanceRecord, QuranVerse, Progress, User } from '../types';
import { QURAN_METADATA, POINTS_PER_WORD } from '../constants';
import { pageVerseList } from './quranPageData';
import { supabase } from '../lib/supabase';

// ============================================================
// Teacher Profile
// ============================================================

export const getTeacherProfile = async (userId: string): Promise<{ name: string; tajweed_rules: string[] } | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('name, tajweed_rules')
    .eq('id', userId)
    .single();
  if (error) { console.error('getTeacherProfile:', error.message); return null; }
  return data;
};

export const createTeacherProfile = async (userId: string, name: string): Promise<void> => {
  const { error } = await supabase.from('profiles').insert({ id: userId, name });
  if (error) console.error('createTeacherProfile:', error.message);
};

// ============================================================
// Students
// ============================================================

const rowToStudent = (row: any): Student => ({
  id:                          row.id,
  name:                        row.name,
  dob:                         row.dob,
  recitationAchievements:      row.recitation_achievements      ?? [],
  memorizationAchievements:    row.memorization_achievements    ?? [],
  attendance:                  row.attendance                   ?? [],
  masteredTajweedRules:        row.mastered_tajweed_rules       ?? [],
  tafsirReviews:               row.tafsir_reviews               ?? [],
  tafsirMemorizationReviews:   row.tafsir_memorization_reviews  ?? [],
  mistakes:                    row.mistakes                     ?? {},
});

const studentToRow = (teacherId: string, s: Student) => ({
  id:                          s.id,
  teacher_id:                  teacherId,
  name:                        s.name,
  dob:                         s.dob,
  recitation_achievements:     s.recitationAchievements,
  memorization_achievements:   s.memorizationAchievements,
  attendance:                  s.attendance,
  mastered_tajweed_rules:      s.masteredTajweedRules,
  tafsir_reviews:              s.tafsirReviews,
  tafsir_memorization_reviews: s.tafsirMemorizationReviews,
  mistakes:                    s.mistakes,
});

export const getStudents = async (teacherId: string): Promise<Student[]> => {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getStudents:', error.message); return []; }
  return (data ?? []).map(rowToStudent);
};

export const saveStudent = async (teacherId: string, student: Student): Promise<void> => {
  const { error } = await supabase
    .from('students')
    .upsert(studentToRow(teacherId, student), { onConflict: 'id' });
  if (error) console.error('saveStudent:', error.message);
};

export const deleteStudent = async (studentId: string): Promise<void> => {
  const { error } = await supabase.from('students').delete().eq('id', studentId);
  if (error) console.error('deleteStudent:', error.message);
};

// ============================================================
// Tajweed Rules (stored on the teacher profile)
// ============================================================

export const getTajweedRules = async (teacherId: string): Promise<string[]> => {
  const profile = await getTeacherProfile(teacherId);
  return profile?.tajweed_rules ?? getDefaultTajweedRules();
};

export const saveTajweedRules = async (teacherId: string, rules: string[]): Promise<void> => {
  const { error } = await supabase
    .from('profiles')
    .update({ tajweed_rules: rules })
    .eq('id', teacherId);
  if (error) console.error('saveTajweedRules:', error.message);
};

// ============================================================
// Student login (no auth account — matched by name + dob)
// ============================================================

export const findStudentByNameAndDob = async (
  firstName: string,
  lastName: string,
  dob: string,
): Promise<{ student: Student; teacherId: string } | null> => {
  const { data, error } = await supabase.rpc('find_student_by_name_and_dob', {
    p_first_name: firstName.trim(),
    p_last_name:  lastName.trim(),
    p_dob:        dob,
  });
  if (error) { console.error('findStudentByNameAndDob:', error.message); return null; }
  if (!data || data.length === 0) return null;
  const row = data[0];
  return { student: row.student_data as Student, teacherId: row.teacher_id };
};

// ============================================================
// Backup / Restore (localStorage layer for UI prefs only)
// Student data is now in Supabase and is always synced.
// ============================================================

const BACKUP_KEY_PREFIX = 'quran_progress_tracker_';
const BACKUP_FORMAT_VERSION = 2;
const BACKUP_EXTRA_KEYS = ['theme', 'language', 'quranicFont', 'arabic_trainer_v1'];

export interface BackupFile {
  app: 'TRACKQURAN';
  formatVersion: number;
  exportedAt: string;
  data: Record<string, string>;
}

export const buildBackup = (): BackupFile => {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(BACKUP_KEY_PREFIX) || BACKUP_EXTRA_KEYS.includes(key)) {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    }
  }
  return { app: 'TRACKQURAN', formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
};

export const downloadBackup = (): void => {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `trackquran-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export interface RestoreResult { restoredKeys: number }

export const restoreBackup = (backup: unknown, mode: 'replace' | 'merge' = 'replace'): RestoreResult => {
  if (!backup || typeof backup !== 'object') throw new Error('Invalid backup file: not a JSON object.');
  const raw = backup as any;
  if (raw._schema === 'arabic_trainer_v1' && raw.data && typeof raw.data === 'object') {
    if (mode === 'replace') localStorage.removeItem('arabic_trainer_v1');
    localStorage.setItem('arabic_trainer_v1', JSON.stringify(raw.data));
    return { restoredKeys: 1 };
  }
  const b = raw as Partial<BackupFile>;
  if (b.app !== 'TRACKQURAN' || !b.data || typeof b.data !== 'object') {
    throw new Error('Invalid backup file: missing TRACKQURAN signature.');
  }
  if (mode === 'replace') {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(BACKUP_KEY_PREFIX) || BACKUP_EXTRA_KEYS.includes(key))) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
  let count = 0;
  for (const [key, value] of Object.entries(b.data)) {
    if (typeof value === 'string') { localStorage.setItem(key, value); count++; }
  }
  return { restoredKeys: count };
};

// ============================================================
// General Utilities (unchanged — pure functions, no storage)
// ============================================================

export const getPageOfAyah = (surahNum: number, ayahNum: number): number => {
  for (let i = pageVerseList.length - 1; i >= 0; i--) {
    const [pageNum, s, a] = pageVerseList[i];
    if (surahNum > s || (surahNum === s && ayahNum >= a)) return pageNum;
  }
  return 1;
};

export const getRecitedPagesSet = (student: Student): Set<number> => {
  const pages = new Set<number>();
  student.recitationAchievements.forEach(ach => {
    const s = getPageOfAyah(ach.startSurah, ach.startAyah);
    const e = getPageOfAyah(ach.endSurah, ach.endAyah);
    if (s > 0 && e > 0) for (let i = s; i <= e; i++) pages.add(i);
  });
  return pages;
};

export const getMemorizedPagesSet = (student: Student): Set<number> => {
  const pages = new Set<number>();
  student.memorizationAchievements.forEach(ach => {
    const s = getPageOfAyah(ach.startSurah, ach.startAyah);
    const e = getPageOfAyah(ach.endSurah, ach.endAyah);
    if (s > 0 && e > 0) for (let i = s; i <= e; i++) pages.add(i);
  });
  return pages;
};

export const calculateVersesAndPages = (
  startSurah: number, startAyah: number, endSurah: number, endAyah: number,
): { verses: number; pages: number } => {
  let versesCompleted = 0;
  if (startSurah === endSurah) {
    versesCompleted = endAyah - startAyah;
  } else {
    const startMeta = QURAN_METADATA.find(s => s.number === startSurah);
    if (startMeta) versesCompleted += startMeta.numberOfAyahs - startAyah + 1;
    for (let i = startSurah + 1; i < endSurah; i++) {
      const m = QURAN_METADATA.find(s => s.number === i);
      if (m) versesCompleted += m.numberOfAyahs;
    }
    const endMeta = QURAN_METADATA.find(s => s.number === endSurah);
    if (endMeta) versesCompleted += endAyah;
  }
  if (versesCompleted < 0) versesCompleted = 0;
  const startPage = getPageOfAyah(startSurah, startAyah);
  const endPage   = getPageOfAyah(endSurah, endAyah);
  if (startPage === 0 || endPage === 0) return { verses: versesCompleted, pages: 0 };
  return { verses: Math.max(0, versesCompleted), pages: Math.max(0, endPage - startPage) };
};

const getDefaultTajweedRules = (): string[] => [
  'Izhar', 'Idgham', 'Iqlab', 'Ikhfa',
  'Qalqalah (Sughra & Kubra)', 'Madd (Natural, Muttasil, Munfasil)',
  'Rules of Noon Sakinah & Tanween', 'Rules of Meem Sakinah',
  'Tafkhim & Tarqiq (Raa)', 'Ghunnah',
  'Lam Shamsiyyah & Qamariyyah', 'Sifaat al-Huruf (Letter Attributes)',
  'Makharij al-Huruf (Articulation Points)',
];

// ============================================================
// Quran API (unchanged)
// ============================================================
// Shared Reports (public student mistake review links)
// ============================================================

export interface SharedReportData {
  studentName: string;
  generatedAt: string;
  mistakes: { [key: string]: { level: number; errorType?: string; errorText?: string; date: string } };
  verses: Array<{ verse_key: string; text_uthmani: string }>;
}

// ── Verse play tracking ──────────────────────────────────────────────────────

export const recordVersePlay = async (reportId: string, verseKey: string): Promise<void> => {
  await supabase.from('report_plays').insert({ report_id: reportId, verse_key: verseKey });
};

export const getReportPlays = async (reportId: string): Promise<{ [verseKey: string]: number }> => {
  const { data } = await supabase
    .from('report_plays')
    .select('verse_key')
    .eq('report_id', reportId);
  const counts: { [k: string]: number } = {};
  data?.forEach(r => { counts[r.verse_key] = (counts[r.verse_key] ?? 0) + 1; });
  return counts;
};

/** Upsert the shared report for a student — always returns the same UUID. */
export const createOrUpdateSharedReport = async (
  teacherId: string,
  studentId: string,
  studentName: string,
  reportData: SharedReportData,
): Promise<string | null> => {
  const { data, error } = await supabase
    .from('shared_reports')
    .upsert(
      { teacher_id: teacherId, student_id: studentId, student_name: studentName, report_data: reportData },
      { onConflict: 'teacher_id,student_id' },
    )
    .select('id')
    .single();
  if (error) { console.error('createOrUpdateSharedReport:', error.message); return null; }
  return data.id as string;
};

/** Returns the existing report UUID for this student, or null if none exists yet. */
export const getStudentReportId = async (teacherId: string, studentId: string): Promise<string | null> => {
  const { data } = await supabase
    .from('shared_reports')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
    .maybeSingle();
  return data?.id ?? null;
};

export const getSharedReport = async (id: string): Promise<{ student_name: string; report_data: SharedReportData } | null> => {
  const { data, error } = await supabase
    .from('shared_reports')
    .select('student_name, report_data')
    .eq('id', id)
    .single();
  if (error) { console.error('getSharedReport:', error.message); return null; }
  return data;
};

// ============================================================
const surahCache = new Map<number, QuranVerse[]>();

export const getVersesForSurah = async (surahId: number): Promise<QuranVerse[]> => {
  if (surahCache.has(surahId)) return surahCache.get(surahId)!;
  try {
    const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surahId}`);
    if (!response.ok) throw new Error(`Failed to fetch Surah ${surahId}`);
    const data = await response.json();
    surahCache.set(surahId, data.verses);
    return data.verses;
  } catch (e) { console.error(e); return []; }
};

export const getVersesInRange = async (start: Progress, end: Progress): Promise<QuranVerse[]> => {
  const verses: QuranVerse[] = [];
  if (start.surah > end.surah || (start.surah === end.surah && start.ayah > end.ayah)) return [];
  if (start.surah === end.surah) {
    const sv = await getVersesForSurah(start.surah);
    return sv.slice(start.ayah - 1, end.ayah);
  }
  const startVerses = await getVersesForSurah(start.surah);
  verses.push(...startVerses.slice(start.ayah - 1));
  for (let i = start.surah + 1; i < end.surah; i++) {
    verses.push(...await getVersesForSurah(i));
  }
  const endVerses = await getVersesForSurah(end.surah);
  verses.push(...endVerses.slice(0, end.ayah));
  return verses;
};
