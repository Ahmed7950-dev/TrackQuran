// components/LetterHuntGame.tsx
// -----------------------------------------------------------------------------
// Letter Hunt — a 10×10 grid of 100 letters drawn in every position (isolated,
// beginning, middle, end). Each round plays the audio of ONE of the chosen
// letters; tutor and student race to tap it in the grid, and the first correct
// tap takes the point. 15 rounds, then the winner.
//
// Networking mirrors Find-the-Odd-Letter exactly: host-authoritative over
// `createGameChannel`, the guest joins from a link/QR (route /letter-hunt/<id>)
// and only ever SENDS taps — the host resolves them and broadcasts snapshots,
// with a heartbeat so a dropped packet on the fallback path self-heals.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';
import { letterAudioUrl, listLettersWithAudio, speakLetter } from '../services/letterAudioService';

const ONLINE_SITE_URL = 'https://www.lisanquran.com';
export const HUNT_ROUNDS = 15;
const GRID = 100;                    // 10 × 10
const WRONG_LOCKOUT_MS = 1200;       // a wrong tap costs you a moment
const ROUND_GAP_MS = 1400;           // reveal pause between rounds

const ALL_LETTERS = ['ا','ب','ت','ث','ج','ح','خ','د','ذ','ر','ز','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ك','ل','م','ن','ه','و','ي'];
type Form = 'isolated' | 'initial' | 'medial' | 'final';
const FORMS: Form[] = ['isolated', 'initial', 'medial', 'final'];
const NON_CONNECTORS = new Set(['ا', 'و', 'ر', 'ز', 'د', 'ذ']);

/** Same ZWJ/ZWNJ trick the alphabet trainer uses to force a positional glyph. */
export const letterInForm = (letter: string, form: Form): string => {
  switch (form) {
    case 'initial': return `${letter}‍`;
    case 'medial':  return `‍${letter}‍`;
    case 'final':   return `‍${letter}`;
    default:        return `‌${letter}‌`;
  }
};

export interface Cell { l: string; f: Form }

/** A round: 100 cells, 1–3 of them the target letter (in any form). */
export function buildRound(letters: string[]): { cells: Cell[]; target: string; hits: number[] } {
  const pool = letters.length ? letters : ALL_LETTERS;
  const target = pool[Math.floor(Math.random() * pool.length)];
  const others = ALL_LETTERS.filter(l => l !== target);
  const randForm = (l: string): Form => {
    const f = FORMS[Math.floor(Math.random() * FORMS.length)];
    // Non-connectors have only two real shapes — keep the glyph honest.
    if (NON_CONNECTORS.has(l) && (f === 'initial' || f === 'medial')) {
      return f === 'initial' ? 'isolated' : 'final';
    }
    return f;
  };
  const cells: Cell[] = Array.from({ length: GRID }, () => {
    const l = others[Math.floor(Math.random() * others.length)];
    return { l, f: randForm(l) };
  });
  const hitCount = 1 + Math.floor(Math.random() * 3);         // 1–3 targets
  const hits: number[] = [];
  while (hits.length < hitCount) {
    const i = Math.floor(Math.random() * GRID);
    if (hits.includes(i)) continue;
    hits.push(i);
    cells[i] = { l: target, f: randForm(target) };
  }
  return { cells, target, hits };
}

type Phase = 'menu' | 'lobby' | 'playing' | 'reveal' | 'over';

/** What the host broadcasts; the guest renders purely from this. */
interface Snap {
  ph: Phase;
  round: number;
  cells: Cell[];
  target: string;
  scores: [number, number];
  roundWinner: number;      // -1 none yet
  names: [string, string];
  revealed: number[];       // target cells, shown during 'reveal'
}

const LetterHuntGame: React.FC<{
  letters: string[];
  onExit: () => void;
  /** Set when this instance was opened from a join link. */
  roomId?: string;
  playerRole?: '1' | '2';
  /** Reports the finished match so the host can log it. */
  onFinish?: (hostScore: number, guestScore: number, rounds: number) => void;
}> = ({ letters, onExit, roomId: propRoomId, playerRole, onFinish }) => {
  const isGuest = playerRole === '2';

  const [phase, setPhase] = useState<Phase>('menu');
  const phaseRef = useRef<Phase>('menu');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [, setTick] = useState(0);

  const [roomIdState, setRoomIdState] = useState<string | null>(null);
  const [guestReady, setGuestReady] = useState(false);          // host: P2 arrived
  const [joined, setJoined] = useState(false);                  // guest: pressed join
  const [guestName, setGuestName] = useState('');
  const [gotSnap, setGotSnap] = useState(false);
  const [locked, setLocked] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [audioLetters, setAudioLetters] = useState<Set<string>>(new Set());

  const chanRef = useRef<P2PGameChannel | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const timers = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  // Host-authoritative match state.
  const g = useRef({
    round: 1, cells: [] as Cell[], target: '', hits: [] as number[],
    scores: [0, 0] as [number, number], roundWinner: -1,
    lockout: [0, 0] as [number, number],
  });

  useEffect(() => { listLettersWithAudio().then(setAudioLetters).catch(() => {}); }, []);

  /** Play the round's letter: the tutor's recording when one exists, else TTS. */
  const playTarget = useCallback((letter: string) => {
    if (!letter) return;
    if (audioLetters.has(letter)) {
      try {
        const a = new Audio(letterAudioUrl(letter));
        a.play().catch(() => speakLetter(letter));
        return;
      } catch { /* fall through */ }
    }
    speakLetter(letter);
  }, [audioLetters]);

  const pushSnap = useCallback(() => {
    const s = g.current;
    const snap: Snap = {
      ph: phaseRef.current, round: s.round, cells: s.cells, target: s.target,
      scores: s.scores, roundWinner: s.roundWinner,
      names: ['Tutor', guestName || 'Student'],
      revealed: phaseRef.current === 'reveal' ? s.hits : [],
    };
    chanRef.current?.send({ type: 'broadcast', event: 'sync', payload: snap });
  }, [guestName]);

  const hostStartRound = useCallback(() => {
    const r = buildRound(letters);
    g.current.cells = r.cells; g.current.target = r.target; g.current.hits = r.hits;
    g.current.roundWinner = -1;
    setPhase('playing'); phaseRef.current = 'playing';
    pushSnap();
    playTarget(r.target);
    setTick(t => t + 1);
  }, [letters, pushSnap, playTarget]);

  /** The only place a point is awarded — both players' taps land here. */
  const hostResolveTap = useCallback((player: 0 | 1, index: number) => {
    const s = g.current;
    if (phaseRef.current !== 'playing' || s.roundWinner !== -1) return;
    if (Date.now() < s.lockout[player]) return;
    if (!s.hits.includes(index)) {
      s.lockout[player] = Date.now() + WRONG_LOCKOUT_MS;
      if (player === 0) { setLocked(true); after(WRONG_LOCKOUT_MS, () => setLocked(false)); }
      else chanRef.current?.send({ type: 'broadcast', event: 'wrong', payload: {} });
      return;
    }
    s.roundWinner = player;
    s.scores[player] += 1;
    setPhase('reveal'); phaseRef.current = 'reveal';
    pushSnap();
    setTick(t => t + 1);
    after(ROUND_GAP_MS, () => {
      if (s.round >= HUNT_ROUNDS) {
        setPhase('over'); phaseRef.current = 'over';
        pushSnap();
        onFinish?.(s.scores[0], s.scores[1], HUNT_ROUNDS);
        setTick(t => t + 1);
        return;
      }
      s.round += 1;
      hostStartRound();
    });
  }, [after, pushSnap, hostStartRound, onFinish]);

  // ── Host channel ──
  useEffect(() => {
    if (isGuest || phase === 'menu') return;
    const id = roomIdState ?? crypto.randomUUID();
    if (!roomIdState) { setRoomIdState(id); return; }
    const ch = createGameChannel(`letter-hunt:${id}`, 'host');
    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { name: string } }) => {
      setGuestName(payload?.name || 'Student');
      setGuestReady(true);
      pushSnap();
    });
    ch.on('broadcast', { event: 'tap' }, ({ payload }: { payload: { index: number } }) => {
      hostResolveTap(1, payload.index);
    });
    ch.subscribe();
    chanRef.current = ch;
    return () => { ch.unsubscribe(); chanRef.current = null; };
  }, [isGuest, phase, roomIdState, pushSnap, hostResolveTap]);

  // Host heartbeat — the same self-healing resend the other games use.
  useEffect(() => {
    if (isGuest || phase === 'menu' || !chanRef.current) return;
    const iv = window.setInterval(pushSnap, 700);
    return () => window.clearInterval(iv);
  }, [isGuest, phase, pushSnap]);

  // ── Guest channel ──
  useEffect(() => {
    if (!isGuest || !propRoomId || !joined) return;
    const ch = createGameChannel(`letter-hunt:${propRoomId}`, 'guest');
    let lastTarget = '';
    ch.on('broadcast', { event: 'sync' }, ({ payload }: { payload: Snap }) => {
      snapRef.current = payload;
      setGotSnap(true);
      if (payload.ph !== phaseRef.current) { setPhase(payload.ph); phaseRef.current = payload.ph; }
      // Play the letter once per round on the guest's device too.
      if (payload.ph === 'playing' && payload.target && payload.target !== lastTarget) {
        lastTarget = payload.target;
        playTarget(payload.target);
      }
      setTick(t => t + 1);
    });
    ch.on('broadcast', { event: 'wrong' }, () => {
      setLocked(true); window.setTimeout(() => setLocked(false), WRONG_LOCKOUT_MS);
    });
    ch.subscribe((status: string) => {
      if (status !== 'SUBSCRIBED') return;
      const send = () => ch.send({ type: 'broadcast', event: 'ready', payload: { name: guestName.trim() || 'Student' } });
      send();
      const iv = window.setInterval(() => { if (snapRef.current) window.clearInterval(iv); else send(); }, 2000);
      timers.current.push(iv);
    });
    chanRef.current = ch;
    return () => { ch.unsubscribe(); chanRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, propRoomId, joined]);

  const tap = (index: number) => {
    if (locked) return;
    if (isGuest) chanRef.current?.send({ type: 'broadcast', event: 'tap', payload: { index } });
    else hostResolveTap(0, index);
  };

  const shareLink = roomIdState ? `${ONLINE_SITE_URL}/letter-hunt/${roomIdState}` : '';
  const copy = () => {
    navigator.clipboard?.writeText(shareLink)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };

  // What this device renders from: its own state (host) or the snapshot (guest).
  const view = isGuest
    ? snapRef.current
    : { ph: phase, round: g.current.round, cells: g.current.cells, target: g.current.target,
        scores: g.current.scores, roundWinner: g.current.roundWinner,
        names: ['Tutor', guestName || 'Student'] as [string, string],
        revealed: phase === 'reveal' ? g.current.hits : [] };

  // ── Guest: name + join ──
  if (isGuest && !joined) {
    return (
      <div className="max-w-md mx-auto px-4 py-14 text-center">
        <p className="text-5xl mb-3">🔍</p>
        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-2">Letter Hunt</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Listen to the letter, then find it in the grid before your teacher does.</p>
        <input
          value={guestName} onChange={e => setGuestName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-center font-bold mb-3"
        />
        <button onClick={() => setJoined(true)}
          className="w-full py-3 rounded-xl bg-teal-600 text-white font-black hover:bg-teal-700 transition-colors">
          Join the game
        </button>
      </div>
    );
  }

  if (isGuest && !gotSnap) {
    return <div className="max-w-md mx-auto px-4 py-16 text-center text-sm text-slate-400">Connecting to your teacher…</div>;
  }

  // ── Host: lobby with link + QR ──
  if (!isGuest && (phase === 'menu' || phase === 'lobby')) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <p className="text-5xl mb-2">🔍</p>
        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">Letter Hunt</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          {HUNT_ROUNDS} rounds · a letter is played, first to find it in the 10×10 grid scores.
        </p>

        {phase === 'menu' ? (
          <button onClick={() => { setPhase('lobby'); phaseRef.current = 'lobby'; }}
            disabled={letters.length === 0}
            className="w-full py-3 rounded-xl bg-teal-600 text-white font-black disabled:opacity-40 hover:bg-teal-700 transition-colors">
            {letters.length === 0 ? 'Pick some letters first' : 'Create a game'}
          </button>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-gray-700 p-4 mb-4">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Share this link with your student</p>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-[11px] font-mono truncate">{shareLink}</div>
                <button onClick={copy} className={`px-3 py-2 rounded-lg text-xs font-black text-white ${copied ? 'bg-emerald-500' : 'bg-teal-600'}`}>
                  {copied ? '✓' : 'Copy'}
                </button>
              </div>
              <button onClick={() => setQrOpen(true)} className="mx-auto block bg-white p-2 rounded-xl">
                <QRCodeSVG value={shareLink} size={120} level="M" />
              </button>
              <p className="text-[10px] text-slate-400 mt-2">Tap the QR to enlarge · scan to join 📱</p>
            </div>
            <p className={`text-sm font-bold mb-3 ${guestReady ? 'text-emerald-600' : 'text-slate-400'}`}>
              {guestReady ? `✓ ${guestName || 'Student'} joined` : 'Waiting for your student…'}
            </p>
            <button onClick={hostStartRound} disabled={!guestReady}
              className="w-full py-3 rounded-xl bg-teal-600 text-white font-black disabled:opacity-40 hover:bg-teal-700 transition-colors">
              Start the hunt
            </button>
          </>
        )}
        <button onClick={onExit} className="mt-3 w-full py-2 text-sm font-semibold text-slate-400 hover:text-slate-600">Back</button>

        {qrOpen && (
          <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-6" onClick={() => setQrOpen(false)}>
            <div className="bg-white p-4 rounded-2xl" onClick={e => e.stopPropagation()}>
              <QRCodeSVG value={shareLink} size={Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 90, 380)} level="M" />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!view) return null;

  // The guest has a snapshot but the host has not started a round yet.
  if (isGuest && (view.ph === 'menu' || view.ph === 'lobby')) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-5xl mb-3 animate-pulse">⏳</p>
        <p className="font-black text-slate-700 dark:text-slate-200">You're in!</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Waiting for your teacher to start the hunt…</p>
      </div>
    );
  }

  // ── Final score ──
  if (view.ph === 'over') {
    const [a, b] = view.scores;
    const winner = a === b ? null : a > b ? view.names[0] : view.names[1];
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-5xl mb-2">{winner ? '🏆' : '🤝'}</p>
        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-3">
          {winner ? `${winner} wins!` : "It's a draw!"}
        </h3>
        <div className="flex items-center justify-center gap-6 my-5">
          <div><p className="text-xs font-bold text-slate-400">{view.names[0]}</p><p className="text-4xl font-black text-teal-600">{a}</p></div>
          <span className="text-2xl text-slate-300">—</span>
          <div><p className="text-xs font-bold text-slate-400">{view.names[1]}</p><p className="text-4xl font-black text-amber-500">{b}</p></div>
        </div>
        <button onClick={onExit} className="px-6 py-2.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-700">Done</button>
      </div>
    );
  }

  // ── The hunt ──
  const me = isGuest ? 1 : 0;
  return (
    <div className="max-w-3xl mx-auto px-3 pb-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <button onClick={onExit} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500">Exit</button>
        <div className="flex items-center gap-3 text-sm font-black">
          <span className={me === 0 ? 'text-teal-600' : 'text-slate-500'}>{view.names[0]} {view.scores[0]}</span>
          <span className="text-slate-300">·</span>
          <span className={me === 1 ? 'text-amber-500' : 'text-slate-500'}>{view.names[1]} {view.scores[1]}</span>
        </div>
        <span className="text-xs font-bold text-slate-400 tabular-nums">{view.round} / {HUNT_ROUNDS}</span>
      </div>

      <div className="flex items-center justify-center gap-2 mb-3">
        <button onClick={() => playTarget(view.target)}
          className="px-4 py-2 rounded-full bg-teal-600 text-white text-sm font-black hover:bg-teal-700 active:scale-95 transition-all">
          🔊 Play again
        </button>
        {view.ph === 'reveal' && (
          <span className={`text-sm font-black ${view.roundWinner === me ? 'text-emerald-600' : 'text-red-500'}`}>
            {view.roundWinner === me ? '✓ Your point!' : `${view.names[view.roundWinner]} got it`}
          </span>
        )}
        {locked && <span className="text-sm font-bold text-red-500">✗ wait…</span>}
      </div>

      <div dir="rtl" className="grid grid-cols-10 gap-1 select-none">
        {view.cells.map((c, i) => {
          const isHit = view.revealed.includes(i);
          return (
            <button
              key={i}
              onClick={() => tap(i)}
              disabled={view.ph !== 'playing' || locked}
              className={`aspect-square rounded-md flex items-center justify-center transition-colors ${
                isHit ? 'bg-emerald-400 text-white'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 hover:bg-teal-100 dark:hover:bg-gray-600'
              } ${locked ? 'opacity-60' : ''}`}
              style={{ fontFamily: "'Hafs','Amiri Quran',serif", fontSize: 'clamp(0.9rem, 3.2vw, 1.5rem)', lineHeight: 1 }}
            >
              {letterInForm(c.l, c.f)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default LetterHuntGame;
