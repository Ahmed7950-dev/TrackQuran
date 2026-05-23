// components/ArabicDashboard.tsx
// ---------------------------------------------------------------------------
// Lists all Arabic students for the logged-in teacher.
// Shows a Next Lesson banner based on real session bookings (not availability).
// Includes a "Link Calendar Events" panel for assigning GCal events to students.
// ---------------------------------------------------------------------------

const SITE_URL = 'https://www.lisanquran.com';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ArabicStudent, LessonSession } from '../types';
import ArabicAddStudentModal from './ArabicAddStudentModal';
import { ensureShareToken } from '../services/arabicService';
import {
  getStoredToken,
  refreshAccessToken,
  wasConnected,
  fetchGCalEvents,
  createGoogleMeetLink,
  type GCalEvent,
} from '../services/googleCalendarService';
import {
  getUpcomingSessions,
  linkGCalSession,
  unlinkSession,
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

  // calendar panel
  const [showCalPanel,    setShowCalPanel]    = useState(false);
  const [gcalEvents,      setGcalEvents]      = useState<GCalEvent[]>([]);
  const [gcalLoading,     setGcalLoading]     = useState(false);
  const [gcalError,       setGcalError]       = useState<string | null>(null);
  const [linkingId,       setLinkingId]       = useState<string | null>(null); // gcalEventId being linked
  const [linkSelections,  setLinkSelections]  = useState<Record<string, string>>({}); // gcalEventId → studentId

  // meet link
  const [meetGenerating,  setMeetGenerating]  = useState(false);
  const [meetCopied,      setMeetCopied]      = useState(false);

  // ── load sessions ─────────────────────────────────────────────────────────
  useEffect(() => {
    getUpcomingSessions(teacherId)
      .then(setSessions)
      .catch(err => console.error('[Sessions] load failed:', err));
  }, [teacherId]);

  // ── next lesson from sessions ─────────────────────────────────────────────
  const nextSession = useMemo(() => {
    if (!sessions.length) return null;
    const now = new Date();
    const upcoming = sessions
      .filter(s => new Date(s.startAt) > now)
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    const session = upcoming[0] ?? null;
    if (!session) return null;
    const student = students.find(s => s.id === session.studentId) ?? null;
    if (!student) return null;
    return { session, student };
  }, [sessions, students]);

  const highlightedStudentId = nextSession?.student.id ?? null;

  // ── GCal panel ───────────────────────────────────────────────────────────
  const loadGCalEvents = useCallback(async () => {
    setGcalLoading(true);
    setGcalError(null);
    try {
      let token = getStoredToken();
      if (!token) token = await refreshAccessToken();
      if (!token) {
        setGcalError('Google Calendar is not connected. Connect it from the Calendar page first.');
        return;
      }
      const now  = new Date();
      const max  = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      const evts = await fetchGCalEvents(token, now, max);
      setGcalEvents(evts);
    } catch (err) {
      setGcalError(String(err));
    } finally {
      setGcalLoading(false);
    }
  }, []);

  const handleToggleCalPanel = useCallback(() => {
    if (!showCalPanel && gcalEvents.length === 0) loadGCalEvents();
    setShowCalPanel(v => !v);
  }, [showCalPanel, gcalEvents.length, loadGCalEvents]);

  const sessionByGcalId = useMemo(() => {
    const map: Record<string, LessonSession> = {};
    for (const s of sessions) { if (s.gcalEventId) map[s.gcalEventId] = s; }
    return map;
  }, [sessions]);

  async function handleLinkEvent(gcalEvent: GCalEvent) {
    const studentId = linkSelections[gcalEvent.id];
    if (!studentId) return;
    setLinkingId(gcalEvent.id);
    try {
      const startAt = gcalEvent.start.dateTime ?? gcalEvent.start.date ?? '';
      const endAt   = gcalEvent.end.dateTime   ?? gcalEvent.end.date   ?? undefined;
      const session = await linkGCalSession(
        teacherId, studentId, gcalEvent.id,
        gcalEvent.summary ?? 'Lesson', startAt, endAt,
      );
      setSessions(prev => {
        const without = prev.filter(s => s.gcalEventId !== gcalEvent.id);
        return [...without, session].sort(
          (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
        );
      });
    } catch (err) {
      console.error('[CalLink] link failed:', err);
    } finally {
      setLinkingId(null);
    }
  }

  async function handleUnlinkEvent(session: LessonSession) {
    try {
      await unlinkSession(session.id);
      setSessions(prev => prev.filter(s => s.id !== session.id));
    } catch (err) {
      console.error('[CalLink] unlink failed:', err);
    }
  }

  // ── Meet link ─────────────────────────────────────────────────────────────
  async function handleGenerateMeetLink() {
    if (!nextSession) return;
    setMeetGenerating(true);
    try {
      const url = await createGoogleMeetLink(
        nextSession.student.name,
        nextSession.session.startAt,
      );
      if (!url) {
        alert('Could not generate Meet link. Make sure Google Calendar is connected.');
        return;
      }
      await updateSessionMeetUrl(nextSession.session.id, url);
      setSessions(prev =>
        prev.map(s => s.id === nextSession.session.id ? { ...s, meetUrl: url } : s),
      );
    } finally {
      setMeetGenerating(false);
    }
  }

  async function handleCopyMeetLink() {
    if (!nextSession?.session.meetUrl) return;
    await navigator.clipboard.writeText(nextSession.session.meetUrl);
    setMeetCopied(true);
    setTimeout(() => setMeetCopied(false), 2500);
  }

  async function handleClearMeetLink() {
    if (!nextSession) return;
    await updateSessionMeetUrl(nextSession.session.id, null);
    setSessions(prev =>
      prev.map(s => s.id === nextSession.session.id ? { ...s, meetUrl: undefined } : s),
    );
  }

  // ── copy share link ───────────────────────────────────────────────────────
  async function handleCopyLink(student: ArabicStudent, e: React.MouseEvent) {
    e.stopPropagation();
    setCopyingId(student.id);
    try {
      const token = await ensureShareToken(student);
      if (!student.shareToken) onUpdateStudent({ ...student, shareToken: token });
      await navigator.clipboard.writeText(`${SITE_URL}/arabic/s/${token}`);
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

      {/* ── Next Lesson Banner ──────────────────────────────────────────────── */}
      {nextSession && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-2xl flex-shrink-0">📅</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Next Lesson</p>
              <p className="font-bold text-slate-800 dark:text-slate-100 text-base leading-tight truncate">{nextSession.student.name}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{formatSessionDate(nextSession.session.startAt)}</p>
              {nextSession.session.title && (
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{nextSession.session.title}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {nextSession.session.meetUrl ? (
              <>
                <button
                  onClick={handleCopyMeetLink}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {meetCopied ? '✓ Copied!' : (
                    <><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg> Copy Link</>
                  )}
                </button>
                <a
                  href={nextSession.session.meetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  Join Lesson
                </a>
                <button onClick={handleClearMeetLink} title="Remove link" className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </>
            ) : (
              <button
                onClick={handleGenerateMeetLink}
                disabled={meetGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                {meetGenerating ? 'Generating…' : 'Generate Meet Link'}
              </button>
            )}
          </div>
        </div>
      )}

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
          {/* Link Calendar Events button */}
          <button
            onClick={handleToggleCalPanel}
            className={`flex items-center gap-2 px-4 py-2.5 font-semibold rounded-lg border shadow-sm transition-colors text-sm ${
              showCalPanel
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                : 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 hover:text-blue-700 dark:hover:text-blue-300'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            Link Calendar Events
          </button>
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

      {/* ── Calendar Link Panel ─────────────────────────────────────────────── */}
      {showCalPanel && (
        <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded-2xl overflow-hidden shadow-sm">
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-3 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-blue-600 dark:text-blue-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                Upcoming Google Calendar Events — next 14 days
              </span>
            </div>
            <button
              onClick={loadGCalEvents}
              disabled={gcalLoading}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-3.5 h-3.5 ${gcalLoading ? 'animate-spin' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {gcalLoading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {/* Error */}
          {gcalError && (
            <div className="px-5 py-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
              ⚠️ {gcalError}
            </div>
          )}

          {/* Loading skeleton */}
          {gcalLoading && !gcalError && (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-14 bg-slate-100 dark:bg-gray-700 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty */}
          {!gcalLoading && !gcalError && gcalEvents.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No upcoming events found in the next 14 days.
            </div>
          )}

          {/* Event rows */}
          {!gcalLoading && !gcalError && gcalEvents.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {gcalEvents.map(evt => {
                const linked   = sessionByGcalId[evt.id];
                const startIso = evt.start.dateTime ?? evt.start.date ?? '';
                const label    = startIso ? formatSessionDate(startIso) : '';
                const isLinking = linkingId === evt.id;
                const linkedStudent = linked ? students.find(s => s.id === linked.studentId) : null;

                return (
                  <div key={evt.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3">
                    {/* Event info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{evt.summary}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    </div>

                    {/* Link controls */}
                    {linked && linkedStudent ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-lg text-xs font-semibold">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                          {linkedStudent.name}
                        </span>
                        <button
                          onClick={() => handleUnlinkEvent(linked)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-slate-200 dark:border-gray-600 transition-colors"
                        >
                          Unlink
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={linkSelections[evt.id] ?? ''}
                          onChange={e => setLinkSelections(prev => ({ ...prev, [evt.id]: e.target.value }))}
                          className="text-xs border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select student…</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleLinkEvent(evt)}
                          disabled={!linkSelections[evt.id] || isLinking}
                          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors"
                        >
                          {isLinking ? '…' : 'Link'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
  onClick: () => void;
  onCopyLink: (e: React.MouseEvent) => void;
  copying: boolean;
  copied: boolean;
}

const StudentCard: React.FC<CardProps> = ({ student: s, vocabCount, isNext, onClick, onCopyLink, copying, copied }) => {
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
