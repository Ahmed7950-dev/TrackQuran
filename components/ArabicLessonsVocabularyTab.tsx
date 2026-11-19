// ─────────────────────────────────────────────────────────────────────────────
// ArabicLessonsVocabularyTab — the whole course's vocabulary in one place.
//
// One list of every lesson's words grouped by lesson, completed lessons marked
// green on their header and edge, a search box that matches Arabic, transliteration
// or English, and a lesson picker that feeds the SAME flashcard flow and games
// the per-lesson Vocabulary tab uses.
//
// Rendered for BOTH sides: the tutor's student page and the student portal
// (ArabicStudentDetailPage backs both). The tutor additionally gets the
// word selection and assignment choices; assigned work lives in Homework.
//
// Every flashcard answer is recorded ("I know" = correct, "I don't know" =
// wrong) and the last ten draw the red/green strength bar beside each word.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArabicLesson, ArabicStudent, VocabWord } from '../types';
import { useI18n } from '../context/I18nProvider';
import { getVocabWordsForLessons, saveVocabMistakes, updateVocabWord } from '../services/arabicService';
import {
  getVocabStrength, recordVocabReview, withReview, StrengthMap,
  toHomeworkWord,
} from '../services/vocabHomeworkService';
import StrengthBar from './VocabStrengthBar';
import GameTile from './GameTile';
import ArabicHomeworkChoice from './ArabicHomeworkChoice';
import ArabicFlashcard from './ArabicFlashcard';
import { createArabicHomework } from '../services/arabicHomeworkService';
import { supabase } from '../lib/supabase';
import { LetterCardsSetup } from './LetterCardsGame';
import WordFlightGame from './WordFlightGame';
import CrosswordGame from './CrosswordGame';
import LetterWheelGame from './LetterWheelGame';
import QuickMatchGame from './QuickMatchGame';
import WordSearchGame from './WordSearchGame';
import WordSnakeGame from './WordSnakeGame';
import { getQuickMatchBests } from '../services/quickMatchService';
import LetterRaceGame, { RacePair } from './LetterRaceGame';

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Naskh for the word list: it carries the harakat clearly. Amiri is already
 *  loaded by index.html. */
const WORD_FONT = "'Amiri', 'Noto Naskh Arabic', 'Geeza Pro', serif";

type Phase = 'idle' | 'active' | 'complete';

/**
 * Which words everything runs on.
 *
 * There used to be four overlapping ones — the ticked lessons, the words tapped
 * in the table, the student's bookmarks and the "needs practice" list — and
 * tapping a word silently took over from the ticked lessons, which is why there
 * was a Lessons/Selected toggle to referee them. One pool at a time, named on
 * screen, and the toggle is not needed.
 */
type Pool = 'needs' | 'lessons' | 'picked';

const POOLS: { id: Pool; label: string; hint: string }[] = [
  { id: 'needs',   label: 'Needs practice',
    hint: 'Never asked, or wrong last time — in lessons marked done' },
  { id: 'lessons', label: 'Lessons',        hint: 'Tick lessons in the table below' },
  { id: 'picked',  label: 'Picked',         hint: 'Tap words in the table to pick them' },
];

const POOL_EMPTY: Record<Pool, string> = {
  needs:   'Nothing to revise from the finished lessons — mark lessons done, or he knows them all already.',
  lessons: 'No words in these lessons yet.',
  picked:  'Tap words in the table to pick them.',
};

const POOL_PHRASE: Record<Pool, (n: number, lessons: number) => string> = {
  needs:   n => `the ${n} from finished lessons that need practice`,
  lessons: (n, lessons) => `${lessons ? `${lessons} lesson${lessons === 1 ? '' : 's'}` : 'every lesson'} · ${n} words`,
  picked:  n => `the ${n} you picked`,
};

interface Props {
  lessons: ArabicLesson[];       // already filtered to the student's dialect(s)
  student: ArabicStudent;
  /** Tutor side: row clicks fill the word selection. Student side: pending homework card. */
  studentMode?: boolean;
  /** Start of the student's next lesson — the suggested homework deadline. */
  nextLessonAt?: Date | null;
}

const ArabicLessonsVocabularyTab: React.FC<Props> = ({ lessons, student, studentMode = false, nextLessonAt = null }) => {
  const { t } = useI18n();
  const [words, setWords]     = useState<VocabWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());   // lesson ids
  const [showWordFlight, setShowWordFlight] = useState(false);
  const [showCrossword, setShowCrossword] = useState(false);
  const [showWordRace, setShowWordRace]     = useState(false);
  /** One of the four letter / word games beside the crossword. */
  const [wordGame, setWordGame] = useState<'wheel' | 'match' | 'search' | 'snake' | null>(null);
  const [matchBest, setMatchBest] = useState(0);
  useEffect(() => {
    let live = true;
    getQuickMatchBests(student.id).then(b => { if (live) setMatchBest(Math.max(b.arabic, b.translit)); });
    return () => { live = false; };
  }, [student.id, wordGame]);

  // Flashcard run — mirrors the per-lesson VocabularyTab flow exactly.
  const [phase, setPhase]           = useState<Phase>('idle');
  const [shuffled, setShuffled]     = useState<VocabWord[]>([]);
  const [cardIndex, setCardIndex]   = useState(0);
  const [wrongWords, setWrongWords] = useState<VocabWord[]>([]);
  const [flipped, setFlipped]       = useState(false);

  // Last ten flashcard answers per word → the strength bar.
  const [strength, setStrength] = useState<StrengthMap>(new Map());
  useEffect(() => {
    let live = true;
    getVocabStrength(student.id).then(m => { if (live) setStrength(m); });
    return () => { live = false; };
  }, [student.id]);
  useEffect(() => {
    const refresh = () => { void getVocabStrength(student.id).then(setStrength); };
    const channel = supabase.channel(`vocab-strength:${student.id}`).on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'arabic_vocab_reviews', filter: `student_id=eq.${student.id}` }, refresh).subscribe();
    window.addEventListener('focus', refresh);
    return () => { void supabase.removeChannel(channel); window.removeEventListener('focus', refresh); };
  }, [student.id]);
  const recordAnswer = (w: VocabWord, correct: boolean) => {
    setStrength(prev => withReview(prev, w.id, correct));
    recordVocabReview(student.id, w, correct);
  };

  const [pool, setPool] = useState<Pool>('lessons');
  const [wordSelection, setWordSelection] = useState<Set<string>>(new Set());
  /** The word open for editing, with what is typed so far. Tutor only. */
  const [editing, setEditing] = useState<{ id: string; arabic: string; transliteration: string; english: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  /** Tapping a word puts it in the hand-picked pool AND switches to it, so a
   *  tap never quietly changes what the buttons below will act on. */
  const toggleWord = (id: string) => {
    setWordSelection(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id);
      setPool(next.size ? 'picked' : 'lessons');
      return next;
    });
  };
  /** The tile whose "play or assign" sheet is open. It always runs on the pool
   *  chosen above — the sheet has no pool of its own any more. */
  const [choice, setChoice] = useState<{ kind: 'flashcards' | 'word_cards' } | null>(null);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [cardsAssignment, setCardsAssignment] = useState<{ deadline: string | null } | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState('');


  // There is no saved "unfinished run" any more.
  //
  // It was a shuffled deck and a card index in this browser's localStorage, so
  // a run begun on the tutor's laptop could not be carried on from the iPad —
  // and resuming the exact shuffle at card 13 was never the point. Every answer
  // is already written to arabic_vocab_reviews, so the words still to do are
  // simply the ones not answered correctly: the "Needs practice" pool. Pressing
  // it IS carrying on, and it drops the ones he got right in earlier sessions
  // too, which a stored deck could not.

  // Lessons in course order, and the words that belong to each.
  const orderedLessons = useMemo(
    () => [...lessons].sort((a, b) => (a.level - b.level) || (a.orderIndex - b.orderIndex)),
    [lessons],
  );

  // Key the fetch on the lesson IDS, not the array identity. Ancestors
  // re-render on their own schedule (the portal ticks a clock every 30s, and
  // notifications arrive over realtime), and each render hands us a freshly
  // filtered `lessons` array — depending on that identity re-ran this effect
  // and flashed "Loading vocabulary…" every few seconds. The id list only
  // changes when the actual lesson set does.
  const lessonIdsKey = orderedLessons.map(l => l.id).join(',');
  const fetchedKeyRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (fetchedKeyRef.current === lessonIdsKey) return; // same lessons — nothing to do
    let live = true;
    // Only show the full loading state on the FIRST load; later refreshes swap
    // the data in place so the table never blanks out under the user.
    if (fetchedKeyRef.current === null) setLoading(true);
    fetchedKeyRef.current = lessonIdsKey;
    const ids = lessonIdsKey ? lessonIdsKey.split(',') : [];
    let landed = false;
    getVocabWordsForLessons(ids)
      .then(ws => { landed = true; if (live) { setWords(ws); setLoading(false); } })
      .catch(() => {
        landed = true;
        if (live) { setLoading(false); fetchedKeyRef.current = null; } // allow a retry
      });
    // Torn down before the words arrived — forget the key, or the next run
    // would see it as already fetched and leave "Loading vocabulary…" up for
    // good. (React's development double-mount does exactly this.)
    return () => { live = false; if (!landed) fetchedKeyRef.current = null; };
  }, [lessonIdsKey]);

  useEffect(() => { setFlipped(false); }, [cardIndex, phase]);

  const completedSet = useMemo(() => new Set(student.completedLessonIds), [student.completedLessonIds]);
  const wordsByLesson = useMemo(() => {
    const m = new Map<string, VocabWord[]>();
    for (const w of words) {
      const list = m.get(w.lessonId);
      if (list) list.push(w); else m.set(w.lessonId, [w]);
    }
    return m;
  }, [words]);

  // Search matches ANY of the three fields, accent/diacritic-insensitively.
  const norm = (s: string) => (s ?? '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '') // Arabic marks
    .toLowerCase().trim();
  const q = norm(search);
  const matches = useCallback((w: VocabWord) =>
    !q || norm(w.arabic).includes(q) || norm(w.transliteration).includes(q) || norm(w.english).includes(q),
  [q]);

  // Lesson groups that survive the search (a lesson with no hits is hidden).
  const visibleGroups = useMemo(() => orderedLessons
    .map(l => ({ lesson: l, items: (wordsByLesson.get(l.id) ?? []).filter(matches) }))
    .filter(g => g.items.length > 0), [orderedLessons, wordsByLesson, matches]);

  const totalWords   = words.length;
  const learntCount  = words.filter(w => completedSet.has(w.lessonId)).length;
  const shownCount   = visibleGroups.reduce((n, g) => n + g.items.length, 0);

  // The practice pool = words of the SELECTED lessons (all lessons if none picked).
  const lessonPool = useMemo(() => (
    selected.size ? words.filter(w => selected.has(w.lessonId)) : words
  ), [words, selected]);
  const selectedWords = useMemo(() => words.filter(w => wordSelection.has(w.id)), [words, wordSelection]);

  /** The last answer this student gave on a word, or undefined if never asked.
   *  The strength list runs oldest → newest. */
  const lastAnswer = useCallback((id: string): boolean | undefined => {
    const a = strength.get(id);
    return a?.length ? a[a.length - 1] : undefined;
  }, [strength]);

  /**
   * Worth drilling: never asked, or got it wrong last time — and only from
   * lessons marked done, because a word from a lesson he has not reached yet
   * is a cold test, not revision. Those are still a tick away under Lessons.
   *
   * This used to be three chips. "Needs practice" over the whole course was
   * mostly vocabulary he had never been taught, and "Review later" was the
   * wrong-answer half of the very same set — a strict subset, and a name left
   * over from when the student really did save words to a list. One pile now:
   * what he has been taught and still does not know.
   */
  const needsPracticeWords = useMemo(
    () => words.filter(w => completedSet.has(w.lessonId) && lastAnswer(w.id) !== true),
    [words, completedSet, lastAnswer]);

  const poolCount = (id: Pool): number =>
    id === 'picked' ? selectedWords.length
    : id === 'needs' ? needsPracticeWords.length
    : lessonPool.length;

  const practicePool = pool === 'picked' ? selectedWords
    : pool === 'needs' ? needsPracticeWords
    : lessonPool;
  /** A card needs both halves of the word. However many are selected all go
   *  on the pile: the hands hold five a side whatever its size. */
  const cardWords = useMemo(() => practicePool
    .filter(w => (w.arabic ?? '').trim() && (w.english ?? '').trim())
    .map(w => ({ id: w.id, arabic: w.arabic.trim(), english: (w.english ?? '').trim(),
                 translit: (w.transliteration ?? '').trim() })),
  [practicePool]);
  const racePairs: RacePair[] = practicePool
    .filter(w => (w.english ?? '').trim() && (w.arabic ?? '').trim())
    .map(w => ({ prompt: w.english.trim(), answer: w.arabic.trim() }));

  const toggleLesson = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectAllVisible = () => setSelected(new Set(visibleGroups.map(g => g.lesson.id)));
  const selectLevel = (lvl: 1 | 2 | 3) =>
    setSelected(new Set(orderedLessons.filter(l => l.level === lvl && (wordsByLesson.get(l.id)?.length ?? 0) > 0).map(l => l.id)));

  // ── Flashcard controls ────────────────────────────────────────────────────
  const startChallenge = (pool: VocabWord[]) => {
    if (!pool.length) return;
    const deck: VocabWord[] = shuffleArray(pool) as VocabWord[];
    setShuffled(deck);
    setCardIndex(0); setWrongWords([]);
    setPhase('active');
  };
  const advance = (wrong: VocabWord[] = wrongWords) => {
    if (cardIndex + 1 >= shuffled.length) {
      setPhase('complete');
      // Wrong words feed the existing mistakes-review flow (grouped per lesson).
      if (wrong.length > 0) {
        saveVocabMistakes(student.id, wrong.map(w => ({ wordId: w.id, lessonId: w.lessonId }))).catch(console.error);
      }
    } else {
      setCardIndex(i => i + 1);
    }
  };
  const handleKnow = () => {
    const w = shuffled[cardIndex];
    // "I know" IS how a word leaves the pile: it is derived from the last
    // answer, so nothing has to be removed from anywhere.
    if (w) recordAnswer(w, true);
    advance();
  };
  // "I don't know" is a wrong answer: it shows red on the strength bar and the
  // word stays in the needs-practice pile until he gets it right.
  const handleDontKnow = () => {
    const w = shuffled[cardIndex];
    let wrong = wrongWords;
    if (w) {
      recordAnswer(w, false);
      if (!wrong.some(x => x.id === w.id)) wrong = [...wrong, w];
    }
    setWrongWords(wrong);
    advance(wrong);
  };

  // ── Editing a word in place (tutor only) ──────────────────────────────────
  // The fix lands in the lesson itself, so every student with this lesson
  // sees it. A failed save keeps the form open and says so.
  const startEdit = (w: VocabWord) => {
    setEditError('');
    setEditing({ id: w.id, arabic: w.arabic ?? '', transliteration: w.transliteration ?? '', english: w.english ?? '' });
  };
  const saveEdit = async () => {
    if (!editing || savingEdit) return;
    const was = words.find(x => x.id === editing.id);
    const next = { arabic: editing.arabic.trim(), transliteration: editing.transliteration.trim(), english: editing.english.trim() };
    if (!next.arabic || !next.english) { setEditError('The Arabic and the English both need something in them.'); return; }
    if (was && was.arabic === next.arabic && was.transliteration === next.transliteration && was.english === next.english) {
      setEditing(null); return;
    }
    setSavingEdit(true); setEditError('');
    const ok = await updateVocabWord(editing.id, next);
    setSavingEdit(false);
    if (!ok) { setEditError('Could not save the word. Check the connection and try again.'); return; }
    setWords(prev => prev.map(x => (x.id === editing.id ? { ...x, ...next } : x)));
    setEditing(null);
  };
  /** Column tracks, written out whole so Tailwind ships them: pick, Arabic,
   *  translit (hidden on a phone), English, strength, and the tutor's pencil. */
  const cols = studentMode
    ? 'grid-cols-[26px_minmax(0,1fr)_minmax(0,1.25fr)_72px] sm:grid-cols-[40px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_150px]'
    : 'grid-cols-[30px_minmax(0,1fr)_minmax(0,1.25fr)_72px_34px] sm:grid-cols-[44px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_150px_48px]';
  const editCols = 'sm:grid-cols-[44px_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_150px_48px]';

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-10 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading vocabulary…</p>
      </div>
    );
  }

  // ── Flashcard: active ─────────────────────────────────────────────────────
  if (phase === 'active') {
    const word = shuffled[cardIndex];
    if (!word) { setPhase('idle'); return null; }
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-10 space-y-6 sm:space-y-8">
        <div className="flex items-center justify-between">
          <span className="text-sm sm:text-base text-slate-500 dark:text-slate-400">
            {t('arabicLessonDetail.cardOf', { n: cardIndex + 1, total: shuffled.length })}
          </span>
          <button onClick={() => setPhase('idle')} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">{t('arabicLessonDetail.exit')}</button>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${(cardIndex / shuffled.length) * 100}%` }} />
        </div>

        <ArabicFlashcard word={word} flipped={flipped} onFlip={() => setFlipped(f => !f)}
          onKnow={handleKnow} onReview={handleDontKnow} />
      </div>
    );
  }

  // ── Flashcard: complete ───────────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-10 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 sm:p-12 text-center shadow-sm space-y-4">
          <div className="text-6xl">🎉</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100">{t('arabicLessonDetail.challengeComplete')}</h2>
          {/* The shared message claims every word was right, so it is only
              shown when that is true — it was sitting above a list of the ones
              he got wrong. */}
          <p className="text-base text-slate-500 dark:text-slate-400">
            {wrongWords.length === 0
              ? t('arabicLessonDetail.challengeCompleteMsg', { count: shuffled.length })
              : `${shuffled.length - wrongWords.length} of ${shuffled.length} right.`}
          </p>
        </div>
        {wrongWords.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 space-y-3">
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">{t('arabicLessonDetail.needMorePractice')}</h3>
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
        {/* Where "carry on" lives now: the ones he did not know are already in
            the Needs practice pool, on every device. */}
        <button onClick={() => { setPool('needs'); setPhase('idle'); }}
          className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl transition-colors">
          {wrongWords.length
            ? `Carry on with the ${wrongWords.length} he did not know`
            : t('arabicLessonDetail.backToWordList')}
        </button>
        {wrongWords.length > 0 && (
          <button onClick={() => setPhase('idle')}
            className="w-full py-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {t('arabicLessonDetail.backToWordList')}
          </button>
        )}
      </div>
    );
  }

  // ── Idle: table + search + lesson picker + practice launchers ─────────────
  return (
    <div className="space-y-4">
      {/* Summary + search */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-700 dark:text-slate-200">{t('arabicStudentDetail.tabLessonsVocab')}</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {totalWords} words across {orderedLessons.length} lessons · {learntCount} learnt
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="w-1 h-3.5 rounded-full bg-emerald-400 dark:bg-emerald-600" />
            learnt (lesson completed)
          </span>
        </div>

        {/* Search — Arabic, transliteration or English */}
        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search Arabic, transliteration or English…"
            dir="auto"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {search && (
            <button onClick={() => setSearch('')} title="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none">×</button>
          )}
        </div>
        {search && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {shownCount} match{shownCount === 1 ? '' : 'es'} in {visibleGroups.length} lesson{visibleGroups.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {assignmentMessage && <p role="status" className="text-emerald-700 dark:text-emerald-300">{assignmentMessage}</p>}
      {/* Practise — ONE pool, named, with the activities under it. */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Practise</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {POOLS.map(({ id, label, hint }) => {
              const n = poolCount(id);
              const on = pool === id;
              return (
                <button key={id} onClick={() => setPool(id)} disabled={n === 0 && id !== 'lessons'}
                  title={hint} aria-pressed={on}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors disabled:opacity-35 disabled:cursor-default ${
                    on
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'}`}>
                  {label} <span className={on ? 'opacity-80' : 'opacity-60'}>{n}</span>
                </button>
              );
            })}
          </div>
          <span className="flex-grow" />
          {pool === 'lessons' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {([1, 2, 3] as const).map(lvl => (
                <button key={lvl} onClick={() => selectLevel(lvl)}
                  className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                  Level {lvl}
                </button>
              ))}
              <button onClick={selectAllVisible}
                className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">All</button>
              {selected.size > 0 && (
                <button onClick={() => setSelected(new Set())}
                  className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30">Clear</button>
              )}
            </div>
          )}
          {pool === 'picked' && selectedWords.length > 0 && !studentMode && (
            <button onClick={() => { setWordSelection(new Set()); setPool('lessons'); }}
              className="px-2.5 py-1 rounded-full text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
              Clear picked
            </button>
          )}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {practicePool.length === 0
            ? POOL_EMPTY[pool]
            : <>Everything below runs on <strong className="text-slate-700 dark:text-slate-200">{POOL_PHRASE[pool](practicePool.length, selected.size)}</strong>{studentMode ? '.' : ' — playing now or sent as homework.'}</>}
        </p>

        {/* Small tiles: two across on a phone with Flashcards on its own row
            above them, three across from sm up. 4:1 everywhere, so the art is
            never cropped. Layout drawn on the design canvas, "Game buttons". */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
          <GameTile art="flashcards" tone="amber" icon="🗂️" className="col-span-2 sm:col-span-1"
            name={t('arabicLessonDetail.startFlashcard', { count: practicePool.length })}
            hint="Flip · memorise · repeat"
            disabled={practicePool.length === 0}
            onClick={() => studentMode ? startChallenge(practicePool) : setChoice({ kind: 'flashcards' })} />

          <GameTile art="wordflight" tone="sky" icon="✈️"
            name="Word Flight Game" hint="Catch the falling words"
            disabled={practicePool.length === 0}
            onClick={() => setShowWordFlight(true)} />

          {racePairs.length >= 2 && (
            <GameTile art="wordrace" tone="teal" icon="🏃"
              name="Word Race Game" hint="Run to the Arabic word"
              onClick={() => setShowWordRace(true)} />
          )}

          <GameTile art="crossword" tone="violet" icon="🧩"
            name="Crossword"
            hint={practicePool.length < 2 ? 'Pick at least two words' : `Fill the grid · ${practicePool.length} words`}
            disabled={practicePool.length < 2}
            onClick={() => setShowCrossword(true)} />

          <GameTile art="letterwheel" tone="amber" icon="🎡"
            name="Letter Wheel"
            hint={practicePool.length === 0 ? 'Pick some words' : 'Join the letters into the word'}
            disabled={practicePool.length === 0}
            onClick={() => setWordGame('wheel')} />

          <GameTile art="quickmatch" tone="teal" icon="⚡"
            name="Quick Match"
            hint={practicePool.length < 2 ? 'Pick at least two words' : `60 seconds · match or not${matchBest ? ` · best ${matchBest}` : ''}`}
            disabled={practicePool.length < 2}
            onClick={() => setWordGame('match')} />

          <GameTile art="wordsearch" tone="indigo" icon="🔎"
            name="Word Search"
            hint={practicePool.length === 0 ? 'Pick some words' : 'Find the hidden words'}
            disabled={practicePool.length === 0}
            onClick={() => setWordGame('search')} />

          <GameTile art="wordsnake" tone="green" icon="🐍"
            name="Word Snake"
            hint={practicePool.length === 0 ? 'Pick some words' : 'Eat the letters in order'}
            disabled={practicePool.length === 0}
            onClick={() => setWordGame('snake')} />

          <GameTile art="wordcards" tone="orange" icon="🃏"
            name="Word Cards Game"
            hint={cardWords.length < 2
              ? 'Pick at least two words'
              : studentMode
                ? `Play the computer · ${cardWords.length} words`
                : `Throw a card, match its pair · ${cardWords.length} words`}
            disabled={cardWords.length < 2}
            onClick={() => { if (studentMode) setCardsOpen(true); else setChoice({ kind: 'word_cards' }); }} />


        </div>
      </div>

      {/* ── The words, grouped by lesson ──────────────────────────────────────
          Same columns as ever (pick, Arabic, transliteration, English, strength)
          on a grid rather than a table, so a row can turn into its own edit form
          in place. A finished lesson is marked once, on its header and a green
          edge down the group, instead of tinting every row: the words stay easy
          to read. On a phone the transliteration sits under the English.
          Drawn on the design canvas, "Word table" page. */}
      {visibleGroups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {totalWords === 0 ? 'No vocabulary has been added to these lessons yet.' : 'No words match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className={`grid ${cols} items-center px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-100 dark:border-gray-700 text-[10.5px] sm:text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400`}>
            <span />
            <span className="text-right pr-3 sm:pr-5">Arabic</span>
            <span className="hidden sm:block pl-1">Translit.</span>
            <span><span className="sm:hidden">English · translit.</span><span className="hidden sm:inline">English</span></span>
            <span className="text-center" title="The last 10 flashcard or word-card answers, oldest → newest">Strength</span>
            {!studentMode && <span />}
          </div>

          {visibleGroups.map(({ lesson, items }) => {
            const learnt   = completedSet.has(lesson.id);
            const isPicked = selected.has(lesson.id);
            return (
              <div key={lesson.id} className={`border-l-4 ${learnt ? 'border-emerald-400 dark:border-emerald-600' : 'border-transparent'}`}>
                {/* Lesson header — doubles as the lesson selector */}
                <label className={`flex items-center gap-2.5 px-3 sm:px-5 py-3 border-b border-slate-100 dark:border-gray-700 cursor-pointer ${
                  isPicked ? 'bg-amber-50 dark:bg-amber-900/20'
                    : learnt ? 'bg-emerald-50/70 dark:bg-emerald-900/15'
                      : 'bg-slate-50 dark:bg-gray-700/40'}`}>
                  <input type="checkbox" checked={isPicked} onChange={() => toggleLesson(lesson.id)}
                    className="w-[18px] h-[18px] rounded border-slate-300 dark:border-gray-500 text-amber-500 focus:ring-amber-400 flex-shrink-0" />
                  <span className="flex-shrink-0 inline-flex items-center h-[22px] px-1.5 rounded-md bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-[11px] font-bold text-slate-600 dark:text-slate-300">L{lesson.level}</span>
                  <span className="text-sm sm:text-[15px] font-bold text-slate-800 dark:text-slate-100 min-w-0 break-words">{lesson.title}</span>
                  {learnt && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 h-[22px] px-2 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5.2 5.2L20 7" /></svg>
                      learnt
                    </span>
                  )}
                  <span className="ml-auto flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{items.length} word{items.length === 1 ? '' : 's'}</span>
                </label>

                {items.map(w => {
                  if (editing?.id === w.id) {
                    const field = 'w-full h-11 sm:h-10 px-3 rounded-[10px] border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[15px] sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-[3px] focus:ring-amber-400/30';
                    const label = 'block sm:sr-only mb-1 text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400';
                    const keys = (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') { e.preventDefault(); void saveEdit(); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
                    };
                    return (
                      <div key={w.id} className="border-b border-slate-100 dark:border-gray-700 bg-amber-50/80 dark:bg-amber-900/15 ring-[1.5px] ring-inset ring-amber-400">
                        <div className={`grid grid-cols-2 gap-2 px-3 py-3 sm:gap-0 sm:px-5 sm:py-2.5 sm:items-center ${editCols}`}>
                          <span className="hidden sm:block" />
                          <div className="col-span-2 sm:col-span-1 sm:pr-3">
                            <label htmlFor={`vw-ar-${w.id}`} className={label}>Arabic</label>
                            <input id={`vw-ar-${w.id}`} dir="rtl" autoFocus value={editing.arabic} onKeyDown={keys}
                              onChange={e => setEditing({ ...editing, arabic: e.target.value })}
                              className={`${field} text-right !text-xl`} style={{ fontFamily: WORD_FONT }} />
                          </div>
                          <div className="sm:pr-3">
                            <label htmlFor={`vw-tr-${w.id}`} className={label}>Translit.</label>
                            <input id={`vw-tr-${w.id}`} value={editing.transliteration} onKeyDown={keys}
                              onChange={e => setEditing({ ...editing, transliteration: e.target.value })}
                              className={`${field} italic`} />
                          </div>
                          <div className="sm:pr-3">
                            <label htmlFor={`vw-en-${w.id}`} className={label}>English</label>
                            <input id={`vw-en-${w.id}`} value={editing.english} onKeyDown={keys}
                              onChange={e => setEditing({ ...editing, english: e.target.value })}
                              className={field} />
                          </div>
                          <div className="col-span-2 flex items-center justify-end sm:justify-center gap-2 pt-1 sm:pt-0">
                            <button type="button" onClick={() => setEditing(null)} aria-label="Cancel"
                              className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-10 px-4 sm:px-0 sm:w-10 rounded-[10px] border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                              <span className="sm:hidden">Cancel</span>
                            </button>
                            <button type="button" onClick={() => void saveEdit()} disabled={savingEdit} aria-label="Save"
                              className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-10 px-5 sm:px-0 sm:w-10 rounded-[10px] bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-bold">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5.2 5.2L20 7" /></svg>
                              <span className="sm:hidden">{savingEdit ? 'Saving…' : 'Save'}</span>
                            </button>
                          </div>
                        </div>
                        {editError && <p role="alert" className="px-3 sm:px-5 pb-2.5 -mt-1 text-[13px] font-semibold text-red-600 dark:text-red-400">{editError}</p>}
                      </div>
                    );
                  }

                  const isSelectedWord = wordSelection.has(w.id);
                  return (
                    // On the tutor side a tap puts the word in (or takes it out
                    // of) the word selection; the pencil opens it for editing.
                    <div key={w.id}
                      onClick={studentMode ? undefined : () => toggleWord(w.id)}
                      title={studentMode ? undefined : (isSelectedWord ? 'Selected — tap to remove' : 'Tap to add to the word selection')}
                      className={`group grid ${cols} items-center min-h-[58px] sm:min-h-[54px] px-3 sm:px-5 border-b border-slate-100 dark:border-gray-700/70 transition-colors ${
                        isSelectedWord ? 'bg-violet-50 dark:bg-violet-900/25' : ''
                      } ${studentMode ? '' : `cursor-pointer ${isSelectedWord ? 'hover:bg-violet-100/70 dark:hover:bg-violet-900/35' : 'hover:bg-slate-50 dark:hover:bg-gray-700/40'}`}`}>
                      <span className="flex items-center">
                        {!studentMode
                          ? <input type="checkbox" aria-label={`Select ${w.english}`} checked={isSelectedWord}
                              onClick={e => e.stopPropagation()} onChange={() => toggleWord(w.id)}
                              className="w-[18px] h-[18px] rounded border-slate-300 dark:border-gray-500 text-violet-600 focus:ring-violet-400" />
                          : lastAnswer(w.id) === false && <span title="Saved to review later" className="text-xs">🔖</span>}
                      </span>
                      <span dir="rtl" className="text-right pr-3 sm:pr-5 py-1.5 text-[21px] sm:text-[23px] leading-[1.6] text-slate-900 dark:text-slate-50 break-words"
                        style={{ fontFamily: WORD_FONT }}>{w.arabic}</span>
                      <span className="hidden sm:block pl-1 pr-3 italic text-sm text-slate-500 dark:text-slate-400 break-words">{w.transliteration}</span>
                      <span className="min-w-0 pr-2 sm:pr-3 py-1.5 break-words">
                        <span className="block text-sm sm:text-[14.5px] text-slate-800 dark:text-slate-100">{w.english}</span>
                        {w.transliteration && <span className="block sm:hidden text-xs italic text-slate-500 dark:text-slate-400">{w.transliteration}</span>}
                      </span>
                      <span><StrengthBar answers={strength.get(w.id) ?? []} /></span>
                      {!studentMode && (
                        <span className="flex justify-end">
                          <button type="button" aria-label={`Edit ${w.english || w.arabic}`} title="Edit"
                            onClick={e => { e.stopPropagation(); startEdit(w); }}
                            className="flex items-center justify-center w-8 sm:w-[34px] h-10 sm:h-[34px] rounded-[9px] text-slate-400 sm:border sm:border-transparent hover:text-slate-700 dark:hover:text-slate-200 sm:hover:border-slate-200 sm:hover:bg-white dark:sm:hover:bg-gray-800 dark:sm:hover:border-gray-600 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.5 3.9l3.6 3.6L8 19.6 3.6 21l1.4-4.4z" /></svg>
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {cardsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setCardsOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl">
            <LetterCardsSetup words={cardWords} student={{ id: student.id, name: student.name }}
              assignment={cardsAssignment ?? undefined}
              onAssigned={() => { setCardsOpen(false); setAssignmentMessage("Word cards assigned. Find them in the Homework tab."); }}
              selfPlay={studentMode ? { teacherId: student.teacherId } : undefined}
              onClose={() => setCardsOpen(false)} />
          </div>
        </div>
      )}

      {choice && !studentMode && (() => {
        // One pool, already chosen above — the sheet only asks play or assign.
        const title = choice.kind === 'word_cards' ? 'Word cards' : 'Flashcards';
        return (
          <ArabicHomeworkChoice title={`${title} · ${POOL_PHRASE[pool](practicePool.length, selected.size)}`}
            count={practicePool.length} nextLessonAt={nextLessonAt}
            onClose={() => setChoice(null)}
            onPlay={() => {
              if (choice.kind === 'flashcards') startChallenge(practicePool);
              else { setCardsAssignment(null); setCardsOpen(true); }
              setChoice(null);
            }}
            onAssign={async deadline => {
              if (choice.kind === 'word_cards') { setCardsAssignment({ deadline }); setCardsOpen(true); }
              else {
                await createArabicHomework({ teacherId: student.teacherId, studentId: student.id, studentName: student.name,
                  kind: 'flashcards', title, words: practicePool.map(toHomeworkWord), deadline });
                setAssignmentMessage(`${title} assigned. Find them in the Homework tab.`);
              }
              setChoice(null);
            }} />
        );
      })()}

      {showWordFlight && (
        <WordFlightGame
          words={practicePool.map(w => ({ arabic: w.arabic, meaning: w.english }))}
          vsComputer={studentMode}
          onExit={() => setShowWordFlight(false)}
        />
      )}
      {showCrossword && (
        <CrosswordGame
          words={practicePool}
          title={pool === 'picked' ? 'Picked words'
            : pool === 'needs' ? 'Needs practice'
            : selected.size === 1 ? (lessons.find(l => selected.has(l.id))?.title ?? '1 lesson')
            : selected.size ? `${selected.size} lessons` : 'Every lesson'}
          onExit={() => setShowCrossword(false)}
        />
      )}
      {wordGame && (() => {
        const gameTitle = pool === 'picked' ? 'Picked words'
          : pool === 'needs' ? 'Needs practice'
          : selected.size === 1 ? (lessons.find(l => selected.has(l.id))?.title ?? '1 lesson')
          : selected.size ? `${selected.size} lessons` : 'Every lesson';
        const close = () => setWordGame(null);
        return wordGame === 'wheel' ? <LetterWheelGame words={practicePool} title={gameTitle} onExit={close} />
          : wordGame === 'match' ? <QuickMatchGame words={practicePool} title={gameTitle} studentId={student.id} onExit={close} />
          : wordGame === 'search' ? <WordSearchGame words={practicePool} title={gameTitle} onExit={close} />
          : <WordSnakeGame words={practicePool} title={gameTitle} onExit={close} />;
      })()}
      {showWordRace && (
        <LetterRaceGame
          mode="words"
          words={racePairs}
          letters={[]}
          letterForm="isolated"
          vsComputer={studentMode}
          onExit={() => setShowWordRace(false)}
        />
      )}
    </div>
  );
};

export default ArabicLessonsVocabularyTab;
