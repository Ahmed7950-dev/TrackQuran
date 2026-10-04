// components/ArabicStudentDetailPage.tsx
// ---------------------------------------------------------------------------
// Shows a single Arabic student's profile info + lesson progress list +
// student's spaced-rep / wrong-word progress tab.
// ---------------------------------------------------------------------------

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ArabicStudent, ArabicLesson, ArabicCourseDialect, WeeklySlot, ArabicExamUnlock, ArabicExamAttempt, ArabicLessonLog } from '../types';
import { useI18n } from '../context/I18nProvider';
import StudentProfileIcon from './StudentProfileIcon';
import { createGoogleMeetLink } from '../services/googleCalendarService';
import { saveInstantMeeting } from '../services/instantMeetingService';
import {
  getArabicLessons,
  getLessonLogsForStudent,
  getArabicStudentNote,
  getVocabWords,
} from '../services/arabicService';
import {
  getUnlocksForStudent, setExamUnlock, removeExamUnlock, setRetakeAllowed, getAttemptsForStudent, reopenAttempt,
} from '../services/examService';
import ArabicAddStudentModal from './ArabicAddStudentModal';
import ArabicLessonPage from './ArabicLessonPage';
import ArabicHomeworkTab from './ArabicHomeworkTab';
import ArabicLessonsVocabularyTab from './ArabicLessonsVocabularyTab';
import ExamMarkingPage from './ExamMarkingPage';
import LeaderboardPage from './LeaderboardPage';
import CalendarPage from './CalendarPage';
import LessonTimeline from './LessonTimeline';
import { getStoredToken } from '../services/googleCalendarService';
import { getTeacherAvailability, AvailabilitySlot } from '../services/availabilityService';
import { getStudentUnifiedLessons, type UnifiedLesson } from '../services/lessonSessionService';

interface Props {
  student: ArabicStudent;
  teacherId: string;
  onBack: () => void;
  onUpdateStudent: (s: ArabicStudent) => void;
  onDeleteStudent: (id: string) => void;
  /** When true the page is shown to the student via a share link — hides delete & back-to-list */
  studentMode?: boolean;
  /** Total vocabulary words learned (lesson words + custom list words) */
  vocabCount?: number;
  /** When set, auto-navigate to the lessons section and open this lesson's homework */
  hwDeepLink?: { studentId: string; lessonId: string } | null;
  onHwDeepLinkConsumed?: () => void;
  /** Archive state for this student (tutor-private organisation). */
  isArchived?: boolean;
  onToggleArchive?: (archived: boolean) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LESSONS_PER_LEVEL = 20;
const HOURS = Array.from({ length: 11 }, (_, i) => i + 12);

function formatHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h > 12 ? h - 12 : h}:00 ${ampm}`;
}

function weeksLeft(deadline?: string): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (7 * 24 * 3600 * 1000)));
}

function lpw(s: ArabicStudent): number | null {
  if (!s.goalDeadline) return null;
  const wl = weeksLeft(s.goalDeadline);
  if (!wl || wl <= 0) return null;
  return Math.ceil((60 - s.completedLessonIds.length) / wl);
}

function dialectLabel(d: string) {
  return { msa: 'Modern Standard Arabic', levantine: 'Levantine Arabic', quranic: 'Quranic Arabic' }[d] ?? d;
}

// ── Availability grid ─────────────────────────────────────────────────────────

const AvailabilityGrid: React.FC<{ slots: WeeklySlot[]; timezone: string }> = ({ slots, timezone }) => {
  const grid = new Set(slots.map(s => `${s.day}:${s.startHour}`));
  // Always fits its container — table-fixed lets the 7 day columns compress on
  // narrow screens instead of forcing a sideways scroll.
  return (
    <div className="rounded-xl border border-slate-200 dark:border-gray-600 overflow-hidden">
      <table className="w-full text-xs border-collapse table-fixed">
        <thead>
          <tr>
            <th className="w-14 bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 px-2 text-slate-500 dark:text-slate-400 font-semibold text-left">Time</th>
            {DAYS_SHORT.map((d, i) => (
              <th key={i} className="bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map(h => (
            <tr key={h}>
              <td className="bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 px-2 py-1.5 text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                {formatHour(h)}
              </td>
              {DAYS_SHORT.map((_, d) => {
                const active = grid.has(`${d}:${h}`);
                return (
                  <td key={d} className={`border-b border-r border-slate-200 dark:border-gray-600 h-6 ${active ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-white dark:bg-gray-800'}`} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1.5">Times shown in {timezone}</p>
    </div>
  );
};

// ── Info row ──────────────────────────────────────────────────────────────────

const InfoRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) =>
  value ? (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide sm:w-40 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 sm:mt-0">{value}</dd>
    </div>
  ) : null;

// ── Exams tab (tutor) ─────────────────────────────────────────────────────────

const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In progress', submitted: 'Submitted', under_review: 'Under review',
  result_published: 'Result published',
};

const ExamsTab: React.FC<{
  studentId: string;
  studentName: string;
  teacherId: string;
  unlocks: ArabicExamUnlock[];
  attempts: ArabicExamAttempt[];
  onChanged: () => void;
  onMark: (a: ArabicExamAttempt) => void;
}> = ({ studentId, teacherId, unlocks, attempts, onChanged, onMark }) => {
  const [busy, setBusy] = useState(false);
  const [boardLevel, setBoardLevel] = useState<number | null>(null);

  const toggleUnlock = async (level: number, on: boolean) => {
    setBusy(true);
    if (on) await setExamUnlock(studentId, level, teacherId, false, teacherId);
    else await removeExamUnlock(studentId, level);
    setBusy(false);
    onChanged();
  };

  const toggleRetake = async (level: number, allowed: boolean) => {
    setBusy(true);
    await setRetakeAllowed(studentId, level, allowed, teacherId);
    setBusy(false);
    onChanged();
  };

  const reopen = async (a: ArabicExamAttempt) => {
    if (!window.confirm('Reopen this attempt so the student can edit and resubmit?')) return;
    setBusy(true);
    await reopenAttempt(a, teacherId);
    setBusy(false);
    onChanged();
  };

  if (boardLevel !== null) {
    return <LeaderboardPage level={boardLevel} onExit={() => setBoardLevel(null)} />;
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-1">Exam access</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Unlock a level's exam for this student. They choose Arabic or Transliteration when they start.</p>
        <div className="space-y-2">
          {([1, 2, 3] as const).map(level => {
            const unlock = unlocks.find(u => u.level === level);
            const unlocked = !!unlock;
            return (
              <div key={level} className="flex flex-wrap items-center gap-3 border border-slate-100 dark:border-gray-700 rounded-xl px-3 py-2">
                <span className="font-semibold text-slate-700 dark:text-slate-200">Level {level}</span>
                <button disabled={busy} onClick={() => toggleUnlock(level, !unlocked)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 ${unlocked ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300'}`}>
                  {unlocked ? '✓ Unlocked' : 'Unlock exam'}
                </button>
                {unlocked && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ml-auto">
                    <input type="checkbox" checked={unlock!.retakeAllowed} disabled={busy}
                      onChange={e => toggleRetake(level, e.target.checked)} />
                    Allow retake
                  </label>
                )}
                <button onClick={() => setBoardLevel(level)}
                  className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-bold">🏅 Leaderboard</button>
                {unlocked && unlock!.unlockedAt && (
                  <span className="text-[10px] text-slate-400 w-full sm:w-auto">since {new Date(unlock!.unlockedAt).toLocaleDateString()}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4">
        <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-3">Attempts</h3>
        {attempts.length === 0 ? (
          <p className="text-sm text-slate-400">No exam attempts yet.</p>
        ) : (
          <div className="space-y-2">
            {attempts.map(a => (
              <div key={a.id} className="flex items-center justify-between gap-3 border border-slate-100 dark:border-gray-700 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                    Level {a.level} · {a.version === 'arabic' ? 'Arabic' : 'Transliteration'} · attempt #{a.attemptNumber}
                  </p>
                  <p className="text-xs text-slate-400">
                    {ATTEMPT_STATUS_LABEL[a.status] ?? a.status}
                    {a.status === 'result_published' && a.percentage != null ? ` · ${a.percentage}% · ${a.passed ? 'Passed' : 'Failed'}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(a.status === 'submitted' || a.status === 'under_review') && (
                    <button onClick={() => onMark(a)} className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">Mark</button>
                  )}
                  {a.status === 'result_published' && (
                    <button onClick={() => onMark(a)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-xs font-bold">Review</button>
                  )}
                  {a.status !== 'in_progress' && (
                    <button onClick={() => reopen(a)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-300 text-xs font-bold disabled:opacity-50">Reopen</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Arabic Lesson History Calendar ────────────────────────────────────────────

interface ArabicLessonCalendarProps {
  logs: ArabicLessonLog[];
  lessons: ArabicLesson[];
  calendarDate: Date;
  onMonthChange: (d: Date) => void;
}

const KIND_BADGE: Record<ArabicLessonLog['kind'], { cls: string; label: string }> = {
  progress: { cls: 'bg-amber-100 text-amber-700',   label: 'Progress' },
  done:     { cls: 'bg-emerald-100 text-emerald-700', label: 'Done'     },
  revision: { cls: 'bg-violet-100 text-violet-700',  label: 'Revision' },
};

const ArabicLessonCalendar: React.FC<ArabicLessonCalendarProps> = ({ logs, lessons, calendarDate, onMonthChange }) => {
  const lessonMap = useMemo(() => new Map(lessons.map(l => [l.id, l])), [lessons]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const dayMap = useMemo(() => {
    const m = new Map<string, ArabicLessonLog[]>();
    logs.forEach(log => {
      const key = new Date(log.createdAt).toDateString();
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(log);
    });
    return m;
  }, [logs]);

  const month       = calendarDate.getMonth();
  const year        = calendarDate.getFullYear();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Close expanded day when month changes
  const handleMonthChange = (d: Date) => { setExpandedDay(null); onMonthChange(d); };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e-${i}`} />);

  for (let day = 1; day <= daysInMonth; day++) {
    const ds      = new Date(year, month, day).toDateString();
    const entries = dayMap.get(ds) ?? [];
    const isToday = ds === new Date().toDateString();
    const active  = entries.length > 0;
    const isOpen  = expandedDay === ds;

    const headerCls = active
      ? 'bg-emerald-500 text-white'
      : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400';
    const borderCls = active
      ? 'border-emerald-300 dark:border-emerald-600'
      : 'border-slate-200 dark:border-gray-600';

    cells.push(
      <div
        key={day}
        onClick={() => active && setExpandedDay(isOpen ? null : ds)}
        className={`rounded-lg border ${borderCls} flex flex-col min-h-[72px] overflow-hidden transition-shadow ${
          active ? 'cursor-pointer hover:shadow-md hover:border-emerald-400' : ''
        } ${isToday ? 'ring-2 ring-amber-400 ring-offset-1' : ''} ${isOpen ? 'ring-2 ring-emerald-500 ring-offset-1' : ''}`}
      >
        <div className={`${headerCls} px-1.5 py-1 text-center flex-shrink-0 flex items-center justify-center gap-1`}>
          <span className="text-xs font-bold leading-none">{day}</span>
          {active && <span className="text-[9px] font-bold opacity-80">{entries.length > 1 ? `×${entries.length}` : ''}</span>}
        </div>
        {entries.length > 0 && (
          <div className="flex flex-col gap-0.5 p-1 overflow-hidden">
            {entries.slice(0, 2).map((log, i) => {
              const badge = KIND_BADGE[log.kind] ?? KIND_BADGE.progress;
              return (
                <span key={i} className={`inline-block text-[8px] font-bold px-1 py-0.5 rounded leading-tight truncate ${badge.cls}`}>
                  {badge.label}
                </span>
              );
            })}
            {entries.length > 2 && (
              <span className="text-[8px] text-slate-400 dark:text-slate-500 px-1">+{entries.length - 2} more</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 space-y-4">
      {/* Title + nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => handleMonthChange(new Date(year, month - 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-slate-300 text-lg font-bold transition-colors">
          ‹
        </button>
        <div className="text-center">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
            {calendarDate.toLocaleString('en', { month: 'long', year: 'numeric' })}
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Click an active day to expand</p>
        </div>
        <button onClick={() => handleMonthChange(new Date(year, month + 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-slate-300 text-lg font-bold transition-colors">
          ›
        </button>
      </div>

      {/* Day-name header */}
      <div className="grid grid-cols-7 gap-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">{cells}</div>

      {/* Expanded day detail panel */}
      {expandedDay && (() => {
        const entries = dayMap.get(expandedDay) ?? [];
        const dateLabel = new Date(expandedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return (
          <div className="border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{dateLabel}</h4>
              <button onClick={() => setExpandedDay(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">✕</button>
            </div>
            <div className="space-y-2">
              {entries.map((log, i) => {
                const badge  = KIND_BADGE[log.kind] ?? KIND_BADGE.progress;
                const lesson = lessonMap.get(log.lessonId);
                const time   = new Date(log.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={i} className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-slate-100 dark:border-gray-700">
                    <span className={`flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{lesson?.title ?? 'Unknown lesson'}</p>
                      {log.slide && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Slide {log.slide}{lesson ? '' : ''}</p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{time}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Badge legend */}
      <div className="flex flex-wrap gap-2 justify-center pt-1">
        {Object.entries(KIND_BADGE).map(([kind, { cls, label }]) => (
          <span key={kind} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
            {label}
          </span>
        ))}
      </div>

      {logs.length === 0 && (
        <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-4">No lesson activity logged yet.</p>
      )}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const ArabicStudentDetailPage: React.FC<Props> = ({
  student, teacherId, onBack, onUpdateStudent, onDeleteStudent, studentMode = false, vocabCount = 0,
  isArchived = false, onToggleArchive,
  hwDeepLink, onHwDeepLinkConsumed,
}) => {
  const { t } = useI18n();
  const [editOpen, setEditOpen]       = useState(false);

  // ── Meet now ────────────────────────────────────────────────────────────────
  // A Google Meet started outside the timetable: published to this student's
  // portal, where it pops a join card and stays live for an hour.
  const [meetState, setMeetState] = useState<'idle' | 'loading' | 'started'>('idle');
  const handleMeetNow = async () => {
    if (meetState === 'loading') return;
    if (!student.shareToken) {
      window.alert("Share this student's portal link first — the invitation is published to it.");
      return;
    }
    setMeetState('loading');
    try {
      const url = await createGoogleMeetLink(student.name, new Date().toISOString());
      if (!url) throw new Error('no link');
      const saved = await saveInstantMeeting('arabic', student.shareToken, url, `Lesson with ${student.name}`);
      if (!saved) throw new Error('not published');
      try { await navigator.clipboard.writeText(url); } catch { /* clipboard blocked — the tab opens below */ }
      window.open(url, '_blank', 'noopener');
      setMeetState('started');
      setTimeout(() => setMeetState('idle'), 60_000);
    } catch {
      setMeetState('idle');
      window.alert('Could not start the meeting. Make sure Google Calendar is connected, then try again.');
    }
  };
  const [showDelete, setShowDelete]   = useState(false);
  /** Who this student is, and everything you can do to them: one sheet,
      opened by tapping their name. (It replaced the ⋯ menu and the Profile tab.) */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lessons, setLessons]         = useState<ArabicLesson[]>([]);
  const [activeSection, setActiveSection] = useState<'lessons' | 'schedule' | 'exams' | 'vocabulary' | 'homework'>('lessons');
  const [examUnlocks, setExamUnlocks] = useState<ArabicExamUnlock[]>([]);
  const [examAttempts, setExamAttempts] = useState<ArabicExamAttempt[]>([]);
  const [markingAttempt, setMarkingAttempt] = useState<ArabicExamAttempt | null>(null);
  const [deepLinkLessonId, setDeepLinkLessonId] = useState<string | null>(null);
  const [gcalToken, setGcalToken] = useState<string | null>(() => getStoredToken());
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [upcomingLessons, setUpcomingLessons] = useState<UnifiedLesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonLogs, setLessonLogs]         = useState<ArabicLessonLog[]>([]);
  const [calendarDate, setCalendarDate]     = useState(new Date());

  useEffect(() => {
    getArabicLessons().then(setLessons);
  }, []);

  // Handle deep-link from homework notification
  useEffect(() => {
    if (!hwDeepLink) return;
    setActiveSection('lessons');
    setDeepLinkLessonId(hwDeepLink.lessonId);
    onHwDeepLinkConsumed?.();
  }, [hwDeepLink, onHwDeepLinkConsumed]);

  useEffect(() => {
    getLessonLogsForStudent(student.id).then(setLessonLogs);
  }, [student.id]);

  // Teacher's private note — shown in the hero card for the TUTOR only, and
  // only when there's something written. Never fetched in student mode so the
  // note can't reach the portal at all.
  const [teacherNote, setTeacherNote] = useState('');
  useEffect(() => {
    if (studentMode) { setTeacherNote(''); return; }
    getArabicStudentNote(student.id).then(setTeacherNote).catch(() => setTeacherNote(''));
  }, [student.id, studentMode]);

  // Exam unlocks + attempts for this student
  const reloadExams = useCallback(async () => {
    const [unlocks, attempts] = await Promise.all([
      getUnlocksForStudent(student.id),
      getAttemptsForStudent(student.id),
    ]);
    setExamUnlocks(unlocks);
    setExamAttempts(attempts);
  }, [student.id]);

  useEffect(() => { reloadExams(); }, [reloadExams]);

  useEffect(() => {
    setLessonsLoading(true);
    getStudentUnifiedLessons(student.id, student.shareToken)
      .then(setUpcomingLessons)
      .catch(console.error)
      .finally(() => setLessonsLoading(false));
  }, [student.id, student.shareToken]);

  // Load teacher availability so the student can see working hours
  useEffect(() => {
    if (teacherId) getTeacherAvailability(teacherId).then(setAvailabilitySlots);
  }, [teacherId]);

  // The suggested homework deadline: the start of the next lesson still ahead.
  const nextLessonAt = useMemo(() => {
    const now = Date.now();
    return upcomingLessons
      .map(l => new Date(l.startAt))
      .filter(d => d.getTime() > now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }, [upcomingLessons]);

  const lessonsPerWeek = lpw(student);
  const wl             = weeksLeft(student.goalDeadline);

  // Dialect filter for this student — only levantine/msa courses apply.
  // MEMOISED: these are passed as props to children, and this component
  // re-renders on its own schedule (clock ticks in the portal, realtime
  // notifications). A fresh array each render made children treat the lesson
  // list as "changed" and refetch — which is what flashed the vocabulary tab's
  // loading state every few seconds.
  const studentDialectFilter = useMemo(
    () => student.arabicDialects.filter(
      (d): d is ArabicCourseDialect => d === 'levantine' || d === 'msa'
    ),
    [student.arabicDialects],
  );
  // Lessons filtered to the student's dialect(s) — used everywhere dialect matters
  const dialectLessons = useMemo(
    () => (studentDialectFilter.length > 0
      ? lessons.filter(l => studentDialectFilter.includes(l.dialect ?? 'levantine'))
      : lessons),
    [lessons, studentDialectFilter],
  );
  // Count only lessons that match the student's dialect(s) for the tab badge
  const studentLessonCount = dialectLessons.length;

  const stroke = (d: string) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className="w-[18px] h-[18px]">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
  const RAIL_ICON: Record<string, React.ReactNode> = {
    lessons:    stroke('M12 3v18M12 7.5a2.5 2.5 0 1 0 0-.01M12 17.5a2.5 2.5 0 1 0 0-.01'),
    homework: stroke('M8 4h8M8 3h8v4H8zM6 5H4v16h16V5h-2M8 12h8M8 16h5'),
    vocabulary: stroke('M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z'),
    progress:   stroke('M4 19.5V13m5 6.5V8m5 11.5v-5m5 5V5'),
    schedule:   stroke('M3.5 10h17M8 3v4m8-4v4M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z'),
    exams:      stroke('m9 11.5 2 2 4.5-4.5M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z'),
    profile:    stroke('M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-7 7.5a7 7 0 0 1 14 0'),
    calendar:   stroke('M3.5 10h17M8 3v4m8-4v4M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z'),
  };

  const TABS: Array<{ key: 'lessons' | 'schedule' | 'exams' | 'vocabulary' | 'homework'; label: string; mobileLabel: string }> = [
    { key: 'lessons',  label: `${t('arabicPortal.lessons')} (${studentLessonCount})`,  mobileLabel: `${t('arabicPortal.lessons')} (${studentLessonCount})` },
    { key: 'vocabulary', label: t('arabicStudentDetail.tabLessonsVocab'), mobileLabel: t('arabicStudentDetail.tabLessonsVocab') },
    { key: 'homework', label: 'Homework', mobileLabel: 'Homework' },
    { key: 'schedule', label: 'Schedule', mobileLabel: 'Schedule' },
    ...(studentMode ? [] : [{ key: 'exams' as const, label: 'Exams', mobileLabel: 'Exams' }]),
  ];

  // Marking overlay (tutor opens a submitted attempt to grade it)
  if (markingAttempt && !studentMode) {
    return (
      <ExamMarkingPage
        attempt={markingAttempt}
        studentName={student.name}
        teacherId={teacherId}
        onBack={() => { setMarkingAttempt(null); reloadExams(); }}
        onPublished={() => { setMarkingAttempt(null); reloadExams(); }}
      />
    );
  }

  const doneInCourse = dialectLessons.filter(l => student.completedLessonIds.includes(l.id)).length;
  const courseTotal  = dialectLessons.length || 1;
  /** One bar per level: how many of its lessons are behind them. */
  const levelStats = ([1, 2, 3] as const).map(level => {
    const inLevel = dialectLessons.filter(l => (l.level ?? 1) === level);
    const done    = inLevel.filter(l => student.completedLessonIds.includes(l.id)).length;
    const total   = inLevel.length || LESSONS_PER_LEVEL;
    return { level, done, total, pct: Math.round((done / Math.max(total, 1)) * 100) };
  });
  const nextLesson   = upcomingLessons.find(l => new Date(l.startAt).getTime() > Date.now()) ?? null;
  const untilNext    = (() => {
    if (!nextLesson) return null;
    const hrs = Math.round((new Date(nextLesson.startAt).getTime() - Date.now()) / 3_600_000);
    if (hrs < 1) return 'starting now';
    if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? '' : 's'}`;
    const d = Math.round(hrs / 24);
    return `in ${d} day${d === 1 ? '' : 's'}`;
  })();

  /** A bar slot is 70px wide: these names fit on one line there. */
  const PHONE_LABEL: Record<string, string> = {
    lessons: 'Lessons', vocabulary: 'Words', homework: 'Homework', schedule: 'Schedule', exams: 'Exams',
  };

  /** One row of the rail's section list. */
  const railLink = (key: typeof activeSection, label: string, count: string | null, icon: React.ReactNode) => {
    const on = activeSection === key;
    return (
      <button key={key} onClick={() => setActiveSection(key)}
        className={`w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm transition-colors ${
          on ? 'bg-slate-100 dark:bg-gray-700 font-bold text-slate-900 dark:text-white'
             : 'font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700/60'}`}>
        <span className="flex-shrink-0 w-[18px] h-[18px]">{icon}</span>
        <span className="truncate">{label}</span>
        {count && <span className="ms-auto text-xs font-semibold text-slate-400 dark:text-slate-500">{count}</span>}
      </button>
    );
  };

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-[292px_minmax(0,1fr)] items-start">

        {/* ── The rail: who this is, what happens next, and where to go ── */}
        <div className="flex flex-col gap-3.5 lg:sticky lg:top-4">

          <div className="flex items-center gap-2">
            {!studentMode ? (
              <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
                {t('arabicStudentDetail.allStudents')}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: '#E4EDE8', color: '#1E4336' }}>
                🎓 {t('arabicStudentDetail.studentPortal')}
              </span>
            )}
          </div>

          {/* identity + how far through each level — tap it for everything else */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5">
            <button onClick={() => setSheetOpen(true)} aria-haspopup="dialog"
              className="w-full -m-1 p-1 rounded-xl flex items-center gap-3 text-start hover:bg-slate-50 dark:hover:bg-gray-700/60 transition-colors">
              <div className="w-[52px] h-[52px] flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden"
                style={{ background: '#E4EDE8', border: '1px solid #CFDED6' }}>
                {student.profileIcon
                  ? <StudentProfileIcon src={student.profileIcon} size={52} mode="always" />
                  : <span className="text-xl font-extrabold" style={{ color: '#2E5E4E' }}>{student.name.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="min-w-0 flex-grow">
                <h1 className="text-lg font-extrabold leading-tight text-slate-900 dark:text-slate-100 truncate">{student.name}</h1>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {student.arabicDialects.map(d => dialectLabel(d)).join(' · ')}
                </p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"
                className="w-4 h-4 flex-shrink-0 text-slate-300 dark:text-gray-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>

            {/* three levels, three bars */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {levelStats.map(l => (
                <div key={l.level} className="min-w-0">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">L{l.level}</span>
                    <span className="flex-grow" />
                    <span className={`text-[11px] font-extrabold ${l.done > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>{l.done}</span>
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">/{l.total}</span>
                  </div>
                  <div className="mt-1.5 h-3 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full bg-amber-500 dark:bg-amber-400 rounded-full transition-all" style={{ width: `${l.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-gray-700 flex items-center justify-between gap-2">
              <p className="text-[11.5px] font-bold text-slate-600 dark:text-slate-300 truncate">
                {doneInCourse} of {courseTotal} lessons
                {lessonsPerWeek !== null && <> · {lessonsPerWeek}/week</>}
              </p>
              <p className="text-[11.5px] font-extrabold text-amber-600 dark:text-amber-400 flex-shrink-0">
                {vocabCount > 0 ? t('arabicStudentDetail.wordsLearned', { count: vocabCount.toLocaleString() }) : 'No words yet'}
              </p>
            </div>
          </div>

          {/* the next lesson, and the one action that belongs to it */}
          <div className="rounded-2xl p-4" style={{ background: '#14161A' }}>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: '#9BA3A0' }}>Next lesson</p>
            {nextLesson ? (
              <>
                <p className="mt-1.5 text-lg font-extrabold text-white">
                  {new Date(nextLesson.startAt).toLocaleDateString([], { weekday: 'short' })} · {new Date(nextLesson.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: '#B6BDB9' }}>{untilNext}{nextLesson.title ? ` · ${nextLesson.title}` : ''}</p>
              </>
            ) : (
              <p className="mt-1.5 text-sm font-semibold" style={{ color: '#B6BDB9' }}>Nothing on the calendar yet</p>
            )}
            {!studentMode && (
              <button
                onClick={meetState === 'idle' ? handleMeetNow : undefined}
                title={meetState === 'started' ? 'Meet started — link copied, student notified' : 'Start a Google Meet now'}
                className="mt-3.5 w-full h-11 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 transition-colors"
                style={meetState === 'started' ? { background: '#CFE6DC', color: '#06231B' } : { background: '#4F9E85', color: '#06231B' }}>
                {meetState === 'loading' ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                )}
                {meetState === 'started' ? 'Meet started' : meetState === 'loading' ? 'Starting…' : 'Meet now'}
              </button>
            )}
          </div>

          {/* where to go — the old tab row, stood up on its side */}
          <nav className="hidden lg:flex bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-1.5 flex-col gap-0.5">
            {TABS.map(tab => railLink(
              tab.key,
              tab.label.replace(/\s*\(\d+\)$/, ''),
              tab.key === 'lessons' ? String(studentLessonCount) : tab.key === 'vocabulary' && vocabCount > 0 ? String(vocabCount) : null,
              RAIL_ICON[tab.key],
            ))}
          </nav>

          {/* the note nobody else sees */}
          {!studentMode && teacherNote.trim() && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                {t('arabicStudentDetail.teacherNoteTitle')}
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap" dir="auto">{teacherNote}</p>
            </div>
          )}
        </div>

        {/* ── The pane ── */}
        <div className="min-w-0 flex flex-col gap-4 max-lg:pb-24">

      {/* ── Lessons section — the history first, then the library ── */}
      {activeSection === 'lessons' && (
        <ArabicLessonCalendar
          logs={lessonLogs}
          lessons={dialectLessons}
          calendarDate={calendarDate}
          onMonthChange={setCalendarDate}
        />
      )}
      {activeSection === 'lessons' && (
        <ArabicLessonPage
          students={[student]}
          teacherId={teacherId}
          preSelectedStudentId={student.id}
          onStudentUpdated={onUpdateStudent}
          studentMode={studentMode}
          dialectFilter={studentDialectFilter}
          examUnlocks={examUnlocks}
          deepLinkLessonId={deepLinkLessonId}
          onDeepLinkConsumed={() => setDeepLinkLessonId(null)}
        />
      )}

      {/* ── Lessons Vocabulary section (tutor + student portal) ── */}
      {activeSection === 'vocabulary' && (
        <ArabicLessonsVocabularyTab
          lessons={dialectLessons}
          student={student}
          studentMode={studentMode}
          nextLessonAt={nextLessonAt}
        />
      )}

      {activeSection === 'homework' && <ArabicHomeworkTab student={student} lessons={dialectLessons} studentMode={studentMode} />}

      {/* ── Exams section (tutor only) ── */}
      {activeSection === 'exams' && !studentMode && (
        <ExamsTab
          studentId={student.id}
          studentName={student.name}
          teacherId={teacherId}
          unlocks={examUnlocks}
          attempts={examAttempts}
          onChanged={reloadExams}
          onMark={setMarkingAttempt}
        />
      )}

      {/* ── Schedule section — their lessons, then the tutor's open hours ── */}
        {activeSection === 'schedule' && (
          <div className="space-y-4">
            {/* Next lesson banner */}
            {upcomingLessons.length > 0 && (() => {
              const next = upcomingLessons[0];
              const now = new Date();
              const d = next.startAt;
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const lessonDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
              const diffDays = Math.round((lessonDay.getTime() - today.getTime()) / 86400000);
              const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const dateLabel = diffDays === 0
                ? `Today · ${time}`
                : diffDays === 1
                ? `Tomorrow · ${time}`
                : `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
              // Countdown
              const msLeft = d.getTime() - now.getTime();
              const totalMin = Math.max(0, Math.floor(msLeft / 60000));
              const days = Math.floor(totalMin / 1440);
              const hours = Math.floor((totalMin % 1440) / 60);
              const mins = totalMin % 60;
              const countdown = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

              return (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-2xl flex-shrink-0">📅</div>
                    <div>
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-0.5">Next Lesson</p>
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-base">{dateLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-full text-sm font-bold">⏱ {countdown}</span>
                    {next.meetUrl ? (
                      <a href={next.meetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                        Join Lesson 🚀
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No meet link yet</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Full timeline */}
            {lessonsLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
              </div>
            ) : (
              <LessonTimeline
                lessons={upcomingLessons}
                showJoin={true}
                emptyMessage="No upcoming lessons scheduled. Link calendar events or have the student book a lesson."
              />
            )}

            {/* Book another one — the tutor's open hours, in the same place */}
            {studentMode && (
              <div className="pt-1">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  {t('arabicPortal.tabAvailability')}
                </h3>
                <CalendarPage
                  gcalToken={gcalToken}
                  onTokenChange={setGcalToken}
                  isStudentView={true}
                  studentTimezone={student.timezone || undefined}
                  availabilitySlots={availabilitySlots}
                  teacherId={teacherId}
                  studentId={student.shareToken}
                  studentName={student.name}
                  studentWhatsApp={student.whatsapp}
                  portalType="arabic"
                />
              </div>
            )}
          </div>
        )}

        </div>
      </div>

      {/* ── Phones: the sections sit under the thumb, not above the content ── */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="px-1.5 pt-1.5 grid gap-0.5"
          style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}>
          {TABS.map(tab => {
            const on = activeSection === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveSection(tab.key)}
                className={`h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                  on ? 'bg-slate-100 dark:bg-gray-700 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                {RAIL_ICON[tab.key]}
                <span className={`text-[10.5px] leading-none ${on ? 'font-extrabold' : 'font-semibold'}`}>{PHONE_LABEL[tab.key] ?? tab.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── The student sheet: who they are, and everything you can do ── */}
      {sheetOpen && (
        <>
          <span className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px]" onClick={() => { setSheetOpen(false); setShowDelete(false); }} />
          <div role="dialog" aria-label={student.name}
            className="fixed z-50 inset-x-3 bottom-3 top-auto sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[480px]
              max-h-[82vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 shadow-2xl">

            <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-white dark:bg-gray-800 border-b border-slate-100 dark:border-gray-700">
              <div className="w-11 h-11 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden"
                style={{ background: '#E4EDE8', border: '1px solid #CFDED6' }}>
                {student.profileIcon
                  ? <StudentProfileIcon src={student.profileIcon} size={44} mode="always" />
                  : <span className="text-lg font-extrabold" style={{ color: '#2E5E4E' }}>{student.name.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="min-w-0 flex-grow">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">{student.name}</h2>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
                  {student.arabicDialects.map(d => dialectLabel(d)).join(' · ')}
                </p>
              </div>
              <button onClick={() => { setSheetOpen(false); setShowDelete(false); }} aria-label={t('arabicStudentDetail.cancel')}
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-5">
              <dl className="space-y-4">
                <InfoRow label={t('arabicStudentDetail.dob')}  value={student.dob ? new Date(student.dob).toLocaleDateString() : undefined} />
                <InfoRow label={t('arabicStudentDetail.lessonsFor')}    value={student.forSelf ? t('arabicStudentDetail.themselves') : `${t('arabicStudentDetail.someoneElse')} (${student.forWhom || t('arabicStudentDetail.notSpecified')})`} />
                <InfoRow label={t('arabicStudentDetail.whatsapp')}        value={student.whatsapp} />
                <InfoRow label={t('arabicStudentDetail.nationality')}     value={student.nationality} />
                <InfoRow label={t('arabicStudentDetail.timezone')}        value={student.timezone} />
                <InfoRow label={t('arabicStudentDetail.goalDeadline')}   value={student.goalDeadline ? new Date(student.goalDeadline).toLocaleDateString() : undefined} />
                <InfoRow label={t('arabicStudentDetail.learningGoals')}
                  value={student.learningPurposes.length ? student.learningPurposes.join(', ') : undefined} />
                <InfoRow label={t('arabicStudentDetail.topicsToFocus')}
                  value={student.topicsToFocus.length ? student.topicsToFocus.join(', ') : undefined} />
              </dl>

              {student.availability.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">{t('arabicStudentDetail.weeklyAvailability')}</h3>
                  <AvailabilityGrid slots={student.availability} timezone={student.timezone} />
                </div>
              )}

              <div className="pt-1 border-t border-slate-100 dark:border-gray-700 flex flex-col gap-1">
                <button onClick={() => { setEditOpen(true); setSheetOpen(false); }}
                  className="w-full h-11 px-3 rounded-xl text-start text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                  {t('arabicStudentDetail.editMyInfo')}
                </button>
                {!studentMode && onToggleArchive && (
                  <button onClick={() => { onToggleArchive(!isArchived); setSheetOpen(false); }}
                    className="w-full h-11 px-3 rounded-xl text-start text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                    {isArchived ? 'Restore to active students' : 'Archive this student'}
                  </button>
                )}
                {!studentMode && (
                  showDelete ? (
                    <div className="h-11 px-3 flex items-center gap-2">
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">{t('arabicStudentDetail.areYouSure')}</span>
                      <span className="flex-grow" />
                      <button onClick={() => onDeleteStudent(student.id)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">{t('arabicStudentDetail.yesDelete')}</button>
                      <button onClick={() => setShowDelete(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 text-xs font-semibold">{t('arabicStudentDetail.cancel')}</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowDelete(true)}
                      className="w-full h-11 px-3 rounded-xl text-start text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      {t('arabicStudentDetail.delete')}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit modal */}
      <ArabicAddStudentModal
        isOpen={editOpen}
        teacherId={teacherId}
        existing={student}
        hideBilling={studentMode}
        onClose={() => setEditOpen(false)}
        onSave={updated => { onUpdateStudent(updated); setEditOpen(false); }}
      />
    </div>
  );
};

export default ArabicStudentDetailPage;
