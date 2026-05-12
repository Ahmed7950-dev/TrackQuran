// components/ArabicAddStudentModal.tsx
// ---------------------------------------------------------------------------
// Full registration form for an Arabic student.
// Includes availability drag-calendar and lesson-plan equation.
// ---------------------------------------------------------------------------

import React, { useRef, useState } from 'react';
import { ArabicStudent, ArabicDialect, WeeklySlot } from '../types';

interface Props {
  isOpen: boolean;
  teacherId: string;
  onClose: () => void;
  onSave: (student: ArabicStudent) => void;
  existing?: ArabicStudent; // edit mode
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// 12:00 PM → 11:00 PM  (hours 12..22, each slot = 1 h)
const HOURS = Array.from({ length: 11 }, (_, i) => i + 12);

const TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul',
  'Asia/Riyadh', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Nairobi',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo',
];

const LEVELS = ['Complete Beginner', 'Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'Near Native'];
const PURPOSES = ['Conversation', 'Reading & Writing', 'Academic', 'Business', 'Travel', 'Religious texts', 'Heritage language', 'Other'];
const TOPICS = ['Grammar', 'Vocabulary', 'Pronunciation', 'Listening', 'Speaking', 'Reading', 'Writing', 'Quranic Arabic', 'Classical texts', 'Dialects', 'Culture'];
const NATIONALITIES = ['Saudi', 'Emirati', 'Jordanian', 'Lebanese', 'Syrian', 'Egyptian', 'Moroccan', 'Tunisian', 'Algerian', 'Libyan', 'Yemeni', 'Iraqi', 'Palestinian', 'Kuwaiti', 'Bahraini', 'Qatari', 'Omani', 'Sudanese', 'British', 'American', 'Canadian', 'Australian', 'French', 'German', 'Turkish', 'Pakistani', 'Indian', 'Indonesian', 'Malaysian', 'Other'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function slotsToGrid(slots: WeeklySlot[]): Set<string> {
  const s = new Set<string>();
  slots.forEach(sl => s.add(`${sl.day}:${sl.startHour}`));
  return s;
}

function gridToSlots(grid: Set<string>): WeeklySlot[] {
  return [...grid].map(key => {
    const [d, h] = key.split(':').map(Number);
    return { day: d, startHour: h, endHour: h + 1 };
  }).sort((a, b) => a.day - b.day || a.startHour - b.startHour);
}

function formatHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const disp = h > 12 ? h - 12 : h;
  return `${disp}:00 ${ampm}`;
}

function weeksUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, ms / (7 * 24 * 3600 * 1000));
}

function lessonsPerWeekNeeded(completed: number, deadlineStr?: string): number | null {
  if (!deadlineStr) return null;
  const weeks = weeksUntil(deadlineStr);
  if (weeks <= 0) return null;
  return Math.ceil((60 - completed) / weeks);
}

// ── Component ────────────────────────────────────────────────────────────────

const ArabicAddStudentModal: React.FC<Props> = ({ isOpen, teacherId, onClose, onSave, existing }) => {
  const isEdit = !!existing;

  // Form fields
  const [name,       setName]       = useState(existing?.name        ?? '');
  const [dob,        setDob]        = useState(existing?.dob         ?? '');
  const [forSelf,    setForSelf]    = useState(existing?.forSelf     ?? true);
  const [forWhom,    setForWhom]    = useState(existing?.forWhom     ?? '');
  const [dialects,   setDialects]   = useState<ArabicDialect[]>(existing?.arabicDialects ?? []);
  const [whatsapp,   setWhatsapp]   = useState(existing?.whatsapp    ?? '');
  const [level,      setLevel]      = useState(existing?.arabicLevel ?? '');
  const [purposes,   setPurposes]   = useState<string[]>(existing?.learningPurposes ?? []);
  const [topics,     setTopics]     = useState<string[]>(existing?.topicsToFocus    ?? []);
  const [nationality,setNationality]= useState(existing?.nationality ?? '');
  const [timezone,   setTimezone]   = useState(existing?.timezone    ?? 'UTC');
  const [deadline,   setDeadline]   = useState(existing?.goalDeadline ?? '');
  const [grid,       setGrid]       = useState<Set<string>>(
    () => slotsToGrid(existing?.availability ?? [])
  );

  // Drag state
  const isDragging   = useRef(false);
  const dragAdding   = useRef(true); // true = selecting, false = deselecting
  const dragStart    = useRef<string | null>(null);

  // Submit state
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // ── Dialect toggle ──────────────────────────────────────────────────────
  const toggleDialect = (d: ArabicDialect) =>
    setDialects(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // ── Multi-select toggle ─────────────────────────────────────────────────
  const toggleArr = <T extends string>(arr: T[], setArr: (a: T[]) => void, val: T) =>
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);

  // ── Calendar drag ───────────────────────────────────────────────────────
  const cellKey = (day: number, hour: number) => `${day}:${hour}`;

  const handleCellEnter = (key: string) => {
    if (!isDragging.current) return;
    setGrid(prev => {
      const next = new Set(prev);
      if (dragAdding.current) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleCellDown = (key: string) => {
    isDragging.current = true;
    dragStart.current  = key;
    dragAdding.current = !grid.has(key); // toggle: if already selected, we deselect
    setGrid(prev => {
      const next = new Set(prev);
      if (dragAdding.current) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleMouseUp = () => { isDragging.current = false; };

  // ── Lesson plan equation ─────────────────────────────────────────────────
  const completedCount = existing?.completedLessonIds.length ?? 0;
  const lpw = lessonsPerWeekNeeded(completedCount, deadline || undefined);

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Student name is required.'); return; }
    if (dialects.length === 0) { setError('Please select at least one Arabic variant.'); return; }

    const student: ArabicStudent = {
      id:               existing?.id       ?? `ar-${Date.now()}`,
      teacherId,
      name:             name.trim(),
      dob:              dob  || undefined,
      forSelf,
      forWhom:          forSelf ? undefined : forWhom.trim() || undefined,
      arabicDialects:   dialects,
      whatsapp:         whatsapp.trim() || undefined,
      arabicLevel:      level,
      learningPurposes: purposes,
      topicsToFocus:    topics,
      nationality:      nationality || undefined,
      timezone,
      availability:     gridToSlots(grid),
      goalDeadline:     deadline || undefined,
      completedLessonIds: existing?.completedLessonIds ?? [],
      createdAt:        existing?.createdAt ?? new Date().toISOString(),
    };

    onSave(student);
  };

  // ── Shared input styles ──────────────────────────────────────────────────
  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none';
  const lbl = 'block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1';
  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer select-none ${
      active
        ? 'bg-amber-500 border-amber-500 text-white'
        : 'bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-amber-400'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-4 overflow-y-auto">
      <div
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl my-6"
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-100 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
              {isEdit ? 'Edit Student' : 'Add Arabic Student'}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Fill in the profile details below.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-7">

          {/* ── A. Name & DOB ── */}
          <Section title="A. Student information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Full name *</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="e.g. Omar Hassan" />
              </div>
              <div>
                <label className={lbl}>Date of birth</label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inp} />
              </div>
            </div>
          </Section>

          {/* ── B. Lessons for ── */}
          <Section title="B. Lessons for">
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button type="button" onClick={() => setForSelf(true)}  className={pill(forSelf)}>Themselves</button>
                <button type="button" onClick={() => setForSelf(false)} className={pill(!forSelf)}>Someone else</button>
              </div>
              {!forSelf && (
                <input
                  value={forWhom} onChange={e => setForWhom(e.target.value)}
                  className={inp} placeholder="Relationship, e.g. son, daughter, wife…"
                />
              )}
            </div>
          </Section>

          {/* ── C. Dialect / variant ── */}
          <Section title="C. Wants to learn *">
            <div className="flex flex-wrap gap-2">
              {(['msa', 'levantine', 'quranic'] as ArabicDialect[]).map(d => (
                <button key={d} type="button" onClick={() => toggleDialect(d)} className={pill(dialects.includes(d))}>
                  {{ msa: 'Modern Standard Arabic', levantine: 'Levantine Arabic', quranic: 'Quranic Arabic' }[d]}
                </button>
              ))}
            </div>
          </Section>

          {/* ── D. WhatsApp ── */}
          <Section title="D. WhatsApp contact">
            <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className={inp} placeholder="+1 234 567 8901 (include country code)" />
          </Section>

          {/* ── E. Arabic level ── */}
          <Section title="E. Arabic level">
            <div className="flex flex-wrap gap-2">
              {LEVELS.map(l => (
                <button key={l} type="button" onClick={() => setLevel(l)} className={pill(level === l)}>{l}</button>
              ))}
            </div>
          </Section>

          {/* ── F. Learning purposes ── */}
          <Section title="F. Learning purposes">
            <div className="flex flex-wrap gap-2">
              {PURPOSES.map(p => (
                <button key={p} type="button" onClick={() => toggleArr(purposes, setPurposes, p)} className={pill(purposes.includes(p))}>{p}</button>
              ))}
            </div>
          </Section>

          {/* ── G. Topics to focus on ── */}
          <Section title="G. Topics to focus on">
            <div className="flex flex-wrap gap-2">
              {TOPICS.map(t => (
                <button key={t} type="button" onClick={() => toggleArr(topics, setTopics, t)} className={pill(topics.includes(t))}>{t}</button>
              ))}
            </div>
          </Section>

          {/* ── H & I. Nationality + Timezone ── */}
          <Section title="H & I. Nationality &amp; Timezone">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Nationality</label>
                <select value={nationality} onChange={e => setNationality(e.target.value)} className={inp}>
                  <option value="">Select…</option>
                  {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inp}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          </Section>

          {/* ── J. Availability calendar ── */}
          <Section title="J. Weekly availability">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Times shown in <strong>{timezone}</strong>. Click or drag over cells to mark availability (shown in green).
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-600 select-none">
              <table className="w-full text-xs border-collapse min-w-[460px]">
                <thead>
                  <tr>
                    <th className="w-16 bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 px-2 text-slate-500 dark:text-slate-400 font-semibold text-left">Time</th>
                    {DAY_SHORT.map((d, i) => (
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
                      {DAYS.map((_, d) => {
                        const key = cellKey(d, h);
                        const active = grid.has(key);
                        return (
                          <td
                            key={d}
                            onMouseDown={() => handleCellDown(key)}
                            onMouseEnter={() => handleCellEnter(key)}
                            className={`border-b border-r border-slate-200 dark:border-gray-600 cursor-pointer transition-colors h-8 ${
                              active
                                ? 'bg-emerald-400 dark:bg-emerald-600'
                                : 'bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                            }`}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setGrid(new Set())}
              className="mt-2 text-xs text-slate-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          </Section>

          {/* ── K. Goal deadline + lesson plan equation ── */}
          <Section title="K. Goal deadline">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className={lbl}>Target completion date</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inp} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  The date by which the student wants to reach their goal (60 lessons total).
                </p>
              </div>
              {/* Equation result */}
              {deadline && lpw !== null && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">Lesson plan</p>
                  <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-300">
                    {lpw} <span className="text-base font-bold">lessons / week</span>
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                    {60 - completedCount} remaining · {Math.max(0, Math.round(weeksUntil(deadline)))} weeks left
                  </p>
                </div>
              )}
              {deadline && (lpw === null || lpw < 0) && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
                  The deadline has already passed or is too close.
                </div>
              )}
            </div>
          </Section>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-gray-700">
            <button
              type="button" onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 rounded-lg font-semibold hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-7 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm transition-colors"
            >
              {isEdit ? 'Save Changes' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3
      className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-3"
      dangerouslySetInnerHTML={{ __html: title }}
    />
    {children}
  </div>
);

export default ArabicAddStudentModal;
