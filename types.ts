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
}


export interface TafsirReview {
  id: string;
  date: string; // ISO string
  surah: number;
  reviewQuality: number; // 1-10
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

// ── Tajweed lesson slide system ─────────────────────────────────────────────
// Slides are rendered on a 1280×720 virtual canvas. All x/y/w/h are in canvas
// units; the viewer scales them down responsively while preserving aspect.

export interface TextElement {
  type: 'text';
  id: string;
  x: number; y: number; w: number; h: number;
  text: string;
  fontSize: number;        // px on the 1280×720 canvas
  color: string;           // hex
  bold: boolean;
  align: 'left' | 'center' | 'right';
  fontFamily?: string;     // optional override (e.g. 'Hafs' for Arabic)
}

export interface ImageElement {
  type: 'image';
  id: string;
  x: number; y: number; w: number; h: number;
  url: string;
}

export type SlideElement = TextElement | ImageElement;

export interface Slide {
  id: string;
  background?: string;     // hex; default '#ffffff'
  elements: SlideElement[];
}

export interface TajweedLesson {
  id: string;
  title: string;
  description?: string;
  orderIndex: number;
  pdfUrl?: string;
  slides: Slide[];
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