// ─────────────────────────────────────────────────────────────────────────────
// LetterMatchChallenge — match each isolated letter to its beginning / middle /
// end shape.
//
//   LetterMatchSetup  tutor, inside the Alphabet tab: timer + lives, create the
//                     link / QR, then watch live (or play on this device).
//   LetterMatchPage   the link, /letter-match/:id. The student plays; the tutor
//                     opening the same link (signed in) watches instead.
//
// The letters come in groups of 10: isolated forms on one side, the chosen
// shape on the other, both shuffled. Tap (or drag) one tile, then its partner.
// A wrong pair costs a life and counts against the ISOLATED letter; the tally
// feeds the red numbers on the alphabet table for that shape only.
//
// The student's device is the only authority. It broadcasts a snapshot of the
// board on `letter-match:<id>` after every move (plus a heartbeat), and anyone
// watching renders that snapshot read-only. The result is saved to the row.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../lib/supabase';
import { createGameChannel, P2PGameChannel } from '../services/p2pGameChannel';
import {
  EndReason, LetterMatchChallenge, LetterMatchResult, MatchForm,
  completeLetterMatch, createLetterMatch, getLetterMatch, letterMatchChannel,
  letterMatchUrl, markLetterMatchStarted,
} from '../services/letterMatchService';

export const GROUP_SIZE = 10;
const NON_CONNECTORS = new Set(['ا', 'و', 'ر', 'ز', 'د', 'ذ']);
export const FORM_LABEL: Record<MatchForm, { en: string; ar: string }> = {
  initial: { en: 'Beginning', ar: 'أَوَّل' },
  medial:  { en: 'Middle',    ar: 'وَسَط' },
  final:   { en: 'End',       ar: 'آخِر' },
};
const LETTER_FONT = "'Hafs', 'Amiri', serif";

/** A letter drawn in a positional shape (ZWJ/ZWNJ), non-connectors kept honest:
 *  they have no joined-on-the-left shape, so beginning = isolated, middle = end. */
export const shapeOf = (letter: string, form: MatchForm | 'isolated'): string => {
  let f = form;
  if (NON_CONNECTORS.has(letter)) { if (f === 'initial') f = 'isolated'; if (f === 'medial') f = 'final'; }
  switch (f) {
    case 'initial': return `${letter}‍`;
    case 'medial':  return `‍${letter}‍`;
    case 'final':   return `‍${letter}`;
    default:        return `‌${letter}‌`;
  }
};

const shuffle = <T,>(a: T[]): T[] => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

/** Groups of 10 — the last one takes whatever is left. */
export const groupLetters = (letters: string[]): string[][] => {
  const g: string[][] = [];
  for (let i = 0; i < letters.length; i += GROUP_SIZE) g.push(letters.slice(i, i + GROUP_SIZE));
  return g;
};

const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ── Snapshot: everything a watcher needs to draw the board ──────────────────

export interface MatchSnap {
  ph: 'playing' | 'between' | 'over';
  form: MatchForm;
  groups: string[][];
  gi: number;
  iso: string[];               // current group, isolated column order
  shp: string[];               // current group, shape column order
  matched: string[];           // matched letters of the current group
  sel: { side: 'iso' | 'shp'; letter: string } | null;
  wrong: { iso: string; shp: string; n: number } | null;
  lives: number | null;
  livesMax: number | null;
  timeLeftMs: number | null;
  correct: number;
  mistakes: number;
  wrongLetters: Record<string, number>;
  result?: LetterMatchResult;
}

// ── Board (pure) ────────────────────────────────────────────────────────────

const Board: React.FC<{
  snap: MatchSnap;
  onPick?: (side: 'iso' | 'shp', letter: string) => void;
}> = ({ snap, onPick }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const interactive = !!onPick && snap.ph === 'playing';

  // Lines between matched pairs — drawn imperatively from measured tiles.
  useLayoutEffect(() => {
    const box = boxRef.current, svg = svgRef.current;
    if (!box || !svg) return;
    const draw = () => {
      const b = box.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
      const lines = snap.matched.map(l => {
        const a = box.querySelector<HTMLElement>(`[data-side="iso"][data-letter="${l}"]`);
        const c = box.querySelector<HTMLElement>(`[data-side="shp"][data-letter="${l}"]`);
        if (!a || !c) return '';
        const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
        // isolated column sits on the RIGHT (RTL), shapes on the left
        const x1 = ra.left - b.left, y1 = ra.top + ra.height / 2 - b.top;
        const x2 = rc.right - b.left, y2 = rc.top + rc.height / 2 - b.top;
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#10b981" stroke-width="4" stroke-linecap="round" />`
          + `<circle cx="${x1}" cy="${y1}" r="5" fill="#10b981"/><circle cx="${x2}" cy="${y2}" r="5" fill="#10b981"/>`;
      });
      svg.innerHTML = lines.join('');
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [snap.matched, snap.iso, snap.shp, snap.gi]);

  // Drag support: press on one tile, release over a tile of the OTHER column.
  // A plain tap presses and releases on the same tile, which the press already
  // handled — so only a release on a different tile counts.
  const downRef = useRef<{ side: 'iso' | 'shp'; letter: string } | null>(null);
  const onPointerUp = (e: React.PointerEvent) => {
    const down = downRef.current;
    downRef.current = null;
    if (!interactive || !down) return;
    const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-side]');
    if (!el) return;
    const side = el.dataset.side as 'iso' | 'shp';
    if (side !== down.side) onPick!(side, el.dataset.letter!);
  };

  const tile = (side: 'iso' | 'shp', letter: string) => {
    const done = snap.matched.includes(letter);
    const selected = snap.sel?.side === side && snap.sel.letter === letter;
    const wrong = !!snap.wrong && (side === 'iso' ? snap.wrong.iso === letter : snap.wrong.shp === letter);
    return (
      <button
        key={`${side}-${letter}-${wrong ? snap.wrong!.n : 0}`}
        data-side={side} data-letter={letter}
        disabled={!interactive || done}
        onPointerDown={() => {
          if (!interactive || done) return;
          downRef.current = { side, letter };
          onPick!(side, letter);
        }}
        className={`relative w-full h-12 sm:h-14 rounded-2xl border-2 flex items-center justify-center select-none touch-none transition-colors duration-150 ${
          done ? 'bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-600 dark:text-emerald-200'
          : wrong ? 'bg-red-100 border-red-500 text-red-700 dark:bg-red-900/40 dark:text-red-200 lm-shake'
          : selected ? 'bg-sky-100 border-sky-500 text-sky-800 ring-4 ring-sky-300/60 dark:bg-sky-900/40 dark:text-sky-100'
          : 'bg-white border-slate-200 text-slate-800 dark:bg-gray-800 dark:border-gray-600 dark:text-slate-100'
        } ${interactive && !done ? 'cursor-pointer hover:border-sky-400 active:scale-95' : ''}`}
      >
        <span dir="rtl" style={{ fontFamily: LETTER_FONT, fontSize: 'clamp(1.8rem, 7vw, 2.6rem)', lineHeight: 1 }}>
          {side === 'iso' ? shapeOf(letter, 'isolated') : shapeOf(letter, snap.form)}
        </span>
      </button>
    );
  };

  return (
    <div ref={boxRef} className="relative grid grid-cols-[1fr_minmax(2.5rem,1fr)_1fr] gap-x-1 w-full max-w-md mx-auto" onPointerUp={onPointerUp}>
      <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />
      {/* Left: the chosen shape */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        <p className="text-center text-[11px] font-black uppercase tracking-wide text-slate-400">{FORM_LABEL[snap.form].en}</p>
        {snap.shp.map(l => tile('shp', l))}
      </div>
      <div />
      {/* Right: isolated */}
      <div className="flex flex-col gap-1.5 sm:gap-2">
        <p className="text-center text-[11px] font-black uppercase tracking-wide text-slate-400">Isolated</p>
        {snap.iso.map(l => tile('iso', l))}
      </div>
    </div>
  );
};

const ShakeStyle: React.FC = () => (
  <style>{`@keyframes lm-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(5px)}}.lm-shake{animation:lm-shake .4s ease}`}</style>
);

const StatusBar: React.FC<{ snap: MatchSnap; timeLeftMs: number | null }> = ({ snap, timeLeftMs }) => {
  const total = snap.groups.reduce((n, g) => n + g.length, 0);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4 text-sm font-bold">
      <span className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-200">
        Group {snap.gi + 1} / {snap.groups.length}
      </span>
      <span className="px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
        ✓ {snap.correct} / {total}
      </span>
      {snap.livesMax !== null && snap.lives !== null ? (
        <span className="px-3 py-1.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300" title="Lives">
          {snap.livesMax <= 10 ? '❤️'.repeat(snap.lives) + '🤍'.repeat(Math.max(0, snap.livesMax - snap.lives)) : `❤️ ${snap.lives}`}
        </span>
      ) : (
        <span className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-300">✗ {snap.mistakes}</span>
      )}
      {timeLeftMs !== null && (
        <span className={`px-3 py-1.5 rounded-full tabular-nums ${timeLeftMs <= 15_000 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>
          ⏱ {fmtClock(timeLeftMs)}
        </span>
      )}
    </div>
  );
};

// ── Results ────────────────────────────────────────────────────────────────

export const MatchResults: React.FC<{
  letters: string[]; form: MatchForm; result: LetterMatchResult; studentName?: string;
}> = ({ letters, form, result, studentName }) => {
  const total = letters.length;
  const wrong = Object.entries(result.wrongLetters).sort((a, b) => b[1] - a[1]);
  const headline = result.endedReason === 'time' ? "⏱ Time's up" : result.endedReason === 'lives' ? '💔 Out of lives' : '🎉 All matched!';
  return (
    <div className="max-w-lg mx-auto text-center space-y-4">
      <div>
        <p className="text-2xl font-black text-slate-800 dark:text-slate-100">{headline}</p>
        {studentName && <p className="text-sm text-slate-500 dark:text-slate-400">{studentName} · {FORM_LABEL[form].en} shapes</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 py-3">
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{result.correct}/{total}</div>
          <div className="text-[11px] font-bold uppercase text-emerald-600/80">matched</div>
        </div>
        <div className="rounded-2xl bg-red-50 dark:bg-red-900/30 py-3">
          <div className="text-2xl font-black text-red-600 dark:text-red-300">{result.mistakes}</div>
          <div className="text-[11px] font-bold uppercase text-red-500/80">mistakes</div>
        </div>
        <div className="rounded-2xl bg-slate-100 dark:bg-gray-700 py-3">
          <div className="text-2xl font-black text-slate-700 dark:text-slate-200 tabular-nums">{fmtClock(result.durationMs)}</div>
          <div className="text-[11px] font-bold uppercase text-slate-500">time</div>
        </div>
      </div>
      {wrong.length > 0 && (
        <div className="rounded-2xl border border-red-200 dark:border-red-800 p-3">
          <p className="text-xs font-bold uppercase text-red-500 mb-2">Matched wrong</p>
          <div className="flex flex-wrap justify-center gap-2" dir="rtl">
            {wrong.map(([l, n]) => (
              <span key={l} className="relative inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200">
                <span style={{ fontFamily: LETTER_FONT, fontSize: '1.8rem', lineHeight: 1.2 }}>{shapeOf(l, 'isolated')}</span>
                <span style={{ fontFamily: LETTER_FONT, fontSize: '1.8rem', lineHeight: 1.2 }}>{shapeOf(l, form)}</span>
                <span className="min-w-[1.4rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-black leading-5">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {result.unmatched.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-gray-700 p-3">
          <p className="text-xs font-bold uppercase text-slate-400 mb-2">Not reached</p>
          <p dir="rtl" style={{ fontFamily: LETTER_FONT, fontSize: '1.6rem' }} className="text-slate-600 dark:text-slate-300">
            {result.unmatched.map(l => shapeOf(l, 'isolated')).join(' ')}
          </p>
        </div>
      )}
    </div>
  );
};

const resultOfRow = (c: LetterMatchChallenge): LetterMatchResult | null =>
  c.status !== 'completed' ? null : {
    correct: c.correct ?? 0, mistakes: c.mistakes ?? 0, wrongLetters: c.wrongLetters ?? {},
    unmatched: c.unmatched ?? [], endedReason: c.endedReason ?? 'done', durationMs: c.durationMs ?? 0,
  };

// ── Player: the game itself (runs on the student's device) ──────────────────

const Player: React.FC<{
  challenge: LetterMatchChallenge;
  onDone: (result: LetterMatchResult) => void;
}> = ({ challenge, onDone }) => {
  const livesMax = challenge.lives;
  const startRef = useRef(Date.now());
  const deadline = useRef(challenge.timerSeconds ? Date.now() + challenge.timerSeconds * 1000 : null);
  const [snap, setSnap] = useState<MatchSnap>(() => {
    const groups = groupLetters(shuffle(challenge.letters));
    return {
      ph: 'playing', form: challenge.form, groups, gi: 0,
      iso: shuffle(groups[0]), shp: shuffle(groups[0]), matched: [], sel: null, wrong: null,
      lives: livesMax, livesMax, timeLeftMs: challenge.timerSeconds ? challenge.timerSeconds * 1000 : null,
      correct: 0, mistakes: 0, wrongLetters: {},
    };
  });
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const chanRef = useRef<P2PGameChannel | null>(null);
  const [, force] = useState(0);

  const broadcast = useCallback((s: MatchSnap) => {
    const left = deadline.current ? Math.max(0, deadline.current - Date.now()) : null;
    chanRef.current?.send({ type: 'broadcast', event: 'sync', payload: { ...s, timeLeftMs: left } });
  }, []);

  useEffect(() => {
    const ch = createGameChannel(letterMatchChannel(challenge.id), 'host');
    ch.on('broadcast', { event: 'hello' }, () => broadcast(snapRef.current));
    ch.subscribe();
    chanRef.current = ch;
    const hb = window.setInterval(() => broadcast(snapRef.current), 1500);
    return () => { window.clearInterval(hb); ch.unsubscribe(); chanRef.current = null; };
  }, [challenge.id, broadcast]);

  const commit = (s: MatchSnap) => { snapRef.current = s; setSnap(s); broadcast(s); };

  const finish = useCallback((s: MatchSnap, reason: EndReason) => {
    if (s.ph === 'over') return;
    const matchedEarlier = s.groups.slice(0, s.gi).flat();
    const matchedAll = new Set([...matchedEarlier, ...s.matched]);
    const unmatched = s.groups.flat().filter(l => !matchedAll.has(l));
    const result: LetterMatchResult = {
      correct: matchedAll.size, mistakes: s.mistakes, wrongLetters: s.wrongLetters,
      unmatched, endedReason: reason, durationMs: Date.now() - startRef.current,
    };
    const over: MatchSnap = { ...s, ph: 'over', sel: null, result };
    commit(over);
    onDone(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  // Clock
  useEffect(() => {
    if (!deadline.current) return;
    const iv = window.setInterval(() => {
      const s = snapRef.current;
      if (s.ph === 'over') { window.clearInterval(iv); return; }
      force(n => n + 1);
      if (Date.now() >= deadline.current!) { window.clearInterval(iv); finish(s, 'time'); }
    }, 250);
    return () => window.clearInterval(iv);
  }, [finish]);

  const pick = (side: 'iso' | 'shp', letter: string) => {
    const s = snapRef.current;
    if (s.ph !== 'playing' || s.matched.includes(letter)) return;
    if (!s.sel || s.sel.side === side) {
      const same = s.sel?.side === side && s.sel.letter === letter;
      commit({ ...s, sel: same ? null : { side, letter }, wrong: null });
      return;
    }
    const isoL = side === 'iso' ? letter : s.sel.letter;
    const shpL = side === 'shp' ? letter : s.sel.letter;
    if (isoL === shpL) {
      const matched = [...s.matched, isoL];
      const next: MatchSnap = { ...s, matched, sel: null, wrong: null, correct: s.correct + 1 };
      if (matched.length < s.iso.length) { commit(next); return; }
      if (s.gi + 1 >= s.groups.length) { commit(next); finish(next, 'done'); return; }
      commit({ ...next, ph: 'between' });
      window.setTimeout(() => {
        const cur = snapRef.current;
        if (cur.ph !== 'between') return;
        const g = cur.groups[cur.gi + 1];
        commit({ ...cur, ph: 'playing', gi: cur.gi + 1, iso: shuffle(g), shp: shuffle(g), matched: [] });
      }, 900);
      return;
    }
    // Wrong: counts against the isolated letter the student was matching.
    const lives = s.lives === null ? null : s.lives - 1;
    try { navigator.vibrate?.(120); } catch { /* unsupported */ }
    const next: MatchSnap = {
      ...s, sel: null, lives, mistakes: s.mistakes + 1,
      wrong: { iso: isoL, shp: shpL, n: (s.wrong?.n ?? 0) + 1 },
      wrongLetters: { ...s.wrongLetters, [isoL]: (s.wrongLetters[isoL] ?? 0) + 1 },
    };
    commit(next);
    if (lives !== null && lives <= 0) finish(next, 'lives');
  };

  const timeLeft = deadline.current ? Math.max(0, deadline.current - Date.now()) : null;
  return (
    <div>
      <ShakeStyle />
      <StatusBar snap={snap} timeLeftMs={timeLeft} />
      {snap.ph === 'between' && (
        <p className="text-center text-emerald-600 font-black mb-2 animate-pulse">✓ Group done — next group…</p>
      )}
      <Board snap={snap} onPick={pick} />
    </div>
  );
};

// ── Watch: live mirror for the tutor ────────────────────────────────────────

export const LetterMatchWatch: React.FC<{
  challenge: LetterMatchChallenge;
  onCompleted?: (c: LetterMatchChallenge) => void;
}> = ({ challenge, onCompleted }) => {
  const [snap, setSnap] = useState<MatchSnap | null>(null);
  const [row, setRow] = useState(challenge);
  const receivedAt = useRef(0);
  const [, tick] = useState(0);
  const completedFired = useRef(false);

  useEffect(() => {
    const ch = createGameChannel(letterMatchChannel(challenge.id), 'guest');
    ch.on('broadcast', { event: 'sync' }, ({ payload }: { payload: MatchSnap }) => {
      receivedAt.current = Date.now();
      setSnap(payload);
    });
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'hello', payload: {} });
    });
    const iv = window.setInterval(() => tick(n => n + 1), 500);
    return () => { window.clearInterval(iv); ch.unsubscribe(); };
  }, [challenge.id]);

  // The saved row is the source of truth for the result — poll until it lands.
  useEffect(() => {
    if (row.status === 'completed') return;
    const iv = window.setInterval(async () => {
      const fresh = await getLetterMatch(challenge.id);
      if (fresh) setRow(fresh);
    }, snap?.ph === 'over' ? 1500 : 5000);
    return () => window.clearInterval(iv);
  }, [challenge.id, row.status, snap?.ph]);

  useEffect(() => {
    if (row.status === 'completed' && !completedFired.current) {
      completedFired.current = true;
      onCompleted?.(row);
    }
  }, [row, onCompleted]);

  const saved = resultOfRow(row);
  if (saved) return <MatchResults letters={row.letters} form={row.form} result={saved} studentName={row.studentName} />;
  if (snap?.ph === 'over' && snap.result) {
    return <MatchResults letters={row.letters} form={row.form} result={snap.result} studentName={row.studentName} />;
  }
  if (!snap) {
    return (
      <div className="text-center py-10">
        <p className="text-4xl mb-2 animate-pulse">👀</p>
        <p className="font-bold text-slate-600 dark:text-slate-300">Waiting for {row.studentName ?? 'your student'} to start…</p>
        <p className="text-xs text-slate-400 mt-1">The board appears here as soon as they begin.</p>
      </div>
    );
  }
  const stale = Date.now() - receivedAt.current > 6000;
  const left = snap.timeLeftMs === null ? null : Math.max(0, snap.timeLeftMs - (Date.now() - receivedAt.current));
  return (
    <div>
      <ShakeStyle />
      <p className={`text-center text-xs font-bold mb-2 ${stale ? 'text-amber-600' : 'text-emerald-600'}`}>
        {stale ? '⚠ Connection quiet — the student may have left the page' : `● Live — ${row.studentName ?? 'student'} is playing`}
      </p>
      <StatusBar snap={snap} timeLeftMs={left} />
      <Board snap={snap} />
    </div>
  );
};

// ── Tutor setup (inside the Alphabet tab) ───────────────────────────────────

const TIMER_OPTIONS: Array<{ label: string; s: number | null }> = [
  { label: 'No timer', s: null }, { label: '30s', s: 30 }, { label: '1 min', s: 60 },
  { label: '2 min', s: 120 }, { label: '3 min', s: 180 }, { label: '5 min', s: 300 },
];
const LIVES_OPTIONS: Array<{ label: string; n: number | null }> = [
  { label: 'Unlimited', n: null }, { label: '1', n: 1 }, { label: '3', n: 3 }, { label: '5', n: 5 }, { label: '10', n: 10 },
];

export const LetterMatchSetup: React.FC<{
  letters: string[];
  initialForm: MatchForm | 'isolated';
  student: { id: string; name: string } | null;
  onExit: () => void;
  onCompleted?: (c: LetterMatchChallenge) => void;
}> = ({ letters, initialForm, student, onExit, onCompleted }) => {
  const [form, setForm] = useState<MatchForm | null>(initialForm === 'isolated' ? null : initialForm);
  const [timer, setTimer] = useState<number | null>(120);
  const [customTimer, setCustomTimer] = useState('');
  const [lives, setLives] = useState<number | null>(3);
  const [customLives, setCustomLives] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [challenge, setChallenge] = useState<LetterMatchChallenge | null>(null);
  const [mode, setMode] = useState<'watch' | 'play'>('watch');
  const [playResult, setPlayResult] = useState<LetterMatchResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const groups = useMemo(() => groupLetters(letters), [letters]);

  const create = async () => {
    setErr('');
    if (!student) { setErr('Choose which student this is for first.'); return; }
    if (!form) { setErr('Pick the shape to match against.'); return; }
    const t = customTimer.trim() ? Math.round(parseFloat(customTimer) * 60) : timer;
    const l = customLives.trim() ? parseInt(customLives, 10) : lives;
    if (t !== null && (!Number.isFinite(t) || t < 10)) { setErr('The timer must be at least 10 seconds.'); return; }
    if (l !== null && (!Number.isFinite(l) || l < 1)) { setErr('Lives must be 1 or more.'); return; }
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    const teacherId = data.user?.id;
    if (!teacherId) { setBusy(false); setErr('Sign in again to create a challenge.'); return; }
    const c = await createLetterMatch({
      teacherId, studentId: student.id, studentName: student.name,
      letters, form, timerSeconds: t, lives: l,
    });
    setBusy(false);
    if (!c) { setErr('Could not create the challenge — check your connection.'); return; }
    setChallenge(c);
  };

  const link = challenge ? letterMatchUrl(challenge.id) : '';
  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition-colors ${
    on ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-sky-400'}`;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-12">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onExit}
          className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400">
          ← Letters
        </button>
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100">🔗 Letter Shapes Match</h3>
      </div>

      {!challenge ? (
        <div className="space-y-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The student matches each isolated letter to its shape — {letters.length} letter{letters.length === 1 ? '' : 's'} in {groups.length} group{groups.length === 1 ? '' : 's'} of up to {GROUP_SIZE}.
            A wrong match costs a life and shows in red on the alphabet table when that shape is selected.
          </p>
          <p dir="rtl" className="text-3xl text-sky-700 dark:text-sky-300 text-center" style={{ fontFamily: LETTER_FONT }}>
            {letters.map(l => shapeOf(l, 'isolated')).join(' ')}
          </p>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Match to</p>
            <div className="flex flex-wrap gap-2">
              {(['initial', 'medial', 'final'] as MatchForm[]).map(f => (
                <button key={f} onClick={() => setForm(f)} className={chip(form === f)}>
                  <span style={{ fontFamily: LETTER_FONT }} className="me-1.5 text-lg">{shapeOf('ب', f)}</span>{FORM_LABEL[f].en}
                </button>
              ))}
            </div>
            {!form && <p className="text-xs text-amber-600 mt-1.5">The table is on Isolated — pick the shape to match against.</p>}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Timer</p>
            <div className="flex flex-wrap items-center gap-2">
              {TIMER_OPTIONS.map(o => (
                <button key={o.label} onClick={() => { setTimer(o.s); setCustomTimer(''); }} className={chip(!customTimer && timer === o.s)}>{o.label}</button>
              ))}
              <label className="flex items-center gap-1.5 text-sm text-slate-500">
                <input value={customTimer} onChange={e => setCustomTimer(e.target.value)} inputMode="decimal" placeholder="min"
                  className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center" />
                minutes
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Lives (mistakes allowed)</p>
            <div className="flex flex-wrap items-center gap-2">
              {LIVES_OPTIONS.map(o => (
                <button key={o.label} onClick={() => { setLives(o.n); setCustomLives(''); }} className={chip(!customLives && lives === o.n)}>
                  {o.n === null ? o.label : `❤️ ${o.label}`}
                </button>
              ))}
              <input value={customLives} onChange={e => setCustomLives(e.target.value)} inputMode="numeric" placeholder="other"
                className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-center text-sm" />
            </div>
          </div>

          {!student && <p className="text-sm text-amber-600">Open a student (or pick one in “Log to”) — the results are saved to them.</p>}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={create} disabled={busy || !student || !form}
            className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-black disabled:opacity-40">
            {busy ? 'Creating…' : 'Create challenge link'}
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-gray-700 p-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
              Send this to {challenge.studentName} — open it yourself (signed in) to watch from another device
            </p>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-[11px] font-mono truncate">{link}</div>
              <button onClick={copy} className={`px-3 py-2 rounded-lg text-xs font-black text-white ${copied ? 'bg-emerald-500' : 'bg-sky-600'}`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button onClick={() => setQrOpen(true)} className="bg-white p-2 rounded-xl" title="Enlarge">
                <QRCodeSVG value={link} size={110} level="M" />
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p>{FORM_LABEL[challenge.form].en} shapes · {challenge.letters.length} letters</p>
                <p>{challenge.timerSeconds ? `⏱ ${fmtClock(challenge.timerSeconds * 1000)}` : 'No timer'} · {challenge.lives ? `❤️ ${challenge.lives}` : 'Unlimited lives'}</p>
                {mode === 'watch' && !playResult && (
                  <button onClick={() => setMode('play')} className="underline font-semibold text-sky-600">Student is here? Play on this device</button>
                )}
              </div>
            </div>
          </div>

          {mode === 'play' && !playResult ? (
            <Player challenge={challenge} onDone={async r => {
              setPlayResult(r);
              const done = await completeLetterMatch(challenge, r);
              if (done) onCompleted?.(done);
            }} />
          ) : playResult ? (
            <MatchResults letters={challenge.letters} form={challenge.form} result={playResult} studentName={challenge.studentName} />
          ) : (
            <LetterMatchWatch challenge={challenge} onCompleted={onCompleted} />
          )}
        </div>
      )}

      {qrOpen && link && (
        <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-6" onClick={() => setQrOpen(false)}>
          <div className="bg-white p-4 rounded-2xl" onClick={e => e.stopPropagation()}>
            <QRCodeSVG value={link} size={Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 90, 380)} level="M" />
          </div>
        </div>
      )}
    </div>
  );
};

// ── The link: /letter-match/:id ─────────────────────────────────────────────

export const LetterMatchPage: React.FC<{ challengeId: string }> = ({ challengeId }) => {
  const [challenge, setChallenge] = useState<LetterMatchChallenge | null | undefined>(undefined);
  const [isTutor, setIsTutor] = useState(false);
  const [stage, setStage] = useState<'intro' | 'playing' | 'done'>('intro');
  const [result, setResult] = useState<LetterMatchResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = 'Letter shapes challenge';
    (async () => {
      const [c, session] = await Promise.all([getLetterMatch(challengeId), supabase.auth.getSession()]);
      setChallenge(c);
      if (c && session.data.session?.user.id === c.teacherId) setIsTutor(true);
    })();
  }, [challengeId]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-gray-900 px-3 sm:px-4 py-5">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );

  if (challenge === undefined) return shell(<p className="text-center text-slate-400 py-20">Loading…</p>);
  if (!challenge) return shell(
    <div className="text-center py-20"><p className="text-5xl mb-3">🔗</p>
      <p className="font-black text-slate-700 dark:text-slate-200">Challenge not found</p>
      <p className="text-sm text-slate-500">Ask your teacher for a new link.</p></div>,
  );

  const header = (
    <div className="text-center mb-4">
      <p className="text-xs font-bold uppercase tracking-wide text-sky-600">🔗 Letter shapes</p>
      <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
        Isolated → {FORM_LABEL[challenge.form].en} <span style={{ fontFamily: LETTER_FONT }}>({FORM_LABEL[challenge.form].ar})</span>
      </h1>
    </div>
  );

  if (isTutor) return shell(<>{header}<LetterMatchWatch challenge={challenge} /></>);

  const saved = resultOfRow(challenge);
  if (stage !== 'playing' && (result || saved)) {
    return shell(<>{header}
      <MatchResults letters={challenge.letters} form={challenge.form} result={(result ?? saved)!} studentName={challenge.studentName} />
      <p className="text-center text-sm text-slate-500 mt-4">
        {saving ? 'Sending your result to your teacher…' : '✓ Your teacher has your result.'}
      </p>
    </>);
  }

  if (stage === 'intro') {
    return shell(<>{header}
      <div className="max-w-md mx-auto text-center space-y-5">
        {challenge.studentName && <p className="text-slate-500 dark:text-slate-400">Assalamu alaikum, {challenge.studentName}!</p>}
        <div className="flex justify-center gap-6 items-center" dir="rtl" style={{ fontFamily: LETTER_FONT }}>
          <span className="text-5xl text-slate-700 dark:text-slate-200">{shapeOf('ب', 'isolated')}</span>
          <span className="text-2xl text-emerald-500">⟵</span>
          <span className="text-5xl text-sky-600">{shapeOf('ب', challenge.form)}</span>
        </div>
        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
          Tap a letter on the <b>Isolated</b> side, then tap the same letter in its <b>{FORM_LABEL[challenge.form].en.toLowerCase()}</b> shape.
          You can also drag from one to the other.
        </p>
        <div className="grid grid-cols-3 gap-2 text-sm font-bold">
          <div className="rounded-xl bg-white dark:bg-gray-800 py-3 border border-slate-200 dark:border-gray-700">{challenge.letters.length} letters</div>
          <div className="rounded-xl bg-white dark:bg-gray-800 py-3 border border-slate-200 dark:border-gray-700">{challenge.timerSeconds ? `⏱ ${fmtClock(challenge.timerSeconds * 1000)}` : 'No timer'}</div>
          <div className="rounded-xl bg-white dark:bg-gray-800 py-3 border border-slate-200 dark:border-gray-700">{challenge.lives ? `❤️ ${challenge.lives}` : 'Unlimited lives'}</div>
        </div>
        <button onClick={() => { markLetterMatchStarted(challenge.id); setStage('playing'); }}
          className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-lg font-black">Start ▶</button>
      </div>
    </>);
  }

  return shell(<>{header}
    <Player challenge={challenge} onDone={async r => {
      setResult(r);
      setSaving(true);
      window.setTimeout(() => setStage('done'), 1200);
      await completeLetterMatch(challenge, r);
      setSaving(false);
    }} />
  </>);
};
