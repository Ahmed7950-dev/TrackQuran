import React, { useState, useMemo } from 'react';
import { Student } from '../types';
import { useI18n } from '../context/I18nProvider';
import { getRecitedPagesSet } from '../services/dataService';
import { TOTAL_QURAN_PAGES, MISTAKE_PENALTY_POINTS } from '../constants';

interface AvatarProps {
  name: string;
  colors: {
    avatarBg: string;
    borderColor: string;
    highlightColor: string;
  };
}

const Avatar: React.FC<AvatarProps> = ({ name, colors }) => {
  const { avatarBg, borderColor, highlightColor } = colors;

  const avatars = [
    // Avatar 1: Concentric Rings
    () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" fill={avatarBg} />
        <circle cx="50" cy="50" r="38" stroke={borderColor} strokeWidth="6" fill="none" />
        <circle cx="50" cy="50" r="22" stroke={highlightColor} strokeWidth="6" fill="none" />
        <circle cx="50" cy="50" r="8" fill={borderColor} />
      </svg>
    ),
    // Avatar 2: Diamond Peak
    () => (
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="48" fill={avatarBg} />
        <path d="M 50 15 L 85 50 L 50 85 L 15 50 Z" fill={borderColor} />
        <path d="M 50 30 L 70 50 L 50 70 L 30 50 Z" fill={highlightColor} />
      </svg>
    ),
    // Avatar 3: Abstract Shape
    () => (
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" fill={avatarBg} />
            <path d="M25,25 C40,50 60,50 75,25" stroke={borderColor} strokeWidth="8" fill="none" strokeLinecap="round"/>
            <path d="M25,75 C40,50 60,50 75,75" stroke={highlightColor} strokeWidth="8" fill="none" strokeLinecap="round"/>
        </svg>
    ),
    // Avatar 4: Target
     () => (
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" fill={avatarBg} />
            <circle cx="50" cy="50" r="40" fill={borderColor} />
            <circle cx="50" cy="50" r="30" fill={avatarBg} />
            <circle cx="50" cy="50" r="20" fill={highlightColor} />
            <circle cx="50" cy="50" r="10" fill={avatarBg} />
        </svg>
    ),
    // Avatar 5: Four Corners
    () => (
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" fill={avatarBg} />
            <rect x="20" y="20" width="20" height="20" rx="5" fill={borderColor} />
            <rect x="60" y="20" width="20" height="20" rx="5" fill={highlightColor} />
            <rect x="20" y="60" width="20" height="20" rx="5" fill={highlightColor} />
            <rect x="60" y="60" width="20" height="20" rx="5" fill={borderColor} />
        </svg>
    ),
  ];

  // Simple hash to pick an avatar based on name
  const avatarIndex = (name.charCodeAt(0) + name.length) % avatars.length;
  const SelectedAvatar = avatars[avatarIndex];

  return <SelectedAvatar />;
};


interface HonorBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
}

const PodiumPlace: React.FC<{ student: { name: string; score: number }; rank: 1 | 2 | 3 }> = ({ student, rank }) => {
    const { t } = useI18n();
    const styles = {
        1: {
            order: 'order-2',
            height: 'h-64',
            bgColor: 'bg-yellow-400',
            avatarBg: '#fef9c3', // yellow-100
            borderColor: '#facc15', // yellow-400
            highlightColor: '#fef08a', // yellow-200
            nameText: 'text-yellow-300',
        },
        2: {
            order: 'order-1',
            height: 'h-56',
            bgColor: 'bg-gray-400',
            avatarBg: '#f3f4f6', // gray-100
            borderColor: '#9ca3af', // gray-400
            highlightColor: '#d1d5db', // gray-300
            nameText: 'text-gray-300',
        },
        3: {
            order: 'order-3',
            height: 'h-48',
            bgColor: 'bg-orange-400',
            avatarBg: '#ffedd5', // orange-100
            borderColor: '#fb923c', // orange-400
            highlightColor: '#fed7aa', // orange-200
            nameText: 'text-orange-300',
        },
    };
    
    const s = styles[rank];

    return (
        <div className={`relative flex flex-col items-center justify-end w-1/3 ${s.order}`}>
            <div className={`flex flex-col items-center justify-start p-4 ${s.height} w-full`}>
                <div className="w-24 h-24 rounded-full shadow-lg mb-3">
                     <Avatar 
                        name={student.name} 
                        colors={{ 
                            avatarBg: s.avatarBg, 
                            borderColor: s.borderColor,
                            highlightColor: s.highlightColor
                        }} 
                    />
                </div>
                <h4 className="text-xl font-bold text-white text-center">{student.name}</h4>
                <p className={`text-2xl font-black ${s.nameText}`}>{Math.round(student.score).toLocaleString()}</p>
                 <p className="text-sm text-slate-400">{t('modals.honorBoard.points')}</p>
            </div>
            <div className={`w-full p-4 ${s.bgColor} rounded-t-lg shadow-2xl flex items-center justify-center`}>
                <span className="text-5xl font-extrabold text-white text-shadow-lg">{rank}</span>
            </div>
        </div>
    )
}

const HonorBoardModal: React.FC<HonorBoardModalProps> = ({ isOpen, onClose, students }) => {
  const [view, setView] = useState<'monthly' | 'allTime'>('monthly');
  const { t } = useI18n();

  const topStudents = useMemo(() => {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const calculateScore = (student: Student) => {
      if (view === 'allTime') {
        const pagesRead = getRecitedPagesSet(student).size;
        const grossScore = (pagesRead / TOTAL_QURAN_PAGES) * 1_000_000;
        const mistakePenalty = Object.keys(student.mistakes || {}).length * MISTAKE_PENALTY_POINTS;
        return Math.max(0, grossScore - mistakePenalty);
      } else { // monthly
        const achievements = student.recitationAchievements || [];
        const achievementsInMonth = achievements.filter(ach => {
          const achDate = new Date(ach.date);
          const achMonthKey = `${achDate.getFullYear()}-${String(achDate.getMonth() + 1).padStart(2, '0')}`;
          return achMonthKey === currentMonthKey;
        });
        const grossPoints = achievementsInMonth.reduce((sum, ach) => sum + (ach.pointsEarned || 0), 0);

        const mistakesInMonth = Object.values(student.mistakes || {}).filter(mistake => {
            const mistakeDate = new Date(mistake.date);
            const mistakeMonthKey = `${mistakeDate.getFullYear()}-${String(mistakeDate.getMonth() + 1).padStart(2, '0')}`;
            return mistakeMonthKey === currentMonthKey;
        }).length;
        const mistakePenalty = mistakesInMonth * MISTAKE_PENALTY_POINTS;

        return Math.max(0, grossPoints - mistakePenalty);
      }
    };

    return students
        .map(student => ({
            id: student.id,
            name: student.name,
            score: calculateScore(student)
        }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

  }, [students, view]);

  if (!isOpen) return null;
  const translatedPeriod = view === 'monthly' ? t('modals.honorBoard.monthly') : t('modals.honorBoard.allTime');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <style>{`
        @keyframes sparkle {
          0% { transform: scale(0); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        .sparkle {
          position: absolute;
          width: 6px;
          height: 6px;
          background-color: white;
          border-radius: 50%;
          animation: sparkle 1.5s infinite;
        }
      `}</style>
      <div className="bg-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-3xl max-h-[90vh] flex flex-col relative overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Sparkles Background */}
        {[...Array(20)].map((_, i) => (
          <div key={i} className="sparkle" style={{ 
            top: `${Math.random() * 100}%`, 
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 1.5}s`,
            animationDuration: `${1 + Math.random() * 1}s`,
          }} />
        ))}
        
        <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-center mb-4 pb-4 border-b border-gray-700 z-10">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-yellow-900/50 rounded-lg text-yellow-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9a9.75 9.75 0 0 1 9 0Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 12.75A3.75 3.75 0 0 0 16.5 9.75v-2.625L12 3.75l-4.5 3.375v2.625a3.75 3.75 0 0 0 3.75 3Z" />
                </svg>
             </div>
             <h2 className="text-3xl font-extrabold text-white">{t('modals.honorBoard.title')}</h2>
          </div>
          <div className="flex items-center gap-4 mt-3 sm:mt-0 z-10">
            <div className="p-1 bg-gray-700 rounded-lg flex gap-1">
                <button onClick={() => setView('monthly')} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${view === 'monthly' ? 'bg-gray-800 text-orange-400 shadow-lg' : 'text-slate-300'}`}>{t('modals.honorBoard.monthly')}</button>
                <button onClick={() => setView('allTime')} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${view === 'allTime' ? 'bg-gray-800 text-orange-400 shadow-lg' : 'text-slate-300'}`}>{t('modals.honorBoard.allTime')}</button>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-3xl">&times;</button>
          </div>
        </div>
        <div className="flex-grow flex items-center justify-center overflow-y-auto z-10 p-4">
            {topStudents.length > 0 ? (
                 <div className="flex items-end justify-center w-full max-w-2xl mx-auto">
                    {topStudents[1] && <PodiumPlace student={topStudents[1]} rank={2} />}
                    {topStudents[0] && <PodiumPlace student={topStudents[0]} rank={1} />}
                    {topStudents[2] && <PodiumPlace student={topStudents[2]} rank={3} />}
                </div>
            ) : (
                <div className="text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-16 w-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-2 text-lg font-medium text-slate-300">{t('modals.honorBoard.noAchievements')}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        {t('modals.honorBoard.noAchievementsDesc', { period: translatedPeriod })}
                    </p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default HonorBoardModal;