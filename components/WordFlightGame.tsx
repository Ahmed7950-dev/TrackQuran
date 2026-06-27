import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import lottie from 'lottie-web';
import { supabase } from '../lib/supabase';
import { safeCopy } from '../utils';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'dotlottie-wc': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string; autoplay?: boolean | string; loop?: boolean | string;
      };
    }
  }
}
const isLottie = (url: string) => url.endsWith('.lottie') || url.endsWith('.json');

const LottieAnim: React.FC<{ src: string; width: number; height: number; style?: React.CSSProperties }> = ({ src, width, height, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let anim: any;
    let cancelled = false;
    fetch(src).then(r => r.json()).then(data => {
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({ container: ref.current, animationData: data, renderer: 'svg', loop: true, autoplay: true });
    });
    return () => { cancelled = true; anim?.destroy(); };
  }, [src]);
  return <div ref={ref} style={{ width, height, overflow: 'hidden', ...style }} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Word Flight — same physics as Letter Flight but players fly toward Arabic
// word bubbles whose English meaning is announced aloud.
// P1 controls: Arrow keys  |  P2 local: W A S D  |  P2 online: Arrow/WASD
// ─────────────────────────────────────────────────────────────────────────────

export interface WordPair { arabic: string; meaning: string; }

type GameMode        = '1p' | '2p' | '2p-online';
type GameStatus      = 'start' | 'select_p2' | 'playing' | 'won' | 'lost';
type CollectibleType = 'heart' | 'weapon' | 'dynamite' | 'lightning';

type WBubble = {
  id: string; arabic: string;
  x: number; y: number; vx: number;
  isCorrect: boolean; popped: boolean; driftDelay: number;
};

interface Collectible { id: string; type: CollectibleType; x: number; y: number; active: boolean; expiresAt: number; }
interface Bullet      { id: string; owner: 1|2; x: number; y: number; vx: number; vy: number; active: boolean; }
interface Mine        { id: string; owner: 1|2; x: number; y: number; active: boolean; }

interface WP2Snapshot {
  p1: { x: number; y: number; tilt: number; crashed: boolean };
  p2: { x: number; y: number; tilt: number; crashed: boolean };
  fuels: [number, number]; scores: [number, number];
  bubbles: WBubble[]; status: GameStatus;
  queueLen: number; queuePos: number;
  targetArabic: string; targetMeaning: string;
  p1Plane: number; p2Plane: number;
  collectibles: Collectible[]; bullets: Bullet[]; mines: Mine[];
  p1Powerup: CollectibleType|null; p2Powerup: CollectibleType|null;
  p1Shocked: boolean; p2Shocked: boolean;
  p1Name?: string; p2Name?: string;
  p1Speed?: number; p2Speed?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const START_FUEL            = 100;
const FUEL_GAIN             = 10;
const FUEL_LOSS             = 20;
const BUBBLE_RADIUS         = 9;
const PLANE_HIT_RADIUS      = 6.0;  // default hit radius (% screen units); override per-aircraft via hitRadius
const BUBBLE_SPEED          = 0.14;
const BUBBLE_SPEED_MAX_MULT = 2.4;
const PLANE_ACCEL           = 0.015;
const PLANE_MAX_VEL         = 0.40;
const PLANE_ACCEL_H         = 0.009;
const PLANE_MAX_VEL_H       = 0.317;
const PLANE_DRAG            = 0.975;
const PLANE_GRAVITY         = 0.003;
const BG_SCROLL_SPEED       = 120;
const BACKGROUNDS = [
  '/sprites/airplane-bg.png',
  '/sprites/bg-forest.png',
  '/sprites/bg-aurora.png',
  '/sprites/bg-moai.png',
  '/sprites/bg-field.png',
];
const ONLINE_SITE_URL       = 'https://www.lisanquran.com';
const BULLET_SPEED          = 2.0;
const BULLET_DAMAGE         = 3;
const MINE_DAMAGE           = 28;
const COLLECTIBLE_RADIUS    = 9;
const BULLET_HIT_RADIUS     = 7;
const MINE_TRIGGER_RADIUS   = 7;
const WEAPON_DURATION       = 5000;
const SHOCK_DURATION        = 5000;
const COLLECTIBLE_LIFETIME  = 13000;
const COLLECTIBLE_SPAWN_RATE = 0.3;

const COLLECTIBLE_ICONS: Record<CollectibleType, string> = {
  heart:     'https://img.icons8.com/retro/32/like.png',
  weapon:    'https://img.icons8.com/color-glass/48/submachine-gun.png',
  dynamite:  'https://img.icons8.com/color/48/dynamite.png',
  lightning: 'https://img.icons8.com/dusk/64/the-flash-sign.png',
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

function makeWordBubbles(correct: WordPair, allWords: WordPair[], count = 3, avoidY: number[] = [], speedMult = 1): WBubble[] {
  const actualCount = Math.min(count, allWords.length);
  const wrong = shuffle(allWords.filter(w => w.arabic !== correct.arabic)).slice(0, actualCount - 1);
  const items  = shuffle([correct, ...wrong]);
  const free   = ALL_Y_SLOTS.filter(y => avoidY.every(ay => Math.abs(ay - y) >= MIN_Y_GAP));
  const pool   = free.length >= actualCount ? free : ALL_Y_SLOTS;
  const ySlots = shuffle(pool).slice(0, actualCount);
  return items.map((w, i) => ({
    id: `${Date.now()}-${i}`, arabic: w.arabic,
    x: 112 + i * 28,
    y: ySlots[i],
    vx: -((BUBBLE_SPEED + Math.random() * 0.05) * speedMult),
    isCorrect: w.arabic === correct.arabic,
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
const playSuccess     = () => playTone([523, 659, 784], 0.12);
const playWrong       = () => playTone([220, 165], 0.18, 'square');
const playMineExplode = () => playTone([120, 90, 150, 70], 0.22, 'sawtooth');

const PICKUP_SOUNDS: Record<CollectibleType, () => void> = {
  heart:     () => playTone([523, 784, 1047], 0.1),
  weapon:    () => playTone([440, 330, 550], 0.1, 'square'),
  dynamite:  () => playTone([200, 150, 250], 0.12, 'triangle'),
  lightning: () => playTone([880, 1320, 1760], 0.07),
};

// ── Vehicle options ───────────────────────────────────────────────────────────
const PLANES: { label: string; url: string; flip?: boolean; rotate?: number; hitRadius?: number }[] = [
  { label: 'Heli Animated', url: '/sprites/helicopter.json',          hitRadius: 5.5 },
  { label: 'Biplane',       url: '/sprites/plane1.json',              hitRadius: 6.5 },
  { label: 'Airplane',      url: '/sprites/plane2.json',              hitRadius: 6.5 },
  { label: 'Fighter',       url: '/sprites/plane3.json',  flip: true, hitRadius: 5.5 },
  { label: 'Plane 22',      url: '/sprites/plane4.json',              hitRadius: 6.0 },
  { label: 'Rocket',        url: '/sprites/rocket.json',  rotate: 45, hitRadius: 4.5 },
  { label: 'Helicopter 2',  url: '/sprites/helicopter2.json',         hitRadius: 5.0 },
  { label: 'Paper Plane',   url: '/sprites/paperplane.json',          hitRadius: 5.5 },
  { label: 'Dragon',        url: '/sprites/dragon1.json', flip: true, hitRadius: 5.5 },
  { label: 'Dragon 2',      url: '/sprites/dragon2.json', flip: true, hitRadius: 6.0 },
  { label: 'Airship',       url: '/sprites/airship.json',              hitRadius: 6.0 },
  { label: 'UFO',           url: '/sprites/ufo.json',                  hitRadius: 5.5 },
];
const isFlipped  = (url: string) => PLANES.find(p => p.url === url)?.flip   ?? false;
const getRotate  = (url: string) => PLANES.find(p => p.url === url)?.rotate ?? 0;
const planeTransform = (url: string) => {
  const parts: string[] = [];
  if (isFlipped(url)) parts.push('scaleX(-1)');
  if (getRotate(url)) parts.push(`rotate(${getRotate(url)}deg)`);
  return parts.length ? parts.join(' ') : undefined;
};

const JetPlane: React.FC<{ src: string; shocked?: boolean; flameRef?: React.MutableRefObject<HTMLDivElement | null> }> = ({ src, shocked }) => {
  const tf = planeTransform(src);
  return (
    <div style={{ position: 'relative', display: 'inline-block', width: 90, height: 90 }}>
      {isLottie(src) ? (
        <LottieAnim src={src} width={90} height={90}
          style={{ display: 'block', position: 'relative', zIndex: 1,
            transform: tf,
            filter: shocked ? 'brightness(0.8) saturate(0.5)' : undefined }} />
      ) : (
        <img src={src} alt="vehicle" width={90} height={90} style={{
          display: 'block', position: 'relative', zIndex: 1,
          transform: tf,
          filter: shocked
            ? 'drop-shadow(0 0 12px #60a5fa) drop-shadow(0 0 6px #93c5fd) brightness(0.8) saturate(0.5)'
            : 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
        }} />
      )}
      {shocked && (
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', zIndex: 5, pointerEvents: 'none' }}>
          <LottieAnim src="/sprites/electric-power.json" width={80} height={80} />
        </div>
      )}
    </div>
  );
};

const Joystick: React.FC<{
  onKeys: (k: { up: boolean; down: boolean; left: boolean; right: boolean }) => void;
  accentColor?: string;
}> = ({ onKeys, accentColor = '#3b82f6' }) => {
  const baseRef = React.useRef<HTMLDivElement>(null);
  const knobRef = React.useRef<HTMLDivElement>(null);
  const ptrId = React.useRef<number | null>(null);
  const centerRef = React.useRef({ x: 0, y: 0 });
  const BASE_R = 60, KNOB_R = 26, MAX = BASE_R - KNOB_R, DEAD = 0.12;

  const move = (cx: number, cy: number) => {
    const kn = knobRef.current;
    if (!kn) return;
    kn.style.transition = 'none';
    const ox = cx - centerRef.current.x, oy = cy - centerRef.current.y;
    const d = Math.hypot(ox, oy), a = Math.atan2(oy, ox);
    const cd = Math.min(d, MAX);
    kn.style.transform = `translate(calc(-50% + ${cd * Math.cos(a)}px), calc(-50% + ${cd * Math.sin(a)}px))`;
    const nx = ox / MAX, ny = oy / MAX;
    onKeys({ up: ny < -DEAD, down: ny > DEAD, left: nx < -DEAD, right: nx > DEAD });
  };

  const release = () => {
    const kn = knobRef.current;
    if (kn) { kn.style.transition = 'transform 0.15s ease-out'; kn.style.transform = 'translate(-50%, -50%)'; }
    onKeys({ up: false, down: false, left: false, right: false });
    ptrId.current = null;
  };

  return (
    <div ref={baseRef}
      style={{ width: BASE_R * 2, height: BASE_R * 2, borderRadius: '50%',
        background: `${accentColor}22`, border: `2.5px solid ${accentColor}55`,
        position: 'relative', touchAction: 'none', userSelect: 'none', flexShrink: 0 }}
      onPointerDown={e => {
        if (ptrId.current !== null) return;
        ptrId.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        const rc = e.currentTarget.getBoundingClientRect();
        centerRef.current = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
        move(e.clientX, e.clientY);
      }}
      onPointerMove={e => { if (e.pointerId !== ptrId.current) return; e.preventDefault(); move(e.clientX, e.clientY); }}
      onPointerUp={e => { if (e.pointerId === ptrId.current) release(); }}
      onPointerCancel={e => { if (e.pointerId === ptrId.current) release(); }}
    >
      <div ref={knobRef} style={{
        width: KNOB_R * 2, height: KNOB_R * 2, borderRadius: '50%',
        background: accentColor, opacity: 0.82,
        boxShadow: `0 3px 12px ${accentColor}90`,
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)', pointerEvents: 'none',
      }} />
    </div>
  );
};

const FullscreenButton: React.FC = () => {
  const [fs, setFs] = React.useState(false);
  const [hint, setHint] = React.useState(false);
  const el = document.documentElement as any;
  const fsSupported = !!(el.requestFullscreen || el.webkitRequestFullscreen);
  // Already launched as a standalone web app (Add to Home Screen) → no chrome to hide.
  const standalone = (navigator as any).standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

  React.useEffect(() => {
    const handler = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  if (standalone) return null;

  const toggle = () => {
    if (!fsSupported) {
      // iOS Safari: no Fullscreen API. Point the user to Add to Home Screen.
      setHint(true);
      setTimeout(() => setHint(false), 4000);
      return;
    }
    try {
      const d = document as any;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else {
        if (d.exitFullscreen) d.exitFullscreen();
        else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      }
    } catch (_) {}
  };
  return (
    <>
      <button onClick={toggle} style={{
        position: 'absolute', top: '50%', right: 4, zIndex: 60, transform: 'translateY(-50%)',
        width: 34, height: 34, borderRadius: 8,
        background: 'rgba(255,255,255,0.18)', border: '1.5px solid rgba(255,255,255,0.35)',
        color: 'white', fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation',
      }}>
        {fs ? '⊡' : '⛶'}
      </button>
      {hint && (
        <div style={{
          position: 'absolute', top: '50%', right: 44, zIndex: 60, maxWidth: 220, transform: 'translateY(-50%)',
          background: 'rgba(15,23,42,0.92)', color: 'white', fontSize: 12, fontWeight: 600,
          padding: '8px 12px', borderRadius: 10, lineHeight: 1.4, pointerEvents: 'none',
        }}>
          For fullscreen on iPhone: tap <b>Share</b> ⬆️ → <b>Add to Home Screen</b>, then open from that icon.
        </div>
      )}
    </>
  );
};

const VehiclePicker: React.FC<{ selected: number; onSelect: (i: number) => void; accentColor: string }> = ({ selected, onSelect, accentColor }) => (
  <div className="grid grid-cols-4 gap-2 w-full">
    {PLANES.map((p, i) => (
      <button key={i} onClick={() => onSelect(i)}
        className="flex items-center justify-center p-1 rounded-xl border-2 transition-all select-none"
        style={{
          borderColor: selected === i ? accentColor : '#e8edf2',
          background:  selected === i ? `${accentColor}15` : '#f8fafc',
          boxShadow:   selected === i ? `0 0 0 3px ${accentColor}40, 0 4px 14px ${accentColor}25` : '0 1px 3px rgba(0,0,0,0.06)',
          transform:   selected === i ? 'scale(1.08)' : 'scale(1)',
        }}>
        <LottieAnim src={p.url} width={80} height={80} style={{ transform: planeTransform(p.url) }} />
      </button>
    ))}
  </div>
);

const PowerupBadge: React.FC<{ type: CollectibleType; accentColor: string }> = ({ type, accentColor }) => (
  <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl border-2 shadow-sm"
    style={{ background: `${accentColor}15`, borderColor: accentColor }}>
    {type === 'dynamite'
      ? <LottieAnim src="/sprites/bomb.json" width={22} height={22} />
      : <img src={COLLECTIBLE_ICONS[type]} alt={type} width={22} height={22} />}
    {type === 'weapon' && (
      <div className="w-full h-1 rounded-full bg-slate-200 overflow-hidden" style={{ minWidth: 36 }}>
        <div className="h-full rounded-full" style={{ background: accentColor, animation: `wf-weapon-bar ${WEAPON_DURATION / 1000}s linear forwards` }} />
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

interface WordFlightGameProps {
  words: WordPair[];
  onExit: () => void;
  roomId?: string;
  playerRole?: '1' | '2';
}

const WordFlightGame: React.FC<WordFlightGameProps> = ({ words, onExit, roomId: propRoomId, playerRole }) => {
  const isP2 = playerRole === '2';

  const [bgImage] = useState(() => BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]);
  const [status, setStatus]       = useState<GameStatus>('start');
  const [gameMode, setGameMode]   = useState<GameMode>('1p');
  const [p1Plane, setP1Plane]     = useState(0);
  const [p2Plane, setP2Plane]     = useState(1);
  const [fuel, setFuel]           = useState(START_FUEL);
  const [p2Fuel, setP2Fuel]       = useState(START_FUEL);
  const [score, setScore]         = useState(0);
  const [p2Score, setP2Score]     = useState(0);
  const [queue, setQueue]         = useState<WordPair[]>([]);
  const [queuePos, setQueuePos]   = useState(0);
  const [bubbles, setBubbles]     = useState<WBubble[]>([]);
  const [flash, setFlash]         = useState<'good'|'bad'|null>(null);
  const [speedMult, setSpeedMult] = useState(1);

  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [p1Powerup, setP1Powerup]       = useState<CollectibleType|null>(null);
  const [p2Powerup, setP2Powerup]       = useState<CollectibleType|null>(null);
  const [bullets, setBullets]           = useState<Bullet[]>([]);
  const [mines, setMines]               = useState<Mine[]>([]);
  const [mineExplosions, setMineExplosions] = useState<{id:string;x:number;y:number}[]>([]);
  const [p1Shocked, setP1Shocked]       = useState(false);
  const [p2Shocked, setP2Shocked]       = useState(false);

  const [p1Name, setP1Name]             = useState('Player 1');
  const [p2Name, setP2Name]             = useState('Player 2');
  const [p1NameReceived, setP1NameReceived] = useState('Player 1');

  const [p1Glow, setP1Glow] = useState<'hit'|'collectible'|'mine'|null>(null);
  const [p2Glow, setP2Glow] = useState<'hit'|'collectible'|'mine'|null>(null);
  const [p1BarEmphasis, setP1BarEmphasis] = useState(false);
  const [p2BarEmphasis, setP2BarEmphasis] = useState(false);
  const [p1HitPopup, setP1HitPopup] = useState<{x:number;y:number}|null>(null);
  const [p2HitPopup, setP2HitPopup] = useState<{x:number;y:number}|null>(null);

  const [onlineRoomId, setOnlineRoomId]     = useState<string|null>(null);
  const [p2Joined, setP2Joined]             = useState(false);
  const [p2RemotePlane, setP2RemotePlane]   = useState(1);
  const [linkCopied, setLinkCopied]         = useState(false);
  const [qrOpen, setQrOpen]                 = useState(false);
  const [p2Waiting, setP2Waiting]           = useState(false);
  const [p1CrashedRemote, setP1CrashedRemote] = useState(false);
  const [p2CrashedRemote, setP2CrashedRemote] = useState(false);
  const [p1CrashAnim, setP1CrashAnim] = useState<'explosion'|'parachute'|null>(null);
  const [p2CrashAnim, setP2CrashAnim] = useState<'explosion'|'parachute'|null>(null);
  const [p1Down, setP1Down] = useState(false);
  const [p2Down, setP2Down] = useState(false);
  const p1CrashPosRef = useRef({ x: 14, y: 32 });
  const p2CrashPosRef = useRef({ x: 14, y: 68 });
  const [p1RemoteCrashAnim, setP1RemoteCrashAnim] = useState<'explosion'|'parachute'|null>(null);
  const [p2RemoteCrashAnim, setP2RemoteCrashAnim] = useState<'explosion'|'parachute'|null>(null);
  const p1RemoteCrashPos = useRef({ x: 14, y: 32 });
  const p2RemoteCrashPos = useRef({ x: 14, y: 68 });

  // ── Physics refs ──────────────────────────────────────────────────────────
  const planeRef   = useRef<HTMLDivElement>(null);
  const planePos   = useRef({ x: 14, y: 32 });
  const velRef     = useRef({ x: 0, y: 0 });
  const tiltRef    = useRef(0);
  const p2PlaneRef = useRef<HTMLDivElement>(null);
  const p2Pos      = useRef({ x: 14, y: 68 });
  const p2Vel      = useRef({ x: 0, y: 0 });
  const p2Tilt     = useRef(0);

  const keysDown      = useRef<Record<string,boolean>>({});
  const rafRef        = useRef<number>(0);
  const bubblesRef    = useRef<WBubble[]>([]);
  const bubbleDomRefs = useRef<Map<string,HTMLDivElement>>(new Map());
  const collidingRef  = useRef(false);
  const p2ColRef      = useRef(false);
  const queuePosRef   = useRef(0);
  const gameModeRef   = useRef<GameMode>('1p');
  const p1CrashedRef  = useRef(false);
  const p2CrashedRef  = useRef(false);
  const targetArabicRef = useRef('');
  const speedMultRef  = useRef(1);
  const bgDivRef    = useRef<HTMLDivElement>(null);
  const bgOffsetRef = useRef(0);
  const collectiblesRef = useRef<Collectible[]>([]);
  const bulletsRef      = useRef<Bullet[]>([]);
  const minesRef        = useRef<Mine[]>([]);
  const bulletDomRefs   = useRef<Map<string,HTMLDivElement>>(new Map());
  const p1PowerupRef    = useRef<CollectibleType|null>(null);
  const p2PowerupRef    = useRef<CollectibleType|null>(null);
  const p1ShockedUntilRef = useRef(0);
  const p2ShockedUntilRef = useRef(0);
  const p1WeaponUntilRef  = useRef(0);
  const p2WeaponUntilRef  = useRef(0);
  const p1FireCooldownRef = useRef(0);
  const p2FireCooldownRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef        = useRef<any>(null);
  const p2RemoteKeysRef   = useRef<{up:boolean;down:boolean;left:boolean;right:boolean}>({ up:false,down:false,left:false,right:false });
  const fuelRef           = useRef(START_FUEL);
  const p2FuelRef         = useRef(START_FUEL);
  const scoreRef          = useRef(0);
  const p2ScoreRef        = useRef(0);
  const p2SnapshotWordRef = useRef('');
  const latestSnapRef     = useRef<WP2Snapshot|null>(null);
  // Client-side prediction (P2 view): P2 simulates its OWN plane locally at 60fps
  // for instant control, gently reconciling to the host's snapshots; P1's plane is
  // interpolated toward the latest snapshot for smooth motion. p2Pos/p2Vel/p2Tilt
  // (host-only refs on P1) are reused here as P2's predicted own-plane state.
  const p2RenderP1Ref     = useRef({ x: 86, y: 50, tilt: 0 });
  const p2PredInitedRef   = useRef(false);
  const p2BubbleRenderRef = useRef<Map<string, number>>(new Map()); // smoothed bubble x for P2
  const p2ViewP1PlaneRef  = useRef<HTMLDivElement>(null);
  const p2ViewP2PlaneRef  = useRef<HTMLDivElement>(null);
  const p2FuelBar1Ref     = useRef<HTMLDivElement>(null);
  const p2FuelBar2Ref     = useRef<HTMLDivElement>(null);
  const p2Score1SpanRef   = useRef<HTMLSpanElement>(null);
  const p2Score2SpanRef   = useRef<HTMLSpanElement>(null);
  const p2BubbleSetRef    = useRef<string>('');
  const p2BulletSetRef    = useRef<string>('');
  const p2BulletDomRefs   = useRef<Map<string,HTMLDivElement>>(new Map());
  const p2HudP1NameRef    = useRef<HTMLSpanElement>(null);
  const p2HudP2NameRef    = useRef<HTMLSpanElement>(null);
  const p1FlameRef        = useRef<HTMLDivElement|null>(null);
  const p2FlameRef        = useRef<HTMLDivElement|null>(null);
  const p2ViewP1FlameRef  = useRef<HTMLDivElement|null>(null);
  const p2ViewP2FlameRef  = useRef<HTMLDivElement|null>(null);

  bubblesRef.current      = bubbles;
  collectiblesRef.current = collectibles;
  bulletsRef.current      = bullets;
  minesRef.current        = mines;

  const is2p     = gameMode === '2p' || gameMode === '2p-online';
  const isOnline = gameMode === '2p-online';

  useEffect(() => { fuelRef.current    = fuel;    }, [fuel]);
  useEffect(() => { p2FuelRef.current  = p2Fuel;  }, [p2Fuel]);
  useEffect(() => { scoreRef.current   = score;   }, [score]);
  useEffect(() => { p2ScoreRef.current = p2Score; }, [p2Score]);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  useEffect(() => {
    let lastTime = performance.now(); let raf: number;
    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;
      bgOffsetRef.current -= BG_SCROLL_SPEED * dt;
      if (bgDivRef.current) bgDivRef.current.style.backgroundPositionX = `${bgOffsetRef.current}px`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const id = 'wf-styles-v1';
    if (document.getElementById(id)) return;
    const s = document.createElement('style'); s.id = id;
    s.textContent = `
      @keyframes wf-float { 0%,100%{transform:translate(-50%,-50%) translateY(-6px);}50%{transform:translate(-50%,-50%) translateY(6px);} }
      @keyframes wf-pop   { 0%{transform:translate(-50%,-50%) scale(1);opacity:1;}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0;} }
      @keyframes wf-collectible { 0%,100%{transform:translate(-50%,-50%) translateY(-5px) scale(1);}50%{transform:translate(-50%,-50%) translateY(5px) scale(1.06);} }
      @keyframes wf-mine-pulse  { 0%,100%{transform:translate(-50%,-50%) scale(1);}50%{transform:translate(-50%,-50%) scale(1.15);} }
      @keyframes wf-shock-flash { 0%,100%{opacity:0.25;}50%{opacity:0.55;} }
      @keyframes wf-weapon-bar  { from{transform:scaleX(1);}to{transform:scaleX(0);} }
      @keyframes wf-glow-hit        { 0%{transform:translate(-50%,-50%) scale(0.4);opacity:0.9;}100%{transform:translate(-50%,-50%) scale(2.8);opacity:0;} }
      @keyframes wf-glow-collectible{ 0%{transform:translate(-50%,-50%) scale(0.4);opacity:0.9;}100%{transform:translate(-50%,-50%) scale(2.8);opacity:0;} }
      @keyframes wf-glow-mine       { 0%,20%{transform:translate(-50%,-50%) scale(0.4);opacity:1;}100%{transform:translate(-50%,-50%) scale(3.0);opacity:0;} }
      @keyframes wf-score-pop { 0%{transform:translate(-50%,-100%) translateY(0);opacity:1;}100%{transform:translate(-50%,-100%) translateY(-32px);opacity:0;} }
      @keyframes wf-parachute-fall {
        0%   { transform: translate(-50%,-50%) translateY(0)      translateX(0px); }
        12%  { transform: translate(-50%,-50%) translateY(18vh)   translateX(-28px); }
        25%  { transform: translate(-50%,-50%) translateY(38vh)   translateX(28px); }
        37%  { transform: translate(-50%,-50%) translateY(58vh)   translateX(-28px); }
        50%  { transform: translate(-50%,-50%) translateY(80vh)   translateX(28px); }
        62%  { transform: translate(-50%,-50%) translateY(100vh)  translateX(-28px); }
        75%  { transform: translate(-50%,-50%) translateY(120vh)  translateX(28px); }
        87%  { transform: translate(-50%,-50%) translateY(142vh)  translateX(-20px); }
        100% { transform: translate(-50%,-50%) translateY(160vh)  translateX(0px); }
      }
      .wf-bubble      { animation: wf-float         3.2s ease-in-out infinite; }
      .wf-popped      { animation: wf-pop           .45s ease-out    forwards; }
      .wf-collectible { animation: wf-collectible   2.4s ease-in-out infinite; }
      .wf-mine        { animation: wf-mine-pulse     1.4s ease-in-out infinite; }
      .wf-shock-overlay{ animation: wf-shock-flash  .25s ease-in-out infinite; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // ── Audio: speak English meaning via Web Speech API ───────────────────────
  const speakMeaning = useCallback((meaning: string) => {
    if (!meaning) return;
    window.speechSynthesis?.cancel();
    const utt = new SpeechSynthesisUtterance(meaning);
    utt.lang = 'en-US'; utt.rate = 0.88;
    window.speechSynthesis?.speak(utt);
  }, []);

  const triggerGlow = useCallback((player: 1|2, type: 'hit'|'collectible'|'mine') => {
    const dur = type === 'mine' ? 900 : 700;
    if (player === 1) { setP1Glow(type); setTimeout(() => setP1Glow(g => g === type ? null : g), dur); }
    else              { setP2Glow(type); setTimeout(() => setP2Glow(g => g === type ? null : g), dur); }
  }, []);

  const applyCollectible = useCallback((type: CollectibleType, player: 1|2) => {
    PICKUP_SOUNDS[type](); triggerGlow(player, 'collectible');
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
    if (player === 2 && gameModeRef.current === '2p-online') {
      channelRef.current?.send({ type: 'broadcast', event: 'p2-event', payload: { kind: 'collectible', colType: type } });
    }
  }, [triggerGlow]);
  const applyCollectibleRef = useRef(applyCollectible);
  useEffect(() => { applyCollectibleRef.current = applyCollectible; }, [applyCollectible]);

  const fireP1 = useCallback(() => {
    const powerup = p1PowerupRef.current; if (!powerup) return;
    const now = Date.now(); if (now < p1FireCooldownRef.current) return;
    p1FireCooldownRef.current = now + 120;
    const is2pNow = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
    if (powerup === 'weapon') {
      if (!is2pNow || now > p1WeaponUntilRef.current) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      // Fire straight ahead, out the front of the plane. Player chases the target to aim.
      const s = planePos.current;
      setBullets(prev => [...prev, { id:`b1-${now}`, owner:1 as const, x:s.x+2, y:s.y, vx:BULLET_SPEED, vy:0, active:true }]);
    } else if (powerup === 'dynamite') {
      if (!is2pNow) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      setMines(prev => [...prev, { id:`m1-${now}`, owner:1 as const, x:planePos.current.x, y:planePos.current.y, active:true }]);
      p1PowerupRef.current = null; setP1Powerup(null);
    } else if (powerup === 'lightning') {
      if (!is2pNow) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      p2ShockedUntilRef.current = now + SHOCK_DURATION; setP2Shocked(true);
      setTimeout(() => { if (Date.now() >= p2ShockedUntilRef.current) setP2Shocked(false); }, SHOCK_DURATION+100);
      p1PowerupRef.current = null; setP1Powerup(null);
    }
  }, []);
  const fireP1Ref = useRef(fireP1);
  useEffect(() => { fireP1Ref.current = fireP1; }, [fireP1]);

  const fireP2 = useCallback(() => {
    const powerup = p2PowerupRef.current; if (!powerup) return;
    const now = Date.now(); if (now < p2FireCooldownRef.current) return;
    p2FireCooldownRef.current = now + 120;
    if (powerup === 'weapon') {
      if (now > p2WeaponUntilRef.current) { p2PowerupRef.current = null; setP2Powerup(null); return; }
      // Fire straight ahead, out the front of the plane. Player chases the target to aim.
      const s = p2Pos.current;
      setBullets(prev => [...prev, { id:`b2-${now}`, owner:2 as const, x:s.x+2, y:s.y, vx:BULLET_SPEED, vy:0, active:true }]);
    } else if (powerup === 'dynamite') {
      setMines(prev => [...prev, { id:`m2-${now}`, owner:2 as const, x:p2Pos.current.x, y:p2Pos.current.y, active:true }]);
      p2PowerupRef.current = null; setP2Powerup(null);
    } else if (powerup === 'lightning') {
      p1ShockedUntilRef.current = now + SHOCK_DURATION; setP1Shocked(true);
      setTimeout(() => { if (Date.now() >= p1ShockedUntilRef.current) setP1Shocked(false); }, SHOCK_DURATION+100);
      p2PowerupRef.current = null; setP2Powerup(null);
    }
  }, []);
  const fireP2Ref = useRef(fireP2);
  useEffect(() => { fireP2Ref.current = fireP2; }, [fireP2]);

  const startRound = useCallback((word: WordPair) => {
    targetArabicRef.current = word.arabic;
    setBubbles(makeWordBubbles(word, words, 3, [], speedMultRef.current));
    collidingRef.current = false; p2ColRef.current = false;
    setTimeout(() => speakMeaning(word.meaning), 350);
  }, [speakMeaning, words]);

  const startGame = useCallback(() => {
    const q = shuffle(words);
    setQueue(q); setQueuePos(0); queuePosRef.current = 0;
    setFuel(START_FUEL); setScore(0); setP2Fuel(START_FUEL); setP2Score(0);
    fuelRef.current = START_FUEL; p2FuelRef.current = START_FUEL;
    scoreRef.current = 0; p2ScoreRef.current = 0;
    speedMultRef.current = 1; setSpeedMult(1);
    planePos.current = { x:14, y:32 }; velRef.current = { x:0, y:0 }; tiltRef.current = 0;
    p2Pos.current    = { x:14, y:68 }; p2Vel.current  = { x:0, y:0 }; p2Tilt.current  = 0;
    p1CrashedRef.current = false; p2CrashedRef.current = false;
    setP1Down(false); setP2Down(false);
    setP1CrashAnim(null); setP2CrashAnim(null);
    setP1RemoteCrashAnim(null); setP2RemoteCrashAnim(null);
    gameModeRef.current = gameMode;
    setCollectibles([]); setP1Powerup(null); setP2Powerup(null);
    setBullets([]); setMines([]); setP1Shocked(false); setP2Shocked(false);
    p1PowerupRef.current = null; p2PowerupRef.current = null;
    p1ShockedUntilRef.current = 0; p2ShockedUntilRef.current = 0;
    p1WeaponUntilRef.current = 0; p2WeaponUntilRef.current = 0;
    setP1Glow(null); setP2Glow(null);
    setP1CrashedRemote(false); setP2CrashedRemote(false);
    setStatus('playing');
    startRound(q[0]);
  }, [words, startRound, gameMode]);

  const handleHit = useCallback((bubble: WBubble, player: 1|2) => {
    const is2pMode    = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
    const isOnlineMode = gameModeRef.current === '2p-online';
    if (bubble.isCorrect) {
      if (!isOnlineMode || player === 1) playSuccess();
      setFlash('good');
      if (player === 1) {
        setFuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setScore(s => s + 1);
        triggerGlow(1, 'hit');
        setP1HitPopup({ x: planePos.current.x, y: planePos.current.y });
        setTimeout(() => setP1HitPopup(null), 900);
        setP1BarEmphasis(true); setTimeout(() => setP1BarEmphasis(false), 850);
      } else {
        setP2Fuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setP2Score(s => s + 1);
        triggerGlow(2, 'hit');
        setP2HitPopup({ x: p2Pos.current.x, y: p2Pos.current.y });
        setTimeout(() => setP2HitPopup(null), 900);
        setP2BarEmphasis(true); setTimeout(() => setP2BarEmphasis(false), 850);
        if (isOnlineMode) channelRef.current?.send({ type:'broadcast', event:'p2-event', payload:{ kind:'scored' } });
      }
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      const next = queuePosRef.current + 1;
      queuePosRef.current = next; setQueuePos(next);
      const newMult = 1 + (next / Math.max(queue.length, 1)) * (BUBBLE_SPEED_MAX_MULT - 1);
      speedMultRef.current = newMult; setSpeedMult(newMult);
      if (next >= queue.length) {
        setTimeout(() => setStatus('won'), 600);
      } else {
        const nextWord = queue[next];
        const allTypes: CollectibleType[] = ['heart','weapon','dynamite','lightning'];
        const spawnTypes = is2pMode ? allTypes : ['heart'] as CollectibleType[];
        if (Math.random() < COLLECTIBLE_SPAWN_RATE) {
          const type = spawnTypes[Math.floor(Math.random() * spawnTypes.length)];
          const cx = 28 + Math.random() * 44;
          const cy = ALL_Y_SLOTS[Math.floor(Math.random() * ALL_Y_SLOTS.length)];
          setCollectibles(prev => [
            ...prev.filter(c => c.active && Date.now() < c.expiresAt).slice(-1),
            { id:`col-${Date.now()}`, type, x:cx, y:cy, active:true, expiresAt:Date.now()+COLLECTIBLE_LIFETIME },
          ]);
        }
        setTimeout(() => {
          setBubbles(prev => {
            const survivors = prev.filter(b => !b.popped && b.arabic !== nextWord.arabic).slice(0, 2);
            const usedY = survivors.map(b => b.y);
            return [...survivors, ...makeWordBubbles(nextWord, words, 3, usedY, speedMultRef.current)];
          });
          collidingRef.current = false; p2ColRef.current = false;
          targetArabicRef.current = nextWord.arabic;
          setTimeout(() => speakMeaning(nextWord.meaning), 350);
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
  }, [queue, speakMeaning, triggerGlow, words]);

  const handleHitRef = useRef(handleHit);
  useEffect(() => { handleHitRef.current = handleHit; }, [handleHit]);
  useEffect(() => { queuePosRef.current = queuePos; }, [queuePos]);

  useEffect(() => {
    if (fuel <= 0 && p1CrashedRef.current) {
      p1CrashPosRef.current = { ...planePos.current };
      setP1CrashAnim('explosion');
      setP1Down(true);
      const t1 = setTimeout(() => setP1CrashAnim('parachute'), 1400);
      const t2 = setTimeout(() => setP1CrashAnim(null), 3900);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [fuel]);
  useEffect(() => {
    if (p2Fuel <= 0 && p2CrashedRef.current) {
      p2CrashPosRef.current = { ...p2Pos.current };
      setP2CrashAnim('explosion');
      setP2Down(true);
      const t1 = setTimeout(() => setP2CrashAnim('parachute'), 1400);
      const t2 = setTimeout(() => setP2CrashAnim(null), 3900);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [p2Fuel]);
  useEffect(() => {
    if (!p1CrashedRemote) { setP1RemoteCrashAnim(null); return; }
    const snap = latestSnapRef.current;
    p1RemoteCrashPos.current = snap ? { x: snap.p1.x, y: snap.p1.y } : { x: 14, y: 32 };
    setP1RemoteCrashAnim('explosion');
    const t1 = setTimeout(() => setP1RemoteCrashAnim('parachute'), 1400);
    const t2 = setTimeout(() => setP1RemoteCrashAnim(null), 3900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [p1CrashedRemote]);
  useEffect(() => {
    if (!p2CrashedRemote) { setP2RemoteCrashAnim(null); return; }
    const snap = latestSnapRef.current;
    p2RemoteCrashPos.current = snap ? { x: snap.p2.x, y: snap.p2.y } : { x: 14, y: 68 };
    setP2RemoteCrashAnim('explosion');
    const t1 = setTimeout(() => setP2RemoteCrashAnim('parachute'), 1400);
    const t2 = setTimeout(() => setP2RemoteCrashAnim(null), 3900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [p2CrashedRemote]);

  // ── Main game loop ────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || isP2) return;
    const tick = () => {
      const k = keysDown.current;
      const p = planePos.current, v = velRef.current;
      const is2pNow    = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
      const isOnlineNow = gameModeRef.current === '2p-online';
      const now = Date.now();

      if (p1PowerupRef.current === 'weapon' && now > p1WeaponUntilRef.current) { p1PowerupRef.current = null; setP1Powerup(null); }
      if (p2PowerupRef.current === 'weapon' && now > p2WeaponUntilRef.current) { p2PowerupRef.current = null; setP2Powerup(null); }
      if (p1ShockedUntilRef.current > 0 && now > p1ShockedUntilRef.current)   { p1ShockedUntilRef.current = 0; setP1Shocked(false); }
      if (p2ShockedUntilRef.current > 0 && now > p2ShockedUntilRef.current)   { p2ShockedUntilRef.current = 0; setP2Shocked(false); }

      const p1IsShocked = p1ShockedUntilRef.current > 0 && now < p1ShockedUntilRef.current;
      const p2IsShocked = p2ShockedUntilRef.current > 0 && now < p2ShockedUntilRef.current;

      if (!p1CrashedRef.current && !p1IsShocked) {
        v.y += PLANE_GRAVITY;
        if (k.ArrowUp)    v.y -= PLANE_ACCEL;
        if (k.ArrowDown)  v.y += PLANE_ACCEL;
        if (k.ArrowLeft)  v.x -= PLANE_ACCEL_H;
        if (k.ArrowRight) v.x += PLANE_ACCEL_H;
        v.x *= PLANE_DRAG; v.y *= PLANE_DRAG;
        v.x = Math.max(-PLANE_MAX_VEL_H, Math.min(PLANE_MAX_VEL_H, v.x));
        v.y = Math.max(-PLANE_MAX_VEL,   Math.min(PLANE_MAX_VEL,   v.y));
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

      if (is2pNow && !p2CrashedRef.current && !p2IsShocked) {
        const p2 = p2Pos.current, v2 = p2Vel.current;
        v2.y += PLANE_GRAVITY;
        if (isOnlineNow) {
          const rk = p2RemoteKeysRef.current;
          if (rk.up)    v2.y -= PLANE_ACCEL;
          if (rk.down)  v2.y += PLANE_ACCEL;
          if (rk.left)  v2.x -= PLANE_ACCEL_H;
          if (rk.right) v2.x += PLANE_ACCEL_H;
        } else {
          if (k.KeyW) v2.y -= PLANE_ACCEL;
          if (k.KeyS) v2.y += PLANE_ACCEL;
          if (k.KeyA) v2.x -= PLANE_ACCEL_H;
          if (k.KeyD) v2.x += PLANE_ACCEL_H;
        }
        v2.x *= PLANE_DRAG; v2.y *= PLANE_DRAG;
        v2.x = Math.max(-PLANE_MAX_VEL_H, Math.min(PLANE_MAX_VEL_H, v2.x));
        v2.y = Math.max(-PLANE_MAX_VEL,   Math.min(PLANE_MAX_VEL,   v2.y));
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

      for (const b of bubblesRef.current) {
        if (b.popped) continue;
        b.x += b.vx;
        if (b.x < -16) b.x = 108 + Math.random() * 25;
        const el = bubbleDomRefs.current.get(b.id);
        if (el) el.style.left = `${b.x}%`;
      }

      if (!collidingRef.current && !p1CrashedRef.current) {
        const p1HitR = PLANES[p1Plane]?.hitRadius ?? PLANE_HIT_RADIUS;
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p.x, dy = (b.y - p.y) * 0.65;
          if (Math.sqrt(dx*dx+dy*dy) < p1HitR) {
            collidingRef.current = true; handleHitRef.current(b, 1); break;
          }
        }
      }

      if (is2pNow && !p2ColRef.current && !p2CrashedRef.current) {
        const p2HitR = PLANES[p2Plane]?.hitRadius ?? PLANE_HIT_RADIUS;
        const p2 = p2Pos.current;
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p2.x, dy = (b.y - p2.y) * 0.65;
          if (Math.sqrt(dx*dx+dy*dy) < p2HitR) {
            p2ColRef.current = true; handleHitRef.current(b, 2); break;
          }
        }
      }

      for (const c of collectiblesRef.current) {
        if (!c.active || now > c.expiresAt) { c.active = false; continue; }
        const dx1 = c.x - p.x, dy1 = c.y - p.y;
        if (!p1CrashedRef.current && Math.sqrt(dx1*dx1+dy1*dy1) < COLLECTIBLE_RADIUS) {
          c.active = false; applyCollectibleRef.current(c.type, 1);
          setCollectibles(prev => prev.map(cc => cc.id === c.id ? { ...cc, active: false } : cc)); continue;
        }
        if (is2pNow && !isOnlineNow) {
          const p2 = p2Pos.current;
          const dx2 = c.x - p2.x, dy2 = c.y - p2.y;
          if (!p2CrashedRef.current && Math.sqrt(dx2*dx2+dy2*dy2) < COLLECTIBLE_RADIUS) {
            c.active = false; applyCollectibleRef.current(c.type, 2);
            setCollectibles(prev => prev.map(cc => cc.id === c.id ? { ...cc, active: false } : cc));
          }
        }
      }

      for (const b of bulletsRef.current) {
        if (!b.active) continue;
        b.x += b.vx; b.y += b.vy;
        if (b.x < 0 || b.x > 100 || b.y < 0 || b.y > 100) { b.active = false; continue; }
        const bEl = bulletDomRefs.current.get(b.id);
        if (bEl) { bEl.style.left = `${b.x}%`; bEl.style.top = `${b.y}%`; }
        if (b.owner === 1 && is2pNow && !isOnlineNow) {
          const p2 = p2Pos.current;
          const dx = b.x - p2.x, dy = b.y - p2.y;
          if (Math.sqrt(dx*dx+dy*dy) < BULLET_HIT_RADIUS) {
            b.active = false;
            setP2Fuel(f => { const nf = Math.max(0, f - BULLET_DAMAGE); if (nf <= 0) { p2CrashedRef.current = true; if (p1CrashedRef.current) setTimeout(() => setStatus('lost'), 500); } return nf; });
            triggerGlow(2, 'mine');
          }
        } else if (b.owner === 2 && !isOnlineNow) {
          const dx = b.x - p.x, dy = b.y - p.y;
          if (Math.sqrt(dx*dx+dy*dy) < BULLET_HIT_RADIUS) {
            b.active = false;
            setFuel(f => { const nf = Math.max(0, f - BULLET_DAMAGE); if (nf <= 0) { p1CrashedRef.current = true; if (!is2pNow || p2CrashedRef.current) setTimeout(() => setStatus('lost'), 500); } return nf; });
            triggerGlow(1, 'mine');
          }
        }
      }

      for (const m of minesRef.current) {
        if (!m.active) continue;
        if (m.owner !== 1) {
          const dx = m.x - p.x, dy = m.y - p.y;
          if (!p1CrashedRef.current && Math.sqrt(dx*dx+dy*dy) < MINE_TRIGGER_RADIUS) {
            m.active = false; playMineExplode(); triggerGlow(1, 'mine');
            const expId1 = `mexp-${Date.now()}-${Math.random()}`;
            const mx1 = m.x, my1 = m.y;
            setMineExplosions(prev => [...prev, { id: expId1, x: mx1, y: my1 }]);
            setTimeout(() => setMineExplosions(prev => prev.filter(e => e.id !== expId1)), 2500);
            setMines(prev => prev.map(mm => mm.id === m.id ? { ...mm, active: false } : mm));
            setFuel(f => { const nf = Math.max(0, f - MINE_DAMAGE); if (nf <= 0) { p1CrashedRef.current = true; if (!is2pNow || p2CrashedRef.current) setTimeout(() => setStatus('lost'), 500); } return nf; });
            continue;
          }
        }
        if (is2pNow && !isOnlineNow && m.owner !== 2) {
          const p2 = p2Pos.current;
          const dx = m.x - p2.x, dy = m.y - p2.y;
          if (!p2CrashedRef.current && Math.sqrt(dx*dx+dy*dy) < MINE_TRIGGER_RADIUS) {
            m.active = false; playMineExplode(); triggerGlow(2, 'mine');
            const expId2 = `mexp-${Date.now()}-${Math.random()}`;
            const mx2 = m.x, my2 = m.y;
            setMineExplosions(prev => [...prev, { id: expId2, x: mx2, y: my2 }]);
            setTimeout(() => setMineExplosions(prev => prev.filter(e => e.id !== expId2)), 2500);
            setMines(prev => prev.map(mm => mm.id === m.id ? { ...mm, active: false } : mm));
            setP2Fuel(f => { const nf = Math.max(0, f - MINE_DAMAGE); if (nf <= 0) { p2CrashedRef.current = true; if (p1CrashedRef.current) setTimeout(() => setStatus('lost'), 500); } return nf; });
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, isP2, triggerGlow]);

  // ── P2 client-side prediction + interpolation loop ────────────────────────
  // Runs only on the joining client (P2). P2's own plane is simulated locally
  // from its own key presses (instant response, no network round-trip), and
  // gently reconciled to the host's authoritative snapshots. P1's plane and the
  // word bubbles are interpolated toward the latest snapshot for smooth 60fps
  // motion. The host stays authoritative for collisions, fuel and scoring.
  useEffect(() => {
    if (!isP2 || status !== 'playing') return;
    let raf = 0;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const tick = () => {
      const snap = latestSnapRef.current;
      if (snap) {
        // First snapshot: align predicted state so there's no initial glide.
        if (!p2PredInitedRef.current) {
          p2Pos.current = { x: snap.p2.x, y: snap.p2.y };
          p2Vel.current = { x: 0, y: 0 };
          p2Tilt.current = snap.p2.tilt;
          p2RenderP1Ref.current = { x: snap.p1.x, y: snap.p1.y, tilt: snap.p1.tilt };
          p2PredInitedRef.current = true;
        }

        // ── P2's own plane: local prediction from its own keys ──
        const p2 = p2Pos.current, v2 = p2Vel.current;
        const frozen = snap.p2.crashed || snap.p2Shocked;
        if (!frozen) {
          const rk = p2RemoteKeysRef.current;
          v2.y += PLANE_GRAVITY;
          if (rk.up)    v2.y -= PLANE_ACCEL;
          if (rk.down)  v2.y += PLANE_ACCEL;
          if (rk.left)  v2.x -= PLANE_ACCEL_H;
          if (rk.right) v2.x += PLANE_ACCEL_H;
          v2.x *= PLANE_DRAG; v2.y *= PLANE_DRAG;
          v2.x = clamp(v2.x, -PLANE_MAX_VEL_H, PLANE_MAX_VEL_H);
          v2.y = clamp(v2.y, -PLANE_MAX_VEL,   PLANE_MAX_VEL);
          p2.x = clamp(p2.x + v2.x, 4, 96);
          p2.y = clamp(p2.y + v2.y, 7, 88);
          const tilt2 = clamp(v2.y * 20, -28, 28);
          p2Tilt.current += (tilt2 - p2Tilt.current) * 0.13;
          // Reconcile drift toward the authoritative position: snap harder when
          // the host disagrees a lot (e.g. a knockback), barely nudge otherwise.
          const dx = snap.p2.x - p2.x, dy = snap.p2.y - p2.y;
          const a = Math.hypot(dx, dy) > 6 ? 0.3 : 0.04;
          p2.x += dx * a; p2.y += dy * a;
        } else {
          // Host-authoritative event (crash / shock knockback): follow the host.
          p2.x += (snap.p2.x - p2.x) * 0.4;
          p2.y += (snap.p2.y - p2.y) * 0.4;
          p2Tilt.current += (snap.p2.tilt - p2Tilt.current) * 0.4;
          v2.x = 0; v2.y = 0;
        }
        if (p2ViewP2PlaneRef.current) {
          p2ViewP2PlaneRef.current.style.left      = `${p2.x}%`;
          p2ViewP2PlaneRef.current.style.top       = `${p2.y}%`;
          p2ViewP2PlaneRef.current.style.transform = `translate(-50%,-50%) rotate(${p2Tilt.current}deg)`;
        }

        // ── P1's plane: smooth interpolation toward the latest snapshot ──
        const r = p2RenderP1Ref.current;
        r.x += (snap.p1.x - r.x) * 0.25;
        r.y += (snap.p1.y - r.y) * 0.25;
        r.tilt += (snap.p1.tilt - r.tilt) * 0.25;
        if (p2ViewP1PlaneRef.current) {
          p2ViewP1PlaneRef.current.style.left      = `${r.x}%`;
          p2ViewP1PlaneRef.current.style.top       = `${r.y}%`;
          p2ViewP1PlaneRef.current.style.transform = `translate(-50%,-50%) rotate(${r.tilt}deg)`;
        }
        // ── Bubbles — drift by vx every frame and gently reconcile toward the
        //    snapshot, so they glide at 60fps instead of snapping every ~33ms ──
        const bmap = p2BubbleRenderRef.current;
        const liveIds = new Set<string>();
        for (const b of snap.bubbles) {
          if (b.popped) continue;
          liveIds.add(b.id);
          let rx = bmap.get(b.id);
          if (rx === undefined || Math.abs(b.x - rx) > 40) rx = b.x; // new bubble or edge wrap → snap
          else { rx += b.vx; rx += (b.x - rx) * 0.12; }              // extrapolate + correction
          bmap.set(b.id, rx);
          const el = bubbleDomRefs.current.get(b.id);
          if (el) el.style.left = `${rx}%`;
        }
        for (const id of bmap.keys()) if (!liveIds.has(id)) bmap.delete(id);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); p2PredInitedRef.current = false; };
  }, [isP2, status]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isP2 || status !== 'playing') return;
    const down = (e: KeyboardEvent) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      keysDown.current[e.code] = true;
      if (e.code === 'Space' || e.code === 'KeyM') fireP1Ref.current();
      if (e.code === 'KeyG')  fireP2Ref.current();
    };
    const up   = (e: KeyboardEvent) => { keysDown.current[e.code] = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [isP2, status]);

  const startGameRef = useRef(startGame);
  useEffect(() => { startGameRef.current = startGame; }, [startGame]);

  const handleRestart = useCallback(() => {
    if (isP2) {
      channelRef.current?.send({ type: 'broadcast', event: 'restart', payload: {} });
    } else {
      startGame();
    }
  }, [isP2, startGame]);

  // ── Online room creation ───────────────────────────────────────────────────
  useEffect(() => {
    if (gameMode !== '2p-online' || isP2 || onlineRoomId) return;
    const id = crypto.randomUUID();
    setOnlineRoomId(id);
    const ch = supabase.realtime.channel(`word-flight-${id}`);
    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { p2Plane: number; p2Name?: string } }) => {
      setP2RemotePlane(payload.p2Plane); setP2Joined(true);
      if (payload.p2Name) setP2Name(payload.p2Name);
    });
    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: { up:boolean;down:boolean;left:boolean;right:boolean } }) => {
      p2RemoteKeysRef.current = payload;
    });
    ch.on('broadcast', { event: 'fire' }, () => { fireP2Ref.current(); });
    ch.on('broadcast', { event: 'restart' }, () => { startGameRef.current(); });
    ch.subscribe();
    channelRef.current = ch;
  }, [gameMode, isP2, onlineRoomId]);

  // ── Broadcast interval (P1 → P2) ─────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing' || gameMode !== '2p-online' || isP2) return;
    const id = setInterval(() => {
      const now = Date.now();
      channelRef.current?.send({
        type: 'broadcast', event: 'state',
        payload: {
          p1: { x:planePos.current.x, y:planePos.current.y, tilt:tiltRef.current, crashed:p1CrashedRef.current },
          p2: { x:p2Pos.current.x,    y:p2Pos.current.y,    tilt:p2Tilt.current,  crashed:p2CrashedRef.current },
          fuels: [fuelRef.current, p2FuelRef.current] as [number,number],
          scores: [scoreRef.current, p2ScoreRef.current] as [number,number],
          bubbles: bubblesRef.current,
          status, queueLen: queue.length, queuePos: queuePosRef.current,
          targetArabic: targetArabicRef.current,
          targetMeaning: queue[queuePosRef.current]?.meaning ?? '',
          p1Plane, p2Plane: p2RemotePlane,
          collectibles: collectiblesRef.current.filter(c => c.active && now < c.expiresAt),
          bullets: bulletsRef.current.filter(b => b.active),
          mines: minesRef.current.filter(m => m.active),
          p1Powerup: p1PowerupRef.current, p2Powerup: p2PowerupRef.current,
          p1Shocked: now < p1ShockedUntilRef.current,
          p2Shocked: now < p2ShockedUntilRef.current,
          p1Name, p2Name,
          p1Speed: Math.sqrt(velRef.current.x**2 + velRef.current.y**2) / PLANE_MAX_VEL,
          p2Speed: Math.sqrt(p2Vel.current.x**2  + p2Vel.current.y**2)  / PLANE_MAX_VEL,
        } satisfies WP2Snapshot,
      });
    }, 33);
    return () => clearInterval(id);
  }, [status, gameMode, isP2, queue, p1Plane, p2RemotePlane, p1Name, p2Name]);

  // ── P2 join online ─────────────────────────────────────────────────────────
  const joinOnlineGame = useCallback(() => {
    if (!propRoomId) return;
    const ch = supabase.realtime.channel(`word-flight-${propRoomId}`);
    ch.on('broadcast', { event: 'state' }, ({ payload }: { payload: WP2Snapshot }) => {
      latestSnapRef.current = payload;
      if (payload.status !== status) setStatus(payload.status);
      if (payload.p1.crashed !== p1CrashedRemote) setP1CrashedRemote(payload.p1.crashed);
      if (payload.p2.crashed !== p2CrashedRemote) setP2CrashedRemote(payload.p2.crashed);
      if (payload.p1Shocked !== p1Shocked) setP1Shocked(payload.p1Shocked);
      if (payload.p2Shocked !== p2Shocked) setP2Shocked(payload.p2Shocked);
      if (payload.p1Powerup !== p1Powerup) setP1Powerup(payload.p1Powerup);
      if (payload.p2Powerup !== p2Powerup) setP2Powerup(payload.p2Powerup);

      const newBubbleSet = payload.bubbles.map(b => b.id).join(',');
      if (newBubbleSet !== p2BubbleSetRef.current) {
        p2BubbleSetRef.current = newBubbleSet;
        setBubbles(payload.bubbles);
      }
      const newBulletSet = payload.bullets.map(b => b.id).join(',');
      if (newBulletSet !== p2BulletSetRef.current) {
        p2BulletSetRef.current = newBulletSet;
        setBullets(payload.bullets);
      }
      setCollectibles(payload.collectibles);
      setMines(payload.mines);

      if (payload.targetArabic !== p2SnapshotWordRef.current) {
        p2SnapshotWordRef.current = payload.targetArabic;
        if (payload.status === 'playing') setTimeout(() => speakMeaning(payload.targetMeaning), 200);
      }

      if (payload.p1Name) {
        setP1NameReceived(prev => prev !== payload.p1Name ? payload.p1Name! : prev);
        if (p2HudP1NameRef.current) p2HudP1NameRef.current.textContent = payload.p1Name;
      }
      if (payload.p2Name && p2HudP2NameRef.current) p2HudP2NameRef.current.textContent = payload.p2Name;

      // Plane positions are rendered by the P2 prediction/interpolation loop
      // (from latestSnapRef), not set directly here — that's what removes the lag.
      if (p2FuelBar1Ref.current) { p2FuelBar1Ref.current.style.width = `${payload.fuels[0]}%`; p2FuelBar1Ref.current.style.background = fuelColor(payload.fuels[0]); }
      if (p2FuelBar2Ref.current) { p2FuelBar2Ref.current.style.width = `${payload.fuels[1]}%`; p2FuelBar2Ref.current.style.background = fuelColor(payload.fuels[1]); }
      if (p2Score1SpanRef.current) p2Score1SpanRef.current.textContent = String(payload.scores[0]);
      if (p2Score2SpanRef.current) p2Score2SpanRef.current.textContent = String(payload.scores[1]);
      // Bubble positions are smoothed in the P2 prediction loop (drift + reconcile),
      // not snapped here — that's what removes the bubble stutter.
    });
    ch.on('broadcast', { event: 'p2-event' }, ({ payload: ev }: { payload: { kind:string; colType?: CollectibleType } }) => {
      if (ev.kind === 'scored') { playSuccess(); setP2Glow('hit'); setTimeout(() => setP2Glow(g => g === 'hit' ? null : g), 700); }
      else if (ev.kind === 'collectible') { if (ev.colType) PICKUP_SOUNDS[ev.colType](); setP2Glow('collectible'); setTimeout(() => setP2Glow(g => g === 'collectible' ? null : g), 700); }
      else if (ev.kind === 'mine') { playMineExplode(); setP2Glow('mine'); setTimeout(() => setP2Glow(g => g === 'mine' ? null : g), 900); }
    });
    ch.subscribe(() => {
      ch.send({ type:'broadcast', event:'ready', payload:{ p2Plane, p2Name } });
    });
    channelRef.current = ch;
    setP2Waiting(true);
  }, [propRoomId, p2Plane, p2Name, speakMeaning, p1CrashedRemote, p2CrashedRemote, p1Shocked, p2Shocked, p1Powerup, p2Powerup, status]);

  useEffect(() => {
    if (!isP2 || status !== 'playing') return;
    const mapKey = (code: string) => {
      if (code === 'ArrowUp'    || code === 'KeyW') return 'up';
      if (code === 'ArrowDown'  || code === 'KeyS') return 'down';
      if (code === 'ArrowLeft'  || code === 'KeyA') return 'left';
      if (code === 'ArrowRight' || code === 'KeyD') return 'right';
      return null;
    };
    const sendInput = () => channelRef.current?.send({ type:'broadcast', event:'input', payload:{ ...p2RemoteKeysRef.current } });
    const down = (e: KeyboardEvent) => {
      const dir = mapKey(e.code);
      if (dir) { e.preventDefault(); p2RemoteKeysRef.current[dir as keyof typeof p2RemoteKeysRef.current] = true; sendInput(); }
      if (e.code === 'Space') { e.preventDefault(); channelRef.current?.send({ type:'broadcast', event:'fire', payload:{} }); }
    };
    const up = (e: KeyboardEvent) => {
      const dir = mapKey(e.code);
      if (dir) { p2RemoteKeysRef.current[dir as keyof typeof p2RemoteKeysRef.current] = false; sendInput(); }
    };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [isP2, status]);

  // P2 input heartbeat — re-broadcast current key state ~10x/sec so dropped
  // realtime packets self-heal (broadcast is fire-and-forget / lossy on mobile).
  useEffect(() => {
    if (!isP2 || status !== 'playing') return;
    const id = setInterval(() => {
      channelRef.current?.send({ type:'broadcast', event:'input', payload:{ ...p2RemoteKeysRef.current } });
    }, 100);
    return () => clearInterval(id);
  }, [isP2, status]);

  useEffect(() => { return () => { channelRef.current?.unsubscribe(); channelRef.current = null; }; }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const holdBtn = (code: string) => ({
    onPointerDown:  (e: React.PointerEvent) => { e.preventDefault(); keysDown.current[code] = true; },
    onPointerUp:    () => { keysDown.current[code] = false; },
    onPointerLeave: () => { keysDown.current[code] = false; },
    onContextMenu:  (e: React.MouseEvent) => e.preventDefault(),
  });
  const holdBtnP2 = (dir: 'up'|'down'|'left'|'right') => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); p2RemoteKeysRef.current[dir] = true; channelRef.current?.send({ type:'broadcast', event:'input', payload:{ ...p2RemoteKeysRef.current } }); },
    onPointerUp:   () => { p2RemoteKeysRef.current[dir] = false; channelRef.current?.send({ type:'broadcast', event:'input', payload:{ ...p2RemoteKeysRef.current } }); },
    onPointerLeave:() => { p2RemoteKeysRef.current[dir] = false; channelRef.current?.send({ type:'broadcast', event:'input', payload:{ ...p2RemoteKeysRef.current } }); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const fuelColor = (f: number) => f > 60 ? '#22c55e' : f > 30 ? '#f59e0b' : '#ef4444';
  const overlay   = (children: React.ReactNode) => (
    <div className="absolute inset-0 z-30 flex items-start justify-center py-2 overflow-y-auto" style={{ background:'rgba(8,24,70,0.62)', backdropFilter:'blur(6px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-sky-100 px-5 py-5 text-center max-w-sm mx-4 w-full my-auto">{children}</div>
    </div>
  );
  const hn = (n: string) => n.length > 10 ? n.slice(0, 9) + '…' : n;
  const twoPlayerResult = (s1: number, s2: number, n1 = p1Name, n2 = p2Name) => {
    if (s1 > s2) return { emoji:'🏆', msg:`${n1} Wins! 🎉`, color:'#3b82f6' };
    if (s2 > s1) return { emoji:'🏆', msg:`${n2} Wins! 🎉`, color:'#f97316' };
    return { emoji:'🤝', msg:"It's a Draw!", color:'#8b5cf6' };
  };
  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/word-flight/${onlineRoomId}` : '';
  const copyLink  = () => { safeCopy(shareLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }); };

  const GlowOverlay: React.FC<{ glow:'hit'|'collectible'|'mine'|null; x:number; y:number }> = ({ glow, x, y }) => {
    if (!glow) return null;
    const color = glow === 'hit' ? 'rgba(250,204,21,0.7)' : glow === 'collectible' ? 'rgba(167,139,250,0.7)' : 'rgba(239,68,68,0.75)';
    return (
      <div className="absolute pointer-events-none" style={{ left:`${x}%`, top:`${y}%`, width:90, height:90, borderRadius:'50%', background:color, animation:`wf-glow-${glow} 0.75s ease-out forwards`, zIndex:25 }} />
    );
  };

  const renderBubbles = (bs: WBubble[]) => bs.map(b => (
    <div key={b.id}
      ref={el => { if (el) bubbleDomRefs.current.set(b.id, el); else bubbleDomRefs.current.delete(b.id); }}
      className={`absolute z-10 flex items-center justify-center ${b.popped ? 'wf-popped' : 'wf-bubble'}`}
      style={{
        left:`${b.x}%`, top:`${b.y}%`, transform:'translate(-50%,-50%)',
        width:'clamp(100px,18vw,150px)', height:'clamp(52px,8vw,72px)',
        borderRadius: 36,
        background:'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.97), rgba(186,230,253,0.78) 55%, rgba(125,211,252,0.88))',
        border:'3px solid rgba(255,255,255,0.95)',
        boxShadow:'0 6px 18px rgba(14,116,144,0.3), inset 0 -5px 12px rgba(14,116,144,0.18)',
        animationDelay:`${b.driftDelay}s`,
      }}>
      <span style={{ fontFamily:"'Hafs','Amiri',serif", fontSize:'clamp(1.2rem,3.5vw,1.7rem)', lineHeight:1, color:'#0c4a6e', direction:'rtl' }}>
        {b.arabic}
      </span>
    </div>
  ));

  const renderCollectibles = (cols: Collectible[]) => cols.filter(c => c.active).map(c => (
    <div key={c.id} className="absolute pointer-events-none z-10 wf-collectible" style={{ left:`${c.x}%`, top:`${c.y}%`, transform:'translate(-50%,-50%)' }}>
      {c.type === 'dynamite'
        ? <LottieAnim src="/sprites/bomb.json" width={50} height={50} />
        : <img src={COLLECTIBLE_ICONS[c.type]} alt={c.type} width={46} height={46} style={{ display:'block' }} />}
    </div>
  ));

  const renderBullets = (buls: Bullet[], isP2View = false) => buls.filter(b => b.active).map(b => (
    <div key={b.id}
      ref={el => { const map = isP2View ? p2BulletDomRefs.current : bulletDomRefs.current; if (el) map.set(b.id, el); else map.delete(b.id); }}
      className="absolute pointer-events-none"
      style={{ left:`${b.x}%`, top:`${b.y}%`, transform:'translate(-50%,-50%)', width:8, height:8, borderRadius:'50%', zIndex:25,
        background: '#f97316',
        boxShadow: '0 0 6px #fdba74,0 0 3px #fb923c' }} />
  ));

  const renderMines = (ms: Mine[]) => ms.filter(m => m.active).map(m => (
    <div key={m.id} className="absolute pointer-events-none z-10 wf-mine" style={{ left:`${m.x}%`, top:`${m.y}%`, transform:'translate(-50%,-50%)' }}>
      <LottieAnim src="/sprites/email.json" width={60} height={60} />
    </div>
  ));

  // ── Target meaning banner ─────────────────────────────────────────────────
  const MeaningBanner: React.FC<{ meaning: string }> = ({ meaning }) => (
    <div className="absolute left-1/2 z-20 flex items-center gap-2 px-4 py-1.5 rounded-2xl shadow-lg"
      style={{ top: 56, transform:'translateX(-50%)', background:'rgba(255,255,255,0.96)', border:'2px solid #f59e0b', whiteSpace:'nowrap' }}>
      <span className="text-xs font-bold text-slate-500">Find:</span>
      <span className="text-base font-extrabold text-amber-700">{meaning}</span>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // P2 CLIENT VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (isP2) {
    const p1PlaneUrl = latestSnapRef.current ? PLANES[latestSnapRef.current.p1Plane]?.url ?? PLANES[0].url : PLANES[0].url;
    const p2PlaneUrl = latestSnapRef.current ? PLANES[latestSnapRef.current.p2Plane]?.url ?? PLANES[1].url : PLANES[p2Plane].url;
    const snapMeaning = latestSnapRef.current?.targetMeaning ?? '';

    return (
      <div className="select-none" style={{ position:'fixed', inset:0, zIndex:50, background:'#1a6fc4', touchAction:'none' }}>
        <div ref={bgDivRef} className="absolute inset-0 pointer-events-none" style={{ zIndex:0, backgroundImage:`url(${bgImage})`, backgroundRepeat:'repeat-x', backgroundSize:'auto 100%' }} />
        <FullscreenButton />

        {!p2Waiting && status === 'start' && overlay(
          <>
            <div className="flex items-center justify-center gap-3 mb-4">
              <dotlottie-wc src="/sprites/pilot.json" autoplay loop style={{ width: 44, height: 44 } as React.CSSProperties} />
              <div className="text-left">
                <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold text-white mb-0.5" style={{ background:'#f97316' }}>Player 2</div>
                <p className="text-[11px] text-slate-400 font-semibold">Word Flight</p>
              </div>
            </div>
            <div className="mb-3">
              <input value={p2Name} onChange={e => setP2Name(e.target.value.slice(0,16))} maxLength={16}
                className="w-full px-3 py-2 rounded-xl border-2 border-orange-200 text-sm font-bold text-center text-orange-700 bg-orange-50 focus:outline-none focus:border-orange-400"
                placeholder="Your name" />
            </div>
            <VehiclePicker selected={p2Plane} onSelect={setP2Plane} accentColor="#f97316" />
            <div className="flex gap-2 mt-4">
              <button onClick={joinOnlineGame} className="flex-1 py-3 rounded-2xl text-white font-black text-base shadow-lg active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#f97316,#fb923c)' }}>Join Game 🚀</button>
              <button onClick={onExit} className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold text-sm active:scale-95 transition-all hover:bg-slate-50">Back</button>
            </div>
          </>
        )}

        {p2Waiting && status === 'start' && overlay(
          <>
            <div className="text-4xl mb-4">✈️</div>
            <h3 className="text-lg font-extrabold text-sky-700 mb-2">Joined! Waiting for teacher…</h3>
            <div className="w-8 h-8 rounded-full border-4 border-sky-400 border-t-transparent animate-spin mx-auto mb-4" />
            <button onClick={() => { channelRef.current?.unsubscribe(); channelRef.current = null; setP2Waiting(false); }} className="mt-2 px-5 py-2 rounded-full bg-white border-2 border-slate-200 text-slate-500 text-sm font-bold active:scale-95 transition-all">Cancel</button>
          </>
        )}

        {status === 'playing' && (
          <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0" style={{ borderColor:'#3b82f6' }}>
              <span ref={p2HudP1NameRef} className="text-[11px] font-extrabold text-blue-600 whitespace-nowrap">{hn(p1NameReceived)} ⛽</span>
              <div className="relative flex-1 h-4 rounded-full overflow-hidden" style={{ background:'rgba(148,163,184,0.25)' }}><div ref={p2FuelBar1Ref} className="absolute inset-0 rounded-full" style={{ width:'100%', background:`linear-gradient(90deg, #22c55ecc, #22c55e)` }}/></div>
              <span ref={p2Score1SpanRef} className="text-[11px] font-extrabold text-blue-700 ml-1">0</span>
            </div>
            {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => { if (latestSnapRef.current) speakMeaning(latestSnapRef.current.targetMeaning); }} className="px-2.5 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">🔊</button>
            </div>
            {p2Powerup && <PowerupBadge type={p2Powerup} accentColor="#f97316" />}
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0" style={{ borderColor:'#f97316' }}>
              <span ref={p2HudP2NameRef} className="text-[11px] font-extrabold text-orange-600 whitespace-nowrap">{hn(p2Name)} ⛽</span>
              <div className="relative flex-1 h-4 rounded-full overflow-hidden" style={{ background:'rgba(148,163,184,0.25)' }}><div ref={p2FuelBar2Ref} className="absolute inset-0 rounded-full" style={{ width:'100%', background:`linear-gradient(90deg, #22c55ecc, #22c55e)` }}/></div>
              <span ref={p2Score2SpanRef} className="text-[11px] font-extrabold text-orange-700 ml-1">0</span>
            </div>
          </div>
        )}

        {status === 'playing' && snapMeaning && <MeaningBanner meaning={snapMeaning} />}
        {status === 'playing' && p1Shocked && <div className="absolute inset-0 pointer-events-none wf-shock-overlay" style={{ background:'rgba(147,197,253,0.35)', zIndex:5 }}/>}
        {status === 'playing' && renderBubbles(bubbles)}
        {status === 'playing' && renderCollectibles(collectibles)}
        {status === 'playing' && renderBullets(bullets, true)}
        {status === 'playing' && renderMines(mines)}
        {mineExplosions.map(e => (
          <div key={e.id} className="absolute pointer-events-none" style={{ left:`${e.x}%`, top:`${e.y}%`, transform:'translate(-50%,-50%)', zIndex:30 }}>
            <dotlottie-wc src="/sprites/explosion.json" autoplay style={{ width:120, height:120 } as React.CSSProperties} />
          </div>
        ))}

        {status === 'playing' && (
          <div ref={p2ViewP1PlaneRef} className="absolute pointer-events-none" style={{ left:'14%', top:'32%', transform:'translate(-50%,-50%)', zIndex:20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#3b82f6', whiteSpace:'nowrap' }}>P1</div>
            {p1CrashedRemote ? (p1RemoteCrashAnim === 'explosion' ? <dotlottie-wc src="/sprites/explosion.json" autoplay style={{ width: 120, height: 120 } as React.CSSProperties} /> : null) : <JetPlane src={p1PlaneUrl} shocked={p1Shocked} flameRef={p2ViewP1FlameRef} />}
          </div>
        )}
        {status === 'playing' && (
          <div ref={p2ViewP2PlaneRef} className="absolute pointer-events-none" style={{ left:'14%', top:'68%', transform:'translate(-50%,-50%)', zIndex:20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#f97316', whiteSpace:'nowrap' }}>YOU</div>
            {p2CrashedRemote ? (p2RemoteCrashAnim === 'explosion' ? <dotlottie-wc src="/sprites/explosion.json" autoplay style={{ width: 120, height: 120 } as React.CSSProperties} /> : null) : <JetPlane src={p2PlaneUrl} shocked={p2Shocked} flameRef={p2ViewP2FlameRef} />}
          </div>
        )}

        {status === 'playing' && p1RemoteCrashAnim === 'parachute' && (
          <div className="absolute pointer-events-none" style={{ left: `${p1RemoteCrashPos.current.x}%`, top: `${p1RemoteCrashPos.current.y}%`, zIndex: 21, animation: 'wf-parachute-fall 8s linear forwards' }}>
            <dotlottie-wc src="/sprites/parachute.json" autoplay loop style={{ width: 80, height: 80 } as React.CSSProperties} />
          </div>
        )}
        {status === 'playing' && p2RemoteCrashAnim === 'parachute' && (
          <div className="absolute pointer-events-none" style={{ left: `${p2RemoteCrashPos.current.x}%`, top: `${p2RemoteCrashPos.current.y}%`, zIndex: 21, animation: 'wf-parachute-fall 8s linear forwards' }}>
            <dotlottie-wc src="/sprites/parachute.json" autoplay loop style={{ width: 80, height: 80 } as React.CSSProperties} />
          </div>
        )}
        {status === 'playing' && p2Glow && latestSnapRef.current && <GlowOverlay glow={p2Glow} x={latestSnapRef.current.p2.x} y={latestSnapRef.current.p2.y} />}

        {status === 'playing' && (
          <div className="absolute z-20" style={{ bottom: 20, left: 20 }}>
            <Joystick accentColor="#f97316" onKeys={k => {
              const prev = p2RemoteKeysRef.current;
              if (k.up === prev.up && k.down === prev.down && k.left === prev.left && k.right === prev.right) return;
              p2RemoteKeysRef.current = { up: k.up, down: k.down, left: k.left, right: k.right };
              channelRef.current?.send({ type: 'broadcast', event: 'input', payload: { ...p2RemoteKeysRef.current } });
            }} />
          </div>
        )}
        {status === 'playing' && p2Powerup && (
          <button className="absolute z-20 w-16 h-16 rounded-2xl text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
            style={{ bottom: 28, right: 20, background: '#f97316', border: '3px solid #ea580c' }}
            onPointerDown={e => { e.preventDefault(); channelRef.current?.send({ type:'broadcast', event:'fire', payload:{} }); }}>
            💥
          </button>
        )}

        {(status === 'won' || status === 'lost') && latestSnapRef.current && (() => {
          const s1 = latestSnapRef.current!.scores[0], s2 = latestSnapRef.current!.scores[1];
          const n1 = latestSnapRef.current!.p1Name ?? p1NameReceived, n2 = latestSnapRef.current!.p2Name ?? p2Name;
          const r = twoPlayerResult(s1, s2, n1, n2);
          return overlay(<>
            <div className="text-5xl mb-2">{status === 'won' ? r.emoji : '🪂'}</div>
            <h3 className="text-2xl font-extrabold mb-3" style={{ color:r.color }}>{status === 'won' ? r.msg : 'Both planes crashed!'}</h3>
            <div className="flex gap-3 justify-center mb-5">
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor:'#3b82f6' }}><div className="text-xs font-extrabold text-blue-500 mb-1">{hn(n1)}</div><div className="text-3xl font-extrabold text-blue-700">{s1}</div></div>
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor:'#f97316' }}><div className="text-xs font-extrabold text-orange-500 mb-1">You ({hn(n2)})</div><div className="text-3xl font-extrabold text-orange-600">{s2}</div></div>
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
  const currentWord = queue[queuePos] ?? { arabic:'', meaning:'' };

  return (
    <div className="select-none" style={{ position:'fixed', inset:0, zIndex:50, background:'#1a6fc4', touchAction:'none' }}>
      <div ref={bgDivRef} className="absolute inset-0 pointer-events-none" style={{ zIndex:0, backgroundImage:`url(${bgImage})`, backgroundRepeat:'repeat-x', backgroundSize:'auto 100%' }} />
      <FullscreenButton />

      {status === 'playing' && p2Shocked && <div className="absolute pointer-events-none wf-shock-overlay" style={{ right:0, top:0, bottom:0, width:'50%', background:'rgba(147,197,253,0.3)', zIndex:5 }}/>}
      {status === 'playing' && p1Shocked && <div className="absolute pointer-events-none wf-shock-overlay" style={{ left:0, top:0, bottom:0, width:'50%', background:'rgba(147,197,253,0.3)', zIndex:5 }}/>}

      {/* 1P HUD */}
      {status === 'playing' && !is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
          <button onClick={onExit} className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">← Exit</button>
          <div className="flex items-center gap-1.5 flex-1 max-w-[200px] bg-white/90 rounded-full px-3 py-1.5 border-2 border-sky-200 shadow">
            <span className="text-sm">⛽</span>
            <div className="relative flex-1 h-4 rounded-full overflow-hidden" style={{ background:'rgba(148,163,184,0.25)' }}><div className="absolute inset-0 rounded-full transition-all duration-300" style={{ width:`${fuel}%`, background:`linear-gradient(90deg, ${fuelColor(fuel)}cc, ${fuelColor(fuel)})` }}/></div>
            <span className="text-[11px] font-extrabold text-slate-600 w-7 text-right">{fuel}</span>
          </div>
          <div className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-200 text-xs font-extrabold text-indigo-700 shadow whitespace-nowrap">{score} / {queue.length}</div>
          {speedMult >= 1.15 && (
            <div className="px-2.5 py-1.5 rounded-full border-2 text-xs font-extrabold shadow whitespace-nowrap"
              style={{ background:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,90%,92%)`, borderColor:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,55%)`, color:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,35%)` }}>
              🔥 {speedMult.toFixed(1)}×
            </div>
          )}
          {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
          <button onClick={() => speakMeaning(currentWord.meaning)} className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-amber-500 text-white text-base font-bold shadow active:scale-95">🔊</button>
        </div>
      )}

      {/* 2P HUD */}
      {status === 'playing' && is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-1.5">
          <div className="flex items-center gap-2 bg-white/95 rounded-2xl px-3 py-2 border-2 transition-all duration-200 shadow-sm"
            style={{
              borderColor:'#3b82f6',
              transform: p1BarEmphasis ? 'scale(1.15)' : 'scale(1)',
              boxShadow: p1BarEmphasis ? '0 0 0 4px rgba(59,130,246,0.35), 0 0 18px rgba(59,130,246,0.7)' : '0 2px 6px rgba(0,0,0,0.12)',
              zIndex: p1BarEmphasis ? 30 : undefined,
            }}>
            <span className="text-xs font-extrabold text-blue-600 whitespace-nowrap">{hn(p1Name)}</span>
            <div className="relative w-24 h-4 rounded-full overflow-hidden" style={{ background:'rgba(148,163,184,0.25)' }}>
              <div className="absolute inset-0 rounded-full transition-all duration-300" style={{ width:`${fuel}%`, background:`linear-gradient(90deg, ${fuelColor(fuel)}cc, ${fuelColor(fuel)})` }}/>
            </div>
            <span className="text-xs font-extrabold text-blue-700 w-5 text-right">{score}</span>
          </div>
          {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
          <div className="flex gap-1 flex-shrink-0 flex-1 justify-center">
            {speedMult >= 1.15 && <div className="px-1.5 py-1.5 rounded-full border-2 text-[10px] font-extrabold shadow whitespace-nowrap" style={{ background:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,90%,92%)`, borderColor:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,55%)`, color:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,35%)` }}>🔥{speedMult.toFixed(1)}×</div>}
            <button onClick={() => speakMeaning(currentWord.meaning)} className="px-2 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">🔊</button>
          </div>
          {p2Powerup && <PowerupBadge type={p2Powerup} accentColor="#f97316" />}
          <div className="flex items-center gap-2 bg-white/95 rounded-2xl px-3 py-2 border-2 transition-all duration-200 shadow-sm"
            style={{
              borderColor:'#f97316',
              transform: p2BarEmphasis ? 'scale(1.15)' : 'scale(1)',
              boxShadow: p2BarEmphasis ? '0 0 0 4px rgba(249,115,22,0.35), 0 0 18px rgba(249,115,22,0.7)' : '0 2px 6px rgba(0,0,0,0.12)',
              zIndex: p2BarEmphasis ? 30 : undefined,
            }}>
            <span className="text-xs font-extrabold text-orange-600 whitespace-nowrap">{hn(p2Name)}</span>
            <div className="relative w-24 h-4 rounded-full overflow-hidden" style={{ background:'rgba(148,163,184,0.25)' }}>
              <div className="absolute inset-0 rounded-full transition-all duration-300" style={{ width:`${p2Fuel}%`, background:`linear-gradient(90deg, ${fuelColor(p2Fuel)}cc, ${fuelColor(p2Fuel)})` }}/>
            </div>
            <span className="text-xs font-extrabold text-orange-700 w-5 text-right">{p2Score}</span>
          </div>
        </div>
      )}

      {/* Target meaning banner */}
      {status === 'playing' && currentWord.meaning && <MeaningBanner meaning={currentWord.meaning} />}

      {status === 'playing' && renderBubbles(bubbles)}
      {status === 'playing' && renderCollectibles(collectibles)}
      {status === 'playing' && renderBullets(bullets)}
      {status === 'playing' && renderMines(mines)}
      {mineExplosions.map(e => (
        <div key={e.id} className="absolute pointer-events-none" style={{ left:`${e.x}%`, top:`${e.y}%`, transform:'translate(-50%,-50%)', zIndex:30 }}>
          <dotlottie-wc src="/sprites/explosion.json" autoplay style={{ width:120, height:120 } as React.CSSProperties} />
        </div>
      ))}

      {flash && <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: flash==='good'?'rgba(74,222,128,0.22)':'rgba(248,113,113,0.28)' }}/>}

      {status === 'playing' && <GlowOverlay glow={p1Glow} x={planePos.current.x} y={planePos.current.y} />}
      {status === 'playing' && is2p && <GlowOverlay glow={p2Glow} x={p2Pos.current.x} y={p2Pos.current.y} />}

      {status === 'playing' && p1HitPopup && (
        <div className="absolute pointer-events-none z-30" style={{ left:`${p1HitPopup.x}%`, top:`${p1HitPopup.y}%`, animation:'wf-score-pop 0.9s ease-out forwards', color:'#22c55e', fontSize:18, fontWeight:900, textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>+1 ⛽</div>
      )}
      {status === 'playing' && p2HitPopup && (
        <div className="absolute pointer-events-none z-30" style={{ left:`${p2HitPopup.x}%`, top:`${p2HitPopup.y}%`, animation:'wf-score-pop 0.9s ease-out forwards', color:'#f97316', fontSize:18, fontWeight:900, textShadow:'0 1px 4px rgba(0,0,0,0.9)', whiteSpace:'nowrap' }}>+1 ⛽</div>
      )}

      {status === 'playing' && (
        <div ref={planeRef} className="absolute pointer-events-none" style={{ left:`${planePos.current.x}%`, top:`${planePos.current.y}%`, transform:'translate(-50%,-50%)', zIndex:20 }}>
          {is2p && <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#3b82f6', whiteSpace:'nowrap' }}>{hn(p1Name)}</div>}
          {p1CrashedRef.current && p1CrashAnim === 'explosion' && <dotlottie-wc src="/sprites/explosion.json" autoplay style={{ width: 120, height: 120 } as React.CSSProperties} />}
          <div style={{ visibility: p1CrashedRef.current ? 'hidden' : 'visible' }}><JetPlane src={PLANES[p1Plane].url} shocked={p1Shocked} flameRef={p1FlameRef} /></div>
        </div>
      )}
      {status === 'playing' && is2p && (
        <div ref={p2PlaneRef} className="absolute pointer-events-none" style={{ left:`${p2Pos.current.x}%`, top:`${p2Pos.current.y}%`, transform:'translate(-50%,-50%)', zIndex:20 }}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#f97316', whiteSpace:'nowrap' }}>{hn(p2Name)}</div>
          {p2CrashedRef.current && p2CrashAnim === 'explosion' && <dotlottie-wc src="/sprites/explosion.json" autoplay style={{ width: 120, height: 120 } as React.CSSProperties} />}
          <div style={{ visibility: p2CrashedRef.current ? 'hidden' : 'visible' }}><JetPlane src={PLANES[isOnline ? p2RemotePlane : p2Plane].url} shocked={p2Shocked} flameRef={p2FlameRef} /></div>
        </div>
      )}

      {status === 'playing' && p1CrashAnim === 'parachute' && (
        <div className="absolute pointer-events-none" style={{ left: `${p1CrashPosRef.current.x}%`, top: `${p1CrashPosRef.current.y}%`, zIndex: 21, animation: 'wf-parachute-fall 8s linear forwards' }}>
          <dotlottie-wc src="/sprites/parachute.json" autoplay loop style={{ width: 80, height: 80 } as React.CSSProperties} />
        </div>
      )}
      {status === 'playing' && p2CrashAnim === 'parachute' && (
        <div className="absolute pointer-events-none" style={{ left: `${p2CrashPosRef.current.x}%`, top: `${p2CrashPosRef.current.y}%`, zIndex: 21, animation: 'wf-parachute-fall 8s linear forwards' }}>
          <dotlottie-wc src="/sprites/parachute.json" autoplay loop style={{ width: 80, height: 80 } as React.CSSProperties} />
        </div>
      )}

      {/* P1 joystick — shown in all modes */}
      {status === 'playing' && (
        <div className="absolute z-20" style={{ bottom: 20, left: 20 }}>
          <Joystick accentColor="#3b82f6" onKeys={k => {
            keysDown.current.ArrowUp = k.up; keysDown.current.ArrowDown = k.down;
            keysDown.current.ArrowLeft = k.left; keysDown.current.ArrowRight = k.right;
          }} />
        </div>
      )}
      {/* P1 fire button */}
      {status === 'playing' && p1Powerup && (!is2p || isOnline) && (
        <button className="absolute z-20 w-16 h-16 rounded-2xl text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
          style={{ bottom: 28, right: 20, background: '#3b82f6', border: '3px solid #2563eb' }}
          onPointerDown={e => { e.preventDefault(); fireP1Ref.current(); }}>
          💥
        </button>
      )}
      {/* P2 joystick + fire — local 2P mode */}
      {status === 'playing' && gameMode === '2p' && (
        <div className="absolute z-20" style={{ bottom: 20, right: 20 }}>
          <Joystick accentColor="#f97316" onKeys={k => {
            keysDown.current.KeyW = k.up; keysDown.current.KeyS = k.down;
            keysDown.current.KeyA = k.left; keysDown.current.KeyD = k.right;
          }} />
        </div>
      )}
      {status === 'playing' && gameMode === '2p' && p2Powerup && (
        <button className="absolute z-20 w-16 h-16 rounded-2xl text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
          style={{ bottom: 148, right: 20, background: '#f97316', border: '3px solid #ea580c' }}
          onPointerDown={e => { e.preventDefault(); fireP2Ref.current(); }}>
          💥
        </button>
      )}

      {/* ════ OVERLAYS ════ */}

      {status === 'start' && overlay(
        <>
          {/* Pilot */}
          <div className="flex flex-col items-center justify-center mb-4">
            <dotlottie-wc src="/sprites/pilot.json" autoplay loop style={{ width: 120, height: 120 } as React.CSSProperties} />
            <p className="text-base font-extrabold text-sky-700 mt-1 text-center">Your pilot is ready to fly, Captain!</p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 justify-center mb-4 p-1 rounded-2xl bg-slate-100">
            {(['1p','2p','2p-online'] as const).map(m => (
              <button key={m} onClick={() => { setGameMode(m); if (m !== '2p-online') setOnlineRoomId(null); setP2Joined(false); setLinkCopied(false); }}
                className="flex-1 py-1.5 rounded-xl font-extrabold text-xs transition-all"
                style={{ background:gameMode===m?'white':'transparent', color:gameMode===m?'#0ea5e9':'#94a3b8', boxShadow:gameMode===m?'0 1px 4px rgba(0,0,0,0.10)':'none' }}>
                {m==='1p'?'1P':m==='2p'?'👥 2P':'🌐 Online'}
              </button>
            ))}
          </div>

          {/* Name */}
          <div className="mb-3">
            <input value={p1Name} onChange={e => setP1Name(e.target.value.slice(0,16))} maxLength={16}
              className="w-full px-3 py-2 rounded-xl border-2 border-sky-200 text-sm font-bold text-center text-sky-700 bg-sky-50 focus:outline-none focus:border-sky-400"
              placeholder="Your name" />
          </div>

          {/* Aircraft grid — no scroll */}
          <VehiclePicker selected={p1Plane} onSelect={setP1Plane} accentColor="#3b82f6" />

          {/* Online room info */}
          {gameMode === '2p-online' && onlineRoomId && (
            <div className="mt-3 text-left">
              <p className="text-[11px] font-bold text-slate-500 mb-1">Share this link with Player 2:</p>
              <div className="flex gap-1.5 items-center">
                <div className="flex-1 bg-slate-100 rounded-lg px-2 py-1.5 text-[10px] text-slate-500 font-mono truncate border border-slate-200">{shareLink}</div>
                <button onClick={copyLink} className="px-2.5 py-1.5 rounded-lg text-xs font-extrabold transition-all active:scale-95 flex-shrink-0" style={{ background:linkCopied?'#22c55e':'#3b82f6', color:'white' }}>{linkCopied?'✓ Copied':'Copy'}</button>
              </div>
              <div className="mt-2 flex flex-col items-center gap-1">
                <button type="button" onClick={() => setQrOpen(true)} title="Tap to enlarge"
                  className="bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-transform cursor-pointer">
                  <QRCodeSVG value={shareLink} size={116} level="M" />
                </button>
                <p className="text-[10px] text-slate-400 font-semibold">Tap the QR to enlarge · scan to join 📱</p>
              </div>
              {p2Joined
                ? <p className="text-[11px] font-extrabold text-green-600 mt-1.5">✅ Player 2 joined! Ready to take off.</p>
                : <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"/>Waiting for Player 2…</p>}
            </div>
          )}

          {/* Enlarged QR overlay */}
          {qrOpen && (
            <div onClick={() => setQrOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(8,15,30,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <div onClick={e => e.stopPropagation()} className="bg-white rounded-3xl p-5 shadow-2xl flex flex-col items-center gap-3">
                <QRCodeSVG value={shareLink} size={Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 90, 380)} level="M" />
                <p className="text-sm text-slate-600 font-bold">Scan to join as Player 2 ✈️</p>
              </div>
              <button onClick={() => setQrOpen(false)} className="mt-5 px-6 py-2.5 rounded-full bg-white text-slate-800 font-extrabold shadow-lg active:scale-95">Close ✕</button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {is2p && gameMode !== '2p-online' ? (
              <button onClick={() => setStatus('select_p2')} className="flex-1 py-3 rounded-2xl text-white font-black text-base shadow-lg active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#3b82f6,#6366f1)' }}>Next → P2 ✈️</button>
            ) : gameMode === '2p-online' ? (
              <button onClick={startGame} disabled={!p2Joined} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-black text-base shadow-xl active:scale-95 transition-all disabled:opacity-40" style={{ background:p2Joined?'linear-gradient(135deg,#ea580c,#f97316,#fb923c)':'#94a3b8', boxShadow:p2Joined?'0 4px 18px rgba(249,115,22,0.45)':'none' }}>
              <dotlottie-wc src="/sprites/airplane.json" autoplay loop style={{ width: 32, height: 32, filter: 'brightness(0) invert(1)' } as React.CSSProperties} />
              Take off!
            </button>
            ) : (
              <button onClick={startGame} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-black text-base shadow-xl active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#ea580c,#f97316,#fb923c)', boxShadow:'0 4px 18px rgba(249,115,22,0.45)' }}>
              <dotlottie-wc src="/sprites/airplane.json" autoplay loop style={{ width: 32, height: 32, filter: 'brightness(0) invert(1)' } as React.CSSProperties} />
              Take off!
            </button>
            )}
            <button onClick={onExit} className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold text-sm active:scale-95 transition-all hover:bg-slate-50">Back</button>
          </div>
        </>
      )}

      {status === 'select_p2' && overlay(
        <>
          <div className="flex items-center justify-center gap-3 mb-4">
            <dotlottie-wc src="/sprites/pilot.json" autoplay loop style={{ width: 44, height: 44 } as React.CSSProperties} />
            <div className="text-left">
              <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold text-white mb-0.5" style={{ background:'#f97316' }}>Player 2</div>
              <p className="text-[11px] text-slate-400 font-semibold">Choose your aircraft</p>
            </div>
          </div>
          <div className="mb-3">
            <input value={p2Name} onChange={e => setP2Name(e.target.value.slice(0,16))} maxLength={16}
              className="w-full px-3 py-2 rounded-xl border-2 border-orange-200 text-sm font-bold text-center text-orange-700 bg-orange-50 focus:outline-none focus:border-orange-400"
              placeholder="Player 2 name" />
          </div>
          <VehiclePicker selected={p2Plane} onSelect={setP2Plane} accentColor="#f97316" />
          <div className="flex gap-2 mt-4">
            <button onClick={startGame} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-black text-base shadow-xl active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#ea580c,#f97316,#fb923c)', boxShadow:'0 4px 18px rgba(249,115,22,0.45)' }}>
              <dotlottie-wc src="/sprites/airplane.json" autoplay loop style={{ width: 32, height: 32, filter: 'brightness(0) invert(1)' } as React.CSSProperties} />
              Take off!
            </button>
            <button onClick={() => setStatus('start')} className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold text-sm active:scale-95 transition-all hover:bg-slate-50">← Back</button>
          </div>
        </>
      )}

      {status === 'playing' && ((is2p && (p1Down || p2Down)) || (isP2 && (p1CrashedRemote || p2CrashedRemote))) && (() => {
        const p1IsDown = is2p ? p1Down : p1CrashedRemote;
        const p2IsDown = is2p ? p2Down : p2CrashedRemote;
        const downName = p1IsDown && !p2IsDown ? hn(p1Name) : !p1IsDown && p2IsDown ? hn(p2Name) : null;
        return (
          <div className="absolute bottom-20 left-1/2 z-30 flex items-center gap-3 rounded-2xl border-2 border-red-200 shadow-2xl px-4 py-3" style={{ transform:'translateX(-50%)', background:'rgba(255,255,255,0.97)', backdropFilter:'blur(6px)' }}>
            <span className="text-2xl">🪂</span>
            <span className="font-extrabold text-slate-700 text-sm whitespace-nowrap">{downName ? `${downName} is down!` : 'Both pilots down!'}</span>
            <button onClick={handleRestart} className="px-4 py-1.5 rounded-full font-extrabold text-white text-sm active:scale-95 transition-all shadow" style={{ background:'linear-gradient(135deg,#22c55e,#16a34a)' }}>🔄 Restart</button>
            <button onClick={onExit} className="px-3 py-1.5 rounded-full font-bold text-slate-500 border-2 border-slate-200 text-sm active:scale-95 transition-all">Exit</button>
          </div>
        );
      })()}

      {status === 'won' && overlay(
        is2p ? (() => {
          const r = twoPlayerResult(score, p2Score);
          return (<>
            <div className="text-5xl mb-2">{r.emoji}</div>
            <h3 className="text-2xl font-extrabold mb-3" style={{ color:r.color }}>{r.msg}</h3>
            <div className="flex gap-3 justify-center mb-5">
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor:'#3b82f6' }}><div className="text-xs font-extrabold text-blue-500 mb-1">{hn(p1Name)}</div><div className="text-3xl font-extrabold text-blue-700">{score}</div></div>
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor:'#f97316' }}><div className="text-xs font-extrabold text-orange-500 mb-1">{hn(p2Name)}</div><div className="text-3xl font-extrabold text-orange-600">{p2Score}</div></div>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {isOnline
                ? <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-green-500 hover:bg-green-600 text-white font-extrabold shadow-md active:scale-95 transition-all">🔄 Restart Game</button>
                : <button onClick={() => setStatus('start')} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>}
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
            </div>
          </>);
        })() : (<>
          <div className="text-6xl mb-3">🏆</div>
          <h3 className="text-3xl font-extrabold text-pink-500 mb-2">You Win!</h3>
          <p className="text-sm font-bold text-blue-600 mb-5">You found all {queue.length} words! Amazing flying! ✈️🌟</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </div>
        </>)
      )}

      {status === 'lost' && overlay(
        is2p ? (() => {
          const r = twoPlayerResult(score, p2Score);
          return (<>
            <div className="text-4xl mb-2">🪂</div>
            <h3 className="text-xl font-extrabold text-slate-600 mb-1">Both planes crashed!</h3>
            <h4 className="text-lg font-extrabold mb-3" style={{ color:r.color }}>{r.msg}</h4>
            <div className="flex gap-3 justify-center mb-5">
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor:'#3b82f6' }}><div className="text-xs font-extrabold text-blue-500 mb-1">{hn(p1Name)}</div><div className="text-3xl font-extrabold text-blue-700">{score}</div></div>
              <div className="flex-1 rounded-2xl border-2 py-3" style={{ borderColor:'#f97316' }}><div className="text-xs font-extrabold text-orange-500 mb-1">{hn(p2Name)}</div><div className="text-3xl font-extrabold text-orange-600">{p2Score}</div></div>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {isOnline
                ? <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-green-500 hover:bg-green-600 text-white font-extrabold shadow-md active:scale-95 transition-all">🔄 Restart Game</button>
                : <button onClick={() => setStatus('start')} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>}
              <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
            </div>
          </>);
        })() : (<>
          <div className="text-6xl mb-3">🪂</div>
          <h3 className="text-3xl font-extrabold text-slate-600 mb-2">Game Over</h3>
          <p className="text-sm font-bold text-slate-500 mb-5">Out of fuel! You found {score} / {queue.length} words. Try again!</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </div>
        </>)
      )}
    </div>
  );
};

export default WordFlightGame;
