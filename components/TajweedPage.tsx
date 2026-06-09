// components/TajweedPage.tsx
// -----------------------------------------------------------------------------
// Tajweed lessons list with drag-and-drop reordering (admin only).
// • Each lesson is a row — clicking the row opens the PDF viewer.
// • Admins see a drag handle on the left and edit/delete icons on the right.
// • On drop, order_index is saved for every lesson in the new order.
// -----------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { Student, TajweedLesson } from '../types';
import { useAuth } from '../context/AuthProvider';
import { listLessons, deleteLesson, updateLesson, getCompletedLessonIds } from '../services/tajweedService';
import CreateLessonModal from './CreateLessonModal';
import TajweedLessonViewer from './TajweedLessonViewer';

interface Props {
  students: Student[];
  preSelectedStudentId?: string;
  /** When true, hides all admin/edit controls regardless of auth state.
   *  Use when rendering TajweedPage inside the student-facing shared report. */
  readOnly?: boolean;
}

const TajweedPage: React.FC<Props> = ({ students, preSelectedStudentId, readOnly = false }) => {
  const { currentUser } = useAuth();
  // In readOnly mode (student portal) never show admin controls even if the
  // teacher happens to open the link in their authenticated browser.
  const isAdmin = !readOnly && currentUser?.role === 'admin';
  const tutorId = (currentUser?.role === 'teacher' || currentUser?.role === 'admin') ? currentUser.id : '';

  const [lessons,       setLessons]       = useState<TajweedLesson[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [editing,       setEditing]       = useState<TajweedLesson | null>(null);
  const [viewing,       setViewing]       = useState<TajweedLesson | null>(null);
  const [completedIds,  setCompletedIds]  = useState<Set<string>>(new Set());

  // ── Drag state (admin only) ────────────────────────────────────────────────
  const dragIdx    = useRef<number | null>(null);
  const [overIdx,  setOverIdx]  = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      setLessons(await listLessons());
      setLoading(false);
    })();
  }, []);

  // Fetch completed lesson IDs for the pre-selected student (student portal)
  useEffect(() => {
    if (!preSelectedStudentId) return;
    getCompletedLessonIds(preSelectedStudentId).then(setCompletedIds).catch(console.warn);
  }, [preSelectedStudentId]);

  const handleDelete = async (l: TajweedLesson) => {
    if (!confirm(`Delete lesson "${l.title}"? This cannot be undone.`)) return;
    if (await deleteLesson(l.id)) setLessons(prev => prev.filter(x => x.id !== l.id));
  };

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const handleDragStart = (idx: number) => { dragIdx.current = idx; };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setOverIdx(idx);
  };

  const handleDrop = async (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    dragIdx.current = null;
    setOverIdx(null);
    if (from === null || from === dropIdx) return;

    // Reorder locally
    const reordered = [...lessons];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIdx, 0, moved);

    // Assign fresh order_index values (1-based)
    const updated = reordered.map((l, i) => ({ ...l, orderIndex: i + 1 }));
    setLessons(updated);

    // Persist to DB (fire and forget — failures are silent but order is kept locally)
    await Promise.all(updated.map(l => updateLesson(l.id, { orderIndex: l.orderIndex })));
  };

  const handleDragEnd = () => { dragIdx.current = null; setOverIdx(null); };

  // ── Render ─────────────────────────────────────────────────────────────────
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
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">Tajweed Lessons</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin
              ? 'Upload and manage Tajweed PDF lessons. Drag rows to reorder.'
              : `${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} — click any lesson to open it.`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white font-semibold rounded-lg shadow-sm hover:bg-teal-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Upload Lesson
          </button>
        )}
      </div>

      {/* ── Empty state ── */}
      {lessons.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <div className="text-6xl mb-3">📄</div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">No lessons yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAdmin ? 'Click "Upload Lesson" to add your first PDF lesson.' : 'Lessons will appear here once an admin uploads them.'}
          </p>
        </div>
      )}

      {/* ── Lesson list ── */}
      {lessons.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden divide-y divide-slate-100 dark:divide-gray-700">
          {lessons.map((lesson, idx) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              index={idx}
              isAdmin={isAdmin}
              isDragOver={overIdx === idx}
              isCompleted={completedIds.has(lesson.id)}
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

      {/* ── Create modal ── */}
      {isAdmin && createOpen && (
        <CreateLessonModal
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={lesson => setLessons(prev => [...prev, lesson])}
        />
      )}

      {/* ── Edit modal ── */}
      {isAdmin && editing && (
        <CreateLessonModal
          isOpen={!!editing}
          existing={editing}
          onClose={() => setEditing(null)}
          onUpdated={updated => {
            setLessons(prev => prev.map(l => l.id === updated.id ? updated : l));
            setEditing(null);
          }}
        />
      )}

      {/* ── PDF viewer ── */}
      {viewing && (
        <TajweedLessonViewer
          lesson={viewing}
          students={students}
          tutorId={tutorId}
          preSelectedStudentId={preSelectedStudentId}
          onClose={() => {
            setViewing(null);
            // Re-fetch completed IDs so any "Mark Done" changes in the viewer
            // are immediately reflected in the lesson list highlights
            if (preSelectedStudentId) {
              getCompletedLessonIds(preSelectedStudentId).then(setCompletedIds).catch(console.warn);
            }
          }}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Single lesson row
// -----------------------------------------------------------------------------
interface RowProps {
  lesson: TajweedLesson;
  index: number;
  isAdmin: boolean;
  isDragOver: boolean;
  isCompleted?: boolean;
  onView: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const LessonRow: React.FC<RowProps> = ({
  lesson, index, isAdmin, isDragOver, isCompleted = false,
  onView, onEdit, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) => (
  <div
    draggable={isAdmin}
    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDragEnd={onDragEnd}
    onClick={onView}
    className={`group flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-colors
      ${isDragOver
        ? 'bg-teal-50 dark:bg-teal-900/20 border-t-2 border-teal-500'
        : isCompleted
          ? 'bg-emerald-50 dark:bg-emerald-900/15 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/25'
          : 'hover:bg-slate-50 dark:hover:bg-gray-700/50'
      }`}
  >
    {/* Drag handle — admin only */}
    {isAdmin && (
      <div
        className="flex-shrink-0 text-slate-300 dark:text-gray-600 hover:text-slate-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M7 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM7 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM13 15a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
        </svg>
      </div>
    )}

    {/* Index number */}
    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-xs font-bold">
      {index + 1}
    </span>

    {/* PDF icon */}
    <div className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-gray-700">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
        className="w-5 h-5 text-teal-600 dark:text-teal-400">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    </div>

    {/* Title + description */}
    <div className="flex-1 min-w-0">
      <p className={`font-semibold truncate ${isCompleted ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-800 dark:text-slate-100'}`}>{lesson.title}</p>
      {lesson.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{lesson.description}</p>
      )}
    </div>

    {/* Completed badge */}
    {isCompleted && (
      <span className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Done
      </span>
    )}

    {/* Chevron (hint to click) */}
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
      className="w-4 h-4 text-slate-300 dark:text-gray-600 flex-shrink-0 group-hover:text-teal-500 transition-colors">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>

    {/* Admin controls */}
    {isAdmin && (
      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={onEdit}
          title="Edit"
          className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
          </svg>
        </button>
        <button
          onClick={onDelete}
          title="Delete"
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </div>
    )}
  </div>
);

export default TajweedPage;
