import React, { useState, useEffect, useCallback } from 'react';
import { ArabicExam, ArabicExamItem, ArabicExamAttempt, ExamVersion } from '../types';
import { getPublishedVersions, getPublishedExam, getExamItems, getLatestAttempt, getAttemptsForStudent } from '../services/examService';
import ExamTakingPage from './ExamTakingPage';
import ExamResultPage from './ExamResultPage';
import LeaderboardPage from './LeaderboardPage';

// ─────────────────────────────────────────────────────────────────────────────
// Student exam flow controller (opened from the "Do Exam" button):
//   version chooser → taking (auto-save + timer) → awaiting result → result.
// ─────────────────────────────────────────────────────────────────────────────

const ExamFlow: React.FC<{
  studentId: string;
  studentName?: string;
  teacherId: string;
  level: number;
  retakeAllowed: boolean;
  onExit: () => void;
}> = ({ studentId, studentName, teacherId, level, retakeAllowed, onExit }) => {
  const [versions, setVersions] = useState<ExamVersion[] | null>(null);
  const [version, setVersion] = useState<ExamVersion | null>(null);
  const [exam, setExam] = useState<ArabicExam | null>(null);
  const [items, setItems] = useState<ArabicExamItem[]>([]);
  const [attempt, setAttempt] = useState<ArabicExamAttempt | null>(null);
  const [history, setHistory] = useState<ArabicExamAttempt[]>([]);
  const [viewAttempt, setViewAttempt] = useState<ArabicExamAttempt | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forceTaking, setForceTaking] = useState(false);

  // Which versions are published for this level?
  useEffect(() => {
    getPublishedVersions(level).then(vs => {
      setVersions(vs);
      if (vs.length === 1) setVersion(vs[0]);
      setLoading(false);
    });
  }, [level]);

  // Load chosen exam + latest attempt
  const loadVersion = useCallback(async (v: ExamVersion) => {
    setLoading(true);
    const e = await getPublishedExam(level, v);
    if (!e) { setExam(null); setLoading(false); return; }
    const [its, att, all] = await Promise.all([
      getExamItems(e.id),
      getLatestAttempt(studentId, e.id),
      getAttemptsForStudent(studentId),
    ]);
    setExam(e);
    setItems(its);
    setAttempt(att);
    setHistory(all.filter(a => a.examId === e.id));
    setLoading(false);
  }, [level, studentId]);

  useEffect(() => { if (version) loadVersion(version); }, [version, loadVersion]);

  const refreshAttempt = useCallback(async () => {
    if (!exam) return;
    setAttempt(await getLatestAttempt(studentId, exam.id));
  }, [exam, studentId]);

  if (loading) return <div className="p-8 text-center text-slate-400">Loading…</div>;

  // No published exam for this level at all
  if (versions && versions.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="text-4xl mb-3">📝</div>
        <p className="font-semibold text-slate-700 dark:text-slate-200">No exam is available for Level {level} yet.</p>
        <button onClick={onExit} className="mt-5 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold">Back</button>
      </div>
    );
  }

  // Version chooser (two versions available, none chosen yet)
  if (!version) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-1">Choose your exam</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Level {level} — pick which version you want to take.</p>
        <div className="grid gap-3">
          {(versions ?? []).map(v => (
            <button key={v} onClick={() => setVersion(v)}
              className="px-5 py-4 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-800 hover:border-amber-400 font-bold text-amber-700 dark:text-amber-300">
              {v === 'arabic' ? '🅰️ Arabic Exam' : '🔤 Transliteration Exam'}
            </button>
          ))}
        </div>
        <button onClick={onExit} className="mt-6 text-sm text-slate-400 hover:underline">Cancel</button>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="font-semibold text-slate-700 dark:text-slate-200">This exam is no longer available.</p>
        <button onClick={onExit} className="mt-5 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold">Back</button>
      </div>
    );
  }

  // Leaderboard overlay (available once a result exists)
  if (showLeaderboard) {
    return <LeaderboardPage level={level} selfStudentId={studentId} onExit={() => setShowLeaderboard(false)} />;
  }

  const status = attempt?.status;
  const showTaking = forceTaking || !attempt || status === 'in_progress';

  // Taking
  if (showTaking) {
    return (
      <ExamTakingPage
        exam={exam}
        items={items}
        studentId={studentId}
        studentName={studentName}
        teacherId={teacherId}
        retakeAllowed={forceTaking || retakeAllowed}
        onExit={onExit}
        onSubmitted={() => { setForceTaking(false); refreshAttempt(); }}
      />
    );
  }

  // Result published
  if (status === 'result_published' && attempt) {
    const shown = viewAttempt ?? attempt;
    const publishedHistory = history.filter(a => a.status === 'result_published');
    return (
      <div>
        <ExamResultPage exam={exam} items={items} attempt={shown} onExit={onExit} onViewLeaderboard={() => setShowLeaderboard(true)} />

        {/* Attempt history (retakes) */}
        {publishedHistory.length > 1 && (
          <div className="max-w-2xl mx-auto px-4 pb-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Your attempts</p>
            <div className="flex flex-wrap gap-2">
              {publishedHistory.map(a => (
                <button key={a.id} onClick={() => setViewAttempt(a)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    shown.id === a.id
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300'
                  }`}>
                  #{a.attemptNumber} · {a.percentage ?? 0}% {a.passed ? '✓' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {retakeAllowed && (
          <div className="max-w-2xl mx-auto px-4 pb-8 mt-3 text-center">
            <button onClick={() => { setViewAttempt(null); setForceTaking(true); }} className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold">Retake exam</button>
          </div>
        )}
      </div>
    );
  }

  // Submitted / under review → awaiting
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="text-4xl mb-3">⏳</div>
      <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 mb-1">Exam submitted</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">Your tutor is marking your exam. You'll be notified when your result is ready.</p>
      <button onClick={onExit} className="mt-6 px-5 py-2 rounded-lg bg-amber-500 text-white font-semibold">Back</button>
    </div>
  );
};

export default ExamFlow;
