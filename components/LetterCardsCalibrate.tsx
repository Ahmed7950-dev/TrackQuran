// ─────────────────────────────────────────────────────────────────────────────
// LetterCardsCalibrate — TEMPORARY. Open any game with ?calibrate=1.
//
// Drag the cards around the board, pull the sliders for the letter, then press
// Copy: it prints the whole DEFAULT_LAYOUT ready to paste into
// components/letterCardsLayout.ts. Delete this file and the two lines that
// mount it once the numbers are settled.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useRef, useState } from 'react';
import { BOARD, Box, DEFAULT_LAYOUT, Layout, toPx } from './letterCardsLayout';
import { LetterCardsBoard } from './LetterCardsGame';
import type { Snap } from '../services/letterCardsEngine';

type Key =
  | { kind: 'student' | 'tutor'; i: number }
  | { kind: 'draw' | 'thrownTutor' | 'thrownStudent' };

const keyOf = (k: Key) => ('i' in k ? `${k.kind}${k.i}` : k.kind);

const boxOf = (l: Layout, k: Key): Box =>
  'i' in k ? (k.kind === 'student' ? l.studentHand[k.i] : l.tutorHand[k.i])
    : k.kind === 'draw' ? l.drawPile
    : k.kind === 'thrownTutor' ? l.thrownTutor : l.thrownStudent;

const withBox = (l: Layout, k: Key, b: Box): Layout => {
  if ('i' in k) {
    const list = [...(k.kind === 'student' ? l.studentHand : l.tutorHand)];
    list[k.i] = b;
    return k.kind === 'student' ? { ...l, studentHand: list } : { ...l, tutorHand: list };
  }
  if (k.kind === 'draw') return { ...l, drawPile: b };
  if (k.kind === 'thrownTutor') return { ...l, thrownTutor: b };
  return { ...l, thrownStudent: b };
};

const ALL: Key[] = [
  ...[0, 1, 2, 3, 4].map(i => ({ kind: 'student', i } as Key)),
  ...[0, 1, 2, 3, 4].map(i => ({ kind: 'tutor', i } as Key)),
  { kind: 'draw' }, { kind: 'thrownTutor' }, { kind: 'thrownStudent' },
];

const SNAP: Snap = {
  ph: 'playing', form: 'initial', mode: 'tutor',
  tutorHand: [
    { letter: 'ب', animal: 'lion' }, { letter: 'ج', animal: 'camel' },
    { letter: 'س', animal: 'eagle' }, { letter: 'ع', animal: 'fox' },
    { letter: 'م', animal: 'rabbit' },
  ],
  studentHand: [
    { letter: 'ج', animal: 'deer' }, { letter: 'م', animal: 'horse' },
    { letter: 'ب', animal: 'cow' }, { letter: 'ع', animal: 'tiger' },
    { letter: 'س', animal: 'monkey' },
  ],
  pile: ['ك', 'ن', 'ه', 'ي'],
  thrownTutor: { letter: 'ف', animal: 'gorilla' },
  thrownStudent: { letter: 'ف', animal: 'zebra' },
  turn: 'tutor', lives: 2, livesMax: 3, score: 3, mistakes: 1, total: 12,
  wrongLetters: {}, flash: null, ended: null,
};

const Num: React.FC<{ label: string; value: number; step?: number; min?: number; max?: number; onChange: (n: number) => void }> =
  ({ label, value, step = 1, min, max, onChange }) => (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-14 text-slate-400">{label}</span>
      <input type="range" min={min ?? 0} max={max ?? 100} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))} className="flex-1 min-w-0" />
      <input type="number" step={step} value={Math.round(value * 100) / 100}
        onChange={e => onChange(Number(e.target.value))}
        className="w-16 px-1 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-100 text-right" />
    </label>
  );

const LetterCardsCalibrate: React.FC = () => {
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [sel, setSel] = useState<Key>(ALL[0]);
  const [copied, setCopied] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ key: Key; dx: number; dy: number } | null>(null);

  const box = boxOf(layout, sel);
  const setBox = (b: Partial<Box>) => setLayout(l => withBox(l, sel, { ...boxOf(l, sel), ...b }));

  const onDown = (k: Key) => (e: React.PointerEvent) => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const b = boxOf(layout, k);
    setSel(k);
    drag.current = {
      key: k,
      dx: ((e.clientX - r.left) / r.width) * 100 - b.x,
      dy: ((e.clientY - r.top) / r.height) * 100 - b.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current, el = boardRef.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100 - d.dx;
    const y = ((e.clientY - r.top) / r.height) * 100 - d.dy;
    setLayout(l => withBox(l, d.key, { ...boxOf(l, d.key), x, y }));
  }, []);

  const code = () => {
    const line = (b: Box) => { const p = toPx(b); return `pc(${p.x}, ${p.y}, ${p.w}, ${p.h})`; };
    const r = (n: number) => Math.round(n * 100) / 100;
    return `export const DEFAULT_LAYOUT: Layout = {
  studentHand: [
    ${layout.studentHand.slice(0, 3).map(line).join(', ')},
    ${layout.studentHand.slice(3).map(line).join(', ')},
  ],
  tutorHand: [
    ${layout.tutorHand.slice(0, 3).map(line).join(', ')},
    ${layout.tutorHand.slice(3).map(line).join(', ')},
  ],
  drawPile: ${line(layout.drawPile)},
  thrownTutor: ${line(layout.thrownTutor)},
  thrownStudent: ${line(layout.thrownStudent)},
  letterBox: { x: ${r(layout.letterBox.x)}, y: ${r(layout.letterBox.y)}, w: ${r(layout.letterBox.w)}, h: ${r(layout.letterBox.h)} },
  letterSize: ${r(layout.letterSize)},
};`;
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-100 p-3 flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-amber-300 mb-2">
          Calibration — drag a card to move it, pick it below to size it. Board is {BOARD.w}×{BOARD.h}.
        </p>
        <div ref={boardRef} className="relative" onPointerMove={onMove}
          onPointerUp={() => { drag.current = null; }}>
          <LetterCardsBoard snap={SNAP} me="tutor" layout={layout} />
          {/* a grab handle over every slot */}
          {ALL.map(k => {
            const b = boxOf(layout, k);
            const on = keyOf(k) === keyOf(sel);
            return (
              <div key={keyOf(k)} onPointerDown={onDown(k)}
                title={keyOf(k)}
                style={{ position: 'absolute', left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
                className={`cursor-move ${on ? 'ring-4 ring-amber-400' : 'ring-1 ring-cyan-400/60'}`} />
            );
          })}
        </div>
      </div>

      <div className="w-full lg:w-[22rem] flex-shrink-0 space-y-3">
        <div className="flex flex-wrap gap-1">
          {ALL.map(k => (
            <button key={keyOf(k)} onClick={() => setSel(k)}
              className={`px-2 py-1 rounded text-[11px] font-bold ${
                keyOf(k) === keyOf(sel) ? 'bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-200'}`}>
              {keyOf(k)}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 p-3 rounded-xl bg-slate-800">
          <p className="text-[11px] font-black uppercase text-slate-400">{keyOf(sel)} — % of board</p>
          <Num label="x" value={box.x} step={0.05} onChange={n => setBox({ x: n })} />
          <Num label="y" value={box.y} step={0.05} onChange={n => setBox({ y: n })} />
          <Num label="w" value={box.w} step={0.05} max={40} onChange={n => setBox({ w: n })} />
          <Num label="h" value={box.h} step={0.05} max={60} onChange={n => setBox({ h: n })} />
          <p className="text-[11px] text-slate-400 pt-1">
            px: {(() => { const p = toPx(box); return `${p.x}, ${p.y}, ${p.w}, ${p.h}`; })()}
          </p>
          <button
            onClick={() => {
              const b = boxOf(layout, sel);
              setLayout(l => {
                let out = l;
                for (const k of ALL) {
                  if (('i' in k) !== ('i' in sel)) continue;
                  if ('i' in k && 'i' in sel && k.kind !== sel.kind) continue;
                  if (!('i' in k)) continue;
                  out = withBox(out, k, { ...boxOf(out, k), w: b.w, h: b.h });
                }
                return out;
              });
            }}
            className="w-full mt-1 py-1.5 rounded bg-slate-700 text-[12px] font-bold">
            Give the whole row this size
          </button>
        </div>

        <div className="space-y-1.5 p-3 rounded-xl bg-slate-800">
          <p className="text-[11px] font-black uppercase text-slate-400">The letter — % of a card</p>
          <Num label="size" value={layout.letterSize} step={0.5} max={80}
            onChange={n => setLayout(l => ({ ...l, letterSize: n }))} />
          <Num label="box x" value={layout.letterBox.x} step={0.5}
            onChange={n => setLayout(l => ({ ...l, letterBox: { ...l.letterBox, x: n } }))} />
          <Num label="box y" value={layout.letterBox.y} step={0.5}
            onChange={n => setLayout(l => ({ ...l, letterBox: { ...l.letterBox, y: n } }))} />
          <Num label="box w" value={layout.letterBox.w} step={0.5}
            onChange={n => setLayout(l => ({ ...l, letterBox: { ...l.letterBox, w: n } }))} />
          <Num label="box h" value={layout.letterBox.h} step={0.5}
            onChange={n => setLayout(l => ({ ...l, letterBox: { ...l.letterBox, h: n } }))} />
        </div>

        <button
          onClick={() => { navigator.clipboard?.writeText(code()).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="w-full h-11 rounded-xl bg-amber-400 text-slate-900 font-black">
          {copied ? 'Copied ✓' : 'Copy the numbers'}
        </button>
        <button onClick={() => setLayout(DEFAULT_LAYOUT)}
          className="w-full h-9 rounded-xl bg-slate-700 text-[13px] font-bold">Back to the saved ones</button>
        <pre className="text-[10px] leading-snug p-3 rounded-xl bg-black/50 overflow-auto max-h-64 whitespace-pre-wrap">{code()}</pre>
      </div>
    </div>
  );
};

export default LetterCardsCalibrate;
