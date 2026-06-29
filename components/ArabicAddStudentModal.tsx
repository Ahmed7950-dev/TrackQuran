// components/ArabicAddStudentModal.tsx
// ---------------------------------------------------------------------------
// Full registration form for an Arabic student.
// Includes availability drag-calendar and lesson-plan equation.
// ---------------------------------------------------------------------------

import React, { useRef, useState } from 'react';
import { ArabicStudent, ArabicDialect, WeeklySlot } from '../types';
import { useI18n } from '../context/I18nProvider';
import StudentBillingFields, { StudentBilling } from './StudentBillingFields';
import ProfileIconPicker from './ProfileIconPicker';

interface Props {
  isOpen: boolean;
  teacherId: string;
  onClose: () => void;
  onSave: (student: ArabicStudent) => void;
  existing?: ArabicStudent; // edit mode
  hideBilling?: boolean; // hide tutor-only billing fields (student self-edit)
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

const NATIONALITIES = ['Saudi', 'Emirati', 'Jordanian', 'Lebanese', 'Syrian', 'Egyptian', 'Moroccan', 'Tunisian', 'Algerian', 'Libyan', 'Yemeni', 'Iraqi', 'Palestinian', 'Kuwaiti', 'Bahraini', 'Qatari', 'Omani', 'Sudanese', 'British', 'American', 'Canadian', 'Australian', 'French', 'German', 'Turkish', 'Pakistani', 'Indian', 'Indonesian', 'Malaysian', 'Other'];

// Level label based on 1–10 numeric score
function levelLabel(n: number): string {
  if (n <= 1)  return 'Absolute Beginner';
  if (n <= 2)  return 'Beginner';
  if (n <= 3)  return 'Elementary';
  if (n <= 4)  return 'Pre-Intermediate';
  if (n <= 5)  return 'Intermediate';
  if (n <= 6)  return 'Upper-Intermediate';
  if (n <= 7)  return 'Advanced';
  if (n <= 8)  return 'Proficient';
  if (n <= 9)  return 'Near Native';
  return 'Native / Fluent';
}

function levelColor(n: number): string {
  if (n <= 3)  return 'text-blue-500 dark:text-blue-400';
  if (n <= 6)  return 'text-amber-500 dark:text-amber-400';
  return 'text-emerald-500 dark:text-emerald-400';
}

// ── Timezone helpers ─────────────────────────────────────────────────────────

/** Teacher's local timezone — shown as the comparison reference in the availability grid */
const TEACHER_TZ = 'Europe/Istanbul';

/**
 * Returns the UTC offset of `tz` in whole minutes, e.g. Asia/Dubai → +240.
 * Uses Intl.DateTimeFormat.formatToParts for accuracy (avoids Date.parse locale issues).
 */
function getTzOffsetMinutes(tz: string): number {
  try {
    const date  = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
    let hour = get('hour');
    if (hour === 24) hour = 0; // some implementations return 24 for midnight
    const tzAsUtcMs = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
    return Math.round((tzAsUtcMs - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Format a local hour as "12:00 PM" */
function formatHour(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const ampm = norm >= 12 ? 'PM' : 'AM';
  const disp = norm > 12 ? norm - 12 : norm === 0 ? 12 : norm;
  return `${disp}:00 ${ampm}`;
}

/** Given a student's local hour and both timezone offsets, return the teacher's equivalent label */
function formatTeacherEquiv(localHour: number, studentOffsetMins: number, teacherOffsetMins: number): string {
  const utcMins     = localHour * 60 - studentOffsetMins;
  const teacherMins = utcMins + teacherOffsetMins;
  const teacherHour = ((Math.floor(teacherMins / 60)) % 24 + 24) % 24;
  return formatHour(teacherHour) + ' (Istanbul)';
}

/** Format the UTC offset as a readable string, e.g. "+4" or "+5:30" */
function formatOffsetLabel(offsetMins: number): string {
  const sign = offsetMins >= 0 ? '+' : '−';
  const h    = Math.floor(Math.abs(offsetMins) / 60);
  const m    = Math.abs(offsetMins) % 60;
  return m > 0 ? `UTC${sign}${h}:${m.toString().padStart(2, '0')}` : `UTC${sign}${h}`;
}

// ── Calendar grid helpers ────────────────────────────────────────────────────

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

// ── Tag input component ──────────────────────────────────────────────────────

const TagInput: React.FC<{
  tags: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder?: string;
}> = ({ tags, onAdd, onRemove, placeholder = 'Type and press Enter…' }) => {
  const { t } = useI18n();
  const [val, setVal] = useState('');

  const commit = () => {
    const trimmed = val.trim();
    if (trimmed && !tags.includes(trimmed)) onAdd(trimmed);
    setVal('');
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={commit}
          disabled={!val.trim()}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {t('arabicStudentModal.add')}
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 rounded-full text-sm font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="text-amber-400 hover:text-red-500 transition-colors leading-none"
                aria-label={`Remove ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Component ────────────────────────────────────────────────────────────────

const ArabicAddStudentModal: React.FC<Props> = ({ isOpen, teacherId, onClose, onSave, existing, hideBilling = false }) => {
  const { t } = useI18n();
  const isEdit = !!existing;

  // Form fields
  const [name,        setName]        = useState(existing?.name        ?? '');
  const [profileIcon, setProfileIcon] = useState<string | undefined>(existing?.profileIcon);
  const [dob,         setDob]         = useState(existing?.dob         ?? '');
  const [forSelf,     setForSelf]     = useState(existing?.forSelf     ?? true);
  const [forWhom,     setForWhom]     = useState(existing?.forWhom     ?? '');
  const [dialects,    setDialects]    = useState<ArabicDialect[]>(existing?.arabicDialects ?? []);
  const [whatsapp,    setWhatsapp]    = useState(existing?.whatsapp    ?? '');

  // Level as 1–10 slider (store as string in DB, parse on load)
  const [levelNum, setLevelNum] = useState<number>(() => {
    const v = existing?.arabicLevel;
    if (!v) return 5;
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 1 && n <= 10 ? n : 5;
  });

  const [purposes,    setPurposes]    = useState<string[]>(existing?.learningPurposes ?? []);
  const [topics,      setTopics]      = useState<string[]>(existing?.topicsToFocus    ?? []);
  const [nationality, setNationality] = useState(existing?.nationality ?? '');
  const [timezone,    setTimezone]    = useState(existing?.timezone    ?? 'Europe/Istanbul');
  const [deadline,    setDeadline]    = useState(existing?.goalDeadline ?? '');
  const [billing,     setBilling]     = useState<StudentBilling>({
    hourlyRate: existing?.hourlyRate,
    studentType: existing?.studentType ?? 'preply',
    preplyPercentage: existing?.preplyPercentage ?? 18,
  });
  const [grid,        setGrid]        = useState<Set<string>>(
    () => slotsToGrid(existing?.availability ?? [])
  );

  // Drag state (refs so state update doesn't cause lag during drag)
  const isDragging = useRef(false);
  const dragAdding = useRef(true);

  // Submit state
  const [error, setError] = useState('');

  if (!isOpen) return null;

  // ── Timezone offset ─────────────────────────────────────────────────────
  const tzOffsetMins      = getTzOffsetMinutes(timezone);
  const teacherOffsetMins = getTzOffsetMinutes(TEACHER_TZ);
  const tzOffsetLabel     = formatOffsetLabel(tzOffsetMins);
  // Show teacher-time column whenever student TZ differs from Istanbul
  const showTeacherEquiv  = timezone !== TEACHER_TZ;

  // ── Dialect toggle ──────────────────────────────────────────────────────
  const toggleDialect = (d: ArabicDialect) =>
    setDialects(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // ── Calendar drag ───────────────────────────────────────────────────────
  const cellKey = (day: number, hour: number) => `${day}:${hour}`;

  const handleCellDown = (key: string) => {
    isDragging.current = true;
    dragAdding.current = !grid.has(key);
    setGrid(prev => {
      const next = new Set(prev);
      if (dragAdding.current) next.add(key); else next.delete(key);
      return next;
    });
  };

  const handleCellEnter = (key: string) => {
    if (!isDragging.current) return;
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
    if (!name.trim()) { setError(t('arabicStudentModal.errNameRequired')); return; }
    if (dialects.length === 0) { setError(t('arabicStudentModal.errDialectRequired')); return; }

    const student: ArabicStudent = {
      id:                 existing?.id ?? `ar-${Date.now()}`,
      teacherId,
      name:               name.trim(),
      profileIcon,
      dob:                dob  || undefined,
      forSelf,
      forWhom:            forSelf ? undefined : forWhom.trim() || undefined,
      arabicDialects:     dialects,
      whatsapp:           whatsapp.trim() || undefined,
      arabicLevel:        String(levelNum),
      learningPurposes:   purposes,
      topicsToFocus:      topics,
      nationality:        nationality || undefined,
      timezone,
      availability:       gridToSlots(grid),
      goalDeadline:       deadline || undefined,
      completedLessonIds: existing?.completedLessonIds ?? [],
      hourlyRate:         billing.hourlyRate,
      studentType:        billing.studentType,
      preplyPercentage:   billing.preplyPercentage,
      createdAt:          existing?.createdAt ?? new Date().toISOString(),
    };

    onSave(student);
  };

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inp  = 'w-full px-3 py-2 bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none';
  const lbl  = 'block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1';
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
              {isEdit ? t('arabicStudentModal.editStudent') : t('arabicStudentModal.addStudent')}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t('arabicStudentModal.subtitle')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-7 py-6 space-y-7">

          {/* ── A. Name & DOB ── */}
          <Section title={t('arabicStudentModal.sectionA')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>{t('arabicStudentModal.fullName')}</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder={t('arabicStudentModal.fullNamePlaceholder')} />
              </div>
              <div>
                <label className={lbl}>{t('arabicStudentModal.dob')}</label>
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} className={inp} />
              </div>
            </div>
            <div className="mt-4">
              <ProfileIconPicker value={profileIcon} onChange={setProfileIcon} />
            </div>
          </Section>

          {/* ── B. Lessons for ── */}
          <Section title={t('arabicStudentModal.sectionB')}>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <button type="button" onClick={() => setForSelf(true)}  className={pill(forSelf)}>{t('arabicStudentModal.themselves')}</button>
                <button type="button" onClick={() => setForSelf(false)} className={pill(!forSelf)}>{t('arabicStudentModal.someoneElse')}</button>
              </div>
              {!forSelf && (
                <input
                  value={forWhom} onChange={e => setForWhom(e.target.value)}
                  className={inp} placeholder={t('arabicStudentModal.forWhomPlaceholder')}
                />
              )}
            </div>
          </Section>

          {/* ── C. Dialect / variant ── */}
          <Section title={t('arabicStudentModal.sectionC')}>
            <div className="flex flex-wrap gap-2">
              {(['msa', 'levantine', 'quranic'] as ArabicDialect[]).map(d => (
                <button key={d} type="button" onClick={() => toggleDialect(d)} className={pill(dialects.includes(d))}>
                  {{ msa: 'Modern Standard Arabic', levantine: 'Levantine Arabic', quranic: 'Quranic Arabic' }[d]}
                </button>
              ))}
            </div>
          </Section>

          {/* ── D. WhatsApp ── */}
          <Section title={t('arabicStudentModal.sectionD')}>
            <input value={whatsapp} onChange={e => setWhatsapp(e.target.value)} className={inp} placeholder={t('arabicStudentModal.whatsappPlaceholder')} />
          </Section>

          {/* ── E. Arabic level — slider 1–10 ── */}
          <Section title={t('arabicStudentModal.sectionE')}>
            <div className="space-y-3 px-1">
              {/* Value + label display */}
              <div className="flex items-end justify-between">
                <div>
                  <span className={`text-5xl font-extrabold tabular-nums ${levelColor(levelNum)}`}>{levelNum}</span>
                  <span className="text-slate-400 dark:text-slate-500 text-lg font-semibold"> / 10</span>
                </div>
                <span className={`text-sm font-semibold ${levelColor(levelNum)}`}>{
                  levelNum <= 1 ? t('arabicStudentModal.levelAbsBeginner') :
                  levelNum <= 2 ? t('arabicStudentModal.levelBeginner') :
                  levelNum <= 3 ? t('arabicStudentModal.levelElementary') :
                  levelNum <= 4 ? t('arabicStudentModal.levelPreIntermediate') :
                  levelNum <= 5 ? t('arabicStudentModal.levelIntermediate') :
                  levelNum <= 6 ? t('arabicStudentModal.levelUpperIntermediate') :
                  levelNum <= 7 ? t('arabicStudentModal.levelAdvanced') :
                  levelNum <= 8 ? t('arabicStudentModal.levelProficient') :
                  levelNum <= 9 ? t('arabicStudentModal.levelNearNative') :
                  t('arabicStudentModal.levelNative')
                }</span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={1} max={10} step={1}
                value={levelNum}
                onChange={e => setLevelNum(parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-amber-500"
                style={{
                  background: `linear-gradient(to right, #f59e0b ${(levelNum - 1) / 9 * 100}%, #e2e8f0 ${(levelNum - 1) / 9 * 100}%)`,
                }}
              />

              {/* Tick labels */}
              <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 px-px select-none">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <span
                    key={n}
                    className={`font-mono transition-colors ${n === levelNum ? levelColor(levelNum) + ' font-bold' : ''}`}
                  >
                    {n}
                  </span>
                ))}
              </div>

              {/* Band labels */}
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                <span>{t('arabicStudentModal.bandBeginner')}</span>
                <span>{t('arabicStudentModal.bandIntermediate')}</span>
                <span>{t('arabicStudentModal.bandNative')}</span>
              </div>
            </div>
          </Section>

          {/* ── F. Learning purposes — free-text tag input ── */}
          <Section title={t('arabicStudentModal.sectionF')}>
            <TagInput
              tags={purposes}
              onAdd={v => setPurposes(prev => [...prev, v])}
              onRemove={v => setPurposes(prev => prev.filter(x => x !== v))}
              placeholder={t('arabicStudentModal.purposesPlaceholder')}
            />
          </Section>

          {/* ── G. Topics to focus on — free-text tag input ── */}
          <Section title={t('arabicStudentModal.sectionG')}>
            <TagInput
              tags={topics}
              onAdd={v => setTopics(prev => [...prev, v])}
              onRemove={v => setTopics(prev => prev.filter(x => x !== v))}
              placeholder={t('arabicStudentModal.topicsPlaceholder')}
            />
          </Section>

          {/* ── H & I. Nationality + Timezone ── */}
          <Section title={t('arabicStudentModal.sectionHI')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lbl}>{t('arabicStudentModal.nationality')}</label>
                <select value={nationality} onChange={e => setNationality(e.target.value)} className={inp}>
                  <option value="">{t('arabicStudentModal.selectPlaceholder')}</option>
                  {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={lbl}>{t('arabicStudentModal.timezone')}</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inp}>
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
            {/* Billing (timezone handled by the field above) */}
            <div className="mt-4">
              {!hideBilling && <StudentBillingFields value={billing} onChange={setBilling} showTimezone={false} />}
            </div>
          </Section>

          {/* ── J. Availability calendar ── */}
          <Section title={t('arabicStudentModal.sectionJ')}>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              {t('arabicStudentModal.availabilityHint', { timezone, offset: tzOffsetLabel })}
              {showTeacherEquiv && <span className="text-slate-400 dark:text-slate-500"> {t('arabicStudentModal.availabilityTeacherTime')}</span>}
            </p>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-600 select-none">
              <table className="w-full text-xs border-collapse min-w-[480px]">
                <thead>
                  <tr>
                    <th className={`${showTeacherEquiv ? 'w-20' : 'w-16'} bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 px-2 text-slate-500 dark:text-slate-400 font-semibold text-left`}>
                      Local
                    </th>
                    {DAY_SHORT.map((d, i) => (
                      <th key={i} className="bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map(h => (
                    <tr key={h}>
                      <td className="bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 px-2 py-1 whitespace-nowrap">
                        <div className="font-mono text-slate-600 dark:text-slate-300">{formatHour(h)}</div>
                        {showTeacherEquiv && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-tight">
                            {formatTeacherEquiv(h, tzOffsetMins, teacherOffsetMins)}
                          </div>
                        )}
                      </td>
                      {DAYS.map((_, d) => {
                        const key = cellKey(d, h);
                        const active = grid.has(key);
                        return (
                          <td
                            key={d}
                            onMouseDown={() => handleCellDown(key)}
                            onMouseEnter={() => handleCellEnter(key)}
                            className={`border-b border-r border-slate-200 dark:border-gray-600 cursor-pointer transition-colors h-9 ${
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
              {t('arabicStudentModal.clearAll')}
            </button>
          </Section>

          {/* ── K. Goal deadline + lesson plan equation ── */}
          <Section title={t('arabicStudentModal.sectionK')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className={lbl}>{t('arabicStudentModal.targetDate')}</label>
                <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className={inp} />
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {t('arabicStudentModal.targetDateHint')}
                </p>
              </div>
              {deadline && lpw !== null && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold uppercase tracking-wide mb-1">{t('arabicStudentModal.lessonPlan')}</p>
                  <p className="text-3xl font-extrabold text-amber-600 dark:text-amber-300">
                    {lpw} <span className="text-base font-bold">{t('arabicStudentModal.lessonsPerWeek')}</span>
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">
                    {t('arabicStudentModal.remaining', { count: 60 - completedCount, weeks: Math.max(0, Math.round(weeksUntil(deadline))) })}
                  </p>
                </div>
              )}
              {deadline && (lpw === null || lpw < 0) && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 text-sm text-red-600 dark:text-red-400">
                  {t('arabicStudentModal.deadlinePassed')}
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
              {t('arabicStudentModal.cancel')}
            </button>
            <button
              type="submit"
              className="px-7 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg shadow-sm transition-colors"
            >
              {isEdit ? t('arabicStudentModal.saveChanges') : t('arabicStudentModal.addStudent')}
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
    <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-3">
      {title}
    </h3>
    {children}
  </div>
);

export default ArabicAddStudentModal;
