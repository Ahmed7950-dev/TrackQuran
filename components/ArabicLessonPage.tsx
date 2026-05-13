// components/ArabicLessonPage.tsx
// ---------------------------------------------------------------------------
// Arabic lessons library — mirrors TajweedPage structure.
// • Admins can upload / edit / delete / reorder lessons.
// • Tutors see the list and click to open the PDF viewer.
// • A student can be selected to mark lessons as done.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { ArabicLesson, ArabicStudent } from '../types';
import { useAuth } from '../context/AuthProvider';
import {
  getArabicLessons,
  createArabicLesson,
  updateArabicLesson,
  deleteArabicLesson as deleteLessonSvc,
  reorderArabicLessons,
  uploadArabicLessonPdf,
  getHomeworkCountsByLesson,
  getHomeworkCompletionsForStudent,
  getVocabRoundsByLesson,
} from '../services/arabicService';
import ArabicLessonDetailPage from './ArabicLessonDetailPage';

interface Props {
  students: ArabicStudent[];
  teacherId: string;
  /** If set, the viewer opens directly pre-selected to this student. */
  preSelectedStudentId?: string;
  onStudentUpdated?: (s: ArabicStudent) => void;
}

// ── Create / Edit modal ──────────────────────────────────────────────────────

interface ModalProps {
  isOpen: boolean;
  existing?: ArabicLesson;
  onClose: () => void;
  onCreated?: (l: ArabicLesson) => void;
  onUpdated?: (l: ArabicLesson) => void;
  createdBy?: string;
}

const CreateArabicLessonModal: React.FC<ModalProps> = ({
  isOpen, existing, onClose, onCreated, onUpdated, createdBy,
}) => {
  const isEdit = !!existing;
  const [title,  setTitle]  = useState(existing?.title       ?? '');
  const [desc,   setDesc]   = useState(existing?.description ?? '');
  const [file,   setFile]   = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => { setTitle(''); setDesc(''); setFile(null); setSaving(false); setErr(''); };
  const handleClose = () => { reset(); onClose(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== 'application/pdf') { setErr('Please select a PDF file.'); return; }
    if (f.size > 50 * 1024 * 1024) { setErr('PDF must be under 50 MB.'); return; }
    setErr(''); setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!title.trim()) { setErr('Lesson title is required.'); return; }
    if (!isEdit && !file) { setErr('Please upload a PDF file.'); return; }
    setSaving(true);

    let pdfUrl = existing?.pdfUrl;
    if (file) {
      const url = await uploadArabicLessonPdf(file);
      if (!url) { setErr('PDF upload failed. Check storage permissions.'); setSaving(false); return; }
      pdfUrl = url;
    }

    if (isEdit && existing) {
      const ok = await updateArabicLesson(existing.id, { title: title.trim(), description: desc.trim() || undefined, pdfUrl });
      setSaving(false);
      if (!ok) { setErr('Failed to save changes.'); return; }
      onUpdated?.({ ...existing, title: title.trim(), description: desc.trim() || undefined, pdfUrl });
      handleClose();
    } else {
      const lesson = await createArabicLesson({ title: title.trim(), description: desc.trim() || undefined, pdfUrl, createdBy });
      setSaving(false);
      if (!lesson) { setErr('Failed to create lesson. Please try again.'); return; }
      onCreated?.(lesson);
      handleClose();
    }
  };

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4" onClick={saving ? undefined : handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {isEdit ? 'Edit Arabic Lesson' : 'Upload Arabic Lesson'}
          </h2>
          {!saving && (
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Lesson title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} disabled={saving} autoFocus
              placeholder="e.g. Introduction to Arabic Alphabet" className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description <span className="text-xs font-normal text-slate-400">(optional)</span>
            </label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} disabled={saving} rows={2}
              placeholder="Short summary…" className={inp} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              PDF file {isEdit && <span className="text-xs font-normal text-slate-400">(leave empty to keep current)</span>}
            </label>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFileChange} disabled={saving} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={saving}
              className="w-full flex items-center gap-3 px-4 py-3 border-2 border-dashed border-slate-300 dark:border-gray-600 rounded-lg hover:border-amber-400 transition-colors text-left">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                className={`w-8 h-8 flex-shrink-0 ${file ? 'text-amber-600' : 'text-slate-400'}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <div className="min-w-0">
                {file ? (
                  <><p className="text-sm font-semibold text-amber-700 dark:text-amber-300 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p></>
                ) : existing?.pdfUrl ? (
                  <><p className="text-sm text-slate-600 dark:text-slate-300">Current PDF attached — click to replace</p>
                    <p className="text-xs text-slate-400">Max 50 MB</p></>
                ) : (
                  <><p className="text-sm text-slate-600 dark:text-slate-300">Click to choose a PDF file</p>
                    <p className="text-xs text-slate-400">Max 50 MB</p></>
                )}
              </div>
            </button>
          </div>
          {err && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">{err}</div>}
          {saving && (
            <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
              {file ? 'Uploading PDF…' : 'Saving…'}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose} disabled={saving}
              className="px-4 py-2 bg-slate-200 text-slate-800 dark:bg-gray-600 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-gray-500 disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-2 bg-amber-500 text-white font-semibold rounded-md shadow-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-wait">
              {saving ? '…' : isEdit ? 'Save Changes' : 'Upload Lesson'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ArabicLessonPage: React.FC<Props> = ({ students, teacherId, preSelectedStudentId, onStudentUpdated }) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [lessons,    setLessons]    = useState<ArabicLesson[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing,    setEditing]    = useState<ArabicLesson | null>(null);
  const [viewing,    setViewing]    = useState<ArabicLesson | null>(null);

  // Per-lesson stats for student badges
  const [hwCounts,      setHwCounts]      = useState<Record<string, number>>({});
  const [hwDone,        setHwDone]        = useState<string[]>([]);      // lesson IDs done
  const [vocabRounds,   setVocabRounds]   = useState<Record<string, number>>({});

  // Drag-reorder (admin)
  const dragIdx   = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => {
    getArabicLessons().then(data => { setLessons(data); setLoading(false); });
    getHomeworkCountsByLesson().then(setHwCounts);
  }, []);

  useEffect(() => {
    if (!preSelectedStudentId) { setHwDone([]); setVocabRounds({}); return; }
    getHomeworkCompletionsForStudent(preSelectedStudentId).then(setHwDone);
    getVocabRoundsByLesson(preSelectedStudentId).then(setVocabRounds);
  }, [preSelectedStudentId]);

  const handleDelete = async (l: ArabicLesson) => {
    if (!confirm(`Delete lesson "${l.title}"? This cannot be undone.`)) return;
    const ok = await deleteLessonSvc(l.id);
    if (ok) setLessons(prev => prev.filter(x => x.id !== l.id));
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };
  const handleDragOver  = (e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx); };
  const handleDrop      = async (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    dragIdx.current = null; setOverIdx(null);
    if (from === null || from === dropIdx) return;
    const reordered = [...lessons];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIdx, 0, moved);
    // Update UI immediately, then persist to Supabase
    setLessons(reordered.map((l, i) => ({ ...l, orderIndex: i + 1 })));
    await reorderArabicLessons(reordered);
  };
  const handleDragEnd   = () => { dragIdx.current = null; setOverIdx(null); };


  if (loading) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-500 dark:text-slate-400">
        <svg className="animate-spin w-8 h-8" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">Arabic Lessons</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? 'Upload and manage Arabic PDF lessons. Drag rows to reorder.'
              : `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} — click any lesson to open it.`}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-sm transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload Lesson
          </button>
        )}
      </div>

      {/* Empty state */}
      {lessons.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-6xl mb-3">📄</div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">No Arabic lessons yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAdmin ? 'Click "Upload Lesson" to add your first Arabic PDF.' : 'Lessons will appear here once an admin uploads them.'}
          </p>
        </div>
      )}

      {/* Lesson list */}
      {lessons.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-gray-700">
          {lessons.map((lesson, idx) => (
            <ArabicLessonRow
              key={lesson.id}
              lesson={lesson}
              index={idx}
              isAdmin={isAdmin}
              isDragOver={overIdx === idx}
              hwQuestionCount={hwCounts[lesson.id] ?? 0}
              homeworkDone={hwDone.includes(lesson.id)}
              vocabRounds={vocabRounds[lesson.id] ?? 0}
              showStudentStats={!!preSelectedStudentId}
              onView={() => setViewing(lesson)}
              onEdit={e => { e.stopPropagation(); setEditing(lesson); }}
              onDelete={e => { e.stopPropagation(); handleDelete(lesson); }}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={e => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {isAdmin && (
        <CreateArabicLessonModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          createdBy={currentUser?.id}
          onCreated={lesson => { setLessons(prev => [...prev, lesson]); setCreateOpen(false); }}
        />
      )}

      {/* Edit modal */}
      {isAdmin && editing && (
        <CreateArabicLessonModal
          isOpen={!!editing}
          existing={editing}
          onClose={() => setEditing(null)}
          onUpdated={updated => { setLessons(prev => prev.map(l => l.id === updated.id ? updated : l)); setEditing(null); }}
        />
      )}

      {/* Lesson detail page — full-screen overlay with PDF / Homework / Vocabulary / Video tabs */}
      {viewing && (
        <ArabicLessonDetailPage
          lesson={viewing}
          students={students}
          teacherId={teacherId}
          preSelectedStudentId={preSelectedStudentId}
          onClose={async () => {
            setViewing(null);
            // Always refresh badge data from DB when closing a lesson
            if (preSelectedStudentId) {
              const [done, rounds] = await Promise.all([
                getHomeworkCompletionsForStudent(preSelectedStudentId),
                getVocabRoundsByLesson(preSelectedStudentId),
              ]);
              setHwDone(done);
              setVocabRounds(rounds);
            }
          }}
          onStudentUpdated={onStudentUpdated}
          onHomeworkComplete={lessonId =>
            setHwDone(prev => prev.includes(lessonId) ? prev : [...prev, lessonId])
          }
        />
      )}
    </div>
  );
};

// ── Lesson row ────────────────────────────────────────────────────────────────

interface RowProps {
  lesson: ArabicLesson; index: number; isAdmin: boolean; isDragOver: boolean;
  hwQuestionCount: number; homeworkDone: boolean; vocabRounds: number; showStudentStats: boolean;
  onView: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void;
}

const ArabicLessonRow: React.FC<RowProps> = ({
  lesson, index, isAdmin, isDragOver,
  hwQuestionCount, homeworkDone, vocabRounds, showStudentStats,
  onView, onEdit, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) => (
  <div
    draggable={isAdmin}
    onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
    onClick={onView}
    className={`group flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors
      ${isDragOver ? 'bg-amber-50 dark:bg-amber-900/20 border-t-2 border-amber-400' : 'hover:bg-slate-50 dark:hover:bg-gray-700/50'}`}
  >
    {isAdmin && (
      <div className="flex-shrink-0 text-slate-300 dark:text-gray-600 hover:text-slate-500 cursor-grab active:cursor-grabbing" onClick={e => e.stopPropagation()}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M7 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
        </svg>
      </div>
    )}
    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold">
      {index + 1}
    </span>
    <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-gray-700">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-amber-600 dark:text-amber-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    </div>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{lesson.title}</p>
      {lesson.description && <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{lesson.description}</p>}
      {/* Student progress badges */}
      {showStudentStats && (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Homework badge */}
          {hwQuestionCount > 0 && (
            homeworkDone ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-200 dark:border-emerald-800">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5"><path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" /></svg>
                Homework done
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-full border border-amber-200 dark:border-amber-700">
                📝 {hwQuestionCount} questions
              </span>
            )
          )}
          {/* Vocab rounds badge */}
          {vocabRounds > 0 && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${
              vocabRounds >= 5
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700'
            }`}>
              🎴 Flashcards: {vocabRounds}/5 rounds
            </span>
          )}
        </div>
      )}
    </div>
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      className="w-4 h-4 text-slate-300 dark:text-gray-600 flex-shrink-0 group-hover:text-amber-500 transition-colors">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
    {isAdmin && (
      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={onEdit} title="Edit" className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-gray-700 rounded transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
          </svg>
        </button>
        <button onClick={onDelete} title="Delete" className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </div>
    )}
  </div>
);

export default ArabicLessonPage;
