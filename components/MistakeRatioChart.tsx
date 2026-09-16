import React from 'react';
import { RecitationAchievement, MemorizationAchievement, Mistake } from '../types';
import { useI18n } from '../context/I18nProvider';
import { touchedPageSet, getPageOfAyah } from '../services/dataService';

// Mistakes per page, DAY BY DAY — not a running average. Each point is that
// day's own lesson: the mistakes marked that day divided by the pages read that
// day. 3 mistakes on one page and 5 on the next → 8 ÷ 2 = 4 for the day.
//
//   pages read that day = pages the day's reading / hifz logs touched (a partly
//                         read page counts), plus any page a mistake was marked
//                         on that day — it was read even if no log covers it.
//   mistakes            = letters marked red that day (reading or tajweed);
//                         yellow ones are fixed and don't count.
// ─────────────────────────────────────────────────────────────────────────────

/** How many of the most recent days the chart shows. */
const MAX_POINTS = 15;

interface MistakeRatioChartProps {
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  mistakes: Record<string, Mistake>;
}

const MistakeRatioChart: React.FC<MistakeRatioChartProps> = ({ recitationAchievements, memorizationAchievements, mistakes }) => {
  const { t, language } = useI18n();

  const mistakeEntries = Object.entries(mistakes).filter(([k]) => {
    const [su, a] = k.split(':').map(Number);
    return !isNaN(su) && !isNaN(a);
  });

  // mistakes per day, and the pages they sit on
  const mistakesByDay = new Map<string, number>();
  const mistakePagesByDay = new Map<string, Set<number>>();
  for (const [k, m] of mistakeEntries) {
    if (!m.errorType) continue;                     // yellow = fixed, not counted
    const day = (m.date ?? '').slice(0, 10);
    if (!day) continue;
    const [su, a] = k.split(':').map(Number);
    mistakesByDay.set(day, (mistakesByDay.get(day) ?? 0) + 1);
    const set = mistakePagesByDay.get(day) ?? new Set<number>();
    set.add(getPageOfAyah(su, a));
    mistakePagesByDay.set(day, set);
  }

  // X axis: every day with a reading/hifz log or a marked mistake.
  const dateKeys = [...new Set([
    ...recitationAchievements.map(a => a.date.slice(0, 10)),
    ...memorizationAchievements.map(a => a.date.slice(0, 10)),
    ...mistakesByDay.keys(),
  ])].sort();

  // Only the most recent days — older ones pushed the latest off-screen.
  const dataPoints = dateKeys.slice(-MAX_POINTS).map(dateKey => {
    const rec = recitationAchievements.filter(a => a.date.slice(0, 10) === dateKey);
    const mem = memorizationAchievements.filter(a => a.date.slice(0, 10) === dateKey);
    const pages = new Set<number>([
      ...touchedPageSet(rec as any), ...touchedPageSet(mem as any),
      ...(mistakePagesByDay.get(dateKey) ?? []),
    ]);
    const n = mistakesByDay.get(dateKey) ?? 0;
    return {
      date: new Date(dateKey),
      ratio: pages.size > 0 ? Math.round((n / pages.size) * 10) / 10 : 0,
      pages: pages.size,
      mistakes: n,
    };
  });

  if (dataPoints.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-gray-700/50 rounded-lg">
        <p className="text-slate-500 dark:text-slate-400 italic">{t('studentDetail.notEnoughData')}</p>
      </div>
    );
  }

  const maxRatio = Math.max(0.5, Math.ceil(Math.max(...dataPoints.map(d => d.ratio)) * 1.3 * 10) / 10);

  // At most 15 days, spaced evenly and fitted to the card — no sideways scroll
  // hiding the newest day. The right margin leaves room for the last value.
  const margin = { top: 30, right: 40, bottom: 66, left: 50 };
  const chartWidth = 760;
  const chartHeight = 234;
  const width = chartWidth + margin.left + margin.right;
  const height = chartHeight + margin.top + margin.bottom;

  const firstDate = dataPoints[0].date;
  const lastDate = dataPoints[dataPoints.length - 1].date;
  // Evenly spaced by position, not by calendar gap: two lessons a day apart
  // no longer stack their labels on top of each other.
  const indexOf = new Map(dataPoints.map((d, i) => [d.date.getTime(), i] as [number, number]));
  const xScale = (date: Date) => ((indexOf.get(date.getTime()) ?? 0) / Math.max(1, dataPoints.length - 1)) * chartWidth;
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
    <div className="w-full p-2 bg-slate-50 dark:bg-gray-900/50 rounded-lg">
      {/* scales to the card: with 15 days at most there is room for every label */}
      <svg viewBox={`0 0 ${width} ${height}`} className="font-sans w-full h-auto">
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
                className="fill-rose-500 dark:fill-rose-400 stroke-slate-50 dark:stroke-gray-900/50" strokeWidth="2">
                <title>{`${d.mistakes} mistake${d.mistakes === 1 ? '' : 's'} on ${d.pages} page${d.pages === 1 ? '' : 's'} = ${d.ratio} per page`}</title>
              </circle>
              {/* the exact ratio, printed small above every dot */}
              <text x={xScale(d.date)} y={yScale(d.ratio) - 10} textAnchor="middle"
                className="fill-rose-600 dark:fill-rose-300" fontSize="13" fontWeight="700">
                {d.ratio}
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
              className="font-semibold fill-rose-600 dark:fill-rose-300">Mistakes per page</text>
          </g>

          <g className="fill-slate-500 dark:fill-slate-400">
            {xTicks.map(tick => (
              <text key={`tx-${tick.x}`} x={tick.x} y={chartHeight + 12} fontSize="12"
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
