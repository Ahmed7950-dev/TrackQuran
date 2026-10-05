// components/HomeworkPictureItem.tsx
// ---------------------------------------------------------------------------
// A picture with writing over it, some of the words taken out.
//
// The tutor drops in a picture, writes a line or two anywhere on it, drags each
// line where it belongs, sets its size and colour, then taps the words the
// student has to supply. The student sees the same picture with those words
// replaced by boxes to type into.
//
// It lives in homework_items like every other item: `image_url` is the picture
// and `content` is the overlay as JSON, so it rides the existing builder, the
// student's runner, the submission and the marking without a table of its own.
//
// Positions are PERCENTAGES of the picture, never pixels: the same homework has
// to read the same on a laptop and on a phone.
// ---------------------------------------------------------------------------
import React, { useRef, useState } from 'react';

export interface PictureText {
  id: string;
  /** Top-left of the line, as a percentage of the picture. */
  x: number;
  y: number;
  /** Font size as a percentage of the picture's width, so it scales with it. */
  size: number;
  color: string;
  text: string;
  /** Indexes into the whitespace-split words of `text` that the student fills. */
  blanks: number[];
  // ── Everything below is OPTIONAL, so an overlay saved before any of it
  //    existed reads back exactly as it did and old homework is untouched. ──
  /** A box behind the words. Empty or missing = none. */
  bg?: string;
  /** Border colour and its thickness, in em (0 or missing = no border). */
  border?: string;
  borderWidth?: number;
  /** Corner rounding and inner spacing, in em so they follow the font size. */
  radius?: number;
  pad?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'start' | 'center' | 'end';
  /** Dark halo behind the letters, for writing over a busy photo. Missing =
   *  on for white text only, which is what it always did. */
  halo?: boolean;
  /** Wrap at this width (% of the picture). Missing = shrink to fit. */
  width?: number;
}
export interface PictureOverlay { texts: PictureText[] }

const EMPTY: PictureOverlay = { texts: [] };

export const parseOverlay = (content?: string): PictureOverlay => {
  if (!content) return EMPTY;
  try {
    const o = JSON.parse(content) as PictureOverlay;
    return Array.isArray(o?.texts) ? o : EMPTY;
  } catch { return EMPTY; }
};

export const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** Every blank in an item, in the order the student meets them. */
export const blanksOf = (overlay: PictureOverlay): Array<{ textId: string; index: number; word: string }> => {
  const out: Array<{ textId: string; index: number; word: string }> = [];
  for (const t of overlay.texts) {
    const w = wordsOf(t.text);
    for (const i of [...t.blanks].sort((a, b) => a - b)) {
      if (w[i] !== undefined) out.push({ textId: t.id, index: i, word: w[i] });
    }
  }
  return out;
};

const COLORS = ['#111827', '#FFFFFF', '#B91C1C', '#1D4ED8', '#047857', '#B45309'];
const PALE = new Set(['#FFFFFF']);

const haloOn = (t: PictureText): boolean => t.halo ?? PALE.has((t.color ?? '').toUpperCase());

/** The look of one line — used by the tutor's editor, the student's copy AND
 *  the marking screen, so what the tutor builds is exactly what is answered.
 *  Sizes are in em (the line's own font size), never px, so the whole thing
 *  scales with the picture the way the text already did. */
export const textBoxStyle = (t: PictureText): React.CSSProperties => ({
  fontSize: `${t.size}cqw`,
  color: t.color,
  fontWeight: t.bold ? 800 : 400,
  fontStyle: t.italic ? 'italic' : 'normal',
  textAlign: t.align ?? 'start',
  width: t.width ? `${t.width}cqw` : undefined,
  background: t.bg || 'transparent',
  border: t.borderWidth ? `${t.borderWidth}em solid ${t.border || t.color}` : undefined,
  borderRadius: `${t.radius ?? 0.2}em`,
  padding: t.pad ? `${t.pad}em ${t.pad * 1.3}em` : undefined,
  textShadow: haloOn(t) ? '0 1px 3px rgba(0,0,0,0.75)' : 'none',
});

const BG_COLORS = ['#FFFFFF', '#000000', '#FEF3C7', '#DBEAFE', '#DCFCE7', '#FEE2E2'];

/** A row of colours with an optional "none". */
const Swatches: React.FC<{
  label: string; value?: string; colors: string[]; none?: boolean;
  onPick: (c: string) => void;
}> = ({ label, value, colors, none, onPick }) => (
  <span className="flex items-center gap-1">
    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 me-0.5">{label}</span>
    {none && (
      <button type="button" onClick={() => onPick('')} title="None" aria-label={`${label}: none`}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-bold bg-white dark:bg-gray-700 text-slate-400 ${
          !value ? 'border-teal-600' : 'border-slate-300 dark:border-gray-600'}`}>&#10005;</button>
    )}
    {colors.map(c => (
      <button key={c} type="button" onClick={() => onPick(c)} aria-label={`${label} ${c}`}
        className={`w-6 h-6 rounded-full border-2 ${
          (value ?? '').toUpperCase() === c.toUpperCase() ? 'border-teal-600' : 'border-slate-300 dark:border-gray-600'}`}
        style={{ background: c }} />
    ))}
    <input type="color" value={value || '#000000'} aria-label={`${label}: any other colour`}
      onChange={e => onPick(e.target.value)}
      className="w-7 h-7 rounded border border-slate-300 dark:border-gray-600 bg-transparent" />
  </span>
);

/** A box about as wide as the word it stands in for — measured in `em`, which
 *  is the text's own size, so it grows and shrinks with the picture instead of
 *  swallowing it. */
const blankBox = (word: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
  display: 'inline-block',
  width: `${Math.max(2.4, word.length * 0.58 + 0.9)}em`,
  maxWidth: '40cqw',
  ...extra,
});

// ── The tutor's editor ──────────────────────────────────────────────────────

export const PictureEditor: React.FC<{
  imageUrl: string;
  overlay: PictureOverlay;
  onChange: (next: PictureOverlay) => void;
}> = ({ imageUrl, overlay, onChange }) => {
  const frame = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(overlay.texts[0]?.id ?? null);
  const chosen = overlay.texts.find(t => t.id === picked) ?? null;

  const patch = (id: string, p: Partial<PictureText>) =>
    onChange({ texts: overlay.texts.map(t => (t.id === id ? { ...t, ...p } : t)) });

  const addText = () => {
    const t: PictureText = {
      id: `t${Date.now().toString(36)}`, x: 8, y: 8, size: 4.5,
      color: '#111827', text: 'اكتب هنا', blanks: [],
    };
    onChange({ texts: [...overlay.texts, t] });
    setPicked(t.id);
  };

  const removeText = (id: string) => {
    onChange({ texts: overlay.texts.filter(t => t.id !== id) });
    setPicked(null);
  };

  /** Set while a drag is actually moving, so the word underneath the pointer
   *  does not also toggle itself into a blank when the drag ends. */
  const draggedRef = useRef(false);

  /** Drag a line around the picture; the position stays in percentages.
   *
   *  Every word is a button (tap it to make it a blank), and those buttons used
   *  to swallow the pointer — so the only draggable part of a line was the
   *  slivers of space between words, which is why moving text was so fiddly.
   *  Now a press anywhere on the line starts a drag, and a few pixels of slop
   *  decide which it was: moved = a drag, stayed still = a tap on that word. */
  const startDrag = (e: React.PointerEvent, t: PictureText, onWord = false) => {
    // Not on a word: a button needs its click left alone to toggle the blank.
    if (!onWord) e.preventDefault();
    e.stopPropagation();
    setPicked(t.id);
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    draggedRef.current = false;
    const x0 = e.clientX, y0 = e.clientY;
    const dx = e.clientX - (box.left + (t.x / 100) * box.width);
    const dy = e.clientY - (box.top + (t.y / 100) * box.height);
    const move = (ev: PointerEvent) => {
      if (!draggedRef.current
        && Math.abs(ev.clientX - x0) < 4 && Math.abs(ev.clientY - y0) < 4) return;
      draggedRef.current = true;
      patch(t.id, {
        x: Math.max(0, Math.min(96, ((ev.clientX - dx - box.left) / box.width) * 100)),
        y: Math.max(0, Math.min(96, ((ev.clientY - dy - box.top) / box.height) * 100)),
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  /** The grab handle is a real button, so it takes focus and the arrow keys
   *  place a line far more precisely than any hand can drag it. */
  const nudge = (e: React.KeyboardEvent, t: PictureText) => {
    const step = e.shiftKey ? 2 : 0.5;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const m = by[e.key];
    if (!m) return;
    e.preventDefault();
    patch(t.id, { x: Math.max(0, Math.min(96, t.x + m[0])), y: Math.max(0, Math.min(96, t.y + m[1])) });
  };

  const duplicate = (t: PictureText) => {
    const copy: PictureText = { ...t, id: `t${Date.now().toString(36)}`, x: Math.min(92, t.x + 3), y: Math.min(92, t.y + 5) };
    onChange({ texts: [...overlay.texts, copy] });
    setPicked(copy.id);
  };

  return (
    <div className="space-y-3">
      {/* A press on the picture itself lets go of the line, which takes the
          handle off the words underneath it. */}
      <div ref={frame} style={{ containerType: 'inline-size' }} onPointerDown={() => setPicked(null)}
        className="relative select-none rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900">
        <img src={imageUrl} alt="" className="w-full block" draggable={false} />
        {overlay.texts.map(t => {
          const words = wordsOf(t.text);
          const on = t.id === picked;
          return (
            <div key={t.id} onPointerDown={e => startDrag(e, t)}
              style={{
                ...textBoxStyle(t),
                position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, cursor: 'move',
                lineHeight: 1.5,
                outline: on ? '2px dashed #0d9488' : 'none', outlineOffset: 4,
              }}
              dir="auto">
              <span>
                {words.map((w, i) => (
                  <button key={i} type="button"
                    onPointerDown={e => startDrag(e, t, true)}
                    onClick={() => {
                      if (draggedRef.current) return;   // that was a drag, not a tap
                      patch(t.id, {
                        blanks: t.blanks.includes(i) ? t.blanks.filter(b => b !== i) : [...t.blanks, i],
                      });
                    }}
                    title={t.blanks.includes(i) ? 'A blank — tap to put the word back' : 'Tap to make this a blank'}
                    style={{
                      font: 'inherit', color: 'inherit', background: t.blanks.includes(i) ? 'rgba(13,148,136,0.22)' : 'transparent',
                      border: t.blanks.includes(i) ? '1px dashed currentColor' : '1px solid transparent',
                      borderRadius: 4, padding: '0 2px', margin: '0 1px', cursor: 'pointer',
                    }}>
                    {w}
                  </button>
                ))}
              </span>
              {/* The grab handle, straddling the TOP-RIGHT corner of the box, so
                  it never sits over a word — a covered word cannot be tapped
                  into a blank, which is the other half of this editor's job. It
                  tucks fully inside for a line at the very top of the picture,
                  where half of it would otherwise be clipped away. Sized in px,
                  not em, so it stays the same easy target however small the
                  writing. `right` is physical, so it is the visual right-hand
                  corner for Arabic too. */}
              {on && (
                <button type="button"
                  onPointerDown={e => startDrag(e, t)}
                  onKeyDown={e => nudge(e, t)}
                  aria-label="Move this text"
                  title="Drag to move this text · arrow keys to nudge it (hold Shift for bigger steps)"
                  style={{
                    position: 'absolute', right: 0, top: 0,
                    transform: t.y < 3 ? 'translate(50%, 10%)' : 'translate(50%, -50%)',
                    width: 24, height: 24, borderRadius: 9999, cursor: 'move',
                    background: '#0d9488', border: '2px solid #FFFFFF', color: '#FFFFFF',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.45)', padding: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2v20M2 12h20M12 2 9 5M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addText}
          className="h-9 px-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold">+ Add text</button>
        {overlay.texts.length > 1 && (
          <select value={picked ?? ''} onChange={e => setPicked(e.target.value)}
            aria-label="Which line of text"
            className="h-9 px-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-bold">
            {overlay.texts.map((t, i) => <option key={t.id} value={t.id}>Text {i + 1}</option>)}
          </select>
        )}
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Drag anywhere on a line to move it, or grab the handle · tap a word to make it a blank
        </span>
      </div>

      {chosen && (
        <div className="rounded-xl border border-slate-200 dark:border-gray-700 p-3 space-y-2 bg-white dark:bg-gray-800">
          <textarea value={chosen.text} rows={2} dir="auto"
            onChange={e => patch(chosen.id, { text: e.target.value })}
            aria-label="The words on the picture"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-slate-100" />
          {/* Size, weight and how the line sits */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Size
              <input type="range" min={2} max={14} step={0.25} value={chosen.size}
                onChange={e => patch(chosen.id, { size: Number(e.target.value) })} />
            </label>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => patch(chosen.id, { bold: !chosen.bold })}
                aria-pressed={!!chosen.bold} title="Bold"
                className={`w-8 h-8 rounded-lg border text-sm font-black ${chosen.bold
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>B</button>
              <button type="button" onClick={() => patch(chosen.id, { italic: !chosen.italic })}
                aria-pressed={!!chosen.italic} title="Italic"
                className={`w-8 h-8 rounded-lg border text-sm font-bold italic ${chosen.italic
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>I</button>
              <button type="button" onClick={() => patch(chosen.id, { halo: !haloOn(chosen) })}
                aria-pressed={haloOn(chosen)} title="Shadow behind the letters — makes writing readable over a busy photo"
                className={`h-8 px-2 rounded-lg border text-[11px] font-bold ${haloOn(chosen)
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>Shadow</button>
            </span>
            <span className="flex items-center gap-1">
              {([['start', 'Start'], ['center', 'Centre'], ['end', 'End']] as const).map(([a, label]) => (
                <button key={a} type="button" onClick={() => patch(chosen.id, { align: a })}
                  aria-pressed={(chosen.align ?? 'start') === a} title={`Align ${label.toLowerCase()}`}
                  className={`h-8 px-2 rounded-lg border text-[11px] font-bold ${(chosen.align ?? 'start') === a
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>{label}</button>
              ))}
            </span>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400"
              title="Wrap the line at this width instead of letting it run across the picture">
              Wrap
              <input type="range" min={0} max={100} step={2} value={chosen.width ?? 0}
                onChange={e => {
                  const v = Number(e.target.value);
                  patch(chosen.id, { width: v === 0 ? undefined : v });
                }} />
              <span className="w-8 tabular-nums">{chosen.width ? `${chosen.width}%` : 'off'}</span>
            </label>
          </div>

          {/* Colour of the writing */}
          <div className="flex flex-wrap items-center gap-3">
            <Swatches label="Text" value={chosen.color} colors={COLORS}
              onPick={c => patch(chosen.id, { color: c })} />
          </div>

          {/* The box behind it */}
          <div className="flex flex-wrap items-center gap-3">
            <Swatches label="Background" value={chosen.bg} colors={BG_COLORS} none
              onPick={c => patch(chosen.id, { bg: c, pad: c ? (chosen.pad || 0.2) : chosen.pad })} />
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Padding
              <input type="range" min={0} max={1} step={0.05} value={chosen.pad ?? 0}
                onChange={e => patch(chosen.id, { pad: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Corners
              <input type="range" min={0} max={1.5} step={0.05} value={chosen.radius ?? 0.2}
                onChange={e => patch(chosen.id, { radius: Number(e.target.value) })} />
            </label>
          </div>

          {/* Its border */}
          <div className="flex flex-wrap items-center gap-3">
            <Swatches label="Border" value={chosen.border} colors={COLORS} none
              onPick={c => patch(chosen.id, {
                border: c,
                borderWidth: c ? (chosen.borderWidth || 0.08) : 0,
              })} />
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Thickness
              <input type="range" min={0} max={0.3} step={0.02} value={chosen.borderWidth ?? 0}
                onChange={e => {
                  const v = Number(e.target.value);
                  patch(chosen.id, { borderWidth: v, border: chosen.border || chosen.color });
                }} />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-slate-100 dark:border-gray-700">
            <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {chosen.blanks.length} blank{chosen.blanks.length === 1 ? '' : 's'}
            </span>
            <span className="flex-grow" />
            <button type="button" onClick={() => duplicate(chosen)}
              className="h-8 px-3 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-gray-700">
              Duplicate
            </button>
            <button type="button" onClick={() => removeText(chosen.id)}
              className="h-8 px-3 rounded-lg text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20">
              Remove this text
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── The student's side ──────────────────────────────────────────────────────

export const PictureAnswer: React.FC<{
  imageUrl: string;
  overlay: PictureOverlay;
  answers: Record<number, string>;
  onAnswer: (blankIndex: number, value: string) => void;
  readOnly?: boolean;
}> = ({ imageUrl, overlay, answers, onAnswer, readOnly }) => {
  const order = blanksOf(overlay);
  const indexOf = (textId: string, i: number) => order.findIndex(b => b.textId === textId && b.index === i);
  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700" style={{ containerType: 'inline-size' }}>
      <img src={imageUrl} alt="" className="w-full block" draggable={false} />
      {overlay.texts.map(t => (
        <div key={t.id} dir="auto"
          style={{
            ...textBoxStyle(t),
            position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, lineHeight: 1.6,
          }}>
          {wordsOf(t.text).map((w, i) => {
            if (!t.blanks.includes(i)) return <span key={i} style={{ margin: '0 1px' }}>{w} </span>;
            const n = indexOf(t.id, i);
            return (
              <input key={i} value={answers[n] ?? ''} readOnly={readOnly}
                onChange={e => onAnswer(n, e.target.value)}
                aria-label={`Missing word ${n + 1}`} dir="auto"
                style={{
                  ...blankBox(w),
                  font: 'inherit', color: '#0F172A', background: 'rgba(255,255,255,0.94)',
                  border: '2px solid #0d9488', borderRadius: 6, padding: '0 4px', margin: '0 2px',
                  textAlign: 'center',
                }} />
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ── The tutor marking it ────────────────────────────────────────────────────

export const PictureReview: React.FC<{
  imageUrl: string;
  overlay: PictureOverlay;
  answers: Record<number, string>;
}> = ({ imageUrl, overlay, answers }) => {
  const order = blanksOf(overlay);
  return (
    <div className="space-y-3">
      <PictureAnswer imageUrl={imageUrl} overlay={overlay} answers={answers} onAnswer={() => {}} readOnly />
      <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-gray-700/50 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2 text-start w-10">#</th>
              <th className="px-3 py-2 text-start">They wrote</th>
              <th className="px-3 py-2 text-start">The word</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
            {order.map((b, n) => {
              const said = (answers[n] ?? '').trim();
              const same = said === b.word.trim();
              return (
                <tr key={`${b.textId}-${b.index}`}>
                  <td className="px-3 py-2 text-slate-400 font-bold">{n + 1}</td>
                  <td className={`px-3 py-2 font-bold ${same ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-100'}`} dir="auto">
                    {said || <span className="text-slate-400 font-normal">— left empty</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400" dir="auto">{b.word}</td>
                </tr>
              );
            })}
            {order.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-400">No blanks in this picture.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
