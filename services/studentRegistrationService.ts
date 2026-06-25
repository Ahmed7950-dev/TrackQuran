// services/studentRegistrationService.ts
// Self-registration: a student (signed in with Google) creates their own Quran
// and/or Arabic record, assigned to a chosen tutor, in 'pending' state until the
// tutor confirms them.

import { supabase } from '../lib/supabase';
import { saveStudent } from './dataService';
import { saveArabicStudent } from './arabicService';
import { createNotification } from './notificationService';
import { Student, ArabicStudent } from '../types';

/** Tell the chosen tutor a new student wants to join (shows in their bell). */
export async function notifyTutorOfJoinRequest(tutorId: string, studentName: string, subjects: string[]): Promise<void> {
  await createNotification({
    teacherId: tutorId,
    studentId: 'self-registration',
    recipient: 'tutor',
    bookingId: null,
    type: 'student_join_request',
    title: 'New student request',
    body: `${studentName} wants to join for ${subjects.join(' & ')}. Review and confirm in your dashboard.`,
  });
}

/** Mark the signed-in user's profile as a student so they're recognised as one
 *  on later logins. NON-DESTRUCTIVE: an account that is already a teacher/admin
 *  keeps that role — the same Google account can be both a tutor and a student
 *  (their tutor workspace stays at "/", their student portal lives at "/student").
 *  Only a brand-new account (or an existing student) gets role='student'. */
export async function markProfileAsStudent(userId: string, name: string): Promise<void> {
  try {
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (data?.role === 'teacher' || data?.role === 'admin') return; // dual role — don't demote them
    await supabase.from('profiles').upsert({ id: userId, name, role: 'student' }, { onConflict: 'id' });
  } catch (e) { console.error('markProfileAsStudent:', e); }
}

/** Fetch the signed-in student's own records (by auth_user_id). */
export async function getMyStudentRecords(authUserId: string): Promise<{ quran: Student | null; arabic: ArabicStudent | null }> {
  const [q, a] = await Promise.all([
    supabase.from('students').select('*').eq('auth_user_id', authUserId).maybeSingle(),
    supabase.from('arabic_students').select('*').eq('auth_user_id', authUserId).maybeSingle(),
  ]);
  // Reuse the row mappers indirectly: re-fetch through the typed services would
  // require teacher scoping, so map the minimal fields we need here.
  return {
    quran: q.data ? (rowToQuran(q.data) as Student) : null,
    arabic: a.data ? (rowToArabic(a.data) as ArabicStudent) : null,
  };
}

// Lightweight row mappers (only the fields the student side reads).
const rowToQuran = (r: any): Partial<Student> => ({
  id: r.id, name: r.name, dob: r.dob ?? undefined,
  recitationAchievements: r.recitation_achievements ?? [],
  memorizationAchievements: r.memorization_achievements ?? [],
  attendance: r.attendance ?? [],
  masteredTajweedRules: r.mastered_tajweed_rules ?? [],
  tafsirReviews: r.tafsir_reviews ?? [],
  tafsirMemorizationReviews: r.tafsir_memorization_reviews ?? [],
  mistakes: r.mistakes ?? {},
  quranHomework: r.quran_homework ?? [],
  timezone: r.timezone ?? undefined,
  authUserId: r.auth_user_id ?? undefined,
  approvalStatus: r.approval_status ?? undefined,
});
const rowToArabic = (r: any): Partial<ArabicStudent> => ({
  id: r.id, teacherId: r.teacher_id, name: r.name,
  authUserId: r.auth_user_id ?? undefined,
  approvalStatus: r.approval_status ?? undefined,
  shareToken: r.share_token ?? undefined,
});

export interface StudentSubjectInfo {
  studentId: string;
  teacherId: string;
  approval: 'pending' | 'active' | 'rejected';
  reportId?: string;
  shareToken?: string;
}

/** Resolve everything the logged-in student portal needs from their auth id:
 *  name, and per-subject (studentId, teacherId, approval, reportId/shareToken). */
export async function loadStudentSession(authUserId: string): Promise<{
  name: string; quran?: StudentSubjectInfo; arabic?: StudentSubjectInfo;
} | null> {
  const [q, a] = await Promise.all([
    supabase.from('students').select('id, name, teacher_id, approval_status').eq('auth_user_id', authUserId).maybeSingle(),
    supabase.from('arabic_students').select('id, name, teacher_id, approval_status, share_token').eq('auth_user_id', authUserId).maybeSingle(),
  ]);
  if (!q.data && !a.data) return null;
  const name = (q.data?.name || a.data?.name || 'Student') as string;

  let quran: StudentSubjectInfo | undefined;
  if (q.data) {
    // The student's portal is the same shared report the tutor maintains.
    const rep = await supabase.from('shared_reports').select('id').eq('student_id', q.data.id).maybeSingle();
    quran = {
      studentId: q.data.id, teacherId: q.data.teacher_id,
      approval: (q.data.approval_status ?? 'active') as StudentSubjectInfo['approval'],
      reportId: rep.data?.id ?? undefined,
    };
  }

  let arabic: StudentSubjectInfo | undefined;
  if (a.data) {
    arabic = {
      studentId: a.data.id, teacherId: a.data.teacher_id,
      approval: (a.data.approval_status ?? 'active') as StudentSubjectInfo['approval'],
      shareToken: a.data.share_token ?? undefined,
    };
  }
  return { name, quran, arabic };
}

export interface QuranOnboarding {
  lessonsForSelf: boolean;
  lessonsForWhom?: string;
  lessonsPerWeek?: number;
  quranLevel?: number;
  studyFocus: string[];
  studyAddons: string[];
}

/** Create the student's Quran record (pending) under the chosen tutor. */
export async function registerQuranStudent(params: {
  authUserId: string; tutorId: string; name: string; yearOfBirth: number; timezone: string;
  onboarding: QuranOnboarding;
}): Promise<void> {
  const student: Student = {
    id: crypto.randomUUID(),
    name: params.name,
    dob: `${params.yearOfBirth}-01-01`,
    recitationAchievements: [], memorizationAchievements: [], attendance: [],
    masteredTajweedRules: [], tafsirReviews: [], tafsirMemorizationReviews: [],
    mistakes: {}, quranHomework: [],
    timezone: params.timezone,
    authUserId: params.authUserId,
    selfRegistered: true,
    approvalStatus: 'pending',
    lessonsForSelf: params.onboarding.lessonsForSelf,
    lessonsForWhom: params.onboarding.lessonsForWhom,
    lessonsPerWeek: params.onboarding.lessonsPerWeek,
    quranLevel: params.onboarding.quranLevel,
    studyFocus: params.onboarding.studyFocus,
    studyAddons: params.onboarding.studyAddons,
  } as Student;
  await saveStudent(params.tutorId, student);
}

/** Create the student's Arabic record (pending) under the chosen tutor. */
export async function registerArabicStudent(params: {
  authUserId: string; tutorId: string; name: string; yearOfBirth: number; timezone: string;
  arabic: Partial<ArabicStudent>;
}): Promise<void> {
  const student: ArabicStudent = {
    id: crypto.randomUUID(),
    teacherId: params.tutorId,
    name: params.name,
    dob: `${params.yearOfBirth}-01-01`,
    forSelf: params.arabic.forSelf ?? true,
    forWhom: params.arabic.forWhom,
    arabicDialects: params.arabic.arabicDialects ?? [],
    whatsapp: params.arabic.whatsapp,
    arabicLevel: params.arabic.arabicLevel ?? 'beginner',
    learningPurposes: params.arabic.learningPurposes ?? [],
    topicsToFocus: params.arabic.topicsToFocus ?? [],
    nationality: params.arabic.nationality,
    timezone: params.timezone,
    availability: [],
    goalDeadline: params.arabic.goalDeadline,
    completedLessonIds: [],
    authUserId: params.authUserId,
    selfRegistered: true,
    approvalStatus: 'pending',
    createdAt: new Date().toISOString(),
  } as ArabicStudent;
  await saveArabicStudent(params.tutorId, student);
}
