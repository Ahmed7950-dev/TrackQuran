import { supabase } from '../lib/supabase';

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

export const getFamilyLinkById = async (id: string): Promise<FamilyLink | null> => {
  const { data, error } = await supabase
    .from('family_links')
    .select('*')
    .eq('id', id)
    .single();
  if (error) { console.error('getFamilyLinkById:', error.message); return null; }
  return data as FamilyLink;
};
