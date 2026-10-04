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

  /** Drag a line around the picture; the position stays in percentages. */
  const startDrag = (e: React.PointerEvent, t: PictureText) => {
    e.preventDefault(); e.stopPropagation();
    setPicked(t.id);
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const dx = e.clientX - (box.left + (t.x / 100) * box.width);
    const dy = e.clientY - (box.top + (t.y / 100) * box.height);
    const move = (ev: PointerEvent) => {
      patch(t.id, {
        x: Math.max(0, Math.min(96, ((ev.clientX - dx - box.left) / box.width) * 100)),
        y: Math.max(0, Math.min(96, ((ev.clientY - dy - box.top) / box.height) * 100)),
      });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  return (
    <div className="space-y-3">
      <div ref={frame} style={{ containerType: 'inline-size' }}
        className="relative select-none rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900">
        <img src={imageUrl} alt="" className="w-full block" draggable={false} />
        {overlay.texts.map(t => {
          const words = wordsOf(t.text);
          const on = t.id === picked;
          return (
            <div key={t.id} onPointerDown={e => startDrag(e, t)}
              style={{
                position: 'absolute', left: `${t.x}%`, top: `${t.y}%`, cursor: 'move',
                fontSize: `${t.size}cqw`, color: t.color, lineHeight: 1.5,
                textShadow: PALE.has(t.color.toUpperCase()) ? '0 1px 3px rgba(0,0,0,0.75)' : 'none',
                outline: on ? '2px dashed #0d9488' : 'none', outlineOffset: 4, borderRadius: 4,
              }}
              dir="auto">
              <span>
                {words.map((w, i) => (
                  <button key={i} type="button"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => patch(t.id, {
                      blanks: t.blanks.includes(i) ? t.blanks.filter(b => b !== i) : [...t.blanks, i],
                    })}
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
          Drag a line to move it · tap a word to make it a blank
        </span>
      </div>

      {chosen && (
        <div className="rounded-xl border border-slate-200 dark:border-gray-700 p-3 space-y-2 bg-white dark:bg-gray-800">
          <textarea value={chosen.text} rows={2} dir="auto"
            onChange={e => patch(chosen.id, { text: e.target.value })}
            aria-label="The words on the picture"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-slate-100" />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Size
              <input type="range" min={2} max={14} step={0.25} value={chosen.size}
                onChange={e => patch(chosen.id, { size: Number(e.target.value) })} />
            </label>
            <span className="flex items-center gap-1">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => patch(chosen.id, { color: c })}
                  aria-label={`Colour ${c}`}
                  className={`w-6 h-6 rounded-full border-2 ${chosen.color === c ? 'border-teal-600' : 'border-slate-300 dark:border-gray-600'}`}
                  style={{ background: c }} />
              ))}
              <input type="color" value={chosen.color} aria-label="Any other colour"
                onChange={e => patch(chosen.id, { color: e.target.value })}
                className="w-7 h-7 rounded border border-slate-300 dark:border-gray-600 bg-transparent" />
            </span>
            <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300">
              {chosen.blanks.length} blank{chosen.blanks.length === 1 ? '' : 's'}
            </span>
            <span className="flex-grow" />
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
            position: 'absolute', left: `${t.x}%`, top: `${t.y}%`,
            fontSize: `${t.size}cqw`, color: t.color, lineHeight: 1.6,
            textShadow: PALE.has(t.color.toUpperCase()) ? '0 1px 3px rgba(0,0,0,0.75)' : 'none',
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
