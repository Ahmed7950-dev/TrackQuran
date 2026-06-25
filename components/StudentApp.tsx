// components/StudentApp.tsx
// The home of a self-registered, signed-in student. Recognised by AuthProvider
// (profiles.role='student'), they land here instead of the teacher workspace.
//   • active        → their Quran and/or Arabic portal (no shareable link needed)
//   • both active   → one portal with a switch button to the other
//   • pending       → "waiting for your tutor to confirm" screen
//   • rejected      → "request not accepted" screen
// Themed (light/dark/reading) + EN/AR/TR, matching the rest of the site.

import React, { useEffect, useState } from 'react';
import { StudentUser } from '../types';
import { useI18n } from '../context/I18nProvider';
import SharedReportPage from './SharedReportPage';
import ArabicStudentPortal from './ArabicStudentPortal';

type AppTheme = 'light' | 'dark' | 'reading';
const LANGS = ['en', 'ar', 'tr'] as const;

const StudentApp: React.FC<{ user: StudentUser; onLogout: () => void }> = ({ user, onLogout }) => {
  const { t, language, setLanguage } = useI18n();

  // ── Theme (mirrors the student portals & registration wizard) ──
  const [theme, setTheme] = useState<AppTheme>(() => {
    const s = localStorage.getItem('theme');
    if (s === 'light' || s === 'dark' || s === 'reading') return s;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark'); root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'reading') root.setAttribute('data-theme', 'reading');
    localStorage.setItem('theme', theme);
  }, [theme]);
  const cycleTheme = () => setTheme(p => p === 'light' ? 'dark' : p === 'dark' ? 'reading' : 'light');

  // A subject only renders its portal once the tutor confirmed it AND its
  // portal source (shared report / share token) exists.
  const activeQuran  = user.quran?.approval === 'active' && !!user.quran.reportId;
  const activeArabic = user.arabic?.approval === 'active' && !!user.arabic.shareToken;

  // Which portal is showing when the student has both subjects active.
  const [view, setView] = useState<'quran' | 'arabic'>(activeQuran ? 'quran' : 'arabic');

  if (activeQuran && activeArabic) {
    return view === 'quran' ? (
      <SharedReportPage
        reportId={user.quran!.reportId!}
        switchPortal={{ label: 'العربية', onSwitch: () => setView('arabic') }}
        onLogout={onLogout}
      />
    ) : (
      <ArabicStudentPortal
        token={user.arabic!.shareToken!}
        switchPortal={{ label: 'Quran', onSwitch: () => setView('quran') }}
        onLogout={onLogout}
      />
    );
  }
  if (activeQuran)  return <SharedReportPage reportId={user.quran!.reportId!} onLogout={onLogout} />;
  if (activeArabic) return <ArabicStudentPortal token={user.arabic!.shareToken!} onLogout={onLogout} />;

  // ── No portal to show yet: pending / setting-up / rejected ──
  const subjects = [user.quran, user.arabic].filter(Boolean) as NonNullable<StudentUser['quran']>[];
  const anyConfirmed = subjects.some(s => s.approval === 'active'); // confirmed but portal not ready yet
  const anyPending   = subjects.some(s => s.approval === 'pending');
  const status: 'settingUp' | 'pending' | 'rejected' =
    anyConfirmed ? 'settingUp' : anyPending ? 'pending' : 'rejected';

  const titleKey = `register.${status}Title`;
  const subKey   = `register.${status}Sub`;
  const emoji = status === 'settingUp' ? '🎉' : status === 'pending' ? '⏳' : '🙏';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-200 flex flex-col" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-extrabold text-teal-700 dark:text-orange-400">LisanQuran</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-gray-700 rounded-lg" dir="ltr">
              {LANGS.map(l => (
                <button key={l} onClick={() => setLanguage(l)} className={`px-2 py-1 text-[11px] rounded-md font-bold ${language === l ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-400 shadow' : 'text-slate-500 dark:text-slate-400'}`}>{l.toUpperCase()}</button>
              ))}
            </div>
            <button onClick={cycleTheme} aria-label="Theme" className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700">
              {theme === 'dark' ? '🌙' : theme === 'reading' ? '📖' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm p-8">
          <div className="text-5xl mb-4">{emoji}</div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t(titleKey)}</h1>
          <p className="mt-3 text-slate-500 dark:text-slate-400">{t(subKey)}</p>
          {user.name && <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">{user.name}{user.email ? ` · ${user.email}` : ''}</p>}
          <div className="mt-6 flex items-center justify-center gap-3">
            {status === 'rejected' && (
              <a href="/join" className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
                {t('register.registerAgain')}
              </a>
            )}
            <button onClick={onLogout} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
              {t('register.signOut')}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentApp;
