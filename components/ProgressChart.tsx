import React from 'react';
import { RecitationAchievement, MemorizationAchievement } from '../types';
import { useI18n } from '../context/I18nProvider';

type Achievement = RecitationAchievement | MemorizationAchievement;

interface ProgressChartProps {
  achievements: Achievement[];
  type: 'reading' | 'memorization';
  maxPages: number;
}

const ProgressChart: React.FC<ProgressChartProps> = ({ achievements, type, maxPages }) => {
  const { t, language } = useI18n();
  // If there's not enough data to draw a line, show a message.
  if (achievements.length < 2) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 dark:bg-gray-700/50 rounded-lg">
        <p className="text-slate-500 dark:text-slate-400 italic">
          {t('studentDetail.notEnoughData')}
        </p>
      </div>
    );
  }

  // 1. Process data: Sort achievements by date and get pages per session.
  const sortedAchievements = [...achievements].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const dataPoints = sortedAchievements.map(ach => {
    return {
      date: new Date(ach.date),
      pagesInSession: ach.pagesCompleted,
    };
  });
  
  // 2. Chart dimensions
  const width = 800;
  const height = 300;
  // Reduced right margin as the quality axis is removed.
  const margin = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // 3. Scales for mapping data to SVG coordinates
  const firstDate = dataPoints[0].date;
  const lastDate = dataPoints[dataPoints.length - 1].date;
  const timeDiff = lastDate.getTime() - firstDate.getTime();
  
  // X-axis (time)
  const xScale = (date: Date) => {
    if (timeDiff === 0) return chartWidth / 2; // Avoid division by zero if all dates are same
    return ((date.getTime() - firstDate.getTime()) / timeDiff) * chartWidth;
  };
  
  // Y-axis (pages)
  const pageYScale = (pages: number) => chartHeight - (pages / maxPages) * chartHeight;
  
  // 4. Generate the SVG path data for the line graph
  const pagePath = "M" + dataPoints.map(d => `${xScale(d.date)},${pageYScale(d.pagesInSession)}`).join(" L");
  
  // 5. Calculate positions for labels and grid lines
  const pageYTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    value: Math.round(maxPages * p),
    y: pageYScale(maxPages * p),
  }));
  
  const numXTicks = Math.min(dataPoints.length, 6);
  const xTicks = Array.from({ length: numXTicks }).map((_, i) => {
    // Distribute ticks evenly across the data points
    const index = numXTicks === 1 ? 0 : Math.floor(i * (dataPoints.length - 1) / (numXTicks - 1));
    const dataPoint = dataPoints[index];
    return {
      value: dataPoint.date.toLocaleDateString(language, { month: 'short', day: 'numeric' }),
      x: xScale(dataPoint.date),
    }
  });

  // Color scheme based on the achievement type
  const colorScheme = {
      reading: {
          line: "stroke-teal-500 dark:stroke-orange-500",
          dots: "fill-teal-500 dark:fill-orange-500",
          label: "fill-teal-600 dark:fill-orange-400",
      },
      memorization: {
          line: "stroke-sky-500 dark:stroke-sky-400",
          dots: "fill-sky-500 dark:fill-sky-400",
          label: "fill-sky-600 dark:fill-sky-300",
      }
  }
  const colors = colorScheme[type];

  return (
    <div className="w-full overflow-x-auto p-2 bg-slate-50 dark:bg-gray-900/50 rounded-lg">
      <svg viewBox={`0 0 ${width} ${height}`} className="font-sans min-w-[600px]">
        {/* Define a gradient for the area under the line */}
        <defs>
          <linearGradient id={`gradient-${type}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--gradient-from)" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="var(--gradient-to)" stopOpacity="0"/>
          </linearGradient>
          <style>
            {`
              #gradient-reading {
                --gradient-from: #2dd4bf;
                --gradient-to: #f0fdfa;
              }
              .dark #gradient-reading {
                --gradient-from: #fb923c;
                --gradient-to: #fff7ed;
              }
              #gradient-memorization {
                --gradient-from: #38bdf8;
                --gradient-to: #f0f9ff;
              }
              .dark #gradient-memorization {
                --gradient-from: #7dd3fc;
                --gradient-to: #ecfeff;
              }
            `}
          </style>
        </defs>

        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Grid lines */}
          <g className="grid-lines stroke-slate-200 dark:stroke-gray-700" strokeDasharray="2,3">
            {pageYTicks.map(tick => (
              <line key={`grid-y-${tick.value}`} x1="0" x2={chartWidth} y1={tick.y} y2={tick.y} />
            ))}
             {xTicks.map(tick => (
              <line key={`grid-x-${tick.x}`} x1={tick.x} x2={tick.x} y1="0" y2={chartHeight} />
            ))}
          </g>

          {/* Area under the line */}
          <path d={`${pagePath} L ${xScale(lastDate)},${chartHeight} L ${xScale(firstDate)},${chartHeight} Z`} fill={`url(#gradient-${type})`} />

          {/* Progress line */}
          <path d={pagePath} fill="none" className={colors.line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          
           {/* Circles on data points */}
           <g className="page-dots">
                {dataPoints.map((d, i) => (
                    <circle 
                        key={`dot-${i}`}
                        cx={xScale(d.date)}
                        cy={pageYScale(d.pagesInSession)}
                        r="4"
                        className={`${colors.dots} stroke-slate-50 dark:stroke-gray-900/50`}
                        strokeWidth="2"
                    />
                ))}
            </g>

          {/* Axes lines */}
          <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} className="stroke-slate-300 dark:stroke-gray-600" />
          <line x1="0" y1="0" x2="0" y2={chartHeight} className="stroke-slate-300 dark:stroke-gray-600" />

          {/* Y-Axis Ticks and Label (Pages) */}
          <g className="y-axis-pages text-xs fill-slate-500 dark:fill-slate-400">
            {pageYTicks.map(tick => (
              <text key={`tick-y-page-${tick.value}`} x="-10" y={tick.y} dy="0.32em" textAnchor="end">{tick.value}</text>
            ))}
            <text transform={`translate(-35, ${chartHeight/2}) rotate(-90)`} textAnchor="middle" className={`font-semibold ${colors.label}`}>{t('chartLabels.pages')}</text>
          </g>
          
           {/* X-Axis Ticks and Label */}
          <g className="x-axis text-xs fill-slate-500 dark:fill-slate-400">
            {xTicks.map(tick => (
              <text key={`tick-x-${tick.x}`} x={tick.x} y={chartHeight + 15} textAnchor="middle">{tick.value}</text>
            ))}
            <text x={chartWidth/2} y={chartHeight + 35} textAnchor="middle" className="font-semibold fill-slate-600 dark:fill-slate-300">{t('modals.addAchievement.date')}</text>
          </g>
        </g>
      </svg>
    </div>
  );
};

export default ProgressChart;