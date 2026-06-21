import { supabase } from '../lib/supabase';
import { createOrUpdateSharedReport } from './dataService';
import { ensureShareTokenById } from './arabicService';

export interface FamilyMember {
  /** Unique ID for this member slot within the family link */
  id: string;
  name: string;
  type: 'quran' | 'arabic';
  /** For Quran students: shared_reports.id → URL /report/<report_id> */
  report_id?: string;
  /** For Arabic students: arabic_students.shareToken → URL /arabic/s/<share_token> */
  share_token?: string;
}

export interface FamilyLink {
  id: string;
  teacher_id: string;
  /** Display name shown on the family page, e.g. "Al-Hassan Family" */
  name: string;
  members: FamilyMember[];
  created_at: string;
  updated_at: string;
}

export const getFamilyLinks = async (teacherId: string): Promise<FamilyLink[]> => {
  const { data, error } = await supabase
    .from('family_links')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error) { console.error('getFamilyLinks:', error.message); return []; }
  return (data ?? []) as FamilyLink[];
};

export const saveFamilyLink = async (
  link: Omit<FamilyLink, 'created_at' | 'updated_at'>,
): Promise<string> => {
  const { data, error } = await supabase
    .from('family_links')
    .upsert({ ...link, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('id')
    .single();
  if (error) { console.error('saveFamilyLink:', error.message); throw error; }
  return data.id as string;
};

export const deleteFamilyLink = async (id: string): Promise<void> => {
  const { error } = await supabase.from('family_links').delete().eq('id', id);
  if (error) console.error('deleteFamilyLink:', error.message);
};

export interface FamilyStudentRef { kind: 'quran' | 'arabic'; studentId: string; name: string; }

/**
 * Create or update a family link from a set of students (used when a tutor
 * groups students on a calendar event). Ensures each member's underlying portal
 * (Quran shared report / Arabic share token) exists, then upserts the
 * family_links row. Pass `existingId` to update an existing family in place so
 * its /family/<id> URL never changes. Returns the family link id.
 */
export const ensureFamilyLink = async (
  teacherId: string,
  familyName: string,
  students: FamilyStudentRef[],
  existingId?: string,
): Promise<string | null> => {
  const members: FamilyMember[] = [];
  for (const s of students) {
    if (s.kind === 'quran') {
      const reportId = await createOrUpdateSharedReport(teacherId, s.studentId, s.name, {
        studentName: s.name,
        generatedAt: new Date().toISOString(),
      });
      if (!reportId) continue;
      members.push({ id: crypto.randomUUID(), name: s.name, type: 'quran', report_id: reportId });
    } else {
      const token = await ensureShareTokenById(s.studentId);
      if (!token) continue;
      members.push({ id: crypto.randomUUID(), name: s.name, type: 'arabic', share_token: token });
    }
  }
  if (members.length < 2) return null;
  const id = existingId ?? crypto.randomUUID();
  try {
    await saveFamilyLink({ id, teacher_id: teacherId, name: familyName || 'Family', members });
  } catch { return null; }
  return id;
};

export const getFamilyLinkById = async (id: string): Promise<FamilyLink | null> => {
  const { data, error } = await supabase
    .from('family_links')
    .select('*')
    .eq('id', id)
    .single();
  if (error) { console.error('getFamilyLinkById:', error.message); return null; }
  return data as FamilyLink;
};
