// components/ArabicDashboard.tsx
// ---------------------------------------------------------------------------
// Lists all Arabic students for the logged-in teacher.
// Shows a Next Lesson banner based on real session bookings (not availability).
// Includes a "Link Calendar Events" panel for assigning GCal events to students.
// ---------------------------------------------------------------------------

const SITE_URL = 'https://www.lisanquran.com';

import React, { useState, useMemo, useEffect } from 'react';
import { ArabicStudent, LessonSession } from '../types';
import ArabicAddStudentModal from './ArabicAddStudentModal';
import { ensureShareToken } from '../services/arabicService';
import { safeCopy } from '../utils';
import { getTeacherBookings, updateBookingMeetUrl } from '../services/lessonBookingService';
import {
  createGoogleMeetLink,
} from '../services/googleCalendarService';
import {
  getUpcomingSessions,
  updateSessionMeetUrl,
} from '../services/lessonSessionService';
import { useI18n } from '../context/I18nProvider';

interface Props {
  teacherId: string;
  students: ArabicStudent[];
  vocabCounts?: Record<string, number>;
  onAddStudent:    (s: ArabicStudent) => void;
  onSelectStudent: (id: string) => void;
  onUpdateStudent: (s: ArabicStudent) => void;
  onFamilyLinks?:  () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function progressPercent(s: ArabicStudent): number {
  return Math.min(100, Math.round((s.completedLessonIds.length / 60) * 100));
}

function dialectLabel(d: string): string {
  return { msa: 'MSA', levantine: 'Levantine', quranic: 'Quranic' }[d] ?? d;
}

/** Format a lesson date as "Today · 6:00 PM", "Tomorrow · 6:00 PM", or "Mon 23 May · 6:00 PM" */
function formatSessionDate(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lessonDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays  = Math.round((lessonDay.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

/** Convert a LessonBooking to its next occurrence Date (Istanbul time → local) */
function getBookingNextDate(booking: import('../services/lessonBookingService').LessonBooking): Date | null {
  const now = new Date();
  if (booking.bookingType === 'single' && booking.specificDate) {
    const d = new Date(`${booking.specificDate}T${String(booking.hour).padStart(2,'0')}:${String(booking.minute).padStart(2,'0')}:00+03:00`);
    return d > now ? d : null;
  }
  // Weekly: find next occurrence
  const targetDay = booking.dayOfWeek; // 0=Mon…6=Sun (Istanbul)
  for (let i = 0; i <= 7; i++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + i);
    // JS getDay: 0=Sun…6=Sat; convert to Mon=0…Sun=6
    const jsDay = candidate.getDay();
    const monDay = jsDay === 0 ? 6 : jsDay - 1;
    if (monDay !== targetDay) continue;
    const iso = `${candidate.toISOString().slice(0, 10)}T${String(booking.hour).padStart(2,'0')}:${String(booking.minute).padStart(2,'0')}:00+03:00`;
    const d = new Date(iso);
    if (d > now) return d;
  }
  return null;
}

// ── component ─────────────────────────────────────────────────────────────────

const ArabicDashboard: React.FC<Props> = ({
  teacherId, students, vocabCounts = {},
  onAddStudent, onSelectStudent, onUpdateStudent, onFamilyLinks,
}) => {
  const { t } = useI18n();

  // ── state ─────────────────────────────────────────────────────────────────
  const [modalOpen,       setModalOpen]       = useState(false);
  const [search,          setSearch]          = useState('');
  const [copyingId,       setCopyingId]       = useState<string | null>(null);
  const [copiedId,        setCopiedId]        = useState<string | null>(null);

  // sessions
  const [sessions,        setSessions]        = useState<LessonSession[]>([]);
  const [bookings,        setBookings]        = useState<import('../services/lessonBookingService').LessonBooking[]>([]);

  // meet link
  const [meetGenerating,  setMeetGenerating]  = useState(false);
  const [meetCopied,      setMeetCopied]      = useState(false);

  // ── load sessions ─────────────────────────────────────────────────────────
  useEffect(() => {
    getUpcomingSessions(teacherId)
      .then(setSessions)
      .catch(err => console.error('[Sessions] load failed:', err));
  }, [teacherId]);

  useEffect(() => {
    getTeacherBookings(teacherId)
      .then(all => setBookings(all.filter(b => b.status === 'confirmed' && b.portalType === 'arabic')))
      .catch(console.error);
  }, [teacherId]);

  // ── next lesson from sessions + bookings ─────────────────────────────────
  const nextLesson = useMemo(() => {
    const now = new Date();
    let best: {
      date: Date;
      student: ArabicStudent;
      meetUrl?: string;
      sessionId?: string;
      bookingId?: string;
      title?: string;
    } | null = null;

    // From GCal-linked sessions
    for (const session of sessions) {
      const d = new Date(session.startAt);
      if (d <= now) continue;
      const student = students.find(s => s.id === session.studentId);
      if (!student) continue;
      if (!best || d < best.date) {
        best = { date: d, student, meetUrl: session.meetUrl, sessionId: session.id, title: session.title };
      }
    }

    // From platform bookings (matched by share token)
    for (const booking of bookings) {
      if (booking.status !== 'confirmed' || booking.portalType !== 'arabic') continue;
      const student = students.find(s => s.shareToken === booking.studentId);
      if (!student) continue;
      // Next occurrence
      const now2 = new Date();
      let nextDate: Date | null = null;
      if (booking.bookingType === 'single' && booking.specificDate) {
        const d = new Date(`${booking.specificDate}T${String(booking.hour).padStart(2,'0')}:${String(booking.minute).padStart(2,'0')}:00+03:00`);
        if (d > now2) nextDate = d;
      } else if (booking.bookingType === 'weekly') {
        for (let i = 0; i <= 7; i++) {
          const c = new Date(now2); c.setDate(c.getDate() + i);
          const jsDay = c.getDay(); const monDay = jsDay === 0 ? 6 : jsDay - 1;
          if (monDay !== booking.dayOfWeek) continue;
          const iso = `${c.toISOString().slice(0,10)}T${String(booking.hour).padStart(2,'0')}:${String(booking.minute).padStart(2,'0')}:00+03:00`;
          const d = new Date(iso); if (d > now2) { nextDate = d; break; }
        }
      }
      if (!nextDate) continue;
      if (!best || nextDate < best.date) {
        best = { date: nextDate, student, meetUrl: booking.meetUrl, bookingId: booking.id };
      }
    }

    return best;
  }, [sessions, bookings, students]);

  const highlightedStudentId = nextLesson?.student.id ?? null;
  const linkedStudentIds = new Set(sessions.map(s => s.studentId));

  // ── Meet link ─────────────────────────────────────────────────────────────
  async function handleGenerateMeetLink() {
    if (!nextLesson) return;
    setMeetGenerating(true);
    try {
      const url = await createGoogleMeetLink(
        nextLesson.student.name,
        nextLesson.date.toISOString(),
      );
      if (!url) { alert('Could not generate Meet link. Make sure Google Calendar is connected.'); return; }

      if (nextLesson.sessionId) {
        await updateSessionMeetUrl(nextLesson.sessionId, url);
        setSessions(prev => prev.map(s => s.id === nextLesson.sessionId ? { ...s, meetUrl: url } : s));
      } else if (nextLesson.bookingId) {
        await updateBookingMeetUrl(nextLesson.bookingId, url);
        setBookings(prev => prev.map(b => b.id === nextLesson.bookingId ? { ...b, meetUrl: url } : b));
      }
    } finally {
      setMeetGenerating(false);
    }
  }

  async function handleCopyMeetLink() {
    if (!nextLesson?.meetUrl) return;
    await safeCopy(nextLesson.meetUrl);
    setMeetCopied(true);
    setTimeout(() => setMeetCopied(false), 2500);
  }

  async function handleClearMeetLink() {
    if (!nextLesson) return;
    if (nextLesson.sessionId) {
      await updateSessionMeetUrl(nextLesson.sessionId, null);
      setSessions(prev => prev.map(s => s.id === nextLesson.sessionId ? { ...s, meetUrl: undefined } : s));
    } else if (nextLesson.bookingId) {
      await updateBookingMeetUrl(nextLesson.bookingId, null);
      setBookings(prev => prev.map(b => b.id === nextLesson.bookingId ? { ...b, meetUrl: undefined } : b));
    }
  }

  // ── copy share link ───────────────────────────────────────────────────────
  async function handleCopyLink(student: ArabicStudent, e: React.MouseEvent) {
    e.stopPropagation();
    setCopyingId(student.id);
    try {
      const token = await ensureShareToken(student);
      if (!student.shareToken) onUpdateStudent({ ...student, shareToken: token });
      await safeCopy(`${SITE_URL}/arabic/s/${token}`);
      setCopiedId(student.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      console.error('copyLink:', err);
    } finally {
      setCopyingId(null);
    }
  }

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <span className="text-2xl" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</span>
            {t('arabicDashboard.title')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {students.length === 1
              ? t('arabicDashboard.studentCount_one',  { count: students.length })
              : t('arabicDashboard.studentCount_other', { count: students.length })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {onFamilyLinks && (
            <button
              onClick={onFamilyLinks}
              className="flex items-center gap-2 px-4 py-2.5 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-semibold rounded-lg border border-teal-200 dark:border-teal-700 shadow-sm transition-colors"
            >
              <span className="text-base">👨‍👩‍👧‍👦</span>
              {t('arabicDashboard.familyLinks')}
            </button>
          )}
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg shadow-sm transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('arabicDashboard.addStudent')}
          </button>
        </div>
      </div>

      {/* ── Next Lesson Banner ──────────────────────────────────────────────── */}
      {nextLesson && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-2xl flex-shrink-0">📅</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Upcoming Lesson</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                You have a lesson with{' '}
                <span className="font-bold text-slate-900 dark:text-white">{nextLesson.student.name}</span>
                {' '}on{' '}
                <span className="font-bold text-slate-900 dark:text-white">{formatSessionDate(nextLesson.date.toISOString())}</span>
              </p>
              {nextLesson.title && (
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{nextLesson.title}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {nextLesson.meetUrl ? (
              <>
                <button onClick={handleCopyMeetLink} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                  {meetCopied ? '✓ Copied!' : (<><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg> Copy Link</>)}
                </button>
                <a href={nextLesson.meetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  Join Lesson
                </a>
                <button onClick={handleClearMeetLink} title="Remove link" className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </>
            ) : (
              <button onClick={handleGenerateMeetLink} disabled={meetGenerating} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-semibold transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                {meetGenerating ? 'Generating…' : 'Generate Meet Link'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Search ─────────────────────────────────────────────────────────── */}
      {students.length > 3 && (
        <div className="relative max-w-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('arabicDashboard.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      )}

      {/* ── Empty ──────────────────────────────────────────────────────────── */}
      {students.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-16 text-center">
          <div className="text-6xl mb-4" style={{ fontFamily: 'Amiri Regular, serif' }}>ع</div>
          <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">{t('arabicDashboard.noStudents')}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('arabicDashboard.noStudentsHint')}</p>
          <button
            onClick={() => setModalOpen(true)}
            className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors"
          >
            {t('arabicDashboard.addFirstStudent')}
          </button>
        </div>
      )}

      {/* ── Student grid ───────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <StudentCard
              key={s.id}
              student={s}
              vocabCount={vocabCounts[s.id] ?? 0}
              isNext={s.id === highlightedStudentId}
              isLinked={linkedStudentIds.has(s.id)}
              onClick={() => onSelectStudent(s.id)}
              onCopyLink={e => handleCopyLink(s, e)}
              copying={copyingId === s.id}
              copied={copiedId === s.id}
            />
          ))}
        </div>
      )}

      {filtered.length === 0 && students.length > 0 && (
        <p className="text-center text-slate-500 dark:text-slate-400 py-8">
          {t('arabicDashboard.noMatch', { search })}
        </p>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────────── */}
      <ArabicAddStudentModal
        isOpen={modalOpen}
        teacherId={teacherId}
        onClose={() => setModalOpen(false)}
        onSave={s => { onAddStudent(s); setModalOpen(false); }}
      />
    </div>
  );
};

// ── Student card ──────────────────────────────────────────────────────────────

interface CardProps {
  student: ArabicStudent;
  vocabCount: number;
  isNext: boolean;
  isLinked: boolean;
  onClick: () => void;
  onCopyLink: (e: React.MouseEvent) => void;
  copying: boolean;
  copied: boolean;
}

const StudentCard: React.FC<CardProps> = ({ student: s, vocabCount, isNext, isLinked, onClick, onCopyLink, copying, copied }) => {
  const { t } = useI18n();
  const pct = progressPercent(s);

  return (
    <div className={`group relative bg-white dark:bg-gray-800 rounded-2xl shadow-sm border transition-all duration-200 ${
      isNext
        ? 'border-amber-400 dark:border-amber-500 shadow-amber-100 dark:shadow-amber-900/30 shadow-md ring-2 ring-amber-300/50 dark:ring-amber-600/30'
        : 'border-slate-200 dark:border-gray-700 hover:shadow-md hover:border-amber-300 dark:hover:border-amber-600'
    }`}>
      {/* Next lesson badge */}
      {isNext && (
        <div className="absolute -top-2.5 left-4 flex items-center gap-1 px-2.5 py-0.5 bg-amber-400 dark:bg-amber-500 rounded-full shadow-sm">
          <span className="text-xs">📅</span>
          <span className="text-xs font-bold text-white">Next lesson</span>
        </div>
      )}

      <button onClick={onClick} className="text-left w-full p-5 pt-6">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${
            isNext
              ? 'bg-amber-200 dark:bg-amber-800/60 text-amber-800 dark:text-amber-200'
              : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
          }`}>
            {s.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}</p>
              {isLinked && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-[9px] font-bold rounded-full">
                  🔗 Linked
                </span>
              )}
              {vocabCount > 0 && (
                <span className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/30 px-2 py-0.5 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-3 h-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                  {t('arabicPortal.words', { count: vocabCount.toLocaleString() })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Dialects */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {s.arabicDialects.map(d => (
            <span key={d} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
              {dialectLabel(d)}
            </span>
          ))}
          {s.nationality && (
            <span className="px-2 py-0.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-400 rounded-full text-xs">
              {s.nationality}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>{t('arabicDashboard.lessonProgress')}</span>
            <span className="font-semibold">{s.completedLessonIds.length} / 60</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {s.goalDeadline && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            {t('arabicDashboard.goal', { date: new Date(s.goalDeadline).toLocaleDateString() })}
          </p>
        )}
      </button>

      {/* Share link button */}
      <div className="px-5 pb-4">
        <button
          onClick={onCopyLink}
          disabled={copying}
          className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold border transition-all ${
            copied
              ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-50 dark:bg-gray-700 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-700 hover:text-amber-700 dark:hover:text-amber-300'
          }`}
        >
          {copying ? (
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          ) : copied ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
            </svg>
          )}
          {copying ? t('arabicDashboard.generating') : copied ? t('arabicDashboard.linkCopied') : t('arabicDashboard.copyLink')}
        </button>
      </div>
    </div>
  );
};

export default ArabicDashboard;
