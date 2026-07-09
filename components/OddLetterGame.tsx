import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';
import { submitOddLetterScore, getOddLetterLeaderboard, OddLetterEntry, SubmitResult } from '../services/oddLetterService';

// ─────────────────────────────────────────────────────────────────────────────
// Find the Odd Letter — spot the one look-alike letter hiding in a grid of a
// repeated letter (e.g. one ج among many ح).
//
// 1 Player: a timer runs across ROUNDS grids; finish all → your total time is
//   submitted to a global leaderboard and your rank shown.
// 2 Players (online only): share a link/QR; both see the SAME grid each round;
//   whoever clicks the odd letter FIRST wins the round; most round wins after
//   ROUNDS wins the match. Host-authoritative over the WebRTC P2P channel
//   (services/p2pGameChannel), same transport as the flight games.
//
// A wrong click locks that player out briefly so the grid can't be brute-forced.
// ─────────────────────────────────────────────────────────────────────────────

const ONLINE_SITE_URL = 'https://www.lisanquran.com';
const ROUNDS = 5;
const WRONG_LOCKOUT_MS = 1500;
const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri Quran', serif" };

// Confusable Arabic letters — each group shares a shape; the odd one differs by
// dots/small strokes. A round picks a group, one member as the repeated base
// and a DIFFERENT member as the single imposter.
const LOOKALIKE_GROUPS: string[][] = [
  ['ج', 'ح', 'خ'],
  ['ع', 'غ'],
  ['ت', 'ن'],
  ['ز', 'ر'],
  ['د', 'ر'],
  ['ق', 'ف'],
  ['ض', 'ص'],
  ['س', 'ش'],
  ['ذ', 'د'],
  ['ط', 'ظ'],
  ['ه', 'م'],
];

type Mode = '1p' | 'online';
type Phase = 'menu' | 'countdown' | 'playing' | 'roundOver' | 'done';

interface Grid {
  round: number;      // 1-based
  base: string;       // repeated letter
  imposter: string;   // the odd one
  rows: number;
  cols: number;
  impIndex: number;   // which cell is the imposter
}

const rand = (n: number) => Math.floor(Math.random() * n);

function makeGrid(round: number): Grid {
  const group = LOOKALIKE_GROUPS[rand(LOOKALIKE_GROUPS.length)];
  let base = group[rand(group.length)];
  let imposter = group[rand(group.length)];
  while (imposter === base) imposter = group[rand(group.length)];
  // grid grows each round (harder): round1 = 11×11 (121 letters) →
  // round5 = 19×19 (361). More letters + smaller glyphs = tougher spot.
  const n = 9 + round * 2;
  const rows = n, cols = n;
  return { round, base, imposter, rows, cols, impIndex: rand(rows * cols) };
}

const fmtTime = (ms: number) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s - m * 60);
  return m > 0 ? `${m}:${sec.toFixed(1).padStart(4, '0')}` : `${sec.toFixed(2)}s`;
};

// ── Snapshot (host → guest); rides the reliable P2P channel (event 'sync') ──
interface NetSnap {
  ph: Phase;
  round: number;
  grid: Grid | null;
  cn: string;          // countdown text
  wins: [number, number];
  roundWinner: number; // -1 none, 0 host, 1 guest
  matchWinner: number; // -1 none
  names: [string, string];
}

interface Props {
  onExit: () => void;
  roomId?: string;         // set when joining via link
  playerRole?: '1' | '2';  // '2' = guest
}

const OddLetterGame: React.FC<Props> = ({ onExit, roomId: propRoomId, playerRole }) => {
  const isP2 = playerRole === '2';

  const [mode, setMode] = useState<Mode>('1p');
  const [phase, setPhase] = useState<Phase>('menu');
  const phaseRef = useRef<Phase>('menu');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [, setTick] = useState(0);

  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');

  // ── 1P state ──
  const [grid, setGrid] = useState<Grid | null>(null);
  const [roundNum, setRoundNum] = useState(1);
  const startTimeRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [wrongCells, setWrongCells] = useState<Set<number>>(new Set());
  const lockoutRef = useRef(0);
  const [locked, setLocked] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<OddLetterEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const finalMsRef = useRef(0);

  // ── Online state ──
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(null);
  const [p2Joined, setP2Joined] = useState(false);
  const [guestJoined, setGuestJoined] = useState(false);
  const [gotFirstSnap, setGotFirstSnap] = useState(false);
  const [directPath, setDirectPath] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const channelRef = useRef<P2PGameChannel | null>(null);
  const guestNameRef = useRef('Player 2');
  const timersRef = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => { timersRef.current.push(window.setTimeout(fn, ms)); }, []);
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  // Host-authoritative online game model
  const g = useRef({
    round: 1, grid: null as Grid | null, wins: [0, 0] as [number, number],
    roundWinner: -1, matchWinner: -1, cn: '',
    lockout: [0, 0] as [number, number], // per-player wrong-click lockout (host clock)
  });
  const snapRef = useRef<NetSnap | null>(null);

  // ── 1P flow ─────────────────────────────────────────────────────────────────
  const start1P = () => {
    setMode('1p');
    setRoundNum(1);
    setGrid(makeGrid(1));
    setWrongCells(new Set());
    setResult(null);
    startTimeRef.current = performance.now();
    setPhase('playing');
  };

  // 1P timer tick
  useEffect(() => {
    if (phase !== 'playing' || mode !== '1p' || isP2) return;
    let raf = 0;
    const loop = () => { setElapsed(performance.now() - startTimeRef.current); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode, isP2]);

  const finish1P = async () => {
    const totalMs = performance.now() - startTimeRef.current;
    finalMsRef.current = totalMs;
    setPhase('done');
    setLbLoading(true);
    const r = await submitOddLetterScore(p1Name.trim() || 'Player', totalMs, ROUNDS);
    setResult(r);
    setLeaderboard(await getOddLetterLeaderboard(10));
    setLbLoading(false);
  };

  const click1P = (index: number) => {
    if (phase !== 'playing' || locked || !grid) return;
    if (index === grid.impIndex) {
      if (roundNum >= ROUNDS) { finish1P(); return; }
      const next = roundNum + 1;
      setRoundNum(next);
      setGrid(makeGrid(next));
      setWrongCells(new Set());
    } else {
      setWrongCells(prev => new Set(prev).add(index));
      setLocked(true);
      lockoutRef.current = performance.now() + WRONG_LOCKOUT_MS;
      window.setTimeout(() => { setLocked(false); setWrongCells(new Set()); }, WRONG_LOCKOUT_MS);
    }
  };

  // ── Online: HOST ─────────────────────────────────────────────────────────────
  const pushSnap = useCallback(() => {
    const m = g.current;
    const snap: NetSnap = {
      ph: phaseRef.current, round: m.round, grid: m.grid, cn: m.cn,
      wins: m.wins, roundWinner: m.roundWinner, matchWinner: m.matchWinner,
      names: [p1Name.trim() || 'Player 1', guestNameRef.current],
    };
    channelRef.current?.send({ type: 'broadcast', event: 'sync', payload: snap });
  }, [p1Name]);

  const hostStartRound = useCallback((round: number) => {
    const m = g.current;
    m.round = round; m.roundWinner = -1; m.grid = makeGrid(round);
    m.lockout = [0, 0];
    // 3-2-1 countdown, then reveal the grid
    setPhase('countdown'); m.cn = '3'; pushSnap();
    after(700, () => { m.cn = '2'; pushSnap(); });
    after(1400, () => { m.cn = '1'; pushSnap(); });
    after(2100, () => { setPhase('playing'); m.cn = ''; pushSnap(); });
  }, [after, pushSnap]);

  const hostStartMatch = useCallback(() => {
    clearTimers();
    const m = g.current;
    m.wins = [0, 0]; m.matchWinner = -1;
    hostStartRound(1);
  }, [hostStartRound]);

  // host resolves a click from player pIdx (0=host, 1=guest)
  const hostResolveClick = useCallback((pIdx: number, index: number) => {
    const m = g.current;
    if (phaseRef.current !== 'playing' || !m.grid || m.roundWinner !== -1) return;
    if (performance.now() < m.lockout[pIdx]) return; // locked out
    if (index === m.grid.impIndex) {
      m.roundWinner = pIdx;
      m.wins[pIdx]++;
      setPhase('roundOver'); pushSnap();
      after(1600, () => {
        if (m.wins[0] > ROUNDS / 2 || m.wins[1] > ROUNDS / 2 || m.round >= ROUNDS) {
          m.matchWinner = m.wins[0] === m.wins[1] ? -1 : (m.wins[0] > m.wins[1] ? 0 : 1);
          setPhase('done'); pushSnap();
        } else {
          hostStartRound(m.round + 1);
        }
      });
    } else {
      m.lockout[pIdx] = performance.now() + WRONG_LOCKOUT_MS;
      // tell that player they're locked (only needed for the guest)
      if (pIdx === 1) channelRef.current?.send({ type: 'broadcast', event: 'wrong', payload: {} });
      else { setLocked(true); window.setTimeout(() => setLocked(false), WRONG_LOCKOUT_MS); }
    }
  }, [after, pushSnap, hostStartRound]);

  // Host channel setup
  useEffect(() => {
    if (isP2 || mode !== 'online') return;
    const id = onlineRoomId ?? crypto.randomUUID();
    if (!onlineRoomId) { setOnlineRoomId(id); return; }
    const ch = createGameChannel(`odd-letter:${id}`, 'host');
    ch.onPathChange(setDirectPath);
    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { name: string } }) => {
      guestNameRef.current = payload.name || 'Player 2';
      setP2Joined(true); pushSnap();
    });
    ch.on('broadcast', { event: 'tap' }, ({ payload }: { payload: { index: number } }) => {
      hostResolveClick(1, payload.index);
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [mode, isP2, onlineRoomId, pushSnap, hostResolveClick]);

  // Host heartbeat: re-send the current snapshot periodically so a dropped
  // packet on the Supabase fallback path self-heals.
  useEffect(() => {
    if (isP2 || mode !== 'online' || phase === 'menu' || !channelRef.current) return;
    const iv = setInterval(pushSnap, 700);
    return () => clearInterval(iv);
  }, [isP2, mode, phase, pushSnap]);

  // ── Online: GUEST ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isP2 || !propRoomId || !guestJoined) return;
    const ch = createGameChannel(`odd-letter:${propRoomId}`, 'guest');
    ch.onPathChange(setDirectPath);
    ch.on('broadcast', { event: 'sync' }, ({ payload }: { payload: NetSnap }) => {
      snapRef.current = payload;
      setGotFirstSnap(true);
      if (payload.ph !== phaseRef.current) setPhase(payload.ph);
      setTick(t => t + 1);
    });
    ch.on('broadcast', { event: 'wrong' }, () => {
      setLocked(true); window.setTimeout(() => setLocked(false), WRONG_LOCKOUT_MS);
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        const send = () => ch.send({ type: 'broadcast', event: 'ready', payload: { name: p2Name.trim() || 'Player 2' } });
        send();
        const iv = window.setInterval(() => { if (snapRef.current) clearInterval(iv); else send(); }, 2000);
        timersRef.current.push(iv);
      }
    });
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isP2, propRoomId, guestJoined]);

  const guestClick = (index: number) => {
    if (phaseRef.current !== 'playing' || locked) return;
    channelRef.current?.send({ type: 'broadcast', event: 'tap', payload: { index } });
  };

  useEffect(() => () => { clearTimers(); }, []);

  // ── Derived view state ────────────────────────────────────────────────────────
  const online = mode === 'online' || isP2;
  const viewGrid: Grid | null = isP2 ? (snapRef.current?.grid ?? null) : (online ? g.current.grid : grid);
  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/odd-letter/${onlineRoomId}` : '';
  const copyLink = () => { navigator.clipboard?.writeText(shareLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(() => {}); };

  const onCellClick = (i: number) => {
    if (isP2) guestClick(i);
    else if (online) hostResolveClick(0, i);
    else click1P(i);
  };

  // ── Render: the letter grid ────────────────────────────────────────────────────
  const renderGrid = (gr: Grid, opts: { revealIdx?: number } = {}) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gr.cols}, 1fr)`, gap: 'clamp(1px,0.35vw,3px)', width: '100%', maxWidth: 'min(96vw, 760px)', margin: '0 auto' }}>
      {Array.from({ length: gr.rows * gr.cols }, (_, i) => {
        const isImp = i === gr.impIndex;
        const wrong = wrongCells.has(i);
        const reveal = opts.revealIdx === i;
        return (
          <button key={i} onClick={() => onCellClick(i)} disabled={locked || phase !== 'playing'}
            style={{
              aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', borderRadius: 'clamp(2px,0.5vw,6px)', cursor: locked ? 'not-allowed' : 'pointer',
              background: reveal ? '#22c55e' : wrong ? '#fecaca' : '#ffffff',
              color: reveal ? '#fff' : '#0f172a',
              boxShadow: reveal ? '0 0 0 3px #16a34a' : '0 1px 2px rgba(2,6,23,0.08)',
              ...HAFS, fontSize: `clamp(8px, ${(72 / gr.cols).toFixed(1)}vw, 26px)`, lineHeight: 1,
              transition: 'background 0.15s',
            }}>
            <span dir="rtl">{isImp ? gr.imposter : gr.base}</span>
          </button>
        );
      })}
    </div>
  );

  // ═══════════════ MENU ═══════════════
  if (phase === 'menu') {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'linear-gradient(#0f766e,#134e4a)', overflowY: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 520, width: '100%' }}>
          <div style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff' }}>🔍 Find the Odd Letter</div>
          <div style={{ color: '#5eead4', fontWeight: 700, fontSize: 'clamp(13px,1.8vw,16px)', marginBottom: 18 }}>
            Spot the one look-alike letter hiding in the grid!
          </div>

          {!isP2 && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18 }}>
              {(['1p', 'online'] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); if (m === 'online') setOnlineRoomId(null); }} style={{
                  background: mode === m ? '#14b8a6' : '#ffffff18', color: '#fff', border: mode === m ? '3px solid #5eead4' : '3px solid transparent',
                  borderRadius: 16, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer',
                }}>{m === '1p' ? '1 Player' : '🌐 2 Players'}</button>
              ))}
            </div>
          )}

          <input value={isP2 ? p2Name : p1Name} onChange={e => (isP2 ? setP2Name : setP1Name)(e.target.value)}
            placeholder="Your name" maxLength={20}
            style={{ background: '#ffffff14', border: '2px solid #5eead4', color: '#fff', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 15, textAlign: 'center', outline: 'none', width: 240, marginBottom: 16 }} />
          <div />

          {/* Online host: share link + QR */}
          {!isP2 && mode === 'online' && onlineRoomId && (
            <div style={{ background: '#ffffff10', borderRadius: 18, padding: '12px 16px', maxWidth: 420, margin: '0 auto 16px' }}>
              <div style={{ color: '#5eead4', fontWeight: 800, fontSize: 12, marginBottom: 6 }}>Share this link with Player 2:</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, background: '#ffffff14', borderRadius: 10, padding: '7px 10px', fontSize: 10, color: '#cbd5e1', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareLink}</div>
                <button onClick={copyLink} style={{ background: linkCopied ? '#22c55e' : '#14b8a6', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 12px', fontWeight: 900, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{linkCopied ? '✓ Copied' : 'Copy'}</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 10 }}>
                <button onClick={() => setQrOpen(true)} style={{ background: '#fff', border: 'none', borderRadius: 12, padding: 6, cursor: 'pointer' }} title="Tap to enlarge">
                  <QRCodeSVG value={shareLink} size={110} level="M" />
                </button>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>Tap the QR to enlarge · scan to join 📱</span>
              </div>
              {p2Joined
                ? <div style={{ color: '#4ade80', fontWeight: 900, fontSize: 13, marginTop: 8 }}>✅ {guestNameRef.current} joined!</div>
                : <div style={{ color: '#94a3b8', fontWeight: 700, fontSize: 12, marginTop: 8 }}>⏳ Waiting for Player 2…</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            {isP2 ? (
              <button onClick={() => setGuestJoined(true)} disabled={guestJoined} style={{
                background: guestJoined ? '#475569' : 'linear-gradient(160deg,#14b8a6,#0d9488)', color: '#fff', border: 'none',
                borderRadius: 18, padding: '14px 40px', fontWeight: 900, fontSize: 19, cursor: guestJoined ? 'default' : 'pointer',
              }}>{guestJoined ? (gotFirstSnap ? '✅ Connected — waiting for host…' : '⏳ Joining…') : '🔗 Join game'}</button>
            ) : mode === '1p' ? (
              <button onClick={start1P} style={{ background: 'linear-gradient(160deg,#22c55e,#16a34a)', color: '#fff', border: 'none', borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: 'pointer' }}>▶ Start</button>
            ) : (
              <button onClick={hostStartMatch} disabled={!p2Joined} style={{
                background: p2Joined ? 'linear-gradient(160deg,#22c55e,#16a34a)' : '#475569', color: '#fff', border: 'none',
                borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: p2Joined ? 'pointer' : 'default',
              }}>▶ Start match</button>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <button onClick={onExit} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>← Back to games</button>
          </div>

          {qrOpen && (
            <div onClick={() => setQrOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(8,15,30,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 24, padding: 20 }}>
                <QRCodeSVG value={shareLink} size={Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 90, 380)} level="M" />
              </div>
              <button onClick={() => setQrOpen(false)} style={{ marginTop: 18, padding: '10px 26px', borderRadius: 999, background: '#fff', color: '#0f172a', fontWeight: 900, border: 'none', cursor: 'pointer' }}>Close ✕</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════ PLAY (shared shell) ═══════════════
  const snap = snapRef.current;
  const wins = isP2 ? (snap?.wins ?? [0, 0]) : g.current.wins;
  const names = isP2 ? (snap?.names ?? ['Player 1', 'Player 2']) : [p1Name.trim() || 'Player 1', guestNameRef.current];
  const roundLabel = isP2 ? (snap?.round ?? 1) : (online ? g.current.round : roundNum);
  const roundWinner = isP2 ? (snap?.roundWinner ?? -1) : g.current.roundWinner;
  const countdown = isP2 ? (snap?.cn ?? '') : g.current.cn;
  const matchWinner = isP2 ? (snap?.matchWinner ?? -1) : g.current.matchWinner;
  const meIdx = isP2 ? 1 : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'linear-gradient(#ccfbf1,#f0fdfa)', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 8px 24px' }}>
      {/* HUD */}
      <div style={{ width: '100%', maxWidth: 660, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <button onClick={onExit} style={{ background: '#0f172acc', color: '#fff', border: 'none', borderRadius: 12, padding: '7px 12px', fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>← Exit</button>
        <div style={{ fontWeight: 900, color: '#0f766e', fontSize: 15 }}>Round {roundLabel}/{ROUNDS}</div>
        {online ? (
          <div style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 900 }}>
            <span style={{ padding: '3px 9px', borderRadius: 10, background: '#0ea5e9', color: '#fff' }}>{names[0]} {wins[0]}</span>
            <span style={{ padding: '3px 9px', borderRadius: 10, background: '#f59e0b', color: '#fff' }}>{names[1]} {wins[1]}</span>
          </div>
        ) : (
          <div style={{ fontWeight: 900, color: '#0f766e', fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>⏱ {fmtTime(elapsed)}</div>
        )}
      </div>

      {/* prompt */}
      {viewGrid && phase !== 'done' && (
        <div style={{ ...HAFS, fontSize: 'clamp(14px,2.4vw,20px)', color: '#0f766e', fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
          Find the <span dir="rtl" style={{ fontSize: '1.5em', color: '#dc2626' }}>{viewGrid.imposter}</span> among the <span dir="rtl" style={{ fontSize: '1.5em' }}>{viewGrid.base}</span>
        </div>
      )}

      {/* grid */}
      {phase === 'playing' && viewGrid && renderGrid(viewGrid)}

      {/* countdown */}
      {phase === 'countdown' && (
        <div style={{ marginTop: '20vh', fontSize: 'clamp(72px,16vw,150px)', fontWeight: 900, color: '#0f766e' }}>{countdown}</div>
      )}

      {/* round over (online) */}
      {phase === 'roundOver' && viewGrid && (
        <>
          <div style={{ fontSize: 26, fontWeight: 900, color: roundWinner === meIdx ? '#16a34a' : '#dc2626', margin: '8px 0' }}>
            {roundWinner === meIdx ? '✅ You won this round!' : `${names[roundWinner] ?? '—'} won this round`}
          </div>
          {renderGrid(viewGrid, { revealIdx: viewGrid.impIndex })}
        </>
      )}

      {locked && phase === 'playing' && (
        <div style={{ marginTop: 12, color: '#dc2626', fontWeight: 800 }}>❌ Wrong — wait a moment…</div>
      )}

      {/* ═══ DONE ═══ */}
      {phase === 'done' && (
        <div style={{ marginTop: 24, background: '#fff', borderRadius: 22, padding: '24px 28px', boxShadow: '0 12px 40px rgba(2,6,23,0.2)', textAlign: 'center', maxWidth: 460, width: '100%' }}>
          {online ? (
            <>
              <div style={{ fontSize: 44 }}>{matchWinner === meIdx ? '🏆' : matchWinner === -1 ? '🤝' : '😅'}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginBottom: 6 }}>
                {matchWinner === -1 ? "It's a tie!" : matchWinner === meIdx ? 'You win the match!' : `${names[matchWinner]} wins the match`}
              </div>
              <div style={{ fontSize: 15, color: '#64748b', fontWeight: 700 }}>{names[0]} {wins[0]} — {wins[1]} {names[1]}</div>
              {!isP2 && <button onClick={hostStartMatch} style={{ marginTop: 16, background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 24px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>🔄 Play again</button>}
              {isP2 && <div style={{ marginTop: 12, color: '#94a3b8', fontWeight: 700, fontSize: 13 }}>Waiting for the host…</div>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 44 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Done in {fmtTime(finalMsRef.current)}!</div>
              {lbLoading ? <div style={{ marginTop: 10, color: '#64748b' }}>Loading leaderboard…</div> : (
                <>
                  {result && <div style={{ marginTop: 6, fontSize: 15, fontWeight: 800, color: '#0f766e' }}>You ranked #{result.rank} of {result.total} 🏅</div>}
                  {leaderboard.length > 0 ? (
                    <div style={{ marginTop: 14, textAlign: 'left' }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Leaderboard</div>
                      {leaderboard.map((e, i) => (
                        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', borderRadius: 8, background: i % 2 ? '#f8fafc' : '#fff', fontWeight: 700, fontSize: 14 }}>
                          <span style={{ color: '#0f172a' }}>{i + 1}. {e.playerName}</span>
                          <span style={{ color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(e.totalMs)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>Leaderboard unavailable — your time is saved locally this session.</div>
                  )}
                </>
              )}
              <button onClick={start1P} style={{ marginTop: 16, background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 24px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>🔄 Play again</button>
            </>
          )}
        </div>
      )}

      {/* connection badge (online) */}
      {online && (
        <div title={directPath ? 'Direct player-to-player connection' : 'Relayed via server'} style={{ position: 'fixed', bottom: 6, left: 6, background: directPath ? '#16a34ac9' : '#475569c9', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 800, pointerEvents: 'none' }}>
          {directPath ? '⚡ Direct' : '☁️ Relay'}
        </div>
      )}
    </div>
  );
};

export default OddLetterGame;
