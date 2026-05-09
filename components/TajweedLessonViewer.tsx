// components/TajweedLessonViewer.tsx
// -----------------------------------------------------------------------------
// Full-screen PDF viewer for Tajweed lessons.
// Tutors can select a student and mark the lesson as done.
// -----------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { Student, TajweedLesson } from '../types';
import { markLessonCompleted, unmarkLessonCompleted, getCompletedLessonIds } from '../services/tajweedService';

interface Props {
  lesson: TajweedLesson;
  students: Student[];
  tutorId: string;
  onClose: () => void;
}

const TajweedLessonViewer: React.FC<Props> = ({ lesson, students, tutorId, onClose }) => {
  const [completedIds, setCompletedIds]           = useState<Set<string>>(new Set());
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [marking, setMarking]                     = useState(false);

  // When student changes, fetch their completion status for this lesson
  useEffect(() => {
    if (!selectedStudentId) return;
    getCompletedLessonIds(selectedStudentId).then(ids => setCompletedIds(ids));
  }, [selectedStudentId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isCompleted = selectedStudentId ? completedIds.has(lesson.id) : false;

  const handleMark = async () => {
    if (!selectedStudentId || marking) return;
    setMarking(true);
    if (isCompleted) {
      const ok = await unmarkLessonCompleted(selectedStudentId, lesson.id);
      if (ok) setCompletedIds(prev => { const s = new Set(prev); s.delete(lesson.id); return s; });
    } else {
      const ok = await markLessonCompleted(selectedStudentId, lesson.id, tutorId);
      if (ok) setCompletedIds(prev => new Set([...prev, lesson.id]));
    }
    setMarking(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        {/* Close */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors flex-shrink-0"
          title="Close (Esc)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white truncate">{lesson.title}</h2>
          {lesson.description && (
            <p className="text-xs text-gray-400 truncate">{lesson.description}</p>
          )}
        </div>

        {/* Open in new tab */}
        {lesson.pdfUrl && (
          <a
            href={lesson.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg hover:bg-gray-600 transition-colors flex-shrink-0"
            title="Open PDF in new tab"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            <span className="hidden sm:inline">Open in tab</span>
          </a>
        )}

        {/* Student selector */}
        {students.length > 0 && (
          <select
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
            className="px-3 py-1.5 bg-gray-700 text-gray-200 text-sm rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 max-w-[160px]"
          >
            <option value="">Select student…</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {/* Mark done button */}
        {selectedStudentId && (
          <button
            onClick={handleMark}
            disabled={marking}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors flex-shrink-0 ${
              isCompleted
                ? 'bg-green-600 text-white hover:bg-red-600'
                : 'bg-teal-600 text-white hover:bg-teal-700'
            } disabled:opacity-50`}
          >
            {marking ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
              </svg>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span className="hidden sm:inline">{isCompleted ? 'Done ✓' : 'Mark Done'}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ── PDF viewer ── */}
      <div className="flex-1 min-h-0">
        {lesson.pdfUrl ? (
          <iframe
            src={lesson.pdfUrl}
            className="w-full h-full border-0"
            title={lesson.title}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16 opacity-40">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="text-lg font-medium">No PDF attached to this lesson</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TajweedLessonViewer;
