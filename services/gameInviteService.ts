// services/gameInviteService.ts
// -----------------------------------------------------------------------------
// Realtime game invitations between a tutor and a student, scoped per student.
//
// Both sides of a pairing meet on one Supabase broadcast channel named after
// the student id. The side that created an online game room sends an invite
// ({game, join url, sender}); whoever is listening on the other side (the
// tutor with that student's page open, or the student inside their portal)
// gets a popup and can join the room directly — no link copying.
//
// The channel is refcount-shared: a page that both listens (popup) and sends
// (game lobby) reuses one socket subscription. Broadcasts use self: true —
// receivers filter out invites from their own role, so the echo is harmless
// and keeps a single-page sanity test possible.
// -----------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

export interface GameInvite {
  game: string;                    // display name, e.g. "Letter Race"
  url: string;                     // full join link for the room
  fromName: string;
  fromRole: 'tutor' | 'student';
  sentAt: number;
}

type Entry = {
  ch: ReturnType<typeof supabase.channel>;
  ready: Promise<boolean>;
  refs: number;
  handlers: Set<(invite: GameInvite) => void>;
};

const entries = new Map<string, Entry>();

function acquire(studentId: string): Entry {
  let e = entries.get(studentId);
  if (!e) {
    const handlers = new Set<(invite: GameInvite) => void>();
    const ch = supabase.channel(`game-invite-${studentId}`, { config: { broadcast: { self: true } } });
    ch.on('broadcast', { event: 'game-invite' }, ({ payload }: { payload: GameInvite }) => {
      handlers.forEach(h => { try { h(payload); } catch { /* listener errors stay local */ } });
    });
    const ready = new Promise<boolean>(resolve => {
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') resolve(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') resolve(false);
      });
    });
    e = { ch, ready, refs: 0, handlers };
    entries.set(studentId, e);
  }
  e.refs++;
  return e;
}

function release(studentId: string) {
  const e = entries.get(studentId);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    entries.delete(studentId);
    try { supabase.removeChannel(e.ch); } catch { /* already gone */ }
  }
}

/** Listen for invites addressed to this student's channel. Returns an unsubscribe fn. */
export function onGameInvites(studentId: string, cb: (invite: GameInvite) => void): () => void {
  const e = acquire(studentId);
  e.handlers.add(cb);
  return () => { e.handlers.delete(cb); release(studentId); };
}

/** Broadcast an invite on the student's channel. Resolves true once delivered to the server. */
export async function sendGameInvite(studentId: string, invite: Omit<GameInvite, 'sentAt'>): Promise<boolean> {
  const e = acquire(studentId);
  try {
    if (!(await e.ready)) return false;
    const res = await e.ch.send({ type: 'broadcast', event: 'game-invite', payload: { ...invite, sentAt: Date.now() } });
    return res === 'ok';
  } catch {
    return false;
  } finally {
    // keep the channel briefly for follow-up sends, then drop our ref
    setTimeout(() => release(studentId), 3000);
  }
}
