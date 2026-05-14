import React, { useState } from 'react';
import { Student, SurahMetadata } from '../types';
import { useI18n } from '../context/I18nProvider';
import StudentDetailPage from './StudentDetailPage';
import MistakesReviewPage from './MistakesReviewPage';

interface StudentViewOnlyPageProps {
    student: Student;
    students: Student[];
    quranMetadata: SurahMetadata[];
    tajweedRules: string[];
}

const StudentViewOnlyPage: React.FC<StudentViewOnlyPageProps> = ({ student, students, quranMetadata }) => {
    const [view, setView] = useState<'progress' | 'mistakes'>('progress');
    const { t } = useI18n();

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                {t('studentView.pageTitle', { name: student.name })}
            </h2>

            {/* Tab strip */}
            <div className="border-b border-slate-200 dark:border-gray-700 no-print">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setView('progress')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            view === 'progress'
                                ? 'border-teal-500 dark:border-orange-500 text-teal-600 dark:text-orange-500'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                        {t('studentView.progressOverviewTab')}
                    </button>
                    <button
                        onClick={() => setView('mistakes')}
                        className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                            view === 'mistakes'
                                ? 'border-teal-500 dark:border-orange-500 text-teal-600 dark:text-orange-500'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                        {t('studentView.mistakesReviewTab')}
                    </button>
                </nav>
            </div>

            {view === 'progress' ? (
                /* Full tutor progress page, read-only (no action buttons / modals) */
                <StudentDetailPage
                    student={student}
                    students={students}
                    quranMetadata={quranMetadata}
                    readOnly
                />
            ) : (
                <MistakesReviewPage student={student} showTitle={false} />
            )}
        </div>
    );
};

export default StudentViewOnlyPage;
