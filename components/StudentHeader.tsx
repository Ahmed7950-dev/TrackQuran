import React from 'react';
import { Student } from '../types';
import { useI18n } from '../context/I18nProvider';
import { getBirthdayStatus } from '../utils';

interface StudentHeaderProps {
    student: Student;
    onOpenModal: (modalName: 'export' | 'edit') => void;
    onStartSession: () => void;
    readingPagesToNext: number | null;
    readingNextStudentName: string | null;
    hifdhPagesToNext: number | null;
    hifdhNextStudentName: string | null;
    onReviewMistakes: () => void;
}

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

const ActionButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; className?: string; }> = ({ onClick, title, children, className }) => (
    <button onClick={onClick} title={title} className={`p-2 rounded-full transition-colors ${className}`}>
        {children}
    </button>
);


const StudentHeader: React.FC<StudentHeaderProps> = ({ student, onOpenModal, onStartSession, readingPagesToNext, readingNextStudentName, hifdhPagesToNext, hifdhNextStudentName, onReviewMistakes }) => {
    const { t } = useI18n();
    const birthdayStatus = getBirthdayStatus(student.dob);

    return (
        <div className="bg-gradient-to-br from-teal-50 to-orange-50 dark:from-gray-800 dark:to-slate-800/60 p-6 rounded-xl shadow-sm border dark:border-gray-700">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <div className="flex items-center gap-4">
                        <h2 className="text-4xl font-extrabold text-slate-800 dark:text-slate-100">
                            {student.name}
                        </h2>
                        {birthdayStatus === 'TODAY' && (
                            <div className="flex items-center gap-1.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 px-3 py-1 rounded-full text-sm font-semibold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" /><path d="M2 13a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2z" /></svg>
                                <span>{t('studentDetail.happyBirthday')}</span>
                            </div>
                        )}
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">{t('studentDetail.yearsOld', { age: getAge(student.dob) })}</p>
                </div>
                <div className="flex items-center gap-2 bg-white/60 dark:bg-gray-700/50 p-1 rounded-full">
                    <ActionButton onClick={onStartSession} title="Live Logging" className="bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800/80 shadow-lg shadow-green-500/20 dark:shadow-green-400/20">
                        <div className="w-6 h-6 flex items-center justify-center">
                            <div className="w-3 h-3 bg-green-500 rounded-full animate-glow"></div>
                        </div>
                    </ActionButton>
                    <ActionButton onClick={onReviewMistakes} title="Review Mistakes" className="bg-white dark:bg-gray-600 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" /></svg>
                    </ActionButton>
                    <ActionButton onClick={() => onOpenModal('export')} title="Export Report" className="bg-white dark:bg-gray-600 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-gray-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg></ActionButton>
                    <ActionButton onClick={() => onOpenModal('edit')} title="Edit Student Data" className="bg-white dark:bg-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg></ActionButton>
                </div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {readingPagesToNext !== null && readingNextStudentName && (
                    <div className="bg-white/50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/50 p-4 rounded-xl flex items-center gap-4 backdrop-blur-sm">
                        <div className="flex-shrink-0 bg-white dark:bg-teal-900/50 p-3 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-teal-500"><path strokeLinecap="round" strokeLinejoin="round" d="m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        </div>
                        <div>
                            <span className="text-4xl font-bold text-teal-600 dark:text-teal-300">{readingPagesToNext}</span>
                            <p className="text-sm text-teal-700 dark:text-teal-200">{t('studentDetail.readingSurpass', { pages: readingPagesToNext, name: readingNextStudentName })}</p>
                        </div>
                    </div>
                )}
                {hifdhPagesToNext !== null && hifdhNextStudentName && (
                    <div className="bg-white/50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800/50 p-4 rounded-xl flex items-center gap-4 backdrop-blur-sm">
                        <div className="flex-shrink-0 bg-white dark:bg-sky-900/50 p-3 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-sky-500"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        </div>
                        <div>
                            <span className="text-4xl font-bold text-sky-600 dark:text-sky-300">{hifdhPagesToNext}</span>
                            <p className="text-sm text-sky-700 dark:text-sky-200">{t('studentDetail.hifdhSurpass', { pages: hifdhPagesToNext, name: hifdhNextStudentName })}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudentHeader;