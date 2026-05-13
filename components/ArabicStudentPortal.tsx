// components/ArabicStudentPortal.tsx
// ---------------------------------------------------------------------------
// No-login student portal — accessed via the share link:
//   /arabic/s/<token>
//
// The student can view their lessons, do homework and vocabulary challenges,
// and edit their own profile info. All writes go to the same Supabase tables
// so the tutor sees everything in real-time.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { ArabicStudent } from '../types';
import { getStudentByShareToken, saveArabicStudent } from '../services/arabicService';
import ArabicStudentDetailPage from './ArabicStudentDetailPage';
import Logo from './Logo';

interface Props {
  token: string;
}

const ArabicStudentPortal: React.FC<Props> = ({ token }) => {
  const [student, setStudent] = useState<ArabicStudent | null | 'loading'>('loading');

  useEffect(() => {
    getStudentByShareToken(token).then(s => setStudent(s ?? null));
  }, [token]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (student === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-amber-400 border-t-transparent animate-spin mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading your page…</p>
        </div>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (!student) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-12 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🔗</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Link not found</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This student link is invalid or has been removed. Ask your tutor for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  // ── Student handlers — write to the same DB, tutor sees changes instantly ───
  const handleUpdate = async (updated: ArabicStudent) => {
    setStudent(updated);
    await saveArabicStudent(updated.teacherId, updated);
  };

  return (
    <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
          <Logo />
          <span
            className="hidden sm:block text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full"
            style={{ fontFamily: 'Amiri Regular, serif' }}
          >
            العربية
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm">🎓</span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {student.name}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="container mx-auto flex-grow p-4 sm:p-6 lg:p-8">
        <ArabicStudentDetailPage
          student={student}
          teacherId={student.teacherId}
          onBack={() => {/* no list to go back to */}}
          onUpdateStudent={handleUpdate}
          onDeleteStudent={() => {/* blocked in student mode */}}
          studentMode
        />
      </main>
    </div>
  );
};

export default ArabicStudentPortal;
