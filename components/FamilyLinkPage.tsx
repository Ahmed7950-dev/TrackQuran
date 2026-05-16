// components/FamilyLinkPage.tsx
// ---------------------------------------------------------------------------
// No-login family portal — accessed via /family/<uuid>
// Parents see all their children's progress in one place.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { FamilyLink, FamilyMember, getFamilyLinkById } from '../services/familyLinkService';
import { getSharedReport } from '../services/dataService';
import { getStudentByShareToken } from '../services/arabicService';
import { getCustomVocabWordCount } from '../services/vocabularyService';
import Logo from './Logo';

interface Props {
  linkId: string;
}

// ── Per-member stats loaded asynchronously ────────────────────────────────────
interface QuranStats {
  pagesRecited: number;
  pagesMemorized: number;
  mistakeCount: number;
  lastDate: string | null;
}

interface ArabicStats {
  lessonsCompleted: number;
  totalLessons: number;
  arabicLevel: number | null;
  vocabCount: number;
}

type MemberStats = { type: 'quran'; data: QuranStats } | { type: 'arabic'; data: ArabicStats } | { type: 'loading' } | { type: 'error' };

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadQuranStats(reportId: string): Promise<QuranStats> {
  const report = await getSharedReport(reportId);
  if (!report) throw new Error('Report not found');
  const sp = report.report_data.studentProgress;
  const pagesRecited = (sp?.recitationAchievements ?? []).reduce((s, a) => s + (a.pagesCompleted ?? 0), 0);
  const pagesMemorized = (sp?.memorizationAchievements ?? []).reduce((s, a) => s + (a.pagesCompleted ?? 0), 0);
  const mistakeCount = Object.keys(report.report_data.mistakes ?? {}).length;
  const allDates = [
    ...(sp?.recitationAchievements ?? []).map(a => a.date),
    ...(sp?.memorizationAchievements ?? []).map(a => a.date),
  ].sort().reverse();
  const lastDate = allDates[0] ? new Date(allDates[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return { pagesRecited, pagesMemorized, mistakeCount, lastDate };
}

async function loadArabicStats(shareToken: string): Promise<ArabicStats> {
  const student = await getStudentByShareToken(shareToken);
  if (!student) throw new Error('Student not found');
  const vocabCount = await getCustomVocabWordCount(student.id);
  return {
    lessonsCompleted: student.completedLessonIds.length,
    totalLessons: 60,
    arabicLevel: student.arabicLevel ?? null,
    vocabCount,
  };
}

// ── Member card ───────────────────────────────────────────────────────────────

const QuranCardStats: React.FC<{ stats: QuranStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 gap-3 mt-4">
    <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3 text-center">
      <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">{stats.pagesRecited}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pages recited</p>
    </div>
    <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-3 text-center">
      <p className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">{stats.pagesMemorized}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pages memorized</p>
    </div>
    <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-3 text-center">
      <p className="text-2xl font-extrabold text-rose-500 dark:text-rose-400">{stats.mistakeCount}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Active mistakes</p>
    </div>
    {stats.lastDate && (
      <div className="bg-slate-50 dark:bg-gray-700 rounded-xl p-3 text-center">
        <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-tight">{stats.lastDate}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Last session</p>
      </div>
    )}
  </div>
);

const ArabicCardStats: React.FC<{ stats: ArabicStats }> = ({ stats }) => (
  <div className="grid grid-cols-2 gap-3 mt-4">
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
      <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{stats.lessonsCompleted}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">of {stats.totalLessons} lessons</p>
    </div>
    {stats.arabicLevel !== null && (
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-center">
        <p className="text-2xl font-extrabold text-orange-600 dark:text-orange-400">{stats.arabicLevel}<span className="text-sm font-semibold text-orange-400">/10</span></p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Arabic level</p>
      </div>
    )}
    {stats.vocabCount > 0 && (
      <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-3 text-center col-span-2 sm:col-span-1">
        <p className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">{stats.vocabCount.toLocaleString()}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Vocab words</p>
      </div>
    )}
  </div>
);

const MemberCard: React.FC<{ member: FamilyMember }> = ({ member }) => {
  const [stats, setStats] = useState<MemberStats>({ type: 'loading' });

  useEffect(() => {
    if (member.type === 'quran' && member.report_id) {
      loadQuranStats(member.report_id)
        .then(data => setStats({ type: 'quran', data }))
        .catch(() => setStats({ type: 'error' }));
    } else if (member.type === 'arabic' && member.share_token) {
      loadArabicStats(member.share_token)
        .then(data => setStats({ type: 'arabic', data }))
        .catch(() => setStats({ type: 'error' }));
    } else {
      setStats({ type: 'error' });
    }
  }, [member]);

  const viewUrl = member.type === 'quran'
    ? `${window.location.origin}/report/${member.report_id}`
    : `${window.location.origin}/arabic/s/${member.share_token}`;

  const typeLabel = member.type === 'quran' ? 'Quran' : 'Arabic';
  const typeBg = member.type === 'quran'
    ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6 flex flex-col">
      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-2">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-extrabold flex-shrink-0 ${
          member.type === 'quran'
            ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
            : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
        }`}>
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 truncate">{member.name}</h2>
          <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${typeBg}`}>
            {typeLabel} Student
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex-1">
        {stats.type === 'loading' && (
          <div className="flex items-center justify-center h-24 text-slate-400 dark:text-slate-500">
            <div className="w-6 h-6 rounded-full border-2 border-current border-t-transparent animate-spin" />
          </div>
        )}
        {stats.type === 'error' && (
          <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center mt-4">Could not load stats</p>
        )}
        {stats.type === 'quran' && <QuranCardStats stats={stats.data} />}
        {stats.type === 'arabic' && <ArabicCardStats stats={stats.data} />}
      </div>

      {/* View full progress button */}
      <a
        href={viewUrl}
        className={`mt-5 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
          member.type === 'quran'
            ? 'bg-teal-600 hover:bg-teal-700 text-white dark:bg-teal-700 dark:hover:bg-teal-600'
            : 'bg-amber-500 hover:bg-amber-600 text-white dark:bg-amber-600 dark:hover:bg-amber-500'
        }`}
      >
        View {member.name}'s Full Progress
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      </a>
    </div>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const FamilyLinkPage: React.FC<Props> = ({ linkId }) => {
  const [familyLink, setFamilyLink] = useState<FamilyLink | null | 'loading'>('loading');

  useEffect(() => {
    document.title = 'Family Progress';
    getFamilyLinkById(linkId).then(link => setFamilyLink(link));
    return () => { document.title = 'LisanQuran'; };
  }, [linkId]);

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

  const quranCount = familyLink.members.filter(m => m.type === 'quran').length;
  const arabicCount = familyLink.members.filter(m => m.type === 'arabic').length;

  return (
    <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <Logo />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 truncate">
              👨‍👩‍👧‍👦 {familyLink.name}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {familyLink.members.length} {familyLink.members.length === 1 ? 'child' : 'children'}
              {quranCount > 0 && ` · ${quranCount} Quran`}
              {arabicCount > 0 && ` · ${arabicCount} Arabic`}
              {' '}· Progress shared by their teacher
            </p>
          </div>
        </div>
      </header>

      {/* Member cards */}
      <main className="container mx-auto flex-grow px-4 sm:px-6 lg:px-8 py-8">
        {familyLink.members.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-4xl mb-3">👶</p>
            <p className="text-lg font-semibold">No children added yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {familyLink.members.map(member => (
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default FamilyLinkPage;
