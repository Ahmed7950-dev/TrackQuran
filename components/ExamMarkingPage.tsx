import React, { useState, useEffect } from 'react';
import { ArabicExam, ArabicExamItem, ArabicExamAttempt, ExamItemGrading } from '../types';
import { getExam, getExamItems, gradeAttempt, publishResult } from '../services/examService';
import { ExamContentItem, QuestionAnswerInput, questionNumbers } from './examShared';

// ─────────────────────────────────────────────────────────────────────────────
// Tutor marking page. Objective questions are pre-graded (from auto-grade on
// submit); the tutor sets correct/wrong, partial marks, and corrections, adds
// general feedback, then publishes the result to the student.
// ─────────────────────────────────────────────────────────────────────────────

const ExamMarkingPage: React.FC<{
  attempt: ArabicExamAttempt;
  studentName: string;
  teacherId: string;
  onBack: () => void;
  onPublished: () => void;
}> = ({ attempt, studentName, teacherId, onBack, onPublished }) => {
  const [exam, setExam] = useState<ArabicExam | null>(null);
  const [items, setItems] = useState<ArabicExamItem[]>([]);
  const [grading, setGrading] = useState<Record<string, ExamItemGrading>>(attempt.grading ?? {});
  const [feedback, setFeedback] = useState(attempt.generalFeedback ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([getExam(attempt.examId), getExamItems(attempt.examId)]).then(([e, its]) => {
      setExam(e); setItems(its); setLoading(false);
    });
  }, [attempt.examId]);

  const qNums = questionNumbers(items);

  const setGrade = (itemId: string, patch: Partial<ExamItemGrading>) => {
    setGrading(prev => ({ ...prev, [itemId]: { awarded: 0, correct: false, ...prev[itemId], ...patch } }));
  };

  const liveTotal = items
    .filter(i => i.itemType === 'question')
    .reduce((s, i) => s + (grading[i.id]?.awarded ?? 0), 0);

  const handleSaveDraft = async () => {
    setSaving(true);
    await gradeAttempt(attempt.id, grading, feedback);
    setSaving(false);
    onBack();
  };

  const handlePublish = async () => {
    if (!exam) return;
    if (!window.confirm('Publish this result to the student? They will be able to see their marks and corrections.')) return;
    setSaving(true);
    await publishResult(attempt, grading, feedback, exam, teacherId);
    setSaving(false);
    onPublished();
  };

  if (loading || !exam) return <div className="p-8 text-center text-slate-400">Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-sm font-semibold">← Back</button>
        <span className="px-3 py-1 rounded-full text-sm font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Total: {liveTotal} / {exam.totalMarks}</span>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4 mb-5">
        <h2 className="font-extrabold text-slate-800 dark:text-slate-100">{exam.title}</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          {studentName} · Level {exam.level} · {exam.version === 'arabic' ? 'Arabic' : 'Transliteration'} · attempt #{attempt.attemptNumber}
          {attempt.submittedAt ? ` · submitted ${new Date(attempt.submittedAt).toLocaleString()}` : ''}
        </p>
      </div>

      {/* Items */}
      <div className="space-y-4">
        {items.map(item => {
          if (item.itemType !== 'question') return <ExamContentItem key={item.id} item={item} />;
          const g = grading[item.id] ?? { awarded: 0, correct: false };
          return (
            <div key={item.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex justify-between items-start gap-2 mb-2">
                <p className="font-semibold text-slate-800 dark:text-slate-100" dir="auto">
                  <span className="text-amber-600 dark:text-amber-400">Q{qNums.get(item.id)}.</span> {item.content}
                </p>
                <span className="text-xs font-bold text-slate-400 flex-shrink-0">/ {item.marks ?? 0}</span>
              </div>

              {/* Student answer (read-only) */}
              <div className="mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Student answer</p>
                <QuestionAnswerInput item={item} value={attempt.answers[item.id] ?? ''} disabled />
              </div>
              {item.correctAnswer && (
                <p className="text-xs text-green-700 dark:text-green-300 mb-2">Model answer: <span dir="auto" className="font-semibold">{item.correctAnswer}</span></p>
              )}

              {/* Marking controls */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 dark:border-gray-700 pt-2">
                <button onClick={() => setGrade(item.id, { correct: true, awarded: item.marks ?? 0 })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${g.correct ? 'bg-green-600 text-white' : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'}`}>✓ Correct</button>
                <button onClick={() => setGrade(item.id, { correct: false, awarded: 0 })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${!g.correct ? 'bg-rose-600 text-white' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'}`}>✗ Wrong</button>
                <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 ml-auto">
                  Marks:
                  <input type="number" min={0} max={item.marks ?? 0} value={g.awarded}
                    onChange={e => setGrade(item.id, { awarded: Math.max(0, Math.min(item.marks ?? 0, Number(e.target.value))) })}
                    className="w-16 px-2 py-1 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded text-sm dark:text-white" />
                </label>
              </div>
              <input
                value={g.correction ?? ''}
                onChange={e => setGrade(item.id, { correction: e.target.value })}
                dir="auto"
                placeholder="Correction / explanation (optional)…"
                className="w-full mt-2 px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
              />
            </div>
          );
        })}
      </div>

      {/* General feedback */}
      <div className="mt-5">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">General feedback (optional)</label>
        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3}
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white" />
      </div>

      <div className="flex gap-3 mt-5">
        <button onClick={handleSaveDraft} disabled={saving} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 font-semibold disabled:opacity-50">Save draft</button>
        <button onClick={handlePublish} disabled={saving} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold disabled:opacity-50">{saving ? 'Publishing…' : 'Submit Result to Student'}</button>
      </div>
    </div>
  );
};

export default ExamMarkingPage;
