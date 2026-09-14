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
const HOURS = Array.from({ length: 11 }, (_, i) => i + 12);

function formatHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h > 12 ? h - 12 : h}:00 ${ampm}`;
}

function progressPercent(s: ArabicStudent) {
  return Math.min(100, Math.round((s.completedLessonIds.length / 60) * 100));
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

// ── Student's Progress Tab ────────────────────────────────────────────────────
// The lesson-history calendar. (The spaced-repetition schedule and the wrong
// words list used to live here; word strength now shows beside every word in
// the Lessons Vocabulary tab instead.)

interface ProgressTabProps {
  lessons: ArabicLesson[];
  lessonLogs: ArabicLessonLog[];
  calendarDate: Date;
  onMonthChange: (d: Date) => void;
}

const ProgressTab: React.FC<ProgressTabProps> = ({ lessons, lessonLogs, calendarDate, onMonthChange }) => (
  <div className="space-y-8">
    <ArabicLessonCalendar
      logs={lessonLogs}
      lessons={lessons}
      calendarDate={calendarDate}
      onMonthChange={onMonthChange}
    />
  </div>
);

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
  const [lessons, setLessons]         = useState<ArabicLesson[]>([]);
  const [activeSection, setActiveSection] = useState<'profile' | 'lessons' | 'progress' | 'calendar' | 'schedule' | 'exams' | 'vocabulary'>('lessons');
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

  const completedCount = student.completedLessonIds.length;
  const pct            = progressPercent(student);
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

  const TABS: Array<{ key: 'lessons' | 'profile' | 'progress' | 'calendar' | 'schedule' | 'exams' | 'vocabulary'; label: string; mobileLabel: string }> = [
    { key: 'lessons',  label: `${t('arabicPortal.lessons')} (${studentLessonCount})`,  mobileLabel: `${t('arabicPortal.lessons')} (${studentLessonCount})` },
    { key: 'vocabulary', label: t('arabicStudentDetail.tabLessonsVocab'), mobileLabel: t('arabicStudentDetail.tabLessonsVocab') },
    { key: 'progress', label: t('arabicPortal.tabProgress'),  mobileLabel: t('arabicPortal.tabProgress') },
    { key: 'schedule', label: 'Schedule', mobileLabel: 'Schedule' },
    ...(studentMode ? [] : [{ key: 'exams' as const, label: 'Exams', mobileLabel: 'Exams' }]),
    { key: 'profile',          label: t('arabicPortal.tabProfile'),   mobileLabel: t('arabicPortal.tabProfile') },
    ...(studentMode ? [{ key: 'calendar' as const, label: t('arabicPortal.tabAvailability'), mobileLabel: t('arabicPortal.tabAvailability') }] : []),
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

  return (
    <div className="space-y-6">
      {/* ── Back + actions bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Back button — hidden in student mode (no list to go back to) */}
        {!studentMode && (
          <button onClick={onBack} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            <span className="font-semibold">{t('arabicStudentDetail.allStudents')}</span>
          </button>
        )}
        {studentMode && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-full">
            <span className="text-amber-600 dark:text-amber-400 text-sm">🎓</span>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t('arabicStudentDetail.studentPortal')}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {!studentMode && (
            <button
              onClick={meetState === 'idle' ? handleMeetNow : undefined}
              title={meetState === 'started' ? 'Meet started — link copied, student notified' : 'Start a Google Meet now'}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                meetState === 'started'
                  ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                  : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700'}`}
            >
              {meetState === 'loading' ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              )}
              {meetState === 'started' ? 'Meet started' : meetState === 'loading' ? 'Starting…' : 'Meet now'}
            </button>
          )}
          {!studentMode && onToggleArchive && (
            <button
              onClick={() => onToggleArchive(!isArchived)}
              title={isArchived ? 'Restore to active students' : 'Archive this student'}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${
                isArchived
                  ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              {isArchived ? 'Restore' : 'Archive'}
            </button>
          )}
          <button onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            {t('arabicStudentDetail.editMyInfo')}
          </button>
          {/* Delete — only shown to tutor, never to student */}
          {!studentMode && (!showDelete ? (
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              {t('arabicStudentDetail.delete')}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">{t('arabicStudentDetail.areYouSure')}</span>
              <button onClick={() => { onDeleteStudent(student.id); }}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">{t('arabicStudentDetail.yesDelete')}</button>
              <button onClick={() => setShowDelete(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">{t('arabicStudentDetail.cancel')}</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-2xl border border-amber-200 dark:border-amber-800 p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-amber-400 dark:bg-amber-600">
            {student.profileIcon
              ? <StudentProfileIcon src={student.profileIcon} size={64} mode="always" />
              : <span className="text-white text-3xl font-extrabold">{student.name.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{student.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {student.arabicDialects.map(d => (
                <span key={d} className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">{dialectLabel(d)}</span>
              ))}
              {vocabCount > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded-full text-xs font-semibold">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  {t('arabicStudentDetail.wordsLearned', { count: vocabCount.toLocaleString() })}
                </span>
              )}
            </div>
          </div>

          {/* Lesson plan widget */}
          {lessonsPerWeek !== null && (
            <div className="flex-shrink-0 text-right">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">{t('arabicStudentDetail.lessonsPerWeek')}</p>
              <p className="text-4xl font-extrabold text-amber-600 dark:text-amber-300">{lessonsPerWeek}</p>
              {wl !== null && <p className="text-xs text-amber-500/80 mt-0.5">{t('arabicStudentDetail.weeksLeft', { count: wl })}</p>}
            </div>
          )}
        </div>

        {/* Milestone station progress track */}
        <div className="mt-5">
          {(() => {
            const completedSet = new Set(student.completedLessonIds);
            const levelCounts = ([1, 2, 3] as const).map(lvl => {
              const lvlIds = dialectLessons.filter(l => l.level === lvl).map(l => l.id);
              const done = lvlIds.filter(id => completedSet.has(id)).length;
              return { lvl, done };
            });
            const currentLevel = levelCounts.find(lc => lc.done < 20)?.lvl ?? 3;
            const cur          = levelCounts.find(lc => lc.lvl === currentLevel)!;
            const lvlLessons   = dialectLessons
              .filter(l => l.level === currentLevel)
              .sort((a, b) => a.orderIndex - b.orderIndex);

            return (
              <>
                {/* Level overview row */}
                <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
                  {levelCounts.map(({ lvl, done }) => {
                    const isComplete = done >= 20;
                    const isCurr    = lvl === currentLevel;
                    return (
                      <span key={lvl} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                        isComplete
                          ? 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                          : isCurr
                          ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200'
                          : 'bg-slate-100 dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-400 dark:text-slate-500'
                      }`}>
                        {isComplete ? '✓' : isCurr ? '▶' : '○'} Lvl {lvl}
                      </span>
                    );
                  })}
                  <span className="w-full sm:w-auto sm:ml-auto text-center text-xs text-slate-400 dark:text-slate-500 font-semibold">
                    {cur.done} / {Math.min(lvlLessons.length, 20)} · {dialectLessons.filter(l => completedSet.has(l.id)).length} / {dialectLessons.length} total
                  </span>
                </div>

                {/* Station tracks — every level's lessons, wrapped to fit the
                    container (no left/right scrolling). */}
                <div className="space-y-3">
                  {([1, 2, 3] as const).map(lvl => {
                    const levelLessons = dialectLessons
                      .filter(l => l.level === lvl)
                      .sort((a, b) => a.orderIndex - b.orderIndex);
                    if (levelLessons.length === 0) return null;
                    const firstInc = levelLessons.findIndex(l => !completedSet.has(l.id));
                    return (
                      <div key={lvl}>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1 text-center">
                          Level {lvl}
                        </p>
                        <div className="flex flex-wrap justify-center items-start gap-x-1 gap-y-2">
                          {levelLessons.map((lesson, idx) => {
                            const isDone    = completedSet.has(lesson.id);
                            const isCurrent = lvl === currentLevel && !isDone && idx === firstInc;
                            return (
                              <div key={lesson.id} className="flex flex-col items-center" style={{ width: 60 }}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 shadow-sm ${
                                  isDone
                                    ? 'bg-emerald-400 dark:bg-emerald-500 text-white'
                                    : isCurrent
                                    ? 'bg-amber-400 text-white ring-2 ring-amber-300 dark:ring-amber-500'
                                    : 'bg-slate-200 dark:bg-gray-600 text-slate-400 dark:text-slate-300'
                                }`}>
                                  {isDone ? '✓' : idx + 1}
                                </div>
                                <p className={`mt-1 text-center leading-tight px-0.5 ${
                                  isDone    ? 'text-emerald-600 dark:text-emerald-400' :
                                  isCurrent ? 'text-amber-700 dark:text-amber-300 font-semibold' :
                                              'text-slate-400 dark:text-slate-500'
                                }`} style={{ fontSize: 9, width: 58, wordBreak: 'break-word' }}>
                                  {lesson.title}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>

        {/* ── Teacher's note (TUTOR ONLY) ──────────────────────────────────
            Sits under the lesson circles inside the student card. Rendered
            only when a note exists; teacherNote stays empty in student mode
            (never fetched there), so the portal never shows it. */}
        {!studentMode && teacherNote.trim() && (
          <div className="mt-5 pt-4 border-t border-amber-200/70 dark:border-amber-800/60">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700/80 dark:text-amber-400/80 mb-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              {t('arabicStudentDetail.teacherNoteTitle')}
              <span className="font-semibold normal-case tracking-normal text-amber-600/60 dark:text-amber-500/60">
                {t('arabicStudentDetail.teacherNotePrivate')}
              </span>
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed" dir="auto">
              {teacherNote}
            </p>
          </div>
        )}
      </div>

      {/* ── Section tabs ── */}
      {/* Tabs WRAP onto as many rows as they need — no sideways scrolling, so
          every tab (including Lessons Vocabulary) is visible at a glance. */}
      <div className="flex flex-wrap gap-x-1 gap-y-0 border-b border-slate-200 dark:border-gray-700">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={`px-2.5 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors -mb-px ${
              activeSection === tab.key
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <span className="sm:hidden">{tab.mobileLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Lessons section ── */}
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

      {/* ── Student's Progress section ── */}
      {activeSection === 'progress' && (
        <ProgressTab
          lessons={dialectLessons}
          lessonLogs={lessonLogs}
          calendarDate={calendarDate}
          onMonthChange={setCalendarDate}
        />
      )}

      {/* ── Tutor's Availability section (student mode only) ── */}
      {activeSection === 'calendar' && studentMode && (
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
      )}

      {/* ── Schedule section ── */}
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
          </div>
        )}

      {/* ── Profile section ── */}
      {activeSection === 'profile' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6 space-y-5">
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
        </div>
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
