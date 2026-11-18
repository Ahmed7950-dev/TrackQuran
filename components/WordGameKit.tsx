// components/WordGameKit.tsx
// -----------------------------------------------------------------------------
// What the four vocabulary games (Letter wheel, Quick match, Word search, Word
// snake) share with each other and with the crossword's look: the full-screen
// shell, the header, the "Arabic or transliteration" start screen and the
// finish screen.
//
// Look: the Claude Design canvas "Arabic Word Games"
// (https://claude.ai/artifact/RBCZM1R11rzzJrmnvPANSQ) — warm paper ground,
// white cards, one colour per game (amber wheel, teal match, indigo search,
// green snake), teal for anything solved.
// -----------------------------------------------------------------------------
import React, { useEffect, useLayoutEffect, useState } from 'react';
import type { CrosswordMode } from '../utils/crossword';

export const ARABIC_FONT = "'Cairo', 'Noto Naskh Arabic', system-ui, sans-serif";

export type KitTone = 'amber' | 'teal' | 'indigo' | 'green';

/** Full class strings, never assembled: Tailwind only ships what it sees. */
export const TONE: Record<KitTone, {
  chip: string; soft: string; primary: string; face: string; card: string; bar: string; secondary: string;
}> = {
  amber: {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    soft: 'bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:hover:bg-amber-900 dark:text-amber-100',
    primary: 'bg-amber-700 hover:bg-amber-800 text-white',
    face: 'text-amber-800 dark:text-amber-200',
    card: 'border-[#F3D9A4] dark:border-amber-800/70',
    bar: 'bg-amber-600',
    secondary: 'border-[#F3D9A4] dark:border-amber-800 text-amber-800 dark:text-amber-200',
  },
  teal: {
    chip: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200',
    soft: 'bg-teal-100 hover:bg-teal-200 text-teal-900 dark:bg-teal-900/50 dark:hover:bg-teal-900 dark:text-teal-100',
    primary: 'bg-teal-700 hover:bg-teal-800 text-white',
    face: 'text-teal-800 dark:text-teal-200',
    card: 'border-teal-200 dark:border-teal-800/70',
    bar: 'bg-teal-700',
    secondary: 'border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200',
  },
  indigo: {
    chip: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200',
    soft: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-900 dark:bg-indigo-900/50 dark:hover:bg-indigo-900 dark:text-indigo-100',
    primary: 'bg-indigo-700 hover:bg-indigo-800 text-white',
    face: 'text-indigo-800 dark:text-indigo-200',
    card: 'border-indigo-200 dark:border-indigo-800/70',
    bar: 'bg-indigo-700',
    secondary: 'border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200',
  },
  green: {
    chip: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    soft: 'bg-green-100 hover:bg-green-200 text-green-900 dark:bg-green-900/50 dark:hover:bg-green-900 dark:text-green-100',
    primary: 'bg-green-700 hover:bg-green-800 text-white',
    face: 'text-green-800 dark:text-green-200',
    card: 'border-green-200 dark:border-green-800/70',
    bar: 'bg-green-700',
    secondary: 'border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
  },
};

export const CARD = 'bg-white dark:bg-gray-800 border border-[#E5DCCB] dark:border-gray-700';
export const MUTED = 'text-stone-600 dark:text-slate-400';
export const BTN_PRIMARY = 'h-[52px] rounded-full text-base font-bold flex items-center justify-center gap-2 px-8';
export const BTN_SECONDARY = 'h-[52px] rounded-full bg-white dark:bg-gray-800 border-2 text-base font-bold flex items-center justify-center px-6';
export const BTN_QUIET = 'h-12 px-5 rounded-full border border-[#D6CBB5] dark:border-gray-600 bg-white dark:bg-gray-800 text-stone-800 dark:text-slate-100 text-[15px] font-semibold flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-gray-700 disabled:opacity-45';

/** Where a phone on its side has no height for things stacked. */
export const SHORT_LANDSCAPE = '(max-height: 520px) and (orientation: landscape)';

export const Svg: React.FC<{ children: React.ReactNode; size?: number; stroke?: number; className?: string; fill?: string }> = ({ children, size = 22, stroke = 2.2, className, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? 'currentColor' : 'none'} strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{children}</svg>
);

export const ICON = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrowR: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowL: <path d="M19 12H5M11 6l-6 6 6 6" />,
  shuffle: <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />,
  delRtl: <><path d="M3 6h12l6 6-6 6H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /><path d="M8 10l4 4M12 10l-4 4" /></>,
  delLtr: <><path d="M21 6H9l-6 6 6 6h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1Z" /><path d="M16 10l-4 4M12 10l4 4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></>,
  flame: <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1.2 2.5 2 2.5-.5-3 0-6 1-9z" />,
  star: <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" />,
  heart: <path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.3 5 6.6 5c2 0 3.6 1.1 5.4 3 1.8-1.9 3.4-3 5.4-3C20.7 5 23 8.3 21.5 11.8 19.5 16.4 12 21 12 21z" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></>,
  play: <path d="M7 4.5v15l12.5-7.5z" />,
  swipe: <><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10l4.6 1a2 2 0 0 1 1.5 2.3l-.8 4.2A3 3 0 0 1 14.4 20H11a3 3 0 0 1-2.4-1.2L5.5 14.6a1.5 1.5 0 0 1 2.3-1.9L9 14" /><path d="M3 4l2 2M3 4h3M3 4v3M21 4l-2 2M21 4h-3M21 4v3" /></>,
};

/** Keep a drag's moves coming to this element; harmless when the browser refuses. */
export function capturePointer(e: React.PointerEvent) {
  try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not a live pointer */ }
}

export const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** The size of a box, kept up to date as the window changes. */
export function useBoxSize(ref: React.RefObject<HTMLElement>, deps: unknown[] = []): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return size;
}

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return on;
}

/** A word in its own script and direction. */
export const Written: React.FC<{ text: string; arabic: boolean; className?: string }> = ({ text, arabic, className = '' }) => (
  <span dir={arabic ? 'rtl' : 'ltr'} className={className} style={arabic ? { fontFamily: ARABIC_FONT } : undefined}>{text}</span>
);

// ── The frame ───────────────────────────────────────────────────────────────

export const GameShell: React.FC<{ onExit: () => void; children: React.ReactNode }> = ({ onExit, children }) => {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onExit]);
  return (
    <div dir="ltr" className="fixed inset-0 z-[80] flex flex-col bg-[#F6F1E7] dark:bg-gray-950 text-stone-900 dark:text-slate-100 overscroll-contain select-none"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @keyframes wg-shake { 0%,100% { transform: translateX(0) } 20% { transform: translateX(-5px) } 40% { transform: translateX(5px) } 60% { transform: translateX(-3px) } 80% { transform: translateX(3px) } }
        @keyframes wg-pop { 0% { transform: scale(1) } 45% { transform: scale(1.12) } 100% { transform: scale(1) } }
        @keyframes wg-in { 0% { opacity: 0; transform: translateY(10px) scale(.97) } 100% { opacity: 1; transform: none } }
        @keyframes wg-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(79,70,229,.0) } 50% { box-shadow: 0 0 0 6px rgba(79,70,229,.35) } }
        .wg-shake { animation: wg-shake .42s ease-in-out }
        .wg-pop { animation: wg-pop .42s ease-out }
        .wg-in { animation: wg-in .22s ease-out }
        .wg-pulse { animation: wg-pulse .7s ease-in-out 3 }
        .wg-tap { touch-action: manipulation; -webkit-tap-highlight-color: transparent }
      `}</style>
      {children}
    </div>
  );
};

export const CloseButton: React.FC<{ onExit: () => void }> = ({ onExit }) => (
  <button onClick={onExit} aria-label="Close"
    className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center text-stone-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10">
    <Svg>{ICON.close}</Svg>
  </button>
);

export const GameHeader: React.FC<{
  title: string; onExit: () => void; tone: KitTone;
  chip?: string; subtitle?: string; right?: React.ReactNode;
}> = ({ title, onExit, tone, chip, subtitle, right }) => (
  <div className="h-14 lg:h-16 flex-shrink-0 flex items-center gap-2 pl-1.5 pr-2.5 lg:pr-5 lg:border-b lg:border-[#EADFCB] lg:dark:border-gray-800">
    <CloseButton onExit={onExit} />
    <h1 className="text-lg lg:text-xl font-extrabold tracking-tight whitespace-nowrap">{title}</h1>
    {chip && (
      <span className={`h-6 px-2.5 rounded-full text-xs font-bold flex items-center tabular-nums whitespace-nowrap ${TONE[tone].chip}`}>{chip}</span>
    )}
    {subtitle && <span className={`hidden lg:inline ml-1.5 text-sm font-medium truncate ${MUTED}`}>{subtitle}</span>}
    <span className="flex-1" />
    {right}
  </div>
);

// ── Start: Arabic or transliteration ────────────────────────────────────────

export const PickScreen: React.FC<{
  title: string; subtitle?: string; motif: React.ReactNode; tone: KitTone;
  counts: Record<CrosswordMode, number>; min: number;
  onPick: (m: CrosswordMode) => void; onExit: () => void;
}> = ({ title, subtitle, motif, tone, counts, min, onPick, onExit }) => {
  const t = TONE[tone];
  const choice = (m: CrosswordMode, face: React.ReactNode, label: string) => (
    <button onClick={() => onPick(m)} disabled={counts[m] < min}
      className={`wg-tap flex-1 min-w-0 rounded-3xl bg-white dark:bg-gray-800 border-2 ${t.card} shadow-[0_2px_0_rgba(120,90,40,0.10)] hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(120,90,40,0.16)] transition-all px-2.5 pt-5 pb-5 flex flex-col items-center gap-1 disabled:opacity-40 disabled:hover:translate-y-0`}>
      {face}
      <span className="text-base font-bold">{label}</span>
      {/* The arrow says which way the words will read. */}
      <span className={`text-[13px] font-medium flex items-center gap-1 ${MUTED}`}>
        {m === 'arabic' && <Svg size={16}>{ICON.arrowL}</Svg>}
        {counts[m]} words
        {m === 'translit' && <Svg size={16}>{ICON.arrowR}</Svg>}
      </span>
    </button>
  );
  return (
    <GameShell onExit={onExit}>
      <div className="h-14 flex-shrink-0 flex items-center px-1.5"><CloseButton onExit={onExit} /></div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center gap-9 px-5 pb-16 [@media(max-height:520px)_and_(orientation:landscape)]:gap-5 [@media(max-height:520px)_and_(orientation:landscape)]:pb-6">
          <div className="flex flex-col items-center gap-[18px]">
            <div aria-hidden="true" className="[@media(max-height:520px)_and_(orientation:landscape)]:hidden">{motif}</div>
            <div className="flex flex-col items-center gap-1">
              <h1 className="text-[30px] font-extrabold tracking-tight">{title}</h1>
              {subtitle && <p className={`text-sm font-medium text-center max-w-[20rem] truncate ${MUTED}`}>{subtitle}</p>}
            </div>
          </div>
          <div className="w-full max-w-[22rem] flex gap-3">
            {choice('arabic',
              <span dir="rtl" className={`text-[44px] font-bold leading-[1.5] ${t.face}`} style={{ fontFamily: ARABIC_FONT }}>عربي</span>,
              'Arabic')}
            {choice('translit',
              <span className={`text-[40px] font-extrabold leading-[1.65] tracking-tight ${t.face}`}>abc</span>,
              'Transliteration')}
          </div>
        </div>
      </div>
    </GameShell>
  );
};

// ── Finished ────────────────────────────────────────────────────────────────

export interface DoneWord { written: string; clue: string }

export const DoneScreen: React.FC<{
  tone: KitTone; onAgain: () => void; onExit: () => void;
  headline: React.ReactNode; top?: React.ReactNode;
  stats: Array<[string, string]>;
  words?: DoneWord[]; wordsTitle?: string; arabic: boolean;
  againLabel?: string;
}> = ({ tone, onAgain, onExit, headline, top, stats, words, wordsTitle, arabic, againLabel = 'Play again' }) => {
  const t = TONE[tone];
  return (
    <GameShell onExit={onExit}>
      <div className="h-14 flex-shrink-0 flex items-center px-1.5"><CloseButton onExit={onExit} /></div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[28rem] mx-auto flex flex-col items-center gap-[18px] px-5 pb-8 wg-in">
          {top ?? (
            <span className="w-16 h-16 rounded-full bg-teal-700 text-white flex items-center justify-center">
              <Svg size={34} stroke={2.6}>{ICON.check}</Svg>
            </span>
          )}
          <h2 className="text-[30px] font-extrabold tracking-tight text-center">{headline}</h2>
          <div className="w-full grid gap-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map(([v, l]) => (
              <div key={l} className={`rounded-2xl ${CARD} py-2.5 px-1 flex flex-col items-center gap-0.5`}>
                <span className="text-xl font-extrabold tabular-nums">{v}</span>
                <span className={`text-xs font-medium text-center ${MUTED}`}>{l}</span>
              </div>
            ))}
          </div>
          {!!words?.length && (
            <div className={`w-full rounded-[20px] ${CARD} px-4 py-1.5`}>
              {wordsTitle && <p className="pt-2 pb-1 text-xs font-extrabold uppercase tracking-[0.14em] text-orange-800 dark:text-orange-300">{wordsTitle}</p>}
              <ul className="divide-y divide-[#EFE7D8] dark:divide-gray-700">
                {words.map((w, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                    <span className={`text-sm font-medium min-w-0 truncate ${MUTED}`}>{w.clue}</span>
                    <Written text={w.written} arabic={arabic} className="flex-shrink-0 text-xl font-bold text-teal-800 dark:text-teal-300 leading-[1.5]" />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="w-full max-w-[340px] flex gap-2.5 pt-1">
            <button onClick={onExit} className={`${BTN_SECONDARY} ${t.secondary} flex-1`}>Close</button>
            <button onClick={onAgain} className={`${BTN_PRIMARY} ${t.primary} flex-1 px-4`}>{againLabel}</button>
          </div>
        </div>
      </div>
    </GameShell>
  );
};
