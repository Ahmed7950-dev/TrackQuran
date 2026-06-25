import { supabase } from '../lib/supabase';
import { TutorDirectoryEntry } from '../types';

/**
 * Public list of all tutors on the platform, for a registering student to pick
 * from. Reads the safe directory fields via the SECURITY DEFINER `list_tutors`
 * RPC (no auth required).
 */
export async function listTutors(): Promise<TutorDirectoryEntry[]> {
  const { data, error } = await supabase.rpc('list_tutors');
  if (error) { console.error('listTutors:', error.message); return []; }
  return ((data ?? []) as Array<{ id: string; name: string; photo_url: string | null; bio: string | null; subjects: string[] | null }>)
    .map(r => ({
      id: r.id,
      name: r.name,
      photoUrl: r.photo_url ?? undefined,
      bio: r.bio ?? undefined,
      subjects: r.subjects ?? undefined,
    }));
}
