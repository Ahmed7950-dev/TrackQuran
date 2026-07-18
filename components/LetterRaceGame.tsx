import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';
import { RunnerStage, PortraitStage, preloadRaceModels, type RunnerPose } from './letterRaceStage';

// ─────────────────────────────────────────────────────────────────────────────
// Letter Race — a 2-player top-view keyboard race for the Arabic alphabet.
//
// Both players hear a letter, then race from the bottom line to the letter row
// at the top. HOLDING W (left player) / ↑ (right player) makes you run;
// HOLDING A/D vs ←/→ steers through a full 360°. Z / N throws a tackle: a
// fast forward lunge that knocks the opponent down for 2 seconds on contact —
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
// Steering turns the HEADING (which way "forward" points), not a sideways jump.
// Steering: HOLD the turn key to rotate freely through a full 360°.
const ROT_PER_FRAME = 3.6;   // degrees per frame ≈ 216°/s
// Tackle: a fast forward lunge; touching the opponent knocks them down.
const TACKLE_MS       = 550;   // dash duration
const TACKLE_SPEED    = 0.17;  // dash speed (~half the lunge distance of the first cut)
const TACKLE_COOLDOWN = 3000;
const TACKLE_REACH    = 7;     // contact distance that fells the opponent
const FALL_MS         = 2000;  // how long the tackled player stays down
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
const CHARACTERS = [
  { key: 'fennec', name: 'Sunny',  model: '/models/runner.glb?v=3', scale: 1,    portrait: '/sprites/race-runner-front.png?v=2', face: '/sprites/race-runner-face.png?v=1' },
  { key: 'panda',  name: 'Panda',  model: '/models/panda.glb?v=5',  scale: 0.8,  portrait: '/sprites/race-panda-front.png?v=2', face: '/sprites/race-panda-face.png?v=1' },
  { key: 'mario',  name: 'Mario',  model: '/models/mario.glb?v=3',      scale: 0.85, portrait: '/sprites/race-mario-front.png?v=1', face: '/sprites/race-mario-face.png?v=1' },
  { key: 'bear',   name: 'Bear',   model: '/models/bear.glb?v=3',       scale: 0.8,  portrait: '/sprites/race-bear-front.png?v=1', face: '/sprites/race-bear-face.png?v=1' },
  { key: 'dbz',      name: 'Vegeta', model: '/models/dbz.glb?v=3',      scale: 0.9,  portrait: '/sprites/race-dbz-front.png?v=1', face: '/sprites/race-dbz-face.png?v=1' },
  { key: 'anime',    name: 'Itachi', model: '/models/anime.glb?v=3',    scale: 0.85, portrait: '/sprites/race-anime-front.png?v=1', face: '/sprites/race-anime-face.png?v=1' },
  { key: 'cat',      name: 'Kitty',  model: '/models/cat.glb?v=3',      scale: 0.85, portrait: '/sprites/race-cat-front.png?v=1', face: '/sprites/race-cat-face.png?v=1' },
  { key: 'cartoon',  name: 'Banana', model: '/models/cartoon.glb?v=3',  scale: 0.9,  portrait: '/sprites/race-cartoon-front.png?v=1', face: '/sprites/race-cartoon-face.png?v=1' },
  { key: 'fox',      name: 'Foxy',   model: '/models/fox.glb?v=3',      scale: 0.9,  portrait: '/sprites/race-fox-front.png?v=1', face: '/sprites/race-fox-face.png?v=1' },
  { key: 'vader',    name: 'Vader',  model: '/models/vader.glb?v=3',    scale: 0.95, portrait: '/sprites/race-vader-front.png?v=1', face: '/sprites/race-vader-face.png?v=1' },
  { key: 'lion',     name: 'Leo',    model: '/models/lion.glb?v=3',     scale: 0.9,  portrait: '/sprites/race-lion-front.png?v=1', face: '/sprites/race-lion-face.png?v=1' },
  { key: 'stylized', name: 'Max',    model: '/models/stylized.glb?v=3', scale: 0.85, portrait: '/sprites/race-stylized-front.png?v=1', face: '/sprites/race-stylized-face.png?v=1' },
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

interface NetPose { x: number; y: number; h: number; sp: number; ca: boolean; fa: number; ta: number; ja: number } // ages in ms, -1 = not active
interface GuestInput { x: number; y: number; h: number; sp: number; ta: number; ja: number }
interface NetSnapshot {
  ph: Phase; cn: string; sc: [number, number]; rw: 1 | 2;
  tg: string; fm: LetterForm;
  bx: Array<{ l: string; x: number; c: string; t: boolean; g: boolean }>;
  p1: NetPose;
  me: { ca: boolean; fl: number };                    // guest flags: carrying, fallen-ms-left
  dr: { x: number; y: number; a: number } | null;     // dropped letter (a = age ms)
  hn: string; hc: CharKey;                            // host display name + character
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
const PortraitView: React.FC<{ model: string; tinted: boolean; scale: number }> = ({ model, tinted, scale }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const stage = new PortraitStage(canvas, model, tinted, scale);
    stage.init().catch(err => console.error('[LetterRace] portrait stage:', err));
    const warm = window.setTimeout(preloadRoster, 1200); // after the visible model
    return () => { window.clearTimeout(warm); stage.dispose(); };
  }, [model, tinted, scale]);
  return <canvas ref={ref} style={{ width: 200, height: 230, display: 'block', margin: '0 auto' }} />;
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
  const [p1Char, setP1Char] = useState<CharKey>('fennec');
  const [p2Char, setP2Char] = useState<CharKey>('panda');
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [selStep, setSelStep] = useState<1 | 2 | 'share'>(1); // P1 picks, then P2 — or the online share panel
  const nameOf = (who: 1 | 2) => ((who === 1 ? p1Name : p2Name).trim() || `Player ${who}`);
  const [, setTick] = useState(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [roundWinner, setRoundWinner] = useState<1 | 2>(1);
  const [countNum, setCountNum] = useState<string>('3');

  const phaseRef = useRef<Phase>('select');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Online state ────────────────────────────────────────────────────────────
  const [netMode, setNetMode] = useState<'local' | 'online'>(isGuest ? 'online' : 'local');
  const [onlineRoomId, setOnlineRoomId] = useState<string | null>(roomId ?? null);
  const [p2Joined, setP2Joined] = useState(false);        // host: guest said ready
  const [guestJoined, setGuestJoined] = useState(false);  // guest: pressed Join
  const [gotFirstSnap, setGotFirstSnap] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [netForm, setNetForm] = useState<LetterForm | null>(null); // guest renders the HOST's letter form
  const channelRef = useRef<P2PGameChannel | null>(null);
  const guestInputRef = useRef<(GuestInput & { at: number }) | null>(null);
  const hostSnapRef = useRef<NetSnapshot | null>(null);
  const netRef = useRef({ lastGuestTa: -1, prevCn: '', prevTg: '', prevHn: '', prevHc: '' });
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
    p1: { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999 } as RacePlayer,
    p2: { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999 } as RacePlayer,
    graceUntil: 0,           // a fresh carrier can't be made to drop until this time
    dropped: null as { x: number; y: number; at: number } | null, // letter loose on the field
    checkP1First: true,      // alternate simultaneous-grab priority for fairness
  });
  const keys = useRef<Set<string>>(new Set());
  // ── Live 3D characters (three.js overlay; see letterRaceStage.ts) ──────────
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = stageCanvasRef.current;
    if (!canvas) return;
    const stage = new RunnerStage(canvas, () => {
      const gg = game.current;
      const t = performance.now();
      const pose = (pl: RacePlayer): RunnerPose => ({
        x: pl.x, y: pl.y, heading: pl.heading, speed: pl.speed,
        anim: t < pl.fallenUntil ? 'trip' : t < pl.tackleUntil ? 'tackle' : t - pl.jumpAt < JUMP_ANIM_MS ? 'jump' : pl.speed > 0.02 ? 'run' : 'idle',
      });
      return [pose(gg.p1), pose(gg.p2)];
    }, [
      { url: charOf(p1Char).model, scale: charOf(p1Char).scale },
      { url: charOf(p2Char).model, scale: charOf(p2Char).scale },
    ]);
    stage.init().catch(err => console.error('[LetterRace] 3D stage failed:', err));
    if ((import.meta as any).env?.DEV) { (window as any).__lrStage = stage; (window as any).__lrGame = game; (window as any).__lrKeys = keys; }
    return () => stage.dispose();
  }, [p1Char, p2Char]);
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
    game.current.p1 = { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999 };
    game.current.p2 = { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999 };
    game.current.graceUntil = 0;
    game.current.dropped = null;

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
  }, [pool, playLetterAudio, sfxCount, sfxGo]);



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
    const ch = createGameChannel(`letter-race:${id}`, 'host');
    ch.on('broadcast', { event: 'ready' }, ({ payload }: { payload: { name: string; charKey: string } }) => {
      setP2Name((payload.name || 'Player 2').slice(0, 14));
      if (CHARACTERS.some(c => c.key === payload.charKey)) setP2Char(payload.charKey as CharKey);
      setP2Joined(true);
    });
    ch.on('broadcast', { event: 'input' }, ({ payload }: { payload: GuestInput }) => {
      guestInputRef.current = { ...payload, at: performance.now() };
    });
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; setP2Joined(false); };
  }, [isGuest, netMode, onlineRoomId]);

  // ── HOST: 30Hz world snapshots (self-contained — the channel may drop some) ─
  useEffect(() => {
    if (isGuest || netMode !== 'online' || !onlineRoomId) return;
    const iv = window.setInterval(() => {
      const ch = channelRef.current;
      if (!ch) return;
      const g = game.current;
      const now = performance.now();
      const ui = uiRef.current;
      const p = g.p1;
      ch.send({ type: 'broadcast', event: 'state', payload: {
        ph: phaseRef.current, cn: ui.countNum, sc: scoresRef.current, rw: ui.roundWinner,
        tg: g.target, fm: letterForm,
        bx: g.boxes.map(b => ({ l: b.letter, x: Math.round(b.x * 10) / 10, c: b.color, t: b.taken, g: b.isTarget })),
        p1: {
          x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
          h: Math.round(p.heading), sp: Math.round(p.speed * 1000) / 1000, ca: p.carrying,
          fa: now < p.fallenUntil ? Math.round(FALL_MS - (p.fallenUntil - now)) : -1,
          ta: now < p.tackleUntil ? Math.round(TACKLE_MS - (p.tackleUntil - now)) : -1,
          ja: now - p.jumpAt < JUMP_ANIM_MS ? Math.round(now - p.jumpAt) : -1,
        },
        me: { ca: g.p2.carrying, fl: Math.max(0, Math.round(g.p2.fallenUntil - now)) },
        dr: g.dropped ? { x: g.dropped.x, y: g.dropped.y, a: Math.round(now - g.dropped.at) } : null,
        hn: ui.p1Name.trim() || 'Player 1', hc: ui.p1Char,
      } satisfies NetSnapshot });
    }, SNAPSHOT_MS);
    return () => window.clearInterval(iv);
  }, [isGuest, netMode, onlineRoomId, letterForm]);

  // ── GUEST: join the room, apply host snapshots, announce until heard ────────
  useEffect(() => {
    if (!isGuest || !roomId || !guestJoined) return;
    const ch = createGameChannel(`letter-race:${roomId}`, 'guest');
    ch.on('broadcast', { event: 'state' }, ({ payload: s }: { payload: NetSnapshot }) => {
      const now = performance.now();
      hostSnapRef.current = s;
      setGotFirstSnap(true);
      const g = game.current;
      const nr = netRef.current;
      // world (host-authoritative)
      g.target = s.tg;
      g.boxes = s.bx.map(b => ({ letter: b.l, x: b.x, color: b.c, taken: b.t, isTarget: b.g, wiggleAt: 0 }));
      g.dropped = s.dr ? { x: s.dr.x, y: s.dr.y, at: now - s.dr.a } : null;
      setNetForm(f => (f === s.fm ? f : s.fm));
      // OUR racer's world flags — the host arbitrates grabs, tackles and drops
      const me = g.p2;
      if (s.me.ca !== me.carrying) {
        me.carrying = s.me.ca;
        if (s.me.ca) { me.carrySince = now; sfxGrab(); } else if (s.dr) sfxSteal(); // we dropped it!
      }
      if (s.me.fl > 0) {
        if (now >= me.fallenUntil) sfxWrong(); // just got flattened
        me.fallenUntil = Math.max(me.fallenUntil, now + s.me.fl);
        me.speed = 0;
      }
      // host identity for HUD / selector tint
      if (s.hn !== nr.prevHn) { nr.prevHn = s.hn; setP1Name(s.hn); }
      if (s.hc !== nr.prevHc && CHARACTERS.some(c => c.key === s.hc)) { nr.prevHc = s.hc; setP1Char(s.hc); }
      // countdown + phase machinery (host timers drive everything)
      if (s.cn !== nr.prevCn) {
        nr.prevCn = s.cn;
        setCountNum(s.cn);
        if (s.cn === 'GO!') { goUntilRef.current = now + 800; sfxGo(); }
        else if (s.ph === 'count') sfxCount();
      }
      if (s.ph === 'listen' && s.tg !== nr.prevTg) { nr.prevTg = s.tg; playLetterAudio(s.tg); }
      if (s.sc[0] !== scoresRef.current[0] || s.sc[1] !== scoresRef.current[1]) {
        scoresRef.current = s.sc;
        setScores([s.sc[0], s.sc[1]]);
      }
      if (s.rw !== uiRef.current.roundWinner) setRoundWinner(s.rw);
      if (s.ph !== phaseRef.current) {
        if (s.ph === 'roundWon' || s.ph === 'matchWon') sfxWin();
        if (s.ph === 'listen') {
          // new round — reset both racers to their start marks
          g.p1 = { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999 };
          g.p2 = { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false, jumpAt: -99999 };
        }
        setPhase(s.ph);
      }
      setTick(t => (t + 1) % 1000000); // repaint even outside the race loop
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        const send = () => ch.send({ type: 'broadcast', event: 'ready', payload: { name: uiRef.current.p2Name.trim() || 'Player 2', charKey: uiRef.current.p2Char } });
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
      const p = game.current.p2;
      const now = performance.now();
      ch.send({ type: 'broadcast', event: 'input', payload: {
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
      const own = online ? (isGuest ? g.p2 : g.p1) : null;
      if (!e.repeat && (e.code === 'KeyX' || e.code === 'KeyM')) {
        jump(own ?? (e.code === 'KeyX' ? g.p1 : g.p2));
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
        tackle(own ?? (e.code === 'KeyZ' ? g.p1 : g.p2));
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
  const scoresRef = useRef<[number, number]>([0, 0]);
  const endRound = useCallback((winner: 1 | 2) => {
    const prev = scoresRef.current;
    const next: [number, number] = winner === 1 ? [prev[0] + 1, prev[1]] : [prev[0], prev[1] + 1];
    scoresRef.current = next;
    setScores(next);
    setRoundWinner(winner);
    sfxWin();
    if (next[0] >= ROUNDS_TO_WIN || next[1] >= ROUNDS_TO_WIN) {
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
    const moveOwn = (p: RacePlayer, now: number) => {
      // Full 360° control: the player faces wherever they steered (0 = toward
      // the letters) and always moves along that heading. A knocked-down
      // player doesn't move at all for FALL_MS.
      if (now < p.fallenUntil) {
        p.speed = 0;
      } else {
        const rad = p.heading * Math.PI / 180;
        p.y -= p.speed * Math.cos(rad);
        p.x += p.speed * Math.sin(rad);
      }
      p.y = Math.max(LETTER_Y, Math.min(START_Y, p.y));
      p.x = Math.max(4, Math.min(96, p.x));
      // Mid-tackle the dash speed is pinned (no decay); otherwise friction.
      if (now < p.tackleUntil) {
        p.speed = TACKLE_SPEED;
      } else {
        p.speed *= FRICTION;
        if (p.speed < 0.01) p.speed = 0;
      }
    };
    // World interactions (grabs, wrong-box buzz, round win) — run by the HOST
    // online, or locally in same-keyboard mode.
    const step = (p: RacePlayer, other: RacePlayer, who: 1 | 2) => {
      const g = game.current;
      const now = performance.now();

      // At the letter row: grab the target / buzz on a wrong box. Pick the
      // NEAREST overlapping box so standing between two boxes resolves right.
      if (!p.carrying && !other.carrying && p.y <= LETTER_Y + 4) {
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

    const loop = () => {
      const g = game.current;
      const now = performance.now();

      // HOLD-to-run: accelerate while the run key is down (fights friction to
      // an equilibrium ≈ MAX_SPEED). A knocked-down player can't run.
      // Online, EITHER key set drives the ONE racer this device owns.
      const held = keys.current;
      const rot = (pl: RacePlayer, d: number) => { if (now >= pl.fallenUntil) pl.heading = (pl.heading + d * ROT_PER_FRAME + 360) % 360; };
      if (online) {
        const own = isGuest ? g.p2 : g.p1;
        if ((held.has('KeyW') || held.has('ArrowUp')) && now >= own.fallenUntil && now >= own.tackleUntil) own.speed = Math.min(MAX_SPEED, own.speed + RUN_ACCEL);
        if (held.has('KeyA') || held.has('ArrowLeft'))  rot(own, -1);
        if (held.has('KeyD') || held.has('ArrowRight')) rot(own, +1);
        // virtual joystick: face where it points, push past the deadzone to run
        const tj = touchJoyRef.current;
        if (tj.active && tj.mag > 0.22 && now >= own.fallenUntil) {
          own.heading = (Math.atan2(tj.dx, -tj.dy) * 180 / Math.PI + 360) % 360;
          if (now >= own.tackleUntil) own.speed = Math.min(MAX_SPEED, own.speed + RUN_ACCEL);
        }
      } else {
        if (held.has('KeyW') && now >= g.p1.fallenUntil && now >= g.p1.tackleUntil) g.p1.speed = Math.min(MAX_SPEED, g.p1.speed + RUN_ACCEL);
        if (held.has('ArrowUp') && now >= g.p2.fallenUntil && now >= g.p2.tackleUntil) g.p2.speed = Math.min(MAX_SPEED, g.p2.speed + RUN_ACCEL);
        if (held.has('KeyA'))       rot(g.p1, -1);
        if (held.has('KeyD'))       rot(g.p1, +1);
        if (held.has('ArrowLeft'))  rot(g.p2, -1);
        if (held.has('ArrowRight')) rot(g.p2, +1);
      }

      // ── GUEST: simulate OUR racer, mirror the host's, and stop there — the
      // host arbitrates grabs, tackle contact, drops and wins (they arrive as
      // snapshot flags). ──
      if (online && isGuest) {
        moveOwn(g.p2, now);
        const s = hostSnapRef.current;
        if (s) {
          const sp = s.p1;
          const p = g.p1;
          p.x += (sp.x - p.x) * NET_LERP;
          p.y += (sp.y - p.y) * NET_LERP;
          p.heading = lerpAngle(p.heading, sp.h, 0.5);
          p.speed = sp.sp;
          p.carrying = sp.ca;
          p.fallenUntil = sp.fa >= 0 ? now + (FALL_MS - sp.fa) : 0;
          p.tackleUntil = sp.ta >= 0 ? now + (TACKLE_MS - sp.ta) : 0;
          if (sp.ja >= 0) p.jumpAt = now - sp.ja;
        }
        setTick(t => (t + 1) % 1000000);
        raf = requestAnimationFrame(loop);
        return;
      }

      // ── HOST online: mirror the guest's racer from its 30Hz stream (frozen
      // while WE knocked it down — the guest may not know yet). ──
      if (online) {
        const gi = guestInputRef.current;
        const p = g.p2;
        if (gi && now >= p.fallenUntil) {
          p.x += (gi.x - p.x) * NET_LERP;
          p.y += (gi.y - p.y) * NET_LERP;
          // SNAP once converged — the lerp alone approaches the guest's true
          // position asymptotically, so the mirror would hover at 88.99…
          // forever and P2 crossing the finish line (y >= START_Y) never fired.
          if (Math.abs(gi.x - p.x) < 0.5) p.x = gi.x;
          if (Math.abs(gi.y - p.y) < 0.5) p.y = gi.y;
          p.x = Math.max(4, Math.min(96, p.x));
          p.y = Math.max(LETTER_Y, Math.min(START_Y, p.y));
          p.heading = lerpAngle(p.heading, gi.h, 0.5);
          p.speed = gi.sp;
          const nr = netRef.current;
          if (gi.ta >= 0 && (nr.lastGuestTa < 0 || gi.ta < nr.lastGuestTa)) {
            p.tackleUntil = now + Math.max(0, TACKLE_MS - gi.ta); // fresh tackle
            p.tackleHit = false;
          }
          nr.lastGuestTa = gi.ta;
          if (gi.ja >= 0) p.jumpAt = now - gi.ja;
        }
      }

      moveOwn(g.p1, now);
      if (!online) moveOwn(g.p2, now);

      // Tackle contact: a mid-dash player knocks the other one down for 2s.
      // If the victim was carrying the letter, they DROP it — it tumbles a
      // short way up-field and sits on the grass as a loose pickup. A fresh
      // carrier (inside the grab grace) still falls but keeps the letter.
      const airborne = (pl: RacePlayer) => now - pl.jumpAt > JUMP_AIR_FROM && now - pl.jumpAt < JUMP_AIR_TO;
      for (const [t, v] of [[g.p1, g.p2], [g.p2, g.p1]] as Array<[RacePlayer, RacePlayer]>) {
        if (now < t.tackleUntil && !t.tackleHit && now >= v.fallenUntil) {
          if (Math.hypot(t.x - v.x, t.y - v.y) < TACKLE_REACH) {
            if (airborne(v)) { t.tackleHit = true; continue; } // leapt clean over — that tackle is spent
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
          }
        }
      }

      // Alternate who is processed first so simultaneous grabs are fair.
      const order: Array<[RacePlayer, RacePlayer, 1 | 2]> = g.checkP1First
        ? [[g.p1, g.p2, 1], [g.p2, g.p1, 2]]
        : [[g.p2, g.p1, 2], [g.p1, g.p2, 1]];
      g.checkP1First = !g.checkP1First;
      for (const [p, other, who] of order) {
        if (step(p, other, who)) return; // round ended — stop the loop
      }

      // Scoop a dropped letter: once it settles, the first player to reach it
      // (on their feet) carries it — usually the tackler, but the victim can
      // get up and win the scramble too. Order alternates for fairness.
      if (g.dropped && now - g.dropped.at > DROP_SETTLE_MS) {
        const claimants: Array<RacePlayer> = g.checkP1First ? [g.p1, g.p2] : [g.p2, g.p1];
        for (const pl of claimants) {
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
  const samePick = p1Char === p2Char;
  const portraitFor = (who: 1 | 2) => charOf(who === 1 ? p1Char : p2Char).portrait;
  const tintStyleFor = (who: 1 | 2) => (who === 2 && samePick ? P2_TINT : 'none');
  const displayTarget = getLetterInForm(g.target, form);
  const carrierGrace = now < g.graceUntil;

  const renderPlayer = (p: RacePlayer, who: 1 | 2) => {
    const color = who === 1 ? '#3b82f6' : '#f97316';
    const fallen = now < p.fallenUntil;
    return (
      <div style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', zIndex: 10, transition: 'none', pointerEvents: 'none' }}>
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
          <span style={{ background: color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }}>{nameOf(who)}</span>
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
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/sprites/race-field.jpg?v=1)', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' }} />

      {/* ── Letter row ── */}
      {g.boxes.map((box, i) => !box.taken && (
        <div key={`${box.letter}-${i}`} style={{
          position: 'absolute', left: `${box.x}%`, top: `${LETTER_Y}%`, transform: 'translate(-50%,-50%)', zIndex: 5,
          animation: `lrPopIn 0.45s ${i * 0.05}s backwards`,
        }}>
          <div style={{
            width: 'clamp(44px, 7vw, 68px)', height: 'clamp(44px, 7vw, 68px)',
            background: 'linear-gradient(#ffffff, #eef2f7)', border: `4px solid ${box.color}`, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box',
            boxShadow: '0 5px 0 rgba(0,0,0,0.20), 0 9px 14px rgba(0,0,0,0.28)',
            animation: now - box.wiggleAt < 500 ? 'lrShakeBox 0.4s' : undefined,
          }}>
            <span dir="rtl" style={{ ...HAFS, fontSize: 'clamp(24px, 3.6vw, 38px)', lineHeight: 1, color: '#0f172a' }}>{getLetterInForm(box.letter, form)}</span>
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
      {renderPlayer(g.p1, 1)}
      {renderPlayer(g.p2, 2)}

      {/* ── Top HUD ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'linear-gradient(rgba(6,30,12,0.55), rgba(6,30,12,0))', color: '#fff' }}>
        <button onClick={onExit} style={{ background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>✕ Exit</button>
        <div style={{ flex: 1, fontWeight: 900, fontSize: 16, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>🏁 Letter Race</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900 }}>
          <span style={{ background: '#3b82f6', borderRadius: 999, padding: '4px 12px', fontSize: 14 }}>P1 {scores[0]}</span>
          <span style={{ fontSize: 12, opacity: 0.8 }}>first to {ROUNDS_TO_WIN}</span>
          <span style={{ background: '#f97316', borderRadius: 999, padding: '4px 12px', fontSize: 14 }}>{scores[1]} P2</span>
        </div>
        <button onClick={() => playLetterAudio(g.target)} style={{ background: '#0ea5e9', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>🔊 Listen</button>
      </div>

      {/* ── Controls legend (online: one legend — YOUR racer, either key set;
          touch devices get the joystick + buttons instead) ── */}
      {online ? (isTouch ? null : (
        <div style={{ position: 'absolute', bottom: 8, left: isGuest ? undefined : 12, right: isGuest ? 12 : undefined, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', textAlign: isGuest ? 'right' : 'left', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: isGuest ? 'flex-end' : 'flex-start', gap: 6, fontSize: 12, fontWeight: 900, color: isGuest ? '#c2410c' : '#1d4ed8' }}>
            <img src={portraitFor(isGuest ? 2 : 1)} alt="" style={{ height: 24, filter: tintStyleFor(isGuest ? 2 : 1) }} /> You
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>W</b>/<b>↑</b> to run · <b>A D</b> or <b>← →</b> turn · <b>Z</b>/<b>N</b> tackle · <b>X</b>/<b>M</b> jump!</div>
        </div>
      )) : (
        <>
          <div style={{ position: 'absolute', bottom: 8, left: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: '#1d4ed8' }}>
              <img src={portraitFor(1)} alt="" style={{ height: 24 }} /> Left player
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>W</b> to run · <b>A</b>/<b>D</b> turn · <b>Z</b> tackle · <b>X</b> jump!</div>
          </div>
          <div style={{ position: 'absolute', bottom: 8, right: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', textAlign: 'right', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 12, fontWeight: 900, color: '#c2410c' }}>
              Right player <img src={portraitFor(2)} alt="" style={{ height: 24, filter: tintStyleFor(2) }} />
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 6 }}>
              <img src={portraitFor(1)} alt="" style={{ height: 60, animation: 'lrIdle 1.4s ease-in-out infinite' }} />
              <span style={{ fontWeight: 900, fontSize: 18, color: '#94a3b8' }}>VS</span>
              <img src={portraitFor(2)} alt="" style={{ height: 60, animation: 'lrIdle 1.4s ease-in-out infinite', animationDelay: '0.7s', filter: tintStyleFor(2) }} />
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
            <h3 style={{ margin: '6px 0 2px', fontWeight: 900, fontSize: 24, color: roundWinner === 1 ? '#1d4ed8' : '#c2410c' }}>{nameOf(roundWinner)} wins the round! 🎉</h3>
            <p style={{ margin: '4px 0 0', color: '#475569', fontWeight: 700 }}>{scores[0]} — {scores[1]} · next letter coming…</p>
          </div>
        </div>
      )}

      {/* ── Match won ── */}
      {phase === 'matchWon' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {/* Confetti rain */}
          {['#f472b6','#a78bfa','#60a5fa','#34d399','#fbbf24','#fb923c','#f87171','#2dd4bf','#c084fc','#4ade80','#38bdf8','#fde047'].map((c, i) => (
            <span key={i} style={{ position: 'absolute', left: `${6 + i * 8}%`, top: 0, width: 12, height: 12, background: c, borderRadius: i % 2 ? '50%' : 3, animation: `lrConfetti ${2.2 + (i % 4) * 0.5}s linear ${(i % 5) * 0.35}s infinite` }} />
          ))}
          <div style={{ background: '#fff', borderRadius: 24, padding: '30px 40px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10 }}>
              <span style={{ fontSize: 48 }}>🏆</span>
              <img src={portraitFor(roundWinner)} alt="" style={{ height: 92, animation: 'lrIdle 0.6s ease-in-out infinite', filter: tintStyleFor(roundWinner) }} />
              <span style={{ fontSize: 48 }}>🏆</span>
            </div>
            <h3 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 26, color: roundWinner === 1 ? '#1d4ed8' : '#c2410c' }}>{nameOf(roundWinner)} wins the race!</h3>
            <p style={{ margin: '0 0 18px', color: '#475569', fontWeight: 700, fontSize: 16 }}>{scores[0]} — {scores[1]} · Amazing running! 🏃💨</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
              {isGuest ? (
                <span style={{ color: '#64748b', fontWeight: 800, fontSize: 13 }}>⏳ Waiting for the host to start a new race…</span>
              ) : (
                <>
                  <button onClick={() => { scoresRef.current = [0, 0]; setScores([0, 0]); setupRound(); }} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>🔄 Play again</button>
                  <button onClick={() => { clearTimers(); scoresRef.current = [0, 0]; setScores([0, 0]); setSelStep(online ? 'share' : 1); setPhase('select'); }} style={{ background: '#eef2ff', color: '#4338ca', border: '2px solid #c7d2fe', borderRadius: 999, padding: '12px 18px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>🏁 Back to start</button>
                </>
              )}
              <button onClick={onExit} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Online host: share-link panel (after picking character + name) ── */}
      {phase === 'select' && !isGuest && selStep === 'share' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 26, padding: '22px 26px 24px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '4px solid #0ea5e9' }}>
            <h3 style={{ margin: '0 0 2px', fontWeight: 900, fontSize: 24, color: '#0ea5e9' }}>🌐 Online race!</h3>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontWeight: 600, fontSize: 13 }}>Share this link with the other player — they pick their own racer on their device.</p>
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
            {p2Joined
              ? <div style={{ color: '#16a34a', fontWeight: 900, fontSize: 14, marginTop: 12 }}>✅ {p2Name.trim() || 'Player 2'} joined — ready to race!</div>
              : <div style={{ color: '#64748b', fontWeight: 700, fontSize: 13, marginTop: 12 }}>⏳ Waiting for the other player…</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => { setNetMode('local'); setSelStep(1); }} style={{ background: '#eef2ff', color: '#4338ca', border: '2px solid #c7d2fe', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>‹ Back</button>
              <button onClick={() => setupRound()} disabled={!p2Joined} style={{ background: p2Joined ? 'linear-gradient(135deg,#16a34a,#15803d)' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 36px', fontWeight: 900, cursor: p2Joined ? 'pointer' : 'default', fontSize: 17, boxShadow: p2Joined ? '0 6px 18px rgba(22,163,74,0.45)' : 'none' }}>Start the Race! 🏃💨</button>
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
        const idx = Math.max(0, CHARACTERS.findIndex(c => c.key === chosen));
        const c = CHARACTERS[idx];
        const tinted = who === 2 && p1Char === chosen;
        return (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
            <div style={{ background: '#fff', borderRadius: 26, padding: '22px 26px 24px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: `4px solid ${color}` }}>
              <h3 style={{ margin: '0 0 2px', fontWeight: 900, fontSize: 24, color }}>{isGuest ? 'Pick your racer!' : `Player ${who} — pick your racer!`}</h3>
              <p style={{ margin: '0 0 12px', color: '#64748b', fontWeight: 600, fontSize: 13 }}>
                {isGuest ? "You're joining an online race — choose your character and name." : who === 1 ? 'Choose your character and write your name.' : 'Now the second player picks!'}
              </p>
              {/* big live 3D preview of the chosen character */}
              <div key={c.key} style={{ width: 210, margin: '0 auto', animation: 'lrPop 0.35s ease-out' }}>
                <PortraitView model={c.model} tinted={tinted} scale={c.scale} />
                <div style={{ fontWeight: 900, fontSize: 19, color: '#0f172a', marginTop: 4 }}>{c.name}</div>
                {tinted && <div style={{ fontSize: 11, fontWeight: 700, color: '#0d9488' }}>team colors — Player 1 has {c.name} too</div>}
              </div>
              {/* face row: tap a face to pick that character */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {CHARACTERS.map(ch => {
                  const sel = ch.key === chosen;
                  return (
                    <button key={ch.key} onClick={() => setChosen(ch.key)} title={ch.name}
                      style={{ background: sel ? color : '#fff', border: `3px solid ${sel ? color : '#e2e8f0'}`, borderRadius: 16, padding: '6px 8px 4px', cursor: 'pointer', transition: 'all 0.12s', transform: sel ? 'scale(1.08)' : 'scale(1)', width: 74 }}>
                      <img src={ch.face} alt={ch.name} style={{ width: 52, height: 52, objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: 10 }} />
                      <div style={{ fontWeight: 800, fontSize: 11, color: sel ? '#fff' : '#334155', marginTop: 2 }}>{ch.name}</div>
                    </button>
                  );
                })}
              </div>
              <input
                value={name}
                onChange={e => setName(e.target.value.slice(0, 14))}
                placeholder={`Player ${who} name…`}
                style={{ marginTop: 14, width: '80%', padding: '11px 16px', borderRadius: 999, border: `2.5px solid ${color}55`, outline: 'none', fontSize: 16, fontWeight: 800, textAlign: 'center', color: '#0f172a', background: '#f8fafc' }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                {isGuest ? (
                  <button onClick={() => setGuestJoined(true)} disabled={guestJoined} style={{ background: guestJoined ? '#94a3b8' : 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 36px', fontWeight: 900, cursor: guestJoined ? 'default' : 'pointer', fontSize: 17, boxShadow: guestJoined ? 'none' : '0 6px 18px rgba(249,115,22,0.45)' }}>
                    {guestJoined ? (gotFirstSnap ? '✅ Connected — waiting for the host…' : '⏳ Joining…') : '🔗 Join the race!'}
                  </button>
                ) : (
                  <>
                    {who === 2 && (
                      <button onClick={() => setSelStep(1)} style={{ background: '#eef2ff', color: '#4338ca', border: '2px solid #c7d2fe', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>‹ Back</button>
                    )}
                    {who === 1 ? (
                      <>
                        <button onClick={() => setSelStep(2)} style={{ background: `linear-gradient(135deg,${color},#1d4ed8)`, color: '#fff', border: 'none', borderRadius: 999, padding: '13px 30px', fontWeight: 900, cursor: 'pointer', fontSize: 16, boxShadow: `0 6px 18px ${color}66` }}>Play here — Player 2 ›</button>
                        <button onClick={() => { setNetMode('online'); setSelStep('share'); }} style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 30px', fontWeight: 900, cursor: 'pointer', fontSize: 16, boxShadow: '0 6px 18px rgba(14,165,233,0.45)' }}>🌐 Online — share a link</button>
                      </>
                    ) : (
                      <button onClick={() => setupRound()} style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 36px', fontWeight: 900, cursor: 'pointer', fontSize: 17, boxShadow: '0 6px 18px rgba(22,163,74,0.45)' }}>Start the Race! 🏃💨</button>
                    )}
                  </>
                )}
              </div>
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
      `}</style>
    </div>
  );
};

export default LetterRaceGame;
