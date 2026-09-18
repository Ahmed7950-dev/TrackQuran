import React, { useState, useEffect, useCallback } from 'react';
import { ArabicExam, ArabicExamItem, ArabicExamAttempt, ExamVersion } from '../types';
import { listExams, createExam, deleteExam, getExam, getExamItems, getAttemptsForExam } from '../services/examService';
import ExamBuilder from './ExamBuilder';
import ExamTakingPage from './ExamTakingPage';

// ─────────────────────────────────────────────────────────────────────────────
// Admin "Exams" tab: list exams grouped by level × version, create new ones,
// open the builder, preview, and delete.
// ─────────────────────────────────────────────────────────────────────────────

const AdminExamsTab: React.FC<{ adminId: string }> = ({ adminId }) => {
  const [exams, setExams] = useState<ArabicExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ exam: ArabicExam; items: ArabicExamItem[] } | null>(null);
  const [results, setResults] = useState<{ exam: ArabicExam; attempts: ArabicExamAttempt[] } | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setExams(await listExams());
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const openPreview = async (examId: string) => {
    const [exam, items] = await Promise.all([getExam(examId), getExamItems(examId)]);
    if (exam) setPreview({ exam, items });
  };

  const openResults = async (exam: ArabicExam) => {
    setResults({ exam, attempts: await getAttemptsForExam(exam.id) });
  };

  // ── Preview overlay ────────────────────────────────────────────────────────
  if (preview) {
    return <ExamTakingPage exam={preview.exam} items={preview.items} preview onExit={() => setPreview(null)} />;
  }

  // ── Results overlay (all students' attempts for one exam) ───────────────────
  if (results) {
    const STATUS: Record<string, string> = { in_progress: 'In progress', submitted: 'Submitted', under_review: 'Under review', result_published: 'Published' };
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setResults(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 text-sm font-semibold">← Back</button>
          <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate">{results.exam.title} — Results</h3>
        </div>
        {results.attempts.length === 0 ? (
          <p className="text-center text-slate-400 py-10">No attempts yet.</p>
        ) : (
          <div className="space-y-2">
            {results.attempts.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{a.studentName || 'Student'}</p>
                  <p className="text-xs text-slate-400">{STATUS[a.status] ?? a.status} · attempt #{a.attemptNumber}{a.submittedAt ? ` · ${new Date(a.submittedAt).toLocaleDateString()}` : ''}</p>
                </div>
                {a.status === 'result_published' && a.percentage != null && (
                  <span className={`text-sm font-extrabold flex-shrink-0 ${a.passed ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {a.percentage}% {a.passed ? '✓' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Builder ────────────────────────────────────────────────────────────────
  if (editingId) {
    return <ExamBuilder examId={editingId} onBack={() => { setEditingId(null); reload(); }} onPreview={openPreview} />;
  }

  // ── List ───────────────────────────────────────────────────────────────────
  const byLevel = ([1, 2, 3] as const).map(level => ({
    level,
    exams: exams.filter(e => e.level === level),
  }));

  const handleCreate = async (level: number, version: ExamVersion) => {
    setCreating(true);
    const exam = await createExam({ level, version, title: `Level ${level} ${version === 'arabic' ? 'Arabic' : 'Transliteration'} Exam`, createdBy: adminId });
    setCreating(false);
    if (exam) { await reload(); setEditingId(exam.id); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this exam and all its questions?')) return;
    await deleteExam(id);
    reload();
  };

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-5 py-4 mb-4">
        <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Arabic exams</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Create and manage level exams. Arabic and Transliteration are separate exams. Drafts are hidden from tutors and students until published.</p>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-8">Loading…</p>
      ) : (
        <div className="space-y-4">
          {byLevel.map(({ level, exams: levelExams }) => (
            <div key={level} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 flex-wrap px-5 py-3 bg-slate-50 dark:bg-gray-900/40 border-b border-slate-200 dark:border-gray-700">
                <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">Level {level}</h4>
                <span className="text-xs text-slate-400">{levelExams.length} exam{levelExams.length === 1 ? '' : 's'}</span>
                <span className="flex-1" />
                <div className="flex gap-2">
                  {(['arabic', 'transliteration'] as ExamVersion[]).map(v => (
                    <button key={v} disabled={creating} onClick={() => handleCreate(level, v)}
                      className="h-8 px-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-xs font-bold hover:bg-amber-100 disabled:opacity-50 transition-colors">
                      + {v === 'arabic' ? 'Arabic' : 'Transliteration'} exam
                    </button>
                  ))}
                </div>
              </div>

              {levelExams.length === 0 ? (
                <p className="text-sm text-slate-400 px-5 py-6">No exams yet for this level.</p>
              ) : (
                <div>
                  {levelExams.map(exam => (
                    <div key={exam.id} className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-b border-slate-100 dark:border-gray-700/70 last:border-b-0">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{exam.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {exam.version === 'arabic' ? 'Arabic' : 'Transliteration'} · {exam.totalMarks} marks · pass {exam.passingPercentage}%
                          {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ' · no timer'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold me-1 ${exam.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-slate-400'}`}>
                          {exam.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        <button onClick={() => openPreview(exam.id)} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-gray-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">Preview</button>
                        <button onClick={() => openResults(exam)} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-gray-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">Results</button>
                        <button onClick={() => setEditingId(exam.id)} className="h-8 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors">Edit</button>
                        <button onClick={() => handleDelete(exam.id)} aria-label={`Delete ${exam.title}`} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-gray-600 text-xs font-bold text-slate-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminExamsTab;
