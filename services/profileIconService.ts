// services/profileIconService.ts
// -----------------------------------------------------------------------------
// Animated student profile icons (Lottie JSON) stored in the public
// `tajweed-assets` bucket under `profile-icons/boys|girls/`. A student stores the
// chosen icon's public URL, so it renders everywhere (incl. anonymous family /
// student links) with no listing or auth.
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'profile-icons';

export type IconGender = 'boys' | 'girls';

export interface ProfileIcon {
  name: string;   // file name without extension
  path: string;   // storage path
  url: string;    // public URL (what we store on the student)
  gender: IconGender;
}

export const profileIconUrlForPath = (path: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Upload a Lottie JSON into the boys/girls group. Overwrites a same-named file. */
export async function uploadProfileIcon(file: File, gender: IconGender): Promise<ProfileIcon> {
  const safe = file.name.replace(/\.json$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
  const path = `${FOLDER}/${gender}/${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw error;
  return { name: safe.replace(/\.json$/i, ''), path, url: profileIconUrlForPath(path), gender };
}

/** List all uploaded icons, grouped by boys / girls. */
export async function listProfileIcons(): Promise<Record<IconGender, ProfileIcon[]>> {
  const out: Record<IconGender, ProfileIcon[]> = { boys: [], girls: [] };
  for (const gender of ['boys', 'girls'] as IconGender[]) {
    const { data, error } = await supabase.storage.from(BUCKET).list(`${FOLDER}/${gender}`, { limit: 1000 });
    if (error || !data) continue;
    for (const f of data) {
      if (!f.name.toLowerCase().endsWith('.json')) continue;
      const path = `${FOLDER}/${gender}/${f.name}`;
      out[gender].push({ name: f.name.replace(/\.json$/i, ''), path, url: profileIconUrlForPath(path), gender });
    }
  }
  return out;
}

export async function deleteProfileIcon(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
