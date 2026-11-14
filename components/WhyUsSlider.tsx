import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nProvider';

// ─────────────────────────────────────────────────────────────────────────────
// WhyUsSlider — the first thing under the landing nav. Six reasons to choose us,
// each with three real screens of the app and a line of explanation under every
// picture. The pictures (public/why/*.webp, 4:3) are the app's own pages filled
// with made-up students: no real student appears anywhere in them.
//
// Behaviour
//  · Slides change every 8 s. The timer is the progress bar's own CSS animation
//    (`animationend` moves on), so what you see is exactly what the timer does.
//  · It pauses while the mouse is over it, while keyboard focus is inside it,
//    while it is off screen, and while the browser tab is hidden. The pause
//    button stops it for good (WCAG 2.2.2). Visitors who asked for reduced
//    motion get no autoplay and no sliding.
//  · All six slides sit stacked in one grid cell, so the height never jumps.
//    Only the active one is visible, focusable and announced (`inert`).
//  · Phones (< 900 px): the three pictures scroll sideways in a strip and the
//    dots change the slide. Swipes on the text change the slide too.
//  · Arrow keys, Home and End move between slides, mirrored for Arabic.
// ─────────────────────────────────────────────────────────────────────────────

// Same palette as LandingPage.tsx (kept local so the two files do not import each other).
const C = {
  green: '#0E4A2B', greenDeep: '#08321E', gold: '#C9A24A', goldSoft: '#E1C588',
  paper: '#FFFDF8', ink: '#1A2B22', line: '#E5DFCE',
};
const F = {
  body: "'DM Sans', sans-serif",
  display: "'Cormorant Garamond', serif",
  arabic: "'Amiri', 'Amiri Regular', serif",
};

const AUTOPLAY_MS = 8000;
const NARROW = '(max-width: 899px)';

// File names in public/why/, three per slide, in reading order.
const PICTURES: string[][] = [
  ['s1-homework', 's1-record', 's1-teacher'],
  ['s2-stats', 's2-chart', 's2-journey'],
  ['s3-ring', 's3-marks', 's3-donuts'],
  ['s4-colors', 's4-listen', 's4-tadabbur'],
  ['s5-qaedah', 's5-race', 's5-board'],
  ['s6-calendar', 's6-bell', 's6-arabic'],
];
const TOTAL = PICTURES.length;

// Every picture is exported 4:3; these two come from lower-resolution sources.
const PIC_SIZE: Record<string, [number, number]> = { 's5-race': [640, 480] };

const mod = (n: number) => ((n % TOTAL) + TOTAL) % TOTAL;

// A mouse click focuses a button too; only keyboard focus should hold the slides still.
const keyboardFocus = (el: EventTarget) => {
  if (!(el instanceof Element)) return false;
  try { return el.matches(':focus-visible'); } catch { return true; }
};

const Chevron: React.FC<{ pointsRight: boolean }> = ({ pointsRight }) => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={pointsRight ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
  </svg>
);

interface Nav { index: number; prev: number; dir: 1 | -1; moves: number }

interface WhyUsSliderProps {
  isDark: boolean;
  /** The "Book a free trial" action, same as the hero's first button. */
  onBook: () => void;
}

const WhyUsSlider: React.FC<WhyUsSliderProps> = ({ isDark, onBook }) => {
  const { t, language } = useI18n();
  const isRtl = language === 'ar';

  const [nav, setNav] = useState<Nav>({ index: 0, prev: 0, dir: 1, moves: 0 });
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageHidden, setPageHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [narrow, setNarrow] = useState(false);
  // Slides whose pictures have been asked for: the first, the next one, then every one visited.
  const [ready, setReady] = useState<number[]>([0, 1]);

  const rootRef = useRef<HTMLDivElement>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { index, prev, dir, moves } = nav;

  // ── Environment: reduced motion, phone width, tab visibility, on screen ──
  useEffect(() => {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const nw = window.matchMedia(NARROW);
    const onRm = () => setReduced(rm.matches);
    const onNw = () => setNarrow(nw.matches);
    onRm(); onNw();
    rm.addEventListener('change', onRm);
    nw.addEventListener('change', onNw);
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    onVis();
    return () => {
      rm.removeEventListener('change', onRm);
      nw.removeEventListener('change', onNw);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── Moving between slides ──
  const go = useCallback((target: number, dirHint?: 1 | -1) => {
    setNav(s => {
      const next = mod(target);
      if (next === s.index) return s;
      return { index: next, prev: s.index, dir: dirHint ?? (next > s.index ? 1 : -1), moves: s.moves + 1 };
    });
  }, []);
  const goNext = useCallback(() => go(index + 1, 1), [go, index]);
  const goPrev = useCallback(() => go(index - 1, -1), [go, index]);

  useEffect(() => {
    setReady(r => {
      const want = [index, mod(index + 1)].filter(i => !r.includes(i));
      return want.length ? [...r, ...want] : r;
    });
    // A slide that was left comes back with its strip at the first picture.
    stripRefs.current.forEach((el, i) => { if (el && i !== index) el.scrollTo({ left: 0 }); });
  }, [index]);

  // ── Autoplay ──
  const autoplay = !reduced;
  const animated = autoplay && !userPaused;
  const playing = animated && !hovering && !focusIn && inView && !pageHidden;

  // ── Input ──
  const inStrip = (target: EventTarget | null) =>
    narrow && target instanceof Element && !!target.closest('[data-why-strip]');

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || inStrip(e.target)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const forward = (e.key === 'ArrowRight') !== isRtl;
      forward ? goNext() : goPrev();
      e.preventDefault();
    } else if (e.key === 'Home') { go(0, -1); e.preventDefault(); }
    else if (e.key === 'End') { go(TOTAL - 1, 1); e.preventDefault(); }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = inStrip(e.target) ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current; touchStart.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x;
    const dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    // Dragging the content to the left brings the next slide (to the right in Arabic).
    (isRtl ? dx > 0 : dx < 0) ? goNext() : goPrev();
  };

  // ── Look ──
  const bandBg = isDark ? '#0B3A22' : C.green;
  const cardBg = isDark ? '#142012' : C.paper;
  const capColor = isDark ? '#e8ead6' : C.ink;
  const picBorder = isDark ? '#1f3828' : C.line;
  const shift = (isRtl ? -1 : 1) * 32; // px a slide travels while it comes or goes

  const css = `
    .why-root { padding: 48px 24px 40px; }
    .why-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: 'head ctrl' 'slides slides' 'tabs cta'; column-gap: 32px; row-gap: 28px; align-items: end; }
    .why-head-cell { grid-area: head; align-self: start; }
    .why-ctrl { grid-area: ctrl; display: flex; align-items: center; gap: 10px; }
    .why-stage { grid-area: slides; display: grid; }
    .why-tabs { grid-area: tabs; display: flex; gap: 16px; align-self: stretch; align-items: flex-end; }
    .why-dots { grid-area: tabs; display: none; align-items: center; }
    .why-cta { grid-area: cta; justify-self: end; }

    .why-head, .why-slide { grid-area: 1 / 1; opacity: 0; visibility: hidden; }
    .why-head { transition: opacity .3s ease, visibility 0s linear .3s; }
    .why-head.is-active { opacity: 1; visibility: visible; transition: opacity .45s ease .12s, visibility 0s; }
    .why-slide.is-active { opacity: 1; visibility: visible; }
    .why-slide.is-leaving { visibility: visible; animation: whyOut .35s ease both; pointer-events: none; }
    .why-slide.is-entering { animation: whyIn .5s cubic-bezier(.2, .7, .2, 1) both; }
    @keyframes whyIn { from { opacity: 0; transform: translateX(var(--why-from)); } to { opacity: 1; transform: none; } }
    @keyframes whyOut { from { opacity: 1; transform: none; visibility: visible; }
      to { opacity: 0; transform: translateX(var(--why-to)); visibility: hidden; } }

    .why-slide { display: flex; flex-direction: column; }
    .why-cards { flex: 1 1 auto; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; align-items: stretch; }
    .why-card { margin: 0; display: flex; flex-direction: column; gap: 16px; border-radius: 18px; padding: 10px 10px 20px; }
    .why-pic { position: relative; overflow: hidden; border-radius: 12px; aspect-ratio: 4 / 3; border: 1px solid; }
    .why-pic img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .why-cap { margin: 0; padding: 0 10px; display: flex; align-items: flex-start; gap: 12px; font-size: 15px; line-height: 1.55; }
    .why-num { flex: none; width: 26px; height: 26px; margin-top: 1px; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 13px; font-weight: 700; background: ${C.green}; color: ${C.goldSoft}; }

    .why-btn { width: 44px; height: 44px; border-radius: 50%; border: 1.5px solid rgba(255,253,248,.45);
      background: transparent; color: ${C.paper}; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
    .why-btn:hover { background: rgba(255,253,248,.14); }
    .why-tab { flex: 1 1 0; min-width: 0; background: none; border: 0; padding: 0; cursor: pointer; text-align: start; font-family: inherit; }
    .why-tab:hover .why-tab-label { color: ${C.paper}; }
    .why-bar { display: block; position: relative; overflow: hidden; height: 3px; border-radius: 2px; background: rgba(255,253,248,.22); }
    .why-fill { position: absolute; top: 0; bottom: 0; inset-inline-start: 0; background: ${C.goldSoft}; }
    .why-fill.is-run { width: 0; animation: whyFill ${AUTOPLAY_MS}ms linear forwards; }
    @keyframes whyFill { from { width: 0; } to { width: 100%; } }
    .why-dot { display: flex; align-items: center; justify-content: center; height: 44px; min-width: 24px; background: none; border: 0; padding: 0; cursor: pointer; }
    .why-dot-shape { display: block; position: relative; overflow: hidden; width: 8px; height: 8px; border-radius: 4px; background: rgba(255,253,248,.4); }
    .why-dot.is-active { min-width: 36px; }
    .why-dot.is-active .why-dot-shape { width: 28px; background: rgba(255,253,248,.22); }
    .why-cta { display: inline-block; background: ${C.gold}; color: ${C.greenDeep}; border: 0; border-radius: 10px;
      padding: 14px 28px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }
    .why-cta:hover { background: #D8B25C; }
    .why-btn:focus-visible, .why-tab:focus-visible, .why-dot:focus-visible, .why-cta:focus-visible, .why-cards:focus-visible {
      outline: 2px solid ${C.goldSoft}; outline-offset: 3px; }

    @media (max-width: 899px) {
      .why-root { padding: 32px 16px 28px; }
      .why-count { display: none; }
      .why-grid { grid-template-areas: 'head head' 'slides slides' 'tabs ctrl' 'cta cta'; row-gap: 20px; }
      .why-tabs { display: none; }
      .why-dots { display: flex; }
      .why-cta { justify-self: stretch; text-align: center; }
      .why-cards { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 0 16px; gap: 12px;
        margin: 0 -16px; padding: 4px 16px 18px; scrollbar-width: none; }
      .why-cards::-webkit-scrollbar { display: none; }
      .why-card { flex: 0 0 min(300px, 78vw); scroll-snap-align: start; gap: 14px; padding-bottom: 18px; }
      .why-cap { font-size: 14.5px; line-height: 1.5; padding: 0 8px; gap: 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .why-head, .why-head.is-active { transition: none; }
      .why-slide.is-entering { animation: none; }
      .why-slide.is-leaving { animation: none; visibility: hidden; }
      .why-fill.is-run { animation: none; width: 100%; }
    }
  `;

  // The bar inside a tab or dot: runs for the active slide, full behind it, empty ahead.
  const fill = (i: number) => {
    const active = i === index;
    if (!active) return <span className="why-fill" style={{ width: i < index ? '100%' : '0%' }} />;
    return (
      <span
        key={`${index}-${animated}`}
        className={`why-fill${animated ? ' is-run' : ''}`}
        style={{ ...(animated ? {} : { width: '100%' }), animationPlayState: playing ? 'running' : 'paused' }}
        onAnimationEnd={e => { if (e.animationName === 'whyFill') goNext(); }}
      />
    );
  };

  const tabLabel = (i: number) => t(`landing.whyS${i + 1}Tab`);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={t('landing.whyAria')}
      onKeyDown={onKeyDown}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHovering(true); }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHovering(false); }}
      onFocus={e => { if (keyboardFocus(e.target)) setFocusIn(true); }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }}
      className="why-root"
      style={{ position: 'relative', overflow: 'hidden', background: bandBg, fontFamily: F.body }}
    >
      <style>{css}</style>
      <svg aria-hidden="true" width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none' }}>
        <defs>
          <pattern id="whyStars" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
            <g fill={C.goldSoft} opacity="0.5"><polygon points="30,5 34,22 50,22 37,32 42,49 30,39 18,49 23,32 10,22 26,22" /></g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#whyStars)" />
      </svg>

      <div className="why-grid" style={{ position: 'relative', maxWidth: 1200, margin: '0 auto' }}>

        {/* Eyebrow + the six headings stacked in one cell (the tallest sets the height) */}
        <div className="why-head-cell" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <p style={{ margin: '0 0 14px', fontSize: isRtl ? 14 : 13, fontWeight: 600, color: C.goldSoft,
            letterSpacing: isRtl ? 0 : '0.08em', textTransform: isRtl ? 'none' : 'uppercase' }}>
            {t('landing.whyEyebrow')}
          </p>
          <div style={{ display: 'grid' }} aria-live={playing ? 'off' : 'polite'}>
            {PICTURES.map((_, i) => {
              const n = i + 1;
              const active = i === index;
              return (
                <div key={n} className={`why-head${active ? ' is-active' : ''}`} aria-hidden={!active}>
                  <h2 style={{ margin: 0, fontSize: 'clamp(30px, 4vw, 46px)', lineHeight: isRtl ? 1.4 : 1.12, fontWeight: 700, color: C.paper }}>
                    {t(`landing.whyS${n}H1`)}{' '}
                    <span style={{
                      fontFamily: isRtl ? F.arabic : F.display, fontStyle: isRtl ? 'normal' : 'italic', fontWeight: isRtl ? 700 : 600,
                      fontSize: '1.1em', color: C.goldSoft,
                    }}>
                      {t(`landing.whyS${n}H2`)}
                    </span>
                  </h2>
                  <p style={{ margin: '16px 0 0', maxWidth: 700, fontSize: 'clamp(15px, 1.4vw, 17px)', lineHeight: isRtl ? 1.8 : 1.6, color: 'rgba(255,253,248,.84)' }}>
                    {t(`landing.whyS${n}Sub`)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Pause, previous, next */}
        <div className="why-ctrl">
          <span className="why-count" aria-hidden="true" style={{ marginInlineEnd: 6, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'rgba(255,253,248,.78)' }}>
            <bdi dir="ltr">{index + 1} / {TOTAL}</bdi>
          </span>
          <button type="button" className="why-btn" onClick={() => setUserPaused(p => !p)}
            aria-label={userPaused || reduced ? t('landing.whyPlay') : t('landing.whyPause')}
            style={reduced ? { display: 'none' } : undefined}>
            {userPaused ? (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z" /></svg>
            ) : (
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1" /><rect x="13.5" y="5" width="4" height="14" rx="1" /></svg>
            )}
          </button>
          <button type="button" className="why-btn" onClick={goPrev} aria-label={t('landing.whyPrev')}>
            <Chevron pointsRight={isRtl} />
          </button>
          <button type="button" className="why-btn" onClick={goNext} aria-label={t('landing.whyNext')}>
            <Chevron pointsRight={!isRtl} />
          </button>
        </div>

        {/* The six slides, stacked; three pictures each */}
        <div className="why-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {PICTURES.map((pics, i) => {
            const n = i + 1;
            const active = i === index;
            const entering = active && moves > 0;
            const leaving = !active && i === prev && moves > 0;
            const cls = ['why-slide', active ? 'is-active' : '', entering ? 'is-entering' : '', leaving ? 'is-leaving' : ''].join(' ').trim();
            const vars = { '--why-from': `${dir * shift}px`, '--why-to': `${-dir * shift}px` } as React.CSSProperties;
            return (
              <div
                key={n}
                className={cls}
                role="group"
                aria-roledescription="slide"
                aria-label={t('landing.whySlide', { n, total: TOTAL, label: tabLabel(i) })}
                aria-hidden={!active}
                inert={!active}
                style={vars}
              >
                <div
                  className="why-cards"
                  data-why-strip=""
                  ref={el => { stripRefs.current[i] = el; }}
                  tabIndex={narrow && active ? 0 : undefined}
                  role={narrow ? 'group' : undefined}
                  aria-label={narrow ? tabLabel(i) : undefined}
                >
                  {pics.map((name, k) => {
                    const [w, h] = PIC_SIZE[name] ?? [960, 720];
                    return (
                      <figure key={name} className="why-card" style={{ background: cardBg, boxShadow: '0 18px 44px rgba(0,0,0,.28)' }}>
                        <div className="why-pic" style={{ borderColor: picBorder, background: isDark ? '#0f1e15' : '#F2EBD9' }}>
                          {ready.includes(i) && (
                            <img src={`/why/${name}.webp`} alt="" width={w} height={h} decoding="async"
                              fetchPriority={i === 0 && k === 0 ? 'high' : undefined} />
                          )}
                        </div>
                        <figcaption className="why-cap" style={{ color: capColor }}>
                          <span className="why-num" aria-hidden="true">{k + 1}</span>
                          <span>{t(`landing.whyS${n}C${k + 1}`)}</span>
                        </figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Labels with a progress bar (wide screens) */}
        <div className="why-tabs" role="group" aria-label={t('landing.whyTabsLabel')}>
          {PICTURES.map((_, i) => (
            <button key={i} type="button" className="why-tab" onClick={() => go(i, i > index ? 1 : -1)}
              aria-label={t('landing.whyGoTo', { n: i + 1, label: tabLabel(i) })}
              aria-current={i === index ? 'true' : undefined}>
              <span className="why-bar">{fill(i)}</span>
              <span className="why-tab-label" style={{
                display: 'block', marginTop: 10, fontSize: isRtl ? 14 : 13, fontWeight: 600, lineHeight: 1.3,
                color: i === index ? C.paper : 'rgba(255,253,248,.74)',
              }}>
                <span aria-hidden="true" style={{ marginInlineEnd: 6, fontVariantNumeric: 'tabular-nums', opacity: 0.7 }}>{i + 1}</span>
                {tabLabel(i)}
              </span>
            </button>
          ))}
        </div>

        {/* Dots (phones) */}
        <div className="why-dots" role="group" aria-label={t('landing.whyTabsLabel')}>
          {PICTURES.map((_, i) => (
            <button key={i} type="button" className={`why-dot${i === index ? ' is-active' : ''}`} onClick={() => go(i, i > index ? 1 : -1)}
              aria-label={t('landing.whyGoTo', { n: i + 1, label: tabLabel(i) })}
              aria-current={i === index ? 'true' : undefined}>
              <span className="why-dot-shape">{i === index ? fill(i) : null}</span>
            </button>
          ))}
        </div>

        <button type="button" className="why-cta" onClick={onBook}>{t('landing.heroCta1')}</button>
      </div>
    </div>
  );
};

export default WhyUsSlider;
