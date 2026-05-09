// components/TajweedLessonViewer.tsx
// -----------------------------------------------------------------------------
// Read-only slide viewer for tutors. Supports prev/next navigation, fullscreen,
// keyboard arrows, and marking the lesson as done for a chosen student.
// -----------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { Student, TajweedLesson } from '../types';
import { SlideContent } from './TajweedLessonEditor';
import { markLessonCompleted, unmarkLessonCompleted } from '../services/tajweedService';

const CANVAS_W = 1280;
const CANVAS_H = 720;

interface Props {
  lesson: TajweedLesson;
  students: Student[];
  tutorId: string;
  initialCompletedFor?: Set<string>; // student ids that already completed this lesson
  onClose: () => void;
  onCompletionChanged?: (studentId: string, completed: boolean) => void;
}

const TajweedLessonViewer: React.FC<Props> = ({
  lesson, students, tutorId, initialCompletedFor, onClose, onCompletionChanged,
}) => {
  const [idx, setIdx] = useState(0);
  const [completedSet, setCompletedSet] = useState<Set<string>>(initialCompletedFor ?? new Set());
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [marking, setMarking] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const compute = () => {
      const el = stageRef.current; if (!el) return;
      setScale(Math.min(el.clientWidth / CANVAS_W, el.clientHeight / CANVAS_H));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') setIdx(i => Math.min(lesson.slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')                    setIdx(i => Math.max(0, i - 1));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lesson.slides.length, onClose]);

  const slide = lesson.slides[idx];
  const isCompletedForSelected = selectedStudentId && completedSet.has(selectedStudentId);

  const handleMark = async () => {
    if (!selectedStudentId) return;
    setMarking(true);
    const ok = isCompletedForSelected
      ? await unmarkLessonCompleted(selectedStudentId, lesson.id)
      : await markLessonCompleted(selectedStudentId, lesson.id, tutorId);
    setMarking(false);
    if (ok) {
      const next = new Set(completedSet);
      if (isCompletedForSelected) next.delete(selectedStudentId); else next.add(selectedStudentId);
      setCompletedSet(next);
      onCompletionChanged?.(selectedStudentId, !isCompletedForSelected);
    }
  };

  if (!slide) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col" dir="ltr">
      {/* ── Top bar ── */}
      <div className="bg-slate-800 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-700 text-white" title="Close (Esc)">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-white truncate flex-1">{lesson.title}</h2>

        {/* Mark as done — student picker + button */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={selectedStudentId}
            onChange={e => setSelectedStudentId(e.target.value)}
            className="px-3 py-1.5 text-sm bg-slate-700 text-white border border-slate-600 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none"
          >
            <option value="">— Select student —</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}{completedSet.has(s.id) ? ' ✓' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={handleMark}
            disabled={!selectedStudentId || marking}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md disabled:opacity-50 ${
              isCompletedForSelected
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >{marking ? '…' : isCompletedForSelected ? 'Unmark' : '✓ Mark Done'}</button>
        </div>
      </div>

      {/* ── Stage ── */}
      <div ref={stageRef} className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div className="shadow-2xl" style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}>
          <div style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <SlideContent slide={slide} />
          </div>
        </div>
      </div>

      {/* ── Bottom navigation ── */}
      <div className="bg-slate-800 px-4 py-3 flex items-center justify-center gap-4 flex-shrink-0">
        <button
          onClick={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="flex items-center gap-2 px-5 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Previous
        </button>

        <div className="text-white font-semibold text-lg min-w-[5rem] text-center">
          {idx + 1} <span className="text-slate-400 text-sm">/ {lesson.slides.length}</span>
        </div>

        <button
          onClick={() => setIdx(i => Math.min(lesson.slides.length - 1, i + 1))}
          disabled={idx === lesson.slides.length - 1}
          className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TajweedLessonViewer;
