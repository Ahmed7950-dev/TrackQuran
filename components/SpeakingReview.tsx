// components/SpeakingReview.tsx
// -----------------------------------------------------------------------------
// The tutor marks a speaking homework.
//
// One card a line: the speaker's line and its meaning, the student's answer to
// play, what he reached for before giving it (the hint, the meaning, how many
// times he listened), and two buttons — Right, Wrong. A wrong line opens a note
// for the student.
//
// When every line is marked there is exactly one thing to do: if any are wrong,
// send THOSE back (a new try holding only them); if none are, finish it. Marks
// are saved as they are made, so being called away loses nothing.
// -----------------------------------------------------------------------------
import React, { useEffect, useRef, useState } from 'react';
import {
  passAttempt, reassignWrongLines, saveMarks, unmarkedCount, wrongLines,
  type LineAids, type LineMark, type SpeakingAttempt,
} from '../services/speakingHomeworkService';
import { Icon, SpeakerAvatar, SpeakingStyles, fmtClock, usePlayer } from './speakingShared';

/** What he reached for, in the tutor's words. Amber when it helped him. */
function aidChips(aids: LineAids | undefined): Array<{ label: string; flag: boolean }> {
  const a = aids ?? {};
  const out: Array<{ label: string; flag: boolean }> = [];
  if (!a.hint && !a.text) out.push({ label: 'No hint, no meaning — unaided', flag: false });
  if (a.hint) out.push({ label: 'Opened the hint', flag: true });
  if (a.text) out.push({ label: 'Opened the meaning', flag: true });
  const n = a.listens ?? 0;
  out.push({
    label: n <= 1 ? 'Listened once' : n === 2 ? 'Listened twice' : `Listened ${n} times`,
    flag: n >= 3,
  });
  return out;
}

const SpeakingReview: React.FC<{
  attempt: SpeakingAttempt;
  /** Which try of the homework this is, for the heading ("Second try"). */
  tryLabel?: string;
  onClose: () => void;
  /** Marked and sent on its way — `next` is the new try when lines went back. */
  onDone: (closed: SpeakingAttempt, next: SpeakingAttempt | null) => void;
}> = ({ attempt, tryLabel, onClose, onDone }) => {
  const [marks, setMarks] = useState<Record<string, LineMark>>(attempt.marks ?? {});
  const [busy, setBusy] = useState<'pass' | 'back' | null>(null);
  const [error, setError] = useState('');
  const player = usePlayer();
  /** Already marked and sent on: shown as it was left, nothing to press. */
  const settled = attempt.status === 'passed' || attempt.status === 'needs_revision';
  const waiting = attempt.status === 'open';
  const name = attempt.studentName ?? 'The student';
  const first = name.trim().split(/\s+/)[0];

  // Marks are kept as they are made.
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current || settled) return;
    const t = window.setTimeout(() => { void saveMarks(attempt.id, marks); dirty.current = false; }, 700);
    return () => window.clearTimeout(t);
  }, [marks, attempt.id, settled]);

  const set = (lineId: string, change: (m: LineMark | undefined) => LineMark | undefined) => {
    if (settled || waiting) return;
    dirty.current = true;
    setMarks(prev => {
      const next = { ...prev };
      const v = change(prev[lineId]);
      if (v) next[lineId] = v; else delete next[lineId];
      return next;
    });
  };

  const right = attempt.lines.filter(l => marks[l.id]?.ok).length;
  const wrong = wrongLines(attempt, marks).length;
  const todo = unmarkedCount(attempt, marks);

  const pass = async () => {
    setBusy('pass'); setError('');
    const done = await passAttempt(attempt, marks);
    setBusy(null);
    if (!done) { setError('Could not save — check your connection and try again.'); return; }
    onDone(done, null);
  };
  const sendBack = async () => {
    setBusy('back'); setError('');
    const res = await reassignWrongLines(attempt, marks);
    setBusy(null);
    if (!res) { setError('Could not send the lines back — check your connection and try again.'); return; }
    onDone(res.closed, res.next);
  };

  const sent = attempt.submittedAt
    ? new Date(attempt.submittedAt).toLocaleString(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="text-slate-800 dark:text-slate-100">
      <SpeakingStyles />
      <div className="max-w-[920px] mx-auto flex flex-col gap-4 pb-28">

        <div className="flex flex-wrap items-center gap-3.5">
          <button onClick={onClose}
            className="h-11 pl-2.5 pr-3.5 rounded-[14px] border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 text-sm font-bold flex items-center gap-1.5">
            <Icon.back className="w-[18px] h-[18px]" /> Homework
          </button>
          <SpeakerAvatar url={attempt.avatarUrl} size={60} />
          <div className="flex-[1_1_16rem] min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">
              Speaking homework{tryLabel ? ` · ${tryLabel.toLowerCase()}` : ''}
            </p>
            <h1 className="text-2xl sm:text-[26px] font-extrabold leading-tight truncate">{attempt.title}</h1>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              {name}{sent ? ` · sent ${sent}` : ''} · {attempt.lines.length} {attempt.lines.length === 1 ? 'line' : 'lines'}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-3.5 py-2.5">
            <span className="text-[22px] font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">{right}</span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">right</span>
            <span aria-hidden="true" className="w-px h-5 bg-slate-200 dark:bg-gray-700 mx-1" />
            <span className="text-[22px] font-extrabold text-rose-700 dark:text-rose-400 tabular-nums">{wrong}</span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">wrong</span>
            {!settled && (
              <>
                <span aria-hidden="true" className="w-px h-5 bg-slate-200 dark:bg-gray-700 mx-1" />
                <span className="text-[22px] font-extrabold tabular-nums">{todo}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">to mark</span>
              </>
            )}
          </div>
        </div>

        {waiting && (
          <p className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm font-semibold text-amber-900 dark:text-amber-100">
            {first} has not sent this in yet — the answers recorded so far are below, and can be marked once it arrives.
          </p>
        )}
        {attempt.purgedAt && (
          <p className="rounded-2xl bg-slate-100 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
            The recordings of this homework have been cleared. The marks and notes are kept.
          </p>
        )}

        {attempt.lines.map((l, i) => {
          const take = attempt.answers[l.id];
          const m = marks[l.id];
          const ok = m?.ok === true, no = m?.ok === false;
          const mineKey = `mine:${l.id}`, lineKey = `line:${l.id}`;
          return (
            <section key={l.id} className={`bg-white dark:bg-gray-800 rounded-[22px] border-2 ${
              ok ? 'border-emerald-300 dark:border-emerald-700' : no ? 'border-rose-300 dark:border-rose-700' : 'border-slate-200 dark:border-gray-700'}`}>
              <div className="flex flex-wrap gap-4 px-4 sm:px-5 py-4">

                <div className="flex-[1_1_20rem] min-w-0 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-[30px] h-[30px] flex-shrink-0 rounded-full bg-slate-100 dark:bg-gray-700 text-sm font-extrabold flex items-center justify-center">{i + 1}</span>
                    {l.audioUrl && (
                      <button onClick={() => void player.play(lineKey, l.audioUrl!)} aria-label={`Play the speaker's line ${i + 1}`}
                        className="w-10 h-10 flex-shrink-0 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                        {player.playing === lineKey ? <Icon.pause className="w-[18px] h-[18px]" /> : <Icon.speaker className="w-[18px] h-[18px]" />}
                      </button>
                    )}
                    <p dir="auto" className="text-[17px] font-bold leading-snug">{l.text || <span className="text-slate-500 dark:text-slate-400 font-semibold">No meaning written</span>}</p>
                  </div>
                  {l.hint && <p dir="auto" className="text-[13.5px] font-medium text-slate-500 dark:text-slate-400 sm:pl-10">Hint: {l.hint}</p>}
                  {l.note && (
                    <p dir="auto" className="text-[13.5px] font-semibold text-rose-800 dark:text-rose-200 sm:pl-10">Your note last time: {l.note}</p>
                  )}

                  {take?.url ? (
                    <div className="flex items-center gap-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-2xl pl-2.5 pr-3.5 py-2.5">
                      <button onClick={() => void player.play(mineKey, take.url)} aria-label={`Play ${first}'s answer to line ${i + 1}`}
                        className="w-11 h-11 flex-shrink-0 rounded-full bg-teal-700 dark:bg-teal-500 text-white flex items-center justify-center">
                        {player.playing === mineKey ? <Icon.pause className="w-[18px] h-[18px]" /> : <Icon.play className="w-[18px] h-[18px]" />}
                      </button>
                      <div className="flex-grow min-w-0 flex flex-col gap-1.5">
                        <span className="text-xs font-extrabold text-teal-800 dark:text-teal-200">{first}’s answer</span>
                        <span aria-hidden="true" className="block h-1.5 rounded-full bg-teal-100 dark:bg-teal-900/60 overflow-hidden">
                          <span className="block h-full rounded-full bg-teal-700 dark:bg-teal-400"
                            style={{ width: `${player.playing === mineKey ? Math.round(player.progress * 100) : 0}%` }} />
                        </span>
                      </div>
                      <span className="text-[13.5px] font-bold tabular-nums text-teal-900 dark:text-teal-100">{fmtClock(take.ms)}</span>
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 dark:border-gray-600 px-3.5 py-3 text-[13.5px] font-semibold text-slate-500 dark:text-slate-400">
                      {attempt.purgedAt ? 'Recording cleared.' : 'Not recorded yet.'}
                    </p>
                  )}

                  {(take || attempt.aids[l.id]) && (
                    <div className="flex flex-wrap gap-1.5">
                      {aidChips(attempt.aids[l.id]).map(c => (
                        <span key={c.label} className={`text-xs font-bold rounded-full px-2.5 py-1 ${
                          c.flag ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                            : 'bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-slate-200'}`}>{c.label}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-[0_1_14.5rem] min-w-[12.5rem] flex flex-col gap-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => set(l.id, cur => (cur?.ok === true ? undefined : { ok: true }))}
                      aria-pressed={ok} disabled={settled || waiting}
                      className={`h-[52px] rounded-2xl border-2 text-[14.5px] font-extrabold flex items-center justify-center gap-1.5 disabled:cursor-default ${
                        ok ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 disabled:opacity-50'}`}>
                      <Icon.check className="w-[17px] h-[17px]" /> Right
                    </button>
                    <button onClick={() => set(l.id, cur => (cur?.ok === false ? undefined : { ok: false, note: cur?.note ?? '' }))}
                      aria-pressed={no} disabled={settled || waiting}
                      className={`h-[52px] rounded-2xl border-2 text-[14.5px] font-extrabold flex items-center justify-center gap-1.5 disabled:cursor-default ${
                        no ? 'bg-rose-700 border-rose-700 text-white'
                          : 'bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 disabled:opacity-50'}`}>
                      <Icon.cross className="w-4 h-4" /> Wrong
                    </button>
                  </div>
                  {no && (
                    <label className="flex flex-col gap-1 text-xs font-extrabold text-rose-800 dark:text-rose-200">
                      Note for {first}
                      <textarea rows={3} value={m?.note ?? ''} readOnly={settled}
                        onChange={e => set(l.id, () => ({ ok: false, note: e.target.value }))}
                        placeholder="What to change — he sees this beside the line."
                        className="resize-y rounded-[14px] border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-3 py-2.5 text-sm font-medium leading-snug text-rose-900 dark:text-rose-100 placeholder:text-rose-400 dark:placeholder:text-rose-300/60" />
                    </label>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* The one thing to do next */}
      {!settled && !waiting && (
        <div className="fixed inset-x-0 bottom-0 z-[60] bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 shadow-[0_-16px_32px_-24px_rgba(15,23,42,0.4)] px-4 sm:px-6 py-3.5"
          style={{ paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-[920px] mx-auto flex flex-wrap items-center gap-3">
            <p className={`flex-[1_1_16rem] text-sm font-semibold ${error ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}`}>
              {error || (todo === attempt.lines.length
                ? 'Listen to each answer and mark it right or wrong.'
                : todo > 0
                ? `Mark the ${todo === 1 ? 'last line' : `other ${todo} lines`} — then send back only the wrong ones.`
                : wrong > 0
                ? `${right} right, ${wrong} wrong. Only the wrong ${wrong === 1 ? 'line goes' : 'lines go'} back — the right ones are finished for good.`
                : `Every line is right. Finishing it tells ${first}, and the recordings are cleared in a week.`)}
            </p>
            <button onClick={pass} disabled={todo > 0 || wrong > 0 || !!busy}
              className={`h-[52px] px-5 rounded-2xl text-[15px] font-extrabold ${
                todo === 0 && wrong === 0 ? 'bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400'}`}>
              {busy === 'pass' ? 'Finishing…' : 'All correct — finish'}
            </button>
            <button onClick={sendBack} disabled={todo > 0 || wrong === 0 || !!busy}
              className={`h-[52px] px-5 rounded-2xl text-[15px] font-extrabold flex items-center gap-2 ${
                todo === 0 && wrong > 0 ? 'bg-rose-700 hover:bg-rose-800 text-white disabled:opacity-60'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400'}`}>
              <Icon.replay className="w-[17px] h-[17px]" />
              {busy === 'back' ? 'Sending…' : wrong > 0 ? `Reassign ${wrong} ${wrong === 1 ? 'line' : 'lines'}` : 'Reassign'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeakingReview;
