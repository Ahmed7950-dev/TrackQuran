import React, { useEffect, useRef } from 'react';
import lottie from 'lottie-web';

/**
 * Small reusable Lottie icon. Fetches a public-folder JSON and renders it as an
 * inline SVG animation. Plays once on mount and again on hover by default.
 */
const LottieIcon: React.FC<{
  src: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  playOnHover?: boolean;
  /** Controlled playback — when provided, plays while true and rests at frame 0
   *  while false (overrides autoplay/hover). */
  play?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ src, size = 20, loop = false, autoplay = true, playOnHover = true, play, className, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<typeof lottie.loadAnimation> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    fetch(src)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !ref.current) return;
        const anim = lottie.loadAnimation({
          container: ref.current,
          animationData: data,
          renderer: 'svg',
          loop,
          autoplay: play === undefined ? autoplay : false,
        });
        animRef.current = anim;
        if (play === false) anim.goToAndStop(0, true);
        else if (play === true) anim.play();
      })
      .catch(() => {});
    return () => { cancelled = true; animRef.current?.destroy(); animRef.current = null; };
  }, [src, loop, autoplay]);

  useEffect(() => {
    const a = animRef.current;
    if (play === undefined || !a) return;
    if (play) a.goToAndPlay(0, true); else a.goToAndStop(0, true);
  }, [play]);

  const replay = () => {
    if (!playOnHover || !animRef.current) return;
    animRef.current.goToAndPlay(0, true);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={replay}
      className={className}
      style={{ width: size, height: size, flexShrink: 0, ...style }}
      aria-hidden="true"
    />
  );
};

export default LottieIcon;
