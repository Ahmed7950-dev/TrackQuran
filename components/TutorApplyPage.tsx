// components/TutorApplyPage.tsx
// ---------------------------------------------------------------------------
// /teach — "Be a tutor with us". The site is one school: students sign up at
// /join, tutors apply here, and the admin approves them in the admin panel.
//
//   1. no account      → create one (Google, or e-mail and password) or sign in
//   2. tutor account   → the application form (tutor_applications)
//   3. sent            → "application received", with Edit
//   4. approved        → a button into the tutor dashboard
//
// The account is an ordinary teacher profile that stays inert
// (profiles.approved = false, PendingApprovalPage) until the admin lets it in;
// only the admin can change `approved` (guard_profile_privileges trigger).
// Styled like the landing page and follows the same four looks.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthProvider';
import { useI18n } from '../context/I18nProvider';
import { AppTheme, applyTheme, readTheme, nextTheme } from '../utils/theme';
import { landingPalette } from '../utils/landingPalette';
import ThemeIcon from './ThemeIcon';
import {
  TutorApplication, EnglishLevel, getMyApplication, saveMyApplication,
} from '../services/tutorApplicationService';

const F = {
  body: "'DM Sans', sans-serif",
  display: "'Cormorant Garamond', serif",
  arabic: "'Amiri', 'Amiri Regular', serif",
};

const ENGLISH: EnglishLevel[] = ['basic', 'good', 'fluent', 'native'];

const blankApp = (userId: string, name: string, email: string): TutorApplication => ({
  userId, fullName: name, email, phone: '', country: '', gender: '', nativeLanguage: '',
  englishLevel: '', yearsTeaching: null, ijazah: '', teachesKids: false, about: '', sampleUrl: '',
});

const TutorApplyPage: React.FC = () => {
  const { t, language, setLanguage } = useI18n();
  const { currentUser, loading: authLoading, logout } = useAuth();
  const isRtl = language === 'ar';

  const [theme, setTheme] = useState<AppTheme>(readTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const P = landingPalette(theme);

  // ── Account step ──
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);

  // ── Application step ──
  const [app, setApp] = useState<TutorApplication | null>(null);
  const [saved, setSaved] = useState<TutorApplication | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const teacher = currentUser && currentUser.role !== 'student' ? currentUser : null;

  useEffect(() => {
    if (!teacher) return;
    let stale = false;
    setAppLoading(true);
    getMyApplication(teacher.id)
      .then(found => {
        if (stale) return;
        setSaved(found);
        setApp(found ?? blankApp(teacher.id, teacher.name, teacher.email));
        setEditing(!found);
      })
      .catch(e => { if (!stale) setFormError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!stale) setAppLoading(false); });
    return () => { stale = true; };
  }, [teacher?.id]);

  const google = async () => {
    setAuthError('');
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/teach`, queryParams: { prompt: 'select_account' } },
    });
  };

  const submitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    try {
      if (mode === 'create') {
        if (!name.trim()) { setAuthError(t('teach.required')); return; }
        if (password.length < 6) { setAuthError(t('teach.passwordShort')); return; }
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/teach` },
        });
        if (error) { setAuthError(error.message); return; }
        if (!data.session) setCheckEmail(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setAuthError(error.message);
      }
    } finally { setAuthBusy(false); }
  };

  const set = <K extends keyof TutorApplication>(k: K, v: TutorApplication[K]) =>
    setApp(prev => (prev ? { ...prev, [k]: v } : prev));

  const sendApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app) return;
    setFormError('');
    if (!app.fullName.trim() || !app.phone.trim() || !app.country.trim() || !app.gender
      || !app.englishLevel || app.yearsTeaching === null) {
      setFormError(t('teach.required'));
      return;
    }
    setSaving(true);
    try {
      const done = await saveMyApplication(app);
      setSaved(done); setApp(done); setEditing(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  };

  // ── Shared styles ──
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: P.muted, marginBottom: 6, letterSpacing: '0.03em' };
  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10,
    border: `1.5px solid ${P.border}`, background: P.input, color: P.text, fontSize: 14,
    fontFamily: F.body, outline: 'none',
  };
  const primaryBtn = (busy = false): React.CSSProperties => ({
    width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: busy ? 'wait' : 'pointer',
    background: P.accent, color: P.onAccent, fontSize: 15, fontWeight: 700, fontFamily: F.body,
    boxShadow: `0 8px 22px ${P.accentShadow}`, opacity: busy ? 0.7 : 1,
  });
  const ghostBtn: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: 12, border: `1.5px solid ${P.border}`, background: 'transparent',
    color: P.text, fontSize: 14, fontWeight: 700, fontFamily: F.body, cursor: 'pointer',
  };
  const req = <span style={{ color: P.gold }}> *</span>;
  const opt = <span style={{ fontWeight: 500, opacity: 0.75 }}> ({t('teach.optional')})</span>;
  const errorBox = (msg: string) => msg && (
    <div role="alert" style={{ background: 'rgba(220,38,38,0.09)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: theme === 'dark' || theme === 'amber' ? '#FCA5A5' : '#B91C1C' }}>
      {msg}
    </div>
  );
  const choice = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, fontFamily: F.body,
    border: `1.5px solid ${active ? P.accent : P.border}`, background: active ? P.chipBg : P.input,
    color: active ? P.chipText : P.text,
  });

  const perks = useMemo(() => [1, 2, 3].map(n => ({ title: t(`teach.perk${n}Title`), desc: t(`teach.perk${n}Desc`) })), [t]);

  // ── The card on the right: whichever step the visitor is on ──
  let card: React.ReactNode;
  if (authLoading || (teacher && (appLoading || !app))) {
    card = <p style={{ textAlign: 'center', color: P.muted, padding: '40px 0' }}>…</p>;
  } else if (currentUser?.role === 'student') {
    card = (
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: P.heading, margin: '0 0 10px' }}>{t('teach.studentTitle')}</h2>
        <p style={{ color: P.muted, fontSize: 14, lineHeight: 1.6, margin: '0 0 22px' }}>{t('teach.studentSub')}</p>
        <button style={ghostBtn} onClick={logout}>{t('teach.signOut')}</button>
      </div>
    );
  } else if (!teacher) {
    card = checkEmail ? (
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>✉️</div>
        <p style={{ color: P.text, fontSize: 15, lineHeight: 1.6, margin: '0 0 18px' }}>{t('teach.checkEmail')}</p>
        <button style={ghostBtn} onClick={() => { setCheckEmail(false); setMode('signin'); }}>{t('teach.signIn')}</button>
      </div>
    ) : (
      <>
        <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: P.heading, margin: '0 0 18px' }}>
          {mode === 'create' ? t('teach.step1') : t('teach.signIn')}
        </h2>
        <button onClick={google} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: P.input }}>
          <svg width="18" height="18" viewBox="0 0 488 512" aria-hidden="true"><path fill="#4285F4" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 261.8 0 120.5 109.8 11.8 244 11.8c70.4 0 129.5 27.1 175.4 69.1l-63.1 61.9C333.1 119.3 293.8 98.2 244 98.2c-76.4 0-138.3 61.9-138.3 138.3s61.9 138.3 138.3 138.3c88.1 0 112.3-63.7 115.5-98.2H244v-72h244z"/></svg>
          {t('teach.google')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: P.border }} />
          <span style={{ fontSize: 12, color: P.muted }}>{t('teach.or')}</span>
          <div style={{ flex: 1, height: 1, background: P.border }} />
        </div>
        <form onSubmit={submitAccount} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'create' && (
            <div>
              <label style={label} htmlFor="ta-name">{t('teach.name')}</label>
              <input id="ta-name" style={input} value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
            </div>
          )}
          <div>
            <label style={label} htmlFor="ta-email">{t('teach.email')}</label>
            <input id="ta-email" type="email" style={input} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div>
            <label style={label} htmlFor="ta-pass">{t('teach.password')}</label>
            <input id="ta-pass" type="password" style={input} value={password} onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'} required />
          </div>
          {errorBox(authError)}
          <button type="submit" disabled={authBusy} style={primaryBtn(authBusy)}>
            {authBusy ? '…' : mode === 'create' ? t('teach.createAccount') : t('teach.signIn')}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 13.5, color: P.muted, margin: '18px 0 0' }}>
          {mode === 'create' ? t('teach.haveAccount') : t('teach.newHere')}{' '}
          <button onClick={() => { setMode(mode === 'create' ? 'signin' : 'create'); setAuthError(''); }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: P.outline, fontWeight: 700, fontSize: 13.5, fontFamily: F.body, textDecoration: 'underline' }}>
            {mode === 'create' ? t('teach.signIn') : t('teach.createOne')}
          </button>
        </p>
      </>
    );
  } else if (teacher.role === 'admin' || teacher.approved) {
    card = (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
        <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: P.heading, margin: '0 0 20px' }}>{t('teach.approvedTitle')}</h2>
        <a href="/" style={{ ...primaryBtn(), display: 'block', textDecoration: 'none', boxSizing: 'border-box' }}>{t('teach.openDashboard')}</a>
      </div>
    );
  } else if (saved && !editing) {
    card = (
      <div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: P.chipBg, color: P.chipText, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </div>
          <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: P.heading, margin: '0 0 8px' }}>{t('teach.receivedTitle')}</h2>
          <p style={{ color: P.muted, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{t('teach.receivedSub')}</p>
        </div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', fontSize: 13.5, background: P.alt, borderRadius: 12, padding: '14px 16px', margin: '0 0 18px' }}>
          {([
            [t('teach.name'), saved.fullName],
            [t('teach.phone'), saved.phone],
            [t('teach.country'), saved.country],
            [t('teach.years'), saved.yearsTeaching ?? ''],
            [t('teach.ijazah'), saved.ijazah || '—'],
          ] as [string, string | number][]).map(([k, v]) => (
            <React.Fragment key={k}>
              <dt style={{ color: P.muted, fontWeight: 600 }}>{k}</dt>
              <dd style={{ margin: 0, color: P.text, fontWeight: 600, overflowWrap: 'anywhere' }}>{v}</dd>
            </React.Fragment>
          ))}
        </dl>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={ghostBtn} onClick={() => setEditing(true)}>{t('teach.edit')}</button>
          <button style={ghostBtn} onClick={logout}>{t('teach.signOut')}</button>
        </div>
      </div>
    );
  } else if (app) {
    card = (
      <form onSubmit={sendApplication} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: P.heading, margin: 0 }}>{t('teach.step2')}</h2>
        <div className="ta-two">
          <div>
            <label style={label} htmlFor="ta-full">{t('teach.name')}{req}</label>
            <input id="ta-full" style={input} value={app.fullName} onChange={e => set('fullName', e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label style={label} htmlFor="ta-phone">{t('teach.phone')}{req}</label>
            <input id="ta-phone" style={input} value={app.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" inputMode="tel" dir="ltr" />
          </div>
        </div>
        <div className="ta-two">
          <div>
            <label style={label} htmlFor="ta-country">{t('teach.country')}{req}</label>
            <input id="ta-country" style={input} value={app.country} onChange={e => set('country', e.target.value)} autoComplete="country-name" />
          </div>
          <div>
            <label style={label} htmlFor="ta-native">{t('teach.nativeLanguage')}</label>
            <input id="ta-native" style={input} value={app.nativeLanguage} onChange={e => set('nativeLanguage', e.target.value)} />
          </div>
        </div>
        <div>
          <span style={label}>{t('teach.gender')}{req}</span>
          <div style={{ display: 'flex', gap: 8 }} role="group" aria-label={t('teach.gender')}>
            {(['male', 'female'] as const).map(g => (
              <button type="button" key={g} style={choice(app.gender === g)} aria-pressed={app.gender === g} onClick={() => set('gender', g)}>
                {t(`teach.${g}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span style={label}>{t('teach.english')}{req}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label={t('teach.english')}>
            {ENGLISH.map(l => (
              <button type="button" key={l} style={{ ...choice(app.englishLevel === l), minWidth: 80 }} aria-pressed={app.englishLevel === l} onClick={() => set('englishLevel', l)}>
                {t(`teach.english_${l}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="ta-two">
          <div>
            <label style={label} htmlFor="ta-years">{t('teach.years')}{req}</label>
            <input id="ta-years" type="number" min={0} max={80} inputMode="numeric" style={input}
              value={app.yearsTeaching ?? ''} onChange={e => set('yearsTeaching', e.target.value === '' ? null : Math.max(0, Math.min(80, Number(e.target.value))))} />
          </div>
          <div>
            <label style={label} htmlFor="ta-ijazah">{t('teach.ijazah')}{opt}</label>
            <input id="ta-ijazah" style={input} value={app.ijazah} placeholder={t('teach.ijazahHint')} onChange={e => set('ijazah', e.target.value)} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: P.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={app.teachesKids} onChange={e => set('teachesKids', e.target.checked)}
            style={{ width: 18, height: 18, accentColor: P.accent }} />
          {t('teach.kids')}
        </label>
        <div>
          <label style={label} htmlFor="ta-about">{t('teach.about')}{opt}</label>
          <textarea id="ta-about" rows={4} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} value={app.about}
            placeholder={t('teach.aboutHint')} onChange={e => set('about', e.target.value)} />
        </div>
        <div>
          <label style={label} htmlFor="ta-sample">{t('teach.sample')}{opt}</label>
          <input id="ta-sample" type="url" style={input} value={app.sampleUrl} placeholder={t('teach.sampleHint')} dir="ltr"
            onChange={e => set('sampleUrl', e.target.value)} />
        </div>
        {errorBox(formError)}
        <button type="submit" disabled={saving} style={primaryBtn(saving)}>
          {saving ? t('teach.sending') : saved ? t('teach.save') : t('teach.submit')}
        </button>
        {saved
          ? <button type="button" style={ghostBtn} onClick={() => { setApp(saved); setEditing(false); setFormError(''); }}>{t('teach.cancel')}</button>
          : <button type="button" style={{ ...ghostBtn, border: 'none', fontWeight: 600, color: P.muted }} onClick={logout}>{t('teach.signOut')}</button>}
      </form>
    );
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: P.bg, color: P.text, fontFamily: F.body }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: P.nav, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: `1px solid ${P.border}` }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 20px', height: 64, display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" aria-label={t('teach.navHome')} style={{ display: 'flex' }}>
            <img src={P.darkLogo ? '/TQ LOGO DM.png' : '/TQ LOGO.png'} alt="Lisan & Quran" style={{ height: 50, width: 'auto' }} />
          </a>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 2, background: P.chipBg, borderRadius: 8, padding: '3px 4px' }}>
            {(['en', 'ar', 'tr'] as const).map(l => (
              <button key={l} onClick={() => setLanguage(l)} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F.body, background: language === l ? P.accent : 'transparent', color: language === l ? P.onAccent : P.muted }}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={() => setTheme(nextTheme)} aria-label="Theme" style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.muted, padding: 6, display: 'flex' }}>
            <ThemeIcon theme={theme} className="w-[18px] h-[18px]" />
          </button>
        </div>
      </header>

      <main className="ta-grid">
        <section style={{ padding: 0 }}>
          <span style={{ display: 'inline-block', background: P.chipBg, color: P.chipText, borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {t('teach.eyebrow')}
          </span>
          <h1 style={{ fontFamily: F.display, fontSize: 'clamp(36px, 5vw, 54px)', fontWeight: 600, lineHeight: 1.08, color: P.heading, margin: '18px 0 14px' }}>
            {t('teach.title')}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: P.muted, margin: '0 0 30px', maxWidth: 460 }}>{t('teach.sub')}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {perks.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, background: P.chipBg, color: P.chipText, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.display, fontWeight: 700, fontSize: 18 }}>
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: P.text, marginBottom: 2 }}>{p.title}</div>
                  <div style={{ fontSize: 14, color: P.muted, lineHeight: 1.55 }}>{p.desc}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="ta-student-link" style={{ marginTop: 34, fontSize: 14, color: P.muted }}>
            {t('teach.wantLessons')}{' '}
            <a href="/join" style={{ color: P.outline, fontWeight: 700 }}>{t('teach.studentSignup')}</a>
          </p>
        </section>

        <section style={{ padding: 0 }}>
          <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 22, padding: 'clamp(22px, 4vw, 34px)', boxShadow: '0 18px 50px rgba(0,0,0,0.08)' }}>
            {card}
          </div>
        </section>
      </main>

      <style>{`
        .ta-grid { max-width: 1140px; margin: 0 auto; padding: 56px 20px 72px; display: grid; gap: 48px;
          grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: start; }
        .ta-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 860px) {
          .ta-grid { grid-template-columns: minmax(0, 1fr); padding: 32px 16px 56px; gap: 32px; }
        }
        @media (max-width: 520px) { .ta-two { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
};

export default TutorApplyPage;
