import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';

// ─────────────────────────────────────────────────────────────────────────────
// Letter Race — a 2-player top-view keyboard race for the Arabic alphabet.
//
// Both players hear a letter, then race from the bottom line to the letter row
// at the top. Mashing SHIFT makes you run (left player = Left Shift, right
// player = Right Shift); steering is left/right only (A/D vs ←/→). Reaching
// the correct letter grabs it automatically and turns you around; first to
// carry it back across the bottom line wins the round. While one player
// carries the letter, the other can bump into them to steal it.
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
const START_Y   = 86;   // y of the bottom start/finish line
const BURST     = 0.55; // speed added per shift press
const MAX_SPEED = 1.35; // cap (%/frame)
const FRICTION  = 0.93; // per-frame decay — stop mashing and you slow down
const STEER     = 0.62; // sideways %/frame while a steer key is held
const GRAB_X    = 4.4;  // horizontal reach to grab a letter box
const STEAL_D   = 7;    // bump distance that steals the letter
const STEAL_GRACE = 900; // ms after a grab/steal during which no steal can happen
const ROUNDS_TO_WIN = 5;

const BOX_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf', '#c084fc', '#4ade80', '#38bdf8'];

interface RacePlayer {
  x: number; y: number;
  speed: number;          // forward speed from mashing
  carrying: boolean;
  carrySince: number;     // when they picked up / stole the letter (min-carry before a win)
  wrongBuzzAt: number;    // throttle for wrong-letter feedback
}
interface LetterBox { letter: string; x: number; isTarget: boolean; taken: boolean; wiggleAt: number; color: string }

type Phase = 'listen' | 'count' | 'race' | 'roundWon' | 'matchWon';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface LetterRaceProps { letters: string[]; letterForm?: LetterForm; onExit: () => void }
const LetterRaceGame = ({ letters, letterForm = 'isolated', onExit }: LetterRaceProps) => {
  const pool = letters.length ? letters : ARABIC_LETTERS;

  const [phase, setPhase] = useState<Phase>('listen');
  const [, setTick] = useState(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [roundWinner, setRoundWinner] = useState<1 | 2>(1);
  const [countNum, setCountNum] = useState<string>('3');

  const phaseRef = useRef<Phase>('listen');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Mutable game model (read inside the rAF loop) ──────────────────────────
  const game = useRef({
    target: pool[0],
    boxes: [] as LetterBox[],
    p1: { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0 } as RacePlayer,
    p2: { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0 } as RacePlayer,
    graceUntil: 0,           // no steals until this time (after grab / steal)
    checkP1First: true,      // alternate simultaneous-grab priority for fairness
  });
  const keys = useRef<Set<string>>(new Set());
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
    game.current.p1 = { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0 };
    game.current.p2 = { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0 };
    game.current.graceUntil = 0;

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
        // A run key already held down at GO still counts as the opening press.
        const held = keys.current, gg = game.current;
        if (held.has('ShiftLeft') || held.has('KeyW'))     gg.p1.speed = Math.min(MAX_SPEED, gg.p1.speed + BURST);
        if (held.has('ShiftRight') || held.has('ArrowUp')) gg.p2.speed = Math.min(MAX_SPEED, gg.p2.speed + BURST);
        setPhase('race');
      });
    });
  }, [pool, playLetterAudio, sfxCount, sfxGo]);

  // First round on mount; clean up timers/audio on unmount.
  useEffect(() => {
    setupRound();
    return () => {
      clearTimers();
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
      acRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard: mash Shift to run, steer with A/D and ←/→ ────────────────────
  useEffect(() => {
    // Run keys: Shift as designed, plus W / ↑ as equivalents — mashing Shift 5×
    // pops the OS Sticky-Keys dialog on Windows, so kids there can mash the
    // alternate key instead. Steering: A/D (left player) and ←/→ (right player).
    const HANDLED = ['ShiftLeft', 'ShiftRight', 'KeyW', 'ArrowUp', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'];
    const P1_RUN = ['ShiftLeft', 'KeyW'];
    const P2_RUN = ['ShiftRight', 'ArrowUp'];
    const down = (e: KeyboardEvent) => {
      if (!HANDLED.includes(e.code)) return;
      e.preventDefault();
      // Track held keys regardless of phase so steering works the instant the
      // race starts, even if the key was pressed during the countdown.
      keys.current.add(e.code);
      if (phaseRef.current !== 'race') return;
      const g = game.current;
      // Each *distinct press* of a run key is a burst of speed — holding does nothing.
      if (P1_RUN.includes(e.code) && !e.repeat) g.p1.speed = Math.min(MAX_SPEED, g.p1.speed + BURST);
      if (P2_RUN.includes(e.code) && !e.repeat) g.p2.speed = Math.min(MAX_SPEED, g.p2.speed + BURST);
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
  }, []);

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
    const step = (p: RacePlayer, other: RacePlayer, steerLeft: boolean, steerRight: boolean, who: 1 | 2) => {
      const g = game.current;
      const now = performance.now();
      // Steering (left/right only)
      if (steerLeft)  p.x = Math.max(4, p.x - STEER);
      if (steerRight) p.x = Math.min(96, p.x + STEER);
      // Forward direction: carry → run home (down); opponent carries → chase
      // them; otherwise → run to the letter row (up).
      let dir: number;
      if (p.carrying) dir = 1;
      else if (other.carrying) dir = Math.sign(other.y - p.y) || 1;
      else dir = -1;
      p.y += p.speed * dir;
      p.y = Math.max(LETTER_Y, Math.min(START_Y, p.y));
      p.speed *= FRICTION;
      if (p.speed < 0.02) p.speed = 0;

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
      const k = keys.current;
      const now = performance.now();

      // Alternate who is processed first so simultaneous grabs are fair.
      const order: Array<[RacePlayer, RacePlayer, boolean, boolean, 1 | 2]> = g.checkP1First
        ? [[g.p1, g.p2, k.has('KeyA'), k.has('KeyD'), 1], [g.p2, g.p1, k.has('ArrowLeft'), k.has('ArrowRight'), 2]]
        : [[g.p2, g.p1, k.has('ArrowLeft'), k.has('ArrowRight'), 2], [g.p1, g.p2, k.has('KeyA'), k.has('KeyD'), 1]];
      g.checkP1First = !g.checkP1First;
      for (const [p, other, sl, sr, who] of order) {
        if (step(p, other, sl, sr, who)) return; // round ended — stop the loop
      }

      // Steal: PUSH the carrier to take the letter — the robber must actually be
      // running (a standing player can't push), and the tackle knocks the robber
      // up-field so a steal at the finish line never wins on the spot. The
      // robbed player can counter-steal once the (short) grace expires.
      const carrier = g.p1.carrying ? g.p1 : g.p2.carrying ? g.p2 : null;
      if (carrier && now > g.graceUntil) {
        const robber = carrier === g.p1 ? g.p2 : g.p1;
        const d = Math.hypot(g.p1.x - g.p2.x, g.p1.y - g.p2.y);
        if (d < STEAL_D && robber.speed >= 0.3) {
          carrier.carrying = false;
          carrier.speed = 0;                    // the push knocks the wind out
          robber.carrying = true;
          robber.carrySince = now;
          robber.speed = Math.max(robber.speed, 0.5);
          robber.y = Math.max(LETTER_Y, robber.y - 10); // tackle momentum carries them up-field
          g.graceUntil = now + STEAL_GRACE;
          sfxSteal();
        }
      }

      setTick(t => (t + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, endRound, sfxGrab, sfxWrong, sfxSteal]);

  const g = game.current;
  const now = performance.now();
  const displayTarget = getLetterInForm(g.target, letterForm);
  const carrierGrace = now < g.graceUntil;

  const renderPlayer = (p: RacePlayer, who: 1 | 2) => {
    const color = who === 1 ? '#3b82f6' : '#f97316';
    const colorDark = who === 1 ? '#1d4ed8' : '#c2410c';
    const face = who === 1 ? '😃' : '😜';
    return (
      <div style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', zIndex: 10, transition: 'none', pointerEvents: 'none' }}>
        {/* Carried letter floats above the head */}
        {p.carrying && (
          <div style={{ position: 'absolute', bottom: '112%', left: '50%', transform: 'translateX(-50%)', background: '#fff', border: `3px solid ${color}`, borderRadius: 12, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.25)', animation: 'lrCarry 0.7s ease-in-out infinite' }}>
            <span dir="rtl" style={{ ...HAFS, fontSize: 26, lineHeight: 1, color: '#0f172a' }}>{displayTarget}</span>
          </div>
        )}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: `radial-gradient(circle at 32% 28%, ${color}, ${colorDark})`,
          border: '3.5px solid #fff',
          boxShadow: p.carrying && carrierGrace
            ? `0 0 0 4px ${color}55, 0 0 18px ${color}, 0 4px 8px rgba(0,0,0,0.3)`
            : '0 4px 8px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: p.speed > 0.15 ? 'lrRun 0.25s ease-in-out infinite' : undefined,
        }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{face}</span>
        </div>
        <div style={{ textAlign: 'center', marginTop: 3 }}>
          <span style={{ background: color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>P{who}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#14532d', overflow: 'hidden', userSelect: 'none' }}>
      {/* ── Field (top view): striped grass + side lines + finish line ── */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(to bottom, #4ade80 0, #4ade80 60px, #22c55e 60px, #22c55e 120px)' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '2%',  width: 4, background: 'rgba(255,255,255,0.7)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: '2%', width: 4, background: 'rgba(255,255,255,0.7)', borderRadius: 2 }} />
      {/* Start / finish line */}
      <div style={{ position: 'absolute', left: '2%', right: '2%', top: `${START_Y + 4}%`, height: 14, background: 'repeating-linear-gradient(90deg, #fff 0 14px, #1f2937 14px 28px)', borderRadius: 4, opacity: 0.9 }} />
      <div style={{ position: 'absolute', left: '3%', top: `${START_Y + 6.5}%`, fontSize: 22 }}>🏁</div>
      <div style={{ position: 'absolute', right: '3%', top: `${START_Y + 6.5}%`, fontSize: 22 }}>🏁</div>

      {/* ── Letter row ── */}
      {g.boxes.map((box, i) => !box.taken && (
        <div key={`${box.letter}-${i}`} style={{
          position: 'absolute', left: `${box.x}%`, top: `${LETTER_Y}%`, transform: 'translate(-50%,-50%)', zIndex: 5,
          width: 'clamp(44px, 7vw, 68px)', height: 'clamp(44px, 7vw, 68px)',
          background: '#fff', border: `4px solid ${box.color}`, borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 5px 12px rgba(0,0,0,0.25)',
          animation: now - box.wiggleAt < 500 ? 'lrShake 0.4s' : undefined,
        }}>
          <span dir="rtl" style={{ ...HAFS, fontSize: 'clamp(24px, 3.6vw, 38px)', lineHeight: 1, color: '#0f172a' }}>{getLetterInForm(box.letter, letterForm)}</span>
        </div>
      ))}

      {/* ── Players ── */}
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

      {/* ── Controls legend ── */}
      <div style={{ position: 'absolute', bottom: 8, left: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#1d4ed8' }}>🔵 Left player</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Mash <b>LEFT SHIFT</b> (or <b>W</b>) to run · <b>A</b>/<b>D</b> to steer</div>
      </div>
      <div style={{ position: 'absolute', bottom: 8, right: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', textAlign: 'right', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: '#c2410c' }}>Right player 🟠</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Mash <b>RIGHT SHIFT</b> (or <b>↑</b>) to run · <b>←</b>/<b>→</b> to steer</div>
      </div>

      {/* ── Listen overlay ── */}
      {phase === 'listen' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '26px 34px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}>
            <div style={{ fontSize: 46 }}>👂</div>
            <h3 style={{ margin: '6px 0 4px', fontWeight: 900, color: '#0f172a', fontSize: 22 }}>Listen to the letter!</h3>
            <p style={{ margin: 0, color: '#475569', fontWeight: 600, fontSize: 14 }}>Then race to find it and bring it home 🏁</p>
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
            <div style={{ fontSize: 52 }}>{roundWinner === 1 ? '🔵' : '🟠'}</div>
            <h3 style={{ margin: '6px 0 2px', fontWeight: 900, fontSize: 24, color: roundWinner === 1 ? '#1d4ed8' : '#c2410c' }}>Player {roundWinner} wins the round! 🎉</h3>
            <p style={{ margin: '4px 0 0', color: '#475569', fontWeight: 700 }}>{scores[0]} — {scores[1]} · next letter coming…</p>
          </div>
        </div>
      )}

      {/* ── Match won ── */}
      {phase === 'matchWon' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '30px 40px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 60 }}>🏆</div>
            <h3 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 26, color: roundWinner === 1 ? '#1d4ed8' : '#c2410c' }}>Player {roundWinner} wins the race!</h3>
            <p style={{ margin: '0 0 18px', color: '#475569', fontWeight: 700, fontSize: 16 }}>{scores[0]} — {scores[1]} · Amazing running! 🏃💨</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => { scoresRef.current = [0, 0]; setScores([0, 0]); setupRound(); }} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 24px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>🔄 Play again</button>
              <button onClick={onExit} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 999, padding: '12px 24px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes lrRun   { 0%,100% { transform: scale(1) rotate(-3deg); } 50% { transform: scale(1.07) rotate(3deg); } }
        @keyframes lrCarry { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-4px); } }
        @keyframes lrShake { 0%,100% { transform: translate(-50%,-50%) rotate(0); } 25% { transform: translate(-50%,-50%) rotate(-7deg); } 75% { transform: translate(-50%,-50%) rotate(7deg); } }
        @keyframes lrPop   { 0% { transform: scale(0.3); opacity: 0; } 40% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default LetterRaceGame;
