import React, { useState } from 'react';
import { Student, SurahMetadata, QuranHomework } from '../types';
import { QURAN_METADATA } from '../constants';
import { useI18n } from '../context/I18nProvider';
import StudentDetailPage from './StudentDetailPage';
import MistakesReviewPage from './MistakesReviewPage';

interface StudentViewOnlyPageProps {
    student: Student;
    students: Student[];
    quranMetadata: SurahMetadata[];
    tajweedRules: string[];
    onMarkHomeworkDone?: (homeworkId: string) => void;
}

const StudentViewOnlyPage: React.FC<StudentViewOnlyPageProps> = ({
    student,
    students,
    quranMetadata,
    onMarkHomeworkDone,
}) => {
    const [view, setView] = useState<'progress' | 'mistakes'>('progress');
    const [homeworkModal, setHomeworkModal] = useState<QuranHomework | null>(null);
    const { t } = useI18n();

    // Active (not done) homework items
    const activeHomework = (student.quranHomework || []).filter(hw => !hw.isDone);
    const hasHomework = activeHomework.length > 0;

    const handleDone = () => {
        if (!homeworkModal) return;
        if (onMarkHomeworkDone) onMarkHomeworkDone(homeworkModal.id);
        setHomeworkModal(null);
    };

    const formatRange = (hw: QuranHomework) => {
        const startName = QURAN_METADATA.find(s => s.number === hw.startSurah)?.transliteratedName ?? `Surah ${hw.startSurah}`;
        const endName   = QURAN_METADATA.find(s => s.number === hw.endSurah)?.transliteratedName   ?? `Surah ${hw.endSurah}`;
        if (hw.startSurah === hw.endSurah && hw.startAyah === hw.endAyah) {
            return `${startName} : ${hw.startAyah}`;
        }
        return `${startName} ${hw.startAyah} → ${endName} ${hw.endAyah}`;
    };

    return (
        <div className="space-y-6">
            {/* Page title + homework badge */}
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100">
                    {t('studentView.pageTitle', { name: student.name })}
                </h2>
                {hasHomework && (
                    <button
                        onClick={() => setHomeworkModal(activeHomework[0])}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-sm font-bold shadow-sm animate-pulse hover:animate-none hover:bg-violet-200 dark:hover:bg-violet-800/60 transition-colors"
                    >
                        📝 You have Homework!
                        {activeHomework.length > 1 && (
                            <span className="ml-1 bg-violet-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                                {activeHomework.length}
                            </span>
                        )}
                    </button>
                )}
            </div>

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

            {/* ── Homework detail modal ──────────────────────────────────────── */}
            {homeworkModal && (
                <div
                    className="fixed inset-0 bg-black/60 z-[300] flex items-end sm:items-center justify-center p-4"
                    onClick={() => setHomeworkModal(null)}
                >
                    <div
                        className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">📝</span>
                                    <h3 className="text-lg font-bold text-white">Homework</h3>
                                </div>
                                {activeHomework.length > 1 && (
                                    <span className="text-violet-200 text-sm">
                                        {activeHomework.indexOf(homeworkModal) + 1} / {activeHomework.length}
                                    </span>
                                )}
                            </div>
                            {/* Verse range */}
                            <p className="mt-2 text-violet-100 font-semibold text-base">
                                {formatRange(homeworkModal)}
                            </p>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5">
                            {homeworkModal.note ? (
                                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-2xl p-4 mb-5">
                                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1">Instructions from your teacher:</p>
                                    <p className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{homeworkModal.note}</p>
                                </div>
                            ) : (
                                <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 italic">No specific instructions — practise the assigned verses.</p>
                            )}

                            {/* Navigation if multiple */}
                            {activeHomework.length > 1 && (
                                <div className="flex gap-2 mb-4">
                                    {activeHomework.map((hw, i) => (
                                        <button
                                            key={hw.id}
                                            onClick={() => setHomeworkModal(hw)}
                                            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                                                hw.id === homeworkModal.id
                                                    ? 'bg-violet-600 text-white'
                                                    : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                                            }`}
                                        >
                                            #{i + 1}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Done button */}
                            <button
                                onClick={handleDone}
                                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-base shadow-lg hover:from-violet-700 hover:to-purple-700 active:scale-95 transition-all"
                            >
                                ✅ Done!
                            </button>

                            <button
                                onClick={() => setHomeworkModal(null)}
                                className="mt-2 w-full py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentViewOnlyPage;
