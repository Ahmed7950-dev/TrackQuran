// utils/spreadLabels.ts
// ---------------------------------------------------------------------------
// A mistake comment sits above its letter, centred on it. Marks on two
// neighbouring letters (the ى of وَتُخۡفِى and of فِى) put one comment on top of
// the other: the student read one "Long" and saw the edge of a second. This
// slides the comments of each line sideways, as little as it can, until none
// overlap. They keep their order (that of their letters) and stay inside their
// box (at a line end a comment used to hang outside and be cut off on the
// student's iPad). A line too full for its comments shrinks them, down to 3/4
// size; past that they also overlap evenly, each still showing its start.
//
// A comment opts in with the `data-mistake-label` attribute and builds its
// transform from `var(--spread-x, 0px)` and `scale(var(--spread-s, 1))`, with
// `transform-origin: center bottom`; only those two variables are set here.
// ---------------------------------------------------------------------------
import React, { useEffect, useLayoutEffect, useRef } from 'react';

const GAP = 4;          // px between two comments
const PAD = 6;          // px kept clear of the box edge
const MIN_SCALE = 0.75; // smallest a comment shrinks on a crowded line

type Bounds = { left: number; right: number };

/** The space comments may use: the nearest ancestor that clips its overflow
 *  (the Quran box does), inside the visible screen. */
export const clipBounds = (el: HTMLElement): Bounds => {
  let left = 0;
  let right = document.documentElement.clientWidth || window.innerWidth;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (getComputedStyle(p).overflowX !== 'visible') {
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left);
      right = Math.min(right, r.right);
      break;
    }
  }
  return { left, right };
};

interface Item { el: HTMLElement; left: number; width: number; bottom: number }

/** Places every comment inside `root`. `box`, when given, is the element the
 *  comments must stay inside (as well as the box that clips them). */
export const spreadLabels = (root: HTMLElement, box?: HTMLElement | null): void => {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-mistake-label]'));
  if (!els.length) return;
  // Every comment back at its natural spot and size, all measured, then all
  // moved: one layout.
  for (const el of els) {
    el.style.setProperty('--spread-x', '0px');
    el.style.setProperty('--spread-s', '1');
  }
  const items: Item[] = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0) items.push({ el, left: r.left, width: r.width, bottom: r.bottom });
  }
  const own = box?.getBoundingClientRect();
  // Lines: the comments of one line all stand on its letters, so their bottoms meet.
  items.sort((a, b) => a.bottom - b.bottom);
  const lines: Item[][] = [];
  for (const it of items) {
    const line = lines[lines.length - 1];
    if (line && it.bottom - line[0].bottom <= 6) line.push(it);
    else lines.push([it]);
  }
  const place = (it: Item, centre: number, scale: number) => {
    const dx = Math.round(centre - (it.left + it.width / 2));
    if (dx) it.el.style.setProperty('--spread-x', `${dx}px`);
    if (scale < 1) it.el.style.setProperty('--spread-s', scale.toFixed(3));
  };
  /** Lays `its` side by side at `scale`, the first one's left edge at `left`. */
  const sideBySide = (its: Item[], left: number, scale: number) => {
    let x = left;
    for (const it of its) {
      place(it, x + (it.width * scale) / 2, scale);
      x += it.width * scale + GAP;
    }
  };
  for (const line of lines) {
    const clip = clipBounds(line[0].el);
    const lo = Math.max(clip.left, own ? own.left : -Infinity) + PAD;
    const hi = Math.min(clip.right, own ? own.right : Infinity) - PAD;
    const room = Math.max(0, hi - lo);
    line.sort((a, b) => (a.left + a.width / 2) - (b.left + b.width / 2));
    /** Where a run of comments laid side by side at `scale` moves its members
     *  least in all, kept inside the room when it fits. */
    const bestLeft = (its: Item[], scale: number, width: number) => {
      let offset = 0;
      let sum = 0;
      for (const i of its) {
        sum += i.left + i.width / 2 - (offset + (i.width * scale) / 2);
        offset += i.width * scale + GAP;
      }
      const best = sum / its.length;
      return width <= room ? Math.min(Math.max(best, lo), hi - width) : lo + (room - width) / 2;
    };
    type Run = { items: Item[]; left: number; width: number };
    const run = (its: Item[]): Run => {
      const width = its.reduce((s, i) => s + i.width, 0) + GAP * (its.length - 1);
      return { items: its, left: bestLeft(its, 1, width), width };
    };
    const runs = line.map(i => run([i]));
    for (let k = 0; k < runs.length - 1;) {
      const a = runs[k];
      const b = runs[k + 1];
      if (a.left + a.width + GAP > b.left + 0.5) {
        runs.splice(k, 2, run([...a.items, ...b.items]));
        if (k > 0) k--;  // the joined run may now reach the one before it
      } else {
        k++;
      }
    }
    for (const r of runs) {
      if (r.width <= room || r.items.length === 1) {
        sideBySide(r.items, r.left, 1);
        continue;
      }
      // Too full for the line: shrink until the comments fit side by side.
      const gaps = GAP * (r.items.length - 1);
      const natural = r.width - gaps;
      const scale = Math.max(MIN_SCALE, (room - gaps) / natural);
      const width = natural * scale + gaps;
      if (width <= room + 0.5) {
        sideBySide(r.items, bestLeft(r.items, scale, width), scale);
      } else {
        // Still too full at the smallest size: spread over the whole line,
        // overlapping evenly.
        const last = r.items[r.items.length - 1];
        const step = Math.max(0, (room - last.width * scale) / (r.items.length - 1));
        r.items.forEach((it, n) => place(it, lo + n * step + (it.width * scale) / 2, scale));
      }
    }
  }
};

/**
 * Keeps the comments inside `ref` apart: after every render (comments come
 * and go, words reflow), when the window resizes, when a font finishes
 * loading, and when the box changes size. `enabled` false leaves them alone.
 * `box` returns the element the comments must stay inside, when that is
 * narrower than the box that clips them.
 */
export const useSpreadLabels = (
  ref: React.RefObject<HTMLElement | null>,
  enabled = true,
  box?: () => HTMLElement | null,
): void => {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const boxRef = useRef(box);
  boxRef.current = box;
  const run = useRef(() => {
    if (enabledRef.current && ref.current) spreadLabels(ref.current, boxRef.current?.());
  }).current;
  const watched = useRef<{ el: HTMLElement; ro: ResizeObserver } | null>(null);

  useLayoutEffect(() => {
    run();
    const el = ref.current;
    if (el !== (watched.current?.el ?? null)) {
      watched.current?.ro.disconnect();
      watched.current = null;
      if (el && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => run());
        ro.observe(el);
        watched.current = { el, ro };
      }
    }
  });

  useEffect(() => {
    let raf = 0;
    const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
    window.addEventListener('resize', later);
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    fonts?.addEventListener?.('loadingdone', later);
    let alive = true;
    fonts?.ready.then(() => { if (alive) later(); }).catch(() => {});
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', later);
      fonts?.removeEventListener?.('loadingdone', later);
      watched.current?.ro.disconnect();
      watched.current = null;
    };
  }, [run]);
};
