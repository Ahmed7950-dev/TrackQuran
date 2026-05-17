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
import { getStudentByShareToken, saveArabicStudent, getVocabWordCountsByLesson } from '../services/arabicService';
import { getCustomVocabWordCount } from '../services/vocabularyService';
import NotificationCenter from './NotificationCenter';
import ArabicStudentDetailPage from './ArabicStudentDetailPage';
import AboutUsPage from './AboutUsPage';
import VocabularyPracticePage from './VocabularyPracticePage';
import Logo from './Logo';

interface Props {
  token: string;
}

const ArabicStudentPortal: React.FC<Props> = ({ token }) => {
  const backUrl = new URLSearchParams(window.location.search).get('from') ?? null;

  const [student, setStudent] = useState<ArabicStudent | null | 'loading'>('loading');
  const [portalTab, setPortalTab] = useState<'lessons' | 'about' | 'vocabulary'>('lessons');
  const [totalVocabCount, setTotalVocabCount] = useState<number>(0);
  const [theme, setTheme] = useState<'light' | 'dark' | 'reading'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'reading') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'reading') root.setAttribute('data-theme', 'reading');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () =>
    setTheme(t => t === 'light' ? 'reading' : t === 'reading' ? 'dark' : 'light');

  useEffect(() => {
    document.title = 'LisanQuran Student Portal';
    return () => { document.title = 'LisanQuran'; };
  }, []);

  useEffect(() => {
    getStudentByShareToken(token).then(async s => {
      setStudent(s ?? null);
      if (s) {
        const [lessonWordCounts, customCount] = await Promise.all([
          getVocabWordCountsByLesson(),
          getCustomVocabWordCount(s.id),
        ]);
        const lessonWords = s.completedLessonIds.reduce(
          (sum, lid) => sum + (lessonWordCounts[lid] ?? 0), 0
        );
        setTotalVocabCount(lessonWords + customCount);
      }
    });
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
        {/* ── Top bar: logo + student badge ── */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          {/* Back to family button — only shown when opened from a family link */}
          {backUrl && (
            <a
              href={backUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-700 dark:hover:text-amber-300 transition-colors text-sm font-semibold flex-shrink-0"
              aria-label="Back to family page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              <span className="hidden sm:inline">Family</span>
            </a>
          )}

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

          {/* Desktop nav — centred, only shows md+ */}
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
            <span className="w-px h-5 bg-slate-200 dark:bg-gray-600" />
            <button
              onClick={() => setPortalTab(t => t === 'vocabulary' ? 'lessons' : 'vocabulary')}
              className={`text-sm font-medium transition-colors ${portalTab === 'vocabulary' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
            >
              Vocabulary
            </button>
          </nav>

          <div className="flex-1" />

          <NotificationCenter teacherId={student.teacherId} recipient="student" studentId={student.shareToken ?? ''} />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : theme === 'reading' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" />
              </svg>
            )}
          </button>

          {/* Student badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full flex-shrink-0">
            <span className="text-emerald-600 dark:text-emerald-400 text-sm">🎓</span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 max-w-[100px] truncate">
              {student.name}
            </span>
            {totalVocabCount > 0 && (
              <>
                <span className="w-px h-3.5 bg-emerald-200 dark:bg-emerald-700" />
                <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 whitespace-nowrap flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  {totalVocabCount.toLocaleString()} words
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Mobile nav bar — full-width scrollable row, hidden on md+ ── */}
        <nav className="md:hidden border-t border-slate-100 dark:border-gray-700 overflow-x-auto">
          <div className="flex items-center gap-1 px-4 py-2 min-w-max">
            <button
              onClick={() => setPortalTab('lessons')}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${portalTab === 'lessons' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-500'}`}
            >
              Lessons
            </button>
            <button
              onClick={() => setPortalTab('about')}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${portalTab === 'about' ? 'bg-teal-50 dark:bg-orange-900/20 text-teal-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-500'}`}
            >
              About Us
            </button>
            <a href="#" className="flex-shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-500 px-3 py-1.5 rounded-full transition-colors">
              Contact Us
            </a>
            <a href="#" className="flex-shrink-0 text-xs font-medium text-white bg-teal-600 dark:bg-orange-600 px-3 py-1.5 rounded-full">
              Support Us
            </a>
            <span className="flex-shrink-0 w-px h-4 bg-slate-200 dark:bg-gray-600 mx-1" />
            <button
              onClick={() => setPortalTab('vocabulary')}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${portalTab === 'vocabulary' ? 'bg-teal-50 dark:bg-orange-900/20 text-teal-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-500'}`}
            >
              Vocabulary
            </button>
          </div>
        </nav>
      </header>

      {/* ── Main content ── */}
      <main className="container mx-auto flex-grow p-4 sm:p-6 lg:p-8">
        {portalTab === 'about' ? (
          <AboutUsPage />
        ) : portalTab === 'vocabulary' ? (
          <VocabularyPracticePage studentId={student.id} />
        ) : (
          <ArabicStudentDetailPage
            student={student}
            teacherId={student.teacherId}
            onBack={() => {/* no list to go back to */}}
            onUpdateStudent={handleUpdate}
            onDeleteStudent={() => {/* blocked in student mode */}}
            studentMode
            vocabCount={totalVocabCount}
          />
        )}
      </main>
    </div>
  );
};

export default ArabicStudentPortal;
