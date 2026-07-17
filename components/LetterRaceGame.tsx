import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ARABIC_LETTERS, letterAudioUrl, speakLetter } from '../services/letterAudioService';
import { RunnerStage, type RunnerPose } from './letterRaceStage';

// ─────────────────────────────────────────────────────────────────────────────
// Letter Race — a 2-player top-view keyboard race for the Arabic alphabet.
//
// Both players hear a letter, then race from the bottom line to the letter row
// at the top. HOLDING Q (left player) / M (right player) makes you run;
// HOLDING A/D vs ←/→ steers through a full 360°. Z / N throws a tackle: a
// fast forward lunge that knocks the opponent down for 2 seconds on contact
// (and takes their letter via the steal rules). Reaching the correct letter
// grabs it automatically; first to carry it back across the bottom line wins
// the round. Characters are live 3D models — see letterRaceStage.ts.
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
  heading: number;        // absolute direction in degrees (0 = up-screen, +clockwise, full 360°)
  tackleUntil: number;    // mid-tackle-dash until this time
  tackleCd: number;       // next tackle allowed after this time
  fallenUntil: number;    // knocked down until this time (no input, no movement)
  tackleHit: boolean;     // this dash already felled someone
}
interface LetterBox { letter: string; x: number; isTarget: boolean; taken: boolean; wiggleAt: number; color: string }

// The racer — a Mixamo character rendered as a REAL-TIME 3D model (three.js,
// public/models/runner.glb: run / tackle / trip clips) in letterRaceStage.ts,
// so it rotates through a true 360° as players steer. Both players run the
// SAME character; Player 2 wears a teal tint (hue-rotate on sprites/texture).
const P2_TINT = 'hue-rotate(165deg)';
const tintFor = (who: 1 | 2) => (who === 2 ? P2_TINT : 'none');
// Static portraits for HUD / overlays (pre-rendered PNGs).
const spriteFor = (dir: 'up' | 'down' = 'down') => `/sprites/race-runner-${dir}.png?v=3`;

type Phase = 'select' | 'listen' | 'count' | 'race' | 'roundWon' | 'matchWon';

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

  const [phase, setPhase] = useState<Phase>('select');
  const [, setTick] = useState(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [roundWinner, setRoundWinner] = useState<1 | 2>(1);
  const [countNum, setCountNum] = useState<string>('3');

  const phaseRef = useRef<Phase>('select');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Mutable game model (read inside the rAF loop) ──────────────────────────
  const game = useRef({
    target: pool[0],
    boxes: [] as LetterBox[],
    p1: { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false } as RacePlayer,
    p2: { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false } as RacePlayer,
    graceUntil: 0,           // no steals until this time (after grab / steal)
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
        anim: t < pl.fallenUntil ? 'trip' : t < pl.tackleUntil ? 'tackle' : pl.speed > 0.02 ? 'run' : 'idle',
      });
      return [pose(gg.p1), pose(gg.p2)];
    });
    stage.init().catch(err => console.error('[LetterRace] 3D stage failed:', err));
    if ((import.meta as any).env?.DEV) { (window as any).__lrStage = stage; (window as any).__lrGame = game; (window as any).__lrKeys = keys; }
    return () => stage.dispose();
  }, []);
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
    game.current.p1 = { x: 35, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false };
    game.current.p2 = { x: 65, y: START_Y, speed: 0, carrying: false, carrySince: 0, wrongBuzzAt: 0, heading: 0, tackleUntil: 0, tackleCd: 0, fallenUntil: 0, tackleHit: false };
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

  // ── Keyboard: mash Q/M to run, HOLD A/D or ←/→ to turn (360°), Z/N tackle ──
  useEffect(() => {
    const HANDLED = ['KeyQ', 'KeyM', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'KeyZ', 'KeyN'];
    const down = (e: KeyboardEvent) => {
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
      const tackle = (pl: RacePlayer) => {
        if (now < pl.tackleCd || now < pl.fallenUntil) return;
        pl.tackleUntil = now + TACKLE_MS;
        pl.tackleCd = now + TACKLE_COOLDOWN;
        pl.tackleHit = false;
        pl.speed = TACKLE_SPEED;
        sfxSteal();
      };
      if (e.code === 'KeyZ' && !e.repeat) tackle(g.p1);
      if (e.code === 'KeyN' && !e.repeat) tackle(g.p2);
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
    const step = (p: RacePlayer, other: RacePlayer, who: 1 | 2) => {
      const g = game.current;
      const now = performance.now();
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
      const held = keys.current;
      if (held.has('KeyQ') && now >= g.p1.fallenUntil && now >= g.p1.tackleUntil) g.p1.speed = Math.min(MAX_SPEED, g.p1.speed + RUN_ACCEL);
      if (held.has('KeyM') && now >= g.p2.fallenUntil && now >= g.p2.tackleUntil) g.p2.speed = Math.min(MAX_SPEED, g.p2.speed + RUN_ACCEL);
      // HOLD-to-steer: rotate freely through 360° while the key is down.
      const rot = (pl: RacePlayer, d: number) => { if (now >= pl.fallenUntil) pl.heading = (pl.heading + d * ROT_PER_FRAME + 360) % 360; };
      if (held.has('KeyA'))       rot(g.p1, -1);
      if (held.has('KeyD'))       rot(g.p1, +1);
      if (held.has('ArrowLeft'))  rot(g.p2, -1);
      if (held.has('ArrowRight')) rot(g.p2, +1);

      // Tackle contact: a mid-dash player knocks the other one down for 2s
      // (the letter transfer, if they were carrying, happens in the steal
      // block below — the dash speed satisfies its running requirement).
      for (const [t, v] of [[g.p1, g.p2], [g.p2, g.p1]] as Array<[RacePlayer, RacePlayer]>) {
        if (now < t.tackleUntil && !t.tackleHit && now >= v.fallenUntil) {
          if (Math.hypot(t.x - v.x, t.y - v.y) < TACKLE_REACH) {
            t.tackleHit = true;
            v.fallenUntil = now + FALL_MS;
            v.speed = 0;
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
    const dusty = p.speed > 0.11;
    const fallen = now < p.fallenUntil;
    return (
      <div style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', zIndex: 10, transition: 'none', pointerEvents: 'none' }}>
        {/* Carried letter floats above the head */}
        {p.carrying && (
          <div style={{ position: 'absolute', bottom: '116%', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(#ffffff,#fef9c3)', border: `3px solid ${color}`, borderRadius: 12, width: 46, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 14px ${color}88, 0 4px 10px rgba(0,0,0,0.25)`, animation: 'lrCarry 0.7s ease-in-out infinite' }}>
            <span dir="rtl" style={{ ...HAFS, fontSize: 27, lineHeight: 1, color: '#0f172a' }}>{displayTarget}</span>
          </div>
        )}
        {/* Dust puffs kicked up behind while sprinting */}
        {dusty && (
          <>
            <div style={{ position: 'absolute', left: '12%', [p.carrying ? 'top' : 'bottom']: -10, width: 11, height: 11, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', animation: 'lrDust 0.5s ease-out infinite' } as React.CSSProperties} />
            <div style={{ position: 'absolute', right: '12%', [p.carrying ? 'top' : 'bottom']: -8, width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', animation: 'lrDust 0.5s ease-out infinite', animationDelay: '0.22s' } as React.CSSProperties} />
          </>
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
          <span style={{ background: color, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.25)' }}>P{who}</span>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#14532d', overflow: 'hidden', userSelect: 'none' }}>
      {/* ── Field (top view): mowed-lawn lanes + vignette + bushes + finish line ── */}
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(to right, #4fc76a 0, #4fc76a 90px, #3fb95c 90px, #3fb95c 180px)' }} />
      {/* subtle darker edges so the field reads as a lit stadium */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(6,50,20,0.35) 100%)', pointerEvents: 'none' }} />
      {/* boundary lines */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '2%',  width: 4, background: 'rgba(255,255,255,0.75)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: '2%', width: 4, background: 'rgba(255,255,255,0.75)', borderRadius: 2 }} />
      {/* bushes along the side margins */}
      {[8, 24, 40, 56, 72, 88].map(y => (
        <React.Fragment key={`bush-${y}`}>
          <div style={{ position: 'absolute', left: '0.2%', top: `${y}%`, width: 24, height: 24, borderRadius: '50%', background: '#15803d', boxShadow: '10px 7px 0 -3px #166534, -4px 10px 0 -5px #14532d, 0 3px 6px rgba(0,0,0,0.3)' }} />
          <div style={{ position: 'absolute', right: '0.2%', top: `${y + 7}%`, width: 22, height: 22, borderRadius: '50%', background: '#166534', boxShadow: '-9px 6px 0 -3px #15803d, 4px 9px 0 -5px #14532d, 0 3px 6px rgba(0,0,0,0.3)' }} />
        </React.Fragment>
      ))}
      {/* Start / finish line */}
      <div style={{ position: 'absolute', left: '2%', right: '2%', top: `${START_Y + 4}%`, height: 15, background: 'repeating-linear-gradient(90deg, #fff 0 14px, #1f2937 14px 28px)', borderRadius: 4, opacity: 0.95, boxShadow: '0 3px 8px rgba(0,0,0,0.25)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: `${START_Y + 7}%`, textAlign: 'center', color: 'rgba(255,255,255,0.85)', fontWeight: 900, fontSize: 13, letterSpacing: 6, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>FINISH</div>

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
            <span dir="rtl" style={{ ...HAFS, fontSize: 'clamp(24px, 3.6vw, 38px)', lineHeight: 1, color: '#0f172a' }}>{getLetterInForm(box.letter, letterForm)}</span>
          </div>
        </div>
      ))}

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

      {/* ── Controls legend ── */}
      <div style={{ position: 'absolute', bottom: 8, left: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 900, color: '#1d4ed8' }}>
          <img src={spriteFor()} alt="" style={{ height: 24 }} /> Left player
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>Q</b> to run · <b>A</b>/<b>D</b> to turn · <b>Z</b> tackles!</div>
      </div>
      <div style={{ position: 'absolute', bottom: 8, right: 12, zIndex: 15, background: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: '8px 12px', boxShadow: '0 3px 10px rgba(0,0,0,0.25)', textAlign: 'right', opacity: phase === 'race' ? 0.45 : 1, transition: 'opacity 0.3s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, fontSize: 12, fontWeight: 900, color: '#c2410c' }}>
          Right player <img src={spriteFor()} alt="" style={{ height: 24, filter: P2_TINT }} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Hold <b>M</b> to run · <b>←</b>/<b>→</b> to turn · <b>N</b> tackles!</div>
      </div>

      {/* ── Listen overlay ── */}
      {phase === 'listen' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '24px 34px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.45)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 6 }}>
              <img src={spriteFor()} alt="" style={{ height: 60, animation: 'lrIdle 1.4s ease-in-out infinite' }} />
              <span style={{ fontWeight: 900, fontSize: 18, color: '#94a3b8' }}>VS</span>
              <img src={spriteFor()} alt="" style={{ height: 60, animation: 'lrIdle 1.4s ease-in-out infinite', animationDelay: '0.7s', filter: P2_TINT }} />
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
            <img src={spriteFor()} alt="" style={{ height: 78, animation: 'lrIdle 0.6s ease-in-out infinite', filter: tintFor(roundWinner) }} />
            <h3 style={{ margin: '6px 0 2px', fontWeight: 900, fontSize: 24, color: roundWinner === 1 ? '#1d4ed8' : '#c2410c' }}>Player {roundWinner} wins the round! 🎉</h3>
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
              <img src={spriteFor()} alt="" style={{ height: 92, animation: 'lrIdle 0.6s ease-in-out infinite', filter: tintFor(roundWinner) }} />
              <span style={{ fontSize: 48 }}>🏆</span>
            </div>
            <h3 style={{ margin: '8px 0 4px', fontWeight: 900, fontSize: 26, color: roundWinner === 1 ? '#1d4ed8' : '#c2410c' }}>Player {roundWinner} wins the race!</h3>
            <p style={{ margin: '0 0 18px', color: '#475569', fontWeight: 700, fontSize: 16 }}>{scores[0]} — {scores[1]} · Amazing running! 🏃💨</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => { scoresRef.current = [0, 0]; setScores([0, 0]); setupRound(); }} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>🔄 Play again</button>
              <button onClick={() => { clearTimers(); scoresRef.current = [0, 0]; setScores([0, 0]); setPhase('select'); }} style={{ background: '#eef2ff', color: '#4338ca', border: '2px solid #c7d2fe', borderRadius: 999, padding: '12px 18px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>🏁 Back to start</button>
              <button onClick={onExit} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 999, padding: '12px 22px', fontWeight: 900, cursor: 'pointer', fontSize: 15 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start screen (before the match) ── */}
      {phase === 'select' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(6,30,12,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 26, padding: '24px 28px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <h3 style={{ margin: '0 0 3px', fontWeight: 900, fontSize: 24, color: '#0f172a' }}>🏁 Ready to race?</h3>
            <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 600, fontSize: 13 }}>Listen for the letter, run to grab it, and bring it home first!</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 26, marginBottom: 6 }}>
              <div>
                <img src={spriteFor()} alt="" style={{ height: 86, animation: 'lrIdle 1.4s ease-in-out infinite' }} />
                <div style={{ fontWeight: 900, color: '#1d4ed8', fontSize: 14, marginTop: 4 }}>Player 1</div>
              </div>
              <span style={{ fontWeight: 900, fontSize: 20, color: '#94a3b8', paddingBottom: 30 }}>VS</span>
              <div>
                <img src={spriteFor()} alt="" style={{ height: 86, animation: 'lrIdle 1.4s ease-in-out infinite', animationDelay: '0.7s', filter: P2_TINT }} />
                <div style={{ fontWeight: 900, color: '#c2410c', fontSize: 14, marginTop: 4 }}>Player 2</div>
              </div>
            </div>
            <button onClick={() => setupRound()} style={{ marginTop: 12, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', borderRadius: 999, padding: '13px 40px', fontWeight: 900, cursor: 'pointer', fontSize: 17, boxShadow: '0 6px 18px rgba(22,163,74,0.45)' }}>Start the Race! 🏃💨</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes lrRun      { 0%,100% { transform: scale(1) rotate(-4deg) translateY(0); } 50% { transform: scale(1.06) rotate(4deg) translateY(-3px); } }
        @keyframes lrIdle     { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.015); } }
        @keyframes lrCarry    { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-4px); } }
        @keyframes lrShakeBox { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 75% { transform: rotate(7deg); } }
        @keyframes lrDust     { 0% { transform: scale(0.4); opacity: 0.8; } 100% { transform: scale(1.7) translateY(6px); opacity: 0; } }
        @keyframes lrPopIn    { 0% { transform: translate(-50%,-50%) scale(0); } 65% { transform: translate(-50%,-50%) scale(1.12); } 100% { transform: translate(-50%,-50%) scale(1); } }
        @keyframes lrPop      { 0% { transform: scale(0.3); opacity: 0; } 40% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes lrConfetti { 0% { transform: translateY(-10vh) rotate(0); opacity: 1; } 100% { transform: translateY(105vh) rotate(720deg); opacity: 0.9; } }
      `}</style>
    </div>
  );
};

export default LetterRaceGame;
