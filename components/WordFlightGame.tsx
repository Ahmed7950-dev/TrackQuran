import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

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
const BUBBLE_SPEED          = 0.14;
const BUBBLE_SPEED_MAX_MULT = 2.4;
const PLANE_ACCEL           = 0.015;
const PLANE_MAX_VEL         = 0.40;
const PLANE_ACCEL_H         = 0.009;
const PLANE_MAX_VEL_H       = 0.317;
const PLANE_DRAG            = 0.975;
const PLANE_GRAVITY         = 0.003;
const BG_SCROLL_SPEED       = 120;
const ONLINE_SITE_URL       = 'https://www.lisanquran.com';
const BULLET_SPEED          = 1.8;
const BULLET_DAMAGE         = 9;
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
const PLANES = [
  { label: 'Private Plane',  url: 'https://img.icons8.com/external-soft-fill-juicy-fish/60/external-private-vehicles-soft-fill-soft-fill-juicy-fish.png' },
  { label: 'Single Engine',  url: 'https://img.icons8.com/external-soft-fill-juicy-fish/60/external-single-vehicles-soft-fill-soft-fill-juicy-fish.png' },
  { label: 'Dual Helicopter',url: 'https://img.icons8.com/color/48/dual-helicopter--v2.png' },
  { label: 'Med Helicopter', url: 'https://img.icons8.com/external-photo3ideastudio-lineal-color-photo3ideastudio/64/external-helicopter-emergency-photo3ideastudio-lineal-color-photo3ideastudio.png' },
  { label: 'Jet Bomber',     url: 'https://img.icons8.com/external-smashingstocks-flat-smashing-stocks/66/external-Jet-Plane-war-and-army-smashingstocks-flat-smashing-stocks-4.png' },
  { label: 'Classic Biplane',url: 'https://img.icons8.com/external-goofy-flat-kerismaker/96/external-Aircraft-transportation-obvious-flat-kerismaker.png' },
  { label: 'Vintage Plane',  url: 'https://img.icons8.com/external-flaticons-flat-flat-icons/64/external-aircraft-history-flaticons-flat-flat-icons-2.png' },
  { label: 'Fighter Jet',    url: 'https://img.icons8.com/external-flat-icons-pause-08/64/external-aircraft-transportation-flat-icons-pause-08-3.png' },
  { label: 'Avro 504',       url: 'https://img.icons8.com/color/48/avro-504-plane.png' },
  { label: 'Helicopter',     url: '/sprites/helicopter.gif' },
];

const JetPlane: React.FC<{ src: string; shocked?: boolean; flameRef?: React.MutableRefObject<HTMLDivElement | null> }> = ({ src, shocked, flameRef }) => (
  <div style={{ position: 'relative', display: 'inline-block', width: 90, height: 90 }}>
    <div ref={flameRef} className="wf-flame" style={{
      position: 'absolute', right: 84, top: '50%',
      width: 0, height: 18, opacity: 0,
      borderRadius: '60% 10% 10% 60%',
      background: 'radial-gradient(ellipse at 90% 50%, rgba(255,255,255,0.92) 0%, #fde68a 22%, #f97316 52%, #dc2626 78%, transparent 100%)',
      transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 0,
    }} />
    <img src={src} alt="vehicle" width={90} height={90} style={{
      display: 'block', position: 'relative', zIndex: 1,
      filter: shocked
        ? 'drop-shadow(0 0 12px #60a5fa) drop-shadow(0 0 6px #93c5fd) brightness(0.8) saturate(0.5)'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
    }} />
  </div>
);

const VehiclePicker: React.FC<{ selected: number; onSelect: (i: number) => void; accentColor: string }> = ({ selected, onSelect, accentColor }) => (
  <div className="grid grid-cols-5 gap-2 w-full">
    {PLANES.map((p, i) => (
      <button key={i} onClick={() => onSelect(i)}
        className="flex items-center justify-center p-2 rounded-2xl border-2 transition-all select-none"
        style={{
          borderColor: selected === i ? accentColor : '#e8edf2',
          background:  selected === i ? `${accentColor}15` : '#f8fafc',
          boxShadow:   selected === i ? `0 0 0 3px ${accentColor}40, 0 4px 14px ${accentColor}25` : '0 1px 3px rgba(0,0,0,0.06)',
          transform:   selected === i ? 'scale(1.08)' : 'scale(1)',
        }}>
        <img src={p.url} alt={p.label} width={46} height={46} style={{ display: 'block' }} />
      </button>
    ))}
  </div>
);

const PowerupBadge: React.FC<{ type: CollectibleType; accentColor: string }> = ({ type, accentColor }) => (
  <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl border-2 shadow-sm"
    style={{ background: `${accentColor}15`, borderColor: accentColor }}>
    <img src={COLLECTIBLE_ICONS[type]} alt={type} width={22} height={22} />
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
  const [p1Shocked, setP1Shocked]       = useState(false);
  const [p2Shocked, setP2Shocked]       = useState(false);

  const [p1Name, setP1Name]             = useState('Player 1');
  const [p2Name, setP2Name]             = useState('Player 2');
  const [p1NameReceived, setP1NameReceived] = useState('Player 1');

  const [p1Glow, setP1Glow] = useState<'hit'|'collectible'|'mine'|null>(null);
  const [p2Glow, setP2Glow] = useState<'hit'|'collectible'|'mine'|null>(null);
  const [p1HitPopup, setP1HitPopup] = useState<{x:number;y:number}|null>(null);
  const [p2HitPopup, setP2HitPopup] = useState<{x:number;y:number}|null>(null);

  const [onlineRoomId, setOnlineRoomId]     = useState<string|null>(null);
  const [p2Joined, setP2Joined]             = useState(false);
  const [p2RemotePlane, setP2RemotePlane]   = useState(1);
  const [linkCopied, setLinkCopied]         = useState(false);
  const [p2Waiting, setP2Waiting]           = useState(false);
  const [p1CrashedRemote, setP1CrashedRemote] = useState(false);
  const [p2CrashedRemote, setP2CrashedRemote] = useState(false);

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
      @keyframes wf-flame-flicker { 0%{transform:translateY(-50%) scaleY(1) skewY(0deg);}25%{transform:translateY(-53%) scaleY(1.14) skewY(-3deg);}50%{transform:translateY(-47%) scaleY(0.88) skewY(2deg);}75%{transform:translateY(-52%) scaleY(1.1) skewY(-1deg);}100%{transform:translateY(-50%) scaleY(1) skewY(0deg);} }
      .wf-bubble      { animation: wf-float         3.2s ease-in-out infinite; }
      .wf-popped      { animation: wf-pop           .45s ease-out    forwards; }
      .wf-collectible { animation: wf-collectible   2.4s ease-in-out infinite; }
      .wf-mine        { animation: wf-mine-pulse     1.4s ease-in-out infinite; }
      .wf-shock-overlay{ animation: wf-shock-flash  .25s ease-in-out infinite; }
      .wf-flame       { animation: wf-flame-flicker .13s ease-in-out infinite; }
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
    p1FireCooldownRef.current = now + 350;
    const is2pNow = gameModeRef.current === '2p' || gameModeRef.current === '2p-online';
    if (powerup === 'weapon') {
      if (!is2pNow || now > p1WeaponUntilRef.current) { p1PowerupRef.current = null; setP1Powerup(null); return; }
      const s = planePos.current, t = p2Pos.current;
      const dx = t.x - s.x, dy = t.y - s.y, dist = Math.sqrt(dx*dx+dy*dy)||1;
      setBullets(prev => [...prev, { id:`b1-${now}`, owner:1 as const, x:s.x, y:s.y, vx:dx/dist*BULLET_SPEED, vy:dy/dist*BULLET_SPEED, active:true }]);
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
    p2FireCooldownRef.current = now + 350;
    if (powerup === 'weapon') {
      if (now > p2WeaponUntilRef.current) { p2PowerupRef.current = null; setP2Powerup(null); return; }
      const s = p2Pos.current, t = planePos.current;
      const dx = t.x-s.x, dy = t.y-s.y, dist = Math.sqrt(dx*dx+dy*dy)||1;
      setBullets(prev => [...prev, { id:`b2-${now}`, owner:2 as const, x:s.x, y:s.y, vx:dx/dist*BULLET_SPEED, vy:dy/dist*BULLET_SPEED, active:true }]);
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
      } else {
        setP2Fuel(f => Math.min(START_FUEL, f + FUEL_GAIN)); setP2Score(s => s + 1);
        triggerGlow(2, 'hit');
        setP2HitPopup({ x: p2Pos.current.x, y: p2Pos.current.y });
        setTimeout(() => setP2HitPopup(null), 900);
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
        const sp1 = Math.sqrt(v.x*v.x+v.y*v.y)/PLANE_MAX_VEL;
        if (p1FlameRef.current) {
          p1FlameRef.current.style.width   = `${Math.round(4+sp1*46)}px`;
          p1FlameRef.current.style.height  = `${Math.round(14+sp1*20)}px`;
          p1FlameRef.current.style.opacity = `${(0.25+sp1*0.75).toFixed(2)}`;
        }
      } else if (p1FlameRef.current) { p1FlameRef.current.style.opacity = '0'; }

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
        const sp2 = Math.sqrt(v2.x*v2.x+v2.y*v2.y)/PLANE_MAX_VEL;
        if (p2FlameRef.current) {
          p2FlameRef.current.style.width   = `${Math.round(4+sp2*46)}px`;
          p2FlameRef.current.style.height  = `${Math.round(14+sp2*20)}px`;
          p2FlameRef.current.style.opacity = `${(0.25+sp2*0.75).toFixed(2)}`;
        }
      } else if (p2FlameRef.current) { p2FlameRef.current.style.opacity = '0'; }

      for (const b of bubblesRef.current) {
        if (b.popped) continue;
        b.x += b.vx;
        if (b.x < -16) b.x = 108 + Math.random() * 25;
        const el = bubbleDomRefs.current.get(b.id);
        if (el) el.style.left = `${b.x}%`;
      }

      if (!collidingRef.current && !p1CrashedRef.current) {
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p.x, dy = (b.y - p.y) * 0.65;
          if (Math.sqrt(dx*dx+dy*dy) < BUBBLE_RADIUS) {
            collidingRef.current = true; handleHitRef.current(b, 1); break;
          }
        }
      }

      if (is2pNow && !p2ColRef.current && !p2CrashedRef.current) {
        const p2 = p2Pos.current;
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p2.x, dy = (b.y - p2.y) * 0.65;
          if (Math.sqrt(dx*dx+dy*dy) < BUBBLE_RADIUS) {
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

      if (p2ViewP1PlaneRef.current) {
        p2ViewP1PlaneRef.current.style.left      = `${payload.p1.x}%`;
        p2ViewP1PlaneRef.current.style.top       = `${payload.p1.y}%`;
        p2ViewP1PlaneRef.current.style.transform = `translate(-50%,-50%) rotate(${payload.p1.tilt}deg)`;
      }
      if (p2ViewP2PlaneRef.current) {
        p2ViewP2PlaneRef.current.style.left      = `${payload.p2.x}%`;
        p2ViewP2PlaneRef.current.style.top       = `${payload.p2.y}%`;
        p2ViewP2PlaneRef.current.style.transform = `translate(-50%,-50%) rotate(${payload.p2.tilt}deg)`;
      }
      const applyFlame = (ref: React.MutableRefObject<HTMLDivElement|null>, sp: number, crashed: boolean) => {
        if (!ref.current) return;
        if (crashed) { ref.current.style.opacity = '0'; return; }
        ref.current.style.width   = `${Math.round(4+sp*46)}px`;
        ref.current.style.height  = `${Math.round(14+sp*20)}px`;
        ref.current.style.opacity = `${(0.25+sp*0.75).toFixed(2)}`;
      };
      applyFlame(p2ViewP1FlameRef, payload.p1Speed ?? 0, payload.p1.crashed);
      applyFlame(p2ViewP2FlameRef, payload.p2Speed ?? 0, payload.p2.crashed);
      if (p2FuelBar1Ref.current) { p2FuelBar1Ref.current.style.width = `${payload.fuels[0]}%`; p2FuelBar1Ref.current.style.background = fuelColor(payload.fuels[0]); }
      if (p2FuelBar2Ref.current) { p2FuelBar2Ref.current.style.width = `${payload.fuels[1]}%`; p2FuelBar2Ref.current.style.background = fuelColor(payload.fuels[1]); }
      if (p2Score1SpanRef.current) p2Score1SpanRef.current.textContent = String(payload.scores[0]);
      if (p2Score2SpanRef.current) p2Score2SpanRef.current.textContent = String(payload.scores[1]);
      for (const b of payload.bubbles) {
        if (b.popped) continue;
        const el = bubbleDomRefs.current.get(b.id);
        if (el) el.style.left = `${b.x}%`;
      }
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
    <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ background:'rgba(8,24,70,0.62)', backdropFilter:'blur(6px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-sky-100 px-5 py-5 text-center max-w-sm mx-4 w-full overflow-y-auto" style={{ maxHeight:'92vh' }}>{children}</div>
    </div>
  );
  const hn = (n: string) => n.length > 10 ? n.slice(0, 9) + '…' : n;
  const twoPlayerResult = (s1: number, s2: number, n1 = p1Name, n2 = p2Name) => {
    if (s1 > s2) return { emoji:'🏆', msg:`${n1} Wins! 🎉`, color:'#3b82f6' };
    if (s2 > s1) return { emoji:'🏆', msg:`${n2} Wins! 🎉`, color:'#f97316' };
    return { emoji:'🤝', msg:"It's a Draw!", color:'#8b5cf6' };
  };
  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/word-flight/${onlineRoomId}` : '';
  const copyLink  = () => { navigator.clipboard.writeText(shareLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }); };

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
      <img src={COLLECTIBLE_ICONS[c.type]} alt={c.type} width={46} height={46} style={{ display:'block' }} />
    </div>
  ));

  const renderBullets = (buls: Bullet[], isP2View = false) => buls.filter(b => b.active).map(b => (
    <div key={b.id}
      ref={el => { const map = isP2View ? p2BulletDomRefs.current : bulletDomRefs.current; if (el) map.set(b.id, el); else map.delete(b.id); }}
      className="absolute pointer-events-none"
      style={{ left:`${b.x}%`, top:`${b.y}%`, transform:'translate(-50%,-50%)', width:14, height:14, borderRadius:'50%', zIndex:25,
        background: b.owner === 1 ? '#3b82f6' : '#f97316',
        boxShadow: b.owner === 1 ? '0 0 10px #93c5fd,0 0 4px #60a5fa' : '0 0 10px #fdba74,0 0 4px #fb923c' }} />
  ));

  const renderMines = (ms: Mine[]) => ms.filter(m => m.active).map(m => (
    <div key={m.id} className="absolute pointer-events-none z-10 wf-mine" style={{ left:`${m.x}%`, top:`${m.y}%`, transform:'translate(-50%,-50%)' }}>
      <div style={{ width:40, height:40, borderRadius:'50%', background:'radial-gradient(circle at 38% 35%,#555,#111)', border:'3px solid #dc2626', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, boxShadow:'0 0 14px rgba(220,38,38,0.85)' }}>💣</div>
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
        <div ref={bgDivRef} className="absolute inset-0 pointer-events-none" style={{ zIndex:0, backgroundImage:'url(/sprites/airplane-bg.png)', backgroundRepeat:'repeat-x', backgroundSize:'auto 100%' }} />

        {!p2Waiting && status === 'start' && overlay(
          <>
            <div className="flex items-center justify-center gap-3 mb-4">
              <img src="https://img.icons8.com/external-kosonicon-flat-kosonicon/64/external-pilot-airport-kosonicon-flat-kosonicon.png" alt="pilot" width={44} height={44} style={{ opacity:0.85 }} />
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
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div ref={p2FuelBar1Ref} className="h-full rounded-full" style={{ width:'100%', background:'#22c55e' }}/></div>
              <span ref={p2Score1SpanRef} className="text-[11px] font-extrabold text-blue-700 ml-1">0</span>
            </div>
            {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={() => { if (latestSnapRef.current) speakMeaning(latestSnapRef.current.targetMeaning); }} className="px-2.5 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">🔊</button>
            </div>
            {p2Powerup && <PowerupBadge type={p2Powerup} accentColor="#f97316" />}
            <div className="flex items-center gap-1.5 bg-white/90 rounded-full px-2.5 py-1.5 border-2 shadow flex-1 min-w-0" style={{ borderColor:'#f97316' }}>
              <span ref={p2HudP2NameRef} className="text-[11px] font-extrabold text-orange-600 whitespace-nowrap">{hn(p2Name)} ⛽</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div ref={p2FuelBar2Ref} className="h-full rounded-full" style={{ width:'100%', background:'#22c55e' }}/></div>
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

        {status === 'playing' && (
          <div ref={p2ViewP1PlaneRef} className="absolute pointer-events-none" style={{ left:'14%', top:'32%', transform:'translate(-50%,-50%)', zIndex:20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#3b82f6', whiteSpace:'nowrap' }}>P1</div>
            {p1CrashedRemote ? <div style={{ fontSize:60, lineHeight:1 }}>💥</div> : <JetPlane src={p1PlaneUrl} shocked={p1Shocked} flameRef={p2ViewP1FlameRef} />}
          </div>
        )}
        {status === 'playing' && (
          <div ref={p2ViewP2PlaneRef} className="absolute pointer-events-none" style={{ left:'14%', top:'68%', transform:'translate(-50%,-50%)', zIndex:20 }}>
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#f97316', whiteSpace:'nowrap' }}>YOU</div>
            {p2CrashedRemote ? <div style={{ fontSize:60, lineHeight:1 }}>💥</div> : <JetPlane src={p2PlaneUrl} shocked={p2Shocked} flameRef={p2ViewP2FlameRef} />}
          </div>
        )}

        {status === 'playing' && p2Glow && latestSnapRef.current && <GlowOverlay glow={p2Glow} x={latestSnapRef.current.p2.x} y={latestSnapRef.current.p2.y} />}

        {status === 'playing' && (
          <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction:'ltr' }}>
            <div/><button {...holdBtnP2('up')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▲</button><div/>
            <button {...holdBtnP2('left')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">◀</button>
            <button {...holdBtnP2('down')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▼</button>
            <button {...holdBtnP2('right')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-orange-300 text-orange-700 text-lg font-bold shadow-md active:bg-orange-100 select-none">▶</button>
          </div>
        )}
        {status === 'playing' && p2Powerup && (
          <button className="absolute bottom-16 left-4 z-20 w-16 h-16 rounded-2xl border-3 text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
            style={{ background:'#f97316', border:'3px solid #ea580c' }}
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
      <div ref={bgDivRef} className="absolute inset-0 pointer-events-none" style={{ zIndex:0, backgroundImage:'url(/sprites/airplane-bg.png)', backgroundRepeat:'repeat-x', backgroundSize:'auto 100%' }} />

      {status === 'playing' && p2Shocked && <div className="absolute pointer-events-none wf-shock-overlay" style={{ right:0, top:0, bottom:0, width:'50%', background:'rgba(147,197,253,0.3)', zIndex:5 }}/>}
      {status === 'playing' && p1Shocked && <div className="absolute pointer-events-none wf-shock-overlay" style={{ left:0, top:0, bottom:0, width:'50%', background:'rgba(147,197,253,0.3)', zIndex:5 }}/>}

      {/* 1P HUD */}
      {status === 'playing' && !is2p && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
          <button onClick={onExit} className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">← Exit</button>
          <div className="flex items-center gap-1.5 flex-1 max-w-[200px] bg-white/90 rounded-full px-3 py-1.5 border-2 border-sky-200 shadow">
            <span className="text-sm">⛽</span>
            <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width:`${fuel}%`, background:fuelColor(fuel) }}/></div>
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
          <div className="flex items-center gap-1 bg-white/90 rounded-full px-2 py-1.5 border-2 shadow" style={{ borderColor:'#3b82f6' }}>
            <span className="text-[10px] font-extrabold text-blue-600 whitespace-nowrap">{hn(p1Name)} ⛽</span>
            <div className="w-16 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width:`${fuel}%`, background:fuelColor(fuel) }}/></div>
            <span className="text-[10px] font-extrabold text-blue-700">{score}</span>
          </div>
          {p1Powerup && <PowerupBadge type={p1Powerup} accentColor="#3b82f6" />}
          <div className="flex gap-1 flex-shrink-0 flex-1 justify-center">
            {speedMult >= 1.15 && <div className="px-1.5 py-1.5 rounded-full border-2 text-[10px] font-extrabold shadow whitespace-nowrap" style={{ background:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,90%,92%)`, borderColor:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,55%)`, color:`hsl(${Math.max(0,30-(speedMult-1)*30)}deg,80%,35%)` }}>🔥{speedMult.toFixed(1)}×</div>}
            <button onClick={() => speakMeaning(currentWord.meaning)} className="px-2 py-1.5 rounded-full bg-amber-400 border-2 border-amber-500 text-white text-sm font-bold shadow active:scale-95">🔊</button>
          </div>
          {p2Powerup && <PowerupBadge type={p2Powerup} accentColor="#f97316" />}
          <div className="flex items-center gap-1 bg-white/90 rounded-full px-2 py-1.5 border-2 shadow" style={{ borderColor:'#f97316' }}>
            <span className="text-[10px] font-extrabold text-orange-600 whitespace-nowrap">{hn(p2Name)} ⛽</span>
            <div className="w-16 h-2.5 rounded-full bg-slate-200 overflow-hidden"><div className="h-full rounded-full transition-all duration-300" style={{ width:`${p2Fuel}%`, background:fuelColor(p2Fuel) }}/></div>
            <span className="text-[10px] font-extrabold text-orange-700">{p2Score}</span>
          </div>
        </div>
      )}

      {/* Target meaning banner */}
      {status === 'playing' && currentWord.meaning && <MeaningBanner meaning={currentWord.meaning} />}

      {status === 'playing' && renderBubbles(bubbles)}
      {status === 'playing' && renderCollectibles(collectibles)}
      {status === 'playing' && renderBullets(bullets)}
      {status === 'playing' && renderMines(mines)}

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
          {p1CrashedRef.current ? <div style={{ fontSize:60, lineHeight:1 }}>💥</div> : <JetPlane src={PLANES[p1Plane].url} shocked={p1Shocked} flameRef={p1FlameRef} />}
        </div>
      )}
      {status === 'playing' && is2p && (
        <div ref={p2PlaneRef} className="absolute pointer-events-none" style={{ left:`${p2Pos.current.x}%`, top:`${p2Pos.current.y}%`, transform:'translate(-50%,-50%)', zIndex:20 }}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-extrabold text-white px-1.5 rounded-full" style={{ background:'#f97316', whiteSpace:'nowrap' }}>{hn(p2Name)}</div>
          {p2CrashedRef.current ? <div style={{ fontSize:60, lineHeight:1 }}>💥</div> : <JetPlane src={PLANES[isOnline ? p2RemotePlane : p2Plane].url} shocked={p2Shocked} flameRef={p2FlameRef} />}
        </div>
      )}

      {status === 'playing' && !is2p && (
        <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction:'ltr' }}>
          <div/><button {...holdBtn('ArrowUp')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▲</button><div/>
          <button {...holdBtn('ArrowLeft')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">◀</button>
          <button {...holdBtn('ArrowDown')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▼</button>
          <button {...holdBtn('ArrowRight')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▶</button>
        </div>
      )}
      {status === 'playing' && p1Powerup && (!is2p || isOnline) && (
        <button className="absolute bottom-16 left-4 z-20 w-16 h-16 rounded-2xl text-white text-2xl font-extrabold shadow-lg active:scale-90 transition-all select-none"
          style={{ background:'#3b82f6', border:'3px solid #2563eb' }}
          onPointerDown={e => { e.preventDefault(); fireP1Ref.current(); }}>💥</button>
      )}

      {/* ════ OVERLAYS ════ */}

      {status === 'start' && overlay(
        <>
          {/* Pilot + title */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="https://img.icons8.com/external-kosonicon-flat-kosonicon/64/external-pilot-airport-kosonicon-flat-kosonicon.png" alt="pilot" width={48} height={48} />
            <div className="text-left">
              <h3 className="text-xl font-black text-sky-700 leading-tight">Word Flight!</h3>
              <p className="text-[11px] text-slate-400 font-semibold">{words.length} words · hear it, find it</p>
            </div>
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
              {p2Joined
                ? <p className="text-[11px] font-extrabold text-green-600 mt-1.5">✅ Player 2 joined! Ready to take off.</p>
                : <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin"/>Waiting for Player 2…</p>}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {is2p && gameMode !== '2p-online' ? (
              <button onClick={() => setStatus('select_p2')} className="flex-1 py-3 rounded-2xl text-white font-black text-base shadow-lg active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#3b82f6,#6366f1)' }}>Next → P2 ✈️</button>
            ) : gameMode === '2p-online' ? (
              <button onClick={startGame} disabled={!p2Joined} className="flex-1 py-3 rounded-2xl text-white font-black text-base shadow-lg active:scale-95 transition-all disabled:opacity-40" style={{ background:p2Joined?'linear-gradient(135deg,#f97316,#fb923c)':'#94a3b8' }}>Take off! 🚀</button>
            ) : (
              <button onClick={startGame} className="flex-1 py-3 rounded-2xl text-white font-black text-base shadow-lg active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#f97316,#fb923c)' }}>Take off! 🚀</button>
            )}
            <button onClick={onExit} className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold text-sm active:scale-95 transition-all hover:bg-slate-50">Back</button>
          </div>
        </>
      )}

      {status === 'select_p2' && overlay(
        <>
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src="https://img.icons8.com/external-kosonicon-flat-kosonicon/64/external-pilot-airport-kosonicon-flat-kosonicon.png" alt="pilot" width={44} height={44} style={{ opacity:0.85 }} />
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
            <button onClick={startGame} className="flex-1 py-3 rounded-2xl text-white font-black text-base shadow-lg active:scale-95 transition-all" style={{ background:'linear-gradient(135deg,#f97316,#fb923c)' }}>Take off! 🚀</button>
            <button onClick={() => setStatus('start')} className="px-5 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-bold text-sm active:scale-95 transition-all hover:bg-slate-50">← Back</button>
          </div>
        </>
      )}

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
