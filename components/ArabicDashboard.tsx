// components/ArabicDashboard.tsx
// ---------------------------------------------------------------------------
// Lists all Arabic students for the logged-in teacher.
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import { ArabicStudent } from '../types';
import ArabicAddStudentModal from './ArabicAddStudentModal';

interface Props {
  teacherId: string;
  students: ArabicStudent[];
  onAddStudent:    (s: ArabicStudent) => void;
  onSelectStudent: (id: string) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function progressPercent(s: ArabicStudent): number {
  return Math.min(100, Math.round((s.completedLessonIds.length / 60) * 100));
}

function dialectLabel(d: string): string {
  return { msa: 'MSA', levantine: 'Levantine', quranic: 'Quranic' }[d] ?? d;
}

const ArabicDashboard: React.FC<Props> = ({ teacherId, students, onAddStudent, onSelectStudent }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <span className="text-2xl" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</span>
            Arabic Students
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {students.length} {students.length === 1 ? 'student' : 'students'} · click any card to view their lessons
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Student
        </button>
      </div>

      {/* ── Search ── */}
      {students.length > 3 && (
        <div className="relative max-w-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      )}

      {/* ── Empty ── */}
      {students.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-16 text-center">
          <div className="text-6xl mb-4" style={{ fontFamily: 'Amiri Regular, serif' }}>ع</div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">No Arabic students yet</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Click "Add Student" to register your first Arabic language student.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors"
          >
            Add your first student
          </button>
        </div>
      )}

      {/* ── Student grid ── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <StudentCard key={s.id} student={s} onClick={() => onSelectStudent(s.id)} />
          ))}
        </div>
      )}

      {filtered.length === 0 && students.length > 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">No students match "{search}"</p>
      )}

      {/* ── Modal ── */}
      <ArabicAddStudentModal
        isOpen={modalOpen}
        teacherId={teacherId}
        onClose={() => setModalOpen(false)}
        onSave={s => { onAddStudent(s); setModalOpen(false); }}
      />
    </div>
  );
};

// ── Student card ──────────────────────────────────────────────────────────────

const StudentCard: React.FC<{ student: ArabicStudent; onClick: () => void }> = ({ student: s, onClick }) => {
  const pct = progressPercent(s);

  return (
    <button
      onClick={onClick}
      className="group text-left bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-5 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-600 transition-all duration-200"
    >
      {/* Avatar + name */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 text-lg font-bold flex-shrink-0">
          {s.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{s.arabicLevel ? `Level ${s.arabicLevel} / 10` : 'No level set'}</p>
        </div>
      </div>

      {/* Dialects */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {s.arabicDialects.map(d => (
          <span key={d} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
            {dialectLabel(d)}
          </span>
        ))}
        {s.nationality && (
          <span className="px-2 py-0.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-400 rounded-full text-xs">
            {s.nationality}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
          <span>Lesson progress</span>
          <span className="font-semibold">{s.completedLessonIds.length} / 60</span>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Deadline */}
      {s.goalDeadline && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Goal: {new Date(s.goalDeadline).toLocaleDateString()}
        </p>
      )}
    </button>
  );
};

export default ArabicDashboard;
