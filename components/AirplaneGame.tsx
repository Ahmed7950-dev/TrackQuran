import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Airplane letter game — 1-player, 2-player local, or 2-player online.
// P1 controls: Arrow keys  |  P2 local: W A S D  |  P2 online: Arrow/WASD
// Online: P1 hosts simulation & broadcasts state via Supabase Realtime.
//         P2 joins via shared /letter-flight/<roomId> link.
// ─────────────────────────────────────────────────────────────────────────────

type GameMode   = '1p' | '2p' | '2p-online';
type GameStatus = 'start' | 'select_p2' | 'playing' | 'won' | 'lost';

type Bubble = {
  id: string;
  letter: string;
  x: number;
  y: number;
  vx: number;
  isCorrect: boolean;
  popped: boolean;
  driftDelay: number;
};

interface P2Snapshot {
  p1: { x: number; y: number; tilt: number; crashed: boolean };
  p2: { x: number; y: number; tilt: number; crashed: boolean };
  fuels: [number, number];
  scores: [number, number];
  bubbles: Bubble[];
  status: GameStatus;
  queueLen: number;
  queuePos: number;
  letterForm: string;
  targetLetter: string;
  p1Plane: number;
  p2Plane: number;
}

const START_FUEL           = 100;
const FUEL_GAIN            = 10;
const FUEL_LOSS            = 20;
const BUBBLE_RADIUS        = 7.5;
const BUBBLE_SPEED         = 0.14;
const BUBBLE_SPEED_MAX_MULT = 2.4; // bubbles reach 2.4× speed by the final letter
const PLANE_ACCEL          = 0.09;
const PLANE_MAX_VEL        = 1.25;
const PLANE_DRAG           = 0.87;
const BG_SCROLL_SPEED = 120;
const ONLINE_SITE_URL = 'https://www.lisanquran.com';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ALL_Y_SLOTS = [14, 27, 40, 53, 66, 79];
const MIN_Y_GAP   = 16;

function makeBubbles(correctLetter: string, count = 3, avoidY: number[] = [], speedMult = 1): Bubble[] {
  const wrong = shuffle(ARABIC_LETTERS.filter(l => l !== correctLetter)).slice(0, count - 1);
  const letters = shuffle([correctLetter, ...wrong]);
  const free = ALL_Y_SLOTS.filter(y => avoidY.every(ay => Math.abs(ay - y) >= MIN_Y_GAP));
  const pool = free.length >= count ? free : ALL_Y_SLOTS;
  const ySlots = shuffle(pool).slice(0, count);
  return letters.map((letter, i) => ({
    id: `${Date.now()}-${i}`,
    letter,
    x: 112 + i * 28,
    y: ySlots[i],
    vx: -((BUBBLE_SPEED + Math.random() * 0.05) * speedMult),
    isCorrect: letter === correctLetter,
    popped: false,
    driftDelay: Math.random() * 2.5,
  }));
}

function playTone(freqs: number[], duration = 0.15, type: OscillatorType = 'sine') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type = type; osc.frequency.value = f;
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * duration);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (i + 1) * duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * duration);
      osc.stop(ctx.currentTime + (i + 1) * duration);
    });
    setTimeout(() => ctx.close(), (freqs.length + 1) * duration * 1000);
  } catch { /* audio unavailable */ }
}
const playSuccess = () => playTone([523, 659, 784], 0.12);
const playWrong   = () => playTone([220, 165], 0.18, 'square');

// ── Vehicle options ────────────────────────────────────────────────────────────
const PLANES = [
  { label: 'Private Plane',  url: 'https://img.icons8.com/external-soft-fill-juicy-fish/60/external-private-vehicles-soft-fill-soft-fill-juicy-fish.png' },
  { label: 'Single Engine',  url: 'https://img.icons8.com/external-soft-fill-juicy-fish/60/external-single-vehicles-soft-fill-soft-fill-juicy-fish.png' },
  { label: 'Helicopter',     url: 'https://img.icons8.com/external-those-icons-lineal-color-those-icons/24/external-Helicopter-transportation-and-vehicles-those-icons-lineal-color-those-icons.png' },
  { label: 'Med Helicopter', url: 'https://img.icons8.com/external-photo3ideastudio-lineal-color-photo3ideastudio/64/external-helicopter-emergency-photo3ideastudio-lineal-color-photo3ideastudio.png' },
  { label: 'Jet Bomber',     url: 'https://img.icons8.com/external-smashingstocks-flat-smashing-stocks/66/external-Jet-Plane-war-and-army-smashingstocks-flat-smashing-stocks-4.png' },
  { label: 'Space Shuttle',  url: 'https://img.icons8.com/color/64/space-shuttle.png' },
];

function applyLetterForm(letter: string, form: string): string {
  switch (form) {
    case 'initial': return `${letter}‍`;
    case 'medial':  return `‍${letter}‍`;
    case 'final':   return `‍${letter}`;
    default:        return `‌${letter}‌`;
  }
}

const JetPlane: React.FC<{ src: string }> = ({ src }) => (
  <img src={src} alt="vehicle" width={90} height={90}
    style={{ display: 'block', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))' }} />
);

const VehiclePicker: React.FC<{
  selected: number;
  onSelect: (i: number) => void;
  accentColor: string;
}> = ({ selected, onSelect, accentColor }) => (
  <div className="grid grid-cols-3 gap-2">
    {PLANES.map((p, i) => (
      <button
        key={i}
        onClick={() => onSelect(i)}
        className="relative flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all select-none bg-white"
        style={{
          borderColor: selected === i ? accentColor : '#e2e8f0',
          background: selected === i ? `${accentColor}18` : 'white',
          transform: selected === i ? 'scale(1.06)' : 'scale(1)',
          boxShadow: selected === i ? `0 4px 12px ${accentColor}44` : undefined,
        }}
      >
        <span className="absolute top-1 left-1.5 text-[10px] font-extrabold text-slate-400">{i + 1}</span>
        <img src={p.url} alt={p.label} width={52} height={52} style={{ display: 'block' }} />
      </button>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

interface AirplaneGameProps {
  letters: string[];
  letterForm?: string;
  onExit: () => void;
  roomId?: string;      // if set + playerRole='2', join this room as P2
  playerRole?: '1' | '2';
}

const AirplaneGame: React.FC<AirplaneGameProps> = ({
  letters,
  letterForm = 'isolated',
  onExit,
  roomId: propRoomId,
  playerRole,
}) => {
  const isP2 = playerRole === '2';

  // ── Game state ─────────────────────────────────────────────────────────────
  const [status, setStatus]         = useState<GameStatus>('start');
  const [gameMode, setGameMode]     = useState<GameMode>('1p');
  const [p1Plane, setP1Plane]       = useState(0);
  const [p2Plane, setP2Plane]       = useState(1);
  const [fuel, setFuel]             = useState(START_FUEL);
  const [p2Fuel, setP2Fuel]         = useState(START_FUEL);
  const [score, setScore]           = useState(0);
  const [p2Score, setP2Score]       = useState(0);
  const [queue, setQueue]           = useState<string[]>([]);
  const [queuePos, setQueuePos]     = useState(0);
  const [bubbles, setBubbles]       = useState<Bubble[]>([]);
  const [flash, setFlash]           = useState<'good' | 'bad' | null>(null);

  // ── Online multiplayer state (P1 side) ─────────────────────────────────────
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(null);
  const [p2Joined, setP2Joined]         = useState(false);
  const [p2RemotePlane, setP2RemotePlane] = useState(1);
  const [linkCopied, setLinkCopied]     = useState(false);

  // ── P2 client state ────────────────────────────────────────────────────────
  const [p2Snapshot, setP2Snapshot] = useState<P2Snapshot | null>(null);
  const [p2Waiting, setP2Waiting]   = useState(false); // sent ready, waiting for P1 to start

  // ── P1 refs ────────────────────────────────────────────────────────────────
  const planeRef      = useRef<HTMLDivElement>(null);
  const planePos      = useRef({ x: 14, y: 32 });
  const velRef        = useRef({ x: 0, y: 0 });
  const tiltRef       = useRef(0);
  // ── P2 refs ────────────────────────────────────────────────────────────────
  const p2PlaneRef    = useRef<HTMLDivElement>(null);
  const p2Pos         = useRef({ x: 14, y: 68 });
  const p2Vel         = useRef({ x: 0, y: 0 });
  const p2Tilt        = useRef(0);
  // ── Shared ─────────────────────────────────────────────────────────────────
  const keysDown      = useRef<Record<string, boolean>>({});
  const rafRef        = useRef<number>(0);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const bubblesRef    = useRef<Bubble[]>([]);
  const bubbleDomRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const collidingRef  = useRef(false);
  const p2ColRef      = useRef(false);
  const queuePosRef   = useRef(0);
  const gameModeRef   = useRef<GameMode>('1p');
  const p1CrashedRef  = useRef(false);
  const p2CrashedRef  = useRef(false);
  const targetLetterRef = useRef('');
  const speedMultRef    = useRef(1);
  const [speedMult, setSpeedMult] = useState(1);
  // ── Background ─────────────────────────────────────────────────────────────
  const bgStripRef    = useRef<HTMLDivElement>(null);
  const bgOffsetRef   = useRef(0);
  const bgImgWidthRef = useRef(0);
  // ── Online refs ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef       = useRef<any>(null);
  const p2RemoteKeysRef  = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({ up: false, down: false, left: false, right: false });
  const fuelRef          = useRef(START_FUEL);
  const p2FuelRef        = useRef(START_FUEL);
  const scoreRef         = useRef(0);
  const p2ScoreRef       = useRef(0);
  const p2SnapshotLetterRef = useRef(''); // P2: last heard target letter

  bubblesRef.current = bubbles;
  const currentLetter = queue[queuePos] ?? '';
  const is2p  = gameMode === '2p' || gameMode === '2p-online';
  const isOnline = gameMode === '2p-online';

  // ── Keep fuel/score refs in sync (needed for P1 broadcast interval) ─────────
  useEffect(() => { fuelRef.current = fuel; }, [fuel]);
  useEffect(() => { p2FuelRef.current = p2Fuel; }, [p2Fuel]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { p2ScoreRef.current = p2Score; }, [p2Score]);

  // ── Lock body scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Background infinite scroll ──────────────────────────────────────────────
  useEffect(() => {
    let lastTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const w = bgImgWidthRef.current;
      if (w > 0) {
        bgOffsetRef.current -= BG_SCROLL_SPEED * dt;
        if (bgOffsetRef.current <= -w) bgOffsetRef.current += w;
        if (bgStripRef.current) bgStripRef.current.style.transform = `translateX(${bgOffsetRef.current}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── CSS animations ──────────────────────────────────────────────────────────
  useEffect(() => {
    const id = 'ag-styles-v2';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes ag-float {
        0%,100% { transform: translate(-50%,-50%) translateY(-6px); }
        50%      { transform: translate(-50%,-50%) translateY(6px); }
      }
      @keyframes ag-pop {
        0%   { transform: translate(-50%,-50%) scale(1);   opacity:1; }
        100% { transform: translate(-50%,-50%) scale(1.8); opacity:0; }
      }
      .ag-bubble { animation: ag-float 3.2s ease-in-out infinite; }
      .ag-popped { animation: ag-pop .45s ease-out forwards; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // ── Audio ────────────────────────────────────────────────────────────────────
  const playLetterAudio = useCallback((letter: string) => {
    if (!letter) return;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    const audio = new Audio(`${letterAudioUrl(letter)}?t=${Date.now() % 1e7}`);
    audioRef.current = audio;
    audio.onerror = () => speakLetter(letter);
    audio.play().catch(() => speakLetter(letter));
  }, []);

  // ── Round setup ──────────────────────────────────────────────────────────────
  const startRound = useCallback((letter: string) => {
    targetLetterRef.current = letter;
    setBubbles(makeBubbles(letter, 3, [], speedMultRef.current));
    collidingRef.current = false;
    p2ColRef.current = false;
    setTimeout(() => playLetterAudio(letter), 350);
  }, [playLetterAudio]);

  const startGame = useCallback(() => {
    const q = shuffle(letters);
    setQueue(q);
    setQueuePos(0);
    queuePosRef.current = 0;
    setFuel(START_FUEL);
    setScore(0);
    setP2Fuel(START_FUEL);
    setP2Score(0);
    fuelRef.current    = START_FUEL;
    p2FuelRef.current  = START_FUEL;
    scoreRef.current   = 0;
    p2ScoreRef.current = 0;
    speedMultRef.current = 1;
    setSpeedMult(1);
    planePos.current    = { x: 14, y: 32 };
    velRef.current      = { x: 0, y: 0 };
    tiltRef.current     = 0;
    p2Pos.current       = { x: 14, y: 68 };
    p2Vel.current       = { x: 0, y: 0 };
    p2Tilt.current      = 0;
    p1CrashedRef.current = false;
    p2CrashedRef.current = false;
    gameModeRef.current  = gameMode;
    setStatus('playing');
    startRound(q[0]);
  }, [letters, startRound, gameMode]);

  // ── Hit handling ─────────────────────────────────────────────────────────────
  const handleHit = useCallback((bubble: Bubble, player: 1 | 2) => {
    const is2pMode = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
    if (bubble.isCorrect) {
      playSuccess();
      setFlash('good');
      if (player === 1) { setFuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setScore(s => s + 1); }
      else              { setP2Fuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setP2Score(s => s + 1); }
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      const next = queuePosRef.current + 1;
      queuePosRef.current = next;
      setQueuePos(next);
      // Increase bubble speed as player progresses through the queue
      const newMult = 1 + (next / Math.max(queue.length, 1)) * (BUBBLE_SPEED_MAX_MULT - 1);
      speedMultRef.current = newMult;
      setSpeedMult(newMult);
      if (next >= queue.length) {
        setTimeout(() => setStatus('won'), 600);
      } else {
        const nextLetter = queue[next];
        setTimeout(() => {
          setBubbles(prev => {
            const survivors = prev.filter(b => !b.popped && b.letter !== nextLetter).slice(0, 2);
            const usedY = survivors.map(b => b.y);
            return [...survivors, ...makeBubbles(nextLetter, 3, usedY, speedMultRef.current)];
          });
          collidingRef.current = false;
          p2ColRef.current = false;
          targetLetterRef.current = nextLetter;
          setTimeout(() => playLetterAudio(nextLetter), 350);
        }, 500);
      }
    } else {
      playWrong();
      setFlash('bad');
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      if (player === 1) {
        setFuel(f => {
          const nf = Math.max(0, f - FUEL_LOSS);
          if (nf <= 0) {
            p1CrashedRef.current = true;
            if (!is2pMode || p2CrashedRef.current) setTimeout(() => setStatus('lost'), 500);
          }
          return nf;
        });
        setTimeout(() => { collidingRef.current = false; }, 500);
      } else {
        setP2Fuel(f => {
          const nf = Math.max(0, f - FUEL_LOSS);
          if (nf <= 0) {
            p2CrashedRef.current = true;
            if (p1CrashedRef.current) setTimeout(() => setStatus('lost'), 500);
          }
          return nf;
        });
        setTimeout(() => { p2ColRef.current = false; }, 500);
      }
    }
    setTimeout(() => setFlash(null), 400);
  }, [queue, playLetterAudio]);

  const handleHitRef = useRef(handleHit);
  useEffect(() => { handleHitRef.current = handleHit; }, [handleHit]);
  useEffect(() => { queuePosRef.current = queuePos; }, [queuePos]);

  // ── Game loop (P1 / local only) ──────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || isP2) return;

    const tick = () => {
      const k    = keysDown.current;
      const p    = planePos.current;
      const v    = velRef.current;
      const is2pNow = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
      const isOnlineNow = gameModeRef.current === '2p-online';

      // ── P1 physics (Arrow keys) ──────────────────────────────────────────────
      if (!p1CrashedRef.current) {
        if (k.ArrowUp)    v.y -= PLANE_ACCEL;
        if (k.ArrowDown)  v.y += PLANE_ACCEL;
        if (k.ArrowLeft)  v.x -= PLANE_ACCEL * 0.75;
        if (k.ArrowRight) v.x += PLANE_ACCEL * 0.75;
        v.x *= PLANE_DRAG; v.y *= PLANE_DRAG;
        v.x = Math.max(-PLANE_MAX_VEL, Math.min(PLANE_MAX_VEL, v.x));
        v.y = Math.max(-PLANE_MAX_VEL, Math.min(PLANE_MAX_VEL, v.y));
        p.x = Math.max(4, Math.min(96, p.x + v.x));
        p.y = Math.max(7, Math.min(88, p.y + v.y));
        const tilt = Math.max(-28, Math.min(28, v.y * 20));
        tiltRef.current += (tilt - tiltRef.current) * 0.13;
        if (planeRef.current) {
          planeRef.current.style.left      = `${p.x}%`;
          planeRef.current.style.top       = `${p.y}%`;
          planeRef.current.style.transform = `translate(-50%,-50%) rotate(${tiltRef.current}deg)`;
        }
      }

      // ── P2 physics (WASD local / remote keys online) ─────────────────────────
      if (is2pNow && !p2CrashedRef.current) {
        const p2 = p2Pos.current;
        const v2 = p2Vel.current;
        if (isOnlineNow) {
          const rk = p2RemoteKeysRef.current;
          if (rk.up)    v2.y -= PLANE_ACCEL;
          if (rk.down)  v2.y += PLANE_ACCEL;
          if (rk.left)  v2.x -= PLANE_ACCEL * 0.75;
          if (rk.right) v2.x += PLANE_ACCEL * 0.75;
        } else {
          if (k.KeyW) v2.y -= PLANE_ACCEL;
          if (k.KeyS) v2.y += PLANE_ACCEL;
          if (k.KeyA) v2.x -= PLANE_ACCEL * 0.75;
          if (k.KeyD) v2.x += PLANE_ACCEL * 0.75;
        }
        v2.x *= PLANE_DRAG; v2.y *= PLANE_DRAG;
        v2.x = Math.max(-PLANE_MAX_VEL, Math.min(PLANE_MAX_VEL, v2.x));
        v2.y = Math.max(-PLANE_MAX_VEL, Math.min(PLANE_MAX_VEL, v2.y));
        p2.x = Math.max(4, Math.min(96, p2.x + v2.x));
        p2.y = Math.max(7, Math.min(88, p2.y + v2.y));
        const tilt2 = Math.max(-28, Math.min(28, v2.y * 20));
        p2Tilt.current += (tilt2 - p2Tilt.current) * 0.13;
        if (p2PlaneRef.current) {
          p2PlaneRef.current.style.left      = `${p2.x}%`;
          p2PlaneRef.current.style.top       = `${p2.y}%`;
          p2PlaneRef.current.style.transform = `translate(-50%,-50%) rotate(${p2Tilt.current}deg)`;
        }
      }

      // ── Bubbles ──────────────────────────────────────────────────────────────
      for (const b of bubblesRef.current) {
        if (b.popped) continue;
        b.x += b.vx;
        if (b.x < -16) b.x = 108 + Math.random() * 25;
        const el = bubbleDomRefs.current.get(b.id);
        if (el) el.style.left = `${b.x}%`;
      }

      // ── P1 collision ─────────────────────────────────────────────────────────
      if (!collidingRef.current && !p1CrashedRef.current) {
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p.x, dy = (b.y - p.y) * 0.65;
          if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_RADIUS) {
            collidingRef.current = true;
            handleHitRef.current(b, 1);
            break;
          }
        }
      }

      // ── P2 collision ─────────────────────────────────────────────────────────
      if (is2pNow && !p2ColRef.current && !p2CrashedRef.current) {
        const p2c = p2Pos.current;
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p2c.x, dy = (b.y - p2c.y) * 0.65;
          if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_RADIUS) {
            p2ColRef.current = true;
            handleHitRef.current(b, 2);
            break;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, isP2]);

  // ── Keyboard — P1 Arrow keys, P2 local WASD ──────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || isP2) return;
    const down = (e: KeyboardEvent) => {
      const relevant = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'];
      if (relevant.includes(e.code)) { e.preventDefault(); keysDown.current[e.code] = true; }
    };
    const up = (e: KeyboardEvent) => { keysDown.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
      keysDown.current = {};
    };
  }, [status, isP2]);

  // ── Cleanup audio ─────────────────────────────────────────────────────────────
  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis?.cancel(); }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // ONLINE MULTIPLAYER — P1 side
  // ─────────────────────────────────────────────────────────────────────────────

  // Generate a new room when P1 selects "2P Online"
  useEffect(() => {
    if (gameMode !== '2p-online' || onlineRoomId) return;
    const id = crypto.randomUUID();
    setOnlineRoomId(id);
  }, [gameMode, onlineRoomId]);

  // Subscribe to channel once room is created (P1)
  useEffect(() => {
    if (gameMode !== '2p-online' || !onlineRoomId || isP2) return;

    const ch = supabase.channel(`letter-flight:${onlineRoomId}`, {
      config: { broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { p2Plane: number } }) => {
      setP2RemotePlane(payload.p2Plane);
      setP2Joined(true);
    });

    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: { up: boolean; down: boolean; left: boolean; right: boolean } }) => {
      p2RemoteKeysRef.current = payload;
    });

    ch.subscribe();
    channelRef.current = ch;

    return () => {
      ch.unsubscribe();
      channelRef.current = null;
    };
  }, [gameMode, onlineRoomId, isP2]);

  // Broadcast state at ~30fps while playing (P1 online)
  useEffect(() => {
    if (status !== 'playing' || gameMode !== '2p-online' || !channelRef.current || isP2) return;

    const id = setInterval(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'state',
        payload: {
          p1: { x: planePos.current.x, y: planePos.current.y, tilt: tiltRef.current, crashed: p1CrashedRef.current },
          p2: { x: p2Pos.current.x, y: p2Pos.current.y, tilt: p2Tilt.current, crashed: p2CrashedRef.current },
          fuels: [fuelRef.current, p2FuelRef.current] as [number, number],
          scores: [scoreRef.current, p2ScoreRef.current] as [number, number],
          bubbles: bubblesRef.current,
          status,
          queueLen: queue.length,
          queuePos: queuePosRef.current,
          letterForm,
          targetLetter: targetLetterRef.current,
          p1Plane,
          p2Plane: p2RemotePlane,
        } satisfies P2Snapshot,
      });
    }, 33);

    return () => clearInterval(id);
  }, [status, gameMode, isP2, letterForm, queue.length, p1Plane, p2RemotePlane]);

  // ─────────────────────────────────────────────────────────────────────────────
  // ONLINE MULTIPLAYER — P2 side
  // ─────────────────────────────────────────────────────────────────────────────

  // P2: Subscribe to channel on join, receive game state
  const joinOnlineGame = useCallback(() => {
    if (!propRoomId) return;

    const ch = supabase.channel(`letter-flight:${propRoomId}`, {
      config: { broadcast: { self: false } },
    });

    ch.on('broadcast', { event: 'state' }, ({ payload }: { payload: P2Snapshot }) => {
      setP2Snapshot(payload);
      setP2Waiting(false);
      setStatus(payload.status);
      setBubbles(payload.bubbles);
      setFuel(payload.fuels[0]);
      setP2Fuel(payload.fuels[1]);
      setScore(payload.scores[0]);
      setP2Score(payload.scores[1]);
      // Play audio when target letter changes
      if (payload.targetLetter && payload.targetLetter !== p2SnapshotLetterRef.current) {
        p2SnapshotLetterRef.current = payload.targetLetter;
        if (payload.status === 'playing') setTimeout(() => playLetterAudio(payload.targetLetter), 200);
      }
    });

    ch.subscribe(() => {
      // After subscribe, send ready signal with chosen vehicle
      ch.send({
        type: 'broadcast',
        event: 'ready',
        payload: { p2Plane: p2Plane },
      });
    });

    channelRef.current = ch;
    setP2Waiting(true);
  }, [propRoomId, p2Plane, playLetterAudio]);

  // P2 keyboard: send inputs to channel
  useEffect(() => {
    if (!isP2 || status !== 'playing') return;

    const sendInput = () => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'input',
        payload: p2RemoteKeysRef.current,
      });
    };

    const mapKey = (code: string): keyof typeof p2RemoteKeysRef.current | null => {
      if (code === 'ArrowUp'    || code === 'KeyW') return 'up';
      if (code === 'ArrowDown'  || code === 'KeyS') return 'down';
      if (code === 'ArrowLeft'  || code === 'KeyA') return 'left';
      if (code === 'ArrowRight' || code === 'KeyD') return 'right';
      return null;
    };

    const down = (e: KeyboardEvent) => {
      const dir = mapKey(e.code);
      if (dir) { e.preventDefault(); p2RemoteKeysRef.current[dir] = true; sendInput(); }
    };
    const up = (e: KeyboardEvent) => {
      const dir = mapKey(e.code);
      if (dir) { p2RemoteKeysRef.current[dir] = false; sendInput(); }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, [isP2, status]);

  // Cleanup channel on unmount
  useEffect(() => {
    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────

  // Touch hold buttons — P1 local
  const holdBtn = (code: string) => ({
    onPointerDown:  (e: React.PointerEvent) => { e.preventDefault(); keysDown.current[code] = true; },
    onPointerUp:    () => { keysDown.current[code] = false; },
    onPointerLeave: () => { keysDown.current[code] = false; },
    onContextMenu:  (e: React.MouseEvent) => e.preventDefault(),
  });

  // Touch hold buttons — P2 online (sends to channel)
  const holdBtnP2 = (dir: 'up' | 'down' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      p2RemoteKeysRef.current[dir] = true;
      channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } });
    },
    onPointerUp: () => {
      p2RemoteKeysRef.current[dir] = false;
      channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } });
    },
    onPointerLeave: () => {
      p2RemoteKeysRef.current[dir] = false;
      channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } });
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const fuelColor = (f: number) => f > 60 ? '#22c55e' : f > 30 ? '#f59e0b' : '#ef4444';

  const overlay = (children: React.ReactNode) => (
    <div className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(10,30,80,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-4 border-sky-200 px-6 py-6 text-center max-w-sm mx-4 w-full">
        {children}
      </div>
    </div>
  );

  const twoPlayerResult = (s1: number, s2: number) => {
    if (s1 > s2) return { emoji: '🏆', msg: 'Player 1 Wins!', color: '#3b82f6' };
    if (s2 > s1) return { emoji: '🏆', msg: 'Player 2 Wins!', color: '#f97316' };
    return { emoji: '🤝', msg: "It's a Draw!", color: '#8b5cf6' };
  };

  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/letter-flight/${onlineRoomId}` : '';
  const copyLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Rendering helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderBubbles = (bubbleSrc: Bubble[], lf: string) => bubbleSrc.map(b => (
    <div
      key={b.id}
      ref={isP2 ? undefined : el => { if (el) bubbleDomRefs.current.set(b.id, el); else bubbleDomRefs.current.delete(b.id); }}
      className={`absolute z-10 flex items-center justify-center rounded-full ${b.popped ? 'ag-popped' : 'ag-bubble'}`}
      style={{
        left: `${b.x}%`, top: `${b.y}%`,
        transform: 'translate(-50%,-50%)',
        width:  'clamp(68px,12vw,100px)',
        height: 'clamp(68px,12vw,100px)',
        background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.97), rgba(186,230,253,0.78) 55%, rgba(125,211,252,0.88))',
        border: '3px solid rgba(255,255,255,0.95)',
        boxShadow: '0 6px 18px rgba(14,116,144,0.3), inset 0 -5px 12px rgba(14,116,144,0.18)',
        animationDelay: `${b.driftDelay}s`,
      }}
    >
      <span style={{ fontFamily: "'Hafs','Amiri',serif", fontSize: 'clamp(2.2rem,5.5vw,3.2rem)', lineHeight: 1, color: '#0c4a6e' }}>
        {applyLetterForm(b.letter, lf)}
      </span>
    </div>
  ));

  // ─────────────────────────────────────────────────────────────────────────────
  // P2 CLIENT VIEW
  // ─────────────────────────────────────────────────────────────────────────────
  if (isP2) {
    const snap = p2Snapshot;
    const snapLetterForm = snap?.letterForm ?? 'isolated';
    const snapBubbles = bubbles; // kept in sync via setBubbles(payload.bubbles)
    const s1 = score;
    const s2 = p2Score;
    const f1 = fuel;
    const f2 = p2Fuel;
    const p1PlaneUrl = snap ? PLANES[snap.p1Plane]?.url ?? PLANES[0].url : PLANES[0].url;
    const p2PlaneUrl = snap ? PLANES[snap.p2Plane]?.url ?? PLANES[1].url : PLANES[p2Plane].url;

    return (
      <div className="select-none" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#1a6fc4', touchAction: 'none' }}>
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, overflow: 'hidden' }}>
          <div ref={bgStripRef} style={{ display: 'flex', height: '100%', willChange: 'transform' }}>
            {[0, 1, 2, 3].map(i => (
              <img key={i} src="/sprites/airplane-bg.png" alt=""
                style={{ height: '100%', width: 'auto', display: 'block', flexShrink: 0 }}
                onLoad={i === 0 ? (e) => { bgImgWidthRef.current = (e.target as HTMLImageElement).offsetWidth; } : undefined}
              />
            ))}
          </div>
        </div>

        {/* ── P2 join screen ── */}
        {!p2Waiting && status === 'start' && overlay(
          <>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-extrabold text-white mb-3"
              style={{ background: '#f97316' }}>Letter Flight — Player 2</div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Choose your vehicle</p>
            <VehiclePicker selected={p2Plane} onSelect={setP2Plane} accentColor="#f97316" />
            <div className="flex justify-center my-3">
              <JetPlane src={PLANES[p2Plane].url} />
            </div>
            <p className="text-xs font-bold text-orange-500 mb-4">⬆️⬇️⬅️➡️ or W A S D to fly</p>
            <div className="flex gap-2 justify-center">
              <button onClick={joinOnlineGame}
                className="px-7 py-2.5 rounded-full text-white font-extrabold text-lg shadow-md active:scale-95 transition-all"
                style={{ background: '#f97316' }}>
                Join Game 🚀
              </button>
              <button onClick={onExit}
                className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">
                Back
              </button>
            </div>
          </>
        )}

        {/* ── P2 waiting for P1 to start ── */}
        {p2Waiting && status === 'start' && overlay(
          <>
            <div className="text-4xl mb-4">✈️</div>
            <h3 className="text-lg font-extrabold text-sky-700 mb-2">Joined! Waiting for teacher…</h3>
            <div className="w-8 h-8 rounded-full border-4 border-sky-400 border-t-transparent animate-spin mx-auto mb-4" />
            <p className="text-xs text-slate-400">The teacher will start the game shortly.</p>
            <button onClick={() => { channelRef.current?.unsubscribe(); channelRef.current = null; setP2Waiting(false); }}
              className="mt-4 px-5 py-2 rounded-full bg-white border-2 border-slate-200 text-slate-500 text-sm font-bold active:scale-95 transition-all">
              Cancel
            </button>
          </>
        )}

        {/* ── HUD (playing) ── */}
        {status === 'playing' && (
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0"
              style={{ borderColor: '#3b82f6' }}>
              <span className="text-[11px] font-extrabold text-blue-600 whitespace-nowrap">P1 ⛽</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${f1}%`, background: fuelColor(f1) }}/>
              </div>
              <span className="text-[11px] font-extrabold text-blue-700 ml-1">{s1}</span>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => { if (snap) playLetterAudio(snap.targetLetter); }}
                className="px-2.5 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">
                🔊
              </button>
            </div>
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0"
              style={{ borderColor: '#f97316' }}>
              <span className="text-[11px] font-extrabold text-orange-600 whitespace-nowrap">P2 ⛽</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${f2}%`, background: fuelColor(f2) }}/>
              </div>
              <span className="text-[11px] font-extrabold text-orange-700 ml-1">{s2}</span>
            </div>
          </div>
        )}

        {/* ── Bubbles (playing) ── */}
        {status === 'playing' && renderBubbles(snapBubbles, snapLetterForm)}

        {/* ── P1 plane ── */}
        {status === 'playing' && snap && (
          <div className="absolute pointer-events-none"
            style={{ left: `${snap.p1.x}%`, top: `${snap.p1.y}%`, transform: `translate(-50%,-50%) rotate(${snap.p1.tilt}deg)`, zIndex: 20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full"
              style={{ background: '#3b82f6', whiteSpace: 'nowrap' }}>P1</div>
            {snap.p1.crashed ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div> : <JetPlane src={p1PlaneUrl} />}
          </div>
        )}

        {/* ── P2 plane (your plane) ── */}
        {status === 'playing' && snap && (
          <div className="absolute pointer-events-none"
            style={{ left: `${snap.p2.x}%`, top: `${snap.p2.y}%`, transform: `translate(-50%,-50%) rotate(${snap.p2.tilt}deg)`, zIndex: 20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full"
              style={{ background: '#f97316', whiteSpace: 'nowrap' }}>YOU</div>
            {snap.p2.crashed ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div> : <JetPlane src={p2PlaneUrl} />}
          </div>
        )}

        {/* ── Touch controls for P2 ── */}
        {status === 'playing' && (
          <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction: 'ltr' }}>
            <div/>
            <button {...holdBtnP2('up')}    className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▲</button>
            <div/>
            <button {...holdBtnP2('left')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">◀</button>
            <button {...holdBtnP2('down')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▼</button>
            <button {...holdBtnP2('right')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▶</button>
          </div>
        )}

        {/* ── Win / Lost overlays ── */}
        {(status === 'won' || status === 'lost') && snap && (() => {
          const r = twoPlayerResult(s1, s2);
          return overlay(
            <>
              <div className="text-5xl mb-2">{status === 'won' ? r.emoji : '🪂'}</div>
              <h3 className="text-2xl font-extrabold mb-3" style={{ color: r.color }}>
                {status === 'won' ? r.msg : 'Both planes crashed!'}
              </h3>
              <div className="flex gap-3 justify-center mb-5">
                <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#3b82f6' }}>
                  <div className="text-xs font-extrabold text-blue-500 mb-1">Player 1</div>
                  <div className="text-3xl font-extrabold text-blue-700">{s1}</div>
                </div>
                <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#f97316' }}>
                  <div className="text-xs font-extrabold text-orange-500 mb-1">You (P2)</div>
                  <div className="text-3xl font-extrabold text-orange-600">{s2}</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mb-3">Waiting for teacher to start a new round…</p>
              <button onClick={onExit}
                className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">
                Exit
              </button>
            </>
          );
        })()}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // P1 / LOCAL VIEW  (unchanged structure, extended for online mode)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="select-none" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#1a6fc4', touchAction: 'none' }}>

      {/* ── Scrolling background ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, overflow: 'hidden' }}>
        <div ref={bgStripRef} style={{ display: 'flex', height: '100%', willChange: 'transform' }}>
          {[0, 1, 2, 3].map(i => (
            <img key={i} src="/sprites/airplane-bg.png" alt=""
              style={{ height: '100%', width: 'auto', display: 'block', flexShrink: 0 }}
              onLoad={i === 0 ? (e) => { bgImgWidthRef.current = (e.target as HTMLImageElement).offsetWidth; } : undefined}
            />
          ))}
        </div>
      </div>

      {/* ── 1P HUD ── */}
      {status === 'playing' && !is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
          <button onClick={onExit}
            className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">
            ← Exit
          </button>
          <div className="flex items-center gap-1.5 flex-1 max-w-[240px] bg-white/90 rounded-full px-3 py-1.5 border-2 border-sky-200 shadow">
            <span className="text-sm">⛽</span>
            <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${fuel}%`, background: fuelColor(fuel) }}/>
            </div>
            <span className="text-[11px] font-extrabold text-slate-600 w-7 text-right">{fuel}</span>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-200 text-xs font-extrabold text-indigo-700 shadow whitespace-nowrap">
            {score} / {queue.length}
          </div>
          {speedMult >= 1.15 && (
            <div className="px-2.5 py-1.5 rounded-full border-2 text-xs font-extrabold shadow whitespace-nowrap"
              style={{ background: `hsl(${Math.max(0, 30 - (speedMult - 1) * 30)}deg,90%,92%)`, borderColor: `hsl(${Math.max(0, 30 - (speedMult - 1) * 30)}deg,80%,55%)`, color: `hsl(${Math.max(0, 30 - (speedMult - 1) * 30)}deg,80%,35%)` }}>
              🔥 {speedMult.toFixed(1)}×
            </div>
          )}
          <button onClick={() => playLetterAudio(currentLetter)}
            className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-amber-500 text-white text-base font-bold shadow active:scale-95">
            🔊
          </button>
        </div>
      )}

      {/* ── 2P HUD ── */}
      {status === 'playing' && is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0"
            style={{ borderColor: '#3b82f6' }}>
            <span className="text-[11px] font-extrabold text-blue-600 whitespace-nowrap">P1 ⛽</span>
            <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${fuel}%`, background: fuelColor(fuel) }}/>
            </div>
            <span className="text-[11px] font-extrabold text-blue-700 ml-1">{score}</span>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={onExit}
              className="px-2.5 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">
              ✕
            </button>
            {speedMult >= 1.15 && (
              <div className="px-2 py-1.5 rounded-full border-2 text-xs font-extrabold shadow whitespace-nowrap"
                style={{ background: `hsl(${Math.max(0, 30 - (speedMult - 1) * 30)}deg,90%,92%)`, borderColor: `hsl(${Math.max(0, 30 - (speedMult - 1) * 30)}deg,80%,55%)`, color: `hsl(${Math.max(0, 30 - (speedMult - 1) * 30)}deg,80%,35%)` }}>
                🔥{speedMult.toFixed(1)}×
              </div>
            )}
            <button onClick={() => playLetterAudio(currentLetter)}
              className="px-2.5 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">
              🔊
            </button>
          </div>
          <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0"
            style={{ borderColor: '#f97316' }}>
            <span className="text-[11px] font-extrabold text-orange-600 whitespace-nowrap">P2 ⛽</span>
            <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${p2Fuel}%`, background: fuelColor(p2Fuel) }}/>
            </div>
            <span className="text-[11px] font-extrabold text-orange-700 ml-1">{p2Score}</span>
          </div>
        </div>
      )}

      {/* ── Bubbles ── */}
      {status === 'playing' && renderBubbles(bubbles, letterForm)}

      {/* ── P1 Airplane ── */}
      {status === 'playing' && (
        <div ref={planeRef} className="absolute pointer-events-none"
          style={{ left: `${planePos.current.x}%`, top: `${planePos.current.y}%`, transform: 'translate(-50%,-50%)', zIndex: 20 }}>
          {is2p && (
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full"
              style={{ background: '#3b82f6', whiteSpace: 'nowrap' }}>P1</div>
          )}
          {p1CrashedRef.current
            ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div>
            : <JetPlane src={PLANES[p1Plane].url} />}
        </div>
      )}

      {/* ── P2 Airplane ── */}
      {status === 'playing' && is2p && (
        <div ref={p2PlaneRef} className="absolute pointer-events-none"
          style={{ left: `${p2Pos.current.x}%`, top: `${p2Pos.current.y}%`, transform: 'translate(-50%,-50%)', zIndex: 20 }}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full"
            style={{ background: '#f97316', whiteSpace: 'nowrap' }}>P2</div>
          {p2CrashedRef.current
            ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div>
            : <JetPlane src={PLANES[isOnline ? p2RemotePlane : p2Plane].url} />}
        </div>
      )}

      {/* ── Hit flash ── */}
      {flash && (
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: flash === 'good' ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.28)' }}/>
      )}

      {/* ── Touch controls (P1 only, 1P mode) ── */}
      {status === 'playing' && !is2p && (
        <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction: 'ltr' }}>
          <div/>
          <button {...holdBtn('ArrowUp')}    className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▲</button>
          <div/>
          <button {...holdBtn('ArrowLeft')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">◀</button>
          <button {...holdBtn('ArrowDown')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▼</button>
          <button {...holdBtn('ArrowRight')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▶</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* ── Start screen ── */}
      {status === 'start' && overlay(
        <>
          <h3 className="text-xl font-extrabold text-sky-700 mb-3">Letter Flight!</h3>

          {/* Mode toggle */}
          <div className="flex gap-1.5 justify-center mb-4 flex-wrap">
            {(['1p', '2p', '2p-online'] as const).map(m => (
              <button key={m} onClick={() => {
                setGameMode(m);
                if (m !== '2p-online') setOnlineRoomId(null);
                setP2Joined(false);
                setLinkCopied(false);
              }}
                className="px-4 py-1.5 rounded-full border-2 font-extrabold text-xs transition-all"
                style={{
                  borderColor: gameMode === m ? '#f97316' : '#e2e8f0',
                  background:  gameMode === m ? '#fff7ed' : 'white',
                  color:       gameMode === m ? '#ea580c' : '#94a3b8',
                  transform:   gameMode === m ? 'scale(1.05)' : 'scale(1)',
                }}>
                {m === '1p' ? '1 Player' : m === '2p' ? '👥 2P Local' : '🌐 2P Online'}
              </button>
            ))}
          </div>

          <p className="text-xs font-semibold text-slate-400 mb-3">
            {gameMode === '2p-online' ? 'Player 1 — choose your vehicle' : is2p ? 'Player 1 — choose your vehicle' : 'Choose your vehicle'}
          </p>

          <VehiclePicker selected={p1Plane} onSelect={setP1Plane} accentColor="#3b82f6" />

          <div className="flex justify-center my-3">
            <JetPlane src={PLANES[p1Plane].url} />
          </div>

          {/* Online: share link box */}
          {gameMode === '2p-online' && onlineRoomId && (
            <div className="mb-3 text-left">
              <p className="text-[11px] font-bold text-slate-500 mb-1">Share this link with Player 2:</p>
              <div className="flex gap-1.5 items-center">
                <div className="flex-1 bg-slate-100 rounded-lg px-2 py-1.5 text-[10px] text-slate-500 font-mono truncate border border-slate-200">
                  {shareLink}
                </div>
                <button onClick={copyLink}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition-all active:scale-95 flex-shrink-0"
                  style={{ background: linkCopied ? '#22c55e' : '#3b82f6', color: 'white' }}>
                  {linkCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              {p2Joined ? (
                <p className="text-[11px] font-extrabold text-green-600 mt-1.5">✅ Player 2 joined! Ready to take off.</p>
              ) : (
                <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"/>
                  Waiting for Player 2 to join…
                </p>
              )}
            </div>
          )}

          <p className="text-xs font-bold text-indigo-500 mb-4">
            {gameMode === '2p-online'
              ? '⬆️⬇️⬅️➡️ You (P1) · P2 uses their own device'
              : is2p
                ? '⬆️⬇️⬅️➡️ P1 arrows  ·  WASD P2'
                : '⬆️⬇️⬅️➡️ Arrow keys to fly · ⛽ Don\'t run out of fuel!'}
          </p>

          <div className="flex gap-2 justify-center">
            {is2p && gameMode !== '2p-online' ? (
              <button onClick={() => setStatus('select_p2')}
                className="px-7 py-2.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-lg shadow-md active:scale-95 transition-all">
                Next → P2
              </button>
            ) : gameMode === '2p-online' ? (
              <button
                onClick={startGame}
                disabled={!p2Joined}
                className="px-7 py-2.5 rounded-full text-white font-extrabold text-lg shadow-md active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: p2Joined ? '#f97316' : '#94a3b8' }}>
                Take off! 🚀
              </button>
            ) : (
              <button onClick={startGame}
                className="px-7 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold text-lg shadow-md active:scale-95 transition-all">
                Take off! 🚀
              </button>
            )}
            <button onClick={onExit}
              className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">
              Back
            </button>
          </div>
        </>
      )}

      {/* ── P2 vehicle selection (local 2P only) ── */}
      {status === 'select_p2' && overlay(
        <>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-extrabold text-white mb-3"
            style={{ background: '#f97316' }}>Player 2</div>
          <p className="text-xs font-semibold text-slate-400 mb-3">Choose your vehicle</p>

          <VehiclePicker selected={p2Plane} onSelect={setP2Plane} accentColor="#f97316" />

          <div className="flex justify-center my-3">
            <JetPlane src={PLANES[p2Plane].url} />
          </div>

          <p className="text-xs font-bold text-orange-500 mb-4">W A S D to fly</p>

          <div className="flex gap-2 justify-center">
            <button onClick={startGame}
              className="px-7 py-2.5 rounded-full text-white font-extrabold text-lg shadow-md active:scale-95 transition-all"
              style={{ background: '#f97316' }}>
              Take off! 🚀
            </button>
            <button onClick={() => setStatus('start')}
              className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">
              ← Back
            </button>
          </div>
        </>
      )}

      {/* ── Win screen ── */}
      {status === 'won' && overlay(
        is2p ? (() => {
          const r = twoPlayerResult(score, p2Score);
          return (
            <>
              <div className="text-5xl mb-2">{r.emoji}</div>
              <h3 className="text-2xl font-extrabold mb-3" style={{ color: r.color }}>{r.msg}</h3>
              <div className="flex gap-3 justify-center mb-5">
                <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#3b82f6' }}>
                  <div className="text-xs font-extrabold text-blue-500 mb-1">Player 1</div>
                  <div className="text-3xl font-extrabold text-blue-700">{score}</div>
                </div>
                <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#f97316' }}>
                  <div className="text-xs font-extrabold text-orange-500 mb-1">Player 2</div>
                  <div className="text-3xl font-extrabold text-orange-600">{p2Score}</div>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <button onClick={() => { setStatus('start'); if (isOnline) { setP2Joined(false); } }} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>
                <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
              </div>
            </>
          );
        })() : (
          <>
            <div className="text-6xl mb-3">🏆</div>
            <h3 className="text-3xl font-extrabold text-pink-500 mb-2">You Win!</h3>
            <p className="text-sm font-bold text-blue-600 mb-5">You found all {queue.length} letters! Amazing flying! ✈️🌟</p>
            <div className="flex gap-2 justify-center">
              <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
            </div>
          </>
        )
      )}

      {/* ── Game over screen ── */}
      {status === 'lost' && overlay(
        is2p ? (() => {
          const r = twoPlayerResult(score, p2Score);
          return (
            <>
              <div className="text-4xl mb-2">🪂</div>
              <h3 className="text-xl font-extrabold text-slate-600 mb-1">Both planes crashed!</h3>
              <h4 className="text-lg font-extrabold mb-3" style={{ color: r.color }}>{r.msg}</h4>
              <div className="flex gap-3 justify-center mb-5">
                <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#3b82f6' }}>
                  <div className="text-xs font-extrabold text-blue-500 mb-1">Player 1</div>
                  <div className="text-3xl font-extrabold text-blue-700">{score}</div>
                </div>
                <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#f97316' }}>
                  <div className="text-xs font-extrabold text-orange-500 mb-1">Player 2</div>
                  <div className="text-3xl font-extrabold text-orange-600">{p2Score}</div>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <button onClick={() => { setStatus('start'); if (isOnline) { setP2Joined(false); } }} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>
                <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
              </div>
            </>
          );
        })() : (
          <>
            <div className="text-6xl mb-3">🪂</div>
            <h3 className="text-3xl font-extrabold text-slate-600 mb-2">Game Over</h3>
            <p className="text-sm font-bold text-slate-500 mb-5">Out of fuel! You found {score} / {queue.length} letters. Try again!</p>
            <div className="flex gap-2 justify-center">
              <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default AirplaneGame;
