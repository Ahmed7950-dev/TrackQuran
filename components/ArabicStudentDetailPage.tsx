// components/ArabicStudentDetailPage.tsx
// ---------------------------------------------------------------------------
// Shows a single Arabic student's profile info + lesson progress list.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { ArabicStudent, ArabicLesson, WeeklySlot } from '../types';
import { getArabicLessons } from '../services/arabicService';
import ArabicAddStudentModal from './ArabicAddStudentModal';
import ArabicLessonPage from './ArabicLessonPage';

interface Props {
  student: ArabicStudent;
  teacherId: string;
  onBack: () => void;
  onUpdateStudent: (s: ArabicStudent) => void;
  onDeleteStudent: (id: string) => void;
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
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-600">
      <table className="w-full text-xs border-collapse min-w-[420px]">
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

// ── Component ─────────────────────────────────────────────────────────────────

const ArabicStudentDetailPage: React.FC<Props> = ({
  student, teacherId, onBack, onUpdateStudent, onDeleteStudent,
}) => {
  const [editOpen, setEditOpen]       = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [lessons, setLessons]         = useState<ArabicLesson[]>([]);
  const [activeSection, setActiveSection] = useState<'profile' | 'lessons'>('lessons');

  useEffect(() => {
    getArabicLessons().then(setLessons);
  }, []);

  const completedCount = student.completedLessonIds.length;
  const pct            = progressPercent(student);
  const lessonsPerWeek = lpw(student);
  const wl             = weeksLeft(student.goalDeadline);

  return (
    <div className="space-y-6">
      {/* ── Back + actions bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="font-semibold">All Students</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            Edit
          </button>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">Are you sure?</span>
              <button onClick={() => { onDeleteStudent(student.id); }}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">Yes, delete</button>
              <button onClick={() => setShowDelete(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-2xl border border-amber-200 dark:border-amber-800 p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 dark:bg-amber-600 flex items-center justify-center text-white text-3xl font-extrabold flex-shrink-0">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{student.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {student.arabicDialects.map(d => (
                <span key={d} className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">{dialectLabel(d)}</span>
              ))}
              {student.arabicLevel && (
                <span className="px-2.5 py-0.5 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 rounded-full text-xs font-semibold border border-slate-200 dark:border-gray-700">
                  Level {student.arabicLevel} / 10
                </span>
              )}
            </div>
          </div>

          {/* Lesson plan widget */}
          {lessonsPerWeek !== null && (
            <div className="flex-shrink-0 text-right">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Lessons / week</p>
              <p className="text-4xl font-extrabold text-amber-600 dark:text-amber-300">{lessonsPerWeek}</p>
              {wl !== null && <p className="text-xs text-amber-500/80 mt-0.5">{wl} weeks left</p>}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
            <span>Lesson progress</span>
            <span className="font-bold">{completedCount} / 60 lessons complete ({pct}%)</span>
          </div>
          <div className="h-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-gray-700">
        {(['lessons', 'profile'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveSection(tab)}
            className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors -mb-px ${
              activeSection === tab
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {tab === 'lessons' ? `Lessons (${lessons.length})` : 'Student Profile'}
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
        />
      )}

      {/* ── Profile section ── */}
      {activeSection === 'profile' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6 space-y-5">
          <dl className="space-y-4">
            <InfoRow label="Date of birth"  value={student.dob ? new Date(student.dob).toLocaleDateString() : undefined} />
            <InfoRow label="Lessons for"    value={student.forSelf ? 'Themselves' : `Someone else (${student.forWhom || 'not specified'})`} />
            <InfoRow label="WhatsApp"        value={student.whatsapp} />
            <InfoRow label="Nationality"     value={student.nationality} />
            <InfoRow label="Timezone"        value={student.timezone} />
            <InfoRow label="Goal deadline"   value={student.goalDeadline ? new Date(student.goalDeadline).toLocaleDateString() : undefined} />
            <InfoRow label="Learning goals"
              value={student.learningPurposes.length ? student.learningPurposes.join(', ') : undefined} />
            <InfoRow label="Topics to focus"
              value={student.topicsToFocus.length ? student.topicsToFocus.join(', ') : undefined} />
          </dl>

          {student.availability.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Weekly availability</h3>
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
        onClose={() => setEditOpen(false)}
        onSave={updated => { onUpdateStudent(updated); setEditOpen(false); }}
      />
    </div>
  );
};

export default ArabicStudentDetailPage;
