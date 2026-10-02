// components/AvailabilitySender.tsx
// ---------------------------------------------------------------------------
// "Send availability" — the tutor picks days in the calendar, picks a student,
// tidies the hours, and sends them a picture or a message.
//
// The one rule that shapes everything here: the student sees ONLY their own
// clock. The tutor works in Istanbul (always UTC+3), so every hour is turned
// into a real instant and then formatted in the student's timezone — which
// also means a late Istanbul hour can land on the student's NEXT day, and the
// sheet groups by the student's date, not the tutor's.
//
// What the student is shown is deliberately thinner than what the tutor edits:
// a booked hour says "Booked" and never the name of the student who booked it.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AvailabilitySlot } from '../services/availabilityService';
import { safeCopy } from '../utils';

/** Istanbul never changes offset: Turkey abolished DST in 2016. */
const TUTOR_TZ = 'Europe/Istanbul';
const TUTOR_UTC_OFFSET = 3;

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

/** The real instant of <hour>:00 Istanbul on this calendar day. */
function instantOf(day: Date, hour: number): Date {
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hour - TUTOR_UTC_OFFSET, 0, 0));
}

const timeIn = (d: Date, tz: string) =>
  d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });

const dateKeyIn = (d: Date, tz: string) =>
  d.toLocaleDateString('en-CA', { timeZone: tz });            // YYYY-MM-DD

const dateLabelIn = (d: Date, tz: string) =>
  d.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

/** "Asia/Riyadh" → "Riyadh" */
const cityOf = (tz: string) => (tz.split('/').pop() ?? tz).replace(/_/g, ' ');

// ── the sheet's shape ───────────────────────────────────────────────────────

interface Run { start: Date; end: Date; state: Cell }
interface DayRun { key: string; label: string; runs: Run[] }

/** Hour slots → one block per unbroken run of the same state, in the student's
 *  own days. Three free hours read as "14:00 – 17:00", not as three lines. */
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

const Sheet: React.FC<{ studentName: string; tz: string; days: DayRun[] }> = ({ studentName, tz, days }) => (
  <div style={{
    width: SHEET_W, boxSizing: 'border-box', background: '#FFFFFF', color: '#16181C',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  }}>
    <div style={{ background: '#0F3D2E', color: '#FFFFFF', padding: '40px 48px 36px' }}>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9FC9B8' }}>
        Lisan &amp; Quran
      </p>
      <h1 style={{ margin: '14px 0 0', fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>When I am free</h1>
      <p style={{ margin: '16px 0 0', fontSize: 32, fontWeight: 600, color: '#CFE6DC' }}>For {studentName}</p>
      <div style={{ marginTop: 28, background: '#FFFFFF', borderRadius: 18, padding: '22px 26px' }}>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: '#16181C' }}>
          All the times below are <span style={{ color: '#0D6B57' }}>your own time in {cityOf(tz)}</span>.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: 24, fontWeight: 500, color: '#55606B' }}>
          You do not need to count any hours.
        </p>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 14, padding: '26px 48px 10px' }}>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, background: '#15803D', color: '#FFFFFF', borderRadius: 14, padding: '16px 20px', fontSize: 26, fontWeight: 800 }}>
        ✓&nbsp; Green = I am free
      </span>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, background: '#1C1F24', color: '#FFFFFF', borderRadius: 14, padding: '16px 20px', fontSize: 26, fontWeight: 800 }}>
        ✕&nbsp; Black = already taken
      </span>
    </div>

    <div style={{ padding: '18px 48px 0', display: 'flex', flexDirection: 'column', gap: 26 }}>
      {days.map(day => (
        <div key={day.key}>
          <p style={{ margin: '0 0 12px', fontSize: 34, fontWeight: 800 }}>{day.label}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {day.runs.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 18, borderRadius: 16, padding: '20px 26px',
                background: r.state === 'free' ? '#15803D' : '#1C1F24', color: '#FFFFFF',
              }}>
                <span style={{ flexGrow: 1, fontSize: 40, fontWeight: 800 }}>
                  {timeIn(r.start, tz)} – {timeIn(r.end, tz)}
                </span>
                <span style={{
                  fontSize: 24, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: r.state === 'free' ? '#FFFFFF' : '#B9C0C8',
                }}>
                  {r.state === 'free' ? 'Available' : 'Booked'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    <div style={{ margin: '28px 48px 40px', background: '#FDF6E8', border: '2px solid #E8D6B0', borderRadius: 20, padding: '26px 30px' }}>
      <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: '#4A3A18' }}>Tell me which green time you want.</p>
      <p style={{ margin: '10px 0 0', fontSize: 25, fontWeight: 500, lineHeight: 1.45, color: '#6B5A33' }}>
        Send me the day and the time and I will book it for you.
      </p>
    </div>
  </div>
);

// ── the panel ───────────────────────────────────────────────────────────────

const AvailabilitySender: React.FC<Props> = ({ days, availabilitySlots, booked, students, onClose }) => {
  const [studentId, setStudentId] = useState<string>(students[0]?.id ?? '');
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

  const hours = useMemo(
    () => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i),
    [from, to],
  );

  /** The lesson sitting on this hour, if any — the tutor's view of it. */
  const blockAt = (dateISO: string, hour: number): BookedBlock | null =>
    booked.find(b => b.dateISO === dateISO && b.startHour < hour + 1 && b.endHour > hour) ?? null;

  const stateOf = (dateISO: string, hour: number): Cell =>
    overrides[`${dateISO}-${hour}`] ?? (blockAt(dateISO, hour) ? 'busy' : 'free');

  const flip = (dateISO: string, hour: number) =>
    setOverrides(m => ({ ...m, [`${dateISO}-${hour}`]: stateOf(dateISO, hour) === 'free' ? 'busy' : 'free' }));

  /** Every offered hour of every picked day, as real instants. */
  const sheetDays = useMemo(() => {
    const slots = days.flatMap(day => {
      const dateISO = istanbulDateISO(day);
      return hours.map(h => ({
        start: instantOf(day, h),
        end:   instantOf(day, h + 1),
        state: stateOf(dateISO, h),
      }));
    });
    return groupForStudent(slots, tz);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, hours, overrides, booked, tz]);

  const freeHours = sheetDays.reduce(
    (n, d) => n + d.runs.filter(r => r.state === 'free').reduce((m, r) => m + (r.end.getTime() - r.start.getTime()) / 3_600_000, 0),
    0,
  );

  /** The same sheet, said in words — for WhatsApp, where a picture is heavy. */
  const asText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`When I am free — for ${student?.name ?? ''}`.trim());
    lines.push(`All times below are YOUR time (${cityOf(tz)}).`);
    lines.push('');
    for (const day of sheetDays) {
      lines.push(day.label.toUpperCase());
      for (const r of day.runs) {
        const span = `${timeIn(r.start, tz)} - ${timeIn(r.end, tz)}`;
        lines.push(r.state === 'free' ? `  ✅ ${span}  free` : `  ❌ ${span}  taken`);
      }
      lines.push('');
    }
    lines.push('Tell me which free time you want — just send the day and the time.');
    return lines.join('\n');
  }, [sheetDays, student, tz]);

  const exportPng = async () => {
    const node = sheetRef.current;
    const h2c = (window as any).html2canvas;
    if (!node || !h2c) return;
    setBusy(true);
    try {
      const canvas = await h2c(node, { backgroundColor: '#FFFFFF', scale: 1, useCORS: true, windowWidth: SHEET_W });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
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
          <label htmlFor="av-student" className="text-[11px] font-bold uppercase tracking-wide text-slate-400">To</label>
          <select id="av-student" value={studentId} onChange={e => setStudentId(e.target.value)}
            className="h-9 px-2.5 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-bold text-slate-800 dark:text-slate-100 max-w-[220px]">
            {students.length === 0 && <option value="">No students yet</option>}
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.kind === 'arabic' ? 'Arabic' : 'Quran'}</option>
            ))}
          </select>

          <span className="inline-flex items-center gap-2 h-9 px-3 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold">
            Their time: {cityOf(tz)}
            <span className="w-1 h-1 rounded-full bg-emerald-400" />
            <span className="font-semibold text-emerald-600/80 dark:text-emerald-400/80">you: {cityOf(TUTOR_TZ)}</span>
          </span>

          {!student?.timezone && student && (
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

      {/* ── The hours, one block per picked day ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4">
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">
          Tap an hour to flip it. A lesson nobody attends can go green; an hour you want back can go black.
          The names below are yours only — the student is told “Booked” and nothing else.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {days.map(day => {
            const dateISO = istanbulDateISO(day);
            return (
              <div key={dateISO} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-3">
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-2">
                  {day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="flex flex-col gap-1">
                  {hours.map(h => {
                    const state = stateOf(dateISO, h);
                    const block = blockAt(dateISO, h);
                    const inst  = instantOf(day, h);
                    return (
                      <button key={h} onClick={() => flip(dateISO, h)}
                        className={`w-full h-11 rounded-xl px-3 flex items-center gap-2 text-start transition-colors ${
                          state === 'free'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-black dark:hover:bg-slate-900'
                        }`}>
                        <span className="text-[13px] font-extrabold tabular-nums flex-shrink-0">{timeIn(inst, tz)}</span>
                        <span className="text-[10px] font-semibold opacity-60 tabular-nums flex-shrink-0">you {pad(h)}:00</span>
                        <span className="flex-grow" />
                        {state === 'free' ? (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider">Available</span>
                        ) : (
                          <span className="min-w-0 text-end">
                            <span className="block text-[10px] font-extrabold uppercase tracking-wider leading-tight">Booked</span>
                            {block && <span className="block text-[10px] font-semibold opacity-60 truncate leading-tight">{block.title}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {hours.length === 0 && (
                    <p className="text-xs text-slate-400 py-4 text-center">Widen the hours above to offer something.</p>
                  )}
                </div>
              </div>
            );
          })}
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
          {Math.round(freeHours)} free hour{Math.round(freeHours) === 1 ? '' : 's'} offered
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
