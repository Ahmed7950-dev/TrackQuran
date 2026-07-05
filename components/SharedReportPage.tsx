import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { getSharedReport, SharedReportData, recordVersePlay, getReportPlays, getStudentTimezonePublic } from '../services/dataService';
import type { QuranHomework } from '../types';
import { supabase } from '../lib/supabase';
import { QURAN_METADATA } from '../constants';
import Logo from './Logo';
import StudentDetailPage from './StudentDetailPage';
import AboutUsPage from './AboutUsPage';
import type { Student, AttendanceRecord, Mistake } from '../types';
import CalendarPage from './CalendarPage';
import { getStoredToken } from '../services/googleCalendarService';
import { getTeacherAvailability, AvailabilitySlot } from '../services/availabilityService';
import { getStudentUpcomingSessions } from '../services/lessonSessionService';
import { LessonSession } from '../types';
import LottieIcon from './LottieIcon';
import StudentProfileIcon from './StudentProfileIcon';
import NotificationCenter from './NotificationCenter';
import TajweedPage from './TajweedPage';
import QaedahPage from './QaedahPage';
import AlphabetTrainerPage from './AlphabetTrainerPage';
import LettersTrainerPage from './LettersTrainerPage';
import StudentProgressPage from './StudentProgressPage';
import VerseAudioPlayer from './VerseAudioPlayer';
import { useI18n } from '../context/I18nProvider';

// Quranic fonts (same list as main app)
const QURANIC_FONTS = [
  { name: 'Hafs', displayName: 'Hafs' },
  { name: 'Amiri Regular', displayName: 'Amiri Regular' },
  { name: 'Elgharib KFGQPCHafs V10', displayName: 'Elgharib KFGQPCHafs V10' },
  { name: 'Elgharib HAFSTharwatEmara', displayName: 'Elgharib HAFSTharwatEmara' },
  { name: 'UthmanTN v2-0', displayName: 'UthmanTN v2-0' },
  { name: 'Uthmanic HAFS v22', displayName: 'Uthmanic HAFS v22' },
] as const;

// ── main page ─────────────────────────────────────────────────────────────────

const SharedReportPage: React.FC<{ reportId: string; switchPortal?: { label: string; onSwitch: () => void }; onLogout?: () => void }> = ({ reportId, switchPortal, onLogout }) => {
  const { t, language, setLanguage } = useI18n();
  const backUrl = new URLSearchParams(window.location.search).get('from') ?? null;

  const [report, setReport] = useState<{ student_name: string; student_id: string; report_data: SharedReportData; teacher_id: string } | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [studentLessons, setStudentLessons] = useState<LessonSession[]>([]);
  const [studentTZ, setStudentTZ] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'progress' | 'calendar' | 'quran' | 'homework' | 'tajweed' | 'qaedah' | 'alphabetTrainer' | 'lettersTrainer'>('quran');
  // Remember each tab's scroll position so returning to a tab (esp. Quran) lands
  // exactly where you left it instead of jumping/looking blank.
  const tabScrollRef = useRef<Record<string, number>>({});
  const changeTab = (next: typeof activeTab) => {
    if (next === activeTab) return;
    tabScrollRef.current[activeTab] = window.scrollY;
    setActiveTab(next);
  };
  useLayoutEffect(() => {
    window.scrollTo(0, tabScrollRef.current[activeTab] ?? 0);
  }, [activeTab]);
  const [gcalToken, setGcalToken] = useState<string | null>(() => getStoredToken());
  const [portalTab, setPortalTab] = useState<'content' | 'about'>('content');
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [quranicFont, setQuranicFont] = useState<string>(() =>
    localStorage.getItem('quranicFont') || 'Hafs'
  );
  const [theme, setTheme] = useState<'light' | 'dark' | 'reading'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'reading') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [versePlays, setVersePlays] = useState<{ [verseKey: string]: number }>({});
  const [quranHomework, setQuranHomework] = useState<QuranHomework[]>([]);
  const [homeworkModal, setHomeworkModal] = useState<QuranHomework | null>(null);
  // Verse key to jump to when student opens homework ("surah:ayah")
  const [homeworkJumpKey, setHomeworkJumpKey] = useState<string | null>(null);
  // Whether the floating note panel is visible
  const [noteVisible, setNoteVisible] = useState(false);
  // Whether to show the completed homework history tab
  const [showHistory, setShowHistory] = useState(false);
  // Increments each time the tutor broadcasts a mistake_buzz — triggers the
  // red flash + sound inside StudentProgressPage on the student's screen.
  const [buzzTrigger, setBuzzTrigger] = useState(0);
  // Set each time the tutor long-presses a letter — scrolls student to that letter.
  const [focusedLetterKey, setFocusedLetterKey] = useState<string | null>(null);
  // Set alongside focusedLetterKey to trigger surah/page navigation before the scroll.
  const [letterJumpKey, setLetterJumpKey] = useState<string | null>(null);
  // Real-time cursor position broadcast by the tutor (C key mode).
  const [cursorLetterKey, setCursorLetterKey] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'reading') root.setAttribute('data-theme', 'reading');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'light' ? 'reading' : t === 'reading' ? 'dark' : 'light');
  };

  // Persist font choice
  useEffect(() => {
    document.documentElement.style.setProperty('--quranic-font', quranicFont);
    localStorage.setItem('quranicFont', quranicFont);
  }, [quranicFont]);

  // Close font menu on outside click
  useEffect(() => {
    if (!isFontMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('.sr-font-btn') && !t.closest('.sr-font-menu')) setIsFontMenuOpen(false);
    };
    const tid = setTimeout(() => document.addEventListener('click', handler, true), 0);
    return () => { clearTimeout(tid); document.removeEventListener('click', handler, true); };
  }, [isFontMenuOpen]);

  useEffect(() => {
    getSharedReport(reportId).then(r => {
      if (!r) setNotFound(true);
      else {
        setReport(r);
        // Initialise font from teacher's saved preference stored in the report
        if (r.report_data.quranicFont) setQuranicFont(r.report_data.quranicFont);
        // Load homework assigned to this student
        if (r.report_data.quranHomework) setQuranHomework(r.report_data.quranHomework);
        // Load teacher's availability so student can see working hours
        if (r.teacher_id) getTeacherAvailability(r.teacher_id).then(setAvailabilitySlots);
        // Load this student's own (linked) upcoming lessons — view-only on the calendar
        if (r.student_id) getStudentUpcomingSessions(r.student_id).then(setStudentLessons).catch(() => {});
        // Resolve the student's timezone (live, so existing reports work without re-share);
        // fall back to whatever was stamped into the report.
        if (r.student_id) {
          getStudentTimezonePublic(r.student_id)
            .then(tz => setStudentTZ(tz || r.report_data.timezone || null))
            .catch(() => setStudentTZ(r.report_data.timezone || null));
        }
      }
      setLoading(false);
    });

    // Load existing play counts from DB
    getReportPlays(reportId).then(plays => setVersePlays(plays));

    // Subscribe to real-time play broadcasts so the student's own counter updates live
    const ch = supabase.channel(`report-plays-${reportId}`);
    ch
      .on('broadcast', { event: 'play' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const vk = payload?.verse_key as string | undefined;
        if (vk) setVersePlays(prev => ({ ...prev, [vk]: (prev[vk] ?? 0) + 1 }));
      })
      // Teacher reset homework → clear play count so student sees 0/3 again
      .on('broadcast', { event: 'play_reset' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const vk = payload?.verse_key as string | undefined;
        if (vk) setVersePlays(prev => {
          const next = { ...prev };
          delete next[vk];
          return next;
        });
      })
      // Teacher updated homework assignment → update student's homeworkVerses in real time (Bug 3 fix)
      .on('broadcast', { event: 'homework_update' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const hw = payload?.homeworkVerses as string[] | undefined;
        if (hw !== undefined) {
          setReport(prev =>
            prev
              ? { ...prev, report_data: { ...prev.report_data, homeworkVerses: hw } }
              : null
          );
        }
      })
      // Teacher assigned new homework → update student's homework badge in real time
      .on('broadcast', { event: 'homework_assigned' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const hw = payload?.quranHomework as QuranHomework[] | undefined;
        if (hw !== undefined) setQuranHomework(hw);
      })
      // Tutor pressed Ctrl during live session → flash red + buzz on student screen
      .on('broadcast', { event: 'mistake_buzz' }, () => {
        setBuzzTrigger(prev => prev + 1);
      })
      // Tutor long-pressed a letter → navigate to its surah then scroll to it
      .on('broadcast', { event: 'letter_focus' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const lk = payload?.letterKey as string | undefined;
        if (!lk) return;
        setFocusedLetterKey(lk);
        // Extract surah:ayah to trigger navigation even if in a different surah/page
        const parts = lk.split(':');
        if (parts.length >= 2) setLetterJumpKey(`${parts[0]}:${parts[1]}`);
      })
      // Tutor moved cursor (C key mode active) → show orange dot on that letter
      .on('broadcast', { event: 'cursor_move' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const lk = payload?.letterKey as string | undefined;
        if (lk) setCursorLetterKey(lk);
      })
      // Tutor toggled cursor mode off → hide orange dot
      .on('broadcast', { event: 'cursor_off' }, () => {
        setCursorLetterKey(null);
      })
      // Teacher added/changed any student data → refresh mistakes, progress and homework live
      .on('broadcast', { event: 'report_updated' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const mistakes    = payload?.mistakes     as SharedReportData['mistakes']           | undefined;
        const sp          = payload?.studentProgress as SharedReportData['studentProgress'] | undefined;
        const hw          = payload?.quranHomework as QuranHomework[]                       | undefined;
        setReport(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            report_data: {
              ...prev.report_data,
              ...(mistakes  !== undefined ? { mistakes }                   : {}),
              ...(sp        !== undefined ? { studentProgress: sp }        : {}),
              ...(hw        !== undefined ? { quranHomework: hw }          : {}),
            },
          };
        });
        if (hw !== undefined) setQuranHomework(hw);
      })
      // Teacher removed a verse → hide it from student's page immediately (Bug 2 fix)
      .on('broadcast', { event: 'verse_removed' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const vk = payload?.verse_key as string | undefined;
        if (vk) {
          setReport(prev =>
            prev
              ? {
                  ...prev,
                  report_data: {
                    ...prev.report_data,
                    verses: prev.report_data.verses.filter(v => v.verse_key !== vk),
                  },
                }
              : null
          );
        }
      })
      .subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [reportId]);

  const handleVersePlay = useCallback(async (verseKey: string) => {
    await recordVersePlay(reportId, verseKey);
    channelRef.current?.send({ type: 'broadcast', event: 'play', payload: { verse_key: verseKey } });
    // Also update local state immediately so progress dots animate right away
    setVersePlays(prev => ({ ...prev, [verseKey]: (prev[verseKey] ?? 0) + 1 }));
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <p className="text-slate-500">{t('studentPortal.loadingReport')}</p>
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow p-8 text-center max-w-sm w-full">
          <Logo />
          <h1 className="mt-6 text-xl font-bold text-slate-800">{t('studentPortal.reportNotFound')}</h1>
          <p className="mt-2 text-slate-500 text-sm">{t('studentPortal.reportNotFoundDesc')}</p>
        </div>
      </div>
    );
  }

  const { student_name, report_data } = report;
  const { generatedAt, studentProgress } = report_data;
  const hasProgress = !!studentProgress;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* ── Header ── */}
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40" dir="ltr">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">

          {/* Back to family button — only shown when opened from a family link */}
          {backUrl && (
            <a
              href={backUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 transition-colors text-sm font-semibold flex-shrink-0"
              aria-label="Back to family page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              <span className="hidden sm:inline">{t('studentPortal.family')}</span>
            </a>
          )}

          {/* Logo — clicking goes back to content */}
          <button onClick={() => setPortalTab('content')} className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" aria-label="Go to portal">
            <Logo />
          </button>

          {/* Student Portal badge */}
          <span className="hidden sm:block text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-3 py-1 rounded-full flex-shrink-0 border border-teal-200 dark:border-teal-800">
            🎓 {t('studentPortal.badge')}
          </span>

          {/* Switch to the paired Arabic portal */}
          {switchPortal && (
            <button
              onClick={switchPortal.onSwitch}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors text-sm font-bold flex-shrink-0"
              title={`Switch to ${switchPortal.label} portal`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              <span style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</span>
            </button>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors text-sm font-bold flex-shrink-0"
              title={t('register.signOut')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              <span className="hidden sm:inline">{t('register.signOut')}</span>
            </button>
          )}

          {/* Desktop nav links */}
          <nav className="flex-1 hidden md:flex justify-center items-center gap-6">
            <button
              onClick={() => setPortalTab(p => p === 'about' ? 'content' : 'about')}
              className={`text-sm font-medium transition-colors ${portalTab === 'about' ? 'text-teal-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-400'}`}
            >
              {t('header.aboutUs')}
            </button>
            <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-400 transition-colors">
              {t('header.contactUs')}
            </a>
            <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">
              {t('header.supportUs')}
            </a>
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Language switcher */}
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-gray-700 rounded-lg flex-shrink-0" dir="ltr">
            {(['en', 'ar', 'tr'] as const).map(lng => (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                className={`px-2 py-1 text-[11px] rounded-md font-bold transition-colors ${language === lng ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-400 shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                aria-label={`Switch language to ${lng.toUpperCase()}`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>

          <NotificationCenter teacherId={report?.teacher_id ?? ''} recipient="student" studentId={report?.student_id ?? ''} />

          {/* Student name badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full flex-shrink-0">
            {report_data.profileIcon
              ? <StudentProfileIcon src={report_data.profileIcon} size={44} mode="always" />
              : <span className="text-emerald-600 dark:text-emerald-400 text-sm">📖</span>}
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate max-w-[100px] sm:max-w-none">
              {student_name}
            </span>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
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

          {/* Quranic font selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setIsFontMenuOpen(o => !o)}
              className="sr-font-btn p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Select Quranic font"
            >
              <span style={{ fontFamily: 'Amiri Regular', fontSize: '1.25rem' }}>ع</span>
            </button>
            {isFontMenuOpen && (
              <div className="sr-font-menu absolute end-0 mt-2 w-52 sm:w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                <div className="py-1">
                  <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('common.quranicFont')}</div>
                  {QURANIC_FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => { setQuranicFont(f.name); setIsFontMenuOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                        quranicFont === f.name
                          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span style={{ fontFamily: f.name }}>{f.displayName}</span>
                      {quranicFont === f.name && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mobile nav links */}
          <div className="flex md:hidden items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setPortalTab(p => p === 'about' ? 'content' : 'about')}
              className={`text-xs font-medium transition-colors ${portalTab === 'about' ? 'text-teal-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-400'}`}
            >
              {t('header.aboutUs')}
            </button>
            <a href="#" className="text-xs font-medium text-white bg-teal-600 dark:bg-orange-600 px-2.5 py-1 rounded-full">
              {t('header.supportUs')}
            </a>
          </div>
        </div>

        {/* Tab bar — hidden when About Us is open */}
        {portalTab === 'content' && (
          <div className="border-t border-slate-100 dark:border-gray-700" dir="ltr">
            <div className="container mx-auto px-3 sm:px-4 flex sm:justify-center overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => changeTab('progress')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'progress'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                } ${!hasProgress ? 'opacity-40 cursor-not-allowed' : ''}`}
                disabled={!hasProgress}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
                {t('studentPortal.tabProgress')}
                {!hasProgress && <span className="text-xs ml-1 opacity-70">{t('studentPortal.shareToUnlock')}</span>}
              </button>
              <button
                onClick={() => changeTab('calendar')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'calendar'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                {t('studentPortal.tabAvailability')}
              </button>
              {/* Quran — primary tab: a green glowing flat pill with an animated icon */}
              <button
                onClick={() => changeTab('quran')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 my-1 mx-1 rounded-none text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === 'quran'
                    ? 'bg-green-500 text-white'
                    : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50'
                }`}
              >
                <LottieIcon src="/al-quran.json" size={20} />
                {t('studentPortal.tabQuran')}
              </button>
              <button
                onClick={() => changeTab('homework')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'homework'
                    ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
                {t('studentPortal.tabHomework')}
                {(() => {
                  const activeCount = quranHomework.filter(hw => !hw.isDone).length;
                  return activeCount > 0 ? (
                    <span className="ml-0.5 bg-violet-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {activeCount}
                    </span>
                  ) : null;
                })()}
              </button>
              <button
                onClick={() => changeTab('tajweed')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'tajweed'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                {t('studentPortal.tabTajweed')}
              </button>
              <button
                onClick={() => changeTab('qaedah')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'qaedah'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                {t('studentPortal.tabQaedah')}
              </button>
              <button
                onClick={() => changeTab('alphabetTrainer')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'alphabetTrainer'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.255 3A23.933 23.933 0 0 1 21 12c0 3.183-.62 6.22-1.745 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.89M8.25 8.885l-1.993.007a.75.75 0 0 0-.75.75v0a.75.75 0 0 0 .75.75H8.25" />
                </svg>
                {t('studentPortal.tabAlphabet')}
              </button>
              <button
                onClick={() => changeTab('lettersTrainer')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'lettersTrainer'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                {t('studentPortal.tabLetters')}
              </button>
            </div>
          </div>
        )}
      </header>

      <main dir="ltr" className={`flex-grow py-6 ${activeTab === 'quran' ? 'w-full px-2 sm:px-3' : activeTab === 'qaedah' || activeTab === 'alphabetTrainer' || activeTab === 'lettersTrainer' ? 'w-full px-2 sm:px-4' : 'container mx-auto px-3 sm:px-6 lg:px-8'}`}>
        {portalTab === 'about' ? (
          <AboutUsPage />
        ) : (
          <>
            {activeTab === 'calendar' && (
              <div className="space-y-4">
                {/* Scheduled lessons list — shown in the student's own timezone */}
                {(() => {
                  const upcoming = studentLessons
                    .filter(l => l.startAt && new Date(l.startAt).getTime() > Date.now())
                    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
                  if (upcoming.length === 0) return null;
                  const tz = studentTZ || report?.report_data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
                  const ordinal = (n: number) => {
                    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
                    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
                  };
                  const fmtT = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
                  const tzLabel = tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
                  return (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
                      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{t('studentPortal.youHaveLessons')}</p>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> {tzLabel} time
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {upcoming.map(l => {
                          const dayLabel = (() => {
                            const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: tz }).formatToParts(new Date(l.startAt));
                            const day = Number(parts.find(p => p.type === 'day')?.value ?? '1');
                            const mon = parts.find(p => p.type === 'month')?.value ?? '';
                            return `${ordinal(day)} of ${mon}`;
                          })();
                          const range = l.endAt ? `${fmtT(l.startAt)} to ${fmtT(l.endAt)}` : fmtT(l.startAt);
                          return (
                            <li key={l.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                              <span className="text-amber-500">📅</span>
                              <span className="font-semibold">{dayLabel}</span>
                              <span className="text-slate-500 dark:text-slate-400">{range}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}
                <CalendarPage
                  gcalToken={gcalToken}
                  onTokenChange={setGcalToken}
                  isStudentView={true}
                  availabilitySlots={availabilitySlots}
                  teacherId={report?.teacher_id}
                  studentId={report?.student_id}
                  studentName={report?.student_name}
                  studentTimezone={studentTZ || report?.report_data.timezone}
                  portalType="quran"
                  studentLessons={studentLessons}
                />
              </div>
            )}
            {activeTab === 'progress' && hasProgress && (() => {
              const sp = studentProgress!;
              const fakeStudent: Student = {
                id: 'shared-report',
                name: student_name,
                dob: sp.dob,
                recitationAchievements: sp.recitationAchievements,
                memorizationAchievements: sp.memorizationAchievements,
                attendance: sp.attendance as AttendanceRecord[],
                masteredTajweedRules: sp.masteredTajweedRules,
                tafsirReviews: sp.tafsirReviews,
                tafsirMemorizationReviews: sp.tafsirMemorizationReviews,
                // Real mistakes so the Mistakes-rate stat shows true numbers in
                // the portal (same source the Quran tab uses for its fakeStudent).
                mistakes: (report_data.mistakes ?? {}) as Record<string, Mistake>,
              };
              return (
                <StudentDetailPage
                  student={fakeStudent}
                  students={[fakeStudent]}
                  quranMetadata={QURAN_METADATA}
                  overrideRanks={report_data.ranks}
                  readOnly
                />
              );
            })()}
            {/* Quran stays MOUNTED (hidden when inactive) so the open surah +
                scroll position survive switching tabs. */}
            <div className={activeTab === 'quran' ? '' : 'hidden'}>
            {(() => {
              const sp = studentProgress;
              const quranFakeStudent: Student = {
                id: 'shared-report-quran',
                name: student_name,
                profileIcon: report_data.profileIcon,
                dob: sp?.dob,
                recitationAchievements: sp?.recitationAchievements ?? [],
                memorizationAchievements: sp?.memorizationAchievements ?? [],
                attendance: (sp?.attendance ?? []) as AttendanceRecord[],
                masteredTajweedRules: sp?.masteredTajweedRules ?? [],
                tafsirReviews: sp?.tafsirReviews ?? [],
                tafsirMemorizationReviews: sp?.tafsirMemorizationReviews ?? [],
                mistakes: (report_data.mistakes ?? {}) as Record<string, Mistake>,
              };
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const noop: any = () => {};
              /* eslint-enable @typescript-eslint/no-explicit-any */

              const activeHw = quranHomework.filter(hw => !hw.isDone);

              // Homework button rendered inside the student name card
              const firstHw = activeHw[0];
              const homeworkBadge = activeHw.length > 0 ? (
                <button
                  onClick={() => {
                    setHomeworkModal(firstHw);
                    setHomeworkJumpKey(`${firstHw.startSurah}:${firstHw.startAyah}`);
                    setShowHistory(false);
                    setNoteVisible(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 border-2 border-teal-300 dark:border-teal-600 text-teal-700 dark:text-teal-300 text-sm font-bold shadow-sm animate-pulse hover:animate-none hover:bg-teal-100 dark:hover:bg-teal-800/50 transition-colors"
                >
                  📝 Homework
                  {activeHw.length > 1 && (
                    <span className="bg-teal-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {activeHw.length}
                    </span>
                  )}
                </button>
              ) : null;

              // Helper: format a homework range as a readable string
              const formatRange = (hw: QuranHomework) => {
                const startName = QURAN_METADATA.find(s => s.number === hw.startSurah)?.transliteratedName ?? `Surah ${hw.startSurah}`;
                const endName   = QURAN_METADATA.find(s => s.number === hw.endSurah)?.transliteratedName   ?? `Surah ${hw.endSurah}`;
                if (hw.startSurah === hw.endSurah && hw.startAyah === hw.endAyah) return `${startName} : ${hw.startAyah}`;
                return `${startName} ${hw.startAyah} → ${endName} ${hw.endAyah}`;
              };

              const activeHwList  = quranHomework.filter(hw => !hw.isDone);
              const doneHwList    = quranHomework.filter(hw =>  hw.isDone);

              return (
                <div className="relative">
                  <StudentProgressPage
                    readOnly
                    externalBuzzTrigger={buzzTrigger}
                    focusedLetterKey={focusedLetterKey}
                    cursorLetterKey={cursorLetterKey}
                    toolbarStickyTop={156}
                    notesStudentId={report.student_id}
                    student={quranFakeStudent}
                    students={[quranFakeStudent]}
                    studentProgress={sp ? { surah: sp.recitationAchievements?.[sp.recitationAchievements.length - 1]?.endSurah ?? 1, ayah: sp.recitationAchievements?.[sp.recitationAchievements.length - 1]?.endAyah ?? 1 } : { surah: 1, ayah: 1 }}
                    studentMistakes={(report_data.mistakes ?? {}) as Record<string, Mistake>}
                    recitationAchievements={sp?.recitationAchievements ?? []}
                    memorizationAchievements={sp?.memorizationAchievements ?? []}
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
                    jumpToVerseKey={letterJumpKey ?? homeworkJumpKey}
                    nameCardExtra={homeworkBadge}
                    homeworkRanges={activeHwList}
                  />

                  {/* ── Floating homework panel ─────────────────────────── */}
                  {noteVisible && (() => {
                    return (
                      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[250] w-full max-w-sm px-3">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">

                          {/* ── Header ── */}
                          <div className="flex items-center justify-between px-4 pt-4 pb-2">
                            <div className="flex items-center gap-2">
                              {/* Tab: Active / History */}
                              <button
                                onClick={() => setShowHistory(false)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                  !showHistory
                                    ? 'bg-teal-600 text-white'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400'
                                }`}
                              >
                                📝 Homework {activeHwList.length > 0 && <span className="ml-1 bg-white/30 text-white text-[10px] font-bold rounded-full px-1">{activeHwList.length}</span>}
                              </button>
                              {doneHwList.length > 0 && (
                                <button
                                  onClick={() => setShowHistory(true)}
                                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                                    showHistory
                                      ? 'bg-slate-600 text-white'
                                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                  }`}
                                >
                                  ✅ Done ({doneHwList.length})
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => setNoteVisible(false)}
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                              title="Hide panel"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>

                          <div className="h-px bg-slate-100 dark:bg-slate-700 mx-4" />

                          {/* ── History view ── */}
                          {showHistory ? (
                            <div className="px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
                              {doneHwList.length === 0 ? (
                                <p className="text-slate-400 dark:text-slate-500 text-sm italic text-center py-2">{t('studentPortal.noCompletedYet')}</p>
                              ) : doneHwList.map(hw => (
                                <div key={hw.id} className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-700/50">
                                  <span className="text-base mt-0.5">✅</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate">{formatRange(hw)}</p>
                                    {hw.note && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{hw.note}</p>}
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{new Date(hw.assignedAt).toLocaleDateString()}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            /* ── Active homework view ── */
                            <>
                              {activeHwList.length === 0 ? (
                                <div className="px-4 py-5 text-center">
                                  <p className="text-2xl mb-1">🎉</p>
                                  <p className="text-sm font-semibold text-teal-700 dark:text-teal-400">{t('studentPortal.allDone')}</p>
                                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t('studentPortal.completedAllHomework')}</p>
                                </div>
                              ) : (
                                <>
                                  {/* Verse range + note */}
                                  {homeworkModal && (
                                    <div className="px-4 pt-3 pb-2">
                                      <p className="text-xs font-bold text-teal-700 dark:text-teal-400 mb-1">{formatRange(homeworkModal)}</p>
                                      {homeworkModal.note ? (
                                        <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                          {homeworkModal.note}
                                        </p>
                                      ) : (
                                        <p className="text-slate-400 dark:text-slate-500 text-sm italic">
                                          Practise the highlighted verses above.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Navigation chips for multiple homework items */}
                                  {activeHwList.length > 1 && (
                                    <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
                                      {activeHwList.map((hw, i) => (
                                        <button
                                          key={hw.id}
                                          onClick={() => {
                                            setHomeworkModal(hw);
                                            setHomeworkJumpKey(`${hw.startSurah}:${hw.startAyah}`);
                                          }}
                                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                                            homeworkModal?.id === hw.id
                                              ? 'bg-teal-600 text-white'
                                              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-teal-50 dark:hover:bg-teal-900/30'
                                          }`}
                                        >
                                          #{i + 1}
                                        </button>
                                      ))}
                                    </div>
                                  )}

                                  <div className="h-px bg-slate-100 dark:bg-slate-700 mx-4" />

                                  {/* Done button */}
                                  <div className="px-4 py-3">
                                    <button
                                      onClick={() => {
                                        if (!homeworkModal) return;
                                        setQuranHomework(prev => prev.map(hw => hw.id === homeworkModal.id ? { ...hw, isDone: true } : hw));
                                        const remaining = activeHwList.filter(hw => hw.id !== homeworkModal.id);
                                        if (remaining.length > 0) {
                                          setHomeworkModal(remaining[0]);
                                          setHomeworkJumpKey(`${remaining[0].startSurah}:${remaining[0].startAyah}`);
                                        } else {
                                          setHomeworkModal(null);
                                          // Keep panel open so they can see the 🎉 message and history
                                        }
                                      }}
                                      className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-sm transition-all shadow-sm"
                                    >
                                      ✅ Mark as Done
                                    </button>
                                  </div>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            </div>
            {activeTab === 'tajweed' && (
              <TajweedPage students={[]} preSelectedStudentId={report.student_id} readOnly />
            )}
            {activeTab === 'qaedah' && (
              <QaedahPage isStudentView={true} />
            )}
            {activeTab === 'alphabetTrainer' && (
              <AlphabetTrainerPage isStudentView={true} avatarSrc={report_data.profileIcon} />
            )}
            {activeTab === 'lettersTrainer' && (
              <LettersTrainerPage preSelectedStudent={{ id: report.student_id, name: report.student_name }} readOnly />
            )}

            {activeTab === 'homework' && (() => {
              const activeHw = quranHomework.filter(hw => !hw.isDone);
              const doneHw   = quranHomework.filter(hw =>  hw.isDone);

              const fmtRange = (hw: QuranHomework) => {
                const startName = QURAN_METADATA.find(s => s.number === hw.startSurah)?.transliteratedName ?? `Surah ${hw.startSurah}`;
                const endName   = QURAN_METADATA.find(s => s.number === hw.endSurah)?.transliteratedName   ?? `Surah ${hw.endSurah}`;
                if (hw.startSurah === hw.endSurah && hw.startAyah === hw.endAyah) return `${startName} : ${hw.startAyah}`;
                return `${startName} ${hw.startAyah} → ${endName} ${hw.endAyah}`;
              };

              return (
                <div className="max-w-2xl mx-auto space-y-8 py-2">

                  {/* ── Active homework ───────────────────────────────── */}
                  <section>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <span className="text-xl">📝</span>
                      {t('studentPortal.currentHomework')}
                      {activeHw.length > 0 && (
                        <span className="bg-violet-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                          {activeHw.length}
                        </span>
                      )}
                    </h2>

                    {activeHw.length === 0 ? (
                      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                        <p className="text-3xl mb-2">🎉</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{t('studentPortal.allCaughtUp')}</p>
                        <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{t('studentPortal.noPendingHomework')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeHw.map((hw, idx) => (
                          <div key={hw.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-violet-100 dark:border-violet-900/40 shadow-sm overflow-hidden">
                            {/* Purple top accent */}
                            <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                            <div className="p-4 sm:p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wide">
                                      #{idx + 1}
                                    </span>
                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                      {fmtRange(hw)}
                                    </span>
                                  </div>
                                  {hw.note ? (
                                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2 whitespace-pre-wrap bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                                      {hw.note}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1">{t('studentPortal.noInstructions')}</p>
                                  )}
                                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                                    {t('studentPortal.assignedOn', { date: new Date(hw.assignedAt).toLocaleDateString(language === 'ar' ? 'ar' : language === 'tr' ? 'tr' : undefined, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2 mt-4">
                                <button
                                  onClick={() => {
                                    setHomeworkModal(hw);
                                    setHomeworkJumpKey(`${hw.startSurah}:${hw.startAyah}`);
                                    setShowHistory(false);
                                    setNoteVisible(true);
                                    changeTab('quran');
                                  }}
                                  className="flex-1 py-2 px-3 rounded-xl bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-sm font-semibold border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                                >
                                  📖 {t('studentPortal.goToVerses')}
                                </button>
                                <button
                                  onClick={() => {
                                    setQuranHomework(prev => prev.map(h => h.id === hw.id ? { ...h, isDone: true } : h));
                                    const remaining = activeHw.filter(h => h.id !== hw.id);
                                    if (remaining.length > 0 && homeworkModal?.id === hw.id) {
                                      setHomeworkModal(remaining[0]);
                                      setHomeworkJumpKey(`${remaining[0].startSurah}:${remaining[0].startAyah}`);
                                    } else if (remaining.length === 0) {
                                      setHomeworkModal(null);
                                      setNoteVisible(false);
                                    }
                                  }}
                                  className="py-2 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-sm transition-all shadow-sm"
                                >
                                  ✅ {t('studentPortal.markDone')}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* ── Completed history ─────────────────────────────── */}
                  <section>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <span className="text-xl">✅</span>
                      {t('studentPortal.completed')}
                      {doneHw.length > 0 && (
                        <span className="bg-slate-400 dark:bg-slate-600 text-white text-xs font-bold rounded-full px-2 py-0.5">
                          {doneHw.length}
                        </span>
                      )}
                    </h2>

                    {doneHw.length === 0 ? (
                      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                        <p className="text-sm text-slate-400 dark:text-slate-500 italic">{t('studentPortal.completedWillAppear')}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {doneHw.map((hw, idx) => (
                          <div key={hw.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden opacity-80">
                            <div className="h-1 bg-gradient-to-r from-teal-400 to-emerald-400" />
                            <div className="p-4 sm:p-5 flex items-start gap-3">
                              <span className="text-xl mt-0.5 flex-shrink-0">✅</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                                    #{doneHw.length - idx}
                                  </span>
                                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300 line-through decoration-slate-300 dark:decoration-slate-600">
                                    {fmtRange(hw)}
                                  </span>
                                </div>
                                {hw.note && (
                                  <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1 truncate">{hw.note}</p>
                                )}
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                                  Assigned {new Date(hw.assignedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                </div>
              );
            })()}

            <footer className="text-center text-xs text-slate-400 dark:text-slate-600 py-8">
              <p>Generated by Lisan &amp; Quran · {new Date(generatedAt).toLocaleString()}</p>
            </footer>
          </>
        )}
      </main>

    </div>
  );
};

export default SharedReportPage;
