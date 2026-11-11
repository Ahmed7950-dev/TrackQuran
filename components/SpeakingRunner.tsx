// components/SpeakingRunner.tsx
// -----------------------------------------------------------------------------
// The student's side of a speaking homework.
//
// One line at a time: the speaker's photo in the middle, the line plays, and
// the student answers it into the microphone. He can hear it again, open the
// hint, open the meaning — and each of those is remembered, because an answer
// given after reading the hint is not the same answer as one given cold, and
// the tutor is told which it was.
//
// Every answer is saved the moment it is recorded, so leaving halfway loses
// nothing, and the homework cannot be sent until every line has one.
//
// `SpeakingResult` is the same homework once it has been sent: what he said,
// and — after marking — what his teacher made of it.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_ANSWER_MS, answeredCount, isFullyAnswered, saveAids, saveAnswer, submitAttempt,
  type AttemptLine, type LineAids, type SpeakingAttempt,
} from '../services/speakingHomeworkService';
import { Bars, Icon, SpeakerAvatar, SpeakingStyles, fmtClock, usePlayer, useRecorder } from './speakingShared';

const TRY_NAMES = ['First try', 'Second try', 'Third try', 'Fourth try', 'Fifth try'];
export const tryName = (i: number): string => TRY_NAMES[i] ?? `Try ${i + 1}`;

const seenKey = (attemptId: string) => `speakSeen:${attemptId}`;

export const SpeakingRunner: React.FC<{
  attempt: SpeakingAttempt;
  /** The tutor trying his own dialogue: answers stay in the browser, nothing is sent. */
  preview?: boolean;
  onChanged?: (a: SpeakingAttempt) => void;
  onSubmitted?: (a: SpeakingAttempt) => void;
  onExit: () => void;
}> = ({ attempt, preview = false, onChanged, onSubmitted, onExit }) => {
  const [a, setA] = useState(attempt);
  const lines = a.lines;
  const [idx, setIdx] = useState(() => {
    const first = attempt.lines.findIndex(l => !attempt.answers[l.id]);
    return first < 0 ? 0 : first;
  });
  const line: AttemptLine | undefined = lines[idx];
  const answer = line ? a.answers[line.id] : undefined;

  // What he has reached for on each line. Kept in the browser as he goes, so
  // closing the page between opening the hint and answering does not launder
  // the answer into an unaided one; written to the try when the answer is.
  const [seen, setSeen] = useState<Record<string, LineAids>>(() => {
    let stored: Record<string, LineAids> = {};
    try { stored = JSON.parse(localStorage.getItem(seenKey(attempt.id)) ?? '{}') ?? {}; } catch { /* none */ }
    return { ...attempt.aids, ...stored };
  });
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const note = useCallback((lineId: string, change: (s: LineAids) => LineAids) => {
    setSeen(prev => {
      const next = { ...prev, [lineId]: change(prev[lineId] ?? {}) };
      if (!preview) { try { localStorage.setItem(seenKey(attempt.id), JSON.stringify(next)); } catch { /* storage off */ } }
      return next;
    });
  }, [attempt.id, preview]);

  /** Which reveals are open on screen now — a line's own, closed again when he moves on. */
  const [open, setOpen] = useState<{ hint: boolean; text: boolean }>({ hint: false, text: false });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  /** The browser refused to play before a tap: the photo becomes the button. */
  const [blocked, setBlocked] = useState(false);
  const player = usePlayer();
  const lineKey = line ? `line:${line.id}` : '';
  const speaking = !!line && player.playing === lineKey;

  const listen = useCallback(async (auto = false) => {
    if (!line?.audioUrl) return;
    if (player.playing === lineKey) { player.stop(); return; }
    const started = await player.play(lineKey, line.audioUrl);
    if (started) {
      setBlocked(false);
      // Counted until he has answered: what he hears afterwards is revision.
      if (!a.answers[line.id]) note(line.id, s => ({ ...s, listens: (s.listens ?? 0) + 1 }));
    } else if (auto) {
      setBlocked(true);
    }
  }, [line, lineKey, player, note, a.answers]);

  // Arriving on a line he has not answered: the speaker says it.
  useEffect(() => {
    setOpen({ hint: false, text: false });
    setError('');
    if (line && !a.answers[line.id]) void listen(true);
    else player.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const recordingFor = useRef<string | null>(null);
  const recorder = useRecorder({
    maxMs: MAX_ANSWER_MS,
    onTake: async (blob, ms) => {
      const lineId = recordingFor.current;
      if (!lineId) return;
      const aids = { ...a.aids, [lineId]: seenRef.current[lineId] ?? {} };
      if (preview) {
        const url = URL.createObjectURL(blob);
        setA(prev => ({ ...prev, aids, answers: { ...prev.answers, [lineId]: { path: '', url, ms, at: new Date().toISOString() } } }));
        return;
      }
      setSaving(true);
      const saved = await saveAnswer(a.id, lineId, blob, ms);
      setSaving(false);
      if (!saved) { setError('Your answer could not be saved — check your connection and record it again.'); return; }
      const next = { ...saved, aids };
      setA(next);
      onChanged?.(next);
      void saveAids(a.id, aids);
    },
  });
  const recording = recorder.state === 'recording';

  const startRecording = () => {
    if (!line || saving) return;
    player.stop();
    setError('');
    recordingFor.current = line.id;
    void recorder.start();
  };

  const done = answeredCount(a);
  const left = lines.length - done;
  const all = isFullyAnswered(a);
  const last = idx === lines.length - 1;

  const send = async () => {
    if (!all || sending) return;
    if (preview) { onExit(); return; }
    setSending(true); setError('');
    const sent = await submitAttempt(a);
    setSending(false);
    if (!sent) { setError('It could not be sent — check your connection and try again. Your answers are saved.'); return; }
    try { localStorage.removeItem(seenKey(a.id)); } catch { /* optional */ }
    onSubmitted?.(sent);
  };

  const redo = !!a.parentId;
  const shown = recorder.error || error;

  if (!line) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-900 text-slate-600 dark:text-slate-300">
        This homework has no lines to answer yet.
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-100"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <SpeakingStyles />
      <div className="w-full max-w-md mx-auto flex flex-col flex-grow min-h-0 px-5 pt-3.5 pb-5">

        {/* Who, what, how far */}
        <div className="flex items-center gap-2.5">
          <button onClick={onExit} aria-label="Leave — your answers are saved"
            className="w-11 h-11 flex-shrink-0 rounded-[14px] border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <Icon.back />
          </button>
          <div className="flex-grow min-w-0">
            <p className={`text-[11px] font-extrabold uppercase tracking-[0.1em] truncate ${redo ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {preview ? 'Trying it as a student' : redo ? `Another try · ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} to redo` : 'Speaking homework'}
            </p>
            <h1 className="text-[17px] font-extrabold truncate">{a.title}</h1>
          </div>
          <span className="flex-shrink-0 text-[13px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-full px-3 py-1.5 tabular-nums">
            {idx + 1} / {lines.length}
          </span>
        </div>

        {/* One segment a line: teal once answered, amber where he is */}
        <div className="flex gap-1.5 mt-3">
          {lines.map((l, i) => {
            const has = !!a.answers[l.id];
            return (
              <button key={l.id} onClick={() => { if (!recording && !saving) setIdx(i); }}
                aria-label={`Line ${i + 1}${has ? ', answered' : ''}`} aria-current={i === idx ? 'step' : undefined}
                className="flex-1 h-8 flex items-center">
                <span className={`block w-full h-1.5 rounded-full ${
                  has ? 'bg-teal-700 dark:bg-teal-500' : i === idx ? 'bg-amber-500' : 'bg-slate-200 dark:bg-gray-700'} ${
                  i === idx && has ? 'ring-2 ring-offset-2 ring-amber-500 ring-offset-slate-50 dark:ring-offset-gray-900' : ''}`} />
              </button>
            );
          })}
        </div>
        <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
          {done === 0 ? `${lines.length} ${lines.length === 1 ? 'line' : 'lines'} to answer`
            : left === 0 ? 'Every line is answered — you can send it'
            : `${done} answered · ${left} to go`}
        </p>

        {/* The line */}
        {/* The only part that scrolls. It fades out at the foot, so a long
            note runs under the microphone softly instead of being cut by it. */}
        <main className="flex-grow min-h-0 overflow-y-auto -mx-1 px-1 pt-3 pb-5 flex flex-col items-center gap-3.5"
          style={{ WebkitMaskImage: 'linear-gradient(to bottom, #000 calc(100% - 22px), transparent)', maskImage: 'linear-gradient(to bottom, #000 calc(100% - 22px), transparent)' }}>
          <div className="flex-grow min-h-[0.5rem]" />
          <button onClick={() => void listen()} aria-label={speaking ? 'Stop' : 'Listen to the line'}
            className="rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 p-3">
            <SpeakerAvatar url={a.avatarUrl} size={open.hint || open.text || line.note || line.prev || answer ? 104 : 168} speaking={speaking} />
          </button>

          <div className="h-8 flex items-center">
            {speaking ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 px-3.5 py-1.5 text-[13px] font-bold">
                <Bars /> Speaking… listen carefully
              </span>
            ) : blocked ? (
              <span className="text-[13px] font-bold text-amber-800 dark:text-amber-200">Tap the photo to hear the line</span>
            ) : null}
          </div>

          <div className="flex items-center justify-center flex-wrap gap-2.5">
            <button onClick={() => void listen()}
              className="h-12 px-4 rounded-2xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[14.5px] font-bold flex items-center gap-2">
              {speaking ? <Icon.pause className="w-[18px] h-[18px]" /> : <Icon.replay className="w-[18px] h-[18px]" />}
              {speaking ? 'Stop' : 'Listen again'}
            </button>
            {line.hint && (
              <button onClick={() => { setOpen(o => ({ ...o, hint: !o.hint })); if (!a.answers[line.id]) note(line.id, s => ({ ...s, hint: true })); }}
                aria-label={open.hint ? 'Hide the hint' : 'Show the hint'} aria-pressed={open.hint}
                className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
                  open.hint ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'}`}>
                <Icon.bulb />
              </button>
            )}
            {line.text && (
              <button onClick={() => { setOpen(o => ({ ...o, text: !o.text })); if (!a.answers[line.id]) note(line.id, s => ({ ...s, text: true })); }}
                aria-pressed={open.text}
                className={`h-12 px-4 rounded-2xl border text-[14.5px] font-bold flex items-center gap-2 ${
                  open.text ? 'bg-slate-800 border-slate-800 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900'
                    : 'bg-white dark:bg-gray-800 border-slate-300 dark:border-gray-600'}`}>
                <Icon.eye className="w-[18px] h-[18px]" /> Meaning
              </button>
            )}
          </div>

          {open.text && (
            <div className="w-full rounded-[20px] bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-4 py-3.5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">What was said</p>
              <p dir="auto" className="mt-1 text-[19px] font-bold leading-snug">{line.text}</p>
            </div>
          )}
          {open.hint && (
            <div className="w-full rounded-[20px] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 flex gap-3 items-start">
              <span aria-hidden="true" className="w-8 h-8 flex-shrink-0 rounded-[10px] bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-100 flex items-center justify-center">
                <Icon.bulb className="w-[18px] h-[18px]" />
              </span>
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-amber-800 dark:text-amber-200">Hint</p>
                <p dir="auto" className="mt-0.5 text-[15px] font-semibold leading-snug text-amber-900 dark:text-amber-100">{line.hint}</p>
              </div>
            </div>
          )}

          {/* A line sent back: what the teacher said, and what he said */}
          {(line.note || line.prev) && (
            <div className="w-full rounded-[20px] bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 px-4 py-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="w-6 h-6 rounded-full bg-rose-700 text-white flex items-center justify-center">
                  <Icon.cross className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-rose-800 dark:text-rose-200">
                  {line.note ? 'Your teacher’s note' : 'This line came back'}
                </span>
              </div>
              {line.note && <p dir="auto" className="text-[15.5px] font-semibold leading-snug text-rose-900 dark:text-rose-100">{line.note}</p>}
              {line.prev?.url && (
                <button onClick={() => void player.play(`prev:${line.id}`, line.prev!.url)}
                  className="self-start h-11 pl-1.5 pr-3.5 rounded-full border border-rose-300 dark:border-rose-700 bg-white dark:bg-gray-800 text-rose-800 dark:text-rose-200 text-[13.5px] font-bold flex items-center gap-2">
                  <span aria-hidden="true" className="w-8 h-8 rounded-full bg-rose-700 text-white flex items-center justify-center">
                    {player.playing === `prev:${line.id}` ? <Icon.pause className="w-3.5 h-3.5" /> : <Icon.play className="w-3.5 h-3.5" />}
                  </span>
                  Hear what I said last time · {fmtClock(line.prev.ms)}
                </button>
              )}
            </div>
          )}
          <div className="flex-grow min-h-[0.5rem]" />
        </main>

        {/* The answer — a plain last child, so it can never sit on top of the line */}
        <div className="flex-shrink-0 pt-3 pb-3.5">
          {shown && <p role="alert" className="mb-2.5 text-center text-[13px] font-semibold text-rose-700 dark:text-rose-300">{shown}</p>}
          {answer && !recording ? (
            <div className="rounded-[22px] bg-white dark:bg-gray-800 border-2 border-teal-700 dark:border-teal-500 px-4 py-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-300">
                <span aria-hidden="true" className="w-[22px] h-[22px] rounded-full bg-teal-700 dark:bg-teal-500 text-white flex items-center justify-center">
                  <Icon.check className="w-3.5 h-3.5" />
                </span>
                <span className="text-sm font-extrabold">{saving ? 'Saving your answer…' : 'Your answer is saved'}</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => void player.play(`mine:${line.id}`, answer.url)} aria-label="Play my answer"
                  className="w-12 h-12 flex-shrink-0 rounded-full bg-teal-700 dark:bg-teal-500 text-white flex items-center justify-center">
                  {player.playing === `mine:${line.id}` ? <Icon.pause /> : <Icon.play />}
                </button>
                <span aria-hidden="true" className="flex-grow h-1.5 rounded-full bg-teal-100 dark:bg-teal-900/50 overflow-hidden">
                  <span className="block h-full rounded-full bg-teal-700 dark:bg-teal-400"
                    style={{ width: `${player.playing === `mine:${line.id}` ? Math.round(player.progress * 100) : 0}%` }} />
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">{fmtClock(answer.ms)}</span>
              </div>
              <button onClick={startRecording} disabled={saving}
                className="h-11 rounded-[14px] border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                <Icon.mic className="w-[17px] h-[17px]" /> Record it again
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button onClick={recording ? recorder.stop : startRecording} disabled={saving}
                aria-label={recording ? 'Stop recording' : 'Record your answer'}
                className={`w-[92px] h-[92px] rounded-full bg-rose-600 text-white flex items-center justify-center disabled:opacity-50 ${
                  recording ? 'sp-recording' : 'shadow-[0_0_0_8px_#ffe4e6,0_16px_28px_-14px_rgba(225,29,72,0.7)] dark:shadow-[0_0_0_8px_rgba(225,29,72,0.22)]'}`}>
                {recording ? <Icon.stop className="w-9 h-9" /> : <Icon.mic className="w-9 h-9" />}
              </button>
              {recording ? (
                <>
                  <p className="mt-1 text-base font-extrabold tabular-nums">{fmtClock(recorder.elapsed)} <span className="text-slate-500 dark:text-slate-400 font-semibold">/ {fmtClock(MAX_ANSWER_MS)}</span></p>
                  <span aria-hidden="true" className="block w-40 h-1.5 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden">
                    <span ref={recorder.meterRef} className="block h-full w-full origin-left rounded-full bg-rose-600" style={{ transform: 'scaleX(0.02)' }} />
                  </span>
                  <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Tap to stop when you have answered</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-base font-extrabold">{saving ? 'Saving your answer…' : redo ? 'Record a new answer' : 'Record your answer'}</p>
                  <p className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">Answer out loud · up to {Math.round(MAX_ANSWER_MS / 1000)} seconds</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* On, or in */}
        <div className="flex-shrink-0 flex gap-2.5">
          <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0 || recording || saving}
            className="h-[52px] w-24 flex-shrink-0 rounded-2xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[15px] font-bold disabled:opacity-40">
            Back
          </button>
          {all || last ? (
            <button onClick={send} disabled={!all || sending || recording || saving}
              className={`h-[52px] flex-grow rounded-2xl text-[15px] font-extrabold flex items-center justify-center gap-2 ${
                all ? 'bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-60'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400'}`}>
              {!all && <Icon.lock className="w-[17px] h-[17px]" />}
              {sending ? 'Sending…' : preview ? (all ? 'Finish trying it' : `${left} left to record`) : all ? 'Send to my teacher' : `${left} left to record`}
            </button>
          ) : (
            <button onClick={() => setIdx(i => Math.min(lines.length - 1, i + 1))} disabled={!answer || recording || saving}
              className={`h-[52px] flex-grow rounded-2xl text-[15px] font-extrabold flex items-center justify-center gap-2 ${
                answer ? 'bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-60'
                  : 'bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400'}`}>
              {answer ? <>Next line <Icon.arrow className="w-[18px] h-[18px]" /></> : 'Record to go on'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── After it has been sent ────────────────────────────────────────────── */

/**
 * The homework once it is out of the student's hands: with the teacher, sent
 * back, or finished. He can hear what he said on every line, and — once it is
 * marked — see which were right and read the note on the ones that were not.
 */
export const SpeakingResult: React.FC<{
  attempt: SpeakingAttempt;
  /** The try that replaced this one, when the teacher sent lines back. */
  next?: SpeakingAttempt | null;
  onOpenNext?: (a: SpeakingAttempt) => void;
  onExit: () => void;
}> = ({ attempt: a, next, onOpenNext, onExit }) => {
  const player = usePlayer();
  const marked = a.status === 'passed' || a.status === 'needs_revision';
  const right = a.lines.filter(l => a.marks[l.id]?.ok).length;
  const head = useMemo(() => {
    if (a.status === 'passed') return { eyebrow: 'All correct', title: 'Every line is right.', sub: 'Well done — this homework is finished.', tone: 'ok' as const };
    if (a.status === 'needs_revision') {
      const n = a.lines.length - right;
      return { eyebrow: 'Marked', title: `${right} of ${a.lines.length} right.`, sub: `${n === 1 ? 'One line came' : `${n} lines came`} back — only ${n === 1 ? 'that one needs' : 'those need'} recording again.`, tone: 'back' as const };
    }
    return { eyebrow: 'Sent', title: 'It is with your teacher.', sub: 'You will get a notification as soon as it is marked.', tone: 'wait' as const };
  }, [a, right]);

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-100"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <SpeakingStyles />
      <div className="w-full max-w-md mx-auto px-5 pt-3.5 pb-6 flex flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <button onClick={onExit} aria-label="Back"
            className="w-11 h-11 flex-shrink-0 rounded-[14px] border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <Icon.back />
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">Speaking homework</p>
            <h1 className="text-[17px] font-extrabold truncate">{a.title}</h1>
          </div>
        </div>

        <div className="rounded-[26px] bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-5 py-6 flex flex-col items-center text-center gap-3">
          <SpeakerAvatar url={a.avatarUrl} size={104} />
          <span className={`mt-1 text-[11px] font-extrabold uppercase tracking-[0.1em] rounded-full px-3 py-1 ${
            head.tone === 'ok' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : head.tone === 'back' ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>{head.eyebrow}</span>
          <h2 className="text-2xl font-extrabold leading-tight">{head.title}</h2>
          <p className="text-[14.5px] font-medium text-slate-600 dark:text-slate-300">{head.sub}</p>
          {next && next.status === 'open' && onOpenNext && (
            <button onClick={() => onOpenNext(next)}
              className="mt-1 h-[52px] px-6 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-[15px] font-extrabold flex items-center gap-2">
              <Icon.mic className="w-[18px] h-[18px]" />
              Redo {next.lines.length === 1 ? 'that line' : `those ${next.lines.length} lines`}
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          {a.lines.map((l, i) => {
            const take = a.answers[l.id];
            const m = marked ? a.marks[l.id] : undefined;
            const key = `mine:${l.id}`;
            return (
              <div key={l.id} className={`rounded-[20px] bg-white dark:bg-gray-800 border px-4 py-3 flex flex-col gap-2 ${
                m ? (m.ok ? 'border-emerald-300 dark:border-emerald-700' : 'border-rose-300 dark:border-rose-700') : 'border-slate-200 dark:border-gray-700'}`}>
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-extrabold ${
                    m ? (m.ok ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white') : 'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200'}`}>
                    {m ? (m.ok ? <Icon.check className="w-4 h-4" /> : <Icon.cross className="w-4 h-4" />) : i + 1}
                  </span>
                  <p dir="auto" className="flex-grow min-w-0 text-[15px] font-bold leading-snug">
                    {l.text || `Line ${i + 1}`}
                    {m && <span className="sr-only"> — {m.ok ? 'right' : 'wrong'}</span>}
                  </p>
                  {take?.url ? (
                    <button onClick={() => void player.play(key, take.url)} aria-label={`Play my answer to line ${i + 1}`}
                      className="h-11 pl-1.5 pr-3 flex-shrink-0 rounded-full border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 text-[13px] font-bold flex items-center gap-2 tabular-nums">
                      <span aria-hidden="true" className="w-8 h-8 rounded-full bg-teal-700 dark:bg-teal-500 text-white flex items-center justify-center">
                        {player.playing === key ? <Icon.pause className="w-3.5 h-3.5" /> : <Icon.play className="w-3.5 h-3.5" />}
                      </span>
                      {fmtClock(take.ms)}
                    </button>
                  ) : (
                    <span className="flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{a.purgedAt ? 'recording cleared' : 'no recording'}</span>
                  )}
                </div>
                {m && !m.ok && m.note && (
                  <p dir="auto" className="text-[14px] font-semibold leading-snug text-rose-900 dark:text-rose-100 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-[14px] px-3 py-2">
                    {m.note}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onExit}
          className="h-[52px] rounded-2xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[15px] font-bold">
          Back to my page
        </button>
      </div>
    </div>
  );
};
