import React, { useState, useMemo, Fragment, useEffect } from 'react';
import { Student, SurahMetadata, TimePeriod, AttendanceStatus, RecitationAchievement, TafsirReview, AttendanceRecord, MemorizationAchievement, TafsirMemorizationReview, TajweedCompletion } from '../types';
import { getStudentCompletions } from '../services/tajweedService';
import { TOTAL_QURAN_PAGES, MILESTONES } from '../constants';
import AddRecitationAchievementModal from './AddRecitationAchievementModal';
import { calculateVersesAndPages, getRecitedPagesSet, getMemorizedPagesSet, getPageOfAyah, createOrUpdateSharedReport } from '../services/dataService';
import { safeCopy } from '../utils';
import { getStudentRankAndProgress, getOverallRankAndProgress, computeReportRanks, ReportRanks } from '../services/rankingService';
import AddTafsirAchievementModal from './AddTafsirAchievementModal';
import EditStudentDataModal from './EditStudentModal';
import ExportReportModal from './ExportReportModal';
import AddAttendanceModal from './AddAttendanceModal';
import ProgressChart from './ProgressChart';
import { useI18n } from '../context/I18nProvider';
import StudentHeader from './StudentHeader';
import ModernToggle from './ModernToggle';

interface StudentDetailPageProps {
    student: Student;
    students: Student[];
    quranMetadata: SurahMetadata[];
    // action props — optional when readOnly
    onUpdateStudent?: (student: Student) => void;
    onDeleteStudent?: (studentId: string) => void;
    onStartSession?: (studentId: string) => void;
    tajweedRules?: string[];
    onUpdateTajweedRules?: (rules: string[]) => void;
    onReviewMistakes?: () => void;
    /** Teacher id — needed to create/copy the student's shareable report link. */
    teacherId?: string;
    /** Precomputed ranks (public portal) — the portal only has this one student,
     *  so real ranks are computed by the tutor at share time and passed here. */
    overrideRanks?: ReportRanks;
    /** When true: hides all action buttons, modals, and the Add Achievement bar */
    readOnly?: boolean;
}

// Fix: Moved helper function outside component to resolve TypeScript generic inference issues.
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

const StudentDetailPage: React.FC<StudentDetailPageProps> = ({ student, students, quranMetadata, onUpdateStudent, onDeleteStudent, onStartSession, onReviewMistakes, teacherId, overrideRanks, readOnly = false }) => {
    // Fix: Replaced 'a.useState' with 'useState'.
    const [timePeriod, setTimePeriod] = useState<TimePeriod>(TimePeriod.AllTime);

    // ── Copy student's shareable report link (same link the Dashboard share button makes) ──
    const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>('idle');
    const handleShareLink = async () => {
        if (!teacherId || shareState === 'loading') return;
        setShareState('loading');
        try {
            const reportId = await createOrUpdateSharedReport(teacherId, student.id, student.name, {
                studentName: student.name,
                generatedAt: new Date().toISOString(),
                mistakes: student.mistakes || {},
                verses: [],
                homeworkVerses: [],
                // Include assigned homework so (re)creating the report doesn't wipe it
                // from the student's portal (the report is the student's link).
                quranHomework: student.quranHomework || [],
                ranks: computeReportRanks(student, students),
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
                await safeCopy(`${window.location.origin}/report/${reportId}`);
                setShareState('copied');
                setTimeout(() => setShareState('idle'), 3000);
            } else {
                setShareState('idle');
            }
        } catch {
            setShareState('idle');
        }
    };
    // Fix: Replaced 'a.useState' with 'useState'.
    const [activeModal, setActiveModal] = useState<string | null>(null);
    // Fix: Replaced 'a.useState' with 'useState'.
    const [calendarDate, setCalendarDate] = useState(new Date());

    // Fix: Replaced 'a.useState' with 'useState'.
    const [chartView, setChartView] = useState<'reading' | 'memorization'>('reading');
    const [tajweedCompletions, setTajweedCompletions] = useState<TajweedCompletion[]>([]);

    useEffect(() => {
        if (!student.id) return;
        getStudentCompletions(student.id).then(setTajweedCompletions);
    }, [student.id]);
    // Fix: Replaced 'a.useState' with 'useState'.
    const [quranBarView, setQuranBarView] = useState<'reading' | 'memorization'>('reading');
    // Fix: Replaced 'a.useState' with 'useState'.
    const [milestoneView, setMilestoneView] = useState<'reading' | 'memorization'>('reading');

    const { t, language } = useI18n();

    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const recitedPages = useMemo(() => getRecitedPagesSet(student), [student]);
    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const memorizedPages = useMemo(() => getMemorizedPagesSet(student), [student]);

    const getAge = (dob: string) => {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) { age--; }
        return age;
    };
    
    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const attendanceData = useMemo(() => {
        // FIX: Add explicit type to fix type inference issue with generic function.
        const attendance: AttendanceRecord[] = filterByTimePeriod(student.attendance, timePeriod);

        // Days that have an explicit attendance record (any status).
        const explicitDateStrings = new Set(attendance.map(a => new Date(a.date).toDateString()));

        // Any day with a recitation or memorization achievement counts as an implicit
        // "Present" — unless that day already has an explicit attendance record, which
        // could mark it as Absent or Rescheduled and takes precedence.
        const implicitPresentCount = [
            ...(filterByTimePeriod(student.recitationAchievements, timePeriod) as RecitationAchievement[]),
            ...(filterByTimePeriod(student.memorizationAchievements, timePeriod) as MemorizationAchievement[]),
        ].reduce((seen, ach) => {
            const ds = new Date(ach.date).toDateString();
            if (!explicitDateStrings.has(ds) && !seen.has(ds)) seen.add(ds);
            return seen;
        }, new Set<string>()).size;

        return {
            present: attendance.filter(a => a.status === AttendanceStatus.Present).length + implicitPresentCount,
            absent: attendance.filter(a => a.status === AttendanceStatus.Absent).length,
            rescheduled: attendance.filter(a => a.status === AttendanceStatus.Rescheduled).length,
        };
    }, [student.attendance, student.recitationAchievements, student.memorizationAchievements, timePeriod]);

    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const readingComputed = useMemo(() =>
        getStudentRankAndProgress(student, students, 'reading'),
        [student, students]
    );
    const hifdhComputed = useMemo(() =>
        getStudentRankAndProgress(student, students, 'memorization'),
        [student, students]
    );
    const overallComputed = useMemo(() =>
        getOverallRankAndProgress(student, students, 'reading'),
        [student, students]
    );

    // In the public portal `students` is just this one student, so rank would be
    // 1/1 — use the ranks the tutor precomputed at share time when provided.
    const readingRank   = overrideRanks ? overrideRanks.readingRank  : readingComputed.rank;
    const readingTotal  = overrideRanks ? overrideRanks.readingTotal : readingComputed.totalInGroup;
    const hifdhRank     = overrideRanks ? overrideRanks.hifdhRank    : hifdhComputed.rank;
    const hifdhTotal    = overrideRanks ? overrideRanks.hifdhTotal   : hifdhComputed.totalInGroup;
    const overallRank   = overrideRanks ? overrideRanks.overallReadingRank  : overallComputed.rank;
    const overallTotal  = overrideRanks ? overrideRanks.overallReadingTotal : overallComputed.total;
    const readingPagesToNext = overrideRanks ? null : readingComputed.pagesToNext;
    const readingNextStudentName = overrideRanks ? null : readingComputed.nextStudentName;
    const hifdhPagesToNext = overrideRanks ? null : hifdhComputed.pagesToNext;
    const hifdhNextStudentName = overrideRanks ? null : hifdhComputed.nextStudentName;
    
    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const readingData = useMemo(() => {
        // FIX: Add explicit type to fix type inference issue with generic function.
        const achievements: RecitationAchievement[] = filterByTimePeriod(student.recitationAchievements, timePeriod);
        const totalPages = student.recitationAchievements.reduce((sum, ach) => sum + ach.pagesCompleted, 0);
        const pagesRemaining = TOTAL_QURAN_PAGES - recitedPages.size;
        const totalVerses = achievements.reduce((sum, ach) => sum + ach.versesCompleted, 0);
        const avgQuality = achievements.length > 0 ? achievements.reduce((sum, ach) => sum + ach.readingQuality, 0) / achievements.length : 0;
        const lastAchievement = student.recitationAchievements.length > 0 ? [...student.recitationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
        const lastAchievementText = lastAchievement ? `${quranMetadata.find(s => s.number === lastAchievement.endSurah)?.name} ${lastAchievement.endAyah}` : 'N/A';

        return { totalPages: recitedPages.size, pagesRemaining, totalVerses, avgQuality, lastAchievementText };
    }, [student, timePeriod, quranMetadata, recitedPages]);

    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const memorizationData = useMemo(() => {
        // FIX: Add explicit type to fix type inference issue with generic function.
        const achievements: MemorizationAchievement[] = filterByTimePeriod(student.memorizationAchievements, timePeriod);
        const pagesRemaining = TOTAL_QURAN_PAGES - memorizedPages.size;
        const totalVerses = student.memorizationAchievements.reduce((sum, ach) => sum + ach.versesCompleted, 0);
        const avgQuality = achievements.length > 0 ? achievements.reduce((sum, ach) => sum + ach.memorizationQuality, 0) / achievements.length : 0;
        const lastAchievement = student.memorizationAchievements.length > 0 ? [...student.memorizationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
        const lastAchievementText = lastAchievement ? `${quranMetadata.find(s => s.number === lastAchievement.endSurah)?.name} ${lastAchievement.endAyah}` : 'N/A';
    
        // Combine initial memorization and subsequent reviews for a full recall history
        const allReviews: { surah: number, quality: number, date: string }[] = [];

        // 1. Get qualities from initial memorization achievements
        // FIX: Add explicit type to fix type inference issue with generic function.
        const memorizationAchievements: MemorizationAchievement[] = filterByTimePeriod(student.memorizationAchievements, timePeriod);
        memorizationAchievements.forEach(ach => {
            for (let i = ach.startSurah; i <= ach.endSurah; i++) {
                allReviews.push({ surah: i, quality: ach.memorizationQuality, date: ach.date });
            }
        });

        // 2. Get qualities from explicit reviews
        // FIX: Add explicit type to fix type inference issue with generic function.
        const tafsirMemorizationReviews: TafsirMemorizationReview[] = filterByTimePeriod(student.tafsirMemorizationReviews, timePeriod);
        tafsirMemorizationReviews.forEach(review => {
            allReviews.push({ surah: review.surah, quality: review.reviewQuality, date: review.date });
        });

        return { totalPages: memorizedPages.size, pagesRemaining, totalVerses, avgQuality, lastAchievementText };
    }, [student, timePeriod, quranMetadata, memorizedPages]);

    const getSurahQualityMap = (achievements: RecitationAchievement[] | MemorizationAchievement[]): Record<number, number> => {
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

    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const recitedSurahsQuality = useMemo(() => getSurahQualityMap(student.recitationAchievements), [student.recitationAchievements]);
    // Fix: Replaced 'a.useMemo' with 'useMemo'.
    const memorizedSurahsQuality = useMemo(() => getSurahQualityMap(student.memorizationAchievements), [student.memorizationAchievements]);

    // Per-surah progress table: full-surah completion counts + partial verse ranges
    const surahProgressTable = useMemo(() => {
        type TypeData = { fullCount: number; partialRanges: string[] };
        const map: Record<number, { reading: TypeData; hifz: TypeData; tafseer: TypeData }> = {};
        const ensure = (s: number) => {
            if (!map[s]) map[s] = {
                reading:  { fullCount: 0, partialRanges: [] },
                hifz:     { fullCount: 0, partialRanges: [] },
                tafseer:  { fullCount: 0, partialRanges: [] },
            };
        };

        // Returns true when surah `s` is fully covered by this achievement
        const isFull = (s: number, ach: { startSurah: number; startAyah: number; endSurah: number; endAyah: number }) => {
            const meta = quranMetadata.find(m => m.number === s);
            if (!meta) return false;
            const last = meta.numberOfAyahs;
            const startOk = s === ach.startSurah ? ach.startAyah === 1 : true;
            const endOk   = s === ach.endSurah   ? ach.endAyah   === last : true;
            return startOk && endOk;
        };

        // Returns "from–to" string when coverage is partial; null when the whole surah is covered
        const partialRange = (s: number, ach: { startSurah: number; startAyah: number; endSurah: number; endAyah: number }): string | null => {
            const meta = quranMetadata.find(m => m.number === s);
            if (!meta) return null;
            const last  = meta.numberOfAyahs;
            const from  = s === ach.startSurah ? ach.startAyah : 1;
            const to    = s === ach.endSurah   ? ach.endAyah   : last;
            return (from === 1 && to === last) ? null : `${from}–${to}`;
        };

        // Reading
        (filterByTimePeriod(student.recitationAchievements, timePeriod) as RecitationAchievement[]).forEach(ach => {
            for (let s = ach.startSurah; s <= ach.endSurah; s++) {
                ensure(s);
                if (isFull(s, ach)) { map[s].reading.fullCount++; }
                else { const r = partialRange(s, ach); if (r) map[s].reading.partialRanges.push(r); }
            }
        });

        // Hifz
        (filterByTimePeriod(student.memorizationAchievements, timePeriod) as MemorizationAchievement[]).forEach(ach => {
            for (let s = ach.startSurah; s <= ach.endSurah; s++) {
                ensure(s);
                if (isFull(s, ach)) { map[s].hifz.fullCount++; }
                else { const r = partialRange(s, ach); if (r) map[s].hifz.partialRanges.push(r); }
            }
        });

        // Tafseer — old single-surah and new verse-range format
        (filterByTimePeriod(student.tafsirReviews, timePeriod) as TafsirReview[]).forEach(rev => {
            const startSurah = rev.startSurah ?? rev.surah;
            const endSurah   = rev.endSurah   ?? rev.surah;
            const startAyah  = rev.startAyah  ?? 1;
            const endAyah    = rev.endAyah    ?? (quranMetadata.find(m => m.number === endSurah)?.numberOfAyahs ?? 1);
            const achLike    = { startSurah, startAyah, endSurah, endAyah };
            for (let s = startSurah; s <= endSurah; s++) {
                ensure(s);
                if (isFull(s, achLike)) { map[s].tafseer.fullCount++; }
                else { const r = partialRange(s, achLike); if (r) map[s].tafseer.partialRanges.push(r); }
            }
        });

        return Object.entries(map)
            .map(([surahNum, data]) => ({ surahNum: +surahNum, ...data }))
            .sort((a, b) => a.surahNum - b.surahNum);
    }, [student, timePeriod, quranMetadata]);

    const handleAddAchievement = (achievementData: (Omit<RecitationAchievement, 'id' | 'pagesCompleted' | 'versesCompleted'> & { type: 'reading' }) | (Omit<MemorizationAchievement, 'id' | 'pagesCompleted' | 'versesCompleted'> & { type: 'memorization' })) => {
        const achievementDate = new Date(achievementData.date);
        achievementDate.setUTCHours(12, 0, 0, 0);
        const newAttendance: AttendanceRecord = { id: `att-${Date.now()}`, date: achievementDate.toISOString(), status: AttendanceStatus.Present };
        const hasAttendanceOnThisDay = student.attendance.some(a => new Date(a.date).toDateString() === achievementDate.toDateString());
        const updatedAttendance = hasAttendanceOnThisDay ? student.attendance : [...student.attendance, newAttendance];
        let updatedStudent = { ...student, attendance: updatedAttendance };

        if (achievementData.type === 'reading') {
            const { verses, pages } = calculateVersesAndPages(achievementData.startSurah, achievementData.startAyah, achievementData.endSurah, achievementData.endAyah);
            const newAchievement: RecitationAchievement = { ...achievementData, id: `rec-${Date.now()}`, pagesCompleted: pages, versesCompleted: verses };
            updatedStudent = { ...updatedStudent, recitationAchievements: [...student.recitationAchievements, newAchievement] };
        } else {
            const { date, startSurah, startAyah, endSurah, endAyah, notes, memorizationQuality } = achievementData;
        
            const existingPages = getMemorizedPagesSet(student);
            const startPage = getPageOfAyah(startSurah, startAyah);
            const endPage = getPageOfAyah(endSurah, endAyah);

            let isPurelyRevision = true;
            if (startPage > 0 && endPage > 0) {
                for (let p = startPage; p <= endPage; p++) {
                    if (!existingPages.has(p)) {
                        isPurelyRevision = false;
                        break;
                    }
                }
            } else if (startPage === 0 || endPage === 0) {
                isPurelyRevision = false; // Cannot determine pages, so assume it's new.
            }

            if (isPurelyRevision) {
                // This is a review of already memorized surahs.
                const newReviews: TafsirMemorizationReview[] = [];
                for (let i = startSurah; i <= endSurah; i++) {
                    newReviews.push({
                        id: `tafsir-mem-${Date.now()}-${i}`,
                        date: date,
                        surah: i,
                        reviewQuality: memorizationQuality
                    });
                }
                updatedStudent = {
                    ...updatedStudent,
                    tafsirMemorizationReviews: [...student.tafsirMemorizationReviews, ...newReviews]
                };
            } else {
                // This is a new Hifdh achievement or extends a previous one.
                const { verses, pages } = calculateVersesAndPages(startSurah, startAyah, endSurah, endAyah);

                // Note: The `versesCompleted` and `pagesCompleted` will cause double-counting if the user logs overlapping ranges.
                // The main stats (`totalPages`, `totalVerses`) should be calculated from the set of unique pages/verses to be accurate.
                // For now, `totalPages` is accurate via `memorizedPages.size`. `totalVerses` is a sum and may be inflated by overlaps.
                
                const newAchievement: MemorizationAchievement = {
                    id: `mem-${Date.now()}`,
                    date,
                    startSurah,
                    startAyah,
                    endSurah,
                    endAyah,
                    notes,
                    memorizationQuality,
                    pagesCompleted: pages,
                    versesCompleted: verses,
                };
                updatedStudent = {
                    ...updatedStudent,
                    memorizationAchievements: [...student.memorizationAchievements, newAchievement]
                };
            }
        }
        onUpdateStudent(updatedStudent);
        setActiveModal(null);
    };

    
    const handleAddTafsirReviews = (reviews: Array<{ surah: number, quality: number }>) => {
        const newTafsirReviews: TafsirReview[] = reviews.map(r => ({ id: `tafsir-${Date.now()}-${r.surah}`, date: new Date().toISOString(), surah: r.surah, reviewQuality: r.quality }));
        const updatedStudent = { ...student, tafsirReviews: [...student.tafsirReviews, ...newTafsirReviews] };
        onUpdateStudent(updatedStudent);
        setActiveModal(null);
    };

    const handleAddAttendance = (record: Omit<AttendanceRecord, 'id'>) => {
        const newAttendance: AttendanceRecord = { ...record, id: `att-${Date.now()}` };
        const newDateString = new Date(newAttendance.date).toDateString();
        const filteredAttendance = student.attendance.filter(a => new Date(a.date).toDateString() !== newDateString);
        onUpdateStudent({ ...student, attendance: [...filteredAttendance, newAttendance] });
        setActiveModal(null);
    };

    // ── Rich Progress Calendar ───────────────────────────────────────────────
    type CalDayEntry = {
        type: 'reading' | 'reading-revision' | 'hifz' | 'hifz-revision' | 'tafsir';
        label: string;
        badgeCls: string;
    };

    const calEntriesMap = useMemo(() => {
        type RawSeg = { startSurah: number; startAyah: number; endSurah: number; endAyah: number };
        // day → type → list of raw segments (one per logged achievement)
        const raw = new Map<string, Map<CalDayEntry['type'], RawSeg[]>>();

        const addRaw = (dateStr: string, type: CalDayEntry['type'], seg: RawSeg) => {
            if (!raw.has(dateStr)) raw.set(dateStr, new Map());
            const dm = raw.get(dateStr)!;
            if (!dm.has(type)) dm.set(type, []);
            dm.get(type)!.push(seg);
        };

        student.recitationAchievements.forEach(a =>
            addRaw(new Date(a.date).toDateString(),
                a.isRevision ? 'reading-revision' : 'reading',
                { startSurah: a.startSurah, startAyah: a.startAyah, endSurah: a.endSurah, endAyah: a.endAyah })
        );
        student.memorizationAchievements.forEach(a =>
            addRaw(new Date(a.date).toDateString(),
                a.isRevision ? 'hifz-revision' : 'hifz',
                { startSurah: a.startSurah, startAyah: a.startAyah, endSurah: a.endSurah, endAyah: a.endAyah })
        );
        student.tafsirReviews.forEach(a => {
            const ss = a.startSurah ?? a.surah;
            const sa = a.startAyah ?? 1;
            const es = a.endSurah ?? a.surah;
            const ea = a.endAyah ?? (quranMetadata.find(s => s.number === es)?.numberOfAyahs ?? 1);
            addRaw(new Date(a.date).toDateString(), 'tafsir',
                { startSurah: ss, startAyah: sa, endSurah: es, endAyah: ea });
        });

        // Format a merged segment into a readable label
        const fmtRange = (ss: number, sa: number, es: number, ea: number): string => {
            const startMeta = quranMetadata.find(s => s.number === ss);
            const endMeta   = quranMetadata.find(s => s.number === es);
            const sn = startMeta?.transliteratedName ?? `S${ss}`;
            const en = endMeta?.transliteratedName   ?? `S${es}`;
            if (ss !== es) return `${sn} – ${en}`;                          // multi-surah range
            if (sa === 1 && ea === (startMeta?.numberOfAyahs ?? ea)) return sn; // full surah
            return `${sn} ${sa}–${ea}`;                                      // partial surah
        };

        const BADGE_CLS: Record<CalDayEntry['type'], string> = {
            'reading':          'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
            'reading-revision': 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
            'hifz':             'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
            'hifz-revision':    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
            'tafsir':           'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
        };
        const TYPE_ORDER: CalDayEntry['type'][] = ['reading', 'reading-revision', 'hifz', 'hifz-revision', 'tafsir'];

        const map = new Map<string, CalDayEntry[]>();

        raw.forEach((dayMap, dateStr) => {
            const entries: CalDayEntry[] = [];
            TYPE_ORDER.forEach(type => {
                const segs = dayMap.get(type);
                if (!segs?.length) return;

                // Sort by startSurah, then startAyah
                segs.sort((a, b) => a.startSurah !== b.startSurah
                    ? a.startSurah - b.startSurah
                    : a.startAyah - b.startAyah);

                // Merge consecutive / adjacent segments into one range
                const merged: RawSeg[] = [];
                for (const seg of segs) {
                    if (!merged.length) { merged.push({ ...seg }); continue; }
                    const last = merged[merged.length - 1];
                    // Adjacent = last ends at surah N and next starts at surah N+1,
                    // OR both in the same surah with touching ayah numbers
                    const adjacent =
                        last.endSurah + 1 === seg.startSurah ||
                        (last.endSurah === seg.startSurah && last.endAyah >= seg.startAyah - 1);
                    if (adjacent) {
                        last.endSurah = seg.endSurah;
                        last.endAyah  = seg.endAyah;
                    } else {
                        merged.push({ ...seg });
                    }
                }

                merged.forEach(m => entries.push({
                    type,
                    label: fmtRange(m.startSurah, m.startAyah, m.endSurah, m.endAyah),
                    badgeCls: BADGE_CLS[type],
                }));
            });
            if (entries.length) map.set(dateStr, entries);
        });

        return map;
    }, [student.recitationAchievements, student.memorizationAchievements, student.tafsirReviews, quranMetadata]);

    const calAttendanceMap = useMemo(
        () => new Map(student.attendance.map(a => [new Date(a.date).toDateString(), a.status])),
        [student.attendance]
    );

    const ProgressCalendar = () => {
        const month = calendarDate.getMonth();
        const year  = calendarDate.getFullYear();
        const firstDay   = new Date(year, month, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const TYPE_ICONS: Record<CalDayEntry['type'], string> = {
            'reading': '📖',
            'reading-revision': '🔄',
            'hifz': '🧠',
            'hifz-revision': '↩️',
            'tafsir': '📚',
        };

        const cells: React.ReactNode[] = [];
        for (let i = 0; i < firstDay; i++) {
            cells.push(<div key={`e-${i}`} className="min-h-[100px]" />);
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const date   = new Date(year, month, day);
            const ds     = date.toDateString();
            const status  = calAttendanceMap.get(ds);
            const entries = calEntriesMap.get(ds) ?? [];
            const isToday = ds === new Date().toDateString();
            const hasProgress = entries.length > 0;

            // header strip colour
            let headerCls = 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400';
            let borderCls = 'border-slate-200 dark:border-gray-600';
            if (status === AttendanceStatus.Absent) {
                headerCls = 'bg-red-400 text-white'; borderCls = 'border-red-300 dark:border-red-700';
            } else if (status === AttendanceStatus.Rescheduled) {
                headerCls = 'bg-orange-400 text-white'; borderCls = 'border-orange-300 dark:border-orange-600';
            } else if (status === AttendanceStatus.Present || hasProgress) {
                headerCls = 'bg-emerald-400 text-white'; borderCls = 'border-emerald-300 dark:border-emerald-700';
            }

            cells.push(
                <div key={day} className={`rounded-lg border ${borderCls} flex flex-col min-h-[100px] overflow-hidden ${isToday ? 'ring-2 ring-teal-500 dark:ring-orange-500 ring-offset-1' : ''}`}>
                    {/* Day number strip */}
                    <div className={`${headerCls} px-1.5 py-0.5 text-center flex-shrink-0`}>
                        <span className="text-xs font-bold leading-none">{day}</span>
                    </div>
                    {/* Absent / Rescheduled label */}
                    {status === AttendanceStatus.Absent && entries.length === 0 && (
                        <div className="flex-1 flex items-center justify-center p-1">
                            <span className="text-[9px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wide">{t('studentDetail.absent')}</span>
                        </div>
                    )}
                    {status === AttendanceStatus.Rescheduled && entries.length === 0 && (
                        <div className="flex-1 flex items-center justify-center p-1">
                            <span className="text-[9px] font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wide">{t('studentDetail.rescheduled')}</span>
                        </div>
                    )}
                    {/* Entry badges */}
                    {entries.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 p-1 content-start overflow-hidden">
                            {status === AttendanceStatus.Absent && (
                                <span className="text-[8px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wide px-1 py-0.5 w-full">{t('studentDetail.absent')}</span>
                            )}
                            {status === AttendanceStatus.Rescheduled && (
                                <span className="text-[8px] font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wide px-1 py-0.5 w-full">{t('studentDetail.rescheduled')}</span>
                            )}
                            {entries.map((e, i) => (
                                <span key={i} className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded-full leading-tight whitespace-nowrap ${e.badgeCls}`}>
                                    <span>{TYPE_ICONS[e.type]}</span>
                                    <span>{e.label}</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        const dayNames = language === 'ar'
            ? ['أحد', 'إثن', 'ثلث', 'أرب', 'خمس', 'جمع', 'سبت']
            : language === 'tr'
            ? ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
            : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5">
                {/* Title + nav */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={() => setCalendarDate(new Date(year, month - 1))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-slate-300 text-lg font-bold transition-colors">
                        ‹
                    </button>
                    <div className="text-center">
                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">
                            {calendarDate.toLocaleString(language === 'ar' ? 'ar' : language === 'tr' ? 'tr' : 'en', { month: 'long', year: 'numeric' })}
                        </h3>
                        {/* Status legend */}
                        <div className="flex items-center justify-center gap-3 mt-1.5">
                            {[
                                { cls: 'bg-emerald-400', label: t('studentDetail.progressPresent') },
                                { cls: 'bg-red-400',     label: t('studentDetail.absent') },
                                { cls: 'bg-orange-400',  label: t('studentDetail.rescheduled') },
                            ].map(l => (
                                <span key={l.label} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span className={`w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0 ${l.cls}`} />
                                    {l.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setCalendarDate(new Date(year, month + 1))}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-slate-300 text-lg font-bold transition-colors">
                        ›
                    </button>
                </div>

                {/* Day-name header row */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                    {dayNames.map(d => (
                        <div key={d} className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1">{d}</div>
                    ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7 gap-1">{cells}</div>

                {/* Badge type legend */}
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                    {[
                        { icon: '📖', label: 'Reading',          cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300' },
                        { icon: '🔄', label: 'Reading Revision',  cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' },
                        { icon: '🧠', label: 'Hifz',              cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
                        { icon: '↩️', label: 'Hifz Revision',    cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' },
                        { icon: '📚', label: 'Tafsir',            cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
                    ].map(l => (
                        <span key={l.label} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${l.cls}`}>
                            {l.icon} {l.label}
                        </span>
                    ))}
                </div>
            </div>
        );
    };
    
    const ProgressSection = ({ pagesCompleted, qualityMap }: { pagesCompleted: number; qualityMap: Record<number, number> }) => (
        <>
            <div className="flex justify-end items-center mb-3">
                <span className="font-bold text-teal-600 dark:text-orange-400 text-sm">{t('studentDetail.completePercent', { percent: ((pagesCompleted / TOTAL_QURAN_PAGES) * 100).toFixed(1) })}</span>
            </div>
            <div className={readOnly ? '-mx-1' : 'overflow-x-auto -mx-1'}>
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(114, minmax(0, 1fr))', minWidth: readOnly ? undefined : '600px' }}>
                {quranMetadata.map(surah => {
                    const quality = qualityMap[surah.number];
                    const getQualityColor = (q: number) => {
                        if (q > 9) return 'bg-orange-600'; if (q > 7) return 'bg-orange-500';
                        if (q > 5) return 'bg-orange-400'; if (q > 3) return 'bg-orange-300';
                        return 'bg-orange-200';
                    };
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
            </div>
        </>
    );

    const MilestoneSection = ({ completedPages }: { completedPages: Set<number> }) => (
        <div className={readOnly ? '-mx-1 px-1' : 'overflow-x-auto -mx-1 px-1'}>
        <div className={readOnly ? 'flex flex-wrap items-center justify-center gap-y-3' : 'flex items-center min-w-max'}>
            {MILESTONES.map((milestone, index) => {
                const achieved = milestone.isAchieved(completedPages);
                const IconComponent = milestone.badgeIcon;
                return (
                    // Fix: Replaced 'a.Fragment' with 'Fragment'.
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
        </div>
    );
    


    return (
        <div className="space-y-6">
            {!readOnly && (
                <StudentHeader
                    student={student}
                    onOpenModal={setActiveModal}
                    onStartSession={() => onStartSession?.(student.id)}
                    readingPagesToNext={readingPagesToNext}
                    readingNextStudentName={readingNextStudentName}
                    hifdhPagesToNext={hifdhPagesToNext}
                    hifdhNextStudentName={hifdhNextStudentName}
                    onReviewMistakes={onReviewMistakes ?? (() => {})}
                    onShareLink={teacherId ? handleShareLink : undefined}
                    shareState={shareState}
                />
            )}

            {/* ── Add New Achievement — centered icon tabs ── */}
            {!readOnly && (
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-4 py-5">
                    <div className="flex justify-center gap-3">

                        {/* Reading / Hifdh */}
                        <button
                            onClick={() => setActiveModal('recitation')}
                            className="group flex flex-col items-center gap-2.5 w-28 py-4 rounded-2xl border border-teal-100 dark:border-teal-900/60 bg-teal-50/50 dark:bg-teal-900/10 hover:bg-teal-50 dark:hover:bg-teal-900/25 hover:border-teal-300 dark:hover:border-teal-700 hover:shadow-sm transition-all duration-200"
                        >
                            <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-300 group-hover:scale-110 transition-transform duration-200">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                                </svg>
                            </div>
                            <span className="text-xs font-semibold text-teal-700 dark:text-teal-300 leading-tight text-center">{t('studentDetail.readingHifdh')}</span>
                        </button>

                        {/* Tafsir */}
                        <button
                            onClick={() => setActiveModal('tafsir')}
                            className="group flex flex-col items-center gap-2.5 w-28 py-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/25 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all duration-200"
                        >
                            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-300 group-hover:scale-110 transition-transform duration-200">
                                <span className="material-symbols-outlined leading-none" style={{ fontVariationSettings: "'FILL' 1", fontSize: '20px' }}>cognition</span>
                            </div>
                            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 leading-tight text-center">{t('studentDetail.tafsir')}</span>
                        </button>

                        {/* Attendance */}
                        <button
                            onClick={() => setActiveModal('attendance')}
                            className="group flex flex-col items-center gap-2.5 w-28 py-4 rounded-2xl border border-amber-100 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/25 hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-sm transition-all duration-200"
                        >
                            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-300 group-hover:scale-110 transition-transform duration-200">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" />
                                </svg>
                            </div>
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 leading-tight text-center">{t('studentDetail.attendance')}</span>
                        </button>

                    </div>
                </div>
            )}

            {/* ── Progress Calendar (full-width) ── */}
            <ProgressCalendar />

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
                        <StatCard title={t('studentDetail.rankAmongAll')} value={`${overallRank} / ${overallTotal}`} subtext={t('studentDetail.allAgeGroups')} icon={<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M9.661 2.237a.531.531 0 0 1 .678 0 11.947 11.947 0 0 0 7.078 2.749.5.5 0 0 1 .479.425c.069.52.104 1.05.104 1.59 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 0 1-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 0 1 .48-.425 11.947 11.947 0 0 0 7.077-2.75Z" /></svg>} />
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
                     <ProgressChart achievements={student.recitationAchievements} type="reading" />
                ) : (
                    <ProgressChart achievements={student.memorizationAchievements} type="memorization" />
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

            <div className="space-y-6">
                <div>
                    {/* Completed Tajweed Lessons */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                        <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
                            <span>🎓</span> {t('studentDetail.completedTajweedLessons')}
                            <span className="text-xs font-normal text-slate-400 dark:text-slate-500 ml-1">({tajweedCompletions.length})</span>
                        </h3>
                        {tajweedCompletions.length > 0 ? (
                            <ul className="divide-y divide-slate-100 dark:divide-gray-700">
                                {tajweedCompletions.map(c => (
                                    <li key={c.lessonId} className="py-2 flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="bg-green-100 dark:bg-green-900/50 rounded-full p-1 flex-shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600 dark:text-green-400">
                                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{c.lessonTitle}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 flex-shrink-0">{new Date(c.completedAt).toLocaleDateString()}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400 italic text-sm">{t('studentDetail.noTajweedLessonsCompleted')}</p>
                        )}
                    </div>
                    {/* ── Surah progress table ── */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                        <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-3">{t('studentDetail.surahProgress')}</h3>
                        {surahProgressTable.length === 0 ? (
                            <p className="text-slate-500 dark:text-slate-400 italic text-sm">{t('studentDetail.noProgressLogged')}</p>
                        ) : (
                            <div className="overflow-x-auto max-h-72 overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-white dark:bg-gray-800">
                                        <tr className="border-b border-slate-200 dark:border-gray-700">
                                            <th className="text-left py-2 pr-4 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">{t('studentDetail.surahCol')}</th>
                                            <th className="text-center py-2 px-3 font-semibold text-teal-600 dark:text-teal-400 text-xs uppercase tracking-wide">📖 {t('studentDetail.readingCol')}</th>
                                            <th className="text-center py-2 px-3 font-semibold text-sky-600 dark:text-sky-400 text-xs uppercase tracking-wide">🧠 {t('studentDetail.hifzCol')}</th>
                                            <th className="text-center py-2 px-3 font-semibold text-amber-600 dark:text-amber-400 text-xs uppercase tracking-wide">📚 {t('studentDetail.tafseerCol')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-gray-700/60">
                                        {surahProgressTable.map(row => {
                                            const surah = quranMetadata.find(s => s.number === row.surahNum);
                                            if (!surah) return null;

                                            const renderCell = (data: { fullCount: number; partialRanges: string[] }, colorFull: string, colorPartial: string) => {
                                                const hasPartial = data.partialRanges.length > 0;
                                                if (data.fullCount === 0 && !hasPartial) {
                                                    return <span className="text-slate-300 dark:text-slate-600 text-base">—</span>;
                                                }
                                                return (
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        {data.fullCount > 0 && (
                                                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full font-bold text-xs ${colorFull}`}>
                                                                {data.fullCount}
                                                            </span>
                                                        )}
                                                        {hasPartial && (
                                                            <span className={`text-[10px] font-medium leading-tight ${colorPartial}`}>
                                                                {data.partialRanges.join(', ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            };

                                            return (
                                                <tr key={row.surahNum} className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-colors">
                                                    <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-200">
                                                        <span className="text-xs text-slate-400 dark:text-slate-500 mr-1.5">{row.surahNum}.</span>
                                                        {surah.transliteratedName}
                                                    </td>
                                                    <td className="text-center py-2 px-3">
                                                        {renderCell(row.reading, 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300', 'text-teal-600 dark:text-teal-400')}
                                                    </td>
                                                    <td className="text-center py-2 px-3">
                                                        {renderCell(row.hifz, 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300', 'text-sky-600 dark:text-sky-400')}
                                                    </td>
                                                    <td className="text-center py-2 px-3">
                                                        {renderCell(row.tafseer, 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', 'text-amber-600 dark:text-amber-400')}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {!readOnly && <>
                <AddRecitationAchievementModal isOpen={activeModal === 'recitation'} onClose={() => setActiveModal(null)} onAddAchievement={handleAddAchievement} quranMetadata={quranMetadata} />
                <AddTafsirAchievementModal
                    isOpen={activeModal === 'tafsir'}
                    onClose={() => setActiveModal(null)}
                    onAddTafsirReviews={handleAddTafsirReviews}
                    quranMetadata={quranMetadata}
                />
                <AddAttendanceModal isOpen={activeModal === 'attendance'} onClose={() => setActiveModal(null)} onAddAttendance={handleAddAttendance} />
                <EditStudentDataModal isOpen={activeModal === 'edit'} onClose={() => setActiveModal(null)} student={student} onUpdateStudent={onUpdateStudent!} onDeleteStudent={onDeleteStudent!} quranMetadata={quranMetadata} />
                <ExportReportModal isOpen={activeModal === 'export'} onClose={() => setActiveModal(null)} student={student} students={students} quranMetadata={quranMetadata} />
            </>}
        </div>
    );
};

export default StudentDetailPage;