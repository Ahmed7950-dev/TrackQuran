import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
// FIX: Import AttendanceRecord type.
// Fix: Import TafsirReview to resolve type errors.
import { Student, SurahMetadata, TimePeriod, AttendanceStatus, RecitationAchievement, MemorizationAchievement, AttendanceRecord, TafsirReview } from '../types';
import { generateTeacherComment } from '../services/geminiService';
import { TOTAL_QURAN_PAGES, MILESTONES } from '../constants';
import { getRecitedPagesSet, getMemorizedPagesSet } from '../services/dataService';
import { getStudentRankAndProgress } from '../services/rankingService';
import ProgressChart from './ProgressChart';
import { useI18n } from '../context/I18nProvider';

// This will be available on the window object from the CDN script
declare const html2pdf: any;

interface ExportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  students: Student[];
  quranMetadata: SurahMetadata[];
}

const reportSections = {
    comment: "Teacher's Comment",
    readingStats: 'Reading Stats',
    hifdhStats: 'Memorization Stats',
    ranking: 'Student Rank',
    attendanceSummary: 'Attendance Summary',
    masteredTajweed: 'Mastered Tajweed Rules',
    tafsirProgress: 'Tafsir Progress',
    readingCompletion: 'Reading Completion Bar',
    hifdhCompletion: 'Memorization Completion Bar',
    readingChart: 'Reading Progress Chart',
    hifdhChart: 'Memorization Progress Chart',
    readingMilestones: 'Reading Milestones',
    hifdhMilestones: 'Memorization Milestones',
    attendance: 'Attendance Calendar',
};
type ReportSectionKey = keyof typeof reportSections;


// Fix: Moved helper function outside component to resolve TypeScript generic inference issues.
const filterByTimePeriod = <T extends { date: string }>(items: T[], period: TimePeriod): T[] => {
    if (period === TimePeriod.AllTime) return items;
    const now = new Date(); let startDate = new Date();
    switch (period) {
        case TimePeriod.LastWeek: startDate.setDate(now.getDate() - 7); break;
        case TimePeriod.LastMonth: startDate.setMonth(now.getMonth() - 1); break;
        case TimePeriod.Last6Months: startDate.setMonth(now.getMonth() - 6); break;
        case TimePeriod.LastYear: startDate.setFullYear(now.getFullYear() - 1); break;
    }
    return items.filter(i => new Date(i.date) >= startDate);
};

const ReportStatCard: React.FC<{ label: string; value: string | number; subValue?: string; }> = ({ label, value, subValue }) => (
    <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 h-full">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider truncate">{label}</p>
        <p className="text-3xl font-bold text-slate-800 break-words mt-1">{value}</p>
        {subValue && <p className="text-xs text-slate-400 break-words mt-1">{subValue}</p>}
    </div>
);

const ExportReportModal: React.FC<ExportReportModalProps> = ({ isOpen, onClose, student, students, quranMetadata }) => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(TimePeriod.LastMonth);
  const [manualComment, setManualComment] = useState('');
  const [isLoadingComment, setIsLoadingComment] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Record<ReportSectionKey, boolean>>(
      Object.keys(reportSections).reduce((acc, key) => ({ ...acc, [key]: true }), {} as Record<ReportSectionKey, boolean>)
  );
  const reportContentRef = useRef<HTMLDivElement>(null);
  const { t, language } = useI18n();

  const recitedPages = useMemo(() => getRecitedPagesSet(student), [student]);
  const memorizedPages = useMemo(() => getMemorizedPagesSet(student), [student]);

  useEffect(() => {
    if (!isOpen) {
      setIsCustomizeOpen(false);
    }
  }, [isOpen]);

  const studentData = useMemo(() => {
      // FIX: Add explicit types to fix type inference issue with generic function.
      const recitation: RecitationAchievement[] = filterByTimePeriod(student.recitationAchievements, timePeriod);
      // FIX: Add explicit types to fix type inference issue with generic function.
      const memorization: MemorizationAchievement[] = filterByTimePeriod(student.memorizationAchievements, timePeriod);
      // FIX: Add explicit types to fix type inference issue with generic function.
      const attendance: AttendanceRecord[] = filterByTimePeriod(student.attendance, timePeriod);
      // FIX: Add explicit types to fix type inference issue with generic function.
      const tafsirReviewsRaw: TafsirReview[] = filterByTimePeriod(student.tafsirReviews, timePeriod);

      const totalPages = recitedPages.size;
      const pagesRemaining = TOTAL_QURAN_PAGES - totalPages;
      const totalMemorizedPages = memorizedPages.size;
      const memorizedPagesRemaining = TOTAL_QURAN_PAGES - totalMemorizedPages;
      
      const avgReadingQuality = recitation.length > 0 ? recitation.reduce((sum, ach) => sum + ach.readingQuality, 0) / recitation.length : 0;
      const avgMemorizationQuality = memorization.length > 0 ? memorization.reduce((sum, ach) => sum + ach.memorizationQuality, 0) / memorization.length : 0;

      const attendanceCounts = {
          present: attendance.filter(a => a.status === AttendanceStatus.Present).length,
          absent: attendance.filter(a => a.status === AttendanceStatus.Absent).length,
          rescheduled: attendance.filter(a => a.status === AttendanceStatus.Rescheduled).length,
      };
      const lastAchievement = student.recitationAchievements.length > 0 ? [...student.recitationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
      const lastAchievementText = lastAchievement ? `${quranMetadata.find(s => s.number === lastAchievement.endSurah)?.name} ${lastAchievement.endAyah}` : 'N/A';
      
      const tafsirBySurah = tafsirReviewsRaw.reduce((acc, review) => {
        if (!acc[review.surah]) {
            acc[review.surah] = { qualities: [], count: 0 };
        }
        acc[review.surah].qualities.push(review.reviewQuality);
        acc[review.surah].count++;
        return acc;
      }, {} as Record<number, { qualities: number[], count: number }>);

      const processedTafsir = Object.entries(tafsirBySurah).map(([surahNum, data]) => ({
          surah: quranMetadata.find(s => s.number === +surahNum)!,
          avgQuality: data.qualities.reduce((a, b) => a + b, 0) / data.count,
          count: data.count
      })).sort((a,b) => a.surah.number - b.surah.number);


      return { totalPages, pagesRemaining, totalMemorizedPages, memorizedPagesRemaining, avgReadingQuality, avgMemorizationQuality, attendance: attendanceCounts, lastAchievementText, tafsirReviews: processedTafsir };
  }, [student, timePeriod, quranMetadata, recitedPages, memorizedPages]);
  
  const { rank: readingRank, totalInGroup: readingTotal, pagesToNext: readingPagesToNext } = useMemo(() => getStudentRankAndProgress(student, students, 'reading'), [student, students]);
  const { rank: hifdhRank, totalInGroup: hifdhTotal, pagesToNext: hifdhPagesToNext } = useMemo(() => getStudentRankAndProgress(student, students, 'memorization'), [student, students]);

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

  const handleGenerateComment = useCallback(async () => {
    setIsLoadingComment(true);
    const comment = await generateTeacherComment(student, studentData, manualComment);
    setManualComment(comment);
    setIsLoadingComment(false);
  }, [student, studentData, manualComment]);

  const handleExport = useCallback(async () => {
    if (isExporting || typeof html2pdf === 'undefined') {
        if (typeof html2pdf === 'undefined') {
            alert('PDF library not loaded. Please check your internet connection and refresh.');
        }
        return;
    }

    setIsExporting(true);
    
    const element = reportContentRef.current;
    if (!element) {
        setIsExporting(false);
        return;
    }

    const isDarkMode = document.documentElement.classList.contains('dark');
    const isReadingMode = document.documentElement.getAttribute('data-theme') === 'reading';
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
    }
    if (isReadingMode) {
      document.documentElement.removeAttribute('data-theme');
    }

    const opt = {
      margin: 0.5,
      filename: `${student.name.replace(/ /g, '_')}_progress_report.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], before: '.page-break' }
    };

    try {
        await html2pdf().from(element).set(opt).save();
    } catch (error) {
        console.error("Error during PDF generation:", error);
        alert("Sorry, an error occurred while generating the PDF.");
    } finally {
        if (isDarkMode) {
          document.documentElement.classList.add('dark');
        }
        if (isReadingMode) {
          document.documentElement.setAttribute('data-theme', 'reading');
        }
        setIsExporting(false);
    }
}, [student.name, isExporting]);

  const handleExportHTML = useCallback(() => {
    const element = reportContentRef.current;
    if (!element) return;

    // Remove interactive-only elements (textarea, buttons inside the report)
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-export').forEach(el => el.remove());

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${student.name} — Progress Report</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f8fafc; padding: 24px; }
    @media print { body { background: white; padding: 0; } }
  </style>
</head>
<body>
  ${clone.outerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${student.name.replace(/ /g, '_')}_progress_report.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [student.name]);

  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const Calendar: React.FC<{ date: Date }> = ({ date }) => {
    const month = date.getMonth(), year = date.getFullYear();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const attendanceMap = new Map(student.attendance.map(a => [new Date(a.date).toDateString(), a.status]));
    const days = Array.from({ length: firstDay }, (_, i) => <div key={`e-${i}`}></div>);
    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const status = attendanceMap.get(d.toDateString());
        let bgColor = 'bg-slate-100', textColor = 'text-slate-600';
        if (status === AttendanceStatus.Present) { bgColor = 'bg-green-400'; textColor = 'text-white'; }
        if (status === AttendanceStatus.Absent) { bgColor = 'bg-red-400'; textColor = 'text-white'; }
        if (status === AttendanceStatus.Rescheduled) { bgColor = 'bg-orange-400'; textColor = 'text-white'; }
        days.push(<div key={day} className={`w-full h-7 flex items-center justify-center text-xs font-bold rounded-sm ${bgColor} ${textColor}`}>{day}</div>);
    }
    const dayNames = language === 'ar' ? ['أ', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    return (<div><h4 className="font-semibold text-center text-sm mb-2">{date.toLocaleString(language, { month: 'long', year: 'numeric' })}</h4><div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500 mb-1">{dayNames.map(d => <div key={d}>{d}</div>)}</div><div className="grid grid-cols-7 gap-1">{days}</div></div>);
  };
  
  const getButtonText = () => {
    if (isExporting) return t('modals.exportReport.buttonGenerating');
    if (typeof html2pdf === 'undefined') return t('modals.exportReport.buttonLoading');
    return t('modals.exportReport.buttonDownload');
  };
  const isButtonDisabled = isExporting || typeof html2pdf === 'undefined';
  const timePeriodKey = Object.keys(TimePeriod).find(key => TimePeriod[key as keyof typeof TimePeriod] === timePeriod);
  const translatedTimePeriod = timePeriodKey ? t(`timePeriods.${timePeriodKey}`) : timePeriod;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl h-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('modals.exportReport.title')}</h2>
            <div className="flex items-center gap-2 sm:gap-4 mt-2 sm:mt-0">
                 <div className="relative">
                    <button onClick={() => setIsCustomizeOpen(!isCustomizeOpen)} className="px-3 py-2 text-xs font-semibold bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-gray-600 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M10 3.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM10 8.75a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5a.75.75 0 0 1 .75-.75ZM8.125 5.5a.75.75 0 0 0 0 1.5h3.75a.75.75 0 0 0 0-1.5H8.125ZM5.5 8.125a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1-.75-.75Z" /></svg>
                        {t('modals.exportReport.customize')}
                    </button>
                    {isCustomizeOpen && (
                        <div className="absolute top-full end-0 mt-2 w-64 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-xl z-20 p-4">
                            <p className="font-bold mb-2 text-slate-800 dark:text-slate-100">{t('modals.exportReport.include')}</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
                                {Object.entries(reportSections).map(([key, label]) => (
                                    <label key={key} className="flex items-center space-x-2 cursor-pointer">
                                        <input type="checkbox" checked={selectedSections[key as ReportSectionKey]} onChange={() => setSelectedSections(prev => ({...prev, [key]: !prev[key as ReportSectionKey]}))} className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">{t(`modals.exportReport.${key}` as any)}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                 </div>
                 <select value={timePeriod} onChange={e => setTimePeriod(e.target.value as TimePeriod)} className="bg-white dark:bg-gray-700 dark:border-gray-600 border border-slate-300 text-sm rounded-lg p-2 dark:text-white">
                    {Object.keys(TimePeriod).map(key => (
                        <option key={key} value={TimePeriod[key as keyof typeof TimePeriod]}>
                            {t(`timePeriods.${key}`)}
                        </option>
                    ))}
                 </select>
                <button onClick={handleExportHTML} className="px-4 py-2 text-white font-semibold rounded-md shadow-sm transition-colors bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 whitespace-nowrap">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.378 2H4.5Zm4.75 6.75a.75.75 0 0 1 1.5 0v2.546l.943-1.048a.75.75 0 1 1 1.114 1.004l-2.25 2.5a.75.75 0 0 1-1.114 0l-2.25-2.5a.75.75 0 1 1 1.114-1.004l.943 1.048V8.75Z" clipRule="evenodd" /></svg>
                    Download HTML
                </button>
                <button onClick={handleExport} disabled={isButtonDisabled} className={`px-4 py-2 text-white font-semibold rounded-md shadow-sm transition-colors w-36 text-center bg-teal-600 hover:bg-teal-700 dark:bg-orange-600 dark:hover:bg-orange-700 disabled:bg-slate-400 disabled:cursor-not-allowed`}>{getButtonText()}</button>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
            </div>
        </div>

        <div className="flex-grow bg-slate-100 dark:bg-gray-900 p-4 overflow-y-auto rounded">
            <div ref={reportContentRef} className="bg-white p-8 w-full max-w-3xl mx-auto font-sans text-gray-800">
                <header className="flex justify-between items-center mb-10 pb-4 border-b">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">{student.name}</h1>
                        <p className="text-gray-500">Quran Progress Report</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold text-teal-600">TRACKQURAN</h2>
                        <p className="text-sm text-gray-500">{t('modals.exportReport.reportFor', { period: translatedTimePeriod })}</p>
                    </div>
                </header>
                
                {selectedSections.comment && (
                    <section className="mb-8 p-6 bg-teal-50 rounded-lg break-inside-avoid">
                        <h3 className="text-lg font-semibold text-teal-800 mb-2">{t('modals.exportReport.comment')}</h3>
                        <div className="no-export mb-2">
                           <textarea value={manualComment} onChange={e => setManualComment(e.target.value)} placeholder={t('modals.exportReport.commentPlaceholder')} className="w-full p-2 text-sm border rounded bg-white" rows={3}></textarea>
                           <div className="mt-2 flex items-center gap-4">
                            <button onClick={handleGenerateComment} disabled={isLoadingComment} className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:bg-blue-300 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"><path d="M9.965 4.035a2.5 2.5 0 1 1 3.535 3.535L8.25 12.75l-2.06-2.06 3.775-3.775a.75.75 0 0 0-1.06-1.06L5.13 9.63l-1.59-1.59a.75.75 0 0 0-1.06 1.06l2.06 2.06L2.5 13.53A.75.75 0 0 0 3.56 14.6l2.12-2.12 2.06 2.06a.75.75 0 0 0 1.06 0l6.25-6.25a3.993 3.993 0 0 0-2.03-6.68.75.75 0 0 0-.68.125l-.96.72Z" /></svg>{isLoadingComment ? t('modals.exportReport.buttonWorking') : (manualComment ? t('modals.exportReport.buttonEnhanceAI') : t('modals.exportReport.buttonGenerateAI'))}</button>
                           </div>
                        </div>
                        <p className="text-gray-700 italic">{manualComment || "No comment provided for this period."}</p>
                    </section>
                )}
                
                <div className="grid grid-cols-2 gap-8">
                    {selectedSections.readingStats && (
                        <section className="col-span-1 break-inside-avoid">
                            <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">Reading</h3>
                            <div className="space-y-4">
                                <ReportStatCard label={t('studentDetail.lastRecitation')} value={studentData.lastAchievementText} />
                                <ReportStatCard label={t('studentDetail.readingQuality')} value={`${studentData.avgReadingQuality.toFixed(1)}/10`} />
                                <ReportStatCard label={t('studentDetail.pagesRead')} value={studentData.totalPages} subValue={t('studentDetail.toKhatm', { pages: studentData.pagesRemaining })} />
                            </div>
                        </section>
                    )}
                     {selectedSections.hifdhStats && (
                        <section className="col-span-1 break-inside-avoid">
                            <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">Memorization</h3>
                            <div className="space-y-4">
                                <ReportStatCard label={t('studentDetail.memorizationQuality')} value={`${studentData.avgMemorizationQuality.toFixed(1)}/10`} />
                                <ReportStatCard label={t('studentDetail.pagesMemorized')} value={studentData.totalMemorizedPages} subValue={t('studentDetail.toKhatm', { pages: studentData.memorizedPagesRemaining })} />
                                <ReportStatCard label={t('studentDetail.rankInAgeGroup')} value={`#${hifdhRank} / ${hifdhTotal}`} subValue={hifdhPagesToNext !== null ? t('studentDetail.pagesToNextRank', { pages: hifdhPagesToNext }) : t('studentDetail.topOfClass')} />
                            </div>
                        </section>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8 page-break">
                    {selectedSections.masteredTajweed && (
                        <section className="break-inside-avoid">
                            <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{t('studentDetail.masteredTajweed')}</h3>
                            {student.masteredTajweedRules.length > 0 ? (
                                <div className="flex flex-wrap gap-2 p-4 bg-slate-50 rounded-lg">
                                    {student.masteredTajweedRules.map(rule => (
                                        <span key={rule} className="bg-white border border-slate-200 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">{rule}</span>
                                    ))}
                                </div>
                            ) : <p className="text-sm italic text-slate-500 bg-slate-50 p-4 rounded-lg">{t('studentDetail.noRulesMastered')}</p>}
                        </section>
                    )}
                    {selectedSections.tafsirProgress && (
                        <section className="break-inside-avoid">
                            <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{t('studentDetail.tafsirReviews')}</h3>
                            {studentData.tafsirReviews.length > 0 ? (
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 bg-slate-50 p-2 rounded-lg">
                                    {studentData.tafsirReviews.map(({ surah, avgQuality, count }) => (
                                        <div key={surah.number} className="flex items-center justify-between p-2.5 bg-white rounded-md border">
                                            <div>
                                                <p className="font-bold text-sm text-slate-800">{surah.transliteratedName}</p>
                                                <p className="text-xs text-slate-500">{t('studentDetail.reviewsCount', { count: count })}</p>
                                            </div>
                                            <p className="text-base font-bold text-indigo-600">{avgQuality.toFixed(1)}<span className="text-xs text-slate-500">/10</span></p>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-sm italic text-slate-500 bg-slate-50 p-4 rounded-lg">{t('studentDetail.noReviews')}</p>}
                        </section>
                    )}
                </div>
                
                {selectedSections.readingCompletion && (
                    <section className="mt-8 page-break break-inside-avoid">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{t('modals.exportReport.readingCompletion')}</h3>
                        <div className="grid gap-px" style={{gridTemplateColumns: 'repeat(114, minmax(0, 1fr))'}}>{quranMetadata.map(surah => { const quality = recitedSurahsQuality[surah.number]; const getQualityColor = (q: number) => `hsl(160, 50%, ${100 - (q * 4.5)}%)`; const color = quality ? getQualityColor(quality) : '#e2e8f0'; return <div key={surah.number} style={{backgroundColor: color}} title={`${surah.transliteratedName}`} className={`h-5 w-full first:rounded-l-sm last:rounded-r-sm`}></div> })}</div>
                    </section>
                )}
                 {selectedSections.hifdhCompletion && (
                     <section className="mt-4 break-inside-avoid">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{t('modals.exportReport.hifdhCompletion')}</h3>
                        <div className="grid gap-px" style={{gridTemplateColumns: 'repeat(114, minmax(0, 1fr))'}}>{quranMetadata.map(surah => { const quality = memorizedSurahsQuality[surah.number]; const getQualityColor = (q: number) => `hsl(200, 60%, ${100 - (q * 4.5)}%)`; const color = quality ? getQualityColor(quality) : '#e2e8f0'; return <div key={surah.number} style={{backgroundColor: color}} title={`${surah.transliteratedName}`} className={`h-5 w-full first:rounded-l-sm last:rounded-r-sm`}></div> })}</div>
                    </section>
                 )}
                
                {selectedSections.readingChart && (
                    <section className="mt-8 page-break break-before-page">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{t('modals.exportReport.readingChart')}</h3>
                        <div className="bg-white border rounded-lg p-2">
                            <ProgressChart achievements={student.recitationAchievements} type="reading" maxPages={20} />
                        </div>
                    </section>
                )}
                 {selectedSections.hifdhChart && (
                     <section className="mt-8 page-break">
                        <h3 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200">{t('modals.exportReport.hifdhChart')}</h3>
                        <div className="bg-white border rounded-lg p-2">
                            <ProgressChart achievements={student.memorizationAchievements} type="memorization" maxPages={20} />
                        </div>
                    </section>
                 )}

                 <footer className="text-center text-xs text-gray-400 mt-10 pt-4 border-t">{t('modals.exportReport.footer', { date: new Date().toLocaleDateString(language) })}</footer>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ExportReportModal;