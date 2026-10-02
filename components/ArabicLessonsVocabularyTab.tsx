// ─────────────────────────────────────────────────────────────────────────────
// ArabicLessonsVocabularyTab — the whole course's vocabulary in one place.
//
// One table of every lesson's words grouped by lesson, words from completed
// lessons highlighted green, a search box that matches Arabic, transliteration
// or English, and a lesson picker that feeds the SAME flashcard flow and games
// the per-lesson Vocabulary tab uses (including the "review later" group).
//
// Rendered for BOTH sides: the tutor's student page and the student portal
// (ArabicStudentDetailPage backs both). The tutor additionally gets the
// homework basket; the student gets a card for homework waiting for them.
//
// Every flashcard answer is recorded ("I know" = correct, "Review later" =
// wrong) and the last ten draw the red/green strength bar beside each word.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArabicLesson, ArabicStudent, VocabWord } from '../types';
import { useI18n } from '../context/I18nProvider';
import { getVocabWordsForLessons, saveVocabMistakes } from '../services/arabicService';
import {
  getVocabStrength, recordVocabReview, withReview, StrengthMap,
  listVocabHomework, VocabHomework, isHomeworkExpired, homeworkUrl,
} from '../services/vocabHomeworkService';
import StrengthBar from './VocabStrengthBar';
import GameTile from './GameTile';
import HomeworkBasket, { useHomeworkBasket } from './VocabHomeworkBasket';
import {
  LetterCardsAttempt, LetterCardsGame, listLetterCardsAttempts, listLetterCardsHomework,
} from '../services/letterCardsService';
import { LetterCardsSetup } from './LetterCardsGame';
import WordFlightGame from './WordFlightGame';
import LetterRaceGame, { RacePair } from './LetterRaceGame';

const shuffleArray = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

type Phase = 'idle' | 'active' | 'complete';

interface Props {
  lessons: ArabicLesson[];       // already filtered to the student's dialect(s)
  student: ArabicStudent;
  /** Tutor side: row clicks fill the homework basket. Student side: pending homework card. */
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
  const [showWordRace, setShowWordRace]     = useState(false);

  // Flashcard run — mirrors the per-lesson VocabularyTab flow exactly.
  const [phase, setPhase]           = useState<Phase>('idle');
  const [shuffled, setShuffled]     = useState<VocabWord[]>([]);
  const [cardIndex, setCardIndex]   = useState(0);
  const [wrongWords, setWrongWords] = useState<VocabWord[]>([]);
  const [flipped, setFlipped]       = useState(false);
  const [reviewingSaved, setReviewingSaved] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Last ten flashcard answers per word → the strength bar.
  const [strength, setStrength] = useState<StrengthMap>(new Map());
  useEffect(() => {
    let live = true;
    getVocabStrength(student.id).then(m => { if (live) setStrength(m); });
    return () => { live = false; };
  }, [student.id]);
  const recordAnswer = (w: VocabWord, correct: boolean) => {
    setStrength(prev => withReview(prev, w.id, correct));
    recordVocabReview(student.id, w, correct);
  };

  // Homework basket (tutor) — the draft plus every homework already sent.
  const basket = useHomeworkBasket(student, !studentMode);
  const [basketOpen, setBasketOpen] = useState(false);
  /** The card game, dealt from whatever the practice box is set to. */
  const [cardsOpen, setCardsOpen] = useState(false);

  // Homework waiting for the student (portal).
  const [pendingHomework, setPendingHomework] = useState<VocabHomework[]>([]);
  useEffect(() => {
    if (!studentMode) return;
    let live = true;
    listVocabHomework(student.id).then(list => {
      if (live) setPendingHomework(list.filter(h => h.status === 'assigned' && !isHomeworkExpired(h)));
    });
    return () => { live = false; };
  }, [student.id, studentMode]);

  // Card games set as homework — the student plays them against the computer,
  // as often as they like.
  const [cardGames, setCardGames] = useState<LetterCardsGame[]>([]);
  const [cardAttempts, setCardAttempts] = useState<Record<string, LetterCardsAttempt[]>>({});
  useEffect(() => {
    if (!studentMode) return;
    let live = true;
    listLetterCardsHomework(student.id).then(async games => {
      if (!live) return;
      const mine = games.filter(g => g.kind === 'words');
      setCardGames(mine);
      const tries = await listLetterCardsAttempts(mine.map(g => g.id));
      if (live) setCardAttempts(tries);
    }).catch(() => {});
    return () => { live = false; };
  }, [student.id, studentMode]);

  // "Review later" group — a SEPARATE set from the per-lesson lists, because
  // this surface spans the whole course. Per student, in localStorage.
  const revisionKey = `arabicVocabRevisionAll:${student.id}`;
  const [revisionIds, setRevisionIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(revisionKey);
      setRevisionIds(new Set<string>(raw ? JSON.parse(raw) as string[] : []));
    } catch { setRevisionIds(new Set()); }
  }, [revisionKey]);
  const persistRevision = (next: Set<string>) => {
    setRevisionIds(next);
    try { localStorage.setItem(revisionKey, JSON.stringify([...next])); } catch { /* quota */ }
  };

  // ── Unfinished flashcard run — survives leaving the tab (per student). ────
  // Saved on every answer, cleared on completion; the idle screen offers a
  // "continue where you left off" button while one exists.
  const progressKey = `arabicVocabFlashProgress:${student.id}`;
  interface SavedRun { wordIds: string[]; cardIndex: number; wrongIds: string[]; reviewingSaved: boolean }
  const persistProgress = (deck: VocabWord[], idx: number, wrong: VocabWord[], savedRun: boolean) => {
    try {
      localStorage.setItem(progressKey, JSON.stringify({
        wordIds: deck.map(w => w.id), cardIndex: idx,
        wrongIds: wrong.map(w => w.id), reviewingSaved: savedRun,
      } satisfies SavedRun));
    } catch { /* quota */ }
  };
  const clearProgress = () => { try { localStorage.removeItem(progressKey); } catch { /* quota */ } };
  const savedProgress = useMemo((): SavedRun | null => {
    void phase;   // re-read whenever a run starts/ends
    try {
      const raw = localStorage.getItem(progressKey);
      if (!raw) return null;
      const pr = JSON.parse(raw) as SavedRun;
      if (!Array.isArray(pr.wordIds) || typeof pr.cardIndex !== 'number') return null;
      if (pr.cardIndex < 1 || pr.cardIndex >= pr.wordIds.length) return null;   // nothing meaningful to resume
      return pr;
    } catch { return null; }
  }, [progressKey, phase]);

  const resumeRun = () => {
    if (!savedProgress) return;
    const byId = new Map<string, VocabWord>(words.map(w => [w.id, w] as [string, VocabWord]));
    const deck = savedProgress.wordIds.map(id => byId.get(id)).filter((w): w is VocabWord => !!w);
    if (deck.length < 2 || savedProgress.cardIndex >= deck.length) { clearProgress(); return; }
    setShuffled(deck);
    setCardIndex(savedProgress.cardIndex);
    setWrongWords(savedProgress.wrongIds.map(id => byId.get(id)).filter((w): w is VocabWord => !!w));
    setReviewingSaved(!!savedProgress.reviewingSaved);
    setFlipped(false);
    setPhase('active');
  };

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
  /** The words the tutor has tapped into the basket — every game can run on
   *  those instead of on whole lessons. */
  const basketPool = useMemo(() => words.filter(w => basket.ids.has(w.id)), [words, basket.ids]);
  /** Tapping words in the table selects them, and from then on every game and
   *  the homework run on that selection — until the tutor asks for the whole
   *  lessons again, which is what this remembers. */
  const [wantLessons, setWantLessons] = useState(false);
  const onBasket = basketPool.length > 0 && !wantLessons;
  const practicePool = onBasket ? basketPool : lessonPool;
  const savedWords = useMemo(() => words.filter(w => revisionIds.has(w.id)), [words, revisionIds]);
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
  const startChallenge = (pool: VocabWord[], savedRun = false) => {
    if (!pool.length) return;
    const deck: VocabWord[] = shuffleArray(pool) as VocabWord[];
    setShuffled(deck);
    setCardIndex(0); setWrongWords([]); setReviewingSaved(savedRun);
    persistProgress(deck, 0, [], savedRun);
    setPhase('active');
  };
  const advance = (wrong: VocabWord[] = wrongWords) => {
    if (cardIndex + 1 >= shuffled.length) {
      clearProgress();
      setPhase('complete');
      // Wrong words feed the existing mistakes-review flow (grouped per lesson).
      if (!reviewingSaved && wrong.length > 0) {
        saveVocabMistakes(student.id, wrong.map(w => ({ wordId: w.id, lessonId: w.lessonId }))).catch(console.error);
      }
    } else {
      persistProgress(shuffled, cardIndex + 1, wrong, reviewingSaved);
      setCardIndex(i => i + 1);
    }
  };
  const handleKnow = () => {
    const w = shuffled[cardIndex];
    if (w) recordAnswer(w, true);
    if (reviewingSaved && w && revisionIds.has(w.id)) {
      const next = new Set(revisionIds); next.delete(w.id); persistRevision(next);
    }
    advance();
  };
  // "Review later" is the student NOT knowing the word: it counts as a wrong
  // answer on the strength bar and lands in the "need more practice" list.
  const handleSaveForRevision = () => {
    const w = shuffled[cardIndex];
    let wrong = wrongWords;
    if (w) {
      recordAnswer(w, false);
      if (!revisionIds.has(w.id)) persistRevision(new Set<string>(revisionIds).add(w.id));
      if (!wrong.some(x => x.id === w.id)) wrong = [...wrong, w];
    }
    setWrongWords(wrong);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 900);
    advance(wrong);
  };

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
            {reviewingSaved && <span className="mr-2 inline-block px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-bold align-middle">🔖 {t('arabicLessonDetail.revisionSession')}</span>}
            {t('arabicLessonDetail.cardOf', { n: cardIndex + 1, total: shuffled.length })}
          </span>
          <button onClick={() => setPhase('idle')} className="text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">× {t('arabicLessonDetail.exit')}</button>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full transition-all duration-300" style={{ width: `${(cardIndex / shuffled.length) * 100}%` }} />
        </div>

        {/* Flip card — English on the front, Arabic on the back */}
        <div style={{ perspective: '1200px' }} onClick={() => setFlipped(f => !f)} className="cursor-pointer select-none">
          <div style={{ transformStyle: 'preserve-3d', transition: 'transform 0.55s cubic-bezier(0.4,0.2,0.2,1)', transform: flipped ? 'rotateY(180deg)' : 'none', position: 'relative', minHeight: '200px' }}>
            <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 py-12 sm:py-16 px-6 sm:px-12 text-center shadow-sm space-y-4 absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-xs sm:text-sm font-semibold text-slate-400 uppercase tracking-widest">{t('arabicLessonDetail.doYouKnow')}</p>
              <p className="text-3xl sm:text-5xl font-extrabold text-slate-800 dark:text-slate-100">{word.english}</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-2">tap to reveal</p>
            </div>
            <div style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-700 py-12 sm:py-16 px-6 sm:px-12 text-center shadow-sm space-y-3 absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-4xl sm:text-6xl font-extrabold text-slate-800 dark:text-slate-100" dir="rtl">{word.arabic}</p>
              {word.transliteration && <p className="text-lg sm:text-xl text-amber-700 dark:text-amber-300 italic">{word.transliteration}</p>}
              <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mt-1">= {word.english}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-5 mt-4">
          <button onClick={handleSaveForRevision}
            className="relative flex flex-col items-center justify-center gap-2 py-4 sm:py-6 bg-rose-50 dark:bg-rose-900/20 border-2 border-rose-200 dark:border-rose-800 rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-all shadow-sm">
            {savedFlash && <span className="absolute -top-2 right-2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold shadow animate-pulse">{t('arabicLessonDetail.savedForRevision')}</span>}
            <span className="text-2xl sm:text-3xl">🔖</span>
            <span className="text-rose-600 dark:text-rose-400 font-bold text-xs sm:text-base text-center leading-tight">
              {revisionIds.has(word.id) ? t('arabicLessonDetail.savedAlready') : t('arabicLessonDetail.reviewLater')}
            </span>
          </button>
          <button onClick={handleKnow}
            className="flex flex-col items-center justify-center gap-2 py-4 sm:py-6 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-all shadow-sm">
            <span className="text-2xl sm:text-3xl">👍</span>
            <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs sm:text-base">{t('arabicLessonDetail.iKnow')}</span>
          </button>
        </div>
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
          <p className="text-base text-slate-500 dark:text-slate-400">
            {t('arabicLessonDetail.challengeCompleteMsg', { count: shuffled.length })}
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
        <button onClick={() => setPhase('idle')} className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl transition-colors">
          {t('arabicLessonDetail.backToWordList')}
        </button>
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
            <span className="w-3 h-3 rounded bg-emerald-200 dark:bg-emerald-800 border border-emerald-400 dark:border-emerald-600" />
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

      {/* Homework waiting for the student */}
      {studentMode && pendingHomework.map(hw => (
        <a key={hw.id} href={homeworkUrl(hw.id)}
          className="flex items-center gap-3 rounded-2xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 px-4 py-3 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
          <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-2xl">🧺</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-violet-800 dark:text-violet-200">
              Vocabulary homework · {hw.words.length} word{hw.words.length === 1 ? '' : 's'}
            </span>
            <span className="block text-xs text-violet-600/80 dark:text-violet-300/70">
              {hw.deadline
                ? `Due ${new Date(hw.deadline).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                : 'No deadline'}
            </span>
          </span>
          <span className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold">Start →</span>
        </a>
      ))}

      {/* Card games waiting for the student */}
      {studentMode && cardGames.map(g => {
        const tries = cardAttempts[g.id] ?? [];
        const best = tries.reduce((m, a) => Math.max(m, a.score), 0);
        return (
          <a key={g.id} href={`/letter-cards/${g.id}`}
            className="flex items-center gap-3 rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
            <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-2xl">🃏</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-amber-800 dark:text-amber-200">
                Word cards · {g.letters.length} word{g.letters.length === 1 ? '' : 's'}
              </span>
              <span className="block text-xs text-amber-700/80 dark:text-amber-300/70">
                {tries.length
                  ? `Best ${best}/${tries[0].total} in ${tries.length} ${tries.length === 1 ? 'try' : 'tries'} · play it again`
                  : 'Match each Arabic word with its meaning — as often as you like'}
              </span>
            </span>
            <span className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold">
              {tries.length ? 'Again →' : 'Play →'}
            </span>
          </a>
        );
      })}

      {/* Practice launcher — runs on the SELECTED lessons (or everything) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Practise</span>
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            {onBasket
              ? `the ${basketPool.length} word${basketPool.length === 1 ? '' : 's'} you selected`
              : `${selected.size ? `${selected.size} lesson${selected.size === 1 ? '' : 's'} selected` : 'all lessons'} · ${practicePool.length} words`}
          </span>
          {!studentMode && basketPool.length > 0 && (
            <span className="inline-flex rounded-full bg-slate-100 dark:bg-gray-700 p-0.5">
              {([[false, 'Lessons'], [true, `Selected (${basketPool.length})`]] as const).map(([v, label]) => (
                <button key={label} onClick={() => setWantLessons(!v)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                    onBasket === v ? 'bg-white dark:bg-gray-800 text-violet-700 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                  {label}
                </button>
              ))}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            {([1, 2, 3] as const).map(lvl => (
              <button key={lvl} onClick={() => selectLevel(lvl)}
                className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                Level {lvl}
              </button>
            ))}
            <button onClick={selectAllVisible}
              className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30">Select all</button>
            {selected.size > 0 && (
              <button onClick={() => setSelected(new Set())}
                className="px-2 py-1 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30">Clear</button>
            )}
          </div>
        </div>

        {!studentMode && (
          <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
            basketPool.length
              ? 'border-violet-200 dark:border-violet-800/60 bg-violet-50/60 dark:bg-violet-900/10'
              : 'border-dashed border-slate-200 dark:border-gray-700'}`}>
            {basketPool.length === 0 ? (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Tap words in the table to select them — the games and the homework then use just those.
              </span>
            ) : (
              <>
                <span className="text-sm font-bold text-violet-800 dark:text-violet-200">
                  {basketPool.length} word{basketPool.length === 1 ? '' : 's'} selected
                </span>
                <span className="text-xs text-violet-600/80 dark:text-violet-300/70">
                  {onBasket
                    ? '· every game below plays just these, and homework sends just these'
                    : '· the games are running on the lessons instead'}
                </span>
                <span className="flex-grow" />
                <button onClick={() => setWantLessons(onBasket)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30">
                  {onBasket ? 'Use the lessons' : 'Use my selection'}
                </button>
                <button onClick={basket.clear}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30">
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}

        {savedProgress && (
          <button onClick={resumeRun}
            className="w-full flex items-center gap-3 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-left hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all">
            <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-2xl">▶️</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-emerald-800 dark:text-emerald-200 truncate">
                {t('arabicLessonDetail.continueFlashcard', { n: savedProgress.cardIndex + 1, total: savedProgress.wordIds.length })}
              </span>
              <span className="block text-xs text-emerald-600/70 dark:text-emerald-300/60">{t('arabicLessonDetail.continueFlashcardHint')}</span>
            </span>
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <GameTile art="flashcards" tone="amber" icon="🗂️"
            name={t('arabicLessonDetail.startFlashcard', { count: practicePool.length })}
            hint="Flip · memorise · repeat"
            disabled={practicePool.length === 0}
            onClick={() => startChallenge(practicePool)} />

          <GameTile art="wordflight" tone="sky" icon="✈️"
            name="Word Flight Game" hint="Catch the falling words"
            disabled={practicePool.length === 0}
            onClick={() => setShowWordFlight(true)} />

          {racePairs.length >= 2 && (
            <GameTile art="wordrace" tone="teal" icon="🏃"
              name="Word Race Game" hint="Run to the Arabic word"
              onClick={() => setShowWordRace(true)} />
          )}

          {savedWords.length > 0 && (
            <GameTile art="saved" tone="rose" icon="🔖"
              name={t('arabicLessonDetail.reviseSaved', { count: savedWords.length })}
              hint={t('arabicLessonDetail.reviseSavedDesc')}
              onClick={() => startChallenge(savedWords, true)} />
          )}

          <GameTile art="wordcards" tone="orange" icon="🃏"
            name="Word Cards Game"
            hint={cardWords.length < 2
              ? 'Pick at least two words'
              : studentMode
                ? `Play the computer · ${cardWords.length} words`
                : `Throw a card, match its pair · ${cardWords.length} words`}
            disabled={cardWords.length < 2}
            onClick={() => setCardsOpen(true)} />

          {!studentMode && (
            <GameTile art="basket" tone="violet" icon="🧺"
              name={basket.words.length ? 'Assign as homework' : 'Homework Basket'}
              hint={basket.words.length
                ? `Send the ${basket.words.length} word${basket.words.length === 1 ? '' : 's'} you selected`
                : 'Tap words in the table to select them'}
              badge={basket.words.length > 0 ? (
                <span className="absolute top-2 end-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center shadow-md">
                  {basket.words.length}
                </span>
              ) : undefined}
              onClick={() => setBasketOpen(true)} />
          )}
        </div>
      </div>

      {/* ── The one table: every lesson's words, grouped by lesson ── */}
      {visibleGroups.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-8 text-center">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {totalWords === 0 ? 'No vocabulary has been added to these lessons yet.' : 'No words match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
          {/* table-fixed + percentage widths: the columns always add up to the
              container, so the table fits any screen with no sideways scroll
              and nothing clipped. Long words wrap inside their cell. */}
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: '26px' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '24%' }} />
              <col />
              <col className="w-[76px] sm:w-[124px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 dark:border-gray-700">
                <th className="px-0.5 py-2.5" />
                <th className="text-right px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Arabic</th>
                <th className="text-left px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Translit.</th>
                <th className="text-left px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">English</th>
                <th title="The last 10 flashcard answers, oldest → newest"
                  className="text-center px-1 sm:px-2 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Strength</th>
              </tr>
            </thead>
            <tbody>
              {visibleGroups.map(({ lesson, items }) => {
                const learnt   = completedSet.has(lesson.id);
                const isPicked = selected.has(lesson.id);
                return (
                  <React.Fragment key={lesson.id}>
                    {/* Lesson header row — doubles as the lesson selector */}
                    <tr className={isPicked ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-gray-700/50'}>
                      <td colSpan={5} className="px-1.5 sm:px-4 py-2 border-y border-slate-100 dark:border-gray-700">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={isPicked} onChange={() => toggleLesson(lesson.id)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-gray-500 text-amber-500 focus:ring-amber-400 flex-shrink-0" />
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 flex-shrink-0">L{lesson.level}</span>
                          <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 min-w-0 break-words">{lesson.title}</span>
                          {learnt && (
                            <span className="flex-shrink-0 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">✓ learnt</span>
                          )}
                          <span className="ml-auto flex-shrink-0 text-[10px] text-slate-400 dark:text-slate-500 font-semibold">{items.length}</span>
                        </label>
                      </td>
                    </tr>
                    {items.map(w => {
                      const inBasket = basket.ids.has(w.id);
                      return (
                      // Learnt words get a clearly GREEN row (plus a green left
                      // edge) so the eye can pick them out at a glance. On the
                      // tutor side a tap puts the word in (or takes it out of)
                      // the homework basket.
                      <tr key={w.id}
                        onClick={studentMode ? undefined : () => basket.toggle(w)}
                        title={studentMode ? undefined : (inBasket ? 'In the homework basket — tap to remove' : 'Tap to add to the homework basket')}
                        className={`border-b border-slate-50 dark:border-gray-700/50 ${
                        inBasket
                          ? 'bg-violet-100/80 dark:bg-violet-900/30 border-l-[3px] border-l-violet-500'
                          : learnt
                            ? 'bg-emerald-100/80 dark:bg-emerald-900/30 border-l-[3px] border-l-emerald-400 dark:border-l-emerald-600'
                            : ''
                      } ${studentMode ? '' : 'cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/20'}`}>
                        <td className="px-0.5 py-2 text-center align-top">
                          {inBasket
                            ? <span title="In the homework basket" className="text-xs">🧺</span>
                            : revisionIds.has(w.id) && <span title="Saved to review later" className="text-xs">🔖</span>}
                        </td>
                        <td className={`px-1.5 sm:px-4 py-2 text-right font-semibold text-base break-words align-top ${learnt ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-800 dark:text-slate-100'}`} dir="rtl">{w.arabic}</td>
                        <td className={`px-1.5 sm:px-4 py-2 italic break-words align-top text-xs sm:text-sm ${learnt ? 'text-emerald-700/80 dark:text-emerald-300/80' : 'text-slate-500 dark:text-slate-400'}`}>{w.transliteration}</td>
                        <td className={`px-1.5 sm:px-4 py-2 break-words align-top text-xs sm:text-sm ${learnt ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-200'}`}>{w.english}</td>
                        <td className="px-1 sm:px-2 py-2 align-top">
                          <StrengthBar answers={strength.get(w.id) ?? []} />
                        </td>
                      </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cardsOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={() => setCardsOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl">
            <LetterCardsSetup words={cardWords} student={{ id: student.id, name: student.name }}
              selfPlay={studentMode ? { teacherId: student.teacherId } : undefined}
              onClose={() => setCardsOpen(false)} />
          </div>
        </div>
      )}

      {basketOpen && !studentMode && (
        <HomeworkBasket
          basket={basket}
          student={student}
          courseWords={words}
          savedWords={savedWords}
          nextLessonAt={nextLessonAt}
          onClose={() => setBasketOpen(false)}
        />
      )}

      {showWordFlight && (
        <WordFlightGame
          words={practicePool.map(w => ({ arabic: w.arabic, meaning: w.english }))}
          onExit={() => setShowWordFlight(false)}
        />
      )}
      {showWordRace && (
        <LetterRaceGame
          mode="words"
          words={racePairs}
          letters={[]}
          letterForm="isolated"
          onExit={() => setShowWordRace(false)}
        />
      )}
    </div>
  );
};

export default ArabicLessonsVocabularyTab;
