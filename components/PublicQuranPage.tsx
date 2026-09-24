// ─────────────────────────────────────────────────────────────────────────────
// PublicQuranPage — the Qur'an reader anyone can open from the landing page,
// with no account. It is the same reader the tutor and the student use, in
// `guest` mode: listening and hifz only, with tajweed colours and focus mode,
// a tap on a verse to hear it and a long press to read what it means.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import StudentProgressPage from './StudentProgressPage';
import { Student } from '../types';

type Theme = 'light' | 'reading' | 'dark';

const storedTheme = (): Theme => {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' || t === 'reading' ? t : 'light';
  } catch { return 'light'; }
};

/** A stand-in student: the reader needs one, and nothing here is ever saved. */
const GUEST: Student = {
  id: 'public-quran-guest',
  name: 'Guest',
  recitationAchievements: [],
  memorizationAchievements: [],
  attendance: [],
  masteredTajweedRules: [],
  tafsirReviews: [],
  tafsirMemorizationReviews: [],
  mistakes: {},
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const noop: any = () => {};
/* eslint-enable @typescript-eslint/no-explicit-any */

const PublicQuranPage: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(64);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'reading') root.setAttribute('data-theme', 'reading');
    try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
  }, [theme]);

  // The sticky surah bar sits directly under this header. Measure the BORDER
  // box: on an installed iPhone app the safe-area padding lives outside the
  // content box, and the bar then overlapped the header.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <header ref={headerRef}
        className="fixed top-0 inset-x-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-gray-700"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="w-full px-3 sm:px-5 h-14 flex items-center gap-2">
          <a href="/" className="flex items-center gap-2 min-w-0" aria-label="LisanQuran home">
            <span className="w-8 h-8 rounded-xl bg-teal-700 text-white flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4.5A1.5 1.5 0 0 1 3 15z" />
                <path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H15a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5h5A1.5 1.5 0 0 0 21 15z" />
              </svg>
            </span>
            <span className="font-extrabold text-slate-800 dark:text-slate-100 truncate">Read the Qur'an</span>
          </a>
          <span className="flex-grow" />
          <button
            onClick={() => setTheme(t => (t === 'light' ? 'reading' : t === 'reading' ? 'dark' : 'light'))}
            aria-label="Change the theme"
            title={`Theme: ${theme}`}
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 text-slate-600 dark:text-slate-300"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {theme === 'dark'
                ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
                : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
            </svg>
          </button>
          <a href="/"
            className="h-9 px-3 sm:px-4 flex-shrink-0 flex items-center rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-extrabold">
            <span className="sm:hidden">Lessons</span>
            <span className="hidden sm:inline">Book a free trial</span>
          </a>
        </div>
      </header>

      <div style={{ height: headerHeight }} aria-hidden="true" />

      <div className="w-full pb-10">
        <p className="px-3 sm:px-5 py-3 text-[13px] text-slate-500 dark:text-slate-400">
          Tap a verse to hear it · hold a verse to read what it means · no account needed.
        </p>
        <StudentProgressPage
          guest
          readOnly
          toolbarStickyTop={headerHeight}
          student={GUEST}
          students={[GUEST]}
          studentProgress={{ surah: 1, ayah: 1 }}
          studentMistakes={{}}
          recitationAchievements={[]}
          memorizationAchievements={[]}
          onUpdateProgress={noop}
          onCycleMistakeLevel={noop}
          onClearMistake={noop}
          onLogRecitationRange={noop}
          onRemoveRecitationAchievement={noop}
          onLogMemorizationRange={noop}
          onRemoveMemorizationAchievement={noop}
          onLogTafseerRange={noop}
          onRemoveTafseerRange={noop}
          onGoBack={noop}
        />
      </div>
    </div>
  );
};

export default PublicQuranPage;
