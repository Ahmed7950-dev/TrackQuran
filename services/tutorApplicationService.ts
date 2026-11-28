// services/tutorApplicationService.ts
// ---------------------------------------------------------------------------
// The site is one school: students sign up at /join, tutors APPLY at /teach.
// An application is one row in tutor_applications per account; the account
// itself is a teacher profile that stays inert (profiles.approved = false)
// until the admin approves it in the admin panel.
//
// The admin lists come from two security-definer functions because the
// e-mail address lives in auth.users, which the browser cannot read
// (migration 20261128_tutor_applications.sql). Both return nothing to anyone
// but the admin.
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

export type EnglishLevel = 'basic' | 'good' | 'fluent' | 'native';

export interface TutorApplication {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  gender: 'male' | 'female' | '';
  nativeLanguage: string;
  englishLevel: EnglishLevel | '';
  yearsTeaching: number | null;
  ijazah: string;
  teachesKids: boolean;
  about: string;
  sampleUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

const fromRow = (r: any): TutorApplication => ({
  userId: r.user_id,
  fullName: r.full_name ?? '',
  email: r.email ?? '',
  phone: r.phone ?? '',
  country: r.country ?? '',
  gender: r.gender ?? '',
  nativeLanguage: r.native_language ?? '',
  englishLevel: r.english_level ?? '',
  yearsTeaching: typeof r.years_teaching === 'number' ? r.years_teaching : null,
  ijazah: r.ijazah ?? '',
  teachesKids: !!r.teaches_kids,
  about: r.about ?? '',
  sampleUrl: r.sample_url ?? '',
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const nullIfBlank = (s: string) => (s.trim() ? s.trim() : null);

/** The signed-in applicant's own application, or null if they have not applied. */
export async function getMyApplication(userId: string): Promise<TutorApplication | null> {
  const { data, error } = await supabase
    .from('tutor_applications').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : null;
}

/** Send (or update) the signed-in applicant's application. Throws on failure. */
export async function saveMyApplication(app: TutorApplication): Promise<TutorApplication> {
  const row = {
    user_id: app.userId,
    full_name: app.fullName.trim(),
    email: nullIfBlank(app.email),
    phone: nullIfBlank(app.phone),
    country: nullIfBlank(app.country),
    gender: app.gender || null,
    native_language: nullIfBlank(app.nativeLanguage),
    english_level: app.englishLevel || null,
    years_teaching: app.yearsTeaching,
    ijazah: nullIfBlank(app.ijazah),
    teaches_kids: app.teachesKids,
    about: nullIfBlank(app.about),
    sample_url: nullIfBlank(app.sampleUrl),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('tutor_applications').upsert(row, { onConflict: 'user_id' }).select('*').single();
  if (error) throw new Error(error.message);
  // The profile name follows the application, so the admin list reads right.
  await supabase.from('profiles').update({ name: row.full_name }).eq('id', app.userId);
  return fromRow(data);
}

// ── Admin ────────────────────────────────────────────────────────────────────

/** Every application, keyed by account id. Admin only (RLS). */
export async function listApplications(): Promise<Record<string, TutorApplication>> {
  const { data, error } = await supabase.from('tutor_applications').select('*');
  if (error) { console.error('listApplications:', error.message); return {}; }
  const out: Record<string, TutorApplication> = {};
  for (const r of data ?? []) out[r.user_id] = fromRow(r);
  return out;
}

export interface PersonRow {
  id: string; name: string; role: string; approved: boolean;
  createdAt: string; email: string; lastSignInAt: string | null;
}

/** Every account with its e-mail. Admin only. */
export async function listPeople(): Promise<Record<string, PersonRow>> {
  const { data, error } = await supabase.rpc('admin_list_people');
  if (error) { console.error('admin_list_people:', error.message); return {}; }
  const out: Record<string, PersonRow> = {};
  for (const r of (data ?? []) as any[]) {
    out[r.id] = {
      id: r.id, name: r.name ?? '', role: r.role ?? 'teacher', approved: !!r.approved,
      createdAt: r.created_at, email: r.email ?? '', lastSignInAt: r.last_sign_in_at ?? null,
    };
  }
  return out;
}

export interface StudentSignup {
  studentId: string;
  subject: 'quran' | 'arabic';
  name: string;
  approvalStatus: string;
  createdAt: string;
  authUserId: string;
  email: string;
  teacherId: string;
  teacherName: string;
}

/** Students who signed up on the website (at /join), newest first. Admin only. */
export async function listStudentSignups(): Promise<StudentSignup[]> {
  const { data, error } = await supabase.rpc('admin_list_student_signups');
  if (error) { console.error('admin_list_student_signups:', error.message); return []; }
  return ((data ?? []) as any[]).map(r => ({
    studentId: r.student_id,
    subject: r.subject === 'arabic' ? 'arabic' : 'quran',
    name: r.name ?? '',
    approvalStatus: r.approval_status ?? 'active',
    createdAt: r.created_at,
    authUserId: r.auth_user_id,
    email: r.email ?? '',
    teacherId: r.teacher_id ?? '',
    teacherName: r.teacher_name ?? '',
  }));
}
