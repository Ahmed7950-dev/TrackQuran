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
  tally, logTitle, logDetail, dotsOf, introLine, enoughLetters, scoreOf,
  buildSayItem, buildSyllable, loadWords, loadVerses, pickItems, foldChar, refLabel,
  MIN_ROUNDS, MAX_ROUNDS, MIN_LETTERS, MAX_LETTERS,
  type HunterPlan, type SubId, type SubScore, type HunterRow, type HunterResult, type ShowItem,
  type RoundResult, type SubMeta,
} from '../services/lettersHunterService';
import { segmentWord } from '../services/tajweedColorService';
import { QRCodeSVG } from 'qrcode.react';
import HunterBoard from './HunterBoard';
import { boardUrl, newRoomId, type Stroke } from '../services/hunterBoardService';
import { supabase } from '../lib/supabase';
import { createHunterHomework, hunterHomeworkUrl, HOMEWORK_SUBS } from '../services/lettersHunterHomeworkService';

export const ARABIC = "'Hafs', 'Amiri', serif";

/** The hunt's own palette: ink ground, cream letters, one coral for the quarry.
 *  Deliberately not the Letter Sounds green or the Media amber. */
export const C = {
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

export const Speaker: React.FC<{ size?: number }> = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z" />
    <path d="M16 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.5 7a7 7 0 0 1 0 10" />
  </svg>
);

export const Tick: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

export const Cross: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={3.2} strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/* ── Setting it up ───────────────────────────────────────────────────────── */

export const LettersHunterSetup: React.FC<{
  letters: string[];
  /** Absent when no student is open — then it can only be run, not set. */
  student?: { id: string; name: string } | null;
  onStart: (plan: HunterPlan) => void;
  onClose: () => void;
}> = ({ letters, student, onStart, onClose }) => {
  const [plan, setPlan] = useState<HunterPlan>(defaultPlan);
  const [setting, setSetting] = useState(false);
  const [due, setDue] = useState<'open' | '3' | '7' | 'date'>('7');
  const [onDate, setOnDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  const set = (id: SubId, patch: Partial<{ on: boolean; rounds: number }>) =>
    setPlan(p => ({ ...p, [id]: { ...p[id], ...patch } }));

  const bump = (id: SubId, by: number) =>
    set(id, { rounds: Math.max(MIN_ROUNDS, Math.min(MAX_ROUNDS, plan[id].rounds + by)) });

  const chosen = playOrder(plan);
  /** What would actually go home: the other four need someone listening. */
  const goingHome = chosen.filter(s => HOMEWORK_SUBS.includes(s.id));

  const dueIso = (): string | null => {
    if (due === 'open') return null;
    if (due === 'date') return onDate ? new Date(`${onDate}T23:59:00`).toISOString() : null;
    const d = new Date();
    d.setDate(d.getDate() + Number(due));
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  };

  const send = async () => {
    if (!student) { setErr('Open a student first to set this as homework.'); return; }
    setBusy(true); setErr('');
    const { data } = await supabase.auth.getUser();
    const teacherId = data.user?.id;
    if (!teacherId) { setBusy(false); setErr('Sign in again to set homework.'); return; }
    // Only the rounds that can be done alone are sent, whatever is ticked.
    const homeworkPlan = { ...plan };
    for (const s of SUBS) if (!HOMEWORK_SUBS.includes(s.id)) homeworkPlan[s.id] = { ...homeworkPlan[s.id], on: false };
    const made = await createHunterHomework({
      teacherId, studentId: student.id, studentName: student.name,
      letters, plan: homeworkPlan, dueAt: dueIso(),
    });
    setBusy(false);
    if (!made) { setErr('Could not set it. Try again.'); return; }
    setLink(hunterHomeworkUrl(made.id));
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { /* the link is on screen anyway */ }
  };

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

          {link ? (
            <div className="p-[18px] rounded-[14px]" style={{ background: '#10192A', border: `1px solid ${C.coral}` }}>
              <p className="m-0 mb-2 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.coral }}>Set · his link</p>
              <p className="m-0 break-all text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.body }}>{link}</p>
              <div className="flex gap-2.5 mt-3">
                <button type="button" onClick={() => void copy()} className="h-11 px-5 rounded-[11px] text-sm font-extrabold"
                  style={{ background: C.coral, color: C.onCoral, border: 0 }}>{copied ? '✓ Copied' : 'Copy link'}</button>
                <button type="button" onClick={onClose} className="h-11 px-5 rounded-[11px] text-sm font-bold"
                  style={{ background: C.raised, border: `1px solid ${C.line}`, color: C.cream }}>Done</button>
              </div>
              <p className="m-0 mt-3 text-[12.5px]" style={{ color: C.dim }}>
                It is in his homework tab too — the link only saves him looking.
              </p>
            </div>
          ) : setting ? (
            <div className="p-[18px] rounded-[14px]" style={{ background: '#10192A', border: `1px solid ${C.line}` }}>
              <p className="m-0 mb-3 text-[11.5px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.muted }}>When is it due</p>
              <div className="flex flex-wrap gap-2">
                {([['3', 'In 3 days'], ['7', 'In a week'], ['date', 'Pick a day'], ['open', 'No deadline']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setDue(k)} aria-pressed={due === k}
                    className="h-11 px-4 rounded-[12px] text-[13.5px] font-bold"
                    style={{ background: due === k ? C.raised : 'transparent', border: `1px solid ${due === k ? C.coral : C.line}`, color: due === k ? C.cream : C.body }}>
                    {label}
                  </button>
                ))}
              </div>
              {due === 'date' && (
                <input type="date" value={onDate} onChange={e => setOnDate(e.target.value)} aria-label="The day it is due"
                  className="mt-3 h-11 px-3 rounded-[11px] text-sm w-full"
                  style={{ background: '#0B1220', border: `1px solid ${C.line}`, color: C.cream }} />
              )}
              <p className="m-0 mt-3.5 text-[12.5px] leading-relaxed" style={{ color: C.dim }}>
                {goingHome.length
                  ? <>Going home: {goingHome.map(s => s.name).join(', ')}. The other rounds need you listening, so they stay in the lesson.</>
                  : <>None of the rounds you picked can be done alone. Turn on spot the letter, sound discrimination or write.</>}
              </p>
              <div className="flex gap-2.5 mt-3">
                <button type="button" onClick={() => void send()} disabled={busy || goingHome.length === 0}
                  className="h-12 px-6 rounded-[13px] text-[15px] font-extrabold disabled:opacity-50"
                  style={{ background: C.coral, color: C.onCoral, border: 0 }}>{busy ? 'Setting…' : 'Set it'}</button>
                <button type="button" onClick={() => setSetting(false)} className="h-12 px-5 rounded-[13px] text-[15px] font-bold"
                  style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.body }}>Back</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button type="button" onClick={() => { warmSpeech(); onStart(plan); }} disabled={chosen.length === 0}
                className="flex-1 h-14 rounded-[15px] text-base font-extrabold flex items-center justify-center gap-2.5 disabled:opacity-50"
                style={{ background: C.coral, color: C.onCoral, border: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
                Start the hunt now
              </button>
              <button type="button" onClick={() => setSetting(true)} disabled={chosen.length === 0}
                className="flex-1 h-14 rounded-[15px] text-base font-bold flex items-center justify-center gap-2.5 disabled:opacity-50"
                style={{ background: C.raised, border: `1px solid #3A4A68`, color: C.cream }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10a2 2 0 0 1 2 2v14l-7-4-7 4V6a2 2 0 0 1 2-2z" /></svg>
                Set as homework
              </button>
            </div>
          )}

          {err && <p role="alert" className="m-0 mt-3 text-[13.5px]" style={{ color: '#F0B5AE' }}>{err}</p>}
        </div>
      </div>
    </div>
  );
};

/* ── The trail ───────────────────────────────────────────────────────────── */

/**
 * One track across the top, in place of the two strips there used to be — a row
 * of challenge pills AND a row of round dots under the letters, which between
 * them never said how it was going.
 *
 * Every round of the whole run is a block, and a challenge's stretch of track
 * is as wide as it has rounds. A finished block keeps its colour, so the strip
 * the student is looking at IS the mark he is building.
 */
const Trail: React.FC<{
  order: SubMeta[];
  plan: HunterPlan;
  at: number;
  scores: SubScore[];
  live: { done: RoundResult[]; pos: number } | null;
  onExit: () => void;
}> = ({ order, plan, at, scores, live, onExit }) => {
  const now = order[at];
  const rounds = now ? plan[now.id].rounds : 0;

  const colourOf = (i: number, j: number): string => {
    const paint = (r?: RoundResult) =>
      r === 'right' ? C.mint : r === 'better' ? '#D4642F' : r === 'wrong' ? C.rose : null;
    if (i < at) return paint(scores.find(s => s.id === order[i].id)?.results[j]) ?? C.faint;
    if (i > at) return C.faint;
    return paint(live?.done[j]) ?? (j === (live?.pos ?? 0) ? C.coral : C.faint);
  };

  return (
    <div className="flex-shrink-0 px-4 sm:px-5 pt-3 pb-2.5" style={{ borderBottom: `1px solid #1C2840` }}>
      <div className="flex items-baseline gap-3">
        <span className="text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.coral }}>
          {String(now?.n ?? 0).padStart(2, '0')}
        </span>
        <span className="text-[16px] sm:text-[18px] font-extrabold truncate" style={{ letterSpacing: '-0.015em' }}>{now?.name}</span>
        <span className="flex-grow" />
        <span className="hidden sm:inline text-[13px] whitespace-nowrap" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>
          round {Math.min(rounds, (live?.pos ?? 0) + 1)} of {rounds} · challenge {at + 1} of {order.length}
        </span>
        <button type="button" onClick={onExit} aria-label="Leave"
          className="flex-shrink-0 w-9 h-9 -mr-1 rounded-[10px] flex items-center justify-center"
          style={{ background: 'transparent', border: 0, color: C.muted }}>
          <Cross size={18} />
        </button>
      </div>

      <div className="flex items-stretch gap-2.5 mt-2" style={{ height: 14 }}>
        {order.map((s, i) => (
          <div key={s.id} className="flex gap-[3px]" title={s.name}
            style={{ flex: `${plan[s.id].rounds} 1 0`, opacity: i > at ? 0.45 : 1 }}>
            {Array.from({ length: plan[s.id].rounds }, (_, j) => (
              <span key={j} style={{ flex: 1, borderRadius: 3, background: colourOf(i, j), transition: 'background 180ms ease' }} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 mt-1.5 text-[11px] font-bold">
        {order.map((s, i) => (
          <span key={s.id} className="truncate"
            style={{ flex: `${plan[s.id].rounds} 1 0`, color: i < at ? C.mint : i === at ? C.cream : '#55637C' }}>
            {s.name.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  );
};

/** The letter said out loud, with the browser's voice as the net when a
 *  recording is missing (hamzah has none in the bare set yet). */
function useLetterAudio() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const play = useCallback((letter: string, set: ReturnType<typeof cellAudioSet>) => {
    ref.current?.pause();
    const audio = new Audio(letterAudioUrl(letter, set));
    ref.current = audio;
    setPlaying(true);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => { setPlaying(false); speakLetter(letter + (set === 'plain' ? '' : SET_MARK[set])); };
    audio.play().catch(() => setPlaying(false));
  }, []);
  useEffect(() => () => ref.current?.pause(), []);
  return { play, playing };
}

/* ── Rounds 1 and 2: a row of ten ────────────────────────────────────────── */

type Mark = 'right' | 'wrong';

/**
 * One whole challenge of rows — every round of it — ending in how many were
 * clean.
 *
 * The same screen serves the lesson and the homework. The only difference is
 * the numbers in the corners: in the lesson they are how the student tells the
 * tutor what he heard, and at home he taps the cells himself, so they would be
 * furniture.
 */
export const RowRound: React.FC<{
  letters: string[];
  withVowels: boolean;
  rounds: number;
  showNumbers: boolean;
  lastLabel: string;
  onDone: (results: RoundResult[]) => void;
  /** Where the trail at the top is told what to draw. */
  onProgress?: (done: RoundResult[], pos: number) => void;
}> = ({ letters, withVowels, rounds, showNumbers, lastLabel, onDone, onProgress }) => {
  const [round, setRound] = useState(0);
  const [row, setRow] = useState<HunterRow | null>(null);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const { play, playing } = useLetterAudio();
  const timerRef = useRef<number | null>(null);
  const resultsRef = useRef<RoundResult[]>([]);

  /* a fresh row whenever the round changes — and after advance() tears the
     last one down, which is what `row == null` means */
  useEffect(() => {
    if (row) return;
    const r = buildRow(letters, withVowels);
    setRow(r);
    setMarks({});
    // The sound is the question, so it comes without being asked for.
    const t = window.setTimeout(() => play(r.target.letter, cellAudioSet(r.target)), 260);
    return () => window.clearTimeout(t);
  }, [round, row, letters, withVowels, play]);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  useEffect(() => { onProgress?.([...resultsRef.current], round); }, [round, onProgress]);

  const targets = row ? targetsOf(row) : [];
  const found = targets.filter(i => marks[i] === 'right').length;
  const missed = Object.values(marks).filter(m => m === 'wrong').length;
  const roundOver = row != null && targets.length > 0 && found === targets.length;

  /**
   * Move on: bank this round, then the next one.
   *
   * The row is torn down FIRST. `roundOver` is derived from the row that is on
   * screen, so while an old finished row is still mounted it stays true — and
   * the effect below would arm a second timer and bank the same round twice (a
   * two-round challenge scored 4/4 and appeared twice on the mark screen). A
   * null row is also what makes a second call here a no-op.
   */
  const advance = useCallback(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (!row) return;
    resultsRef.current.push(found === targets.length && missed === 0 ? 'right' : 'wrong');
    setRow(null);
    setMarks({});
    if (round + 1 < rounds) setRound(r => r + 1);
    else onDone(resultsRef.current);
  }, [row, found, targets.length, missed, round, rounds, onDone]);

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

  return (<>
    <div className="flex-grow flex flex-col items-center justify-center px-4 sm:px-8 py-5 min-h-0">
      <h1 className="m-0 text-[24px] sm:text-[30px] font-extrabold text-center" style={{ letterSpacing: '-0.02em' }}>
        {withVowels ? 'Which one did you hear?' : 'Spot the letter you hear'}
      </h1>
      <p className="m-0 mt-2 text-[14.5px] text-center" style={{ color: C.body }}>
        {withVowels
          ? <>The letter <em className="not-italic font-bold" style={{ color: C.coral }}>and</em> its vowel have to match.</>
          : showNumbers ? 'Say the numbers of every cell that holds it — out loud.' : 'Tap every cell that holds it.'}
      </p>

      <button type="button" onClick={() => row && play(row.target.letter, cellAudioSet(row.target))}
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
              {showNumbers && (
                <span className="absolute top-1.5 left-2 text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: mark ? ink : C.muted }}>{i + 1}</span>
              )}
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

    <div className="flex-shrink-0 flex items-center justify-end gap-4 px-5 sm:px-8 py-5">
      <button type="button" onClick={advance}
        className="h-[52px] px-7 rounded-[15px] text-[15px] font-bold flex items-center gap-2.5"
        style={{ background: C.raised, border: `1px solid #3A4A68`, color: C.cream }}>
        {round + 1 < rounds ? 'Next round' : lastLabel}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 5.5L16 12l-6.5 6.5" /></svg>
      </button>
    </div>
  </>);
};

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

const ShowAndMark: React.FC<{
  sub: ReturnType<typeof subMeta>;
  letters: string[];
  items: ShowItem[] | null;
  onDone: (results: RoundResult[]) => void;
  onProgress?: (done: RoundResult[], pos: number) => void;
}> = ({ sub, letters, items, onDone, onProgress }) => {
  const [pos, setPos] = useState(0);
  const [marks, setMarks] = useState<Record<number, Mark>>({});

  const total = items?.length ?? 0;

  /** Every one in order, so the mark can show WHICH went wrong. Anything left
   *  unmarked counts as wrong — it was shown and not read. */
  const asResults = useCallback((m: Record<number, Mark>): RoundResult[] =>
    Array.from({ length: total }, (_, i) => (m[i] === 'right' ? 'right' : 'wrong')), [total]);

  // The new marks are worked out here rather than inside the state updater:
  // React may run an updater twice, and finishing the challenge from inside one
  // would bank the score twice over.
  const mark = useCallback((m: Mark) => {
    const next = { ...marks, [pos]: m };
    setMarks(next);
    // Marking moves on by itself; going back over one already marked and
    // changing it is allowed, and only the last one ends the challenge.
    if (pos + 1 < total) setPos(p => p + 1);
    else onDone(asResults(next));
  }, [marks, pos, total, onDone, asResults]);

  useEffect(() => {
    onProgress?.(Array.from({ length: total }, (_, i) => marks[i]).filter(Boolean) as RoundResult[], pos);
  }, [marks, pos, total, onProgress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); mark('right'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); mark('wrong'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setPos(p => Math.min(total - 1, p + 1)); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setPos(p => Math.max(0, p - 1)); }
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
        <button type="button" onClick={() => onDone([])} className="mt-2 h-12 px-6 rounded-[14px] font-bold"
          style={{ background: C.raised, border: `1px solid ${C.line}`, color: C.cream }}>Go on</button>
      </div>
    );
  }

  const item = items[pos];
  const long = sub.id === 'ayat' || item.text.length > 14;
  const pickOut = sub.id === 'words' || sub.id === 'ayat';

  return (<>
    <div className="flex-grow flex flex-col items-center justify-center px-5 sm:px-10 py-4 min-h-0">
      <div className={`mt-5 w-full max-w-[1100px] flex-grow flex flex-col items-center justify-center ${long ? 'rounded-[26px] px-8 py-8' : ''}`}
        style={long ? { background: C.panel, border: `1px solid ${C.line}` } : undefined}>
        <div className="text-center">
          {/* Picking the letters out only says something when they sit among
              OTHERS. On a bare letter or a syllable everything on screen is a
              hunted letter, and colouring the lot just looks like a warning. */}
          <Picked text={item.text} letters={pickOut ? letters : []}
            size={sub.id === 'ayat' ? 'clamp(30px, 4.4vw, 58px)' : long ? 'clamp(54px, 8vw, 110px)' : 'clamp(150px, 34vh, 420px)'} />
        </div>
        {item.ref && <p className="m-0 mt-5 text-[14px]" style={{ fontFamily: 'ui-monospace, monospace', color: C.muted }}>{refLabel(item.ref)}</p>}
      </div>

    </div>

    <div className="flex-shrink-0 flex flex-wrap items-center justify-center gap-3 px-5 pb-4">
      <button type="button" onClick={() => setPos(p => Math.max(0, p - 1))} disabled={pos === 0}
        className="h-[60px] px-5 rounded-[17px] text-[15px] font-bold flex items-center gap-3 disabled:opacity-40"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.body }}>
        <Key>←</Key> Back
      </button>
      <button type="button" onClick={() => mark('right')}
        className="h-[60px] px-8 rounded-[17px] text-[16px] font-extrabold flex items-center gap-3"
        style={{ background: marks[pos] === 'right' ? C.mint : C.mintBg, border: `1px solid ${C.mint}`, color: marks[pos] === 'right' ? C.ground : C.mintInk }}>
        <Key>↑</Key> Right
      </button>
      <button type="button" onClick={() => mark('wrong')}
        className="h-[60px] px-8 rounded-[17px] text-[16px] font-extrabold flex items-center gap-3"
        style={{ background: marks[pos] === 'wrong' ? C.rose : C.roseBg, border: `1px solid ${C.rose}`, color: marks[pos] === 'wrong' ? C.ground : C.roseInk }}>
        <Key>↓</Key> Wrong
      </button>
      <button type="button" onClick={() => (pos + 1 < total ? setPos(p => p + 1) : onDone(asResults(marks)))}
        className="h-[60px] px-5 rounded-[17px] text-[15px] font-bold flex items-center gap-3"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.body }}>
        {pos + 1 < total ? 'Next' : 'Finish'} <Key>→</Key>
      </button>
    </div>
    <p className="m-0 pb-5 text-center text-[12.5px]" style={{ color: C.dim }}>
      Marking moves on by itself. Go back with ← and change it if you want.
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
  onDone: (results: RoundResult[]) => void;
  onProgress?: (done: RoundResult[], pos: number) => void;
}> = ({ letters, rounds, roomId, play, onDone, onProgress }) => {
  const [pos, setPos] = useState(0);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [peers, setPeers] = useState(0);
  const [bigQr, setBigQr] = useState(false);
  const [copied, setCopied] = useState(false);

  /** The letters to write, settled up front so Back shows the same one. */
  const [queue] = useState<string[]>(() =>
    Array.from({ length: rounds }, () => letters[Math.floor(Math.random() * letters.length)]));

  const letter = queue[pos];

  useEffect(() => { const t = window.setTimeout(() => play(letter, 'plain'), 350); return () => window.clearTimeout(t); }, [letter, play]);

  useEffect(() => { onProgress?.(verdicts.filter(Boolean), pos); }, [verdicts, pos, onProgress]);

  const judge = (v: Verdict) => {
    const next = [...verdicts];
    next[pos] = v;
    setVerdicts(next);
    if (pos + 1 < rounds) setPos(p => p + 1);
    else onDone(Array.from({ length: rounds }, (_, i) => next[i] ?? 'wrong'));
  };

  const link = boardUrl(roomId, 'student');

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { /* the code is on screen anyway */ }
  };

  return (<>
    <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-5 py-2.5">
      <button type="button" onClick={() => play(letter, 'plain')}
        className="h-10 px-4 rounded-xl text-[14px] font-extrabold flex items-center gap-2.5"
        style={{ background: C.coral, color: C.onCoral, border: 0 }}>
        <Speaker size={17} /> Play the letter
      </button>
      <span className="flex-grow" />
      <span className="h-9 px-3.5 rounded-full text-[12.5px] font-bold flex items-center gap-2"
        style={{ background: peers ? '#12261F' : C.panel, border: `1px solid ${peers ? '#2E6B53' : C.line}`, color: peers ? C.mint : C.muted }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="8.5" r="2.4" /><path d="M16 14.2a4.6 4.6 0 0 1 4.6 4.8" />
        </svg>
        {peers} joined
      </span>
    </div>

    {/* The board takes the room; the code and the verdicts sit in the margin
        the 4:3 paper leaves behind, which is otherwise dead space. */}
    <div className="flex-grow flex gap-4 px-5 pb-3 min-h-0">
      <HunterBoard roomId={roomId} me="tutor" isHost round={pos} onPeers={setPeers} className="flex-grow min-w-0" />

      <div className="flex-shrink-0 w-[200px] flex flex-col gap-2.5 min-h-0">
        <button type="button" onClick={() => setBigQr(true)}
          className="p-3 rounded-[16px] flex flex-col items-center gap-2"
          style={{ background: '#FFFFFF', border: `1px solid ${C.line}` }} aria-label="Make the code bigger">
          <QRCodeSVG value={link} size={152} level="M" />
          <span className="text-[12px] font-bold" style={{ color: '#1B2436' }}>Scan to draw</span>
        </button>

        <button type="button" onClick={() => void copy()}
          className="h-11 rounded-[12px] text-[13.5px] font-extrabold flex items-center justify-center gap-2"
          style={{ background: copied ? C.mintBg : C.raised, border: `1px solid ${copied ? C.mint : C.line}`, color: copied ? C.mintInk : C.cream }}>
          {copied ? <><Tick size={15} /> Copied</> : <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2.2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" />
            </svg>
            Copy the link</>}
        </button>

        <p className="m-0 text-[11.5px] leading-relaxed" style={{ color: C.dim }}>
          Your eraser clears his ink and yours. His only clears his own.
        </p>

        <span className="flex-grow" />

        <button type="button" onClick={() => judge('right')}
          className="h-[50px] rounded-[14px] text-[15px] font-extrabold"
          style={{ background: C.mintBg, border: `1px solid ${C.mint}`, color: C.mintInk }}>Correct</button>
        <button type="button" onClick={() => judge('better')}
          className="h-[50px] rounded-[14px] text-[15px] font-extrabold"
          style={{ background: '#2E1B10', border: `1px solid #D4642F`, color: '#FFD9C2' }}>Can be better</button>
        <button type="button" onClick={() => judge('wrong')}
          className="h-[50px] rounded-[14px] text-[15px] font-extrabold"
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
  /** Bumped to throw away a finished challenge's screen before the next one. */
  const [round, setRound] = useState(0);
  const [scores, setScores] = useState<SubScore[]>([]);
  const { play } = useLetterAudio();

  const [items, setItems] = useState<ShowItem[] | null>(null);
  /** What the challenge on screen has done so far, for the trail. */
  const [live, setLive] = useState<{ done: RoundResult[]; pos: number } | null>(null);
  const progress = useCallback((done: RoundResult[], pos: number) => setLive({ done, pos }), []);
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
  const bank = useCallback((id: SubId, results: RoundResult[]) => {
    if (bankedRef.current.has(id)) return;
    bankedRef.current.add(id);
    setScores(s => [...s, scoreOf(id, results)]);
    setLive(null);
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
      <Trail order={order} plan={plan} at={0} scores={[]} live={null} onExit={onExit} />
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
  /* ── the mark ── */
  if (phase === 'done') {
    const result = tally(letters, scores, betterRef.current);
    const every = result.scores.flatMap(s => s.results);
    const pct = result.total ? result.right / result.total : 0;
    const worst = [...result.scores].sort((a, b) =>
      (a.rounds ? a.right / a.rounds : 1) - (b.rounds ? b.right / b.rounds : 1))[0];
    const blockOf = (r: RoundResult) => (r === 'right' ? C.mint : r === 'better' ? '#D4642F' : C.rose);

    return shell(
      <div className="flex-grow overflow-y-auto relative" style={{ overflowX: 'hidden' }}>
        {/* the quarry, enormous and faint, behind everything */}
        <span lang="ar" dir="rtl" aria-hidden="true"
          style={{
            position: 'absolute', right: -30, top: -70, fontFamily: ARABIC,
            fontSize: 'clamp(240px, 42vw, 520px)', lineHeight: 1, color: '#121C2E', userSelect: 'none', pointerEvents: 'none',
          }}>
          {letters.join(' ')}
        </span>

        <div className="relative px-6 sm:px-12 pt-9 flex flex-wrap items-start gap-8">
          <div className="min-w-0">
            <p className="m-0 text-[12px] font-extrabold uppercase" style={{ letterSpacing: '0.18em', color: C.coral }}>The hunt is over</p>
            <h1 className="m-0 mt-3 font-black" style={{ fontSize: 'clamp(40px, 7vw, 54px)', letterSpacing: '-0.035em', lineHeight: 1 }}>
              {result.right}<span style={{ color: '#55637C', fontWeight: 700 }}> / {result.total}</span>
            </h1>
            <p className="m-0 mt-3.5 text-[16px] leading-relaxed max-w-[440px]" style={{ color: C.body }}>
              {pct === 1
                ? 'Every round clean.'
                : worst
                  ? <>Where it slipped most was <strong style={{ color: C.cream }}>{subMeta(worst.id).name.toLowerCase()}</strong> — {worst.right} of {worst.rounds}.</>
                  : 'Nothing was played.'}
            </p>
          </div>

          <span className="flex-grow" />

          <div className="flex-shrink-0 w-full sm:w-[330px] p-5 rounded-[18px]"
            style={{ background: 'rgba(20,30,49,0.86)', border: `1px solid ${C.faint}` }}>
            <p className="m-0 mb-3 text-[11px] font-extrabold uppercase" style={{ letterSpacing: '0.14em', color: C.muted }}>Every round</p>
            <div className="flex flex-wrap gap-[5px]">
              {every.map((r, i) => (
                <span key={i} style={{ width: 22, height: 22, borderRadius: 6, background: blockOf(r) }} />
              ))}
            </div>
            <div className="flex gap-4 mt-3.5 text-[11.5px] font-bold flex-wrap">
              <span className="flex items-center gap-1.5" style={{ color: C.mint }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.mint }} />right</span>
              {result.better > 0 && <span className="flex items-center gap-1.5" style={{ color: '#FFBE96' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#D4642F' }} />can be better</span>}
              <span className="flex items-center gap-1.5" style={{ color: '#FF9AAA' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: C.rose }} />wrong</span>
            </div>
          </div>
        </div>

        {/* one line per challenge, every round its own block */}
        <div className="relative px-6 sm:px-12 pt-8 flex flex-col gap-2.5">
          {SUBS.filter(s => s.ready).map(meta => {
            const s = result.scores.find(x => x.id === meta.id);
            return (
              <div key={meta.id} className="flex items-center gap-3 sm:gap-5" style={{ opacity: s ? 1 : 0.45 }}>
                <span className="flex-shrink-0 w-6 text-[13px]" style={{ fontFamily: 'ui-monospace, monospace', color: '#55637C' }}>
                  {String(meta.n).padStart(2, '0')}
                </span>
                <span className="flex-shrink-0 w-[120px] sm:w-[200px] truncate text-[14px] sm:text-[15px] font-bold"
                  style={{ color: s ? C.cream : C.muted }}>{meta.name}</span>
                {s ? (
                  <span className="flex-grow flex gap-[5px] min-w-0">
                    {s.results.map((r, i) => (
                      <span key={i} style={{ flex: 1, height: 26, borderRadius: 7, background: blockOf(r) }} />
                    ))}
                  </span>
                ) : (
                  <span className="flex-grow" style={{ height: 1, background: C.faint }} />
                )}
                <span className="flex-shrink-0 w-[88px] text-right text-[14px] sm:text-[15px] whitespace-nowrap"
                  style={{ fontFamily: 'ui-monospace, monospace', color: s ? C.cream : '#55637C' }}>
                  {s ? `${s.right}/${s.rounds}` : 'not played'}
                </span>
              </div>
            );
          })}
        </div>

        <div className="relative px-6 sm:px-12 py-9 flex flex-wrap items-center gap-3.5">
          <p className="m-0 text-[13px]" style={{ color: C.muted }}>Saved to his logbook — today is marked as a letters hunt.</p>
          <span className="flex-grow" />
          <button type="button"
            onClick={() => { setScores([]); setAt(0); setRound(r => r + 1); setItems(null); setLive(null); betterRef.current = 0; bankedRef.current = new Set(); setPhase('intro'); }}
            className="h-14 px-7 rounded-[15px] text-[15px] font-bold"
            style={{ background: 'transparent', border: `1px solid #3A4A68`, color: C.cream }}>Hunt them again</button>
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
      <Trail order={order} plan={plan} at={at} scores={scores} live={live} onExit={onExit} />
      <WriteRound letters={letters} rounds={rounds} roomId={roomId} play={play}
        onProgress={progress}
        onDone={results => { betterRef.current += results.filter(r => r === 'better').length; bank('write', results); }} />
    </>);
  }

  /* ── he reads, the tutor marks ── */
  if (!isRow) {
    return shell(<>
      <Trail order={order} plan={plan} at={at} scores={scores} live={live} onExit={onExit} />
      {/* Keyed by the challenge: without it the position carried over from the
          round before, so the first word of the next one finished it. */}
      <ShowAndMark key={sub.id} sub={sub} letters={letters} items={items}
        onProgress={progress} onDone={results => bank(sub.id, results)} />
    </>);
  }

  /* ── a row of ten ── */
  return shell(<>
    <Trail order={order} plan={plan} at={at} scores={scores} live={live} onExit={onExit} />
    <RowRound
      key={`${sub.id}-${round}`}
      letters={letters}
      withVowels={withVowels}
      rounds={rounds}
      showNumbers
      lastLabel={at + 1 < order.length ? 'Next challenge' : 'See the mark'}
      onProgress={progress}
      onDone={results => bank(sub.id, results)}
    />
  </>);
};

/* ── What the alphabet page mounts ───────────────────────────────────────── */

const LettersHunterChallenge: React.FC<{
  letters: string[];
  /** The student the work is for — needed to set it as homework. */
  student?: { id: string; name: string } | null;
  /** Fired once, when the tutor leaves the mark screen by Done. */
  onFinish?: (title: string, detail: string, sourceId: string) => void;
  onExit: () => void;
}> = ({ letters, student, onFinish, onExit }) => {
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

  if (!plan) return <LettersHunterSetup letters={letters} student={student} onStart={setPlan} onClose={onExit} />;

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
