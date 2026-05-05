import React, { useState, useMemo } from 'react';
import { Student, SortCriteria, SurahMetadata, AttendanceStatus } from '../types';
import { getBirthdayStatus } from '../utils';
import { getRecitedPagesSet, getMemorizedPagesSet, getPageOfAyah } from '../services/dataService';
import { MILESTONES, TOTAL_QURAN_PAGES, MISTAKE_PENALTY_POINTS } from '../constants';
import MilestoneBadge from './MilestoneBadge';
import { useI18n } from '../context/I18nProvider';
import HonorBoardModal from './HonorBoardModal';

const getAge = (dob: string) => {
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


const StudentCard: React.FC<{ student: Student; onSelect: () => void, quranMetadata: SurahMetadata[] }> = ({ student, onSelect, quranMetadata }) => {
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
                            <span className="text-xs font-mono bg-slate-200 dark:bg-gray-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full whitespace-nowrap">{Math.round(score).toLocaleString()} pts</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">{t('studentCard.yearsOld', { age: getAge(student.dob) })}</p>
                    </div>
                     <div className="flex items-center flex-shrink-0 gap-1.5 ml-2">
                        {achievedReadingMilestones.slice(0, 2).map(m => <MilestoneBadge key={`read-${m.id}`} milestone={m} type="reading" />)}
                        {achievedHifdhMilestones.slice(0, 2).map(m => <MilestoneBadge key={`hifdh-${m.id}`} milestone={m} type="memorization" />)}
                    </div>
                 </div>
            </div>
            
            <BirthdayBanner dob={student.dob} name={student.name} />
            
            {/* Content Section */}
            <div className="px-4 py-2">
                {/* Main Stats */}
                <div className="flex justify-around items-center text-center">
                    <div className="flex items-baseline gap-1.5">
                        <p className={`text-xl font-bold ${isInactive ? 'text-slate-500 dark:text-slate-400' : 'text-teal-600 dark:text-orange-400'}`}>{totalPagesRead}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentCard.pagesRead')}</p>
                    </div>
                    <div className="h-6 w-px bg-slate-200 dark:bg-gray-700"></div> {/* Separator */}
                    <div className="flex items-baseline gap-1.5">
                        <p className={`text-xl font-bold ${isInactive ? 'text-slate-500 dark:text-slate-400' : 'text-sky-600 dark:text-sky-400'}`}>{totalPagesMemorized}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t('studentCard.hifdhPages')}</p>
                    </div>
                </div>
                
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
}

const Dashboard: React.FC<DashboardProps> = ({ students, onSelectStudent, quranMetadata }) => {
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>(SortCriteria.HighestPoints);
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
          return getAge(a.dob) - getAge(b.dob);
        default:
          return 0;
      }
    });
  }, [students, sortCriteria, searchQuery]);

  const studentGroups = useMemo(() => {
    const youngGems = sortedStudents.filter(s => { const age = getAge(s.dob); return age >= 4 && age <= 15; });
    const aspiringScholars = sortedStudents.filter(s => { const age = getAge(s.dob); return age >= 16 && age <= 35; });
    const devotedLearners = sortedStudents.filter(s => { const age = getAge(s.dob); return age >= 36; });
    return { youngGems, aspiringScholars, devotedLearners };
  }, [sortedStudents]);

  return (
    <div>
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        {/* Left side: Sorting */}
        <div className="w-full md:w-auto">
          <div className="bg-white dark:bg-gray-800 p-1 rounded-lg shadow-sm flex items-center gap-1 flex-wrap">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 px-2 flex-shrink-0">{t('dashboard.sortBy')}</span>
              {Object.keys(SortCriteria).map(key => {
                  const criteriaValue = SortCriteria[key as keyof typeof SortCriteria];
                  return (
                      <button 
                          key={key}
                          onClick={() => setSortCriteria(criteriaValue)}
                          className={`px-3 py-1.5 text-sm rounded-md transition-colors ${sortCriteria === criteriaValue ? 'bg-teal-600 dark:bg-orange-600 text-white shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-gray-700'}`}
                      >
                          {t(`sortCriteria.${key}`)}
                      </button>
                  )
              })}
          </div>
        </div>

        {/* Right side: Honor Board and Search */}
        <div className="flex w-full md:w-auto items-center gap-4">
          <button
              onClick={() => setIsHonorBoardOpen(true)}
              className="flex-shrink-0 px-4 py-2.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-500 font-semibold rounded-lg shadow-sm hover:bg-yellow-200 dark:hover:bg-yellow-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-all flex items-center justify-center gap-2"
          >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9.75 9.75 0 0 1 9 0Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 12.75A3.75 3.75 0 0 0 16.5 9.75v-2.625L12 3.75l-4.5 3.375v2.625a3.75 3.75 0 0 0 3.75 3Z" />
              </svg>
              <span>{t('dashboard.honorBoard')}</span>
          </button>
          <div className="relative flex-grow">
              <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                  <svg className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
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
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-teal-500 dark:border-orange-500 pb-2">{t('dashboard.youngGems')}</h2>
          {studentGroups.youngGems.length > 0 ? studentGroups.youngGems.map(student => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} />
          )) : <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-orange-500 dark:border-yellow-500 pb-2">{t('dashboard.aspiringScholars')}</h2>
          {studentGroups.aspiringScholars.length > 0 ? studentGroups.aspiringScholars.map(student => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} />
          )): <p className="text-slate-500 dark:text-slate-400 italic">{t('dashboard.noStudents')}</p>}
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 border-b-2 border-sky-500 dark:border-cyan-500 pb-2">{t('dashboard.devotedLearners')}</h2>
          {studentGroups.devotedLearners.length > 0 ? studentGroups.devotedLearners.map(student => (
            <StudentCard key={student.id} student={student} onSelect={() => onSelectStudent(student.id)} quranMetadata={quranMetadata} />
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