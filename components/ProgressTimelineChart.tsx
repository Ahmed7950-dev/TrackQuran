// components/ProgressTimelineChart.tsx
// -----------------------------------------------------------------------------
// Progress over time — the three lines on ONE timeline.
//
// It used to be three charts behind a toggle, which made the question a tutor
// actually asks impossible to answer: did the mistakes climb in the week he
// read more? Reading, hifdh and mistakes-per-page now share one time axis.
// Pointing at a line brings it forward and pushes the other two back, so three
// lines never turn into a thicket.
//
// Two axes, because two units: pages on the left (reading and hifdh share it,
// they are the same thing counted), mistakes per page on the right. The axis
// belonging to whatever is being pointed at lights up with it.
//
// Under the plot runs the HOMEWORK RAIL: every closed homework at its own
// date — a green tick for done, a red cross for wasn't done — with a hairline
// rising into the plot so it reads as part of the chart rather than a strip
// bolted underneath.
//
// Colours are four distinguishable hues on purpose. Mistakes-per-page is amber
// rather than the red it used to be, so red can mean one thing only: homework
// that was not done.
// -----------------------------------------------------------------------------
import React, { useMemo, useRef, useState } from 'react';
import type {
  RecitationAchievement, MemorizationAchievement, Mistake, QuranHomework,
} from '../types';
import { useI18n } from '../context/I18nProvider';
import { touchedPageSet, getPageOfAyah } from '../services/dataService';
import { outcomeOf } from '../utils/quranHomework';
import { homeworkRange } from './HomeworkTab';

/* ── The canvas ──────────────────────────────────────────────────────────── */

const W = 920;
const H = 398;
const M = { top: 22, right: 58, bottom: 108, left: 54 };
const PW = W - M.left - M.right;   // plot width
const PH = H - M.top - M.bottom;   // plot height
/** The homework rail sits below the x-axis, in the same translated group. */
const RAIL_Y = PH + 30;
const ROW_H = 19;
const CHIP_R = 9;
/** Chips closer together than this are moved to the rail's second row. */
const CHIP_GAP = 21;

type SeriesId = 'reading' | 'hifdh' | 'mistakes';

interface Pt {
  /** UTC midnight of the day, in ms — the x of everything on this chart. */
  t: number;
  v: number;
  /** What the tooltip says under the value. */
  note?: string;
}

interface Mark {
  t: number;
  outcome: 'done' | 'missed';
  label: string;
  /** Said plainly, because a legacy homework only knows when it was GIVEN. */
  when: string;
}

interface Chip {
  t: number;
  outcome: 'done' | 'missed';
  row: 0 | 1;
  items: Mark[];
}

const DAY = 86_400_000;
const dayOf = (iso: string): string => iso.slice(0, 10);
const msOf = (dayKey: string): number => Date.parse(`${dayKey}T00:00:00Z`);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A curve through the points that never overshoots them.
 *
 * Fritsch–Carlson tangents: where the slope changes sign the tangent is flat,
 * so a quiet week followed by a heavy one bulges upward in a plain cubic but
 * stays put here. On a progress chart an invented dip below zero pages is not
 * a prettier line, it is a lie.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  if (n === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;

  const dx: number[] = [], slope: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i];
  }
  m[0] = slope[0];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) { m[i] = 0; continue; }
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }
  m[n - 1] = slope[n - 2];

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i].x + h},${pts[i].y + m[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

/** Where a series sits at a given x, straight-line between its two nearest
 *  points — close enough to decide what the mouse is pointing at. */
function yAt(pts: { x: number; y: number }[], x: number): number | null {
  if (!pts.length) return null;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      const span = pts[i + 1].x - pts[i].x;
      const k = span === 0 ? 0 : (x - pts[i].x) / span;
      return pts[i].y + (pts[i + 1].y - pts[i].y) * k;
    }
  }
  return null;
}

const RANGES = [
  { id: '30', label: '30 days', days: 30 },
  { id: '90', label: '3 months', days: 90 },
  { id: 'all', label: 'All', days: Infinity },
] as const;
type RangeId = typeof RANGES[number]['id'];

interface Props {
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  mistakes: Record<string, Mistake>;
  homework?: QuranHomework[];
}

const ProgressTimelineChart: React.FC<Props> = ({
  recitationAchievements, memorizationAchievements, mistakes, homework = [],
}) => {
  const { t, language } = useI18n();
  const boxRef = useRef<HTMLDivElement>(null);

  const [range, setRange] = useState<RangeId | null>(null);   // null = work it out
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [hoverSeries, setHoverSeries] = useState<SeriesId | null>(null);
  const [locked, setLocked] = useState<SeriesId | null>(null);
  const [hoverChip, setHoverChip] = useState<number | null>(null);

  /* ── Everything there is, before the window is applied ── */
  const all = useMemo(() => {
    const byDay = (list: { date: string; pagesCompleted?: number }[]) => {
      const map = new Map<string, number>();
      for (const a of list) {
        const k = dayOf(a.date);
        map.set(k, (map.get(k) ?? 0) + (a.pagesCompleted ?? 0));
      }
      return [...map.entries()]
        .filter(([, pages]) => pages > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, pages]): Pt => ({ t: msOf(k), v: pages }));
    };

    // Mistakes per page, day by day: the red letters marked that day over the
    // pages that day's reading touched. A fixed (yellow) letter is not a
    // mistake any more and is not counted.
    const perDay = new Map<string, number>();
    const pagesOfMistakes = new Map<string, Set<number>>();
    for (const [key, m] of Object.entries(mistakes)) {
      const [su, ay] = key.split(':').map(Number);
      if (Number.isNaN(su) || Number.isNaN(ay) || !m.errorType) continue;
      const day = (m.date ?? '').slice(0, 10);
      if (!day) continue;
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      const set = pagesOfMistakes.get(day) ?? new Set<number>();
      set.add(getPageOfAyah(su, ay));
      pagesOfMistakes.set(day, set);
    }
    const slipDays = [...new Set([
      ...recitationAchievements.map(a => dayOf(a.date)),
      ...memorizationAchievements.map(a => dayOf(a.date)),
      ...perDay.keys(),
    ])].sort();
    const mistakeSeries = slipDays.map((k): Pt => {
      const rec = recitationAchievements.filter(a => dayOf(a.date) === k);
      const mem = memorizationAchievements.filter(a => dayOf(a.date) === k);
      const pages = new Set<number>([
        ...touchedPageSet(rec as never), ...touchedPageSet(mem as never),
        ...(pagesOfMistakes.get(k) ?? []),
      ]);
      const n = perDay.get(k) ?? 0;
      return {
        t: msOf(k),
        v: pages.size > 0 ? Math.round((n / pages.size) * 10) / 10 : 0,
        note: `${n} mistake${n === 1 ? '' : 's'} · ${pages.size} page${pages.size === 1 ? '' : 's'}`,
      };
    });

    // Only homework that was finished one way or the other: an open one has
    // no verdict to draw, and a withdrawn one was never the student's to miss.
    const marks: Mark[] = [];
    for (const hw of homework) {
      const outcome = outcomeOf(hw);
      if (outcome !== 'done' && outcome !== 'missed') continue;
      const closed = hw.closedAt ?? null;
      const stamp = closed ?? hw.dueAt ?? hw.assignedAt;
      if (!stamp) continue;
      const when = new Date(stamp).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
      marks.push({
        t: msOf(dayOf(stamp)),
        outcome,
        label: homeworkRange(hw),
        when: `${closed ? 'Marked' : hw.dueAt ? 'Due' : 'Given'} ${when}`,
      });
    }
    marks.sort((a, b) => a.t - b.t);

    return { reading: byDay(recitationAchievements), hifdh: byDay(memorizationAchievements), mistakes: mistakeSeries, marks };
  }, [recitationAchievements, memorizationAchievements, mistakes, homework, language]);

  /* ── The window ── */
  const lastT = useMemo(() => Math.max(
    0,
    ...all.reading.map(p => p.t), ...all.hifdh.map(p => p.t),
    ...all.mistakes.map(p => p.t), ...all.marks.map(m => m.t),
  ), [all]);

  /** The narrowest window that still holds a few lessons — a student taught
   *  once a fortnight should not open on an almost empty month. */
  const autoRange: RangeId = useMemo(() => {
    for (const r of RANGES) {
      if (r.id === 'all') break;
      const from = lastT - r.days * DAY;
      if (all.mistakes.filter(p => p.t >= from).length >= 5) return r.id;
    }
    return 'all';
  }, [all, lastT]);
  const activeRange = range ?? autoRange;
  const from = activeRange === 'all'
    ? -Infinity
    : lastT - (RANGES.find(r => r.id === activeRange)!.days) * DAY;

  const view = useMemo(() => ({
    reading: all.reading.filter(p => p.t >= from),
    hifdh: all.hifdh.filter(p => p.t >= from),
    mistakes: all.mistakes.filter(p => p.t >= from),
    marks: all.marks.filter(m => m.t >= from),
  }), [all, from]);

  /** Days with something on them. One of them is a dot, not a line — the
   *  chart before this one asked for two dates as well. */
  const total = new Set([...view.reading, ...view.hifdh, ...view.mistakes].map(p => p.t)).size;

  /* ── Scales ── */
  const t0 = Math.min(
    ...[...view.reading, ...view.hifdh, ...view.mistakes].map(p => p.t),
    ...view.marks.map(m => m.t),
  );
  const t1 = Math.max(
    ...[...view.reading, ...view.hifdh, ...view.mistakes].map(p => p.t),
    ...view.marks.map(m => m.t),
  );
  const span = Math.max(1, t1 - t0);
  const x = (ms: number) => ((ms - t0) / span) * PW;

  // Four steps of a round size, so the gridlines read 0 2 4 6 8 instead of
  // 0 1 3 4 5 — a quarter of an odd maximum is nobody's idea of a page.
  const pageStep = Math.max(1, Math.ceil(Math.max(1, ...view.reading.map(p => p.v), ...view.hifdh.map(p => p.v)) * 1.15 / 2));
  const maxPages = pageStep * 2;
  const topRatio = Math.max(0.5, ...view.mistakes.map(p => p.v)) * 1.15;
  const ratioStep = topRatio <= 1 ? 0.5 : topRatio <= 2 ? 1 : Math.ceil(topRatio / 2);
  const maxRatio = ratioStep * 2;
  const yPages = (v: number) => PH - (v / maxPages) * PH;
  const yRatio = (v: number) => PH - (v / maxRatio) * PH;

  const META: Record<SeriesId, {
    name: string; cssVar: string; axis: 'pages' | 'ratio'; unit: (v: number) => string; fmt: (v: number) => string;
  }> = {
    reading:  { name: t('studentDetail.reading'), cssVar: '--pt-read', axis: 'pages', fmt: v => String(v), unit: v => `page${v === 1 ? '' : 's'} read` },
    hifdh:    { name: t('studentDetail.hifdh'),   cssVar: '--pt-hifz', axis: 'pages', fmt: v => String(v), unit: v => `page${v === 1 ? '' : 's'} memorised` },
    mistakes: { name: 'Mistakes',                 cssVar: '--pt-slip', axis: 'ratio', fmt: v => v.toFixed(1), unit: () => 'per page' },
  };
  const ORDER: SeriesId[] = ['reading', 'hifdh', 'mistakes'];

  const screen = useMemo(() => {
    const out = {} as Record<SeriesId, { x: number; y: number; p: Pt }[]>;
    for (const id of ORDER) {
      const yFor = META[id].axis === 'pages' ? yPages : yRatio;
      out[id] = view[id].map(p => ({ x: x(p.t), y: yFor(p.v), p }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, maxPages, maxRatio, t0, t1]);

  /* ── The homework rail: one chip per day and verdict, nudged apart ── */
  const chips = useMemo(() => {
    const grouped = new Map<string, Chip>();
    for (const m of view.marks) {
      const key = `${m.t}|${m.outcome}`;
      const got = grouped.get(key);
      if (got) got.items.push(m);
      else grouped.set(key, { t: m.t, outcome: m.outcome, row: 0, items: [m] });
    }
    const list = [...grouped.values()].sort((a, b) => a.t - b.t);
    // Two rows are enough to keep a busy fortnight readable without hiding
    // anything: a chip too close to the last one on its row drops down.
    const lastOn: [number, number] = [-Infinity, -Infinity];
    for (const c of list) {
      const cx = x(c.t);
      // The top row while it has room, then the bottom one; when a year of
      // homework leaves room on neither, whichever was used longest ago.
      const row: 0 | 1 = cx - lastOn[0] >= CHIP_GAP ? 0
        : cx - lastOn[1] >= CHIP_GAP ? 1
        : lastOn[0] <= lastOn[1] ? 0 : 1;
      c.row = row;
      lastOn[row] = cx;
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.marks, t0, t1]);

  /* ── Pointing ── */
  const focus = locked ?? hoverSeries;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((e.clientX - box.left) / box.width) * W - M.left;
    const sy = ((e.clientY - box.top) / box.height) * H - M.top;
    if (sx < -8 || sx > PW + 8 || sy < -10 || sy > PH + 14) { setHoverT(null); if (!locked) setHoverSeries(null); return; }

    const px = clamp(sx, 0, PW);
    // Snap to the nearest day that actually has something on it.
    let best: number | null = null, bestD = Infinity;
    for (const id of ORDER) for (const s of screen[id]) {
      const d = Math.abs(s.x - px);
      if (d < bestD) { bestD = d; best = s.p.t; }
    }
    setHoverT(best);

    if (!locked) {
      let near: SeriesId | null = null, nearD = 34;
      for (const id of ORDER) {
        const y = yAt(screen[id], px);
        if (y === null) continue;
        const d = Math.abs(y - sy);
        if (d < nearD) { nearD = d; near = id; }
      }
      setHoverSeries(near);
    }
  };

  const leave = () => { setHoverT(null); setHoverChip(null); if (!locked) setHoverSeries(null); };

  /* ── Not enough to draw ── */
  if (total < 2) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-gray-700/50 rounded-xl">
        <p className="text-slate-500 dark:text-slate-400 italic">{t('studentDetail.notEnoughData')}</p>
      </div>
    );
  }

  const pageTicks = [0, 1, 2].map(i => ({ v: i * pageStep, y: yPages(i * pageStep) }));
  const ratioTicks = [0, 1, 2].map(i => ({
    v: Math.round(i * ratioStep * 10) / 10, y: yRatio(i * ratioStep),
  }));
  const tickCount = Math.min(7, Math.max(2, Math.round(span / DAY) + 1));
  const dateTicks = Array.from({ length: tickCount }, (_, i) => {
    const ms = t0 + (span * i) / Math.max(1, tickCount - 1);
    return { ms, label: new Date(ms).toLocaleDateString(language, { day: 'numeric', month: 'short' }) };
  });

  const hovered = hoverT === null ? null : {
    t: hoverT,
    rows: ORDER.map(id => ({ id, pt: view[id].find(p => p.t === hoverT) })).filter(r => r.pt),
  };
  const chipHover = hoverChip === null ? null : chips[hoverChip];
  /** The day the whole chart is leaning on: the mouse's, or a chip's. */
  const column: number | null = chipHover ? chipHover.t : hovered ? hovered.t : null;

  /** Where a floating card should sit, as a share of the box — the viewBox
   *  scales uniformly, so a percentage lands exactly on the same spot. */
  const at = (sx: number, sy: number) => ({
    left: `${((M.left + sx) / W) * 100}%`,
    top: `${((M.top + sy) / H) * 100}%`,
  });

  const dim = (id: SeriesId) => (focus && focus !== id ? 0.24 : 1);
  const lineW = (id: SeriesId) => (focus === id ? 3.6 : focus ? 1.7 : 2.6);

  return (
    <div className="pt-chart">
      <style>{`
        .pt-chart {
          --pt-read: #0f766e; --pt-hifz: #6d28d9; --pt-slip: #b45309;
          --pt-done: #047857; --pt-undone: #be123c;
          --pt-grid: #e5e9f0; --pt-axis: #cbd5e1; --pt-ink: #475569; --pt-dim: #94a3b8;
          --pt-paper: #ffffff; --pt-on-chip: #ffffff; --pt-rail: #0f172a0d;
        }
        .dark .pt-chart {
          --pt-read: #2dd4bf; --pt-hifz: #a78bfa; --pt-slip: #fbbf24;
          --pt-done: #34d399; --pt-undone: #fb7185;
          --pt-grid: #263142; --pt-axis: #3b4759; --pt-ink: #cbd5e1; --pt-dim: #64748b;
          --pt-paper: #0f172a; --pt-on-chip: #08121f; --pt-rail: #ffffff0a;
        }
        html[data-theme="amber"] .pt-chart {
          --pt-grid: #2e2415; --pt-axis: #44361f; --pt-paper: #120d06; --pt-on-chip: #120d06;
          --pt-rail: #ffb70012;
        }
        .pt-chart .pt-hit { cursor: crosshair; }
        .pt-chart .pt-card { animation: pt-in 140ms ease-out; }
        @keyframes pt-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
      `}</style>

      {/* ── The three threads, as chips you can point at or pin ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ORDER.map(id => {
          const pts = view[id];
          const off = !!focus && focus !== id;
          return (
            <button key={id} type="button"
              // Nothing to bring forward when the window holds none of it.
              disabled={!pts.length}
              onMouseEnter={() => !locked && pts.length && setHoverSeries(id)}
              onMouseLeave={() => !locked && setHoverSeries(null)}
              onClick={() => pts.length && setLocked(l => (l === id ? null : id))}
              aria-pressed={locked === id}
              className={`group flex items-center gap-2.5 ps-2.5 pe-3 py-1.5 rounded-xl border transition-all ${
                locked === id
                  ? 'border-transparent ring-2 shadow-sm'
                  : 'border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600'
              } ${!pts.length ? 'opacity-40 cursor-default' : off ? 'opacity-45' : 'opacity-100'}`}
              style={{
                background: locked === id ? `color-mix(in srgb, var(${META[id].cssVar}) 12%, transparent)` : undefined,
                // @ts-expect-error — a CSS custom property is fine in a style object
                '--tw-ring-color': `var(${META[id].cssVar})`,
              }}>
              <span className="w-5 h-[3px] rounded-full" style={{ background: `var(${META[id].cssVar})` }} />
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{META[id].name}</span>
              {!pts.length && <span className="text-[12px]" style={{ color: 'var(--pt-dim)' }}>—</span>}
            </button>
          );
        })}

        <span className="flex-grow" />

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-gray-900/60">
          {RANGES.map(r => (
            <button key={r.id} type="button" onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-bold transition-colors ${
                activeRange === r.id
                  ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>{r.label}</button>
          ))}
        </div>
      </div>

      {/* A phone cannot hold a year of lessons at a readable size, so below
          about 700px the chart keeps its size and the card scrolls sideways —
          the same answer the chart before this one gave. The floating cards
          live INSIDE the scrolling box so they travel with it. */}
      <div className="w-full overflow-x-auto rounded-2xl bg-gradient-to-b from-slate-50 to-white dark:from-gray-900/70 dark:to-gray-900/30 border border-slate-200/80 dark:border-gray-700/70">
      <div ref={boxRef} className="relative min-w-[680px]"
        onPointerMove={onMove} onPointerLeave={leave}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block font-sans pt-hit" role="img"
          aria-label="Reading, memorisation and mistakes over time, with homework results">
          <defs>
            {ORDER.map(id => (
              <linearGradient key={id} id={`pt-fill-${id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={`var(${META[id].cssVar})`} stopOpacity="0.28" />
                <stop offset="100%" stopColor={`var(${META[id].cssVar})`} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          <g transform={`translate(${M.left},${M.top})`}>
            {/* Horizontal rules only: the vertical structure is the day the
                mouse is on, which appears when it is needed. */}
            <g stroke="var(--pt-grid)" strokeWidth="1">
              {pageTicks.map(tk => <line key={`g${tk.y}`} x1="0" x2={PW} y1={tk.y} y2={tk.y} />)}
            </g>

            {/* The day under the mouse — or under a homework chip */}
            {column !== null && (
              <g>
                <rect x={x(column) - 11} y="-6" width="22" height={PH + 6} rx="7"
                  fill="var(--pt-ink)" opacity="0.07" />
                <line x1={x(column)} x2={x(column)} y1="-6" y2={PH + (chipHover ? 12 + chipHover.row * ROW_H : 0)}
                  stroke="var(--pt-ink)" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3,3" />
              </g>
            )}

            {/* ── The three threads ── */}
            {ORDER.map(id => {
              const pts = screen[id];
              if (!pts.length) return null;
              const d = smoothPath(pts);
              const isFocus = focus === id;
              return (
                <g key={id} opacity={dim(id)} style={{ transition: 'opacity 160ms ease' }}>
                  {isFocus && pts.length > 1 && (
                    <path d={`${d} L${pts[pts.length - 1].x},${PH} L${pts[0].x},${PH} Z`} fill={`url(#pt-fill-${id})`} />
                  )}
                  <path d={d} fill="none" stroke={`var(${META[id].cssVar})`} strokeWidth={lineW(id)}
                    strokeLinecap="round" strokeLinejoin="round"
                    style={{ transition: 'stroke-width 160ms ease' }} />
                  {isFocus && pts.length <= 45 && pts.map((s, i) => (
                    <circle key={i} cx={s.x} cy={s.y} r={isFocus ? 4 : 3.1}
                      fill={`var(${META[id].cssVar})`} stroke="var(--pt-paper)" strokeWidth="1.3" />
                  ))}
                  {/* the value on the day being pointed at */}
                  {hovered && (() => {
                    const s = pts.find(p => p.p.t === hovered.t);
                    if (!s) return null;
                    return <circle cx={s.x} cy={s.y} r="6.5" fill="none" stroke={`var(${META[id].cssVar})`} strokeWidth="2.5" />;
                  })()}
                </g>
              );
            })}

            {/* ── Axes ── */}
            <line x1="0" y1={PH} x2={PW} y2={PH} stroke="var(--pt-axis)" />

            {/* Each axis says what it counts in words, upright and above the
                numbers. Two captions on their sides was the chart looking
                harder than the thing it draws. */}
            <g fontSize="11.5" opacity={focus === 'mistakes' ? 0.4 : 1} style={{ transition: 'opacity 160ms ease' }}>
              {pageTicks.map(tk => (
                <text key={`p${tk.y}`} x="-9" y={tk.y} dy="0.32em" textAnchor="end" fill="var(--pt-dim)">{tk.v}</text>
              ))}
              <text x="-9" y="-9" textAnchor="end" fontSize="11" fontWeight="700" fill="var(--pt-dim)">
                {t('chartLabels.pages').toLowerCase()}
              </text>
            </g>

            <g fontSize="11.5" opacity={focus && focus !== 'mistakes' ? 0.4 : 1} style={{ transition: 'opacity 160ms ease' }}>
              {ratioTicks.map(tk => (
                <text key={`r${tk.y}`} x={PW + 9} y={tk.y} dy="0.32em" textAnchor="start" fill="var(--pt-dim)">{tk.v}</text>
              ))}
              {/* Right-aligned to the edge: anchored at the axis it ran off
                  the side of the picture and read "mistakes". */}
              <text x={PW + M.right - 6} y="-9" textAnchor="end" fontSize="11" fontWeight="700" fill="var(--pt-dim)">
                mistakes / page
              </text>
            </g>

            <g fontSize="11.5" fill="var(--pt-dim)">
              {dateTicks.map((tk, i) => (
                <text key={i} x={clamp(x(tk.ms), 10, PW - 10)} y={RAIL_Y + 2 * ROW_H + 22} textAnchor="middle">{tk.label}</text>
              ))}
            </g>

            {/* ── The homework rail ── */}
            <rect x="-8" y={RAIL_Y - 2} width={PW + 16} height={2 * ROW_H + 4} rx="13" fill="var(--pt-rail)" />
            <line x1="2" x2={PW - 2} y1={RAIL_Y + ROW_H} y2={RAIL_Y + ROW_H}
              stroke="var(--pt-axis)" strokeDasharray="1,5" strokeLinecap="round" />
            <text x="-9" y={RAIL_Y + ROW_H} dy="0.32em" textAnchor="end" fontSize="10" fontWeight="700"
              letterSpacing="0.06em" fill="var(--pt-dim)">HW</text>

            {chips.map((c, i) => {
              const cx = x(c.t);
              const cy = RAIL_Y + 12 + c.row * ROW_H;
              const col = c.outcome === 'done' ? 'var(--pt-done)' : 'var(--pt-undone)';
              const on = hoverChip === i;
              return (
                <g key={`chip-${i}`} onPointerEnter={() => setHoverChip(i)} onPointerLeave={() => setHoverChip(null)}
                  style={{ cursor: 'pointer' }}>
                  <circle cx={cx} cy={cy} r={CHIP_R + 4} fill="transparent" />
                  <circle cx={cx} cy={cy} r={CHIP_R} fill={col} fillOpacity={on ? 0.9 : 0.16}
                    stroke={col} strokeWidth={on ? 2 : 1.6} style={{ transition: 'fill-opacity 120ms ease' }} />
                  {c.outcome === 'done'
                    ? <path d={`M${cx - 4.2},${cy + 0.2} l2.9,3 l5.4,-6`} fill="none"
                        stroke={on ? 'var(--pt-on-chip)' : col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    : <path d={`M${cx - 3.4},${cy - 3.4} l6.8,6.8 M${cx + 3.4},${cy - 3.4} l-6.8,6.8`} fill="none"
                        stroke={on ? 'var(--pt-on-chip)' : col} strokeWidth="2.2" strokeLinecap="round" />}
                  {c.items.length > 1 && (
                    <text x={cx + CHIP_R - 1} y={cy - CHIP_R + 2} fontSize="9" fontWeight="800" fill={col}>{c.items.length}</text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── What the day under the mouse holds ── */}
        {hovered && !chipHover && hovered.rows.length > 0 && (() => {
          const sx = x(hovered.t);
          const right = sx > PW * 0.62;
          return (
            <div className="pt-card pointer-events-none absolute z-10 ps-3 pe-3.5 py-2.5 rounded-2xl shadow-xl
                            bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600"
              style={{ ...at(sx + (right ? -16 : 16), PH * 0.22), transform: `translate(${right ? '-100%' : '0'}, -50%)` }}>
              <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {new Date(hovered.t).toLocaleDateString(language, { weekday: 'short', day: 'numeric', month: 'short' })}
              </p>
              {hovered.rows.map(({ id, pt }) => (
                <p key={id} className={`m-0 mt-1 flex items-baseline gap-2 whitespace-nowrap ${focus === id ? 'font-extrabold' : 'font-semibold'}`}>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: `var(${META[id].cssVar})` }} />
                  <span className="text-[13px] tabular-nums" style={{ color: `var(${META[id].cssVar})` }}>{META[id].fmt(pt!.v)}</span>
                  <span className="text-[11.5px] text-slate-500 dark:text-slate-400">{META[id].unit(pt!.v)}</span>
                </p>
              ))}
              {hovered.rows.find(r => r.id === 'mistakes')?.pt?.note && (
                <p className="m-0 mt-1 text-[10.5px] text-slate-400 dark:text-slate-500">
                  {hovered.rows.find(r => r.id === 'mistakes')!.pt!.note}
                </p>
              )}
            </div>
          );
        })()}

        {/* ── What a homework chip holds ── */}
        {chipHover && (() => {
          const sx = x(chipHover.t);
          const right = sx > PW * 0.62;
          const done = chipHover.outcome === 'done';
          return (
            <div className="pt-card pointer-events-none absolute z-10 px-3 py-2.5 rounded-2xl shadow-xl max-w-[260px]
                            bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600"
              style={{
                ...at(sx + (right ? -14 : 14), RAIL_Y + 12 + chipHover.row * ROW_H - 16),
                transform: `translate(${right ? '-100%' : '0'}, -100%)`,
              }}>
              <p className="m-0 text-[11px] font-extrabold uppercase tracking-wide"
                style={{ color: done ? 'var(--pt-done)' : 'var(--pt-undone)' }}>
                {done ? '✓ Homework done' : "✕ Wasn't done"}
              </p>
              {chipHover.items.map((m, i) => (
                <p key={i} className="m-0 mt-1 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                  {m.label}
                  <span className="block text-[10.5px] font-normal text-slate-400 dark:text-slate-500">{m.when}</span>
                </p>
              ))}
            </div>
          );
        })()}
      </div>
      </div>

      <p className="mt-2 text-[11.5px] text-slate-400 dark:text-slate-500">
        Point at a line to bring it forward. Homework runs underneath:
        <span className="font-bold" style={{ color: 'var(--pt-done)' }}> ✓ done</span>,
        <span className="font-bold" style={{ color: 'var(--pt-undone)' }}> ✕ not done</span>.
      </p>
    </div>
  );
};

export default ProgressTimelineChart;
