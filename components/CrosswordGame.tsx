// components/CrosswordGame.tsx
// -----------------------------------------------------------------------------
// Crossword on the Arabic vocabulary — a lesson's words, or the words picked in
// the Vocabulary tab. The student picks Arabic or transliteration, then plays
// rounds of small crosswords (utils/crossword.ts lays them out; no AI).
//
//   Arabic        across words run RIGHT to LEFT, harakat left out, and every
//                 letter takes its joined shape (initial / medial / final /
//                 isolated) from its neighbours. Where two words cross, the box
//                 follows the word being worked on.
//   Translit      Latin letters, left to right; 2 3 5 7 sit on their own row,
//                 each key showing the Arabic letter it stands for.
//
// A word is checked when its last box is filled: right turns it teal and locks
// it, wrong letters get a red outline. Nothing is saved — it is practice.
//
// Look: the Claude Design canvas "Vocabulary Crossword"
// (https://claude.ai/artifact/ANLvXJRhMzP7CBu5KgahzP) — warm paper ground,
// white tiles, amber for the word being worked on, teal once solved.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  CrosswordEntry, CrosswordMode, CrosswordPuzzle, CrosswordSource, DIGIT_LETTER,
  buildRounds, crosswordEntries, formAt, keyRows, shapeLetter,
} from '../utils/crossword';

interface Props {
  words: CrosswordSource[];
  /** Where the words come from — "Lesson 1 : Hello", "Picked words". */
  title?: string;
  onExit: () => void;
}

// ── Geometry of one crossword ───────────────────────────────────────────────

/** [placement index, position of the box in that word] */
type Slot = [number, number];
interface CellInfo { row: number; col: number; ch: string; across?: Slot; down?: Slot }
interface Geo {
  puzzle: CrosswordPuzzle;
  cellsOf: string[][];
  info: Map<string, CellInfo>;
  numberAt: Map<string, number>;
}

const cellKey = (r: number, c: number) => `${r},${c}`;

function geometry(puzzle: CrosswordPuzzle): Geo {
  const info = new Map<string, CellInfo>();
  const numberAt = new Map<string, number>();
  const cellsOf = puzzle.placements.map((p, pi) => {
    numberAt.set(cellKey(p.row, p.col), p.number);
    return p.entry.answer.map((ch, i) => {
      const r = p.dir === 'down' ? p.row + i : p.row;
      const c = p.dir === 'across' ? p.col + i : p.col;
      const k = cellKey(r, c);
      const cell = info.get(k) ?? { row: r, col: c, ch };
      cell[p.dir] = [pi, i];
      info.set(k, cell);
      return k;
    });
  });
  return { puzzle, cellsOf, info, numberAt };
}

// ── Play state (one reducer, so a keystroke is one atomic step) ─────────────

interface Play {
  fills: Record<string, string>;
  solved: Set<number>;
  wrong: Set<string>;
  revealed: Set<string>;
  active: { p: number; k: number };
  /** The word that just shook (wrong) or popped (right); `n` replays it. */
  flash: { p: number; n: number; kind: 'shake' | 'pop' } | null;
  hints: number;
  mistakes: number;
}

const freshPlay = (carry?: Pick<Play, 'hints' | 'mistakes'>): Play => ({
  fills: {}, solved: new Set(), wrong: new Set(), revealed: new Set(),
  active: { p: 0, k: 0 }, flash: null,
  hints: carry?.hints ?? 0, mistakes: carry?.mistakes ?? 0,
});

type Action =
  | { type: 'reset'; carry?: Pick<Play, 'hints' | 'mistakes'> }
  | { type: 'select'; geo: Geo; key: string }
  | { type: 'focus'; geo: Geo; p: number }
  | { type: 'step'; geo: Geo; delta: 1 | -1 }
  | { type: 'type'; geo: Geo; ch: string }
  | { type: 'del'; geo: Geo }
  | { type: 'hint'; geo: Geo }
  | { type: 'move'; geo: Geo; dr: number; dc: number };

const without = (set: Set<string>, k: string) => { if (!set.has(k)) return set; const n = new Set(set); n.delete(k); return n; };
const withKey = (set: Set<string>, k: string) => { const n = new Set(set); n.add(k); return n; };

function locked(s: Play, geo: Geo, k: string): boolean {
  if (s.revealed.has(k)) return true;
  const inf = geo.info.get(k)!;
  return (!!inf.across && s.solved.has(inf.across[0])) || (!!inf.down && s.solved.has(inf.down[0]));
}

/** The first box worth typing into: empty and open, else open, else the first. */
function firstOpen(s: Play, geo: Geo, p: number): number {
  const keys = geo.cellsOf[p];
  const empty = keys.findIndex(k => !s.fills[k] && !locked(s, geo, k));
  if (empty >= 0) return empty;
  const open = keys.findIndex(k => !locked(s, geo, k));
  return open >= 0 ? open : 0;
}

function nextUnsolved(s: Play, geo: Geo, from: number, delta: 1 | -1 = 1): Play['active'] {
  const n = geo.cellsOf.length;
  for (let i = 1; i <= n; i++) {
    const q = (((from + delta * i) % n) + n) % n;
    if (!s.solved.has(q)) return { p: q, k: firstOpen(s, geo, q) };
  }
  return s.active;
}

function checkWord(s: Play, geo: Geo, p: number): Play {
  if (s.solved.has(p)) return s;
  const keys = geo.cellsOf[p];
  if (!keys.every(k => s.fills[k])) return s;
  const answer = geo.puzzle.placements[p].entry.answer;
  const bad = keys.filter((k, i) => s.fills[k] !== answer[i]);
  const n = (s.flash?.n ?? 0) + 1;
  if (!bad.length) {
    const solved = new Set(s.solved); solved.add(p);
    let wrong = s.wrong; keys.forEach(k => { wrong = without(wrong, k); });
    return { ...s, solved, wrong, flash: { p, n, kind: 'pop' } };
  }
  let wrong = s.wrong; bad.forEach(k => { wrong = withKey(wrong, k); });
  return { ...s, wrong, mistakes: s.mistakes + 1, flash: { p, n, kind: 'shake' } };
}

/** Put a letter in a box and check whichever words that box completes. */
function putLetter(s: Play, geo: Geo, k: string, ch: string): Play {
  let n: Play = { ...s, fills: { ...s.fills, [k]: ch }, wrong: without(s.wrong, k) };
  const inf = geo.info.get(k)!;
  if (inf.across) n = checkWord(n, geo, inf.across[0]);
  if (inf.down) n = checkWord(n, geo, inf.down[0]);
  return n;
}

/** After a letter goes in: on to the next open box, or the next word once solved. */
function moveOn(n: Play, geo: Geo, p: number, from: number): Play {
  if (n.solved.has(p)) return { ...n, active: nextUnsolved(n, geo, p) };
  const keys = geo.cellsOf[p];
  const empty = keys.findIndex((kk, i) => i > from && !n.fills[kk] && !locked(n, geo, kk));
  const open = empty >= 0 ? empty : keys.findIndex((kk, i) => i > from && !locked(n, geo, kk));
  return { ...n, active: { p, k: open >= 0 ? open : from } };
}

function reducer(s: Play, a: Action): Play {
  switch (a.type) {
    case 'reset': return freshPlay(a.carry);

    case 'select': {
      const inf = a.geo.info.get(a.key);
      if (!inf) return s;
      const mine = inf.across?.[0] === s.active.p ? inf.across : inf.down?.[0] === s.active.p ? inf.down : undefined;
      if (mine) {
        // The box already selected, tapped again: turn to the other word through it.
        if (mine[1] === s.active.k) {
          const other = mine === inf.across ? inf.down : inf.across;
          return other ? { ...s, active: { p: other[0], k: other[1] } } : s;
        }
        return { ...s, active: { p: mine[0], k: mine[1] } };
      }
      const dir = a.geo.puzzle.placements[s.active.p]?.dir ?? 'across';
      const pick = (dir === 'across' ? inf.across ?? inf.down : inf.down ?? inf.across)!;
      return { ...s, active: { p: pick[0], k: pick[1] } };
    }

    case 'focus': return { ...s, active: { p: a.p, k: firstOpen(s, a.geo, a.p) } };

    case 'step': return { ...s, active: nextUnsolved(s, a.geo, s.active.p, a.delta) };

    case 'type': {
      const { p } = s.active;
      const keys = a.geo.cellsOf[p];
      let k = s.active.k;
      if (locked(s, a.geo, keys[k])) {
        const ahead = keys.findIndex((kk, i) => i >= k && !locked(s, a.geo, kk));
        k = ahead >= 0 ? ahead : keys.findIndex(kk => !locked(s, a.geo, kk));
        if (k < 0) return s;
      }
      return moveOn(putLetter(s, a.geo, keys[k], a.ch), a.geo, p, k);
    }

    case 'del': {
      const { p, k } = s.active;
      const keys = a.geo.cellsOf[p];
      const clear = (kk: string, at: number): Play => {
        const fills = { ...s.fills }; delete fills[kk];
        return { ...s, fills, wrong: without(s.wrong, kk), active: { p, k: at } };
      };
      if (s.fills[keys[k]] && !locked(s, a.geo, keys[k])) return clear(keys[k], k);
      for (let j = k - 1; j >= 0; j--) if (!locked(s, a.geo, keys[j])) return clear(keys[j], j);
      return s;
    }

    case 'hint': {
      const { p, k } = s.active;
      if (s.solved.has(p)) return s;
      const keys = a.geo.cellsOf[p];
      const answer = a.geo.puzzle.placements[p].entry.answer;
      const needs = (kk: string, i: number) => !locked(s, a.geo, kk) && s.fills[kk] !== answer[i];
      const j = needs(keys[k], k) ? k : keys.findIndex(needs);
      if (j < 0) return s;
      const n = putLetter({ ...s, hints: s.hints + 1, revealed: withKey(s.revealed, keys[j]) }, a.geo, keys[j], answer[j]);
      return moveOn(n, a.geo, p, j);
    }

    case 'move': {
      const here = a.geo.cellsOf[s.active.p]?.[s.active.k];
      const inf = here ? a.geo.info.get(here) : undefined;
      if (!inf) return s;
      const { width, height } = a.geo.puzzle;
      for (let r = inf.row + a.dr, c = inf.col + a.dc; r >= 0 && c >= 0 && r < height && c < width; r += a.dr, c += a.dc) {
        const to = a.geo.info.get(cellKey(r, c));
        if (!to) continue;
        const pick = (a.dr ? to.down ?? to.across : to.across ?? to.down)!;
        return { ...s, active: { p: pick[0], k: pick[1] } };
      }
      return s;
    }
  }
}

// ── Look (from the design canvas) ───────────────────────────────────────────

const ARABIC_FONT = "'Cairo', 'Noto Naskh Arabic', system-ui, sans-serif";

type Look = 'normal' | 'word' | 'active' | 'activeWrong' | 'solved' | 'wrong';
/** Full class strings, never assembled: Tailwind only ships what it sees. */
const TILE: Record<Look, string> = {
  normal: 'bg-white border-[#D6CBB5] text-stone-900 dark:bg-gray-800 dark:border-gray-600 dark:text-slate-100',
  word:   'bg-amber-200 border-amber-500 text-stone-900 dark:bg-amber-900/60 dark:border-amber-500 dark:text-amber-50',
  active: 'bg-amber-500 border-amber-700 text-stone-900 ring-[3px] ring-amber-500/30 dark:border-amber-300',
  // The box being typed in holds a wrong letter: keep the amber, but say so.
  activeWrong: 'bg-amber-500 border-rose-600 text-rose-800 ring-[3px] ring-rose-500/35 dark:border-rose-400',
  solved: 'bg-teal-700 border-teal-700 text-white',
  wrong:  'bg-white border-rose-600 text-rose-700 dark:bg-gray-800 dark:border-rose-500 dark:text-rose-300',
};
const TILE_NUMBER: Record<Look, string> = {
  normal: 'text-[#6B635C] dark:text-slate-400',
  word:   'text-[#6B635C] dark:text-amber-200/80',
  active: 'text-stone-900',
  activeWrong: 'text-stone-900',
  solved: 'text-teal-100',
  wrong:  'text-[#6B635C] dark:text-slate-400',
};

const KEY = 'cw-key min-w-0 rounded-[9px] bg-white dark:bg-gray-700 text-stone-900 dark:text-slate-100 shadow-[0_1.5px_0_rgba(28,25,23,0.22)] active:bg-amber-200 dark:active:bg-amber-700 active:translate-y-px transition-colors';
const KEY_DEL = 'cw-key min-w-0 rounded-[9px] bg-[#E7E0D2] dark:bg-gray-600 text-stone-700 dark:text-slate-100 shadow-[0_1.5px_0_rgba(28,25,23,0.22)] flex items-center justify-center active:bg-stone-300 active:translate-y-px';
const CARD = 'bg-white dark:bg-gray-800 border border-[#E5DCCB] dark:border-gray-700';
const PRIMARY = 'h-[52px] rounded-full bg-amber-700 hover:bg-amber-800 text-white text-base font-bold flex items-center justify-center gap-2 px-8';
const SECONDARY = 'h-[52px] rounded-full bg-white dark:bg-gray-800 border-2 border-[#F3D9A4] dark:border-amber-800 text-amber-800 dark:text-amber-200 text-base font-bold flex items-center justify-center px-6';

const Svg: React.FC<{ children: React.ReactNode; size?: number; stroke?: number; className?: string }> = ({ children, size = 22, stroke = 2.2, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);
const ICON = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  prev: <path d="M15 18l-6-6 6-6" />,
  next: <path d="M9 18l6-6-6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  // Backspace points the way the text runs: right in Arabic, left in Latin.
  delRtl: <><path d="M3 6h12l6 6-6 6H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /><path d="M8 10l4 4M12 10l-4 4" /></>,
  delLtr: <><path d="M21 6H9l-6 6 6 6h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z" /><path d="M16 10l-4 4M12 10l4 4" /></>,
};

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Every box of a finished crossword, joined; a shared box keeps its across shape. */
function solvedFaces(puzzle: CrosswordPuzzle, arabic: boolean): Map<string, string> {
  const out = new Map<string, string>();
  for (const dir of ['down', 'across'] as const) {
    for (const p of puzzle.placements.filter(x => x.dir === dir)) {
      p.entry.answer.forEach((ch, i) => {
        const k = cellKey(dir === 'down' ? p.row + i : p.row, dir === 'across' ? p.col + i : p.col);
        out.set(k, arabic ? shapeLetter(ch, formAt(p.entry.answer, i)) : ch);
      });
    }
  }
  return out;
}

/** The crossing motif on the start screen: كلمة across, لعب down through its ل. */
const MOTIF: Array<{ row: number; col: number; face: string; look: Look }> = [
  { row: 1, col: 4, face: 'ك‍', look: 'solved' },
  { row: 1, col: 3, face: '‍ل‍', look: 'solved' },
  { row: 1, col: 2, face: '‍م‍', look: 'solved' },
  { row: 1, col: 1, face: '‍ة', look: 'solved' },
  { row: 2, col: 3, face: '‍ع‍', look: 'word' },
  { row: 3, col: 3, face: '‍ب', look: 'normal' },
];

// ── The game ────────────────────────────────────────────────────────────────

const CrosswordGame: React.FC<Props> = ({ words, title, onExit }) => {
  const [mode, setMode] = useState<CrosswordMode | null>(null);
  const [game, setGame] = useState<{ rounds: CrosswordPuzzle[]; leftOut: CrosswordEntry[]; keys: string[][] } | null>(null);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'pick' | 'making' | 'play' | 'roundDone' | 'done'>('pick');
  const [play, dispatch] = useReducer(reducer, undefined, () => freshPlay());
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  const counts = useMemo(() => ({
    arabic: crosswordEntries(words, 'arabic').length,
    translit: crosswordEntries(words, 'translit').length,
  }), [words]);

  const start = (m: CrosswordMode) => {
    setMode(m);
    setPhase('making');
    // A frame for the spinner — the layout search takes a moment on a phone.
    window.setTimeout(() => {
      const entries = crosswordEntries(words, m);
      const built = buildRounds(entries);
      setGame({ ...built, keys: keyRows(m, entries) });
      setRound(0);
      dispatch({ type: 'reset' });
      startedAt.current = Date.now();
      setPhase('play');
    }, 30);
  };

  const puzzle = game?.rounds[round] ?? null;
  const geo = useMemo(() => (puzzle ? geometry(puzzle) : null), [puzzle]);
  const arabic = mode === 'arabic';

  // Round finished → a moment to see it all teal, then the card.
  const allSolved = !!geo && play.solved.size === geo.puzzle.placements.length;
  useEffect(() => {
    if (phase !== 'play' || !allSolved || !game) return;
    const t = window.setTimeout(() => {
      if (round + 1 < game.rounds.length) setPhase('roundDone');
      else { setElapsed(Date.now() - startedAt.current); setPhase('done'); }
    }, 900);
    return () => window.clearTimeout(t);
  }, [phase, allSolved, game, round]);

  const nextRound = () => {
    dispatch({ type: 'reset', carry: { hints: play.hints, mistakes: play.mistakes } });
    setRound(r => r + 1);
    setPhase('play');
  };

  const playAgain = () => { setGame(null); setMode(null); setPhase('pick'); dispatch({ type: 'reset' }); };

  // ── Input ──
  const typeLetter = useCallback((ch: string) => { if (geo) dispatch({ type: 'type', geo, ch }); }, [geo]);
  const del = useCallback(() => { if (geo) dispatch({ type: 'del', geo }); }, [geo]);

  const keySet = useMemo(() => new Set(game?.keys.flat() ?? []), [game]);
  useEffect(() => {
    if (phase !== 'play' || !geo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'Backspace') { e.preventDefault(); del(); return; }
      if (k === 'Tab' || k === 'Enter') { e.preventDefault(); dispatch({ type: 'step', geo, delta: e.shiftKey ? -1 : 1 }); return; }
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        // Arrows move on the SCREEN: in Arabic, reading order runs leftwards.
        const sx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0;
        const dr = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
        dispatch({ type: 'move', geo, dr, dc: arabic ? -sx : sx });
        return;
      }
      const ch = arabic ? k.normalize('NFC') : k.toLowerCase();
      if ([...ch].length === 1 && keySet.has(ch)) { e.preventDefault(); typeLetter(ch); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, geo, arabic, keySet, del, typeLetter]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onExit]);

  // ── Grid sizing: as big as the space allows, never bigger than comfortable ──
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 320, h: 320 });
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setArea({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);
  const gap = puzzle && Math.min(area.w / puzzle.width, area.h / puzzle.height) < 34 ? 3 : 4;
  const cell = puzzle
    ? Math.max(20, Math.floor(Math.min(
        58,
        (area.w - gap * (puzzle.width - 1)) / puzzle.width,
        (area.h - gap * (puzzle.height - 1)) / puzzle.height,
      )))
    : 40;

  // ── Pieces shared by every screen ──
  const shell = (children: React.ReactNode) => (
    <div dir="ltr" className="fixed inset-0 z-[80] flex flex-col bg-[#F6F1E7] dark:bg-gray-950 text-stone-900 dark:text-slate-100 overscroll-contain"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes cw-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-4px) } 40% { transform: translateX(4px) } 60% { transform: translateX(-3px) } 80% { transform: translateX(3px) } }
        @keyframes cw-pop { 0% { transform: scale(1) } 45% { transform: scale(1.14) } 100% { transform: scale(1) } }
        .cw-shake { animation: cw-shake .38s ease-in-out }
        .cw-pop { animation: cw-pop .42s ease-out }
        .cw-key { touch-action: manipulation; -webkit-tap-highlight-color: transparent }
      `}</style>
      {children}
    </div>
  );

  const closeBtn = (
    <button onClick={onExit} aria-label="Close"
      className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-stone-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10">
      <Svg>{ICON.close}</Svg>
    </button>
  );

  // ── Start: Arabic or transliteration ──
  if (phase === 'pick' || phase === 'making') {
    const choice = (m: CrosswordMode, face: React.ReactNode, label: string) => (
      <button onClick={() => start(m)} disabled={counts[m] < 2}
        className={`flex-1 min-w-0 rounded-3xl bg-white dark:bg-gray-800 border-2 border-[#F3D9A4] dark:border-amber-800/70 shadow-[0_2px_0_rgba(180,83,9,0.12)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(180,83,9,0.16)] transition-all px-2.5 pt-5 pb-5 flex flex-col items-center gap-1 disabled:opacity-40 disabled:hover:translate-y-0`}>
        {face}
        <span className="text-base font-bold">{label}</span>
        <span className="text-[13px] font-medium text-stone-600 dark:text-slate-400">{counts[m]} words</span>
      </button>
    );
    return shell(
      <>
        <div className="h-14 flex-shrink-0 flex items-center px-1.5">{closeBtn}</div>
        <div className="flex-1 flex flex-col items-center justify-center gap-9 px-5 pb-[72px]">
          <div className="flex flex-col items-center gap-[18px]">
            <div aria-hidden="true" className="grid gap-1" style={{ gridTemplateColumns: 'repeat(4, 40px)', gridTemplateRows: 'repeat(3, 40px)' }}>
              {MOTIF.map((t, i) => (
                <span key={i} className={`rounded-[9px] border-2 flex items-center justify-center font-bold leading-none ${TILE[t.look]}`}
                  style={{ gridRow: t.row, gridColumn: t.col, fontFamily: ARABIC_FONT, fontSize: 23 }}>{t.face}</span>
              ))}
            </div>
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-[30px] font-extrabold tracking-tight">Crossword</h1>
              {title && <p className="text-sm font-medium text-stone-600 dark:text-slate-400 text-center max-w-[20rem] truncate">{title}</p>}
            </div>
          </div>
          {phase === 'making' ? (
            <span className="w-9 h-9 rounded-full border-4 border-amber-500 border-t-transparent animate-spin" aria-label="Making the crossword" />
          ) : (
            <div className="w-full max-w-[22rem] flex gap-3">
              {choice('arabic',
                <span dir="rtl" className="text-[44px] font-bold leading-[1.5] text-amber-800 dark:text-amber-200" style={{ fontFamily: ARABIC_FONT }}>عربي</span>,
                'Arabic')}
              {choice('translit',
                <span className="text-[40px] font-extrabold leading-[1.65] tracking-tight text-amber-800 dark:text-amber-200">abc</span>,
                'Transliteration')}
            </div>
          )}
        </div>
      </>,
    );
  }

  if (!game || !mode) return null;

  // Nothing crosses — the picked words share no letters.
  if (!game.rounds.length || !geo || !puzzle) {
    return shell(
      <>
        <div className="h-14 flex-shrink-0 flex items-center px-1.5">{closeBtn}</div>
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center pb-16">
          <p className="text-xl font-extrabold">These words don't cross</p>
          <button onClick={playAgain} className={SECONDARY}>Back</button>
        </div>
      </>,
    );
  }

  const placements = puzzle.placements;
  const rounds = game.rounds.length;
  const wordsIn = (p: CrosswordPuzzle) => (
    <ul className={`w-full rounded-[20px] ${CARD} px-4 py-1.5 divide-y divide-[#EFE7D8] dark:divide-gray-700`}>
      {p.placements.map((pl, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-sm font-medium text-stone-600 dark:text-slate-400 min-w-0 truncate">{pl.entry.clue}</span>
          <span dir={arabic ? 'rtl' : 'ltr'} className="flex-shrink-0 text-xl font-bold text-teal-800 dark:text-teal-300 leading-[1.5]"
            style={arabic ? { fontFamily: ARABIC_FONT } : undefined}>{pl.entry.written}</span>
        </li>
      ))}
    </ul>
  );

  // ── A round done ──
  if (phase === 'roundDone') {
    const faces = solvedFaces(puzzle, arabic);
    const t = Math.max(14, Math.min(26, Math.floor(300 / Math.max(puzzle.width, puzzle.height))));
    return shell(
      <>
        <div className="h-14 flex-shrink-0 flex items-center px-1.5">{closeBtn}</div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[26rem] mx-auto flex flex-col items-center gap-5 px-5 pt-1 pb-8">
            <div aria-hidden="true" className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${puzzle.width}, ${t}px)`, gridTemplateRows: `repeat(${puzzle.height}, ${t}px)` }}>
              {[...faces.entries()].map(([k, face]) => {
                const [r, c] = k.split(',').map(Number);
                return (
                  <span key={k} className="rounded-md bg-teal-700 text-white flex items-center justify-center font-bold leading-none"
                    style={{ gridRow: r + 1, gridColumn: arabic ? puzzle.width - c : c + 1, fontSize: Math.round(t * 0.58), fontFamily: arabic ? ARABIC_FONT : undefined }}>{face}</span>
                );
              })}
            </div>
            <h2 className="text-[26px] font-extrabold tracking-tight">Crossword {round + 1} of {rounds}</h2>
            {wordsIn(puzzle)}
            <button onClick={nextRound} className={`${PRIMARY} w-full max-w-[20rem]`}>
              Next crossword
              <Svg size={20} stroke={2.4}>{ICON.arrow}</Svg>
            </button>
          </div>
        </div>
      </>,
    );
  }

  // ── All done ──
  if (phase === 'done') {
    const total = game.rounds.reduce((n, r) => n + r.placements.length, 0);
    const stats: Array<[string, string]> = [
      [String(total), 'words'],
      [String(play.hints), play.hints === 1 ? 'hint' : 'hints'],
      [String(play.mistakes), play.mistakes === 1 ? 'mistake' : 'mistakes'],
      [fmtTime(elapsed), 'time'],
    ];
    return shell(
      <>
        <div className="h-14 flex-shrink-0 flex items-center px-1.5">{closeBtn}</div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[26rem] mx-auto flex flex-col items-center gap-[18px] px-5 pb-8">
            <span className="w-16 h-16 rounded-full bg-teal-700 text-white flex items-center justify-center">
              <Svg size={34} stroke={2.6}>{ICON.check}</Svg>
            </span>
            <h2 className="text-[30px] font-extrabold tracking-tight">All done</h2>
            <div className="w-full grid grid-cols-4 gap-2">
              {stats.map(([v, l]) => (
                <div key={l} className={`rounded-2xl ${CARD} py-2.5 px-1 flex flex-col items-center gap-0.5`}>
                  <span className="text-xl font-extrabold tabular-nums">{v}</span>
                  <span className="text-xs font-medium text-stone-600 dark:text-slate-400">{l}</span>
                </div>
              ))}
            </div>
            <ul className={`w-full rounded-[20px] ${CARD} p-2 grid grid-cols-2 gap-x-2 gap-y-0.5`}>
              {game.rounds.flatMap(r => r.placements).map((pl, i) => (
                <li key={i} className="px-2 py-1 flex flex-col items-end min-w-0">
                  <span dir={arabic ? 'rtl' : 'ltr'} className="text-lg font-bold text-teal-800 dark:text-teal-300 leading-[1.45]"
                    style={arabic ? { fontFamily: ARABIC_FONT } : undefined}>{pl.entry.written}</span>
                  <span className="text-xs font-medium text-stone-600 dark:text-slate-400 max-w-full truncate">{pl.entry.clue}</span>
                </li>
              ))}
            </ul>
            <div className="w-full max-w-[340px] flex gap-2.5">
              <button onClick={playAgain} className={`${SECONDARY} flex-1`}>Play again</button>
              <button onClick={onExit} className={`${PRIMARY} flex-1 px-4`}>Close</button>
            </div>
          </div>
        </div>
      </>,
    );
  }

  // ── Playing ──
  const active = placements[play.active.p];
  const activeKeys = new Set(geo.cellsOf[play.active.p] ?? []);
  const activeCell = geo.cellsOf[play.active.p]?.[play.active.k];
  const solvedActive = play.solved.has(play.active.p);
  const arrow = (dir: 'across' | 'down') => (dir === 'down' ? '↓' : arabic ? '←' : '→');

  /** What a box shows: the letter, joined the way its word joins it. */
  const face = (k: string): string => {
    const ch = play.fills[k];
    if (!ch) return '';
    if (!arabic) return ch;
    const inf = geo.info.get(k)!;
    // A shared box follows the word being worked on; otherwise its across word.
    const ref = (inf.across?.[0] === play.active.p ? inf.across : inf.down?.[0] === play.active.p ? inf.down : inf.across ?? inf.down)!;
    const seq = geo.cellsOf[ref[0]].map(kk => play.fills[kk] ?? null);
    return shapeLetter(ch, formAt(seq, ref[1]));
  };

  const header = (
    <div className="h-14 lg:h-16 flex-shrink-0 flex items-center gap-2 pl-1.5 pr-2.5 lg:pr-5 lg:border-b lg:border-[#EADFCB] lg:dark:border-gray-800">
      {closeBtn}
      <h1 className="text-lg lg:text-xl font-extrabold tracking-tight">Crossword</h1>
      {rounds > 1 && (
        <span className="h-6 px-2.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center tabular-nums">
          {round + 1} / {rounds}
        </span>
      )}
      {title && <span className="hidden lg:inline ml-1.5 text-sm font-medium text-stone-600 dark:text-slate-400 truncate">{title}</span>}
      <span className="flex-1" />
      <span className="text-sm font-bold text-stone-600 dark:text-slate-400 tabular-nums">{play.solved.size}/{placements.length}</span>
      <button onClick={() => dispatch({ type: 'hint', geo })} disabled={solvedActive} aria-label="Show a letter"
        className="h-10 px-3.5 rounded-full flex items-center gap-1.5 text-sm font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-900 disabled:opacity-45">
        <Svg size={18}>{ICON.bulb}</Svg>
        Hint
      </button>
    </div>
  );

  const grid = (
    <div className="grid" dir="ltr"
      style={{ gridTemplateColumns: `repeat(${puzzle.width}, ${cell}px)`, gridTemplateRows: `repeat(${puzzle.height}, ${cell}px)`, gap }}>
      {[...geo.info.entries()].map(([k, inf]) => {
        const isSolved = (!!inf.across && play.solved.has(inf.across[0])) || (!!inf.down && play.solved.has(inf.down[0]));
        const look: Look = k === activeCell ? (play.wrong.has(k) ? 'activeWrong' : 'active') : play.wrong.has(k) ? 'wrong' : isSolved ? 'solved' : activeKeys.has(k) ? 'word' : 'normal';
        const num = geo.numberAt.get(k);
        const flash = play.flash && geo.cellsOf[play.flash.p]?.includes(k) ? play.flash : null;
        return (
          <button key={flash ? `${k}|${flash.n}` : k} type="button"
            onClick={() => dispatch({ type: 'select', geo, key: k })}
            aria-label={`${num ? `${num}, ` : ''}${play.fills[k] ?? 'empty'}`}
            className={`relative border-2 flex items-center justify-center select-none transition-colors ${TILE[look]} ${flash ? `cw-${flash.kind}` : ''}`}
            style={{
              gridRow: inf.row + 1,
              // Arabic: column 0 is the RIGHT edge, so words read right to left.
              gridColumn: arabic ? puzzle.width - inf.col : inf.col + 1,
              borderRadius: Math.round(cell * 0.21),
            }}>
            {num && (
              <span className={`absolute font-bold leading-none ${TILE_NUMBER[look]}`}
                style={{ top: Math.max(2, Math.round(cell * 0.07)), [arabic ? 'right' : 'left']: Math.max(3, Math.round(cell * 0.1)), fontSize: Math.max(8, Math.round(cell * 0.22)) }}>{num}</span>
            )}
            <span dir={arabic ? 'rtl' : 'ltr'} className="font-bold leading-none"
              style={arabic
                ? { fontFamily: ARABIC_FONT, fontSize: Math.round(cell * 0.59), marginTop: Math.round(cell * 0.07) }
                : { fontSize: Math.round(cell * 0.52) }}>
              {face(k)}
            </span>
            {play.revealed.has(k) && (
              <span aria-hidden="true" className={`absolute rounded-full ${look === 'solved' ? 'bg-sky-100' : 'bg-sky-700'}`}
                style={{ bottom: Math.max(3, Math.round(cell * 0.09)), [arabic ? 'left' : 'right']: Math.max(3, Math.round(cell * 0.1)), width: Math.max(4, Math.round(cell * 0.13)), height: Math.max(4, Math.round(cell * 0.13)) }} />
            )}
          </button>
        );
      })}
    </div>
  );

  const clueBar = (
    <div className={`flex items-center gap-1.5 rounded-2xl ${CARD} p-1.5 shadow-[0_1px_2px_rgba(28,25,23,0.06)]`}>
      <button onClick={() => dispatch({ type: 'step', geo, delta: -1 })} aria-label="Previous clue"
        className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-stone-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-gray-700">
        <Svg size={20}>{ICON.prev}</Svg>
      </button>
      <span className={`flex-shrink-0 h-[34px] min-w-[50px] px-2 rounded-[10px] flex items-center justify-center gap-1 text-[15px] font-extrabold ${solvedActive
        ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'}`}>
        {active.number}<span aria-hidden="true">{arrow(active.dir)}</span>
      </span>
      <span className="flex-1 min-w-0 px-1 flex flex-col">
        <span className="text-base font-semibold leading-snug truncate">{active.entry.clue}</span>
        {solvedActive && (
          <span dir={arabic ? 'rtl' : 'ltr'} className="text-base font-bold text-teal-700 dark:text-teal-300 leading-normal truncate text-left"
            style={arabic ? { fontFamily: ARABIC_FONT } : undefined}>{active.entry.written}</span>
        )}
      </span>
      <span className="flex-shrink-0 text-xs font-bold text-[#6B635C] dark:text-slate-400 tabular-nums">{active.entry.answer.length}</span>
      <button onClick={() => dispatch({ type: 'step', geo, delta: 1 })} aria-label="Next clue"
        className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-stone-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-gray-700">
        <Svg size={20}>{ICON.next}</Svg>
      </button>
    </div>
  );

  // The keys never take focus: a focused key would be pressed again by the
  // space bar of a real keyboard, typing its letter twice.
  const noFocus = (e: React.MouseEvent) => e.preventDefault();
  const keyboard = (
    <div className="flex flex-col gap-1.5 px-1.5 pt-1 pb-3.5" onMouseDown={noFocus}>
      {game.keys.map((row, ri) => {
        const digits = !arabic && ri === 0;
        const last = ri === game.keys.length - 1;
        return (
          <div key={ri} dir={arabic ? 'rtl' : 'ltr'} className={`flex justify-center ${digits ? 'gap-1.5' : 'gap-[5px]'}`}>
            {row.map(ch => digits ? (
              <button key={ch} type="button" onClick={() => typeLetter(ch)} aria-label={DIGIT_LETTER[ch] ? `${ch}, ${DIGIT_LETTER[ch]}` : ch}
                className={`${KEY} flex-1 max-w-[64px] h-11 !bg-[#FFF7E6] dark:!bg-gray-700 flex flex-col items-center justify-center gap-px`}>
                <span className="text-lg font-bold leading-none">{ch}</span>
                {DIGIT_LETTER[ch] && (
                  <span dir="rtl" className="text-xs font-bold leading-tight text-amber-800 dark:text-amber-300" style={{ fontFamily: ARABIC_FONT }}>{DIGIT_LETTER[ch]}</span>
                )}
              </button>
            ) : (
              <button key={ch} type="button" onClick={() => typeLetter(ch)}
                className={`${KEY} flex-1 ${arabic ? 'max-w-[44px] sm:max-w-[54px] h-[46px] text-[22px] font-bold' : 'max-w-[36px] sm:max-w-[46px] h-11 text-[19px] font-semibold'} leading-none`}
                style={arabic ? { fontFamily: ARABIC_FONT } : undefined}>
                {ch}
              </button>
            ))}
            {last && (
              <button type="button" onClick={del} aria-label="Delete"
                className={`${KEY_DEL} ${arabic ? 'flex-[1.4] max-w-[62px] sm:max-w-[76px] h-[46px]' : 'flex-[1.5] max-w-[56px] sm:max-w-[70px] h-11'}`}>
                <Svg size={24} stroke={2}>{arabic ? ICON.delRtl : ICON.delLtr}</Svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const clueList = (
    <div className="flex flex-col gap-6">
      {(['across', 'down'] as const).map(dir => {
        const list = placements.map((p, i) => ({ p, i })).filter(x => x.p.dir === dir);
        if (!list.length) return null;
        return (
          <div key={dir} className="flex flex-col gap-1">
            <p className="ml-2.5 mb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#6B635C] dark:text-slate-400">
              {dir === 'across' ? 'Across' : 'Down'} {arrow(dir)}
            </p>
            {list.map(({ p, i }) => {
              const on = i === play.active.p, done = play.solved.has(i);
              return (
                <button key={i} type="button" onClick={() => dispatch({ type: 'focus', geo, p: i })}
                  className={`w-full flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[15px] text-left ${on
                    ? 'bg-amber-200 dark:bg-amber-900/60 font-bold'
                    : done ? 'text-teal-800 dark:text-teal-300 font-medium hover:bg-black/5 dark:hover:bg-white/5'
                    : 'font-medium hover:bg-black/5 dark:hover:bg-white/5'}`}>
                  <span className="w-[22px] flex-shrink-0 font-extrabold text-[#6B635C] dark:text-slate-400 tabular-nums">{p.number}</span>
                  <span className="flex-1 min-w-0">{p.entry.clue}</span>
                  {done
                    ? <Svg size={18} stroke={2.6} className="text-teal-700 dark:text-teal-300 flex-shrink-0">{ICON.check}</Svg>
                    : <span className="text-xs font-bold text-[#6B635C] dark:text-slate-400 tabular-nums">{p.entry.answer.length}</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return shell(
    <>
      {header}
      <div className="flex-1 min-h-0 flex">
        {/* A phone on its side has no height for grid AND keyboard stacked:
            there the keyboard moves beside the grid. */}
        <div className="flex-1 min-w-0 flex flex-col [@media(max-height:520px)_and_(orientation:landscape)]:flex-row">
          <div ref={areaRef} className="flex-1 min-h-0 min-w-0 flex items-center justify-center px-4 py-2 lg:px-8 lg:py-5">
            {grid}
          </div>
          <div className="flex-shrink-0 flex flex-col [@media(max-height:520px)_and_(orientation:landscape)]:w-[54%] [@media(max-height:520px)_and_(orientation:landscape)]:justify-center">
            <div className="w-full max-w-[560px] mx-auto px-3 pb-1.5">{clueBar}</div>
            <div className="w-full max-w-[640px] mx-auto">{keyboard}</div>
          </div>
        </div>
        <aside className="hidden lg:block w-[340px] flex-shrink-0 overflow-y-auto border-l border-[#EADFCB] dark:border-gray-800 px-[22px] py-[26px]">
          {clueList}
        </aside>
      </div>
    </>,
  );
};

export default CrosswordGame;
