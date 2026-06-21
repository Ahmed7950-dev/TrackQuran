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
  teacherNote?: string;
  quranHomework?: QuranHomework[];
  // ── Billing / scheduling (tutor-only; never shown to the student) ──
  timezone?: string;                       // IANA tz id, e.g. "America/New_York"
  hourlyRate?: number;                     // tutor's hourly rate for this student
  studentType?: 'preply' | 'platform';     // preply = commission taken; platform = none
  preplyPercentage?: number;               // Preply commission %, default 18 (preply only)
}

export interface QuranHomework {
  id: string;
  startSurah: number;
  startAyah: number;
  endSurah: number;
  endAyah: number;
  note?: string;
  assignedAt: string;
  isDone: boolean;
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
  FewestMistakes = 'Fewest mistakes/page',
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

/** Which course (lesson library) a lesson belongs to */
export type ArabicCourseDialect = 'levantine' | 'msa';

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
  activeMeetUrl?: string;          // Google Meet link for the next lesson
  // ── Billing (tutor-only; same as Quran students) ──
  hourlyRate?: number;
  studentType?: 'preply' | 'platform';
  preplyPercentage?: number;
  createdAt: string;
}

export interface ArabicLesson {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  level: 1 | 2 | 3;               // Which course level this lesson belongs to (default 1)
  dialect: ArabicCourseDialect;   // Which course (levantine | msa) this lesson belongs to
  pdfUrl?: string;
  videoUrl?: string;   // YouTube URL for the dialogue video section
  teacherNote?: string;     // Private notes / lesson plan from the teacher
  grammarSummary?: string;  // Grammar rules / summary for the lesson
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Arabic lesson progress (per student per lesson) ──────────────────────────
export type ArabicLessonStatus = 'not_started' | 'in_progress' | 'done';

export interface ArabicLessonProgress {
  studentId: string;
  lessonId: string;
  status: 'in_progress' | 'done';   // absence of a record = 'not_started'
  lastSlide: number;                // 1-based page to resume on
  totalSlides?: number;
  revisionCount: number;            // completed revisions after the first 'done'
  updatedAt: string;
}

export type ArabicLessonLogKind = 'progress' | 'done' | 'revision';

export interface ArabicLessonLog {
  id: string;
  studentId: string;
  lessonId: string;
  kind: ArabicLessonLogKind;
  slide?: number;
  createdAt: string;
}

export interface ArabicLevelPlan {
  level: 1 | 2 | 3;
  dialect: ArabicCourseDialect;
  planImageUrl?: string;
}

// ── Homework (exercises per lesson) ──────────────────────────────────────────

export type HomeworkQuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'translate_to_arabic'
  | 'translate_to_english'
  | 'fill_blank'
  | 'fill_blank_options'
  | 'short_answer'
  | 'matching'
  | 'multi_answer';

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

export interface HomeworkItem {
  id: string;
  lessonId: string;
  itemType: ArabicExamItemType;
  orderIndex: number;
  content?: string;
  imageUrl?: string;
  questionType?: HomeworkQuestionType;
  options?: string[];
  correctAnswer?: string;
  marks?: number;
  createdAt: string;
}

// ── Arabic Exams ──────────────────────────────────────────────────────────────

export type ExamVersion = 'arabic' | 'transliteration';

export type LeaderboardPrivacy = 'full' | 'first_name' | 'anonymous';

export type ArabicExamItemType =
  | 'section'      // section divider with a title
  | 'divider'      // plain horizontal divider
  | 'headline'     // bold heading text
  | 'instruction'  // instruction text
  | 'paragraph'    // body paragraph text
  | 'image'        // image
  | 'question';    // a gradeable question (reuses HomeworkQuestionType)

export interface ArabicExam {
  id: string;
  level: 1 | 2 | 3;
  version: ExamVersion;
  title: string;
  timeLimitMinutes?: number;     // undefined = no limit
  passingPercentage: number;     // e.g. 70
  status: 'draft' | 'published';
  totalMarks: number;            // sum of question marks (auto-calculated)
  leaderboardPrivacy: LeaderboardPrivacy;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArabicExamItem {
  id: string;
  examId: string;
  itemType: ArabicExamItemType;
  orderIndex: number;
  content?: string;                  // text for section/headline/instruction/paragraph + question prompt
  imageUrl?: string;                 // for image items
  questionType?: HomeworkQuestionType;
  options?: string[];                // for multiple_choice / fill_blank_options
  correctAnswer?: string;            // for auto-grading objective questions
  marks?: number;                    // for question items
  createdAt: string;
}

export interface ArabicExamUnlock {
  id: string;
  studentId: string;
  level: number;
  unlockedBy?: string;               // tutor id
  unlockedAt: string;
  retakeAllowed: boolean;
}

export type ExamAttemptStatus =
  | 'in_progress'
  | 'submitted'
  | 'under_review'
  | 'result_published';

// Per-question grading record stored in attempt.grading keyed by item id
export interface ExamItemGrading {
  awarded: number;        // marks awarded
  correct: boolean;       // marked correct/wrong by tutor (or auto)
  correction?: string;    // tutor's correction / explanation
}

export interface ArabicExamAttempt {
  id: string;
  examId: string;
  studentId: string;
  studentName?: string;
  level: number;
  version: ExamVersion;
  attemptNumber: number;
  status: ExamAttemptStatus;
  startedAt: string;
  submittedAt?: string;
  markedAt?: string;
  publishedAt?: string;
  answers: Record<string, string>;            // itemId -> answer
  grading: Record<string, ExamItemGrading>;   // itemId -> grading
  totalScore?: number;
  percentage?: number;
  passed?: boolean;
  generalFeedback?: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  studentId: string;
  displayName: string;       // formatted per the exam's privacy setting
  score: number;
  percentage: number;
  passed: boolean;
  attemptNumber: number;
  completedAt?: string;      // published_at / submitted_at
  isSelf: boolean;
  version?: ExamVersion;     // which exam version this entry is from
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

export interface LessonSession {
  id: string;
  teacherId: string;
  studentId: string;
  gcalEventId?: string;   // set when linked from Google Calendar
  title?: string;         // event title
  startAt: string;        // ISO datetime
  endAt?: string;         // ISO datetime
  meetUrl?: string;       // Google Meet link
  status: 'confirmed' | 'pending' | 'cancelled';
  createdAt: string;
}