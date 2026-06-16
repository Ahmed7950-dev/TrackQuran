import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Airplane letter game — 1-player, 2-player local, or 2-player online.
// P1 controls: Arrow keys  |  P2 local: W A S D  |  P2 online: Arrow/WASD
// Fire: Space (1P/online) · M = P1 local 2P · G = P2 local 2P
// Online: P1 hosts simulation & broadcasts state via Supabase Realtime.
//         P2 joins via shared /letter-flight/<roomId> link.
// ─────────────────────────────────────────────────────────────────────────────

type GameMode        = '1p' | '2p' | '2p-online';
type GameStatus      = 'start' | 'select_p2' | 'playing' | 'won' | 'lost';
type CollectibleType = 'heart' | 'weapon' | 'dynamite' | 'lightning';

type Bubble = {
  id: string; letter: string;
  x: number; y: number; vx: number;
  isCorrect: boolean; popped: boolean; driftDelay: number;
};

interface Collectible {
  id: string; type: CollectibleType;
  x: number; y: number;
  active: boolean; expiresAt: number;
}

interface Bullet {
  id: string; owner: 1 | 2;
  x: number; y: number; vx: number; vy: number;
  active: boolean;
}

interface Mine {
  id: string; owner: 1 | 2; // damages the OTHER player
  x: number; y: number;
  active: boolean;
}

interface P2Snapshot {
  p1: { x: number; y: number; tilt: number; crashed: boolean };
  p2: { x: number; y: number; tilt: number; crashed: boolean };
  fuels: [number, number]; scores: [number, number];
  bubbles: Bubble[]; status: GameStatus;
  queueLen: number; queuePos: number;
  letterForm: string; targetLetter: string;
  p1Plane: number; p2Plane: number;
  collectibles: Collectible[]; bullets: Bullet[]; mines: Mine[];
  p1Powerup: CollectibleType | null; p2Powerup: CollectibleType | null;
  p1Shocked: boolean; p2Shocked: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const START_FUEL            = 100;
const FUEL_GAIN             = 10;
const FUEL_LOSS             = 20;
const BUBBLE_RADIUS         = 7.5;
const BUBBLE_SPEED          = 0.14;
const BUBBLE_SPEED_MAX_MULT = 2.4;
const PLANE_ACCEL           = 0.09;
const PLANE_MAX_VEL         = 1.25;
const PLANE_DRAG            = 0.87;
const BG_SCROLL_SPEED       = 120;
const ONLINE_SITE_URL       = 'https://www.lisanquran.com';

const BULLET_SPEED          = 1.8;  // % of arena per frame
const BULLET_DAMAGE         = 18;   // fuel loss on bullet hit
const MINE_DAMAGE           = 28;   // fuel loss on mine trigger
const COLLECTIBLE_RADIUS    = 9;    // pickup detection (%)
const BULLET_HIT_RADIUS     = 7;
const MINE_TRIGGER_RADIUS   = 7;
const WEAPON_DURATION       = 5000; // ms
const SHOCK_DURATION        = 5000; // ms
const COLLECTIBLE_LIFETIME  = 13000; // ms

const COLLECTIBLE_ICONS: Record<CollectibleType, string> = {
  heart:     'https://img.icons8.com/arcade/64/like.png',
  weapon:    'https://img.icons8.com/arcade/64/center-diretion-2.png',
  dynamite:  'https://img.icons8.com/arcade/64/dynamite.png',
  lightning: 'https://img.icons8.com/arcade/64/lightning-bolt.png',
};

const COLLECTIBLE_LABELS: Record<CollectibleType, string> = {
  heart:     '❤️ +Fuel',
  weapon:    '🎯 Weapon',
  dynamite:  '💣 Mine',
  lightning: '⚡ Shock',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
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
    id: `${Date.now()}-${i}`, letter,
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
      osc.start(ctx.currentTime + i * duration); osc.stop(ctx.currentTime + (i + 1) * duration);
    });
    setTimeout(() => ctx.close(), (freqs.length + 1) * duration * 1000);
  } catch { /* audio unavailable */ }
}
const playSuccess  = () => playTone([523, 659, 784], 0.12);
const playWrong    = () => playTone([220, 165], 0.18, 'square');
const playPickup   = () => playTone([880, 1047], 0.1);
const playBulletHit = () => playTone([330, 220], 0.12, 'triangle');

// ── Vehicle options ───────────────────────────────────────────────────────────
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

const JetPlane: React.FC<{ src: string; shocked?: boolean }> = ({ src, shocked }) => (
  <img src={src} alt="vehicle" width={90} height={90}
    style={{
      display: 'block',
      filter: shocked
        ? 'drop-shadow(0 0 12px #60a5fa) drop-shadow(0 0 6px #93c5fd) brightness(0.8) saturate(0.5)'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
    }} />
);

const VehiclePicker: React.FC<{ selected: number; onSelect: (i: number) => void; accentColor: string }> = ({ selected, onSelect, accentColor }) => (
  <div className="grid grid-cols-3 gap-2">
    {PLANES.map((p, i) => (
      <button key={i} onClick={() => onSelect(i)}
        className="relative flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all select-none bg-white"
        style={{
          borderColor: selected === i ? accentColor : '#e2e8f0',
          background:  selected === i ? `${accentColor}18` : 'white',
          transform:   selected === i ? 'scale(1.06)' : 'scale(1)',
          boxShadow:   selected === i ? `0 4px 12px ${accentColor}44` : undefined,
        }}>
        <span className="absolute top-1 left-1.5 text-[10px] font-extrabold text-slate-400">{i + 1}</span>
        <img src={p.url} alt={p.label} width={52} height={52} style={{ display: 'block' }} />
      </button>
    ))}
  </div>
);

// ── Powerup badge shown in HUD ────────────────────────────────────────────────
const PowerupBadge: React.FC<{ type: CollectibleType; accentColor: string }> = ({ type, accentColor }) => (
  <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl border-2 shadow-sm"
    style={{ background: `${accentColor}15`, borderColor: accentColor }}>
    <img src={COLLECTIBLE_ICONS[type]} alt={type} width={22} height={22} />
    {type === 'weapon' && (
      <div className="w-full h-1 rounded-full bg-slate-200 overflow-hidden" style={{ minWidth: 36 }}>
        <div className="h-full rounded-full" style={{
          background: accentColor,
          animation: `ag-weapon-bar ${WEAPON_DURATION / 1000}s linear forwards`,
        }} />
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

interface AirplaneGameProps {
  letters: string[];
  letterForm?: string;
  onExit: () => void;
  roomId?: string;
  playerRole?: '1' | '2';
}

const AirplaneGame: React.FC<AirplaneGameProps> = ({
  letters, letterForm = 'isolated', onExit, roomId: propRoomId, playerRole,
}) => {
  const isP2 = playerRole === '2';

  // ── Core game state ───────────────────────────────────────────────────────
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
  const [speedMult, setSpeedMult]   = useState(1);

  // ── Collectible/powerup state ─────────────────────────────────────────────
  const [collectibles, setCollectibles]   = useState<Collectible[]>([]);
  const [p1Powerup, setP1Powerup]         = useState<CollectibleType | null>(null);
  const [p2Powerup, setP2Powerup]         = useState<CollectibleType | null>(null);
  const [bullets, setBullets]             = useState<Bullet[]>([]);
  const [mines, setMines]                 = useState<Mine[]>([]);
  const [p1Shocked, setP1Shocked]         = useState(false);
  const [p2Shocked, setP2Shocked]         = useState(false);

  // ── Online multiplayer state ──────────────────────────────────────────────
  const [onlineRoomId, setOnlineRoomId]       = useState<string | null>(null);
  const [p2Joined, setP2Joined]               = useState(false);
  const [p2RemotePlane, setP2RemotePlane]     = useState(1);
  const [linkCopied, setLinkCopied]           = useState(false);
  const [p2Snapshot, setP2Snapshot]           = useState<P2Snapshot | null>(null);
  const [p2Waiting, setP2Waiting]             = useState(false);

  // ── P1 physics refs ───────────────────────────────────────────────────────
  const planeRef   = useRef<HTMLDivElement>(null);
  const planePos   = useRef({ x: 14, y: 32 });
  const velRef     = useRef({ x: 0, y: 0 });
  const tiltRef    = useRef(0);
  // ── P2 physics refs ───────────────────────────────────────────────────────
  const p2PlaneRef = useRef<HTMLDivElement>(null);
  const p2Pos      = useRef({ x: 14, y: 68 });
  const p2Vel      = useRef({ x: 0, y: 0 });
  const p2Tilt     = useRef(0);
  // ── Shared game refs ──────────────────────────────────────────────────────
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
  const speedMultRef  = useRef(1);
  // ── Background refs ───────────────────────────────────────────────────────
  const bgStripRef    = useRef<HTMLDivElement>(null);
  const bgOffsetRef   = useRef(0);
  const bgImgWidthRef = useRef(0);
  // ── Collectible/powerup refs ──────────────────────────────────────────────
  const collectiblesRef    = useRef<Collectible[]>([]);
  const bulletsRef         = useRef<Bullet[]>([]);
  const minesRef           = useRef<Mine[]>([]);
  const bulletDomRefs      = useRef<Map<string, HTMLDivElement>>(new Map());
  const p1PowerupRef       = useRef<CollectibleType | null>(null);
  const p2PowerupRef       = useRef<CollectibleType | null>(null);
  const p1ShockedUntilRef  = useRef(0);
  const p2ShockedUntilRef  = useRef(0);
  const p1WeaponUntilRef   = useRef(0);
  const p2WeaponUntilRef   = useRef(0);
  const p1FireCooldownRef  = useRef(0);
  const p2FireCooldownRef  = useRef(0);
  // ── Online refs ───────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef         = useRef<any>(null);
  const p2RemoteKeysRef    = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({ up: false, down: false, left: false, right: false });
  const fuelRef            = useRef(START_FUEL);
  const p2FuelRef          = useRef(START_FUEL);
  const scoreRef           = useRef(0);
  const p2ScoreRef         = useRef(0);
  const p2SnapshotLetterRef = useRef('');

  // Sync mutable arrays to refs (game loop reads these)
  bubblesRef.current      = bubbles;
  collectiblesRef.current = collectibles;
  bulletsRef.current      = bullets;
  minesRef.current        = mines;

  const is2p     = gameMode === '2p' || gameMode === '2p-online';
  const isOnline = gameMode === '2p-online';

  // ── Fuel/score ref sync (for broadcast interval) ──────────────────────────
  useEffect(() => { fuelRef.current    = fuel;    }, [fuel]);
  useEffect(() => { p2FuelRef.current  = p2Fuel;  }, [p2Fuel]);
  useEffect(() => { scoreRef.current   = score;   }, [score]);
  useEffect(() => { p2ScoreRef.current = p2Score; }, [p2Score]);

  // ── Body scroll lock ──────────────────────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Background infinite scroll ────────────────────────────────────────────
  useEffect(() => {
    let lastTime = performance.now(); let raf: number;
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
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

  // ── CSS animations ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = 'ag-styles-v3';
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
      @keyframes ag-collectible {
        0%,100% { transform: translate(-50%,-50%) translateY(-5px) scale(1); }
        50%      { transform: translate(-50%,-50%) translateY(5px)  scale(1.06); }
      }
      @keyframes ag-mine-pulse {
        0%,100% { transform: translate(-50%,-50%) scale(1); }
        50%      { transform: translate(-50%,-50%) scale(1.12); }
      }
      @keyframes ag-shock-flash {
        0%,100% { opacity: 0.25; }
        50%      { opacity: 0.55; }
      }
      @keyframes ag-weapon-bar {
        from { transform: scaleX(1); }
        to   { transform: scaleX(0); }
      }
      .ag-bubble      { animation: ag-float     3.2s ease-in-out infinite; }
      .ag-popped      { animation: ag-pop       .45s ease-out    forwards; }
      .ag-collectible { animation: ag-collectible 2.4s ease-in-out infinite; }
      .ag-mine        { animation: ag-mine-pulse 1.4s ease-in-out infinite; }
      .ag-shock-overlay { animation: ag-shock-flash .25s ease-in-out infinite; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const playLetterAudio = useCallback((letter: string) => {
    if (!letter) return;
    audioRef.current?.pause(); window.speechSynthesis?.cancel();
    const audio = new Audio(`${letterAudioUrl(letter)}?t=${Date.now() % 1e7}`);
    audioRef.current = audio;
    audio.onerror = () => speakLetter(letter);
    audio.play().catch(() => speakLetter(letter));
  }, []);

  // ── Apply collectible effect ───────────────────────────────────────────────
  const applyCollectible = useCallback((type: CollectibleType, player: 1 | 2) => {
    playPickup();
    if (type === 'heart') {
      if (player === 1) setFuel(f => Math.min(START_FUEL, f + 35));
      else              setP2Fuel(f => Math.min(START_FUEL, f + 35));
    } else if (type === 'weapon') {
      const until = Date.now() + WEAPON_DURATION;
      if (player === 1) { p1PowerupRef.current = 'weapon'; p1WeaponUntilRef.current = until; setP1Powerup('weapon'); }
      else              { p2PowerupRef.current = 'weapon'; p2WeaponUntilRef.current = until; setP2Powerup('weapon'); }
    } else if (type === 'dynamite') {
      if (player === 1) { p1PowerupRef.current = 'dynamite'; setP1Powerup('dynamite'); }
      else              { p2PowerupRef.current = 'dynamite'; setP2Powerup('dynamite'); }
    } else if (type === 'lightning') {
      if (player === 1) { p1PowerupRef.current = 'lightning'; setP1Powerup('lightning'); }
      else              { p2PowerupRef.current = 'lightning'; setP2Powerup('lightning'); }
    }
  }, []); // all deps are stable refs/setters
  const applyCollectibleRef = useRef(applyCollectible);

  // ── Fire handler — P1 ─────────────────────────────────────────────────────
  const fireP1 = useCallback(() => {
    const powerup = p1PowerupRef.current;
    if (!powerup) return;
    const now = Date.now();
    if (now < p1FireCooldownRef.current) return;
    p1FireCooldownRef.current = now + 350;
    const is2pNow = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';

    if (powerup === 'weapon') {
      if (!is2pNow || now > p1WeaponUntilRef.current) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      const s = planePos.current, t = p2Pos.current;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      setBullets(prev => [...prev, { id: `b1-${now}`, owner: 1 as const, x: s.x, y: s.y, vx: dx / dist * BULLET_SPEED, vy: dy / dist * BULLET_SPEED, active: true }]);
    } else if (powerup === 'dynamite') {
      if (!is2pNow) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      setMines(prev => [...prev, { id: `m1-${now}`, owner: 1 as const, x: planePos.current.x, y: planePos.current.y, active: true }]);
      p1PowerupRef.current = null; setP1Powerup(null);
    } else if (powerup === 'lightning') {
      if (!is2pNow) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      p2ShockedUntilRef.current = now + SHOCK_DURATION;
      setP2Shocked(true);
      setTimeout(() => { if (Date.now() >= p2ShockedUntilRef.current) setP2Shocked(false); }, SHOCK_DURATION + 100);
      p1PowerupRef.current = null; setP1Powerup(null);
    }
  }, []);
  const fireP1Ref = useRef(fireP1);
  useEffect(() => { fireP1Ref.current = fireP1; }, [fireP1]);

  // ── Fire handler — P2 ─────────────────────────────────────────────────────
  const fireP2 = useCallback(() => {
    const powerup = p2PowerupRef.current;
    if (!powerup) return;
    const now = Date.now();
    if (now < p2FireCooldownRef.current) return;
    p2FireCooldownRef.current = now + 350;

    if (powerup === 'weapon') {
      if (now > p2WeaponUntilRef.current) { p2PowerupRef.current = null; setP2Powerup(null); return; }
      const s = p2Pos.current, t = planePos.current;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx * dx + dy * dy) || 1;
      setBullets(prev => [...prev, { id: `b2-${now}`, owner: 2 as const, x: s.x, y: s.y, vx: dx / dist * BULLET_SPEED, vy: dy / dist * BULLET_SPEED, active: true }]);
    } else if (powerup === 'dynamite') {
      setMines(prev => [...prev, { id: `m2-${now}`, owner: 2 as const, x: p2Pos.current.x, y: p2Pos.current.y, active: true }]);
      p2PowerupRef.current = null; setP2Powerup(null);
    } else if (powerup === 'lightning') {
      p1ShockedUntilRef.current = now + SHOCK_DURATION;
      setP1Shocked(true);
      setTimeout(() => { if (Date.now() >= p1ShockedUntilRef.current) setP1Shocked(false); }, SHOCK_DURATION + 100);
      p2PowerupRef.current = null; setP2Powerup(null);
    }
  }, []);
  const fireP2Ref = useRef(fireP2);
  useEffect(() => { fireP2Ref.current = fireP2; }, [fireP2]);

  // ── Round setup ───────────────────────────────────────────────────────────
  const startRound = useCallback((letter: string) => {
    targetLetterRef.current = letter;
    setBubbles(makeBubbles(letter, 3, [], speedMultRef.current));
    collidingRef.current = false; p2ColRef.current = false;
    setTimeout(() => playLetterAudio(letter), 350);
  }, [playLetterAudio]);

  const startGame = useCallback(() => {
    const q = shuffle(letters);
    setQueue(q); setQueuePos(0); queuePosRef.current = 0;
    setFuel(START_FUEL); setScore(0); setP2Fuel(START_FUEL); setP2Score(0);
    fuelRef.current = START_FUEL; p2FuelRef.current = START_FUEL;
    scoreRef.current = 0; p2ScoreRef.current = 0;
    speedMultRef.current = 1; setSpeedMult(1);
    planePos.current = { x: 14, y: 32 }; velRef.current = { x: 0, y: 0 }; tiltRef.current = 0;
    p2Pos.current    = { x: 14, y: 68 }; p2Vel.current = { x: 0, y: 0 }; p2Tilt.current = 0;
    p1CrashedRef.current = false; p2CrashedRef.current = false;
    gameModeRef.current = gameMode;
    // Reset collectibles
    setCollectibles([]); setP1Powerup(null); setP2Powerup(null);
    setBullets([]); setMines([]); setP1Shocked(false); setP2Shocked(false);
    p1PowerupRef.current = null; p2PowerupRef.current = null;
    p1ShockedUntilRef.current = 0; p2ShockedUntilRef.current = 0;
    p1WeaponUntilRef.current = 0; p2WeaponUntilRef.current = 0;
    setStatus('playing');
    startRound(q[0]);
  }, [letters, startRound, gameMode]);

  // ── Hit handling ──────────────────────────────────────────────────────────
  const handleHit = useCallback((bubble: Bubble, player: 1 | 2) => {
    const is2pMode = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
    if (bubble.isCorrect) {
      playSuccess(); setFlash('good');
      if (player === 1) { setFuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setScore(s => s + 1); }
      else              { setP2Fuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setP2Score(s => s + 1); }
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      const next = queuePosRef.current + 1;
      queuePosRef.current = next; setQueuePos(next);
      // Speed ramp
      const newMult = 1 + (next / Math.max(queue.length, 1)) * (BUBBLE_SPEED_MAX_MULT - 1);
      speedMultRef.current = newMult; setSpeedMult(newMult);
      if (next >= queue.length) {
        setTimeout(() => setStatus('won'), 600);
      } else {
        const nextLetter = queue[next];
        // Maybe spawn a collectible
        const allTypes: CollectibleType[] = ['heart', 'weapon', 'dynamite', 'lightning'];
        const spawnTypes = is2pMode ? allTypes : ['heart'] as CollectibleType[];
        if (next < queue.length && Math.random() < 0.7) {
          const type = spawnTypes[Math.floor(Math.random() * spawnTypes.length)];
          const cx = 28 + Math.random() * 44;
          const cy = ALL_Y_SLOTS[Math.floor(Math.random() * ALL_Y_SLOTS.length)];
          setCollectibles(prev => [
            ...prev.filter(c => c.active && Date.now() < c.expiresAt).slice(-1),
            { id: `col-${Date.now()}`, type, x: cx, y: cy, active: true, expiresAt: Date.now() + COLLECTIBLE_LIFETIME },
          ]);
        }
        setTimeout(() => {
          setBubbles(prev => {
            const survivors = prev.filter(b => !b.popped && b.letter !== nextLetter).slice(0, 2);
            const usedY = survivors.map(b => b.y);
            return [...survivors, ...makeBubbles(nextLetter, 3, usedY, speedMultRef.current)];
          });
          collidingRef.current = false; p2ColRef.current = false;
          targetLetterRef.current = nextLetter;
          setTimeout(() => playLetterAudio(nextLetter), 350);
        }, 500);
      }
    } else {
      playWrong(); setFlash('bad');
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      if (player === 1) {
        setFuel(f => {
          const nf = Math.max(0, f - FUEL_LOSS);
          if (nf <= 0) { p1CrashedRef.current = true; if (!is2pMode || p2CrashedRef.current) setTimeout(() => setStatus('lost'), 500); }
          return nf;
        });
        setTimeout(() => { collidingRef.current = false; }, 500);
      } else {
        setP2Fuel(f => {
          const nf = Math.max(0, f - FUEL_LOSS);
          if (nf <= 0) { p2CrashedRef.current = true; if (p1CrashedRef.current) setTimeout(() => setStatus('lost'), 500); }
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

  // ── Main game loop (P1/local only) ────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || isP2) return;

    const tick = () => {
      const k = keysDown.current;
      const p = planePos.current, v = velRef.current;
      const is2pNow    = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
      const isOnlineNow = gameModeRef.current === '2p-online';
      const now = Date.now();

      // ── Powerup/shock timer checks ────────────────────────────────────────
      if (p1PowerupRef.current === 'weapon' && now > p1WeaponUntilRef.current) {
        p1PowerupRef.current = null; setP1Powerup(null);
      }
      if (p2PowerupRef.current === 'weapon' && now > p2WeaponUntilRef.current) {
        p2PowerupRef.current = null; setP2Powerup(null);
      }
      if (p1ShockedUntilRef.current > 0 && now > p1ShockedUntilRef.current) {
        p1ShockedUntilRef.current = 0; setP1Shocked(false);
      }
      if (p2ShockedUntilRef.current > 0 && now > p2ShockedUntilRef.current) {
        p2ShockedUntilRef.current = 0; setP2Shocked(false);
      }

      const p1IsShocked = p1ShockedUntilRef.current > 0 && now < p1ShockedUntilRef.current;
      const p2IsShocked = p2ShockedUntilRef.current > 0 && now < p2ShockedUntilRef.current;

      // ── P1 physics (Arrow keys) ───────────────────────────────────────────
      if (!p1CrashedRef.current && !p1IsShocked) {
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

      // ── P2 physics (WASD local / remote keys online) ──────────────────────
      if (is2pNow && !p2CrashedRef.current && !p2IsShocked) {
        const p2 = p2Pos.current, v2 = p2Vel.current;
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

      // ── Bubbles ───────────────────────────────────────────────────────────
      for (const b of bubblesRef.current) {
        if (b.popped) continue;
        b.x += b.vx;
        if (b.x < -16) b.x = 108 + Math.random() * 25;
        const el = bubbleDomRefs.current.get(b.id);
        if (el) el.style.left = `${b.x}%`;
      }

      // ── P1 bubble collision ───────────────────────────────────────────────
      if (!collidingRef.current && !p1CrashedRef.current) {
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p.x, dy = (b.y - p.y) * 0.65;
          if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_RADIUS) {
            collidingRef.current = true; handleHitRef.current(b, 1); break;
          }
        }
      }

      // ── P2 bubble collision ───────────────────────────────────────────────
      if (is2pNow && !p2ColRef.current && !p2CrashedRef.current) {
        const p2c = p2Pos.current;
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p2c.x, dy = (b.y - p2c.y) * 0.65;
          if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_RADIUS) {
            p2ColRef.current = true; handleHitRef.current(b, 2); break;
          }
        }
      }

      // ── Collectible pickup ────────────────────────────────────────────────
      let colChanged = false;
      for (const c of collectiblesRef.current) {
        if (!c.active) continue;
        if (now > c.expiresAt) { c.active = false; colChanged = true; continue; }
        // P1
        if (!p1CrashedRef.current) {
          const d1x = c.x - p.x, d1y = (c.y - p.y) * 0.65;
          if (Math.sqrt(d1x * d1x + d1y * d1y) < COLLECTIBLE_RADIUS) {
            c.active = false; colChanged = true;
            applyCollectibleRef.current(c.type, 1); continue;
          }
        }
        // P2
        if (is2pNow && !p2CrashedRef.current) {
          const p2c = p2Pos.current;
          const d2x = c.x - p2c.x, d2y = (c.y - p2c.y) * 0.65;
          if (Math.sqrt(d2x * d2x + d2y * d2y) < COLLECTIBLE_RADIUS) {
            c.active = false; colChanged = true;
            applyCollectibleRef.current(c.type, 2); continue;
          }
        }
      }
      if (colChanged) setCollectibles(prev => prev.filter(c => c.active && now < c.expiresAt));

      // ── Bullets ───────────────────────────────────────────────────────────
      let bChanged = false;
      for (const b of bulletsRef.current) {
        if (!b.active) continue;
        b.x += b.vx; b.y += b.vy;
        // Off-screen
        if (b.x < -5 || b.x > 105 || b.y < -5 || b.y > 105) {
          b.active = false;
          const el = bulletDomRefs.current.get(b.id);
          if (el) el.style.display = 'none';
          bChanged = true; continue;
        }
        // Hit opponent
        const target = b.owner === 1 ? p2Pos.current : planePos.current;
        const targetCrashed = b.owner === 1 ? p2CrashedRef.current : p1CrashedRef.current;
        if (!targetCrashed && is2pNow) {
          const bdx = b.x - target.x, bdy = (b.y - target.y) * 0.65;
          if (Math.sqrt(bdx * bdx + bdy * bdy) < BULLET_HIT_RADIUS) {
            b.active = false;
            const el = bulletDomRefs.current.get(b.id);
            if (el) el.style.display = 'none';
            bChanged = true;
            if (b.owner === 1) setP2Fuel(f => Math.max(0, f - BULLET_DAMAGE));
            else               setFuel(f => Math.max(0, f - BULLET_DAMAGE));
            playBulletHit();
            setFlash('bad'); setTimeout(() => setFlash(null), 300);
            continue;
          }
        }
        const bEl = bulletDomRefs.current.get(b.id);
        if (bEl) { bEl.style.left = `${b.x}%`; bEl.style.top = `${b.y}%`; }
      }
      if (bChanged) setBullets(prev => prev.filter(b => b.active));

      // ── Mine triggers ─────────────────────────────────────────────────────
      let mChanged = false;
      for (const m of minesRef.current) {
        if (!m.active) continue;
        const targetPos     = m.owner === 1 ? p2Pos.current : planePos.current;
        const targetCrashed = m.owner === 1 ? p2CrashedRef.current : p1CrashedRef.current;
        if (!targetCrashed && is2pNow) {
          const mdx = m.x - targetPos.x, mdy = (m.y - targetPos.y) * 0.65;
          if (Math.sqrt(mdx * mdx + mdy * mdy) < MINE_TRIGGER_RADIUS) {
            m.active = false; mChanged = true;
            if (m.owner === 1) setP2Fuel(f => Math.max(0, f - MINE_DAMAGE));
            else               setFuel(f => Math.max(0, f - MINE_DAMAGE));
            playBulletHit();
            setFlash('bad'); setTimeout(() => setFlash(null), 400);
          }
        }
      }
      if (mChanged) setMines(prev => prev.filter(m => m.active));

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, isP2]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || isP2) return;
    const down = (e: KeyboardEvent) => {
      const move = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'];
      if (move.includes(e.code)) { e.preventDefault(); keysDown.current[e.code] = true; }
      const mode = gameModeRef.current;
      // Fire
      if (e.code === 'Space' && (mode === '1p' || mode === '2p-online')) { e.preventDefault(); fireP1Ref.current(); }
      if (e.code === 'KeyM'  && mode === '2p') { e.preventDefault(); fireP1Ref.current(); }
      if (e.code === 'KeyG'  && mode === '2p') { e.preventDefault(); fireP2Ref.current(); }
    };
    const up = (e: KeyboardEvent) => { keysDown.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); keysDown.current = {}; };
  }, [status, isP2]);

  // ── Cleanup audio ─────────────────────────────────────────────────────────
  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis?.cancel(); }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ONLINE — P1 side
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (gameMode !== '2p-online' || onlineRoomId) return;
    setOnlineRoomId(crypto.randomUUID());
  }, [gameMode, onlineRoomId]);

  useEffect(() => {
    if (gameMode !== '2p-online' || !onlineRoomId || isP2) return;
    const ch = supabase.channel(`letter-flight:${onlineRoomId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'ready' },  ({ payload }: { payload: { p2Plane: number } }) => {
      setP2RemotePlane(payload.p2Plane); setP2Joined(true);
    });
    ch.on('broadcast', { event: 'input' },  ({ payload }: { payload: { up: boolean; down: boolean; left: boolean; right: boolean } }) => {
      p2RemoteKeysRef.current = payload;
    });
    ch.on('broadcast', { event: 'fire' },   () => { fireP2Ref.current(); });
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [gameMode, onlineRoomId, isP2]);

  // Broadcast full state at ~30fps (P1 online)
  useEffect(() => {
    if (status !== 'playing' || gameMode !== '2p-online' || !channelRef.current || isP2) return;
    const id = setInterval(() => {
      const now = Date.now();
      channelRef.current?.send({
        type: 'broadcast', event: 'state',
        payload: {
          p1: { x: planePos.current.x, y: planePos.current.y, tilt: tiltRef.current, crashed: p1CrashedRef.current },
          p2: { x: p2Pos.current.x,    y: p2Pos.current.y,    tilt: p2Tilt.current,  crashed: p2CrashedRef.current },
          fuels: [fuelRef.current, p2FuelRef.current] as [number, number],
          scores: [scoreRef.current, p2ScoreRef.current] as [number, number],
          bubbles: bubblesRef.current,
          status, queueLen: queue.length, queuePos: queuePosRef.current,
          letterForm, targetLetter: targetLetterRef.current,
          p1Plane, p2Plane: p2RemotePlane,
          collectibles: collectiblesRef.current.filter(c => c.active && now < c.expiresAt),
          bullets: bulletsRef.current.filter(b => b.active),
          mines: minesRef.current.filter(m => m.active),
          p1Powerup: p1PowerupRef.current,
          p2Powerup: p2PowerupRef.current,
          p1Shocked: now < p1ShockedUntilRef.current,
          p2Shocked: now < p2ShockedUntilRef.current,
        } satisfies P2Snapshot,
      });
    }, 33);
    return () => clearInterval(id);
  }, [status, gameMode, isP2, letterForm, queue.length, p1Plane, p2RemotePlane]);

  // ─────────────────────────────────────────────────────────────────────────
  // ONLINE — P2 side
  // ─────────────────────────────────────────────────────────────────────────

  const joinOnlineGame = useCallback(() => {
    if (!propRoomId) return;
    const ch = supabase.channel(`letter-flight:${propRoomId}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'state' }, ({ payload }: { payload: P2Snapshot }) => {
      setP2Snapshot(payload);
      setP2Waiting(false);
      setStatus(payload.status);
      setBubbles(payload.bubbles);
      setFuel(payload.fuels[0]);
      setP2Fuel(payload.fuels[1]);
      setScore(payload.scores[0]);
      setP2Score(payload.scores[1]);
      setCollectibles(payload.collectibles ?? []);
      setBullets(payload.bullets ?? []);
      setMines(payload.mines ?? []);
      setP1Powerup(payload.p1Powerup ?? null);
      setP2Powerup(payload.p2Powerup ?? null);
      setP1Shocked(payload.p1Shocked ?? false);
      setP2Shocked(payload.p2Shocked ?? false);
      if (payload.targetLetter && payload.targetLetter !== p2SnapshotLetterRef.current) {
        p2SnapshotLetterRef.current = payload.targetLetter;
        if (payload.status === 'playing') setTimeout(() => playLetterAudio(payload.targetLetter), 200);
      }
    });
    ch.subscribe(() => {
      ch.send({ type: 'broadcast', event: 'ready', payload: { p2Plane: p2Plane } });
    });
    channelRef.current = ch;
    setP2Waiting(true);
  }, [propRoomId, p2Plane, playLetterAudio]);

  // P2 keyboard → channel input
  useEffect(() => {
    if (!isP2 || status !== 'playing') return;
    const mapKey = (code: string): keyof typeof p2RemoteKeysRef.current | null => {
      if (code === 'ArrowUp'    || code === 'KeyW') return 'up';
      if (code === 'ArrowDown'  || code === 'KeyS') return 'down';
      if (code === 'ArrowLeft'  || code === 'KeyA') return 'left';
      if (code === 'ArrowRight' || code === 'KeyD') return 'right';
      return null;
    };
    const sendInput = () => channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } });
    const down = (e: KeyboardEvent) => {
      const dir = mapKey(e.code);
      if (dir) { e.preventDefault(); p2RemoteKeysRef.current[dir] = true; sendInput(); }
      if (e.code === 'Space') { e.preventDefault(); channelRef.current?.send({ type: 'broadcast', event: 'fire', payload: {} }); }
    };
    const up = (e: KeyboardEvent) => {
      const dir = mapKey(e.code);
      if (dir) { p2RemoteKeysRef.current[dir] = false; sendInput(); }
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [isP2, status]);

  useEffect(() => { return () => { channelRef.current?.unsubscribe(); channelRef.current = null; }; }, []);

  // ── Touch helpers ─────────────────────────────────────────────────────────
  const holdBtn = (code: string) => ({
    onPointerDown:  (e: React.PointerEvent) => { e.preventDefault(); keysDown.current[code] = true; },
    onPointerUp:    () => { keysDown.current[code] = false; },
    onPointerLeave: () => { keysDown.current[code] = false; },
    onContextMenu:  (e: React.MouseEvent) => e.preventDefault(),
  });
  const holdBtnP2 = (dir: 'up' | 'down' | 'left' | 'right') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault(); p2RemoteKeysRef.current[dir] = true;
      channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } });
    },
    onPointerUp: () => { p2RemoteKeysRef.current[dir] = false; channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } }); },
    onPointerLeave: () => { p2RemoteKeysRef.current[dir] = false; channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } }); },
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
    navigator.clipboard.writeText(shareLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); });
  };

  // ── Shared renderers ──────────────────────────────────────────────────────
  const renderBubbles = (bubbleSrc: Bubble[], lf: string) => bubbleSrc.map(b => (
    <div key={b.id}
      ref={isP2 ? undefined : el => { if (el) bubbleDomRefs.current.set(b.id, el); else bubbleDomRefs.current.delete(b.id); }}
      className={`absolute z-10 flex items-center justify-center rounded-full ${b.popped ? 'ag-popped' : 'ag-bubble'}`}
      style={{
        left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(-50%,-50%)',
        width: 'clamp(68px,12vw,100px)', height: 'clamp(68px,12vw,100px)',
        background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.97), rgba(186,230,253,0.78) 55%, rgba(125,211,252,0.88))',
        border: '3px solid rgba(255,255,255,0.95)',
        boxShadow: '0 6px 18px rgba(14,116,144,0.3), inset 0 -5px 12px rgba(14,116,144,0.18)',
        animationDelay: `${b.driftDelay}s`,
      }}>
      <span style={{ fontFamily: "'Hafs','Amiri',serif", fontSize: 'clamp(2.2rem,5.5vw,3.2rem)', lineHeight: 1, color: '#0c4a6e' }}>
        {applyLetterForm(b.letter, lf)}
      </span>
    </div>
  ));

  const renderCollectibles = (cols: Collectible[]) => cols.filter(c => c.active).map(c => (
    <div key={c.id} className="absolute pointer-events-none z-10 ag-collectible"
      style={{ left: `${c.x}%`, top: `${c.y}%` }}>
      <div style={{ position: 'relative' }}>
        <img src={COLLECTIBLE_ICONS[c.type]} alt={c.type} width={46} height={46}
          style={{ display: 'block', filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.6))' }} />
      </div>
    </div>
  ));

  const renderBullets = (buls: Bullet[]) => buls.filter(b => b.active).map(b => (
    <div key={b.id}
      ref={isP2 ? undefined : el => { if (el) bulletDomRefs.current.set(b.id, el); else bulletDomRefs.current.delete(b.id); }}
      className="absolute pointer-events-none"
      style={{
        left: `${b.x}%`, top: `${b.y}%`, transform: 'translate(-50%,-50%)',
        width: 14, height: 14, borderRadius: '50%', zIndex: 25,
        background: b.owner === 1 ? '#3b82f6' : '#f97316',
        boxShadow: b.owner === 1 ? '0 0 10px #93c5fd, 0 0 4px #60a5fa' : '0 0 10px #fdba74, 0 0 4px #fb923c',
      }} />
  ));

  const renderMines = (ms: Mine[]) => ms.filter(m => m.active).map(m => (
    <div key={m.id} className="absolute pointer-events-none z-10 ag-mine"
      style={{ left: `${m.x}%`, top: `${m.y}%` }}>
      <img src={COLLECTIBLE_ICONS.dynamite} alt="mine" width={38} height={38}
        style={{ display: 'block', filter: 'drop-shadow(0 2px 8px rgba(220,38,38,0.7))' }} />
    </div>
  ));

  // ─────────────────────────────────────────────────────────────────────────
  // P2 CLIENT VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (isP2) {
    const snap = p2Snapshot;
    const snapLF    = snap?.letterForm ?? 'isolated';
    const s1 = score, s2 = p2Score, f1 = fuel, f2 = p2Fuel;
    const p1PlaneUrl = snap ? PLANES[snap.p1Plane]?.url ?? PLANES[0].url : PLANES[0].url;
    const p2PlaneUrl = snap ? PLANES[snap.p2Plane]?.url ?? PLANES[1].url : PLANES[p2Plane].url;

    return (
      <div className="select-none" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#1a6fc4', touchAction: 'none' }}>
        {/* Background */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, overflow: 'hidden' }}>
          <div ref={bgStripRef} style={{ display: 'flex', height: '100%', willChange: 'transform' }}>
            {[0,1,2,3].map(i => <img key={i} src="/sprites/airplane-bg.png" alt="" style={{ height: '100%', width: 'auto', display: 'block', flexShrink: 0 }} onLoad={i === 0 ? (e) => { bgImgWidthRef.current = (e.target as HTMLImageElement).offsetWidth; } : undefined} />)}
          </div>
        </div>

        {/* Join screen */}
        {!p2Waiting && status === 'start' && overlay(
          <>
            <div className="inline-block px-3 py-1 rounded-full text-xs font-extrabold text-white mb-3" style={{ background: '#f97316' }}>Letter Flight — Player 2</div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Choose your vehicle</p>
            <VehiclePicker selected={p2Plane} onSelect={setP2Plane} accentColor="#f97316" />
            <div className="flex justify-center my-3"><JetPlane src={PLANES[p2Plane].url} /></div>
            <p className="text-xs font-bold text-orange-500 mb-4">⬆️⬇️⬅️➡️ or W A S D · Space = fire powerup</p>
            <div className="flex gap-2 justify-center">
              <button onClick={joinOnlineGame} className="px-7 py-2.5 rounded-full text-white font-extrabold text-lg shadow-md active:scale-95 transition-all" style={{ background: '#f97316' }}>Join Game 🚀</button>
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Back</button>
            </div>
          </>
        )}

        {/* Waiting */}
        {p2Waiting && status === 'start' && overlay(
          <>
            <div className="text-4xl mb-4">✈️</div>
            <h3 className="text-lg font-extrabold text-sky-700 mb-2">Joined! Waiting for teacher…</h3>
            <div className="w-8 h-8 rounded-full border-4 border-sky-400 border-t-transparent animate-spin mx-auto mb-4" />
            <button onClick={() => { channelRef.current?.unsubscribe(); channelRef.current = null; setP2Waiting(false); }} className="mt-2 px-5 py-2 rounded-full bg-white border-2 border-slate-200 text-slate-500 text-sm font-bold active:scale-95 transition-all">Cancel</button>
          </>
        )}

        {/* HUD */}
        {status === 'playing' && (
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0" style={{ borderColor: '#3b82f6' }}>
              <span className="text-[11px] font-extrabold text-blue-600 whitespace-nowrap">P1 ⛽</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${f1}%`, background: fuelColor(f1) }}/></div>
              <span className="text-[11px] font-extrabold text-blue-700 ml-1">{s1}</span>
            </div>
            {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => { if (snap) playLetterAudio(snap.targetLetter); }} className="px-2.5 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">🔊</button>
            </div>
            {p2Powerup && <PowerupBadge type={p2Powerup} accentColor="#f97316" />}
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0" style={{ borderColor: '#f97316' }}>
              <span className="text-[11px] font-extrabold text-orange-600 whitespace-nowrap">P2 ⛽</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${f2}%`, background: fuelColor(f2) }}/></div>
              <span className="text-[11px] font-extrabold text-orange-700 ml-1">{s2}</span>
            </div>
          </div>
        )}

        {/* Game elements */}
        {status === 'playing' && renderBubbles(bubbles, snapLF)}
        {status === 'playing' && renderCollectibles(collectibles)}
        {status === 'playing' && renderBullets(bullets)}
        {status === 'playing' && renderMines(mines)}

        {/* P1 shock overlay */}
        {status === 'playing' && p1Shocked && (
          <div className="absolute inset-0 z-5 pointer-events-none ag-shock-overlay" style={{ background: 'rgba(147,197,253,0.35)', zIndex: 5 }}/>
        )}

        {/* P1 plane */}
        {status === 'playing' && snap && (
          <div className="absolute pointer-events-none" style={{ left: `${snap.p1.x}%`, top: `${snap.p1.y}%`, transform: `translate(-50%,-50%) rotate(${snap.p1.tilt}deg)`, zIndex: 20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background: '#3b82f6', whiteSpace: 'nowrap' }}>P1</div>
            {snap.p1.crashed ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div> : <JetPlane src={p1PlaneUrl} shocked={p1Shocked} />}
          </div>
        )}

        {/* P2 plane */}
        {status === 'playing' && snap && (
          <div className="absolute pointer-events-none" style={{ left: `${snap.p2.x}%`, top: `${snap.p2.y}%`, transform: `translate(-50%,-50%) rotate(${snap.p2.tilt}deg)`, zIndex: 20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background: '#f97316', whiteSpace: 'nowrap' }}>YOU</div>
            {snap.p2.crashed ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div> : <JetPlane src={p2PlaneUrl} shocked={p2Shocked} />}
          </div>
        )}

        {/* Touch controls */}
        {status === 'playing' && (
          <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction: 'ltr' }}>
            <div/><button {...holdBtnP2('up')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▲</button><div/>
            <button {...holdBtnP2('left')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">◀</button>
            <button {...holdBtnP2('down')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▼</button>
            <button {...holdBtnP2('right')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▶</button>
          </div>
        )}
        {/* Touch fire button for P2 */}
        {status === 'playing' && p2Powerup && (
          <button className="absolute bottom-16 left-4 z-20 w-16 h-16 rounded-2xl border-3 text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
            style={{ background: '#f97316', borderColor: '#ea580c', border: '3px solid #ea580c' }}
            onPointerDown={e => { e.preventDefault(); channelRef.current?.send({ type: 'broadcast', event: 'fire', payload: {} }); }}>
            💥
          </button>
        )}

        {/* Win/lost overlays */}
        {(status === 'won' || status === 'lost') && snap && (() => {
          const r = twoPlayerResult(s1, s2);
          return overlay(<>
            <div className="text-5xl mb-2">{status === 'won' ? r.emoji : '🪂'}</div>
            <h3 className="text-2xl font-extrabold mb-3" style={{ color: r.color }}>{status === 'won' ? r.msg : 'Both planes crashed!'}</h3>
            <div className="flex gap-3 justify-center mb-5">
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#3b82f6' }}><div className="text-xs font-extrabold text-blue-500 mb-1">Player 1</div><div className="text-3xl font-extrabold text-blue-700">{s1}</div></div>
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#f97316' }}><div className="text-xs font-extrabold text-orange-500 mb-1">You (P2)</div><div className="text-3xl font-extrabold text-orange-600">{s2}</div></div>
            </div>
            <p className="text-xs text-slate-400 mb-3">Waiting for teacher to start a new round…</p>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </>);
        })()}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // P1 / LOCAL VIEW
  // ─────────────────────────────────────────────────────────────────────────
  const currentLetter = queue[queuePos] ?? '';

  return (
    <div className="select-none" style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#1a6fc4', touchAction: 'none' }}>

      {/* Background */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0, overflow: 'hidden' }}>
        <div ref={bgStripRef} style={{ display: 'flex', height: '100%', willChange: 'transform' }}>
          {[0,1,2,3].map(i => <img key={i} src="/sprites/airplane-bg.png" alt="" style={{ height: '100%', width: 'auto', display: 'block', flexShrink: 0 }} onLoad={i === 0 ? (e) => { bgImgWidthRef.current = (e.target as HTMLImageElement).offsetWidth; } : undefined} />)}
        </div>
      </div>

      {/* ── P2 shock overlay (blue flash on P2's half) ── */}
      {status === 'playing' && p2Shocked && (
        <div className="absolute pointer-events-none ag-shock-overlay"
          style={{ right: 0, top: 0, bottom: 0, width: '50%', background: 'rgba(147,197,253,0.3)', zIndex: 5 }}/>
      )}
      {/* ── P1 shock overlay ── */}
      {status === 'playing' && p1Shocked && (
        <div className="absolute pointer-events-none ag-shock-overlay"
          style={{ left: 0, top: 0, bottom: 0, width: '50%', background: 'rgba(147,197,253,0.3)', zIndex: 5 }}/>
      )}

      {/* ── 1P HUD ── */}
      {status === 'playing' && !is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
          <button onClick={onExit} className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">← Exit</button>
          <div className="flex items-center gap-1.5 flex-1 max-w-[200px] bg-white/90 rounded-full px-3 py-1.5 border-2 border-sky-200 shadow">
            <span className="text-sm">⛽</span>
            <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${fuel}%`, background: fuelColor(fuel) }}/></div>
            <span className="text-[11px] font-extrabold text-slate-600 w-7 text-right">{fuel}</span>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-200 text-xs font-extrabold text-indigo-700 shadow whitespace-nowrap">{score} / {queue.length}</div>
          {speedMult >= 1.15 && (
            <div className="px-2.5 py-1.5 rounded-full border-2 text-xs font-extrabold shadow whitespace-nowrap"
              style={{ background: `hsl(${Math.max(0,30-(speedMult-1)*30)}deg,90%,92%)`, borderColor: `hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,55%)`, color: `hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,35%)` }}>
              🔥 {speedMult.toFixed(1)}×
            </div>
          )}
          {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
          <button onClick={() => playLetterAudio(currentLetter)} className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-amber-500 text-white text-base font-bold shadow active:scale-95">🔊</button>
        </div>
      )}

      {/* ── 2P HUD ── */}
      {status === 'playing' && is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-1.5">
          {/* P1 panel */}
          <div className="flex items-center gap-1 bg-white/90 rounded-full px-2 py-1.5 border-2 shadow" style={{ borderColor: '#3b82f6' }}>
            <span className="text-[10px] font-extrabold text-blue-600 whitespace-nowrap">P1⛽</span>
            <div className="w-16 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${fuel}%`, background: fuelColor(fuel) }}/></div>
            <span className="text-[10px] font-extrabold text-blue-700">{score}</span>
          </div>
          {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}

          {/* Centre */}
          <div className="flex gap-1 flex-shrink-0 flex-1 justify-center">
            <button onClick={onExit} className="px-2 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">✕</button>
            {speedMult >= 1.15 && (
              <div className="px-1.5 py-1.5 rounded-full border-2 text-[10px] font-extrabold shadow whitespace-nowrap"
                style={{ background: `hsl(${Math.max(0,30-(speedMult-1)*30)}deg,90%,92%)`, borderColor: `hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,55%)`, color: `hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,35%)` }}>
                🔥{speedMult.toFixed(1)}×
              </div>
            )}
            <button onClick={() => playLetterAudio(currentLetter)} className="px-2 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">🔊</button>
          </div>

          {p2Powerup && <PowerupBadge type={p2Powerup} accentColor="#f97316" />}
          {/* P2 panel */}
          <div className="flex items-center gap-1 bg-white/90 rounded-full px-2 py-1.5 border-2 shadow" style={{ borderColor: '#f97316' }}>
            <span className="text-[10px] font-extrabold text-orange-600 whitespace-nowrap">P2⛽</span>
            <div className="w-16 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width: `${p2Fuel}%`, background: fuelColor(p2Fuel) }}/></div>
            <span className="text-[10px] font-extrabold text-orange-700">{p2Score}</span>
          </div>
        </div>
      )}

      {/* ── Game elements ── */}
      {status === 'playing' && renderBubbles(bubbles, letterForm)}
      {status === 'playing' && renderCollectibles(collectibles)}
      {status === 'playing' && renderBullets(bullets)}
      {status === 'playing' && renderMines(mines)}

      {/* ── Flash ── */}
      {flash && <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: flash === 'good' ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.28)' }}/>}

      {/* ── P1 Airplane ── */}
      {status === 'playing' && (
        <div ref={planeRef} className="absolute pointer-events-none" style={{ left: `${planePos.current.x}%`, top: `${planePos.current.y}%`, transform: 'translate(-50%,-50%)', zIndex: 20 }}>
          {is2p && <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background: '#3b82f6', whiteSpace: 'nowrap' }}>P1</div>}
          {p1CrashedRef.current ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div> : <JetPlane src={PLANES[p1Plane].url} shocked={p1Shocked} />}
        </div>
      )}

      {/* ── P2 Airplane ── */}
      {status === 'playing' && is2p && (
        <div ref={p2PlaneRef} className="absolute pointer-events-none" style={{ left: `${p2Pos.current.x}%`, top: `${p2Pos.current.y}%`, transform: 'translate(-50%,-50%)', zIndex: 20 }}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background: '#f97316', whiteSpace: 'nowrap' }}>P2</div>
          {p2CrashedRef.current ? <div style={{ fontSize: 60, lineHeight: 1 }}>💥</div> : <JetPlane src={PLANES[isOnline ? p2RemotePlane : p2Plane].url} shocked={p2Shocked} />}
        </div>
      )}

      {/* ── Touch controls (1P) ── */}
      {status === 'playing' && !is2p && (
        <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction: 'ltr' }}>
          <div/><button {...holdBtn('ArrowUp')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▲</button><div/>
          <button {...holdBtn('ArrowLeft')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">◀</button>
          <button {...holdBtn('ArrowDown')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▼</button>
          <button {...holdBtn('ArrowRight')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▶</button>
        </div>
      )}
      {/* Touch fire button (1P / P1 online with powerup) */}
      {status === 'playing' && p1Powerup && (!is2p || isOnline) && (
        <button className="absolute bottom-16 left-4 z-20 w-16 h-16 rounded-2xl text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
          style={{ background: '#3b82f6', border: '3px solid #2563eb' }}
          onPointerDown={e => { e.preventDefault(); fireP1Ref.current(); }}>
          💥
        </button>
      )}

      {/* ════════════ OVERLAYS ════════════ */}

      {/* Start screen */}
      {status === 'start' && overlay(
        <>
          <h3 className="text-xl font-extrabold text-sky-700 mb-3">Letter Flight!</h3>
          <div className="flex gap-1.5 justify-center mb-4 flex-wrap">
            {(['1p', '2p', '2p-online'] as const).map(m => (
              <button key={m} onClick={() => { setGameMode(m); if (m !== '2p-online') setOnlineRoomId(null); setP2Joined(false); setLinkCopied(false); }}
                className="px-4 py-1.5 rounded-full border-2 font-extrabold text-xs transition-all"
                style={{ borderColor: gameMode === m ? '#f97316' : '#e2e8f0', background: gameMode === m ? '#fff7ed' : 'white', color: gameMode === m ? '#ea580c' : '#94a3b8', transform: gameMode === m ? 'scale(1.05)' : 'scale(1)' }}>
                {m === '1p' ? '1 Player' : m === '2p' ? '👥 2P Local' : '🌐 2P Online'}
              </button>
            ))}
          </div>
          <p className="text-xs font-semibold text-slate-400 mb-3">
            {gameMode === '2p-online' ? 'Player 1 — choose your vehicle' : is2p ? 'Player 1 — choose your vehicle' : 'Choose your vehicle'}
          </p>
          <VehiclePicker selected={p1Plane} onSelect={setP1Plane} accentColor="#3b82f6" />
          <div className="flex justify-center my-3"><JetPlane src={PLANES[p1Plane].url} /></div>

          {/* Online share box */}
          {gameMode === '2p-online' && onlineRoomId && (
            <div className="mb-3 text-left">
              <p className="text-[11px] font-bold text-slate-500 mb-1">Share this link with Player 2:</p>
              <div className="flex gap-1.5 items-center">
                <div className="flex-1 bg-slate-100 rounded-lg px-2 py-1.5 text-[10px] text-slate-500 font-mono truncate border border-slate-200">{shareLink}</div>
                <button onClick={copyLink} className="px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition-all active:scale-95 flex-shrink-0" style={{ background: linkCopied ? '#22c55e' : '#3b82f6', color: 'white' }}>{linkCopied ? '✓ Copied' : 'Copy'}</button>
              </div>
              {p2Joined
                ? <p className="text-[11px] font-extrabold text-green-600 mt-1.5">✅ Player 2 joined! Ready to take off.</p>
                : <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"/>Waiting for Player 2…</p>}
            </div>
          )}

          <p className="text-xs font-bold text-indigo-500 mb-4">
            {gameMode === '2p-online' ? '⬆️⬇️⬅️➡️ You · Space = fire · P2 uses their device'
              : is2p ? '⬆️⬇️⬅️➡️ P1 · WASD P2 · M=P1 fire · G=P2 fire'
              : '⬆️⬇️⬅️➡️ to fly · Space = fire powerup · ⛽ Don\'t run out!'}
          </p>

          <div className="flex gap-2 justify-center">
            {is2p && gameMode !== '2p-online' ? (
              <button onClick={() => setStatus('select_p2')} className="px-7 py-2.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-lg shadow-md active:scale-95 transition-all">Next → P2</button>
            ) : gameMode === '2p-online' ? (
              <button onClick={startGame} disabled={!p2Joined} className="px-7 py-2.5 rounded-full text-white font-extrabold text-lg shadow-md active:scale-95 transition-all disabled:opacity-40" style={{ background: p2Joined ? '#f97316' : '#94a3b8' }}>Take off! 🚀</button>
            ) : (
              <button onClick={startGame} className="px-7 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold text-lg shadow-md active:scale-95 transition-all">Take off! 🚀</button>
            )}
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Back</button>
          </div>
        </>
      )}

      {/* P2 vehicle select (local) */}
      {status === 'select_p2' && overlay(
        <>
          <div className="inline-block px-3 py-1 rounded-full text-xs font-extrabold text-white mb-3" style={{ background: '#f97316' }}>Player 2</div>
          <p className="text-xs font-semibold text-slate-400 mb-3">Choose your vehicle</p>
          <VehiclePicker selected={p2Plane} onSelect={setP2Plane} accentColor="#f97316" />
          <div className="flex justify-center my-3"><JetPlane src={PLANES[p2Plane].url} /></div>
          <p className="text-xs font-bold text-orange-500 mb-4">W A S D to fly · G to fire</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-7 py-2.5 rounded-full text-white font-extrabold text-lg shadow-md active:scale-95 transition-all" style={{ background: '#f97316' }}>Take off! 🚀</button>
            <button onClick={() => setStatus('start')} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">← Back</button>
          </div>
        </>
      )}

      {/* Win */}
      {status === 'won' && overlay(
        is2p ? (() => {
          const r = twoPlayerResult(score, p2Score);
          return (<>
            <div className="text-5xl mb-2">{r.emoji}</div>
            <h3 className="text-2xl font-extrabold mb-3" style={{ color: r.color }}>{r.msg}</h3>
            <div className="flex gap-3 justify-center mb-5">
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#3b82f6' }}><div className="text-xs font-extrabold text-blue-500 mb-1">Player 1</div><div className="text-3xl font-extrabold text-blue-700">{score}</div></div>
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#f97316' }}><div className="text-xs font-extrabold text-orange-500 mb-1">Player 2</div><div className="text-3xl font-extrabold text-orange-600">{p2Score}</div></div>
            </div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setStatus('start'); if (isOnline) setP2Joined(false); }} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
            </div>
          </>);
        })() : (<>
          <div className="text-6xl mb-3">🏆</div>
          <h3 className="text-3xl font-extrabold text-pink-500 mb-2">You Win!</h3>
          <p className="text-sm font-bold text-blue-600 mb-5">You found all {queue.length} letters! Amazing flying! ✈️🌟</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </div>
        </>)
      )}

      {/* Lost */}
      {status === 'lost' && overlay(
        is2p ? (() => {
          const r = twoPlayerResult(score, p2Score);
          return (<>
            <div className="text-4xl mb-2">🪂</div>
            <h3 className="text-xl font-extrabold text-slate-600 mb-1">Both planes crashed!</h3>
            <h4 className="text-lg font-extrabold mb-3" style={{ color: r.color }}>{r.msg}</h4>
            <div className="flex gap-3 justify-center mb-5">
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#3b82f6' }}><div className="text-xs font-extrabold text-blue-500 mb-1">Player 1</div><div className="text-3xl font-extrabold text-blue-700">{score}</div></div>
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor: '#f97316' }}><div className="text-xs font-extrabold text-orange-500 mb-1">Player 2</div><div className="text-3xl font-extrabold text-orange-600">{p2Score}</div></div>
            </div>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setStatus('start'); if (isOnline) setP2Joined(false); }} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
            </div>
          </>);
        })() : (<>
          <div className="text-6xl mb-3">🪂</div>
          <h3 className="text-3xl font-extrabold text-slate-600 mb-2">Game Over</h3>
          <p className="text-sm font-bold text-slate-500 mb-5">Out of fuel! You found {score} / {queue.length} letters. Try again!</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </div>
        </>)
      )}
    </div>
  );
};

export default AirplaneGame;
