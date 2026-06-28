// components/FamilyLinkPage.tsx
// ---------------------------------------------------------------------------
// No-login family portal — accessed via /family/<uuid>
// Parents see, in order:
//   1. profile boxes (name only) → tap to open that student's page
//   2. an attendance calendar (names of who attended each day)
//   3. a time-framed comparison of every progress aspect across the family
// All data comes from each member's shared report (no extra backend).
// ---------------------------------------------------------------------------

const SITE_URL = 'https://www.lisanquran.com';

import React, { useEffect, useMemo, useState } from 'react';
import { FamilyLink, FamilyMember, getFamilyLinkById } from '../services/familyLinkService';
import { getSharedReport, getPageOfAyah } from '../services/dataService';
import { MILESTONES, TOTAL_QURAN_PAGES } from '../constants';
import Logo from './Logo';

interface Props { linkId: string }

type Timeframe = 'month' | 'week' | 'all';

// Per-member colour so the same student looks consistent in calendar + charts.
const PALETTE = ['#0d9488', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#ca8a04', '#dc2626'];

// ── Date helpers ──────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function inTimeframe(dateStr: string | undefined, tf: Timeframe, now: Date): boolean {
  if (tf === 'all') return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (tf === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  // week — Monday-based
  const weekday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - weekday);
  return d >= weekStart;
}

function pagesFromAchs(achs: any[]): Set<number> {
  const s = new Set<number>();
  for (const a of achs ?? []) {
    const sp = getPageOfAyah(a.startSurah, a.startAyah);
    const ep = getPageOfAyah(a.endSurah, a.endAyah);
    if (sp > 0 && ep > 0) for (let i = sp; i <= ep; i++) s.add(i);
  }
  return s;
}

// ── Metric computation per member ─────────────────────────────────────────────
interface Metrics {
  homework: number;
  points: number;
  pagesRead: number;
  pagesMemorized: number;
  attended: number;
  absent: number;
  rescheduled: number;
  readingQuality: number;
  memQuality: number;
  rankAge: { rank: number; total: number } | null;
  rankAll: { rank: number; total: number } | null;
  mistakesReading: number;
  mistakesTajweed: number;
  milestones: number;
  tajweedLessons: number;
  tafsirVerses: number;
}

function computeMetrics(rd: any, tf: Timeframe, now: Date): Metrics {
  const sp = rd?.studentProgress ?? {};
  const rec = sp.recitationAchievements ?? [];
  const mem = sp.memorizationAchievements ?? [];
  const recTF = rec.filter((a: any) => inTimeframe(a.date, tf, now));
  const memTF = mem.filter((a: any) => inTimeframe(a.date, tf, now));
  const att = (sp.attendance ?? []).filter((a: any) => inTimeframe(a.date, tf, now));
  const taf = (sp.tafsirReviews ?? []).filter((a: any) => inTimeframe(a.date, tf, now));
  const tjw = (sp.tajweedCompletions ?? []).filter((a: any) => inTimeframe(a.completedAt, tf, now));
  const hw = (rd?.quranHomework ?? []).filter((h: any) => inTimeframe(h.assignedAt, tf, now));
  const mistakes = Object.values(rd?.mistakes ?? {}) as any[];
  const mistakesTF = mistakes.filter(m => inTimeframe(m.date, tf, now));

  const memPagesTF = pagesFromAchs(memTF);
  const readPagesTF = new Set<number>([...pagesFromAchs(recTF), ...memPagesTF]);
  // Ranks + milestones are lifetime regardless of timeframe.
  const readPagesAll = new Set<number>([...pagesFromAchs(rec), ...pagesFromAchs(mem)]);

  const readQ = [...recTF.map((a: any) => a.readingQuality), ...memTF.map((a: any) => a.memorizationQuality)];
  const avgReadQ = readQ.length ? readQ.reduce((s: number, q: number) => s + q, 0) / readQ.length : 0;
  const avgMemQ = memTF.length ? memTF.reduce((s: number, a: any) => s + a.memorizationQuality, 0) / memTF.length : 0;

  return {
    homework: hw.length,
    points: recTF.reduce((s: number, a: any) => s + (a.pointsEarned || 0), 0),
    pagesRead: readPagesTF.size,
    pagesMemorized: memPagesTF.size,
    attended: att.filter((a: any) => a.status === 'present').length,
    absent: att.filter((a: any) => a.status === 'absent').length,
    rescheduled: att.filter((a: any) => a.status === 'rescheduled').length,
    readingQuality: avgReadQ,
    memQuality: avgMemQ,
    rankAge: rd?.ranks ? { rank: rd.ranks.readingRank, total: rd.ranks.readingTotal } : null,
    rankAll: rd?.ranks ? { rank: rd.ranks.overallReadingRank, total: rd.ranks.overallReadingTotal } : null,
    mistakesReading: mistakesTF.filter(m => (m.errorType ?? 'reading') === 'reading').length,
    mistakesTajweed: mistakesTF.filter(m => m.errorType === 'tajweed').length,
    milestones: MILESTONES.filter(m => m.isAchieved(readPagesAll)).length,
    tajweedLessons: tjw.length,
    tafsirVerses: taf.length,
  };
}

// ── Generic "bar compare" card (higher is better) ─────────────────────────────
const BarCompare: React.FC<{
  emoji: string;
  title: string;
  rows: { name: string; color: string; value: number; display: string }[];
}> = ({ emoji, title, rows }) => {
  const max = Math.max(1, ...rows.map(r => r.value));
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span>{emoji}</span> {title}
      </h3>
      <div className="space-y-2 mt-3">
        {sorted.map((r, i) => (
          <div key={r.name}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-300 truncate">
                {i === 0 && r.value > 0 && '🥇 '}{r.name}
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100 ml-2 flex-shrink-0">{r.display}</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full mt-0.5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Rank card (shows "#R of T") ───────────────────────────────────────────────
const RankCompare: React.FC<{
  emoji: string; title: string;
  rows: { name: string; color: string; rank: number; total: number }[];
}> = ({ emoji, title, rows }) => {
  const sorted = [...rows].sort((a, b) => (a.rank || 999) - (b.rank || 999));
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span>{emoji}</span> {title}
        <span className="text-[10px] font-medium text-slate-400">· all-time</span>
      </h3>
      <div className="space-y-1.5 mt-3">
        {sorted.map(r => (
          <div key={r.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300 truncate">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
              {r.name}
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">
              {r.rank ? <>#{r.rank} <span className="text-slate-400 font-medium">of {r.total}</span></> : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Mistakes card (reading + tajweed, lower is better) ────────────────────────
const MistakesCompare: React.FC<{
  rows: { name: string; color: string; reading: number; tajweed: number }[];
}> = ({ rows }) => {
  const max = Math.max(1, ...rows.map(r => r.reading + r.tajweed));
  const sorted = [...rows].sort((a, b) => (a.reading + a.tajweed) - (b.reading + b.tajweed));
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm sm:col-span-2">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
        <span>⚠️</span> Overall mistakes
        <span className="text-[10px] font-medium text-slate-400">· fewer is better</span>
      </h3>
      <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] font-semibold">
        <span className="flex items-center gap-1 text-rose-500"><span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />Reading</span>
        <span className="flex items-center gap-1 text-amber-500"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />Tajweed</span>
      </div>
      <div className="space-y-2 mt-2">
        {sorted.map((r, i) => (
          <div key={r.name}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-600 dark:text-slate-300 truncate">{i === 0 && '👍 '}{r.name}</span>
              <span className="font-bold text-slate-800 dark:text-slate-100 ml-2">{r.reading + r.tajweed}</span>
            </div>
            <div className="flex h-2 bg-slate-100 dark:bg-gray-700 rounded-full mt-0.5 overflow-hidden">
              <div className="h-full bg-rose-400" style={{ width: `${(r.reading / max) * 100}%` }} />
              <div className="h-full bg-amber-400" style={{ width: `${(r.tajweed / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Attendance calendar (names of who attended each day) ──────────────────────
const AttendanceCalendar: React.FC<{
  members: { id: string; name: string; color: string; report: any }[];
}> = ({ members }) => {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const attendeesByDay = useMemo(() => {
    const map: Record<string, { name: string; color: string }[]> = {};
    members.forEach(m => {
      const att = m.report?.studentProgress?.attendance ?? [];
      att.forEach((a: any) => {
        if (a.status !== 'present' || !a.date) return;
        const key = String(a.date).slice(0, 10);
        (map[key] ??= []).push({ name: m.name, color: m.color });
      });
    });
    return map;
  }, [members]);

  const year = month.getFullYear();
  const m = month.getMonth();
  const startWeekday = (new Date(year, m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (delta: number) => setMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + delta); return d; });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500">‹</button>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">📅 Attendance · {monthLabel}</h3>
        <button onClick={() => shift(1)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-wide pb-1">{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const people = attendeesByDay[`${year}-${pad(m + 1)}-${pad(d)}`] ?? [];
          return (
            <div key={d} className="min-h-[3.5rem] rounded-lg border border-slate-100 dark:border-gray-700 p-1 flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-slate-400">{d}</span>
              {people.map((p, idx) => (
                <span key={idx} className="text-[9px] leading-tight font-bold text-white rounded px-1 py-0.5 truncate" style={{ backgroundColor: p.color }} title={p.name}>
                  {p.name}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const FamilyLinkPage: React.FC<Props> = ({ linkId }) => {
  const [familyLink, setFamilyLink] = useState<FamilyLink | null | 'loading'>('loading');
  const [reports, setReports] = useState<Record<string, any>>({});
  const [timeframe, setTimeframe] = useState<Timeframe>('month');

  useEffect(() => {
    document.title = 'Family Progress';
    getFamilyLinkById(linkId).then(link => setFamilyLink(link));
    return () => { document.title = 'LisanQuran'; };
  }, [linkId]);

  // Load every Quran member's full shared report (the metrics live there).
  useEffect(() => {
    if (!familyLink || familyLink === 'loading') return;
    familyLink.members.forEach(member => {
      if (member.type === 'quran' && member.report_id) {
        getSharedReport(member.report_id)
          .then(r => { if (r) setReports(prev => ({ ...prev, [member.id]: r.report_data })); })
          .catch(() => {});
      }
    });
  }, [familyLink]);

  if (familyLink === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-gray-900">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-teal-400 border-t-transparent animate-spin mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading family progress…</p>
        </div>
      </div>
    );
  }

  if (!familyLink) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-12 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🔗</div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">Link not found</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This family link is invalid or has been removed. Ask your teacher for a fresh link.
          </p>
        </div>
      </div>
    );
  }

  const backPath = encodeURIComponent(`/family/${linkId}`);
  const memberUrl = (member: FamilyMember) => member.type === 'quran'
    ? `${SITE_URL}/report/${member.report_id}?from=${backPath}`
    : `${SITE_URL}/arabic/s/${member.share_token}?from=${backPath}`;

  // Quran members with their colour + loaded report, used for calendar + comparison.
  const quranMembers = familyLink.members
    .filter(m => m.type === 'quran')
    .map((m, i) => ({ id: m.id, name: m.name, color: PALETTE[i % PALETTE.length], report: reports[m.id] }));

  const metricsByMember: Record<string, Metrics> = {};
  const now = new Date();
  quranMembers.forEach(m => { metricsByMember[m.id] = computeMetrics(m.report, timeframe, now); });

  const rowsFor = (pick: (mx: Metrics) => number, fmt?: (v: number) => string) =>
    quranMembers.map(m => {
      const v = pick(metricsByMember[m.id]);
      return { name: m.name, color: m.color, value: v, display: fmt ? fmt(v) : String(v) };
    });
  const pct = (v: number) => `${v} · ${Math.round((v / TOTAL_QURAN_PAGES) * 100)}%`;

  return (
    <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Logo />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 truncate">👨‍👩‍👧‍👦 {familyLink.name}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {familyLink.members.length} {familyLink.members.length === 1 ? 'student' : 'students'} · Progress shared by their teacher
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto flex-grow px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {familyLink.members.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-4xl mb-3">👶</p>
            <p className="text-lg font-semibold">No students added yet</p>
          </div>
        ) : (
          <>
            {/* 1 ── Profile boxes (name only → open student page) */}
            <section>
              <div className="flex flex-wrap gap-3">
                {familyLink.members.map((member, i) => (
                  <a
                    key={member.id}
                    href={memberUrl(member)}
                    className="group flex flex-col items-center gap-2 w-24 p-3 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-extrabold text-white" style={{ backgroundColor: PALETTE[i % PALETTE.length] }}>
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center leading-tight truncate w-full group-hover:text-teal-600 dark:group-hover:text-teal-400">
                      {member.name}
                    </span>
                  </a>
                ))}
              </div>
            </section>

            {/* 2 ── Attendance calendar */}
            {quranMembers.length > 0 && <AttendanceCalendar members={quranMembers} />}

            {/* 3 ── Comparison */}
            {quranMembers.length > 0 && (
              <section>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Compare progress</h2>
                  <div className="flex rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-1 shadow-sm">
                    {(['week', 'month', 'all'] as Timeframe[]).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`px-3.5 py-1 rounded-full text-xs font-bold capitalize transition-colors ${
                          timeframe === tf ? 'bg-teal-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        {tf === 'all' ? 'All time' : tf}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <BarCompare emoji="📝" title="Homework assigned" rows={rowsFor(m => m.homework)} />
                  <BarCompare emoji="🏆" title="Points scored" rows={rowsFor(m => m.points)} />
                  <BarCompare emoji="📖" title="Pages read" rows={rowsFor(m => m.pagesRead, pct)} />
                  <BarCompare emoji="🧠" title="Pages memorized" rows={rowsFor(m => m.pagesMemorized, pct)} />
                  <BarCompare emoji="✅" title="Days attended" rows={rowsFor(m => m.attended)} />
                  <BarCompare emoji="❌" title="Days absent" rows={rowsFor(m => m.absent)} />
                  <BarCompare emoji="🔁" title="Days rescheduled" rows={rowsFor(m => m.rescheduled)} />
                  <BarCompare emoji="⭐" title="Reading quality" rows={rowsFor(m => m.readingQuality, v => `${v.toFixed(1)}/10`)} />
                  <BarCompare emoji="🌟" title="Memorization quality" rows={rowsFor(m => m.memQuality, v => `${v.toFixed(1)}/10`)} />
                  <RankCompare emoji="🎯" title="Rank in age group" rows={quranMembers.map(m => ({ name: m.name, color: m.color, rank: metricsByMember[m.id].rankAge?.rank ?? 0, total: metricsByMember[m.id].rankAge?.total ?? 0 }))} />
                  <RankCompare emoji="🥇" title="Rank among all students" rows={quranMembers.map(m => ({ name: m.name, color: m.color, rank: metricsByMember[m.id].rankAll?.rank ?? 0, total: metricsByMember[m.id].rankAll?.total ?? 0 }))} />
                  <MistakesCompare rows={quranMembers.map(m => ({ name: m.name, color: m.color, reading: metricsByMember[m.id].mistakesReading, tajweed: metricsByMember[m.id].mistakesTajweed }))} />
                  <BarCompare emoji="🏅" title="Milestones achieved" rows={rowsFor(m => m.milestones)} />
                  <BarCompare emoji="🎓" title="Tajweed lessons completed" rows={rowsFor(m => m.tajweedLessons)} />
                  <BarCompare emoji="📚" title="Tafsir verses finished" rows={rowsFor(m => m.tafsirVerses)} />
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default FamilyLinkPage;
