import React from 'react';
import { RecitationAchievement, MemorizationAchievement, Mistake } from '../types';
import { useI18n } from '../context/I18nProvider';
import { fullyRecitedPageSet, getPageOfAyah } from '../services/dataService';

// ─────────────────────────────────────────────────────────────────────────────
// Overall mistakes ratio over time — the SAME metric as the "mistakes rate"
// stat card above the chart (marked letters on read pages ÷ fully read pages),
// replayed cumulatively at each progress-log date so the last point matches
// the headline number. Rose color; the exact ratio printed above every dot.
// ─────────────────────────────────────────────────────────────────────────────

interface MistakeRatioChartProps {
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  mistakes: Record<string, Mistake>;
}

const MistakeRatioChart: React.FC<MistakeRatioChartProps> = ({ recitationAchievements, memorizationAchievements, mistakes }) => {
  const { t, language } = useI18n();

  // X axis: every calendar date with logged progress — plus the latest mistake
  // date when it falls after the last progress log, so the chart always ends
  // at the same value the stat card shows.
  const mistakeEntries = Object.entries(mistakes).filter(([k]) => {
    const [su, a] = k.split(':').map(Number);
    return !isNaN(su) && !isNaN(a);
  });
  const dateKeys = [...new Set([
    ...recitationAchievements.map(a => a.date.slice(0, 10)),
    ...memorizationAchievements.map(a => a.date.slice(0, 10)),
  ])].sort();
  const lastMistakeDate = mistakeEntries.reduce((mx, [, m]) => {
    const d = (m.date ?? '').slice(0, 10);
    return d > mx ? d : mx;
  }, '');
  if (dateKeys.length && lastMistakeDate > dateKeys[dateKeys.length - 1]) dateKeys.push(lastMistakeDate);

  // Cumulative ratio at the end of each date — identical semantics to the
  // stat card: numerator = marked LETTERS on read pages (all error types),
  // denominator = fully read pages (recited ∪ memorized) as of that date.
  const dataPoints = dateKeys.map(dateKey => {
    const rec = recitationAchievements.filter(a => a.date.slice(0, 10) <= dateKey);
    const mem = memorizationAchievements.filter(a => a.date.slice(0, 10) <= dateKey);
    const pages = new Set<number>([...fullyRecitedPageSet(rec as any), ...fullyRecitedPageSet(mem as any)]);
    const n = mistakeEntries.filter(([k, m]) => {
      if (!m.errorType) return false;               // yellow = fixed, not counted
      if ((m.date ?? '').slice(0, 10) > dateKey) return false;
      const [su, a] = k.split(':').map(Number);
      return pages.has(getPageOfAyah(su, a));
    }).length;
    return { date: new Date(dateKey), ratio: pages.size > 0 ? Math.round((n / pages.size) * 100) / 100 : 0 };
  });

  if (dataPoints.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-gray-700/50 rounded-lg">
        <p className="text-slate-500 dark:text-slate-400 italic">{t('studentDetail.notEnoughData')}</p>
      </div>
    );
  }

  const maxRatio = Math.max(0.5, Math.ceil(Math.max(...dataPoints.map(d => d.ratio)) * 1.3 * 10) / 10);

  // Every entry gets its own dated tick, so the canvas grows with the log and
  // the wrapper scrolls sideways instead of cramming labels on top of a fixed
  // 800px board.
  const PER_POINT = 58;
  const margin = { top: 26, right: 24, bottom: 66, left: 50 };
  const chartWidth = Math.max(700, (dataPoints.length - 1) * PER_POINT);
  const chartHeight = 234;
  const width = chartWidth + margin.left + margin.right;
  const height = chartHeight + margin.top + margin.bottom;

  const firstDate = dataPoints[0].date;
  const lastDate = dataPoints[dataPoints.length - 1].date;
  const timeDiff = lastDate.getTime() - firstDate.getTime();
  const xScale = (date: Date) => timeDiff === 0 ? chartWidth / 2 : ((date.getTime() - firstDate.getTime()) / timeDiff) * chartWidth;
  const yScale = (ratio: number) => chartHeight - (ratio / maxRatio) * chartHeight;

  const linePath = 'M' + dataPoints.map(d => `${xScale(d.date)},${yScale(d.ratio)}`).join(' L');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    value: Math.round(maxRatio * p * 10) / 10,
    y: yScale(maxRatio * p),
  }));
  // one tick per logged date — tilted so they never collide
  const xTicks = dataPoints.map(d => ({
    value: d.date.toLocaleDateString(language, { month: 'short', day: 'numeric' }),
    x: xScale(d.date),
  }));

  return (
    <div className="w-full overflow-x-auto p-2 bg-slate-50 dark:bg-gray-900/50 rounded-lg">
      {/* full width, never squeezed: a long log scrolls sideways in the wrapper
          instead of shrinking every label into illegibility */}
      <svg viewBox={`0 0 ${width} ${height}`} className="font-sans" style={{ minWidth: width }}>
        <defs>
          <linearGradient id="gradient-mistakes" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--gradient-from)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--gradient-to)" stopOpacity="0" />
          </linearGradient>
          <style>{`
            #gradient-mistakes { --gradient-from: #fb7185; --gradient-to: #fff1f2; }
            .dark #gradient-mistakes { --gradient-from: #fda4af; --gradient-to: #fff1f2; }
          `}</style>
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          <g className="stroke-slate-200 dark:stroke-gray-700" strokeDasharray="2,3">
            {yTicks.map(tick => <line key={`gy-${tick.y}`} x1="0" x2={chartWidth} y1={tick.y} y2={tick.y} />)}
            {xTicks.map(tick => <line key={`gx-${tick.x}`} x1={tick.x} x2={tick.x} y1="0" y2={chartHeight} />)}
          </g>

          <path d={`${linePath} L ${xScale(lastDate)},${chartHeight} L ${xScale(firstDate)},${chartHeight} Z`} fill="url(#gradient-mistakes)" />
          <path d={linePath} fill="none" className="stroke-rose-500 dark:stroke-rose-400" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

          {dataPoints.map((d, i) => (
            <g key={`dot-${i}`}>
              <circle cx={xScale(d.date)} cy={yScale(d.ratio)} r="4"
                className="fill-rose-500 dark:fill-rose-400 stroke-slate-50 dark:stroke-gray-900/50" strokeWidth="2" />
              {/* the exact ratio, printed small above every dot */}
              <text x={xScale(d.date)} y={yScale(d.ratio) - 8} textAnchor="middle"
                className="fill-rose-600 dark:fill-rose-300" fontSize="7.5" fontWeight="700">
                {d.ratio.toFixed(2)}
              </text>
            </g>
          ))}

          <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} className="stroke-slate-300 dark:stroke-gray-600" />
          <line x1="0" y1="0" x2="0" y2={chartHeight} className="stroke-slate-300 dark:stroke-gray-600" />

          <g className="text-xs fill-slate-500 dark:fill-slate-400">
            {yTicks.map(tick => (
              <text key={`ty-${tick.y}`} x="-10" y={tick.y} dy="0.32em" textAnchor="end">{tick.value}</text>
            ))}
            <text transform={`translate(-35, ${chartHeight / 2}) rotate(-90)`} textAnchor="middle"
              className="font-semibold fill-rose-600 dark:fill-rose-300">Mistakes ratio</text>
          </g>

          <g className="fill-slate-500 dark:fill-slate-400">
            {xTicks.map(tick => (
              <text key={`tx-${tick.x}`} x={tick.x} y={chartHeight + 12} fontSize="9"
                textAnchor="end" transform={`rotate(-45, ${tick.x}, ${chartHeight + 12})`}>
                {tick.value}
              </text>
            ))}
            <text x={chartWidth / 2} y={chartHeight + 58} textAnchor="middle" fontSize="12"
              className="font-semibold fill-slate-600 dark:fill-slate-300">{t('modals.addAchievement.date')}</text>
          </g>
        </g>
      </svg>
    </div>
  );
};

export default MistakeRatioChart;
