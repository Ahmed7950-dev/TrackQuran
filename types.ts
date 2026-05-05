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

export interface Student {
  id: string;
  name: string;
  dob: string; // ISO string for date
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  attendance: AttendanceRecord[];
  masteredTajweedRules: string[];
  tafsirReviews: TafsirReview[];
  tafsirMemorizationReviews: TafsirMemorizationReview[];
  mistakes: { [key: string]: Mistake };
}

export interface User {
  id: string;
  email: string;
  name: string;
  provider: 'email' | 'google';
}

// New types for role-based authentication
export interface TeacherUser extends User {
  role: 'teacher';
}

export interface StudentUser {
  role: 'student';
  student: Student;
  teacherId: string;
}

export type AuthenticatedUser = TeacherUser | StudentUser;


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