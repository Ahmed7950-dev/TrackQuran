import React, { useEffect, useRef, useState } from 'react';
import lottie from 'lottie-web';

/**
 * Small reusable Lottie icon. Fetches a public-folder JSON and renders it as an
 * inline SVG animation. Plays once on mount and again on hover by default.
 *
 * In dark mode the black STROKES are redrawn white. The avatars are line
 * drawings — 617 of the 1,174 colour stops across public/avatars are a pure
 * black stroke — so on a dark background the drawing all but disappears. Only
 * strokes are touched: the red and teal details keep their colour, and a black
 * FILL (4 in the whole set) is left alone so a filled shape doesn't turn into a
 * white blob.
 *
 * Half of these files don't take their colour from the shape at all: they carry
 * a null control layer ("Main Stroke width - Color Ctrl") whose "Base Color"
 * effect the strokes bind to by expression, so recolouring the shape alone left
 * them stubbornly black. A black effect COLOUR VALUE is therefore whitened too;
 * the teal "Highlight" beside it is nowhere near black and is left as it is.
 */

/** Anything this dark counts as "the line". */
const BLACK = 0.16;

const isBlack = (k: unknown): boolean =>
  Array.isArray(k) && k.length >= 3
  && k.slice(0, 3).every(v => typeof v === 'number' && v <= BLACK);

/** Turn one { a, k } colour holder white, keeping its alpha. */
const whitenValue = (holder: Record<string, unknown>): void => {
  if (!holder || !isBlack(holder.k)) return;
  const k = holder.k as number[];
  holder.k = k.length > 3 ? [1, 1, 1, k[3]] : [1, 1, 1];
};

/** Deep copy with every black stroke — and every black colour control — white. */
const whitenStrokes = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(whitenStrokes);
  if (node && typeof node === 'object') {
    const src = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(src)) out[key] = whitenStrokes(value);
    // 'st' = stroke, 'gs' = gradient stroke. `c.k` is [r,g,b(,a)] in 0..1, or a
    // keyframe list when the colour is animated — only the static form is
    // recoloured, which is what these files use.
    if ((src.ty === 'st' || src.ty === 'gs') && src.c && typeof src.c === 'object') {
      whitenValue(out.c as Record<string, unknown>);
    }
    // An effect's colour value: { ty: 2, nm: 'Base Color', v: { a: 0, k: [...] } }.
    // Layers are typed with NUMBERS and shapes with strings, so `ty === 2` here
    // can only be a colour control — and it must carry a `v` to be one.
    if (src.ty === 2 && src.v && typeof src.v === 'object') {
      whitenValue(out.v as Record<string, unknown>);
    }
    return out;
  }
  return node;
};

/** Is the app in dark mode right now? */
const darkNow = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

const LottieIcon: React.FC<{
  src: string;
  size?: number;
  loop?: boolean;
  autoplay?: boolean;
  playOnHover?: boolean;
  /** Controlled playback — when provided, plays while true and rests at frame 0
   *  while false (overrides autoplay/hover). */
  play?: boolean;
  /** Redraw black lines white while the app is in dark mode. Opt-in: an icon
   *  sitting on a light surface must keep its black lines. */
  adaptDarkStrokes?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ src, size = 20, loop = false, autoplay = true, playOnHover = true, play, adaptDarkStrokes = false, className, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<typeof lottie.loadAnimation> | null>(null);

  // Re-render the animation when the theme changes — the colours are baked into
  // the data lottie-web is given, so a class flip has to rebuild it.
  const [dark, setDark] = useState(() => adaptDarkStrokes && darkNow());
  useEffect(() => {
    if (!adaptDarkStrokes) return;
    const obs = new MutationObserver(() => setDark(darkNow()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [adaptDarkStrokes]);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    fetch(src)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !ref.current) return;
        const anim = lottie.loadAnimation({
          container: ref.current,
          animationData: dark ? whitenStrokes(data) : data,
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
  }, [src, loop, autoplay, dark]);

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
