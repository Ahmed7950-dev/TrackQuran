// components/SpeakingBuilder.tsx
// -----------------------------------------------------------------------------
// The tutor writes a speaking homework: one photo of the speaker, and the
// lines he says. Each line is a recording (a file, or spoken into the
// microphone here), what it means in English, and a hint towards the answer.
//
// Everything saves as it is typed. "Try it as a student" runs the dialogue
// exactly as the student gets it, with nothing kept or sent.
// -----------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  emptyLine, notReadyReason, playableLines, saveSpeakingContent, uploadSpeakingAvatar, uploadSpeakingLineAudio,
  type SpeakingAttempt, type SpeakingContent, type SpeakingLine,
} from '../services/speakingHomeworkService';
import { Icon, SpeakerAvatar, SpeakingStyles, fmtClock, usePlayer, useRecorder } from './speakingShared';
import { SpeakingRunner } from './SpeakingRunner';

/** How long an audio file runs — read off the file, before it is uploaded. */
const durationOf = (blob: Blob): Promise<number | undefined> => new Promise(resolve => {
  const url = URL.createObjectURL(blob);
  const a = new Audio();
  const done = (ms?: number) => { URL.revokeObjectURL(url); resolve(ms); };
  a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : undefined);
  a.onerror = () => done(undefined);
  a.src = url;
});

const SpeakingBuilder: React.FC<{
  templateId: string;
  title: string;
  initial: SpeakingContent;
  /** Told of every change, so the list behind it is right when he goes back. */
  onChanged?: (content: SpeakingContent) => void;
}> = ({ templateId, title, initial, onChanged }) => {
  const [content, setContent] = useState<SpeakingContent>(initial);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved');
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState('');
  const [trying, setTrying] = useState(false);
  const player = usePlayer();
  const avatarInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const pickFor = useRef<string | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // Saved a moment after the last keystroke.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaveState('saving');
    const t = window.setTimeout(async () => {
      const ok = await saveSpeakingContent(templateId, content);
      setSaveState(ok ? 'saved' : 'failed');
      if (ok) onChangedRef.current?.(content);
    }, 600);
    return () => window.clearTimeout(t);
  }, [content, templateId]);

  const patchLine = (id: string, patch: Partial<SpeakingLine>) =>
    setContent(c => ({ ...c, lines: c.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) }));
  const move = (i: number, by: number) => setContent(c => {
    const j = i + by;
    if (j < 0 || j >= c.lines.length) return c;
    const lines = [...c.lines];
    [lines[i], lines[j]] = [lines[j], lines[i]];
    return { ...c, lines };
  });
  const remove = (id: string) => {
    if (!window.confirm('Delete this line?')) return;
    setContent(c => ({ ...c, lines: c.lines.filter(l => l.id !== id) }));
  };

  const putAudio = async (lineId: string, blob: Blob) => {
    setBusyLine(lineId); setError('');
    const ms = await durationOf(blob);
    const url = await uploadSpeakingLineAudio(blob, templateId, lineId);
    setBusyLine(null);
    if (!url) { setError('The audio could not be uploaded — check your connection and try again.'); return; }
    patchLine(lineId, { audioUrl: url, audioMs: ms });
  };

  const recordingFor = useRef<string | null>(null);
  const [recLine, setRecLine] = useState<string | null>(null);
  const recorder = useRecorder({
    maxMs: 120_000,
    onTake: async blob => {
      const id = recordingFor.current;
      setRecLine(null);
      if (id) await putAudio(id, blob);
    },
  });
  const record = (lineId: string) => {
    if (recorder.state === 'recording') { recorder.stop(); return; }
    player.stop();
    recordingFor.current = lineId;
    setRecLine(lineId);
    void recorder.start();
  };
  useEffect(() => { if (recorder.error) setRecLine(null); }, [recorder.error]);

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setAvatarBusy(true); setError('');
    const url = await uploadSpeakingAvatar(file, templateId);
    setAvatarBusy(false);
    if (!url) { setError('The photo could not be uploaded — check your connection and try again.'); return; }
    setContent(c => ({ ...c, avatarUrl: url }));
  };

  const why = notReadyReason(content);
  const preview = useMemo<SpeakingAttempt>(() => ({
    id: 'preview', rootId: 'preview', parentId: null, templateId, teacherId: '', studentId: '',
    homeworkId: null, lessonId: null, title, avatarUrl: content.avatarUrl,
    lines: playableLines(content), answers: {}, aids: {}, marks: {}, status: 'open',
    createdAt: new Date().toISOString(), submittedAt: null, reviewedAt: null, purgedAt: null,
    // Rebuilt only when he opens it, so typing behind it does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [trying]);

  if (trying) {
    return (
      <div className="fixed inset-0 z-[90] bg-slate-50 dark:bg-gray-900">
        <SpeakingRunner attempt={preview} preview onExit={() => setTrying(false)} />
      </div>
    );
  }

  const shown = error || recorder.error;

  return (
    <div className="text-slate-800 dark:text-slate-100 flex flex-col gap-4">
      <SpeakingStyles />
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-full px-3 py-1.5">
          Speaking dialogue
        </span>
        <span className="flex-grow" />
        <span role="status" className={`text-[13px] font-semibold flex items-center gap-1.5 ${
          saveState === 'failed' ? 'text-rose-700 dark:text-rose-300' : saveState === 'saving' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {saveState === 'saved' && <Icon.check className="w-[15px] h-[15px]" />}
          {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Not saved — check your connection'}
        </span>
        <button onClick={() => setTrying(true)} disabled={playableLines(content).length === 0}
          title={playableLines(content).length === 0 ? 'Add the audio for a line first' : undefined}
          className="h-11 px-4 rounded-[14px] border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-bold disabled:opacity-50">
          Try it as a student
        </button>
      </div>

      {shown && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{shown}</p>}
      {why && !shown && (
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-2.5">
          Not ready to give out yet. {why}
        </p>
      )}

      <div className="flex flex-wrap gap-5 items-start">
        {/* The speaker */}
        <div className="flex-[1_1_15rem] max-w-xs bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl p-5 flex flex-col items-center gap-4">
          <SpeakerAvatar url={content.avatarUrl} size={146} className="m-2" />
          <input ref={avatarInput} type="file" accept="image/*" className="hidden"
            onChange={e => { void pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={() => avatarInput.current?.click()} disabled={avatarBusy}
            className="h-11 px-4 rounded-[14px] border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-bold flex items-center gap-2 disabled:opacity-50">
            <Icon.upload className="w-[17px] h-[17px]" />
            {avatarBusy ? 'Uploading…' : content.avatarUrl ? 'Change the photo' : 'Upload the speaker’s photo'}
          </button>
          <p className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400 text-center leading-snug">
            One photo for the whole dialogue. The student sees it in the middle of the screen while this person speaks.
          </p>
        </div>

        {/* The lines */}
        <div className="flex-[999_1_30rem] min-w-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-xl font-extrabold">The dialogue · {content.lines.length} {content.lines.length === 1 ? 'line' : 'lines'}</h2>
            <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">The student answers each line out loud.</span>
          </div>

          <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; const id = pickFor.current; e.target.value = ''; if (f && id) void putAudio(id, f); }} />

          {content.lines.map((l, i) => {
            const key = `line:${l.id}`;
            const busy = busyLine === l.id;
            const rec = recLine === l.id && recorder.state === 'recording';
            return (
              <div key={l.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-[22px] p-4 flex gap-3.5">
                <div className="flex flex-col items-center gap-1.5">
                  <span className="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-sm font-extrabold flex items-center justify-center">{i + 1}</span>
                  <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move line ${i + 1} up`}
                    className="w-9 h-9 rounded-[10px] border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-30">
                    <Icon.up className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === content.lines.length - 1} aria-label={`Move line ${i + 1} down`}
                    className="w-9 h-9 rounded-[10px] border border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-30">
                    <Icon.down className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-grow min-w-0 flex flex-col gap-2.5">
                  <label className="flex flex-col gap-1 text-xs font-extrabold text-slate-600 dark:text-slate-300">
                    What the speaker says — in English
                    <input type="text" value={l.text} onChange={e => patchLine(l.id, { text: e.target.value })}
                      placeholder="e.g. What would you like to drink?"
                      className="h-11 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 text-[15px] font-semibold text-slate-800 dark:text-slate-100" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-extrabold text-amber-800 dark:text-amber-200">
                    Hint for the student’s answer
                    <input type="text" value={l.hint} onChange={e => patchLine(l.id, { hint: e.target.value })}
                      placeholder="e.g. Ask for tea with mint, and say please."
                      className="h-11 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 text-[15px] font-medium text-amber-900 dark:text-amber-100 placeholder:text-amber-700/60 dark:placeholder:text-amber-200/50" />
                  </label>

                  {rec ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 px-3 py-2">
                      <button onClick={() => record(l.id)} aria-label="Stop recording"
                        className="sp-recording w-10 h-10 rounded-full bg-rose-600 text-white flex items-center justify-center">
                        <Icon.stop className="w-4 h-4" />
                      </button>
                      <span className="text-sm font-extrabold tabular-nums text-rose-800 dark:text-rose-200">{fmtClock(recorder.elapsed)}</span>
                      <span aria-hidden="true" className="flex-[1_1_6rem] h-1.5 rounded-full bg-rose-100 dark:bg-rose-900/50 overflow-hidden">
                        <span ref={recorder.meterRef} className="block h-full w-full origin-left rounded-full bg-rose-600" style={{ transform: 'scaleX(0.02)' }} />
                      </span>
                      <span className="text-[13px] font-semibold text-rose-800 dark:text-rose-200">Recording — tap to stop</span>
                    </div>
                  ) : l.audioUrl ? (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 pl-2 pr-3 py-2">
                      <button onClick={() => void player.play(key, l.audioUrl!)} aria-label={`Play line ${i + 1}`}
                        className="w-10 h-10 rounded-full bg-teal-700 dark:bg-teal-500 text-white flex items-center justify-center">
                        {player.playing === key ? <Icon.pause className="w-4 h-4" /> : <Icon.play className="w-4 h-4" />}
                      </button>
                      <span className="flex-[1_1_7rem] text-[13.5px] font-bold text-teal-900 dark:text-teal-100">
                        {busy ? 'Uploading…' : 'Audio ready'}
                      </span>
                      {l.audioMs ? <span className="text-[13px] font-bold tabular-nums text-teal-800 dark:text-teal-200">{fmtClock(l.audioMs)}</span> : null}
                      <button onClick={() => { pickFor.current = l.id; audioInput.current?.click(); }} disabled={busy}
                        className="h-9 px-3 rounded-[10px] border border-teal-200 dark:border-teal-700 bg-white dark:bg-gray-800 text-teal-800 dark:text-teal-200 text-[13px] font-bold disabled:opacity-50">
                        Replace
                      </button>
                      <button onClick={() => record(l.id)} disabled={busy} aria-label={`Record line ${i + 1} again`}
                        className="w-9 h-9 rounded-[10px] border border-rose-200 dark:border-rose-800 bg-white dark:bg-gray-800 text-rose-700 dark:text-rose-300 flex items-center justify-center disabled:opacity-50">
                        <Icon.mic className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2.5 rounded-[14px] border-2 border-dashed border-slate-300 dark:border-gray-600 px-3 py-2.5">
                      <span className="flex-[1_1_9rem] text-[13.5px] font-semibold text-rose-700 dark:text-rose-300">
                        {busy ? 'Uploading…' : 'No audio yet — a student can’t be asked this line until it has one.'}
                      </span>
                      <button onClick={() => { pickFor.current = l.id; audioInput.current?.click(); }} disabled={busy}
                        className="h-10 px-3.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13.5px] font-extrabold flex items-center gap-1.5 disabled:opacity-50">
                        <Icon.upload className="w-4 h-4" /> Upload audio
                      </button>
                      <button onClick={() => record(l.id)} disabled={busy}
                        className="h-10 px-3.5 rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-[13.5px] font-extrabold flex items-center gap-1.5 disabled:opacity-50">
                        <Icon.mic className="w-4 h-4" /> Record it
                      </button>
                    </div>
                  )}
                </div>

                <button onClick={() => remove(l.id)} aria-label={`Delete line ${i + 1}`}
                  className="w-10 h-10 flex-shrink-0 rounded-xl text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center">
                  <Icon.trash className="w-[18px] h-[18px]" />
                </button>
              </div>
            );
          })}

          <button onClick={() => setContent(c => ({ ...c, lines: [...c.lines, emptyLine()] }))}
            className="h-14 rounded-[18px] border-2 border-dashed border-slate-400 dark:border-gray-500 text-slate-700 dark:text-slate-200 text-[15px] font-extrabold flex items-center justify-center gap-2 hover:bg-white dark:hover:bg-gray-800">
            <Icon.plus className="w-[18px] h-[18px]" /> Add a line
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpeakingBuilder;
