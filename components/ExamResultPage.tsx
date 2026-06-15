import React from 'react';
import { ArabicExam, ArabicExamItem, ArabicExamAttempt } from '../types';
import { ExamContentItem, QuestionAnswerInput, CorrectAnswerHint, questionNumbers } from './examShared';

// ─────────────────────────────────────────────────────────────────────────────
// Read-only published result page for the student: original answers, per-question
// correct/wrong + marks + corrections, total, percentage, pass/fail, feedback.
// ─────────────────────────────────────────────────────────────────────────────

const ExamResultPage: React.FC<{
  exam: ArabicExam;
  items: ArabicExamItem[];
  attempt: ArabicExamAttempt;
  onExit: () => void;
  onViewLeaderboard?: () => void;
}> = ({ exam, items, attempt, onExit, onViewLeaderboard }) => {
  const qNums = questionNumbers(items);
  const passed = !!attempt.passed;
  const versionLabel = exam.version === 'arabic' ? 'Arabic' : 'Transliteration';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <button onClick={onExit} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-sm font-semibold">← Back</button>
        <div className="flex items-center gap-2">
          {onViewLeaderboard && (
            <button onClick={onViewLeaderboard} className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm font-semibold">🏅 Leaderboard</button>
          )}
          <span className="text-xs text-slate-400">Level {exam.level} · {versionLabel}</span>
        </div>
      </div>

      {/* Certificate (passed) */}
      {passed && (
        <div className="rounded-2xl mb-6 p-7 text-center border-4 border-amber-300 dark:border-amber-700 bg-gradient-to-b from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Certificate of Achievement</p>
          <div className="text-5xl my-3">🎓</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">This certifies that</p>
          <p className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 my-1">{attempt.studentName || 'Student'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">has passed the</p>
          <p className="text-lg font-bold text-amber-700 dark:text-amber-300 my-1">Level {exam.level} {versionLabel} Exam</p>
          <p className="text-3xl font-extrabold text-green-600 dark:text-green-400 mt-2">{attempt.percentage ?? 0}%</p>
          {attempt.publishedAt && <p className="text-[11px] text-slate-400 mt-2">{new Date(attempt.publishedAt).toLocaleDateString()}</p>}
        </div>
      )}

      {/* Score banner */}
      <div className={`rounded-2xl p-6 text-center mb-6 border-2 ${passed ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' : 'bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700'}`}>
        <div className="text-5xl mb-2">{passed ? '🏆' : '📚'}</div>
        <h2 className={`text-2xl font-extrabold ${passed ? 'text-green-700 dark:text-green-300' : 'text-rose-700 dark:text-rose-300'}`}>
          {passed ? 'Passed!' : 'Not passed'}
        </h2>
        {passed && <p className="text-sm font-semibold text-green-700 dark:text-green-300 mt-1">Congratulations! You passed the Level {exam.level} {versionLabel} exam.</p>}
        <p className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-3">{attempt.percentage ?? 0}%</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{attempt.totalScore ?? 0} / {exam.totalMarks} marks · pass mark {exam.passingPercentage}%</p>
      </div>

      {/* General feedback */}
      {attempt.generalFeedback && (
        <div className="mb-6 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-600 dark:text-sky-300 mb-1">Tutor feedback</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{attempt.generalFeedback}</p>
        </div>
      )}

      {/* Per-item review */}
      <div className="space-y-4">
        {items.map(item => {
          if (item.itemType !== 'question') return <ExamContentItem key={item.id} item={item} />;
          const g = attempt.grading[item.id];
          const correct = g?.correct;
          return (
            <div key={item.id} className={`rounded-xl p-4 border-2 ${correct ? 'border-green-200 dark:border-green-800 bg-green-50/40 dark:bg-green-900/10' : 'border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-900/10'}`}>
              <div className="flex justify-between items-start gap-2 mb-2">
                <p className="font-semibold text-slate-800 dark:text-slate-100" dir="auto">
                  <span className="text-amber-600 dark:text-amber-400">Q{qNums.get(item.id)}.</span> {item.content}
                </p>
                <span className={`text-xs font-bold flex-shrink-0 ${correct ? 'text-green-600' : 'text-rose-600'}`}>
                  {g?.awarded ?? 0} / {item.marks ?? 0}
                </span>
              </div>
              <QuestionAnswerInput item={item} value={attempt.answers[item.id] ?? ''} disabled />
              {!correct && <CorrectAnswerHint item={item} />}
              {g?.correction && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 bg-white dark:bg-gray-800 rounded-lg px-2 py-1.5"><span className="font-bold">Correction:</span> {g.correction}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExamResultPage;
