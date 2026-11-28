import React, { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nProvider';
import { AppTheme, applyTheme, readTheme, nextTheme } from '../utils/theme';
import { landingPalette, LandingPalette } from '../utils/landingPalette';
import SharedThemeIcon from './ThemeIcon';
import LandingBannerCarousel from './LandingBannerCarousel';
import { LESSON_PRICES, LessonLength, MIN_LESSONS_PER_MONTH } from '../utils/lessonPricing';

// ─────────────────────────────────────────────────────────────────────────────
// The public landing page, built from the redesign made in Claude Design
// (Nov 2026, "LisanQuran landing redesign"): the banner carousel first, then a
// bold serif hero ("Learn Quran with confidence." with one word in bright green
// and a yellow bar), the four programs as one path, the games, the price
// picker, the teachers (with the way in for tutors), FAQ and a closing banner.
//
// The site is one online Quran school:
//  - students sign up at /join ("Student sign up"), tutors apply at /teach
//    ("Be a tutor with us");
//  - Quran only for now;
//  - one price for everyone ($10 / 25 min, $20 / 50 min, 4+ lessons a month,
//    utils/lessonPricing);
//  - follows the site's four looks through utils/landingPalette.
// Section titles are two strings, `xTitle` + `xTitleHl`; the second one is the
// highlighted half, so each language picks its own words to light up.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_LESSONS = MIN_LESSONS_PER_MONTH;
const LESSON_PRESETS = [4, 8, 12, 16, 20];

const F = {
  body:    "'DM Sans', sans-serif",
  // Fraunces has no Arabic: Arabic titles fall through to Amiri.
  display: "'Fraunces', 'Amiri', serif",
  arabic:  "'Amiri', 'Amiri Regular', serif",
};

const Check: React.FC<{ color: string; size?: number }> = ({ color, size = 18 }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4}
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

// ── The games: live screenshots in public/showcase (1440×900 + a 720px copy).
// `flex` lays them out two to a row in alternating widths. ───────────────────
const GAMES: { key: string; flex: string }[] = [
  { key: 'letter-race',    flex: '7 1 520px' },
  { key: 'letter-flight',  flex: '5 1 360px' },
  { key: 'letter-cards',   flex: '5 1 360px' },
  { key: 'castle-battle',  flex: '7 1 520px' },
  { key: 'flappy-letters', flex: '6 1 420px' },
  { key: 'build-the-word', flex: '6 1 420px' },
];
const gameKey = (k: string) => k.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

const PROGRAMS = ['Qaedah', 'Tajweed', 'Hifz', 'Ijazah'] as const;

interface LandingPageProps {
  onOpenAuth: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth }) => {
  const { t, language, setLanguage } = useI18n();
  const isRtl = language === 'ar';

  const [theme, setThemeState] = useState<AppTheme>(readTheme);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lessonLength, setLessonLength] = useState<LessonLength>(50);
  const [lessonsPerMonth, setLessonsPerMonth] = useState(8);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const P: LandingPalette = landingPalette(theme);

  const navLinks = [
    { label: t('landing.readerNav'),   href: '/quran' },
    { label: t('landing.navPrograms'), href: '#programs' },
    { label: t('landing.kidsNav'),     href: '#kids' },
    { label: t('landing.navPricing'),  href: '#pricing' },
    { label: t('landing.navFaq'),      href: '#faq' },
  ];

  const go = (href: string) => {
    setMobileNavOpen(false);
    if (href.startsWith('/')) { window.location.href = href; return; }
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };
  const studentSignup = () => { window.location.href = '/join'; };

  /** A section title: the plain half, then the highlighted half. */
  const title = (key: string) => (
    <>{t(`landing.${key}`)} <span style={{ color: P.lime }}>{t(`landing.${key}Hl`)}</span></>
  );
  const h2: React.CSSProperties = { fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(32px, 4vw, 52px)', lineHeight: 1.08, letterSpacing: '-0.01em', color: P.heading, margin: 0 };
  const eyebrow: React.CSSProperties = { margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: P.gold };
  const lead: React.CSSProperties = { fontSize: 17, color: P.muted, lineHeight: 1.6, margin: 0 };
  const primaryBtn: React.CSSProperties = { display: 'inline-block', textDecoration: 'none', border: 'none', cursor: 'pointer', fontFamily: F.body, fontSize: 16, fontWeight: 700, color: P.onAccent, background: P.accent, borderRadius: 12, padding: '16px 28px', boxShadow: `0 12px 28px ${P.accentShadow}` };
  const outlineBtn: React.CSSProperties = { display: 'inline-block', textDecoration: 'none', cursor: 'pointer', fontFamily: F.body, fontSize: 16, fontWeight: 600, color: P.outline, background: 'transparent', border: `1.5px solid ${P.outline}`, borderRadius: 12, padding: '15px 26px' };
  const chip: React.CSSProperties = { display: 'inline-block', fontSize: 12, fontWeight: 700, color: P.chipText, background: P.chipBg, borderRadius: 999, padding: '4px 12px' };

  const price = LESSON_PRICES[lessonLength];
  const monthly = price * lessonsPerMonth;

  const langSwitch = (compact: boolean) => (
    <div style={{ display: 'flex', gap: 2, background: P.chipBg, borderRadius: 8, padding: '3px 4px', alignItems: 'center' }}>
      {(['en', 'ar', 'tr'] as const).map(lang => (
        <button key={lang} onClick={() => setLanguage(lang)} aria-pressed={language === lang}
          style={{ padding: compact ? '3px 8px' : '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: compact ? 11 : 12, fontWeight: 700, fontFamily: F.body,
            background: language === lang ? P.accent : 'transparent', color: language === lang ? P.onAccent : P.muted }}>
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ fontFamily: F.body, background: P.bg, color: P.text, minHeight: '100vh' }}>
      {/* ── Announcement bar ─────────────────────────────────────────────── */}
      <div style={{ background: P.bandDeep, color: P.goldSoft, textAlign: 'center', padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>
        {t('landing.announcementBar')}
      </div>

      {/* ── Sticky header ────────────────────────────────────────────────── */}
      <nav aria-label="Main" style={{ position: 'sticky', top: 0, zIndex: 100, background: P.nav, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', borderBottom: `1px solid ${P.border}` }}>
        <div className="lp-bar" style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', alignItems: 'center', height: 72 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <img className="lp-logo" src={P.darkLogo ? '/TQ LOGO DM.png' : '/TQ LOGO.png'} alt="Lisan & Quran" style={{ width: 'auto' }} />
          </a>

          <div className="lp-links">
            {navLinks.map(link => (
              <button key={link.href} onClick={() => go(link.href)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, color: P.muted, fontFamily: F.body, padding: '4px 0', whiteSpace: 'nowrap' }}>
                {link.label}
              </button>
            ))}
          </div>

          <div className="lp-controls" style={{ display: 'flex', alignItems: 'center', marginInlineStart: 'auto' }}>
            <a href="/teach" className="lp-wide-only"
              style={{ fontSize: 14, fontWeight: 700, color: P.chipText, background: P.chipBg, borderRadius: 999, padding: '9px 16px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {t('landing.navBeTutor')}
            </a>
            <div className="lp-desktop-only">{langSwitch(true)}</div>
            <button className="lp-desktop-only" onClick={() => setThemeState(nextTheme)} title={t('landing.themeLabel')} aria-label={t('landing.themeLabel')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.muted, alignItems: 'center', padding: 6, borderRadius: 8 }}>
              <SharedThemeIcon theme={theme} className="w-[18px] h-[18px]" />
            </button>
            <button onClick={onOpenAuth} className="lp-desktop-only"
              style={{ background: 'none', border: `1.5px solid ${P.outline}`, color: P.outline, borderRadius: 10, padding: '8px 15px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F.body, whiteSpace: 'nowrap' }}>
              {t('landing.navSignIn')}
            </button>
            <button onClick={studentSignup} className="lp-signup"
              style={{ background: P.accent, color: P.onAccent, border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F.body, whiteSpace: 'nowrap' }}>
              {t('landing.navStudentSignup')}
            </button>
            <button className="lp-burger" onClick={() => setMobileNavOpen(o => !o)} aria-label="Menu" aria-expanded={mobileNavOpen}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: P.text, padding: 8 }}>
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
                style={{ display: 'block', width: '100%', textAlign: 'start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: P.text, padding: '11px 0', fontFamily: F.body }}>
                {link.label}
              </button>
            ))}
            <a href="/teach" style={{ display: 'block', fontSize: 15, fontWeight: 700, color: P.chipText, padding: '11px 0', textDecoration: 'none' }}>
              {t('landing.navBeTutor')} {isRtl ? '←' : '→'}
            </a>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={onOpenAuth} style={{ flex: 1, background: 'none', border: `1.5px solid ${P.outline}`, color: P.outline, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: F.body }}>
                {t('landing.navSignIn')}
              </button>
              <button onClick={studentSignup} style={{ flex: 1, background: P.accent, color: P.onAccent, border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: F.body }}>
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

      {/* ── Banner carousel: first thing under the header, edge to edge ──── */}
      <LandingBannerCarousel isDark={P.darkLogo} isRtl={isRtl} accent={P.yellow} ink={P.outline} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="lp-hero" style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 56 }}>
        <div style={{ flex: '1 1 480px', minWidth: 0 }}>
          <span style={{ ...chip, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '7px 14px' }}>{t('landing.heroEyebrow')}</span>
          <h1 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(44px, 6vw, 80px)', lineHeight: 1.04, letterSpacing: '-0.02em', margin: '22px 0 0', color: P.heading }}>
            {t('landing.heroL1Pre')}<span style={{ color: P.lime }}>{t('landing.heroL1Hl')}</span>{t('landing.heroL1Post')}
            <br />
            {t('landing.heroL2')}
          </h1>
          <div aria-hidden="true" style={{ width: 120, height: 8, borderRadius: 4, background: P.yellow, margin: '26px 0' }} />
          <p style={{ fontSize: 18, lineHeight: 1.6, color: P.muted, maxWidth: 520, margin: '0 0 32px' }}>{t('landing.heroSub')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <a href="/join" style={primaryBtn}>{t('landing.heroCta1')}</a>
            <button onClick={() => go('#pricing')} style={outlineBtn}>{t('landing.heroCta2')}</button>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '34px 0 0', display: 'flex', flexWrap: 'wrap', gap: '10px 22px', fontSize: 14, fontWeight: 600, color: P.text }}>
            {[1, 2, 3].map(n => (
              <li key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Check color={P.lime} />{t(`landing.heroFact${n}`)}</li>
            ))}
          </ul>
        </div>

        <div className="lp-hero-visual" style={{ flex: '1 1 460px', minWidth: 0, position: 'relative' }}>
          <div style={{ background: '#0B0F14', borderRadius: 26, padding: 12, boxShadow: `0 30px 70px ${P.accentShadow}` }}>
            {/* The real live logging page (a made-up student, Maryam): the marks a
                teacher puts on the exact letter during a lesson. */}
            <img src="/showcase/live-logging.webp" srcSet="/showcase/live-logging-720.webp 720w, /showcase/live-logging.webp 1440w"
              sizes="(max-width: 900px) 92vw, 560px" width={1440} height={900} fetchPriority="high"
              alt={t('landing.heroShotAlt')} style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 16 }} />
          </div>
          <a href="/quran" className="lp-reader-card"
            style={{ display: 'block', textDecoration: 'none', background: P.card, border: `1px solid ${P.border}`, borderRadius: 18, padding: '18px 20px', boxShadow: `0 18px 40px ${P.accentShadow}` }}>
            <span style={{ display: 'block', margin: '0 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.muted }}>{t('landing.heroReaderLabel')}</span>
            <span dir="rtl" lang="ar" style={{ display: 'block', fontFamily: F.arabic, fontSize: 26, lineHeight: 1.9, color: P.heading }}>ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ</span>
            <span style={{ display: 'block', margin: '4px 0 0', fontSize: 13, color: P.muted }}>{t('landing.heroReaderHint')}</span>
          </a>
          <div className="lp-price-chip" style={{ background: P.yellow, color: '#1C1606', borderRadius: 14, padding: '12px 16px', fontWeight: 700, fontSize: 14, boxShadow: `0 14px 30px ${P.accentShadow}` }}>
            {t('landing.heroPriceChip')}
          </div>
        </div>
      </section>

      {/* ── Programs: one path from the first letter to the Ijazah ───────── */}
      <section id="programs" style={{ background: P.alt, padding: '88px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ ...eyebrow, textAlign: 'center' }}>{t('landing.programsEyebrow')}</p>
          <h2 style={{ ...h2, textAlign: 'center', margin: '12px 0 14px' }}>{title('programsTitle')}</h2>
          <p style={{ ...lead, textAlign: 'center', maxWidth: 620, margin: '0 auto 56px' }}>{t('landing.programsSub')}</p>
          <div style={{ position: 'relative' }}>
            <div aria-hidden="true" className="lp-path-line" style={{ position: 'absolute', left: '6%', right: '6%', top: 34, height: 3, borderRadius: 2, background: P.border }} />
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 22 }}>
              {PROGRAMS.map((k, i) => (
                <li key={k} style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <span style={{ width: 68, height: 68, borderRadius: '50%', background: P.band, color: P.goldSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: F.display, fontWeight: 700, fontSize: 24, boxShadow: `0 0 0 8px ${P.alt}` }}>
                    {i + 1}
                  </span>
                  <div style={{ marginTop: 22, background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: '24px 22px', width: '100%', boxSizing: 'border-box', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <p dir="rtl" lang="ar" style={{ margin: 0, fontFamily: F.arabic, fontSize: 30, lineHeight: 1.4, color: P.gold }}>{t(`landing.program${k}Ar`)}</p>
                    <h3 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 24, margin: '6px 0 10px', color: P.text }}>{t(`landing.program${k}Name`)}</h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: P.muted, margin: '0 0 16px', flex: 1 }}>{t(`landing.program${k}Desc`)}</p>
                    <span style={chip}>{t(`landing.program${k}Level`)}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Games ────────────────────────────────────────────────────────── */}
      <section id="kids" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 36 }}>
            <div style={{ flex: '1 1 520px' }}>
              <p style={eyebrow}>{t('landing.kidsBadge')}</p>
              <h2 style={{ ...h2, marginTop: 10 }}>{title('kidsTitle')}</h2>
            </div>
            <p style={{ ...lead, flex: '1 1 360px', fontSize: 16 }}>{t('landing.kidsSubtitle')}</p>
          </div>
          <div className="lp-games">
            {GAMES.map(g => {
              const k = gameKey(g.key);
              const name = t(`landing.game_${k}_name`);
              return (
                <article key={g.key} className="lp-game" style={{ flex: g.flex, background: P.card, border: `1px solid ${P.border}` }}>
                  <img src={`/showcase/${g.key}.webp`} srcSet={`/showcase/${g.key}-720.webp 720w, /showcase/${g.key}.webp 1440w`}
                    sizes="(max-width: 640px) 86vw, (max-width: 1000px) 46vw, 680px"
                    alt={name} width={1440} height={900} loading="lazy" decoding="async" />
                  <div style={{ padding: '18px 22px 22px', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 14px' }}>
                    <h3 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 24, margin: 0, color: P.text }}>{name}</h3>
                    <span style={chip}>{t(`landing.game_${k}_meta`)}</span>
                    <p style={{ flexBasis: '100%', fontSize: 14, lineHeight: 1.55, color: P.muted, margin: '4px 0 0' }}>{t(`landing.game_${k}_tag`)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: P.alt, padding: '96px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ ...h2, textAlign: 'center', marginBottom: 12 }}>{title('pricingTitle')}</h2>
          <p style={{ ...lead, textAlign: 'center', maxWidth: 600, margin: '0 auto 44px' }}>{t('landing.pricingSub')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'stretch' }}>
            <div style={{ flex: '1.15 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div role="radiogroup" aria-label={t('landing.priceLengthLabel')} style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {([25, 50] as LessonLength[]).map(len => {
                  const on = lessonLength === len;
                  return (
                    <button key={len} type="button" role="radio" aria-checked={on} onClick={() => setLessonLength(len)}
                      style={{ flex: '1 1 220px', textAlign: 'start', cursor: 'pointer', fontFamily: F.body, borderRadius: 20, padding: 22,
                        background: on ? P.card : 'transparent', border: `2px solid ${on ? P.accent : P.border}`, color: P.text,
                        boxShadow: on ? `0 12px 30px ${P.accentShadow}` : 'none', transition: 'border-color .15s, box-shadow .15s' }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>
                        {t(len === 25 ? 'landing.priceShortName' : 'landing.priceLongName')}
                      </span>
                      <span style={{ display: 'block', fontFamily: F.display, fontWeight: 700, fontSize: 48, lineHeight: 1.1, color: P.heading, marginTop: 6 }}>
                        <span dir="ltr">${LESSON_PRICES[len]}</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 13, color: P.muted, marginTop: 2 }}>
                        {t('landing.pricePer')} · {t(len === 25 ? 'landing.priceShortNote' : 'landing.priceLongNote')}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 20, padding: 22 }}>
                <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.muted }}>{t('landing.priceLessonsLabel')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  {LESSON_PRESETS.map(n => {
                    const on = lessonsPerMonth === n;
                    return (
                      <button key={n} type="button" onClick={() => setLessonsPerMonth(n)} aria-pressed={on}
                        style={{ minWidth: 52, minHeight: 44, borderRadius: 12, cursor: 'pointer', fontFamily: F.body, fontWeight: 700, fontSize: 16,
                          border: `1.5px solid ${on ? P.accent : P.border}`, background: on ? P.accent : 'transparent', color: on ? P.onAccent : P.text }}>
                        {n}
                      </button>
                    );
                  })}
                  <span style={{ marginInlineStart: 'auto', display: 'inline-flex', alignItems: 'center', border: `1.5px solid ${P.border}`, borderRadius: 12 }}>
                    <button type="button" aria-label={t('landing.priceFewer')} disabled={lessonsPerMonth <= MIN_LESSONS}
                      onClick={() => setLessonsPerMonth(n => Math.max(MIN_LESSONS, n - 1))}
                      style={{ width: 44, height: 44, border: 0, background: 'none', fontSize: 22, color: P.text, cursor: lessonsPerMonth <= MIN_LESSONS ? 'default' : 'pointer', opacity: lessonsPerMonth <= MIN_LESSONS ? 0.35 : 1 }}>−</button>
                    <span aria-live="polite" style={{ minWidth: 34, textAlign: 'center', fontWeight: 800, fontSize: 17 }}>{lessonsPerMonth}</span>
                    <button type="button" aria-label={t('landing.priceMore')} onClick={() => setLessonsPerMonth(n => Math.min(60, n + 1))}
                      style={{ width: 44, height: 44, border: 0, background: 'none', fontSize: 22, color: P.text, cursor: 'pointer' }}>+</button>
                  </span>
                </div>
                <p style={{ margin: '12px 0 0', fontSize: 13, color: P.muted }}>{t('landing.priceMinNote')}</p>
              </div>
            </div>

            <div style={{ flex: '1 1 340px', minWidth: 0, background: P.band, color: P.onBand, borderRadius: 24, padding: '34px 32px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, color: '#1C1606', background: P.yellow, borderRadius: 999, padding: '4px 12px' }}>{t('landing.priceBadge')}</span>
              <p style={{ margin: '22px 0 0', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: P.onBandMuted }}>{t('landing.priceMonthly')}</p>
              <p style={{ margin: '4px 0 0', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span dir="ltr" style={{ fontFamily: F.display, fontWeight: 700, fontSize: 72, lineHeight: 1, color: P.goldSoft }}>${monthly}</span>
                <span style={{ fontSize: 16, color: P.onBandMuted }}>{t('landing.pricePerMonth')}</span>
              </p>
              <p style={{ margin: '8px 0 26px', fontSize: 14, color: P.onBandMuted }}>
                {t('landing.priceBreakdown', { n: lessonsPerMonth, price, len: lessonLength })}
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 30px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 15 }}>
                {[1, 2, 3].map(n => (
                  <li key={n} style={{ display: 'flex', gap: 10 }}><Check color={P.goldSoft} size={20} />{t(`landing.priceFeature${n}`)}</li>
                ))}
              </ul>
              <a href="/join" style={{ marginTop: 'auto', textAlign: 'center', textDecoration: 'none', fontSize: 16, fontWeight: 800, color: P.onBandButton, background: P.bandButton, borderRadius: 14, padding: 16 }}>
                {t('landing.priceCta')}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Teachers, and the way in for tutors ──────────────────────────── */}
      <section id="teachers" style={{ padding: '96px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 48, alignItems: 'center' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <p style={eyebrow}>{t('landing.teachersEyebrow')}</p>
            <h2 style={{ ...h2, fontSize: 'clamp(32px, 4vw, 50px)', margin: '10px 0 18px' }}>{title('teachersTitle')}</h2>
            <p style={{ ...lead, margin: '0 0 18px', lineHeight: 1.65 }}>{t('landing.teachersBody')}</p>
            <p style={{ fontFamily: F.display, fontStyle: 'italic', fontWeight: 500, fontSize: 20, color: P.text, margin: '0 0 30px' }}>{t('landing.teachersQuote')}</p>
            <div style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 18, padding: '20px 22px', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: P.text }}>{t('landing.ctaTutorPrompt')}</p>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: P.muted }}>{t('landing.tutorCardSub')}</p>
              </div>
              <a href="/teach" style={{ textDecoration: 'none', fontSize: 15, fontWeight: 700, color: P.chipText, background: P.chipBg, borderRadius: 12, padding: '12px 18px', whiteSpace: 'nowrap' }}>
                {t('landing.navBeTutor')}
              </a>
            </div>
          </div>
          <div style={{ flex: '1 1 420px', minWidth: 0, borderRadius: 24, overflow: 'hidden', border: `1px solid ${P.border}`, background: '#FFFFFF' }}>
            <img src="/banners/teaching-standards.webp" alt={t('landing.teachersImgAlt')} loading="lazy" decoding="async"
              style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', objectPosition: '82% 50%' }} />
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: P.alt, padding: '96px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 48 }}>
          <div style={{ flex: '1 1 280px' }}>
            <h2 style={{ ...h2, fontSize: 'clamp(32px, 4vw, 48px)', marginBottom: 14 }}>{title('faqTitle')}</h2>
            <p style={{ ...lead, fontSize: 16 }}>{t('landing.faqSub')}</p>
          </div>
          <div style={{ flex: '2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <details key={n} open={n === 1} className="lp-faq" style={{ background: P.card, border: `1px solid ${P.border}`, borderRadius: 16, padding: '18px 22px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16, color: P.text }}>{t(`landing.faq${n}Q`)}</summary>
                <p style={{ margin: '12px 0 0', fontSize: 15, lineHeight: 1.65, color: P.muted }}>{t(`landing.faq${n}A`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing banner ───────────────────────────────────────────────── */}
      <section style={{ padding: '96px 24px' }}>
        <div className="lp-closing" style={{ maxWidth: 1200, margin: '0 auto', background: P.bandDeep, borderRadius: 28, textAlign: 'center' }}>
          <p dir="rtl" lang="ar" style={{ margin: '0 0 16px', fontFamily: F.arabic, fontSize: 30, color: P.goldSoft }}>{t('landing.ctaBannerArabic')}</p>
          <h2 style={{ fontFamily: F.display, fontWeight: 700, fontSize: 'clamp(34px, 4.6vw, 60px)', lineHeight: 1.05, margin: '0 0 30px', color: P.onBand }}>
            {t('landing.ctaBannerH2Part1')} <span style={{ color: P.goldSoft }}>{t('landing.ctaBannerH2Part2')}</span>
          </h2>
          <a href="/join" style={{ display: 'inline-block', textDecoration: 'none', fontSize: 17, fontWeight: 800, color: P.onBandButton, background: P.bandButton, borderRadius: 14, padding: '18px 36px' }}>
            {t('landing.ctaBannerCta')}
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer style={{ background: P.bandDeep, color: P.onBandMuted, padding: '56px 24px 28px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '36px 56px', marginBottom: 40 }}>
            <div style={{ flex: '1.4 1 240px' }}>
              <img src="/TQ LOGO DM.png" alt="Lisan & Quran" style={{ height: 44, width: 'auto', display: 'block', marginBottom: 14 }} />
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>{t('landing.footerDesc')}</p>
              <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {(['en', 'ar', 'tr'] as const).map(lang => (
                  <button key={lang} onClick={() => setLanguage(lang)}
                    style={{ padding: '6px 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: F.body, background: language === lang ? P.bandButton : 'rgba(255,255,255,0.1)', color: language === lang ? P.onBandButton : P.onBandMuted }}>
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {[
              { title: t('landing.footerColPrograms'), links: PROGRAMS.map(k => ({ label: t(`landing.program${k}Name`), href: '#programs' })) },
              { title: t('landing.footerColSchool'), links: [
                { label: t('landing.navStudentSignup'), href: '/join' },
                { label: t('landing.navBeTutor'), href: '/teach' },
                { label: t('landing.readerNav'), href: '/quran' },
              ] },
              { title: t('landing.footerColLegal'), links: [
                { label: t('landing.footerLinkTerms'), href: '/terms' },
                { label: t('landing.footerLinkPrivacy'), href: '/privacy' },
                { label: t('landing.footerLinkRefunds'), href: '/refunds' },
              ] },
            ].map(col => (
              <div key={col.title} style={{ flex: '1 1 150px' }}>
                <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: P.goldSoft }}>{col.title}</p>
                {col.links.map(link => (
                  <a key={link.label} href={link.href}
                    onClick={link.href.startsWith('#') ? e => { e.preventDefault(); go(link.href); } : undefined}
                    style={{ display: 'block', margin: '0 0 10px', fontSize: 14, color: P.onBandMuted, textDecoration: 'none' }}>
                    {link.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 22, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <span>© {new Date().getFullYear()} Lisan &amp; Quran</span>
            <span dir="rtl" lang="ar" style={{ fontFamily: F.arabic, fontSize: 18, color: P.gold }}>{t('landing.footerVerse')}</span>
          </div>
        </div>
      </footer>

      <style>{`
        /* Header: the links need room; below 1180px they move into the menu */
        .lp-bar { padding: 0 20px; gap: 22px; }
        .lp-logo { height: 52px; }
        .lp-controls { gap: 10px; }
        .lp-desktop-only, .lp-wide-only { display: flex; }
        .lp-links { flex: 1; display: flex; justify-content: center; gap: 24px; align-items: center; }
        .lp-burger { display: none; }
        @media (max-width: 1180px) {
          .lp-links { display: none; }
          .lp-burger { display: block; }
        }
        @media (max-width: 820px) { .lp-wide-only { display: none; } }
        @media (max-width: 640px) {
          .lp-bar { padding: 0 12px; gap: 10px; }
          .lp-logo { height: 42px; }
          .lp-controls { gap: 6px; }
          .lp-desktop-only { display: none; }
          .lp-signup { padding: 9px 12px !important; font-size: 13px !important; }
        }

        /* Hero: the reader card and the price chip float over the screenshot */
        .lp-hero { padding: 72px 24px 88px; }
        .lp-hero-visual { padding-bottom: 70px; }
        .lp-reader-card { position: absolute; inset-inline-start: -18px; bottom: 0; width: min(330px, 78%); box-sizing: border-box; }
        .lp-price-chip { position: absolute; inset-inline-end: 18px; bottom: 34px; }
        @media (max-width: 640px) {
          .lp-hero { padding: 40px 16px 56px; gap: 36px !important; }
          .lp-hero-visual { padding-bottom: 0; display: flex; flex-direction: column; gap: 14px; }
          .lp-reader-card, .lp-price-chip { position: static; width: auto; }
          .lp-price-chip { align-self: flex-start; }
        }

        /* Programs: on one row the circles sit on a line; stacked, no line */
        @media (max-width: 1100px) { .lp-path-line { display: none; } }

        /* Games: two to a row in alternating widths; a swipeable row on phones */
        .lp-games { display: flex; flex-wrap: wrap; gap: 20px; }
        .lp-game { min-width: 0; border-radius: 22px; overflow: hidden; display: flex; flex-direction: column;
          transition: transform .2s ease, box-shadow .2s ease; }
        .lp-game:hover { transform: translateY(-4px); box-shadow: 0 18px 44px rgba(0,0,0,0.14); }
        .lp-game img { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; }
        @media (prefers-reduced-motion: reduce) { .lp-game { transition: none; } .lp-game:hover { transform: none; } }
        @media (max-width: 640px) {
          .lp-games { flex-wrap: nowrap; overflow-x: auto; scroll-snap-type: x mandatory; gap: 14px;
            margin: 0 -16px; padding: 4px 16px 18px; scrollbar-width: none; }
          .lp-games::-webkit-scrollbar { display: none; }
          .lp-game { flex: 0 0 86% !important; scroll-snap-align: center; }
        }

        .lp-faq summary::marker { color: ${P.lime}; }
        .lp-closing { padding: 72px 32px; }

        /* Section padding on phones */
        @media (max-width: 640px) {
          #programs, #kids, #pricing, #teachers, #faq { padding: 56px 16px !important; }
          .lp-closing { padding: 44px 20px; border-radius: 20px !important; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
