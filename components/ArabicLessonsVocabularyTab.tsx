// ─────────────────────────────────────────────────────────────────────────────
// ArabicLessonsVocabularyTab — the whole course's vocabulary in one place.
//
// One table of every lesson's words grouped by lesson, words from completed
// lessons highlighted green, a search box that matches Arabic, transliteration
// or English, and a lesson picker that feeds the SAME flashcard flow and games
// the per-lesson Vocabulary tab uses (including the "review later" group).
//
// Rendered for BOTH sides: the tutor's student page and the student portal
// (ArabicStudentDetailPage backs both), so it takes no tutor-only props.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ArabicLesson, ArabicStudent, VocabWord } from '../types';
import { useI18n } from '../context/I18nProvider';
import { getVocabWordsForLessons, saveVocabMistakes } from '../services/arabicService';
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

type Phase = 'idle' | 'active' | 'wrong' | 'complete';

interface Props {
  lessons: ArabicLesson[];       // already filtered to the student's dialect(s)
  student: ArabicStudent;
}

const ArabicLessonsVocabularyTab: React.FC<Props> = ({ lessons, student }) => {
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
    getVocabWordsForLessons(ids)
      .then(ws => { if (live) { setWords(ws); setLoading(false); } })
      .catch(() => {
        if (live) { setLoading(false); fetchedKeyRef.current = null; } // allow a retry
      });
    return () => { live = false; };
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
  const practicePool = useMemo(() => {
    const pool = selected.size
      ? words.filter(w => selected.has(w.lessonId))
      : words;
    return pool;
  }, [words, selected]);
  const savedWords = useMemo(() => words.filter(w => revisionIds.has(w.id)), [words, revisionIds]);
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
  const restart = () => {
    const deck: VocabWord[] = shuffleArray(reviewingSaved ? savedWords : practicePool) as VocabWord[];
    setShuffled(deck); setCardIndex(0);
    persistProgress(deck, 0, [], reviewingSaved);
    setPhase('active');
  };

  const advance = () => {
    if (cardIndex + 1 >= shuffled.length) {
      clearProgress();
      setPhase('complete');
      // Wrong words feed the existing mistakes-review flow (grouped per lesson).
      if (!reviewingSaved && wrongWords.length > 0) {
        saveVocabMistakes(student.id, wrongWords.map(w => ({ wordId: w.id, lessonId: w.lessonId }))).catch(console.error);
      }
    } else {
      persistProgress(shuffled, cardIndex + 1, wrongWords, reviewingSaved);
      setCardIndex(i => i + 1);
    }
  };
  const handleKnow = () => {
    const w = shuffled[cardIndex];
    if (reviewingSaved && w && revisionIds.has(w.id)) {
      const next = new Set(revisionIds); next.delete(w.id); persistRevision(next);
    }
    advance();
  };
  const handleSaveForRevision = () => {
    const w = shuffled[cardIndex];
    if (w && !revisionIds.has(w.id)) persistRevision(new Set<string>(revisionIds).add(w.id));
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 900);
    advance();
  };
  const handleNotSure = () => {
    const w = shuffled[cardIndex];
    const nextWrong = wrongWords.some(x => x.id === w.id) ? wrongWords : [...wrongWords, w];
    setWrongWords(nextWrong);
    persistProgress(shuffled, cardIndex, nextWrong, reviewingSaved);
    setPhase('wrong');
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

        <div className="grid grid-cols-3 gap-2 sm:gap-5 mt-4">
          <button onClick={() => { setFlipped(true); handleNotSure(); }}
            className="flex flex-col items-center justify-center gap-2 py-4 sm:py-6 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all shadow-sm">
            <span className="text-2xl sm:text-3xl">😕</span>
            <span className="text-red-600 dark:text-red-400 font-bold text-xs sm:text-base text-center leading-tight">{t('arabicLessonDetail.notSure')}</span>
          </button>
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

  // ── Flashcard: wrong ──────────────────────────────────────────────────────
  if (phase === 'wrong') {
    const word = shuffled[cardIndex];
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-10 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-800 p-6 sm:p-12 text-center shadow-sm space-y-5">
          <div className="text-5xl">😕</div>
          <p className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">{word?.english}</p>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-5 space-y-2">
            <p className="text-sm font-semibold text-red-500 uppercase tracking-wide">{t('arabicLessonDetail.theArabicWordIs')}</p>
            <p className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-slate-100" dir="rtl">{word?.arabic}</p>
            {word?.transliteration && <p className="text-base text-slate-500 dark:text-slate-400 italic">{word.transliteration}</p>}
          </div>
        </div>
        <button onClick={restart} className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl transition-colors text-lg">
          🔄 {t('arabicLessonDetail.startOver')}
        </button>
        <button onClick={() => setPhase('idle')} className="w-full py-3 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
          {t('arabicLessonDetail.backToWordList')}
        </button>
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

      {/* Practice launcher — runs on the SELECTED lessons (or everything) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Practise</span>
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
            {selected.size ? `${selected.size} lesson${selected.size === 1 ? '' : 's'} selected` : 'all lessons'} · {practicePool.length} words
          </span>
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
          <button onClick={() => startChallenge(practicePool)} disabled={practicePool.length === 0}
            className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3 text-left hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all disabled:opacity-40 disabled:cursor-default">
            <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl">🗂️</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-amber-800 dark:text-amber-200 truncate">
                {t('arabicLessonDetail.startFlashcard', { count: practicePool.length })}
              </span>
              <span className="block text-xs text-amber-600/70 dark:text-amber-300/60">Flip · memorise · repeat</span>
            </span>
          </button>

          <button onClick={() => setShowWordFlight(true)} disabled={practicePool.length === 0}
            className="flex items-center gap-3 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/60 dark:bg-sky-900/10 px-4 py-3 text-left hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-all disabled:opacity-40 disabled:cursor-default">
            <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center text-2xl">✈️</span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-sky-800 dark:text-sky-200 truncate">Word Flight Game</span>
              <span className="block text-xs text-sky-600/70 dark:text-sky-300/60">Catch the falling words</span>
            </span>
          </button>

          {racePairs.length >= 2 && (
            <button onClick={() => setShowWordRace(true)}
              className="flex items-center gap-3 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/60 dark:bg-teal-900/10 px-4 py-3 text-left hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-all">
              <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-2xl">🏃</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-teal-800 dark:text-teal-200 truncate">Word Race Game</span>
                <span className="block text-xs text-teal-600/70 dark:text-teal-300/60">Run to the Arabic word</span>
              </span>
            </button>
          )}

          {savedWords.length > 0 && (
            <button onClick={() => startChallenge(savedWords, true)}
              className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-900/10 px-4 py-3 text-left hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all">
              <span className="flex-shrink-0 w-11 h-11 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-2xl">🔖</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-rose-800 dark:text-rose-200 truncate">
                  {t('arabicLessonDetail.reviseSaved', { count: savedWords.length })}
                </span>
                <span className="block text-xs text-rose-600/70 dark:text-rose-300/60">{t('arabicLessonDetail.reviseSavedDesc')}</span>
              </span>
            </button>
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
              <col style={{ width: '28%' }} />
              <col style={{ width: '30%' }} />
              <col />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 dark:border-gray-700">
                <th className="px-0.5 py-2.5" />
                <th className="text-right px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Arabic</th>
                <th className="text-left px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Translit.</th>
                <th className="text-left px-1.5 sm:px-4 py-2.5 text-[10px] sm:text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">English</th>
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
                      <td colSpan={4} className="px-1.5 sm:px-4 py-2 border-y border-slate-100 dark:border-gray-700">
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
                    {items.map(w => (
                      // Learnt words get a clearly GREEN row (plus a green left
                      // edge) so the eye can pick them out at a glance.
                      <tr key={w.id} className={`border-b border-slate-50 dark:border-gray-700/50 ${
                        learnt
                          ? 'bg-emerald-100/80 dark:bg-emerald-900/30 border-l-[3px] border-l-emerald-400 dark:border-l-emerald-600'
                          : ''
                      }`}>
                        <td className="px-0.5 py-2 text-center align-top">
                          {revisionIds.has(w.id) && <span title="Saved to review later" className="text-xs">🔖</span>}
                        </td>
                        <td className={`px-1.5 sm:px-4 py-2 text-right font-semibold text-base break-words align-top ${learnt ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-800 dark:text-slate-100'}`} dir="rtl">{w.arabic}</td>
                        <td className={`px-1.5 sm:px-4 py-2 italic break-words align-top text-xs sm:text-sm ${learnt ? 'text-emerald-700/80 dark:text-emerald-300/80' : 'text-slate-500 dark:text-slate-400'}`}>{w.transliteration}</td>
                        <td className={`px-1.5 sm:px-4 py-2 break-words align-top text-xs sm:text-sm ${learnt ? 'text-emerald-900 dark:text-emerald-100' : 'text-slate-700 dark:text-slate-200'}`}>{w.english}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
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
