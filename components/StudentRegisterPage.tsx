// components/StudentRegisterPage.tsx
// Public student self-registration wizard (route: /join).
// Google sign-in → details → subject(s) → per-subject onboarding → pick tutor →
// "pending tutor confirmation". Themed (light/dark/reading) + EN/AR/TR.

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../context/I18nProvider';
import SearchableTimezone from './SearchableTimezone';
import Logo from './Logo';
import { listTutors } from '../services/tutorDirectoryService';
import {
  markProfileAsStudent, getMyStudentRecords,
  registerQuranStudent, registerArabicStudent, notifyTutorOfJoinRequest,
} from '../services/studentRegistrationService';
import { TutorDirectoryEntry } from '../types';

type AppTheme = 'light' | 'dark' | 'reading';
type Step = 'signin' | 'details' | 'subjects' | 'quran' | 'arabic' | 'tutor' | 'submitting' | 'done' | 'already';

const QURAN_FOCUS = ['qaedah', 'recitation_fluency', 'basic_reading', 'advanced_tajweed', 'ijazah'] as const;
const QURAN_ADDONS = ['aqeedah', 'seerah', 'fiqh', 'tafseer'] as const;
const ARABIC_LEVELS = ['beginner', 'elementary', 'intermediate', 'advanced'] as const;
const ARABIC_DIALECTS = ['msa', 'levantine', 'quranic'] as const;
const ARABIC_PURPOSES = ['quran', 'conversation', 'work', 'travel', 'study', 'religion'] as const;

const StudentRegisterPage: React.FC = () => {
  const { t, language, setLanguage } = useI18n();

  // ── Theme (light / dark / reading), mirrors the student portals ──
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

  // ── Auth / flow state ──
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail]   = useState('');
  const [step, setStep]     = useState<Step>('signin');
  const [loading, setLoading] = useState(true);

  // ── Form state ──
  const [firstName, setFirstName] = useState('');
  const [yearOfBirth, setYearOfBirth] = useState('');
  const [timezone, setTimezone] = useState('');
  const [wantQuran, setWantQuran] = useState(false);
  const [wantArabic, setWantArabic] = useState(false);
  // Quran
  const [qForSelf, setQForSelf] = useState(true);
  const [qForWhom, setQForWhom] = useState('');
  const [qPerWeek, setQPerWeek] = useState(2);
  const [qLevel, setQLevel]     = useState(1);
  const [qFocus, setQFocus]     = useState<string[]>([]);
  const [qAddons, setQAddons]   = useState<string[]>([]);
  // Arabic
  const [aLevel, setALevel] = useState<string>('beginner');
  const [aDialects, setADialects] = useState<string[]>([]);
  const [aPurposes, setAPurposes] = useState<string[]>([]);
  const [aTopics, setATopics] = useState('');
  const [aNationality, setANationality] = useState('');
  // Tutor
  const [tutors, setTutors] = useState<TutorDirectoryEntry[]>([]);
  const [tutorId, setTutorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On mount: check session + existing records.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) { setStep('signin'); setLoading(false); return; }
      setUserId(u.id);
      setEmail(u.email ?? '');
      const meta = u.user_metadata ?? {};
      setFirstName(prev => prev || (meta.name || meta.full_name || '').split(' ')[0] || '');
      const recs = await getMyStudentRecords(u.id);
      if (recs.quran || recs.arabic) { setStep('already'); setLoading(false); return; }
      setStep('details'); setLoading(false);
    })();
  }, []);

  const signIn = async () => {
    localStorage.setItem('lq_role_intent', 'student');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/join`, queryParams: { prompt: 'select_account' } },
    });
  };

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const goToTutor = async () => {
    setTutors(await listTutors());
    setStep('tutor');
  };

  const submit = async () => {
    if (!userId || !tutorId) return;
    setStep('submitting'); setError(null);
    try {
      const yob = parseInt(yearOfBirth, 10);
      await markProfileAsStudent(userId, firstName || email.split('@')[0]);
      if (wantQuran) {
        await registerQuranStudent({
          authUserId: userId, tutorId, name: firstName, yearOfBirth: yob, timezone,
          onboarding: { lessonsForSelf: qForSelf, lessonsForWhom: qForSelf ? undefined : qForWhom, lessonsPerWeek: qPerWeek, quranLevel: qLevel, studyFocus: qFocus, studyAddons: qAddons },
        });
      }
      if (wantArabic) {
        await registerArabicStudent({
          authUserId: userId, tutorId, name: firstName, yearOfBirth: yob, timezone,
          arabic: { forSelf: qForSelf, arabicLevel: aLevel, arabicDialects: aDialects as any, learningPurposes: aPurposes, topicsToFocus: aTopics ? aTopics.split(',').map(s => s.trim()).filter(Boolean) : [], nationality: aNationality },
        });
      }
      const subjects = [wantArabic && t('register.arabic'), wantQuran && t('register.quran')].filter(Boolean) as string[];
      await notifyTutorOfJoinRequest(tutorId, firstName, subjects);
      setStep('done');
    } catch (e: any) {
      console.error('[register] failed:', e);
      setError(t('register.error'));
      setStep('tutor');
    }
  };

  // ── shared styles ──
  const card = 'bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm';
  const input = 'w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400';
  const label = 'block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5';
  const primaryBtn = 'px-5 py-2.5 rounded-xl text-sm font-bold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors';
  const ghostBtn = 'px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors';
  const chip = (active: boolean) => `px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-gray-600 hover:border-teal-400'}`;

  const detailsValid = firstName.trim() && /^\d{4}$/.test(yearOfBirth) && timezone;
  const subjectsValid = wantQuran || wantArabic;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-200 flex flex-col" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <a href="/" aria-label="Home"><Logo /></a>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-gray-700 rounded-lg" dir="ltr">
              {(['en', 'ar', 'tr'] as const).map(l => (
                <button key={l} onClick={() => setLanguage(l)} className={`px-2 py-1 text-[11px] rounded-md font-bold ${language === l ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-400 shadow' : 'text-slate-500 dark:text-slate-400'}`}>{l.toUpperCase()}</button>
              ))}
            </div>
            <button onClick={cycleTheme} aria-label="Theme" className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700">
              {theme === 'dark' ? '🌙' : theme === 'reading' ? '📖' : '☀️'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" /></div>
        ) : step === 'signin' ? (
          <div className={`${card} p-8 text-center`}>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('register.welcomeTitle')}</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">{t('register.welcomeSub')}</p>
            <button onClick={signIn} className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 font-bold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {t('register.signInGoogle')}
            </button>
          </div>
        ) : step === 'already' ? (
          <div className={`${card} p-8 text-center`}>
            <p className="text-4xl mb-3">👋</p>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t('register.alreadyTitle')}</h1>
            <p className="mt-2 text-slate-500 dark:text-slate-400">{t('register.alreadySub')}</p>
            <a href="/" className={`${primaryBtn} inline-block mt-5`}>{t('register.goHome')}</a>
          </div>
        ) : step === 'details' ? (
          <div className={`${card} p-6 sm:p-8 space-y-5`}>
            <div><p className="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{t('register.step1')}</p><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{t('register.detailsTitle')}</h1></div>
            <div><label className={label}>{t('register.firstName')}</label><input className={input} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder={t('register.firstName')} /></div>
            <div><label className={label}>{t('register.yearOfBirth')}</label><input className={input} value={yearOfBirth} onChange={e => setYearOfBirth(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="2005" /></div>
            <div><label className={label}>{t('register.timezone')}</label><SearchableTimezone value={timezone} onChange={setTimezone} className={input} /></div>
            <div className="flex justify-end"><button disabled={!detailsValid} onClick={() => setStep('subjects')} className={primaryBtn}>{t('register.next')}</button></div>
          </div>
        ) : step === 'subjects' ? (
          <div className={`${card} p-6 sm:p-8 space-y-5`}>
            <div><p className="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{t('register.step2')}</p><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{t('register.subjectsTitle')}</h1><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('register.subjectsSub')}</p></div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setWantArabic(v => !v)} className={`rounded-2xl border-2 p-6 text-center transition-all ${wantArabic ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-gray-700 hover:border-amber-300'}`}>
                <div className="text-3xl mb-2" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</div>
                <div className="font-bold">{t('register.arabic')}</div>{wantArabic && <div className="text-amber-600 text-sm mt-1">✓</div>}
              </button>
              <button onClick={() => setWantQuran(v => !v)} className={`rounded-2xl border-2 p-6 text-center transition-all ${wantQuran ? 'border-teal-400 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-gray-700 hover:border-teal-300'}`}>
                <div className="text-3xl mb-2">📖</div>
                <div className="font-bold">{t('register.quran')}</div>{wantQuran && <div className="text-teal-600 text-sm mt-1">✓</div>}
              </button>
            </div>
            <div className="flex justify-between"><button onClick={() => setStep('details')} className={ghostBtn}>{t('register.back')}</button><button disabled={!subjectsValid} onClick={() => setStep(wantArabic ? 'arabic' : 'quran')} className={primaryBtn}>{t('register.next')}</button></div>
          </div>
        ) : step === 'arabic' ? (
          <div className={`${card} p-6 sm:p-8 space-y-5`}>
            <div><p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">{t('register.arabicStepLabel')}</p><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{t('register.arabicTitle')}</h1></div>
            <div><label className={label}>{t('register.arabicLevel')}</label><div className="flex flex-wrap gap-2">{ARABIC_LEVELS.map(l => <button key={l} className={chip(aLevel === l)} onClick={() => setALevel(l)}>{t(`register.level_${l}`)}</button>)}</div></div>
            <div><label className={label}>{t('register.dialects')}</label><div className="flex flex-wrap gap-2">{ARABIC_DIALECTS.map(d => <button key={d} className={chip(aDialects.includes(d))} onClick={() => toggle(aDialects, d, setADialects)}>{t(`register.dialect_${d}`)}</button>)}</div></div>
            <div><label className={label}>{t('register.purposes')}</label><div className="flex flex-wrap gap-2">{ARABIC_PURPOSES.map(p => <button key={p} className={chip(aPurposes.includes(p))} onClick={() => toggle(aPurposes, p, setAPurposes)}>{t(`register.purpose_${p}`)}</button>)}</div></div>
            <div><label className={label}>{t('register.topics')}</label><input className={input} value={aTopics} onChange={e => setATopics(e.target.value)} placeholder={t('register.topicsPlaceholder')} /></div>
            <div><label className={label}>{t('register.nationality')}</label><input className={input} value={aNationality} onChange={e => setANationality(e.target.value)} /></div>
            <div className="flex justify-between"><button onClick={() => setStep('subjects')} className={ghostBtn}>{t('register.back')}</button><button onClick={() => wantQuran ? setStep('quran') : goToTutor()} className={primaryBtn}>{t('register.next')}</button></div>
          </div>
        ) : step === 'quran' ? (
          <div className={`${card} p-6 sm:p-8 space-y-5`}>
            <div><p className="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{t('register.quranStepLabel')}</p><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{t('register.quranTitle')}</h1></div>
            <div>
              <label className={label}>{t('register.lessonsFor')}</label>
              <div className="flex gap-2">
                <button className={chip(qForSelf)} onClick={() => setQForSelf(true)}>{t('register.forMyself')}</button>
                <button className={chip(!qForSelf)} onClick={() => setQForSelf(false)}>{t('register.forSomeoneElse')}</button>
              </div>
              {!qForSelf && <input className={`${input} mt-2`} value={qForWhom} onChange={e => setQForWhom(e.target.value)} placeholder={t('register.forWhomPlaceholder')} />}
            </div>
            <div><label className={label}>{t('register.lessonsPerWeek')}</label><input type="number" min={1} max={14} className={input} value={qPerWeek} onChange={e => setQPerWeek(Math.max(1, Math.min(14, Number(e.target.value) || 1)))} /></div>
            <div>
              <label className={label}>{t('register.level')} <span className="text-teal-600 font-bold">{qLevel}/10</span></label>
              <input type="range" min={1} max={10} value={qLevel} onChange={e => setQLevel(Number(e.target.value))} className="w-full accent-teal-600" />
            </div>
            <div><label className={label}>{t('register.whatToStudy')}</label><div className="flex flex-wrap gap-2">{QURAN_FOCUS.map(f => <button key={f} className={chip(qFocus.includes(f))} onClick={() => toggle(qFocus, f, setQFocus)}>{t(`register.focus_${f}`)}</button>)}</div></div>
            <div><label className={label}>{t('register.wantToAdd')}</label><div className="flex flex-wrap gap-2">{QURAN_ADDONS.map(a => <button key={a} className={chip(qAddons.includes(a))} onClick={() => toggle(qAddons, a, setQAddons)}>{t(`register.addon_${a}`)}</button>)}</div></div>
            <div className="flex justify-between"><button onClick={() => setStep(wantArabic ? 'arabic' : 'subjects')} className={ghostBtn}>{t('register.back')}</button><button onClick={goToTutor} className={primaryBtn}>{t('register.next')}</button></div>
          </div>
        ) : step === 'tutor' || step === 'submitting' ? (
          <div className={`${card} p-6 sm:p-8 space-y-5`}>
            <div><p className="text-xs font-bold uppercase tracking-wide text-teal-600 dark:text-teal-400">{t('register.lastStep')}</p><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{t('register.chooseTutor')}</h1></div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tutors.length === 0 ? <p className="text-sm text-slate-400">{t('register.noTutors')}</p> : tutors.map(tu => (
                <button key={tu.id} onClick={() => setTutorId(tu.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl border text-start transition-colors ${tutorId === tu.id ? 'border-teal-500 ring-2 ring-teal-500/30 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-gray-700 hover:border-teal-300'}`}>
                  {tu.photoUrl ? <img src={tu.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center font-bold text-teal-700 dark:text-teal-300">{tu.name.charAt(0).toUpperCase()}</div>}
                  <div className="min-w-0 flex-1"><p className="font-bold text-slate-800 dark:text-slate-100 truncate">{tu.name}</p><p className="text-xs text-slate-400">{t('register.arabic')} · {t('register.quran')}</p></div>
                  {tutorId === tu.id && <span className="text-teal-600">✓</span>}
                </button>
              ))}
            </div>
            <div className="flex justify-between"><button onClick={() => setStep(wantQuran ? 'quran' : 'arabic')} className={ghostBtn}>{t('register.back')}</button><button disabled={!tutorId || step === 'submitting'} onClick={submit} className={primaryBtn}>{step === 'submitting' ? t('register.submitting') : t('register.finish')}</button></div>
          </div>
        ) : ( // done
          <div className={`${card} p-8 text-center`}>
            <p className="text-5xl mb-3">🎉</p>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t('register.doneTitle')}</h1>
            <p className="mt-3 text-slate-500 dark:text-slate-400 leading-relaxed">{t('register.doneSub')}</p>
            <a href="/" className={`${primaryBtn} inline-block mt-6`}>{t('register.goHome')}</a>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentRegisterPage;
