// components/ArabicLessonDetailPage.tsx
// Full-screen lesson detail overlay — 4 tabs:
//   📖 Lesson PDF  · 📝 Homework  · 🔤 Vocabulary  · 🎬 Dialogue Video

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArabicLesson, ArabicStudent,
  HomeworkQuestion, HomeworkQuestionType,
  VocabWord, VocabMode, VocabAttempt,
  TajweedLesson, Student,
} from '../types';
import { useAuth } from '../context/AuthProvider';
import TajweedLessonViewer from './TajweedLessonViewer';
import {
  getHomeworkQuestions, createHomeworkQuestion,
  updateHomeworkQuestion as updateHWQ,
  deleteHomeworkQuestion,
  getVocabWords, createVocabWord, deleteVocabWord,
  getVocabAttempts, saveVocabAttempts,
  saveVocabMistakes,
  updateArabicLesson,
  setArabicLessonCompletion,
} from '../services/arabicService';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _uid = 0;
const genId = () => `s${++_uid}_${Date.now()}`;

function stripDiacritics(s: string) {
  return s.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g, '');
}
function answersMatch(correct: string, user: string) {
  const n = (s: string) => stripDiacritics(s).toLowerCase().trim().replace(/\s+/g, ' ');
  return n(correct) === n(user);
}
function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m?.[1] ?? null;
}
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SR_DELAYS = [1, 3, 7, 14];

type Tab = 'lesson' | 'homework' | 'vocabulary' | 'video';

const QUESTION_TYPE_LABELS: Record<HomeworkQuestionType, string> = {
  multiple_choice:      'Multiple Choice',
  true_false:           'True / False',
  translate_to_arabic:  'Translate → Arabic',
  translate_to_english: 'Translate → English',
  fill_blank:           'Fill in the Blank',
  fill_blank_options:   'Fill in the Blank (with choices)',
};

// Fill-in-blank segment types
type FBSegment =
  | { id: string; type: 'text';  value: string }
  | { id: string; type: 'blank'; answer: string };

function segmentsToQuestion(segs: FBSegment[]): { question: string; options: string[] } {
  let question = '';
  const options: string[] = [];
  segs.forEach(s => {
    if (s.type === 'text')  { question += s.value; }
    else                    { question += '___'; options.push(s.answer); }
  });
  return { question, options };
}

function questionToSegments(question: string, options?: string[]): FBSegment[] {
  const parts = question.split('___');
  const segs: FBSegment[] = [];
  parts.forEach((text, i) => {
    if (text) segs.push({ id: genId(), type: 'text',  value: text });
    if (i < parts.length - 1) segs.push({ id: genId(), type: 'blank', answer: options?.[i] ?? '' });
  });
  return segs.length ? segs : [{ id: genId(), type: 'text', value: '' }];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  lesson: ArabicLesson;
  students: ArabicStudent[];
  teacherId: string;
  preSelectedStudentId?: string;
  onClose: () => void;
  onStudentUpdated?: (s: ArabicStudent) => void;
}

const ArabicLessonDetailPage: React.FC<Props> = ({
  lesson: initialLesson, students, teacherId,
  preSelectedStudentId, onClose, onStudentUpdated,
}) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [lesson, setLesson] = useState(initialLesson);
  const [activeTab, setActiveTab] = useState<Tab>(initialLesson.pdfUrl ? 'lesson' : 'homework');

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'lesson',     icon: '📖', label: 'Lesson PDF'     },
    { id: 'homework',   icon: '📝', label: 'Homework'       },
    { id: 'vocabulary', icon: '🔤', label: 'Vocabulary'     },
    { id: 'video',      icon: '🎬', label: 'Dialogue Video' },
  ];

  const tajweedLesson: TajweedLesson = {
    id: lesson.id, title: lesson.title, description: lesson.description,
    orderIndex: lesson.orderIndex, pdfUrl: lesson.pdfUrl,
    createdBy: lesson.createdBy, createdAt: lesson.createdAt, updatedAt: lesson.updatedAt,
  };

  const studentCompat = students.map(s => ({
    id: s.id, name: s.name,
    recitationAchievements: [], memorizationAchievements: [],
    attendance: [], masteredTajweedRules: [],
    tafsirReviews: [], tafsirMemorizationReviews: [], mistakes: {},
  })) as unknown as Student[];

  const handleMarkDone = async (studentId: string, lessonId: string, done: boolean) => {
    await setArabicLessonCompletion(teacherId, studentId, lessonId, done);
    const s = students.find(x => x.id === studentId);
    if (!s) return;
    const ids = new Set(s.completedLessonIds);
    done ? ids.add(lessonId) : ids.delete(lessonId);
    onStudentUpdated?.({ ...s, completedLessonIds: [...ids] });
  };

  return (
    <div className="fixed inset-0 z-40 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="font-semibold text-sm">All Lessons</span>
        </button>
        <div className="w-px h-5 bg-slate-200 dark:bg-gray-600" />
        <h1 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate flex-1">{lesson.title}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <span>{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'lesson' && (
          lesson.pdfUrl ? (
            <TajweedLessonViewer
              embedded lesson={tajweedLesson}
              students={studentCompat} tutorId={teacherId}
              preSelectedStudentId={preSelectedStudentId}
              fetchCompletedIds={async (sid) => new Set(students.find(x => x.id === sid)?.completedLessonIds ?? [])}
              onMarkCompleted={async (sid, lid) => { await handleMarkDone(sid, lid, true); return true; }}
              onUnmarkCompleted={async (sid, lid) => { await handleMarkDone(sid, lid, false); return true; }}
              onClose={() => {}}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 dark:text-slate-400">
              <span className="text-5xl">📄</span>
              <p className="text-sm">No PDF attached to this lesson yet.</p>
            </div>
          )
        )}
        {activeTab === 'homework' && (
          <div className="h-full overflow-y-auto">
            <HomeworkTab lessonId={lesson.id} isAdmin={isAdmin} />
          </div>
        )}
        {activeTab === 'vocabulary' && (
          <div className="h-full overflow-y-auto">
            <VocabularyTab
              lessonId={lesson.id} isAdmin={isAdmin}
              students={students} preSelectedStudentId={preSelectedStudentId}
            />
          </div>
        )}
        {activeTab === 'video' && (
          <div className="h-full overflow-y-auto">
            <VideoTab lesson={lesson} isAdmin={isAdmin} onLessonUpdated={setLesson} />
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// HOMEWORK TAB
// ═══════════════════════════════════════════════════════

type PracticePhase = 'idle' | 'practising' | 'done';

const HomeworkTab: React.FC<{ lessonId: string; isAdmin: boolean }> = ({ lessonId, isAdmin }) => {
  const [questions, setQuestions]   = useState<HomeworkQuestion[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editingQ, setEditingQ]     = useState<HomeworkQuestion | null>(null);
  const [practicePhase, setPhase]   = useState<PracticePhase>('idle');
  const [qIndex, setQIndex]         = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [blankAnswers, setBlankAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback]     = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore]           = useState(0);

  useEffect(() => {
    getHomeworkQuestions(lessonId).then(qs => { setQuestions(qs); setLoading(false); });
  }, [lessonId]);

  const startPractice = () => {
    setQIndex(0); setUserAnswer(''); setBlankAnswers({}); setFeedback(null); setScore(0);
    setPhase('practising');
  };

  const checkAnswer = () => {
    const q = questions[qIndex];
    let correct = false;
    if (q.type === 'fill_blank') {
      const blanksCount = (q.question.match(/___/g) ?? []).length;
      const answers = q.options?.length ? q.options : [q.correctAnswer];
      correct = Array.from({ length: blanksCount }, (_, i) => i)
        .every(i => answersMatch(answers[i] ?? '', blankAnswers[i] ?? ''));
    } else if (q.type === 'multiple_choice' || q.type === 'fill_blank_options' || q.type === 'true_false') {
      correct = userAnswer === q.correctAnswer;
    } else {
      correct = answersMatch(q.correctAnswer, userAnswer);
    }
    if (correct) setScore(s => s + 1);
    setFeedback(correct ? 'correct' : 'wrong');
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= questions.length) { setPhase('done'); return; }
    setQIndex(i => i + 1); setUserAnswer(''); setBlankAnswers({}); setFeedback(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    if (await deleteHomeworkQuestion(id)) setQuestions(prev => prev.filter(q => q.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  // ── Practice ─────────────────────────────────────────────────────────────
  if (practicePhase === 'practising') {
    const q = questions[qIndex];
    const fbParts = q.type === 'fill_blank' ? q.question.split('___') : [];
    const fbAnswers = q.options?.length ? q.options : [q.correctAnswer];

    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Question {qIndex + 1} of {questions.length}</span>
          <button onClick={() => setPhase('idle')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">× Exit</button>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(qIndex / questions.length) * 100}%` }} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
            {QUESTION_TYPE_LABELS[q.type]}
          </span>

          {/* Question text */}
          {q.type !== 'fill_blank' && (
            <p className="text-lg font-semibold text-slate-800 dark:text-slate-100"
               dir={q.type === 'translate_to_english' ? 'rtl' : 'ltr'}>
              {q.question}
            </p>
          )}

          {/* Answer input by type */}
          {(q.type === 'multiple_choice' || q.type === 'fill_blank_options') && q.options?.length ? (
            <div className="space-y-2">
              {q.options.map((opt, i) => (
                <button key={i} disabled={!!feedback} onClick={() => setUserAnswer(opt)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border-2 text-sm transition-colors ${
                    userAnswer === opt
                      ? feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                        : feedback === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-gray-600 hover:border-amber-300 text-slate-700 dark:text-slate-200'
                  }`}>
                  {String.fromCharCode(65 + i)}. {opt}
                </button>
              ))}
            </div>
          ) : q.type === 'true_false' ? (
            <div className="flex gap-3">
              {['True', 'False'].map(opt => (
                <button key={opt} disabled={!!feedback} onClick={() => setUserAnswer(opt)}
                  className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                    userAnswer === opt
                      ? feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                        : feedback === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-gray-600 hover:border-amber-300 text-slate-700 dark:text-slate-200'
                  }`}>{opt}
                </button>
              ))}
            </div>
          ) : q.type === 'fill_blank' ? (
            // Multi-blank fill-in
            <div className="flex flex-wrap items-center gap-1 text-base leading-loose">
              {fbParts.map((part, i) => (
                <React.Fragment key={i}>
                  {part && <span className="text-slate-800 dark:text-slate-100">{part}</span>}
                  {i < fbParts.length - 1 && (
                    <input
                      type="text"
                      value={blankAnswers[i] ?? ''}
                      onChange={e => setBlankAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !feedback) checkAnswer(); }}
                      disabled={!!feedback}
                      className={`w-28 px-2 py-0.5 border-b-2 text-center text-sm focus:outline-none transition-colors ${
                        feedback === 'correct' ? 'border-emerald-500 text-emerald-700'
                          : feedback === 'wrong' ? 'border-red-500 text-red-700'
                          : 'border-amber-500 focus:border-amber-600'
                      } bg-transparent dark:text-white`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <input type="text" value={userAnswer}
              onChange={e => setUserAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !feedback) checkAnswer(); }}
              disabled={!!feedback}
              dir={q.type === 'translate_to_arabic' ? 'rtl' : 'ltr'}
              placeholder="Type your answer…"
              className="w-full px-4 py-2.5 border-2 border-slate-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:border-amber-400 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`flex items-start gap-3 p-3 rounded-xl ${feedback === 'correct' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              <span className="text-xl">{feedback === 'correct' ? '✅' : '❌'}</span>
              <div>
                <p className="font-semibold">{feedback === 'correct' ? 'Correct!' : 'Incorrect'}</p>
                {feedback === 'wrong' && (
                  <p className="text-sm mt-0.5">
                    Correct answer: <span className="font-bold">
                      {q.type === 'fill_blank'
                        ? fbAnswers.join(' / ')
                        : q.correctAnswer}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            {!feedback ? (
              <button onClick={checkAnswer}
                disabled={q.type === 'fill_blank'
                  ? Object.keys(blankAnswers).length < (q.question.match(/___/g) ?? []).length
                  : !userAnswer}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors">
                Submit
              </button>
            ) : (
              <button onClick={nextQuestion}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors">
                {qIndex + 1 >= questions.length ? 'See Results' : 'Next Question →'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (practicePhase === 'done') {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div className="max-w-md mx-auto p-8 text-center space-y-5">
        <div className="text-6xl">{pct >= 80 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
        <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Practice Complete</h2>
        <p className="text-slate-500 dark:text-slate-400">
          You got <span className="font-bold text-amber-600 dark:text-amber-400">{score} / {questions.length}</span> correct ({pct}%)
        </p>
        <button onClick={startPractice}
          className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors">
          Try Again
        </button>
        <button onClick={() => setPhase('idle')}
          className="w-full py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
          Back to Questions
        </button>
      </div>
    );
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Homework Questions</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {questions.length} {questions.length === 1 ? 'exercise' : 'exercises'}
            {isAdmin ? ' · add or edit questions below' : ' · click Practice to test yourself'}
          </p>
        </div>
        <div className="flex gap-2">
          {questions.length > 0 && !isAdmin && (
            <button onClick={startPractice}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm">
              ▶ Start Practice
            </button>
          )}
          {isAdmin && (
            <button onClick={() => { setEditingQ(null); setShowForm(v => !v); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm">
              {showForm && !editingQ ? '✕ Cancel' : '+ Add Question'}
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit form */}
      {isAdmin && (showForm || editingQ) && (
        <AddHomeworkQuestionForm
          lessonId={lessonId}
          existingQuestion={editingQ ?? undefined}
          onCreated={q => { setQuestions(prev => [...prev, q]); setShowForm(false); }}
          onUpdated={q => { setQuestions(prev => prev.map(x => x.id === q.id ? q : x)); setEditingQ(null); setShowForm(false); }}
          onCancel={() => { setEditingQ(null); setShowForm(false); }}
        />
      )}

      {/* Empty */}
      {questions.length === 0 && !showForm && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">📝</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">No questions yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? 'Click "Add Question" to create the first exercise.' : 'Questions will appear here once an admin adds them.'}
          </p>
        </div>
      )}

      {/* Question list */}
      {questions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700 overflow-hidden">
          {questions.map((q, i) => (
            <div key={q.id} className="flex items-start gap-4 p-4">
              <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold mt-0.5">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-400 rounded-full text-xs font-semibold">
                  {QUESTION_TYPE_LABELS[q.type]}
                </span>
                <p className="text-sm text-slate-800 dark:text-slate-100" dir={q.type === 'translate_to_english' ? 'rtl' : 'ltr'}>
                  {q.question}
                </p>
                {isAdmin && (
                  <p className="text-xs text-slate-400">
                    ✓ {q.type === 'fill_blank' && q.options?.length
                      ? 'Answers: ' + q.options.join(' / ')
                      : 'Answer: ' + q.correctAnswer}
                  </p>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setEditingQ(q); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                  <button onClick={() => handleDelete(q.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {questions.length > 0 && !isAdmin && (
        <button onClick={startPractice}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors">
          ▶ Start Practice ({questions.length} questions)
        </button>
      )}
    </div>
  );
};

// ── Add / Edit Homework Question Form ─────────────────────────────────────────

interface AddHWProps {
  lessonId: string;
  existingQuestion?: HomeworkQuestion;
  onCreated: (q: HomeworkQuestion) => void;
  onUpdated: (q: HomeworkQuestion) => void;
  onCancel: () => void;
}

const AddHomeworkQuestionForm: React.FC<AddHWProps> = ({
  lessonId, existingQuestion, onCreated, onUpdated, onCancel,
}) => {
  const isEdit = !!existingQuestion;
  const [type, setType]               = useState<HomeworkQuestionType>(existingQuestion?.type ?? 'multiple_choice');
  const [question, setQuestion]       = useState(
    existingQuestion?.type === 'fill_blank' ? '' : (existingQuestion?.question ?? '')
  );
  const [correctAnswer, setCorrectAnswer] = useState(existingQuestion?.correctAnswer ?? '');
  const [options, setOptions]         = useState<string[]>(existingQuestion?.options ?? ['', '', '', '']);
  const [fbSegments, setFbSegments]   = useState<FBSegment[]>(() => {
    if (existingQuestion?.type === 'fill_blank') {
      return questionToSegments(existingQuestion.question, existingQuestion.options);
    }
    return [{ id: genId(), type: 'text', value: '' }];
  });
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState('');

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    let finalQuestion = question.trim();
    let finalOptions: string[] | undefined;
    let finalCorrect = correctAnswer.trim();

    if (type === 'fill_blank') {
      const { question: q, options: opts } = segmentsToQuestion(fbSegments);
      finalQuestion = q;
      finalOptions = opts;
      finalCorrect = opts.join(' | ');
      if (!finalQuestion.includes('___')) { setErr('Add at least one blank (___) using the "+ Blank" button.'); return; }
      if (opts.some(o => !o.trim())) { setErr('All blanks need an answer filled in.'); return; }
    } else {
      if (!finalQuestion) { setErr('Question text is required.'); return; }
    }

    if (type === 'multiple_choice' || type === 'fill_blank_options') {
      finalOptions = options.map(o => o.trim());
      if (finalOptions.some(o => !o)) { setErr('All options must be filled in.'); return; }
      if (!finalCorrect) { setErr('Select the correct answer.'); return; }
      if (!finalOptions.includes(finalCorrect)) { setErr('Correct answer must match one of the options.'); return; }
    } else if (type === 'true_false') {
      if (!finalCorrect) { setErr('Select True or False as the correct answer.'); return; }
    } else if (type !== 'fill_blank') {
      if (!finalCorrect) { setErr('Correct answer is required.'); return; }
    }

    setSaving(true);
    if (isEdit && existingQuestion) {
      const patch = { question: finalQuestion, options: finalOptions, correctAnswer: finalCorrect };
      const ok = await updateHWQ(existingQuestion.id, patch);
      setSaving(false);
      if (!ok) { setErr('Failed to save changes.'); return; }
      onUpdated({ ...existingQuestion, ...patch });
    } else {
      const q = await createHomeworkQuestion({ lessonId, type, question: finalQuestion, options: finalOptions, correctAnswer: finalCorrect });
      setSaving(false);
      if (!q) { setErr('Failed to save. Please try again.'); return; }
      onCreated(q);
    }
  };

  const needsOptions = type === 'multiple_choice' || type === 'fill_blank_options';
  const isArabicAnswer = type === 'translate_to_arabic';

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">{isEdit ? 'Edit Question' : 'New Question'}</h3>

      {!isEdit && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Question type</label>
          <select value={type} onChange={e => setType(e.target.value as HomeworkQuestionType)} className={inp}>
            {(Object.entries(QUESTION_TYPE_LABELS) as [HomeworkQuestionType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}

      {/* Question text input — not shown for fill_blank (built via segments) */}
      {type !== 'fill_blank' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
            {type === 'translate_to_english' ? 'Arabic text to translate' : 'Question / Statement'}
          </label>
          <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
            dir={type === 'translate_to_english' ? 'rtl' : 'ltr'}
            placeholder={type === 'fill_blank_options' ? 'e.g. The word for "book" is ___.  (use ___ for the blank)' : 'Enter question…'}
            className={inp} />
        </div>
      )}

      {/* Fill-in-blank segment builder */}
      {type === 'fill_blank' && (
        <FillBlankEditor segments={fbSegments} onChange={setFbSegments} />
      )}

      {/* Options (multiple choice / fill_blank_options) */}
      {needsOptions && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
            Options — <span className="normal-case font-normal text-slate-400">click the correct answer to mark it</span>
          </label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrectAnswer(opt)}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    correctAnswer === opt && opt.trim()
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-slate-300 hover:border-emerald-400'
                  }`}>
                  {correctAnswer === opt && opt.trim() && (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
                <span className="text-xs font-bold text-slate-500 w-5">{String.fromCharCode(65 + i)}.</span>
                <input value={opt}
                  onChange={e => {
                    const prev = opt;
                    const updated = options.map((o, j) => j === i ? e.target.value : o);
                    setOptions(updated);
                    if (correctAnswer === prev) setCorrectAnswer(e.target.value);
                  }}
                  dir={isArabicAnswer ? 'rtl' : 'ltr'}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  className={`flex-1 ${inp}`} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* True/False */}
      {type === 'true_false' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Correct answer</label>
          <div className="flex gap-3">
            {['True', 'False'].map(v => (
              <button key={v} type="button" onClick={() => setCorrectAnswer(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                  correctAnswer === v
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                    : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'
                }`}>{v}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Free-text correct answer */}
      {!needsOptions && type !== 'true_false' && type !== 'fill_blank' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Correct answer</label>
          <input value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
            dir={isArabicAnswer ? 'rtl' : 'ltr'} placeholder="Enter the correct answer…" className={inp} />
        </div>
      )}

      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Question'}
        </button>
      </div>
    </form>
  );
};

// ── Fill-in-blank segment editor ──────────────────────────────────────────────

const FillBlankEditor: React.FC<{ segments: FBSegment[]; onChange: (s: FBSegment[]) => void }> = ({ segments, onChange }) => {
  const addText  = () => onChange([...segments, { id: genId(), type: 'text',  value: '' }]);
  const addBlank = () => onChange([...segments, { id: genId(), type: 'blank', answer: '' }]);
  const removeSeg = (id: string) => onChange(segments.filter(s => s.id !== id));
  const updateSeg = (id: string, patch: Partial<FBSegment>) =>
    onChange(segments.map(s => s.id === id ? { ...s, ...patch } as FBSegment : s));

  const inp = 'px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Build the question</label>
      <p className="text-xs text-slate-400">Alternate text segments and blanks (answer boxes). The student will see ___ for each blank.</p>

      {segments.length === 0 && (
        <p className="text-xs text-slate-400 italic">Click "+ Text" or "+ Blank" to start building.</p>
      )}

      <div className="space-y-2">
        {segments.map((seg, idx) => (
          <div key={seg.id} className="flex items-center gap-2">
            <span className="flex-shrink-0 text-xs text-slate-400 w-4">{idx + 1}.</span>
            {seg.type === 'text' ? (
              <>
                <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-slate-100 dark:bg-gray-700 text-slate-500 rounded font-semibold">Text</span>
                <input value={seg.value}
                  onChange={e => updateSeg(seg.id, { value: e.target.value })}
                  placeholder="Type text here…"
                  className={`flex-1 ${inp}`} />
              </>
            ) : (
              <>
                <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded font-semibold">Blank</span>
                <input value={seg.answer}
                  onChange={e => updateSeg(seg.id, { answer: e.target.value })}
                  placeholder="Answer for this blank…"
                  className={`flex-1 ${inp} border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20`} />
              </>
            )}
            <button type="button" onClick={() => removeSeg(seg.id)}
              className="flex-shrink-0 text-slate-300 hover:text-red-500 transition-colors text-lg leading-none">×</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={addText}
          className="px-3 py-1.5 text-xs border border-dashed border-slate-300 dark:border-gray-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-slate-400 transition-colors">
          + Text segment
        </button>
        <button type="button" onClick={addBlank}
          className="px-3 py-1.5 text-xs border border-dashed border-amber-400 dark:border-amber-600 rounded-lg text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 hover:border-amber-500 transition-colors">
          + Blank ___
        </button>
      </div>

      {/* Live preview */}
      {segments.length > 0 && (
        <div className="mt-2 px-3 py-2 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg text-sm text-slate-700 dark:text-slate-200">
          <span className="text-xs font-semibold text-slate-400 block mb-1">Preview:</span>
          {segments.map((s, i) => (
            <span key={i}>{s.type === 'text' ? s.value : <span className="px-1 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">___</span>}</span>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// VOCABULARY TAB
// ═══════════════════════════════════════════════════════

interface VocabTabProps {
  lessonId: string;
  isAdmin: boolean;
  students: ArabicStudent[];
  preSelectedStudentId?: string;
}

type ChallengePhase = 'idle' | 'active' | 'wrong' | 'complete';

const VocabularyTab: React.FC<VocabTabProps> = ({ lessonId, isAdmin, students, preSelectedStudentId }) => {
  const [words, setWords]           = useState<VocabWord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAddWord, setShowAdd]   = useState(false);
  const [showBulk, setShowBulk]     = useState(false);
  const [mode, setMode]             = useState<VocabMode>('arabic');
  // Only show student selector if no student pre-selected
  const [selectedStudentId, setStudentId] = useState(preSelectedStudentId ?? '');
  const [attempts, setAttempts]     = useState<VocabAttempt[]>([]);

  // Challenge state
  const [phase, setPhase]           = useState<ChallengePhase>('idle');
  const [shuffled, setShuffled]     = useState<VocabWord[]>([]);
  const [cardIndex, setCardIndex]   = useState(0);
  const [userInput, setUserInput]   = useState('');
  const [cardFeedback, setCardFb]   = useState<'correct' | 'wrong' | 'revealed' | null>(null);
  const [wrongWords, setWrongWords] = useState<VocabWord[]>([]);
  const [saving, setSaving]         = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getVocabWords(lessonId).then(ws => { setWords(ws); setLoading(false); });
  }, [lessonId]);

  useEffect(() => {
    if (!selectedStudentId) { setAttempts([]); return; }
    getVocabAttempts(selectedStudentId, lessonId).then(setAttempts);
  }, [selectedStudentId, lessonId]);

  const startChallenge = () => {
    setShuffled(shuffleArray(words)); setCardIndex(0);
    setUserInput(''); setCardFb(null); setWrongWords([]);
    setPhase('active');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const submitCard = () => {
    const word = shuffled[cardIndex];
    const correct = answersMatch(mode === 'arabic' ? word.arabic : word.transliteration, userInput);
    if (correct) {
      setCardFb('correct');
    } else {
      setCardFb('wrong');
      setWrongWords(prev => [...prev.filter(w => w.id !== word.id), word]);
      setPhase('wrong');
    }
  };

  const revealAnswer = () => {
    setCardFb('revealed');
    setWrongWords(prev => [...prev.filter(w => w.id !== shuffled[cardIndex].id), shuffled[cardIndex]]);
    setPhase('wrong');
  };

  const restartChallenge = () => {
    setShuffled(shuffleArray(words)); setCardIndex(0);
    setUserInput(''); setCardFb(null);
    setPhase('active');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const nextCard = () => {
    if (cardIndex + 1 >= shuffled.length) {
      setPhase('complete');
      if (selectedStudentId) saveSpacedRep();
      if (selectedStudentId && wrongWords.length > 0) {
        saveVocabMistakes(selectedStudentId, wrongWords.map(w => ({ wordId: w.id, lessonId }))).catch(console.error);
      }
    } else {
      setCardIndex(i => i + 1); setUserInput(''); setCardFb(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const saveSpacedRep = async () => {
    setSaving(true);
    const now = new Date();
    const newAttempts: VocabAttempt[] = [];
    for (const word of words) {
      const existing = attempts.filter(a => a.wordId === word.id && a.mode === mode && a.completedAt);
      const pending  = attempts.find(a => a.wordId === word.id && a.mode === mode && !a.completedAt);
      if (existing.filter(Boolean).length >= 5) continue;
      if (pending) {
        newAttempts.push({ ...pending, completedAt: now.toISOString() });
        if (pending.attemptNumber < 5) {
          const d = new Date(now); d.setDate(d.getDate() + (SR_DELAYS[pending.attemptNumber - 1] ?? 14));
          newAttempts.push({ id: `vat-${Date.now()}-${word.id}-${pending.attemptNumber + 1}`, studentId: selectedStudentId, wordId: word.id, lessonId, attemptNumber: pending.attemptNumber + 1, mode, scheduledAt: d.toISOString(), completedAt: undefined, createdAt: now.toISOString() });
        }
      } else if (!existing.length) {
        newAttempts.push({ id: `vat-${Date.now()}-${word.id}-1`, studentId: selectedStudentId, wordId: word.id, lessonId, attemptNumber: 1, mode, scheduledAt: now.toISOString(), completedAt: now.toISOString(), createdAt: now.toISOString() });
        const d = new Date(now); d.setDate(d.getDate() + SR_DELAYS[0]);
        newAttempts.push({ id: `vat-${Date.now()+1}-${word.id}-2`, studentId: selectedStudentId, wordId: word.id, lessonId, attemptNumber: 2, mode, scheduledAt: d.toISOString(), completedAt: undefined, createdAt: now.toISOString() });
      }
    }
    await saveVocabAttempts(newAttempts);
    const fresh = await getVocabAttempts(selectedStudentId, lessonId);
    setAttempts(fresh);
    setSaving(false);
  };

  const handleDeleteWord = async (id: string) => {
    if (!confirm('Delete this word?')) return;
    if (await deleteVocabWord(id)) setWords(prev => prev.filter(w => w.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  // ── Challenge / wrong ─────────────────────────────────────────────────────
  if (phase === 'active' || phase === 'wrong') {
    const word = shuffled[cardIndex];
    const isWrong = phase === 'wrong';
    return (
      <div className="max-w-xl mx-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Card {cardIndex + 1} / {shuffled.length}</span>
          <button onClick={() => setPhase('idle')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">× Exit</button>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(cardIndex / shuffled.length) * 100}%` }} />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center shadow-sm space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">What is the {mode === 'arabic' ? 'Arabic' : 'transliteration'} for…</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{word.english}</p>
          {cardFeedback === 'revealed' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <p className="text-sm text-amber-600 font-semibold">Answer:</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300" dir={mode === 'arabic' ? 'rtl' : 'ltr'}>
                {mode === 'arabic' ? word.arabic : word.transliteration}
              </p>
            </div>
          )}
          {cardFeedback === 'wrong' && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <p className="text-sm text-red-600 font-semibold">Incorrect — correct answer:</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-300" dir={mode === 'arabic' ? 'rtl' : 'ltr'}>
                {mode === 'arabic' ? word.arabic : word.transliteration}
              </p>
            </div>
          )}
          {cardFeedback === 'correct' && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">✅ Correct!</p>
            </div>
          )}
        </div>

        {!cardFeedback && !isWrong && (
          <div className="space-y-3">
            <input ref={inputRef} type="text" value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCard(); }}
              dir={mode === 'arabic' ? 'rtl' : 'ltr'}
              placeholder={mode === 'arabic' ? 'اكتب بالعربية…' : 'Type transliteration…'}
              className="w-full px-4 py-3 border-2 border-slate-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:border-amber-400 dark:bg-gray-700 dark:text-white text-center" />
            <div className="flex gap-3">
              <button onClick={revealAnswer}
                className="flex-1 py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-sm">
                I'm not sure
              </button>
              <button onClick={submitCard} disabled={!userInput.trim()}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl disabled:opacity-40 transition-colors text-sm">
                Check
              </button>
            </div>
          </div>
        )}
        {cardFeedback === 'correct' && (
          <button onClick={nextCard}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl transition-colors">
            {cardIndex + 1 >= shuffled.length ? 'Finish 🎉' : 'Next Card →'}
          </button>
        )}
        {isWrong && (
          <div className="space-y-3">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
              <p className="font-bold text-red-700 dark:text-red-300">❌ Let's start over!</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">Get all words right in a row to complete the challenge!</p>
            </div>
            <button onClick={restartChallenge}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors">
              🔄 Start Over
            </button>
            <button onClick={() => setPhase('idle')}
              className="w-full py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-sm">
              Back to word list
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Complete ──────────────────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center shadow-sm space-y-4">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Challenge Complete!</h2>
          <p className="text-slate-500 dark:text-slate-400">You got all {words.length} words correct in a row!</p>
          {selectedStudentId && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              {saving ? '⏳ Saving progress…' : '✅ Progress saved!'}
            </p>
          )}
        </div>
        {wrongWords.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">Words that need more practice</h3>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {wrongWords.map(w => (
                <div key={w.id} className="py-2.5 grid grid-cols-3 gap-2 text-sm text-center">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{w.english}</span>
                  <span dir="rtl">{w.arabic}</span>
                  <span className="text-slate-500 dark:text-slate-400">{w.transliteration}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={startChallenge}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors">
            Practice Again
          </button>
          <button onClick={() => setPhase('idle')}
            className="flex-1 py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
            Back to Words
          </button>
        </div>
      </div>
    );
  }

  // ── Idle / word list ──────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vocabulary Trainer</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {words.length} {words.length === 1 ? 'word' : 'words'}
            {isAdmin ? ' · add words individually or bulk-import' : ' · run the flashcard challenge to practise'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => { setShowAdd(false); setShowBulk(v => !v); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${showBulk ? 'bg-amber-100 text-amber-700' : 'bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>
              📋 Bulk Import
            </button>
            <button onClick={() => { setShowBulk(false); setShowAdd(v => !v); }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm">
              {showAddWord ? '✕ Cancel' : '+ Add Word'}
            </button>
          </div>
        )}
      </div>

      {isAdmin && showBulk && (
        <BulkVocabImport lessonId={lessonId}
          onImported={ws => { setWords(prev => [...prev, ...ws]); setShowBulk(false); }}
          onCancel={() => setShowBulk(false)} />
      )}
      {isAdmin && showAddWord && (
        <AddVocabWordForm lessonId={lessonId}
          onCreated={w => { setWords(prev => [...prev, w]); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)} />
      )}

      {words.length === 0 && !showAddWord && !showBulk && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">🔤</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">No vocabulary words yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? 'Click "Add Word" or "Bulk Import" to build the vocabulary table.' : 'The admin hasn\'t added any words yet.'}
          </p>
        </div>
      )}

      {words.length > 0 && (
        <>
          {/* Word table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-4 bg-slate-50 dark:bg-gray-700/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-2 border-b border-slate-200 dark:border-gray-700 text-center">
              <span className="text-left">#</span><span>Arabic</span><span>Transliteration</span><span>English</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {words.map((w, i) => (
                <div key={w.id} className="grid grid-cols-4 items-center px-4 py-3 group text-center">
                  <span className="text-xs text-slate-400 text-left">{i + 1}</span>
                  <span className="text-base text-slate-800 dark:text-slate-100" dir="rtl">{w.arabic}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{w.transliteration}</span>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-sm text-slate-700 dark:text-slate-200">{w.english}</span>
                    {isAdmin && (
                      <button onClick={() => handleDeleteWord(w.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Spaced-rep progress — tutor only, when student selected */}
          {!isAdmin && selectedStudentId && (
            (() => {
              const completed   = attempts.filter(a => a.completedAt).length;
              const totalExpected = words.length * 10; // 5 attempts × 2 modes
              const pct = totalExpected > 0 ? Math.round((completed / totalExpected) * 100) : 0;
              const status: 'not_started' | 'in_progress' | 'complete' =
                completed === 0 ? 'not_started' :
                completed >= totalExpected ? 'complete' : 'in_progress';
              return (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-700 dark:text-slate-200">Spaced-Repetition Progress</h3>
                    {status === 'complete' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
                        All sessions complete
                      </span>
                    )}
                    {status === 'in_progress' && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse" />
                        In progress
                      </span>
                    )}
                    {status === 'not_started' && (
                      <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-gray-700 text-slate-400 text-xs font-semibold rounded-full">Not started</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          status === 'complete'    ? 'bg-emerald-500' :
                          status === 'in_progress' ? 'bg-amber-400'  : 'bg-slate-200 dark:bg-gray-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-slate-400 dark:text-slate-500 flex-shrink-0">{pct}%</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {completed} / {totalExpected} spaced-repetition sessions completed
                    &nbsp;({words.length} words × 2 modes × 5 rounds)
                  </p>
                </div>
              );
            })()
          )}

          {/* Challenge section — tutor only */}
          {!isAdmin && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-4">
              <h3 className="font-bold text-slate-700 dark:text-slate-200">Flashcard Challenge</h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Recall mode</label>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-gray-600">
                    {(['arabic', 'transliteration'] as VocabMode[]).map(m => (
                      <button key={m} onClick={() => setMode(m)}
                        className={`flex-1 py-2 text-sm font-semibold transition-colors ${mode === m ? 'bg-amber-500 text-white' : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>
                        {m === 'arabic' ? 'Arabic Script' : 'Transliteration'}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Student selector only when no student pre-selected */}
                {!preSelectedStudentId && students.length > 0 && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Track progress for</label>
                    <select value={selectedStudentId} onChange={e => setStudentId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                      <option value="">No student (practice only)</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <button onClick={startChallenge}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors">
                🎴 Start Flashcard Challenge ({words.length} words)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Add single word form ──────────────────────────────────────────────────────

const AddVocabWordForm: React.FC<{ lessonId: string; onCreated: (w: VocabWord) => void; onCancel: () => void }> = ({ lessonId, onCreated, onCancel }) => {
  const [arabic, setArabic]         = useState('');
  const [translit, setTranslit]     = useState('');
  const [english, setEnglish]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');
  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!arabic.trim() || !translit.trim() || !english.trim()) { setErr('All three fields are required.'); return; }
    setSaving(true);
    const w = await createVocabWord({ lessonId, arabic: arabic.trim(), transliteration: translit.trim(), english: english.trim() });
    setSaving(false);
    if (!w) { setErr('Failed to save.'); return; }
    onCreated(w);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">Add Word</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Arabic</label>
          <input value={arabic} onChange={e => setArabic(e.target.value)} dir="rtl" placeholder="كتاب" className={inp} /></div>
        <div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Transliteration</label>
          <input value={translit} onChange={e => setTranslit(e.target.value)} placeholder="kitāb" className={inp} /></div>
        <div><label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">English</label>
          <input value={english} onChange={e => setEnglish(e.target.value)} placeholder="book" className={inp} /></div>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">Cancel</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">{saving ? 'Saving…' : 'Add Word'}</button>
      </div>
    </form>
  );
};

// ── Bulk import form ──────────────────────────────────────────────────────────

const BulkVocabImport: React.FC<{ lessonId: string; onImported: (ws: VocabWord[]) => void; onCancel: () => void }> = ({ lessonId, onImported, onCancel }) => {
  const [arabicText, setArabic]     = useState('');
  const [translitText, setTranslit] = useState('');
  const [englishText, setEnglish]   = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');

  const arabicLines  = arabicText.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const translitLines= translitText.trim().split('\n').map(s => s.trim()).filter(Boolean);
  const englishLines = englishText.trim().split('\n').map(s => s.trim()).filter(Boolean);

  const handleImport = async () => {
    setErr('');
    if (!arabicLines.length) { setErr('Paste at least one Arabic word.'); return; }
    if (arabicLines.length !== translitLines.length || arabicLines.length !== englishLines.length) {
      setErr(`Line counts don't match — Arabic: ${arabicLines.length}, Transliteration: ${translitLines.length}, English: ${englishLines.length}. Each column must have the same number of lines.`);
      return;
    }
    setSaving(true);
    const created: VocabWord[] = [];
    for (let i = 0; i < arabicLines.length; i++) {
      const w = await createVocabWord({ lessonId, arabic: arabicLines[i], transliteration: translitLines[i], english: englishLines[i] });
      if (w) created.push(w);
    }
    setSaving(false);
    onImported(created);
  };

  const ta = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white resize-none';

  return (
    <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-bold text-amber-800 dark:text-amber-300">Bulk Import</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Paste each column (one word per line). All three columns must have the same number of lines.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Arabic (one per line)</label>
          <textarea value={arabicText} onChange={e => setArabic(e.target.value)} rows={8}
            dir="rtl" placeholder={"كتاب\nقلم\nمدرسة"} className={ta} />
          <p className="text-xs text-slate-400 mt-0.5">{arabicLines.length} line{arabicLines.length !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Transliteration (one per line)</label>
          <textarea value={translitText} onChange={e => setTranslit(e.target.value)} rows={8}
            placeholder={"kitāb\nqalam\nmadrasah"} className={ta} />
          <p className="text-xs text-slate-400 mt-0.5">{translitLines.length} line{translitLines.length !== 1 ? 's' : ''}</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">English (one per line)</label>
          <textarea value={englishText} onChange={e => setEnglish(e.target.value)} rows={8}
            placeholder={"book\npen\nschool"} className={ta} />
          <p className="text-xs text-slate-400 mt-0.5">{englishLines.length} line{englishLines.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">Cancel</button>
        <button type="button" onClick={handleImport} disabled={saving || !arabicLines.length}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
          {saving ? 'Importing…' : `Import ${arabicLines.length} word${arabicLines.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// VIDEO TAB
// ═══════════════════════════════════════════════════════

const VideoTab: React.FC<{ lesson: ArabicLesson; isAdmin: boolean; onLessonUpdated: (l: ArabicLesson) => void }> = ({ lesson, isAdmin, onLessonUpdated }) => {
  const [urlInput, setUrlInput] = useState(lesson.videoUrl ?? '');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState('');

  const videoId = extractYoutubeId(lesson.videoUrl ?? '');

  const handleSave = async () => {
    setErr(''); setSaved(false);
    const trimmed = urlInput.trim();
    if (trimmed && !extractYoutubeId(trimmed)) { setErr('Please enter a valid YouTube URL.'); return; }
    setSaving(true);
    const ok = await updateArabicLesson(lesson.id, { videoUrl: trimmed || undefined });
    setSaving(false);
    if (!ok) { setErr('Failed to save.'); return; }
    onLessonUpdated({ ...lesson, videoUrl: trimmed || undefined });
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dialogue Video</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {isAdmin ? 'Paste a YouTube link for the dialogue video.' : 'Watch the dialogue video for this lesson.'}
        </p>
      </div>

      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">YouTube URL</label>
          <div className="flex gap-3">
            <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=… or https://youtu.be/…"
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white" />
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors flex-shrink-0">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {err  && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">✅ Video link saved!</p>}
        </div>
      )}

      {videoId ? (
        /* Protected embed: sandbox blocks top-navigation and popups so the
           YouTube logo / title cannot redirect the user to YouTube.com */
        <div
          className="relative bg-black rounded-2xl overflow-hidden shadow-lg select-none"
          style={{ aspectRatio: '16/9' }}
          onContextMenu={e => e.preventDefault()}
        >
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&controls=0`}
            title="Dialogue video"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
            style={{ border: 'none' }}
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-16 text-center">
          <div className="text-5xl mb-3">🎬</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">No video yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? 'Paste a YouTube link above to add a dialogue video.' : 'The admin hasn\'t added a video for this lesson yet.'}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Shared ─────────────────────────────────────────────────────────────────────

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center py-24">
    <svg className="animate-spin w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  </div>
);

export default ArabicLessonDetailPage;
