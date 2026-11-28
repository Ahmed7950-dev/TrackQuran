import React, { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nProvider';
import { AppTheme, applyTheme, readTheme, nextTheme } from '../utils/theme';
import { landingPalette, LandingPalette } from '../utils/landingPalette';
import SharedThemeIcon from './ThemeIcon';
import LandingBannerCarousel from './LandingBannerCarousel';
import { LESSON_PRICES, LessonLength, MIN_LESSONS_PER_MONTH } from '../utils/lessonPricing';

// ─────────────────────────────────────────────────────────────────────────────
// The public landing page. The site is one online Quran school (Nov 2026):
//  - students sign up at /join ("Student sign up"), tutors apply at /teach
//    ("Be a tutor with us"); the old tutor-subscription section is gone;
//  - Quran only for now (Arabic lessons come later);
//  - one price for everyone: $10 a 25-minute lesson, $20 a 50-minute lesson,
//    4 lessons a month or more (utils/lessonPricing);
//  - follows the site's four looks through utils/landingPalette.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_LESSONS = MIN_LESSONS_PER_MONTH;
const LESSON_PRESETS = [4, 8, 12, 16, 20];

const F = {
  body:    "'DM Sans', sans-serif",
  display: "'Cormorant Garamond', serif",
  arabic:  "'Amiri', 'Amiri Regular', serif",
};

// ── 8-point star SVG background pattern ────────────────────────────────────────
const StarPatternDefs: React.FC<{ id: string; color: string; opacity?: number }> = ({ id, color, opacity = 0.06 }) => (
  <defs>
    <pattern id={id} x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
      <g fill={color} opacity={opacity}>
        <polygon points="30,5 34,22 50,22 37,32 42,49 30,39 18,49 23,32 10,22 26,22" />
      </g>
    </pattern>
  </defs>
);

const CheckIcon: React.FC<{ bg: string; fg: string }> = ({ bg, fg }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true">
    <circle cx="8" cy="8" r="8" fill={bg} />
    <path d="M4.5 8.5 L7 11 L11.5 5.5" stroke={fg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── The games: live screenshots in public/showcase (1440×900 + a 720px copy) ──
interface GameCard { key: string; accent: string; }
const GAMES: GameCard[] = [
  { key: 'letter-race',    accent: '#10b981' },
  { key: 'letter-flight',  accent: '#06b6d4' },
  { key: 'castle-battle',  accent: '#6366f1' },
  { key: 'letter-cards',   accent: '#e11d48' },
  { key: 'flappy-letters', accent: '#f59e0b' },
  { key: 'build-the-word', accent: '#d97706' },
];

const GameShowcaseCard: React.FC<{ game: GameCard; name: string; tag: string; meta: string; P: LandingPalette }> =
({ game, name, tag, meta, P }) => (
  <article className="lp-game" style={{ background: P.card, border: `1px solid ${P.border}` }}>
    <div className="lp-game-shot" style={{ background: `radial-gradient(120% 90% at 50% 0%, ${game.accent}33 0%, transparent 70%)` }}>
      <div className="lp-game-frame">
        <img src={`/showcase/${game.key}.webp`} srcSet={`/showcase/${game.key}-720.webp 720w, /showcase/${game.key}.webp 1440w`}
          sizes="(max-width: 640px) 86vw, (max-width: 1000px) 46vw, 360px"
          alt={name} width={1440} height={900} loading="lazy" decoding="async" />
      </div>
    </div>
    <div style={{ padding: '16px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: game.accent, flexShrink: 0 }} />
        <h3 style={{ fontFamily: F.display, fontSize: 24, fontWeight: 700, color: P.text, margin: 0, lineHeight: 1.1 }}>{name}</h3>
      </div>
      <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.55, margin: '0 0 12px' }}>{tag}</p>
      <span style={{ display: 'inline-block', background: P.chipBg, color: P.chipText, borderRadius: 999, padding: '4px 11px', fontSize: 11.5, fontWeight: 700 }}>{meta}</span>
    </div>
  </article>
);

interface LandingPageProps {
  onOpenAuth: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  const { t, language, setLanguage } = useI18n();
  const isRtl = language === 'ar';

  const [theme, setThemeState] = useState<AppTheme>(readTheme);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lessonLength, setLessonLength] = useState<LessonLength>(50);
  const [lessonsPerMonth, setLessonsPerMonth] = useState(8);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const P = landingPalette(theme);
  const isDark = P.darkLogo;

  const faqs = [1, 2, 3, 4, 5, 6, 7].map(n => ({ q: t(`landing.faq${n}Q`), a: t(`landing.faq${n}A`) }));

  const navLinks = [
    { label: t('landing.readerNav'),     href: '/quran' },
    { label: t('landing.navPrograms'),   href: '#programs' },
    { label: t('landing.kidsNav'),       href: '#kids' },
    { label: t('landing.navHowItWorks'), href: '#how' },
    { label: t('landing.navPricing'),    href: '#pricing' },
    { label: t('landing.navFaq'),        href: '#faq' },
  ];

  const go = (href: string) => {
    setMobileNavOpen(false);
    if (href.startsWith('/')) { window.location.href = href; return; }
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };
  const studentSignup = () => { window.location.href = '/join'; };

  const sectionTitle: React.CSSProperties = { fontFamily: F.display, fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: 600, color: P.heading, margin: '0 0 12px', lineHeight: 1.1 };
  const sectionSub: React.CSSProperties = { color: P.muted, fontSize: 16, maxWidth: 580, margin: '0 auto', lineHeight: 1.6 };
  const primaryBtn: React.CSSProperties = { background: P.accent, color: P.onAccent, border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F.body, boxShadow: `0 10px 26px ${P.accentShadow}` };
  const outlineBtn: React.CSSProperties = { background: 'none', border: `1.5px solid ${P.outline}`, color: P.outline, borderRadius: 10, padding: '14px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F.body };

  const price = LESSON_PRICES[lessonLength];
  const monthly = price * lessonsPerMonth;

  const langSwitch = (compact: boolean) => (
    <div style={{ display: 'flex', gap: 2, background: P.chipBg, borderRadius: 8, padding: '3px 4px', alignItems: 'center' }}>
      {(['en', 'ar', 'tr'] as const).map(lang => (
        <button key={lang} onClick={() => setLanguage(lang)} aria-pressed={language === lang}
          style={{ padding: compact ? '3px 8px' : '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: compact ? 11 : 12, fontWeight: 700, fontFamily: F.body,
            background: language === lang ? P.accent : 'transparent', color: language === lang ? P.onAccent : P.muted }}>
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ fontFamily: F.body, background: P.bg, color: P.text, minHeight: '100vh' }}>
      {/* ── Announcement bar ─────────────────────────────────────────────── */}
      <div style={{ background: P.bandDeep, color: P.goldSoft, textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
        {t('landing.announcementBar')}
      </div>

      {/* ── Sticky nav ───────────────────────────────────────────────────── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: P.nav, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: `1px solid ${P.border}` }}>
        <div className="lp-bar" style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', height: 64 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <img className="lp-logo" src={isDark ? '/TQ LOGO DM.png' : '/TQ LOGO.png'} alt="Lisan & Quran" style={{ width: 'auto' }} />
          </a>

          <div className="lp-links">
            {navLinks.map(link => (
              <button key={link.href} onClick={() => go(link.href)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: P.muted, fontFamily: F.body, padding: '4px 0', whiteSpace: 'nowrap' }}>
                {link.label}
              </button>
            ))}
            {/* Tutors apply here; set apart from the student links */}
            <a href="/teach"
              style={{ fontSize: 14, fontWeight: 700, color: P.chipText, background: P.chipBg, borderRadius: 999, padding: '6px 14px', textDecoration: 'none', whiteSpace: 'nowrap', fontFamily: F.body }}>
              {t('landing.navBeTutor')}
            </a>
          </div>

          <div className="lp-controls" style={{ display: 'flex', alignItems: 'center', marginInlineStart: 'auto' }}>
            <div className="lp-desktop-only">{langSwitch(true)}</div>
            <button className="lp-desktop-only" onClick={() => setThemeState(nextTheme)} title={t('landing.themeLabel')} aria-label={t('landing.themeLabel')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.muted, alignItems: 'center', padding: 6, borderRadius: 8 }}>
              <SharedThemeIcon theme={theme} className="w-[18px] h-[18px]" />
            </button>
            <button onClick={onOpenAuth} className="lp-desktop-only"
              style={{ background: 'none', border: `1.5px solid ${P.outline}`, color: P.outline, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.body, whiteSpace: 'nowrap' }}>
              {t('landing.navSignIn')}
            </button>
            <button onClick={studentSignup} className="lp-signup"
              style={{ background: P.accent, color: P.onAccent, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F.body, whiteSpace: 'nowrap' }}>
              {t('landing.navStudentSignup')}
            </button>
            <button className="lp-burger" onClick={() => setMobileNavOpen(o => !o)} aria-label="Menu" aria-expanded={mobileNavOpen}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.text, padding: 6 }}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                {mobileNavOpen
                  ? <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  : <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
              </svg>
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div style={{ background: P.nav, borderTop: `1px solid ${P.border}`, padding: '10px 20px 20px' }}>
            {navLinks.map(link => (
              <button key={link.href} onClick={() => go(link.href)}
                style={{ display: 'block', width: '100%', textAlign: 'start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: P.text, padding: '10px 0', fontFamily: F.body }}>
                {link.label}
              </button>
            ))}
            <a href="/teach" style={{ display: 'block', fontSize: 15, fontWeight: 700, color: P.chipText, padding: '10px 0', textDecoration: 'none', fontFamily: F.body }}>
              {t('landing.navBeTutor')} →
            </a>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={onOpenAuth} style={{ flex: 1, background: 'none', border: `1.5px solid ${P.outline}`, color: P.outline, borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.navSignIn')}
              </button>
              <button onClick={studentSignup} style={{ flex: 1, background: P.accent, color: P.onAccent, border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.navStudentSignup')}
              </button>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {langSwitch(false)}
              <button onClick={() => setThemeState(nextTheme)} aria-label={t('landing.themeLabel')}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: P.chipBg, color: P.chipText, border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: F.body }}>
                <SharedThemeIcon theme={theme} className="w-[16px] h-[16px]" />
                {t('landing.themeLabel')}
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* ── Banner carousel ──────────────────────────────────────────────── */}
      <LandingBannerCarousel isDark={isDark} isRtl={isRtl} accent={P.gold} ink={P.outline} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="hero-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 40, alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: P.gold, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>
            {t('landing.heroEyebrow')}
          </p>
          <h1 style={{ fontFamily: F.body, fontSize: 'clamp(38px, 5vw, 60px)', fontWeight: 700, lineHeight: 1.08, color: P.text, margin: '0 0 4px' }}>
            {t('landing.heroH1Part1')}
          </h1>
          <p style={{ fontFamily: F.display, fontSize: 'clamp(38px, 5vw, 60px)', fontWeight: 600, lineHeight: 1.08, color: P.heading, fontStyle: 'italic', margin: '0 0 24px' }}>
            {t('landing.heroH1Part2')}
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: P.muted, margin: '0 0 34px', maxWidth: 500 }}>
            {t('landing.heroSub')}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={studentSignup} style={primaryBtn}>{t('landing.heroCta1')}</button>
            <button onClick={() => go('#pricing')} style={outlineBtn}>{t('landing.heroCta2')}</button>
          </div>
        </div>

        <div className="hero-medallion-wrap">
          <svg width="340" height="340" viewBox="0 0 340 340" style={{ position: 'absolute' }} aria-hidden="true">
            <StarPatternDefs id="hero-pat" color={P.heading} opacity={0.05} />
            <rect width="340" height="340" fill="url(#hero-pat)" rx="170" />
            <polygon points="170,20 190,80 250,60 210,110 260,130 200,150 220,210 170,180 120,210 140,150 80,130 130,110 90,60 150,80"
              fill="none" stroke={P.heading} strokeWidth="1.2" opacity="0.35" />
          </svg>
          <div className="hero-medallion-circle" style={{
            borderRadius: '50%', background: P.band,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 24px 80px ${P.accentShadow}`, position: 'relative', zIndex: 1,
          }}>
            <div style={{ fontFamily: F.arabic, fontSize: 64, color: P.goldSoft, lineHeight: 1.4, direction: 'rtl' }}>
              {t('landing.heroArabicWord')}
            </div>
          </div>
        </div>
      </section>

      {/* ── The Quran reader anyone can open ─────────────────────────────── */}
      <section id="reader" style={{ background: P.band, padding: '56px 24px', position: 'relative', overflow: 'hidden' }}>
        <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.16 }}>
          <StarPatternDefs id="readerStars" color={P.goldSoft} opacity={0.5} />
          <rect width="100%" height="100%" fill="url(#readerStars)" />
        </svg>
        <div style={{ maxWidth: 1000, margin: '0 auto', position: 'relative', textAlign: 'center' }}>
          <span style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 999, background: 'rgba(225,197,136,0.16)', border: `1px solid ${P.goldSoft}`, color: P.goldSoft, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {t('landing.readerBadge')}
          </span>
          <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4.4vw, 46px)', fontWeight: 600, color: P.onBand, margin: '16px 0 12px', lineHeight: 1.15 }}>
            {t('landing.readerTitle')}
          </h2>
          <p style={{ color: P.onBandMuted, fontSize: 16, lineHeight: 1.65, maxWidth: 620, margin: '0 auto' }}>
            {t('landing.readerSub')}
          </p>
          <div style={{ fontFamily: F.arabic, direction: 'rtl', color: P.goldSoft, fontSize: 'clamp(22px, 3.4vw, 32px)', margin: '22px 0 4px', lineHeight: 2 }}>
            ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, margin: '18px 0 26px' }}>
            {[t('landing.readerPoint1'), t('landing.readerPoint2'), t('landing.readerPoint3')].map(point => (
              <span key={point} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: P.onBand, fontSize: 13, fontWeight: 500 }}>
                <CheckIcon bg="rgba(225,197,136,0.2)" fg={P.goldSoft} />{point}
              </span>
            ))}
          </div>
          <a href="/quran" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', borderRadius: 10, background: P.bandButton, color: P.onBandButton, fontSize: 16, fontWeight: 700, textDecoration: 'none', boxShadow: '0 12px 32px rgba(0,0,0,0.22)' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H9a3 3 0 0 1 3 3v12a2.5 2.5 0 0 0-2.5-2.5H4.5A1.5 1.5 0 0 1 3 15z" />
              <path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H15a3 3 0 0 0-3 3v12a2.5 2.5 0 0 1 2.5-2.5h5A1.5 1.5 0 0 0 21 15z" />
            </svg>
            {t('landing.readerCta')}
          </a>
        </div>
      </section>

      {/* ── Programs (Quran only for now) ────────────────────────────────── */}
      <section id="programs" style={{ background: P.alt, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={sectionTitle}>{t('landing.programsTitle')}</h2>
            <p style={sectionSub}>{t('landing.programsSub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {(['Qaedah', 'Tajweed', 'Hifz', 'Ijazah'] as const).map(k => (
              <div key={k} style={{ background: P.card, borderRadius: 16, padding: '28px 24px', border: `1px solid ${P.border}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: F.arabic, fontSize: 32, color: P.gold, direction: 'rtl', marginBottom: 10, lineHeight: 1.3 }}>{t(`landing.program${k}Ar`)}</div>
                <h3 style={{ fontFamily: F.display, fontSize: 24, fontWeight: 600, color: P.text, margin: '0 0 10px' }}>{t(`landing.program${k}Name`)}</h3>
                <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.6, margin: '0 0 18px', flex: 1 }}>{t(`landing.program${k}Desc`)}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: P.chipBg, color: P.chipText, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{t(`landing.program${k}Level`)}</span>
                  <span style={{ background: P.alt, color: P.muted, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{t(`landing.program${k}Pace`)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who we teach ─────────────────────────────────────────────────── */}
      <section style={{ background: P.bg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={sectionTitle}>{t('landing.audienceTitle')}</h2>
            <p style={sectionSub}>{t('landing.audienceSub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {(['i', 'ii', 'iii'] as const).map((num, i) => (
              <div key={num} style={{ background: P.card, borderRadius: 16, padding: '32px 28px', border: `1px solid ${P.border}` }}>
                <div style={{ fontFamily: F.display, fontStyle: 'italic', fontSize: 36, color: P.heading, marginBottom: 14, lineHeight: 1 }}>{num}.</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: '0 0 10px' }}>{t(`landing.audience${i + 1}Title`)}</h3>
                <span style={{ background: P.chipBg, color: P.chipText, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, display: 'inline-block', marginBottom: 14 }}>{t(`landing.audience${i + 1}Tag`)}</span>
                <p style={{ fontSize: 14, color: P.muted, lineHeight: 1.65, margin: 0 }}>{t(`landing.audience${i + 1}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Games: a playground for little learners ──────────────────────── */}
      <section id="kids" style={{ background: P.kidsBg, padding: '80px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <span style={{ background: P.chipBg, color: P.chipText, borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              🎮 {t('landing.kidsBadge')}
            </span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ ...sectionTitle, marginTop: 16 }}>{t('landing.kidsTitle')}</h2>
            <p style={sectionSub}>{t('landing.kidsSubtitle')}</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '26px 0 40px' }}>
            <div style={{ display: 'flex' }}>
              {['fennec', 'panda', 'cat', 'fox', 'chibi', 'tiger', 'alien', 'lion', 'jaafar'].map((k, i) => (
                <img key={k} src={`/sprites/profile-${k}.jpg`} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${P.card}`, marginInlineStart: i ? -10 : 0, boxShadow: '0 3px 8px rgba(0,0,0,0.18)' }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: P.muted }}>{t('landing.kidsChars')}</span>
          </div>
          <div className="lp-games">
            {GAMES.map(g => {
              const k = g.key.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
              return (
                <GameShowcaseCard key={g.key} game={g} P={P}
                  name={t(`landing.game_${k}_name`)} tag={t(`landing.game_${k}_tag`)} meta={t(`landing.game_${k}_meta`)} />
              );
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <button onClick={studentSignup} style={{ ...primaryBtn, borderRadius: 999, padding: '14px 34px', fontWeight: 800, fontSize: 16 }}>
              {t('landing.kidsCta')}
            </button>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how" style={{ background: P.bg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={sectionTitle}>{t('landing.howTitle')}</h2>
            <p style={sectionSub}>{t('landing.howSub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 24 }}>
            {(['I', 'II', 'III', 'IV'] as const).map((roman, i) => (
              <div key={roman} style={{ textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: P.band, color: P.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.display, fontSize: 18, fontWeight: 700, margin: '0 auto 16px' }}>
                  {roman}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: P.text, margin: '0 0 8px' }}>{t(`landing.step${i + 1}Title`)}</h3>
                <p style={{ fontSize: 13.5, color: P.muted, lineHeight: 1.6, margin: 0 }}>{t(`landing.step${i + 1}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing: one price per lesson, 4 lessons a month or more ─────── */}
      <section id="pricing" style={{ background: P.alt, padding: '80px 24px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <h2 style={sectionTitle}>{t('landing.pricingTitle')}</h2>
            <p style={sectionSub}>{t('landing.pricingSub')}</p>
          </div>

          <div className="lp-price-grid">
            {/* Lesson length */}
            <div role="radiogroup" aria-label={t('landing.priceLengthLabel')} style={{ display: 'grid', gap: 14 }}>
              {([25, 50] as LessonLength[]).map(len => {
                const on = lessonLength === len;
                return (
                  <button key={len} role="radio" aria-checked={on} onClick={() => setLessonLength(len)}
                    style={{ textAlign: 'start', cursor: 'pointer', fontFamily: F.body, borderRadius: 18, padding: '22px 24px',
                      background: on ? P.card : 'transparent', color: P.text,
                      border: `2px solid ${on ? P.accent : P.border}`, boxShadow: on ? `0 12px 30px ${P.accentShadow}` : 'none',
                      display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color .15s, box-shadow .15s' }}>
                    <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `2px solid ${on ? P.accent : P.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <span style={{ width: 11, height: 11, borderRadius: '50%', background: P.accent }} />}
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 17, fontWeight: 700 }}>{t(len === 25 ? 'landing.priceShortName' : 'landing.priceLongName')}</span>
                      <span style={{ display: 'block', fontSize: 13, color: P.muted, marginTop: 2 }}>{t(len === 25 ? 'landing.priceShortDesc' : 'landing.priceLongDesc')}</span>
                    </span>
                    <span style={{ textAlign: 'end' }}>
                      <span style={{ fontFamily: F.display, fontSize: 40, fontWeight: 700, color: P.heading, lineHeight: 1 }}>${LESSON_PRICES[len]}</span>
                      <span style={{ display: 'block', fontSize: 12, color: P.muted }}>{t('landing.pricePer')}</span>
                    </span>
                  </button>
                );
              })}

              {/* Lessons a month */}
              <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 18, padding: '20px 22px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: P.muted, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
                  {t('landing.priceLessonsLabel')}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {LESSON_PRESETS.map(n => (
                    <button key={n} onClick={() => setLessonsPerMonth(n)} aria-pressed={lessonsPerMonth === n}
                      style={{ minWidth: 48, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: F.body,
                        border: `1.5px solid ${lessonsPerMonth === n ? P.accent : P.border}`,
                        background: lessonsPerMonth === n ? P.accent : 'transparent', color: lessonsPerMonth === n ? P.onAccent : P.text }}>
                      {n}
                    </button>
                  ))}
                  <span style={{ display: 'inline-flex', alignItems: 'center', border: `1.5px solid ${P.border}`, borderRadius: 10, marginInlineStart: 'auto' }}>
                    <button onClick={() => setLessonsPerMonth(n => Math.max(MIN_LESSONS, n - 1))} disabled={lessonsPerMonth <= MIN_LESSONS} aria-label={t('landing.priceFewer')}
                      style={{ width: 38, height: 40, border: 'none', background: 'none', color: P.text, fontSize: 20, cursor: lessonsPerMonth <= MIN_LESSONS ? 'default' : 'pointer', opacity: lessonsPerMonth <= MIN_LESSONS ? 0.35 : 1 }}>−</button>
                    <span aria-live="polite" style={{ minWidth: 30, textAlign: 'center', fontWeight: 800, fontSize: 16 }}>{lessonsPerMonth}</span>
                    <button onClick={() => setLessonsPerMonth(n => Math.min(60, n + 1))} aria-label={t('landing.priceMore')}
                      style={{ width: 38, height: 40, border: 'none', background: 'none', color: P.text, fontSize: 20, cursor: 'pointer' }}>+</button>
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: P.muted, margin: '10px 0 0' }}>{t('landing.priceMinNote')}</p>
              </div>
            </div>

            {/* Monthly total */}
            <div style={{ background: P.band, borderRadius: 22, padding: '34px 30px', position: 'relative', overflow: 'hidden', color: P.onBand, display: 'flex', flexDirection: 'column' }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <StarPatternDefs id="rate-pat" color={P.goldSoft} opacity={0.07} />
                <rect width="300" height="400" fill="url(#rate-pat)" />
              </svg>
              <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span style={{ alignSelf: 'flex-start', background: P.bandButton, color: P.onBandButton, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, marginBottom: 18 }}>
                  {t('landing.priceBadge')}
                </span>
                <div style={{ fontSize: 13, fontWeight: 600, color: P.onBandMuted, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{t('landing.priceMonthly')}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '4px 0 2px' }}>
                  <span style={{ fontFamily: F.display, fontSize: 64, fontWeight: 700, color: P.goldSoft, lineHeight: 1 }}>${monthly}</span>
                  <span style={{ color: P.onBandMuted, fontSize: 15 }}>{t('landing.pricePerMonth')}</span>
                </div>
                <div style={{ fontSize: 14, color: P.onBandMuted, marginBottom: 24 }} dir="ltr">
                  {lessonsPerMonth} × ${price} · {lessonLength} min
                </div>
                <div style={{ display: 'grid', gap: 12, marginBottom: 26 }}>
                  {[1, 2, 3].map(n => (
                    <div key={n} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <CheckIcon bg="rgba(225,197,136,0.2)" fg={P.goldSoft} />
                      <span style={{ fontSize: 14, color: P.onBand, lineHeight: 1.45 }}>{t(`landing.priceFeature${n}`)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={studentSignup} style={{ marginTop: 'auto', width: '100%', background: P.bandButton, border: 'none', color: P.onBandButton, borderRadius: 12, padding: '15px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: F.body }}>
                  {t('landing.priceCta')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: P.bg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={sectionTitle}>{t('landing.faqTitle')}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ background: P.card, borderRadius: 12, border: `1px solid ${P.border}`, overflow: 'hidden' }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} aria-expanded={faqOpen === i}
                  style={{ width: '100%', textAlign: 'start', background: 'none', border: 'none', cursor: 'pointer', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: P.text, fontFamily: F.body }}>{faq.q}</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, transform: faqOpen === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: P.muted }} aria-hidden="true">
                    <path d="M4 6.5L9 11.5L14 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {faqOpen === i && (
                  <div style={{ padding: '0 20px 18px', fontSize: 14, color: P.muted, lineHeight: 1.7 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing banner ───────────────────────────────────────────────── */}
      <section style={{ padding: '48px 24px', background: P.bg }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="cta-banner-inner" style={{ background: P.bandDeep, borderRadius: 24, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              <StarPatternDefs id="cta-pat" color={P.goldSoft} opacity={0.05} />
              <rect width="800" height="300" fill="url(#cta-pat)" />
            </svg>
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: F.arabic, fontSize: 28, color: P.goldSoft, direction: 'rtl', marginBottom: 20 }}>{t('landing.ctaBannerArabic')}</div>
              <h2 style={{ fontFamily: F.body, fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 700, color: P.onBand, margin: '0 0 6px' }}>{t('landing.ctaBannerH2Part1')}</h2>
              <p style={{ fontFamily: F.display, fontStyle: 'italic', fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 600, color: P.goldSoft, margin: '0 0 32px' }}>{t('landing.ctaBannerH2Part2')}</p>
              <button onClick={studentSignup} style={{ background: P.bandButton, color: P.onBandButton, border: 'none', borderRadius: 12, padding: '16px 36px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.ctaBannerCta')}
              </button>
              <p style={{ margin: '22px 0 0', fontSize: 14, color: P.onBandMuted }}>
                {t('landing.ctaTutorPrompt')}{' '}
                <a href="/teach" style={{ color: P.goldSoft, fontWeight: 700 }}>{t('landing.navBeTutor')}</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ background: P.bandDeep, color: P.onBandMuted, padding: '56px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 32, marginBottom: 48 }}>
            <div>
              <img src="/TQ LOGO DM.png" alt="Lisan & Quran" style={{ height: 36, width: 'auto', marginBottom: 16 }} />
              <p style={{ fontSize: 13, lineHeight: 1.65, color: P.onBandMuted, maxWidth: 220, margin: 0 }}>{t('landing.footerDesc')}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {(['en', 'ar', 'tr'] as const).map(lang => (
                  <button key={lang} onClick={() => setLanguage(lang)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: language === lang ? P.bandButton : 'rgba(255,255,255,0.1)', color: language === lang ? P.onBandButton : P.onBandMuted, fontFamily: F.body }}>
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {[
              { title: t('landing.footerColPrograms'), links: (['Qaedah', 'Tajweed', 'Hifz', 'Ijazah'] as const).map(k => ({ label: t(`landing.program${k}Name`), href: '#programs' })) },
              { title: t('landing.footerColSchool'), links: [
                { label: t('landing.navStudentSignup'), href: '/join' },
                { label: t('landing.navBeTutor'), href: '/teach' },
                { label: t('landing.readerNav'), href: '/quran' },
              ] },
              { title: t('landing.footerColSupport'), links: [
                { label: t('landing.footerLinkFaq'), href: '#faq' },
                { label: t('landing.navPricing'), href: '#pricing' },
              ] },
              { title: t('landing.footerColLegal'), links: [
                { label: t('landing.footerLinkTerms'), href: '/terms' },
                { label: t('landing.footerLinkPrivacy'), href: '/privacy' },
                { label: t('landing.footerLinkRefunds'), href: '/refunds' },
              ] },
            ].map(col => (
              <div key={col.title}>
                <h4 style={{ fontWeight: 700, fontSize: 13, color: P.goldSoft, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 16px' }}>{col.title}</h4>
                {col.links.map(link => (
                  <a key={link.label} href={link.href}
                    onClick={link.href.startsWith('#') ? e => { e.preventDefault(); go(link.href); } : undefined}
                    style={{ display: 'block', fontSize: 13, color: P.onBandMuted, marginBottom: 10, textDecoration: 'none' }}>
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 12, color: P.onBandMuted, opacity: 0.75, margin: 0 }}>© {new Date().getFullYear()} Lisan &amp; Quran</p>
            <p style={{ fontFamily: F.arabic, fontSize: 16, color: P.gold, direction: 'rtl', margin: 0 }}>{t('landing.footerVerse')}</p>
          </div>
        </div>
      </footer>

      <style>{`
        /* Header: the links need room; below 1180px they move into the menu */
        .lp-bar { padding: 0 20px; gap: 18px; }
        .lp-logo { height: 54px; }
        .lp-controls { gap: 10px; }
        .lp-desktop-only { display: flex; }
        .lp-links { flex: 1; display: flex; justify-content: center; gap: 22px; align-items: center; }
        .lp-burger { display: none; }
        @media (max-width: 1180px) {
          .lp-links { display: none; }
          .lp-burger { display: block; }
        }
        @media (max-width: 640px) {
          .lp-bar { padding: 0 12px; gap: 10px; }
          .lp-logo { height: 42px; }
          .lp-controls { gap: 6px; }
          .lp-desktop-only { display: none; }
          .lp-signup { padding: 8px 12px !important; }
        }

        /* Hero */
        .hero-grid { grid-template-columns: 1fr 1fr; padding: 72px 24px 64px; }
        @media (max-width: 768px) {
          .hero-grid { grid-template-columns: 1fr; padding: 40px 16px 40px; gap: 32px !important; }
        }
        .hero-medallion-wrap { display: flex; justify-content: center; align-items: center; position: relative; min-height: 340px; }
        .hero-medallion-wrap > svg { width: 340px; height: 340px; }
        .hero-medallion-circle { width: 220px; height: 220px; }
        @media (max-width: 480px) {
          .hero-medallion-wrap { min-height: 240px; }
          .hero-medallion-wrap > svg { width: 240px; height: 240px; }
          .hero-medallion-circle { width: 160px; height: 160px; }
          .hero-medallion-circle div { font-size: 44px !important; }
        }

        /* Games: three across, two on tablets, a swipeable row on phones */
        .lp-games { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
        .lp-game { border-radius: 22px; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08); transition: transform .2s ease, box-shadow .2s ease; }
        .lp-game:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(0,0,0,0.14); }
        .lp-game-shot { padding: 18px 18px 0; }
        .lp-game-frame { border-radius: 14px 14px 0 0; overflow: hidden; background: #0b0f14; padding: 6px 6px 0;
          box-shadow: 0 -2px 0 rgba(255,255,255,0.06) inset, 0 12px 28px rgba(0,0,0,0.25); }
        .lp-game-frame img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 9px 9px 0 0; }
        @media (prefers-reduced-motion: reduce) { .lp-game { transition: none; } .lp-game:hover { transform: none; } }
        @media (max-width: 1000px) { .lp-games { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px) {
          .lp-games { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 14px;
            margin: 0 -16px; padding: 4px 16px 18px; scrollbar-width: none; }
          .lp-games::-webkit-scrollbar { display: none; }
          .lp-game { flex: 0 0 86%; scroll-snap-align: center; }
        }

        /* Pricing */
        .lp-price-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 22px; align-items: stretch; }
        @media (max-width: 820px) { .lp-price-grid { grid-template-columns: minmax(0, 1fr); } }

        /* Section padding on phones */
        @media (max-width: 640px) {
          section { padding-top: 52px !important; padding-bottom: 52px !important; }
          section > div { padding-left: 0 !important; padding-right: 0 !important; }
          #programs, #kids, #how, #pricing, #faq, #reader { padding-left: 16px !important; padding-right: 16px !important; }
        }

        .cta-banner-inner { padding: 64px 48px; }
        @media (max-width: 640px) { .cta-banner-inner { padding: 40px 20px !important; border-radius: 16px !important; } }

        @media (max-width: 640px) { .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; } }
        @media (max-width: 380px) { .footer-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
};

export default LandingPage;
