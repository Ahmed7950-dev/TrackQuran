// components/AvailabilitySender.tsx
// ---------------------------------------------------------------------------
// "Send availability" — the tutor picks days in the calendar, picks a student,
// tidies the hours, and sends them a picture or a message.
//
// The hours are laid out as a time grid, half an hour to a cell, the same way
// the calendar itself reads, so a lesson that starts at half past is a cell of
// its own and not a rounding error.
//
// The one rule that shapes everything here: the student sees ONLY their own
// clock. The tutor works in Istanbul (always UTC+3), so every slot is turned
// into a real instant and then formatted in the student's timezone — which
// also means a late Istanbul hour can land on the student's NEXT day, and the
// sheet groups by the student's date, not the tutor's.
//
// What the student is shown is deliberately thinner than what the tutor edits:
// the picture marks taken time black but never names who took it, and the
// message leaves it out altogether.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AvailabilitySlot } from '../services/availabilityService';
import { safeCopy } from '../utils';

/** Istanbul never changes offset: Turkey abolished DST in 2016. */
const TUTOR_TZ = 'Europe/Istanbul';
const TUTOR_UTC_OFFSET = 3;

/** Half an hour to a cell, 64px to an hour — the calendar's own rhythm. */
const STEP_MIN = 30;
const CELL_H = 32;

/** One lesson already on the calendar, in the tutor's own hours. */
export interface BookedBlock {
  /** Istanbul calendar date, YYYY-MM-DD. */
  dateISO: string;
  /** Istanbul hours as decimals: 17.5 is half past five. */
  startHour: number;
  endHour: number;
  /** The tutor's label for it — never exported. */
  title: string;
}

export interface SendTarget {
  id: string;
  name: string;
  kind: 'quran' | 'arabic';
  timezone?: string;
}

type Cell = 'free' | 'busy';

interface Props {
  /** The days the tutor clicked in the calendar, already sorted. */
  days: Date[];
  availabilitySlots: AvailabilitySlot[];
  booked: BookedBlock[];
  students: SendTarget[];
  onClose: () => void;
}

// ── time ────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const istanbulDateISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The real instant of <minutes past midnight> Istanbul on this calendar day. */
function instantOf(day: Date, minutes: number): Date {
  return new Date(Date.UTC(
    day.getFullYear(), day.getMonth(), day.getDate(),
    -TUTOR_UTC_OFFSET, minutes, 0,
  ));
}

const timeIn = (d: Date, tz: string) =>
  d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

const dateKeyIn = (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz });

const dateLabelIn = (d: Date, tz: string) =>
  d.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

/** "Asia/Riyadh" → "Riyadh" */
const cityOf = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ');

/** Minutes past midnight in the tutor's own clock, as HH:MM. The grid is the
 *  tutor's working view, so it reads in the hours they actually keep; only
 *  what is exported is turned into the student's time. */
const tutorTime = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// ── the sheet's shape ───────────────────────────────────────────────────────

interface Run { start: Date; end: Date; state: Cell }
interface DayRun { key: string; label: string; runs: Run[] }

/** Slots → one block per unbroken run of the same state, in the student's own
 *  days. Three free hours read as "14:00 – 17:00", not as six half-hours. */
function groupForStudent(
  slots: Array<{ start: Date; end: Date; state: Cell }>,
  tz: string,
): DayRun[] {
  const byDay = new Map<string, { label: string; runs: Run[] }>();
  for (const s of slots) {
    const key = dateKeyIn(s.start, tz);
    let day = byDay.get(key);
    if (!day) { day = { label: dateLabelIn(s.start, tz), runs: [] }; byDay.set(key, day); }
    const last = day.runs[day.runs.length - 1];
    if (last && last.state === s.state && last.end.getTime() === s.start.getTime()) last.end = s.end;
    else day.runs.push({ start: s.start, end: s.end, state: s.state });
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, d]) => ({ key, label: d.label, runs: d.runs }));
}

// ── the picture the student gets ────────────────────────────────────────────

const SHEET_W = 1080;
/** A free block is drawn to its length; a taken one stays a thin bar. */
const SHEET_PX_PER_HOUR = 58;
const SHEET_FREE_MIN_H = 70;
const SHEET_BUSY_H = 64;

const hoursOf = (r: Run) => (r.end.getTime() - r.start.getTime()) / 3_600_000;

/** The longer the free run, the deeper the green — the shade says at a glance
 *  how many half hours are in it. Every step keeps white text above 4.5:1. */
function greenFor(halfHours: number): string {
  if (halfHours <= 1) return '#1E8A4C';
  if (halfHours === 2) return '#17803F';
  if (halfHours <= 4) return '#146B38';
  if (halfHours <= 8) return '#115C30';
  return '#0D4A27';
}

/** A stretch of the same thing in one day's column. A booked stretch is split
 *  by title, so two lessons back to back stay two blocks. */
interface GridRun {
  startIdx: number;
  count: number;
  state: Cell;
  title?: string;
  startMin: number;
  endMin: number;
}

const Sheet: React.FC<{ studentName: string; tz: string; days: DayRun[] }> = ({ studentName, tz, days }) => (
  <div style={{
    width: SHEET_W, boxSizing: 'border-box', background: '#FFFFFF', color: '#16181C',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  }}>
    <div style={{ background: '#0F3D2E', color: '#FFFFFF', padding: '40px 48px 34px' }}>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9FC9B8' }}>
        Lisan &amp; Quran
      </p>
      <h1 style={{ margin: '14px 0 0', fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>When I am free</h1>
      <p style={{ margin: '14px 0 0', fontSize: 32, fontWeight: 600, color: '#CFE6DC' }}>For {studentName}</p>
      <p style={{ margin: '22px 0 0', background: '#FFFFFF', borderRadius: 16, padding: '18px 24px', fontSize: 27, fontWeight: 700, color: '#16181C' }}>
        All times are <span style={{ color: '#0D6B57' }}>your time in {cityOf(tz)}</span>.
      </p>
    </div>

    <div style={{ display: 'flex', gap: 14, padding: '24px 48px 6px' }}>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#15803D', color: '#FFFFFF', borderRadius: 14, padding: '14px 20px', fontSize: 25, fontWeight: 800 }}>
        ✓&nbsp; Green = free
      </span>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#1C1F24', color: '#FFFFFF', borderRadius: 14, padding: '14px 20px', fontSize: 25, fontWeight: 800 }}>
        ✕&nbsp; Black = taken
      </span>
    </div>

    <div style={{ padding: '16px 48px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {days.map(day => (
        <div key={day.key}>
          <p style={{ margin: '0 0 10px', fontSize: 34, fontWeight: 800 }}>{day.label}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {day.runs.map((r, i) => {
              const free = r.state === 'free';
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 18, borderRadius: 16, padding: '0 26px',
                  background: free ? '#15803D' : '#1C1F24', color: '#FFFFFF',
                  height: free ? Math.max(SHEET_FREE_MIN_H, Math.round(hoursOf(r) * SHEET_PX_PER_HOUR)) : SHEET_BUSY_H,
                }}>
                  <span style={{ flexGrow: 1, fontSize: free ? 42 : 34, fontWeight: 800 }}>
                    {timeIn(r.start, tz)} – {timeIn(r.end, tz)}
                  </span>
                  <span style={{
                    fontSize: free ? 25 : 22, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: free ? '#FFFFFF' : '#B9C0C8',
                  }}>
                    {free ? 'Available' : 'Booked'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>

    <div style={{ height: 40 }} />
  </div>
);

// ── the panel ───────────────────────────────────────────────────────────────

const AvailabilitySender: React.FC<Props> = ({ days, availabilitySlots, booked, students, onClose }) => {
  const [studentId, setStudentId] = useState<string>(students.length === 1 ? students[0].id : '');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const student = students.find(s => s.id === studentId) ?? null;
  const tz = student?.timezone?.trim() || TUTOR_TZ;

  /** The window the tutor offers. It starts at the working hours already saved
   *  and can be widened for this one message. */
  const savedFrom = availabilitySlots.length ? Math.min(...availabilitySlots.map(s => s.hour)) : 9;
  const savedTo   = availabilitySlots.length ? Math.max(...availabilitySlots.map(s => s.hour)) + 1 : 21;
  const [from, setFrom] = useState(savedFrom);
  const [to,   setTo]   = useState(savedTo);

  const [overrides, setOverrides] = useState<Record<string, Cell>>({});
  const [mode, setMode] = useState<'png' | 'text'>('png');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Nothing behind this moves while it is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  /** Minutes past midnight, Istanbul, one entry per half hour on offer. */
  const steps = useMemo(() => {
    const out: number[] = [];
    for (let m = from * 60; m < to * 60; m += STEP_MIN) out.push(m);
    return out;
  }, [from, to]);

  /** The lesson sitting on this half hour, if any — the tutor's view of it. */
  const blockAt = (dateISO: string, mins: number): BookedBlock | null =>
    booked.find(b => b.dateISO === dateISO && b.startHour * 60 < mins + STEP_MIN && b.endHour * 60 > mins) ?? null;

  const stateOf = (dateISO: string, mins: number): Cell =>
    overrides[`${dateISO}-${mins}`] ?? (blockAt(dateISO, mins) ? 'busy' : 'free');

  const flip = (dateISO: string, mins: number) =>
    setOverrides(m => ({ ...m, [`${dateISO}-${mins}`]: stateOf(dateISO, mins) === 'free' ? 'busy' : 'free' }));

  /** One block per unbroken stretch in a day's column. */
  const runsFor = (day: Date): GridRun[] => {
    const dateISO = istanbulDateISO(day);
    const out: GridRun[] = [];
    steps.forEach((m, i) => {
      const state = stateOf(dateISO, m);
      const title = state === 'busy' ? (blockAt(dateISO, m)?.title ?? 'Booked') : undefined;
      const last  = out[out.length - 1];
      if (last && last.state === state && last.title === title && last.startIdx + last.count === i) {
        last.count += 1;
        last.endMin = m + STEP_MIN;
      } else {
        out.push({ startIdx: i, count: 1, state, title, startMin: m, endMin: m + STEP_MIN });
      }
    });
    return out;
  };

  /** Every offered half hour of every picked day, as real instants. */
  const sheetDays = useMemo(() => {
    const slots = days.flatMap(day => {
      const dateISO = istanbulDateISO(day);
      return steps.map(m => ({
        start: instantOf(day, m),
        end:   instantOf(day, m + STEP_MIN),
        state: stateOf(dateISO, m),
      }));
    });
    return groupForStudent(slots, tz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, steps, overrides, booked, tz]);

  const freeHours = sheetDays.reduce(
    (n, d) => n + d.runs.filter(r => r.state === 'free').reduce((m, r) => m + hoursOf(r), 0),
    0,
  );

  /** The same sheet, said in words. Only the free times: a student scanning a
   *  message does not need a list of hours they cannot have. */
  const asText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`When I am free — for ${student?.name ?? ''}`.trim());
    lines.push(`All times are YOUR time (${cityOf(tz)}).`);
    lines.push('');
    for (const day of sheetDays) {
      const free = day.runs.filter(r => r.state === 'free');
      if (!free.length) continue;
      lines.push(day.label.toUpperCase());
      for (const r of free) lines.push(`  ✅ ${timeIn(r.start, tz)} - ${timeIn(r.end, tz)}`);
      lines.push('');
    }
    lines.push('Tell me which time you want — just send the day and the time.');
    return lines.join('\n');
  }, [sheetDays, student, tz]);

  const exportPng = async () => {
    const node = sheetRef.current;
    const h2c = (window as any).html2canvas;
    if (!node || !h2c) return;
    setBusy(true);
    try {
      const canvas = await h2c(node, { backgroundColor: '#FFFFFF', scale: 1, useCORS: true, windowWidth: SHEET_W });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `availability-${(student?.name ?? 'student').replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();
    } catch (e) {
      console.error('availability png:', e);
    } finally {
      setBusy(false);
    }
  };

  const copyText = async () => {
    await safeCopy(asText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students.slice(0, 8);
    return students.filter(s => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [search, students]);

  const dayLabel = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-100 dark:bg-gray-900 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Header: who it goes to, and both clocks ── */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5">
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-2 py-1.5 -ms-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            <span className="text-sm font-semibold">Back</span>
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-extrabold text-slate-800 dark:text-slate-100 truncate">Send my availability</h2>
            <p className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 truncate">
              {days.length} day{days.length === 1 ? '' : 's'} · {days.map(dayLabel).join(' · ')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-3 sm:px-5 pb-3">
          {/* Who it is for — type the name */}
          {student ? (
            <span className="inline-flex items-center gap-2 h-9 ps-3 pe-1.5 rounded-full bg-slate-900 dark:bg-black text-white text-sm font-bold">
              {student.name}
              <span className="text-[10px] font-semibold opacity-60 uppercase">{student.kind}</span>
              <button onClick={() => { setStudentId(''); setSearch(''); }} aria-label="Choose someone else"
                className="w-6 h-6 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.6} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ) : (
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                /* a click on a name is a blur first — let it land before closing */
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Type a student's name…"
                aria-label="Search for a student"
                className="h-9 w-[220px] px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />
              {searchOpen && (
                <div className="absolute z-10 mt-1 w-[260px] max-h-64 overflow-y-auto rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 shadow-xl py-1">
                  {matches.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Nobody by that name.</p>}
                  {matches.map(s => (
                    <button key={s.id} onClick={() => { setStudentId(s.id); setSearch(''); setSearchOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 h-9 text-start hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}</span>
                      <span className="ms-auto text-[10px] font-bold uppercase text-slate-400">{s.kind}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {student && (
            <span className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold">
              Their time: {cityOf(tz)}
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              <span className="font-semibold text-emerald-600/80 dark:text-emerald-400/80">you: {cityOf(TUTOR_TZ)}</span>
            </span>
          )}

          {student && !student.timezone && (
            <span className="text-[11.5px] font-semibold text-amber-600 dark:text-amber-400">
              No timezone saved for {student.name} — showing your own.
            </span>
          )}

          <span className="flex-grow" />

          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Hours
            <input type="number" min={0} max={23} value={from}
              onChange={e => setFrom(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
              className="w-14 h-9 px-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-bold text-center" />
            to
            <input type="number" min={1} max={24} value={to}
              onChange={e => setTo(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className="w-14 h-9 px-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-bold text-center" />
          </span>
        </div>
      </div>

      {/* ── The time grid: a column per day, half an hour to a cell ── */}
      <div className="flex-1 min-h-0 overflow-auto px-3 sm:px-5 py-4">
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          Tap a half hour to flip it — the dotted lines are the half hours, the solid ones the hours.
          A deeper green means a longer free stretch. These are <strong>your</strong> hours, with the
          student&rsquo;s clock beside them; what you send is turned into theirs. The names are yours
          only: the picture says “Booked” and the message leaves it out.
        </p>

        <div className="inline-block min-w-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden">
          <div className="grid" style={{ gridTemplateColumns: `78px repeat(${days.length}, minmax(120px, 1fr))` }}>
            {/* header row */}
            <div className="border-e border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-700/50" />
            {days.map(day => (
              <div key={`h-${istanbulDateISO(day)}`}
                className="border-e last:border-e-0 border-b border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-700/50 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                </p>
                <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  {day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            ))}

            {/* the hours down the side: the student's clock, then yours */}
            <div className="border-e border-slate-200 dark:border-gray-700 relative" style={{ height: steps.length * CELL_H }}>
              {steps.map((m, i) => {
                const onTheHour = m % 60 === 0;
                return (
                  <div key={m} className="absolute inset-x-0 pe-1.5 text-end"
                    style={{
                      top: i * CELL_H, height: CELL_H,
                      borderTop: onTheHour ? '1px solid rgba(100,116,139,.35)' : '1px dotted rgba(100,116,139,.35)',
                    }}>
                    {onTheHour && days[0] && (
                      <>
                        <span className="block text-[10.5px] font-bold text-slate-700 dark:text-slate-200 leading-tight">
                          {tutorTime(m)}
                        </span>
                        <span className="block text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 leading-tight">
                          {cityOf(tz)} {timeIn(instantOf(days[0], m), tz)}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* one column per day: blocks, not cells */}
            {days.map(day => {
              const dateISO = istanbulDateISO(day);
              return (
                <div key={dateISO} className="relative border-e last:border-e-0 border-slate-200 dark:border-gray-700"
                  style={{ height: steps.length * CELL_H }}>

                  {runsFor(day).map(run => {
                    const free = run.state === 'free';
                    return (
                      <div key={run.startIdx} className="absolute inset-x-0 overflow-hidden"
                        style={{
                          top: run.startIdx * CELL_H,
                          height: run.count * CELL_H,
                          background: free ? greenFor(run.count) : '#0B0F14',
                          borderTop: run.startMin % 60 === 0 ? '1px solid rgba(148,163,184,.45)' : '1px dotted rgba(148,163,184,.55)',
                        }}>
                        {/* inside a block: solid on the hour, dotted on the half */}
                        {Array.from({ length: run.count - 1 }, (_, k) => k + 1).map(k => (
                          <span key={k} className="absolute inset-x-1.5 pointer-events-none"
                            style={{
                              top: k * CELL_H,
                              borderTop: (run.startMin + k * STEP_MIN) % 60 === 0
                                ? '1px solid rgba(255,255,255,.34)'
                                : '1px dotted rgba(255,255,255,.42)',
                            }} />
                        ))}
                        <span className="absolute inset-0 flex items-center px-2 pointer-events-none">
                          <span className="text-[11px] font-extrabold text-white truncate">
                            {free
                              ? `${tutorTime(run.startMin)} - ${tutorTime(run.endMin)}`
                              : `${run.title} — Booked`}
                          </span>
                        </span>
                      </div>
                    );
                  })}

                  {/* the half hours themselves, invisible, for tapping */}
                  {steps.map((m, i) => (
                    <button key={m} onClick={() => flip(dateISO, m)}
                      title={stateOf(dateISO, m) === 'free' ? 'Free — tap to mark it taken' : 'Taken — tap to free it'}
                      aria-label={`${pad(Math.floor(m / 60))}:${pad(m % 60)} — ${stateOf(dateISO, m) === 'free' ? 'free' : 'taken'}`}
                      className="absolute inset-x-0 bg-transparent hover:bg-white/10 transition-colors"
                      style={{ top: i * CELL_H, height: CELL_H }} />
                  ))}
                </div>
              );
            })}
          </div>
          {steps.length === 0 && (
            <p className="text-xs text-slate-400 py-6 text-center">Widen the hours above to offer something.</p>
          )}
        </div>

        {mode === 'text' && (
          <div className="mt-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">What they will read</p>
            <pre className="text-[12.5px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-mono">{asText}</pre>
          </div>
        )}
      </div>

      {/* ── Send it ── */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
          {freeHours % 1 ? freeHours.toFixed(1) : freeHours} free hour{freeHours === 1 ? '' : 's'} offered
        </span>
        <span className="flex-grow" />
        <div className="flex rounded-xl bg-slate-100 dark:bg-gray-700 p-1">
          {(['png', 'text'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 h-9 rounded-lg text-xs font-extrabold transition-colors ${
                mode === m ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
              {m === 'png' ? 'Picture' : 'Text'}
            </button>
          ))}
        </div>
        {mode === 'png' ? (
          <button onClick={exportPng} disabled={busy || !student || sheetDays.length === 0}
            className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-extrabold disabled:opacity-40">
            {busy ? 'Drawing…' : 'Download picture'}
          </button>
        ) : (
          <button onClick={copyText} disabled={!student || sheetDays.length === 0}
            className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-extrabold disabled:opacity-40">
            {copied ? '✓ Copied' : 'Copy the message'}
          </button>
        )}
      </div>

      {/* The sheet itself, laid out off-screen so html2canvas can photograph it. */}
      <div style={{ position: 'fixed', left: -20000, top: 0, width: SHEET_W, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={sheetRef}>
          <Sheet studentName={student?.name ?? ''} tz={tz} days={sheetDays} />
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AvailabilitySender;
