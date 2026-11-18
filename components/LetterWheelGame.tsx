// components/LetterWheelGame.tsx
// -----------------------------------------------------------------------------
// Letter wheel — the English word sits above a row of empty boxes; the word's
// letters (plus one or two look-alikes) sit in a circle. The student drags from
// letter to letter, or taps them one by one, and the word writes itself in the
// boxes as it grows — in Arabic each letter takes its joined shape at once.
//
//   drag back over the letter before    takes the last one off
//   tap the last letter again           takes it off
//   keyboard                            type the letters, Backspace undoes
//
// A full row is checked straight away: right turns teal and moves on, wrong
// shakes and clears (hinted letters stay). Practice only — nothing is saved.
// Look: Claude Design canvas "Arabic Word Games".
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CrosswordEntry, CrosswordMode, CrosswordSource, DIGIT_LETTER, crosswordEntries, formAt, shapeLetter } from '../utils/crossword';
import { decoyLetters, pickRun, shuffle } from '../utils/wordGames';
import {
  ARABIC_FONT, BTN_QUIET, DoneScreen, GameHeader, GameShell, ICON, MUTED, PickScreen, SHORT_LANDSCAPE, Svg, TONE, Written,
  fmtTime, useBoxSize, useMedia,
  capturePointer,
} from './WordGameKit';

interface Props {
  words: CrosswordSource[];
  title?: string;
  onExit: () => void;
}

const RUN = 10;

interface Tile { id: number; ch: string }
interface WordState {
  entry: CrosswordEntry;
  /** In wheel order: tile i sits at position i round the circle. */
  tiles: Tile[];
  /** Tile ids in the order they were picked. */
  path: number[];
  /** How many letters at the start a hint has fixed. */
  locked: number;
  status: 'play' | 'right' | 'wrong';
  flash: number;
  hinted: boolean;
}

function deal(entry: CrosswordEntry, mode: CrosswordMode): WordState {
  const len = entry.answer.length;
  const extra = len <= 3 ? 2 : len <= 6 ? 1 : 0;
  const letters = [...entry.answer, ...decoyLetters(entry.answer, mode, extra)];
  return { entry, tiles: shuffle(letters.map((ch, id) => ({ id, ch }))), path: [], locked: 0, status: 'play', flash: 0, hinted: false };
}

const MOTIF = (
  <div className="relative w-[132px] h-[132px] rounded-full bg-white dark:bg-gray-800 border border-[#E5DAC3] dark:border-gray-700">
    <svg width="132" height="132" viewBox="0 0 132 132" className="absolute inset-0"><polyline points="66,24 28,82 104,82" fill="none" stroke="#F59E0B" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" /></svg>
    {[['ب', 48, 6], ['ي', 10, 64], ['ت', 86, 64]].map(([ch, x, y]) => (
      <span key={ch as string} className="absolute w-9 h-9 rounded-full bg-amber-600 text-white flex items-center justify-center text-[19px] font-bold"
        style={{ left: x as number, top: y as number, fontFamily: ARABIC_FONT }}>{ch}</span>
    ))}
  </div>
);

const LetterWheelGame: React.FC<Props> = ({ words, title, onExit }) => {
  const [mode, setMode] = useState<CrosswordMode | null>(null);
  const [run, setRun] = useState<CrosswordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [word, setWord] = useState<WordState | null>(null);
  const [phase, setPhase] = useState<'pick' | 'play' | 'done'>('pick');
  const [hints, setHints] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const played = useRef(new Set<string>());

  const counts = useMemo(() => ({
    arabic: crosswordEntries(words, 'arabic').length,
    translit: crosswordEntries(words, 'translit').length,
  }), [words]);

  const arabic = mode === 'arabic';
  const short = useMedia(SHORT_LANDSCAPE);

  const begin = useCallback((m: CrosswordMode) => {
    const r = pickRun(crosswordEntries(words, m), RUN, played.current);
    r.forEach(e => played.current.add(e.id));
    setMode(m); setRun(r); setIdx(0); setWord(r.length ? deal(r[0], m) : null);
    setHints(0); setMistakes(0); startedAt.current = Date.now(); setPhase('play');
  }, [words]);

  // ── Moves ──
  const len = word?.entry.answer.length ?? 0;
  const stepTo = useCallback((id: number) => setWord(w => {
    if (!w || w.status !== 'play') return w;
    const p = w.path;
    if (p[p.length - 1] === id) return w;
    if (!p.includes(id)) return p.length >= w.entry.answer.length ? w : { ...w, path: [...p, id] };
    // Back over the letter before the last one: the last comes off.
    if (p[p.length - 2] === id && p.length > w.locked) return { ...w, path: p.slice(0, -1) };
    return w;
  }), []);
  const undo = useCallback(() => setWord(w => (w && w.status === 'play' && w.path.length > w.locked ? { ...w, path: w.path.slice(0, -1) } : w)), []);
  const cutTo = useCallback((id: number) => setWord(w => {
    if (!w || w.status !== 'play') return w;
    const at = w.path.indexOf(id);
    return at < 0 ? w : { ...w, path: w.path.slice(0, Math.max(at + 1, w.locked)) };
  }), []);
  const reshuffle = () => setWord(w => (w ? { ...w, tiles: shuffle(w.tiles) } : w));

  const hint = () => {
    if (!word || word.status !== 'play') return;
    const { answer } = word.entry;
    let k = word.locked;
    while (k < word.path.length && word.tiles.find(t => t.id === word.path[k])?.ch === answer[k]) k++;
    if (k >= answer.length) return;
    const path = word.path.slice(0, k);
    const tile = word.tiles.find(t => t.ch === answer[k] && !path.includes(t.id));
    if (!tile) return;
    setWord({ ...word, path: [...path, tile.id], locked: k + 1, hinted: true });
    setHints(h => h + 1);
  };

  // ── A full row is checked at once ──
  useEffect(() => {
    if (!word || word.status !== 'play' || word.path.length !== len || !len) return;
    const spelled = word.path.map(id => word.tiles.find(t => t.id === id)!.ch).join('');
    const right = spelled === word.entry.answer.join('');
    setWord({ ...word, status: right ? 'right' : 'wrong', flash: word.flash + 1 });
    if (!right) setMistakes(m => m + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.path.length, word?.status]);

  // …then a moment to see it: right moves on, wrong clears the row.
  useEffect(() => {
    if (!word || !mode || word.status === 'play') return;
    if (word.status === 'wrong') {
      const t = window.setTimeout(() => setWord(w => (w ? { ...w, status: 'play', path: w.path.slice(0, w.locked) } : w)), 520);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      if (idx + 1 < run.length) { setIdx(idx + 1); setWord(deal(run[idx + 1], mode)); }
      else { setElapsed(Date.now() - startedAt.current); setPhase('done'); }
    }, 950);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word?.status, word?.flash]);

  // ── Keyboard ──
  useEffect(() => {
    if (phase !== 'play' || !word) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace') { e.preventDefault(); undo(); return; }
      const ch = arabic ? e.key.normalize('NFC') : e.key.toLowerCase();
      if ([...ch].length !== 1) return;
      const tile = word.tiles.find(t => t.ch === ch && !word.path.includes(t.id));
      if (tile) { e.preventDefault(); stepTo(tile.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, word, arabic, undo, stepTo]);

  // ── Sizes ──
  const wheelArea = useRef<HTMLDivElement>(null);
  const area = useBoxSize(wheelArea, [phase, short]);
  const boxesArea = useRef<HTMLDivElement>(null);
  const boxesBox = useBoxSize(boxesArea, [phase, short]);

  // ── Drag across the wheel ──
  const drag = useRef<{ on: boolean; startId: number; wasLast: boolean; moved: boolean }>({ on: false, startId: -1, wasLast: false, moved: false });
  const [finger, setFinger] = useState<{ x: number; y: number } | null>(null);

  if (phase === 'pick' || !mode) {
    return <PickScreen title="Letter wheel" subtitle={title} motif={MOTIF} tone="amber" counts={counts} min={1} onPick={begin} onExit={onExit} />;
  }

  if (phase === 'done' || !word) {
    return (
      <DoneScreen tone="amber" onExit={onExit} onAgain={() => begin(mode)} arabic={arabic}
        headline="All done"
        stats={[[String(run.length), 'words'], [String(hints), hints === 1 ? 'hint' : 'hints'], [String(mistakes), mistakes === 1 ? 'mistake' : 'mistakes'], [fmtTime(elapsed), 'time']]}
        words={run.map(e => ({ written: e.written, clue: e.clue }))} />
    );
  }

  const { answer } = word.entry;
  const n = word.tiles.length;
  const S = Math.max(200, Math.min(short ? 420 : 440, Math.min(area.w, area.h) - 20));
  const T = Math.round(Math.max(40, Math.min(84, S * (n <= 5 ? 0.21 : n <= 7 ? 0.18 : 0.155))));
  const R = S / 2 - T / 2 - 6;
  const pos = (i: number) => {
    const a = (-90 + (i * 360) / n) * (Math.PI / 180);
    return { x: S / 2 + R * Math.cos(a), y: S / 2 + R * Math.sin(a) };
  };
  const centerOf = (id: number) => pos(word.tiles.findIndex(t => t.id === id));

  const local = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hit = (p: { x: number; y: number }): number | null => {
    for (let i = 0; i < n; i++) {
      const c = pos(i);
      if (Math.hypot(c.x - p.x, c.y - p.y) < T * 0.62) return word.tiles[i].id;
    }
    return null;
  };
  const onDown = (e: React.PointerEvent) => {
    if (word.status !== 'play') return;
    const p = local(e);
    const id = hit(p);
    if (id == null) return;
    e.preventDefault();
    capturePointer(e);
    const last = word.path[word.path.length - 1];
    drag.current = { on: true, startId: id, wasLast: last === id, moved: false };
    if (!word.path.includes(id)) stepTo(id);
    else if (last !== id) cutTo(id);
    setFinger(p);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on) return;
    const p = local(e);
    setFinger(p);
    const id = hit(p);
    if (id != null && id !== drag.current.startId) drag.current.moved = true;
    if (id != null) stepTo(id);
  };
  const onUp = () => {
    if (drag.current.on && drag.current.wasLast && !drag.current.moved) undo();
    drag.current.on = false;
    setFinger(null);
  };

  const line = [
    ...word.path.map(id => centerOf(id)),
    ...(finger && word.status === 'play' && word.path.length && word.path.length < answer.length ? [finger] : []),
  ];

  // ── Boxes ──
  const filled = word.path.map(id => word.tiles.find(t => t.id === id)!.ch);
  const seq = answer.map((_, i) => filled[i] ?? null);
  const gap = answer.length > 7 ? 5 : 8;
  const boxW = Math.max(26, Math.min(short ? 54 : 68, Math.floor(((boxesBox.w || 320) - gap * (answer.length - 1)) / answer.length)));
  const boxes = (
    <div ref={boxesArea} className="w-full flex justify-center">
      <div key={word.status === 'wrong' ? `w${word.flash}` : 'b'} dir={arabic ? 'rtl' : 'ltr'}
        className={`flex ${word.status === 'wrong' ? 'wg-shake' : ''}`} style={{ gap }}>
        {answer.map((_, i) => {
          const ch = filled[i];
          const right = word.status === 'right';
          const wrong = word.status === 'wrong' && !!ch;
          const look = right
            ? 'bg-teal-700 border-teal-700 text-white'
            : wrong ? 'bg-white dark:bg-gray-800 border-rose-600 text-rose-700 dark:text-rose-300'
            : ch ? 'bg-amber-200 border-amber-500 text-stone-900 dark:bg-amber-900/60 dark:text-amber-50'
            : i === filled.length ? 'bg-white dark:bg-gray-800 border-dashed border-amber-600'
            : 'bg-white dark:bg-gray-800 border-dashed border-[#D6CBB5] dark:border-gray-600';
          return (
            <span key={right ? `r${i}` : i}
              className={`relative border-2 flex items-center justify-center font-bold leading-none ${look} ${right ? 'wg-pop' : ''}`}
              style={{ width: boxW, height: Math.round(boxW * 1.12), borderRadius: Math.round(boxW * 0.21), animationDelay: right ? `${i * 45}ms` : undefined }}>
              {ch && (arabic
                ? <span dir="rtl" style={{ fontFamily: ARABIC_FONT, fontSize: Math.round(boxW * 0.56), marginTop: Math.round(boxW * 0.06) }}>{shapeLetter(ch, formAt(seq, i))}</span>
                : <span style={{ fontSize: Math.round(boxW * 0.5) }}>{ch}</span>)}
              {i < word.locked && !right && (
                <span aria-hidden="true" className="absolute rounded-full bg-sky-700"
                  style={{ bottom: 4, [arabic ? 'left' : 'right']: 5, width: Math.max(4, Math.round(boxW * 0.11)), height: Math.max(4, Math.round(boxW * 0.11)) }} />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );

  const wheel = (
    <div className="relative rounded-full bg-white dark:bg-gray-800 border border-[#E5DAC3] dark:border-gray-700 shadow-[0_14px_40px_rgba(120,90,40,0.12)] touch-none"
      style={{ width: S, height: S }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <svg width={S} height={S} className="absolute inset-0 pointer-events-none" aria-hidden="true">
        {line.length > 1 && (
          <polyline points={line.map(p => `${p.x},${p.y}`).join(' ')} fill="none"
            stroke={word.status === 'right' ? '#0F766E' : word.status === 'wrong' ? '#E11D48' : '#F59E0B'}
            strokeWidth={Math.max(8, T * 0.18)} strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
        )}
      </svg>
      {word.tiles.map((t, i) => {
        const p = pos(i);
        const on = word.path.includes(t.id);
        const look = on
          ? word.status === 'right' ? 'bg-teal-700 text-white border-teal-700'
            : word.status === 'wrong' ? 'bg-rose-600 text-white border-rose-600'
            : 'bg-amber-600 text-white border-amber-600'
          : 'bg-[#FAF6EC] dark:bg-gray-700 border-[#E5DAC3] dark:border-gray-600 text-stone-900 dark:text-slate-100';
        return (
          <span key={t.id} role="button" aria-label={t.ch} aria-pressed={on}
            className={`absolute rounded-full border-2 flex flex-col items-center justify-center font-bold leading-none transition-[left,top,background-color] duration-200 ${look}`}
            style={{ left: p.x - T / 2, top: p.y - T / 2, width: T, height: T }}>
            <span dir={arabic ? 'rtl' : 'ltr'} style={arabic ? { fontFamily: ARABIC_FONT, fontSize: Math.round(T * 0.48), marginTop: Math.round(T * 0.04) } : { fontSize: Math.round(T * 0.44) }}>{t.ch}</span>
            {!arabic && DIGIT_LETTER[t.ch] && (
              <span className="leading-none" style={{ fontFamily: ARABIC_FONT, fontSize: Math.round(T * 0.22), opacity: 0.75 }}>{DIGIT_LETTER[t.ch]}</span>
            )}
          </span>
        );
      })}
    </div>
  );

  const controls = (
    <div className="flex justify-center gap-3">
      <button onClick={undo} disabled={word.path.length <= word.locked || word.status !== 'play'} className={`wg-tap ${BTN_QUIET}`}>
        <Svg size={18} stroke={2}>{arabic ? ICON.delRtl : ICON.delLtr}</Svg>
        Undo
      </button>
      <button onClick={reshuffle} className={`wg-tap ${BTN_QUIET}`}>
        <Svg size={18} stroke={2}>{ICON.shuffle}</Svg>
        Shuffle
      </button>
    </div>
  );

  const clue = (
    <span className={`font-extrabold tracking-tight text-center leading-tight px-4 ${short ? 'text-[28px]' : 'text-[34px] lg:text-[46px]'}`}>{word.entry.clue}</span>
  );

  return (
    <GameShell onExit={onExit}>
      <GameHeader title="Letter wheel" tone="amber" onExit={onExit} chip={`${idx + 1} / ${run.length}`} subtitle={title}
        right={
          <button onClick={hint} disabled={word.status !== 'play'} aria-label="Show a letter"
            className={`h-10 px-3.5 rounded-full flex items-center gap-1.5 text-sm font-bold disabled:opacity-45 ${TONE.amber.soft}`}>
            <Svg size={18}>{ICON.bulb}</Svg>
            Hint
          </button>
        } />
      <div className="h-1.5 mx-4 lg:hidden rounded-full bg-[#EADFC8] dark:bg-gray-800 overflow-hidden flex-shrink-0">
        <div className="h-full bg-amber-600 transition-[width] duration-300" style={{ width: `${(idx / run.length) * 100}%` }} />
      </div>

      <div className="flex-1 min-h-0 flex">
        {short ? (
          <div className="flex-1 min-w-0 flex">
            <div className="w-1/2 flex flex-col items-center justify-center gap-4 px-4">
              {clue}
              {boxes}
              {controls}
            </div>
            <div ref={wheelArea} className="w-1/2 flex items-center justify-center p-2">{wheel}</div>
          </div>
        ) : (
          <div className="flex-1 min-w-0 flex flex-col items-center gap-4 lg:gap-5 pt-6 lg:pt-8 pb-5 px-4">
            {clue}
            {boxes}
            <div ref={wheelArea} className="flex-1 min-h-0 w-full flex items-center justify-center">{wheel}</div>
            {controls}
          </div>
        )}

        <aside className="hidden lg:flex flex-col gap-1 w-[340px] flex-shrink-0 overflow-y-auto border-l border-[#EADFCB] dark:border-gray-800 px-[22px] py-[26px]">
          <p className={`ml-2.5 mb-2 text-xs font-extrabold uppercase tracking-[0.14em] ${MUTED}`}>Words</p>
          {run.map((e, i) => {
            const done = i < idx || (i === idx && word.status === 'right');
            const on = i === idx && !done;
            return (
              <div key={e.id} className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[15px] ${on ? 'bg-amber-200 dark:bg-amber-900/60 font-bold' : done ? 'text-teal-800 dark:text-teal-300 font-medium' : `${MUTED} font-medium`}`}>
                <span className="w-[22px] flex-shrink-0 font-extrabold text-[#6B635C] dark:text-slate-400 tabular-nums">{i + 1}</span>
                <span className="flex-1 min-w-0 truncate">{e.clue}</span>
                {done && <Written text={e.written} arabic={arabic} className="flex-shrink-0 text-lg font-bold leading-[1.4]" />}
              </div>
            );
          })}
        </aside>
      </div>
    </GameShell>
  );
};

export default LetterWheelGame;
