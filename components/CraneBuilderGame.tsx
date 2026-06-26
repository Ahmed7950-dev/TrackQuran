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
const GRAVITY = 0.9;        // px/frame² pull on loose ground cubes
const TROLLEY_MIN = 60;
const TROLLEY_MAX = STAGE_W - 60;
const CRANE_TOP = 2;        // stage-y offset for the raster crane so its jib meets RAIL_Y
const HOOK_IMG = 62;        // rendered size (px) of the raster hook sprite
const ROPE_TOP = 92;        // y where the rope leaves the crane (lower edge of the jib)
// Visible footprint of each block sprite inside its square cube box (tile ÷ sprite).
// The dotted placeholder boxes use this so they match the actual block size.
// The letter/vowel blocks are a single SVG (a green book) — landscape aspect.
// Its visible footprint inside the (possibly non-matching) cube box is computed
// so the dotted placeholder and green success box match it exactly.
const BOOK_ASPECT = 450 / 258;
const bookFootprint = (cube: { w: number; h: number }): { w: number; h: number } => {
  const cubeA = cube.w / cube.h;
  return cubeA <= BOOK_ASPECT ? { w: 1, h: cubeA / BOOK_ASPECT } : { w: BOOK_ASPECT / cubeA, h: 1 };
};

// ── Editable layout (all in the 960×600 stage coordinate space) ──────────────
// The in-game layout editor (✎) lets the user drag/resize these; "Save" copies
// the resulting JSON so the defaults below can be updated in code.
interface Rect { x: number; y: number; w: number; h: number }
interface Layout {
  stage: Rect;            // the platform png (where the letters are built)
  crane: Rect;           // the crane png (h:0 ⇒ natural/auto height)
  cube: { w: number; h: number };   // letter/vowel block size
  build: { x: number; y: number };  // centre of the first (right-most) column's bottom slot
  colGap: number; rowGap: number;   // spacing between columns / stacked rows
  groundY: number;       // resting line of the loose cubes
  ropeTop: number;       // y where the rope leaves the crane
  hook: { w: number; dy: number };  // hook sprite size + vertical offset
}
const DEFAULT_LAYOUT: Layout = {
  stage: { x: 242, y: 320, w: 345, h: 235 },
  crane: { x: -28, y: -26, w: 957, h: 522 },
  cube: { w: 59, h: 60 },
  build: { x: 480, y: 448 },
  colGap: 68.44, rowGap: 58,
  groundY: 548,
  ropeTop: 92,
  hook: { w: 62, dy: 10 },
};

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
  x: number; y: number; vy: number; homeX: number; state: 'ground' | 'held' | 'placed';
}

const dottedMark = (mark: string) => `◌${mark}`; // ◌ + combining mark renders the mark alone

/** Decompose a word into per-letter columns and the ordered slot sequence,
 *  positioned according to the (editable) layout. */
function buildPlan(word: string, L: Layout): { slots: Slot[]; cols: number } {
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
  const slots: Slot[] = [];
  cols.forEach((col, i) => {
    const colX = L.build.x - i * L.colGap; // column 0 (first letter) sits on the right (RTL)
    // bottom → top: below marks (foundation), then the letter, then above marks
    const stack: Array<{ glyph: string; matchKey: string; kind: 'letter' | 'mark' }> = [
      ...col.below.map(m => ({ glyph: dottedMark(m), matchKey: m, kind: 'mark' as const })),
      { glyph: col.letter, matchKey: col.letter, kind: 'letter' as const },
      ...col.above.map(m => ({ glyph: dottedMark(m), matchKey: m, kind: 'mark' as const })),
    ];
    stack.forEach((s, level) => {
      slots.push({ ...s, x: colX, y: L.build.y - level * L.rowGap });
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
  // Raster sprite assets; each falls back to the SVG version if its file fails.
  const [imgOk, setImgOk] = useState({ bg: true, crane: true, hook: true, book: true, stage: true });
  const dropImg = (k: keyof typeof imgOk) => setImgOk(s => (s[k] ? { ...s, [k]: false } : s));

  // ── Editable layout + in-game editor ───────────────────────────────────────
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  const [design, setDesign] = useState(false);
  const [savedJson, setSavedJson] = useState('');
  const fieldRef = useRef<HTMLDivElement>(null);

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
    placedFx: null as { x: number; y: number; until: number } | null,
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

  // ── Crane motor sound (real recording, first 5s looped) while moving ───────
  const motorAudioRef = useRef<HTMLAudioElement | null>(null);
  const setMotor = useCallback((on: boolean) => {
    let a = motorAudioRef.current;
    if (!a) {
      a = new Audio('/sounds/crane-motor.m4a');
      a.loop = true; a.volume = 0.55;
      motorAudioRef.current = a;
    }
    if (on) { if (a.paused) a.play().catch(() => {}); }
    else if (!a.paused) { a.pause(); }
  }, []);

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
    const { slots } = buildPlan(w, layoutRef.current);
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

    // One evenly-spaced row of lanes — cubes never overlap. They drop in from
    // above and settle on the ground under gravity (see the game loop).
    const n = pool.length;
    const left = 72, right = STAGE_W - 72;
    const cubes: Cube[] = pool.map((c, i) => {
      const homeX = n === 1 ? STAGE_W / 2 : left + ((right - left) * i) / (n - 1);
      return {
        id: cubeIdSeq++, matchKey: c.matchKey, glyph: c.glyph, kind: c.kind,
        x: homeX, y: -layoutRef.current.cube.h - Math.random() * 240, vy: 0, homeX, state: 'ground' as const,
      };
    });

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

  // Re-position the building slots live when the layout is edited (design mode).
  useEffect(() => {
    if (word && game.current.cubes.length) {
      game.current.slots = buildPlan(word, layout).slots;
      setTick(t => t + 1);
    }
  }, [layout, word]);

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
        g.placedFx = { x: next.x, y: next.y + CUBE / 2, until: performance.now() + 500 };
        sfxPlace();
        if (g.placed >= g.slots.length) {
          setPhase('wordDone'); sfxWin();
        }
      } else if (overNext || overSomeSlot) {
        // Wrong cube or wrong slot — buzz, flash red, return cube to the ground.
        const at = overNext ? next : g.slots.find((s, i) => i >= g.placed && dist(s.x, s.y, g.trolleyX, g.hookY) < DROP_RADIUS)!;
        g.wrongUntil = performance.now() + 650;
        g.wrongAt = { x: at.x, y: at.y };
        cube.state = 'ground'; cube.vy = 0; g.held = null;
        sfxWrong();
      } else {
        // Released over empty ground — drop it; gravity returns it to its lane.
        cube.state = 'ground'; cube.vy = 0; g.held = null;
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
      const moving = phase === 'playing' && (keys.current.has('ArrowLeft') || keys.current.has('ArrowRight') || keys.current.has('ArrowUp') || keys.current.has('ArrowDown'));
      setMotor(moving);
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
        // Gravity: loose ground cubes fall and settle in their lane (no overlap).
        const groundY = layoutRef.current.groundY;
        for (const c of g.cubes) {
          if (c.state !== 'ground') continue;
          c.vy += GRAVITY;
          c.y += c.vy;
          if (c.y >= groundY) { c.y = groundY; c.vy = c.vy > 2.5 ? -c.vy * 0.32 : 0; }
          c.x += (c.homeX - c.x) * 0.18;
        }
      }
      setTick(t => (t + 1) % 1000000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Cleanup audio on unmount.
  useEffect(() => () => { audioElRef.current?.pause(); motorAudioRef.current?.pause(); window.speechSynthesis?.cancel(); acRef.current?.close().catch(() => {}); }, []);

  const nextWord = () => {
    if (wordIndex + 1 >= cleanWords.length) setPhase('allDone');
    else setWordIndex(i => i + 1);
  };
  const restart = () => { cubeIdSeq = 1; setWordIndex(0); setPhase('playing'); };

  const g = game.current;
  const wrongActive = g.wrongUntil > performance.now();
  const pct = (x: number) => `${(x / STAGE_W) * 100}%`;
  const pcy = (y: number) => `${(y / STAGE_H) * 100}%`;

  // px size of a cube relative to the stage, used by CSS (from the editable layout).
  const cubePctW = `${(layout.cube.w / STAGE_W) * 100}%`;
  const cubePctH = `${(layout.cube.h / STAGE_H) * 100}%`;

  // Drag/resize handle used in the layout editor — works in stage coordinates.
  const EditBox: React.FC<{ rect: Rect; color: string; label: string; onChange: (r: Rect) => void; resizable?: boolean }>
    = ({ rect, color, label, onChange, resizable = true }) => {
    const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, sy = e.clientY; const r0 = { ...rect };
      const fr = fieldRef.current?.getBoundingClientRect();
      const scaleX = (fr?.width ?? STAGE_W) / STAGE_W, scaleY = (fr?.height ?? STAGE_H) / STAGE_H;
      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - sx) / scaleX, dy = (ev.clientY - sy) / scaleY;
        if (mode === 'move') onChange({ ...r0, x: Math.round(r0.x + dx), y: Math.round(r0.y + dy) });
        else onChange({ ...r0, w: Math.max(8, Math.round(r0.w + dx)), h: Math.max(8, Math.round(r0.h + dy)) });
      };
      const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
    };
    return (
      <div onPointerDown={e => startDrag(e, 'move')}
        style={{ position: 'absolute', left: pct(rect.x), top: pcy(rect.y), width: pct(rect.w), height: pcy(rect.h), zIndex: 30, boxSizing: 'border-box', border: `2px solid ${color}`, background: `${color}22`, cursor: 'move' }}>
        <span style={{ position: 'absolute', top: -17, left: -2, fontSize: 10, fontWeight: 700, color: '#fff', background: color, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>{label}</span>
        {resizable && (
          <div onPointerDown={e => startDrag(e, 'resize')}
            style={{ position: 'absolute', right: -7, bottom: -7, width: 14, height: 14, background: color, border: '2px solid #fff', borderRadius: 3, cursor: 'nwse-resize' }} />
        )}
      </div>
    );
  };
  const setL = (patch: Partial<Layout>) => setLayout(l => ({ ...l, ...patch }));

  const renderCube = (glyph: string, kind: 'letter' | 'mark', opts: { held?: boolean; placed?: boolean } = {}) => {
    const foot = bookFootprint(layout.cube);   // visible book footprint inside the cube box
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', transition: 'transform 0.12s', transform: opts.held ? 'scale(1.07)' : undefined }}>
        {imgOk.book ? (
          <img src="/sprites/letter-block.svg" alt="" onError={() => dropImg('book')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
              filter: opts.held ? 'drop-shadow(0 12px 16px rgba(0,0,0,0.5))' : 'drop-shadow(0 5px 6px rgba(0,0,0,0.4))' }} />
        ) : (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: `${foot.w * 100}%`, height: `${foot.h * 100}%`, borderRadius: 8, background: 'linear-gradient(155deg,#52944d,#1d451b)', border: '2px solid #133a12', boxSizing: 'border-box' }} />
        )}
        {/* success tint once placed — same footprint as the book block */}
        {opts.placed && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: `${foot.w * 100}%`, height: `${foot.h * 100}%`, borderRadius: 8, background: 'rgba(34,197,94,0.35)', boxShadow: '0 0 16px rgba(34,197,94,0.8), inset 0 0 0 3px rgba(22,163,74,0.9)' }} />
        )}
        {/* glyph — white, vowel marks render larger so the harakah is clearly readable */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, ...HAFS, fontSize: kind === 'mark' ? 'clamp(26px, 4.6vw, 46px)' : 'clamp(18px, 3.2vw, 32px)', direction: 'rtl', userSelect: 'none', color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.5)' }}>
          {glyph}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0b1220', overflow: 'hidden' }}>
      {/* Stage — fills the whole screen */}
      <div style={{ position: 'absolute', inset: 0, background: '#bae6fd', overflow: 'hidden' }}>

        {/* Top bar overlay */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', color: '#fff', background: 'linear-gradient(rgba(8,20,40,0.55), rgba(8,20,40,0))' }}>
          <button onClick={onExit} style={{ background: 'rgba(0,0,0,0.35)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>✕ Exit</button>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 16, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            🏗️ Crane Builder {topicTitle ? <span style={{ opacity: 0.8, fontWeight: 600 }}>· {topicTitle}</span> : null}
          </div>
          <div style={{ fontSize: 13, opacity: 0.95, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>Word {Math.min(wordIndex + 1, cleanWords.length)} / {cleanWords.length}</div>
          <button onClick={() => setDesign(d => !d)} title="Edit layout"
            style={{ background: design ? '#f59e0b' : 'rgba(0,0,0,0.35)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>✎</button>
          <button onClick={() => playWord(word)} style={{ background: '#0ea5e9', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>🔊 Listen</button>
        </div>

        {/* ── Scenery + static crane (one vector layer, stage coordinate space) ── */}
        <svg viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="cbSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5cb8f2" /><stop offset="60%" stopColor="#a5dcfb" /><stop offset="100%" stopColor="#d8f0ff" />
            </linearGradient>
            <linearGradient id="cbGround" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e9cf9f" /><stop offset="55%" stopColor="#d3aa6c" /><stop offset="100%" stopColor="#b98a4e" />
            </linearGradient>
            <radialGradient id="cbSun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fffbe6" /><stop offset="55%" stopColor="#fde047" /><stop offset="100%" stopColor="#fbbf24" />
            </radialGradient>
            <linearGradient id="cbSteel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fcd34d" /><stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <pattern id="cbHazard" width="28" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(0)">
              <rect width="28" height="14" fill="#fbbf24" />
              <path d="M0 14 L14 0 H28 L14 14 Z M-14 14 L0 0 H0 Z" fill="#1f2937" />
            </pattern>
          </defs>

          {!imgOk.bg && (<g>
          {/* Sky + sun + clouds */}
          <rect x="0" y="0" width={STAGE_W} height="330" fill="url(#cbSky)" />
          <circle cx="92" cy="84" r="72" fill="#fde047" opacity="0.22" />
          <circle cx="92" cy="84" r="36" fill="url(#cbSun)" />
          <g fill="#ffffff">
            <g opacity="0.9"><ellipse cx="690" cy="80" rx="70" ry="26" /><ellipse cx="640" cy="92" rx="46" ry="22" /><ellipse cx="744" cy="94" rx="42" ry="20" /></g>
            <g opacity="0.7"><ellipse cx="430" cy="140" rx="54" ry="20" /><ellipse cx="392" cy="150" rx="34" ry="16" /></g>
          </g>

          {/* Distant skyline */}
          <g fill="#9fc6dd" opacity="0.55">
            <rect x="150" y="250" width="40" height="80" /><rect x="196" y="226" width="30" height="104" /><rect x="232" y="266" width="46" height="64" />
            <rect x="560" y="244" width="34" height="86" /><rect x="600" y="262" width="40" height="68" /><rect x="648" y="232" width="28" height="98" /><rect x="684" y="258" width="44" height="72" />
            <rect x="800" y="252" width="36" height="78" /><rect x="842" y="236" width="26" height="94" />
          </g>

          {/* Ground */}
          <rect x="0" y="330" width={STAGE_W} height={STAGE_H - 330} fill="url(#cbGround)" />
          <g fill="#a87f48" opacity="0.5">
            <ellipse cx="120" cy="520" rx="26" ry="7" /><ellipse cx="430" cy="560" rx="34" ry="8" /><ellipse cx="760" cy="535" rx="30" ry="7" /><ellipse cx="640" cy="575" rx="22" ry="6" />
          </g>
          <g fill="#8a6636"><circle cx="300" cy="500" r="4" /><circle cx="520" cy="528" r="3" /><circle cx="700" cy="498" r="4" /><circle cx="200" cy="556" r="3" /></g>

          {/* Hazard barrier along the horizon */}
          <rect x="0" y="322" width={STAGE_W} height="12" fill="url(#cbHazard)" opacity="0.92" />
          </g>)}

          {!imgOk.crane && (<g>
          {/* ── Tower crane (static) ── */}
          {/* counter-jib + counterweight */}
          <g stroke="#b45309" strokeWidth="2.5">
            <line x1="40" y1="48" x2="120" y2="48" stroke="url(#cbSteel)" strokeWidth="6" />
            <line x1="40" y1="60" x2="120" y2="60" stroke="url(#cbSteel)" strokeWidth="6" />
            <line x1="52" y1="48" x2="68" y2="60" /><line x1="76" y1="48" x2="92" y2="60" /><line x1="100" y1="48" x2="116" y2="60" />
          </g>
          <rect x="40" y="50" width="34" height="34" rx="3" fill="#475569" stroke="#1e293b" strokeWidth="2" />
          {/* cat-head apex + pendant tie-bars */}
          <line x1="120" y1="52" x2="120" y2="8" stroke="url(#cbSteel)" strokeWidth="5" />
          <line x1="120" y1="10" x2="600" y2="44" stroke="#92400e" strokeWidth="2.5" />
          <line x1="120" y1="10" x2="56" y2="48" stroke="#92400e" strokeWidth="2.5" />
          {/* jib (working arm) truss */}
          <g stroke="#b45309" strokeWidth="2.5">
            <line x1="120" y1="44" x2="912" y2="44" stroke="url(#cbSteel)" strokeWidth="6" />
            <line x1="120" y1="62" x2="912" y2="62" stroke="url(#cbSteel)" strokeWidth="7" />
            {Array.from({ length: 16 }).map((_, i) => (
              <line key={i} x1={140 + i * 48} y1="44" x2={164 + i * 48} y2="62" />
            ))}
          </g>
          {/* operator cab */}
          <rect x="98" y="66" width="44" height="34" rx="4" fill="url(#cbSteel)" stroke="#b45309" strokeWidth="2" />
          <rect x="104" y="72" width="32" height="16" rx="2" fill="#bae6fd" stroke="#0c4a6e" strokeWidth="1.5" opacity="0.9" />
          {/* tower mast lattice */}
          <g stroke="#d97706" strokeWidth="6">
            <line x1="106" y1="100" x2="106" y2={STAGE_H} /><line x1="138" y1="100" x2="138" y2={STAGE_H} />
          </g>
          <g stroke="#b45309" strokeWidth="3">
            {Array.from({ length: 11 }).map((_, i) => {
              const y = 110 + i * 46;
              return (
                <g key={i}>
                  <line x1="106" y1={y} x2="138" y2={y} />
                  <line x1="106" y1={y} x2="138" y2={y + 46} />
                  <line x1="138" y1={y} x2="106" y2={y + 46} />
                </g>
              );
            })}
          </g>
          </g>)}
        </svg>

        {/* ── Raster sprites (over the SVG fallback) ── */}
        {imgOk.bg && (
          <img src="/sprites/crane-bg.png" alt="" onError={() => dropImg('bg')}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, pointerEvents: 'none' }} />
        )}

        {/* ── Aspect-locked play field: only the background stretches to fill the
             screen; the crane and cubes keep their natural proportions, centred
             and sized to the screen height ── */}
        <div ref={fieldRef} style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', height: '100%', aspectRatio: `${STAGE_W} / ${STAGE_H}`, zIndex: 1 }}>
        {imgOk.crane && (
          <img src="/sprites/crane-tower.png" alt="" onError={() => dropImg('crane')}
            style={{ position: 'absolute', left: pct(layout.crane.x), top: pcy(layout.crane.y), width: pct(layout.crane.w), height: layout.crane.h ? pcy(layout.crane.h) : 'auto', zIndex: 1, pointerEvents: 'none' }} />
        )}

        {/* ── Dynamic crane parts (HTML, track the hook) ── */}
        {/* Cable — drops from the lower edge of the jib (no trolley box) */}
        <div style={{ position: 'absolute', left: pct(g.trolleyX), top: pcy(layout.ropeTop), height: pcy(g.hookY - layout.ropeTop), width: 4, transform: 'translateX(-50%)', background: 'linear-gradient(90deg,#1f2937,#4b5563,#1f2937)', zIndex: 5 }} />
        {/* Hook block / electromagnet */}
        {imgOk.hook ? (
          <img src="/sprites/crane-hook.png" alt="" onError={() => dropImg('hook')}
            style={{ position: 'absolute', left: pct(g.trolleyX), top: pcy(g.hookY + layout.hook.dy), width: layout.hook.w, height: layout.hook.w, transform: 'translate(-50%,-50%)', zIndex: 7, pointerEvents: 'none',
              filter: g.held !== null ? 'drop-shadow(0 0 10px rgba(239,68,68,0.9)) saturate(1.4)' : 'drop-shadow(0 3px 4px rgba(0,0,0,0.5))' }} />
        ) : (
          <div style={{ position: 'absolute', left: pct(g.trolleyX), top: pcy(g.hookY), width: 48, height: 26, transform: 'translate(-50%,-50%)', borderRadius: '8px 8px 12px 12px', zIndex: 7,
            background: g.held !== null ? 'linear-gradient(#f87171,#b91c1c)' : 'linear-gradient(#9ca3af,#374151)',
            border: '2px solid #1f2937',
            boxShadow: g.held !== null ? '0 0 20px rgba(239,68,68,0.85), inset 0 3px 0 rgba(255,255,255,0.35)' : 'inset 0 3px 0 rgba(255,255,255,0.3), 0 3px 6px rgba(0,0,0,0.4)' }}>
            <div style={{ position: 'absolute', bottom: -4, left: 6, width: 8, height: 6, background: '#1f2937', borderRadius: '0 0 3px 3px' }} />
            <div style={{ position: 'absolute', bottom: -4, right: 6, width: 8, height: 6, background: '#1f2937', borderRadius: '0 0 3px 3px' }} />
          </div>
        )}

        {/* ── Stage / platform where the letters are built ── */}
        {imgOk.stage && (
          <img src="/sprites/crane-stage.png" alt="" onError={() => dropImg('stage')}
            style={{ position: 'absolute', left: pct(layout.stage.x), top: pcy(layout.stage.y), width: pct(layout.stage.w), height: pcy(layout.stage.h), zIndex: 1, pointerEvents: 'none' }} />
        )}

        {/* ── Building ghost slots (remaining) — sized to match the block footprint ── */}
        {g.slots.map((s, i) => i >= g.placed && (
          <div key={`slot-${i}`} style={{ position: 'absolute', left: pct(s.x), top: pcy(s.y), width: cubePctW, height: cubePctH, transform: 'translate(-50%,-50%)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: `${bookFootprint(layout.cube).w * 100}%`, height: `${bookFootprint(layout.cube).h * 100}%`, boxSizing: 'border-box', borderRadius: 10,
              border: i === g.placed ? '3px dashed #fde047' : '2px dashed rgba(255,255,255,0.55)',
              background: i === g.placed ? 'rgba(253,224,71,0.18)' : 'rgba(255,255,255,0.06)',
              boxShadow: i === g.placed ? '0 0 18px rgba(253,224,71,0.6)' : 'none',
              animation: i === g.placed ? 'craneSlotPulse 1s ease-in-out infinite' : undefined }} />
          </div>
        ))}

        {/* Placement dust burst */}
        {g.placedFx && g.placedFx.until > performance.now() && (
          <div style={{ position: 'absolute', left: pct(g.placedFx.x), top: pcy(g.placedFx.y), width: cubePctW, height: cubePctH, transform: 'translate(-50%,-50%)', zIndex: 8, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: '-30%', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.85)', animation: 'craneDust 0.5s ease-out forwards' }} />
          </div>
        )}

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

        {/* ── Layout editor handles (drag to move, corner to resize) ── */}
        {design && (
          <>
            <EditBox rect={layout.stage} color="#f43f5e" label="stage" onChange={r => setL({ stage: r })} />
            <EditBox rect={{ ...layout.crane, h: layout.crane.h || Math.round(layout.crane.w * 548 / 990) }} color="#f59e0b" label="crane" onChange={r => setL({ crane: r })} />
            <EditBox rect={{ x: Math.round(layout.build.x - layout.cube.w / 2), y: Math.round(layout.build.y - layout.cube.h / 2), w: layout.cube.w, h: layout.cube.h }} color="#22d3ee" label="letter box + position"
              onChange={r => setL({ cube: { w: r.w, h: r.h }, build: { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) } })} />
          </>
        )}
        </div>{/* end play field */}

        {/* ── Layout editor panel ── */}
        {design && (
          <div style={{ position: 'absolute', top: 56, right: 10, width: 230, maxHeight: 'calc(100% - 120px)', overflowY: 'auto', zIndex: 40, background: 'rgba(15,23,42,0.94)', border: '1px solid #334155', borderRadius: 12, padding: 12, color: '#fff', fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Layout editor</div>
            {([
              ['colGap', layout.colGap, (v: number) => setL({ colGap: v })],
              ['rowGap', layout.rowGap, (v: number) => setL({ rowGap: v })],
              ['build.x', layout.build.x, (v: number) => setL({ build: { ...layout.build, x: v } })],
              ['build.y', layout.build.y, (v: number) => setL({ build: { ...layout.build, y: v } })],
              ['cube.w', layout.cube.w, (v: number) => setL({ cube: { ...layout.cube, w: v } })],
              ['cube.h', layout.cube.h, (v: number) => setL({ cube: { ...layout.cube, h: v } })],
              ['groundY', layout.groundY, (v: number) => setL({ groundY: v })],
              ['ropeTop', layout.ropeTop, (v: number) => setL({ ropeTop: v })],
              ['crane.x', layout.crane.x, (v: number) => setL({ crane: { ...layout.crane, x: v } })],
              ['crane.y', layout.crane.y, (v: number) => setL({ crane: { ...layout.crane, y: v } })],
              ['crane.w', layout.crane.w, (v: number) => setL({ crane: { ...layout.crane, w: v } })],
              ['hook.w', layout.hook.w, (v: number) => setL({ hook: { ...layout.hook, w: v } })],
              ['hook.dy', layout.hook.dy, (v: number) => setL({ hook: { ...layout.hook, dy: v } })],
            ] as Array<[string, number, (v: number) => void]>).map(([label, val, on]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ flex: 1, opacity: 0.8 }}>{label}</span>
                <button onClick={() => on(Math.round(val - 5))} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>−</button>
                <span style={{ width: 38, textAlign: 'center', fontWeight: 700 }}>{Math.round(val)}</span>
                <button onClick={() => on(Math.round(val + 5))} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>＋</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={() => { const j = JSON.stringify(layout); navigator.clipboard?.writeText(j).catch(() => {}); setSavedJson(j); }}
                style={{ flex: 1, background: '#16a34a', border: 'none', color: '#fff', borderRadius: 8, padding: '8px', fontWeight: 800, cursor: 'pointer' }}>💾 Save</button>
              <button onClick={() => setLayout(DEFAULT_LAYOUT)} style={{ background: '#475569', border: 'none', color: '#fff', borderRadius: 8, padding: '8px 10px', fontWeight: 700, cursor: 'pointer' }}>Reset</button>
            </div>
            {savedJson && (
              <textarea readOnly value={savedJson} onFocus={e => e.target.select()}
                style={{ width: '100%', height: 70, marginTop: 8, fontSize: 10, fontFamily: 'monospace', background: '#0b1220', color: '#86efac', border: '1px solid #334155', borderRadius: 6, padding: 6, boxSizing: 'border-box' }} />
            )}
            <p style={{ margin: '8px 0 0', opacity: 0.6, fontSize: 10 }}>Drag the coloured boxes to move; drag a corner to resize. Save copies the JSON.</p>
          </div>
        )}

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

      {/* Bottom hint overlay */}
      <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', zIndex: 16, color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.7)', pointerEvents: 'none' }}>
        ← → move · ↑ ↓ raise/lower · <b>Space</b> grab / drop
      </div>

      <style>{`
        @keyframes craneSlotPulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
        @keyframes craneShake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-3px,0); } 75% { transform: translate(3px,0); } }
        @keyframes craneDust { 0% { transform: scale(0.4); opacity: 0.9; } 100% { transform: scale(1.8); opacity: 0; } }
      `}</style>
    </div>
  );
};

export default CraneBuilderGame;
