import React, { useState, useEffect, useCallback } from 'react';
import { ArabicExam, ArabicExamItem, ExamVersion } from '../types';
import { listExams, createExam, deleteExam, getExam, getExamItems } from '../services/examService';
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

  // ── Preview overlay ────────────────────────────────────────────────────────
  if (preview) {
    return <ExamTakingPage exam={preview.exam} items={preview.items} preview onExit={() => setPreview(null)} />;
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
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Arabic Exams</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Create and manage level exams. Arabic and Transliteration are separate exams. Drafts are hidden from tutors and students until published.</p>
      </div>

      {loading ? (
        <p className="text-center text-slate-400 py-8">Loading…</p>
      ) : (
        <div className="space-y-6">
          {byLevel.map(({ level, exams: levelExams }) => (
            <div key={level} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-700 dark:text-slate-200">Level {level}</h4>
                <div className="flex gap-2">
                  {(['arabic', 'transliteration'] as ExamVersion[]).map(v => (
                    <button key={v} disabled={creating} onClick={() => handleCreate(level, v)}
                      className="px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-semibold hover:bg-amber-200 disabled:opacity-50">
                      + {v === 'arabic' ? 'Arabic' : 'Transliteration'} exam
                    </button>
                  ))}
                </div>
              </div>

              {levelExams.length === 0 ? (
                <p className="text-sm text-slate-400">No exams yet for this level.</p>
              ) : (
                <div className="space-y-2">
                  {levelExams.map(exam => (
                    <div key={exam.id} className="flex items-center justify-between gap-3 border border-slate-100 dark:border-gray-700 rounded-xl px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{exam.title}</p>
                        <p className="text-xs text-slate-400">
                          {exam.version === 'arabic' ? 'Arabic' : 'Transliteration'} · {exam.totalMarks} marks · pass {exam.passingPercentage}%
                          {exam.timeLimitMinutes ? ` · ${exam.timeLimitMinutes} min` : ' · no timer'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${exam.status === 'published' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-slate-400'}`}>
                          {exam.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        <button onClick={() => openPreview(exam.id)} className="text-xs font-semibold text-sky-600 hover:underline">Preview</button>
                        <button onClick={() => setEditingId(exam.id)} className="text-xs font-semibold text-amber-600 hover:underline">Edit</button>
                        <button onClick={() => handleDelete(exam.id)} className="text-xs font-semibold text-red-500 hover:underline">Delete</button>
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
