// components/GameInvite.tsx
// -----------------------------------------------------------------------------
// UI side of the game-invitation feature (services/gameInviteService.ts).
//
// - GameInviteContext: provided wherever games run with a known tutor↔student
//   pairing (tutor: student's page in App; student: portal SharedReportPage).
//   Games read it to know whether — and on which channel — they can invite.
// - GameInviteButton: dropped into each game's online lobby next to the copy-
//   link button. Renders nothing outside an invite context.
// - GameInvitePopup: mounted once per page that should receive invites; shows
//   "X invited you to a game — join?" with a direct join button.
// -----------------------------------------------------------------------------
import React, { createContext, useContext, useEffect, useState } from 'react';
import { GameInvite, onGameInvites, sendGameInvite } from '../services/gameInviteService';

export interface GameInviteIdentity {
  studentId: string;
  selfName: string;
  selfRole: 'tutor' | 'student';
}

export const GameInviteContext = createContext<GameInviteIdentity | null>(null);

// ── Send button (game lobbies) ───────────────────────────────────────────────
export const GameInviteButton: React.FC<{ game: string; url: string }> = ({ game, url }) => {
  const identity = useContext(GameInviteContext);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  if (!identity || !url) return null;

  const send = async () => {
    if (state === 'sending' || state === 'sent') return;
    setState('sending');
    const ok = await sendGameInvite(identity.studentId, {
      game, url, fromName: identity.selfName, fromRole: identity.selfRole,
    });
    setState(ok ? 'sent' : 'failed');
    setTimeout(() => setState('idle'), 2600);
  };

  const other = identity.selfRole === 'tutor' ? 'student' : 'tutor';
  const label =
    state === 'sent' ? '✓ Invitation sent!' :
    state === 'sending' ? 'Sending…' :
    state === 'failed' ? '✕ Failed — try again' :
    `📨 Send Invitation to ${other}`;

  return (
    <button
      onClick={send}
      style={{
        width: '100%', marginTop: 6, background: state === 'sent' ? '#22c55e' : state === 'failed' ? '#ef4444' : '#8b5cf6',
        color: '#fff', border: 'none', borderRadius: 10, padding: '9px 12px', fontWeight: 900, fontSize: 13,
        cursor: 'pointer', transition: 'background 0.2s',
      }}
    >
      {label}
    </button>
  );
};

// ── Receive popup (tutor's student page / student portal) ────────────────────
export const GameInvitePopup: React.FC<{ identity: GameInviteIdentity }> = ({ identity }) => {
  const [invite, setInvite] = useState<GameInvite | null>(null);

  useEffect(
    () => onGameInvites(identity.studentId, inv => {
      if (inv && inv.fromRole !== identity.selfRole && typeof inv.url === 'string') setInvite(inv);
    }),
    [identity.studentId, identity.selfRole],
  );

  if (!invite) return null;

  const join = () => {
    // join links are built from this app's origin — refuse anything else
    let target: URL | null = null;
    try { target = new URL(invite.url); } catch { /* malformed */ }
    setInvite(null);
    if (target && (target.origin === window.location.origin || target.origin === 'https://www.trackquran.com' || target.origin === 'https://trackquran.com')) {
      window.location.assign(target.href);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 22, padding: '26px 28px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 18px 50px rgba(0,0,0,0.35)' }}>
        <div style={{ fontSize: 46, lineHeight: 1 }}>🎮</div>
        <div style={{ fontWeight: 900, fontSize: 18, color: '#0f172a', margin: '10px 0 4px' }}>
          {invite.fromName || (invite.fromRole === 'tutor' ? 'Your tutor' : 'Your student')} has invited you to a game!
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#475569', marginBottom: 20 }}>{invite.game} — join?</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => setInvite(null)} style={{ background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 12, padding: '11px 20px', fontWeight: 900, fontSize: 14, cursor: 'pointer' }}>Not now</button>
          <button onClick={join} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 24px', fontWeight: 900, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 14px rgba(22,163,74,0.4)' }}>Join Game ▶</button>
        </div>
      </div>
    </div>
  );
};
