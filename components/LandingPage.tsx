import React, { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nProvider';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  green:     '#0E4A2B',
  greenDeep: '#08321E',
  greenSoft: '#18613C',
  gold:      '#C9A24A',
  goldSoft:  '#E1C588',
  cream:     '#FAF6EC',
  creamDeep: '#F2EBD9',
  paper:     '#FFFDF8',
  mint:      '#E8EFE7',
  ink:       '#1A2B22',
  inkMuted:  '#5C6B62',
  line:      '#E5DFCE',
  lineSoft:  '#ECE5D2',
};

// ── Fonts ──────────────────────────────────────────────────────────────────────
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

// ── Theme detection ─────────────────────────────────────────────────────────────
type AppTheme = 'light' | 'dark';
const getStoredTheme = (): AppTheme => {
  const s = localStorage.getItem('theme');
  if (s === 'dark') return 'dark';
  if (s === 'light') return 'light';
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
};

// ── Small reusable components ───────────────────────────────────────────────────

const GoldStar: React.FC = () => (
  <span style={{ color: C.gold }}>★</span>
);

const CheckIcon: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
    <circle cx="8" cy="8" r="8" fill={dark ? 'rgba(201,162,74,0.18)' : 'rgba(14,74,43,0.1)'} />
    <path d="M4.5 8.5 L7 11 L11.5 5.5" stroke={dark ? C.gold : C.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Kids game preview card: a muted gameplay loop that only plays while on
// screen (IntersectionObserver), with the game name chipped over the video ────
const KidsGameCard: React.FC<{
  span: number; src: string; poster: string; name: string; tag: string; accent: string;
  cardBg: string; borderColor: string; textMuted: string;
}> = ({ span, src, poster, name, tag, accent, cardBg, borderColor, textMuted }) => {
  const ref = React.useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => { /* autoplay blocked — poster stays */ });
      else v.pause();
    }, { threshold: 0.25 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className="kids-card" style={{ gridColumn: `span ${span}`, background: cardBg, borderRadius: 20, overflow: 'hidden', border: `1px solid ${borderColor}`, boxShadow: '0 6px 22px rgba(10,40,20,0.10)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative' }}>
        <video ref={ref} src={src} poster={poster} muted loop playsInline preload="metadata" style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', display: 'block', background: '#0a1a10' }} />
        <span style={{ position: 'absolute', top: 10, insetInlineStart: 10, background: accent, color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800, letterSpacing: 0.4, boxShadow: '0 2px 8px rgba(0,0,0,0.35)' }}>▶ {name}</span>
      </div>
      <p style={{ margin: 0, padding: '12px 16px 14px', fontSize: 13, color: textMuted, lineHeight: 1.55 }}>{tag}</p>
    </div>
  );
};

interface LandingPageProps {
  onOpenAuth: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  const { t, language, setLanguage } = useI18n();
  const isRtl = language === 'ar';

  // Theme state (read-only here — we display a toggle but delegate control to App.tsx's useTheme)
  const [theme, setThemeState] = useState<AppTheme>(getStoredTheme);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Apply theme class + persist (mirrors App.tsx logic so both stay in sync)
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Sync if the stored theme changes externally (shouldn't happen but safe guard)
  useEffect(() => {
    const sync = () => setThemeState(getStoredTheme());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const cycleTheme = () => {
    setThemeState(prev => prev === 'light' ? 'dark' : 'light');
  };

  const isDark = theme === 'dark';

  // ── Colour helpers for dark mode ──────────────────────────────────────────
  const bg    = isDark ? '#0d1f17'   : C.cream;
  const cardBg = isDark ? '#142012'  : C.paper;
  const textPrimary = isDark ? '#e8ead6' : C.ink;
  const textMuted   = isDark ? '#8a9e8f' : C.inkMuted;
  const borderColor = isDark ? '#1f3828' : C.line;
  const navBg = isDark
    ? 'rgba(10,24,16,0.88)'
    : 'rgba(250,246,236,0.88)';
  const sectionPaperBg = isDark ? '#0f1e15' : C.paper;
  const ctaBannerBg = isDark ? '#08321E' : C.greenDeep;

  // FAQ data
  const faqs = [1, 2, 3, 4, 5, 6].map(n => ({
    q: t(`landing.faq${n}Q`),
    a: t(`landing.faq${n}A`),
  }));

  const navLinks = [
    { label: t('landing.navPrograms'),    href: '#programs' },
    { label: t('landing.kidsNav'),        href: '#kids' },
    { label: t('landing.navHowItWorks'), href: '#how' },
    { label: t('landing.navForTutors'),  href: '#for-tutors' },
    { label: t('landing.navPricing'),    href: '#pricing' },
    { label: t('landing.navFaq'),        href: '#faq' },
  ];

  const scrollTo = (href: string) => {
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileNavOpen(false);
  };

  // Theme icon — sun when dark (click to go light), moon when light (click to go dark)
  const ThemeIcon: React.FC = () => {
    if (isDark) return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    );
    return (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={18} height={18}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" />
      </svg>
    );
  };

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      style={{ fontFamily: F.body, background: bg, color: textPrimary, minHeight: '100vh' }}
    >
      {/* ── 1. Announcement Bar ─────────────────────────────────────────────── */}
      <div style={{ background: C.greenDeep, color: C.goldSoft, textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 500, letterSpacing: '0.02em' }}>
        {t('landing.announcementBar')}
      </div>

      {/* ── 2. Sticky Nav ───────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: navBg,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${borderColor}`,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 24, height: 64 }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <img src={isDark ? '/TQ LOGO DM.png' : '/TQ LOGO.png'} alt="Lisan & Quran" style={{ height: 56, width: 'auto' }} />
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex" style={{ flex: 1, justifyContent: 'center', gap: 28, alignItems: 'center' }}>
            {navLinks.map(link => (
              <button key={link.href} onClick={() => scrollTo(link.href)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: textMuted, fontFamily: F.body, padding: '4px 0' }}
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Right side controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginInlineStart: 'auto' }}>
            {/* Language switcher */}
            <div className="hidden sm:flex" style={{ background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(14,74,43,0.07)', borderRadius: 8, padding: '3px 4px', gap: 2, alignItems: 'center' }}>
              {(['en', 'ar', 'tr'] as const).map(lang => (
                <button key={lang} onClick={() => setLanguage(lang)}
                  style={{
                    padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: language === lang ? (isDark ? C.greenSoft : C.green) : 'transparent',
                    color: language === lang ? '#fff' : textMuted,
                    transition: 'all 0.15s',
                    fontFamily: F.body,
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Theme toggle */}
            <button onClick={cycleTheme} title={t('landing.themeLight')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, display: 'flex', alignItems: 'center', padding: 6, borderRadius: 8 }}
            >
              <ThemeIcon />
            </button>

            {/* Sign in ghost btn */}
            <button onClick={onOpenAuth}
              className="hidden sm:block"
              style={{ background: 'none', border: `1.5px solid ${isDark ? C.goldSoft : C.green}`, color: isDark ? C.goldSoft : C.green, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}
            >
              {t('landing.navSignIn')}
            </button>

            {/* Register as student CTA */}
            <button onClick={() => { window.location.href = '/join'; }}
              className="hidden sm:block"
              style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}
            >
              {t('landing.navBookTrial')}
            </button>

            {/* Mobile hamburger */}
            <button className="md:hidden" onClick={() => setMobileNavOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: textPrimary, padding: 6 }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                {mobileNavOpen
                  ? <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  : <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                }
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileNavOpen && (
          <div style={{ background: navBg, borderTop: `1px solid ${borderColor}`, padding: '12px 24px 20px' }}>
            {navLinks.map(link => (
              <button key={link.href} onClick={() => scrollTo(link.href)}
                style={{ display: 'block', width: '100%', textAlign: isRtl ? 'right' : 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: textPrimary, padding: '10px 0', fontFamily: F.body }}
              >
                {link.label}
              </button>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={onOpenAuth} style={{ flex: 1, background: 'none', border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.navSignIn')}
              </button>
              <button onClick={onOpenAuth} style={{ flex: 1, background: C.green, color: '#fff', border: 'none', borderRadius: 8, padding: '9px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.navBookTrial')}
              </button>
            </div>
            {/* Language in mobile */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
              {(['en', 'ar', 'tr'] as const).map(lang => (
                <button key={lang} onClick={() => setLanguage(lang)}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: language === lang ? C.green : borderColor, color: language === lang ? '#fff' : textMuted, fontFamily: F.body }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* ── 3. Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gap: 40, alignItems: 'center' }}
        className="hero-grid">
        {/* Left */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            {t('landing.heroEyebrow')}
          </p>
          <h1 style={{ fontFamily: F.body, fontSize: 'clamp(36px, 5vw, 58px)', fontWeight: 700, lineHeight: 1.12, color: textPrimary, marginBottom: 8, margin: '0 0 6px' }}>
            {t('landing.heroH1Part1')}
          </h1>
          <h1 style={{ fontFamily: F.display, fontSize: 'clamp(36px, 5vw, 58px)', fontWeight: 600, lineHeight: 1.12, color: C.greenSoft, fontStyle: 'italic', marginBottom: 24 }}>
            {t('landing.heroH1Part2')}
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: textMuted, marginBottom: 36, maxWidth: 480 }}>
            {t('landing.heroSub')}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 48 }}>
            <button onClick={() => { window.location.href = '/join'; }} style={{ background: C.green, color: '#fff', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}>
              {t('landing.heroCta1')}
            </button>
            <button onClick={() => scrollTo('#programs')} style={{ background: 'none', border: `1.5px solid ${isDark ? C.goldSoft : C.green}`, color: isDark ? C.goldSoft : C.green, borderRadius: 10, padding: '14px 24px', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}>
              {t('landing.heroCta2')}
            </button>
          </div>
        </div>

        {/* Right — medallion */}
        <div className="hero-medallion-wrap">
          {/* 8-point star frame */}
          <svg width="340" height="340" viewBox="0 0 340 340" style={{ position: 'absolute' }}>
            <StarPatternDefs id="hero-pat" color={C.green} opacity={0.035} />
            <rect width="340" height="340" fill="url(#hero-pat)" rx="170" />
            {/* Decorative star outline */}
            <polygon points="170,20 190,80 250,60 210,110 260,130 200,150 220,210 170,180 120,210 140,150 80,130 130,110 90,60 150,80"
              fill="none" stroke={isDark ? C.goldSoft : C.green} strokeWidth="1.2" opacity="0.35" />
          </svg>

          {/* Center circle */}
          <div className="hero-medallion-circle" style={{
            width: 220, height: 220, borderRadius: '50%',
            background: isDark ? C.greenDeep : C.green,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 24px 80px ${isDark ? 'rgba(8,50,30,0.6)' : 'rgba(14,74,43,0.28)'}`,
            position: 'relative', zIndex: 1,
          }}>
            <div style={{ fontFamily: F.arabic, fontSize: 64, color: C.goldSoft, lineHeight: 1, direction: 'rtl' }}>
              {t('landing.heroArabicWord')}
            </div>
          </div>

        </div>
      </section>

      {/* ── 4. Programs ─────────────────────────────────────────────────────── */}
      <section id="programs" style={{ background: isDark ? '#0a1a10' : C.mint, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>
              {t('landing.programsTitle')}
            </h2>
            <p style={{ color: textMuted, fontSize: 16, maxWidth: 520, margin: '0 auto' }}>{t('landing.programsSub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>
            {[
              { ar: t('landing.programTajweedAr'), name: t('landing.programTajweedName'), desc: t('landing.programTajweedDesc'), level: t('landing.programTajweedLevel'), pace: t('landing.programTajweedPace') },
              { ar: t('landing.programHifzAr'),    name: t('landing.programHifzName'),    desc: t('landing.programHifzDesc'),    level: t('landing.programHifzLevel'),    pace: t('landing.programHifzPace') },
              { ar: t('landing.programConvAr'),    name: t('landing.programConvName'),    desc: t('landing.programConvDesc'),    level: t('landing.programConvLevel'),    pace: t('landing.programConvPace') },
              { ar: t('landing.programMsaAr'),     name: t('landing.programMsaName'),     desc: t('landing.programMsaDesc'),     level: t('landing.programMsaLevel'),     pace: t('landing.programMsaPace') },
            ].map(prog => (
              <div key={prog.name} style={{ background: cardBg, borderRadius: 16, padding: '28px 24px', border: `1px solid ${borderColor}` }}>
                <div style={{ fontFamily: F.arabic, fontSize: 32, color: C.gold, direction: 'rtl', marginBottom: 10, lineHeight: 1 }}>{prog.ar}</div>
                <h3 style={{ fontFamily: F.display, fontSize: 22, fontWeight: 600, color: textPrimary, marginBottom: 10 }}>{prog.name}</h3>
                <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.6, marginBottom: 18 }}>{prog.desc}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ background: isDark ? 'rgba(14,74,43,0.3)' : C.mint, color: isDark ? C.goldSoft : C.green, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{prog.level}</span>
                  <span style={{ background: isDark ? 'rgba(201,162,74,0.12)' : C.creamDeep, color: isDark ? C.goldSoft : C.inkMuted, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{prog.pace}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. Audience ─────────────────────────────────────────────────────── */}
      <section style={{ background: sectionPaperBg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>
              {t('landing.audienceTitle')}
            </h2>
            <p style={{ color: textMuted, fontSize: 16 }}>{t('landing.audienceSub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {[
              { num: 'i',   title: t('landing.audience1Title'), tag: t('landing.audience1Tag'), desc: t('landing.audience1Desc') },
              { num: 'ii',  title: t('landing.audience2Title'), tag: t('landing.audience2Tag'), desc: t('landing.audience2Desc') },
              { num: 'iii', title: t('landing.audience3Title'), tag: t('landing.audience3Tag'), desc: t('landing.audience3Desc') },
            ].map(item => (
              <div key={item.num} style={{ background: cardBg, borderRadius: 16, padding: '32px 28px', border: `1px solid ${borderColor}` }}>
                <div style={{ fontFamily: F.display, fontStyle: 'italic', fontSize: 36, color: isDark ? C.goldSoft : C.green, marginBottom: 14, lineHeight: 1 }}>{item.num}.</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: textPrimary, marginBottom: 10 }}>{item.title}</h3>
                <span style={{ background: isDark ? 'rgba(14,74,43,0.3)' : C.mint, color: isDark ? C.goldSoft : C.green, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, display: 'inline-block', marginBottom: 14 }}>{item.tag}</span>
                <p style={{ fontSize: 14, color: textMuted, lineHeight: 1.65 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5b. For the kids: learning-games showcase ───────────────────────── */}
      <section id="kids" style={{ background: isDark ? '#0c2416' : 'linear-gradient(180deg, #E9F4EC 0%, #FAF6EC 100%)', padding: '80px 24px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <span style={{ background: isDark ? 'rgba(201,162,74,0.14)' : '#DFF0E2', color: isDark ? C.goldSoft : C.green, borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              🎮 {t('landing.kidsBadge')}
            </span>
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>
              {t('landing.kidsTitle')}
            </h2>
            <p style={{ color: textMuted, fontSize: 16, maxWidth: 560, margin: '0 auto' }}>{t('landing.kidsSubtitle')}</p>
          </div>
          {/* racer avatars strip */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 10, margin: '26px 0 40px' }}>
            <div style={{ display: 'flex' }}>
              {['fennec', 'panda', 'cat', 'fox', 'chibi', 'tiger', 'alien', 'lion', 'jaafar'].map((k, i) => (
                <img key={k} src={`/sprites/profile-${k}.jpg`} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${isDark ? '#0c2416' : '#fff'}`, marginInlineStart: i ? -10 : 0, boxShadow: '0 3px 8px rgba(0,0,0,0.18)' }} />
              ))}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: textMuted }}>{t('landing.kidsChars')}</span>
          </div>
          {/* gameplay previews */}
          <div className="kids-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 18 }}>
            {[
              { key: 'race',      span: 3, name: t('landing.kidsRaceName'),   tag: t('landing.kidsRaceTag'),   accent: '#10b981' },
              { key: 'flappy',    span: 3, name: t('landing.kidsFlappyName'), tag: t('landing.kidsFlappyTag'), accent: '#f59e0b' },
              { key: 'airplane',  span: 2, name: t('landing.kidsFlightName'), tag: t('landing.kidsFlightTag'), accent: '#06b6d4' },
              { key: 'tower',     span: 2, name: t('landing.kidsTowerName'),  tag: t('landing.kidsTowerTag'),  accent: '#6366f1' },
              { key: 'oddletter', span: 2, name: t('landing.kidsOddName'),    tag: t('landing.kidsOddTag'),    accent: '#0d9488' },
            ].map(g => (
              <KidsGameCard key={g.key} span={g.span} src={`/videos/game-${g.key}.mp4`} poster={`/videos/game-${g.key}-poster.jpg`} name={g.name} tag={g.tag} accent={g.accent} cardBg={cardBg} borderColor={borderColor} textMuted={textMuted} />
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 40 }}>
            <button onClick={onOpenAuth} style={{ background: isDark ? C.gold : C.green, color: isDark ? '#08321E' : '#fff', border: 'none', borderRadius: 999, padding: '14px 34px', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: F.body, boxShadow: '0 10px 26px rgba(14,74,43,0.25)' }}>
              {t('landing.kidsCta')}
            </button>
          </div>
        </div>
      </section>

      {/* ── 6. How it works ─────────────────────────────────────────────────── */}
      <section id="how" style={{ background: isDark ? '#0a1a10' : C.cream, padding: '80px 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>
              {t('landing.howTitle')}
            </h2>
            <p style={{ color: textMuted, fontSize: 16 }}>{t('landing.howSub')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24 }}>
            {[
              { roman: 'I',   title: t('landing.step1Title'), desc: t('landing.step1Desc') },
              { roman: 'II',  title: t('landing.step2Title'), desc: t('landing.step2Desc') },
              { roman: 'III', title: t('landing.step3Title'), desc: t('landing.step3Desc') },
              { roman: 'IV',  title: t('landing.step4Title'), desc: t('landing.step4Desc') },
            ].map(step => (
              <div key={step.roman} style={{ textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.green, color: C.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.display, fontSize: 18, fontWeight: 700, margin: '0 auto 16px' }}>
                  {step.roman}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: textPrimary, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6b. For Tutors (SaaS subscription) ──────────────────────────────── */}
      <section id="for-tutors" style={{ background: isDark ? '#0a1a10' : C.mint, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{ background: isDark ? 'rgba(14,74,43,0.4)' : '#fff', color: isDark ? C.goldSoft : C.green, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, display: 'inline-block', marginBottom: 14, border: `1px solid ${borderColor}` }}>{t('landing.forTutorsBadge')}</span>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>{t('landing.forTutorsTitle')}</h2>
            <p style={{ color: textMuted, fontSize: 16, maxWidth: 640, margin: '0 auto' }}>{t('landing.forTutorsSub')}</p>
          </div>

          {/* Feature grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 20, marginBottom: 44 }}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} style={{ background: cardBg, borderRadius: 16, padding: '24px 22px', border: `1px solid ${borderColor}` }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: textPrimary, marginBottom: 8 }}>{t(`landing.forTutorsFeat${n}Title`)}</h3>
                <p style={{ fontSize: 13, color: textMuted, lineHeight: 1.6 }}>{t(`landing.forTutorsFeat${n}Desc`)}</p>
              </div>
            ))}
          </div>

          {/* Subscription card */}
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            <div style={{ background: C.green, borderRadius: 20, padding: '36px 32px', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
                <StarPatternDefs id="tutor-pat" color={C.goldSoft} opacity={0.06} />
                <rect width="300" height="400" fill="url(#tutor-pat)" />
              </svg>
              <div style={{ position: 'relative' }}>
                <span style={{ background: C.gold, color: C.greenDeep, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, display: 'inline-block', marginBottom: 16 }}>{t('landing.tutorPlanBadge')}</span>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontFamily: F.display, fontSize: 52, fontWeight: 700, color: C.goldSoft, lineHeight: 1 }}>$20</span>
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16 }}>{t('landing.tutorPlanPer')}</span>
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 26 }}>{t('landing.tutorPlanDesc')}</p>
                <div style={{ display: 'inline-block', textAlign: 'start' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                      <CheckIcon dark /><span style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)' }}>{t(`landing.tutorPlanFeat${n}`)}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onOpenAuth} style={{ marginTop: 20, width: '100%', background: C.gold, border: 'none', color: C.greenDeep, borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}>{t('landing.tutorPlanCta')}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: sectionPaperBg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>
              {t('landing.pricingTitle')}
            </h2>
            <p style={{ color: textMuted, fontSize: 16 }}>{t('landing.pricingSub')}</p>
          </div>
          {/* Single flat rate — same for every student */}
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            <div style={{ background: C.green, borderRadius: 20, padding: '40px 32px', border: 'none', position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice">
                <StarPatternDefs id="rate-pat" color={C.goldSoft} opacity={0.06} />
                <rect width="300" height="400" fill="url(#rate-pat)" />
              </svg>
              <div style={{ position: 'relative' }}>
                <span style={{ background: C.gold, color: C.greenDeep, borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, display: 'inline-block', marginBottom: 18 }}>
                  {t('landing.planFlatBadge')}
                </span>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                  <span style={{ fontFamily: F.display, fontSize: 56, fontWeight: 700, color: C.goldSoft, lineHeight: 1 }}>$15</span>
                  <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 16 }}>{t('landing.planFlatPer')}</span>
                </div>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 28 }}>{t('landing.planFlatSessionLen')}</p>
                <div style={{ display: 'inline-block', textAlign: 'start' }}>
                  {[t('landing.planFlatFeature1'), t('landing.planFlatFeature2'), t('landing.planFlatFeature3')].map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'flex-start' }}>
                      <CheckIcon dark /><span style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button onClick={onOpenAuth} style={{ marginTop: 20, width: '100%', background: C.gold, border: 'none', color: C.greenDeep, borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}>
                  {t('landing.planFlatCta')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: sectionPaperBg, padding: '80px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: F.display, fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 600, color: isDark ? C.goldSoft : C.green, marginBottom: 12 }}>
              {t('landing.faqTitle')}
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ background: cardBg, borderRadius: 12, border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  style={{ width: '100%', textAlign: isRtl ? 'right' : 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
                >
                  <span style={{ fontWeight: 600, fontSize: 15, color: textPrimary, fontFamily: F.body }}>{faq.q}</span>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, transform: faqOpen === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: textMuted }}>
                    <path d="M4 6.5L9 11.5L14 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {faqOpen === i && (
                  <div style={{ padding: '0 20px 18px', fontSize: 14, color: textMuted, lineHeight: 1.7 }}>{faq.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. CTA Banner ──────────────────────────────────────────────────── */}
      <section style={{ padding: '48px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="cta-banner-inner" style={{
            background: ctaBannerBg, borderRadius: 24, textAlign: 'center',
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Star pattern bg */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 800 300" preserveAspectRatio="xMidYMid slice">
              <StarPatternDefs id="cta-pat" color={C.goldSoft} opacity={0.05} />
              <rect width="800" height="300" fill="url(#cta-pat)" />
            </svg>

            {/* Content */}
            <div style={{ position: 'relative' }}>
              <div style={{ fontFamily: F.arabic, fontSize: 28, color: C.goldSoft, direction: 'rtl', marginBottom: 20 }}>
                {t('landing.ctaBannerArabic')}
              </div>
              <h2 style={{ fontFamily: F.body, fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {t('landing.ctaBannerH2Part1')}
              </h2>
              <h2 style={{ fontFamily: F.display, fontStyle: 'italic', fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 600, color: C.goldSoft, marginBottom: 32 }}>
                {t('landing.ctaBannerH2Part2')}
              </h2>
              <button onClick={onOpenAuth}
                style={{ background: C.gold, color: C.greenDeep, border: 'none', borderRadius: 12, padding: '16px 36px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.ctaBannerCta')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 11. Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ background: isDark ? C.greenDeep : C.greenDeep, color: 'rgba(255,255,255,0.75)', padding: '56px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 32, marginBottom: 48 }}>
            {/* Brand column */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                <img src="/TQ LOGO DM.png" alt="Lisan & Quran" style={{ height: 36, width: 'auto' }} />
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.55)', maxWidth: 220 }}>{t('landing.footerDesc')}</p>
              {/* Language switcher in footer */}
              <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {(['en', 'ar', 'tr'] as const).map(lang => (
                  <button key={lang} onClick={() => setLanguage(lang)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: language === lang ? C.gold : 'rgba(255,255,255,0.1)', color: language === lang ? C.greenDeep : 'rgba(255,255,255,0.7)', fontFamily: F.body }}>
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Programs */}
            <div>
              <h4 style={{ fontWeight: 700, fontSize: 13, color: C.goldSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>{t('landing.footerColPrograms')}</h4>
              {[t('landing.footerLinkTajweed'), t('landing.footerLinkHifz'), t('landing.footerLinkConvArabic'), t('landing.footerLinkMSA')].map(link => (
                <a key={link} href="#programs" onClick={e => { e.preventDefault(); scrollTo('#programs'); }} style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10, textDecoration: 'none', cursor: 'pointer' }}>{link}</a>
              ))}
            </div>

            {/* Company */}
            <div>
              <h4 style={{ fontWeight: 700, fontSize: 13, color: C.goldSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>{t('landing.footerColCompany')}</h4>
              {[t('landing.footerLinkAbout'), t('landing.footerLinkCareers'), t('landing.footerLinkBlog')].map(link => (
                <a key={link} href="#" style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10, textDecoration: 'none' }}>{link}</a>
              ))}
            </div>

            {/* Support */}
            <div>
              <h4 style={{ fontWeight: 700, fontSize: 13, color: C.goldSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>{t('landing.footerColSupport')}</h4>
              {[t('landing.footerLinkFaq'), t('landing.footerLinkContact')].map(link => (
                <a key={link} href="#" style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10, textDecoration: 'none' }}>{link}</a>
              ))}
            </div>

            {/* Legal */}
            <div>
              <h4 style={{ fontWeight: 700, fontSize: 13, color: C.goldSoft, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Legal</h4>
              {[{ label: 'Pricing', href: '/pricing' }, { label: 'Terms of Service', href: '/terms' }, { label: 'Privacy Policy', href: '/privacy' }, { label: 'Refund Policy', href: '/refunds' }].map(link => (
                <a key={link.href} href={link.href} style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 10, textDecoration: 'none' }}>{link.label}</a>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{t('landing.footerCopyright')}</p>
            <p style={{ fontFamily: F.arabic, fontSize: 16, color: C.gold, direction: 'rtl' }}>{t('landing.footerVerse')}</p>
          </div>
        </div>
      </footer>

      {/* Responsive styles */}
      <style>{`
        /* ── Hero grid ── */
        .hero-grid {
          grid-template-columns: 1fr 1fr;
          padding: 72px 24px 64px;
        }
        @media (max-width: 768px) {
          .hero-grid {
            grid-template-columns: 1fr;
            padding: 40px 16px 40px;
            gap: 32px !important;
          }
        }

        /* ── Hero medallion — shrink on mobile ── */
        .hero-medallion-wrap { display: flex; justify-content: center; align-items: center; position: relative; }
        .hero-medallion-wrap svg:first-child { width: 340px; height: 340px; }
        .hero-medallion-circle { width: 220px !important; height: 220px !important; }
        @media (max-width: 480px) {
          .hero-medallion-wrap svg:first-child { width: 240px; height: 240px; }
          .hero-medallion-circle { width: 160px !important; height: 160px !important; }
          .hero-medallion-circle div { font-size: 44px !important; }
        }

        /* ── Floating hero cards — hide on single-column layout ── */
        @media (max-width: 768px) {
          .hero-float-card { display: none !important; }
        }

        /* ── Kids grid: stack on small screens ── */
        @media (max-width: 900px) {
          .kids-grid { grid-template-columns: 1fr !important; }
          .kids-grid > .kids-card { grid-column: span 1 !important; }
        }
        /* ── Section padding ── */
        @media (max-width: 640px) {
          section { padding-top: 52px !important; padding-bottom: 52px !important; }
          section > div { padding-left: 0 !important; padding-right: 0 !important; }
        }

        /* ── CTA banner ── */
        .cta-banner-inner { padding: 64px 48px; position: relative; overflow: hidden; }
        @media (max-width: 640px) {
          .cta-banner-inner { padding: 40px 20px !important; border-radius: 16px !important; }
        }

        /* ── Footer grid ── */
        @media (max-width: 640px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; gap: 24px !important; }
        }
        @media (max-width: 380px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }

        /* ── Tailwind compat ── */
        @media (max-width: 640px) {
          .hidden.sm\\:flex, .hidden.sm\\:block { display: none !important; }
        }
        @media (min-width: 640px) {
          .sm\\:flex { display: flex !important; }
          .sm\\:block { display: block !important; }
        }
        @media (min-width: 768px) {
          .md\\:hidden { display: none !important; }
          .hidden.md\\:flex { display: flex !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
