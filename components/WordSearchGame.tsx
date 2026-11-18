// components/WordSearchGame.tsx
// -----------------------------------------------------------------------------
// Word search — a grid of letters with the round's words hidden in it, the
// clues in English, so a word is only found by someone who knows it. Words run
// the way they are read (right to left in Arabic, left to right in
// transliteration) or downwards; never backwards, never diagonal (the tutor's
// choice, for beginners).
//
//   drag across the letters           select a line; let go to check it
//   tap the first letter, then the last   the same, without dragging
//
// A found word turns teal in the grid and, in the list, its loose letters come
// back as the joined word. Rounds of six words, three rounds a game.
// Practice only — nothing is saved. Look: Claude Design canvas "Arabic Word Games".
// -----------------------------------------------------------------------------
import React, { useMemo, useRef, useState } from 'react';
import { CrosswordEntry, CrosswordMode, CrosswordSource, crosswordEntries } from '../utils/crossword';
import { SEARCH_ROUNDS, SearchGrid, WORDS_PER_SEARCH, buildSearch, lineBetween, pickRun, searchKey } from '../utils/wordGames';
import {
  ARABIC_FONT, BTN_PRIMARY, CARD, CloseButton, DoneScreen, GameHeader, GameShell, ICON, MUTED, PickScreen, SHORT_LANDSCAPE, Svg, TONE, Written,
  fmtTime, useBoxSize, useMedia,
  capturePointer,
} from './WordGameKit';

interface Props {
  words: CrosswordSource[];
  title?: string;
  onExit: () => void;
}

type RC = [number, number];

const MOTIF = (
  <div className="grid grid-cols-4 gap-1 p-2 rounded-2xl bg-white dark:bg-gray-800 border border-[#E5DAC3] dark:border-gray-700" dir="rtl">
    {[...'نبيتصمكعلقرف'].map((ch, i) => (
      <span key={i} className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold ${i >= 1 && i <= 3 ? 'bg-teal-700 text-white' : i === 6 || i === 10 ? 'bg-amber-200 text-stone-900' : 'bg-[#FAF6EC] dark:bg-gray-700'}`}
        style={{ fontFamily: ARABIC_FONT }}>{ch}</span>
    ))}
  </div>
);

const WordSearchGame: React.FC<Props> = ({ words, title, onExit }) => {
  const [mode, setMode] = useState<CrosswordMode | null>(null);
  const [phase, setPhase] = useState<'pick' | 'play' | 'roundDone' | 'done'>('pick');
  const [grid, setGrid] = useState<SearchGrid | null>(null);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(1);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [justFound, setJustFound] = useState<number | null>(null);
  const [sel, setSel] = useState<{ a: RC; b: RC } | null>(null);
  const [anchor, setAnchor] = useState<RC | null>(null);
  const [wrong, setWrong] = useState<{ cells: string[]; n: number } | null>(null);
  const [hintAt, setHintAt] = useState<{ p: number; n: number } | null>(null);
  const [hints, setHints] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [foundAll, setFoundAll] = useState<CrosswordEntry[]>([]);
  const startedAt = useRef(0);
  const remaining = useRef<CrosswordEntry[]>([]);
  const retried = useRef(new Set<string>());
  const played = useRef(new Set<string>());

  const counts = useMemo(() => ({
    arabic: crosswordEntries(words, 'arabic').length,
    translit: crosswordEntries(words, 'translit').length,
  }), [words]);
  const arabic = mode === 'arabic';
  const short = useMedia(SHORT_LANDSCAPE);

  /** The next grid from what is left; false when nothing is left. */
  const buildNext = (m: CrosswordMode): boolean => {
    while (remaining.current.length) {
      const take = remaining.current.splice(0, WORDS_PER_SEARCH);
      const { grid: g, leftOut } = buildSearch(take, m);
      // A word that did not fit gets one more go in the next grid.
      const again = leftOut.filter(e => !retried.current.has(e.id));
      again.forEach(e => retried.current.add(e.id));
      remaining.current = [...again, ...remaining.current];
      if (g.placements.length) {
        setGrid(g); setFound(new Set()); setSel(null); setAnchor(null); selRef.current = null; anchorRef.current = null;
        setWrong(null); setHintAt(null); setJustFound(null);
        return true;
      }
    }
    return false;
  };

  const begin = (m: CrosswordMode) => {
    const entries = pickRun(crosswordEntries(words, m), WORDS_PER_SEARCH * SEARCH_ROUNDS, played.current);
    entries.forEach(e => played.current.add(e.id));
    remaining.current = entries; retried.current = new Set();
    setMode(m); setRound(0); setTotalRounds(Math.max(1, Math.ceil(entries.length / WORDS_PER_SEARCH)));
    setHints(0); setMistakes(0); setFoundAll([]); startedAt.current = Date.now();
    if (buildNext(m)) setPhase('play');
    else { setElapsed(0); setPhase('done'); }
  };

  const nextRound = () => {
    if (!mode) return;
    if (buildNext(mode)) { setRound(r => r + 1); setPhase('play'); }
    else { setElapsed(Date.now() - startedAt.current); setPhase('done'); }
  };

  // ── Selecting ──
  const gridEl = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const box = useBoxSize(area, [phase, short]);
  const dragging = useRef<{ on: boolean; moved: boolean }>({ on: false, moved: false });
  // The live selection: pointer events can come faster than React re-renders.
  const selRef = useRef<{ a: RC; b: RC } | null>(null);
  const anchorRef = useRef<RC | null>(null);
  const putSel = (v: { a: RC; b: RC } | null) => { selRef.current = v; setSel(v); };
  const putAnchor = (v: RC | null) => { anchorRef.current = v; setAnchor(v); };

  if (phase === 'pick' || !mode) {
    return <PickScreen title="Word search" subtitle={title} motif={MOTIF} tone="indigo" counts={counts} min={1} onPick={begin} onExit={onExit} />;
  }

  if (phase === 'done' || !grid) {
    return (
      <DoneScreen tone="indigo" onExit={onExit} onAgain={() => begin(mode)} arabic={arabic}
        headline="All found"
        stats={[[String(foundAll.length), 'words'], [String(hints), hints === 1 ? 'hint' : 'hints'], [String(mistakes), mistakes === 1 ? 'mistake' : 'mistakes'], [fmtTime(elapsed), 'time']]}
        words={foundAll.map(e => ({ written: e.written, clue: e.clue }))} />
    );
  }

  const { size, letters, placements } = grid;

  if (phase === 'roundDone') {
    return (
      <GameShell onExit={onExit}>
        <div className="h-14 flex-shrink-0 flex items-center px-1.5"><CloseButton onExit={onExit} /></div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[26rem] mx-auto flex flex-col items-center gap-5 px-5 pt-1 pb-8 wg-in">
            <span className="w-16 h-16 rounded-full bg-teal-700 text-white flex items-center justify-center"><Svg size={34} stroke={2.6}>{ICON.check}</Svg></span>
            <h2 className="text-[26px] font-extrabold tracking-tight">Grid {round + 1} of {totalRounds}</h2>
            <ul className={`w-full rounded-[20px] ${CARD} px-4 py-1.5 divide-y divide-[#EFE7D8] dark:divide-gray-700`}>
              {placements.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                  <span className={`text-sm font-medium min-w-0 truncate ${MUTED}`}>{p.entry.clue}</span>
                  <Written text={p.entry.written} arabic={arabic} className="flex-shrink-0 text-xl font-bold text-teal-800 dark:text-teal-300 leading-[1.5]" />
                </li>
              ))}
            </ul>
            <button onClick={nextRound} className={`${BTN_PRIMARY} ${TONE.indigo.primary} w-full max-w-[20rem]`}>
              Next grid
              <Svg size={20} stroke={2.4}>{ICON.arrowR}</Svg>
            </button>
          </div>
        </div>
      </GameShell>
    );
  }

  // ── Geometry ──
  // Room inside the white frame round the grid (none in short landscape).
  const frame = short ? 4 : 28;
  const availW = box.w - frame, availH = box.h - frame;
  const gap = Math.min(availW, availH) / size < 40 ? 3 : 5;
  const cell = Math.max(22, Math.floor(Math.min(64, (availW - gap * (size - 1)) / size, (availH - gap * (size - 1)) / size)));

  const cellAt = (e: React.PointerEvent): RC | null => {
    const el = gridEl.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const pitch = (r.width + gap) / size;
    const col = Math.floor((e.clientX - r.left) / pitch);
    const row = Math.floor((e.clientY - r.top) / ((r.height + gap) / size));
    if (row < 0 || col < 0 || row >= size || col >= size) return null;
    // Arabic reads from the right: screen column 0 is the LAST reading column.
    return [row, arabic ? size - 1 - col : col];
  };

  const check = (cells: RC[]) => {
    if (cells.length < 2) return;
    const keys = cells.map(([r, c]) => searchKey(r, c));
    const hitIdx = placements.findIndex((p, i) => !found.has(i) && p.cells.length === keys.length && p.cells.every(k => keys.includes(k)));
    if (hitIdx < 0) {
      // Selecting an already-found word again is not a mistake.
      const again = placements.some((p, i) => found.has(i) && p.cells.length === keys.length && p.cells.every(k => keys.includes(k)));
      if (!again) { setMistakes(m => m + 1); setWrong({ cells: keys, n: (wrong?.n ?? 0) + 1 }); window.setTimeout(() => setWrong(null), 480); }
      return;
    }
    const next = new Set(found); next.add(hitIdx);
    setFound(next); setJustFound(hitIdx);
    setFoundAll(f => [...f, placements[hitIdx].entry]);
    if (hintAt?.p === hitIdx) setHintAt(null);
    if (next.size === placements.length) {
      window.setTimeout(() => {
        if (remaining.current.length) setPhase('roundDone');
        else { setElapsed(Date.now() - startedAt.current); setPhase('done'); }
      }, 1000);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    const c = cellAt(e);
    if (!c) return;
    e.preventDefault();
    capturePointer(e);
    dragging.current = { on: true, moved: false };
    putSel({ a: c, b: c });
  };
  const onMove = (e: React.PointerEvent) => {
    const cur = selRef.current;
    if (!dragging.current.on || !cur) return;
    const c = cellAt(e);
    if (!c || (c[0] === cur.b[0] && c[1] === cur.b[1])) return;
    if (c[0] !== cur.a[0] || c[1] !== cur.a[1]) dragging.current.moved = true;
    putSel({ a: cur.a, b: c });
  };
  const onUp = () => {
    const cur = selRef.current, anc = anchorRef.current;
    if (!dragging.current.on || !cur) return;
    dragging.current.on = false;
    if (dragging.current.moved) {
      check(lineBetween(cur.a, cur.b));
      putAnchor(null);
    } else if (anc && (anc[0] !== cur.a[0] || anc[1] !== cur.a[1])) {
      check(lineBetween(anc, cur.a));
      putAnchor(null);
    } else {
      putAnchor(anc ? null : cur.a);
    }
    putSel(null);
  };

  const hint = () => {
    const p = placements.findIndex((_, i) => !found.has(i));
    if (p < 0) return;
    setHintAt({ p, n: (hintAt?.n ?? 0) + 1 });
    setHints(h => h + 1);
  };

  const selected: RC[] = sel ? lineBetween(sel.a, sel.b) : anchor ? [anchor] : [];
  const selKeys = new Set(selected.map(([r, c]) => searchKey(r, c)));
  const foundKeys = new Set([...found].flatMap(i => placements[i].cells));
  const justKeys = new Set(justFound != null ? placements[justFound].cells : []);
  const wrongKeys = new Set(wrong?.cells ?? []);
  const hintKey = hintAt ? placements[hintAt.p].cells[0] : null;
  // The selection's letters in reading order.
  const selLetters = [...selected].sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(([r, c]) => letters[r][c]);

  const gridView = (
    <div ref={gridEl} dir={arabic ? 'rtl' : 'ltr'}
      className={`grid touch-none ${wrong ? 'wg-shake' : ''}`} key={wrong ? `w${wrong.n}` : 'g'}
      style={{ gridTemplateColumns: `repeat(${size}, ${cell}px)`, gap }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {letters.flatMap((row, r) => row.map((ch, c) => {
        const k = searchKey(r, c);
        const look = wrongKeys.has(k) ? 'bg-rose-100 text-rose-800 ring-2 ring-rose-500 dark:bg-rose-950 dark:text-rose-200'
          : selKeys.has(k) ? 'bg-amber-200 text-stone-900 ring-2 ring-amber-500 dark:bg-amber-700 dark:text-white'
          : foundKeys.has(k) ? 'bg-teal-700 text-white'
          : 'bg-[#FAF6EC] dark:bg-gray-800 text-stone-900 dark:text-slate-100';
        return (
          <span key={`${k}|${justKeys.has(k) ? found.size : ''}|${k === hintKey ? hintAt?.n : ''}`}
            className={`flex items-center justify-center font-bold leading-none transition-colors ${look} ${justKeys.has(k) ? 'wg-pop' : ''} ${k === hintKey ? 'wg-pulse ring-2 ring-indigo-500' : ''}`}
            style={{ height: cell, borderRadius: Math.round(cell * 0.24), fontSize: Math.round(cell * (arabic ? 0.5 : 0.46)), fontFamily: arabic ? ARABIC_FONT : undefined, paddingTop: arabic ? Math.round(cell * 0.06) : 0 }}>
            {ch}
          </span>
        );
      }))}
    </div>
  );

  const pill = (
    <div className="h-12 flex-shrink-0 flex items-center justify-center">
      {selLetters.length > 0 && (
        <span dir={arabic ? 'rtl' : 'ltr'}
          className="h-11 px-5 rounded-full bg-amber-200 dark:bg-amber-800 border-2 border-amber-500 text-stone-900 dark:text-white font-bold flex items-center gap-2"
          style={{ fontFamily: arabic ? ARABIC_FONT : undefined, fontSize: arabic ? 22 : 19 }}>
          {selLetters.map((ch, i) => <span key={i}>{ch}</span>)}
        </span>
      )}
    </div>
  );

  const clueRow = (i: number, compact: boolean) => {
    const p = placements[i];
    const done = found.has(i);
    const hinted = hintAt?.p === i && !done;
    return (
      <div key={i}
        className={`flex items-center justify-between gap-2 rounded-xl ${compact ? 'h-11 px-3' : 'h-[52px] px-3.5'} ${done
          ? `bg-teal-700 text-white ${justFound === i ? 'wg-pop' : ''}`
          : hinted ? 'bg-white dark:bg-gray-800 ring-2 ring-indigo-500'
          : compact ? `${CARD}` : ''}`}>
        <span className={`min-w-0 truncate ${compact ? 'text-[15px]' : 'text-base'} ${done ? 'font-semibold' : 'font-medium'} flex items-center gap-1.5`}>
          {done && <Svg size={16} stroke={3} className="flex-shrink-0">{ICON.check}</Svg>}
          {p.entry.clue}
        </span>
        {done && <Written text={p.entry.written} arabic={arabic} className={`flex-shrink-0 font-bold leading-none ${compact ? 'text-lg' : 'text-2xl'}`} />}
      </div>
    );
  };

  return (
    <GameShell onExit={onExit}>
      <GameHeader title="Word search" tone="indigo" onExit={onExit} subtitle={title}
        chip={totalRounds > 1 ? `${round + 1} / ${totalRounds}` : undefined}
        right={
          <div className="flex items-center gap-2.5">
            <span className={`text-sm font-bold tabular-nums ${MUTED}`}>{found.size}/{placements.length}</span>
            <button onClick={hint} aria-label="Show where a word starts"
              className={`h-10 px-3.5 rounded-full flex items-center gap-1.5 text-sm font-bold ${TONE.indigo.soft}`}>
              <Svg size={18}>{ICON.bulb}</Svg>
              Hint
            </button>
          </div>
        } />

      <div className="flex-1 min-h-0 flex">
        {short ? (
          <div className="flex-1 min-w-0 flex gap-3 px-3 pb-3">
            <div ref={area} className="flex-1 min-w-0 flex items-center justify-center">{gridView}</div>
            <div className="w-[42%] flex flex-col min-h-0">
              {pill}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">{placements.map((_, i) => clueRow(i, true))}</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex flex-col px-4 pt-2 lg:pt-6 pb-4 lg:pb-6">
            <div ref={area} className="flex-1 min-h-0 flex items-center justify-center">
              <div className="p-2 sm:p-3 rounded-[22px] bg-white dark:bg-gray-900 border border-[#E5DAC3] dark:border-gray-700 shadow-[0_10px_28px_rgba(120,90,40,0.10)]">{gridView}</div>
            </div>
            {pill}
            <div className="lg:hidden grid grid-cols-2 sm:grid-cols-3 gap-1.5 w-full max-w-[560px] mx-auto">{placements.map((_, i) => clueRow(i, true))}</div>
          </div>
        )}

        <aside className="hidden lg:flex flex-col gap-1.5 w-[340px] flex-shrink-0 overflow-y-auto border-l border-[#EADFCB] dark:border-gray-800 px-[22px] py-[26px]">
          <p className={`ml-2.5 mb-2 text-xs font-extrabold uppercase tracking-[0.14em] ${MUTED}`}>Find</p>
          {placements.map((_, i) => clueRow(i, false))}
        </aside>
      </div>
    </GameShell>
  );
};

export default WordSearchGame;
