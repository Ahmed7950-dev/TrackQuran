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
import AboutUsPage from './AboutUsPage';
import Logo from './Logo';

interface Props {
  token: string;
}

const ArabicStudentPortal: React.FC<Props> = ({ token }) => {
  const [student, setStudent] = useState<ArabicStudent | null | 'loading'>('loading');
  const [portalTab, setPortalTab] = useState<'lessons' | 'about'>('lessons');

  useEffect(() => {
    document.title = 'LisanQuran Student Portal';
    return () => { document.title = 'LisanQuran'; };
  }, []);

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
          {/* Logo — clicking it goes back to lessons */}
          <button onClick={() => setPortalTab('lessons')} className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" aria-label="Go to lessons">
            <Logo />
          </button>
          <span
            className="hidden sm:block text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full flex-shrink-0"
            style={{ fontFamily: 'Amiri Regular, serif' }}
          >
            العربية
          </span>

          {/* Nav links */}
          <nav className="flex-1 hidden md:flex justify-center items-center gap-6">
            <button
              onClick={() => setPortalTab(t => t === 'about' ? 'lessons' : 'about')}
              className={`text-sm font-medium transition-colors ${portalTab === 'about' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
            >
              About Us
            </button>
            <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500 transition-colors">
              Contact Us
            </a>
            <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">
              Support Us
            </a>
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Student badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full flex-shrink-0">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm">🎓</span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {student.name}
            </span>
          </div>

          {/* Mobile nav links */}
          <div className="flex md:hidden items-center gap-3 flex-shrink-0">
            <button
              onClick={() => setPortalTab(t => t === 'about' ? 'lessons' : 'about')}
              className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-500 transition-colors"
            >
              About
            </button>
            <a href="#" className="text-xs font-medium text-white bg-teal-600 dark:bg-orange-600 px-2.5 py-1 rounded-full">
              Support
            </a>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="container mx-auto flex-grow p-4 sm:p-6 lg:p-8">
        {portalTab === 'about' ? (
          <AboutUsPage />
        ) : (
          <ArabicStudentDetailPage
            student={student}
            teacherId={student.teacherId}
            onBack={() => {/* no list to go back to */}}
            onUpdateStudent={handleUpdate}
            onDeleteStudent={() => {/* blocked in student mode */}}
            studentMode
          />
        )}
      </main>
    </div>
  );
};

export default ArabicStudentPortal;
