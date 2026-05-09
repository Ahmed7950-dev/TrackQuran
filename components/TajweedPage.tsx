// components/TajweedPage.tsx
// -----------------------------------------------------------------------------
// Main page rendered when the Tajweed header tab is active.
// • Tutors  → list of lessons; click "Open" to launch the viewer
// • Admins  → same list + create/edit/delete buttons + PDF upload modal
// -----------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { Student, TajweedLesson } from '../types';
import { useAuth } from '../context/AuthProvider';
import { listLessons, deleteLesson } from '../services/tajweedService';
import PdfUploadModal from './PdfUploadModal';
import TajweedLessonEditor, { SlideContent } from './TajweedLessonEditor';
import TajweedLessonViewer from './TajweedLessonViewer';

const CANVAS_W = 1280;
const CANVAS_H = 720;

interface Props {
  students: Student[];
}

const TajweedPage: React.FC<Props> = ({ students }) => {
  const { currentUser } = useAuth();
  const isAdmin  = currentUser?.role === 'admin';
  const tutorId  = currentUser?.role === 'teacher' || currentUser?.role === 'admin' ? currentUser.id : '';

  const [lessons, setLessons]   = useState<TajweedLesson[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [editing, setEditing]   = useState<TajweedLesson | null>(null);
  const [viewing, setViewing]   = useState<TajweedLesson | null>(null);

  useEffect(() => { (async () => {
    setLessons(await listLessons());
    setLoading(false);
  })(); }, []);

  const refresh = async () => setLessons(await listLessons());

  const handleDelete = async (l: TajweedLesson) => {
    if (!confirm(`Delete lesson "${l.title}"? This cannot be undone.`)) return;
    if (await deleteLesson(l.id)) await refresh();
  };

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
              ? 'Create, edit, and manage Tajweed lessons. Tutors will see only the published lessons.'
              : `Browse ${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} created by the admin team and teach them to your students.`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white font-semibold rounded-lg shadow-sm hover:bg-teal-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Create Lesson from PDF
          </button>
        )}
      </div>

      {/* ── Empty state ── */}
      {lessons.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-12 text-center">
          <div className="text-6xl mb-3">📚</div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-1">No lessons yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isAdmin ? 'Click "Create Lesson from PDF" to get started.' : 'Lessons will appear here once an admin creates them.'}
          </p>
        </div>
      )}

      {/* ── Lesson grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {lessons.map(lesson => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            isAdmin={isAdmin}
            onView={() => setViewing(lesson)}
            onEdit={() => setEditing(lesson)}
            onDelete={() => handleDelete(lesson)}
          />
        ))}
      </div>

      {/* ── Modals & overlays ── */}
      {isAdmin && uploadOpen && (
        <PdfUploadModal
          isOpen={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onCreated={lesson => { setLessons(prev => [...prev, lesson]); setEditing(lesson); }}
        />
      )}

      {isAdmin && editing && (
        <TajweedLessonEditor
          lesson={editing}
          onClose={() => setEditing(null)}
          onSaved={updated => {
            setLessons(prev => prev.map(l => l.id === updated.id ? updated : l));
            setEditing(updated);
          }}
        />
      )}

      {viewing && (
        <TajweedLessonViewer
          lesson={viewing}
          students={students}
          tutorId={tutorId}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Lesson card with thumbnail of slide #1
// -----------------------------------------------------------------------------
const LessonCard: React.FC<{
  lesson: TajweedLesson;
  isAdmin: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ lesson, isAdmin, onView, onEdit, onDelete }) => {
  const first = lesson.slides[0];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden flex flex-col">
      {/* Thumbnail */}
      <button onClick={onView}
        className="relative block w-full overflow-hidden bg-slate-100 dark:bg-gray-900"
        style={{ paddingTop: `${(CANVAS_H / CANVAS_W) * 100}%` }}
      >
        <div className="absolute inset-0">
          {first ? (
            <div className="w-full h-full overflow-hidden">
              <div style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${320 / CANVAS_W})`, transformOrigin: 'top left' }}>
                <SlideContent slide={first} />
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">No slides</div>
          )}
        </div>
        <div className="absolute bottom-1 right-1 bg-slate-800/80 text-white text-xs font-bold rounded px-1.5 py-0.5">
          {lesson.slides.length} slide{lesson.slides.length !== 1 ? 's' : ''}
        </div>
      </button>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 line-clamp-2">{lesson.title}</h3>
        {lesson.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{lesson.description}</p>
        )}
        <div className="mt-auto pt-3 flex items-center gap-2">
          <button onClick={onView}
            className="flex-1 px-3 py-1.5 bg-teal-600 text-white text-sm font-semibold rounded hover:bg-teal-700">
            Open
          </button>
          {isAdmin && (
            <>
              <button onClick={onEdit}
                title="Edit"
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-gray-700 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
              </button>
              <button onClick={onDelete}
                title="Delete"
                className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TajweedPage;
