import { Student, AttendanceStatus, RecitationAchievement, MemorizationAchievement, AttendanceRecord, QuranVerse, Progress, User, SupportTicket, SupportMessage, QuranHomework } from '../types';
export type { QuranHomework };
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
  // Use upsert so this is safe to call on every sign-in (including Google OAuth
  // where the profiles row may not have been created yet). ignoreDuplicates:true
  // means an existing row is left unchanged — name / role are never overwritten.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, name }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) console.error('createTeacherProfile:', error.message);
};

// ============================================================
// Students
// ============================================================

const rowToStudent = (row: any): Student => ({
  id:                          row.id,
  name:                        row.name,
  dob:                         row.dob,
  ageCategory:                 row.age_category ?? undefined,
  recitationAchievements:      row.recitation_achievements      ?? [],
  memorizationAchievements:    row.memorization_achievements    ?? [],
  attendance:                  row.attendance                   ?? [],
  masteredTajweedRules:        row.mastered_tajweed_rules       ?? [],
  tafsirReviews:               row.tafsir_reviews               ?? [],
  tafsirMemorizationReviews:   row.tafsir_memorization_reviews  ?? [],
  mistakes:                    row.mistakes                     ?? {},
  teacherNote:                 row.teacher_note                 ?? undefined,
  quranHomework:               row.quran_homework               ?? [],
  timezone:                    row.timezone                     ?? undefined,
  hourlyRate:                  row.hourly_rate                  ?? undefined,
  studentType:                 row.student_type                 ?? undefined,
  preplyPercentage:            row.preply_percentage            ?? undefined,
  subscriptionRenewalDate:     row.subscription_renewal_date    ?? undefined,
  authUserId:                  row.auth_user_id                 ?? undefined,
  selfRegistered:              row.self_registered              ?? undefined,
  approvalStatus:              row.approval_status              ?? undefined,
  lessonsForSelf:              row.lessons_for_self             ?? undefined,
  lessonsForWhom:              row.lessons_for_whom             ?? undefined,
  lessonsPerWeek:              row.lessons_per_week             ?? undefined,
  quranLevel:                  row.quran_level                  ?? undefined,
  studyFocus:                  row.study_focus                  ?? undefined,
  studyAddons:                 row.study_addons                 ?? undefined,
});

const studentToRow = (teacherId: string, s: Student) => ({
  id:                          s.id,
  teacher_id:                  teacherId,
  name:                        s.name,
  dob:                         s.dob ?? null,  // explicit null overrides any column DEFAULT
  age_category:                s.ageCategory ?? null,
  recitation_achievements:     s.recitationAchievements,
  memorization_achievements:   s.memorizationAchievements,
  attendance:                  s.attendance,
  mastered_tajweed_rules:      s.masteredTajweedRules,
  tafsir_reviews:              s.tafsirReviews,
  tafsir_memorization_reviews: s.tafsirMemorizationReviews,
  mistakes:                    s.mistakes,
  teacher_note:                s.teacherNote ?? null,
  quran_homework:              s.quranHomework ?? [],
  timezone:                    s.timezone ?? null,
  hourly_rate:                 s.hourlyRate ?? null,
  student_type:                s.studentType ?? null,
  preply_percentage:           s.preplyPercentage ?? null,
  subscription_renewal_date:   s.subscriptionRenewalDate ?? null,
  auth_user_id:                s.authUserId ?? null,
  self_registered:             s.selfRegistered ?? false,
  approval_status:             s.approvalStatus ?? 'active',
  lessons_for_self:            s.lessonsForSelf ?? null,
  lessons_for_whom:            s.lessonsForWhom ?? null,
  lessons_per_week:            s.lessonsPerWeek ?? null,
  quran_level:                 s.quranLevel ?? null,
  study_focus:                 s.studyFocus ?? null,
  study_addons:                s.studyAddons ?? null,
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

/** Approve / reject a self-registered Quran student's join request. */
export const setStudentApprovalStatus = async (
  teacherId: string, studentId: string, status: 'active' | 'rejected',
): Promise<void> => {
  const { error } = await supabase
    .from('students')
    .update({ approval_status: status })
    .eq('id', studentId)
    .eq('teacher_id', teacherId);
  if (error) console.error('setStudentApprovalStatus:', error.message);
};

export const saveStudent = async (teacherId: string, student: Student): Promise<void> => {
  const row = studentToRow(teacherId, student);
  const { error } = await supabase
    .from('students')
    .upsert(row, { onConflict: 'id' });
  if (error) {
    console.error('saveStudent failed:', error.message, '| id:', row.id);
  }
};

export const deleteStudent = async (studentId: string): Promise<void> => {
  const { error } = await supabase.from('students').delete().eq('id', studentId);
  if (error) console.error('deleteStudent:', error.message);
};

/** Lightweight update — only writes the teacher_note column, no full re-save needed */
export const saveStudentTeacherNote = async (studentId: string, note: string): Promise<void> => {
  const { error } = await supabase
    .from('students')
    .update({ teacher_note: note })
    .eq('id', studentId);
  if (error) console.error('saveStudentTeacherNote:', error.message);
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
  a.download = `lisan-quran-backup-${stamp}.json`;
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

// ── Full-page coverage helpers ──────────────────────────────────────────────

/** Lazily built map: page number → all [surah, ayah] pairs on that page */
let _pageVerseMap: Map<number, Array<[number, number]>> | null = null;

function getPageVerseMap(): Map<number, Array<[number, number]>> {
  if (_pageVerseMap) return _pageVerseMap;
  const map = new Map<number, Array<[number, number]>>();
  for (let p = 1; p <= 604; p++) map.set(p, []);

  for (let pi = 0; pi < pageVerseList.length; pi++) {
    const [pageNum, startSurah, startAyah] = pageVerseList[pi];
    const nextEntry = pageVerseList[pi + 1] ?? null;

    const endSurah = nextEntry ? nextEntry[1] : 114;
    const nextAyah  = nextEntry ? nextEntry[2] : null; // exclusive start of next page

    for (let s = startSurah; s <= endSurah; s++) {
      const meta = QURAN_METADATA.find(m => m.number === s);
      if (!meta) continue;
      const aStart = s === startSurah ? startAyah : 1;
      const aEnd   = s === endSurah
        ? (nextAyah !== null ? nextAyah - 1 : meta.numberOfAyahs)
        : meta.numberOfAyahs;
      if (aEnd < aStart) continue;
      for (let a = aStart; a <= aEnd; a++) map.get(pageNum)!.push([s, a]);
    }
  }
  _pageVerseMap = map;
  return map;
}

type AchRange = { startSurah: number; startAyah: number; endSurah: number; endAyah: number };

function buildCoveredVerseKeys(achievements: AchRange[]): Set<string> {
  const covered = new Set<string>();
  for (const ach of achievements) {
    for (let s = ach.startSurah; s <= ach.endSurah; s++) {
      const meta = QURAN_METADATA.find(m => m.number === s);
      if (!meta) continue;
      const aStart = s === ach.startSurah ? ach.startAyah : 1;
      const aEnd   = s === ach.endSurah   ? ach.endAyah   : meta.numberOfAyahs;
      for (let a = aStart; a <= aEnd; a++) covered.add(`${s}:${a}`);
    }
  }
  return covered;
}

/** Pages where every verse on the page is covered by at least one achievement */
function fullyRecitedPageSet(achievements: AchRange[]): Set<number> {
  const map     = getPageVerseMap();
  const covered = buildCoveredVerseKeys(achievements);
  const pages   = new Set<number>();
  for (const [page, verses] of map) {
    if (verses.length > 0 && verses.every(([s, a]) => covered.has(`${s}:${a}`))) pages.add(page);
  }
  return pages;
}

/**
 * Average number of mistake-verses per recited page.
 * e.g. 20 unique mistake-verses across 10 recited pages → 2.0
 * Used in FamilyLinkPage stats.
 */
export const computeMistakesRate = (
  recitationAchievements: AchRange[],
  mistakes: Record<string, unknown>,
): number => {
  const pages = fullyRecitedPageSet(recitationAchievements);
  if (pages.size === 0) return 0;
  const mistakeVerses = new Set<string>();
  for (const key of Object.keys(mistakes)) {
    const parts = key.split(':');
    if (parts.length >= 2) mistakeVerses.add(`${parts[0]}:${parts[1]}`);
  }
  return Math.round((mistakeVerses.size / pages.size) * 10) / 10; // one decimal, e.g. 2.3
};

export const getRecitedPagesSet = (student: Student): Set<number> =>
  fullyRecitedPageSet(student.recitationAchievements);

export const getMemorizedPagesSet = (student: Student): Set<number> =>
  fullyRecitedPageSet(student.memorizationAchievements);

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
  homeworkVerses?: string[];
  quranHomework?: QuranHomework[];
  quranicFont?: string;
  /** Student's IANA timezone (from their profile) so the portal calendar shows their local times. */
  timezone?: string;
  // Precomputed ranks so the public portal shows real ranks (it only has this
  // one student's data, not the tutor's roster).
  ranks?: {
    readingRank: number; readingTotal: number;
    hifdhRank: number; hifdhTotal: number;
    overallReadingRank: number; overallReadingTotal: number;
  };
  studentProgress?: {
    recitationAchievements: Array<{
      id: string; date: string;
      startSurah: number; startAyah: number;
      endSurah: number; endAyah: number;
      readingQuality: number; tajweedQuality: number;
      pagesCompleted: number; versesCompleted: number; pointsEarned: number;
    }>;
    memorizationAchievements: Array<{
      id: string; date: string;
      startSurah: number; startAyah: number;
      endSurah: number; endAyah: number;
      memorizationQuality: number;
      pagesCompleted: number; versesCompleted: number;
    }>;
    attendance: Array<{ date: string; status: string }>;
    masteredTajweedRules: string[];
    dob?: string;
    tafsirReviews: Array<{ id: string; date: string; surah: number; reviewQuality: number }>;
    tafsirMemorizationReviews: Array<{ id: string; date: string; surah: number; reviewQuality: number }>;
    tajweedCompletions?: Array<{ lessonId: string; lessonTitle: string; completedAt: string }>;
  };
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

/** Delete all play-tracking rows for one verse so the homework counter resets to 0. */
export const resetVersePlayCount = async (reportId: string, verseKey: string): Promise<void> => {
  const { error } = await supabase
    .from('report_plays')
    .delete()
    .eq('report_id', reportId)
    .eq('verse_key', verseKey);
  if (error) console.error('resetVersePlayCount:', error.message);
};

/**
 * Upsert the shared report for a student — always returns the same UUID.
 *
 * MERGES the given fields into any existing report_data instead of replacing the
 * whole object, so a partial update (e.g. the copy-link button, which has no
 * verse text) doesn't wipe fields written by another path (verses + mistakes
 * from the mistakes-review auto-sync, homework, ranks). Callers should only pass
 * the fields they own and omit the rest.
 */
export const createOrUpdateSharedReport = async (
  teacherId: string,
  studentId: string,
  studentName: string,
  reportData: Partial<SharedReportData>,
): Promise<string | null> => {
  const existingId = await getStudentReportId(teacherId, studentId);
  let merged: SharedReportData = reportData as SharedReportData;
  if (existingId) {
    const existing = await getSharedReport(existingId);
    if (existing?.report_data) {
      merged = { ...existing.report_data, ...reportData } as SharedReportData;
    }
  }
  // Always stamp the student's timezone so the public portal calendar can show
  // their local lesson times (the portal can't read the students table directly).
  try {
    const { data: stu } = await supabase.from('students').select('timezone').eq('id', studentId).maybeSingle();
    if (stu?.timezone) merged.timezone = stu.timezone as string;
  } catch { /* timezone column may not exist yet — ignore */ }
  const { data, error } = await supabase
    .from('shared_reports')
    .upsert(
      { teacher_id: teacherId, student_id: studentId, student_name: studentName, report_data: merged },
      { onConflict: 'teacher_id,student_id' },
    )
    .select('id')
    .single();
  if (error) { console.error('createOrUpdateSharedReport:', error.message); return null; }
  return data.id as string;
};

/** Public (no-auth) read of a student's timezone for the shared portal calendar. */
export const getStudentTimezonePublic = async (studentId: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('get_student_timezone', { p_student_id: studentId });
  if (error) { console.error('getStudentTimezonePublic:', error.message); return null; }
  return (data as string | null) ?? null;
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

export const getSharedReport = async (id: string): Promise<{ student_name: string; student_id: string; report_data: SharedReportData; teacher_id: string } | null> => {
  const { data, error } = await supabase
    .from('shared_reports')
    .select('student_name, student_id, report_data, teacher_id')
    .eq('id', id)
    .single();
  if (error) { console.error('getSharedReport:', error.message); return null; }
  return data;
};

/** Patch only the homeworkVerses field of an existing shared report. */
export const updateHomeworkVerses = async (reportId: string, homeworkVerses: string[]): Promise<void> => {
  const { data } = await supabase
    .from('shared_reports')
    .select('report_data')
    .eq('id', reportId)
    .single();
  if (!data) return;
  const updated: SharedReportData = { ...(data.report_data as SharedReportData), homeworkVerses };
  const { error } = await supabase
    .from('shared_reports')
    .update({ report_data: updated })
    .eq('id', reportId);
  if (error) console.error('updateHomeworkVerses:', error.message);
};

/** Patch only the quranHomework field of an existing shared report. */
export const updateQuranHomeworkInReport = async (reportId: string, quranHomework: QuranHomework[]): Promise<void> => {
  const { data } = await supabase
    .from('shared_reports')
    .select('report_data')
    .eq('id', reportId)
    .single();
  if (!data) return;
  const updated: SharedReportData = { ...(data.report_data as SharedReportData), quranHomework };
  const { error } = await supabase
    .from('shared_reports')
    .update({ report_data: updated })
    .eq('id', reportId);
  if (error) console.error('updateQuranHomeworkInReport:', error.message);
};

/**
 * Sync all live student data (mistakes, progress, homework) into an existing
 * shared report while preserving the teacher-generated fields (verses, homeworkVerses).
 * Safe to call on every student update — it's a no-op if the report doesn't exist.
 */
export const syncStudentDataInReport = async (
  reportId: string,
  student: Pick<
    Student,
    | 'name'
    | 'mistakes'
    | 'quranHomework'
    | 'recitationAchievements'
    | 'memorizationAchievements'
    | 'attendance'
    | 'masteredTajweedRules'
    | 'dob'
    | 'tafsirReviews'
    | 'tafsirMemorizationReviews'
  >,
  ranks?: SharedReportData['ranks'],
): Promise<void> => {
  // Fetch existing data to preserve verses / homeworkVerses / quranicFont
  const { data, error: fetchErr } = await supabase
    .from('shared_reports')
    .select('report_data')
    .eq('id', reportId)
    .single();
  if (fetchErr || !data) return;

  const existing = data.report_data as SharedReportData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updated: SharedReportData = {
    ...existing,
    studentName: student.name,
    generatedAt: new Date().toISOString(),
    mistakes: student.mistakes as SharedReportData['mistakes'],
    quranHomework: student.quranHomework ?? [],
    ranks: ranks ?? existing.ranks, // refresh precomputed ranks when provided
    studentProgress: {
      ...(existing.studentProgress ?? {}),
      recitationAchievements: student.recitationAchievements ?? [],
      memorizationAchievements: student.memorizationAchievements ?? [],
      attendance: student.attendance ?? [],
      masteredTajweedRules: student.masteredTajweedRules ?? [],
      dob: student.dob,
      tafsirReviews: student.tafsirReviews ?? [],
      tafsirMemorizationReviews: student.tafsirMemorizationReviews ?? [],
    } as SharedReportData['studentProgress'],
  };

  const { error } = await supabase
    .from('shared_reports')
    .update({ report_data: updated, student_name: student.name })
    .eq('id', reportId);
  if (error) console.error('syncStudentDataInReport:', error.message);
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

// ============================================================
// Admin — teacher management
// ============================================================

export interface TeacherProfile {
  id: string;
  name: string;
  role: string;
  created_at: string;
}

export const getAllTeachers = async (): Promise<TeacherProfile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, role, created_at')
    .order('created_at', { ascending: true });
  if (error) { console.error('getAllTeachers:', error.message); return []; }
  return data ?? [];
};

export const deleteTeacherAccount = async (teacherId: string): Promise<void> => {
  // Cascade-delete everything owned by this teacher
  await supabase.from('students').delete().eq('teacher_id', teacherId);
  await supabase.from('shared_reports').delete().eq('teacher_id', teacherId);
  await supabase.from('support_tickets').delete().eq('teacher_id', teacherId);
  await supabase.from('profiles').delete().eq('id', teacherId);
};

// ============================================================
// Support tickets & messages
// ============================================================

const rowToTicket = (row: any): SupportTicket => ({
  id:          row.id,
  teacherId:   row.teacher_id,
  teacherName: row.teacher_name,
  subject:     row.subject,
  status:      row.status,
  createdAt:   row.created_at,
  updatedAt:   row.updated_at,
});

const rowToMessage = (row: any): SupportMessage => ({
  id:         row.id,
  ticketId:   row.ticket_id,
  senderId:   row.sender_id,
  senderName: row.sender_name,
  senderRole: row.sender_role,
  body:       row.body,
  createdAt:  row.created_at,
});

export const createSupportTicket = async (
  teacherId: string,
  teacherName: string,
  subject: string,
  firstMessage: string,
): Promise<SupportTicket | null> => {
  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({ teacher_id: teacherId, teacher_name: teacherName, subject })
    .select()
    .single();
  if (error || !ticket) { console.error('createSupportTicket:', error?.message); return null; }
  await supabase.from('support_messages').insert({
    ticket_id:   ticket.id,
    sender_id:   teacherId,
    sender_name: teacherName,
    sender_role: 'teacher',
    body:        firstMessage,
  });
  return rowToTicket(ticket);
};

export const getMyTickets = async (teacherId: string): Promise<SupportTicket[]> => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false });
  if (error) { console.error('getMyTickets:', error.message); return []; }
  return (data ?? []).map(rowToTicket);
};

export const getAllTickets = async (): Promise<SupportTicket[]> => {
  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) { console.error('getAllTickets:', error.message); return []; }
  return (data ?? []).map(rowToTicket);
};

export const getTicketMessages = async (ticketId: string): Promise<SupportMessage[]> => {
  const { data, error } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) { console.error('getTicketMessages:', error.message); return []; }
  return (data ?? []).map(rowToMessage);
};

export const sendSupportMessage = async (
  ticketId: string,
  senderId: string,
  senderName: string,
  senderRole: 'teacher' | 'admin',
  body: string,
): Promise<void> => {
  await supabase.from('support_messages').insert({
    ticket_id:   ticketId,
    sender_id:   senderId,
    sender_name: senderName,
    sender_role: senderRole,
    body,
  });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (senderRole === 'admin') updates.status = 'in_progress';
  await supabase.from('support_tickets').update(updates).eq('id', ticketId);
};

export const updateTicketStatus = async (
  ticketId: string,
  status: 'open' | 'in_progress' | 'resolved',
): Promise<void> => {
  await supabase
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId);
};
