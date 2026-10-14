// components/HunterHomeworkPage.tsx
// -----------------------------------------------------------------------------
// The hunt as homework, from the student's side (/hunt/<id>).
//
// Three rounds at most — spot the letter, sound discrimination, write — and the
// difference from the lesson is who decides. The two listening rounds mark
// themselves, because he taps the cells himself and the app knows which were
// right. The drawings decide nothing: they are handed in, and the mark only
// appears once the tutor has been through them.
//
// No sign-in: everything goes through the security-definer functions, so a link
// is enough and the table stays shut.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useState } from 'react';
import { C, RowRound, Speaker, Tick, Cross, ARABIC } from './LettersHunterChallenge';
import HunterBoard from './HunterBoard';
import { letterAudioUrl, speakLetter } from '../services/letterAudioService';
import { subMeta, scoreOf, type SubId, type SubScore, type RoundResult } from '../services/lettersHunterService';
import type { Stroke } from '../services/hunterBoardService';
import {
  getHunterHomework, submitHunterHomework, hunterMark, dueLabel, HOMEWORK_SUBS,
  type HunterHomework, type HunterDrawing,
} from '../services/lettersHunterHomeworkService';

const shellStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: C.ground, color: C.cream,
  fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column',
  paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
};

const VERDICT_LOOK = {
  right:  { bg: C.mintBg, bd: C.mint, ink: C.mintInk, label: 'Right' },
  better: { bg: '#2E1B10', bd: '#D4642F', ink: '#FFD9C2', label: 'Can be better' },
  wrong:  { bg: C.roseBg, bd: C.rose, ink: C.roseInk, label: 'Not right' },
};

/* ── Writing the letters he hears, alone ─────────────────────────────────── */

const WriteHomework: React.FC<{
  letters: string[];
  rounds: number;
  onDone: (drawings: HunterDrawing[]) => void;
}> = ({ letters, rounds, onDone }) => {
  const [pos, setPos] = useState(0);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [done, setDone] = useState<HunterDrawing[]>([]);
  const [queue] = useState<string[]>(() =>
    Array.from({ length: rounds }, () => letters[Math.floor(Math.random() * letters.length)]));

  const letter = queue[pos];

  const say = useCallback((l: string) => {
    const audio = new Audio(letterAudioUrl(l, 'plain'));
    audio.onerror = () => speakLetter(l);
    audio.play().catch(() => speakLetter(l));
  }, []);

  useEffect(() => { const t = window.setTimeout(() => say(letter), 400); return () => window.clearTimeout(t); }, [letter, say]);

  const handIn = () => {
    const all = [...done, { letter, strokes }];
    setDone(all);
    setStrokes([]);
    if (pos + 1 < rounds) setPos(p => p + 1);
    else onDone(all);
  };

  return (<>
    <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-4 py-2.5">
      <span className="text-[15px] font-extrabold">Write what you hear</span>
      <span className="text-[14px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>{pos + 1} / {rounds}</span>
      <span className="flex-grow" />
      <button type="button" onClick={() => say(letter)}
        className="h-11 px-5 rounded-xl text-[14.5px] font-extrabold flex items-center gap-2.5"
        style={{ background: C.coral, color: C.onCoral, border: 0 }}>
        <Speaker size={18} /> Hear it again
      </button>
    </div>

    <HunterBoard roomId={null} me="student" isHost={false} round={pos}
      onStrokes={setStrokes} className="flex-grow px-3 pb-2 min-h-0" />

    <div className="flex-shrink-0 px-4 pb-5 pt-1">
      <button type="button" onClick={handIn} disabled={strokes.length === 0}
        className="w-full h-14 rounded-[16px] text-base font-extrabold disabled:opacity-50"
        style={{ background: strokes.length ? C.coral : C.raised, color: strokes.length ? C.onCoral : C.muted, border: 0 }}>
        {pos + 1 < rounds ? 'Hand this one in' : 'Hand them all in'}
      </button>
      <p className="m-0 mt-2.5 text-center text-[12.5px]" style={{ color: C.dim }}>
        {strokes.length ? 'Your teacher looks at them and marks them.' : 'Write the letter on the board first.'}
      </p>
    </div>
  </>);
};

/* ── The page ────────────────────────────────────────────────────────────── */

const HunterHomeworkPage: React.FC<{ homeworkId: string }> = ({ homeworkId }) => {
  const [hw, setHw] = useState<HunterHomework | null>(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState(0);
  const [scores, setScores] = useState<SubScore[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getHunterHomework(homeworkId).then(h => { setHw(h); setLoading(false); });
  }, [homeworkId]);

  /** Only the rounds that were set, in the order they are played. */
  const order: SubId[] = hw ? HOMEWORK_SUBS.filter(id => hw.plan?.[id]?.on) : [];
  const sub = order[at];

  const finish = async (drawings: HunterDrawing[], auto: SubScore[]) => {
    if (!hw) return;
    setSending(true);
    const right = auto.reduce((n, s) => n + s.right, 0);
    const total = auto.reduce((n, s) => n + s.rounds, 0);
    const ok = await submitHunterHomework(hw, right, total, auto, drawings);
    setSending(false);
    if (ok) setSent(true);
    else setHw(await getHunterHomework(homeworkId));   // someone handed it in already
  };

  const bank = (id: SubId, results: RoundResult[]) => {
    const next = [...scores, scoreOf(id, results)];
    setScores(next);
    if (at + 1 < order.length) setAt(n => n + 1);
    else void finish([], next);                        // no writing round in this one
  };

  if (loading) return (
    <div style={shellStyle} className="items-center justify-center">
      <span className="w-9 h-9 rounded-full animate-spin" style={{ border: `3px solid ${C.faint}`, borderTopColor: C.coral }} />
    </div>
  );

  if (!hw) return (
    <div style={shellStyle} className="items-center justify-center px-8 text-center">
      <p className="m-0 text-[19px] font-extrabold">This homework is not here</p>
      <p className="m-0 mt-2 text-sm" style={{ color: C.muted }}>The link may be old. Ask your teacher for a new one.</p>
    </div>
  );

  /* ── already handed in, or marked ── */
  if (sent || hw.status !== 'assigned') {
    const mark = hunterMark(hw);
    const drawn = hw.drawings ?? [];
    return (
      <div style={shellStyle}>
        <div className="flex-grow overflow-y-auto px-5 py-8 flex flex-col items-center">
          <p className="m-0 text-[12px] font-extrabold uppercase" style={{ letterSpacing: '0.16em', color: C.coral }}>Letters hunter</p>
          <h1 className="m-0 mt-3 text-[28px] font-extrabold text-center" style={{ letterSpacing: '-0.02em' }}>
            {mark ? 'Your teacher has marked it' : 'Handed in'}
          </h1>
          <p className="m-0 mt-2.5 text-[15px] text-center" style={{ color: C.body }}>
            {mark
              ? <>You got <strong style={{ color: C.cream }}>{mark.right} out of {mark.total}</strong>.</>
              : 'He will look at your writing and mark it.'}
          </p>

          <span lang="ar" dir="rtl" className="mt-6" style={{ fontFamily: ARABIC, fontSize: 64, color: C.cream }}>
            {hw.letters.join(' ')}
          </span>

          {hw.autoTotal != null && (
            <p className="m-0 mt-5 text-[14px]" style={{ color: C.muted }}>
              Listening rounds: {hw.autoRight} of {hw.autoTotal} right
            </p>
          )}

          {drawn.length > 0 && (
            <div className="mt-7 w-full max-w-[760px] grid grid-cols-2 sm:grid-cols-3 gap-3">
              {drawn.map((d, i) => {
                const look = d.verdict ? VERDICT_LOOK[d.verdict] : null;
                return (
                  <div key={i} className="rounded-[16px] overflow-hidden"
                    style={{ background: C.panel, border: `1px solid ${look ? look.bd : C.line}` }}>
                    <HunterBoard roomId={null} me="student" isHost={false} round={0} readOnly
                      initial={[...(d.strokes ?? []), ...(d.tutorStrokes ?? [])]} className="h-[150px] p-2" />
                    <p className="m-0 px-3 py-2 text-[12.5px] font-bold text-center"
                      style={{ background: look ? look.bg : 'transparent', color: look ? look.ink : C.muted }}>
                      {look ? look.label : 'waiting'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── doing it ── */
  if (!sub) return (
    <div style={shellStyle} className="items-center justify-center px-8 text-center">
      <p className="m-0 text-[17px] font-bold">Nothing was set in this one</p>
    </div>
  );

  return (
    <div style={shellStyle}>
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid #1C2840` }}>
        <span className="text-[11px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.coral }}>Letters hunter</span>
        <span className="flex-grow flex gap-1.5">
          {order.map((id, i) => (
            <span key={id} className="flex-1 h-[30px] rounded-[9px] flex items-center justify-center gap-1.5 text-[11.5px] font-bold px-1"
              style={{
                background: i < at ? '#12261F' : i === at ? '#1A2538' : '#111B2C',
                border: `1px solid ${i < at ? '#2E6B53' : i === at ? C.coral : C.faint}`,
                color: i < at ? C.mint : i === at ? C.cream : C.dim,
              }}>
              {i < at ? <Tick size={12} /> : <span style={{ fontFamily: 'ui-monospace, monospace' }}>{subMeta(id).n}</span>}
              <span className="truncate hidden sm:inline">{subMeta(id).name.split(' ')[0]}</span>
            </span>
          ))}
        </span>
        <span className="text-[12px] whitespace-nowrap" style={{ color: dueLabel(hw) === 'overdue' ? C.rose : C.muted }}>{dueLabel(hw)}</span>
      </div>

      {sending ? (
        <div className="flex-grow flex flex-col items-center justify-center gap-3">
          <span className="w-9 h-9 rounded-full animate-spin" style={{ border: `3px solid ${C.faint}`, borderTopColor: C.coral }} />
          <p className="m-0 text-sm" style={{ color: C.muted }}>Sending it to your teacher…</p>
        </div>
      ) : sub === 'write' ? (
        <WriteHomework letters={hw.letters} rounds={hw.plan.write.rounds}
          onDone={drawings => void finish(drawings, scores)} />
      ) : (
        <RowRound
          key={sub}
          letters={hw.letters}
          withVowels={sub === 'sounds'}
          rounds={hw.plan[sub].rounds}
          showNumbers={false}
          lastLabel={at + 1 < order.length ? 'Next' : 'Hand it in'}
          onDone={results => bank(sub, results)}
        />
      )}
    </div>
  );
};

export default HunterHomeworkPage;
