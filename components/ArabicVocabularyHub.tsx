// ─────────────────────────────────────────────────────────────────────────────
// ArabicVocabularyHub — the one Vocabulary tab of an Arabic student's page.
//
// There used to be two places for words: the "Lessons Vocabulary" tab on the
// student's page (every word of the course, lesson by lesson) and a separate
// "Vocabulary" page in the site header (word lists made outside the lessons).
// They now live together here, and they stay SEPARATE: two cards at the top
// choose which collection is shown, and each keeps its own words, games,
// flashcards and homework. Nothing is merged or copied between them.
//
// Both sides use it: the tutor's student page and the student's portal
// (ArabicStudentDetailPage backs both; `studentMode` is the portal).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { ArabicLesson, ArabicStudent } from '../types';
import { useI18n } from '../context/I18nProvider';
import { getVocabWordCountsByLesson } from '../services/arabicService';
import { getVocabularyLists } from '../services/vocabularyService';
import ArabicLessonsVocabularyTab from './ArabicLessonsVocabularyTab';
import VocabularyPracticePage from './VocabularyPracticePage';

type Source = 'lessons' | 'lists';

interface Props {
  lessons: ArabicLesson[];       // already filtered to the student's dialect(s)
  student: ArabicStudent;
  studentMode?: boolean;
  nextLessonAt?: Date | null;
}

const storeKey = (studentId: string) => `arabicVocabSource:${studentId}`;

const ArabicVocabularyHub: React.FC<Props> = ({ lessons, student, studentMode = false, nextLessonAt = null }) => {
  const { t } = useI18n();

  const [source, setSource] = useState<Source>(() => {
    try { return localStorage.getItem(storeKey(student.id)) === 'lists' ? 'lists' : 'lessons'; } catch { return 'lessons'; }
  });
  useEffect(() => { try { localStorage.setItem(storeKey(student.id), source); } catch { /* private mode */ } }, [source, student.id]);

  // The two cards' numbers. Re-read whenever the collection changes, so words
  // added to a list show on its card when you come back to it.
  const [perLesson, setPerLesson] = useState<Record<string, number> | null>(null);
  const [lists, setLists] = useState<{ name: string; words: number }[] | null>(null);
  useEffect(() => {
    let live = true;
    void getVocabWordCountsByLesson().then(c => { if (live) setPerLesson(c); });
    void getVocabularyLists(student.id).then(ls => {
      if (live) setLists(ls.map(l => ({ name: l.name, words: l.words?.length ?? 0 })));
    });
    return () => { live = false; };
  }, [student.id, source]);

  const lessonWords = useMemo(() => {
    if (!perLesson) return null;
    const done = new Set(student.completedLessonIds);
    let total = 0, learnt = 0;
    for (const l of lessons) {
      const n = perLesson[l.id] ?? 0;
      total += n;
      if (done.has(l.id)) learnt += n;
    }
    return { total, learnt };
  }, [perLesson, lessons, student.completedLessonIds]);

  const listWords = lists?.reduce((s, l) => s + l.words, 0) ?? null;
  const listNames = lists && lists.length
    ? lists.slice(0, 3).map(l => l.name).join(', ') + (lists.length > 3 ? ` +${lists.length - 3}` : '')
    : t('arabicStudentDetail.vocabListsSub');
  const total = lessonWords && listWords !== null ? lessonWords.total + listWords : null;

  const card = (on: boolean, tint: 'amber' | 'teal') =>
    `text-start w-full rounded-2xl p-4 sm:p-[18px] bg-white dark:bg-gray-800 transition-all focus-visible:outline-none focus-visible:ring-2 ${
      tint === 'amber' ? 'focus-visible:ring-amber-500/50' : 'focus-visible:ring-teal-500/50'} ${
      on
        ? `border-2 shadow-md ${tint === 'amber' ? 'border-amber-500 dark:border-amber-400' : 'border-teal-500 dark:border-teal-400'}`
        : 'border border-slate-200 dark:border-gray-700 opacity-90 hover:opacity-100 hover:border-slate-300 dark:hover:border-gray-500'}`;

  const bar = (pct: number, cls: string) => (
    <span className="block mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden">
      <span className={`block h-full rounded-full ${cls}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{t('arabicStudentDetail.vocabTitle')}</h2>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">{t('arabicStudentDetail.vocabIntro')}</p>
        </div>
        {total !== null && (
          <span className="text-[13px] font-bold text-slate-600 dark:text-slate-300">
            {t('arabicStudentDetail.vocabTotal', { count: total.toLocaleString() })}
          </span>
        )}
      </div>

      <div role="tablist" aria-label={t('arabicStudentDetail.vocabChoose')} className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
        <button type="button" role="tab" id="vocab-src-lessons" aria-controls="vocab-pane"
          aria-selected={source === 'lessons'} onClick={() => setSource('lessons')} className={card(source === 'lessons', 'amber')}>
          <span className="flex items-center gap-3">
            <span className="hidden sm:flex w-10 h-10 flex-shrink-0 rounded-xl items-center justify-center bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
              </svg>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] sm:text-base font-extrabold text-slate-900 dark:text-slate-100">{t('arabicStudentDetail.vocabLessonWords')}</span>
              <span className="hidden sm:block mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{t('arabicStudentDetail.vocabLessonWordsSub')}</span>
            </span>
            <span className="hidden sm:block text-end flex-shrink-0">
              <span className="block text-[22px] leading-tight font-extrabold text-slate-900 dark:text-slate-100">{lessonWords?.total ?? '…'}</span>
              {lessonWords && <span className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{t('arabicStudentDetail.vocabLearnt', { count: lessonWords.learnt })}</span>}
            </span>
          </span>
          {/* phones: the numbers under the name, the subtitle dropped */}
          <span className="sm:hidden flex items-baseline gap-1.5 mt-1.5">
            <span className="text-[22px] leading-none font-extrabold text-slate-900 dark:text-slate-100">{lessonWords?.total ?? '…'}</span>
            {lessonWords && <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{t('arabicStudentDetail.vocabLearnt', { count: lessonWords.learnt })}</span>}
          </span>
          {bar(lessonWords && lessonWords.total ? (lessonWords.learnt / lessonWords.total) * 100 : 0, 'bg-emerald-500')}
        </button>

        <button type="button" role="tab" id="vocab-src-lists" aria-controls="vocab-pane"
          aria-selected={source === 'lists'} onClick={() => setSource('lists')} className={card(source === 'lists', 'teal')}>
          <span className="flex items-center gap-3">
            <span className="hidden sm:flex w-10 h-10 flex-shrink-0 rounded-xl items-center justify-center bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] sm:text-base font-extrabold text-slate-900 dark:text-slate-100">{t('arabicStudentDetail.vocabLists')}</span>
              <span className="hidden sm:block mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{listNames}</span>
            </span>
            <span className="hidden sm:block text-end flex-shrink-0">
              <span className="block text-[22px] leading-tight font-extrabold text-slate-900 dark:text-slate-100">{listWords ?? '…'}</span>
              {lists && <span className="block text-[11px] font-bold text-teal-700 dark:text-teal-300">{t('arabicStudentDetail.vocabListCount', { count: lists.length })}</span>}
            </span>
          </span>
          <span className="sm:hidden flex items-baseline gap-1.5 mt-1.5">
            <span className="text-[22px] leading-none font-extrabold text-slate-900 dark:text-slate-100">{listWords ?? '…'}</span>
            {lists && <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300">{t('arabicStudentDetail.vocabListCount', { count: lists.length })}</span>}
          </span>
          {bar(total && listWords !== null ? (listWords / total) * 100 : 0, 'bg-teal-500')}
        </button>
      </div>

      <div id="vocab-pane" role="tabpanel" aria-labelledby={source === 'lessons' ? 'vocab-src-lessons' : 'vocab-src-lists'}>
        {source === 'lessons' ? (
          <ArabicLessonsVocabularyTab lessons={lessons} student={student} studentMode={studentMode} nextLessonAt={nextLessonAt} />
        ) : (
          <VocabularyPracticePage
            studentId={student.id}
            studentName={student.name}
            selfPlay={studentMode ? { teacherId: student.teacherId } : undefined}
            embedded
          />
        )}
      </div>
    </div>
  );
};

export default ArabicVocabularyHub;
