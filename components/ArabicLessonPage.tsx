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
  setArabicLessonCompletion,
  saveArabicStudent,
} from '../services/arabicService';
import TajweedLessonViewer from './TajweedLessonViewer';
import { TajweedLesson } from '../types';

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

  // Drag-reorder (admin)
  const dragIdx   = useRef<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => {
    getArabicLessons().then(data => { setLessons(data); setLoading(false); });
  }, []);

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

  // ── Marking a lesson done — update student in Supabase + propagate up ────
  const handleMarkDone = async (studentId: string, lessonId: string, done: boolean) => {
    await setArabicLessonCompletion(teacherId, studentId, lessonId, done);
    const updated = students.find(s => s.id === studentId);
    if (!updated) return;
    const ids = new Set(updated.completedLessonIds);
    if (done) ids.add(lessonId); else ids.delete(lessonId);
    onStudentUpdated?.({ ...updated, completedLessonIds: [...ids] });
  };

  // Convert ArabicLesson → TajweedLesson shape so we can reuse TajweedLessonViewer
  const toTajweedShape = (l: ArabicLesson): TajweedLesson => ({
    id: l.id, title: l.title, description: l.description,
    orderIndex: l.orderIndex, pdfUrl: l.pdfUrl,
    createdBy: l.createdBy, createdAt: l.createdAt, updatedAt: l.updatedAt,
  });

  // Convert ArabicStudent → Student-compatible object for viewer's student selector
  // The viewer only needs { id, name } and uses student id for completions
  const studentCompat = students.map(s => ({
    id: s.id, name: s.name,
    // minimum fields TajweedLessonViewer needs (it only reads .id and .name)
    recitationAchievements: [], memorizationAchievements: [],
    attendance: [], masteredTajweedRules: [],
    tafsirReviews: [], tafsirMemorizationReviews: [],
    mistakes: {},
  })) as any[];

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

      {/* PDF viewer — reuse TajweedLessonViewer */}
      {viewing && (
        <ArabicLessonViewerWrapper
          lesson={viewing}
          students={studentCompat}
          tutorId={teacherId}
          completedMap={Object.fromEntries(
            students.map(s => [s.id, new Set(s.completedLessonIds)])
          )}
          preSelectedStudentId={preSelectedStudentId}
          onMarkDone={handleMarkDone}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
};

// ── Wrapper around TajweedLessonViewer that intercepts completion calls ────────

interface ViewerWrapperProps {
  lesson: ArabicLesson;
  students: any[];
  tutorId: string;
  completedMap: Record<string, Set<string>>;
  preSelectedStudentId?: string;
  onMarkDone: (studentId: string, lessonId: string, done: boolean) => void;
  onClose: () => void;
}

const ArabicLessonViewerWrapper: React.FC<ViewerWrapperProps> = ({
  lesson, students, tutorId, completedMap, preSelectedStudentId, onMarkDone, onClose,
}) => {
  // We patch the TajweedLessonViewer by providing it with overridden completion functions
  // via importing the tajweedService module. Instead, we'll use a custom viewer that
  // shares the same UI but overrides the completion layer.
  // For simplicity we reuse TajweedLessonViewer which calls tajweedService internally,
  // but also call our own onMarkDone to keep local state in sync.
  // We wrap the lesson as a TajweedLesson shape and pass a custom tutorId.

  const tajweedLesson: TajweedLesson = {
    id: lesson.id, title: lesson.title, description: lesson.description,
    orderIndex: lesson.orderIndex, pdfUrl: lesson.pdfUrl,
    createdBy: lesson.createdBy, createdAt: lesson.createdAt, updatedAt: lesson.updatedAt,
  };

  // Since TajweedLessonViewer uses tajweedService for completions (Supabase),
  // we layer our own local-storage completion on top via an override approach:
  // We pass a custom students list and intercept the "mark done" action by
  // listening for changes externally. The simplest approach: patch the viewer
  // to also call onMarkDone when the mark button is clicked.
  //
  // Because TajweedLessonViewer doesn't expose onMarkDone, we instead provide
  // our own thin viewer below that mirrors the same PDF display but wires
  // completions to arabicService.

  return (
    <ArabicPdfViewer
      lesson={lesson}
      students={students}
      completedMap={completedMap}
      preSelectedStudentId={preSelectedStudentId}
      onMarkDone={onMarkDone}
      onClose={onClose}
    />
  );
};

// ── Minimal Arabic PDF viewer (same UX as TajweedLessonViewer, custom completion) ──

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface PdfViewerProps {
  lesson: ArabicLesson;
  students: any[];
  completedMap: Record<string, Set<string>>;
  preSelectedStudentId?: string;
  onMarkDone: (studentId: string, lessonId: string, done: boolean) => void;
  onClose: () => void;
}

const ArabicPdfViewer: React.FC<PdfViewerProps> = ({
  lesson, students, completedMap, preSelectedStudentId, onMarkDone, onClose,
}) => {
  const pdfCanvasRef    = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef   = useRef<pdfjsLib.RenderTask | null>(null);

  const [pdfDoc,     setPdfDoc]    = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum,    setPageNum]   = useState(1);
  const [totalPages, setTotalPages]= useState(0);
  const [loading,    setLoading]   = useState(true);
  const [pdfError,   setPdfError]  = useState('');

  const [selectedStudentId, setSelectedStudentId] = useState(preSelectedStudentId ?? '');

  // Load PDF
  useEffect(() => {
    if (!lesson.pdfUrl) { setPdfError('No PDF attached.'); setLoading(false); return; }
    setLoading(true); setPdfError('');
    (async () => {
      try {
        const res = await fetch(lesson.pdfUrl!);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = await pdfjsLib.getDocument({ data: await res.arrayBuffer() }).promise;
        setPdfDoc(doc); setTotalPages(doc.numPages); setPageNum(1);
      } catch (e) { console.error(e); setPdfError('Failed to load PDF.'); }
      finally { setLoading(false); }
    })();
  }, [lesson.pdfUrl]);

  // Render page
  const renderPage = React.useCallback(async (doc: pdfjsLib.PDFDocumentProxy, n: number) => {
    const canvas = pdfCanvasRef.current, cont = pdfContainerRef.current;
    if (!canvas || !cont) return;
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} renderTaskRef.current = null; }
    const page = await doc.getPage(n);
    const dpr  = window.devicePixelRatio || 1;
    const vp0  = page.getViewport({ scale: 1 });
    const scale = Math.min(cont.clientWidth / vp0.width, cont.clientHeight / vp0.height) * dpr;
    const vp   = page.getViewport({ scale });
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.width = `${vp.width / dpr}px`; canvas.style.height = `${vp.height / dpr}px`;
    const task = page.render({ canvasContext: canvas.getContext('2d') as any, viewport: vp, canvas });
    renderTaskRef.current = task;
    try { await task.promise; } catch (e: any) { if (e?.name !== 'RenderingCancelledException') console.error(e); }
  }, []);

  useEffect(() => { if (pdfDoc) renderPage(pdfDoc, pageNum); }, [pdfDoc, pageNum, renderPage]);
  useEffect(() => {
    const el = pdfContainerRef.current; if (!el || !pdfDoc) return;
    const ro = new ResizeObserver(() => renderPage(pdfDoc, pageNum)); ro.observe(el); return () => ro.disconnect();
  }, [pdfDoc, pageNum, renderPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPageNum(n => Math.min(totalPages, n + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   setPageNum(n => Math.max(1, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages, onClose]);

  const isCompleted = selectedStudentId ? (completedMap[selectedStudentId]?.has(lesson.id) ?? false) : false;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button onClick={onClose} title="Close (Esc)" className="p-1.5 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white text-sm truncate">{lesson.title}</h2>
          {totalPages > 0 && <p className="text-xs text-gray-400">Page {pageNum} of {totalPages}</p>}
        </div>

        {students.length > 0 && (
          <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
            className="px-2 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-600 focus:outline-none max-w-[150px]">
            <option value="">Select student…</option>
            {students.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        {selectedStudentId && (
          <button
            onClick={() => onMarkDone(selectedStudentId, lesson.id, !isCompleted)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg flex-shrink-0 transition-colors
              ${isCompleted ? 'bg-green-600 text-white hover:bg-red-600' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <span className="hidden sm:inline">{isCompleted ? 'Done ✓' : 'Mark Done'}</span>
          </button>
        )}
      </div>

      {/* PDF */}
      <div ref={pdfContainerRef} className="flex-1 flex items-center justify-center bg-gray-700 overflow-hidden">
        {loading  && <div className="flex flex-col items-center gap-3 text-gray-300"><svg className="animate-spin w-10 h-10" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/></svg><span className="text-sm">Loading PDF…</span></div>}
        {pdfError && !loading && <p className="text-red-400 text-sm px-6 text-center">{pdfError}</p>}
        {!loading && !pdfError && <canvas ref={pdfCanvasRef} className="shadow-xl" style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }} />}
      </div>

      {/* Bottom nav */}
      {!loading && !pdfError && totalPages > 0 && (
        <div className="flex items-center justify-center gap-4 px-4 py-2.5 bg-gray-800 border-t border-gray-700 flex-shrink-0">
          <button onClick={() => setPageNum(n => Math.max(1, n - 1))} disabled={pageNum <= 1}
            className="flex items-center gap-2 px-5 py-1.5 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Previous
          </button>
          <span className="text-gray-300 text-sm tabular-nums min-w-[70px] text-center">{pageNum} / {totalPages}</span>
          <button onClick={() => setPageNum(n => Math.min(totalPages, n + 1))} disabled={pageNum >= totalPages}
            className="flex items-center gap-2 px-5 py-1.5 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed">
            Next
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

// ── Lesson row ────────────────────────────────────────────────────────────────

interface RowProps {
  lesson: ArabicLesson; index: number; isAdmin: boolean; isDragOver: boolean;
  onView: () => void; onEdit: (e: React.MouseEvent) => void; onDelete: (e: React.MouseEvent) => void;
  onDragStart: () => void; onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void; onDragEnd: () => void;
}

const ArabicLessonRow: React.FC<RowProps> = ({
  lesson, index, isAdmin, isDragOver, onView, onEdit, onDelete,
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
