// components/LettersHunterChallenge.tsx
// -----------------------------------------------------------------------------
// Letters Hunter — two or three letters a reader keeps mixing, hunted through
// a run of rounds.
//
//   LettersHunterSetup   the tutor turns rounds on and off and sets the counts
//   LettersHunterRun     full screen: the letters side by side, then the rounds
//
// Round 1 and round 2 are the same screen with one difference: whether the
// cells carry vowels. They share every piece of machinery here, because the
// only thing that changes is what counts as a match — and that question lives
// in the service, not in the UI.
//
// Nothing is auto-advanced on a wrong tap: a red cell stays red and the round
// goes on until every target is found, so the student sees the whole row he
// was choosing from rather than a screen that moves on without him.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { letterAudioUrl, speakLetter, warmSpeech, SET_MARK } from '../services/letterAudioService';
import {
  SUBS, subMeta, defaultPlan, playOrder, buildRow, targetsOf, sameCell, cellText, cellAudioSet,
  tally, logTitle, logDetail, dotsOf, introLine, enoughLetters,
  buildSayItem, buildSyllable, loadWords, loadVerses, pickItems, foldChar, refLabel,
  MIN_ROUNDS, MAX_ROUNDS, MIN_LETTERS, MAX_LETTERS,
  type HunterPlan, type SubId, type SubScore, type HunterRow, type HunterResult, type ShowItem,
} from '../services/lettersHunterService';
import { segmentWord } from '../services/tajweedColorService';
import { QRCodeSVG } from 'qrcode.react';
import HunterBoard from './HunterBoard';
import { boardUrl, newRoomId, type Stroke } from '../services/hunterBoardService';

const ARABIC = "'Hafs', 'Amiri', serif";

/** The hunt's own palette: ink ground, cream letters, one coral for the quarry.
 *  Deliberately not the Letter Sounds green or the Media amber. */
const C = {
  ground:  '#0B1220',
  panel:   '#141E31',
  raised:  '#1D2A42',
  line:    '#2A3A56',
  faint:   '#22304A',
  cream:   '#F4F0E6',
  body:    '#AEBCD2',
  muted:   '#7D8CA6',
  dim:     '#6F7E98',
  coral:   '#FF7A4D',
  onCoral: '#1A0C06',
  mintBg:  '#16342A',
  mint:    '#3FD39B',
  mintInk: '#E8FFF5',
  roseBg:  '#3A1520',
  rose:    '#E0556B',
  roseInk: '#FFE9ED',
};

const Speaker: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z" />
    <path d="M16 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.5 7a7 7 0 0 1 0 10" />
  </svg>
);

const Tick: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

const Cross: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={3.2} strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/* ── Setting it up ───────────────────────────────────────────────────────── */

export const LettersHunterSetup: React.FC<{
  letters: string[];
  onStart: (plan: HunterPlan) => void;
  onClose: () => void;
}> = ({ letters, onStart, onClose }) => {
  const [plan, setPlan] = useState<HunterPlan>(defaultPlan);

  const set = (id: SubId, patch: Partial<{ on: boolean; rounds: number }>) =>
    setPlan(p => ({ ...p, [id]: { ...p[id], ...patch } }));

  const bump = (id: SubId, by: number) =>
    set(id, { rounds: Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, plan[id].rounds + by)) });

  const chosen = playOrder(plan);

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center overflow-y-auto p-0 sm:p-6"
      style={{ background: 'rgba(4,8,16,0.78)' }} role="dialog" aria-modal="true" aria-label="Letters hunter">
      <div className="w-full sm:max-w-[760px] sm:rounded-[22px] overflow-hidden flex flex-col"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.cream, minHeight: '100dvh', maxHeight: '100dvh', fontFamily: "'Nunito', system-ui, sans-serif" }}>

        <div className="flex items-start gap-4 px-6 pt-6 pb-5" style={{ borderBottom: `1px solid ${C.faint}` }}>
          <div className="min-w-0 flex-grow">
            <p className="m-0 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.16em', color: C.coral }}>Letters hunter</p>
            <h2 className="m-0 mt-1.5 text-[25px] font-extrabold" style={{ letterSpacing: '-0.02em' }}>
              {letters.length === 2 ? 'Two letters he keeps mixing' : 'Three letters he keeps mixing'}
            </h2>
            <p className="m-0 mt-2 text-sm leading-relaxed" style={{ color: C.body }}>
              Turn off what you do not want today. The rounds run one after the other.
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center gap-2.5">
            {letters.map(l => (
              <span key={l} lang="ar" dir="rtl" className="flex items-center justify-center w-[62px] h-[62px] rounded-[17px]"
                style={{ background: C.raised, border: `1px solid ${C.coral}`, fontFamily: ARABIC, fontSize: 38, color: C.cream }}>
                {l}
              </span>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex-shrink-0 flex items-center justify-center w-11 h-11 -mt-1 -mr-2 rounded-xl"
            style={{ background: 'transparent', color: C.muted, border: 0 }}>
            <Cross size={19} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto px-6 py-5 flex flex-col gap-2.5">
          {SUBS.map(s => {
            const on = s.ready && plan[s.id].on;
            return (
              <div key={s.id} className="flex items-center gap-3.5 px-4 py-3.5 rounded-[14px]"
                style={{
                  background: s.ready ? (on ? '#1A2538' : '#10192A') : '#0F1828',
                  border: `1px ${s.ready ? 'solid' : 'dashed'} ${on ? C.coral : C.faint}`,
                  opacity: s.ready ? 1 : 0.65,
                }}>
                <span className="flex-shrink-0 w-[26px] h-[26px] rounded-[8px] flex items-center justify-center text-[13px] font-bold"
                  style={{ background: on ? C.coral : 'transparent', color: on ? C.onCoral : C.dim, border: on ? 0 : `1px solid ${C.faint}`, fontFamily: 'ui-monospace, monospace' }}>
                  {s.n}
                </span>
                <span className="min-w-0 flex-grow">
                  <span className="block text-[15px] font-extrabold" style={{ color: s.ready ? C.cream : C.muted }}>{s.name}</span>
                  <span className="block mt-0.5 text-[12.5px]" style={{ color: C.dim }}>
                    {s.ready ? s.blurb : 'coming in the next build'}
                  </span>
                </span>

                {s.ready && (
                  <span className="flex-shrink-0 flex items-center gap-2">
                    <button type="button" onClick={() => bump(s.id, -1)} disabled={!on || plan[s.id].rounds <= MIN_ROUNDS}
                      aria-label={`Fewer ${s.unit}`} className="w-8 h-8 rounded-[9px] text-[17px] disabled:opacity-40"
                      style={{ background: '#0F1828', border: `1px solid ${C.line}`, color: C.body }}>−</button>
                    <span className="w-[26px] text-center text-[16px]" style={{ fontFamily: 'ui-monospace, monospace', color: on ? C.cream : C.dim }}>
                      {plan[s.id].rounds}
                    </span>
                    <button type="button" onClick={() => bump(s.id, 1)} disabled={!on || plan[s.id].rounds >= MAX_ROUNDS}
                      aria-label={`More ${s.unit}`} className="w-8 h-8 rounded-[9px] text-[17px] disabled:opacity-40"
                      style={{ background: '#0F1828', border: `1px solid ${C.line}`, color: C.body }}>+</button>
                  </span>
                )}

                {s.ready && (
                  <button type="button" role="switch" aria-checked={on} aria-label={s.name}
                    onClick={() => set(s.id, { on: !on })}
                    className="flex-shrink-0 relative w-[46px] h-[27px] rounded-full"
                    style={{ background: on ? C.coral : '#0F1828', border: on ? 0 : `1px solid ${C.line}`, padding: 0 }}>
                    <span className="absolute top-[3px] w-[21px] h-[21px] rounded-full"
                      style={{ left: on ? 22 : 3, background: on ? '#FFF6F1' : C.dim, transition: 'left 140ms ease' }} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex-shrink-0 px-6 pt-4 pb-6" style={{ borderTop: `1px solid ${C.faint}` }}>
          <p className="m-0 mb-3 text-[12.5px]" style={{ color: C.dim }}>
            {chosen.length === 0
              ? 'Turn at least one round on.'
              : `${chosen.length} round${chosen.length === 1 ? '' : 's'} · ${chosen.reduce((n, s) => n + plan[s.id].rounds, 0)} turns in all`}
          </p>
          <button type="button" onClick={() => { warmSpeech(); onStart(plan); }} disabled={chosen.length === 0}
            className="w-full h-14 rounded-[15px] text-base font-extrabold flex items-center justify-center gap-2.5 disabled:opacity-50"
            style={{ background: C.coral, color: C.onCoral, border: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
            Start the hunt now
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── The rail of rounds ──────────────────────────────────────────────────── */

const Rail: React.FC<{ order: ReturnType<typeof playOrder>; at: number; onExit: () => void }> = ({ order, at, onExit }) => (
  <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3" style={{ borderBottom: `1px solid #1C2840` }}>
    <span className="text-[11.5px] font-extrabold uppercase whitespace-nowrap" style={{ letterSpacing: '0.14em', color: C.coral }}>
      Letters hunter
    </span>
    <span className="flex-grow flex gap-1.5 min-w-0">
      {order.map((s, i) => {
        const done = i < at, now = i === at;
        return (
          <span key={s.id} className="flex-1 min-w-0 h-[34px] rounded-[10px] flex items-center justify-center gap-1.5 text-[11.5px] font-bold px-1"
            style={{
              background: done ? '#12261F' : now ? '#1A2538' : '#111B2C',
              border: `1px solid ${done ? '#2E6B53' : now ? C.coral : C.faint}`,
              color: done ? C.mint : now ? C.cream : C.dim,
            }}>
            {done ? <Tick size={13} /> : <span style={{ fontFamily: 'ui-monospace, monospace', color: now ? C.coral : C.dim }}>{s.n}</span>}
            <span className="truncate hidden sm:inline">{s.name.split(' ')[0]}</span>
          </span>
        );
      })}
    </span>
    <button type="button" onClick={onExit} aria-label="Leave"
      className="flex-shrink-0 w-10 h-10 rounded-[11px] flex items-center justify-center"
      style={{ background: 'transparent', border: 0, color: C.muted }}>
      <Cross size={19} />
    </button>
  </div>
);

/* ── A word with the hunted letters picked out ───────────────────────────── */

/**
 * The chosen letters are tinted wherever they fall.
 *
 * Runs of letters are grouped into as FEW spans as possible: Arabic joins, and
 * a span per character would cut every word into disconnected stumps. Each
 * letter keeps its own marks (segmentWord gives letter units, not characters),
 * so a vowel never ends up in a different colour from the letter it sits on.
 */
const Picked: React.FC<{ text: string; letters: string[]; size: string }> = ({ text, letters, size }) => {
  const want = new Set(letters);
  const runs: { text: string; on: boolean }[] = [];
  for (const unit of segmentWord(text)) {
    const on = want.has(foldChar(unit[0]));
    const last = runs[runs.length - 1];
    if (last && last.on === on) last.text += unit;
    else runs.push({ text: unit, on });
  }
  return (
    <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: size, lineHeight: 1.75, color: C.cream }}>
      {runs.map((r, i) => <span key={i} style={r.on ? { color: C.coral } : undefined}>{r.text}</span>)}
    </span>
  );
};

/* ── Rounds 3, 5, 6 and 7: he reads, the tutor marks ─────────────────────── */

type Mark = 'right' | 'wrong';

const ShowAndMark: React.FC<{
  sub: ReturnType<typeof subMeta>;
  letters: string[];
  items: ShowItem[] | null;
  onDone: (right: number) => void;
}> = ({ sub, letters, items, onDone }) => {
  const [pos, setPos] = useState(0);
  const [marks, setMarks] = useState<Record<number, Mark>>({});

  const total = items?.length ?? 0;
  const right = Object.values(marks).filter(m => m === 'right').length;

  // The new marks are worked out here rather than inside the state updater:
  // React may run an updater twice, and finishing the challenge from inside one
  // would bank the score twice over.
  const mark = useCallback((m: Mark) => {
    const next = { ...marks, [pos]: m };
    setMarks(next);
    // Marking him is also what moves on — the tutor's hand stays on one key.
    if (pos + 1 < total) setPos(p => p + 1);
    else onDone(Object.values(next).filter(x => x === 'right').length);
  }, [marks, pos, total, onDone]);

  /** The tutor's mapping, kept as asked: reading runs right to left, so LEFT is
   *  forward. It is the opposite of the Letter Sounds booth on purpose. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); mark('right'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); mark('wrong'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(p => Math.min(total - 1, p + 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPos(p => Math.max(0, p - 1)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mark, total]);

  if (!items) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center gap-3">
        <span className="w-9 h-9 rounded-full animate-spin" style={{ border: `3px solid ${C.faint}`, borderTopColor: C.coral }} />
        <p className="m-0 text-sm" style={{ color: C.muted }}>Finding them in the Qur'an…</p>
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="flex-grow flex flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="m-0 text-[17px] font-bold">Nothing to show for these letters</p>
        <p className="m-0 text-sm" style={{ color: C.muted }}>Skipping this round.</p>
        <button type="button" onClick={() => onDone(0)} className="mt-2 h-12 px-6 rounded-[14px] font-bold"
          style={{ background: C.raised, border: `1px solid ${C.line}`, color: C.cream }}>Go on</button>
      </div>
    );
  }

  const item = items[pos];
  const long = sub.id === 'ayat' || item.text.length > 14;
  const pickOut = sub.id === 'words' || sub.id === 'ayat';

  return (<>
    <div className="flex-grow flex flex-col items-center justify-center px-5 sm:px-10 py-4 min-h-0">
      <div className="flex items-baseline gap-4">
        <h1 className="m-0 text-[22px] sm:text-[26px] font-extrabold" style={{ letterSpacing: '-0.02em' }}>{sub.name}</h1>
        <span className="text-[15px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>{pos + 1} / {total}</span>
      </div>

      <div className={`mt-5 w-full max-w-[1100px] flex-grow flex flex-col items-center justify-center ${long ? 'rounded-[26px] px-8 py-8' : ''}`}
        style={long ? { background: C.panel, border: `1px solid ${C.line}` } : undefined}>
        <div className="text-center">
          {/* Picking the letters out only says something when they sit among
              OTHERS. On a bare letter or a syllable everything on screen is a
              hunted letter, and colouring the lot just looks like a warning. */}
          <Picked text={item.text} letters={pickOut ? letters : []}
            size={sub.id === 'ayat' ? 'clamp(30px, 4.4vw, 58px)' : long ? 'clamp(54px, 8vw, 110px)' : 'clamp(96px, 20vh, 300px)'} />
        </div>
        {item.ref && <p className="m-0 mt-5 text-[14px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>{refLabel(item.ref)}</p>}
      </div>

      <div className="flex gap-1.5 flex-wrap justify-center mt-4">
        {items.map((_, i) => (
          <span key={i} style={{
            width: 34, height: 7, borderRadius: 4,
            background: marks[i] === 'right' ? C.mint : marks[i] === 'wrong' ? C.rose : i === pos ? C.coral : C.faint,
          }} />
        ))}
      </div>
    </div>

    <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-3 px-5 pb-4">
      <button type="button" onClick={() => setPos(p => Math.max(0, p - 1))} disabled={pos === 0}
        className="h-[60px] px-5 rounded-[17px] text-[15px] font-bold flex items-center gap-3 disabled:opacity-40"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.body }}>
        <Key>→</Key> Back
      </button>
      <button type="button" onClick={() => mark('right')}
        className="h-[60px] px-6 rounded-[17px] text-[16px] font-extrabold flex items-center gap-3"
        style={{ background: C.mintBg, border: `1px solid ${C.mint}`, color: C.mintInk }}>
        <Key>↑</Key> He said it right
      </button>
      <button type="button" onClick={() => mark('wrong')}
        className="h-[60px] px-6 rounded-[17px] text-[16px] font-extrabold flex items-center gap-3"
        style={{ background: C.roseBg, border: `1px solid ${C.rose}`, color: C.roseInk }}>
        <Key>↓</Key> Not yet
      </button>
      <button type="button" onClick={() => (pos + 1 < total ? setPos(p => p + 1) : onDone(right))}
        className="h-[60px] px-5 rounded-[17px] text-[15px] font-bold flex items-center gap-3"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.body }}>
        {pos + 1 < total ? 'Next' : 'Finish'} <Key>←</Key>
      </button>
    </div>
    <p className="m-0 pb-5 text-center text-[12.5px]" style={{ color: C.dim }}>
      Marking him moves on by itself — the arrows are there to go back.
    </p>
  </>);
};

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center text-[15px]"
    style={{ background: C.ground, border: `1px solid ${C.line}` }}>{children}</span>
);

/* ── Round 4: write it on the board ──────────────────────────────────────── */

/** What the tutor decides about each drawing. 'better' is its own answer, not
 *  a soft no: the letter is there but the hand is not steady yet. */
export type Verdict = 'right' | 'better' | 'wrong';

const WriteRound: React.FC<{
  letters: string[];
  rounds: number;
  roomId: string;
  play: (letter: string, set: 'plain') => void;
  onDone: (right: number, better: number) => void;
}> = ({ letters, rounds, roomId, play, onDone }) => {
  const [pos, setPos] = useState(0);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [peers, setPeers] = useState(0);
  const [bigQr, setBigQr] = useState(false);

  /** The letters to write, settled up front so Back shows the same one. */
  const [queue] = useState<string[]>(() =>
    Array.from({ length: rounds }, () => letters[Math.floor(Math.random() * letters.length)]));

  const letter = queue[pos];

  useEffect(() => { const t = window.setTimeout(() => play(letter, 'plain'), 350); return () => window.clearTimeout(t); }, [letter, play]);

  const judge = (v: Verdict) => {
    const next = [...verdicts];
    next[pos] = v;
    setVerdicts(next);
    if (pos + 1 < rounds) setPos(p => p + 1);
    else onDone(next.filter(x => x === 'right').length, next.filter(x => x === 'better').length);
  };

  const link = boardUrl(roomId, 'student');

  return (<>
    <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-5 py-2.5">
      <span className="text-[15px] font-extrabold">Write it</span>
      <span className="text-[14px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>letter {pos + 1} / {rounds}</span>
      <button type="button" onClick={() => play(letter, 'plain')}
        className="h-10 px-4 rounded-xl text-[14px] font-extrabold flex items-center gap-2.5"
        style={{ background: C.coral, color: C.onCoral, border: 0 }}>
        <Speaker size={17} /> Play the letter
      </button>
      <span className="flex-grow" />
      <span className="h-9 px-3.5 rounded-full text-[12.5px] font-bold flex items-center gap-2"
        style={{ background: peers ? '#12261F' : C.panel, border: `1px solid ${peers ? '#2E6B53' : C.line}`, color: peers ? C.mint : C.muted }}>
        {peers ? `${peers} joined` : 'nobody has scanned yet'}
      </span>
    </div>

    <div className="flex-grow flex gap-4 px-5 pb-3 min-h-0">
      <HunterBoard roomId={roomId} me="tutor" isHost round={pos} onPeers={setPeers} className="flex-grow min-w-0" />

      <div className="flex-shrink-0 w-[172px] flex flex-col gap-3">
        <button type="button" onClick={() => setBigQr(true)}
          className="p-3 rounded-[16px] flex flex-col items-center gap-2"
          style={{ background: '#FFFFFF', border: `1px solid ${C.line}` }} aria-label="Make the code bigger">
          <QRCodeSVG value={link} size={140} level="M" />
          <span className="text-[12px] font-bold" style={{ color: '#1B2436' }}>Scan to draw</span>
          <span className="text-[11px]" style={{ color: '#7A7466' }}>tap to enlarge</span>
        </button>
        <p className="m-0 text-[12px] leading-relaxed" style={{ color: C.dim }}>
          Your eraser clears his ink and yours. His only clears his own.
        </p>
        <span className="flex-grow" />
        <button type="button" onClick={() => judge('right')}
          className="h-[52px] rounded-[14px] text-[15px] font-extrabold"
          style={{ background: C.mintBg, border: `1px solid ${C.mint}`, color: C.mintInk }}>Correct</button>
        <button type="button" onClick={() => judge('better')}
          className="h-[52px] rounded-[14px] text-[15px] font-extrabold"
          style={{ background: '#2E1B10', border: `1px solid #D4642F`, color: '#FFD9C2' }}>Can be better</button>
        <button type="button" onClick={() => judge('wrong')}
          className="h-[52px] rounded-[14px] text-[15px] font-extrabold"
          style={{ background: C.roseBg, border: `1px solid ${C.rose}`, color: C.roseInk }}>Wrong</button>
      </div>
    </div>

    {bigQr && (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 p-6"
        style={{ background: 'rgba(4,8,16,0.9)' }} onClick={() => setBigQr(false)} role="dialog" aria-label="The code, bigger">
        <div className="p-6 rounded-[22px]" style={{ background: '#FFFFFF' }}>
          <QRCodeSVG value={link} size={Math.min((typeof window !== 'undefined' ? window.innerWidth : 360) - 120, 420)} level="M" />
        </div>
        <p className="m-0 text-[15px] font-bold" style={{ color: C.cream }}>Scan it with the phone or tablet</p>
        <p className="m-0 text-[13px]" style={{ color: C.muted }}>Tap anywhere to put it back</p>
      </div>
    )}
  </>);
};

/* ── The run ─────────────────────────────────────────────────────────────── */

type Phase = 'intro' | 'play' | 'done';

const LettersHunterRun: React.FC<{
  letters: string[];
  plan: HunterPlan;
  onFinish: (r: HunterResult) => void;
  onExit: () => void;
}> = ({ letters, plan, onFinish, onExit }) => {
  const order = useMemo(() => playOrder(plan), [plan]);

  const [phase, setPhase] = useState<Phase>('intro');
  const [at, setAt] = useState(0);                 // which sub-challenge
  const [round, setRound] = useState(0);           // which round inside it
  const [scores, setScores] = useState<SubScore[]>([]);
  const [row, setRow] = useState<HunterRow | null>(null);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [playing, setPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const roundRightRef = useRef(0);

  const [items, setItems] = useState<ShowItem[] | null>(null);
  /** One room for the run, so a phone that scanned once stays on the board. */
  const [roomId] = useState(newRoomId);
  const betterRef = useRef(0);

  const sub = order[at];
  const withVowels = sub?.id === 'sounds';
  const rounds = sub ? plan[sub.id].rounds : 0;
  /** Rounds 1 and 2 are a row of ten; the rest show one thing at a time. */
  const isRow = sub?.id === 'spot' || sub?.id === 'sounds';
  const isWrite = sub?.id === 'write';

  /** Bank a finished challenge and move to the next one, or to the mark.
   *  Once per challenge, whatever calls it: a second call for the same one is
   *  a repeat, never a second score. */
  const bankedRef = useRef<Set<SubId>>(new Set());
  const bank = useCallback((id: SubId, right: number, of: number) => {
    if (bankedRef.current.has(id)) return;
    bankedRef.current.add(id);
    setScores(s => [...s, { id, right, rounds: of }]);
    roundRightRef.current = 0;
    setRow(null);
    setItems(null);
    setRound(0);
    setAt(n => (n + 1 < order.length ? n + 1 : n));
    if (at + 1 >= order.length) setPhase('done');
  }, [at, order.length]);

  /** What a show-and-mark round will put on the screen, built once when the
   *  challenge opens. The two Qur'an rounds read their file first. */
  useEffect(() => {
    if (phase !== 'play' || !sub || isRow || isWrite || items) return;
    let alive = true;
    if (sub.id === 'say' || sub.id === 'syllables') {
      const make = sub.id === 'say' ? buildSayItem : buildSyllable;
      setItems(Array.from({ length: rounds }, () => make(letters)));
      return;
    }
    (sub.id === 'words' ? loadWords() : loadVerses())
      .then(pool => { if (alive) setItems(pickItems(pool, letters, rounds)); });
    return () => { alive = false; };
  }, [phase, sub, isRow, isWrite, items, letters, rounds]);

  /* sound */
  const play = useCallback((cellLetter: string, set: ReturnType<typeof cellAudioSet>) => {
    audioRef.current?.pause();
    const audio = new Audio(letterAudioUrl(cellLetter, set));
    audioRef.current = audio;
    setPlaying(true);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => { setPlaying(false); speakLetter(cellLetter + (set === 'plain' ? '' : SET_MARK[set])); };
    audio.play().catch(() => setPlaying(false));
  }, []);

  const sayTarget = useCallback(() => {
    if (!row) return;
    play(row.target.letter, cellAudioSet(row.target));
  }, [row, play]);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  /* a fresh row whenever the round or the sub-challenge changes — and after
     advance() tears the last one down, which is what `row == null` means */
  useEffect(() => {
    if (phase !== 'play' || !sub || row || !isRow) return;
    const r = buildRow(letters, withVowels);
    setRow(r);
    setMarks({});
    // The sound is the question, so it comes without being asked for.
    const t = window.setTimeout(() => play(r.target.letter, cellAudioSet(r.target)), 260);
    return () => window.clearTimeout(t);
  }, [phase, at, round, sub, row, isRow, letters, withVowels, play]);

  const targets = row ? targetsOf(row) : [];
  const found = targets.filter(i => marks[i] === 'right').length;
  const missed = Object.values(marks).filter(m => m === 'wrong').length;
  const roundOver = row != null && targets.length > 0 && found === targets.length;

  /**
   * Move on: bank this round, then the next round or the next challenge.
   *
   * The row is torn down FIRST. `roundOver` is derived from the row that is on
   * screen, so while an old finished row is still mounted it stays true — and
   * the effect below would arm a second timer and bank the same round twice
   * (a two-round challenge scored 4/4 and appeared twice on the mark screen).
   * A null row is also what makes a second call here a no-op.
   */
  const advance = useCallback(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (!sub || !row) return;
    const clean = found === targets.length && missed === 0;
    if (clean) roundRightRef.current += 1;
    setRow(null);
    setMarks({});

    if (round + 1 < rounds) { setRound(r => r + 1); return; }
    bank(sub.id, roundRightRef.current, rounds);
  }, [sub, row, found, targets.length, missed, round, rounds, bank]);

  /* a finished row moves on by itself, with a beat to see it */
  useEffect(() => {
    if (!roundOver) return;
    timerRef.current = window.setTimeout(advance, 1100);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [roundOver, advance]);

  const tap = (i: number) => {
    if (!row || marks[i] || roundOver) return;
    setMarks(m => ({ ...m, [i]: sameCell(row.cells[i], row.target) ? 'right' : 'wrong' }));
  };

  const shell = (inner: React.ReactNode) => (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, background: C.ground, color: C.cream,
      fontFamily: "'Nunito', system-ui, sans-serif", display: 'flex', flexDirection: 'column',
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>{inner}</div>
  );

  /* ── before anything: look at them ── */
  if (phase === 'intro') {
    return shell(<>
      <Rail order={order} at={-1} onExit={onExit} />
      <div className="flex-grow overflow-y-auto flex flex-col items-center px-6 pt-7">
        <p className="m-0 text-[12.5px] font-extrabold uppercase" style={{ letterSpacing: '0.16em', color: C.muted }}>Before we start</p>
        <h1 className="m-0 mt-2.5 text-[30px] sm:text-[34px] font-extrabold text-center" style={{ letterSpacing: '-0.02em' }}>Look at them together</h1>
        <p className="m-0 mt-2.5 text-[15px] text-center" style={{ color: C.body }}>{introLine(letters)}</p>

        <div className="mt-7 w-full flex flex-wrap items-stretch justify-center gap-5">
          {letters.map(l => (
            <div key={l} className="w-[320px] max-w-full flex flex-col items-center gap-3 px-6 pt-6 pb-5 rounded-[24px]"
              style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 'clamp(110px, 20vw, 170px)', lineHeight: 1.1, color: C.cream }}>{l}</span>
              <p className="m-0 text-[15px] font-bold" style={{ color: dotsOf(l) === 'no dots' ? C.body : C.coral }}>{dotsOf(l) || 'look at the shape'}</p>
              <button type="button" onClick={() => play(l, 'plain')}
                className="h-11 px-5 rounded-xl text-sm font-bold flex items-center gap-2.5"
                style={{ background: C.raised, border: `1px solid ${C.line}`, color: C.cream }}>
                <Speaker size={17} /> Hear it
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-shrink-0 flex justify-center px-6 py-6">
        <button type="button" onClick={() => setPhase('play')}
          className="h-[60px] px-9 rounded-[16px] text-[17px] font-extrabold flex items-center gap-3"
          style={{ background: C.coral, color: C.onCoral, border: 0 }}>
          Start round {order[0]?.n ?? 1}
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
        </button>
      </div>
    </>);
  }

  /* ── the mark ── */
  if (phase === 'done') {
    const result = tally(letters, scores, betterRef.current);
    const pct = result.total ? result.right / result.total : 0;
    const ring = pct >= 0.8 ? C.mint : pct >= 0.5 ? C.coral : C.rose;
    return shell(
      <div className="flex-grow overflow-y-auto flex flex-col items-center px-6 py-9">
        <p className="m-0 text-[12px] font-extrabold uppercase" style={{ letterSpacing: '0.16em', color: C.coral }}>Letters hunter · done</p>
        <h1 className="m-0 mt-3 text-[30px] sm:text-[34px] font-extrabold text-center" style={{ letterSpacing: '-0.025em' }}>
          He hunted <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC }}>{letters.join(' ')}</span>
        </h1>

        <div className="mt-7 flex flex-col items-center justify-center rounded-full"
          style={{ width: 196, height: 196, border: `10px solid ${ring}`, background: '#10281F' }}>
          <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 54, lineHeight: 1, color: C.cream }}>{result.right}</span>
          <span className="mt-1 text-[15px] font-bold" style={{ color: C.body }}>out of {result.total}</span>
        </div>

        <div className="mt-8 w-full max-w-[640px] flex flex-col gap-2">
          {result.scores.map(s => {
            const m = subMeta(s.id);
            const w = s.rounds ? Math.round((s.right / s.rounds) * 100) : 0;
            return (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3 rounded-[13px]"
                style={{ background: C.panel, border: `1px solid ${C.faint}` }}>
                <span className="w-5 text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>{m.n}</span>
                <span className="flex-grow min-w-0 truncate text-[14.5px] font-bold">{m.name}</span>
                <span className="w-[90px] sm:w-[160px] h-2.5 rounded-full overflow-hidden" style={{ background: '#0E1728' }}>
                  <span className="block h-full" style={{ width: `${w}%`, background: w >= 80 ? C.mint : w >= 50 ? C.coral : C.rose }} />
                </span>
                <span className="w-[52px] text-right text-[14px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.cream }}>
                  {s.right} / {s.rounds}
                </span>
                {s.id === 'write' && result.better > 0 && (
                  <span className="text-[12px] font-bold whitespace-nowrap" style={{ color: '#D4642F' }}>
                    +{result.better} could be better
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 flex gap-3">
          <button type="button" onClick={() => { setScores([]); setAt(0); setRound(0); setRow(null); setItems(null); roundRightRef.current = 0; bankedRef.current = new Set(); setPhase('intro'); }}
            className="h-14 px-7 rounded-[15px] text-[15px] font-bold"
            style={{ background: C.raised, border: `1px solid #3A4A68`, color: C.cream }}>Hunt them again</button>
          <button type="button" onClick={() => onFinish(result)}
            className="h-14 px-9 rounded-[15px] text-base font-extrabold"
            style={{ background: C.coral, color: C.onCoral, border: 0 }}>Done</button>
        </div>
      </div>,
    );
  }

  /* ── he writes it, the tutor marks ── */
  if (isWrite) {
    return shell(<>
      <Rail order={order} at={at} onExit={onExit} />
      <WriteRound letters={letters} rounds={rounds} roomId={roomId} play={play}
        onDone={(right, better) => { betterRef.current += better; bank('write', right, rounds); }} />
    </>);
  }

  /* ── he reads, the tutor marks ── */
  if (!isRow) {
    return shell(<>
      <Rail order={order} at={at} onExit={onExit} />
      <ShowAndMark sub={sub} letters={letters} items={items}
        onDone={right => bank(sub.id, right, items?.length || rounds)} />
    </>);
  }

  /* ── a row of ten ── */
  return shell(<>
    <Rail order={order} at={at} onExit={onExit} />

    <div className="flex-grow flex flex-col items-center justify-center px-4 sm:px-8 py-5 min-h-0">
      <div className="flex items-baseline gap-4 flex-wrap justify-center">
        <h1 className="m-0 text-[24px] sm:text-[30px] font-extrabold" style={{ letterSpacing: '-0.02em' }}>
          {withVowels ? 'Which one did you hear?' : 'Spot the letter you hear'}
        </h1>
        <span className="text-[15px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>round {round + 1} / {rounds}</span>
      </div>
      <p className="m-0 mt-2 text-[14.5px] text-center" style={{ color: C.body }}>
        {withVowels
          ? <>The letter <em className="not-italic font-bold" style={{ color: C.coral }}>and</em> its vowel have to match.</>
          : 'Say the numbers of every cell that holds it — out loud.'}
      </p>

      <button type="button" onClick={sayTarget}
        className="mt-5 h-[72px] px-8 rounded-[20px] text-[17px] font-extrabold flex items-center gap-3.5"
        style={{ background: C.coral, color: C.onCoral, border: 0, boxShadow: playing ? `0 0 0 6px rgba(255,122,77,0.18)` : 'none', transition: 'box-shadow 200ms ease' }}>
        <Speaker size={25} /> Play it again
      </button>

      {/* Ten across on the screen the lesson is run from, so he can read them
          at a glance and call out the numbers. On a phone ten would be 35px
          wide — there they sit five and five. */}
      <div className="mt-7 w-full grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-2.5">
        {row?.cells.map((cell, i) => {
          const mark = marks[i];
          const bg = mark === 'right' ? C.mintBg : mark === 'wrong' ? C.roseBg : C.panel;
          const bd = mark === 'right' ? C.mint : mark === 'wrong' ? C.rose : C.line;
          const ink = mark === 'right' ? C.mintInk : mark === 'wrong' ? C.roseInk : C.cream;
          const nearMiss = mark === 'wrong' && cell.letter === row.target.letter;
          return (
            <button key={i} type="button" onClick={() => tap(i)} disabled={!!mark || roundOver}
              aria-label={`Cell ${i + 1}`}
              className="relative flex items-center justify-center rounded-[16px] sm:rounded-[18px]"
              style={{
                height: 'clamp(88px, 22vh, 180px)',
                background: bg, border: `${mark ? 2 : 1}px solid ${bd}`,
                color: ink, padding: 0, cursor: mark || roundOver ? 'default' : 'pointer',
              }}>
              <span className="absolute top-1.5 left-2 text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: mark ? ink : C.muted }}>{i + 1}</span>
              {mark && <span className="absolute top-1.5 right-2">{mark === 'right' ? <Tick /> : <Cross />}</span>}
              <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontSize: 'clamp(38px, 5.2vw, 72px)', lineHeight: 1 }}>
                {cellText(cell)}
              </span>
              {nearMiss && (
                <span className="absolute bottom-1.5 left-0 right-0 text-center text-[10px] font-bold leading-tight" style={{ color: C.rose }}>
                  right letter<br />wrong vowel
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="m-0 mt-4 text-[13.5px]" style={{ color: roundOver ? C.mint : C.muted }}>
        {roundOver
          ? (missed === 0 ? 'All of them, nothing else.' : `Found them · ${missed} wrong`)
          : `${found} of ${targets.length} found${missed ? ` · ${missed} wrong` : ''}`}
      </p>
    </div>

    <div className="flex-shrink-0 flex items-center gap-4 px-5 sm:px-8 py-5">
      <span className="flex gap-1.5 flex-wrap">
        {Array.from({ length: rounds }, (_, i) => (
          <span key={i} style={{
            width: 28, height: 6, borderRadius: 3,
            background: i < round ? C.mint : i === round ? C.coral : C.faint,
          }} />
        ))}
      </span>
      <span className="flex-grow" />
      <button type="button" onClick={advance}
        className="h-[52px] px-7 rounded-[15px] text-[15px] font-bold flex items-center gap-2.5"
        style={{ background: C.raised, border: `1px solid #3A4A68`, color: C.cream }}>
        {round + 1 < rounds ? 'Next round' : at + 1 < order.length ? 'Next challenge' : 'See the mark'}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
      </button>
    </div>
  </>);
};

/* ── What the alphabet page mounts ───────────────────────────────────────── */

const LettersHunterChallenge: React.FC<{
  letters: string[];
  /** Fired once, when the tutor leaves the mark screen by Done. */
  onFinish?: (title: string, detail: string, sourceId: string) => void;
  onExit: () => void;
}> = ({ letters, onFinish, onExit }) => {
  const [plan, setPlan] = useState<HunterPlan | null>(null);

  if (!enoughLetters(letters)) {
    return (
      <div className="max-w-md mx-auto my-10 p-6 text-center rounded-3xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
        <p className="font-bold text-slate-700 dark:text-slate-200">
          {letters.length < MIN_LETTERS ? `Choose ${MIN_LETTERS} letters` : `Choose at most ${MAX_LETTERS} letters`}
        </p>
        <p className="text-sm text-slate-500 mt-1">A hunt is built out of the letters he mixes with each other.</p>
        <button onClick={onExit} className="mt-4 h-10 px-5 rounded-xl bg-slate-100 dark:bg-gray-700 font-bold">Back</button>
      </div>
    );
  }

  if (!plan) return <LettersHunterSetup letters={letters} onStart={setPlan} onClose={onExit} />;

  return (
    <LettersHunterRun
      letters={letters}
      plan={plan}
      onExit={onExit}
      onFinish={r => {
        onFinish?.(logTitle(r.letters), logDetail(r), `LettersHunter:${r.letters.join('')}:${Date.now()}`);
        onExit();
      }}
    />
  );
};

export default LettersHunterChallenge;
