// ─────────────────────────────────────────────────────────────────────────────
// FreeTalkBoard — the tutor's board in Free Talk, above the verb cards.
//
// A big text area for what the tutor says, or notes, with the text centred
// both ways and FITTED to the box: big when short, smaller as more is
// written, growing back when text is removed. A−/A+ nudge the size by hand
// (a step of ×1.15 on top of the fit); Auto goes back to fitting. Present
// fills the screen with the board for sharing the screen in a lesson, and
// stays editable there. The grip under the board makes it taller/shorter.
//
// Tutor only (ArabicVerbsTab never renders it in student mode). The text is
// kept per student on this device (localStorage), so each student's board is
// where it was left. Clear can be undone for a few seconds.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const FONT = "'Inter', 'Amiri', sans-serif";
const LINE = 1.45;
/** Amiri draws small next to Inter at the same size; this scales the Arabic
 *  to match (Chrome 127+, Safari 17+, Firefox 118+; elsewhere it is ignored). */
const ADJUST = 'from-font';
const MIN_SIZE = 16;
const STEP = 1.15;
const PLACEHOLDER = 'Type what you say. It stays big and in the middle.';
/** An empty board shows its hint at a calm size, not the full fitted one. */
const HINT_MAX = 30;

const textKey = (id: string) => `freeTalkBoard:${id}`;
const HEIGHT_KEY = 'freeTalkBoardHeight';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: the board still works */ } };

/** One measuring div for every board: same font and width as the text, never shown. */
let ruler: HTMLDivElement | null = null;
function measure(text: string, width: number, size: number): number {
  if (!ruler) {
    ruler = document.createElement('div');
    Object.assign(ruler.style, {
      position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden', whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere', fontFamily: FONT, fontWeight: '700', lineHeight: String(LINE), textAlign: 'center', fontSizeAdjust: ADJUST,
    });
    document.body.appendChild(ruler);
  }
  ruler.style.width = `${width}px`;
  ruler.style.fontSize = `${size}px`;
  ruler.textContent = `${text || ' '}${text.endsWith('\n') ? ' ' : ''}`;   // a last empty line still counts
  return ruler.scrollHeight;
}

/** The biggest size (≤ max) at which the text fits width × height. */
function fitSize(text: string, width: number, height: number, max: number): number {
  let lo = MIN_SIZE, hi = Math.max(MIN_SIZE, max);
  if (measure(text, width, hi) <= height) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (measure(text, width, mid) <= height) lo = mid; else hi = mid;
  }
  return lo;
}

/** The text area itself: fills its box, centres the text, fits the size. */
const BoardText: React.FC<{
  text: string; onChange: (t: string) => void; boost: number; maxSize: number; autoFocus?: boolean;
  onSize?: (auto: number) => void;
}> = ({ text, onChange, boost, maxSize, autoFocus, onSize }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [layout, setLayout] = useState({ size: 32, h: 60 });
  useLayoutEffect(() => {
    if (!box.w || !box.h) return;
    const shown = text || PLACEHOLDER;
    const auto = fitSize(shown, box.w, box.h, text ? maxSize : Math.min(maxSize, HINT_MAX));
    const size = text ? Math.max(MIN_SIZE, Math.round(auto * STEP ** boost)) : auto;
    setLayout({ size, h: Math.min(box.h, measure(shown, box.w, size)) });
    onSize?.(auto);
  }, [text, box.w, box.h, boost, maxSize, onSize]);

  return (
    <div ref={boxRef} className="absolute inset-x-5 sm:inset-x-12 inset-y-4 flex items-center justify-center">
      <textarea
        dir="auto"
        value={text}
        onChange={e => onChange(e.target.value)}
        autoFocus={autoFocus}
        aria-label="Board"
        placeholder={PLACEHOLDER}
        spellCheck={false}
        className="block w-full resize-none border-0 bg-transparent p-0 text-center text-slate-900 dark:text-slate-50 placeholder:text-slate-300 dark:placeholder:text-slate-600 placeholder:font-semibold focus:outline-none focus:ring-0"
        style={{
          fontFamily: FONT, fontWeight: 700, lineHeight: LINE, fontSizeAdjust: ADJUST, fontSize: layout.size, height: layout.h,
          overflowY: layout.h >= box.h - 1 ? 'auto' : 'hidden', overflowWrap: 'anywhere',
        }}
      />
    </div>
  );
};

const ToolButton: React.FC<{ onClick: () => void; label: string; icon: React.ReactNode; dark?: boolean; showLabel?: boolean }> =
  ({ onClick, label, icon, dark, showLabel = true }) => (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`h-9 px-2.5 sm:px-3 rounded-xl text-[13px] font-bold flex items-center gap-1.5 ${dark
        ? 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-gray-700 dark:hover:text-white'}`}>
      {icon}{showLabel && <span className="hidden sm:inline">{label}</span>}
    </button>
  );

const SizeSwitch: React.FC<{ boost: number; setBoost: (f: (b: number) => number) => void }> = ({ boost, setBoost }) => (
  <div role="group" aria-label="Text size" className="flex items-center gap-0.5 p-[3px] rounded-[11px] bg-slate-100 dark:bg-gray-700">
    <button type="button" aria-label="Smaller text" onClick={() => setBoost(b => Math.max(-6, b - 1))}
      className="h-[30px] min-w-[32px] px-2 rounded-lg text-xs font-extrabold text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">A−</button>
    <button type="button" aria-pressed={boost === 0} onClick={() => setBoost(() => 0)}
      className={`h-[30px] min-w-[38px] px-2 rounded-lg text-xs font-extrabold ${boost === 0
        ? 'bg-white text-slate-900 shadow-sm dark:bg-gray-900 dark:text-white'
        : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>Auto</button>
    <button type="button" aria-label="Bigger text" onClick={() => setBoost(b => Math.min(6, b + 1))}
      className="h-[30px] min-w-[32px] px-2 rounded-lg text-sm font-extrabold text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">A+</button>
  </div>
);

const ICON = {
  board: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><rect x="3" y="4" width="18" height="13" rx="2" /><path strokeLinecap="round" d="M8 21h8M12 17v4" /></svg>,
  lock: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5"><rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  clear: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>,
  present: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
};

const DOTS = { backgroundImage: 'radial-gradient(rgba(148,163,184,.35) 1px, transparent 1px)', backgroundSize: '22px 22px', backgroundPosition: '11px 11px' };

const FreeTalkBoard: React.FC<{ studentId: string; studentName: string }> = ({ studentId, studentName }) => {
  const [text, setText] = useState(() => read(textKey(studentId)) ?? '');
  const [boost, setBoost] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const [height, setHeight] = useState(() => {
    const h = Number(read(HEIGHT_KEY));
    return h >= 200 && h <= 900 ? h : (typeof window !== 'undefined' && window.innerWidth < 640 ? 300 : 360);
  });

  // Another student → that student's board.
  useEffect(() => { setText(read(textKey(studentId)) ?? ''); setUndo(null); setBoost(0); }, [studentId]);
  useEffect(() => {
    const t = window.setTimeout(() => write(textKey(studentId), text), 300);
    return () => clearTimeout(t);
  }, [text, studentId]);
  useEffect(() => { write(HEIGHT_KEY, String(Math.round(height))); }, [height]);

  const clear = () => {
    if (!text) return;
    setUndo(text); setText(''); setBoost(0);
  };
  useEffect(() => {
    if (undo === null) return;
    const t = window.setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  // ── The grip: drag (or arrow keys) to change the board's height ──
  const drag = useRef<{ y: number; h: number } | null>(null);
  const onGripDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: height };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setHeight(Math.max(200, Math.min(900, drag.current.h + e.clientY - drag.current.y)));
  };

  // ── Present: the board alone, full screen where the browser allows it ──
  const presentRef = useRef<HTMLDivElement>(null);
  const stopPresenting = useCallback(() => {
    setPresenting(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    if (!presenting) return;
    const el = presentRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen().catch(() => { /* iPhone: the fixed layer is enough */ });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stopPresenting(); };
    // Leaving browser full screen (Esc there is eaten by the browser) ends Present too.
    const onFs = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      document.body.style.overflow = prev;
    };
  }, [presenting, stopPresenting]);

  const wide = typeof window !== 'undefined' && window.innerWidth >= 640;

  return (
    <section aria-label="Board" className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-18px_rgba(15,23,42,.18)]">
      <div className="flex items-center gap-2 sm:gap-2.5 ps-3.5 sm:ps-5 pe-2.5 py-2.5 border-b border-slate-100 dark:border-gray-700">
        <span className="flex-shrink-0 w-[30px] h-[30px] rounded-[9px] bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center">{ICON.board}</span>
        <span className="text-base font-extrabold text-slate-900 dark:text-slate-100">Board</span>
        <span className="hidden md:flex items-center gap-1 text-xs font-semibold text-slate-400 dark:text-slate-500 truncate">
          {ICON.lock}Only you see it · kept for {studentName} on this device
        </span>
        <span className="flex-1" />
        <SizeSwitch boost={boost} setBoost={setBoost} />
        <ToolButton onClick={clear} label="Clear" icon={ICON.clear} />
        <ToolButton onClick={() => setPresenting(true)} label="Present" icon={ICON.present} dark />
      </div>

      <div className="relative bg-white dark:bg-gray-800" style={{ height, ...DOTS }}>
        {!presenting && <BoardText text={text} onChange={setText} boost={boost} maxSize={wide ? 72 : 40} />}
        {undo !== null && (
          <div role="status" className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-3 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 ps-4 pe-1.5 py-1.5 text-[13px] font-semibold shadow-lg">
            Board cleared
            <button type="button" onClick={() => { setText(undo); setUndo(null); }}
              className="h-7 px-3 rounded-full bg-white/15 dark:bg-slate-900/10 font-extrabold hover:bg-white/25">Undo</button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2 border-t border-slate-100 dark:border-gray-700 text-xs text-slate-400 dark:text-slate-500">
        <span className="flex-1 min-w-0 truncate">{boost === 0 ? 'The text shrinks as you write more, and grows back' : `Text ${boost > 0 ? 'bigger' : 'smaller'} by hand · Auto fits it again`}</span>
        <button type="button" role="separator" aria-orientation="horizontal" aria-label="Board height" aria-valuenow={Math.round(height)} aria-valuemin={200} aria-valuemax={900}
          title="Drag to make the board taller or shorter"
          onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={() => { drag.current = null; }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHeight(h => Math.min(900, h + 40)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHeight(h => Math.max(200, h - 40)); }
          }}
          className="flex-shrink-0 h-6 w-16 flex items-center justify-center cursor-ns-resize touch-none rounded-full hover:bg-slate-100 dark:hover:bg-gray-700">
          <span className="w-11 h-[5px] rounded-full bg-slate-300 dark:bg-gray-600" />
        </button>
        <span className="flex-1 hidden sm:block text-end">Esc leaves Present</span>
      </div>

      {presenting && (
        <div ref={presentRef} className="fixed inset-0 z-[80] flex flex-col bg-[#FBFAF7] dark:bg-gray-950"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-center gap-2 px-4 sm:px-6 py-3">
            <span className="text-xs sm:text-[13px] font-extrabold uppercase tracking-[.08em] text-stone-400 truncate">Board · {studentName}</span>
            <span className="flex-1" />
            <SizeSwitch boost={boost} setBoost={setBoost} />
            <button type="button" onClick={stopPresenting}
              className="h-9 px-4 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-[13px] font-extrabold">Done</button>
          </div>
          <div className="relative flex-1 min-h-0">
            <BoardText text={text} onChange={setText} boost={boost} maxSize={wide ? 140 : 56} autoFocus />
          </div>
        </div>
      )}
    </section>
  );
};

export default FreeTalkBoard;
