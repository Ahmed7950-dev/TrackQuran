import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';

// ─────────────────────────────────────────────────────────────────────────────
// Airplane listening game: hear an Arabic letter, fly the plane into the
// bubble showing that letter. Fuel = health; win by completing all selected
// letters before fuel runs out.
// ─────────────────────────────────────────────────────────────────────────────

type GameStatus = 'start' | 'playing' | 'won' | 'lost';

type Bubble = {
  id: string;
  letter: string;
  x: number;       // % of arena width  (bubble centre)
  y: number;       // % of arena height (bubble centre)
  isCorrect: boolean;
  popped: boolean;
  driftDelay: number;
};

const START_FUEL = 100;
const FUEL_GAIN = 10;
const FUEL_LOSS = 20;
const PLANE_SPEED = 0.55;   // % of arena per frame at 60fps
const BUBBLE_RADIUS_PCT = 9; // collision radius as % of arena width

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeBubbles(correctLetter: string): Bubble[] {
  const count = 3 + Math.floor(Math.random() * 3); // 3–5
  const wrong = shuffle(ARABIC_LETTERS.filter(l => l !== correctLetter)).slice(0, count - 1);
  const letters = shuffle([correctLetter, ...wrong]);
  // Non-overlapping positions: distinct vertical slots (below the HUD) paired
  // with distinct horizontal bands in the right half of the sky, plus jitter.
  const ySlots = shuffle([24, 41, 58, 74, 88]).slice(0, count).sort((a, b) => a - b);
  const xBands = shuffle([48, 59, 70, 81, 90]).slice(0, count);
  return letters.map((letter, i) => ({
    id: `${Date.now()}-${i}`,
    letter,
    x: xBands[i] + (Math.random() * 6 - 3),
    y: ySlots[i],
    isCorrect: letter === correctLetter,
    popped: false,
    driftDelay: Math.random() * 2,
  }));
}

// Tiny WebAudio blips so we don't need sound asset files.
function playTone(freqs: number[], duration = 0.15, type: OscillatorType = 'sine') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * duration);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (i + 1) * duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * duration);
      osc.stop(ctx.currentTime + (i + 1) * duration);
    });
    setTimeout(() => ctx.close(), (freqs.length + 1) * duration * 1000);
  } catch { /* audio unavailable — ignore */ }
}
const playSuccess = () => playTone([523, 659, 784], 0.12);
const playWrong   = () => playTone([220, 165], 0.18, 'square');

interface AirplaneGameProps {
  letters: string[];      // the letters chosen for the challenge
  onExit: () => void;
}

const AirplaneGame: React.FC<AirplaneGameProps> = ({ letters, onExit }) => {
  const [status, setStatus] = useState<GameStatus>('start');
  const [fuel, setFuel] = useState(START_FUEL);
  const [score, setScore] = useState(0);
  const [queue, setQueue] = useState<string[]>([]);
  const [queuePos, setQueuePos] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [flash, setFlash] = useState<'good' | 'bad' | null>(null);

  const arenaRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const planePos = useRef({ x: 12, y: 50 });           // % of arena
  const keysDown = useRef<Record<string, boolean>>({});
  const rafRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const currentLetterRef = useRef('');
  const collidingRef = useRef(false); // debounce so one hit registers once

  bubblesRef.current = bubbles;
  const currentLetter = queue[queuePos] ?? '';
  currentLetterRef.current = currentLetter;

  // ── Audio: play uploaded file, fall back to Arabic TTS ────────────────────
  const playLetterAudio = useCallback((letter: string) => {
    if (!letter) return;
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    const audio = new Audio(`${letterAudioUrl(letter)}?t=${Date.now() % 1e7}`);
    audioRef.current = audio;
    audio.onerror = () => speakLetter(letter);
    audio.play().catch(() => speakLetter(letter));
  }, []);

  // ── Round / game setup ─────────────────────────────────────────────────────
  const startRound = useCallback((letter: string) => {
    setBubbles(makeBubbles(letter));
    collidingRef.current = false;
    // brief pause so the popped bubble from last round is gone before audio
    setTimeout(() => playLetterAudio(letter), 350);
  }, [playLetterAudio]);

  const startGame = useCallback(() => {
    const q = shuffle(letters);
    setQueue(q);
    setQueuePos(0);
    setFuel(START_FUEL);
    setScore(0);
    planePos.current = { x: 12, y: 50 };
    setStatus('playing');
    startRound(q[0]);
  }, [letters, startRound]);

  // ── Collision + hit handling ───────────────────────────────────────────────
  const queuePosRef = useRef(0);
  useEffect(() => { queuePosRef.current = queuePos; }, [queuePos]);

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
        setTimeout(() => setBubbles([]), 500);
        // small gap, then next letter round
        setTimeout(() => {
          planePos.current = { x: 12, y: 50 };
          startRound(queue[next]);
        }, 700);
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
      // allow further collisions after passing through
      setTimeout(() => { collidingRef.current = false; }, 500);
    }
    setTimeout(() => setFlash(null), 400);
  }, [queue, startRound]);

  const handleHitRef = useRef(handleHit);
  useEffect(() => { handleHitRef.current = handleHit; }, [handleHit]);

  // ── Game loop: movement + collision ───────────────────────────────────────
  useEffect(() => {
    if (status !== 'playing') return;

    const tick = () => {
      const k = keysDown.current;
      const p = planePos.current;
      if (k.ArrowUp)    p.y = Math.max(6,  p.y - PLANE_SPEED * 1.4);
      if (k.ArrowDown)  p.y = Math.min(94, p.y + PLANE_SPEED * 1.4);
      if (k.ArrowLeft)  p.x = Math.max(4,  p.x - PLANE_SPEED);
      if (k.ArrowRight) p.x = Math.min(96, p.x + PLANE_SPEED);

      if (planeRef.current) {
        planeRef.current.style.left = `${p.x}%`;
        planeRef.current.style.top = `${p.y}%`;
      }

      // Collision: compare in % space (x weighted by aspect ratio ≈ fine for kids game)
      if (!collidingRef.current) {
        for (const b of bubblesRef.current) {
          if (b.popped) continue;
          const dx = b.x - p.x;
          const dy = (b.y - p.y) * 0.6; // arena is wider than tall
          if (Math.sqrt(dx * dx + dy * dy) < BUBBLE_RADIUS_PCT) {
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
    const down = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) { e.preventDefault(); keysDown.current[e.key] = true; }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) keysDown.current[e.key] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keysDown.current = {};
    };
  }, [status]);

  // Stop audio when leaving
  useEffect(() => () => {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
  }, []);

  // CSS animations
  useEffect(() => {
    const id = 'airplane-game-styles';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes ag-float { 0%,100%{transform:translate(-50%,-50%) translateY(-6px)} 50%{transform:translate(-50%,-50%) translateY(6px)} }
      @keyframes ag-pop   { 0%{transform:translate(-50%,-50%) scale(1);opacity:1} 100%{transform:translate(-50%,-50%) scale(1.7);opacity:0} }
      @keyframes ag-cloud { from{transform:translateX(0)} to{transform:translateX(-120vw)} }
      .ag-bubble { animation: ag-float 3.2s ease-in-out infinite; }
      .ag-popped { animation: ag-pop .4s ease-out forwards; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // On-screen arrow controls (touch / mouse hold)
  const holdBtn = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); keysDown.current[key] = true; },
    onPointerUp: () => { keysDown.current[key] = false; },
    onPointerLeave: () => { keysDown.current[key] = false; },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const fuelColor = fuel > 60 ? '#22c55e' : fuel > 30 ? '#f59e0b' : '#ef4444';

  // ── Screens ────────────────────────────────────────────────────────────────
  const overlay = (children: React.ReactNode) => (
    <div className="absolute inset-0 z-30 flex items-center justify-center" style={{ background: 'rgba(30,58,138,0.45)', backdropFilter: 'blur(3px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl border-4 border-sky-200 px-8 py-8 text-center max-w-sm mx-4">
        {children}
      </div>
    </div>
  );

  return (
    <div
      ref={arenaRef}
      className="relative w-full overflow-hidden rounded-2xl select-none"
      style={{
        height: 'min(62vh, 520px)',
        minHeight: 340,
        background: 'linear-gradient(180deg, #7dd3fc 0%, #bae6fd 55%, #e0f2fe 100%)',
        touchAction: 'none',
      }}
    >
      {/* Drifting clouds */}
      {[{ t: '12%', d: 60, s: 1.4, o: 0.9 }, { t: '38%', d: 85, s: 1, o: 0.7 }, { t: '70%', d: 70, s: 1.8, o: 0.8 }].map((c, i) => (
        <div key={i} className="absolute pointer-events-none" style={{ top: c.t, left: '110%', fontSize: `${c.s * 2.4}rem`, opacity: c.o, animation: `ag-cloud ${c.d}s linear ${i * -22}s infinite` }}>☁️</div>
      ))}

      {/* HUD */}
      {status === 'playing' && (
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center gap-2 sm:gap-3">
          <button
            onClick={onExit}
            className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-300 text-sky-700 text-xs font-bold shadow active:scale-95"
          >← Exit</button>

          {/* Fuel bar */}
          <div className="flex items-center gap-1.5 flex-1 max-w-[260px] bg-white/90 rounded-full px-3 py-1.5 border-2 border-sky-200 shadow">
            <span className="text-base leading-none">⛽</span>
            <div className="flex-1 h-3 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${fuel}%`, background: fuelColor }} />
            </div>
            <span className="text-[11px] font-extrabold text-slate-600 w-7 text-right">{fuel}</span>
          </div>

          {/* Progress */}
          <div className="px-3 py-1.5 rounded-full bg-white/90 border-2 border-sky-200 text-xs font-extrabold text-indigo-700 shadow whitespace-nowrap">
            {score} / {queue.length}
          </div>

          {/* Replay audio */}
          <button
            onClick={() => playLetterAudio(currentLetter)}
            className="px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-amber-500 text-white text-base font-bold shadow active:scale-95"
            title="Hear the letter again"
          >🔊</button>
        </div>
      )}

      {/* Bubbles */}
      {status === 'playing' && bubbles.map(b => (
        <div
          key={b.id}
          className={`absolute z-10 flex items-center justify-center rounded-full ${b.popped ? 'ag-popped' : 'ag-bubble'}`}
          style={{
            left: `${b.x}%`, top: `${b.y}%`,
            transform: 'translate(-50%,-50%)',
            width: 'clamp(64px, 13vw, 96px)', height: 'clamp(64px, 13vw, 96px)',
            background: 'radial-gradient(circle at 32% 30%, rgba(255,255,255,0.95), rgba(186,230,253,0.75) 55%, rgba(125,211,252,0.85))',
            border: '3px solid rgba(255,255,255,0.9)',
            boxShadow: '0 4px 14px rgba(14,116,144,0.25), inset 0 -4px 10px rgba(14,116,144,0.15)',
            animationDelay: `${b.driftDelay}s`,
          }}
        >
          <span style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: 'clamp(2rem, 6vw, 3rem)', lineHeight: 1, color: '#0c4a6e' }}>
            {b.letter}
          </span>
        </div>
      ))}

      {/* Airplane */}
      {status === 'playing' && (
        <div
          ref={planeRef}
          className="absolute z-20 pointer-events-none"
          style={{ left: `${planePos.current.x}%`, top: `${planePos.current.y}%`, transform: 'translate(-50%,-50%) scaleX(-1)', fontSize: 'clamp(2.4rem, 7vw, 3.6rem)', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))' }}
        >✈️</div>
      )}

      {/* Hit flash */}
      {flash && (
        <div className="absolute inset-0 z-10 pointer-events-none transition-opacity" style={{ background: flash === 'good' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.3)' }} />
      )}

      {/* On-screen arrows (mobile) */}
      {status === 'playing' && (
        <div className="absolute bottom-2 right-2 z-20 grid grid-cols-3 gap-1 sm:hidden" style={{ direction: 'ltr' }}>
          <div />
          <button {...holdBtn('ArrowUp')} className="w-11 h-11 rounded-xl bg-white/85 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow active:bg-sky-100">▲</button>
          <div />
          <button {...holdBtn('ArrowLeft')} className="w-11 h-11 rounded-xl bg-white/85 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow active:bg-sky-100">◀</button>
          <button {...holdBtn('ArrowDown')} className="w-11 h-11 rounded-xl bg-white/85 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow active:bg-sky-100">▼</button>
          <button {...holdBtn('ArrowRight')} className="w-11 h-11 rounded-xl bg-white/85 border-2 border-sky-300 text-sky-700 text-lg font-bold shadow active:bg-sky-100">▶</button>
        </div>
      )}

      {/* ── Start screen ── */}
      {status === 'start' && overlay(
        <>
          <div className="text-5xl mb-3">✈️</div>
          <h3 className="text-2xl font-extrabold text-sky-700 mb-2">Letter Flight!</h3>
          <p className="text-sm font-semibold text-slate-500 mb-1">
            Listen to the Arabic letter, then fly your airplane into the correct letter bubble!
          </p>
          <p className="text-xs text-slate-400 mb-4" style={{ direction: 'rtl' }}>
            استمع إلى الحرف ثم طِر بالطائرة إلى الفقاعة الصحيحة
          </p>
          <p className="text-xs font-bold text-indigo-500 mb-5">
            ⬆️⬇️⬅️➡️ Arrow keys to fly · ⛽ Don't run out of fuel!
          </p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={startGame}
              className="px-7 py-2.5 rounded-full bg-orange-400 hover:bg-orange-500 text-white font-extrabold text-lg shadow-md shadow-orange-200 active:scale-95 transition-all"
            >Start! 🚀</button>
            <button
              onClick={onExit}
              className="px-5 py-2.5 rounded-full bg-white border-2 border-sky-200 text-sky-600 font-bold active:scale-95 transition-all"
            >Back</button>
          </div>
        </>
      )}

      {/* ── Win screen ── */}
      {status === 'won' && overlay(
        <>
          <div className="text-6xl mb-3">🏆</div>
          <h3 className="text-3xl font-extrabold text-pink-500 mb-2">You Win!</h3>
          <p className="text-sm font-bold text-blue-600 mb-5">
            You found all {queue.length} letters! Amazing flying! ✈️🌟
          </p>
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
          <p className="text-sm font-bold text-slate-500 mb-5">
            Out of fuel! You found {score} / {queue.length} letters. Try again!
          </p>
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
