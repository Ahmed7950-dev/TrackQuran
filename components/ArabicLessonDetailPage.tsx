// components/ArabicLessonDetailPage.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-screen lesson detail overlay with 4 tabs:
//   📖 Lesson PDF  — embedded TajweedLessonViewer (whiteboard + PDF viewer)
//   📝 Homework    — admin creates exercises; tutor practises them
//   🔤 Vocabulary  — admin adds word table; tutor runs flashcard challenge
//   🎬 Dialogue Video — admin adds YouTube link; tutor watches embedded video
// ─────────────────────────────────────────────────────────────────────────────

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
  getHomeworkQuestions, createHomeworkQuestion, deleteHomeworkQuestion,
  getVocabWords, createVocabWord, deleteVocabWord,
  getVocabAttempts, saveVocabAttempts,
  updateArabicLesson,
  setArabicLessonCompletion,
} from '../services/arabicService';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripDiacritics(s: string): string {
  return s.replace(/[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۤۧۨ-ۭ]/g, '');
}

function answersMatch(correct: string, user: string): boolean {
  const norm = (s: string) => stripDiacritics(s).toLowerCase().trim().replace(/\s+/g, ' ');
  return norm(correct) === norm(user);
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

// Spaced-rep delay in days AFTER each completed attempt
const SR_DELAYS = [1, 3, 7, 14]; // after attempt 1 → +1d, 2 → +3d, 3 → +7d, 4 → +14d

type Tab = 'lesson' | 'homework' | 'vocabulary' | 'video';

const QUESTION_TYPE_LABELS: Record<HomeworkQuestionType, string> = {
  multiple_choice:      'Multiple Choice',
  true_false:           'True / False',
  translate_to_arabic:  'Translate → Arabic',
  translate_to_english: 'Translate → English',
  fill_blank:           'Fill in the Blank',
  fill_blank_options:   'Fill in the Blank (with choices)',
};

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
  lesson: initialLesson, students, teacherId, preSelectedStudentId, onClose, onStudentUpdated,
}) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  // Keep a local copy so videoUrl updates are reflected without re-fetching
  const [lesson, setLesson] = useState(initialLesson);
  const [activeTab, setActiveTab] = useState<Tab>(initialLesson.pdfUrl ? 'lesson' : 'homework');

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'lesson',     icon: '📖', label: 'Lesson PDF'     },
    { id: 'homework',   icon: '📝', label: 'Homework'       },
    { id: 'vocabulary', icon: '🔤', label: 'Vocabulary'     },
    { id: 'video',      icon: '🎬', label: 'Dialogue Video' },
  ];

  // TajweedLesson shape for the embedded viewer
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
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="font-semibold text-sm">All Lessons</span>
        </button>
        <div className="w-px h-5 bg-slate-200 dark:bg-gray-600" />
        <h1 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate flex-1">{lesson.title}</h1>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">

        {activeTab === 'lesson' && (
          lesson.pdfUrl ? (
            <TajweedLessonViewer
              embedded
              lesson={tajweedLesson}
              students={studentCompat}
              tutorId={teacherId}
              preSelectedStudentId={preSelectedStudentId}
              fetchCompletedIds={async (sid) => new Set(students.find(x => x.id === sid)?.completedLessonIds ?? [])}
              onMarkCompleted={async (sid, lid) => { await handleMarkDone(sid, lid, true); return true; }}
              onUnmarkCompleted={async (sid, lid) => { await handleMarkDone(sid, lid, false); return true; }}
              onClose={() => {}}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 gap-3">
              <span className="text-5xl">📄</span>
              <p className="text-sm">No PDF attached to this lesson yet.</p>
              {isAdmin && <p className="text-xs text-slate-400">Edit the lesson to upload a PDF.</p>}
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
              lessonId={lesson.id}
              isAdmin={isAdmin}
              students={students}
              preSelectedStudentId={preSelectedStudentId}
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

// ═════════════════════════════════════════════════════════════════════════════
// HOMEWORK TAB
// ═════════════════════════════════════════════════════════════════════════════

interface HomeworkTabProps { lessonId: string; isAdmin: boolean; }

type PracticePhase = 'idle' | 'practising' | 'done';

const HomeworkTab: React.FC<HomeworkTabProps> = ({ lessonId, isAdmin }) => {
  const [questions, setQuestions]     = useState<HomeworkQuestion[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [practicePhase, setPracticePhase] = useState<PracticePhase>('idle');
  const [qIndex, setQIndex]           = useState(0);
  const [userAnswer, setUserAnswer]   = useState('');
  const [feedback, setFeedback]       = useState<'correct' | 'wrong' | null>(null);
  const [score, setScore]             = useState(0);

  useEffect(() => {
    getHomeworkQuestions(lessonId).then(qs => { setQuestions(qs); setLoading(false); });
  }, [lessonId]);

  const startPractice = () => {
    setQIndex(0); setUserAnswer(''); setFeedback(null); setScore(0);
    setPracticePhase('practising');
  };

  const submitAnswer = () => {
    if (!feedback && !userAnswer.trim()) return;
    const q = questions[qIndex];
    const correct = answersMatch(q.correctAnswer, userAnswer) ||
      (q.type === 'true_false' && userAnswer === q.correctAnswer);
    setFeedback(correct ? 'correct' : 'wrong');
    if (correct) setScore(s => s + 1);
  };

  const nextQuestion = () => {
    if (qIndex + 1 >= questions.length) { setPracticePhase('done'); return; }
    setQIndex(i => i + 1); setUserAnswer(''); setFeedback(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return;
    const ok = await deleteHomeworkQuestion(id);
    if (ok) setQuestions(prev => prev.filter(q => q.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  // ── Practice mode ────────────────────────────────────────────────────────
  if (practicePhase === 'practising') {
    const q = questions[qIndex];
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">Question {qIndex + 1} of {questions.length}</span>
          <button onClick={() => setPracticePhase('idle')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">× Exit practice</button>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${((qIndex) / questions.length) * 100}%` }} />
        </div>

        {/* Question card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6 shadow-sm space-y-4">
          <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">
            {QUESTION_TYPE_LABELS[q.type]}
          </span>
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-100" dir={q.type === 'translate_to_english' ? 'rtl' : 'ltr'}>
            {q.question}
          </p>

          {/* Answer input */}
          {(q.type === 'multiple_choice' || q.type === 'fill_blank_options') && q.options?.length ? (
            <div className="space-y-2">
              {q.options.map((opt, i) => (
                <button key={i} disabled={!!feedback}
                  onClick={() => setUserAnswer(opt)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border-2 text-sm transition-colors ${
                    userAnswer === opt
                      ? feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                        : feedback === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-600 text-slate-700 dark:text-slate-200'
                  }`}>
                  {String.fromCharCode(65 + i)}. {opt}
                </button>
              ))}
            </div>
          ) : q.type === 'true_false' ? (
            <div className="flex gap-3">
              {['True', 'False'].map(opt => (
                <button key={opt} disabled={!!feedback}
                  onClick={() => setUserAnswer(opt)}
                  className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                    userAnswer === opt
                      ? feedback === 'correct' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                        : feedback === 'wrong' ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-600 text-slate-700 dark:text-slate-200'
                  }`}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input
              type="text"
              value={userAnswer}
              onChange={e => setUserAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !feedback) submitAnswer(); }}
              disabled={!!feedback}
              dir={q.type === 'translate_to_arabic' ? 'rtl' : 'ltr'}
              placeholder="Type your answer…"
              className="w-full px-4 py-2.5 border-2 border-slate-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:border-amber-400 dark:bg-gray-700 dark:text-white"
              autoFocus
            />
          )}

          {/* Feedback banner */}
          {feedback && (
            <div className={`flex items-start gap-3 p-3 rounded-xl ${feedback === 'correct' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              <span className="text-xl">{feedback === 'correct' ? '✅' : '❌'}</span>
              <div>
                <p className="font-semibold">{feedback === 'correct' ? 'Correct!' : 'Incorrect'}</p>
                {feedback === 'wrong' && (
                  <p className="text-sm mt-0.5">Correct answer: <span className="font-bold">{q.correctAnswer}</span></p>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {!feedback ? (
              <button onClick={submitAnswer} disabled={!userAnswer}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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

  // ── Results screen ────────────────────────────────────────────────────────
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
        <button onClick={() => setPracticePhase('idle')}
          className="w-full py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
          Back to Questions
        </button>
      </div>
    );
  }

  // ── Normal view ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Homework Questions</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {questions.length} {questions.length === 1 ? 'exercise' : 'exercises'}
            {isAdmin ? ' · admin can add / delete questions' : ' · click Practice to test yourself'}
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
            <button onClick={() => setShowForm(v => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm">
              {showForm ? '✕ Cancel' : '+ Add Question'}
            </button>
          )}
        </div>
      </div>

      {/* Add Question Form */}
      {isAdmin && showForm && (
        <AddHomeworkQuestionForm
          lessonId={lessonId}
          onCreated={q => { setQuestions(prev => [...prev, q]); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Empty state */}
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
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    ✓ Answer: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{q.correctAnswer}</span>
                  </p>
                )}
                {isAdmin && q.options?.length && (
                  <p className="text-xs text-slate-400">Options: {q.options.join(' · ')}</p>
                )}
              </div>
              {isAdmin && (
                <button onClick={() => handleDelete(q.id)}
                  className="flex-shrink-0 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Start practice button at bottom (convenience) */}
      {questions.length > 0 && !isAdmin && (
        <button onClick={startPractice}
          className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors">
          ▶ Start Practice ({questions.length} questions)
        </button>
      )}
    </div>
  );
};

// ── Add Homework Question Form ────────────────────────────────────────────────

interface AddHWProps {
  lessonId: string;
  onCreated: (q: HomeworkQuestion) => void;
  onCancel: () => void;
}

const AddHomeworkQuestionForm: React.FC<AddHWProps> = ({ lessonId, onCreated, onCancel }) => {
  const [type, setType] = useState<HomeworkQuestionType>('multiple_choice');
  const [question, setQuestion] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!question.trim()) { setErr('Question text is required.'); return; }
    if (!correctAnswer.trim()) { setErr('Correct answer is required.'); return; }
    if ((type === 'multiple_choice' || type === 'fill_blank_options') && options.some(o => !o.trim())) {
      setErr('All options must be filled in.'); return;
    }
    setSaving(true);
    const opts = (type === 'multiple_choice' || type === 'fill_blank_options')
      ? options.map(o => o.trim()) : undefined;
    const q = await createHomeworkQuestion({ lessonId, type, question: question.trim(), options: opts, correctAnswer: correctAnswer.trim() });
    setSaving(false);
    if (!q) { setErr('Failed to save. Please try again.'); return; }
    onCreated(q);
  };

  const needsOptions = type === 'multiple_choice' || type === 'fill_blank_options';
  const isArabicAnswer = type === 'translate_to_arabic';

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">New Question</h3>

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Question type</label>
        <select value={type} onChange={e => setType(e.target.value as HomeworkQuestionType)} className={inp}>
          {(Object.entries(QUESTION_TYPE_LABELS) as [HomeworkQuestionType, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
          {type === 'translate_to_english' ? 'Arabic text to translate' : 'Question / Statement'}
        </label>
        <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
          dir={type === 'translate_to_english' ? 'rtl' : 'ltr'}
          placeholder={type === 'fill_blank' || type === 'fill_blank_options' ? 'e.g. The word for "book" is ___.' : 'Enter question…'}
          className={inp} />
      </div>

      {needsOptions && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Options</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 w-4">{String.fromCharCode(65 + i)}.</span>
                <input value={opt} onChange={e => setOptions(prev => prev.map((o, j) => j === i ? e.target.value : o))}
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  dir={isArabicAnswer ? 'rtl' : 'ltr'}
                  className={inp} />
              </div>
            ))}
          </div>
        </div>
      )}

      {type === 'true_false' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Correct answer</label>
          <div className="flex gap-3">
            {['True', 'False'].map(v => (
              <button key={v} type="button"
                onClick={() => setCorrectAnswer(v)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                  correctAnswer === v ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'
                }`}>{v}</button>
            ))}
          </div>
        </div>
      )}

      {type !== 'true_false' && (
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
            Correct answer {needsOptions ? '(must match one of the options above)' : ''}
          </label>
          <input value={correctAnswer} onChange={e => setCorrectAnswer(e.target.value)}
            dir={isArabicAnswer ? 'rtl' : 'ltr'}
            placeholder="Enter the correct answer…"
            className={inp} />
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
          {saving ? 'Saving…' : 'Add Question'}
        </button>
      </div>
    </form>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// VOCABULARY TAB
// ═════════════════════════════════════════════════════════════════════════════

interface VocabTabProps {
  lessonId: string;
  isAdmin: boolean;
  students: ArabicStudent[];
  preSelectedStudentId?: string;
}

type ChallengePhase = 'idle' | 'active' | 'wrong' | 'complete';

const VocabularyTab: React.FC<VocabTabProps> = ({ lessonId, isAdmin, students, preSelectedStudentId }) => {
  const [words, setWords]               = useState<VocabWord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showAddWord, setShowAddWord]   = useState(false);
  const [mode, setMode]                 = useState<VocabMode>('arabic');
  const [selectedStudentId, setSelectedStudentId] = useState(preSelectedStudentId ?? '');
  const [attempts, setAttempts]         = useState<VocabAttempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);

  // Challenge state
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('idle');
  const [shuffled, setShuffled]         = useState<VocabWord[]>([]);
  const [cardIndex, setCardIndex]       = useState(0);
  const [userInput, setUserInput]       = useState('');
  const [cardFeedback, setCardFeedback] = useState<'correct' | 'wrong' | 'revealed' | null>(null);
  const [wrongWords, setWrongWords]     = useState<VocabWord[]>([]);
  const [savingProgress, setSavingProgress] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getVocabWords(lessonId).then(ws => { setWords(ws); setLoading(false); });
  }, [lessonId]);

  useEffect(() => {
    if (!selectedStudentId) { setAttempts([]); return; }
    setAttemptsLoading(true);
    getVocabAttempts(selectedStudentId, lessonId)
      .then(setAttempts)
      .finally(() => setAttemptsLoading(false));
  }, [selectedStudentId, lessonId]);

  const startChallenge = () => {
    if (!words.length) return;
    setShuffled(shuffleArray(words));
    setCardIndex(0); setUserInput(''); setCardFeedback(null); setWrongWords([]);
    setChallengePhase('active');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const submitCard = () => {
    const word = shuffled[cardIndex];
    const correct = answersMatch(mode === 'arabic' ? word.arabic : word.transliteration, userInput);
    if (correct) {
      setCardFeedback('correct');
    } else {
      setCardFeedback('wrong');
      setWrongWords(prev => [...prev.filter(w => w.id !== word.id), word]);
      setChallengePhase('wrong');
    }
  };

  const revealAnswer = () => {
    setCardFeedback('revealed');
    setWrongWords(prev => [...prev.filter(w => w.id !== shuffled[cardIndex].id), shuffled[cardIndex]]);
    setChallengePhase('wrong');
  };

  const restartChallenge = () => {
    setShuffled(shuffleArray(words));
    setCardIndex(0); setUserInput(''); setCardFeedback(null);
    setChallengePhase('active');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const nextCard = () => {
    if (cardIndex + 1 >= shuffled.length) {
      // All done correctly!
      setChallengePhase('complete');
      if (selectedStudentId) saveSpacedRep();
    } else {
      setCardIndex(i => i + 1); setUserInput(''); setCardFeedback(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const saveSpacedRep = async () => {
    if (!selectedStudentId) return;
    setSavingProgress(true);
    const now = new Date();
    const newAttempts: VocabAttempt[] = [];

    for (const word of words) {
      // Find completed attempts for this word+mode
      const existing = attempts.filter(a => a.wordId === word.id && a.mode === mode && a.completedAt);
      const nextAttemptNum = existing.length + 1;
      if (nextAttemptNum > 5) continue; // Already mastered

      // Check if there's a pending scheduled attempt for this word
      const pending = attempts.find(a => a.wordId === word.id && a.mode === mode && !a.completedAt);

      if (pending) {
        // Mark it as completed
        const updatedPending: VocabAttempt = { ...pending, completedAt: now.toISOString() };
        newAttempts.push(updatedPending);

        // Schedule next attempt if not at max
        if (pending.attemptNumber < 5) {
          const delayDays = SR_DELAYS[pending.attemptNumber - 1] ?? 14;
          const nextDate = new Date(now);
          nextDate.setDate(nextDate.getDate() + delayDays);
          newAttempts.push({
            id: `vat-${Date.now()}-${word.id}-${pending.attemptNumber + 1}`,
            studentId: selectedStudentId,
            wordId: word.id,
            lessonId,
            attemptNumber: pending.attemptNumber + 1,
            mode,
            scheduledAt: nextDate.toISOString(),
            completedAt: undefined,
            createdAt: now.toISOString(),
          });
        }
      } else if (nextAttemptNum === 1) {
        // First time doing this word — create attempt 1 (completed now)
        newAttempts.push({
          id: `vat-${Date.now()}-${word.id}-1`,
          studentId: selectedStudentId,
          wordId: word.id,
          lessonId,
          attemptNumber: 1,
          mode,
          scheduledAt: now.toISOString(),
          completedAt: now.toISOString(),
          createdAt: now.toISOString(),
        });
        // Schedule attempt 2
        const nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + SR_DELAYS[0]);
        newAttempts.push({
          id: `vat-${Date.now()}-${word.id}-2`,
          studentId: selectedStudentId,
          wordId: word.id,
          lessonId,
          attemptNumber: 2,
          mode,
          scheduledAt: nextDate.toISOString(),
          completedAt: undefined,
          createdAt: now.toISOString(),
        });
      }
    }

    await saveVocabAttempts(newAttempts);
    // Refresh attempts
    const fresh = await getVocabAttempts(selectedStudentId, lessonId);
    setAttempts(fresh);
    setSavingProgress(false);
  };

  const handleDeleteWord = async (id: string) => {
    if (!confirm('Delete this word?')) return;
    const ok = await deleteVocabWord(id);
    if (ok) setWords(prev => prev.filter(w => w.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  // ── Challenge active ──────────────────────────────────────────────────────
  if (challengePhase === 'active' || challengePhase === 'wrong') {
    const word = shuffled[cardIndex];
    const isWrong = challengePhase === 'wrong';

    return (
      <div className="max-w-xl mx-auto p-6 space-y-5">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Card {cardIndex + 1} / {shuffled.length}
          </span>
          <button onClick={() => setChallengePhase('idle')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            × Exit challenge
          </button>
        </div>
        <div className="h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(cardIndex / shuffled.length) * 100}%` }} />
        </div>

        {/* Flashcard */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center shadow-sm space-y-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">What is the {mode === 'arabic' ? 'Arabic' : 'transliteration'} for…</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{word.english}</p>

          {cardFeedback === 'revealed' && (
            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
              <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold">Answer:</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300" dir={mode === 'arabic' ? 'rtl' : 'ltr'}>
                {mode === 'arabic' ? word.arabic : word.transliteration}
              </p>
            </div>
          )}
          {cardFeedback === 'wrong' && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <p className="text-sm text-red-600 dark:text-red-400 font-semibold">Incorrect — correct answer:</p>
              <p className="text-xl font-bold text-red-700 dark:text-red-300" dir={mode === 'arabic' ? 'rtl' : 'ltr'}>
                {mode === 'arabic' ? word.arabic : word.transliteration}
              </p>
            </div>
          )}
          {cardFeedback === 'correct' && (
            <div className="mt-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">✅ Correct!</p>
            </div>
          )}
        </div>

        {/* Input / controls */}
        {!cardFeedback && !isWrong && (
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCard(); }}
              dir={mode === 'arabic' ? 'rtl' : 'ltr'}
              placeholder={mode === 'arabic' ? 'اكتب بالعربية…' : 'Type transliteration…'}
              className="w-full px-4 py-3 border-2 border-slate-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:border-amber-400 dark:bg-gray-700 dark:text-white text-center"
            />
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
            {cardIndex + 1 >= shuffled.length ? 'Finish Challenge 🎉' : 'Next Card →'}
          </button>
        )}

        {isWrong && (
          <div className="space-y-3">
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
              <p className="font-bold text-red-700 dark:text-red-300">❌ Let's start over!</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                You need to get all words right in a row. Keep practising — you'll get it!
              </p>
            </div>
            <button onClick={restartChallenge}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl transition-colors">
              🔄 Start Over
            </button>
            <button onClick={() => setChallengePhase('idle')}
              className="w-full py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-sm">
              Back to word list
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Challenge complete ────────────────────────────────────────────────────
  if (challengePhase === 'complete') {
    return (
      <div className="max-w-xl mx-auto p-6 space-y-5">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center shadow-sm space-y-4">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">Challenge Complete!</h2>
          <p className="text-slate-500 dark:text-slate-400">
            You got all {words.length} words correct in a row!
          </p>
          {selectedStudentId && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              {savingProgress ? '⏳ Saving progress…' : '✅ Spaced-repetition progress saved!'}
            </p>
          )}
          {!selectedStudentId && (
            <p className="text-xs text-slate-400">Select a student to track spaced-repetition progress.</p>
          )}
        </div>

        {wrongWords.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">Words that need more practice</h3>
            <p className="text-xs text-slate-400">These words were tricky — review them extra before the next session.</p>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {wrongWords.map(w => (
                <div key={w.id} className="py-2.5 grid grid-cols-3 gap-2 text-sm">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{w.english}</span>
                  <span className="text-right" dir="rtl">{w.arabic}</span>
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
          <button onClick={() => setChallengePhase('idle')}
            className="flex-1 py-2.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
            Back to Words
          </button>
        </div>
      </div>
    );
  }

  // ── Normal / idle view ────────────────────────────────────────────────────
  // Due words for current student
  const now = new Date();
  const dueWords = words.filter(w => {
    const pending = attempts.find(a => a.wordId === w.id && a.mode === mode && !a.completedAt);
    const done5 = attempts.filter(a => a.wordId === w.id && a.mode === mode && a.completedAt).length >= 5;
    if (done5) return false;
    if (!pending) return true; // Never started
    return new Date(pending.scheduledAt) <= now;
  });

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vocabulary Trainer</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {words.length} {words.length === 1 ? 'word' : 'words'}
            {isAdmin ? ' · admin can add / remove words' : ' · run the flashcard challenge to practise'}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAddWord(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg transition-colors text-sm">
            {showAddWord ? '✕ Cancel' : '+ Add Word'}
          </button>
        )}
      </div>

      {/* Add word form */}
      {isAdmin && showAddWord && (
        <AddVocabWordForm
          lessonId={lessonId}
          onCreated={w => { setWords(prev => [...prev, w]); setShowAddWord(false); }}
          onCancel={() => setShowAddWord(false)}
        />
      )}

      {/* Empty state */}
      {words.length === 0 && !showAddWord && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-3">🔤</div>
          <p className="font-semibold text-slate-700 dark:text-slate-200">No vocabulary words yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAdmin ? 'Click "Add Word" to build the vocabulary table.' : 'The admin hasn\'t added any words yet.'}
          </p>
        </div>
      )}

      {words.length > 0 && (
        <>
          {/* Word table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="grid grid-cols-4 bg-slate-50 dark:bg-gray-700/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-2 border-b border-slate-200 dark:border-gray-700">
              <span>#</span>
              <span>Arabic</span>
              <span>Transliteration</span>
              <span>English</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-gray-700">
              {words.map((w, i) => (
                <div key={w.id} className="grid grid-cols-4 items-center px-4 py-3 group">
                  <span className="text-xs text-slate-400">{i + 1}</span>
                  <span className="font-arabic text-lg text-slate-800 dark:text-slate-100" dir="rtl">{w.arabic}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{w.transliteration}</span>
                  <div className="flex items-center justify-between gap-2">
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

          {/* Challenge controls */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-4">
            <h3 className="font-bold text-slate-700 dark:text-slate-200">Flashcard Challenge</h3>

            <div className="flex flex-wrap gap-4">
              {/* Mode selector */}
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

              {/* Student selector */}
              {students.length > 0 && (
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Track progress for</label>
                  <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
                    <option value="">No student (practice only)</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {selectedStudentId && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {attemptsLoading ? 'Loading progress…' : (
                  dueWords.length > 0
                    ? `📅 ${dueWords.length} word${dueWords.length === 1 ? '' : 's'} due for review`
                    : '✅ No words currently due — practise anytime!'
                )}
              </p>
            )}

            <button onClick={startChallenge}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors">
              🎴 Start Flashcard Challenge ({words.length} words)
            </button>
          </div>

          {/* Spaced-rep progress table */}
          {selectedStudentId && !attemptsLoading && attempts.length > 0 && (
            <SpacedRepProgressTable words={words} attempts={attempts} mode={mode} />
          )}
        </>
      )}
    </div>
  );
};

// ── Add Vocab Word Form ───────────────────────────────────────────────────────

interface AddVocabWordFormProps {
  lessonId: string;
  onCreated: (w: VocabWord) => void;
  onCancel: () => void;
}

const AddVocabWordForm: React.FC<AddVocabWordFormProps> = ({ lessonId, onCreated, onCancel }) => {
  const [arabic, setArabic]             = useState('');
  const [transliteration, setTranslit] = useState('');
  const [english, setEnglish]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState('');

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (!arabic.trim() || !transliteration.trim() || !english.trim()) {
      setErr('All three fields are required.'); return;
    }
    setSaving(true);
    const w = await createVocabWord({ lessonId, arabic: arabic.trim(), transliteration: transliteration.trim(), english: english.trim() });
    setSaving(false);
    if (!w) { setErr('Failed to save. Please try again.'); return; }
    onCreated(w);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 space-y-4">
      <h3 className="font-bold text-amber-800 dark:text-amber-300">Add Vocabulary Word</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Arabic</label>
          <input value={arabic} onChange={e => setArabic(e.target.value)} dir="rtl" placeholder="كتاب" className={inp} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Transliteration</label>
          <input value={transliteration} onChange={e => setTranslit(e.target.value)} placeholder="kitāb" className={inp} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">English</label>
          <input value={english} onChange={e => setEnglish(e.target.value)} placeholder="book" className={inp} />
        </div>
      </div>
      {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-600 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : 'Add Word'}
        </button>
      </div>
    </form>
  );
};

// ── Spaced Rep Progress Table ─────────────────────────────────────────────────

interface SRTableProps { words: VocabWord[]; attempts: VocabAttempt[]; mode: VocabMode; }

const SpacedRepProgressTable: React.FC<SRTableProps> = ({ words, attempts, mode }) => {
  const now = new Date();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 dark:border-gray-700">
        <h3 className="font-bold text-slate-700 dark:text-slate-200">Spaced-Repetition Progress</h3>
        <p className="text-xs text-slate-400 mt-0.5">Mode: {mode === 'arabic' ? 'Arabic Script' : 'Transliteration'}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-gray-700/50 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Word</th>
              {[1, 2, 3, 4, 5].map(n => (
                <th key={n} className="px-3 py-2 font-semibold text-center">Attempt {n}</th>
              ))}
              <th className="px-4 py-2 font-semibold text-left">Next review</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-700">
            {words.map(w => {
              const wordAttempts = attempts.filter(a => a.wordId === w.id && a.mode === mode);
              const pending = wordAttempts.find(a => !a.completedAt);
              const isDue = pending && new Date(pending.scheduledAt) <= now;
              const mastered = wordAttempts.filter(a => a.completedAt).length >= 5;

              return (
                <tr key={w.id}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">{w.english}</p>
                    <p className="text-slate-400" dir="rtl">{w.arabic}</p>
                  </td>
                  {[1, 2, 3, 4, 5].map(n => {
                    const att = wordAttempts.find(a => a.attemptNumber === n);
                    return (
                      <td key={n} className="px-3 py-2.5 text-center">
                        {att?.completedAt ? (
                          <span title={new Date(att.completedAt).toLocaleDateString()} className="text-emerald-500">✅</span>
                        ) : att ? (
                          <span title={`Due ${new Date(att.scheduledAt).toLocaleDateString()}`} className={isDue && att.attemptNumber === pending?.attemptNumber ? 'text-amber-500 font-bold' : 'text-slate-300 dark:text-gray-600'}>⏳</span>
                        ) : (
                          <span className="text-slate-200 dark:text-gray-700">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {mastered ? <span className="text-emerald-600 font-semibold">Mastered 🌟</span>
                      : pending
                        ? <span className={isDue ? 'text-amber-600 font-semibold' : ''}>
                            {isDue ? 'Due now' : new Date(pending.scheduledAt).toLocaleDateString()}
                          </span>
                        : <span className="text-slate-300">Not started</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// VIDEO TAB
// ═════════════════════════════════════════════════════════════════════════════

interface VideoTabProps {
  lesson: ArabicLesson;
  isAdmin: boolean;
  onLessonUpdated: (l: ArabicLesson) => void;
}

const VideoTab: React.FC<VideoTabProps> = ({ lesson, isAdmin, onLessonUpdated }) => {
  const [urlInput, setUrlInput] = useState(lesson.videoUrl ?? '');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState('');

  const videoId = extractYoutubeId(lesson.videoUrl ?? '');

  const handleSave = async () => {
    setErr(''); setSaved(false);
    const trimmed = urlInput.trim();
    if (trimmed && !extractYoutubeId(trimmed)) {
      setErr('Please enter a valid YouTube URL (youtube.com/watch?v=… or youtu.be/…).');
      return;
    }
    setSaving(true);
    const ok = await updateArabicLesson(lesson.id, { videoUrl: trimmed || undefined });
    setSaving(false);
    if (!ok) { setErr('Failed to save. Please try again.'); return; }
    onLessonUpdated({ ...lesson, videoUrl: trimmed || undefined });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dialogue Video</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {isAdmin ? 'Add a YouTube link for students to watch an example dialogue.' : 'Watch the dialogue video for this lesson.'}
        </p>
      </div>

      {/* Admin URL input */}
      {isAdmin && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">YouTube URL</label>
          <div className="flex gap-3">
            <input
              type="url"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=… or https://youtu.be/…"
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
            />
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors flex-shrink-0">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
          {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
          {saved && <p className="text-sm text-emerald-600 dark:text-emerald-400">✅ Video link saved!</p>}
        </div>
      )}

      {/* Video player */}
      {videoId ? (
        <div className="bg-black rounded-2xl overflow-hidden shadow-lg" style={{ aspectRatio: '16/9' }}>
          {/* Protected embed: sandbox prevents navigation, no right-click download */}
          <div
            className="w-full h-full relative"
            onContextMenu={e => e.preventDefault()}
          >
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&fs=1`}
              title="Dialogue video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
              style={{ border: 'none', pointerEvents: 'auto' }}
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            />
            {/* Overlay to block right-click context on iframe — transparent div on top */}
            <div
              className="absolute inset-0"
              style={{ pointerEvents: 'none' }}
              onContextMenu={e => e.preventDefault()}
            />
          </div>
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

// ═════════════════════════════════════════════════════════════════════════════
// SHARED UTILS
// ═════════════════════════════════════════════════════════════════════════════

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center py-24">
    <svg className="animate-spin w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
    </svg>
  </div>
);

export default ArabicLessonDetailPage;
