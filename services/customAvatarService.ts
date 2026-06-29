// customAvatarService.ts
// -----------------------------------------------------------------------------
// Lets a tutor save their OWN animated avatars by pasting Lottie JSON. The JSON
// is stored as a public file in the existing `tajweed-assets` bucket (so it can
// be fetched anywhere a normal avatar is, including public family/report links),
// and indexed in `tutor_lottie_icons` so the tutor can reuse it across students.
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'lottie-icons';

export interface CustomAvatar {
  id: string;
  name: string;
  url: string;
}

async function currentTeacherId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** All custom avatars the signed-in tutor has saved, newest first. */
export async function listCustomAvatars(): Promise<CustomAvatar[]> {
  const teacherId = await currentTeacherId();
  if (!teacherId) return [];
  const { data, error } = await supabase
    .from('tutor_lottie_icons')
    .select('id, name, url')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
  if (error) { console.error('listCustomAvatars:', error.message); return []; }
  return (data ?? []) as CustomAvatar[];
}

/** Validate + save a pasted Lottie JSON. Throws a user-facing Error on bad input. */
export async function addCustomAvatar(name: string, json: string): Promise<CustomAvatar> {
  const teacherId = await currentTeacherId();
  if (!teacherId) throw new Error('You must be signed in to add an icon.');

  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('That is not valid JSON — paste the full Lottie code.'); }
  const looksLottie = parsed && typeof parsed === 'object' && ('layers' in (parsed as object) || 'op' in (parsed as object));
  if (!looksLottie) throw new Error('That JSON does not look like a Lottie animation.');

  const fileId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${FOLDER}/${teacherId}/${fileId}.json`;
  const blob = new Blob([json], { type: 'application/json' });

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true, contentType: 'application/json', cacheControl: '3600',
  });
  if (upErr) { console.error('addCustomAvatar upload:', upErr.message); throw new Error('Could not upload the icon. Please try again.'); }

  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const { data, error } = await supabase
    .from('tutor_lottie_icons')
    .insert({ teacher_id: teacherId, name: (name.trim() || 'My icon'), url, storage_path: path })
    .select('id, name, url')
    .single();
  if (error) { console.error('addCustomAvatar insert:', error.message); throw new Error('Could not save the icon. Please try again.'); }
  return data as CustomAvatar;
}

/** Remove a custom avatar (storage file + index row). */
export async function deleteCustomAvatar(iconId: string): Promise<boolean> {
  const { data: row } = await supabase.from('tutor_lottie_icons').select('storage_path').eq('id', iconId).single();
  const path = (row as { storage_path?: string } | null)?.storage_path;
  if (path) await supabase.storage.from(BUCKET).remove([path]);
  const { error } = await supabase.from('tutor_lottie_icons').delete().eq('id', iconId);
  if (error) { console.error('deleteCustomAvatar:', error.message); return false; }
  return true;
}
