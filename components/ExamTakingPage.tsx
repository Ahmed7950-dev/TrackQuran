import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArabicExam, ArabicExamItem, ArabicExamAttempt } from '../types';
import { getOrCreateAttempt, saveAttemptAnswers, submitAttempt } from '../services/examService';
import { ExamContentItem, QuestionAnswerInput, questionNumbers } from './examShared';

// ─────────────────────────────────────────────────────────────────────────────
// Student exam-taking page. Auto-saves answers, optional countdown timer that
// auto-submits at zero, and a submit confirmation. Reused in `preview` mode for
// admin/tutor (no attempt is created or saved).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  exam: ArabicExam;
  items: ArabicExamItem[];
  preview?: boolean;
  studentId?: string;
  studentName?: string;
  teacherId?: string;
  retakeAllowed?: boolean;
  onExit: () => void;
  onSubmitted?: () => void;
}

const fmt = (secs: number) => {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const ExamTakingPage: React.FC<Props> = ({ exam, items, preview, studentId, studentName, teacherId, retakeAllowed, onExit, onSubmitted }) => {
  const [attempt, setAttempt] = useState<ArabicExamAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(!preview);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const attemptRef = useRef<ArabicExamAttempt | null>(null);
  attemptRef.current = attempt;
  const submittedRef = useRef(false);

  const qNums = questionNumbers(items);

  // ── Load / resume attempt ────────────────────────────────────────────────
  useEffect(() => {
    if (preview || !studentId) return;
    let active = true;
    getOrCreateAttempt(exam, studentId, !!retakeAllowed, studentName, teacherId).then(a => {
      if (!active || !a) { setLoading(false); return; }
      setAttempt(a);
      setAnswers(a.answers ?? {});
      setLoading(false);
    });
    return () => { active = false; };
  }, [exam, studentId, preview, retakeAllowed]);

  // ── Auto-save (debounced) ────────────────────────────────────────────────
  const flushSave = useCallback(() => {
    if (preview || !attemptRef.current || submittedRef.current) return;
    saveAttemptAnswers(attemptRef.current.id, answersRef.current);
  }, [preview]);

  const setAnswer = (itemId: string, val: string) => {
    setAnswers(prev => ({ ...prev, [itemId]: val }));
    if (preview) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 1200);
  };

  // Save on tab-hide / unload so progress survives refresh or closing.
  useEffect(() => {
    if (preview) return;
    const onHide = () => flushSave();
    window.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onHide);
      flushSave();
    };
  }, [preview, flushSave]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async () => {
    if (preview || !attemptRef.current || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveAttemptAnswers(attemptRef.current.id, answersRef.current);
    const full = { ...attemptRef.current, answers: answersRef.current };
    await submitAttempt(full, items, teacherId ?? '');
    setSubmitting(false);
    onSubmitted?.();
  }, [preview, items, teacherId, onSubmitted]);

  // ── Countdown timer (auto-submit at zero) ────────────────────────────────
  useEffect(() => {
    if (preview || !attempt || !exam.timeLimitMinutes) return;
    const deadline = new Date(attempt.startedAt).getTime() + exam.timeLimitMinutes * 60_000;
    const tick = () => {
      const secs = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(secs);
      if (secs <= 0) doSubmit();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [preview, attempt, exam.timeLimitMinutes, doSubmit]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading exam…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Sticky header: title, timer, exit */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-slate-200 dark:border-gray-700 -mx-4 px-4 py-3 mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-extrabold text-slate-800 dark:text-slate-100 truncate">{exam.title}</h2>
          <p className="text-xs text-slate-400">Level {exam.level} · {exam.version === 'arabic' ? 'Arabic' : 'Transliteration'} · {exam.totalMarks} marks{preview ? ' · PREVIEW' : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {remaining !== null && (
            <span className={`px-3 py-1.5 rounded-full text-sm font-bold tabular-nums ${remaining <= 60 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 animate-pulse' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>
              ⏱ {fmt(remaining)}
            </span>
          )}
          <button onClick={onExit} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-sm font-semibold">{preview ? 'Close' : 'Exit'}</button>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-4">
        {items.map(item => {
          if (item.itemType !== 'question') return <ExamContentItem key={item.id} item={item} />;
          return (
            <div key={item.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex justify-between items-start gap-2 mb-2">
                <p className="font-semibold text-slate-800 dark:text-slate-100" dir="auto">
                  <span className="text-amber-600 dark:text-amber-400">Q{qNums.get(item.id)}.</span> {item.content}
                </p>
                <span className="text-xs font-bold text-slate-400 flex-shrink-0">{item.marks ?? 0} marks</span>
              </div>
              <QuestionAnswerInput item={item} value={answers[item.id] ?? ''} onChange={v => setAnswer(item.id, v)} disabled={preview} />
            </div>
          );
        })}
      </div>

      {/* Submit */}
      {!preview && (
        <div className="mt-6">
          <button onClick={() => setConfirming(true)} disabled={submitting}
            className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Submit Exam'}
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-slate-200 dark:border-gray-700 p-6 max-w-sm text-center">
            <p className="font-bold text-slate-800 dark:text-slate-100 mb-2">Submit your exam?</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">You will not be able to edit your answers after submitting.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(false)} className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 font-semibold">Keep editing</button>
              <button onClick={() => { setConfirming(false); doSubmit(); }} className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold">Yes, submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamTakingPage;
