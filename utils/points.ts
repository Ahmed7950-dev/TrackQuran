// utils/points.ts
// -----------------------------------------------------------------------------
// Points, short enough to read at a glance.
//
// A leaderboard is scanned, not studied: "23k" lands in one look where "23,418"
// has to be counted. Under a thousand there is nothing to shorten, and between
// one and ten thousand a single decimal is kept — 1.2k and 9.8k are far apart,
// while rounding both to "1k" and "10k" would throw away the difference the
// student actually earned.
//
// The exact figure is never lost: every place that shows the short form puts
// the full number in its `title`.
// -----------------------------------------------------------------------------

/** 840 · 1.2k · 23k · 145k · 1.4m */
export function compactPoints(n: number): string {
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a < 1000) return `${v}`;
  if (a < 10_000) {
    const k = a / 1000;
    // 5.0k reads worse than 5k, so a trailing zero goes.
    return `${sign}${(Math.round(k * 10) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (a < 1_000_000) return `${sign}${Math.round(a / 1000)}k`;
  const m = a / 1_000_000;
  return `${sign}${(Math.round(m * 10) / 10).toFixed(1).replace(/\.0$/, '')}m`;
}

/** The exact number, for the tooltip beside the short one. */
export const exactPoints = (n: number): string => Math.round(n).toLocaleString();
