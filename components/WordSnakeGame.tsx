// components/WordSnakeGame.tsx
// -----------------------------------------------------------------------------
// Word snake — for the children. The English word is shown; the word's letters
// (and a look-alike or two) lie on the board. The snake eats them IN ORDER and
// its body is the word itself, written joined, growing letter by letter.
//
// Gentle rules (the tutor's choice): slow and steady, the walls wrap round to
// the other side, the snake can cross its own body. Only a wrong letter costs
// a heart; three hearts a word, and out of hearts starts the same word again.
//
//   phone / tablet    swipe anywhere on the board, no buttons
//   computer          arrow keys (or WASD); space pauses
//
// Arabic heads LEFT and transliteration RIGHT, so the body always reads the way
// the word is written: first letter at the tail, newest just behind the head.
// Practice only — nothing is saved. Look: Claude Design canvas "Arabic Word Games".
// -----------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CrosswordEntry, CrosswordMode, CrosswordSource, crosswordEntries, formAt, shapeLetter } from '../utils/crossword';
import { decoyLetters, pickRun } from '../utils/wordGames';
import {
  ARABIC_FONT, BTN_PRIMARY, DoneScreen, GameHeader, GameShell, ICON, MUTED, PickScreen, SHORT_LANDSCAPE, Svg, TONE,
  fmtTime, useBoxSize, useMedia,
  capturePointer,
} from './WordGameKit';

interface Props {
  words: CrosswordSource[];
  title?: string;
  onExit: () => void;
}

const RUN = 6;
const TICK = 280;
const HEARTS = 3;
const SWIPE_STEP = 22;

type Dir = 'up' | 'down' | 'left' | 'right';
type RC = [number, number];
const DELTA: Record<Dir, RC> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

interface Food { id: number; ch: string; r: number; c: number; back: number /* tick it returns on; 0 = on the board */ }
interface Game {
  entry: CrosswordEntry;
  cols: number;
  rows: number;
  /** Tail → head; the last cell is the head. body[i] (i < eaten) holds letter i. */
  body: RC[];
  prev: RC[];
  dir: Dir;
  queue: Dir[];
  eaten: number;
  food: Food[];
  hearts: number;
  status: 'ready' | 'run' | 'paused' | 'won' | 'lost';
  hurt: number;
  t: number;
}

const rand = (n: number) => Math.floor(Math.random() * n);

function freeCell(g: Pick<Game, 'cols' | 'rows' | 'body' | 'food'>, avoidFood: Food | null, avoidRow = -1): RC {
  const head = g.body[g.body.length - 1];
  for (let tries = 0; tries < 400; tries++) {
    const r = rand(g.rows), c = rand(g.cols);
    if (r === avoidRow) continue;
    if (g.body.some(([br, bc]) => br === r && bc === c)) continue;
    if (g.food.some(f => f !== avoidFood && f.r === r && f.c === c)) continue;
    if (Math.abs(head[0] - r) + Math.abs(head[1] - c) < 3) continue;
    return [r, c];
  }
  return [rand(g.rows), rand(g.cols)];
}

function newGame(entry: CrosswordEntry, mode: CrosswordMode, cols: number, rows: number): Game {
  const arabic = mode === 'arabic';
  const head: RC = [Math.floor(rows / 2), arabic ? cols - 3 : 2];
  const g: Game = {
    entry, cols, rows, body: [head], prev: [head], dir: arabic ? 'left' : 'right', queue: [],
    eaten: 0, food: [], hearts: HEARTS, status: 'ready', hurt: 0, t: 0,
  };
  const letters = [...entry.answer, ...decoyLetters(entry.answer, mode, entry.answer.length <= 6 ? 2 : 1)];
  letters.forEach((ch, id) => {
    // Nothing on the snake's own row at the start: the first turn is the student's.
    const [r, c] = freeCell(g, null, head[0]);
    g.food.push({ id, ch, r, c, back: 0 });
  });
  return g;
}

function step(g: Game): Game {
  if (g.status !== 'run') return g;
  let dir = g.dir;
  const queue = [...g.queue];
  while (queue.length) {
    const d = queue.shift()!;
    if (d !== dir && d !== OPPOSITE[dir]) { dir = d; break; }
  }
  const t = g.t + 1;
  const head = g.body[g.body.length - 1];
  const [dr, dc] = DELTA[dir];
  const next: RC = [(head[0] + dr + g.rows) % g.rows, (head[1] + dc + g.cols) % g.cols];
  // Letters eaten wrongly come back a little later, somewhere else.
  let food = g.food.map(f => {
    if (!f.back || f.back > t) return f;
    const [r, c] = freeCell(g, f);
    return { ...f, r, c, back: 0 };
  });
  const hit = food.find(f => !f.back && f.r === next[0] && f.c === next[1]);
  let { eaten, hearts, hurt } = g;
  let status: Game['status'] = g.status;
  let body: RC[];
  if (hit && hit.ch === g.entry.answer[eaten]) {
    eaten += 1;
    body = [...g.body, next];                       // grows: the tail stays
    food = food.filter(f => f !== hit);
    if (eaten === g.entry.answer.length) status = 'won';
  } else {
    body = [...g.body.slice(1), next];
    if (hit) {
      hearts -= 1; hurt += 1;
      food = food.map(f => (f === hit ? { ...f, back: t + 5 } : f));
      if (hearts <= 0) status = 'lost';
    }
  }
  return { ...g, dir, queue, t, body, prev: g.body, eaten, food, hearts, hurt, status };
}

const MOTIF = (
  <div className="flex items-center" dir="ltr">
    <span className="w-11 h-11 rounded-full bg-white dark:bg-gray-700 border-2 border-[#E5DAC3] dark:border-gray-600 flex items-center justify-center text-xl font-bold mr-4" style={{ fontFamily: ARABIC_FONT }}>م</span>
    <span className="relative w-11 h-11 rounded-l-full rounded-r-lg bg-green-800">
      <span className="absolute left-2 top-2 w-2 h-2 rounded-full bg-white" />
      <span className="absolute left-2 bottom-2 w-2 h-2 rounded-full bg-white" />
    </span>
    <span className="w-11 h-11 bg-green-700 text-white flex items-center justify-center text-2xl font-bold" style={{ fontFamily: ARABIC_FONT }}>{'‍ل‍'}</span>
    <span className="w-11 h-11 rounded-r-full bg-green-700 text-white flex items-center justify-center text-2xl font-bold" style={{ fontFamily: ARABIC_FONT }}>{'ق‍'}</span>
  </div>
);

const WordSnakeGame: React.FC<Props> = ({ words, title, onExit }) => {
  const [mode, setMode] = useState<CrosswordMode | null>(null);
  const [phase, setPhase] = useState<'pick' | 'play' | 'done'>('pick');
  const [run, setRun] = useState<CrosswordEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const [game, setGame] = useState<Game | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const dims = useRef<{ cols: number; rows: number } | null>(null);
  const played = useRef(new Set<string>());

  const counts = useMemo(() => ({
    arabic: crosswordEntries(words, 'arabic').length,
    translit: crosswordEntries(words, 'translit').length,
  }), [words]);
  const arabic = mode === 'arabic';
  const short = useMedia(SHORT_LANDSCAPE);
  const touch = useMedia('(pointer: coarse)');

  const begin = (m: CrosswordMode) => {
    const all = crosswordEntries(words, m);
    // Short words suit a snake; long ones only when there are not enough.
    const easy = all.filter(e => e.answer.length <= 7);
    const r = pickRun(easy.length >= Math.min(RUN, all.length) ? easy : all, RUN, played.current);
    r.forEach(e => played.current.add(e.id));
    setMode(m); setRun(r); setIdx(0); setGame(null); dims.current = null;
    setMistakes(0); startedAt.current = Date.now(); setPhase(r.length ? 'play' : 'done');
  };

  // ── The board: its size is fixed for the game once the space is measured ──
  const area = useRef<HTMLDivElement>(null);
  const box = useBoxSize(area, [phase, short]);
  useEffect(() => {
    if (phase !== 'play' || game || !mode || box.w < 80 || box.h < 80 || !run[idx]) return;
    if (!dims.current) {
      const target = short ? 30 : box.w >= 900 ? 46 : 38;
      dims.current = {
        cols: Math.max(8, Math.min(20, Math.floor(box.w / target))),
        rows: Math.max(7, Math.min(16, Math.floor(box.h / target))),
      };
    }
    setGame(newGame(run[idx], mode, dims.current.cols, dims.current.rows));
  }, [phase, game, mode, box.w, box.h, run, idx, short]);

  // ── Clock ──
  const status = game?.status;
  useEffect(() => {
    if (status !== 'run') return;
    const t = window.setInterval(() => setGame(g => (g ? step(g) : g)), TICK);
    return () => window.clearInterval(t);
  }, [status]);

  // A wrong letter counts as a mistake once.
  const hurt = game?.hurt ?? 0;
  useEffect(() => { if (hurt) setMistakes(m => m + 1); }, [hurt]);

  // Word written → a moment to read it, then the next.
  useEffect(() => {
    if (status !== 'won' || !mode) return;
    const t = window.setTimeout(() => {
      if (idx + 1 < run.length) { setIdx(idx + 1); setGame(null); }
      else { setElapsed(Date.now() - startedAt.current); setPhase('done'); }
    }, 1700);
    return () => window.clearTimeout(t);
  }, [status, idx, run, mode]);

  // Pause when the page is hidden.
  useEffect(() => {
    const onHide = () => { if (document.hidden) setGame(g => (g && g.status === 'run' ? { ...g, status: 'paused' } : g)); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const steer = (d: Dir) => setGame(g => {
    if (!g || (g.status !== 'run' && g.status !== 'ready')) return g;
    const last = g.queue[g.queue.length - 1] ?? g.dir;
    const queue = d === last || g.queue.length >= 3 ? g.queue : [...g.queue, d];
    return { ...g, queue, status: 'run' };
  });
  const togglePause = () => setGame(g => (!g ? g : g.status === 'run' ? { ...g, status: 'paused' } : g.status === 'paused' ? { ...g, status: 'run' } : g));
  const retry = () => { if (mode && run[idx] && dims.current) setGame(newGame(run[idx], mode, dims.current.cols, dims.current.rows)); };

  // ── Keyboard ──
  useEffect(() => {
    if (phase !== 'play') return;
    const KEYS: Record<string, Dir> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
      const d = KEYS[e.key];
      if (d) { e.preventDefault(); steer(d); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  // ── Swipes: each stretch of a finger's path is a turn, no lifting needed ──
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    swipe.current = { x: e.clientX, y: e.clientY };
    capturePointer(e);
    setGame(g => (g && g.status === 'paused' ? { ...g, status: 'run' } : g));
  };
  const onMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_STEP) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => { swipe.current = null; };

  if (phase === 'pick' || !mode) {
    return <PickScreen title="Word snake" subtitle={title} motif={MOTIF} tone="green" counts={counts} min={1} onPick={begin} onExit={onExit} />;
  }

  if (phase === 'done') {
    return (
      <DoneScreen tone="green" onExit={onExit} onAgain={() => begin(mode)} arabic={arabic}
        headline="All done"
        stats={[[String(run.length), 'words'], [String(mistakes), mistakes === 1 ? 'wrong letter' : 'wrong letters'], [fmtTime(elapsed), 'time']]}
        words={run.map(e => ({ written: e.written, clue: e.clue }))} />
    );
  }

  const entry = run[idx];
  const answer = entry?.answer ?? [];
  const eaten = game?.eaten ?? 0;
  const seq = answer.map((ch, i) => (i < eaten ? ch : null));
  const face = (ch: string, i: number) => (arabic ? shapeLetter(ch, formAt(seq, i)) : ch);

  // ── Clue bar ──
  const boxW = short ? 34 : answer.length > 6 ? 40 : 48;
  const clueBar = entry && (
    <div className={`flex-shrink-0 flex items-center justify-center gap-4 px-4 ${short ? 'py-1' : 'py-2 lg:py-4'}`}>
      <span className={`font-extrabold tracking-tight ${short ? 'text-xl' : 'text-[26px] lg:text-[32px]'}`}>{entry.clue}</span>
      <div dir={arabic ? 'rtl' : 'ltr'} className="flex gap-1.5">
        {answer.map((ch, i) => {
          const has = i < eaten;
          return (
            <span key={i} className={`border-2 flex items-center justify-center font-bold leading-none ${has
              ? 'bg-green-100 border-green-700 text-stone-900 dark:bg-green-900/60 dark:text-green-50'
              : i === eaten ? 'bg-white dark:bg-gray-800 border-dashed border-green-700' : 'bg-white dark:bg-gray-800 border-dashed border-[#D6CBB5] dark:border-gray-600'} ${has && i === eaten - 1 ? 'wg-pop' : ''}`}
              style={{ width: boxW, height: Math.round(boxW * 1.12), borderRadius: Math.round(boxW * 0.24) }}>
              {has && <span dir={arabic ? 'rtl' : 'ltr'} style={arabic ? { fontFamily: ARABIC_FONT, fontSize: Math.round(boxW * 0.56), marginTop: 3 } : { fontSize: Math.round(boxW * 0.5) }}>{face(ch, i)}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );

  // ── Board ──
  const cols = game?.cols ?? 1, rows = game?.rows ?? 1;
  const cell = game ? Math.max(14, Math.floor(Math.min((box.w - 4) / cols, (box.h - 4) / rows))) : 0;
  const head = game?.body[game.body.length - 1];
  const moved = (i: number) => {
    const a = game?.prev[i], b = game?.body[i];
    return !!a && !!b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
  };
  const eyes: Record<Dir, Array<{ left: string; top: string }>> = {
    left: [{ left: '18%', top: '22%' }, { left: '18%', top: '58%' }],
    right: [{ left: '62%', top: '22%' }, { left: '62%', top: '58%' }],
    up: [{ left: '22%', top: '18%' }, { left: '58%', top: '18%' }],
    down: [{ left: '22%', top: '62%' }, { left: '58%', top: '62%' }],
  };

  const board = game && (
    <div key={`b${game.hurt}`}
      className={`relative overflow-hidden rounded-[18px] border-2 border-green-200 dark:border-green-900 [--sq-a:#EEF6E8] [--sq-b:#E4F0DC] dark:[--sq-a:#16211a] dark:[--sq-b:#1b281f] ${game.hurt ? 'wg-shake' : ''}`}
      style={{
        width: cell * cols + 4, height: cell * rows + 4,
        backgroundImage: 'repeating-conic-gradient(var(--sq-a) 0% 25%, var(--sq-b) 0% 50%)',
        backgroundSize: `${cell * 2}px ${cell * 2}px`,
      }}>
      {game.food.filter(f => !f.back).map(f => (
        <span key={f.id} className="absolute rounded-full bg-white dark:bg-gray-700 border-2 border-[#E5DAC3] dark:border-gray-500 flex items-center justify-center font-bold leading-none text-stone-900 dark:text-slate-100 wg-in"
          style={{ left: f.c * cell + 2, top: f.r * cell + 2, width: cell - 4, height: cell - 4, fontSize: Math.round(cell * (arabic ? 0.6 : 0.52)), fontFamily: arabic ? ARABIC_FONT : undefined, paddingTop: arabic ? Math.round(cell * 0.06) : 0 }}>
          {f.ch}
        </span>
      ))}
      {game.body.slice(0, -1).map(([r, c], i) => (
        <span key={i}
          className={`absolute flex items-center justify-center font-bold leading-none text-white ${game.status === 'won' ? 'bg-teal-700' : 'bg-green-700'}`}
          style={{
            left: c * cell, top: r * cell, width: cell, height: cell,
            borderRadius: i === 0 ? Math.round(cell * 0.45) : Math.round(cell * 0.18),
            transition: moved(i) ? `left ${TICK}ms linear, top ${TICK}ms linear` : 'none',
            fontSize: Math.round(cell * (arabic ? 0.68 : 0.56)), fontFamily: arabic ? ARABIC_FONT : undefined, paddingTop: arabic ? Math.round(cell * 0.08) : 0,
          }}>
          <span dir={arabic ? 'rtl' : 'ltr'}>{face(answer[i], i)}</span>
        </span>
      ))}
      {head && (
        <span key={`h${game.hurt}`}
          className={`absolute ${game.hurt && game.status !== 'won' ? 'animate-[wg-pop_.4s_ease-out]' : ''} ${game.status === 'won' ? 'bg-teal-800' : 'bg-green-800'}`}
          style={{
            left: head[1] * cell, top: head[0] * cell, width: cell, height: cell, borderRadius: Math.round(cell * 0.38),
            transition: moved(game.body.length - 1) ? `left ${TICK}ms linear, top ${TICK}ms linear` : 'none',
          }}>
          {eyes[game.dir].map((p, i) => (
            <span key={i} className="absolute rounded-full bg-white" style={{ ...p, width: Math.max(4, cell * 0.2), height: Math.max(4, cell * 0.2) }} />
          ))}
        </span>
      )}

      {/* ── What the board says between moves ── */}
      {game.status === 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="px-5 py-3 rounded-2xl bg-white/90 dark:bg-gray-900/90 shadow-lg flex items-center gap-2.5 text-base font-bold text-green-900 dark:text-green-200">
            {touch ? <Svg size={26} stroke={2}>{ICON.swipe}</Svg> : <span className="flex gap-1">{['←', '↑', '↓', '→'].map(k => <kbd key={k} className="h-7 min-w-7 px-1.5 rounded-md border border-[#D6CBB5] dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-sans flex items-center justify-center">{k}</kbd>)}</span>}
            {touch ? 'Swipe to start' : 'to start'}
          </span>
        </div>
      )}
      {game.status === 'paused' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 dark:bg-black/40">
          <button onClick={togglePause} aria-label="Resume" className="w-20 h-20 rounded-full bg-green-700 hover:bg-green-800 text-white flex items-center justify-center shadow-xl">
            <Svg size={36} fill="currentColor">{ICON.play}</Svg>
          </button>
        </div>
      )}
      {game.status === 'won' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="wg-pop px-7 py-3 rounded-3xl bg-white/95 dark:bg-gray-900/95 shadow-xl flex flex-col items-center">
            <span dir={arabic ? 'rtl' : 'ltr'} className="font-bold text-teal-800 dark:text-teal-300 leading-[1.5]"
              style={{ fontSize: Math.min(64, Math.max(34, cell * 1.3)), fontFamily: arabic ? ARABIC_FONT : undefined }}>{entry.written}</span>
            <span className={`text-base font-semibold ${MUTED}`}>{entry.clue}</span>
          </span>
        </div>
      )}
      {game.status === 'lost' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50">
          <div className="wg-in px-6 py-5 rounded-3xl bg-white dark:bg-gray-900 shadow-xl flex flex-col items-center gap-3">
            <span className="flex gap-1 text-stone-300 dark:text-gray-600">{[0, 1, 2].map(i => <Svg key={i} size={26} stroke={2}>{ICON.heart}</Svg>)}</span>
            <span className="text-lg font-extrabold">Out of hearts</span>
            <button onClick={retry} className={`${BTN_PRIMARY} ${TONE.green.primary} h-12 px-6`}>Try again</button>
          </div>
        </div>
      )}
    </div>
  );

  const hearts = game?.hearts ?? HEARTS;

  return (
    <GameShell onExit={onExit}>
      <GameHeader title="Word snake" tone="green" onExit={onExit} chip={`${idx + 1} / ${run.length}`} subtitle={title}
        right={
          <div className="flex items-center gap-2">
            <span role="img" aria-label={`${hearts} hearts left`} className="flex gap-0.5">
              {Array.from({ length: HEARTS }, (_, i) => (
                <Svg key={i} size={22} stroke={2} fill={i < hearts ? '#E11D48' : 'none'}
                  className={i < hearts ? '' : 'text-stone-300 dark:text-gray-600'}>{ICON.heart}</Svg>
              ))}
            </span>
            <button onClick={togglePause} aria-label={game?.status === 'paused' ? 'Resume' : 'Pause'} disabled={!game || (game.status !== 'run' && game.status !== 'paused')}
              className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40 ${TONE.green.soft}`}>
              <Svg size={18} fill="currentColor">{game?.status === 'paused' ? ICON.play : ICON.pause}</Svg>
            </button>
          </div>
        } />

      {clueBar}
      <div className="flex-1 min-h-0 flex flex-col touch-none"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div ref={area} className="flex-1 min-h-0 mx-3 mb-3 lg:mx-8 lg:mb-4 flex items-center justify-center">{board}</div>
        {!short && !touch && (
          <div className={`hidden lg:flex flex-shrink-0 items-center justify-center gap-1.5 pb-5 text-sm font-semibold ${MUTED}`}>
            {['←', '↑', '↓', '→'].map(k => (
              <kbd key={k} className="h-7 min-w-7 px-1.5 rounded-md border border-[#D6CBB5] dark:border-gray-600 bg-white dark:bg-gray-800 font-sans flex items-center justify-center">{k}</kbd>
            ))}
            <span className="ml-1.5">to turn · space to pause</span>
          </div>
        )}
      </div>
    </GameShell>
  );
};

export default WordSnakeGame;
