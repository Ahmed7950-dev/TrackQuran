// components/LessonTimeline.tsx
// ---------------------------------------------------------------------------
// Renders a vertical timeline of upcoming lessons (GCal + platform-scheduled).
// ---------------------------------------------------------------------------

import React from 'react';
import type { UnifiedLesson } from '../services/lessonSessionService';

interface Props {
  lessons: UnifiedLesson[];
  /** If true, show Join button for lessons with meetUrl */
  showJoin?: boolean;
  emptyMessage?: string;
}

function formatDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long' });
}
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const LessonTimeline: React.FC<Props> = ({
  lessons,
  showJoin = true,
  emptyMessage = 'No upcoming lessons scheduled.',
}) => {
  if (lessons.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 dark:text-slate-500">
        <div className="text-4xl mb-3">📅</div>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {lessons.map((lesson, index) => {
        const isLast = index === lessons.length - 1;
        const isGCal = lesson.source === 'gcal';

        return (
          <div key={lesson.id} className="flex gap-4 group">
            {/* Timeline spine */}
            <div className="flex flex-col items-center flex-shrink-0 w-8">
              {/* Dot */}
              <div className={`mt-7 w-4 h-4 rounded-full ring-4 flex-shrink-0 z-10 ${
                isGCal
                  ? 'bg-blue-500 ring-blue-100 dark:ring-blue-900/40'
                  : 'bg-amber-500 ring-amber-100 dark:ring-amber-900/40'
              }`} />
              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 w-0.5 bg-slate-200 dark:bg-gray-700 mt-1 mb-0" />
              )}
            </div>

            {/* Capsule */}
            <div className={`flex-1 mb-4 rounded-2xl border p-5 shadow-sm transition-all ${
              index === 0
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600'
            }`}>
              {/* Next lesson badge */}
              {index === 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full mb-2">
                  ⚡ Next lesson
                </span>
              )}

              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Day + date */}
                  <p className="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight">
                    {formatDay(lesson.startAt)}
                  </p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                    {formatDate(lesson.startAt)}
                  </p>

                  {/* Time */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      🕐 {formatTime(lesson.startAt)}
                      {lesson.endAt && (
                        <span className="font-normal text-slate-400 dark:text-slate-500">
                          {' '}– {formatTime(lesson.endAt)}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Source badge */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isGCal
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700'
                        : 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700'
                    }`}>
                      {isGCal ? '📆 Google Calendar' : '🗓 Platform'}
                    </span>
                    {lesson.title && lesson.title !== 'Arabic Lesson' && lesson.title !== 'Arabic Lesson (Platform)' && (
                      <span className="text-xs text-slate-400 dark:text-slate-500 truncate">{lesson.title}</span>
                    )}
                  </div>
                </div>

                {/* Meet link */}
                {showJoin && (
                  <div className="flex-shrink-0">
                    {lesson.meetUrl ? (
                      <a
                        href={lesson.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                        Join 🚀
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic">No link yet</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LessonTimeline;
