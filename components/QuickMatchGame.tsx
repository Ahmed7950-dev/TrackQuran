// components/QuickMatchGame.tsx
// -----------------------------------------------------------------------------
// Quick match — 60 seconds. A word (Arabic script or transliteration) and an
// English meaning come up together; the student says whether they match:
// the buttons, a swipe of the card (right = match, left = no), or the arrow
// keys. Right answers in a row raise the multiplier (×2 at three, ×3 at five…,
// up to ×5); a wrong one resets it and shows the real meaning for a moment.
//
// The best score is kept per student and mode (services/quickMatchService);
// nothing else is saved — it is practice.
// Look: Claude Design canvas "Arabic Word Games".
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CrosswordMode, CrosswordSource } from '../utils/crossword';
import { shuffle } from '../utils/wordGames';
import { getQuickMatchBest, saveQuickMatchScore } from '../services/quickMatchService';
import {
  ARABIC_FONT, CARD, DoneScreen, GameHeader, GameShell, ICON, MUTED, PickScreen, SHORT_LANDSCAPE, Svg, Written,
  useBoxSize, useMedia,
  capturePointer,
} from './WordGameKit';

interface Props {
  words: CrosswordSource[];
  title?: string;
  /** Whose best score this is; without one it stays on this device. */
  studentId?: string;
  onExit: () => void;
}

const DURATION = 60_000;
const POINTS = 10;
const SWIPE = 80;

interface Item { id: string; shown: string; meaning: string; key: string }
interface Card { item: Item; meaning: string; truth: boolean; n: number }
interface Answer { item: Item; truth: boolean; ok: boolean }

const HARAKAT = /[ً-ٰٟۖ-ۭـ]/g;
const meaningKey = (s: string) => s.trim().toLowerCase().replace(/^(to|a|an|the)\s+/, '').replace(/[^a-z0-9 ]/g, '');

function itemsFor(words: CrosswordSource[], mode: CrosswordMode): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const w of words) {
    const shown = (mode === 'arabic' ? w.arabic : w.transliteration ?? '').normalize('NFC').trim();
    const meaning = (w.english ?? '').trim();
    if (!shown || !meaning || seen.has(shown)) continue;
    seen.add(shown);
    out.push({ id: w.id, shown, meaning: meaning.charAt(0).toUpperCase() + meaning.slice(1), key: meaningKey(meaning) });
  }
  return out;
}

/** Enough to play: two words that mean different things. */
const playable = (items: Item[]) => new Set(items.map(i => i.key)).size >= 2;

/** ×1 for the first two in a row, ×2 at three, ×3 at five, … up to ×5. */
const multiplier = (streak: number) => Math.min(5, 1 + Math.floor(Math.max(0, streak - 1) / 2));

const MOTIF = (
  <div className="relative w-[150px] h-[130px]">
    <span className="absolute left-[18px] top-[14px] w-[104px] h-[112px] rounded-[20px] bg-[#EFE5D1] dark:bg-gray-800 rotate-[-8deg]" />
    <span className="absolute left-[24px] top-[6px] w-[106px] h-[116px] rounded-[20px] bg-white dark:bg-gray-700 border border-[#E5DAC3] dark:border-gray-600 shadow-[0_8px_20px_rgba(120,90,40,0.14)] rotate-[5deg] flex flex-col items-center justify-center gap-1">
      <span className="text-[30px] font-bold leading-[1.3]" style={{ fontFamily: ARABIC_FONT }}>بَيْت</span>
      <span className="text-sm font-semibold text-stone-600 dark:text-slate-300">house</span>
      <span className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-teal-700 text-white flex items-center justify-center"><Svg size={18} stroke={3}>{ICON.check}</Svg></span>
    </span>
  </div>
);

const QuickMatchGame: React.FC<Props> = ({ words, title, studentId, onExit }) => {
  const [mode, setMode] = useState<CrosswordMode | null>(null);
  const [phase, setPhase] = useState<'pick' | 'ready' | 'play' | 'done'>('pick');
  const [count, setCount] = useState(3);
  const [card, setCard] = useState<Card | null>(null);
  const [streak, setStreak] = useState(0);
  const [topStreak, setTopStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [log, setLog] = useState<Answer[]>([]);
  const [feedback, setFeedback] = useState<{ ok: boolean; said: boolean } | null>(null);
  const [dx, setDx] = useState(0);
  const [now, setNow] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [result, setResult] = useState<{ best: number | null; newBest: boolean; failed: boolean } | null>(null);
  const deadline = useRef(0);
  const deck = useRef<Item[]>([]);
  const nextN = useRef(0);

  const items = useMemo(() => ({ arabic: itemsFor(words, 'arabic'), translit: itemsFor(words, 'translit') }), [words]);
  const counts = { arabic: playable(items.arabic) ? items.arabic.length : 0, translit: playable(items.translit) ? items.translit.length : 0 };
  const arabic = mode === 'arabic';
  const short = useMedia(SHORT_LANDSCAPE);

  const deal = useCallback((m: CrosswordMode, prev?: Item): Card => {
    const pool = items[m];
    if (!deck.current.length) deck.current = shuffle(pool);
    let item = deck.current.pop()!;
    if (prev && item.id === prev.id && pool.length > 1) {
      if (!deck.current.length) deck.current = shuffle(pool);
      const other = deck.current.pop()!;
      deck.current.unshift(item);
      item = other;
    }
    const others = pool.filter(o => o.key !== item.key);
    const truth = !others.length || Math.random() < 0.5;
    const meaning = truth ? item.meaning : others[Math.floor(Math.random() * others.length)].meaning;
    nextN.current += 1;
    return { item, meaning, truth, n: nextN.current };
  }, [items]);

  const begin = (m: CrosswordMode) => {
    setMode(m); deck.current = [];
    setStreak(0); setTopStreak(0); setScore(0); setLog([]); setFeedback(null); setDx(0); setResult(null);
    setBest(null);
    getQuickMatchBest(studentId, m).then(setBest).catch(err => { console.error(err); setBest(null); });
    setCard(deal(m));
    setCount(3); setPhase('ready');
  };

  // 3 · 2 · 1, then the clock starts.
  useEffect(() => {
    if (phase !== 'ready') return;
    if (count === 0) { deadline.current = Date.now() + DURATION; setNow(Date.now()); setPhase('play'); return; }
    const t = window.setTimeout(() => setCount(c => c - 1), 650);
    return () => window.clearTimeout(t);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== 'play') return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [phase]);

  const left = Math.max(0, deadline.current - now);

  // Time's up → save the score.
  useEffect(() => {
    if (phase !== 'play' || left > 0 || !mode) return;
    setPhase('done');
    const before = best ?? 0;
    saveQuickMatchScore(studentId, mode, score)
      .then(b => setResult({ best: b, newBest: score > before && score > 0, failed: false }))
      .catch(err => { console.error(err); setResult({ best: best, newBest: false, failed: true }); });
  }, [phase, left, mode, best, score, studentId]);

  const answer = useCallback((said: boolean) => {
    if (phase !== 'play' || !card || feedback || !mode) return;
    const ok = said === card.truth;
    setLog(l => [...l, { item: card.item, truth: card.truth, ok }]);
    setFeedback({ ok, said });
    setDx(0);
    if (ok) {
      const s = streak + 1;
      setStreak(s);
      setTopStreak(t => Math.max(t, s));
      setScore(v => v + POINTS * multiplier(s));
    } else {
      setStreak(0);
    }
    window.setTimeout(() => { setFeedback(null); setCard(c => deal(mode, c?.item)); }, ok ? 230 : 1100);
  }, [phase, card, feedback, mode, streak, deal]);

  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); answer(true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, answer]);

  // ── Swipe the card ──
  const swipe = useRef<{ x: number; on: boolean }>({ x: 0, on: false });
  const onDown = (e: React.PointerEvent) => {
    if (phase !== 'play' || feedback) return;
    capturePointer(e);
    swipe.current = { x: e.clientX, on: true };
  };
  const onMove = (e: React.PointerEvent) => { if (swipe.current.on) setDx(e.clientX - swipe.current.x); };
  const onUp = () => {
    if (!swipe.current.on) return;
    swipe.current.on = false;
    if (dx > SWIPE) answer(true);
    else if (dx < -SWIPE) answer(false);
    else setDx(0);
  };

  const area = useRef<HTMLDivElement>(null);
  const box = useBoxSize(area, [phase, short]);

  if (phase === 'pick' || !mode) {
    return <PickScreen title="Quick match" subtitle={title} motif={MOTIF} tone="teal" counts={counts} min={2} onPick={begin} onExit={onExit} />;
  }

  if (phase === 'done') {
    const right = log.filter(a => a.ok).length;
    const missed = [...new Map(log.filter(a => !a.ok).map(a => [a.item.id, a.item])).values()];
    return (
      <DoneScreen tone="teal" onExit={onExit} onAgain={() => begin(mode)} arabic={arabic}
        top={
          <div className="flex flex-col items-center gap-2 pt-2">
            {result?.newBest && (
              <span className="h-[30px] px-3 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[13px] font-extrabold tracking-wider flex items-center gap-1.5">
                <Svg size={15} fill="currentColor">{ICON.star}</Svg>
                NEW BEST
              </span>
            )}
            <span className="text-[72px] font-extrabold tracking-tighter leading-none text-teal-700 dark:text-teal-300 tabular-nums">{score}</span>
            <span className={`text-sm font-semibold ${MUTED}`}>
              {!result ? '…'
                : result.failed ? <span className="text-rose-700 dark:text-rose-300">Best score not saved</span>
                : result.newBest ? (best ? `Best before ${best}` : 'First score')
                : `Best ${result.best ?? best ?? score}`}
            </span>
          </div>
        }
        headline="Time's up"
        stats={[[String(right), 'right'], [String(log.length - right), 'wrong'], [String(topStreak), 'in a row']]}
        words={missed.map(i => ({ written: i.shown, clue: i.meaning }))} wordsTitle="To revise" />
    );
  }

  if (!card) return null;

  // ── Card ──
  const cardW = Math.max(220, Math.min(short ? 380 : 440, box.w - 24));
  const cardH = Math.max(150, Math.min(box.h - 16, Math.round(cardW * (short ? 0.62 : 0.9))));
  const letters = [...card.item.shown.replace(HARAKAT, '')].length;
  const wordSize = Math.round(Math.max(26, Math.min(cardH * 0.24, (cardW * 0.86) / Math.max(1, letters * (arabic ? 0.52 : 0.58)))));
  const meaningSize = Math.round(Math.max(18, Math.min(cardH * 0.11, (cardW * 0.86) / Math.max(1, card.meaning.length * 0.55))));
  const wrong = feedback && !feedback.ok;
  const leaving = feedback?.ok ? (feedback.said ? 1 : -1) : 0;
  const shift = leaving ? leaving * (cardW + 120) : dx;

  const cardEl = (
    <div ref={area} className="flex-1 min-h-0 min-w-0 w-full relative flex items-center justify-center">
      <div aria-hidden="true" className="absolute rounded-[28px] bg-[#EFE5D1] dark:bg-gray-800/60 rotate-[-4deg]"
        style={{ width: cardW - 24, height: cardH - 16, transform: 'rotate(-4deg) translateY(10px)' }} />
      <div key={card.n}
        className={`relative rounded-[28px] ${CARD} shadow-[0_18px_44px_rgba(120,90,40,0.16)] flex flex-col items-center justify-center gap-[4%] px-4 touch-none cursor-grab active:cursor-grabbing ${wrong ? 'wg-shake !border-rose-500 border-2' : 'wg-in'}`}
        style={{
          width: cardW, height: cardH,
          transform: `translateX(${shift}px) rotate(${shift / 22}deg)`,
          transition: swipe.current.on ? 'none' : 'transform .22s ease-out',
        }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <span dir={arabic ? 'rtl' : 'ltr'} className="font-bold leading-[1.35] text-center"
          style={{ fontSize: wordSize, fontFamily: arabic ? ARABIC_FONT : undefined }}>{card.item.shown}</span>
        <div className="w-16 h-0.5 rounded bg-[#EADFC8] dark:bg-gray-600" />
        <span className={`font-semibold text-center leading-tight ${wrong && !card.truth ? 'line-through text-stone-400 dark:text-slate-500' : 'text-stone-700 dark:text-slate-200'}`}
          style={{ fontSize: meaningSize }}>{card.meaning}</span>
        {wrong && (
          <span className="flex items-center gap-1.5 text-teal-800 dark:text-teal-300 font-bold" style={{ fontSize: Math.max(16, meaningSize * 0.8) }}>
            <Svg size={20} stroke={2.6}>{ICON.check}</Svg>
            {card.item.meaning}
          </span>
        )}
        {/* What letting go would say. */}
        {dx > 12 && (
          <span className="absolute top-5 left-5 h-8 px-3 rounded-lg border-2 border-teal-700 text-teal-700 dark:text-teal-300 dark:border-teal-400 text-sm font-extrabold tracking-wider flex items-center rotate-[-10deg]"
            style={{ opacity: Math.min(1, dx / SWIPE) }}>MATCH</span>
        )}
        {dx < -12 && (
          <span className="absolute top-5 right-5 h-8 px-3 rounded-lg border-2 border-orange-700 text-orange-700 dark:text-orange-300 dark:border-orange-400 text-sm font-extrabold tracking-wider flex items-center rotate-[10deg]"
            style={{ opacity: Math.min(1, -dx / SWIPE) }}>NO</span>
        )}
      </div>
    </div>
  );

  const noBtn = (
    <button onClick={() => answer(false)} disabled={phase !== 'play'}
      className={`wg-tap rounded-[20px] border-2 border-orange-700 bg-white dark:bg-gray-800 text-orange-800 dark:text-orange-300 font-bold flex items-center justify-center gap-2.5 hover:bg-orange-50 dark:hover:bg-orange-950/40 disabled:opacity-50 ${short ? 'w-24 self-stretch flex-col text-base' : 'flex-1 h-16 text-[17px]'}`}>
      <kbd className="hidden lg:flex h-[26px] min-w-[26px] px-1.5 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 text-[13px] font-sans items-center justify-center">←</kbd>
      <Svg size={22} stroke={2.6} className="lg:hidden">{ICON.close}</Svg>
      No
    </button>
  );
  const matchBtn = (
    <button onClick={() => answer(true)} disabled={phase !== 'play'}
      className={`wg-tap rounded-[20px] border-2 border-teal-700 bg-teal-700 text-white font-bold flex items-center justify-center gap-2.5 hover:bg-teal-800 disabled:opacity-50 ${short ? 'w-24 self-stretch flex-col text-base' : 'flex-1 h-16 text-[17px]'}`}>
      <Svg size={22} stroke={2.6} className="lg:hidden">{ICON.check}</Svg>
      Match
      <kbd className="hidden lg:flex h-[26px] min-w-[26px] px-1.5 rounded-md border border-teal-500 bg-teal-600 text-[13px] font-sans items-center justify-center">→</kbd>
    </button>
  );

  const mult = multiplier(streak);
  const timeLeft = phase === 'ready' ? DURATION : left;

  return (
    <GameShell onExit={onExit}>
      <GameHeader title="Quick match" tone="teal" onExit={onExit} subtitle={title}
        right={
          <div className="flex items-center gap-2.5">
            {best != null && best > 0 && <span className={`text-sm font-semibold whitespace-nowrap ${MUTED}`}>Best {best}</span>}
            <span className="h-9 px-3.5 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-200 text-base font-extrabold flex items-center tabular-nums">{score}</span>
          </div>
        } />

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col items-center gap-3 px-4 pt-3 pb-5 lg:pt-6 lg:pb-8">
          <div className="w-full max-w-[560px] flex items-center gap-3 flex-shrink-0">
            <Svg size={20} stroke={2} className="text-teal-700 dark:text-teal-300">{ICON.timer}</Svg>
            <div className="flex-1 h-2.5 rounded-full bg-[#EADFC8] dark:bg-gray-800 overflow-hidden">
              <div className={`h-full ${timeLeft < 10_000 ? 'bg-orange-600' : 'bg-teal-700'}`} style={{ width: `${(timeLeft / DURATION) * 100}%` }} />
            </div>
            <span className="w-11 text-right text-[17px] font-extrabold tabular-nums">{`0:${String(Math.ceil(timeLeft / 1000)).padStart(2, '0')}`.replace('0:60', '1:00')}</span>
          </div>
          <div className="h-[34px] flex-shrink-0 flex items-center">
            {streak >= 2 && (
              <span key={streak} className="wg-pop h-[34px] px-3.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 text-sm font-bold flex items-center gap-1.5">
                <Svg size={16} stroke={2}>{ICON.flame}</Svg>
                {streak} in a row{mult > 1 ? ` · ×${mult}` : ''}
              </span>
            )}
          </div>

          {short ? (
            <div className="flex-1 min-h-0 w-full max-w-[720px] flex items-stretch gap-3">
              {noBtn}{cardEl}{matchBtn}
            </div>
          ) : (
            <>
              {cardEl}
              <div className="w-full max-w-[460px] flex gap-4 flex-shrink-0">{noBtn}{matchBtn}</div>
            </>
          )}
        </div>

        <aside className="hidden lg:flex flex-col gap-1.5 w-[340px] flex-shrink-0 overflow-y-auto border-l border-[#EADFCB] dark:border-gray-800 px-[22px] py-[26px]">
          <p className={`ml-2.5 mb-2 text-xs font-extrabold uppercase tracking-[0.14em] ${MUTED}`}>This round</p>
          {[...log].reverse().map((a, i) => (
            <div key={log.length - i} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 ${a.ok ? '' : 'bg-orange-100/80 dark:bg-orange-950/40'}`}>
              <span className={`w-[22px] h-[22px] flex-shrink-0 rounded-full text-white flex items-center justify-center ${a.ok ? 'bg-teal-700' : 'bg-orange-700'}`}>
                <Svg size={13} stroke={3}>{a.ok ? ICON.check : ICON.close}</Svg>
              </span>
              <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{a.item.meaning}</span>
              <Written text={a.item.shown} arabic={arabic} className="flex-shrink-0 text-lg font-bold leading-[1.4]" />
            </div>
          ))}
        </aside>
      </div>

      {phase === 'ready' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#F6F1E7]/70 dark:bg-gray-950/70">
          <span key={count} className="wg-pop text-[96px] font-extrabold text-teal-700 dark:text-teal-300 tabular-nums">{count || ''}</span>
        </div>
      )}
    </GameShell>
  );
};

export default QuickMatchGame;
