import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Student, AttendanceStatus } from '../types';
import { useI18n } from '../context/I18nProvider';
import { CURRENCY_SYMBOL, Currency } from './StudentBillingFields';
import { getStudentRankAndProgress, getOverallRankAndProgress } from '../services/rankingService';
import { getRecitedPagesSet, getMemorizedPagesSet } from '../services/dataService';
import { QURAN_METADATA } from '../constants';

// CDN globals from index.html (html2pdf.bundle also exposes jsPDF as window.jspdf).
declare const html2pdf: any;

const BILL_W = 794;        // A4 width @96dpi
const DEFAULT_MIN = 60;    // default lesson length

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const inMonthOf = (iso: string, y: number, m: number) => { const d = new Date(iso); return d.getFullYear() === y && d.getMonth() === m; };

/** Attended-day keys (YYYY-MM-DD) in a month: explicit PRESENT + implicit-present
 *  (a day with an achievement and no explicit record). Explicit record wins. */
function attendedKeysInMonth(student: Student, monthDate: Date): string[] {
  const y = monthDate.getFullYear(), m = monthDate.getMonth();
  const explicit = new Map<string, AttendanceStatus>();
  for (const a of student.attendance ?? []) {
    if (inMonthOf(a.date, y, m)) explicit.set(new Date(a.date).toDateString(), a.status);
  }
  const keys = new Set<string>();
  for (const a of student.attendance ?? []) {
    if (inMonthOf(a.date, y, m) && a.status === AttendanceStatus.Present) keys.add(keyOf(a.date));
  }
  for (const a of [...(student.recitationAchievements ?? []), ...(student.memorizationAchievements ?? [])]) {
    if (!inMonthOf(a.date, y, m)) continue;
    const ds = new Date(a.date).toDateString();
    if (!explicit.has(ds)) keys.add(keyOf(a.date));
  }
  return [...keys].sort(); // ascending YYYY-MM-DD
}

interface BillPageProps {
  student: Student;
  students: Student[];
  tutorEmail?: string;
  receiverName?: string;   // from profiles (per-tutor)
  iban?: string;           // from profiles (per-tutor)
  onUpdateStudent: (s: Student) => void;
  onSaveTutorBillInfo: (info: { receiverName: string; iban: string }) => void;
}

const BillPage: React.FC<BillPageProps> = ({
  student, students, tutorEmail, receiverName: tutorReceiver, iban: tutorIban,
  onUpdateStudent, onSaveTutorBillInfo,
}) => {
  const { t, language } = useI18n();
  const isRtl = language === 'ar';
  const dateLocale = language === 'ar' ? 'ar' : language === 'tr' ? 'tr' : 'en-US';
  const billRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  // ── Period ──
  const [billMonth, setBillMonth] = useState<Date>(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const issuedOn = useMemo(() => new Date(), []);
  const sessionKeys = useMemo(() => attendedKeysInMonth(student, billMonth), [student, billMonth]);
  const presentDays = useMemo(() => new Set(sessionKeys), [sessionKeys]);

  // ── Editable per-student ──
  const [studentName, setStudentName] = useState(student.billStudentName ?? student.name);
  const [payerName, setPayerName] = useState(student.billPayerName ?? '');
  const [improvementNote, setImprovementNote] = useState(student.billImprovementNote ?? '');
  const [priceInput, setPriceInput] = useState(
    student.billPriceOverride != null ? String(student.billPriceOverride)
      : student.hourlyRate != null ? String(student.hourlyRate) : ''
  );
  // Per-lesson durations (minutes), keyed by date. Defaults to 60 for any day not set.
  const [durations, setDurations] = useState<Record<string, number>>(() => ({ ...(student.billDurations ?? {}) }));
  // ── Editable per-tutor ──
  const [receiverName, setReceiverName] = useState(tutorReceiver ?? '');
  const [iban, setIban] = useState(tutorIban ?? '');

  const minutesFor = (k: string) => durations[k] ?? DEFAULT_MIN;
  const setMinutesFor = (k: string, min: number) => setDurations(prev => ({ ...prev, [k]: Math.max(0, min) }));

  const price = priceInput.trim() === '' ? (student.hourlyRate ?? 0) : (Number(priceInput) || 0);
  const totalMinutes = sessionKeys.reduce((s, k) => s + minutesFor(k), 0);
  const totalHours = totalMinutes / 60;
  const total = totalHours * price;
  const currency: Currency = (student.currency as Currency) ?? 'USD';
  const sym = CURRENCY_SYMBOL[currency];
  const currencyLabel = `${currency} ${sym}`;        // "USD $" / "TRY ₺"
  const fmt = (n: number) => `${sym}${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const hoursUnit = t('bill.hoursUnit');
  const fmtHours = (min: number) => `${Number((min / 60).toFixed(2))} ${hoursUnit}`;   // 60→"1 h", 90→"1.5 h"
  const fmtSessionDate = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' });
  };

  // ── Stats (same primitives as the statistics page) ──
  const pagesRead = useMemo(() => new Set<number>([...getRecitedPagesSet(student), ...getMemorizedPagesSet(student)]).size, [student]);
  const readingQuality = useMemo(() => {
    const qs = [
      ...(student.recitationAchievements ?? []).map(a => a.readingQuality),
      ...(student.memorizationAchievements ?? []).map(a => a.memorizationQuality),
    ];
    return qs.length ? qs.reduce((s, q) => s + q, 0) / qs.length : 0;
  }, [student]);
  const readingRank = useMemo(() => getStudentRankAndProgress(student, students, 'reading'), [student, students]);
  const overallRank = useMemo(() => getOverallRankAndProgress(student, students, 'reading'), [student, students]);
  const lastRead = useMemo(() => {
    const all = [...(student.recitationAchievements ?? []), ...(student.memorizationAchievements ?? [])];
    if (!all.length) return '—';
    const last = [...all].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const name = QURAN_METADATA.find(s => s.number === last.endSurah)?.name ?? '';
    return `${name} ${last.endAyah}`.trim() || '—';
  }, [student]);

  // ── Persistence (fire-and-forget on blur) ──
  const persistStudentBill = useCallback(() => {
    onUpdateStudent({
      ...student,
      billStudentName: studentName.trim() && studentName.trim() !== student.name ? studentName.trim() : undefined,
      billPayerName: payerName.trim() || undefined,
      billImprovementNote: improvementNote.trim() || undefined,
      billPriceOverride: priceInput.trim() === '' ? undefined : (Number(priceInput) || undefined),
      billDurations: Object.keys(durations).length ? durations : undefined,
    });
  }, [student, studentName, payerName, improvementNote, priceInput, durations, onUpdateStudent]);
  const persistTutorBill = useCallback(() => {
    onSaveTutorBillInfo({ receiverName: receiverName.trim(), iban: iban.trim() });
  }, [receiverName, iban, onSaveTutorBillInfo]);

  // ── Calendar grid (Monday-first) ──
  const calYear = billMonth.getFullYear(), calMonth = billMonth.getMonth();
  const startWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const dayNames = isRtl ? ['ن', 'ث', 'ر', 'خ', 'ج', 'س', 'ح'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const periodStr = billMonth.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
  const periodRangeStr = `1–${daysInMonth} ${periodStr}`;          // "1–30 June 2026"
  const issuedStr = issuedOn.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' });
  const billNumber = `INV-${calYear}${pad(calMonth + 1)}-${(student.name || 'STU').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}`;

  // ── Export to a guaranteed single page ──
  const handleExportPdf = useCallback(async () => {
    if (isExporting) return;
    if (typeof html2pdf === 'undefined') { alert(t('bill.pdfNotLoaded')); return; }
    setIsExporting(true);
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);

    const element = billRef.current;
    if (!element) { setIsExporting(false); return; }

    const root = document.documentElement;
    const wasDark = root.classList.contains('dark');
    if (wasDark) root.classList.remove('dark');

    if (document.fonts?.ready) { try { await document.fonts.ready; } catch {} }

    const filename = `${(studentName || student.name || 'student').replace(/ /g, '_')}_${calYear}${pad(calMonth + 1)}_bill.pdf`;
    const w = element.offsetWidth || BILL_W;
    const h = element.scrollHeight;

    try {
      // Rasterise the bill ourselves, then build a PDF page that is EXACTLY the
      // canvas size and drop the image onto it at 1:1 — one page, full width, no
      // clipping. (Letting html2pdf auto-layout to A4 was cropping the wide bill.)
      const canvas: HTMLCanvasElement = await html2pdf()
        .set({ html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0, windowWidth: w, width: w, height: h } })
        .from(element).toCanvas().get('canvas');

      const jsPDFCtor = (window as any).jspdf?.jsPDF;
      if (jsPDFCtor) {
        const pdf = new jsPDFCtor({ unit: 'px', format: [canvas.width, canvas.height], orientation: 'portrait', hotfixes: ['px_scaling'] });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save(filename);
      } else {
        // Fallback: page sized to the element's px dimensions.
        await html2pdf().from(element).set({
          margin: 0, filename, image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, logging: false, windowWidth: w, width: w, height: h },
          jsPDF: { unit: 'px', format: [w, h], orientation: 'portrait', hotfixes: ['px_scaling'] },
          pagebreak: { mode: ['avoid-all'] },
        }).save();
      }
    } catch (err) {
      console.error('Bill PDF failed:', err);
      alert(t('bill.pdfError'));
    } finally {
      if (wasDark) root.classList.add('dark');
      setIsExporting(false);
    }
  }, [isExporting, studentName, student.name, calYear, calMonth, t]);

  const getButtonText = () => isExporting ? t('bill.exportGenerating') : (typeof html2pdf === 'undefined' ? t('bill.exportLoading') : t('bill.exportPdf'));
  const isButtonDisabled = isExporting || typeof html2pdf === 'undefined';

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400';
  const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

  const stats = [
    { label: t('bill.pagesRead'), value: String(pagesRead) },
    { label: t('bill.readingQuality'), value: `${readingQuality.toFixed(1)}/10` },
    { label: t('bill.lastRead'), value: lastRead },
    { label: t('bill.rankInAgeGroup'), value: readingRank.rank ? `${readingRank.rank} / ${readingRank.totalInGroup}` : '—' },
    { label: t('bill.rankAmongAll'), value: overallRank.rank ? `${overallRank.rank} / ${overallRank.total}` : '—' },
  ];

  return (
    <div className="max-w-[860px] mx-auto px-3 py-4">
      {/* ── EDITING CONTROLS — outside the captured node ── */}
      <div className="space-y-3 mb-5 bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 no-print">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('bill.period')}</label>
          <div className="flex items-center gap-1">
            <button onClick={() => setBillMonth(p => { const d = new Date(p); d.setMonth(d.getMonth() - 1); return d; })} className="px-2 py-1 rounded bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300">‹</button>
            <span className="text-sm font-medium min-w-[9rem] text-center text-slate-700 dark:text-slate-200">{periodStr}</span>
            <button onClick={() => setBillMonth(p => { const d = new Date(p); d.setMonth(d.getMonth() + 1); return d; })} className="px-2 py-1 rounded bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300">›</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{t('bill.studentName')}</label>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} onBlur={persistStudentBill} placeholder={student.name} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('bill.pricePerLesson')} ({sym})</label>
            <input type="number" inputMode="decimal" value={priceInput} onChange={e => setPriceInput(e.target.value)} onBlur={persistStudentBill} placeholder={String(student.hourlyRate ?? 0)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('bill.payerName')}</label>
          <input value={payerName} onChange={e => setPayerName(e.target.value)} onBlur={persistStudentBill} placeholder={t('bill.payerNamePlaceholder')} className={inputCls} />
        </div>

        {/* Per-lesson durations (auto-imported from attendance, editable) */}
        <div>
          <label className={labelCls}>{t('bill.sessions')}</label>
          {sessionKeys.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{t('bill.noSessions')}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {sessionKeys.map(k => (
                <div key={k} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{fmtSessionDate(k)}</span>
                  <span className="flex items-center gap-1">
                    <input type="number" inputMode="numeric" min={0} step={15} value={minutesFor(k)}
                      onChange={e => setMinutesFor(k, e.target.value === '' ? 0 : Number(e.target.value))}
                      onBlur={persistStudentBill}
                      className="w-16 px-2 py-1 rounded-md border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-xs text-center focus:outline-none focus:ring-2 focus:ring-teal-400" />
                    <span className="text-[10px] text-slate-400">{t('bill.minutes')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1">{t('bill.lessonsHint')}</p>
        </div>

        <div>
          <label className={labelCls}>{t('bill.improvementNote')}</label>
          <textarea value={improvementNote} onChange={e => setImprovementNote(e.target.value)} onBlur={persistStudentBill} placeholder={t('bill.improvementNotePlaceholder')} rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{t('bill.receiverName')}</label>
            <input value={receiverName} onChange={e => setReceiverName(e.target.value)} onBlur={persistTutorBill} placeholder={t('bill.receiverNamePlaceholder')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('bill.iban')}</label>
            <input dir="ltr" value={iban} onChange={e => setIban(e.target.value)} onBlur={persistTutorBill} placeholder={t('bill.ibanPlaceholder')} className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={handleExportPdf} disabled={isButtonDisabled}
            className="px-5 py-2.5 text-white font-semibold rounded-lg shadow-sm transition-colors bg-teal-600 hover:bg-teal-700 dark:bg-orange-600 dark:hover:bg-orange-700 disabled:bg-slate-400 disabled:cursor-not-allowed inline-flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
            {getButtonText()}
          </button>
        </div>
      </div>

      {/* ── CAPTURED INVOICE NODE — fixed width, hard white, theme-proof ── */}
      <div className="overflow-x-auto">
        <div ref={billRef} dir={isRtl ? 'rtl' : 'ltr'} style={{ width: `${BILL_W}px` }} className="bg-white text-slate-800 font-sans p-10 mx-auto flex flex-col [&_*]:!shadow-none">
          {/* Header */}
          <header className="flex items-start justify-between pb-5 border-b-2 border-teal-600">
            <div className="flex items-center">
              <img src="/TQ LOGO.png" alt="" crossOrigin="anonymous" className="w-56 h-auto object-contain" />
            </div>
            <div className="text-end">
              <p className="text-2xl font-black tracking-tight text-slate-900">{t('bill.title')}</p>
              <p className="text-xs text-slate-500 mt-1">{t('bill.issuedOn', { date: issuedStr })}</p>
              <p className="text-xs text-slate-500" dir="ltr">{t('bill.billNo')}&nbsp;{billNumber}</p>
            </div>
          </header>

          {/* From / To */}
          <section className="grid grid-cols-2 gap-6 mt-6">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('bill.payerName')}</p>
              <p className="text-sm font-semibold text-slate-800">{payerName || '—'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-end">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{t('bill.receiverName')}</p>
              <p className="text-sm font-semibold text-slate-800">{receiverName || '—'}</p>
              <p className="text-xs text-slate-500 mt-1 font-mono" dir="ltr" style={{ unicodeBidi: 'isolate' }}>{t('bill.iban')}: {iban || '—'}</p>
              {tutorEmail && <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{tutorEmail}</p>}
            </div>
          </section>

          {/* Student + period */}
          <section className="flex items-center justify-between mt-5 px-1">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('bill.studentName')}</p>
              <p className="text-lg font-bold text-slate-900">{studentName || student.name}</p>
            </div>
            <div className="text-end">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('bill.period')}</p>
              <p className="text-sm font-semibold text-slate-700">{periodRangeStr}</p>
            </div>
          </section>

          {/* Calendar | stats */}
          <section className="grid grid-cols-[260px_1fr] gap-6 mt-5">
            <div className="rounded-xl border border-slate-200 p-3">
              <p className="text-[11px] font-bold text-slate-600 mb-2 text-center">{t('bill.attendanceTitle')}</p>
              <div className="grid grid-cols-7 gap-0.5">
                {dayNames.map((d, i) => <div key={i} className="text-[8px] font-bold text-slate-400 text-center pb-0.5">{d}</div>)}
                {cells.map((day, i) => {
                  if (day === null) return <div key={`e${i}`} className="h-7" />;
                  const key = `${calYear}-${pad(calMonth + 1)}-${pad(day)}`;
                  const present = presentDays.has(key);
                  return <div key={key} className={`h-7 rounded-md border flex items-center justify-center text-[9px] ${present ? 'bg-emerald-500 border-emerald-500 text-white font-bold' : 'border-slate-100 text-slate-400'}`}>{day}</div>;
                })}
              </div>
              <div className="flex items-center justify-center gap-1.5 mt-2">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" />
                <span className="text-[9px] text-slate-500">{t('bill.attended')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 content-start">
              {stats.map(s => (
                <div key={s.label} className="rounded-lg bg-slate-50 px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 leading-tight">{s.label}</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5 truncate" title={s.value}>{s.value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Lesson breakdown — one row per attended date */}
          <section className="mt-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <th className="text-start font-bold py-2 w-8">#</th>
                  <th className="text-start font-bold py-2">{t('bill.date')}</th>
                  <th className="text-center font-bold py-2 w-28">{t('bill.duration')}</th>
                  <th className="text-end font-bold py-2 w-24">{t('bill.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {sessionKeys.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-center text-slate-400 text-xs">{t('bill.noSessions')}</td></tr>
                ) : sessionKeys.map((k, i) => (
                  <tr key={k} className="border-b border-slate-100">
                    <td className="py-2 text-slate-400 text-xs">{i + 1}</td>
                    <td className="py-2 text-slate-700">{fmtSessionDate(k)}</td>
                    <td className="py-2 text-center text-slate-700" dir="ltr">{fmtHours(minutesFor(k))}</td>
                    <td className="py-2 text-end font-semibold text-slate-900" dir="ltr">{fmt((minutesFor(k) / 60) * price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-[11px] text-slate-500">
                  <td colSpan={2} className="pt-2">{t('bill.lessonsCount')}: {sessionKeys.length}</td>
                  <td className="pt-2 text-center" dir="ltr">{Number(totalHours.toFixed(2))} {hoursUnit}</td>
                  <td className="pt-2 text-end" dir="ltr">{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Improvement note */}
          {improvementNote.trim() && (
            <section className="mt-5 rounded-xl bg-teal-50 border border-teal-100 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600 mb-1">{t('bill.improvementNote')}</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{improvementNote}</p>
            </section>
          )}

          {/* BIG TOTAL */}
          <section className="mt-6 flex justify-end">
            <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-teal-700 text-white px-8 py-5 min-w-[300px] shadow-lg">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-100">{t('bill.total')}</p>
                <span className="text-[11px] font-bold text-teal-100" dir="ltr">{currencyLabel}</span>
              </div>
              <div className="flex items-baseline justify-between mt-1 gap-4">
                <span className="text-[11px] text-teal-200" dir="ltr">{Number(totalHours.toFixed(2))} {hoursUnit} × {fmt(price)}</span>
                <span className="text-4xl font-black tracking-tight" dir="ltr">{fmt(total)}</span>
              </div>
              <p className="text-[10px] text-teal-200 mt-1 text-end">{periodRangeStr}</p>
            </div>
          </section>

          {/* Footer — contact + thank you / terms */}
          <footer className="mt-8 pt-5 text-center border-t border-slate-100 space-y-1">
            <p className="text-[11px] font-semibold text-slate-500">
              {t('bill.platformName')}{(receiverName || tutorEmail) ? ' · ' : ''}{receiverName}{receiverName && tutorEmail ? ' · ' : ''}<span dir="ltr">{tutorEmail}</span>
            </p>
            <p className="text-[10px] text-slate-400">{t('bill.terms')}</p>
            <p className="text-[10px] text-slate-300">{t('bill.footerThanks')}</p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default BillPage;
