// services/familySettingsService.ts
// -----------------------------------------------------------------------------
// Per-family switches the tutor sets, today just one: does this family pay for
// ONE Preply subscription, or does each child have their own account?
//
// It decides two things:
//   • whether setting a renewal date on one member writes it to the others;
//   • whether the day-before reminder is worded for the family or per child.
//
// Storage-only (public `tajweed-assets` bucket, one small JSON per tutor), like
// the student archive — so it needs no migration and no new table.
//
//   family-settings/<teacherId>.json   →  { "<familyLinkId>": { sharedSubscription: true } }
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'family-settings';

export interface FamilySettings {
  /** One subscription for the whole family — off by default, because siblings
   *  often have separate Preply accounts with their own renewal dates. */
  sharedSubscription: boolean;
}

export type FamilySettingsMap = Record<string, FamilySettings>;

const pathFor = (teacherId: string): string => `${FOLDER}/${encodeURIComponent(teacherId)}.json`;
const publicUrl = (path: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

export async function loadFamilySettings(teacherId: string): Promise<FamilySettingsMap> {
  if (!teacherId) return {};
  try {
    const res = await fetch(`${publicUrl(pathFor(teacherId))}?t=${Date.now()}`);
    if (!res.ok) return {};                       // never saved anything yet
    const data = (await res.json()) as FamilySettingsMap;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};                                    // offline — treat as defaults
  }
}

async function save(teacherId: string, map: FamilySettingsMap): Promise<boolean> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(teacherId), blob, {
    upsert: true, cacheControl: '30', contentType: 'application/json',
  });
  if (error) { console.error('saveFamilySettings:', error.message); return false; }
  return true;
}

/** Turn the shared subscription on or off for one family. Returns the new map. */
export async function setFamilySharedSubscription(
  teacherId: string, familyLinkId: string, shared: boolean,
): Promise<FamilySettingsMap> {
  const map = await loadFamilySettings(teacherId);
  if (shared) map[familyLinkId] = { ...(map[familyLinkId] ?? {}), sharedSubscription: true };
  else delete map[familyLinkId];                  // absent = the default, off
  await save(teacherId, map);
  return map;
}

export const familySharesSubscription = (
  map: FamilySettingsMap, familyLinkId: string | undefined,
): boolean => !!familyLinkId && !!map[familyLinkId]?.sharedSubscription;
