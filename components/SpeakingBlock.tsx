// components/SpeakingBlock.tsx
// -----------------------------------------------------------------------------
// A speaking homework as it sits in the Homework tab — the same block for the
// student and for his tutor, as the recitation block is on the Quran side.
//
// It is the whole story of one homework: where every line stands now (the bar
// across the top), then one row a try — first try, second try — each line a
// pill that plays the answer given on that try, ticked or crossed once marked,
// with the tutor's notes under the try they belong to. One button at the foot
// says what happens next, and to whom.
// -----------------------------------------------------------------------------
import React from 'react';
import {
  KEEP_AFTER_PASS_DAYS, answeredCount, chainProgress,
  type SpeakingAttempt, type SpeakingChain,
} from '../services/speakingHomeworkService';
import { Icon, SpeakerAvatar, usePlayer } from './speakingShared';
import { tryName } from './SpeakingRunner';

const day = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : '';

/** What one try amounts to, in a line. */
function trySummary(t: SpeakingAttempt, studentMode: boolean): { when: string; sum: string; tone: 'calm' | 'due' | 'ok' } {
  const n = t.lines.length;
  if (t.status === 'open') {
    const done = answeredCount(t);
    return {
      when: done ? `${done} of ${n} recorded so far` : 'Not recorded yet',
      sum: t.parentId ? `${n} ${n === 1 ? 'line' : 'lines'} to redo` : `${n} ${n === 1 ? 'line' : 'lines'} to answer`,
      tone: 'due',
    };
  }
  if (t.status === 'submitted') {
    return { when: `Sent ${day(t.submittedAt)}`, sum: studentMode ? 'With your teacher' : 'Waiting to be marked', tone: 'due' };
  }
  const right = t.lines.filter(l => t.marks[l.id]?.ok).length;
  const when = `Sent ${day(t.submittedAt)} · marked ${day(t.reviewedAt)}`;
  if (t.status === 'passed') return { when, sum: n === 1 ? 'Right' : `All ${n} right`, tone: 'ok' };
  return { when, sum: `${right} right · ${n - right} sent back`, tone: 'calm' };
}

const SpeakingBlock: React.FC<{
  chain: SpeakingChain;
  studentMode: boolean;
  /** "Assigned 9 Nov · due Thu 12 Nov" or "From Lesson 7" — where it came from. */
  context?: string;
  /** The student goes to record (or to look at) this try. */
  onOpen?: (a: SpeakingAttempt) => void;
  /** The tutor marks (or looks back at) this try. */
  onMark?: (a: SpeakingAttempt) => void;
  /** Anything else the tutor can do to it — cancel, remove. */
  extra?: React.ReactNode;
}> = ({ chain, studentMode, context, onOpen, onMark, extra }) => {
  const player = usePlayer();
  const { latest, tries } = chain;
  const first = tries[0];
  const progress = chainProgress(chain);
  const right = progress.filter(p => p.state === 'ok').length;
  const total = progress.length;
  const purged = tries.every(t => !!t.purgedAt);

  const pill = (() => {
    if (chain.passed) return { text: 'All correct', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' };
    if (latest.status === 'submitted') {
      return studentMode
        ? { text: 'With your teacher', cls: 'bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-slate-200' }
        : { text: 'Waiting for your marking', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' };
    }
    const idx = tries.length - 1;
    if (idx > 0) return { text: `${tryName(idx)} waiting${studentMode ? ' for you' : ''}`, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' };
    return answeredCount(latest) > 0
      ? { text: 'In progress', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' }
      : { text: studentMode ? 'To do' : 'With student', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' };
  })();

  // What the button at the foot does, and for whom.
  const action = (() => {
    if (studentMode) {
      if (latest.status !== 'open' || !onOpen) return null;
      const n = latest.lines.length;
      const label = latest.parentId ? `Redo ${n} ${n === 1 ? 'line' : 'lines'}`
        : answeredCount(latest) > 0 ? 'Continue' : 'Start';
      return { label, run: () => onOpen(latest), cls: 'bg-teal-700 hover:bg-teal-800 text-white', icon: <Icon.mic className="w-[17px] h-[17px]" /> };
    }
    if (latest.status === 'submitted' && onMark) {
      return { label: `Mark the ${tryName(tries.length - 1).toLowerCase()}`, run: () => onMark(latest), cls: 'bg-rose-700 hover:bg-rose-800 text-white', icon: <Icon.check className="w-[17px] h-[17px]" /> };
    }
    return null;
  })();

  return (
    <article className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-3.5 px-4 sm:px-5 pt-4 pb-3.5">
        <SpeakerAvatar url={first.avatarUrl} size={54} className="m-1" />
        <div className="flex-[1_1_13rem] min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">Speaking homework</p>
          <h3 className="text-[19px] font-extrabold text-slate-800 dark:text-white truncate">{first.title}</h3>
          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            {total} {total === 1 ? 'line' : 'lines'}{context ? ` · ${context}` : ''}
          </p>
        </div>
        <span className={`text-[12.5px] font-extrabold rounded-full px-3 py-1.5 ${pill.cls}`}>{pill.text}</span>
      </div>

      {/* Where every line stands, across all the tries */}
      <div className="px-4 sm:px-5 pb-1.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">
            {right === total ? `All ${total} ${total === 1 ? 'line' : 'lines'} right` : `${right} of ${total} lines right so far`}
          </span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 tabular-nums">{total ? Math.round((right / total) * 100) : 0}%</span>
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {progress.map(p => (
            <span key={p.id} className={`flex-1 h-2 rounded-full ${
              p.state === 'ok' ? 'bg-emerald-600' : p.state === 'no' ? 'bg-amber-500' : 'bg-slate-200 dark:bg-gray-700'}`} />
          ))}
        </div>
      </div>

      {/* One row a try */}
      <div className="px-4 sm:px-5 pt-3 pb-1.5 flex flex-col gap-2.5">
        {tries.map((t, ti) => {
          const s = trySummary(t, studentMode);
          const marked = t.status === 'passed' || t.status === 'needs_revision';
          const notes = marked ? t.lines.filter(l => t.marks[l.id] && !t.marks[l.id].ok && t.marks[l.id].note) : [];
          const numberOf = (id: string) => first.lines.findIndex(l => l.id === id) + 1;
          const open = t.status === 'open';
          return (
            <div key={t.id} className={`rounded-[18px] border px-3.5 py-3 flex flex-col gap-3 ${
              open || t.status === 'submitted'
                ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15'
                : 'border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40'}`}>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-xs font-extrabold text-white bg-slate-800 dark:bg-slate-200 dark:text-slate-900 rounded-full px-2.5 py-1">{tryName(ti)}</span>
                <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">{s.when}</span>
                <span className="flex-grow" />
                <span className={`text-[13px] font-extrabold ${
                  s.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-300'
                    : s.tone === 'due' ? 'text-amber-800 dark:text-amber-200' : 'text-slate-700 dark:text-slate-200'}`}>{s.sum}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {t.lines.map(l => {
                  const take = t.answers[l.id];
                  const m = marked ? t.marks[l.id] : undefined;
                  const key = `${t.id}:${l.id}`;
                  const n = numberOf(l.id) || t.lines.indexOf(l) + 1;
                  const state = m ? (m.ok ? 'right' : 'wrong') : take ? (t.status === 'submitted' ? 'sent in' : 'recorded') : 'not recorded yet';
                  return (
                    <button key={l.id} disabled={!take?.url}
                      onClick={() => take?.url && void player.play(key, take.url)}
                      aria-label={`${take?.url ? 'Play line' : 'Line'} ${n} — ${state}`}
                      className={`h-11 pl-1.5 pr-3 rounded-full border bg-white dark:bg-gray-800 text-[13px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 disabled:cursor-default ${
                        m ? (m.ok ? 'border-emerald-300 dark:border-emerald-700' : 'border-rose-300 dark:border-rose-700') : 'border-slate-300 dark:border-gray-600'}`}>
                      <span aria-hidden="true" className={`w-[30px] h-[30px] rounded-full flex items-center justify-center ${
                        m ? (m.ok ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white')
                          : take ? 'bg-teal-700 dark:bg-teal-500 text-white' : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200'}`}>
                        {m ? (m.ok ? <Icon.check className="w-3.5 h-3.5" /> : <Icon.cross className="w-3.5 h-3.5" />)
                          : take ? <Icon.mic className="w-3.5 h-3.5" /> : <span className="text-[13px] font-extrabold leading-none">…</span>}
                      </span>
                      Line {n}
                      {take?.url && (
                        <span className="text-slate-600 dark:text-slate-300">
                          {player.playing === key ? <Icon.pause className="w-3.5 h-3.5" /> : <Icon.play className="w-3.5 h-3.5" />}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {notes.map(l => (
                <p key={l.id} dir="auto" className="text-[13.5px] font-semibold leading-snug text-rose-900 dark:text-rose-100 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-[14px] px-3 py-2">
                  Line {numberOf(l.id)} · “{t.marks[l.id].note}”
                </p>
              ))}

              {!studentMode && marked && onMark && (
                <button onClick={() => onMark(t)} className="self-start text-[13px] font-bold text-teal-700 dark:text-teal-300 underline underline-offset-2">
                  Look at the marking
                </button>
              )}
              {!studentMode && open && answeredCount(t) > 0 && onMark && (
                <button onClick={() => onMark(t)} className="self-start text-[13px] font-bold text-teal-700 dark:text-teal-300 underline underline-offset-2">
                  Listen to what he has recorded so far
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 px-4 sm:px-5 pt-2 pb-4">
        <p className="flex-[1_1_14rem] text-[12.5px] font-medium leading-snug text-slate-500 dark:text-slate-400">
          {purged ? 'The recordings have been cleared — the marks and notes are kept.'
            : chain.passed ? `Tap a line to hear the answer. The recordings are cleared ${KEEP_AFTER_PASS_DAYS} days after it was finished.`
            : `Tap a line to hear the answer. Recordings are cleared ${KEEP_AFTER_PASS_DAYS} days after every line is right.`}
        </p>
        {extra}
        {action && (
          <button onClick={action.run} className={`h-12 px-5 rounded-2xl text-[15px] font-extrabold flex items-center gap-2 ${action.cls}`}>
            {action.icon}{action.label}
          </button>
        )}
      </div>
    </article>
  );
};

export default SpeakingBlock;
