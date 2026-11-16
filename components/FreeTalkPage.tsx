// ─────────────────────────────────────────────────────────────────────────────
// FreeTalkPage — /free-talk/<student link token>, no sign-in.
//
// The Free Talk tab on its own, for the student to open from a link or a QR
// code the tutor shares (in a lesson, on a phone). It is the same tab as on
// the student's page: their verb cards, the word search, Add word / Add verb.
// The tutor chose to share it, so the level 2 lock does not apply here.
// The screen is kept awake while the page is open.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { ArabicLesson, ArabicStudent, ArabicCourseDialect } from '../types';
import { getArabicLessons, getStudentByShareToken } from '../services/arabicService';
import ArabicVerbsTab from './ArabicVerbsTab';
import Logo from './Logo';
import ThemeIcon from './ThemeIcon';
import { AppTheme, applyTheme, readTheme, nextTheme } from '../utils/theme';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';

const FreeTalkPage: React.FC<{ token: string }> = ({ token }) => {
  const [student, setStudent] = useState<ArabicStudent | null | 'loading'>('loading');
  const [lessons, setLessons] = useState<ArabicLesson[]>([]);
  const [theme, setTheme] = useState<AppTheme>(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  // The student talks with the phone in hand: the screen must not lock mid-answer.
  useKeepScreenAwake();

  useEffect(() => {
    void getStudentByShareToken(token).then(s => setStudent(s ?? null));
    void getArabicLessons().then(setLessons);
  }, [token]);

  useEffect(() => {
    if (student && student !== 'loading') document.title = `Free Talk · ${student.name}`;
    return () => { document.title = 'LisanQuran'; };
  }, [student]);

  // The student's course: their dialect(s), as on their page.
  const dialectLessons = useMemo(() => {
    if (!student || student === 'loading') return [];
    const ds = student.arabicDialects.filter((d): d is ArabicCourseDialect => d === 'levantine' || d === 'msa');
    return ds.length ? lessons.filter(l => ds.includes(l.dialect ?? 'levantine')) : lessons;
  }, [student, lessons]);

  if (student === 'loading') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100 dark:bg-gray-900">
        <div className="w-10 h-10 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!student) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-100 dark:bg-gray-900 px-4">
        <div className="max-w-sm w-full bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center">
          <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">This link does not work</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Ask your teacher for a new Free Talk link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100 dark:bg-gray-900 font-sans text-slate-800 dark:text-slate-200 flex flex-col">
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center gap-2.5">
          <a href={`/arabic/s/${token}`} aria-label="Back to my page"
            className="flex-shrink-0 h-10 ps-2 pe-2 sm:pe-3 -ms-1 rounded-xl flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-900 dark:hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" /></svg>
            <span className="hidden sm:inline">My page</span>
          </a>
          <span className="flex-shrink-0 [&_img]:h-9 sm:[&_img]:h-11"><Logo /></span>
          <span className="flex-1" />
          <span className="min-w-0 flex items-center gap-2 px-3 h-9 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
            <span className="text-[13px] font-extrabold text-amber-800 dark:text-amber-300 whitespace-nowrap">Free Talk</span>
            <span className="text-[13px] font-semibold text-amber-700/80 dark:text-amber-300/80 truncate">· {student.name}</span>
          </span>
          <button type="button" onClick={() => setTheme(nextTheme)} aria-label="Change theme"
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700">
            <ThemeIcon theme={theme} />
          </button>
        </div>
      </header>
      <main className="container mx-auto flex-grow px-3 py-4 sm:p-6 lg:p-8" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <ArabicVerbsTab student={student} lessons={dialectLessons} studentMode unlocked />
      </main>
    </div>
  );
};

export default FreeTalkPage;
