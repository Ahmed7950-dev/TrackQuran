import React, { useState, useEffect, useRef, useCallback } from 'react';
import lottie from 'lottie-web';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';

// ─────────────────────────────────────────────────────────────────────────────
// Flappy Letters — a Flappy-Bird-style listening game for 1–2 players.
//
// Gravity constantly pulls the flyer down; a Shift press gives one upward flap
// (Left Shift = left player, Right Shift = right player; on touch, tap your
// half of the screen). Letter bubbles scroll in from the right, some near the
// ground and some up in the sky. Exactly one letter is announced at a time:
// flying into the announced letter collects it and advances to the next; flying
// into ANY other letter — or the ground or the ceiling — eliminates that
// player. Collect the whole set to win; in 2P the survivor plays on.
//
// Uses the same letter audio as Letter Flight/Race (letterAudioUrl + TTS
// fallback). All content is data-driven via GAME_CONFIG below: letters come in
// through props (any alphabet works), direction flips the HUD for LTR sets,
// difficulty is a handful of tunable constants, and characters are a registry
// of Lottie JSON animations (type 'lottie') or static images (type 'sprite') —
// adding a character is a pure asset + registry-entry drop, and the hitbox is
// independent of the animation.
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

// ── Character registry (§ data-driven) ──────────────────────────────────────
// type 'lottie' renders the JSON via lottie-web; type 'sprite' renders an <img>.
// `size` = display height in field-height %, `hitboxR` = collision radius in
// field-height % (deliberately smaller than the art and independent of it).
export interface GameCharacter {
  id: string;
  name: string;
  type: 'lottie' | 'sprite';
  src: string;
  size: number;
  hitboxR: number;
  aspect?: number; // animation frame w/h (default ~1.15) — sizes the lottie box
  flip?: boolean;  // mirror horizontally (for art exported facing left)
}

// Coordinates: x in 0..100 (% of field width), y in 0..100 (% of field height).
// Speeds/accelerations are per SECOND (delta-time based).
const GAME_CONFIG = {
  direction: 'rtl' as 'rtl' | 'ltr',
  difficulty: {
    gravity: 150,            // downward acceleration (height-%/s²)
    flapVy: -46,             // upward velocity applied by one flap
    maxFallVy: 85,           // terminal fall speed
    baseSpeed: 13,           // world scroll speed (width-%/s) at start
    speedRampPerLetter: 0.9, // extra speed per collected letter
    maxSpeed: 30,
    clusterSpacing: 52,      // width-% scrolled between letter columns
    spacingMinRatio: 0.8,    // spacing shrinks with progress down to this ×
    emptySlotsStart: 4,      // flyable gaps per column at the start
    emptySlotsMin: 2,        // …tightening down to this many
    tightenEvery: 4,         // collect this many letters → one fewer gap
    slotsY: [13, 28, 43, 58, 72, 86], // vertical letter slots (sky → ground)
    bubbleR: 6.2,            // bubble radius (height-%)
    announceDelayMs: 350,    // pause before the next letter is spoken
  },
  // Pixel-art scenes (craftpix mountain pack). One is picked at random on
  // every game start and tiled horizontally (repeat-x) while scrolling with
  // the world for a parallax movement feel.
  backgrounds: [
    '/sprites/flappy-bg/green-peaks.png',
    '/sprites/flappy-bg/sunset.png',
    '/sprites/flappy-bg/ice.png',
    '/sprites/flappy-bg/winter.png',
    '/sprites/flappy-bg/rocky.png',
  ],
  characters: [
    // Birds fly toward the RIGHT (the world scrolls left). Files exported
    // facing left ("revert" downloads) carry flip: true and are mirrored.
    { id: 'toucan',        name: 'Toucan',      type: 'lottie', src: '/sprites/birds/toucan.json',        size: 9,   hitboxR: 2.4, aspect: 1.07 },
    { id: 'parrot',        name: 'Parrot',      type: 'lottie', src: '/sprites/birds/parrot.json',        size: 9,   hitboxR: 2.4, aspect: 0.95, flip: true },
    { id: 'cute-bird',     name: 'Cutie',       type: 'lottie', src: '/sprites/birds/cute-bird.json',     size: 8.5, hitboxR: 2.4, aspect: 1 },
    { id: 'bird',          name: 'Bluebird',    type: 'lottie', src: '/sprites/birds/bird.json',          size: 8.5, hitboxR: 2.4, aspect: 1.78, flip: true },
    { id: 'flying-bird',   name: 'Swifty',      type: 'lottie', src: '/sprites/birds/flying-bird.json',   size: 8.5, hitboxR: 2.4, aspect: 1, flip: true },
    { id: 'bird-flying',   name: 'Sky',         type: 'lottie', src: '/sprites/birds/bird-flying.json',   size: 8.5, hitboxR: 2.4, aspect: 1.78 },
    { id: 'falcon',        name: 'Falcon',      type: 'lottie', src: '/sprites/birds/falcon.json',        size: 10,  hitboxR: 2.4, aspect: 0.72 },
    { id: 'flying-bird-2', name: 'Dove',        type: 'lottie', src: '/sprites/birds/flying-bird-2.json', size: 8.5, hitboxR: 2.4, aspect: 1 },
    { id: 'hummingbird',   name: 'Hummingbird', type: 'lottie', src: '/sprites/birds/hummingbird.json',   size: 8.5, hitboxR: 2.4, aspect: 1, flip: true },
    { id: 'chudik',        name: 'Chudik',      type: 'lottie', src: '/sprites/birds/chudik.json',        size: 8.5, hitboxR: 2.4, aspect: 1 },
    { id: 'red-bird',      name: 'Red Bird',    type: 'lottie', src: '/sprites/birds/red-bird.json',      size: 8.5, hitboxR: 2.4, aspect: 1 },
  ] as GameCharacter[],
};

const GROUND_Y = 92;   // top of the ground strip
const CEILING_Y = 2;
const P1_X = 22;       // fixed flyer columns (width-%)
const P2_X = 34;
const PLAYER_COLORS = ['#38bdf8', '#fbbf24'];

const BUBBLE_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf', '#c084fc', '#4ade80', '#38bdf8'];

type Phase = 'menu' | 'ready' | 'play' | 'paused' | 'over';

interface Flyer {
  name: string;
  x: number; y: number; vy: number;
  alive: boolean;
  collected: number;
  diedAt: number;        // performance.now() when eliminated (for the fall anim)
  flapAt: number;        // last flap (wing-pop scale)
  charId: string;
}
interface Bubble {
  id: number;
  letter: string;
  x: number; y: number;
  color: string;
  taken: boolean; takenAt: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const charById = (id: string): GameCharacter =>
  GAME_CONFIG.characters.find(c => c.id === id) ?? GAME_CONFIG.characters[0];

// Lottie/sprite renderer. The lottie animation mounts once per character id and
// keeps playing across React re-renders (the wrapper div identity is stable).
const CharacterSprite: React.FC<{ char: GameCharacter; heightPx: number; style?: React.CSSProperties }> = ({ char, heightPx, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (char.type !== 'lottie' || !ref.current) return;
    let anim: ReturnType<typeof lottie.loadAnimation> | undefined;
    let cancelled = false;
    fetch(char.src).then(r => r.json()).then(data => {
      if (cancelled || !ref.current) return;
      anim = lottie.loadAnimation({ container: ref.current, animationData: data, renderer: 'svg', loop: true, autoplay: true });
    }).catch(() => {});
    return () => { cancelled = true; anim?.destroy(); };
  }, [char.src, char.type]);
  const flipStyle: React.CSSProperties = char.flip ? { transform: 'scaleX(-1)' } : {};
  if (char.type === 'sprite') {
    return <img src={char.src} alt="" draggable={false} style={{ height: heightPx, width: 'auto', objectFit: 'contain', ...flipStyle, ...style }} />;
  }
  return <div ref={ref} style={{ height: heightPx, width: heightPx * (char.aspect ?? 1.15), pointerEvents: 'none', ...flipStyle, ...style }} />;
};

const CharPicker: React.FC<{ value: string; onChange: (id: string) => void; excluded?: string; color: string; label: string }> =
  ({ value, onChange, excluded, color, label }) => (
    <div style={{ background: '#ffffff14', borderRadius: 18, padding: '12px 14px', minWidth: 230 }}>
      <div style={{ color, fontWeight: 900, fontSize: 14, marginBottom: 8, textAlign: 'center' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 420 }}>
        {GAME_CONFIG.characters.map(c => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            disabled={c.id === excluded}
            style={{
              width: 92, height: 92, borderRadius: 16, cursor: c.id === excluded ? 'not-allowed' : 'pointer',
              border: value === c.id ? `3px solid ${color}` : '3px solid #ffffff22',
              background: value === c.id ? '#ffffff2e' : '#ffffff10',
              opacity: c.id === excluded ? 0.35 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2, overflow: 'hidden',
            }}
            title={c.name}
          >
            <CharacterSprite char={c} heightPx={70} />
          </button>
        ))}
      </div>
    </div>
  );

interface FlappyLettersProps { letters: string[]; letterForm?: LetterForm; onExit: () => void }

const FlappyLettersGame = ({ letters, letterForm = 'isolated', onExit }: FlappyLettersProps) => {
  const pool = letters.length ? letters : ARABIC_LETTERS;
  const D = GAME_CONFIG.difficulty;
  const rtl = GAME_CONFIG.direction === 'rtl';

  const [phase, setPhase] = useState<Phase>('menu');
  const [, setTick] = useState(0);
  const [mode, setMode] = useState<1 | 2>(1);
  const [p1Char, setP1Char] = useState(GAME_CONFIG.characters[0].id);
  const [p2Char, setP2Char] = useState(GAME_CONFIG.characters[1].id);
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [menuStep, setMenuStep] = useState<1 | 2>(1); // pick player 1 first, then player 2
  const [bgUrl, setBgUrl] = useState<string>(GAME_CONFIG.backgrounds[0]);

  const phaseRef = useRef<Phase>('menu');
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const modeRef = useRef<1 | 2>(1);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const fieldRef = useRef<HTMLDivElement>(null);
  const aspectRef = useRef(16 / 9); // field width / height — for circle collisions

  // ── Mutable game model (read/written inside the rAF loop) ──────────────────
  const game = useRef({
    players: [] as Flyer[],
    bubbles: [] as Bubble[],
    queue: [] as string[],
    targetIdx: 0,
    scrolledSinceCluster: 999, // spawn a column immediately
    bubbleSeq: 0,
    bgShift: 0,                // accumulated background scroll (width-%)
    endMsg: '',
    winnerIdx: -1 as number,   // -1 = nobody finished the set
  });
  const timersRef = useRef<number[]>([]);
  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // ── Letter audio (same files as Letter Flight/Race, TTS fallback) ──────────
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
  const sfxCollect = useCallback(() => tone([523, 659, 784], 0.09, 'sine', 0.2), [tone]);
  const sfxCrash   = useCallback(() => tone([220, 150, 90], 0.12, 'sawtooth', 0.2), [tone]);
  const sfxFlap    = useCallback(() => tone([340], 0.05, 'triangle', 0.06), [tone]);
  const sfxWin     = useCallback(() => tone([523, 659, 784, 1047], 0.13, 'sine', 0.2), [tone]);

  // ── Difficulty as a function of progress (letters collected so far) ────────
  const speedNow    = (idx: number) => Math.min(D.maxSpeed, D.baseSpeed + D.speedRampPerLetter * idx);
  const spacingNow  = (idx: number) => D.clusterSpacing * Math.max(D.spacingMinRatio, 1 - 0.02 * idx);
  const emptiesNow  = (idx: number) => Math.max(D.emptySlotsMin, D.emptySlotsStart - Math.floor(idx / D.tightenEvery));

  const currentTarget = () => game.current.queue[game.current.targetIdx];

  // ── Column spawner: one target instance + distractors, ≥1 flyable gap ───────
  const spawnCluster = useCallback(() => {
    const g = game.current;
    const target = currentTarget();
    if (!target) return;
    const slots = shuffle(D.slotsY.map((y, i) => ({ y, i })));
    const empties = emptiesNow(g.targetIdx);
    const filled = slots.slice(0, Math.max(1, slots.length - empties));
    const targetSlot = filled[Math.floor(Math.random() * filled.length)];
    const others = pool.filter(l => l !== target);
    filled.forEach(slot => {
      const letter = slot === targetSlot ? target : others[Math.floor(Math.random() * others.length)];
      g.bubbles.push({
        id: g.bubbleSeq++,
        letter,
        x: 106 + (Math.random() * 6 - 3),          // slight jitter → organic cluster
        y: slot.y,
        color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
        taken: false, takenAt: 0,
      });
    });
  }, [pool, D]);

  const announce = useCallback((delayMs = 0) => {
    const t = currentTarget();
    if (!t) return;
    if (delayMs) after(delayMs, () => playLetterAudio(t));
    else playLetterAudio(t);
  }, [after, playLetterAudio]);

  // ── Lifecycle: set up a fresh run (used by Start and Restart) ───────────────
  const startRun = useCallback(() => {
    timersRef.current.forEach(clearTimeout); timersRef.current = [];
    const players: Flyer[] = [
      { name: p1Name.trim() || 'Player 1', x: P1_X, y: 46, vy: 0, alive: true, collected: 0, diedAt: 0, flapAt: 0, charId: p1Char },
    ];
    if (modeRef.current === 2) {
      players.push({ name: p2Name.trim() || 'Player 2', x: P2_X, y: 54, vy: 0, alive: true, collected: 0, diedAt: 0, flapAt: 0, charId: p2Char });
    }
    game.current = {
      players,
      bubbles: [],
      queue: shuffle(pool),
      targetIdx: 0,
      scrolledSinceCluster: 999,
      bubbleSeq: 0,
      bgShift: 0,
      endMsg: '',
      winnerIdx: -1,
    };
    setBgUrl(GAME_CONFIG.backgrounds[Math.floor(Math.random() * GAME_CONFIG.backgrounds.length)]);
    setPhase('ready');
    announce(250);
  }, [pool, p1Char, p2Char, p1Name, p2Name, announce]);

  const endRun = useCallback((msg: string, winnerIdx: number) => {
    game.current.endMsg = msg;
    game.current.winnerIdx = winnerIdx;
    setPhase('over');
    if (winnerIdx >= 0) sfxWin();
  }, [sfxWin]);

  // ── Collect / eliminate ─────────────────────────────────────────────────────
  const collect = useCallback((pIdx: number, bubble: Bubble) => {
    const g = game.current;
    bubble.taken = true; bubble.takenAt = performance.now();
    g.players[pIdx].collected++;
    sfxCollect();
    g.targetIdx++;
    if (g.targetIdx >= g.queue.length) {
      const isTie = g.players.length === 2 && g.players[0].collected === g.players[1].collected;
      const best = Math.max(...g.players.map(p => p.collected));
      endRun(isTie ? "It's a tie!" : 'All letters collected!', isTie ? -1 : g.players.findIndex(p => p.collected === best));
      return;
    }
    announce(D.announceDelayMs);
  }, [announce, endRun, sfxCollect, D.announceDelayMs]);

  const eliminate = useCallback((pIdx: number) => {
    const g = game.current;
    const p = g.players[pIdx];
    if (!p.alive) return;
    p.alive = false; p.diedAt = performance.now(); p.vy = Math.max(p.vy, 10);
    sfxCrash();
    if (g.players.every(pl => !pl.alive)) {
      after(700, () => {
        if (phaseRef.current === 'play') endRun(g.players.length === 2 ? 'Both flyers crashed!' : 'Crashed!', -1);
      });
    }
  }, [after, endRun, sfxCrash]);

  // ── Flap input ──────────────────────────────────────────────────────────────
  const flap = useCallback((pIdx: number) => {
    const ph = phaseRef.current;
    if (ph !== 'ready' && ph !== 'play') return;
    const g = game.current;
    const idx = modeRef.current === 1 ? 0 : pIdx;
    const p = g.players[idx];
    if (!p || !p.alive) return;
    p.vy = D.flapVy;
    p.flapAt = performance.now();
    sfxFlap();
    if (ph === 'ready') setPhase('play');
  }, [D.flapVy, sfxFlap]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return; // typing a name
      if (e.code === 'ShiftLeft') { e.preventDefault(); flap(0); }
      else if (e.code === 'ShiftRight') { e.preventDefault(); flap(1); }
      else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const ph = phaseRef.current;
        if (ph === 'play') setPhase('paused');
        else if (ph === 'paused') setPhase('play');
        else if (ph === 'over') startRun();
      } else if (e.code === 'KeyR') {
        const t = currentTarget();
        if (t && (phaseRef.current === 'play' || phaseRef.current === 'ready' || phaseRef.current === 'paused')) playLetterAudio(t);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [flap, startRun, playLetterAudio]);

  // ── Touch: tap your half of the field to flap ───────────────────────────────
  const onFieldPointerDown = useCallback((e: React.PointerEvent) => {
    const ph = phaseRef.current;
    if (ph !== 'ready' && ph !== 'play') return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const leftHalf = (e.clientX - rect.left) < rect.width / 2;
    flap(modeRef.current === 1 ? 0 : (leftHalf ? 0 : 1));
  }, [flap]);

  // ── Main loop (delta-time based, 60fps target) ──────────────────────────────
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.035, (now - last) / 1000); // clamp long frames
      last = now;
      const ph = phaseRef.current;
      const g = game.current;

      if (fieldRef.current) {
        const r = fieldRef.current.getBoundingClientRect();
        if (r.height > 0) aspectRef.current = r.width / r.height;
      }

      if (ph === 'ready') {
        // gentle hover while waiting for the first flap; the scenery drifts
        g.players.forEach((p, i) => { p.y = (i === 0 ? 46 : 54) + Math.sin(now / 400 + i * 2) * 2.2; p.vy = 0; });
        g.bgShift += 1.5 * dt;
        setTick(t => t + 1);
        return;
      }
      if (ph !== 'play') return; // menu/over/paused are static — no re-render

      const speed = speedNow(g.targetIdx);
      const aspect = aspectRef.current;

      // physics
      g.players.forEach((p, i) => {
        p.vy = Math.min(D.maxFallVy, p.vy + D.gravity * dt);
        p.y += p.vy * dt;
        if (!p.alive) return;
        const r = charById(p.charId).hitboxR;
        if (p.y + r >= GROUND_Y || p.y - r <= CEILING_Y) { eliminate(i); return; }
        // bubble collisions
        for (const b of g.bubbles) {
          if (b.taken) continue;
          const dx = (b.x - p.x) * aspect; // convert width-% → height-% units
          const dy = b.y - p.y;
          if (dx * dx + dy * dy <= (D.bubbleR + r) * (D.bubbleR + r)) {
            if (b.letter === currentTarget()) collect(i, b);
            else eliminate(i);
            break;
          }
        }
      });

      // world scroll + spawning (background at 0.55× = parallax depth)
      const dx = speed * dt;
      g.bgShift += dx * 0.55;
      g.bubbles.forEach(b => { b.x -= dx; });
      g.bubbles = g.bubbles.filter(b => b.x > -12 && (!b.taken || now - b.takenAt < 450));
      g.scrolledSinceCluster += dx;
      if (g.scrolledSinceCluster >= spacingNow(g.targetIdx)) {
        g.scrolledSinceCluster = 0;
        spawnCluster();
      }

      // dead players fall off screen
      g.players = g.players.map(p => p); // keep identities
      setTick(t => t + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [D, collect, eliminate, spawnCluster]);

  // cleanup timers/audio on unmount
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    acRef.current?.close().catch(() => {});
  }, []);

  // ── Render helpers ──────────────────────────────────────────────────────────
  const g = game.current;
  const target = currentTarget();
  const totalSet = g.queue.length || pool.length;

  return (
    <div
      dir="ltr"
      style={{
        position: 'fixed', inset: 0, zIndex: 60, overflow: 'hidden', userSelect: 'none',
        background: 'linear-gradient(#7dd3fc 0%, #bae6fd 45%, #e0f2fe 75%, #f0f9ff 100%)',
        touchAction: 'manipulation',
      }}
    >
      {/* pixel-art scenery — tiled horizontally, scrolls with the world */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `url(${bgUrl})`,
        backgroundRepeat: 'repeat-x',
        backgroundSize: 'auto 100%',
        backgroundPositionX: `${-(g.bgShift / 100) * (typeof window !== 'undefined' ? window.innerWidth : 1000)}px`,
        imageRendering: 'pixelated',
      }} />

      {/* ── Field ── */}
      <div ref={fieldRef} onPointerDown={onFieldPointerDown} style={{ position: 'absolute', inset: 0 }}>
        {/* ceiling + ground danger zones (scene-agnostic overlays) */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${CEILING_Y}%`, background: 'linear-gradient(#0f172a88,#0f172a00)' }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, top: `${GROUND_Y}%`, bottom: 0,
          background: 'linear-gradient(rgba(15,23,42,0.18), rgba(15,23,42,0.5))',
          borderTop: '3px solid rgba(255,255,255,0.85)',
        }} />

        {/* letter bubbles */}
        {(phase !== 'menu') && g.bubbles.map(b => {
          const isTarget = !b.taken && b.letter === target;
          return (
            <div key={b.id} style={{
              position: 'absolute', left: `${b.x}%`, top: `${b.y}%`,
              transform: `translate(-50%, -50%) scale(${b.taken ? 1.6 : 1})`,
              opacity: b.taken ? 0 : 1,
              transition: b.taken ? 'transform 0.4s ease, opacity 0.4s ease' : undefined,
              width: `${GAME_CONFIG.difficulty.bubbleR * 2}vh`, height: `${GAME_CONFIG.difficulty.bubbleR * 2}vh`,
              maxWidth: 96, maxHeight: 96,
              borderRadius: '50%',
              background: `radial-gradient(circle at 32% 28%, #ffffffee 0%, ${b.color} 55%)`,
              border: '3px solid #ffffffcc',
              boxShadow: isTarget ? `0 0 0 4px ${b.color}55, 0 6px 16px rgba(2,6,23,0.25)` : '0 6px 16px rgba(2,6,23,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span dir="rtl" style={{ ...HAFS, fontSize: `${GAME_CONFIG.difficulty.bubbleR * 1.05}vh`, lineHeight: 1, color: '#0f172a', fontWeight: 700 }}>
                {getLetterInForm(b.letter, letterForm)}
              </span>
            </div>
          );
        })}

        {/* flyers */}
        {(phase !== 'menu') && g.players.map((p, i) => {
          const c = charById(p.charId);
          const tilt = Math.max(-24, Math.min(55, p.vy * 0.55));
          const justFlapped = performance.now() - p.flapAt < 130;
          return (
            <div key={i} style={{
              position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
              transform: `translate(-50%, -50%) rotate(${p.alive ? tilt : 90}deg) scale(${justFlapped ? 1.12 : 1})`,
              opacity: p.alive ? 1 : 0.55,
              transition: 'scale 0.1s',
              filter: p.alive ? `drop-shadow(0 4px 6px rgba(2,6,23,0.25)) drop-shadow(0 0 0 ${PLAYER_COLORS[i]})` : 'grayscale(0.8)',
            }}>
              <CharacterSprite char={c} heightPx={Math.round(window.innerHeight * c.size / 100)} />
            </div>
          );
        })}
      </div>

      {/* ── HUD ── */}
      {phase !== 'menu' && (
        <div style={{
          position: 'absolute', top: 10, left: 0, right: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '0 14px', gap: 10,
          flexDirection: rtl ? 'row-reverse' : 'row',
        }}>
          <button onClick={onExit} style={{ background: '#0f172acc', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>
            ← Exit
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffffe8', borderRadius: 18, padding: '6px 14px', boxShadow: '0 4px 14px rgba(2,6,23,0.18)' }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#64748b', letterSpacing: 1 }}>{g.targetIdx}/{totalSet}</span>
            <button
              onClick={(e) => { e.stopPropagation(); if (target) playLetterAudio(target); }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ background: '#0ea5e9', border: 'none', color: '#fff', borderRadius: 12, padding: '8px 16px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}
            >🔊 Listen</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {g.players.map((p, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: '#ffffffe0',
                border: `3px solid ${PLAYER_COLORS[i]}`, borderRadius: 14, padding: '4px 10px',
                opacity: p.alive ? 1 : 0.55,
              }}>
                <CharacterSprite char={charById(p.charId)} heightPx={22} />
                <span style={{ fontWeight: 800, fontSize: 12, color: '#334155', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ fontWeight: 900, fontSize: 14, color: '#0f172a' }}>{p.collected}</span>
                {!p.alive && <span style={{ fontSize: 13 }}>💥</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ready hint ── */}
      {phase === 'ready' && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '62%', textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ display: 'inline-block', background: '#0f172acc', color: '#fff', borderRadius: 16, padding: '12px 22px', fontWeight: 900, fontSize: 'clamp(14px,2.2vw,20px)' }}>
            {mode === 2 ? '⇧ Left Shift / Right Shift ⇧ — flap to start!' : 'Press Shift (or tap) to flap — go get your letter!'}
          </div>
        </div>
      )}

      {/* ── Paused ── */}
      {phase === 'paused' && (
        <div style={{ position: 'absolute', inset: 0, background: '#0f172a66', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 22, padding: '26px 34px', textAlign: 'center', boxShadow: '0 18px 50px rgba(2,6,23,0.4)' }}>
            <div style={{ fontWeight: 900, fontSize: 24, color: '#0f172a', marginBottom: 14 }}>Paused</div>
            <button onClick={() => setPhase('play')} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer', marginRight: 8 }}>▶ Resume</button>
            <button onClick={onExit} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 14, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>Exit</button>
          </div>
        </div>
      )}

      {/* ── Menu ── */}
      {phase === 'menu' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(#0c4a6e, #082f49)' }}>
          <div style={{ textAlign: 'center', padding: 16, maxHeight: '100%', overflowY: 'auto' }}>
            <div style={{ fontSize: 'clamp(30px,5vw,52px)', fontWeight: 900, color: '#fff', marginBottom: 4 }}>
              🐦 Flappy Letters
            </div>
            <div style={{ color: '#7dd3fc', fontWeight: 700, fontSize: 'clamp(13px,1.8vw,17px)', marginBottom: 18 }}>
              Listen, flap, and catch only the letter you hear!
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 18 }}>
              {[1, 2].map(m => (
                <button key={m} onClick={() => { setMode(m as 1 | 2); setMenuStep(1); }} style={{
                  background: mode === m ? '#0ea5e9' : '#ffffff18', color: '#fff', border: mode === m ? '3px solid #7dd3fc' : '3px solid transparent',
                  borderRadius: 16, padding: '10px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer',
                }}>
                  {m === 1 ? '1 Player' : '2 Players'}
                </button>
              ))}
            </div>

            {/* one player configures at a time: player 1 first, then player 2 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              {menuStep === 1 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <input
                    value={p1Name}
                    onChange={e => setP1Name(e.target.value)}
                    placeholder={mode === 2 ? 'Player 1 — your name' : 'Your name'}
                    maxLength={16}
                    style={{ background: '#ffffff14', border: '2px solid #38bdf8', color: '#fff', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 15, textAlign: 'center', outline: 'none', width: 240 }}
                  />
                  <CharPicker value={p1Char} onChange={setP1Char} excluded={mode === 2 ? p2Char : undefined} color="#38bdf8"
                    label={mode === 2 ? `${p1Name.trim() || 'Player 1'} (Left ⇧) — pick your bird` : 'Pick your bird'} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <input
                    value={p2Name}
                    onChange={e => setP2Name(e.target.value)}
                    placeholder="Player 2 — your name"
                    maxLength={16}
                    style={{ background: '#ffffff14', border: '2px solid #fbbf24', color: '#fff', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 15, textAlign: 'center', outline: 'none', width: 240 }}
                  />
                  <CharPicker value={p2Char} onChange={setP2Char} excluded={p1Char} color="#fbbf24"
                    label={`${p2Name.trim() || 'Player 2'} (Right ⇧) — pick your bird`} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
              {menuStep === 2 && (
                <button onClick={() => setMenuStep(1)} style={{ background: '#ffffff18', color: '#fff', border: 'none', borderRadius: 16, padding: '13px 22px', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}>← Back</button>
              )}
              {mode === 2 && menuStep === 1 ? (
                <button onClick={() => setMenuStep(2)} style={{
                  background: 'linear-gradient(160deg,#0ea5e9,#0284c7)', color: '#fff', border: 'none',
                  borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: 'pointer',
                  boxShadow: '0 10px 30px rgba(14,165,233,0.4)',
                }}>Next → Player 2</button>
              ) : (
                <button onClick={startRun} style={{
                  background: 'linear-gradient(160deg,#22c55e,#16a34a)', color: '#fff', border: 'none',
                  borderRadius: 18, padding: '14px 44px', fontWeight: 900, fontSize: 20, cursor: 'pointer',
                  boxShadow: '0 10px 30px rgba(34,197,94,0.4)',
                }}>▶ Start</button>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <button onClick={onExit} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>← Back to letters</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Game over ── */}
      {phase === 'over' && (
        <div style={{ position: 'absolute', inset: 0, background: '#0f172a99', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 26, padding: '28px 34px', textAlign: 'center', boxShadow: '0 18px 60px rgba(2,6,23,0.5)', maxWidth: 480 }}>
            <div style={{ fontSize: 40, marginBottom: 4 }}>{g.winnerIdx >= 0 ? '🏆' : '💥'}</div>
            <div style={{ fontWeight: 900, fontSize: 26, color: '#0f172a', marginBottom: 12 }}>{g.endMsg}</div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 18 }}>
              {g.players.map((p, i) => (
                <div key={i} style={{
                  border: `3px solid ${PLAYER_COLORS[i]}`, borderRadius: 18, padding: '12px 18px',
                  background: g.winnerIdx === i ? '#f0fdf4' : '#f8fafc',
                }}>
                  <CharacterSprite char={charById(p.charId)} heightPx={52} />
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#475569', marginTop: 4, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontWeight: 900, fontSize: 20, color: '#0f172a', marginTop: 2 }}>{p.collected}/{totalSet}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: p.alive ? '#16a34a' : '#dc2626' }}>
                    {g.winnerIdx === i ? 'Winner!' : p.alive ? 'Survived' : 'Crashed'}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={startRun} style={{ background: 'linear-gradient(160deg,#22c55e,#16a34a)', color: '#fff', border: 'none', borderRadius: 16, padding: '12px 30px', fontWeight: 900, fontSize: 18, cursor: 'pointer', marginRight: 8 }}>
              🔄 Restart
            </button>
            <button onClick={() => { setMenuStep(1); setPhase('menu'); }} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 16, padding: '12px 22px', fontWeight: 900, fontSize: 18, cursor: 'pointer', marginRight: 8 }}>
              Players
            </button>
            <button onClick={onExit} style={{ background: 'transparent', color: '#64748b', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: 15 }}>
              Exit
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default FlappyLettersGame;
