// ─────────────────────────────────────────────────────────────────────────────
// PublicQuranPage — the Qur'an reader anyone can open from the landing page,
// with no account. It is the same reader the tutor and the student use, in
// `guest` mode: listening and hifz only, with tajweed colours and focus mode,
// a tap on a verse to hear it and a long press to read what it means.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import StudentProgressPage from './StudentProgressPage';
import { QURANIC_FONTS } from '../constants';
import { Student } from '../types';
import { AppTheme, applyTheme, readTheme, nextTheme, THEME_LABEL, isDarkTheme } from '../utils/theme';
import ThemeIcon from './ThemeIcon';


const storedFont = (): string => {
  try {
    const f = localStorage.getItem('quranicFont') || 'Hafs';
    return QURANIC_FONTS.some(o => o.name === f) ? f : 'Hafs';
  } catch { return 'Hafs'; }
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

const headerBtn = 'w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900/40 text-slate-600 dark:text-slate-300';

const PublicQuranPage: React.FC = () => {
  const [theme, setTheme] = useState<AppTheme>(readTheme);
  const [quranicFont, setQuranicFont] = useState<string>(storedFont);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(56);

  useEffect(() => { applyTheme(theme); }, [theme]);

  // The reader reads the chosen font off this custom property.
  useEffect(() => {
    document.documentElement.style.setProperty('--quranic-font', quranicFont);
    try { localStorage.setItem('quranicFont', quranicFont); } catch { /* private mode */ }
  }, [quranicFont]);

  useEffect(() => {
    if (!fontMenuOpen) return;
    const away = (e: MouseEvent) => {
      const el = e.target as Element;
      if (!el.closest?.('.pq-font')) setFontMenuOpen(false);
    };
    const id = setTimeout(() => document.addEventListener('click', away, true), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', away, true); };
  }, [fontMenuOpen]);

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

  const isDark = isDarkTheme(theme);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900">
      <header ref={headerRef}
        className="fixed top-0 inset-x-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-slate-200 dark:border-gray-700"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="w-full px-2 sm:px-4 h-14 flex items-center gap-2">
          <a href="/" aria-label="Back to the home page" title="Back to the home page" className={headerBtn}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </a>

          <a href="/" className="flex items-center min-w-0" aria-label="Lisan &amp; Quran home">
            <img src={isDark ? '/TQ LOGO DM.png' : '/TQ LOGO.png'} alt="Lisan &amp; Quran"
              className="h-9 sm:h-11 w-auto" />
          </a>

          <span className="flex-grow" />

          {/* Quranic font */}
          <div className="pq-font relative flex-shrink-0">
            <button onClick={() => setFontMenuOpen(o => !o)}
              aria-label="Choose the Qur'an font" title="Qur'an font" aria-expanded={fontMenuOpen}
              className={headerBtn}>
              <span style={{ fontFamily: 'Amiri Regular', fontSize: '1.15rem', lineHeight: 1 }}>ع</span>
            </button>
            {fontMenuOpen && (
              <div className="absolute end-0 mt-2 w-60 max-w-[80vw] bg-white dark:bg-gray-800 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 py-1 z-50">
                <p className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Qur'an font</p>
                {QURANIC_FONTS.map(f => (
                  <button key={f.name}
                    onClick={() => { setQuranicFont(f.name); setFontMenuOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-start flex items-center justify-between gap-2 ${
                      quranicFont === f.name
                        ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                    <span style={{ fontFamily: f.name }}>{f.displayName}</span>
                    {quranicFont === f.name && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setTheme(nextTheme)}
            aria-label="Change the theme" title={`Theme: ${THEME_LABEL[theme]}`} className={headerBtn}>
            <ThemeIcon theme={theme} className="w-[17px] h-[17px]" />
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
