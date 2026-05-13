import type { ReactNode } from 'react';

export enum AttendanceStatus {
  Present = 'PRESENT',
  Absent = 'ABSENT',
  Rescheduled = 'RESCHEDULED',
}

export interface AttendanceRecord {
  id: string;
  date: string; // ISO string
  status: AttendanceStatus;
}

export interface RecitationAchievement {
  id:string;
  date: string; // ISO string
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  readingQuality: number; // 1-10
  tajweedQuality: number; // 1-10
  notes?: string;
  pagesCompleted: number;
  versesCompleted: number;
  pointsEarned: number;
  isRevision?: boolean; // true = Reading Revision log
}

export interface MemorizationAchievement {
  id: string;
  date: string; // ISO string
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  memorizationQuality: number; // 1-10
  notes?: string;
  pagesCompleted: number;
  versesCompleted: number;
  isRevision?: boolean; // true = Hifz Revision log
}


export interface TafsirReview {
  id: string;
  date: string; // ISO string
  surah: number;           // kept for backward compat (original single-surah field)
  startSurah?: number;     // full verse-range fields (new logs)
  startAyah?: number;
  endSurah?: number;
  endAyah?: number;
  reviewQuality?: number;  // 1-10 (not collected for Tafseer in live logging)
}

export interface TafsirMemorizationReview {
  id: string;
  date: string; // ISO string
  surah: number;
  reviewQuality: number; // 1-10
}

export interface Mistake {
  level: number;
  date: string; // ISO string
  errorType?: 'tajweed' | 'reading'; // Type of error
  errorText?: string; // Text description of the error
}

export type AgeCategory = 'young_gems' | 'aspiring_scholars' | 'devoted_learners';

export interface Student {
  id: string;
  name: string;
  dob?: string; // ISO date — optional; use ageCategory when absent
  ageCategory?: AgeCategory; // Manual override; auto-derived from dob when dob is present
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  attendance: AttendanceRecord[];
  masteredTajweedRules: string[];
  tafsirReviews: TafsirReview[];
  tafsirMemorizationReviews: TafsirMemorizationReview[];
  mistakes: { [key: string]: Mistake };
}

// ── Tajweed lesson ──────────────────────────────────────────────────────────

export interface TajweedLesson {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  pdfUrl?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TajweedCompletion {
  lessonId: string;
  lessonTitle: string;
  completedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  provider: 'email' | 'google';
}

// New types for role-based authentication
export interface TeacherUser extends User {
  role: 'teacher' | 'admin';
}

export interface StudentUser {
  role: 'student';
  student: Student;
  teacherId: string;
}

export type AuthenticatedUser = TeacherUser | StudentUser;

// ── Support tickets ────────────────────────────────────────────────────────────
export interface SupportTicket {
  id: string;
  teacherId: string;
  teacherName: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string | null;
  senderName: string;
  senderRole: 'teacher' | 'admin';
  body: string;
  createdAt: string;
}


export enum SortCriteria {
  HighestPoints = 'Recitation Score',
  MostMemorized = 'Most memorized (pages)',
  MostAttendance = 'Most lessons attended',
  Name = 'Sort by name',
  Age = 'Sort by age',
}

export enum TimePeriod {
    LastWeek = 'Last Week',
    LastMonth = 'Last Month',
    Last6Months = 'Last 6 Months',
    LastYear = 'Last Year',
    AllTime = 'All Time'
}

export interface SurahMetadata {
    number: number;
    name: string; // Arabic name
    transliteratedName: string;
    englishName: string;
    revelationType: string;
    numberOfAyahs: number;
    startPage: number;
    endPage: number;
}

export interface Milestone {
    id: string;
    title: string;
    description: string;
    badgeIcon: ReactNode;
    isAchieved: (completedPages: Set<number>) => boolean;
}

// Types for Live Lesson Page
export interface QuranVerse {
  id: number;
  verse_key: string;
  text_uthmani: string;
}

export interface Progress {
  surah: number;
  ayah: number;
}

export interface ProgressRange {
  id: string;
  start: Progress;
  end: Progress;
  memorizationAchievements: MemorizationAchievement[];
  onLogMemorizationRange: (studentId: string, range: { start: Progress, end: Progress }) => void;
  onRemoveMemorizationAchievement: (studentId: string, achievementId: string) => void;
}

// ── Arabic feature types ─────────────────────────────────────────────────────

export interface WeeklySlot {
  day: number;       // 0 = Monday … 5 = Saturday
  startHour: number; // 12–22  (12:00 PM → 11:00 PM)
  endHour: number;   // startHour + 1
}

export type ArabicDialect = 'msa' | 'levantine' | 'quranic';

export interface ArabicStudent {
  id: string;
  teacherId: string;
  name: string;
  dob?: string;                    // ISO date
  forSelf: boolean;
  forWhom?: string;                // e.g. "son", "wife"
  arabicDialects: ArabicDialect[];
  whatsapp?: string;
  arabicLevel: string;
  learningPurposes: string[];
  topicsToFocus: string[];
  nationality?: string;
  timezone: string;                // IANA tz id, e.g. "America/New_York"
  availability: WeeklySlot[];
  goalDeadline?: string;           // ISO date
  completedLessonIds: string[];    // arabic lesson ids
  shareToken?: string;             // UUID; present once tutor has generated the link
  createdAt: string;
}

export interface ArabicLesson {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  pdfUrl?: string;
  videoUrl?: string;   // YouTube URL for the dialogue video section
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Homework (exercises per lesson) ──────────────────────────────────────────

export type HomeworkQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'translate_to_arabic'
  | 'translate_to_english'
  | 'fill_blank'
  | 'fill_blank_options';

export interface HomeworkQuestion {
  id: string;
  lessonId: string;
  type: HomeworkQuestionType;
  question: string;
  options?: string[];       // for multiple_choice and fill_blank_options
  correctAnswer: string;
  orderIndex: number;
  createdAt: string;
}

// ── Vocabulary (word table per lesson) ────────────────────────────────────────

export interface VocabWord {
  id: string;
  lessonId: string;
  arabic: string;
  transliteration: string;
  english: string;
  orderIndex: number;
  createdAt: string;
}

export type VocabMode = 'arabic' | 'transliteration';

// Wrong-word mistake tracking per student per word
export interface VocabMistakeDetail {
  id: string;
  studentId: string;
  wordId: string;
  lessonId: string;
  missCount: number;
  lastMissedAt: string;
  createdAt: string;
  // denormalised word fields (joined from arabic_lesson_vocabulary)
  arabic: string;
  transliteration: string;
  english: string;
}

// One spaced-repetition slot per (student × word × mode)
// Attempt numbers 1-5; scheduled_at = when it's due; completed_at = when done.
export interface VocabAttempt {
  id: string;
  studentId: string;
  wordId: string;
  lessonId: string;
  attemptNumber: number;   // 1–5
  mode: VocabMode;
  scheduledAt: string;     // ISO — when this attempt is/was due
  completedAt?: string;    // ISO — null = pending
  createdAt: string;
}