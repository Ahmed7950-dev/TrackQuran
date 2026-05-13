// components/ArabicDashboard.tsx
// ---------------------------------------------------------------------------
// Lists all Arabic students for the logged-in teacher.
// ---------------------------------------------------------------------------

import React, { useState } from 'react';
import { ArabicStudent } from '../types';
import ArabicAddStudentModal from './ArabicAddStudentModal';
import { ensureShareToken } from '../services/arabicService';

interface Props {
  teacherId: string;
  students: ArabicStudent[];
  onAddStudent:    (s: ArabicStudent) => void;
  onSelectStudent: (id: string) => void;
  onUpdateStudent: (s: ArabicStudent) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function progressPercent(s: ArabicStudent): number {
  return Math.min(100, Math.round((s.completedLessonIds.length / 60) * 100));
}

function dialectLabel(d: string): string {
  return { msa: 'MSA', levantine: 'Levantine', quranic: 'Quranic' }[d] ?? d;
}

const ArabicDashboard: React.FC<Props> = ({ teacherId, students, onAddStudent, onSelectStudent, onUpdateStudent }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopyLink(student: ArabicStudent, e: React.MouseEvent) {
    e.stopPropagation(); // don't open the student page
    setCopyingId(student.id);
    try {
      const token = await ensureShareToken(student);
      // Persist token to state if freshly generated
      if (!student.shareToken) {
        onUpdateStudent({ ...student, shareToken: token });
      }
      const url = `${window.location.origin}/arabic/s/${token}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(student.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      console.error('copyLink:', err);
    } finally {
      setCopyingId(null);
    }
  }

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
            <StudentCard
              key={s.id}
              student={s}
              onClick={() => onSelectStudent(s.id)}
              onCopyLink={e => handleCopyLink(s, e)}
              copying={copyingId === s.id}
              copied={copiedId === s.id}
            />
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

interface CardProps {
  student: ArabicStudent;
  onClick: () => void;
  onCopyLink: (e: React.MouseEvent) => void;
  copying: boolean;
  copied: boolean;
}

const StudentCard: React.FC<CardProps> = ({ student: s, onClick, onCopyLink, copying, copied }) => {
  const pct = progressPercent(s);

  return (
    <div className="group relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-600 transition-all duration-200">
      <button
        onClick={onClick}
        className="text-left w-full p-5"
      >
        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-700 dark:text-amber-300 text-lg font-bold flex-shrink-0">
            {s.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
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

      {/* ── Share link button ── */}
      <div className="px-5 pb-4">
        <button
          onClick={onCopyLink}
          disabled={copying}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
            copied
              ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-50 dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-700 dark:hover:text-amber-300'
          }`}
        >
          {copying ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          ) : copied ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          )}
          {copying ? 'Generating…' : copied ? 'Link copied!' : 'Copy student link'}
        </button>
      </div>
    </div>
  );
};

export default ArabicDashboard;
