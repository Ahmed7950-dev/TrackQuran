import React, { useState, useMemo, Fragment } from 'react';
import { Student, SurahMetadata, TimePeriod, AttendanceStatus, RecitationAchievement, TafsirReview, AttendanceRecord, MemorizationAchievement, TafsirMemorizationReview } from '../types';
import { TOTAL_QURAN_PAGES, MILESTONES } from '../constants';
import AddRecitationAchievementModal from './AddRecitationAchievementModal';
import { calculateVersesAndPages, getRecitedPagesSet, getMemorizedPagesSet, getPageOfAyah } from '../services/dataService';
import { getStudentRankAndProgress } from '../services/rankingService';
import AddTajweedAchievementModal from './AddTajweedAchievementModal';
import AddTafsirAchievementModal from './AddTafsirAchievementModal';
import EditStudentDataModal from './EditStudentModal';
import ExportReportModal from './ExportReportModal';
import AddAttendanceModal from './AddAttendanceModal';
import ProgressChart from './ProgressChart';
import { useI18n } from '../context/I18nProvider';
import StudentHeader from './StudentHeader';
import ModernToggle from './ModernToggle';
import MistakesReviewPage from './MistakesReviewPage';

interface StudentViewOnlyPageProps {
    student: Student;
    students: Student[];
    quranMetadata: SurahMetadata[];
    tajweedRules: string[];
}

const filterByTimePeriod = <T extends { date: string }>(items: T[], timePeriod: TimePeriod): T[] => {
    if (timePeriod === TimePeriod.AllTime) return items;
    const now = new Date();
    let startDate = new Date();
    switch (timePeriod) {
        case TimePeriod.LastWeek: startDate.setDate(now.getDate() - 7); break;
        case TimePeriod.LastMonth: startDate.setMonth(now.getMonth() - 1); break;
        case TimePeriod.Last6Months: startDate.setMonth(now.getMonth() - 6); break;
        case TimePeriod.LastYear: startDate.setFullYear(now.getFullYear() - 1); break;
    }
    return items.filter(item => new Date(item.date) >= startDate);
};

const StatCard: React.FC<{ title: string; value: string | number; subtext?: string; icon: React.ReactNode }> = ({ title, value, subtext, icon }) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm flex items-start h-full">
        <div className="bg-teal-100 dark:bg-orange-900/50 text-teal-600 dark:text-orange-400 p-3 rounded-lg me-4">
            {icon}
        </div>
        <div className="min-w-0">
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 break-words">{value}</p>
            {subtext && <p className="text-xs text-slate-400 dark:text-slate-500 break-words">{subtext}</p>}
        </div>
    </div>
);

const StudentViewOnlyPage: React.FC<StudentViewOnlyPageProps> = ({ student, students, quranMetadata, tajweedRules }) => {
    const [view, setView] = useState<'progress' | 'mistakes'>('progress');
    const [timePeriod, setTimePeriod] = useState<TimePeriod>(TimePeriod.AllTime);
    const [chartView, setChartView] = useState<'reading' | 'memorization'>('reading');
    const [quranBarView, setQuranBarView] = useState<'reading' | 'memorization'>('reading');
    const [milestoneView, setMilestoneView] = useState<'reading' | 'memorization'>('reading');

    const { t, language } = useI18n();

    const recitedPages = useMemo(() => getRecitedPagesSet(student), [student]);
    const memorizedPages = useMemo(() => getMemorizedPagesSet(student), [student]);

    const attendanceData = useMemo(() => {
        const attendance: AttendanceRecord[] = filterByTimePeriod(student.attendance, timePeriod);
        return {
            present: attendance.filter(a => a.status === AttendanceStatus.Present).length,
            absent: attendance.filter(a => a.status === AttendanceStatus.Absent).length,
            rescheduled: attendance.filter(a => a.status === AttendanceStatus.Rescheduled).length,
        };
    }, [student.attendance, timePeriod]);

    const { rank: readingRank, totalInGroup: readingTotal, pagesToNext: readingPagesToNext } = useMemo(() => 
        getStudentRankAndProgress(student, students, 'reading'), 
        [student, students]
    );

    const { rank: hifdhRank, totalInGroup: hifdhTotal, pagesToNext: hifdhPagesToNext } = useMemo(() => 
        getStudentRankAndProgress(student, students, 'memorization'), 
        [student, students]
    );
    
    const readingData = useMemo(() => {
        const achievements: RecitationAchievement[] = filterByTimePeriod(student.recitationAchievements, timePeriod);
        const pagesRemaining = TOTAL_QURAN_PAGES - recitedPages.size;
        const avgQuality = achievements.length > 0 ? achievements.reduce((sum, ach) => sum + ach.readingQuality, 0) / achievements.length : 0;
        const lastAchievement = student.recitationAchievements.length > 0 ? [...student.recitationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
        const lastAchievementText = lastAchievement ? `${quranMetadata.find(s => s.number === lastAchievement.endSurah)?.name} ${lastAchievement.endAyah}` : 'N/A';
        const tafsirReviews: TafsirReview[] = filterByTimePeriod(student.tafsirReviews, timePeriod);
        const tafsirBySurah = tafsirReviews.reduce((acc, review) => {
            if (!acc[review.surah]) { acc[review.surah] = []; }
            acc[review.surah].push(review.reviewQuality);
            return acc;
// FIX: Changed index signature from `string` to `number` to fix type inference issues with Object.entries.
        }, {} as Record<number, number[]>);

        return { totalPages: recitedPages.size, pagesRemaining, avgQuality, lastAchievementText, tafsirBySurah };
    }, [student, timePeriod, quranMetadata, recitedPages]);

    const memorizationData = useMemo(() => {
        // FIX: Explicitly type the result of filterByTimePeriod to avoid type inference issues.
        const achievements: MemorizationAchievement[] = filterByTimePeriod(student.memorizationAchievements, timePeriod);
        const pagesRemaining = TOTAL_QURAN_PAGES - memorizedPages.size;
        const avgQuality = achievements.length > 0 ? achievements.reduce((sum, ach) => sum + ach.memorizationQuality, 0) / achievements.length : 0;
        const allReviews: { surah: number, quality: number, date: string }[] = [];
        
        // FIX: Use the already filtered and typed 'achievements' array.
        achievements.forEach(ach => {
            for (let i = ach.startSurah; i <= ach.endSurah; i++) allReviews.push({ surah: i, quality: ach.memorizationQuality, date: ach.date });
        });

        // FIX: Explicitly type the result of filterByTimePeriod.
        const tafsirMemorizationReviews: TafsirMemorizationReview[] = filterByTimePeriod(student.tafsirMemorizationReviews, timePeriod);
        tafsirMemorizationReviews.forEach(review => {
            allReviews.push({ surah: review.surah, quality: review.reviewQuality, date: review.date });
        });
        const tafsirBySurah = allReviews.reduce((acc, review) => {
            if (!acc[review.surah]) { acc[review.surah] = []; }
            acc[review.surah].push(review.quality);
            return acc;
// FIX: Changed index signature from `string` to `number` to fix type inference issues with Object.entries.
        }, {} as Record<number, number[]>);

        return { totalPages: memorizedPages.size, pagesRemaining, avgQuality, tafsirBySurah };
    }, [student, timePeriod, quranMetadata, memorizedPages]);

    const getSurahQualityMap = (achievements: (RecitationAchievement | MemorizationAchievement)[]): Record<number, number> => {
        const qualityMap: Record<number, { totalQuality: number, count: number }> = {};
        achievements.forEach(ach => {
            for (let i = ach.startSurah; i <= ach.endSurah; i++) {
                if (!qualityMap[i]) qualityMap[i] = { totalQuality: 0, count: 0 };
                const quality = 'readingQuality' in ach ? ach.readingQuality : ach.memorizationQuality;
                qualityMap[i].totalQuality += quality;
                qualityMap[i].count += 1;
            }
        });
        const avgQualityMap: Record<number, number> = {};
        for (const surahNum in qualityMap) {
            avgQualityMap[surahNum] = qualityMap[surahNum].totalQuality / qualityMap[surahNum].count;
        }
        return avgQualityMap;
    };

    const recitedSurahsQuality = useMemo(() => getSurahQualityMap(student.recitationAchievements), [student.recitationAchievements]);
    const memorizedSurahsQuality = useMemo(() => getSurahQualityMap(student.memorizationAchievements), [student.memorizationAchievements]);

    const ProgressSection: React.FC<{ pagesCompleted: number; qualityMap: Record<number, number> }> = ({ pagesCompleted, qualityMap }) => (
        <>
            <div className="flex justify-end items-center mb-3">
                <span className="font-bold text-teal-600 dark:text-orange-400 text-sm">{t('studentDetail.completePercent', { percent: ((pagesCompleted / TOTAL_QURAN_PAGES) * 100).toFixed(1) })}</span>
            </div>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(114, minmax(0, 1fr))' }}>
                {quranMetadata.map(surah => {
                    const quality = qualityMap[surah.number];
                    const getQualityColor = (q: number) => { if (q > 9) return 'bg-orange-600'; if (q > 7) return 'bg-orange-500'; if (q > 5) return 'bg-orange-400'; if (q > 3) return 'bg-orange-300'; return 'bg-orange-200'; };
                    const color = quality ? getQualityColor(quality) : 'bg-slate-200 dark:bg-gray-700';
                    return (
                        <div key={surah.number} className="relative group first:rounded-s-sm last:rounded-e-sm">
                            <div className={`h-6 w-full ${color} transition-colors`}></div>
                            <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 dark:bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 left-1/2 -translate-x-1/2">
                                {surah.transliteratedName}
                                <svg className="absolute text-gray-800 dark:text-black h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255">
                                    <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                                </svg>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
    
    const MilestoneSection: React.FC<{ completedPages: Set<number> }> = ({ completedPages }) => (
        <div className="flex items-center">
            {MILESTONES.map((milestone, index) => {
                const achieved = milestone.isAchieved(completedPages);
                const IconComponent = milestone.badgeIcon;
                return (
                    <Fragment key={milestone.id}>
                        <div className="relative flex flex-col items-center group w-20">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${achieved ? 'bg-teal-500 dark:bg-orange-500 border-teal-200 dark:border-orange-800 text-white' : 'bg-slate-200 dark:bg-gray-700 border-slate-300 dark:border-gray-600 text-slate-500 dark:text-slate-400'}`}>
                                {achieved && typeof milestone.badgeIcon !== 'string' && milestone.id !== 'ya-seen' && milestone.id !== 'khatm' ? <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> : (typeof IconComponent === 'string' ? <span className="font-bold text-lg">{IconComponent}</span> : IconComponent)}
                            </div>
                            <p className={`text-center text-xs mt-2 font-semibold transition-colors ${achieved ? 'text-teal-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}>{milestone.title}</p>
                            <div className="absolute bottom-full mb-3 w-48 bg-slate-800 dark:bg-gray-900 text-white text-xs rounded py-1.5 px-3 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10">{milestone.description}<svg className="absolute text-slate-800 dark:text-gray-900 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0"/></svg></div>
                        </div>
                        {index < MILESTONES.length - 1 && <div className={`flex-grow h-1 rounded ${achieved ? 'bg-teal-500 dark:bg-orange-500' : 'bg-slate-300 dark:bg-gray-600'}`}></div>}
                    </Fragment>
                );
            })}
        </div>
    );
    
// FIX: Changed index signature from `string` to `number` to fix type inference issues with Object.entries.
    const TafsirSection: React.FC<{ tafsirBySurah: Record<number, number[]> }> = ({ tafsirBySurah }) => (
        <>
            {Object.keys(tafsirBySurah).length > 0 ? (
                <div className="space-y-4 max-h-60 overflow-y-auto pe-2">
                    {/* FIX: Explicitly typing `qualities` to `number[]` to resolve TS inference error. */}
                    {Object.entries(tafsirBySurah).map(([surahNum, qualities]: [string, number[]]) => {
                        const surah = quranMetadata.find(s => s.number === +surahNum); if (!surah) return null;
                        const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;
                        const getQualityColor = (q: number) => { if (q >= 8) return 'bg-green-500'; if (q >= 5) return 'bg-yellow-500'; return 'bg-red-500'; };
                        return (
                            <div key={surahNum}>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <h4 className="font-bold text-slate-800 dark:text-slate-200">{surah.transliteratedName}</h4>
                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium bg-slate-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{t('studentDetail.reviewsCount', { count: qualities.length })}</span>
                                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">{t('studentDetail.avgQuality', { quality: avgQuality.toFixed(1) })}</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">{qualities.map((quality, index) => (<div key={index} title={`Review ${index + 1}: ${quality}/10`} className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm ${getQualityColor(quality)}`}>{quality}</div>))}</div>
                            </div>
                        )
                    })}
                </div>
            ) : <p className="text-slate-500 dark:text-slate-400 italic text-sm">{t('studentDetail.noReviews')}</p>}
        </>
    );


    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">{t('studentView.pageTitle', { name: student.name })}</h2>

            <div className="border-b border-slate-200 dark:border-gray-700 no-print">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setView('progress')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${view === 'progress' ? 'border-teal-500 dark:border-orange-500 text-teal-600 dark:text-orange-500' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                        {t('studentView.progressOverviewTab')}
                    </button>
                    <button
                        onClick={() => setView('mistakes')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${view === 'mistakes' ? 'border-teal-500 dark:border-orange-500 text-teal-600 dark:text-orange-500' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                        {t('studentView.mistakesReviewTab')}
                    </button>
                </nav>
            </div>

            {view === 'progress' ? (
                <div className="space-y-6">
                    <div className="flex justify-end"><select value={timePeriod} onChange={e => setTimePeriod(e.target.value as TimePeriod)} className="bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 text-slate-900 dark:text-white text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block w-full sm:w-auto p-2">
                        {Object.keys(TimePeriod).map(key => (
                            <option key={key} value={TimePeriod[key as keyof typeof TimePeriod]}>
                                {t(`timePeriods.${key}`)}
                            </option>
                        ))}
                    </select></div>
                    
                    <div className="space-y-6">
                        <div className="p-4 bg-slate-100 dark:bg-gray-800/50 rounded-lg">
                            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-4">{t('studentDetail.attendanceTitle')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <StatCard title={t('studentDetail.present')} value={attendanceData.present} subtext={t('studentDetail.daysAttended')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-11.25a.75.75 0 0 0-1.5 0v4.59L7.3 9.24a.75.75 0 0 0-1.1 1.02l3.25 3.5a.75.75 0 0 0 1.1 0l3.25-3.5a.75.75 0 1 0-1.1-1.02l-1.95 2.1V6.75Z" clipRule="evenodd" /></svg>} />
                                <StatCard title={t('studentDetail.absent')} value={attendanceData.absent} subtext={t('studentDetail.daysMissed')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.28-11.22a.75.75 0 0 0-1.06 0l-4.25 4.25a.75.75 0 1 0 1.06 1.06L10 8.56l3.72 3.72a.75.75 0 1 0 1.06-1.06l-4.25-4.25Z" clipRule="evenodd" /></svg>} />
                                <StatCard title={t('studentDetail.rescheduled')} value={attendanceData.rescheduled} subtext={t('studentDetail.daysRescheduled')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-2.75-7.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5Z" clipRule="evenodd" /></svg>} />
                            </div>
                        </div>

                        <hr className="border-slate-200 dark:border-gray-700" />

                        <div className="p-4 bg-slate-100 dark:bg-gray-800/50 rounded-lg">
                            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-4">{t('studentDetail.readingProgress')}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                                <StatCard title={t('studentDetail.lastRecitation')} value={readingData.lastAchievementText} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" /></svg>} />
                                <StatCard title={t('studentDetail.pagesRead')} value={readingData.totalPages} subtext={t('studentDetail.toKhatm', { pages: readingData.pagesRemaining })} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v13A1.5 1.5 0 0 0 3.5 18h13a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 16.5 2h-13Zm1.25 1.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H4.75Z" /></svg>} />
                                <StatCard title={t('studentDetail.readingQuality')} value={readingData.avgQuality.toFixed(1)} subtext={t('studentDetail.averageOutOf10')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M10.868 2.884c.321-.772 1.415-.772 1.736 0l1.99 4.785a.75.75 0 0 0 .562.41l5.257.764c.818.119 1.145 1.121.556 1.704l-3.804 3.709a.75.75 0 0 0-.217.665l.9 5.236c.14.815-.713 1.44-1.442 1.054L10 18.232l-4.703 2.473c-.729.386-1.582-.239-1.442-1.054l.9-5.236a.75.75 0 0 0-.217-.665l-3.804-3.709c-.59-.583-.262-1.585.556-1.704l5.257-.764a.75.75 0 0 0 .562.41l1.99-4.785Z" clipRule="evenodd" /></svg>} />
                                <StatCard title={t('studentDetail.rankInAgeGroup')} value={`${readingRank} / ${readingTotal}`} subtext={readingPagesToNext !== null ? t('studentDetail.pagesToNextRank', { pages: readingPagesToNext }) : t('studentDetail.topOfClass')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M15.22 6.268a.75.75 0 0 1 .968-.432l3.5 1.5a.75.75 0 0 1 0 1.328l-3.5 1.5a.75.75 0 0 1-.968-.432V6.268ZM3.75 3A1.75 1.75 0 0 0 2 4.75v10.5A1.75 1.75 0 0 0 3.75 17h6.5A1.75 1.75 0 0 0 12 15.25v-2.016a.75.75 0 0 1 1.5 0v2.016a3.25 3.25 0 0 1-3.25 3.25h-6.5A3.25 3.25 0 0 1 .5 15.25V4.75A3.25 3.25 0 0 1 3.75 1.5h6.5A3.25 3.25 0 0 1 13.5 4.75v2.016a.75.75 0 0 1-1.5 0V4.75a1.75 1.75 0 0 0-1.75-1.75h-6.5Z" clipRule="evenodd" /></svg>} />
                            </div>
                        </div>

                        <hr className="border-slate-200 dark:border-gray-700" />

                        <div className="p-4 bg-slate-100 dark:bg-gray-800/50 rounded-lg">
                            <h3 className="font-bold text-lg text-slate-700 dark:text-slate-200 mb-4">{t('studentDetail.memorizationProgress')}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                                <StatCard title={t('studentDetail.pagesMemorized')} value={memorizationData.totalPages} subtext={t('studentDetail.toKhatm', { pages: memorizationData.pagesRemaining })} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M10 2a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 2ZM9.03 6.03a.75.75 0 0 1 0-1.06l2.5-2.5a.75.75 0 0 1 1.06 1.06l-2.5 2.5a.75.75 0 0 1-1.06 0ZM5.25 9.75a.75.75 0 0 0-1.5 0v.5c0 2.9 2.35 5.25 5.25 5.25s5.25-2.35 5.25-5.25v-.5a.75.75 0 0 0-1.5 0v.5a3.75 3.75 0 1 1-7.5 0v-.5Z" /></svg>} />
                                <StatCard title={t('studentDetail.memorizationQuality')} value={memorizationData.avgQuality.toFixed(1)} subtext={t('studentDetail.averageOutOf10')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M12.106 4.99a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 0-1.06l7.5-7.5Zm-2.12 9.122 4.37-4.37-2.12-2.122-4.37 4.37 2.12 2.122ZM7.88 5.53 4.63 8.78l2.12 2.121 3.25-3.25-2.12-2.121Z" clipRule="evenodd" /></svg>} />
                                <StatCard title={t('studentDetail.rankInAgeGroup')} value={`${hifdhRank} / ${hifdhTotal}`} subtext={hifdhPagesToNext !== null ? t('studentDetail.pagesToNextRank', { pages: hifdhPagesToNext }) : t('studentDetail.topOfClass')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M15.28 4.72a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 0 1 1.06-1.06L9 10.44l5.72-5.72a.75.75 0 0 1 1.06 0ZM18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>} />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold text-slate-700 dark:text-slate-200">{t('studentDetail.progressOverTime')}</h3>
                            <ModernToggle value={chartView} onChange={setChartView} labelOne={t('studentDetail.reading')} labelTwo={t('studentDetail.hifdh')} />
                        </div>
                        {chartView === 'reading' ? (
                            <ProgressChart achievements={student.recitationAchievements} type="reading" maxPages={20} />
                        ) : (
                            <ProgressChart achievements={student.memorizationAchievements} type="memorization" maxPages={20} />
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                        <div className="flex justify-between items-center">
                            <h3 className="font-semibold text-slate-700 dark:text-slate-200">{t('studentDetail.quranProgress')}</h3>
                            <ModernToggle value={quranBarView} onChange={setQuranBarView} labelOne={t('studentDetail.reading')} labelTwo={t('studentDetail.hifdh')} />
                        </div>
                        <div className="mt-4">
                            {quranBarView === 'reading' 
                                ? <ProgressSection pagesCompleted={recitedPages.size} qualityMap={recitedSurahsQuality} />
                                : <ProgressSection pagesCompleted={memorizedPages.size} qualityMap={memorizedSurahsQuality} />
                            }
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-semibold text-slate-700 dark:text-slate-200">{t('studentDetail.milestoneJourney')}</h3>
                            <ModernToggle value={milestoneView} onChange={setMilestoneView} labelOne={t('studentDetail.reading')} labelTwo={t('studentDetail.hifdh')} />
                        </div>
                        {milestoneView === 'reading'
                            ? <MilestoneSection completedPages={recitedPages} />
                            : <MilestoneSection completedPages={memorizedPages} />
                        }
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">{t('studentDetail.masteredTajweed')}</h3>
                                {student.masteredTajweedRules.length > 0 ? (
                                    <ul className="space-y-3">{student.masteredTajweedRules.map(rule => (<li key={rule} className="flex items-center"><div className="bg-green-100 dark:bg-green-900/50 rounded-full p-1 me-3"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600 dark:text-green-400"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg></div><span className="text-slate-700 dark:text-slate-300 text-sm">{rule}</span></li>))}</ul>
                                ) : <p className="text-slate-500 dark:text-slate-400 italic text-sm">{t('studentDetail.noRulesMastered')}</p>}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                                    <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">{t('studentDetail.tafsirReviews')}</h3>
                                    <TafsirSection tafsirBySurah={readingData.tafsirBySurah} /> 
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                                    <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4">{t('studentDetail.memorizationRecall')}</h3>
                                    <TafsirSection tafsirBySurah={memorizationData.tafsirBySurah} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <MistakesReviewPage student={student} showTitle={false} />
            )}
        </div>
    );
};

export default StudentViewOnlyPage;