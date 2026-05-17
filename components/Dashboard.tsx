import React, { useState, useMemo } from 'react';
import { Student, SortCriteria, SurahMetadata, AttendanceStatus, AgeCategory } from '../types';
import { getBirthdayStatus } from '../utils';
import { getRecitedPagesSet, getMemorizedPagesSet, getPageOfAyah } from '../services/dataService';
import { MILESTONES, TOTAL_QURAN_PAGES, MISTAKE_PENALTY_POINTS } from '../constants';
import MilestoneBadge from './MilestoneBadge';
import { useI18n } from '../context/I18nProvider';
import HonorBoardModal from './HonorBoardModal';

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
    const recitedPages = getRecitedPagesSet(student);
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


const StudentCard: React.FC<{ student: Student; onSelect: () => void; quranMetadata: SurahMetadata[]; viewMode: 'points' | 'mistakesRate' }> = ({ student, onSelect, quranMetadata, viewMode }) => {
    const { t, language } = useI18n();

    const { isInactive, daysSinceLastActivity } = useMemo(() => {
        const allDates = [
            ...student.recitationAchievements.map(a => new Date(a.date).getTime()),
            ...student.memorizationAchievements.map(a => new Date(a.date).getTime()),
            ...student.attendance.map(a => new Date(a.date).getTime()),
        ];

        if (allDates.length === 0) {
            return { isInactive: false, daysSinceLastActivity: null };
        }

        const lastActivityTime = Math.max(...allDates);
        const today = new Date().getTime();
        const diffTime = Math.abs(today - lastActivityTime);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return {
            isInactive: diffDays > 14,
            daysSinceLastActivity: diffDays,
        };
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
                rounded-xl shadow-sm transition-all cursor-pointer border overflow-hidden
                ${isInactive
                    ? 'bg-slate-100 dark:bg-gray-800/80 border-dashed border-slate-300 dark:border-gray-700 opacity-80 hover:opacity-100'
                    : 'bg-white dark:bg-gray-800 hover:shadow-lg hover:scale-[1.02] dark:border-gray-700'
                }
            `}
        >
            {/* Top Section */}
            <div className={`p-4 ${isInactive 
                ? 'bg-slate-50 dark:bg-gray-800/50' 
                : 'bg-gradient-to-br from-teal-50 to-orange-50 dark:from-gray-800 dark:to-slate-800/60'
            }`}>
                 <div className="flex justify-between items-start">
                    <div className="flex-grow">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <h3 className={`font-extrabold text-xl truncate ${isInactive ? 'text-slate-600 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>{student.name}</h3>
                            {viewMode === 'points' ? (
                              <span className="text-xs font-mono bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full whitespace-nowrap">{Math.round(score).toLocaleString()} pts</span>
                            ) : (
                              <span className="text-xs font-semibold bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {(readingRate + tajweedRate).toFixed(2)} err/pg
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
                      <p className={`text-xl font-bold ${readingRate === 0 ? 'text-emerald-500 dark:text-emerald-400' : readingRate < 0.5 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {readingRate.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-tight">reading<br/>mistakes/pg</p>
                    </div>
                    <div className="h-6 w-px bg-slate-200 dark:bg-gray-700"></div>
                    <div className="text-center">
                      <p className={`text-xl font-bold ${tajweedRate === 0 ? 'text-emerald-500 dark:text-emerald-400' : tajweedRate < 0.5 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'}`}>
                        {tajweedRate.toFixed(2)}
                      </p>
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
}

const Dashboard: React.FC<DashboardProps> = ({ students, onSelectStudent, quranMetadata, onFamilyLinks, onAddStudent }) => {
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>(SortCriteria.HighestPoints);
  const [viewMode, setViewMode] = useState<'points' | 'mistakesRate'>('points');
  const [searchQuery, setSearchQuery] = useState('');
  const [isHonorBoardOpen, setIsHonorBoardOpen] = useState(false);
  const { t } = useI18n();

  const sortedStudents = useMemo(() => {
    const filtered = students.filter(student =>
        student.name.toLowerCase().includes(searchQuery.toLowerCase())
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
          const getMistakeRate = (s: Student) => {
            const rp = getRecitedPagesSet(s);
            const valid = Object.entries(s.mistakes || {}).filter(([key]) => {
              const [su, ay] = key.split(':').map(Number);
              return !isNaN(su) && !isNaN(ay) && rp.has(getPageOfAyah(su, ay));
            });
            return rp.size > 0 ? valid.length / rp.size : 0;
          };
          return getMistakeRate(a) - getMistakeRate(b);
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
          {studentGroups.youngGems.length > 0 ? studentGroups.youngGems.map(student => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} viewMode={viewMode} />
          )) : <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-orange-500 dark:border-yellow-500 pb-2">{t('dashboard.aspiringScholars')}</h2>
          {studentGroups.aspiringScholars.length > 0 ? studentGroups.aspiringScholars.map(student => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} viewMode={viewMode} />
          )): <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-sky-500 dark:border-cyan-500 pb-2">{t('dashboard.devotedLearners')}</h2>
          {studentGroups.devotedLearners.length > 0 ? studentGroups.devotedLearners.map(student => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} viewMode={viewMode} />
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