// components/ArabicStudentDetailPage.tsx
// ---------------------------------------------------------------------------
// Shows a single Arabic student's profile info + lesson progress list +
// student's spaced-rep / wrong-word progress tab.
// ---------------------------------------------------------------------------

import React, { useEffect, useRef, useState } from 'react';
import { ArabicStudent, ArabicLesson, WeeklySlot, VocabAttempt, VocabMistakeDetail } from '../types';
import {
  getArabicLessons,
  getAllVocabAttemptsForStudent,
  getVocabWordCountsByLesson,
  getVocabMistakesForStudent,
  removeVocabMistakes,
} from '../services/arabicService';
import ArabicAddStudentModal from './ArabicAddStudentModal';
import ArabicLessonPage from './ArabicLessonPage';

interface Props {
  student: ArabicStudent;
  teacherId: string;
  onBack: () => void;
  onUpdateStudent: (s: ArabicStudent) => void;
  onDeleteStudent: (id: string) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 12);

function formatHour(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h > 12 ? h - 12 : h}:00 ${ampm}`;
}

function progressPercent(s: ArabicStudent) {
  return Math.min(100, Math.round((s.completedLessonIds.length / 60) * 100));
}

function weeksLeft(deadline?: string): number | null {
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - Date.now();
  return Math.max(0, Math.round(ms / (7 * 24 * 3600 * 1000)));
}

function lpw(s: ArabicStudent): number | null {
  if (!s.goalDeadline) return null;
  const wl = weeksLeft(s.goalDeadline);
  if (!wl || wl <= 0) return null;
  return Math.ceil((60 - s.completedLessonIds.length) / wl);
}

function dialectLabel(d: string) {
  return { msa: 'Modern Standard Arabic', levantine: 'Levantine Arabic', quranic: 'Quranic Arabic' }[d] ?? d;
}

// ── Availability grid ─────────────────────────────────────────────────────────

const AvailabilityGrid: React.FC<{ slots: WeeklySlot[]; timezone: string }> = ({ slots, timezone }) => {
  const grid = new Set(slots.map(s => `${s.day}:${s.startHour}`));
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-gray-600">
      <table className="w-full text-xs border-collapse min-w-[420px]">
        <thead>
          <tr>
            <th className="w-14 bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 px-2 text-slate-500 dark:text-slate-400 font-semibold text-left">Time</th>
            {DAYS_SHORT.map((d, i) => (
              <th key={i} className="bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 py-2 text-center font-semibold text-slate-600 dark:text-slate-300">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map(h => (
            <tr key={h}>
              <td className="bg-slate-50 dark:bg-gray-700 border-b border-r border-slate-200 dark:border-gray-600 px-2 py-1.5 text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                {formatHour(h)}
              </td>
              {DAYS_SHORT.map((_, d) => {
                const active = grid.has(`${d}:${h}`);
                return (
                  <td key={d} className={`border-b border-r border-slate-200 dark:border-gray-600 h-6 ${active ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-white dark:bg-gray-800'}`} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-400 dark:text-slate-500 px-3 py-1.5">Times shown in {timezone}</p>
    </div>
  );
};

// ── Info row ──────────────────────────────────────────────────────────────────

const InfoRow: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) =>
  value ? (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide sm:w-40 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 sm:mt-0">{value}</dd>
    </div>
  ) : null;

// ── Mini flashcard challenge for wrong words ──────────────────────────────────

interface MiniChallengeProps {
  words: VocabMistakeDetail[];
  lessonTitle: string;
  onComplete: (correctWordIds: string[]) => void;
  onCancel: () => void;
}

const MiniChallenge: React.FC<MiniChallengeProps> = ({ words, lessonTitle, onComplete, onCancel }) => {
  const [cardIndex, setCardIndex] = useState(0);
  const [input, setInput] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [correctIds, setCorrectIds] = useState<string[]>([]);
  const [wrongWords, setWrongWords] = useState<VocabMistakeDetail[]>([]);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = words[cardIndex];

  useEffect(() => {
    if (!revealed) inputRef.current?.focus();
  }, [cardIndex, revealed]);

  function check() {
    if (!input.trim()) return;
    const correct = input.trim() === currentWord.arabic.trim();
    setIsCorrect(correct);
    setRevealed(true);
    if (correct) {
      setCorrectIds(prev => [...prev, currentWord.id]);
    } else {
      setWrongWords(prev => [...prev, currentWord]);
    }
  }

  function advance() {
    setInput('');
    setRevealed(false);
    if (cardIndex + 1 >= words.length) {
      setDone(true);
    } else {
      setCardIndex(prev => prev + 1);
    }
  }

  if (done) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center space-y-6 max-w-lg mx-auto">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto text-3xl ${correctIds.length === words.length ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
          {correctIds.length === words.length ? '🎉' : '📝'}
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Practice Complete!</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{lessonTitle}</p>
        </div>
        <div className="flex justify-center gap-8">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">{correctIds.length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Correct</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-extrabold text-red-500 dark:text-red-400">{wrongWords.length}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Still wrong</p>
          </div>
        </div>
        {wrongWords.length > 0 && (
          <div className="text-left rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
            <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">Still needs practice:</p>
            <div className="space-y-1">
              {wrongWords.map(w => (
                <div key={w.id} className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-slate-800 dark:text-slate-100 dir-rtl" dir="rtl">{w.arabic}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-600 dark:text-slate-300">{w.english}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {correctIds.length > 0
            ? `${correctIds.length} word${correctIds.length > 1 ? 's' : ''} will be removed from your wrong words list.`
            : 'No words will be removed — keep practising!'}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => onComplete(correctIds)}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl text-sm transition-colors">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-slate-100">Practising wrong words</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{lessonTitle}</p>
        </div>
        <button onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          Cancel
        </button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-300"
            style={{ width: `${((cardIndex) / words.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-slate-400 font-mono">{cardIndex + 1}/{words.length}</span>
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center space-y-6 shadow-sm">
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1">Type the Arabic</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{currentWord.english}</p>
          {currentWord.transliteration && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 italic">{currentWord.transliteration}</p>
          )}
        </div>

        {!revealed ? (
          <div className="space-y-3">
            <input
              ref={inputRef}
              dir="rtl"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && check()}
              placeholder="اكتب هنا..."
              className="w-full text-center text-xl px-4 py-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-gray-500 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors font-arabic"
            />
            <button
              onClick={check}
              disabled={!input.trim()}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors">
              Check
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`rounded-xl p-4 ${isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
              <p className={`text-sm font-semibold mb-1 ${isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {isCorrect ? '✓ Correct!' : '✗ Not quite'}
              </p>
              {!isCorrect && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Correct answer: <span className="font-bold text-lg" dir="rtl">{currentWord.arabic}</span>
                </p>
              )}
            </div>
            <button
              onClick={advance}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-xl text-sm transition-colors">
              {cardIndex + 1 >= words.length ? 'See Results →' : 'Next →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Student's Progress Tab ────────────────────────────────────────────────────

interface ProgressTabProps {
  student: ArabicStudent;
  lessons: ArabicLesson[];
  onMistakesUpdated: () => void;
}

const ProgressTab: React.FC<ProgressTabProps> = ({ student, lessons, onMistakesUpdated }) => {
  const [attempts, setAttempts] = useState<VocabAttempt[]>([]);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [mistakes, setMistakes] = useState<VocabMistakeDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Mini challenge state
  const [challengeWords, setChallengeWords] = useState<VocabMistakeDetail[] | null>(null);
  const [challengeLessonTitle, setChallengeLessonTitle] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [att, wc, mis] = await Promise.all([
        getAllVocabAttemptsForStudent(student.id),
        getVocabWordCountsByLesson(),
        getVocabMistakesForStudent(student.id),
      ]);
      setAttempts(att);
      setWordCounts(wc);
      setMistakes(mis);
      setLoading(false);
    })();
  }, [student.id]);

  async function handleChallengeComplete(correctWordIds: string[]) {
    if (correctWordIds.length > 0) {
      await removeVocabMistakes(student.id, correctWordIds);
      setMistakes(prev => prev.filter(m => !correctWordIds.includes(m.id)));
      onMistakesUpdated();
    }
    setChallengeWords(null);
    setChallengeLessonTitle('');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (challengeWords) {
    return (
      <div className="py-4">
        <MiniChallenge
          words={challengeWords}
          lessonTitle={challengeLessonTitle}
          onComplete={handleChallengeComplete}
          onCancel={() => { setChallengeWords(null); setChallengeLessonTitle(''); }}
        />
      </div>
    );
  }

  // ── Lessons with vocabulary ───────────────────────────────────────────────
  const lessonsWithVocab = lessons.filter(l => (wordCounts[l.id] ?? 0) > 0);

  // ── Spaced-rep timeline per lesson ───────────────────────────────────────
  const TIMELINE_DELAYS = [1, 3, 7, 14]; // days after first attempt

  function formatDate(d: Date): string {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function addDays(base: Date, days: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  const today = new Date();

  interface TimelineCol {
    attemptNumber: number;
    scheduledDate: Date;
    completedAt: string | null;
    isToday: boolean;
    isOverdue: boolean;
  }

  interface LessonTimeline {
    firstDone: Date;
    cols: TimelineCol[];
    allComplete: boolean;
  }

  function getSpacedRepTimeline(lessonId: string): LessonTimeline | null {
    const lessonAttempts = attempts.filter(a => a.lessonId === lessonId);
    if (lessonAttempts.length === 0) return null;

    // First done = earliest completedAt among attemptNumber===1
    const firstDoneList = lessonAttempts
      .filter(a => a.attemptNumber === 1 && a.completedAt)
      .map(a => a.completedAt as string)
      .sort();
    if (firstDoneList.length === 0) return null;
    const firstDone = new Date(firstDoneList[0]);

    // Attempts 2-5 represent the +1, +3, +7, +14 day checkpoints
    // Dates are ALWAYS calculated from firstDone regardless of DB scheduledAt
    const cols: TimelineCol[] = TIMELINE_DELAYS.map((days, i) => {
      const attemptNum = i + 2; // 2,3,4,5
      const scheduledDate = addDays(firstDone, days);
      const completedEntry = lessonAttempts.find(
        a => a.attemptNumber === attemptNum && a.completedAt
      );
      const todayFlag  = !completedEntry && isSameDay(scheduledDate, today);
      const isOverdue  = !completedEntry && !todayFlag && scheduledDate < today;
      return {
        attemptNumber: attemptNum,
        scheduledDate,
        completedAt: completedEntry?.completedAt ?? null,
        isToday: todayFlag,
        isOverdue,
      };
    });

    const allComplete = cols.every(c => !!c.completedAt);
    return { firstDone, cols, allComplete };
  }

  // Lessons that have an attempt due today (for the reminder banner)
  const dueTodayLessons = lessonsWithVocab.filter(l => {
    const t = getSpacedRepTimeline(l.id);
    return t?.cols.some(c => c.isToday);
  });

  // ── Wrong words grouped by lesson ────────────────────────────────────────
  const mistakesByLesson = mistakes.reduce<Record<string, VocabMistakeDetail[]>>((acc, m) => {
    if (!acc[m.lessonId]) acc[m.lessonId] = [];
    acc[m.lessonId].push(m);
    return acc;
  }, {});

  const lessonLookup = Object.fromEntries(lessons.map(l => [l.id, l]));

  return (
    <div className="space-y-8">

      {/* ── Spaced-Repetition Timeline ───────────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 bg-amber-400 rounded-full" />
          Spaced-Repetition Schedule
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Dates are calculated from the first flashcard session date (+1, +3, +7, +14 days).
          <span className="ml-1 text-emerald-500 font-semibold">Green cells</span> = due today ·
          <span className="ml-1 text-red-400 font-semibold">Red dates</span> = overdue.
        </p>

        {/* Today reminder banner */}
        {dueTodayLessons.length > 0 && (
          <div className="mb-4 flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
            <span className="text-xl flex-shrink-0">📅</span>
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Flashcard session due today!</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                {dueTodayLessons.map(l => l.title).join(' · ')}
              </p>
            </div>
          </div>
        )}

        {lessonsWithVocab.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center">
            <p className="text-slate-400 dark:text-slate-500 text-sm">No lessons with vocabulary yet.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-gray-700">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Lesson</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">First Done</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">+1 day</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">+3 days</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">+7 days</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">+14 days</th>
                </tr>
              </thead>
              <tbody>
                {lessonsWithVocab.map((lesson) => {
                  const timeline = getSpacedRepTimeline(lesson.id);
                  const allComplete = timeline?.allComplete ?? false;
                  const rowBg = allComplete ? 'bg-emerald-50 dark:bg-emerald-900/20' : '';
                  return (
                    <tr key={lesson.id} className={`border-b border-slate-50 dark:border-gray-700/50 last:border-0 ${rowBg}`}>
                      {/* Lesson name */}
                      <td className="px-5 py-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {allComplete && (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-500 flex-shrink-0">
                              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                            </svg>
                          )}
                          {lesson.title}
                        </div>
                      </td>

                      {/* First Done */}
                      <td className="px-3 py-3 text-center">
                        {timeline
                          ? <span className="text-slate-600 dark:text-slate-300 text-xs font-medium">{formatDate(timeline.firstDone)}</span>
                          : <span className="text-slate-300 dark:text-slate-600">—</span>
                        }
                      </td>

                      {/* +1 / +3 / +7 / +14 day columns */}
                      {timeline
                        ? timeline.cols.map(col => {
                            // Cell background: green if today, normal otherwise
                            const cellBg = col.isToday
                              ? 'bg-emerald-100 dark:bg-emerald-900/40'
                              : '';
                            return (
                              <td key={col.attemptNumber} className={`px-3 py-3 text-center ${cellBg}`}>
                                {col.completedAt ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold rounded-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                                    </svg>
                                    Done
                                  </span>
                                ) : col.isToday ? (
                                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                                    📅 {formatDate(col.scheduledDate)}
                                  </span>
                                ) : col.isOverdue ? (
                                  <span className="text-xs font-semibold text-red-500 dark:text-red-400">
                                    ⚠ {formatDate(col.scheduledDate)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-slate-400 dark:text-slate-500">
                                    {formatDate(col.scheduledDate)}
                                  </span>
                                )}
                              </td>
                            );
                          })
                        : [2, 3, 4, 5].map(n => (
                          <td key={n} className="px-3 py-3 text-center">
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          </td>
                        ))
                      }
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Wrong Words ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 mb-4 flex items-center gap-2">
          <span className="inline-block w-1.5 h-5 bg-red-400 rounded-full" />
          Wrong Words
          {mistakes.length > 0 && (
            <span className="ml-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-bold rounded-full">
              {mistakes.length}
            </span>
          )}
        </h2>

        {mistakes.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center">
            <p className="text-2xl mb-2">🌟</p>
            <p className="text-slate-600 dark:text-slate-300 font-semibold">No wrong words!</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">All vocabulary has been answered correctly.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {(Object.entries(mistakesByLesson) as Array<[string, VocabMistakeDetail[]]>).map(([lessonId, words]) => {
              const lesson = lessonLookup[lessonId];
              const lessonTitle = lesson?.title ?? `Lesson (${lessonId.slice(0, 6)}…)`;
              // Sort by miss count descending
              const sorted = [...words].sort((a, b) => b.missCount - a.missCount);
              return (
                <div key={lessonId} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
                  {/* Lesson header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-red-50/60 dark:bg-red-900/10 border-b border-red-100 dark:border-red-900/30">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-red-500 dark:text-red-400 uppercase tracking-wide">
                        {lessonTitle}
                      </span>
                      <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-semibold rounded-full">
                        {sorted.length} word{sorted.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setChallengeWords(sorted);
                        setChallengeLessonTitle(lessonTitle);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                      Practice
                    </button>
                  </div>

                  {/* Words table */}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-gray-700">
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Arabic</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Transliteration</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">English</th>
                        <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Missed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((word, i) => (
                        <tr key={word.id} className={`border-b border-slate-50 dark:border-gray-700/50 last:border-0 ${i % 2 === 0 ? '' : 'bg-slate-50/40 dark:bg-gray-700/20'}`}>
                          <td className="px-4 py-2.5 text-center font-bold text-slate-800 dark:text-slate-100" dir="rtl">{word.arabic}</td>
                          <td className="px-4 py-2.5 text-center text-slate-500 dark:text-slate-400 italic">{word.transliteration}</td>
                          <td className="px-4 py-2.5 text-center text-slate-700 dark:text-slate-200">{word.english}</td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                              word.missCount >= 5 ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                              word.missCount >= 3 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' :
                              'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
                            }`}>
                              {word.missCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const ArabicStudentDetailPage: React.FC<Props> = ({
  student, teacherId, onBack, onUpdateStudent, onDeleteStudent,
}) => {
  const [editOpen, setEditOpen]       = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [lessons, setLessons]         = useState<ArabicLesson[]>([]);
  const [activeSection, setActiveSection] = useState<'profile' | 'lessons' | 'progress'>('lessons');
  const [progressKey, setProgressKey] = useState(0); // bump to reload ProgressTab

  useEffect(() => {
    getArabicLessons().then(setLessons);
  }, []);

  const completedCount = student.completedLessonIds.length;
  const pct            = progressPercent(student);
  const lessonsPerWeek = lpw(student);
  const wl             = weeksLeft(student.goalDeadline);

  const TABS: Array<{ key: 'lessons' | 'profile' | 'progress'; label: string }> = [
    { key: 'lessons', label: `Lessons (${lessons.length})` },
    { key: 'progress', label: "Student's Progress" },
    { key: 'profile', label: 'Student Profile' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Back + actions bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          <span className="font-semibold">All Students</span>
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            Edit
          </button>
          {!showDelete ? (
            <button onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">Are you sure?</span>
              <button onClick={() => { onDeleteStudent(student.id); }}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">Yes, delete</button>
              <button onClick={() => setShowDelete(false)}
                className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 rounded-2xl border border-amber-200 dark:border-amber-800 p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-400 dark:bg-amber-600 flex items-center justify-center text-white text-3xl font-extrabold flex-shrink-0">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{student.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {student.arabicDialects.map(d => (
                <span key={d} className="px-2.5 py-0.5 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold">{dialectLabel(d)}</span>
              ))}
              {student.arabicLevel && (
                <span className="px-2.5 py-0.5 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 rounded-full text-xs font-semibold border border-slate-200 dark:border-gray-700">
                  Level {student.arabicLevel} / 10
                </span>
              )}
            </div>
          </div>

          {/* Lesson plan widget */}
          {lessonsPerWeek !== null && (
            <div className="flex-shrink-0 text-right">
              <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wide">Lessons / week</p>
              <p className="text-4xl font-extrabold text-amber-600 dark:text-amber-300">{lessonsPerWeek}</p>
              {wl !== null && <p className="text-xs text-amber-500/80 mt-0.5">{wl} weeks left</p>}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5">
            <span>Lesson progress</span>
            <span className="font-bold">{completedCount} / 60 lessons complete ({pct}%)</span>
          </div>
          <div className="h-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-gray-700 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveSection(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors -mb-px ${
              activeSection === tab.key
                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Lessons section ── */}
      {activeSection === 'lessons' && (
        <ArabicLessonPage
          students={[student]}
          teacherId={teacherId}
          preSelectedStudentId={student.id}
          onStudentUpdated={onUpdateStudent}
        />
      )}

      {/* ── Student's Progress section ── */}
      {activeSection === 'progress' && (
        <ProgressTab
          key={progressKey}
          student={student}
          lessons={lessons}
          onMistakesUpdated={() => setProgressKey(k => k + 1)}
        />
      )}

      {/* ── Profile section ── */}
      {activeSection === 'profile' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-6 space-y-5">
          <dl className="space-y-4">
            <InfoRow label="Date of birth"  value={student.dob ? new Date(student.dob).toLocaleDateString() : undefined} />
            <InfoRow label="Lessons for"    value={student.forSelf ? 'Themselves' : `Someone else (${student.forWhom || 'not specified'})`} />
            <InfoRow label="WhatsApp"        value={student.whatsapp} />
            <InfoRow label="Nationality"     value={student.nationality} />
            <InfoRow label="Timezone"        value={student.timezone} />
            <InfoRow label="Goal deadline"   value={student.goalDeadline ? new Date(student.goalDeadline).toLocaleDateString() : undefined} />
            <InfoRow label="Learning goals"
              value={student.learningPurposes.length ? student.learningPurposes.join(', ') : undefined} />
            <InfoRow label="Topics to focus"
              value={student.topicsToFocus.length ? student.topicsToFocus.join(', ') : undefined} />
          </dl>

          {student.availability.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Weekly availability</h3>
              <AvailabilityGrid slots={student.availability} timezone={student.timezone} />
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      <ArabicAddStudentModal
        isOpen={editOpen}
        teacherId={teacherId}
        existing={student}
        onClose={() => setEditOpen(false)}
        onSave={updated => { onUpdateStudent(updated); setEditOpen(false); }}
      />
    </div>
  );
};

export default ArabicStudentDetailPage;
