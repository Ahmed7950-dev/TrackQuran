import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';

// ─────────────────────────────────────────────────────────────────────────────
// Airplane letter game — full-screen, physics-based plane, bubbles approach
// from the right with scrolling parallax sky background.
//
// To use the real PNG plane image instead of the SVG:
//   1. Copy the plane PNG to: public/sprites/jet-plane.png
//   2. Replace <JetPlane /> below with:
//      <img src="/sprites/jet-plane.png" width="150" alt="jet" style={{ display:'block' }} />
// ─────────────────────────────────────────────────────────────────────────────

type GameStatus = 'start' | 'playing' | 'won' | 'lost';

type Bubble = {
  id: string;
  letter: string;
  x: number;        // % of arena — mutated directly in game loop
  y: number;        // % of arena
  vx: number;       // horizontal velocity (% per frame, negative = left)
  isCorrect: boolean;
  popped: boolean;
  driftDelay: number;
};

const START_FUEL    = 100;
const FUEL_GAIN     = 10;
const FUEL_LOSS     = 20;
const BUBBLE_RADIUS = 7.5;   // collision radius, % of arena width
const BUBBLE_SPEED  = 0.14;  // % per frame
const PLANE_ACCEL   = 0.09;
const PLANE_MAX_VEL = 1.25;
const PLANE_DRAG    = 0.87;

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

function makeBubbles(correctLetter: string, count = 3, avoidY: number[] = []): Bubble[] {
  const wrong = shuffle(ARABIC_LETTERS.filter(l => l !== correctLetter)).slice(0, count - 1);
  const letters = shuffle([correctLetter, ...wrong]);
  // Pick y slots that don't overlap existing bubbles
  const free = ALL_Y_SLOTS.filter(y => avoidY.every(ay => Math.abs(ay - y) >= MIN_Y_GAP));
  const pool = free.length >= count ? free : ALL_Y_SLOTS;
  const ySlots = shuffle(pool).slice(0, count);
  return letters.map((letter, i) => ({
    id: `${Date.now()}-${i}`,
    letter,
    x: 112 + i * 28,
    y: ySlots[i],
    vx: -(BUBBLE_SPEED + Math.random() * 0.05),
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

// ── Jet plane icon ────────────────────────────────────────────────────────────
const PLANE_ICON = 'https://img.icons8.com/external-flat-juicy-fish/60/external-fighter-vehicles-flat-flat-juicy-fish.png';
const CLOUD_ICON = 'https://img.icons8.com/cotton/64/clouds--v1.png';

const JetPlane: React.FC = () => (
  <img
    src={PLANE_ICON}
    alt="jet"
    width={90}
    height={90}
    style={{ display: 'block', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))' }}
  />
);

// ── Cloud icon ────────────────────────────────────────────────────────────────
const CloudShape: React.FC<{ w: number; opacity: number }> = ({ w, opacity }) => (
  <img src={CLOUD_ICON} alt="" width={w} style={{ display: 'block', opacity }} />
);

// ── Cloud data ────────────────────────────────────────────────────────────────
const FAR_CLOUDS  = [
  { top: '7%',  w: 90,  delay: 0,    dur: 120 },
  { top: '14%', w: 70,  delay: -38,  dur: 120 },
  { top: '4%',  w: 110, delay: -75,  dur: 120 },
  { top: '10%', w: 80,  delay: -105, dur: 120 },
];
const MID_CLOUDS  = [
  { top: '22%', w: 130, delay: 0,    dur: 70 },
  { top: '18%', w: 100, delay: -22,  dur: 70 },
  { top: '28%', w: 150, delay: -50,  dur: 70 },
];
const NEAR_CLOUDS = [
  { top: '34%', w: 180, delay: 0,    dur: 38 },
  { top: '48%', w: 210, delay: -12,  dur: 38 },
  { top: '28%', w: 160, delay: -24,  dur: 38 },
];

interface AirplaneGameProps {
  letters: string[];
  onExit: () => void;
}

const AirplaneGame: React.FC<AirplaneGameProps> = ({ letters, onExit }) => {
  const [status, setStatus]     = useState<GameStatus>('start');
  const [fuel, setFuel]         = useState(START_FUEL);
  const [score, setScore]       = useState(0);
  const [queue, setQueue]       = useState<string[]>([]);
  const [queuePos, setQueuePos] = useState(0);
  const [bubbles, setBubbles]   = useState<Bubble[]>([]);
  const [flash, setFlash]       = useState<'good' | 'bad' | null>(null);

  const planeRef       = useRef<HTMLDivElement>(null);
  const planePos       = useRef({ x: 14, y: 50 });
  const velRef         = useRef({ x: 0, y: 0 });
  const tiltRef        = useRef(0);
  const keysDown       = useRef<Record<string, boolean>>({});
  const rafRef         = useRef<number>(0);
  const audioRef       = useRef<HTMLAudioElement | null>(null);
  const bubblesRef     = useRef<Bubble[]>([]);
  const bubbleDomRefs  = useRef<Map<string, HTMLDivElement>>(new Map());
  const collidingRef   = useRef(false);
  const queuePosRef    = useRef(0);

  bubblesRef.current = bubbles;
  const currentLetter = queue[queuePos] ?? '';

  // Lock body scroll while game is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // CSS injections
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
      @keyframes ag-cloud {
        from { transform: translateX(0); }
        to   { transform: translateX(-220vw); }
      }
      .ag-bubble { animation: ag-float 3.2s ease-in-out infinite; }
      .ag-popped { animation: ag-pop .45s ease-out forwards; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const playLetterAudio = useCallback((letter: string) => {
    if (!letter) return;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    const audio = new Audio(`${letterAudioUrl(letter)}?t=${Date.now() % 1e7}`);
    audioRef.current = audio;
    audio.onerror = () => speakLetter(letter);
    audio.play().catch(() => speakLetter(letter));
  }, []);

  // ── Round setup ────────────────────────────────────────────────────────────
  const startRound = useCallback((letter: string) => {
    setBubbles(makeBubbles(letter));
    collidingRef.current = false;
    setTimeout(() => playLetterAudio(letter), 350);
  }, [playLetterAudio]);

  const startGame = useCallback(() => {
    const q = shuffle(letters);
    setQueue(q);
    setQueuePos(0);
    queuePosRef.current = 0;
    setFuel(START_FUEL);
    setScore(0);
    planePos.current = { x: 14, y: 50 };
    velRef.current   = { x: 0, y: 0 };
    tiltRef.current  = 0;
    setStatus('playing');
    startRound(q[0]);
  }, [letters, startRound]);

  // ── Hit handling ───────────────────────────────────────────────────────────
  const handleHit = useCallback((bubble: Bubble) => {
    if (bubble.isCorrect) {
      playSuccess();
      setFlash('good');
      setFuel(f => Math.min(START_FUEL, f + FUEL_GAIN));
      setScore(s => s + 1);
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      const next = queuePosRef.current + 1;
      queuePosRef.current = next;
      setQueuePos(next);
      if (next >= queue.length) {
        setTimeout(() => setStatus('won'), 600);
      } else {
        // Keep at most 2 old bubbles flying as distractors; spawn 3 fresh ones
        // that avoid overlapping the survivors' vertical positions.
        const nextLetter = queue[next];
        setTimeout(() => {
          setBubbles(prev => {
            const survivors = prev.filter(b => !b.popped).slice(0, 2);
            const usedY = survivors.map(b => b.y);
            return [...survivors, ...makeBubbles(nextLetter, 3, usedY)];
          });
          collidingRef.current = false;
          setTimeout(() => playLetterAudio(nextLetter), 350);
        }, 500);
      }
    } else {
      playWrong();
      setFlash('bad');
      setBubbles(bs => bs.map(b => b.id === bubble.id ? { ...b, popped: true } : b));
      setFuel(f => {
        const nf = f - FUEL_LOSS;
        if (nf <= 0) setTimeout(() => setStatus('lost'), 500);
        return Math.max(0, nf);
      });
      setTimeout(() => { collidingRef.current = false; }, 500);
    }
    setTimeout(() => setFlash(null), 400);
  }, [queue, startRound]);

  const handleHitRef = useRef(handleHit);
  useEffect(() => { handleHitRef.current = handleHit; }, [handleHit]);
  useEffect(() => { queuePosRef.current = queuePos; }, [queuePos]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing') return;

    const tick = () => {
      const k = keysDown.current;
      const p = planePos.current;
      const v = velRef.current;

      // Acceleration from key input
      if (k.ArrowUp)    v.y -= PLANE_ACCEL;
      if (k.ArrowDown)  v.y += PLANE_ACCEL;
      if (k.ArrowLeft)  v.x -= PLANE_ACCEL * 0.75;
      if (k.ArrowRight) v.x += PLANE_ACCEL * 0.75;

      // Drag (friction)
      v.x *= PLANE_DRAG;
      v.y *= PLANE_DRAG;

      // Clamp velocity
      v.x = Math.max(-PLANE_MAX_VEL, Math.min(PLANE_MAX_VEL, v.x));
      v.y = Math.max(-PLANE_MAX_VEL, Math.min(PLANE_MAX_VEL, v.y));

      // Move position
      p.x = Math.max(4, Math.min(96, p.x + v.x));
      p.y = Math.max(7, Math.min(88, p.y + v.y));

      // Smooth bank: nose pitches with vertical velocity
      const targetTilt = Math.max(-28, Math.min(28, v.y * 20));
      tiltRef.current += (targetTilt - tiltRef.current) * 0.13;

      // Apply to plane DOM
      if (planeRef.current) {
        planeRef.current.style.left      = `${p.x}%`;
        planeRef.current.style.top       = `${p.y}%`;
        planeRef.current.style.transform = `translate(-50%,-50%) rotate(${tiltRef.current}deg)`;
      }

      // Move bubbles left + loop back when off-screen
      for (const b of bubblesRef.current) {
        if (b.popped) continue;
        b.x += b.vx;
        if (b.x < -16) b.x = 108 + Math.random() * 25; // loop
        const el = bubbleDomRefs.current.get(b.id);
        if (el) el.style.left = `${b.x}%`;
      }

      // Collision detection
      if (!collidingRef.current) {
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p.x;
          const dy = (b.y - p.y) * 0.65;
          if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_RADIUS) {
            collidingRef.current = true;
            handleHitRef.current(b);
            break;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status]);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing') return;
    const down = (e: KeyboardEvent) => { if (e.key.startsWith('Arrow')) { e.preventDefault(); keysDown.current[e.key] = true; } };
    const up   = (e: KeyboardEvent) => { if (e.key.startsWith('Arrow')) keysDown.current[e.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); keysDown.current = {}; };
  }, [status]);

  // Cleanup audio on unmount
  useEffect(() => () => { audioRef.current?.pause(); window.speechSynthesis?.cancel(); }, []);

  // On-screen hold buttons (touch)
  const holdBtn = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); keysDown.current[key] = true; },
    onPointerUp:   () => { keysDown.current[key] = false; },
    onPointerLeave: () => { keysDown.current[key] = false; },
    onContextMenu:  (e: React.MouseEvent) => e.preventDefault(),
  });

  const fuelColor = fuel > 60 ? '#22c55e' : fuel > 30 ? '#f59e0b' : '#ef4444';

  const overlay = (children: React.ReactNode) => (
    <div className="absolute inset-0 z-30 flex items-center justify-center"
      style={{ background: 'rgba(10,30,80,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-4 border-sky-200 px-8 py-8 text-center max-w-sm mx-4">
        {children}
      </div>
    </div>
  );

  return (
    <div
      className="select-none"
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'linear-gradient(180deg, #0c2461 0%, #1e40af 18%, #2563eb 40%, #60a5fa 68%, #bae6fd 88%, #e8f7ff 100%)',
        touchAction: 'none', overflow: 'hidden',
      }}
    >
      {/* ── Parallax cloud layers ── */}
      {/* Far (slow) */}
      {FAR_CLOUDS.map((c, i) => (
        <div key={`fc${i}`} className="absolute pointer-events-none"
          style={{ top: c.top, left: '110vw', animation: `ag-cloud ${c.dur}s linear ${c.delay}s infinite` }}>
          <CloudShape w={c.w} opacity={0.55} />
        </div>
      ))}
      {/* Mid */}
      {MID_CLOUDS.map((c, i) => (
        <div key={`mc${i}`} className="absolute pointer-events-none"
          style={{ top: c.top, left: '110vw', animation: `ag-cloud ${c.dur}s linear ${c.delay}s infinite` }}>
          <CloudShape w={c.w} opacity={0.72} />
        </div>
      ))}
      {/* Near (fast, larger) */}
      {NEAR_CLOUDS.map((c, i) => (
        <div key={`nc${i}`} className="absolute pointer-events-none"
          style={{ top: c.top, left: '110vw', animation: `ag-cloud ${c.dur}s linear ${c.delay}s infinite` }}>
          <CloudShape w={c.w} opacity={0.88} />
        </div>
      ))}

      {/* ── Ground strip with hills ── */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: '10%', zIndex: 1 }}>
        <svg viewBox="0 0 1000 60" preserveAspectRatio="none" width="100%" height="100%">
          <defs>
            <linearGradient id="ag-ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#22c55e"/>
              <stop offset="100%" stopColor="#15803d"/>
            </linearGradient>
          </defs>
          <path d="M0 30 Q80 10 160 28 Q260 50 360 22 Q460 0 560 24 Q660 50 760 18 Q860 0 960 26 L1000 30 L1000 60 L0 60Z" fill="url(#ag-ground)"/>
          <path d="M0 40 Q100 28 200 38 Q300 50 400 32 Q500 18 600 36 Q700 52 800 30 Q900 14 1000 38 L1000 60 L0 60Z" fill="#16a34a"/>
        </svg>
      </div>

      {/* ── HUD ── */}
      {status === 'playing' && (
        <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2">
          <button onClick={onExit}
            className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95">
            ← Exit
          </button>
          {/* Fuel */}
          <div className="flex items-center gap-1.5 flex-1 max-w-[240px] bg-white/90 rounded-full px-3 py-1.5 border-2 border-sky-200 shadow">
            <span className="text-sm">⛽</span>
            <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${fuel}%`, background: fuelColor }}/>
            </div>
            <span className="text-[11px] font-extrabold text-slate-600 w-7 text-right">{fuel}</span>
          </div>
          {/* Score */}
          <div className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-200 text-xs font-extrabold text-indigo-700 shadow whitespace-nowrap">
            {score} / {queue.length}
          </div>
          {/* Replay */}
          <button onClick={() => playLetterAudio(currentLetter)}
            className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-amber-500 text-white text-base font-bold shadow active:scale-95">
            🔊
          </button>
        </div>
      )}

      {/* ── Bubbles ── */}
      {status === 'playing' && bubbles.map(b => (
        <div
          key={b.id}
          ref={el => { if (el) bubbleDomRefs.current.set(b.id, el); else bubbleDomRefs.current.delete(b.id); }}
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
            {b.letter}
          </span>
        </div>
      ))}

      {/* ── Airplane ── */}
      {status === 'playing' && (
        <div
          ref={planeRef}
          className="absolute z-20 pointer-events-none"
          style={{ left: `${planePos.current.x}%`, top: `${planePos.current.y}%`, transform: 'translate(-50%,-50%)' }}
        >
          <JetPlane />
        </div>
      )}

      {/* ── Hit flash overlay ── */}
      {flash && (
        <div className="absolute inset-0 z-10 pointer-events-none"
          style={{ background: flash === 'good' ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.28)' }}/>
      )}

      {/* ── On-screen arrows (touch) ── */}
      {status === 'playing' && (
        <div className="absolute bottom-16 right-3 z-20 grid grid-cols-3 gap-1.5" style={{ direction: 'ltr' }}>
          <div/>
          <button {...holdBtn('ArrowUp')}    className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▲</button>
          <div/>
          <button {...holdBtn('ArrowLeft')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">◀</button>
          <button {...holdBtn('ArrowDown')}  className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▼</button>
          <button {...holdBtn('ArrowRight')} className="w-12 h-12 rounded-xl bg-white/80 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow-md active:bg-sky-100 select-none">▶</button>
        </div>
      )}

      {/* ── Start screen ── */}
      {status === 'start' && overlay(
        <>
          <div className="flex justify-center mb-3"><JetPlane /></div>
          <h3 className="text-2xl font-extrabold text-sky-700 mb-2">Letter Flight!</h3>
          <p className="text-sm font-semibold text-slate-500 mb-1">
            Listen to the Arabic letter, then fly your jet into the correct bubble!
          </p>
          <p className="text-xs text-slate-400 mb-4" style={{ direction: 'rtl' }}>
            استمع إلى الحرف ثم طِر بالطائرة إلى الفقاعة الصحيحة
          </p>
          <p className="text-xs font-bold text-indigo-500 mb-5">⬆️⬇️⬅️➡️ Arrow keys to fly · ⛽ Don't run out of fuel!</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame}
              className="px-7 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold text-lg shadow-md active:scale-95 transition-all">
              Take off! 🚀
            </button>
            <button onClick={onExit}
              className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">
              Back
            </button>
          </div>
        </>
      )}

      {/* ── Win screen ── */}
      {status === 'won' && overlay(
        <>
          <div className="text-6xl mb-3">🏆</div>
          <h3 className="text-3xl font-extrabold text-pink-500 mb-2">You Win!</h3>
          <p className="text-sm font-bold text-blue-600 mb-5">You found all {queue.length} letters! Amazing flying! ✈️🌟</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Play Again</button>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </div>
        </>
      )}

      {/* ── Game over screen ── */}
      {status === 'lost' && overlay(
        <>
          <div className="text-6xl mb-3">🪂</div>
          <h3 className="text-3xl font-extrabold text-slate-600 mb-2">Game Over</h3>
          <p className="text-sm font-bold text-slate-500 mb-5">Out of fuel! You found {score} / {queue.length} letters. Try again!</p>
          <div className="flex gap-2 justify-center">
            <button onClick={startGame} className="px-6 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold shadow-md active:scale-95 transition-all">Try Again</button>
            <button onClick={onExit} className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all">Exit</button>
          </div>
        </>
      )}
    </div>
  );
};

export default AirplaneGame;
