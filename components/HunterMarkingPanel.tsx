// components/HunterMarkingPanel.tsx
// -----------------------------------------------------------------------------
// The tutor goes through the drawings a student handed in.
//
// The listening rounds marked themselves on his device, so what is left is the
// writing: one drawing at a time, big enough to see whether the dot is in the
// right place, with the tutor's own pen over the top of it. His ink goes on its
// own layer, so correcting a letter never destroys what the student drew — the
// student sees both when the mark comes back.
// -----------------------------------------------------------------------------
import React, { useState } from 'react';
import HunterBoard from './HunterBoard';
import { C, ARABIC, Tick, Cross } from './LettersHunterChallenge';
import type { Stroke } from '../services/hunterBoardService';
import {
  markHunterHomework, type HunterHomework, type HunterDrawing, type HunterVerdict,
} from '../services/lettersHunterHomeworkService';

const VERDICTS: { id: HunterVerdict; label: string; bg: string; bd: string; ink: string }[] = [
  { id: 'right',  label: 'Correct',       bg: C.mintBg,  bd: C.mint,   ink: C.mintInk },
  { id: 'better', label: 'Can be better', bg: 'var(--h-better-bg)', bd: 'var(--h-better)', ink: 'var(--h-better-ink)' },
  { id: 'wrong',  label: 'Wrong',         bg: C.roseBg,  bd: C.rose,   ink: C.roseInk },
];

const HunterMarkingPanel: React.FC<{
  hw: HunterHomework;
  onClose: () => void;
  onMarked: (hw: HunterHomework) => void;
}> = ({ hw, onClose, onMarked }) => {
  const [drawings, setDrawings] = useState<HunterDrawing[]>(hw.drawings ?? []);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const current = drawings[at];
  const marked = drawings.filter(d => d.verdict).length;
  const allMarked = drawings.length > 0 && marked === drawings.length;

  const setOne = (patch: Partial<HunterDrawing>) =>
    setDrawings(ds => ds.map((d, i) => (i === at ? { ...d, ...patch } : d)));

  const judge = (v: HunterVerdict) => {
    setOne({ verdict: v });
    if (at + 1 < drawings.length) setAt(n => n + 1);
  };

  /** Only the tutor's own strokes are kept back — the student's stay as drawn. */
  const keepInk = (all: Stroke[]) =>
    setOne({ tutorStrokes: all.filter(s => s.owner === 'tutor') });

  const send = async () => {
    setBusy(true); setErr('');
    const ok = await markHunterHomework(hw, drawings);
    setBusy(false);
    if (!ok) { setErr('Could not send the mark. Try again.'); return; }
    onMarked({ ...hw, drawings, status: 'marked', markedAt: new Date().toISOString() });
  };

  return (
    <div className="hunter-skin fixed inset-0 z-[80] flex flex-col"
      style={{ background: C.ground, color: C.cream, fontFamily: "'Nunito', system-ui, sans-serif" }}>

      <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-5 py-3.5" style={{ borderBottom: `1px solid var(--h-rule)` }}>
        <div className="min-w-0">
          <p className="m-0 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.coral }}>Homework · letters hunter</p>
          <p className="m-0 mt-1 text-[18px] font-extrabold">
            {hw.studentName ?? 'Your student'} ·{' '}
            <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 21 }}>{hw.letters.join(' ')}</span>
          </p>
        </div>
        <span className="flex-grow" />
        {hw.autoTotal != null && (
          <span className="h-9 px-3.5 rounded-full text-[12.5px] font-bold flex items-center"
            style={{ background: 'var(--h-mint-dim)', border: `1px solid var(--h-mint-line)`, color: C.mint }}>
            The listening rounds marked themselves · {hw.autoRight}/{hw.autoTotal}
          </span>
        )}
        <span className="h-9 px-3.5 rounded-full text-[12.5px] font-bold flex items-center"
          style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.body }}>
          {marked} of {drawings.length} marked
        </span>
        <button type="button" onClick={onClose} aria-label="Close"
          className="w-10 h-10 rounded-[11px] flex items-center justify-center"
          style={{ background: 'transparent', border: 0, color: C.muted }}>
          <Cross size={19} />
        </button>
      </div>

      {drawings.length === 0 ? (
        <div className="flex-grow flex items-center justify-center px-8 text-center">
          <p className="m-0 text-[16px]" style={{ color: C.muted }}>He was not set any writing in this one.</p>
        </div>
      ) : (
        <div className="flex-grow flex gap-4 px-5 py-4 min-h-0">
          <div className="flex-grow flex flex-col min-w-0">
            <p className="m-0 mb-2 text-[13.5px]" style={{ color: C.body }}>
              He heard <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 22, color: C.cream }}>{current?.letter}</span>
              {' '}· draw on it to show him
            </p>
            <HunterBoard
              key={at}
              roomId={null}
              me="tutor"
              isHost={false}
              round={at}
              initial={[...(current?.strokes ?? []), ...(current?.tutorStrokes ?? [])]}
              onStrokes={keepInk}
              toolsInside
              className="flex-grow min-h-0"
            />
            <div className="flex-shrink-0 flex gap-2.5 pt-3">
              {VERDICTS.map(v => (
                <button key={v.id} type="button" onClick={() => judge(v.id)}
                  className="flex-1 h-14 rounded-[15px] text-[15.5px] font-extrabold"
                  style={{
                    background: current?.verdict === v.id ? v.bg : 'transparent',
                    border: `1px solid ${v.bd}`, color: current?.verdict === v.id ? v.ink : v.bd,
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 w-[190px] flex flex-col gap-2 overflow-y-auto">
            <p className="m-0 mb-1 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.muted }}>
              His {drawings.length}
            </p>
            {drawings.map((d, i) => (
              <button key={i} type="button" onClick={() => setAt(i)}
                className="relative rounded-[14px] overflow-hidden text-left"
                style={{ background: 'var(--h-paper)', border: `${i === at ? 2 : 1}px solid ${i === at ? C.coral : C.line}`, height: 104 }}>
                <HunterBoard roomId={null} me="tutor" isHost={false} round={0} readOnly
                  initial={[...(d.strokes ?? []), ...(d.tutorStrokes ?? [])]} className="h-full p-1" />
                <span className="absolute top-1.5 left-2 text-[12px]" style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--h-paper-dim)' }}>{i + 1}</span>
                {d.verdict && (
                  <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: d.verdict === 'right' ? 'var(--h-mint)' : d.verdict === 'better' ? 'var(--h-better)' : 'var(--h-rose)', color: '#fff' }}>
                    {d.verdict === 'wrong' ? <Cross size={11} /> : <Tick size={11} />}
                  </span>
                )}
              </button>
            ))}
            <span className="flex-grow" />
            <button type="button" onClick={() => void send()} disabled={busy || !allMarked}
              className="h-14 rounded-[15px] text-[15px] font-extrabold disabled:opacity-50"
              style={{ background: C.coral, color: C.onCoral, border: 0 }}>
              {busy ? 'Sending…' : 'Send him the mark'}
            </button>
            {!allMarked && <p className="m-0 text-[11.5px] text-center" style={{ color: C.dim }}>Mark all of them first</p>}
            {err && <p role="alert" className="m-0 text-[12px] text-center" style={{ color: 'var(--h-bad-ink)' }}>{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default HunterMarkingPanel;
