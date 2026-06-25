// services/studentRegistrationService.ts
// Self-registration: a student (signed in with Google) creates their own Quran
// and/or Arabic record, assigned to a chosen tutor, in 'pending' state until the
// tutor confirms them.

import { supabase } from '../lib/supabase';
import { saveStudent } from './dataService';
import { saveArabicStudent } from './arabicService';
import { Student, ArabicStudent } from '../types';

/** Mark the signed-in user's profile as a student (so they're excluded from the
 *  tutor directory and recognised as a student on later logins). */
export async function markProfileAsStudent(userId: string, name: string): Promise<void> {
  try {
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
