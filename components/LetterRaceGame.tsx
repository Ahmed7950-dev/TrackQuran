import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';
import { RunnerStage, PortraitStage, preloadRaceModels, type RunnerPose, type RunnerModel } from './letterRaceStage';

// ─────────────────────────────────────────────────────────────────────────────
// Letter Race — a top-view keyboard race for the Arabic alphabet: 2 players
// on one keyboard, or an ONLINE ROOM of up to 8 — everyone joins with the
// same share link / QR code, picks a racer and plays together.
//
// Both players hear a letter, then race from the bottom line to the letter row
// at the top. HOLDING W (left player) / ↑ (right player) makes you run;
// HOLDING A/D vs ←/→ steers through a full 360°. Z / N throws a tackle: a
// fast forward lunge that knocks the opponent down for 3 seconds on contact —
// and if they were carrying the letter, they DROP it: it tumbles onto the
// grass ahead of them and either player can scoop it up. A well-timed jump
// (X / M) leaps clean over the tackle and keeps the letter safe. Reaching the
// correct letter grabs it automatically; first to carry it back across the
// bottom line wins the round. Characters are live 3D models — letterRaceStage.
//
// Uses the same audio files as Letter Flight (letterAudioUrl + TTS fallback).
// ─────────────────────────────────────────────────────────────────────────────

const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif" };

type LetterForm = 'isolated' | 'initial' | 'medial' | 'final';
function getLetterInForm(letter: string, form: LetterForm): string {
  switch (form) {
    case 'initial': return `${letter}‍`;
    case 'medial':  return `‍${letter}‍`;
    case 'final':   return `‍${letter}`;
    default:        return `‌${letter}‌`;
  }
}

// Field coordinate space: x and y in 0..100 (percent of the play field).
const LETTER_Y  = 14;   // y of the letter row (players stop here)
const START_Y   = 89;   // y of the start/finish line — matches the checkered line DRAWN in the field image (center ≈90%)
const RUN_ACCEL = 0.016; // per-frame acceleration while the run key is HELD
const MAX_SPEED = 0.13;  // cap (%/frame) — deliberately slow, high pressure
const FRICTION  = 0.88;  // per-frame decay — stop mashing and you stop quickly
const CARRY_SLOW = 0.78; // carrying the letter caps run speed at 78% — chasers can catch up
// Steering turns the HEADING (which way "forward" points), not a sideways jump.
// Steering: HOLD the turn key to rotate freely through a full 360°.
const ROT_PER_FRAME = 3.6;   // degrees per frame ≈ 216°/s
// Tackle: a fast forward lunge; touching the opponent knocks them down.
const TACKLE_MS       = 400;   // dash duration — a short, close-range lunge
const TACKLE_SPEED    = 0.17;  // dash speed (~half the lunge distance of the first cut)
const TACKLE_COOLDOWN = 3000;
const TACKLE_REACH    = 5.5;   // contact distance that fells the opponent
const FALL_MS         = 3000;  // how long the tackled player stays down
// Jump: dodge a tackle by being AIRBORNE when it connects. The clip is ~1.0s
// (31f Mixamo "Jump"); only the middle leap section grants immunity, so the
// dodge takes real timing.
const JUMP_ANIM_MS = 1030;
const JUMP_AIR_FROM = 200;   // airborne (immune) window inside the jump…
const JUMP_AIR_TO   = 800;   // …relative to the jump start
const JUMP_CD_MS    = 1500;  // next jump allowed this long after the last one
const GRAB_X    = 4.4;  // horizontal reach to grab a letter box
const STEAL_GRACE = 900; // ms after a grab/pickup during which a tackle can't force a drop
// Dropped letter: a landed tackle makes the carrier LOSE the letter — it
// tumbles a short way up-field and sits on the grass until someone scoops it.
const DROP_TOSS      = 8;    // how far up-field the letter tumbles (%)
const DROP_PICKUP_D  = 5;    // reach to scoop a dropped letter
const DROP_SETTLE_MS = 350;  // the letter can't be scooped while still tumbling
const ROUNDS_TO_WIN = 5;

const BOX_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf', '#c084fc', '#4ade80', '#38bdf8'];

interface RacePlayer {
  x: number; y: number;
  speed: number;          // forward speed from mashing
  carrying: boolean;
  carrySince: number;     // when they picked up / stole the letter (min-carry before a win)
  wrongBuzzAt: number;    // throttle for wrong-letter feedback
  heading: number;        // absolute direction in degrees (0 = up-screen, +clockwise, full 360°)
  tackleUntil: number;    // mid-tackle-dash until this time
  tackleCd: number;       // next tackle allowed after this time
  fallenUntil: number;    // knocked down until this time (no input, no movement)
  tackleHit: boolean;     // this dash already felled someone
  jumpAt: number;         // when the current/last jump started (-∞ = never)
}
interface LetterBox { letter: string; x: number; isTarget: boolean; taken: boolean; wiggleAt: number; color: string }

// The racer — a Mixamo character rendered as a REAL-TIME 3D model (three.js,
// public/models/runner.glb: run / tackle / trip clips) in letterRaceStage.ts,
// so it rotates through a true 360° as players steer. Both players run the
// SAME character; Player 2 wears a teal tint (hue-rotate on sprites/texture).
const P2_TINT = 'hue-rotate(165deg)';
// Selectable racers — each is a GLB with the same four clips (run / tackle /
// trip / jump). The fennec is native Mixamo; the robot is a Tripo rig with
// the clips retargeted onto it in Blender.
// Field backgrounds — one is picked at random each time the game opens. All
// three have the checkered finish line painted at the same field-% (~89), so
// START_Y works unchanged on every variant.
const FIELDS = [
  '/sprites/race-field-1.jpg?v=1',
  '/sprites/race-field-2.jpg?v=1',
  '/sprites/race-field-3.jpg?v=1',
];

const CHARACTERS = [
  { key: 'fennec', name: 'Sunny',  model: '/models/runner.glb?v=4', scale: 1,    portrait: '/sprites/race-runner-front.png?v=2', face: '/sprites/profile-fennec.jpg?v=1' },
  { key: 'panda',  name: 'Panda',  model: '/models/panda.glb?v=6',  scale: 0.8,  portrait: '/sprites/race-panda-front.png?v=2', face: '/sprites/profile-panda.jpg?v=1' },
  { key: 'mario',  name: 'Mario',  model: '/models/mario.glb?v=4',      scale: 0.85, portrait: '/sprites/race-mario-front.png?v=1', face: '/sprites/profile-mario.jpg?v=1' },
  { key: 'dbz',      name: 'Vegeta', model: '/models/dbz.glb?v=4',      scale: 0.9,  portrait: '/sprites/race-dbz-front.png?v=1', face: '/sprites/profile-dbz.jpg?v=1' },
  { key: 'anime',    name: 'Itachi', model: '/models/anime.glb?v=4',    scale: 0.72, portrait: '/sprites/race-anime-front.png?v=1', face: '/sprites/profile-anime.jpg?v=1' },
  { key: 'cat',      name: 'Kitty',  model: '/models/cat.glb?v=4',      scale: 0.85, portrait: '/sprites/race-cat-front.png?v=1', face: '/sprites/profile-cat.jpg?v=1' },
  { key: 'cartoon',  name: 'Banana', model: '/models/cartoon.glb?v=4',  scale: 0.9,  portrait: '/sprites/race-cartoon-front.png?v=1', face: '/sprites/profile-cartoon.jpg?v=1' },
  { key: 'fox',      name: 'Foxy',   model: '/models/fox.glb?v=4',      scale: 0.9,  portrait: '/sprites/race-fox-front.png?v=1', face: '/sprites/profile-fox.jpg?v=1' },
  { key: 'vader',    name: 'Vader',  model: '/models/vader.glb?v=4',    scale: 0.95, portrait: '/sprites/race-vader-front.png?v=1', face: '/sprites/profile-vader.jpg?v=1' },
  { key: 'lion',     name: 'Leo',    model: '/models/lion.glb?v=4',     scale: 0.9,  portrait: '/sprites/race-lion-front.png?v=1', face: '/sprites/profile-lion.jpg?v=1' },
  { key: 'stylized', name: 'Max',    model: '/models/stylized.glb?v=4', scale: 0.85, portrait: '/sprites/race-stylized-front.png?v=1', face: '/sprites/profile-stylized.jpg?v=1' },
  { key: 'spiderman', name: 'Spidey', model: '/models/spiderman.glb?v=2', scale: 0.9, portrait: '/sprites/race-spiderman-front.png?v=1', face: '/sprites/profile-spiderman.jpg?v=1' },
  { key: 'chibi',     name: 'Mei',    model: '/models/chibi.glb?v=2',     scale: 0.78, portrait: '/sprites/race-chibi-front.png?v=1', face: '/sprites/profile-chibi.jpg?v=1' },
  { key: 'tiger',     name: 'Namir',  model: '/models/tiger.glb?v=2',     scale: 0.92, portrait: '/sprites/race-tiger-front.png?v=1', face: '/sprites/profile-tiger.jpg?v=1' },
  { key: 'alien',     name: 'Cosmo',  model: '/models/alien.glb?v=2',     scale: 0.8,  portrait: '/sprites/race-alien-front.png?v=1', face: '/sprites/profile-alien.jpg?v=1' },
] as const;
type CharKey = typeof CHARACTERS[number]['key'];
const charOf = (key: CharKey) => CHARACTERS.find(c => c.key === key) ?? CHARACTERS[0];

type Phase = 'select' | 'listen' | 'count' | 'race' | 'roundWon' | 'matchWon';

// ── Online 2P (same recipe as Flappy Letters / Letter Flight) ────────────────
// Host = Player 1, guest = Player 2, joined via a share link. OWN-character
// authority: each side simulates its own racer (instant controls) and streams
// its pose ~30Hz over the unreliable P2P channel; the remote racer is mirrored
// with interpolation. The HOST arbitrates the world: rounds, grabs, tackle
// contact, drops, scoops and wins — guests apply those as flags in snapshots.
const ONLINE_SITE_URL = 'https://www.lisanquran.com';
const SNAPSHOT_MS = 33;   // both directions (~30Hz)
const NET_LERP    = 0.35; // remote-racer interpolation per frame

const MAX_PLAYERS = 8;
const SLOT_COLORS = ['#3b82f6', '#f97316', '#a855f7', '#22c55e', '#ec4899', '#14b8a6', '#eab308', '#ef4444'];

// A racer = physics body + identity. gid: 'host' for slot 0, else the guest's
// self-generated uuid (how snapshots and input streams find each other).
interface Racer extends RacePlayer { name: string; charKey: CharKey; gid: string }
const startX = (i: number, n: number) => 50 + (i - (n - 1) / 2) * Math.min(30, 88 / Math.max(n, 2));
const newRacer = (x: number, name = '', charKey: CharKey = 'fennec', gid = 'host'): Racer => ({
  x, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0,
  tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999,
  name, charKey, gid,
});

interface NetPlayer { gid: string; nm: string; ck: CharKey; x: number; y: number; h: number; sp: number; ca: boolean; ta: number; ja: number; fl: number } // ta/ja = ages ms (-1 off), fl = fallen ms left
interface GuestInput { gid: string; x: number; y: number; h: number; sp: number; ta: number; ja: number }
interface NetSnapshot {
  ph: Phase; cn: string; sc: number[]; rw: number;
  tg: string; fm: LetterForm;
  bx: Array<{ l: string; x: number; c: string; t: boolean; g: boolean }>;
  players: NetPlayer[];
  dr: { x: number; y: number; a: number } | null;     // dropped letter (a = age ms)
}

// shortest-arc heading interpolation (359°→1° must not spin the long way)
const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};

// Warm the shared GLB cache for the whole roster while the player reads the
// selector — by the time they click a face tile its model is usually parsed.
let rosterPreloaded = false;
const preloadRoster = () => {
  if (rosterPreloaded) return;
  rosterPreloaded = true;
  preloadRaceModels(CHARACTERS.map(c => c.model));
};

// Live 3D preview in the selector: the character stands facing the player,
// playing its idle look-around clip — not a static picture.
const PortraitView: React.FC<{ model: string; tinted: boolean; scale: number; fill?: boolean; clip?: string }> = ({ model, tinted, scale, fill, clip }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stage = new PortraitStage(canvas, model, tinted, scale, clip);
    stage.init().catch(err => console.error('[LetterRace] portrait stage:', err));
    const warm = window.setTimeout(preloadRoster, 1200); // after the visible model
    return () => { window.clearTimeout(warm); stage.dispose(); };
  }, [model, tinted, scale, clip]);
  // fill → stretch to the parent box (the stage re-frames per canvas aspect)
  return <canvas ref={ref} style={fill ? { width: '100%', height: '100%', display: 'block' } : { width: 200, height: 230, display: 'block', margin: '0 auto' }} />;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface LetterRaceProps {
  letters: string[]; letterForm?: LetterForm; onExit: () => void;
  roomId?: string;          // set when joining an online room via link
  playerRole?: '1' | '2';   // '2' = the joining guest
}
const LetterRaceGame = ({ letters, letterForm = 'isolated', onExit, roomId, playerRole }: LetterRaceProps) => {
  const pool = letters.length ? letters : ARABIC_LETTERS;
  const isGuest = playerRole === '2';

  const [phase, setPhase] = useState<Phase>('select');
  const [fieldBg] = useState(() => FIELDS[Math.floor(Math.random() * FIELDS.length)]);
  const [p1Char, setP1Char] = useState<CharKey>('fennec');
  const [p2Char, setP2Char] = useState<CharKey>('panda');
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [selStep, setSelStep] = useState<1 | 2 | 'share'>(1); // P1 picks, then P2 — or the online share panel
  const [, setTick] = useState(0);
  const [, setRosterTick] = useState(0); // re-render the lobby when players join
  const [scores, setScores] = useState<number[]>([0, 0]);
  const [roundWinner, setRoundWinner] = useState<number>(0);
  const [countNum, setCountNum] = useState<string>('3');

  const phaseRef = useRef<Phase>('select');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Online state ────────────────────────────────────────────────────────────
  const [netMode, setNetMode] = useState<'local' | 'online'>(isGuest ? 'online' : 'local');
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(roomId ?? null);
  const [guestJoined, setGuestJoined] = useState(false);  // guest: pressed Join
  const [gotFirstSnap, setGotFirstSnap] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [netForm, setNetForm] = useState<LetterForm | null>(null); // guest renders the HOST's letter form
  const channelRef = useRef<P2PGameChannel | null>(null);
  // per-guest 30Hz pose stream, keyed by gid (freshTackle set on a new dash)
  const guestInputsRef = useRef<Map<string, GuestInput & { at: number; freshTackle: boolean }>>(new Map());
  const hostSnapRef = useRef<NetSnapshot | null>(null);
  const gidRef = useRef<string>(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `g${Math.random()}`);
  const ownIdxRef = useRef<number>(isGuest ? -1 : 0); // my slot in players[]
  const netRef = useRef({ prevCn: '', prevTg: '' });
  // render-state mirror so the 30Hz send interval reads fresh values
  const uiRef = useRef({ countNum, roundWinner, p1Name, p1Char, p2Name, p2Char });
  useEffect(() => { uiRef.current = { countNum, roundWinner, p1Name, p1Char, p2Name, p2Char }; });
  const online = netMode === 'online';
  const form = netForm ?? letterForm;
  const shareLink = onlineRoomId ? `${ONLINE_SITE_URL}/letter-race/${onlineRoomId}` : '';
  const copyLink = () => {
    try { navigator.clipboard?.writeText(shareLink); } catch { /* ignore */ }
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 1600);
  };

  // ── Touch controls (online play from a phone / iPad): a virtual joystick
  // drives heading + run (point where you want to go, push to sprint), plus
  // two action buttons that reuse the keyboard handlers via synthetic keys. ──
  const isTouch = typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches === true ||
     (((import.meta as any).env?.DEV) && (window as any).__lrForceTouch === true));
  const touchJoyRef = useRef({ active: false, dx: 0, dy: 0, mag: 0 });
  const joyBaseRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<HTMLDivElement>(null);
  const joyMove = (e: React.TouchEvent) => {
    const base = joyBaseRef.current;
    const t = e.touches[0];
    if (!base || !t) return;
    const r = base.getBoundingClientRect();
    let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const mag = Math.hypot(dx, dy);
    if (mag > 1) { dx /= mag; dy /= mag; }
    touchJoyRef.current = { active: true, dx, dy, mag: Math.min(1, mag) };
    const k = joyKnobRef.current;
    if (k) k.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
  };
  const joyEnd = () => {
    touchJoyRef.current = { active: false, dx: 0, dy: 0, mag: 0 };
    const k = joyKnobRef.current;
    if (k) k.style.transform = 'translate(-50%,-50%)';
  };
  const fireKey = (code: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

  // ── Mutable game model (read inside the rAF loop) ──────────────────────────
  const game = useRef({
    target: pool[0],
    boxes: [] as LetterBox[],
    players: [newRacer(startX(0, 2)), newRacer(startX(1, 2), '', 'panda', 'local2')] as Racer[],
    graceUntil: 0,           // a fresh carrier can't be made to drop until this time
    dropped: null as { x: number; y: number; at: number } | null, // letter loose on the field
    checkOrder: 0,           // rotate world-check priority so simultaneous grabs are fair
  });
  const keys = useRef<Set<string>>(new Set());
  // 3D stage model list — remounted whenever the ROSTER (who/which character)
  // changes; tint any repeat of an already-used model so twins are tellable.
  const [stageModels, setStageModels] = useState<RunnerModel[]>([]);
  const syncStageModels = useCallback(() => {
    const seen = new Set<string>();
    const models: RunnerModel[] = game.current.players.map(pl => {
      const c = charOf(pl.charKey);
      const tint = seen.has(c.model);
      seen.add(c.model);
      return { url: c.model, scale: c.scale, tint };
    });
    setStageModels(prev => JSON.stringify(prev) === JSON.stringify(models) ? prev : models);
  }, []);
  // ── Live 3D characters (three.js overlay; see letterRaceStage.ts) ──────────
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = stageCanvasRef.current;
    if (!canvas || !stageModels.length) return;
    const n = stageModels.length;
    const stage = new RunnerStage(canvas, () => {
      const t = performance.now();
      return game.current.players.slice(0, n).map((pl): RunnerPose => ({
        x: pl.x, y: pl.y, heading: pl.heading, speed: pl.speed,
        anim: t < pl.fallenUntil ? 'trip' : t < pl.tackleUntil ? 'tackle' : t - pl.jumpAt < JUMP_ANIM_MS ? 'jump' : pl.speed > 0.02 ? 'run' : 'idle',
      }));
    }, stageModels);
    stage.init().catch(err => console.error('[LetterRace] 3D stage failed:', err));
    if ((import.meta as any).env?.DEV) { (window as any).__lrStage = stage; (window as any).__lrGame = game; (window as any).__lrKeys = keys; }
    return () => stage.dispose();
  }, [stageModels]);
  useEffect(() => { syncStageModels(); }, [syncStageModels]); // default pair before the first round
  const goUntilRef = useRef(0); // keeps the "GO!" flash visible after the race starts
  const queueRef = useRef<string[]>(shuffle(pool));
  const queuePosRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  // ── Letter audio (same files as Letter Flight) ──────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playLetterAudio = useCallback((letter: string) => {
    let fell = false;
    const fallback = () => { if (!fell) { fell = true; speakLetter(letter); } };
    const el = audioRef.current ?? (audioRef.current = new Audio());
    el.onerror = fallback;
    el.src = letterAudioUrl(letter);
    el.play().catch(fallback);
  }, []);

  // ── Sound effects (Web Audio) ───────────────────────────────────────────────
  const acRef = useRef<AudioContext | null>(null);
  const tone = useCallback((freqs: number[], dur = 0.14, type: OscillatorType = 'sine', vol = 0.18) => {
    try {
      const ac = acRef.current ?? (acRef.current = new (window.AudioContext || (window as any).webkitAudioContext)());
      freqs.forEach((f, i) => {
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = type; o.frequency.value = f;
        const t0 = ac.currentTime + i * dur;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(ac.destination);
        o.start(t0); o.stop(t0 + dur);
      });
    } catch { /* audio unavailable */ }
  }, []);
  const sfxCount = useCallback(() => tone([440], 0.12, 'square', 0.14), [tone]);
  const sfxGo    = useCallback(() => tone([880], 0.25, 'square', 0.18), [tone]);
  const sfxGrab  = useCallback(() => tone([523, 659, 784], 0.09, 'sine', 0.2), [tone]);
  const sfxSteal = useCallback(() => tone([600, 400, 250], 0.08, 'sawtooth', 0.16), [tone]);
  const sfxWrong = useCallback(() => tone([180, 120], 0.16, 'sawtooth', 0.14), [tone]);
  const sfxWin   = useCallback(() => tone([523, 659, 784, 1047], 0.13, 'sine', 0.2), [tone]);

  const clearTimers = () => { timersRef.current.forEach(t => window.clearTimeout(t)); timersRef.current = []; };
  const after = (ms: number, fn: () => void) => { timersRef.current.push(window.setTimeout(fn, ms)); };

  // ── Round setup: new target letter + rebuilt letter row ────────────────────
  const setupRound = useCallback(() => {
    clearTimers();
    if (queuePosRef.current >= queueRef.current.length) {
      queueRef.current = shuffle(pool);
      queuePosRef.current = 0;
    }
    const target = queueRef.current[queuePosRef.current];
    queuePosRef.current += 1;

    const distractors = shuffle(ARABIC_LETTERS.filter(l => l !== target)).slice(0, 10);
    const rowLetters = shuffle([target, ...distractors]);
    const colors = shuffle(BOX_COLORS);
    const n = rowLetters.length;
    const left = 8, right = 92;
    game.current.boxes = rowLetters.map((letter, i) => ({
      letter,
      x: n === 1 ? 50 : left + ((right - left) * i) / (n - 1),
      isTarget: letter === target,
      taken: false,
      wiggleAt: 0,
      color: colors[i % colors.length],
    }));
    game.current.target = target;
    const g = game.current;
    if (netMode === 'local') {
      g.players = [
        newRacer(startX(0, 2), p1Name.trim() || 'Player 1', p1Char, 'host'),
        newRacer(startX(1, 2), p2Name.trim() || 'Player 2', p2Char, 'local2'),
      ];
    } else {
      // online host: keep the joined roster, reset every body to the line
      g.players[0].name = p1Name.trim() || 'Player 1';
      g.players[0].charKey = p1Char;
      g.players = g.players.map((pl, i) => newRacer(startX(i, g.players.length), pl.name, pl.charKey, pl.gid));
    }
    if (scoresRef.current.length !== g.players.length) {
      scoresRef.current = g.players.map((_, i) => scoresRef.current[i] ?? 0);
      setScores([...scoresRef.current]);
    }
    syncStageModels();
    g.graceUntil = 0;
    g.dropped = null;

    setPhase('listen');
    setTick(t => t + 1);
    after(400, () => playLetterAudio(target));
    // listen → 3 → 2 → 1 → GO → race
    after(2200, () => {
      setPhase('count'); setCountNum('3'); sfxCount();
      after(800,  () => { setCountNum('2'); sfxCount(); });
      after(1600, () => { setCountNum('1'); sfxCount(); });
      // The race goes live the INSTANT "GO!" appears — no dead-input window
      // where kids' opening mashes are discarded. The GO flash stays on screen
      // briefly (goUntilRef) while the race is already running.
      after(2400, () => {
        setCountNum('GO!'); sfxGo();
        goUntilRef.current = performance.now() + 800;
        // A run key already held down at GO just works: the race loop reads
        // the held-keys set from its very first frame.
        setPhase('race');
      });
    });
  }, [pool, playLetterAudio, sfxCount, sfxGo, netMode, p1Char, p1Name, p2Char, p2Name, syncStageModels]);



  // The match begins on the character-select "Start" button (a user gesture,
  // which also unlocks audio autoplay). Just clean up on unmount.
  useEffect(() => {
    return () => {
      clearTimers();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      acRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── HOST: room channel — guest identity + its 30Hz racer stream ─────────────
  useEffect(() => {
    if (isGuest || netMode !== 'online') return;
    const id = onlineRoomId ?? crypto.randomUUID();
    if (!onlineRoomId) { setOnlineRoomId(id); return; } // re-run with the id set
    const ch = createGameChannel(`letter-race:${id}`, 'host', { p2p: false }); // room = 1:N, Supabase broadcast only
    // the room opens with just the host — guests join via ready below
    game.current.players = [newRacer(50, uiRef.current.p1Name.trim() || 'Player 1', uiRef.current.p1Char, 'host')];
    syncStageModels();
    setRosterTick(t => t + 1);
    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { gid: string; name: string; charKey: string } }) => {
      const g = game.current;
      const gid = String(payload.gid || '');
      if (!gid) return;
      const nm = (payload.name || 'Player').slice(0, 14);
      const ck = CHARACTERS.some(c => c.key === payload.charKey) ? payload.charKey as CharKey : 'fennec';
      let pl = g.players.find(q => q.gid === gid);
      if (!pl && g.players.length < MAX_PLAYERS) {
        pl = newRacer(50, nm, ck, gid); // joins at the start line (mid-round too)
        g.players.push(pl);
      }
      if (pl) { pl.name = nm; pl.charKey = ck; }
      syncStageModels();
      setRosterTick(t => t + 1);
    });
    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: GuestInput }) => {
      if (!payload?.gid) return;
      const m = guestInputsRef.current;
      const prev = m.get(payload.gid);
      const freshTackle = payload.ta >= 0 && (!prev || prev.ta < 0 || payload.ta < prev.ta);
      m.set(payload.gid, { ...payload, at: performance.now(), freshTackle: freshTackle || (prev?.freshTackle ?? false) });
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; guestInputsRef.current.clear(); };
  }, [isGuest, netMode, onlineRoomId, syncStageModels]);

  // ── HOST: 30Hz world snapshots (self-contained — the channel may drop some) ─
  useEffect(() => {
    if (isGuest || netMode !== 'online' || !onlineRoomId) return;
    const iv = window.setInterval(() => {
      const ch = channelRef.current;
      if (!ch) return;
      const g = game.current;
      const now = performance.now();
      const ui = uiRef.current;
      g.players[0].name = ui.p1Name.trim() || 'Player 1';
      g.players[0].charKey = ui.p1Char;
      ch.send({ type: 'broadcast', event: 'state', payload: {
        ph: phaseRef.current, cn: ui.countNum, sc: scoresRef.current, rw: ui.roundWinner,
        tg: g.target, fm: letterForm,
        bx: g.boxes.map(b => ({ l: b.letter, x: Math.round(b.x * 10) / 10, c: b.color, t: b.taken, g: b.isTarget })),
        players: g.players.map(pl => ({
          gid: pl.gid, nm: pl.name, ck: pl.charKey,
          x: Math.round(pl.x * 100) / 100, y: Math.round(pl.y * 100) / 100,
          h: Math.round(pl.heading), sp: Math.round(pl.speed * 1000) / 1000, ca: pl.carrying,
          ta: now < pl.tackleUntil ? Math.round(TACKLE_MS - (pl.tackleUntil - now)) : -1,
          ja: now - pl.jumpAt < JUMP_ANIM_MS ? Math.round(now - pl.jumpAt) : -1,
          fl: Math.max(0, Math.round(pl.fallenUntil - now)),
        })),
        dr: g.dropped ? { x: g.dropped.x, y: g.dropped.y, a: Math.round(now - g.dropped.at) } : null,
      } satisfies NetSnapshot });
    }, SNAPSHOT_MS);
    return () => window.clearInterval(iv);
  }, [isGuest, netMode, onlineRoomId, letterForm]);

  // ── GUEST: join the room, apply host snapshots, announce until heard ────────
  useEffect(() => {
    if (!isGuest || !roomId || !guestJoined) return;
    const ch = createGameChannel(`letter-race:${roomId}`, 'guest', { p2p: false });
    ch.on('broadcast', { event: 'state' }, ({ payload: s }: { payload: NetSnapshot }) => {
      const now = performance.now();
      hostSnapRef.current = s;
      setGotFirstSnap(true);
      const g = game.current;
      const nr = netRef.current;
      const myGid = gidRef.current;
      // world (host-authoritative)
      g.target = s.tg;
      g.boxes = s.bx.map(b => ({ letter: b.l, x: b.x, color: b.c, taken: b.t, isTarget: b.g, wiggleAt: 0 }));
      g.dropped = s.dr ? { x: s.dr.x, y: s.dr.y, at: now - s.dr.a } : null;
      setNetForm(f => (f === s.fm ? f : s.fm));
      // roster merge: rebuild players[] to match the host's order, keeping our
      // own simulated body across rebuilds (matched by gid)
      const rosterChanged = s.players.length !== g.players.length ||
        s.players.some((sp, i) => g.players[i]?.gid !== sp.gid || g.players[i]?.charKey !== sp.ck);
      if (rosterChanged) {
        const old = new Map<string, Racer>(g.players.map(q => [q.gid, q]));
        g.players = s.players.map(sp => {
          const q = old.get(sp.gid) ?? newRacer(sp.x, sp.nm, sp.ck, sp.gid);
          if (old.get(sp.gid) === undefined) { q.y = sp.y; }
          q.name = sp.nm; q.charKey = sp.ck;
          return q;
        });
        ownIdxRef.current = g.players.findIndex(q => q.gid === myGid);
        syncStageModels();
        setRosterTick(t => t + 1);
      } else {
        s.players.forEach((sp, i) => { g.players[i].name = sp.nm; });
      }
      const myIdx = ownIdxRef.current;
      s.players.forEach((sp, i) => {
        const pl = g.players[i];
        if (!pl) return;
        if (i === myIdx) {
          // OUR racer: flags only — the host arbitrates grabs, tackles, drops
          if (sp.ca !== pl.carrying) {
            pl.carrying = sp.ca;
            if (sp.ca) { pl.carrySince = now; sfxGrab(); } else if (s.dr) sfxSteal(); // we dropped it!
          }
          if (sp.fl > 0) {
            if (now >= pl.fallenUntil) sfxWrong(); // just got flattened
            pl.fallenUntil = Math.max(pl.fallenUntil, now + sp.fl);
            pl.speed = 0;
          }
        } else {
          // mirrors: flags now, pose lerped in the race loop
          pl.carrying = sp.ca;
          pl.fallenUntil = sp.fl > 0 ? now + sp.fl : 0;
          pl.tackleUntil = sp.ta >= 0 ? now + (TACKLE_MS - sp.ta) : 0;
          if (sp.ja >= 0) pl.jumpAt = now - sp.ja;
        }
      });
      // countdown + phase machinery (host timers drive everything)
      if (s.cn !== nr.prevCn) {
        nr.prevCn = s.cn;
        setCountNum(s.cn);
        if (s.cn === 'GO!') { goUntilRef.current = now + 800; sfxGo(); }
        else if (s.ph === 'count') sfxCount();
      }
      if (s.ph === 'listen' && s.tg !== nr.prevTg) { nr.prevTg = s.tg; playLetterAudio(s.tg); }
      if (s.sc.length !== scoresRef.current.length || s.sc.some((v, i) => v !== scoresRef.current[i])) {
        scoresRef.current = [...s.sc];
        setScores([...s.sc]);
      }
      if (s.rw !== uiRef.current.roundWinner) setRoundWinner(s.rw);
      if (s.ph !== phaseRef.current) {
        if (s.ph === 'roundWon' || s.ph === 'matchWon') sfxWin();
        if (s.ph === 'listen') {
          // new round — everyone back to their start marks (host decides x)
          g.players.forEach((pl, i) => {
            const sp = s.players[i];
            Object.assign(pl, newRacer(sp ? sp.x : startX(i, g.players.length), pl.name, pl.charKey, pl.gid));
          });
        }
        setPhase(s.ph);
      }
      setTick(t => (t + 1) % 1000000); // repaint even outside the race loop
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        const send = () => ch.send({ type: 'broadcast', event: 'ready', payload: { gid: gidRef.current, name: uiRef.current.p2Name.trim() || 'Player', charKey: uiRef.current.p2Char } });
        send();
        const iv = window.setInterval(() => { if (hostSnapRef.current) window.clearInterval(iv); else send(); }, 2500);
        timersRef.current.push(iv as unknown as number);
      }
    });
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, roomId, guestJoined]);

  // ── GUEST: stream our racer's pose ~30Hz (we own it — see loop) ─────────────
  useEffect(() => {
    if (!isGuest || !guestJoined) return;
    const iv = window.setInterval(() => {
      const ch = channelRef.current;
      if (!ch) return;
      const idx = ownIdxRef.current;
      const p = idx >= 0 ? game.current.players[idx] : null;
      if (!p) return; // not in the roster yet
      const now = performance.now();
      ch.send({ type: 'broadcast', event: 'input', payload: {
        gid: gidRef.current,
        x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
        h: Math.round(p.heading), sp: Math.round(p.speed * 1000) / 1000,
        ta: now < p.tackleUntil ? Math.round(TACKLE_MS - (p.tackleUntil - now)) : -1,
        ja: now - p.jumpAt < JUMP_ANIM_MS ? Math.round(now - p.jumpAt) : -1,
      } satisfies GuestInput });
    }, SNAPSHOT_MS);
    return () => window.clearInterval(iv);
  }, [isGuest, guestJoined]);

  // ── Keyboard: mash Q/M to run, HOLD A/D or ←/→ to turn (360°), Z/N tackle ──
  useEffect(() => {
    const HANDLED = ['KeyW', 'ArrowUp', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyN', 'KeyX', 'KeyM'];
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return; // typing a name
      if (!HANDLED.includes(e.code)) return;
      e.preventDefault();
      // Track held keys regardless of phase so steering works the instant the
      // race starts, even if the key was pressed during the countdown.
      keys.current.add(e.code);
      if (phaseRef.current !== 'race') return;
      const g = game.current;
      const now = performance.now();
      // Running is HOLD-based — handled in the race loop from the held-keys
      // set. Only the tackle needs a discrete press here.
      // Tackle: a forward lunge (cooldown; not while down).
      // Jump: playable anytime on your feet (cooldown-gated); dodges tackles
      // while airborne and protects a carried letter.
      const jump = (pl: RacePlayer) => {
        if (now - pl.jumpAt < JUMP_CD_MS || now < pl.fallenUntil || now < pl.tackleUntil) return;
        pl.jumpAt = now;
        sfxGrab();
      };
      // Online, EITHER key set drives YOUR OWN racer (each device has one player).
      const own = online ? g.players[Math.max(0, ownIdxRef.current)] : null;
      if (!e.repeat && (e.code === 'KeyX' || e.code === 'KeyM')) {
        const target = own ?? (e.code === 'KeyX' ? g.players[0] : g.players[1]);
        if (target) jump(target);
      }
      const tackle = (pl: RacePlayer) => {
        if (now < pl.tackleCd || now < pl.fallenUntil || now - pl.jumpAt < JUMP_ANIM_MS) return;
        pl.tackleUntil = now + TACKLE_MS;
        pl.tackleCd = now + TACKLE_COOLDOWN;
        pl.tackleHit = false;
        pl.speed = TACKLE_SPEED;
        sfxSteal();
      };
      if (!e.repeat && (e.code === 'KeyZ' || e.code === 'KeyN')) {
        const target = own ?? (e.code === 'KeyZ' ? g.players[0] : g.players[1]);
        if (target) tackle(target);
      }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.code); };
    // Focus loss eats keyup events — clear held keys so nobody drifts into the
    // wall forever after alt-tab / an OS dialog steals focus mid-race.
    const clearHeld = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('visibilitychange', clearHeld);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('visibilitychange', clearHeld);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, isGuest]);

  // ── Race loop ───────────────────────────────────────────────────────────────
  // Scores also live in a ref so endRound stays a pure event handler — no side
  // effects inside a setState updater (React may invoke updaters twice).
  const scoresRef = useRef<number[]>([0, 0]);
  const endRound = useCallback((winner: number) => {
    const n = game.current.players.length;
    const next = Array.from({ length: n }, (_, i) => (scoresRef.current[i] ?? 0) + (i === winner ? 1 : 0));
    scoresRef.current = next;
    setScores(next);
    setRoundWinner(winner);
    sfxWin();
    if (next[winner] >= ROUNDS_TO_WIN) {
      setPhase('matchWon');
    } else {
      setPhase('roundWon');
      after(2600, () => setupRound());
    }
  }, [sfxWin, setupRound]);

  useEffect(() => {
    if (phase !== 'race') return;
    let raf = 0;
    // Physics for a racer THIS device owns: movement along the heading, field
    // clamps, tackle-dash pin / friction. (Remote racers are mirrored instead.)
    // dtF = elapsed time in 60fps-frame units: the constants were tuned per
    // frame at 60Hz, so everything scales by dtF — WITHOUT this, field speed
    // tracks the device's refresh rate, and online a 60Hz host literally
    // out-runs a slower guest (or a 120Hz iPad runs double speed).
    const moveOwn = (p: RacePlayer, now: number, dtF: number) => {
      // Full 360° control: the player faces wherever they steered (0 = toward
      // the letters) and always moves along that heading. A knocked-down
      // player doesn't move at all for FALL_MS.
      if (now < p.fallenUntil) {
        p.speed = 0;
      } else {
        const rad = p.heading * Math.PI / 180;
        p.y -= p.speed * Math.cos(rad) * dtF;
        p.x += p.speed * Math.sin(rad) * dtF;
      }
      p.y = Math.max(LETTER_Y, Math.min(START_Y, p.y));
      p.x = Math.max(4, Math.min(96, p.x));
      // Mid-tackle the dash speed is pinned (no decay); otherwise friction.
      if (now < p.tackleUntil) {
        p.speed = TACKLE_SPEED;
      } else {
        p.speed *= Math.pow(FRICTION, dtF);
        if (p.speed < 0.01) p.speed = 0;
      }
    };
    // World interactions (grabs, wrong-box buzz, round win) — run by the HOST
    // online, or locally in same-keyboard mode.
    const step = (p: Racer, anyCarrying: boolean, who: number) => {
      const g = game.current;
      const now = performance.now();

      // At the letter row: grab the target / buzz on a wrong box. Pick the
      // NEAREST overlapping box so standing between two boxes resolves right.
      if (!p.carrying && !anyCarrying && p.y <= LETTER_Y + 4) {
        let nearest: LetterBox | null = null; let nd = GRAB_X;
        for (const box of g.boxes) {
          const d = Math.abs(box.x - p.x);
          if (d < nd) { nd = d; nearest = box; }
        }
        if (nearest) {
          if (nearest.isTarget && !nearest.taken) {
            nearest.taken = true;
            p.carrying = true;
            p.carrySince = now;
            p.speed = Math.min(p.speed, 0.4); // brief slow-down as they turn around
            g.graceUntil = now + STEAL_GRACE;
            sfxGrab();
          } else if (!nearest.isTarget && now > p.wrongBuzzAt && p.speed > 0.05) {
            p.wrongBuzzAt = now + 750;
            nearest.wiggleAt = now;
            sfxWrong();
          }
        }
      }

      // Win: carried the letter back across the bottom line. The short minimum
      // carry time stops a finish-line steal from ending the round in the very
      // same frame — the robbed player always gets a beat to chase.
      if (p.carrying && p.y >= START_Y && now - p.carrySince > 600) { endRound(who); return true; }
      return false;
    };

    let lastT = performance.now();
    const loop = () => {
      const g = game.current;
      const now = performance.now();
      // elapsed time in 60fps-frame units (clamped: a background-tab stall or
      // the very first frame must not teleport anyone)
      const dtF = Math.min(3, Math.max(0.25, (now - lastT) / (1000 / 60)));
      lastT = now;

      // HOLD-to-run: accelerate while the run key is down (fights friction to
      // an equilibrium ≈ MAX_SPEED). A knocked-down player can't run.
      // Online, EITHER key set drives the ONE racer this device owns.
      const held = keys.current;
      const rot = (pl: RacePlayer, d: number) => { if (now >= pl.fallenUntil) pl.heading = (pl.heading + d * ROT_PER_FRAME * dtF + 360) % 360; };
      const maxFor = (pl: RacePlayer) => pl.carrying ? MAX_SPEED * CARRY_SLOW : MAX_SPEED;
      if (online) {
        const own = g.players[Math.max(0, ownIdxRef.current)];
        if (own) {
          if ((held.has('KeyW') || held.has('ArrowUp')) && now >= own.fallenUntil && now >= own.tackleUntil) own.speed = Math.min(maxFor(own), own.speed + RUN_ACCEL * dtF);
          if (held.has('KeyA') || held.has('ArrowLeft'))  rot(own, -1);
          if (held.has('KeyD') || held.has('ArrowRight')) rot(own, +1);
          // virtual joystick: face where it points, push past the deadzone to run
          const tj = touchJoyRef.current;
          if (tj.active && tj.mag > 0.22 && now >= own.fallenUntil) {
            own.heading = (Math.atan2(tj.dx, -tj.dy) * 180 / Math.PI + 360) % 360;
            if (now >= own.tackleUntil) own.speed = Math.min(maxFor(own), own.speed + RUN_ACCEL * dtF);
          }
        }
      } else {
        const [a, b] = g.players;
        if (a && held.has('KeyW') && now >= a.fallenUntil && now >= a.tackleUntil) a.speed = Math.min(maxFor(a), a.speed + RUN_ACCEL * dtF);
        if (b && held.has('ArrowUp') && now >= b.fallenUntil && now >= b.tackleUntil) b.speed = Math.min(maxFor(b), b.speed + RUN_ACCEL * dtF);
        if (a && held.has('KeyA'))       rot(a, -1);
        if (a && held.has('KeyD'))       rot(a, +1);
        if (b && held.has('ArrowLeft'))  rot(b, -1);
        if (b && held.has('ArrowRight')) rot(b, +1);
      }

      const k = 1 - Math.pow(1 - NET_LERP, dtF); // frame-rate-independent lerp
      const hk = 1 - Math.pow(0.5, dtF);

      // ── GUEST: simulate OUR racer, mirror everyone else, and stop there —
      // the host arbitrates grabs, tackle contact, drops and wins (they
      // arrive as snapshot flags). ──
      if (online && isGuest) {
        const myIdx = ownIdxRef.current;
        if (myIdx >= 0 && g.players[myIdx]) moveOwn(g.players[myIdx], now, dtF);
        const s = hostSnapRef.current;
        if (s) {
          s.players.forEach((sp, i) => {
            if (i === myIdx) return;
            const p = g.players[i];
            if (!p) return;
            p.x += (sp.x - p.x) * k;
            p.y += (sp.y - p.y) * k;
            p.heading = lerpAngle(p.heading, sp.h, hk);
            p.speed = sp.sp;
          });
        }
        setTick(t => (t + 1) % 1000000);
        raf = requestAnimationFrame(loop);
        return;
      }

      // ── HOST online: mirror every guest's racer from its 30Hz stream
      // (frozen while WE knocked it down — that guest may not know yet). ──
      if (online) {
        for (const p of g.players) {
          if (p.gid === 'host') continue;
          const gi = guestInputsRef.current.get(p.gid);
          if (!gi || now < p.fallenUntil) continue;
          p.x += (gi.x - p.x) * k;
          p.y += (gi.y - p.y) * k;
          // SNAP once converged — the lerp alone approaches the guest's true
          // position asymptotically, so the mirror would hover at 88.99…
          // forever and a guest crossing the finish line could never fire.
          if (Math.abs(gi.x - p.x) < 0.5) p.x = gi.x;
          if (Math.abs(gi.y - p.y) < 0.5) p.y = gi.y;
          p.x = Math.max(4, Math.min(96, p.x));
          p.y = Math.max(LETTER_Y, Math.min(START_Y, p.y));
          p.heading = lerpAngle(p.heading, gi.h, hk);
          p.speed = gi.sp;
          if (gi.freshTackle) {
            p.tackleUntil = now + Math.max(0, TACKLE_MS - Math.max(0, gi.ta));
            p.tackleHit = false;
            gi.freshTackle = false;
          }
          if (gi.ja >= 0) p.jumpAt = now - gi.ja;
        }
      }

      moveOwn(g.players[0], now, dtF);
      if (!online && g.players[1]) moveOwn(g.players[1], now, dtF);

      // Tackle contact: a mid-dash player knocks the other one down for 2s.
      // If the victim was carrying the letter, they DROP it — it tumbles a
      // short way up-field and sits on the grass as a loose pickup. A fresh
      // carrier (inside the grab grace) still falls but keeps the letter.
      const airborne = (pl: RacePlayer) => now - pl.jumpAt > JUMP_AIR_FROM && now - pl.jumpAt < JUMP_AIR_TO;
      for (const t of g.players) {
        if (!(now < t.tackleUntil) || t.tackleHit) continue;
        for (const v of g.players) {
          if (v === t || now < v.fallenUntil) continue;
          if (Math.hypot(t.x - v.x, t.y - v.y) < TACKLE_REACH) {
            if (airborne(v)) { t.tackleHit = true; break; } // leapt clean over — that tackle is spent
            t.tackleHit = true;
            v.fallenUntil = now + FALL_MS;
            v.speed = 0;
            if (v.carrying && now > g.graceUntil) {
              v.carrying = false;
              g.dropped = {
                x: Math.max(6, Math.min(94, v.x + (v.x < 50 ? 4 : -4))),
                y: Math.max(LETTER_Y + 4, Math.min(START_Y - 4, v.y - DROP_TOSS)),
                at: now,
              };
              sfxSteal(); // the letter goes flying!
            }
            sfxWrong(); // heavy thud
            break;
          }
        }
      }

      // Rotate who is processed first so simultaneous grabs stay fair.
      const n = g.players.length;
      const first = g.checkOrder++ % Math.max(1, n);
      const anyCarrying = g.players.some(pl => pl.carrying);
      for (let o = 0; o < n; o++) {
        const i = (first + o) % n;
        if (step(g.players[i], anyCarrying && !g.players[i].carrying, i)) return; // round ended — stop the loop
      }

      // Scoop a dropped letter: once it settles, the first player to reach it
      // (on their feet) carries it — usually the tackler, but the victim can
      // get up and win the scramble too. Order rotates for fairness.
      if (g.dropped && now - g.dropped.at > DROP_SETTLE_MS) {
        for (let o = 0; o < n; o++) {
          const pl = g.players[(first + o) % n];
          if (now < pl.fallenUntil) continue;
          if (Math.hypot(pl.x - g.dropped.x, pl.y - g.dropped.y) < DROP_PICKUP_D) {
            pl.carrying = true;
            pl.carrySince = now;
            g.dropped = null;
            g.graceUntil = now + STEAL_GRACE;
            sfxGrab();
            break;
          }
        }
      }

      setTick(t => (t + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, online, isGuest, endRound, sfxGrab, sfxWrong, sfxSteal]);

  const g = game.current;
  const now = performance.now();
  const players = g.players;
  const ownIdx = Math.max(0, ownIdxRef.current);
  const charKeyAt = (i: number): CharKey => players[i]?.charKey ?? (i === 0 ? p1Char : p2Char);
  const portraitFor = (i: number) => charOf(charKeyAt(i)).portrait;
  const tintStyleFor = (i: number) => (players.slice(0, Math.max(0, i)).some(pl => pl.charKey === charKeyAt(i)) ? P2_TINT : 'none');
  const nameAt = (i: number) => (players[i]?.name || '').trim() || `Player ${i + 1}`;
  const colorAt = (i: number) => SLOT_COLORS[i % SLOT_COLORS.length];
  const displayTarget = getLetterInForm(g.target, form);
  const carrierGrace = now < g.graceUntil;

  const renderPlayer = (p: Racer, i: number) => {
    const color = colorAt(i);
    const fallen = now < p.fallenUntil;
    return (
      <div key={`${p.gid}-${i}`} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', zIndex: 10, transition: 'none', pointerEvents: 'none' }}>
        {/* Carried letter floats above the head */}
        {p.carrying && (
          <div style={{ position: 'absolute', bottom: '116%', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(#ffffff,#fef9c3)', border: `3px solid ${color}`, borderRadius: 12, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 14px ${color}88, 0 4px 10px rgba(0,0,0,0.25)`, animation: 'lrCarry 0.7s ease-in-out infinite' }}>
            <span dir="rtl" style={{ ...HAFS, fontSize: 27, lineHeight: 1, color: '#0f172a' }}>{displayTarget}</span>
          </div>
        )}
        {/* The 3D character itself is drawn by the WebGL stage (letterRaceStage)
            anchored to this same field position — this spacer only reserves the
            layout slot for the label below, plus the carrier-grace glow ring. */}
        <div style={{ height: 70, width: 54, position: 'relative' }}>
          {p.carrying && carrierGrace && (
            <div style={{ position: 'absolute', left: '50%', bottom: -2, transform: 'translateX(-50%)', width: 58, height: 16, borderRadius: '50%', border: `3px solid ${color}`, opacity: 0.8, boxShadow: `0 0 12px ${color}` }} />
          )}
        </div>
        <div style={{ textAlign: 'center', marginTop: 3 }}>
          {fallen && <div style={{ fontSize: 16, lineHeight: 1, marginBottom: 2 }}>💫</div>}
          <span style={{ background: color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }}>{nameAt(i)}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#14532d', overflow: 'hidden', userSelect: 'none' }}>
      {/* ── Field: AI-illustrated top-view lawn with the finish line drawn in.
          Stretched to 100%/100% (not cover) so the painted checkered line
          stays at a FIXED field-% on every viewport — START_Y is calibrated
          to its measured center (~90%). ── */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${fieldBg})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }} />

      {/* ── Letter row: red pennant flags planted along the top of the field,
          the letter written on the red banner ── */}
      {g.boxes.map((box, i) => !box.taken && (
        <div key={`${box.letter}-${i}`} style={{
          position: 'absolute', left: `${box.x}%`, top: `${LETTER_Y}%`, transform: 'translate(-50%,-50%)', zIndex: 5,
          animation: `lrPopIn 0.45s ${i * 0.05}s backwards`,
        }}>
          <div style={{
            position: 'relative', width: 'clamp(56px, 8.5vw, 86px)', height: 'clamp(56px, 8.5vw, 86px)',
            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))',
            animation: now - box.wiggleAt < 500 ? 'lrShakeBox 0.4s' : undefined,
          }}>
            <svg viewBox="0 0 4335 4335" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
              <path d="m4081 2443-630-928 630-929h-1259v1857z" fill="#c62223" />
              <path d="m518 206h2700v1857h-2700z" fill="#e31e24" />
              <path d="m2827 2063h391l-391 390z" fill="#a32421" />
              <path d="m412 83h213v4201h-213z" fill="#c5c6c6" />
              <path d="m305 4162h426v122h-426z" fill="#b2b3b3" />
              <path d="m305 83h426v122h-426z" fill="#b2b3b3" />
            </svg>
            {/* the red banner spans x 12-74% (+ tail to ~86%), y 5-48% of the
                square. Arabic glyph metrics run ~1.4× the em box, so the font
                is ~0.65× the banner height — tall/wide letters (ط س ك ي…)
                stay INSIDE the red area instead of poking out of the flag. */}
            <span dir="rtl" style={{ ...HAFS, position: 'absolute', left: '12%', top: '4.5%', width: '66%', height: '43%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(15px, 2.45vw, 25px)', lineHeight: 1, color: '#fff', textShadow: '0 2px 3px rgba(0,0,0,0.4)' }}>{getLetterInForm(box.letter, form)}</span>
          </div>
        </div>
      ))}

      {/* ── Dropped letter, loose on the grass after a tackle ── */}
      {g.dropped && (
        <div style={{ position: 'absolute', left: `${g.dropped.x}%`, top: `${g.dropped.y}%`, transform: 'translate(-50%,-50%)', zIndex: 8, animation: 'lrDropIn 0.35s ease-out' }}>
          <div style={{ width: 50, height: 50, background: 'linear-gradient(#ffffff,#fef9c3)', border: '4px solid #f59e0b', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(245,158,11,0.8), 0 5px 10px rgba(0,0,0,0.3)', animation: 'lrDropPulse 0.9s ease-in-out infinite' }}>
            <span dir="rtl" style={{ ...HAFS, fontSize: 28, lineHeight: 1, color: '#0f172a' }}>{displayTarget}</span>
          </div>
        </div>
      )}

      {/* ── Players ── */}
      {/* Live 3D characters — one transparent WebGL layer, anchored to the
          players' field positions (see letterRaceStage.ts) */}
      <canvas ref={stageCanvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 9, pointerEvents: 'none' }} />
      {players.map((p, i) => renderPlayer(p, i))}

      {/* ── Top HUD ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'linear-gradient(rgba(6,30,12,0.55), rgba(6,30,12,0))', color: '#fff' }}>
        <button onClick={onExit} style={{ background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>✕ Exit</button>
        <div style={{ flex: 1, fontWeight: 900, fontSize: 16, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>🏁 Letter Race</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 900, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '62vw' }}>
          {players.map((pl, i) => (
            <span key={`${pl.gid}-${i}`} style={{ background: colorAt(i), borderRadius: 999, padding: '4px 10px', fontSize: 13, whiteSpace: 'nowrap' }}>{nameAt(i).slice(0, 10)} {scores[i] ?? 0}</span>
          ))}
          <span style={{ fontSize: 11, opacity: 0.8 }}>first to {ROUNDS_TO_WIN}</span>
        </div>
        <button onClick={() => playLetterAudio(g.target)} style={{ background: '#0ea5e9', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>🔊 Listen</button>
      </div>

      {/* ── Controls legend (online: one legend — YOUR racer, either key set;
          touch devices get the joystick + buttons instead) ── */}
      {online ? (isTouch ? null : (
        <div style={{ position: 'absolute', bottom: 8, left: isGuest ? undefined : 12, right: isGuest ? 12 : undefined, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', textAlign: isGuest ? 'right' : 'left', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isGuest ? 'flex-end' : 'flex-start', gap: 6, fontSize: 12, fontWeight: 900, color: isGuest ? '#c2410c' : '#1d4ed8' }}>
            <img src={portraitFor(ownIdx)} alt="" style={{ height: 24, filter: tintStyleFor(ownIdx) }} /> You
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>W</b>/<b>↑</b> to run · <b>A D</b> or <b>← →</b> turn · <b>Z</b>/<b>N</b> tackle · <b>X</b>/<b>M</b> jump!</div>
        </div>
      )) : (
        <>
          <div style={{ position: 'absolute', bottom: 8, left: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: '#1d4ed8' }}>
              <img src={portraitFor(0)} alt="" style={{ height: 24 }} /> Left player
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>W</b> to run · <b>A</b>/<b>D</b> turn · <b>Z</b> tackle · <b>X</b> jump!</div>
          </div>
          <div style={{ position: 'absolute', bottom: 8, right: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', textAlign: 'right', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 12, fontWeight: 900, color: '#c2410c' }}>
              Right player <img src={portraitFor(1)} alt="" style={{ height: 24, filter: tintStyleFor(1) }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>↑</b> to run · <b>←</b>/<b>→</b> turn · <b>N</b> tackle · <b>M</b> jump!</div>
          </div>
        </>
      )}

      {/* ── Touch controls: virtual joystick + tackle/jump buttons (online on
          a phone / iPad — each device drives its own racer) ── */}
      {online && isTouch && phase !== 'select' && (
        <>
          <div
            ref={joyBaseRef}
            onTouchStart={joyMove} onTouchMove={joyMove} onTouchEnd={joyEnd} onTouchCancel={joyEnd}
            style={{ position: 'absolute', bottom: 30, left: 22, width: 134, height: 134, borderRadius: '50%', background: 'rgba(255,255,255,0.22)', border: '2.5px solid rgba(255,255,255,0.6)', zIndex: 25, touchAction: 'none' }}>
            <div ref={joyKnobRef} style={{ position: 'absolute', left: '50%', top: '50%', width: 58, height: 58, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', boxShadow: '0 3px 10px rgba(0,0,0,0.35)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -22, width: '100%', textAlign: 'center', color: '#fff', fontWeight: 900, fontSize: 11, textShadow: '0 1px 3px rgba(0,0,0,0.7)', pointerEvents: 'none' }}>MOVE</div>
          </div>
          <div style={{ position: 'absolute', bottom: 40, right: 22, display: 'flex', gap: 16, zIndex: 25 }}>
            <button
              onTouchStart={() => fireKey('KeyZ')} onMouseDown={() => fireKey('KeyZ')}
              style={{ width: 76, height: 76, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.7)', background: 'rgba(239,68,68,0.88)', color: '#fff', fontWeight: 900, fontSize: 11, cursor: 'pointer', touchAction: 'none', boxShadow: '0 4px 14px rgba(0,0,0,0.35)', lineHeight: 1.3 }}>
              💥<br />TACKLE
            </button>
            <button
              onTouchStart={() => fireKey('KeyX')} onMouseDown={() => fireKey('KeyX')}
              style={{ width: 76, height: 76, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.7)', background: 'rgba(245,158,11,0.9)', color: '#fff', fontWeight: 900, fontSize: 11, cursor: 'pointer', touchAction: 'none', boxShadow: '0 4px 14px rgba(0,0,0,0.35)', lineHeight: 1.3 }}>
              🦘<br />JUMP
            </button>
          </div>
        </>
      )}

      {/* ── Listen overlay ── */}
      {phase === 'listen' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '24px 34px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap', maxWidth: 480 }}>
              {players.slice(0, 6).map((pl, i) => (
                <React.Fragment key={`${pl.gid}-${i}`}>
                  {i > 0 && <span style={{ fontWeight: 900, fontSize: 15, color: '#94a3b8' }}>VS</span>}
                  <img src={portraitFor(i)} alt="" style={{ height: 54, animation: 'lrIdle 1.4s ease-in-out infinite', animationDelay: `${i * 0.35}s`, filter: tintStyleFor(i) }} />
                </React.Fragment>
              ))}
              {players.length > 6 && <span style={{ fontWeight: 900, color: '#64748b' }}>+{players.length - 6}</span>}
            </div>
            <h3 style={{ margin: '6px 0 4px', fontWeight: 900, color: '#0f172a', fontSize: 22 }}>👂 Listen to the letter!</h3>
            <p style={{ margin: 0, color: '#475569', fontWeight: 600, fontSize: 14 }}>Then race to find it and bring it home!</p>
            <button onClick={() => playLetterAudio(g.target)} style={{ marginTop: 14, background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>🔊 Hear it again</button>
          </div>
        </div>
      )}

      {/* ── Countdown (the GO! flash lingers into the live race) ── */}
      {(phase === 'count' || (phase === 'race' && now < goUntilRef.current)) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div key={countNum} style={{ fontSize: countNum === 'GO!' ? 110 : 140, fontWeight: 900, color: countNum === 'GO!' ? '#fde047' : '#fff', textShadow: '0 6px 24px rgba(0,0,0,0.5)', animation: 'lrPop 0.75s ease-out' }}>
            {countNum}
          </div>
        </div>
      )}

      {/* ── Round won ── */}
      {phase === 'roundWon' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '26px 36px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}>
            <img src={portraitFor(roundWinner)} alt="" style={{ height: 78, animation: 'lrIdle 0.6s ease-in-out infinite', filter: tintStyleFor(roundWinner) }} />
            <h3 style={{ margin: '6px 0 2px', fontWeight: 900, fontSize: 24, color: colorAt(roundWinner) }}>{nameAt(roundWinner)} wins the round! 🎉</h3>
            <p style={{ margin: '4px 0 0', color: '#475569', fontWeight: 700 }}>{scores.join(' — ')} · next letter coming…</p>
          </div>
        </div>
      )}

      {/* ── Match won: full-screen result page — the champion's 3D model
          dances the Victory clip while the final standings rank everyone ── */}
      {phase === 'matchWon' && (() => {
        const ranked = players.map((pl, i) => ({ pl, i, sc: scores[i] ?? 0 })).sort((a, b) => b.sc - a.sc);
        const win = roundWinner;
        const btnBase: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '14px 32px', fontWeight: 900, cursor: 'pointer', fontSize: 16, color: '#fff' };
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 40, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'linear-gradient(155deg, #04140a 0%, #0a2913 55%, #0f3a1a 100%)' }}>
            {/* confetti rain */}
            {['#f472b6','#a78bfa','#60a5fa','#34d399','#fbbf24','#fb923c','#f87171','#2dd4bf','#c084fc','#4ade80','#38bdf8','#fde047','#f9a8d4','#93c5fd'].map((c, i) => (
              <span key={i} style={{ position: 'absolute', left: `${3 + i * 7}%`, top: 0, width: 12, height: 12, background: c, borderRadius: i % 2 ? '50%' : 3, animation: `lrConfetti ${2.2 + (i % 4) * 0.5}s linear ${(i % 5) * 0.35}s infinite`, zIndex: 1, pointerEvents: 'none' }} />
            ))}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, padding: '20px 28px 6px', gap: 20, position: 'relative', zIndex: 2 }}>
              {/* the champion dances */}
              <div style={{ flex: '1 1 46%', minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: `radial-gradient(ellipse at 50% 62%, ${colorAt(win)}30, rgba(255,255,255,0.02) 70%)`, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 26, overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0 }}>
                  <PortraitView key={`victory-${charKeyAt(win)}`} model={charOf(charKeyAt(win)).model} tinted={tintStyleFor(win) !== 'none'} scale={1} fill clip="victory" />
                </div>
                <div style={{ position: 'relative', textAlign: 'center', paddingBottom: 16, pointerEvents: 'none' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 5, color: '#fde047', textShadow: '0 2px 10px rgba(0,0,0,0.7)' }}>🏆 WINNER 🏆</div>
                  <div style={{ fontSize: 'clamp(30px, 4.5vw, 54px)', fontWeight: 900, color: colorAt(win), textShadow: '0 3px 16px rgba(0,0,0,0.8)', lineHeight: 1.1 }}>{nameAt(win)}</div>
                </div>
              </div>
              {/* final standings */}
              <div style={{ flex: '1 1 42%', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
                <div style={{ color: '#e2e8f0', fontWeight: 900, fontSize: 16, letterSpacing: 3 }}>FINAL STANDINGS</div>
                {ranked.slice(0, 8).map((r, rank) => (
                  <div key={`${r.pl.gid}-${rank}`} style={{ display: 'flex', alignItems: 'center', gap: 12, background: rank === 0 ? 'rgba(253,224,71,0.14)' : 'rgba(255,255,255,0.06)', border: rank === 0 ? '2px solid rgba(253,224,71,0.55)' : '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '9px 14px' }}>
                    <span style={{ fontSize: 22, width: 34, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][rank] ?? `#${rank + 1}`}</span>
                    <img src={charOf(r.pl.charKey).face} alt="" style={{ width: 42, height: 42, borderRadius: 12, objectFit: 'cover' }} />
                    <span style={{ flex: 1, fontWeight: 900, fontSize: 17, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameAt(r.i)}</span>
                    <span style={{ fontWeight: 900, fontSize: 21, color: colorAt(r.i) }}>{r.sc}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* actions */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, padding: '10px 28px 22px', flexWrap: 'wrap', position: 'relative', zIndex: 2 }}>
              {isGuest ? (
                <span style={{ color: '#94a3b8', fontWeight: 800, fontSize: 14 }}>⏳ Waiting for the host to start a new race…</span>
              ) : (
                <>
                  <button onClick={() => { scoresRef.current = game.current.players.map(() => 0); setScores([...scoresRef.current]); setupRound(); }} style={{ ...btnBase, background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 8px 22px rgba(22,163,74,0.5)' }}>🔄 Play again</button>
                  <button onClick={() => { clearTimers(); scoresRef.current = game.current.players.map(() => 0); setScores([...scoresRef.current]); setSelStep(online ? 'share' : 1); setPhase('select'); }} style={{ ...btnBase, background: 'rgba(255,255,255,0.10)', border: '2px solid rgba(255,255,255,0.25)', color: '#e2e8f0' }}>🏁 Back to start</button>
                </>
              )}
              <button onClick={onExit} style={{ ...btnBase, background: 'rgba(255,255,255,0.16)', color: '#f1f5f9' }}>Done</button>
            </div>
          </div>
        );
      })()}

      {/* ── Online host: share-link panel (after picking character + name) ── */}
      {phase === 'select' && !isGuest && selStep === 'share' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 26, padding: '22px 26px 24px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '4px solid #0ea5e9' }}>
            <h3 style={{ margin: '0 0 2px', fontWeight: 900, fontSize: 24, color: '#0ea5e9' }}>🌐 Online race!</h3>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontWeight: 600, fontSize: 13 }}>Share this link (or the QR) — up to {MAX_PLAYERS - 1} friends can join, each picking their own racer!</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', maxWidth: 420, margin: '0 auto' }}>
              <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 10, padding: '8px 10px', fontSize: 11, color: '#334155', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{shareLink}</div>
              <button onClick={copyLink} style={{ background: linkCopied ? '#22c55e' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 900, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{linkCopied ? '✓ Copied' : 'Copy'}</button>
            </div>
            {shareLink && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 12 }}>
                <button onClick={() => setQrOpen(true)} title="Tap to enlarge" style={{ background: '#fff', border: '2px solid #e2e8f0', borderRadius: 12, padding: 8, cursor: 'pointer' }}>
                  <QRCodeSVG value={shareLink} size={130} level="M" />
                </button>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>tap the QR to enlarge · scan to join 📱</span>
              </div>
            )}
            {players.length > 1 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12, alignItems: 'center' }}>
                {players.slice(1).map((pl, i) => (
                  <span key={`${pl.gid}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: 999, padding: '4px 12px 4px 5px', fontWeight: 800, fontSize: 13, color: '#166534' }}>
                    <img src={charOf(pl.charKey).face} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                    {(pl.name || '').trim() || `Player ${i + 2}`}
                  </span>
                ))}
                <span style={{ fontWeight: 700, fontSize: 12, color: '#64748b' }}>{players.length}/{MAX_PLAYERS} racers</span>
              </div>
            ) : (
              <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginTop: 12 }}>⏳ Waiting for players to join…</div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => { setNetMode('local'); setSelStep(1); }} style={{ background: '#eef2ff', color: '#4338ca', border: '2px solid #c7d2fe', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>‹ Back</button>
              <button onClick={() => setupRound()} disabled={players.length < 2} style={{ background: players.length > 1 ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 36px', fontWeight: 900, cursor: players.length > 1 ? 'pointer' : 'default', fontSize: 17, boxShadow: players.length > 1 ? '0 6px 18px rgba(22,163,74,0.45)' : 'none' }}>Start the Race! 🏃💨</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enlarged QR modal (tap anywhere to close) ── */}
      {qrOpen && shareLink && (
        <div onClick={() => setQrOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <div style={{ background: '#fff', borderRadius: 22, padding: 20, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
            <QRCodeSVG value={shareLink} size={Math.min((typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) : 420) - 120, 420)} level="M" />
            <div style={{ marginTop: 10, fontWeight: 800, fontSize: 13, color: '#64748b' }}>Scan to join · tap anywhere to close</div>
          </div>
        </div>
      )}

      {/* ── Character select: P1 picks + names himself, then P2 (or the online
          guest picks just their own racer) ── */}
      {phase === 'select' && (isGuest || selStep !== 'share') && (() => {
        const who: 1 | 2 = isGuest ? 2 : (selStep as 1 | 2);
        const color = who === 1 ? '#3b82f6' : '#f97316';
        const chosen = who === 1 ? p1Char : p2Char;
        const setChosen = who === 1 ? setP1Char : setP2Char;
        const name = who === 1 ? p1Name : p2Name;
        const setName = who === 1 ? setP1Name : setP2Name;
        const c = charOf(chosen);
        const tinted = who === 2 && p1Char === chosen;
        const btnBase: React.CSSProperties = { border: 'none', borderRadius: 999, padding: '15px 34px', fontWeight: 900, cursor: 'pointer', fontSize: 17, color: '#fff', transition: 'transform 0.12s' };
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'linear-gradient(155deg, #04140a 0%, #0a2913 55%, #0f3a1a 100%)' }}>
            {/* header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 28px 8px', flexShrink: 0 }}>
              <span style={{ background: color, color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: 1.5, padding: '8px 20px', borderRadius: 999, boxShadow: `0 0 20px ${color}77` }}>{`PLAYER ${who}`}</span>
              <h2 style={{ margin: 0, color: '#fff', fontWeight: 900, fontSize: 'clamp(20px, 2.6vw, 30px)', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>Pick your racer!</h2>
            </div>
            {/* body — live 3D preview (⅓) | roster grid (⅔) */}
            <div style={{ flex: 1, display: 'flex', gap: 18, padding: '10px 28px', minHeight: 0 }}>
              <div style={{ flex: '0 0 32%', minWidth: 220, display: 'flex', flexDirection: 'column', alignItems: 'center', background: `radial-gradient(ellipse at 50% 62%, ${color}22, rgba(255,255,255,0.03) 68%)`, border: '1px solid rgba(255,255,255,0.14)', borderRadius: 26, overflow: 'hidden' }}>
                <div key={c.key} style={{ width: '100%', flex: 1, minHeight: 0, animation: 'lrPop 0.35s ease-out' }}>
                  <PortraitView model={c.model} tinted={tinted} scale={c.scale} fill />
                </div>
                <div style={{ fontWeight: 900, fontSize: 'clamp(22px, 2.4vw, 30px)', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.7)', padding: '2px 0 4px' }}>{c.name}</div>
                {tinted && <div style={{ fontSize: 12, fontWeight: 700, color: '#5eead4', paddingBottom: 8 }}>team colors — Player 1 is {c.name} too</div>}
                {!tinted && <div style={{ height: 12 }} />}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(92px, 10vw, 138px), 1fr))', gap: 14, paddingBottom: 8 }}>
                  {CHARACTERS.map(ch => {
                    const sel = ch.key === chosen;
                    return (
                      <button key={ch.key} onClick={() => setChosen(ch.key)} title={ch.name} style={{
                        position: 'relative', padding: 0, border: 'none', cursor: 'pointer', borderRadius: 20, overflow: 'hidden', aspectRatio: '1',
                        outline: sel ? `3.5px solid ${color}` : '2px solid rgba(255,255,255,0.15)', outlineOffset: -2,
                        boxShadow: sel ? `0 0 26px ${color}bb` : '0 5px 12px rgba(0,0,0,0.4)',
                        transform: sel ? 'scale(1.045)' : 'scale(1)', transition: 'all 0.15s',
                        background: '#0a2010', opacity: sel ? 1 : 0.87,
                      }}>
                        <img src={ch.face} alt={ch.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 4px 6px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', color: '#fff', fontWeight: 800, fontSize: 13, textAlign: 'center' }}>{ch.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* footer — name + actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 28px 22px', flexWrap: 'wrap', flexShrink: 0 }}>
              <input
                value={name}
                onChange={e => setName(e.target.value.slice(0, 14))}
                placeholder="Your name…"
                style={{ width: 'min(250px, 38vw)', padding: '14px 20px', borderRadius: 999, border: `2.5px solid ${color}99`, outline: 'none', fontSize: 16, fontWeight: 800, textAlign: 'center', color: '#fff', background: 'rgba(255,255,255,0.08)' }}
              />
              {isGuest ? (
                <button onClick={() => setGuestJoined(true)} disabled={guestJoined} style={{ ...btnBase, background: guestJoined ? '#47556988' : 'linear-gradient(135deg,#f97316,#ea580c)', cursor: guestJoined ? 'default' : 'pointer', boxShadow: guestJoined ? 'none' : '0 8px 22px rgba(249,115,22,0.5)' }}>
                  {guestJoined ? (gotFirstSnap ? '✅ Connected — waiting for the host…' : '⏳ Joining…') : '🔗 Join the race!'}
                </button>
              ) : (
                <>
                  {who === 2 && (
                    <button onClick={() => setSelStep(1)} style={{ ...btnBase, background: 'rgba(255,255,255,0.10)', border: '2px solid rgba(255,255,255,0.25)', color: '#e2e8f0', padding: '13px 26px' }}>‹ Back</button>
                  )}
                  {who === 1 ? (
                    <>
                      <button onClick={() => setSelStep(2)} style={{ ...btnBase, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', boxShadow: '0 8px 22px rgba(59,130,246,0.5)' }}>Play here — Player 2 ›</button>
                      <button onClick={() => { setNetMode('online'); setSelStep('share'); }} style={{ ...btnBase, background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', boxShadow: '0 8px 22px rgba(14,165,233,0.5)' }}>🌐 Online</button>
                    </>
                  ) : (
                    <button onClick={() => setupRound()} style={{ ...btnBase, background: 'linear-gradient(135deg,#16a34a,#15803d)', boxShadow: '0 8px 22px rgba(22,163,74,0.5)' }}>Start the Race! 🏃💨</button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes lrRun      { 0%,100% { transform: scale(1) rotate(-4deg) translateY(0); } 50% { transform: scale(1.06) rotate(4deg) translateY(-3px); } }
        @keyframes lrIdle     { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
        @keyframes lrCarry    { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-4px); } }
        @keyframes lrShakeBox { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 75% { transform: rotate(7deg); } }
        @keyframes lrPopIn    { 0% { transform: translate(-50%,-50%) scale(0); } 65% { transform: translate(-50%,-50%) scale(1.12); } 100% { transform: translate(-50%,-50%) scale(1); } }
        @keyframes lrPop      { 0% { transform: scale(0.3); opacity: 0; } 40% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes lrConfetti { 0% { transform: translateY(-10vh) rotate(0); opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: 0.9; } }
        @keyframes lrDropIn   { 0% { transform: translate(-50%,-160%) scale(0.5) rotate(-160deg); } 70% { transform: translate(-50%,-46%) scale(1.1) rotate(8deg); } 100% { transform: translate(-50%,-50%) scale(1) rotate(0); } }
        @keyframes lrDropPulse{ 0%,100% { box-shadow: 0 0 18px rgba(245,158,11,0.8), 0 5px 10px rgba(0,0,0,0.3); } 50% { box-shadow: 0 0 30px rgba(245,158,11,1), 0 5px 10px rgba(0,0,0,0.3); } }
        input::placeholder { color: #94a3b8; }
      `}</style>
    </div>
  );
};

export default LetterRaceGame;
