// components/FamilyLinkPage.tsx
// ---------------------------------------------------------------------------
// No-login family portal — accessed via /family/<uuid>
// Order: profile boxes → attendance calendar → last-homework box →
//        leaderboard (points) → comparison table (timeframe-aware).
// All data comes from each member's shared report (no extra backend).
// ---------------------------------------------------------------------------

const SITE_URL = 'https://www.lisanquran.com';

import React, { useEffect, useMemo, useState } from 'react';
import { FamilyLink, FamilyMember, getFamilyLinkById } from '../services/familyLinkService';
import { getSharedReport, getPageOfAyah, computeMistakesRate, calculateVersesAndPages } from '../services/dataService';
import { MILESTONES, TOTAL_QURAN_PAGES, QURAN_METADATA, POINTS_PER_WORD } from '../constants';
import LottieIcon from './LottieIcon';
import StudentProfileIcon from './StudentProfileIcon';
import { MILESTONE_LOTTIE } from './MilestoneBadge';
import Logo from './Logo';

interface Props { linkId: string }

type Timeframe = 'month' | 'week' | 'all';

const PALETTE = ['#0d9488', '#0284c7', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#ca8a04', '#dc2626'];
const TOTAL_QURAN_VERSES = 6236;

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isStatus = (s: unknown, v: string) => String(s ?? '').toLowerCase() === v;
const surahName = (n: number) => QURAN_METADATA.find(s => s.number === n)?.transliteratedName ?? `Surah ${n}`;

function inTimeframe(dateStr: string | undefined, tf: Timeframe, now: Date): boolean {
  if (tf === 'all') return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  if (tf === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
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

function fmtHomework(hw: any): string {
  if (!hw) return '';
  if (hw.startSurah === hw.endSurah) {
    return hw.startAyah === hw.endAyah
      ? `${surahName(hw.startSurah)} ${hw.startAyah}`
      : `${surahName(hw.startSurah)} ${hw.startAyah}-${hw.endAyah}`;
  }
  return `${surahName(hw.startSurah)} ${hw.startAyah} → ${surahName(hw.endSurah)} ${hw.endAyah}`;
}

interface Metrics {
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
  mistakesRate: number;
  achievedMilestoneIds: string[];
  tajweedLessonNames: string[];
  tafsirVerses: number;
  homeworks: { range: string; note: string; isDone: boolean; date: string }[];
}

function computeMetrics(rd: any, tf: Timeframe, now: Date): Metrics {
  const sp = rd?.studentProgress ?? {};
  const rec = sp.recitationAchievements ?? [];
  const mem = sp.memorizationAchievements ?? [];
  const recTF = rec.filter((a: any) => inTimeframe(a.date, tf, now));
  const memTF = mem.filter((a: any) => inTimeframe(a.date, tf, now));
  const att = (sp.attendance ?? []).filter((a: any) => inTimeframe(a.date, tf, now));
  const taf = (sp.tafsirReviews ?? []).filter((a: any) => inTimeframe(a.date, tf, now));
  const tjw = (sp.tajweedCompletions ?? []); // tajweed lessons: all-time

  const memPagesTF = pagesFromAchs(memTF);
  const readPagesTF = new Set<number>([...pagesFromAchs(recTF), ...memPagesTF]);
  const readPagesAll = new Set<number>([...pagesFromAchs(rec), ...pagesFromAchs(mem)]);

  const readQ = [...recTF.map((a: any) => a.readingQuality), ...memTF.map((a: any) => a.memorizationQuality)];
  const avgReadQ = readQ.length ? readQ.reduce((s: number, q: number) => s + q, 0) / readQ.length : 0;
  const avgMemQ = memTF.length ? memTF.reduce((s: number, a: any) => s + a.memorizationQuality, 0) / memTF.length : 0;

  // "Attended" = explicit PRESENT records + implicit present (any day with an
  // achievement and no explicit record), matching the tutor's student-detail page.
  const allExplicitDays = new Set((sp.attendance ?? []).map((a: any) => new Date(a.date).toDateString()));
  const explicitPresent = att.filter((a: any) => isStatus(a.status, 'present')).length;
  const implicitDays = new Set<string>();
  [...recTF, ...memTF].forEach((a: any) => {
    const ds = new Date(a.date).toDateString();
    if (!allExplicitDays.has(ds)) implicitDays.add(ds);
  });
  const attended = explicitPresent + implicitDays.size;

  // All assigned homework, newest first — independent of timeframe.
  const allHw = [...(rd?.quranHomework ?? [])].sort((a, b) => new Date(b.assignedAt || 0).getTime() - new Date(a.assignedAt || 0).getTime());
  const homeworks = allHw.map((hw: any) => ({
    range: fmtHomework(hw),
    note: hw.note ?? '',
    isDone: !!hw.isDone,
    date: hw.assignedAt ?? '',
  }));

  return {
    points: [...recTF, ...memTF].reduce((s: number, a: any) => s + (a.pointsEarned ?? ((a.versesCompleted ?? 0) * 15 * POINTS_PER_WORD)), 0),
    pagesRead: readPagesTF.size,
    pagesMemorized: memPagesTF.size,
    attended,
    absent: att.filter((a: any) => isStatus(a.status, 'absent')).length,
    rescheduled: att.filter((a: any) => isStatus(a.status, 'rescheduled')).length,
    readingQuality: avgReadQ,
    memQuality: avgMemQ,
    rankAge: rd?.ranks ? { rank: rd.ranks.readingRank, total: rd.ranks.readingTotal } : null,
    rankAll: rd?.ranks ? { rank: rd.ranks.overallReadingRank, total: rd.ranks.overallReadingTotal } : null,
    // Per-page mistakes rate — same as the tutor's student card (all-time).
    mistakesRate: computeMistakesRate(rec, rd?.mistakes ?? {}, mem),
    achievedMilestoneIds: MILESTONES.filter(m => m.isAchieved(readPagesAll)).map(m => m.id), // all-time
    tajweedLessonNames: tjw.map((t: any) => t.lessonTitle || t.lessonId).filter(Boolean),
    // Actual tafsir verses from each review's ayah range (not whole surahs).
    tafsirVerses: taf.reduce((sum: number, r: any) => {
      const ss = r.startSurah ?? r.surah, es = r.endSurah ?? r.surah;
      if (ss && r.startAyah != null && es && r.endAyah != null) {
        try { return sum + calculateVersesAndPages(ss, r.startAyah, es, r.endAyah).verses; } catch { return sum + 1; }
      }
      return sum + 1;
    }, 0),
    homeworks,
  };
}

// ── Attendance calendar ───────────────────────────────────────────────────────
const AttendanceCalendar: React.FC<{ members: { id: string; name: string; color: string; report: any }[] }> = ({ members }) => {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  const attendeesByDay = useMemo(() => {
    const map: Record<string, { name: string; color: string }[]> = {};
    const add = (key: string, name: string, color: string) => {
      const arr = (map[key] ??= []);
      if (!arr.some(p => p.name === name)) arr.push({ name, color });
    };
    members.forEach(m => {
      const sp = m.report?.studentProgress ?? {};
      // explicit records: remember every day with a record + which are PRESENT
      const explicit = new Map<string, string>();
      (sp.attendance ?? []).forEach((a: any) => {
        if (!a.date) return;
        const key = dayKey(new Date(a.date));
        explicit.set(key, String(a.status).toLowerCase());
        if (isStatus(a.status, 'present')) add(key, m.name, m.color);
      });
      // implicit present: any achievement day without an explicit record
      [...(sp.recitationAchievements ?? []), ...(sp.memorizationAchievements ?? [])].forEach((a: any) => {
        if (!a.date) return;
        const key = dayKey(new Date(a.date));
        if (!explicit.has(key)) add(key, m.name, m.color);
      });
    });
    return map;
  }, [members]);

  const year = month.getFullYear();
  const m = month.getMonth();
  const startWeekday = (new Date(year, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (delta: number) => setMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + delta); return d; });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm max-w-3xl mx-auto w-full">
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
                <span key={idx} className="text-[7px] sm:text-[9px] leading-tight font-bold text-white rounded px-0.5 sm:px-1 py-0.5 truncate" style={{ backgroundColor: p.color }} title={p.name}>{p.name}</span>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">This family link is invalid or has been removed. Ask your teacher for a fresh link.</p>
        </div>
      </div>
    );
  }

  const backPath = encodeURIComponent(`/family/${linkId}`);
  const memberUrl = (member: FamilyMember) => member.type === 'quran'
    ? `${SITE_URL}/report/${member.report_id}?from=${backPath}`
    : `${SITE_URL}/arabic/s/${member.share_token}?from=${backPath}`;

  const quranMembers = familyLink.members
    .filter(m => m.type === 'quran')
    .map((m, i) => ({ id: m.id, name: m.name, color: PALETTE[i % PALETTE.length], report: reports[m.id], profileIcon: reports[m.id]?.profileIcon as string | undefined }));

  const now = new Date();
  const metricsByMember: Record<string, Metrics> = {};
  quranMembers.forEach(m => { metricsByMember[m.id] = computeMetrics(m.report, timeframe, now); });

  const leaderboard = [...quranMembers].sort((a, b) => metricsByMember[b.id].points - metricsByMember[a.id].points);
  const medal = ['🥇', '🥈', '🥉'];

  // number with a percentage on a second line (smaller, coloured).
  const numPct = (value: number, total: number, color: string) => (
    <div className="flex flex-col items-center leading-tight">
      <span>{value}</span>
      <span className={`text-xs font-bold ${color}`}>{total ? Math.round((value / total) * 100) : 0}%</span>
    </div>
  );

  // Comparison table rows.
  const cell = (m: typeof quranMembers[number], render: (mx: Metrics) => React.ReactNode) => render(metricsByMember[m.id]);
  const rows: { label: string; render: (m: typeof quranMembers[number]) => React.ReactNode }[] = [
    { label: 'Pages read', render: m => cell(m, x => numPct(x.pagesRead, TOTAL_QURAN_PAGES, 'text-teal-500 dark:text-teal-400')) },
    { label: 'Pages memorized', render: m => cell(m, x => numPct(x.pagesMemorized, TOTAL_QURAN_PAGES, 'text-sky-500 dark:text-sky-400')) },
    { label: 'Days attended', render: m => cell(m, x => x.attended) },
    { label: 'Days absent', render: m => cell(m, x => x.absent) },
    { label: 'Days rescheduled', render: m => cell(m, x => x.rescheduled) },
    { label: 'Reading quality', render: m => cell(m, x => x.readingQuality.toFixed(1)) },
    { label: 'Memorization quality', render: m => cell(m, x => x.memQuality.toFixed(1)) },
    { label: 'Rank in age group', render: m => cell(m, x => x.rankAge?.rank ? `#${x.rankAge.rank} of ${x.rankAge.total}` : '—') },
    { label: 'Rank among all students', render: m => cell(m, x => x.rankAll?.rank ? `#${x.rankAll.rank} of ${x.rankAll.total}` : '—') },
    { label: 'Mistakes rate', render: m => cell(m, x => <span>{x.mistakesRate}<span className="text-xs font-semibold text-slate-400"> /pg</span></span>) },
    { label: 'Milestones', render: m => cell(m, x => (
      x.achievedMilestoneIds.length === 0 ? <span className="text-slate-300">—</span> : (
        <div className="flex items-center justify-center gap-1 flex-wrap">
          {x.achievedMilestoneIds.map(id => MILESTONE_LOTTIE[id]
            ? <LottieIcon key={id} src={MILESTONE_LOTTIE[id]} size={26} loop autoplay playOnHover={false} />
            : <span key={id} className="text-base" title={id}>🎓</span>)}
        </div>
      )
    )) },
    { label: 'Tajweed lessons', render: m => cell(m, x => (
      x.tajweedLessonNames.length === 0 ? <span className="text-slate-300">—</span> : (
        <div className="flex flex-col items-center gap-1">
          {x.tajweedLessonNames.map((n, i) => (
            <span key={i} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 whitespace-nowrap">{n}</span>
          ))}
        </div>
      )
    )) },
    { label: 'Tafsir verses', render: m => cell(m, x => numPct(x.tafsirVerses, TOTAL_QURAN_VERSES, 'text-blue-500 dark:text-blue-400')) },
  ];

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
            {/* 1 ── Profile boxes (centered) */}
            <section className="flex flex-wrap justify-center gap-3">
              {familyLink.members.map((member, i) => (
                <a key={member.id} href={memberUrl(member)}
                  className="group flex flex-col items-center gap-2 w-36 p-3 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                  {reports[member.id]?.profileIcon ? (
                    <div className="w-24 h-24 flex items-center justify-center"><StudentProfileIcon src={reports[member.id].profileIcon} size={96} mode="always" /></div>
                  ) : (
                    <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-extrabold text-white" style={{ backgroundColor: PALETTE[i % PALETTE.length] }}>
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 text-center leading-tight truncate w-full group-hover:text-teal-600 dark:group-hover:text-teal-400">{member.name}</span>
                </a>
              ))}
            </section>

            {/* 2 ── Attendance calendar */}
            {quranMembers.length > 0 && <AttendanceCalendar members={quranMembers} />}

            {/* 3 ── Assigned homework (all, not time-framed) */}
            {quranMembers.length > 0 && (
              <section className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-2">📝 Homework assigned</h2>
                <div className="divide-y divide-slate-100 dark:divide-gray-700">
                  {quranMembers.map(m => {
                    const list = metricsByMember[m.id].homeworks;
                    return (
                      <div key={m.id} className="flex items-start gap-3 py-3">
                        <span className="flex items-center gap-2 w-32 flex-shrink-0 pt-0.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{m.name}</span>
                        </span>
                        <div className="flex-1 min-w-0 space-y-2">
                          {list.length > 0 ? (
                            list.map((hw, i) => (
                              <div key={i}>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`text-base font-semibold ${hw.isDone ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-violet-700 dark:text-violet-300'}`}>{hw.range}</p>
                                  {hw.isDone && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">✓ Done</span>}
                                  {hw.date && <span className="text-[10px] text-slate-400">{new Date(hw.date).toLocaleDateString()}</span>}
                                </div>
                                {hw.note && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">{hw.note}</p>}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400 italic">No homework assigned.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Timeframe selector */}
            {quranMembers.length > 0 && (
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Compare progress</h2>
                <div className="flex rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-1 shadow-sm">
                  {(['week', 'month', 'all'] as Timeframe[]).map(tf => (
                    <button key={tf} onClick={() => setTimeframe(tf)}
                      className={`px-3.5 py-1 rounded-full text-xs font-bold capitalize transition-colors ${timeframe === tf ? 'bg-teal-600 text-white shadow' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                      {tf === 'all' ? 'All time' : tf}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 4 ── Leaderboard */}
            {quranMembers.length > 0 && (
              <section className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 shadow-sm">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">🏆 Leaderboard</h2>
                <div className="space-y-2">
                  {leaderboard.map((m, i) => (
                    <div key={m.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${i === 0 ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-slate-50 dark:bg-gray-700/40'}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl w-7 text-center flex-shrink-0">{medal[i] ?? <span className="text-sm font-bold text-slate-400">{i + 1}</span>}</span>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.color }} />
                        <StudentProfileIcon src={m.profileIcon} size={48} mode="always" />
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{m.name}</span>
                      </div>
                      <span className="flex items-baseline gap-1 flex-shrink-0">
                        <span className="text-lg sm:text-3xl font-extrabold text-teal-600 dark:text-teal-400">{metricsByMember[m.id].points.toFixed(1)}</span>
                        <span className="text-xs font-semibold text-slate-400">pts</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 5 ── Comparison table */}
            {quranMembers.length > 0 && (
              <section className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm overflow-x-auto">
                <table className="w-full text-base border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-gray-700">
                      <th className="text-left font-bold text-slate-500 dark:text-slate-400 px-4 py-3 sticky left-0 bg-white dark:bg-gray-800 z-10">Metric</th>
                      {quranMembers.map(m => (
                        <th key={m.id} className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          <span className="flex items-center justify-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: m.color }} />{m.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={row.label} className={ri % 2 ? 'bg-slate-50/60 dark:bg-gray-700/20' : ''}>
                        <td className={`text-left font-semibold text-slate-600 dark:text-slate-300 px-4 py-3 sticky left-0 z-10 whitespace-nowrap ${ri % 2 ? 'bg-[#f7f9fa] dark:bg-[#1f2733]' : 'bg-white dark:bg-gray-800'}`}>{row.label}</td>
                        {quranMembers.map(m => (
                          <td key={m.id} className="px-5 py-4 text-center font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">{row.render(m)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default FamilyLinkPage;
