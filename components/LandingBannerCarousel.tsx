// ─────────────────────────────────────────────────────────────────────────────
// LandingBannerCarousel — the big banner right under the landing nav (replaced
// the small "Why us" slider, components/WhyUsSlider.tsx, at the user's request).
//
// The banners are finished 2:1 pictures with their words drawn in, so the
// frame keeps 2:1 at every width (1200 × 600 at most). The slides sit side by
// side on a track that slides sideways; it advances on its own every 7 s and
// stops while the pointer is over it, while it has keyboard focus, while the
// tab is hidden, and for anyone who asked for reduced motion. Arrows, dots,
// ← → keys and a phone swipe move it by hand. In Arabic the order runs right
// to left like the rest of the page.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Banner { src: string; small: string; alt: string }

// The words in the pictures, for screen readers and if a picture fails to load.
const BANNERS: Banner[] = [
  {
    src: '/banners/learning-meets-play.webp', small: '/banners/learning-meets-play-900.webp',
    alt: 'Where learning meets play. Make learning Arabic an exciting adventure with LisanQuran’s interactive educational games.',
  },
  {
    src: '/banners/follow-progress.webp', small: '/banners/follow-progress-900.webp',
    alt: 'Follow your child’s progress. Celebrate every achievement. Stay connected to your child’s learning journey with detailed insights and progress tracking.',
  },
];

const AUTOPLAY_MS = 7000;

const LandingBannerCarousel: React.FC<{ isDark: boolean; isRtl: boolean }> = ({ isDark, isRtl }) => {
  const [index, setIndex] = useState(0);
  const [hold, setHold] = useState(false);          // pointer over it or focus inside
  const [hidden, setHidden] = useState(false);       // tab in the background
  const [reduced, setReduced] = useState(false);
  const n = BANNERS.length;
  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const upd = () => setReduced(mq.matches);
    upd(); mq.addEventListener('change', upd);
    const vis = () => setHidden(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => { mq.removeEventListener('change', upd); document.removeEventListener('visibilitychange', vis); };
  }, []);

  useEffect(() => {
    if (hold || hidden || reduced || n < 2) return;
    const t = window.setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
  }, [index, hold, hidden, reduced, n, go]);

  // Phone swipe: a sideways drag of 40px or more turns the slide.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    // Swiping toward the start of the line shows the next banner.
    go(index + ((dx < 0) !== isRtl ? 1 : -1));
  };

  const arrow = (dir: 1 | -1) => {
    // Previous points back along the reading line, next forward (mirrored in Arabic).
    const pointsLeft = (dir === -1) !== isRtl;
    return (
      <button type="button" onClick={() => go(index + dir)} aria-label={dir === 1 ? 'Next' : 'Previous'}
        className="lbc-arrow">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={pointsLeft ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
        </svg>
      </button>
    );
  };

  return (
    <section aria-roledescription="carousel" aria-label="LisanQuran"
      className="lbc-root"
      onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHold(false); }}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(index + (isRtl ? -1 : 1)); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(index + (isRtl ? 1 : -1)); }
      }}>
      <style>{`
        .lbc-root { padding: 24px 24px 8px; }
        .lbc-frame { position: relative; max-width: 1200px; margin: 0 auto; aspect-ratio: 2 / 1; overflow: hidden;
          border-radius: 20px; background: #fff; box-shadow: 0 18px 50px -28px rgba(14, 74, 43, 0.45); }
        .lbc-track { display: flex; height: 100%; transition: transform 650ms cubic-bezier(.22,.7,.2,1); }
        .lbc-slide { flex: 0 0 100%; height: 100%; margin: 0; }
        .lbc-slide img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .lbc-arrow { width: 40px; height: 40px; border-radius: 50%; flex: none;
          border: 1.5px solid ${isDark ? 'rgba(255,255,255,.3)' : 'rgba(14,74,43,.25)'}; background: transparent;
          color: ${isDark ? '#E9E4D8' : '#0E4A2B'}; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .lbc-arrow:hover { border-color: #C9A227; }
        .lbc-arrow:focus-visible { outline: 3px solid #C9A227; outline-offset: 2px; }
        .lbc-nav { display: flex; justify-content: center; align-items: center; gap: 12px; margin-top: 12px; }
        .lbc-dots { display: flex; gap: 4px; }
        .lbc-dot { height: 32px; min-width: 24px; display: flex; align-items: center; justify-content: center;
          background: none; border: 0; padding: 0; cursor: pointer; }
        .lbc-dot span { display: block; width: 8px; height: 8px; border-radius: 4px; transition: width 250ms, background 250ms; }
        @media (max-width: 640px) {
          .lbc-root { padding: 12px 12px 4px; }
          .lbc-frame { border-radius: 12px; }
        }
        @media (prefers-reduced-motion: reduce) { .lbc-track { transition: none; } }
      `}</style>
      <div className="lbc-frame" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="lbc-track" dir="ltr" style={{ transform: `translateX(${(isRtl ? 1 : -1) * index * 100}%)`, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
          {BANNERS.map((b, i) => (
            <figure key={b.src} className="lbc-slide" aria-roledescription="slide" aria-label={`${i + 1} / ${n}`}
              aria-hidden={i !== index} {...(i !== index ? { inert: '' } as object : {})}>
              <img src={b.src} srcSet={`${b.small} 900w, ${b.src} 1774w`} sizes="(max-width: 1248px) calc(100vw - 48px), 1200px"
                alt={b.alt} width={1774} height={887} decoding="async" loading={i === 0 ? 'eager' : 'lazy'}
                {...(i === 0 ? { fetchpriority: 'high' } as object : {})} />
            </figure>
          ))}
        </div>
      </div>
      {n > 1 && (
        <div className="lbc-nav">
        {arrow(-1)}
        <div className="lbc-dots" role="group" aria-label="Choose a banner">
          {BANNERS.map((_, i) => (
            <button key={i} type="button" className="lbc-dot" onClick={() => go(i)} aria-label={`${i + 1}`} aria-current={i === index}>
              <span style={{ width: i === index ? 26 : 8, background: i === index ? '#C9A227' : (isDark ? 'rgba(255,255,255,.35)' : 'rgba(14,74,43,.25)') }} />
            </button>
          ))}
        </div>
        {arrow(1)}
        </div>
      )}
    </section>
  );
};

export default LandingBannerCarousel;
