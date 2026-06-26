import React, { useState, useEffect, useRef, useCallback } from 'react';
import { wordAudioUrl, speakWord } from '../services/wordAudioService';

// ─────────────────────────────────────────────────────────────────────────────
// Crane Builder — a Qaedah word-building game.
//
// The student listens to a word (e.g. كُتِبَ), then drives a tower crane to pick
// up letter & vowel cubes scattered on the ground and stack them, in the correct
// order, to rebuild the word. Below-letter vowels (kasra) form the foundation and
// the letter sits on top; above-letter vowels (fatha/damma/sukun) sit on top of
// the letter. A wrong cube in a slot buzzes and flashes red.
//
// Controls:  ← →  move the trolley along the rail
//            ↑ ↓  raise / lower the magnet
//            Space  grab a cube under the magnet / drop it onto the next slot
// ─────────────────────────────────────────────────────────────────────────────

const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif" };

// Stage is a fixed coordinate space; the wrapper scales it responsively.
const STAGE_W = 960;
const STAGE_H = 600;
const CUBE = 58;            // cube edge (stage units)
const RAIL_Y = 64;          // gantry rail height
const HOOK_MIN = 104;       // highest the magnet rises (just under the rail)
const HOOK_MAX = 540;       // lowest the magnet drops (near the ground)
const TROLLEY_SPEED = 5.5;
const HOOK_SPEED = 6;
const GRAB_RADIUS = 46;
const DROP_RADIUS = 58;
const BASE_Y = 458;         // y-centre of each column's bottom slot
const GROUND_Y = 548;       // y-centre of cubes resting on the ground
const TROLLEY_MIN = 60;
const TROLLEY_MAX = STAGE_W - 60;

// Combining marks we support, with their vertical placement relative to the letter.
const MARK_POS: Record<string, 'above' | 'below'> = {
  'ً': 'above', // fathatan
  'ٌ': 'above', // dammatan
  'ٍ': 'below', // kasratan
  'َ': 'above', // fatha
  'ُ': 'above', // damma
  'ِ': 'below', // kasra
  'ّ': 'above', // shadda
  'ْ': 'above', // sukun
  'ٰ': 'above', // superscript alef
};
const isMark = (ch: string) => ch in MARK_POS || (ch >= 'ً' && ch <= 'ْ');

// Distractor pools (cubes that are NOT in the word, to make it a real puzzle).
const FILLER_LETTERS = ['ب','ت','ج','د','ر','س','ع','ف','ك','ل','م','ن','ه','و','ي'];
const FILLER_MARKS = ['َ','ُ','ِ','ْ'];

// A target slot in the building, and (once placed) the cube occupying it.
interface Slot { matchKey: string; glyph: string; kind: 'letter' | 'mark'; x: number; y: number; }
// A cube the player can pick up.
interface Cube {
  id: number; matchKey: string; glyph: string; kind: 'letter' | 'mark';
  x: number; y: number; state: 'ground' | 'held' | 'placed';
}

const dottedMark = (mark: string) => `◌${mark}`; // ◌ + combining mark renders the mark alone

/** Decompose a word into per-letter columns and the ordered slot sequence. */
function buildPlan(word: string): { slots: Slot[]; cols: number } {
  const chars = Array.from(word).filter(ch => ch.trim() !== '');
  type Col = { letter: string; below: string[]; above: string[] };
  const cols: Col[] = [];
  for (const ch of chars) {
    if (isMark(ch) && cols.length > 0) {
      const pos = MARK_POS[ch] ?? 'above';
      (pos === 'below' ? cols[cols.length - 1].below : cols[cols.length - 1].above).push(ch);
    } else if (!isMark(ch)) {
      cols.push({ letter: ch, below: [], above: [] });
    }
  }

  const numCols = cols.length;
  const totalW = numCols * CUBE * 1.18;
  const startRight = STAGE_W / 2 + totalW / 2 - CUBE * 0.59; // column 0 sits on the right (RTL)

  const slots: Slot[] = [];
  cols.forEach((col, i) => {
    const colX = startRight - i * CUBE * 1.18;
    // bottom → top: below marks (foundation), then the letter, then above marks
    const stack: Array<{ glyph: string; matchKey: string; kind: 'letter' | 'mark' }> = [
      ...col.below.map(m => ({ glyph: dottedMark(m), matchKey: m, kind: 'mark' as const })),
      { glyph: col.letter, matchKey: col.letter, kind: 'letter' as const },
      ...col.above.map(m => ({ glyph: dottedMark(m), matchKey: m, kind: 'mark' as const })),
    ];
    stack.forEach((s, level) => {
      slots.push({ ...s, x: colX, y: BASE_Y - level * CUBE });
    });
  });
  return { slots, cols: numCols };
}

let cubeIdSeq = 1;

const CraneBuilderGame: React.FC<{ words: string[]; topicTitle?: string; onExit: () => void }> = ({ words, topicTitle, onExit }) => {
  const cleanWords = words.map(w => w.trim()).filter(Boolean);
  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'wordDone' | 'allDone'>('playing');
  const [tick, setTick] = useState(0);          // forces re-render each animation frame
  const [showHelp, setShowHelp] = useState(true);

  const word = cleanWords[wordIndex] ?? '';

  // Mutable game model (read inside the rAF loop without stale closures).
  const game = useRef({
    trolleyX: STAGE_W / 2,
    hookY: HOOK_MIN,
    held: null as number | null,
    cubes: [] as Cube[],
    slots: [] as Slot[],
    placed: 0,
    wrongUntil: 0,
    wrongAt: null as { x: number; y: number } | null,
  });
  const keys = useRef<Set<string>>(new Set());
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);

  // ── Sound effects (Web Audio) ──────────────────────────────────────────────
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
    } catch { /* audio not available */ }
  }, []);
  const sfxGrab    = useCallback(() => tone([520], 0.06, 'square', 0.12), [tone]);
  const sfxPlace   = useCallback(() => tone([330, 440], 0.09, 'sine', 0.16), [tone]);
  const sfxWrong   = useCallback(() => tone([180, 120], 0.22, 'sawtooth', 0.2), [tone]);
  const sfxWin     = useCallback(() => tone([523, 659, 784, 1047], 0.13, 'sine', 0.2), [tone]);

  // ── Word audio ─────────────────────────────────────────────────────────────
  const playWord = useCallback((w: string) => {
    if (!w) return;
    audioElRef.current?.pause();
    const audio = new Audio(wordAudioUrl(w));
    audioElRef.current = audio;
    let fell = false;
    const fallback = () => { if (!fell) { fell = true; speakWord(w); } };
    audio.onerror = fallback;
    audio.play().then(() => { audio.onerror = null; }).catch(fallback);
  }, []);

  // ── Set up a word: build plan + scatter cubes ───────────────────────────────
  const setupWord = useCallback((w: string) => {
    const { slots } = buildPlan(w);
    // Required cubes (one per slot) + distractors.
    const usedLetters = new Set(slots.filter(s => s.kind === 'letter').map(s => s.matchKey));
    const usedMarks = new Set(slots.filter(s => s.kind === 'mark').map(s => s.matchKey));
    const distractors: Array<{ matchKey: string; glyph: string; kind: 'letter' | 'mark' }> = [];
    FILLER_LETTERS.filter(l => !usedLetters.has(l)).sort(() => Math.random() - 0.5).slice(0, 3)
      .forEach(l => distractors.push({ matchKey: l, glyph: l, kind: 'letter' }));
    FILLER_MARKS.filter(m => !usedMarks.has(m)).sort(() => Math.random() - 0.5).slice(0, 2)
      .forEach(m => distractors.push({ matchKey: m, glyph: dottedMark(m), kind: 'mark' }));

    const pool = [
      ...slots.map(s => ({ matchKey: s.matchKey, glyph: s.glyph, kind: s.kind })),
      ...distractors,
    ].sort(() => Math.random() - 0.5);

    // Lay cubes across the ground in two rows, evenly spread.
    const n = pool.length;
    const cubes: Cube[] = pool.map((c, i) => {
      const perRow = Math.ceil(n / 2);
      const rowIdx = Math.floor(i / perRow);
      const colIdx = i % perRow;
      const gap = (STAGE_W - 140) / Math.max(1, perRow - 1 || 1);
      const x = 70 + (perRow === 1 ? (STAGE_W - 140) / 2 : colIdx * gap) + (Math.random() * 16 - 8);
      const y = (rowIdx === 0 ? GROUND_Y : GROUND_Y - 4) + (rowIdx === 1 ? 0 : 0);
      return { id: cubeIdSeq++, matchKey: c.matchKey, glyph: c.glyph, kind: c.kind, x, y: rowIdx === 0 ? GROUND_Y : GROUND_Y, state: 'ground' };
    });
    // Stagger the two rows vertically a touch so overlaps are visible.
    cubes.forEach((c, i) => { if (i % 2 === 1) c.y = GROUND_Y - 6; });

    game.current.cubes = cubes;
    game.current.slots = slots;
    game.current.placed = 0;
    game.current.held = null;
    game.current.trolleyX = STAGE_W / 2;
    game.current.hookY = HOOK_MIN;
    game.current.wrongUntil = 0;
    game.current.wrongAt = null;
  }, []);

  // Init / advance words.
  useEffect(() => {
    if (!word) { setPhase('allDone'); return; }
    setupWord(word);
    setPhase('playing');
    const t = setTimeout(() => playWord(word), 450); // let the scene mount first
    return () => clearTimeout(t);
  }, [word, setupWord, playWord]);

  // ── Grab / drop ──────────────────────────────────────────────────────────────
  const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

  const tryGrabOrDrop = useCallback(() => {
    const g = game.current;
    if (phase !== 'playing') return;
    if (g.held === null) {
      // Grab the nearest ground cube under the magnet.
      let best: Cube | null = null; let bestD = GRAB_RADIUS;
      for (const c of g.cubes) {
        if (c.state !== 'ground') continue;
        const d = dist(c.x, c.y, g.trolleyX, g.hookY);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) { best.state = 'held'; g.held = best.id; sfxGrab(); }
    } else {
      // Drop: validate against the NEXT required slot.
      const cube = g.cubes.find(c => c.id === g.held);
      if (!cube) { g.held = null; return; }
      const next = g.slots[g.placed];
      const overNext = next && dist(next.x, next.y, g.trolleyX, g.hookY) < DROP_RADIUS;
      // Are we over any slot at all (to detect a wrong-place attempt)?
      const overSomeSlot = g.slots.some((s, i) => i >= g.placed && dist(s.x, s.y, g.trolleyX, g.hookY) < DROP_RADIUS);
      if (overNext && cube.matchKey === next.matchKey && cube.kind === next.kind) {
        // Correct!
        cube.state = 'placed'; cube.x = next.x; cube.y = next.y; g.held = null; g.placed += 1;
        sfxPlace();
        if (g.placed >= g.slots.length) {
          setPhase('wordDone'); sfxWin();
        }
      } else if (overNext || overSomeSlot) {
        // Wrong cube or wrong slot — buzz, flash red, return cube to the ground.
        const at = overNext ? next : g.slots.find((s, i) => i >= g.placed && dist(s.x, s.y, g.trolleyX, g.hookY) < DROP_RADIUS)!;
        g.wrongUntil = performance.now() + 650;
        g.wrongAt = { x: at.x, y: at.y };
        cube.state = 'ground'; cube.y = GROUND_Y; g.held = null;
        sfxWrong();
      } else {
        // Released over empty ground — just set it down, no penalty.
        cube.state = 'ground'; cube.y = GROUND_Y; g.held = null;
      }
    }
    setTick(t => t + 1);
  }, [phase, sfxGrab, sfxPlace, sfxWrong, sfxWin]);

  // ── Keyboard + game loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) {
        e.preventDefault();
        if (k === ' ') { if (!e.repeat) tryGrabOrDrop(); }
        else keys.current.add(k);
        if (showHelp) setShowHelp(false);
      }
    };
    const up = (e: KeyboardEvent) => { keys.current.delete(e.key); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [tryGrabOrDrop, showHelp]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const g = game.current;
      if (phase === 'playing') {
        if (keys.current.has('ArrowLeft'))  g.trolleyX = Math.max(TROLLEY_MIN, g.trolleyX - TROLLEY_SPEED);
        if (keys.current.has('ArrowRight')) g.trolleyX = Math.min(TROLLEY_MAX, g.trolleyX + TROLLEY_SPEED);
        if (keys.current.has('ArrowDown'))  g.hookY = Math.min(HOOK_MAX, g.hookY + HOOK_SPEED);
        if (keys.current.has('ArrowUp'))    g.hookY = Math.max(HOOK_MIN, g.hookY - HOOK_SPEED);
        // Carry the held cube under the magnet.
        if (g.held !== null) {
          const c = g.cubes.find(x => x.id === g.held);
          if (c) { c.x = g.trolleyX; c.y = g.hookY + CUBE / 2 + 6; }
        }
      }
      setTick(t => (t + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Cleanup audio on unmount.
  useEffect(() => () => { audioElRef.current?.pause(); window.speechSynthesis?.cancel(); acRef.current?.close().catch(() => {}); }, []);

  const nextWord = () => {
    if (wordIndex + 1 >= cleanWords.length) setPhase('allDone');
    else setWordIndex(i => i + 1);
  };
  const restart = () => { cubeIdSeq = 1; setWordIndex(0); setPhase('playing'); };

  const g = game.current;
  const wrongActive = g.wrongUntil > performance.now();
  const pct = (x: number) => `${(x / STAGE_W) * 100}%`;
  const pcy = (y: number) => `${(y / STAGE_H) * 100}%`;

  // px size of a cube relative to the stage, used by CSS.
  const cubePctW = `${(CUBE / STAGE_W) * 100}%`;
  const cubePctH = `${(CUBE / STAGE_H) * 100}%`;

  const renderCube = (glyph: string, kind: 'letter' | 'mark', opts: { ghost?: boolean; held?: boolean; placed?: boolean; wrong?: boolean } = {}) => (
    <div
      style={{
        width: '100%', height: '100%', borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...HAFS, fontSize: 'clamp(18px, 3.4vw, 34px)', direction: 'rtl', userSelect: 'none',
        color: opts.ghost ? 'rgba(255,255,255,0.25)' : kind === 'mark' ? '#7c2d12' : '#1f2937',
        background: opts.ghost ? 'transparent'
          : opts.wrong ? 'linear-gradient(160deg,#fecaca,#ef4444)'
          : opts.placed ? 'linear-gradient(160deg,#bbf7d0,#34d399)'
          : kind === 'mark' ? 'linear-gradient(160deg,#fde68a,#f59e0b)'
          : 'linear-gradient(160deg,#fef3c7,#fbbf24)',
        border: opts.ghost ? '2px dashed rgba(255,255,255,0.4)' : '2px solid rgba(0,0,0,0.18)',
        boxShadow: opts.ghost ? 'none'
          : opts.held ? '0 8px 18px rgba(0,0,0,0.45)'
          : 'inset 0 -6px 0 rgba(0,0,0,0.16), inset 0 4px 0 rgba(255,255,255,0.5), 0 4px 8px rgba(0,0,0,0.3)',
        transition: opts.placed ? 'background 0.2s' : undefined,
        boxSizing: 'border-box',
      }}
    >
      {glyph}
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,20,40,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      {/* Top bar */}
      <div style={{ width: '100%', maxWidth: STAGE_W, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, color: '#fff' }}>
        <button onClick={onExit} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>✕ Exit</button>
        <div style={{ flex: 1, fontWeight: 800, fontSize: 16 }}>
          🏗️ Crane Builder {topicTitle ? <span style={{ opacity: 0.7, fontWeight: 600 }}>· {topicTitle}</span> : null}
        </div>
        <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 700 }}>Word {Math.min(wordIndex + 1, cleanWords.length)} / {cleanWords.length}</div>
        <button onClick={() => playWord(word)} style={{ background: '#0ea5e9', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>🔊 Listen</button>
      </div>

      {/* Stage */}
      <div style={{ position: 'relative', width: '100%', maxWidth: STAGE_W, aspectRatio: `${STAGE_W} / ${STAGE_H}`, background: 'linear-gradient(180deg,#7dd3fc 0%,#bae6fd 55%,#e7c89b 55%,#d9b384 100%)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>

        {/* Sun + clouds */}
        <div style={{ position: 'absolute', left: '6%', top: '7%', width: '8%', aspectRatio: '1', borderRadius: '50%', background: 'radial-gradient(circle,#fff7cc,#fde047)', boxShadow: '0 0 40px #fde047' }} />
        <div style={{ position: 'absolute', right: '14%', top: '12%', width: '16%', height: '8%', background: 'rgba(255,255,255,0.85)', borderRadius: 999 }} />
        <div style={{ position: 'absolute', right: '30%', top: '20%', width: '11%', height: '6%', background: 'rgba(255,255,255,0.7)', borderRadius: 999 }} />

        {/* Ground line */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: '55%', height: 3, background: 'rgba(0,0,0,0.12)' }} />

        {/* ── Crane structure ── */}
        {/* Mast */}
        <div style={{ position: 'absolute', left: pct(g.trolleyX > STAGE_W / 2 ? 90 : STAGE_W - 120), top: pcy(RAIL_Y), bottom: '0%', width: 14, transform: 'translateX(-50%)', background: 'repeating-linear-gradient(0deg,#f59e0b,#f59e0b 10px,#b45309 10px,#b45309 20px)', borderRadius: 3, boxShadow: '0 0 0 2px rgba(0,0,0,0.2)' }} />
        {/* Rail / jib */}
        <div style={{ position: 'absolute', left: '4%', right: '4%', top: pcy(RAIL_Y), height: 12, transform: 'translateY(-50%)', background: 'repeating-linear-gradient(90deg,#f59e0b,#f59e0b 14px,#b45309 14px,#b45309 22px)', borderRadius: 4, boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }} />
        {/* Trolley */}
        <div style={{ position: 'absolute', left: pct(g.trolleyX), top: pcy(RAIL_Y + 6), width: 46, height: 18, transform: 'translate(-50%,-50%)', background: 'linear-gradient(#fbbf24,#d97706)', borderRadius: 5, border: '2px solid rgba(0,0,0,0.3)', zIndex: 6 }} />
        {/* Cable */}
        <div style={{ position: 'absolute', left: pct(g.trolleyX), top: pcy(RAIL_Y + 6), height: pcy(g.hookY - RAIL_Y - 6), width: 3, transform: 'translateX(-50%)', background: 'rgba(30,30,30,0.85)', zIndex: 5 }} />
        {/* Magnet / grabber */}
        <div style={{ position: 'absolute', left: pct(g.trolleyX), top: pcy(g.hookY), width: 40, height: 20, transform: 'translate(-50%,-50%)', background: g.held !== null ? 'linear-gradient(#ef4444,#b91c1c)' : 'linear-gradient(#6b7280,#374151)', borderRadius: '6px 6px 10px 10px', border: '2px solid rgba(0,0,0,0.4)', zIndex: 7, boxShadow: g.held !== null ? '0 0 14px rgba(239,68,68,0.7)' : 'none' }} />

        {/* ── Building ghost slots (remaining) ── */}
        {g.slots.map((s, i) => i >= g.placed && (
          <div key={`slot-${i}`} style={{ position: 'absolute', left: pct(s.x), top: pcy(s.y), width: cubePctW, height: cubePctH, transform: 'translate(-50%,-50%)', zIndex: 2 }}>
            <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 10,
              border: i === g.placed ? '3px dashed #fff' : '2px dashed rgba(255,255,255,0.45)',
              background: i === g.placed ? 'rgba(255,255,255,0.12)' : 'transparent',
              animation: i === g.placed ? 'craneSlotPulse 1s ease-in-out infinite' : undefined }} />
          </div>
        ))}

        {/* Wrong-placement flash */}
        {wrongActive && g.wrongAt && (
          <div style={{ position: 'absolute', left: pct(g.wrongAt.x), top: pcy(g.wrongAt.y), width: cubePctW, height: cubePctH, transform: 'translate(-50%,-50%)', zIndex: 8 }}>
            <div style={{ width: '100%', height: '100%', borderRadius: 10, background: 'rgba(239,68,68,0.55)', border: '3px solid #ef4444', boxSizing: 'border-box', animation: 'craneShake 0.4s' }} />
          </div>
        )}

        {/* ── Cubes (ground / held / placed) ── */}
        {g.cubes.map(c => (
          <div key={c.id} style={{ position: 'absolute', left: pct(c.x), top: pcy(c.y), width: cubePctW, height: cubePctH, transform: 'translate(-50%,-50%)', zIndex: c.state === 'held' ? 9 : c.state === 'placed' ? 4 : 3 }}>
            {renderCube(c.glyph, c.kind, { held: c.state === 'held', placed: c.state === 'placed' })}
          </div>
        ))}

        {/* Help overlay */}
        {showHelp && phase === 'playing' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,20,40,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '22px 26px', maxWidth: 420, textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 40, marginBottom: 6 }}>🏗️</div>
              <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: '#0f172a' }}>Build the word</h3>
              <p style={{ margin: '0 0 12px', fontSize: 14, color: '#475569' }}>
                Listen to the word, then stack the letter &amp; vowel cubes in the right order.
                Vowels <b>below</b> the letter go first (foundation); vowels <b>on top</b> go after.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, color: '#334155', marginBottom: 14 }}>
                <div>← → move</div><div>↑ ↓ raise / lower</div>
                <div style={{ gridColumn: '1 / -1' }}><b>Space</b> grab / drop</div>
              </div>
              <button onClick={() => { setShowHelp(false); playWord(word); }} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, cursor: 'pointer' }}>Start building</button>
            </div>
          </div>
        )}

        {/* Word complete */}
        {phase === 'wordDone' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,20,40,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '24px 28px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 46 }}>🎉</div>
              <div style={{ ...HAFS, direction: 'rtl', fontSize: 40, color: '#0f172a', margin: '6px 0 4px' }}>{word}</div>
              <p style={{ margin: '0 0 16px', color: '#16a34a', fontWeight: 800 }}>Well built!</p>
              <button onClick={nextWord} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontWeight: 800, cursor: 'pointer' }}>
                {wordIndex + 1 >= cleanWords.length ? 'Finish 🏁' : 'Next word →'}
              </button>
            </div>
          </div>
        )}

        {/* All done */}
        {phase === 'allDone' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,20,40,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
              <div style={{ fontSize: 52 }}>🏆</div>
              <h3 style={{ margin: '8px 0', fontWeight: 800, color: '#0f172a' }}>All words built!</h3>
              <p style={{ margin: '0 0 16px', color: '#475569' }}>You completed every word in this lesson.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button onClick={restart} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, cursor: 'pointer' }}>Play again</button>
                <button onClick={onExit} style={{ background: '#e2e8f0', color: '#0f172a', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, cursor: 'pointer' }}>Done</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600 }}>
        ← → move · ↑ ↓ raise/lower · <b>Space</b> grab / drop
      </div>

      <style>{`
        @keyframes craneSlotPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes craneShake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-3px,0); } 75% { transform: translate(3px,0); } }
      `}</style>
    </div>
  );
};

export default CraneBuilderGame;
