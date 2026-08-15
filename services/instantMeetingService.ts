// services/instantMeetingService.ts
// -----------------------------------------------------------------------------
// "Meet now" links — a Google Meet the tutor starts for a student OUTSIDE any
// scheduled lesson. The student's portal pops the same join card as a real
// lesson, and the invitation self-expires one hour after it was created.
//
// Storage-only (public `tajweed-assets` bucket, one small JSON per student),
// so this needs no migration: the tutor writes it while signed in, and the
// student portal reads the public URL anonymously.
//
// Delivery is PUSHED, not polled: publishing also broadcasts on a Supabase
// Realtime channel named after the student, so a portal that is already open
// pops the card within a second — no refresh, no waiting for the next poll
// (the poll stays as the offline/missed-message fallback).
//
//   instant-meetings/quran-<studentId>.json
//   instant-meetings/arabic-<shareToken>.json
// -----------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

const BUCKET = 'tajweed-assets';
const FOLDER = 'instant-meetings';

/** How long a "meet now" invitation stays live. */
export const INSTANT_MEETING_MS = 60 * 60 * 1000;   // 1 hour

export type MeetPortal = 'quran' | 'arabic';

export interface InstantMeeting {
  meetUrl: string;
  title: string;
  createdAt: string;   // ISO
  expiresAt: string;   // ISO — the portal stops showing it after this
}

/** Realtime channel both sides meet on — same shape as gameInviteService. */
const channelName = (portal: MeetPortal, key: string): string =>
  `instant-meeting-${portal}-${key}`;

const pathFor = (portal: MeetPortal, key: string): string =>
  `${FOLDER}/${portal}-${encodeURIComponent(key)}.json`;

const publicUrl = (path: string): string =>
  supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Publish a meet-now invitation for this student. */
export async function saveInstantMeeting(
  portal: MeetPortal,
  key: string,
  meetUrl: string,
  title = 'Lesson with your teacher',
): Promise<InstantMeeting | null> {
  const now = Date.now();
  const meeting: InstantMeeting = {
    meetUrl,
    title,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + INSTANT_MEETING_MS).toISOString(),
  };
  const blob = new Blob([JSON.stringify(meeting)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(pathFor(portal, key), blob, {
    upsert: true, cacheControl: '30', contentType: 'application/json',
  });
  if (error) { console.error('saveInstantMeeting:', error.message); return null; }
  void announce(portal, key);        // wake any portal that is already open
  return meeting;
}

/** Tell open portals to re-check right now. Best-effort: the file is already
 *  published, so a lost broadcast only costs the student one poll interval. */
async function announce(portal: MeetPortal, key: string): Promise<void> {
  try {
    const ch = supabase.channel(channelName(portal, key));
    await new Promise<void>(resolve => {
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolve();
      });
      setTimeout(resolve, 4000);     // never hang the click on a dead socket
    });
    await ch.send({ type: 'broadcast', event: 'meet', payload: { at: Date.now() } });
    setTimeout(() => { void supabase.removeChannel(ch); }, 1500);
  } catch { /* the portal still finds it on its next poll */ }
}

/**
 * Listen for meet-now invitations for this student. `onPing` fires when the
 * tutor publishes one; the caller re-reads the invitation itself.
 * Returns an unsubscribe function.
 */
export function subscribeInstantMeeting(
  portal: MeetPortal,
  key: string,
  onPing: () => void,
): () => void {
  const ch = supabase.channel(channelName(portal, key), { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'meet' }, () => { try { onPing(); } catch { /* listener errors stay local */ } });
  ch.subscribe();
  return () => { void supabase.removeChannel(ch); };
}

/** The live invitation for this student, or null when there is none / it expired. */
export async function loadInstantMeeting(portal: MeetPortal, key: string): Promise<InstantMeeting | null> {
  try {
    const res = await fetch(`${publicUrl(pathFor(portal, key))}?t=${Date.now()}`);
    if (!res.ok) return null;                       // never created, or removed
    const m = (await res.json()) as InstantMeeting;
    if (!m?.meetUrl || !m?.expiresAt) return null;
    if (Date.now() >= new Date(m.expiresAt).getTime()) return null;   // lapsed
    return m;
  } catch {
    return null;                                    // offline — try again next tick
  }
}

/** End an invitation early (tutor side). */
export async function clearInstantMeeting(portal: MeetPortal, key: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([pathFor(portal, key)]);
  if (error) console.error('clearInstantMeeting:', error.message);
}
