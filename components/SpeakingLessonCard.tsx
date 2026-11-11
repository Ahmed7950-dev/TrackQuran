// components/SpeakingLessonCard.tsx
// -----------------------------------------------------------------------------
// A speaking homework that has been added to a lesson, opened from that
// lesson's Homework tab.
//
// The student sees his goes at it and a button to start (or carry on, or redo
// the lines that came back); the recording itself happens on /speak/<id>. His
// tutor, with that student open, sees the same blocks with Mark on them. With
// no student at all it is simply the dialogue, to listen through.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useState } from 'react';
import type { HomeworkTemplate } from '../services/arabicHomeworkTemplateService';
import {
  emptyContent, listAttemptsForStudent, openLessonAttempt, playableLines, speakUrl, toChains,
  type SpeakingAttempt, type SpeakingChain,
} from '../services/speakingHomeworkService';
import SpeakingBlock from './SpeakingBlock';
import SpeakingReview from './SpeakingReview';
import { tryName } from './SpeakingRunner';
import { Icon, SpeakerAvatar, SpeakingStyles, fmtClock, usePlayer } from './speakingShared';

const SpeakingLessonCard: React.FC<{
  template: HomeworkTemplate;
  lessonId: string;
  lessonTitle: string;
  studentMode: boolean;
  studentId?: string;
  studentName?: string;
  /** The student's tutor — who his answers go to. */
  teacherId: string;
}> = ({ template, lessonId, lessonTitle, studentMode, studentId, studentName, teacherId }) => {
  const content = template.speaking ?? emptyContent();
  const lines = playableLines(content);
  const [chains, setChains] = useState<SpeakingChain[] | null>(studentId ? null : []);
  const [marking, setMarking] = useState<SpeakingAttempt | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const player = usePlayer();

  const load = useCallback(async () => {
    if (!studentId) return;
    const all = await listAttemptsForStudent(studentId);
    setChains(toChains(all.filter(a => a.templateId === template.id && a.lessonId === lessonId && !a.homeworkId)));
  }, [studentId, template.id, lessonId]);
  useEffect(() => { void load(); }, [load]);

  const start = async () => {
    if (!studentId) return;
    setStarting(true); setError('');
    const a = await openLessonAttempt({
      templateId: template.id, title: template.title, content, lessonId,
      teacherId, studentId, studentName,
    });
    setStarting(false);
    if (!a) { setError('Could not open the homework — check your connection and try again.'); return; }
    window.location.href = speakUrl(a.id);
  };

  if (marking) {
    const chain = (chains ?? []).find(c => c.rootId === marking.rootId);
    const index = Math.max(0, chain?.tries.findIndex(t => t.id === marking.id) ?? 0);
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <SpeakingReview attempt={marking} tryLabel={tryName(index)}
          onClose={() => { setMarking(null); void load(); }}
          onDone={() => { setMarking(null); void load(); }} />
      </div>
    );
  }

  const unfinished = (chains ?? []).some(c => !c.passed);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4 text-slate-800 dark:text-slate-100">
      <SpeakingStyles />

      {/* What it is — and, for a student with nothing on the go, where to begin */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl px-5 py-5 flex flex-wrap items-center gap-4">
        <SpeakerAvatar url={content.avatarUrl} size={84} className="m-1.5" />
        <div className="flex-[1_1_14rem] min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">Speaking homework · {lessonTitle}</p>
          <h2 className="text-[22px] font-extrabold leading-tight">{template.title}</h2>
          <p className="mt-0.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            {lines.length} {lines.length === 1 ? 'line' : 'lines'}. Listen to each one, then answer it out loud — your teacher marks every answer.
          </p>
        </div>
        {studentMode && studentId && chains !== null && !unfinished && (
          <button onClick={start} disabled={starting || lines.length === 0}
            className="h-[52px] px-6 rounded-2xl bg-teal-700 hover:bg-teal-800 text-white text-[15px] font-extrabold flex items-center gap-2 disabled:opacity-50">
            <Icon.mic className="w-[18px] h-[18px]" />
            {starting ? 'Opening…' : (chains ?? []).length ? 'Do it again' : 'Start'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}

      {chains === null && <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>}

      {(chains ?? []).map(chain => (
        <SpeakingBlock key={chain.rootId} chain={chain} studentMode={studentMode}
          context={`from ${lessonTitle}`}
          onOpen={a => { window.location.href = speakUrl(a.id); }}
          onMark={studentMode ? undefined : setMarking} />
      ))}

      {!studentMode && studentId && chains !== null && chains.length === 0 && (
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {studentName ?? 'This student'} has not started this one yet.
        </p>
      )}

      {/* The dialogue itself, for anyone not answering it */}
      {!studentMode && (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl px-4 sm:px-5 py-4 flex flex-col gap-2">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">The dialogue</p>
          {lines.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No line has audio yet.</p>}
          {lines.map((l, i) => {
            const key = `line:${l.id}`;
            return (
              <div key={l.id} className="flex items-center gap-3 py-1.5">
                <span className="w-7 h-7 flex-shrink-0 rounded-full bg-slate-100 dark:bg-gray-700 text-[13px] font-extrabold flex items-center justify-center">{i + 1}</span>
                <button onClick={() => l.audioUrl && void player.play(key, l.audioUrl)} aria-label={`Play line ${i + 1}`}
                  className="w-10 h-10 flex-shrink-0 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                  {player.playing === key ? <Icon.pause className="w-[18px] h-[18px]" /> : <Icon.speaker className="w-[18px] h-[18px]" />}
                </button>
                <div className="min-w-0 flex-grow">
                  <p dir="auto" className="text-[15px] font-bold leading-snug">{l.text || 'No meaning written'}</p>
                  {l.hint && <p dir="auto" className="text-[13px] font-medium text-slate-500 dark:text-slate-400">Hint: {l.hint}</p>}
                </div>
                {l.audioMs ? <span className="flex-shrink-0 text-[13px] font-bold tabular-nums text-slate-500 dark:text-slate-400">{fmtClock(l.audioMs)}</span> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SpeakingLessonCard;
