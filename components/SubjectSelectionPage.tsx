// components/SubjectSelectionPage.tsx
// ---------------------------------------------------------------------------
// Landing page shown right after login.
// Tutor picks between the Quran teaching section and the Arabic teaching section.
// ---------------------------------------------------------------------------

import React from 'react';

interface Props {
  onSelect: (mode: 'quran' | 'arabic') => void;
}

const SubjectSelectionPage: React.FC<Props> = ({ onSelect }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 via-teal-50/30 to-slate-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-6">

    {/* Branding */}
    <div className="mb-10 text-center">
      <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
        TrackQuran
      </h1>
      <p className="mt-2 text-slate-500 dark:text-slate-400 text-lg">
        Choose a teaching section to continue
      </p>
    </div>

    {/* Cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">

      {/* ── Quran ── */}
      <button
        onClick={() => onSelect('quran')}
        className="group relative flex flex-col items-center gap-5 p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-slate-200 dark:border-gray-700
          hover:shadow-xl hover:border-teal-400 dark:hover:border-teal-500 hover:-translate-y-1
          transition-all duration-200 text-left"
      >
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-teal-600 dark:text-teal-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.4} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-3xl font-bold text-teal-700 dark:text-teal-300 mb-1" style={{ fontFamily: 'Amiri Regular, serif' }}>القرآن</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">Quran</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Track recitation, memorisation, and Tafseer progress for your Quran students.
          </p>
        </div>

        <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 font-semibold text-sm group-hover:gap-3 transition-all">
          Open Quran section
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>

      {/* ── Arabic ── */}
      <button
        onClick={() => onSelect('arabic')}
        className="group relative flex flex-col items-center gap-5 p-10 bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-slate-200 dark:border-gray-700
          hover:shadow-xl hover:border-amber-400 dark:hover:border-amber-500 hover:-translate-y-1
          transition-all duration-200 text-left"
      >
        {/* Icon */}
        <div className="w-20 h-20 rounded-2xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center group-hover:bg-amber-100 dark:group-hover:bg-amber-900/50 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.4} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-3xl font-bold text-amber-700 dark:text-amber-300 mb-1" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</p>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-100">Arabic</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Manage Arabic language students, schedule availability, and track lesson progress.
          </p>
        </div>

        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-sm group-hover:gap-3 transition-all">
          Open Arabic section
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>
    </div>

    <p className="mt-8 text-xs text-slate-400 dark:text-slate-600">
      You can switch sections at any time from the header.
    </p>
  </div>
);

export default SubjectSelectionPage;
