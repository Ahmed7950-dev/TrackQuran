import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Student, SortCriteria, SurahMetadata, AttendanceStatus, AgeCategory } from '../types';
import { getBirthdayStatus, safeCopy } from '../utils';
import { getRecitedPagesSet, getMemorizedPagesSet, getPageOfAyah, createOrUpdateSharedReport, getStudentReportId } from '../services/dataService';
import { MILESTONES, TOTAL_QURAN_PAGES, MISTAKE_PENALTY_POINTS } from '../constants';
import { computeReportRanks } from '../services/rankingService';
import { getSessionsListByGcalId, updateSessionMeetUrl, getLinkedStudentIds, getFamilyLinkIdForStudent } from '../services/lessonSessionService';
import { getPortalTokenForStudent } from '../services/portalPairService';
import { createGoogleMeetLink, fetchGCalEvents, getStoredToken } from '../services/googleCalendarService';
import MilestoneBadge from './MilestoneBadge';
import { useI18n } from '../context/I18nProvider';
import HonorBoardModal from './HonorBoardModal';

/** Format a lesson date as "Today · 6:00 PM", "Tomorrow · 6:00 PM", or "Mon 23 May · 6:00 PM" */
const formatSessionDate = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lessonDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((lessonDay.getTime() - today.getTime()) / 86400000);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 0) return `Today · ${time}`;
  if (diffDays === 1) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
};

/** Returns days since last activity, or null if the student has no records at all. */
const getDaysSinceLastActivity = (s: Student): number | null => {
  const allDates = [
    ...s.recitationAchievements.map(a => new Date(a.date).getTime()),
    ...s.memorizationAchievements.map(a => new Date(a.date).getTime()),
    ...s.attendance.map(a => new Date(a.date).getTime()),
  ];
  if (allDates.length === 0) return null;
  const lastActivityTime = Math.max(...allDates);
  return Math.ceil(Math.abs(Date.now() - lastActivityTime) / (1000 * 60 * 60 * 24));
};

/** Returns age in years, or null if no dob is available. */
const getAge = (dob?: string): number | null => {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Unified score calculation
const calculateScore = (student: Student): number => {
    // Memorized pages count as read too (hifz implies reading).
    const recitedPages = new Set([...getRecitedPagesSet(student), ...getMemorizedPagesSet(student)]);
    const grossScore = (recitedPages.size / TOTAL_QURAN_PAGES) * 1_000_000;

    const validMistakes = Object.keys(student.mistakes || {}).filter(key => {
        const [surah, ayah] = key.split(':').map(Number);
        if (isNaN(surah) || isNaN(ayah)) return false;
        
        const pageOfMistake = getPageOfAyah(surah, ayah);
        return recitedPages.has(pageOfMistake);
    });

    const mistakePenalty = validMistakes.length * MISTAKE_PENALTY_POINTS;
    
    const avgQuality = student.recitationAchievements.length > 0 
        ? student.recitationAchievements.reduce((sum, ach) => sum + (ach.readingQuality + ach.tajweedQuality) / 2, 0) / student.recitationAchievements.length
        : 7.5; // Assume average quality (baseline) if no achievements logged

    // Quality factor makes 7.5/10 quality the 1x baseline. Higher is better, lower is worse.
    const qualityFactor = avgQuality / 7.5; 

    const qualityAdjustedScore = grossScore * qualityFactor;

    return Math.max(0, qualityAdjustedScore - mistakePenalty);
};

const BirthdayBanner: React.FC<{ dob: string, name: string }> = ({ dob, name }) => {
    const { t } = useI18n();
    const status = getBirthdayStatus(dob);
    if (status === 'NONE') return null;

    const firstName = name.split(' ')[0];
    const message = status === 'TODAY'
        ? t('studentCard.happyBirthday', { name: firstName })
        : t('studentCard.happyBirthdayTomorrow', { name: firstName });
        
    const colors = status === 'TODAY'
        ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
        : 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300';

    const icon = <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" /><path d="M2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" /></svg>;

    return (
        <div className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold ${colors}`}>
            {icon}
            <span>{message}</span>
        </div>
    );
};


const RANK_CONFIG: Record<1 | 2 | 3, { emoji: string; short: string; badge: string }> = {
  1: { emoji: '🥇', short: '1st', badge: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-300 dark:ring-yellow-700' },
  2: { emoji: '🥈', short: '2nd', badge: 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600' },
  3: { emoji: '🥉', short: '3rd', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 ring-1 ring-orange-300 dark:ring-orange-700' },
};

const StudentCard: React.FC<{ student: Student; onSelect: () => void; quranMetadata: SurahMetadata[]; viewMode: 'points' | 'mistakesRate'; rank?: 1 | 2 | 3 | null; teacherId?: string; allStudents: Student[]; isNext?: boolean; isLinked?: boolean }> = ({ student, onSelect, quranMetadata, viewMode, rank, teacherId, allStudents, isNext, isLinked }) => {
    const { t, language } = useI18n();

    // ── Share link ────────────────────────────────────────────────────────────
    const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>('idle');
    const [shareLink, setShareLink] = useState<string | null>(null);

    const handleShare = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation(); // don't open student detail page
        if (!teacherId || shareState === 'loading') return;
        setShareState('loading');
        try {
            const reportId = await createOrUpdateSharedReport(teacherId, student.id, student.name, {
                studentName: student.name,
                generatedAt: new Date().toISOString(),
                mistakes: student.mistakes || {},
                // omit verses/homeworkVerses — merged, so the auto-sync's verse text
                // and homework are preserved rather than wiped.
                quranHomework: student.quranHomework || [],
                ranks: computeReportRanks(student, allStudents),
                quranicFont: localStorage.getItem('quranicFont') || 'Hafs',
                studentProgress: {
                    recitationAchievements: student.recitationAchievements || [],
                    memorizationAchievements: student.memorizationAchievements || [],
                    attendance: student.attendance || [],
                    masteredTajweedRules: student.masteredTajweedRules || [],
                    dob: student.dob,
                    tafsirReviews: student.tafsirReviews || [],
                    tafsirMemorizationReviews: student.tafsirMemorizationReviews || [],
                },
            });
            if (reportId) {
                // Prefer the unified links: a same-person Quran+Arabic pair, then
                // a calendar-created family, else the Quran-only report link.
                const pairToken = await getPortalTokenForStudent('quran', student.id);
                const familyId  = pairToken ? null : await getFamilyLinkIdForStudent(student.id);
                const link = pairToken
                  ? `${window.location.origin}/portal/${pairToken}`
                  : familyId
                  ? `${window.location.origin}/family/${familyId}`
                  : `${window.location.origin}/report/${reportId}`;
                setShareLink(link);
                await safeCopy(link);
                setShareState('copied');
                setTimeout(() => setShareState('idle'), 3000);
            } else {
                setShareState('idle');
            }
        } catch {
            setShareState('idle');
        }
    }, [teacherId, student, shareState]);

    const { isInactive, daysSinceLastActivity } = useMemo(() => {
        const days = getDaysSinceLastActivity(student);
        return { isInactive: days !== null && days > 14, daysSinceLastActivity: days };
    }, [student]);

    // Get page counts
    const totalPagesRead = getRecitedPagesSet(student).size;
    const totalPagesMemorized = getMemorizedPagesSet(student).size;

    // Calculate score
    const score = calculateScore(student);

    // Mistake rate calculations (for mistakesRate view mode)
    const recitedPagesForMistakes = getRecitedPagesSet(student);
    const validMistakeEntries = Object.entries(student.mistakes || {}).filter(([key]) => {
      const [surah, ayah] = key.split(':').map(Number);
      if (isNaN(surah) || isNaN(ayah)) return false;
      return recitedPagesForMistakes.has(getPageOfAyah(surah, ayah));
    });
    const readingMistakesCount = validMistakeEntries.filter(([, m]) => !m.errorType || m.errorType === 'reading').length;
    const tajweedMistakesCount = validMistakeEntries.filter(([, m]) => m.errorType === 'tajweed').length;
    const mistakePages = recitedPagesForMistakes.size;
    const readingRate = mistakePages > 0 ? readingMistakesCount / mistakePages : 0;
    const tajweedRate = mistakePages > 0 ? tajweedMistakesCount / mistakePages : 0;

    // ── Trend: compare the cumulative displayed rate NOW vs BEFORE the last session ──
    // This ensures the arrow always matches the direction of the displayed err/pg number.
    // We identify mistakes dated to the most recent session and subtract them to get
    // the "before" state, then compare overall rates.
    const mistakeRateTrend = useMemo((): { dir: 'better' | 'worse' | 'same'; readingDelta: number; tajweedDelta: number } | null => {
      const sessions = [...student.recitationAchievements]
        .filter(a => (a.pagesCompleted ?? 0) > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      if (sessions.length < 2) return null;

      // Compare the cumulative err/pg NOW vs. how it stood BEFORE the most recent
      // day of logging. The "before" state is computed by actually rebuilding the
      // student WITHOUT the latest day's sessions and recomputing the unique recited
      // page set — NOT by subtracting raw pagesCompleted from the unique-page count
      // (those two are different units and the mismatch could flip the arrow).
      const latestDayStart = new Date(new Date(sessions[0].date).toDateString()).getTime();
      const prevSessions = sessions.filter(s => new Date(s.date).getTime() < latestDayStart);
      if (prevSessions.length === 0) return null; // nothing before the latest day to compare against

      const recitedPages = getRecitedPagesSet(student);
      const nowPages = recitedPages.size; // total unique recited pages (matches the displayed rate)
      const prevRecitedPages = getRecitedPagesSet({ ...student, recitationAchievements: prevSessions });
      const prevPages = prevRecitedPages.size;
      if (prevPages === 0) return null;

      const allEntries = Object.entries(student.mistakes || {}) as [string, import('../types').Mistake][];
      const isReading = (m: import('../types').Mistake) => !m.errorType || m.errorType === 'reading';
      const isTajweed = (m: import('../types').Mistake) => m.errorType === 'tajweed';

      // NOW: every mistake on a recited page (this is exactly what the displayed rate uses).
      const nowValid = allEntries.filter(([key]) => {
        const [s, a] = key.split(':').map(Number);
        return !isNaN(s) && !isNaN(a) && recitedPages.has(getPageOfAyah(s, a));
      });
      const nowReading = nowValid.filter(([, m]) => isReading(m)).length;
      const nowTajweed = nowValid.filter(([, m]) => isTajweed(m)).length;

      // BEFORE: mistakes logged before the latest day (by timestamp), on pages recited by then.
      const prevValid = allEntries.filter(([key, m]) => {
        if (!m.date || new Date(m.date).getTime() >= latestDayStart) return false;
        const [s, a] = key.split(':').map(Number);
        return !isNaN(s) && !isNaN(a) && prevRecitedPages.has(getPageOfAyah(s, a));
      });
      const prevReading = prevValid.filter(([, m]) => isReading(m)).length;
      const prevTajweed = prevValid.filter(([, m]) => isTajweed(m)).length;

      // Current cumulative rates (= what is displayed)
      const nowReadingRate  = nowReading  / nowPages;
      const nowTajweedRate  = nowTajweed  / nowPages;

      // Rates as of the end of the previous day
      const prevReadingRate = prevReading / prevPages;
      const prevTajweedRate = prevTajweed / prevPages;

      const readingDelta = nowReadingRate  - prevReadingRate;
      const tajweedDelta = nowTajweedRate  - prevTajweedRate;
      const totalDelta   = readingDelta + tajweedDelta;

      const THRESHOLD = 0.04;
      const dir = Math.abs(totalDelta) < THRESHOLD ? 'same' : totalDelta < 0 ? 'better' : 'worse';

      return { dir, readingDelta, tajweedDelta };
    }, [student]);

    // Get milestone badges
    const achievedReadingMilestones = useMemo(() => {
        const pages = getRecitedPagesSet(student);
        return MILESTONES.filter(m => m.isAchieved(pages)).reverse();
    }, [student]);

    const achievedHifdhMilestones = useMemo(() => {
        const pages = getMemorizedPagesSet(student);
        return MILESTONES.filter(m => m.isAchieved(pages)).reverse();
    }, [student]);

    // Last achievement text for display
    const lastAchievement = student.recitationAchievements.length > 0
        ? [...student.recitationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
        : null;

    const lastAchievementText = lastAchievement
        ? `${quranMetadata.find(s => s.number === lastAchievement.endSurah)?.name} ${lastAchievement.endAyah}`
        : t('studentCard.noAchievements');
    const lastAchievementDate = lastAchievement
        ? new Date(lastAchievement.date).toLocaleDateString(language, { month: 'short', day: 'numeric' })
        : t('studentCard.notApplicable');

    return (
        <div
            onClick={onSelect}
            className={`
                relative rounded-xl shadow-sm transition-all cursor-pointer border overflow-hidden
                ${isNext
                    ? 'bg-white dark:bg-gray-800 border-amber-400 dark:border-amber-500 ring-2 ring-amber-300/50 dark:ring-amber-600/30 shadow-md hover:shadow-lg hover:scale-[1.02]'
                    : isInactive
                    ? 'bg-slate-100 dark:bg-gray-800/80 border-dashed border-slate-300 dark:border-gray-700 opacity-80 hover:opacity-100'
                    : 'bg-white dark:bg-gray-800 hover:shadow-lg hover:scale-[1.02] dark:border-gray-700'
                }
            `}
        >
            {isNext && (
              <div className="absolute -top-2.5 left-4 z-10 flex items-center gap-1 px-2.5 py-0.5 bg-amber-400 dark:bg-amber-500 rounded-full shadow-sm">
                <span className="text-xs">📅</span>
                <span className="text-xs font-bold text-white">Next lesson</span>
              </div>
            )}
            {/* Top Section */}
            <div className={`p-4 ${isInactive 
                ? 'bg-slate-50 dark:bg-gray-800/50' 
                : 'bg-gradient-to-br from-teal-50 to-orange-50 dark:from-gray-800 dark:to-slate-800/60'
            }`}>
                 <div className="flex justify-between items-start">
                    <div className="flex-grow">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`font-extrabold text-xl truncate ${isInactive ? 'text-slate-600 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{student.name}</h3>
                            {isLinked && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-[9px] font-bold rounded-full flex-shrink-0">
                                🔗 Linked
                              </span>
                            )}
                            {rank && (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${RANK_CONFIG[rank].badge}`}>
                                <span>{RANK_CONFIG[rank].emoji}</span>
                                <span>{RANK_CONFIG[rank].short}</span>
                              </span>
                            )}
                            {viewMode === 'points' ? (
                              <span className="text-xs font-mono bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full whitespace-nowrap">{Math.round(score).toLocaleString()} pts</span>
                            ) : (
                              <span className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs font-semibold bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  {(readingRate + tajweedRate).toFixed(2)} err/pg
                                </span>
                                {mistakeRateTrend && mistakeRateTrend.dir !== 'same' && (
                                  <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
                                    mistakeRateTrend.dir === 'better'
                                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                                      : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                                  }`}>
                                    {mistakeRateTrend.dir === 'better'
                                      ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" /></svg>
                                      : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" /></svg>
                                    }
                                    {mistakeRateTrend.dir === 'better' ? 'Improving' : 'Higher'}
                                  </span>
                                )}
                                {mistakeRateTrend && mistakeRateTrend.dir === 'same' && (
                                  <span className="inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M2.75 8a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 2.75 8Z" clipRule="evenodd" /></svg>
                                    Steady
                                  </span>
                                )}
                              </span>
                            )}
                        </div>
                        {getAge(student.dob) !== null
                          ? <p className="text-sm text-slate-600 dark:text-slate-400">{t('studentCard.yearsOld', { age: getAge(student.dob) })}</p>
                          : student.ageCategory && (
                              <p className="text-sm text-slate-500 dark:text-slate-400">
                                {student.ageCategory === 'young_gems' ? '⭐ Young Gems' : student.ageCategory === 'aspiring_scholars' ? '📚 Aspiring Scholars' : '🌿 Devoted Learners'}
                              </p>
                            )
                        }
                    </div>
                     <div className="flex items-center flex-shrink-0 gap-1.5 ml-2">
                        {achievedReadingMilestones.slice(0, 2).map(m => <MilestoneBadge key={`read-${m.id}`} milestone={m} type="reading" />)}
                        {achievedHifdhMilestones.slice(0, 2).map(m => <MilestoneBadge key={`hifdh-${m.id}`} milestone={m} type="memorization" />)}
                    </div>
                 </div>
            </div>
            
            {student.dob && <BirthdayBanner dob={student.dob} name={student.name} />}
            
            {/* Content Section */}
            <div className="px-4 py-2">
                {/* Main Stats */}
                {viewMode === 'points' ? (
                  <div className="flex justify-around items-center text-center">
                    <div className="flex items-baseline gap-1.5">
                        <p className={`text-xl font-bold ${isInactive ? 'text-slate-500 dark:text-slate-400' : 'text-teal-600 dark:text-orange-400'}`}>{totalPagesRead}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentCard.pagesRead')}</p>
                    </div>
                    <div className="h-6 w-px bg-slate-200 dark:bg-gray-700"></div>
                    <div className="flex items-baseline gap-1.5">
                        <p className={`text-xl font-bold ${isInactive ? 'text-slate-500 dark:text-slate-400' : 'text-sky-600 dark:text-sky-400'}`}>{totalPagesMemorized}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentCard.hifdhPages')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-around items-center text-center">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <p className={`text-xl font-bold ${readingRate === 0 ? 'text-emerald-500 dark:text-emerald-400' : readingRate < 0.5 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}`}>
                          {readingRate.toFixed(2)}
                        </p>
                        {mistakeRateTrend && (() => {
                          const d = mistakeRateTrend.readingDelta;
                          if (Math.abs(d) < 0.04) return null;
                          return d < 0
                            ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-emerald-500 flex-shrink-0"><path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" /></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-red-500 flex-shrink-0"><path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" /></svg>;
                        })()}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-tight">reading<br/>mistakes/pg</p>
                    </div>
                    <div className="h-6 w-px bg-slate-200 dark:bg-gray-700"></div>
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <p className={`text-xl font-bold ${tajweedRate === 0 ? 'text-emerald-500 dark:text-emerald-400' : tajweedRate < 0.5 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}`}>
                          {tajweedRate.toFixed(2)}
                        </p>
                        {mistakeRateTrend && (() => {
                          const d = mistakeRateTrend.tajweedDelta;
                          if (Math.abs(d) < 0.04) return null;
                          return d < 0
                            ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-emerald-500 flex-shrink-0"><path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v8.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.22 3.22V2.75A.75.75 0 0 1 8 2Z" clipRule="evenodd" /></svg>
                            : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-red-500 flex-shrink-0"><path fillRule="evenodd" d="M8 14a.75.75 0 0 1-.75-.75V4.56L4.03 7.78a.75.75 0 0 1-1.06-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06L8.75 4.56v8.69A.75.75 0 0 1 8 14Z" clipRule="evenodd" /></svg>;
                        })()}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-tight">tajweed<br/>mistakes/pg</p>
                    </div>
                    <div className="h-6 w-px bg-slate-200 dark:bg-gray-700"></div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-slate-600 dark:text-slate-300">{totalPagesRead}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentCard.pagesRead')}</p>
                    </div>
                  </div>
                )}
                
                {/* Last Achievement */}
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-gray-700">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('studentCard.lastRecitation')}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-semibold truncate">
                        {lastAchievementText} {lastAchievement ? t('studentCard.onDate', {date: lastAchievementDate}) : ''}
                    </p>
                </div>

                {/* Share student link */}
                {teacherId && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-gray-700">
                        <button
                            onClick={handleShare}
                            disabled={shareState === 'loading'}
                            className={`w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                shareState === 'copied'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300'
                            }`}
                            title="Copy student portal link"
                        >
                            {shareState === 'loading' ? (
                                <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                </svg>
                            ) : shareState === 'copied' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd"/>
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"/>
                                </svg>
                            )}
                            {shareState === 'loading' ? 'Generating…' : shareState === 'copied' ? 'Link Copied!' : 'Copy Student Link'}
                        </button>
                        {shareLink && shareState !== 'idle' && (
                            <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 truncate text-center">{shareLink}</p>
                        )}
                    </div>
                )}
            </div>
             {isInactive && (
                <div className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-xs font-semibold p-2 flex items-center justify-center">
                    <span>{t('studentCard.inactiveWarning', { days: daysSinceLastActivity })}</span>
                </div>
            )}
        </div>
    );
};

interface DashboardProps {
  students: Student[];
  onSelectStudent: (studentId: string) => void;
  quranMetadata: SurahMetadata[];
  onFamilyLinks?: () => void;
  onAddStudent: () => void;
  teacherId?: string;
  onApproveStudent?: (studentId: string) => void;
  onRejectStudent?: (studentId: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ students, onSelectStudent, quranMetadata, onFamilyLinks, onAddStudent, teacherId, onApproveStudent, onRejectStudent }) => {
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>(SortCriteria.HighestPoints);
  const [viewMode, setViewMode] = useState<'points' | 'mistakesRate'>('points');
  const [searchQuery, setSearchQuery] = useState('');
  const [isHonorBoardOpen, setIsHonorBoardOpen] = useState(false);
  const { t } = useI18n();

  // ── Upcoming linked-lesson banner + Google Meet ──
  // Derived from the LIVE Google Calendar events (not the stored session rows),
  // so a lesson the tutor cancels or reschedules on the calendar is reflected
  // here too: cancelled events disappear from the fetch, and rescheduled events
  // bring their new time. The linked-session map only resolves which student an
  // event belongs to and supplies the Meet URL.
  type NextLesson = { date: Date; student: Student; meetUrl?: string; sessionId?: string; title?: string };
  const [nextLesson, setNextLesson] = useState<NextLesson | null>(null);
  const [meetGenerating, setMeetGenerating] = useState(false);
  const [meetCopied, setMeetCopied] = useState(false);

  useEffect(() => {
    if (!teacherId) { setNextLesson(null); return; }
    const token = getStoredToken();
    if (!token) { setNextLesson(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const max = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // next 60 days
        const [events, sessionMap] = await Promise.all([
          fetchGCalEvents(token, now, max),
          getSessionsListByGcalId(teacherId),
        ]);
        if (cancelled) return;
        let best: NextLesson | null = null;
        for (const ev of events) {
          const startStr = ev.start.dateTime ?? ev.start.date;
          if (!startStr) continue;
          const d = new Date(startStr);
          if (d <= now) continue;
          for (const session of sessionMap[ev.id] ?? []) {
            const student = students.find(s => s.id === session.studentId);
            if (!student) continue; // not a Quran student (Arabic sessions ignored)
            if (!best || d < best.date) {
              best = { date: d, student, meetUrl: session.meetUrl, sessionId: session.id, title: ev.summary };
            }
          }
        }
        setNextLesson(best);
      } catch (err) {
        if (!cancelled) { console.error('[Dashboard] next-lesson load failed:', err); setNextLesson(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [teacherId, students]);

  const highlightedStudentId = nextLesson?.student.id ?? null;

  // Linked badge: ALL students with any linked session (past or upcoming), not
  // just the upcoming `sessions` used for the next-lesson banner.
  const [linkedStudentIds, setLinkedStudentIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!teacherId) return;
    getLinkedStudentIds(teacherId).then(setLinkedStudentIds).catch(() => {});
  }, [teacherId]);

  async function handleGenerateMeetLink() {
    if (!nextLesson) return;
    setMeetGenerating(true);
    try {
      const url = await createGoogleMeetLink(nextLesson.student.name, nextLesson.date.toISOString());
      if (!url) { alert('Could not generate Meet link. Make sure Google Calendar is connected.'); return; }
      if (nextLesson.sessionId) {
        await updateSessionMeetUrl(nextLesson.sessionId, url);
        setNextLesson(prev => prev ? { ...prev, meetUrl: url } : prev);
      }
    } finally {
      setMeetGenerating(false);
    }
  }

  async function handleCopyMeetLink() {
    if (!nextLesson?.meetUrl) return;
    await safeCopy(nextLesson.meetUrl);
    setMeetCopied(true);
    setTimeout(() => setMeetCopied(false), 2500);
  }

  async function handleClearMeetLink() {
    if (!nextLesson?.sessionId) return;
    await updateSessionMeetUrl(nextLesson.sessionId, null);
    setNextLesson(prev => prev ? { ...prev, meetUrl: undefined } : prev);
  }

  // Self-registered students awaiting this tutor's confirmation.
  const pendingStudents = useMemo(
    () => students.filter(s => s.selfRegistered && s.approvalStatus === 'pending'),
    [students],
  );

  const sortedStudents = useMemo(() => {
    const filtered = students.filter(student =>
        student.name.toLowerCase().includes(searchQuery.toLowerCase())
        // Hide pending/rejected join requests from the normal roster.
        && (!student.approvalStatus || student.approvalStatus === 'active')
    );

    return [...filtered].sort((a, b) => {
      switch (sortCriteria) {
        case SortCriteria.MostMemorized:
          return getMemorizedPagesSet(b).size - getMemorizedPagesSet(a).size;
        case SortCriteria.HighestPoints:
          return calculateScore(b) - calculateScore(a);
        case SortCriteria.MostAttendance:
          return b.attendance.filter(att => att.status === AttendanceStatus.Present).length - a.attendance.filter(att => att.status === AttendanceStatus.Present).length;
        case SortCriteria.Name:
          return a.name.localeCompare(b.name);
        case SortCriteria.Age:
          return (getAge(a.dob) ?? 0) - (getAge(b.dob) ?? 0);
        case SortCriteria.FewestMistakes: {
          const getSortKey = (s: Student): number => {
            // Inactive students sink to the very bottom
            const days = getDaysSinceLastActivity(s);
            if (days !== null && days > 14) return 2e9;
            // Students with 0 pages read sit just above inactive
            const rp = getRecitedPagesSet(s);
            if (rp.size === 0) return 1e9;
            // Everyone else: sort ascending by mistakes-per-page
            const valid = Object.entries(s.mistakes || {}).filter(([key]) => {
              const [su, ay] = key.split(':').map(Number);
              return !isNaN(su) && !isNaN(ay) && rp.has(getPageOfAyah(su, ay));
            });
            return valid.length / rp.size;
          };
          return getSortKey(a) - getSortKey(b);
        }
        default:
          return 0;
      }
    });
  }, [students, sortCriteria, searchQuery]);

  /** Resolve the effective age category for a student. */
  const getEffectiveCategory = (s: Student): AgeCategory => {
    if (s.ageCategory) return s.ageCategory; // manual override always wins
    const age = getAge(s.dob);
    if (age === null) return 'young_gems'; // fallback
    if (age <= 15) return 'young_gems';
    if (age <= 35) return 'aspiring_scholars';
    return 'devoted_learners';
  };

  const studentGroups = useMemo(() => {
    const youngGems        = sortedStudents.filter(s => getEffectiveCategory(s) === 'young_gems');
    const aspiringScholars = sortedStudents.filter(s => getEffectiveCategory(s) === 'aspiring_scholars');
    const devotedLearners  = sortedStudents.filter(s => getEffectiveCategory(s) === 'devoted_learners');
    return { youngGems, aspiringScholars, devotedLearners };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedStudents]);

  return (
    <div>
      {/* ── Pending student join requests (self-registered) ─────────────────── */}
      {pendingStudents.length > 0 && (
        <div className="mb-6 rounded-2xl border border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 p-4">
          <p className="text-sm font-bold text-teal-800 dark:text-teal-200 mb-3 flex items-center gap-2">
            🙋 New student requests
            <span className="bg-teal-600 text-white text-xs font-bold rounded-full px-2 py-0.5">{pendingStudents.length}</span>
          </p>
          <div className="space-y-2">
            {pendingStudents.map(s => {
              const age = getAge(s.dob);
              return (
                <div key={s.id} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 px-3 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-700 dark:text-teal-300 font-bold flex-shrink-0">{s.name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 dark:text-slate-100 truncate">{s.name}{age != null ? ` (${age})` : ''}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                      {s.timezone ? s.timezone.split('/').pop()?.replace(/_/g, ' ') : ''}
                      {s.lessonsPerWeek != null ? ` · ${s.lessonsPerWeek}×/wk` : ''}
                      {s.quranLevel != null ? ` · Level ${s.quranLevel}/10` : ''}
                    </p>
                  </div>
                  <button onClick={() => onRejectStudent?.(s.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Decline</button>
                  <button onClick={() => onApproveStudent?.(s.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-teal-600 text-white hover:bg-teal-700 transition-colors">Confirm</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Upcoming Lesson banner (linked Google Calendar events) ──────────── */}
      {nextLesson && (
        <div className="mb-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-2xl flex-shrink-0">📅</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Upcoming Lesson</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                You have a lesson with{' '}
                <span className="font-bold text-slate-900 dark:text-white">{nextLesson.student.name}</span>
                {' '}on{' '}
                <span className="font-bold text-slate-900 dark:text-white">{formatSessionDate(nextLesson.date.toISOString())}</span>
              </p>
              {nextLesson.title && (
                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{nextLesson.title}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {nextLesson.meetUrl ? (
              <>
                <button onClick={handleCopyMeetLink} className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                  {meetCopied ? '✓ Copied!' : (<><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg> Copy Link</>)}
                </button>
                <a href={nextLesson.meetUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  Join Lesson
                </a>
                <button onClick={handleClearMeetLink} title="Remove link" className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </>
            ) : (
              <button onClick={handleGenerateMeetLink} disabled={meetGenerating} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white rounded-lg text-sm font-semibold transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                {meetGenerating ? 'Generating…' : 'Generate Meet Link'}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-3 mb-6">
        {/* ── Unified sort bar ── */}
        <div className="flex items-center gap-1.5 flex-wrap bg-white dark:bg-gray-800 px-4 py-2.5 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700">
          <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">{t('dashboard.sortBy')}</span>

          {/* Points — also switches card display to score */}
          <button
            onClick={() => { setViewMode('points'); setSortCriteria(SortCriteria.HighestPoints); }}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              sortCriteria === SortCriteria.HighestPoints
                ? 'bg-teal-600 dark:bg-teal-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-700 dark:hover:text-teal-300'
            }`}
          >🏆 {t('sortCriteria.HighestPoints')}</button>

          {/* Mistakes Rate — also switches card display to mistake rate */}
          <button
            onClick={() => { setViewMode('mistakesRate'); setSortCriteria(SortCriteria.FewestMistakes); }}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              sortCriteria === SortCriteria.FewestMistakes
                ? 'bg-rose-500 dark:bg-rose-500 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400'
            }`}
          >📊 {t('sortCriteria.FewestMistakes')}</button>

          <div className="h-4 w-px bg-slate-200 dark:bg-gray-600 mx-0.5" />

          {/* Other sort criteria */}
          {([
            { criteria: SortCriteria.MostMemorized,  label: t('sortCriteria.MostMemorized'),  icon: '📖' },
            { criteria: SortCriteria.MostAttendance, label: t('sortCriteria.MostAttendance'), icon: '📅' },
            { criteria: SortCriteria.Name,           label: t('sortCriteria.Name'),           icon: '🔤' },
            { criteria: SortCriteria.Age,            label: t('sortCriteria.Age'),            icon: '🎂' },
          ] as const).map(({ criteria, label, icon }) => (
            <button
              key={criteria}
              onClick={() => setSortCriteria(criteria)}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                sortCriteria === criteria
                  ? 'bg-slate-700 dark:bg-slate-500 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600'
              }`}
            >{icon} {label}</button>
          ))}
        </div>

        {/* ── Right side: family links · search · add student · honor board ── */}
        <div className="flex w-full items-center gap-2 flex-wrap">
          {onFamilyLinks && (
            <button
              onClick={onFamilyLinks}
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-semibold rounded-lg border border-teal-200 dark:border-teal-700 shadow-sm transition-colors text-sm"
            >
              <span>👨‍👩‍👧‍👦</span>
              <span className="hidden sm:inline">Family Links</span>
            </button>
          )}

          {/* Search */}
          <div className="relative flex-grow min-w-[140px]">
            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
              <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
              </svg>
            </div>
            <input
              type="text"
              className="block w-full p-2.5 ps-10 text-sm text-slate-900 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500 transition-colors"
              placeholder={t('header.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Add Student — between search and honor board */}
          <button
            onClick={onAddStudent}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 text-white font-semibold rounded-lg shadow-sm transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline">{t('dashboard.addStudent')}</span>
          </button>

          {/* Honor Board */}
          <button
            onClick={() => setIsHonorBoardOpen(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-yellow-100 dark:bg-yellow-900/50 hover:bg-yellow-200 dark:hover:bg-yellow-900 text-yellow-700 dark:text-yellow-500 font-semibold rounded-lg shadow-sm transition-colors text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9.75 9.75 0 0 1 9 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 12.75A3.75 3.75 0 0 0 16.5 9.75v-2.625L12 3.75l-4.5 3.375v2.625a3.75 3.75 0 0 0 3.75 3Z" />
            </svg>
            <span>{t('dashboard.honorBoard')}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-teal-500 dark:border-orange-500 pb-2">{t('dashboard.youngGems')}</h2>
          {studentGroups.youngGems.length > 0 ? studentGroups.youngGems.map((student, idx) => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} viewMode={viewMode} rank={idx < 3 ? (idx + 1) as 1 | 2 | 3 : null} teacherId={teacherId} allStudents={students} isNext={student.id === highlightedStudentId} isLinked={linkedStudentIds.has(student.id)} />
          )) : <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-orange-500 dark:border-yellow-500 pb-2">{t('dashboard.aspiringScholars')}</h2>
          {studentGroups.aspiringScholars.length > 0 ? studentGroups.aspiringScholars.map((student, idx) => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} viewMode={viewMode} rank={idx < 3 ? (idx + 1) as 1 | 2 | 3 : null} teacherId={teacherId} allStudents={students} isNext={student.id === highlightedStudentId} isLinked={linkedStudentIds.has(student.id)} />
          )): <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-sky-500 dark:border-cyan-500 pb-2">{t('dashboard.devotedLearners')}</h2>
          {studentGroups.devotedLearners.length > 0 ? studentGroups.devotedLearners.map((student, idx) => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} viewMode={viewMode} rank={idx < 3 ? (idx + 1) as 1 | 2 | 3 : null} teacherId={teacherId} allStudents={students} isNext={student.id === highlightedStudentId} isLinked={linkedStudentIds.has(student.id)} />
          )) : <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
      </div>
      <HonorBoardModal
        isOpen={isHonorBoardOpen}
        onClose={() => setIsHonorBoardOpen(false)}
        students={students}
      />
    </div>
  );
};

export default Dashboard;