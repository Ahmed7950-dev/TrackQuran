import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getVocabularyLists, saveVocabularyList, deleteVocabularyList,
  VocabList, VocabWord, VocabPhrase, GrammarNote,
} from '../services/vocabularyService';

// ─── helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQueue(items: { text: string; translation: string; clicks: number }[]) {
  const expanded: { text: string; translation: string }[] = [];
  for (const item of items) {
    const reps = item.clicks + 1;
    for (let i = 0; i < reps; i++) expanded.push({ text: item.text, translation: item.translation });
  }
  return shuffle(expanded);
}

const CATEGORIES = ['other', 'noun', 'verb', 'adjective'];

const clickColor = (clicks: number) => {
  if (clicks === 1) return 'bg-yellow-100 dark:bg-yellow-900/40';
  if (clicks === 2) return 'bg-red-100 dark:bg-red-900/40';
  return '';
};

const clickLabel = (clicks: number) => {
  if (clicks === 1) return '×2';
  if (clicks === 2) return '×3';
  return '×1';
};

const clickBadge = (clicks: number) => {
  if (clicks === 1) return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200';
  if (clicks === 2) return 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200';
  return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400';
};

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

// ─── component ────────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
}

const VocabularyPracticePage: React.FC<Props> = ({ studentId }) => {
  // ── data ──────────────────────────────────────────────────────────────────
  const [lists, setLists] = useState<VocabList[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [words, setWords] = useState<VocabWord[]>([]);
  const [phrases, setPhrases] = useState<VocabPhrase[]>([]);
  const [listName, setListName] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  // SRS attempt timestamps for the currently active list (max 5)
  const [currentSrsAttempts, setCurrentSrsAttempts] = useState<string[]>([]);

  // ── ui ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'words' | 'phrases' | 'practice'>('words');
  const [selectedCat, setSelectedCat] = useState('other');
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [wordInput, setWordInput] = useState('');
  const [wordSearch, setWordSearch] = useState('');
  const [wordSort, setWordSort] = useState('default');
  const [wordCatFilter, setWordCatFilter] = useState('all');
  const [phraseInput, setPhraseInput] = useState('');
  const [phraseSearch, setPhraseSearch] = useState('');
  const [phraseFilter, setPhraseFilter] = useState<'all' | 'red' | 'yellow' | 'any'>('all');
  const [newCatInput, setNewCatInput] = useState('');

  // ── practice ──────────────────────────────────────────────────────────────
  const [practiceMode, setPracticeMode] = useState<'words' | 'phrases'>('words');
  const [practiceQueue, setPracticeQueue] = useState<{ text: string; translation: string }[]>([]);
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [practiceTotal, setPracticeTotal] = useState(0);
  const [showingArabic, setShowingArabic] = useState(true);
  // showArabicFirst = session-wide preference; all cards start with this side
  const [showArabicFirst, setShowArabicFirst] = useState(true);
  // ref to avoid recording the SRS attempt more than once per session win
  const practiceAttemptRecordedRef = useRef(false);

  // ── grammar modal ─────────────────────────────────────────────────────────
  const [grammarPhraseIdx, setGrammarPhraseIdx] = useState<number | null>(null);
  const [gsSelection, setGsSelection] = useState<number[]>([]);
  const [gsNoteInput, setGsNoteInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartIdx, setDragStartIdx] = useState<number>(-1);

  // ── timer ─────────────────────────────────────────────────────────────────
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState(25 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showAlarm, setShowAlarm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── modals / toast ────────────────────────────────────────────────────────
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalInput, setSaveModalInput] = useState('');
  const [toast, setToast] = useState('');
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(''), 2400);
  }, []);

  // ─── load lists ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    getVocabularyLists(studentId).then(ls => {
      setLists(ls);
      if (ls.length > 0) {
        const first = ls[0];
        setActiveListId(first.id);
        setWords(first.words ?? []);
        setPhrases(first.phrases ?? []);
        setListName(first.name);
        setCurrentSrsAttempts(first.srs_attempts ?? []);
      }
      setLoading(false);
    });
  }, [studentId]);

  // ─── auto-save debounce ────────────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty || !activeListId || !listName) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveVocabularyList({ id: activeListId, student_id: studentId, name: listName, words, phrases, srs_attempts: currentSrsAttempts });
      setIsDirty(false);
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [isDirty, activeListId, listName, words, phrases, studentId, currentSrsAttempts]);

  // ─── timer tick ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSecondsLeft(s => {
          if (s <= 1) {
            setTimerRunning(false);
            setShowAlarm(true);
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ─── computed allCats (needed by handlers below) ───────────────────────────
  const allCats = [...CATEGORIES, ...customCats];

  // ─── list helpers ──────────────────────────────────────────────────────────

  const loadList = (list: VocabList) => {
    setActiveListId(list.id);
    setWords(list.words ?? []);
    setPhrases(list.phrases ?? []);
    setListName(list.name);
    setCurrentSrsAttempts(list.srs_attempts ?? []);
    setIsDirty(false);
    setTab('words');
  };

  const newList = () => {
    const id = crypto.randomUUID();
    setActiveListId(id);
    setWords([]);
    setPhrases([]);
    setListName('');
    setCurrentSrsAttempts([]);
    setIsDirty(false);
    setTab('words');
    showToast('New list started — save it when ready');
  };

  const openSaveModal = () => {
    setSaveModalInput(listName);
    setShowSaveModal(true);
  };

  // Fix: create an id when none exists so saving always works
  const handleSave = async () => {
    const name = saveModalInput.trim();
    if (!name) return;
    const id = activeListId ?? crypto.randomUUID();
    setListName(name);
    if (!activeListId) setActiveListId(id);
    await saveVocabularyList({ id, student_id: studentId, name, words, phrases, srs_attempts: currentSrsAttempts });
    const refreshed = await getVocabularyLists(studentId);
    setLists(refreshed);
    setShowSaveModal(false);
    setIsDirty(false);
    showToast('List saved!');
  };

  const handleDeleteList = async (list: VocabList) => {
    if (!window.confirm(`Delete "${list.name}"?`)) return;
    await deleteVocabularyList(list.id);
    const refreshed = await getVocabularyLists(studentId);
    setLists(refreshed);
    if (activeListId === list.id) {
      if (refreshed.length > 0) {
        loadList(refreshed[0]);
      } else {
        setActiveListId(null);
        setWords([]);
        setPhrases([]);
        setListName('');
      }
    }
    showToast('List deleted');
  };

  // ─── words ────────────────────────────────────────────────────────────────

  const addWords = () => {
    const tokens = wordInput.trim().split(/[\s\n]+/).filter(Boolean);
    if (!tokens.length) return;
    const newWords: VocabWord[] = tokens.map(t => ({
      id: crypto.randomUUID(), text: t, translation: '', transliteration: '', clicks: 0, category: selectedCat,
    }));
    setWords(prev => [...prev, ...newWords]);
    setWordInput('');
    setIsDirty(true);
  };

  const cycleWordClicks = (id: string) => {
    setWords(prev => prev.map(w => w.id === id ? { ...w, clicks: (w.clicks + 1) % 3 } : w));
    setIsDirty(true);
  };

  const updateWordTranslation = (id: string, val: string) => {
    setWords(prev => prev.map(w => w.id === id ? { ...w, translation: val } : w));
    setIsDirty(true);
  };

  const updateWordTransliteration = (id: string, val: string) => {
    setWords(prev => prev.map(w => w.id === id ? { ...w, transliteration: val } : w));
    setIsDirty(true);
  };

  // Clicking a category badge in the table row cycles to the next category
  const cycleWordCategory = (id: string) => {
    const cats = [...CATEGORIES, ...customCats];
    setWords(prev => prev.map(w => {
      if (w.id !== id) return w;
      const idx = cats.indexOf(w.category);
      const next = cats[(idx + 1) % cats.length];
      return { ...w, category: next };
    }));
    setIsDirty(true);
  };

  const removeWord = (id: string) => {
    setWords(prev => prev.filter(w => w.id !== id));
    setIsDirty(true);
  };

  const addCustomCat = () => {
    const c = newCatInput.trim().toLowerCase();
    if (!c || allCats.includes(c)) return;
    setCustomCats(prev => [...prev, c]);
    setNewCatInput('');
  };

  // ─── phrases ──────────────────────────────────────────────────────────────

  const addPhrases = () => {
    const lines = phraseInput.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const newPhrases: VocabPhrase[] = lines.map(l => ({
      id: crypto.randomUUID(), text: l, translation: '', clicks: 0, grammarNotes: [],
    }));
    setPhrases(prev => [...prev, ...newPhrases]);
    setPhraseInput('');
    setIsDirty(true);
  };

  const cyclePhraseClicks = (id: string) => {
    setPhrases(prev => prev.map(p => p.id === id ? { ...p, clicks: (p.clicks + 1) % 3 } : p));
    setIsDirty(true);
  };

  const updatePhraseTranslation = (id: string, val: string) => {
    setPhrases(prev => prev.map(p => p.id === id ? { ...p, translation: val } : p));
    setIsDirty(true);
  };

  const removePhrase = (id: string) => {
    setPhrases(prev => prev.filter(p => p.id !== id));
    setIsDirty(true);
  };

  // ─── grammar modal ────────────────────────────────────────────────────────

  const openGrammar = (idx: number) => {
    setGrammarPhraseIdx(idx);
    setGsSelection([]);
    setGsNoteInput('');
    setIsDragging(false);
  };

  const closeGrammar = () => setGrammarPhraseIdx(null);

  const handleCharMouseDown = (charIdx: number) => {
    setIsDragging(true);
    setDragStartIdx(charIdx);
    setGsSelection([charIdx]);
  };

  const handleCharMouseEnter = (charIdx: number) => {
    if (!isDragging) return;
    const min = Math.min(dragStartIdx, charIdx);
    const max = Math.max(dragStartIdx, charIdx);
    const range: number[] = [];
    for (let i = min; i <= max; i++) range.push(i);
    setGsSelection(range);
  };

  const handleCharMouseUp = () => setIsDragging(false);

  const addGrammarNote = (needsStudy = false) => {
    if (grammarPhraseIdx === null) return;
    const note: GrammarNote = {
      id: crypto.randomUUID(), indices: gsSelection, note: gsNoteInput, needsStudy,
    };
    setPhrases(prev => prev.map((p, i) =>
      i === grammarPhraseIdx ? { ...p, grammarNotes: [...p.grammarNotes, note] } : p
    ));
    setGsSelection([]);
    setGsNoteInput('');
    setIsDirty(true);
  };

  const deleteGrammarNote = (phraseIdx: number, noteId: string) => {
    setPhrases(prev => prev.map((p, i) =>
      i === phraseIdx ? { ...p, grammarNotes: p.grammarNotes.filter(n => n.id !== noteId) } : p
    ));
    setIsDirty(true);
  };

  // ─── practice ─────────────────────────────────────────────────────────────

  const startPractice = useCallback(() => {
    const source = practiceMode === 'words' ? words : phrases;
    const filtered = source.filter(i => i.translation);
    if (!filtered.length) { showToast('Add translations first!'); return; }
    const q = buildQueue(filtered);
    setPracticeQueue(q);
    setPracticeTotal(q.length);
    setPracticeIdx(0);
    setShowingArabic(showArabicFirst);
    practiceAttemptRecordedRef.current = false; // allow recording for this new session
    setTab('practice');
  }, [practiceMode, words, phrases, showToast, showArabicFirst]);

  const handleWrong = () => {
    const source = practiceMode === 'words' ? words : phrases;
    const filtered = source.filter(i => i.translation);
    const q = buildQueue(filtered);
    setPracticeQueue(q);
    setPracticeTotal(q.length);
    setPracticeIdx(0);
    setShowingArabic(true);
  };

  const handleCorrect = () => {
    const newIdx = practiceIdx + 1;
    setPracticeIdx(newIdx);
    setShowingArabic(showArabicFirst);

    // Record SRS attempt when the final card is answered correctly
    const justWon = newIdx >= practiceTotal && practiceTotal > 0;
    if (justWon && !practiceAttemptRecordedRef.current && activeListId) {
      practiceAttemptRecordedRef.current = true;

      if (currentSrsAttempts.length >= 5) {
        showToast('All 5 sessions complete! 🎉');
        return;
      }

      const newAttempts = [...currentSrsAttempts, new Date().toISOString()];
      const sessionNum = newAttempts.length; // 1-based session number
      const NEXT_DAYS = [0, 1, 3, 7, 14];   // days until next session (index = sessionNum)

      // Save synchronously in the background — update local state immediately
      setCurrentSrsAttempts(newAttempts);
      setLists(prev => prev.map(l =>
        l.id === activeListId ? { ...l, srs_attempts: newAttempts } : l
      ));
      saveVocabularyList({
        id: activeListId, student_id: studentId, name: listName,
        words, phrases, srs_attempts: newAttempts,
      }).catch(err => console.error('SRS save error:', err));

      if (sessionNum >= 5) {
        showToast('All 5 sessions complete! 🎉');
      } else {
        const d = NEXT_DAYS[sessionNum];
        showToast(`Session ${sessionNum} recorded — next review in ${d} day${d !== 1 ? 's' : ''}`);
      }
    }
  };

  // ─── timer controls ────────────────────────────────────────────────────────

  const timerToggle = () => {
    if (timerSecondsLeft === 0) return;
    setTimerRunning(r => !r);
  };

  const timerReset = () => {
    setTimerRunning(false);
    setTimerSecondsLeft(timerMinutes * 60);
    setShowAlarm(false);
  };

  // ─── computed display ──────────────────────────────────────────────────────

  let displayedWords = words;
  if (wordCatFilter !== 'all') displayedWords = displayedWords.filter(w => w.category === wordCatFilter);
  if (wordSearch) displayedWords = displayedWords.filter(w =>
    w.text.includes(wordSearch) ||
    w.translation.toLowerCase().includes(wordSearch.toLowerCase()) ||
    (w.transliteration ?? '').toLowerCase().includes(wordSearch.toLowerCase())
  );
  if (wordSort === 'az') displayedWords = [...displayedWords].sort((a, b) => a.text.localeCompare(b.text, 'ar'));
  else if (wordSort === 'priority') displayedWords = [...displayedWords].sort((a, b) => b.clicks - a.clicks);

  let displayedPhrases = phrases;
  if (phraseSearch) displayedPhrases = displayedPhrases.filter(p =>
    p.text.includes(phraseSearch) || p.translation.toLowerCase().includes(phraseSearch.toLowerCase())
  );
  if (phraseFilter === 'red') displayedPhrases = displayedPhrases.filter(p => p.clicks === 2);
  else if (phraseFilter === 'yellow') displayedPhrases = displayedPhrases.filter(p => p.clicks === 1);
  else if (phraseFilter === 'any') displayedPhrases = displayedPhrases.filter(p => p.clicks > 0);

  const currentCard = practiceQueue[practiceIdx];
  const practiceWon = practiceIdx >= practiceTotal && practiceTotal > 0;

  // ─── grammar phrase chars ─────────────────────────────────────────────────
  const grammarPhrase = grammarPhraseIdx !== null ? phrases[grammarPhraseIdx] : null;
  const getCharColor = (charIdx: number): string => {
    if (!grammarPhrase) return '';
    const inSel = gsSelection.includes(charIdx);
    if (inSel) return 'bg-teal-200 dark:bg-teal-700';
    for (const note of grammarPhrase.grammarNotes) {
      if (note.indices.includes(charIdx)) {
        return note.needsStudy
          ? 'bg-amber-200 text-amber-900 dark:bg-amber-700 dark:text-amber-100'
          : 'bg-red-200 text-red-900 dark:bg-red-700 dark:text-red-100';
      }
    }
    return '';
  };

  // ─── shared pill badge style ───────────────────────────────────────────────
  const pillBadge = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-semibold transition-all ${
      active
        ? 'bg-teal-600 dark:bg-orange-500 text-white shadow-sm'
        : 'border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-teal-400 dark:hover:border-orange-400 hover:text-teal-600 dark:hover:text-orange-400 bg-white dark:bg-gray-800'
    }`;

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 dark:text-slate-500 gap-2">
        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm">Loading vocabulary…</span>
      </div>
    );
  }

  return (
    <div className="vocab-reading-mode max-w-4xl mx-auto space-y-3">

      {/* ═══════════════ OVERLAYS ═══════════════ */}

      {/* Alarm */}
      {showAlarm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAlarm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-10 text-center max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-4">⏰</div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">Time's up!</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Great study session. Take a break!</p>
            <button
              onClick={() => { setShowAlarm(false); timerReset(); }}
              className="px-8 py-2.5 bg-teal-600 dark:bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Save modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-4">
              {listName ? 'Rename list' : 'Save list'}
            </h3>
            <input
              value={saveModalInput}
              onChange={e => setSaveModalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="e.g. Chapter 3 vocabulary"
              autoFocus
              className="vocab-input w-full px-4 py-2.5 border border-slate-200 dark:border-gray-600 rounded-xl bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-orange-500 text-sm mb-4 transition"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 text-sm bg-teal-600 dark:bg-orange-500 text-white rounded-xl font-semibold hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grammar modal */}
      {grammarPhraseIdx !== null && grammarPhrase && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeGrammar}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-gray-700">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Grammar Study</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Click and drag to select characters</p>
              </div>
              <button
                onClick={closeGrammar}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-600 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div
                className="text-right select-none p-4 bg-slate-50 dark:bg-gray-700/60 rounded-2xl leading-loose border border-slate-100 dark:border-gray-600"
                style={{ fontFamily: 'Amiri, serif', fontSize: '1.75rem', direction: 'rtl' }}
                onMouseLeave={() => setIsDragging(false)}
                onMouseUp={handleCharMouseUp}
              >
                {grammarPhrase.text.split('').map((ch, i) => (
                  <span
                    key={i}
                    className={`cursor-pointer rounded-sm px-px transition-colors ${getCharColor(i)}`}
                    onMouseDown={() => handleCharMouseDown(i)}
                    onMouseEnter={() => handleCharMouseEnter(i)}
                  >
                    {ch}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                <input
                  value={gsNoteInput}
                  onChange={e => setGsNoteInput(e.target.value)}
                  placeholder="Add a grammar note (optional)…"
                  className="vocab-input w-full px-3 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-xl bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => addGrammarNote(false)}
                    disabled={gsSelection.length === 0}
                    className="flex-1 py-2 text-sm font-semibold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-700 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    Add note
                  </button>
                  <button
                    onClick={() => addGrammarNote(true)}
                    disabled={gsSelection.length === 0}
                    className="flex-1 py-2 text-sm font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    ? Needs study
                  </button>
                </div>
              </div>
              {grammarPhrase.grammarNotes.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Annotations</p>
                  {grammarPhrase.grammarNotes.map(note => (
                    <div
                      key={note.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                        note.needsStudy
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                          : 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <span
                        className={`font-semibold flex-shrink-0 ${note.needsStudy ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}
                        style={{ fontFamily: 'Amiri, serif', fontSize: '1.1rem', direction: 'rtl' }}
                      >
                        {note.indices.map(i => grammarPhrase.text[i]).join('')}
                      </span>
                      <div className="flex-1 min-w-0">
                        {note.note && <p className="text-slate-700 dark:text-slate-200">{note.note}</p>}
                        {note.needsStudy && (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Needs study</span>
                        )}
                      </div>
                      <button
                        onClick={() => deleteGrammarNote(grammarPhraseIdx, note.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition flex-shrink-0"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
        <div className="bg-gray-900 dark:bg-gray-700 text-white text-sm px-5 py-2.5 rounded-full shadow-xl whitespace-nowrap">
          {toast}
        </div>
      </div>

      {/* ═══════════════ TOP CONTROLS ═══════════════ */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">

          {/* List badges */}
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {lists.length === 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 italic">No lists yet — create one</span>
            )}
            {lists.map(list => (
              <div key={list.id} className="relative group/chip">
                <button
                  onClick={() => loadList(list)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 ${
                    activeListId === list.id
                      ? 'bg-teal-600 dark:bg-orange-500 text-white shadow-sm pr-6'
                      : 'border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:border-teal-400 dark:hover:border-orange-400 hover:text-teal-600 dark:hover:text-orange-400'
                  }`}
                >
                  {list.name}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteList(list); }}
                  className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white transition-all duration-150 opacity-0 group-hover/chip:opacity-100 ${
                    activeListId === list.id ? 'bg-teal-800 dark:bg-orange-700' : 'bg-slate-400 dark:bg-gray-500 hover:bg-red-500 dark:hover:bg-red-500'
                  }`}
                  title={`Delete "${list.name}"`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-2.5 h-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              onClick={newList}
              className="rounded-full px-3 py-1 text-xs font-semibold border border-dashed border-slate-300 dark:border-gray-500 text-slate-400 dark:text-slate-500 hover:border-teal-400 dark:hover:border-orange-400 hover:text-teal-500 dark:hover:text-orange-400 transition-colors"
            >
              + New
            </button>
          </div>

          {/* Save button */}
          <button
            onClick={openSaveModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-teal-600 dark:bg-orange-500 text-white hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors shadow-sm flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
            {listName ? 'Save' : 'Save list'}
          </button>

          {/* Timer */}
          <div className="flex items-center gap-1.5 flex-shrink-0 border-l border-slate-200 dark:border-gray-600 pl-3">
            <span className={`font-mono text-sm font-bold tabular-nums w-11 text-right transition-colors ${
              timerSecondsLeft < 60 && timerRunning ? 'text-red-500' : timerRunning ? 'text-teal-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300'
            }`}>
              {fmt(timerSecondsLeft)}
            </span>
            <input
              type="number" min={1} max={120} value={timerMinutes}
              onChange={e => {
                const v = Math.max(1, Math.min(120, Number(e.target.value)));
                setTimerMinutes(v);
                if (!timerRunning) setTimerSecondsLeft(v * 60);
              }}
              className="vocab-input w-10 text-center text-xs py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              title="Minutes"
            />
            <button
              onClick={timerToggle}
              className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                timerRunning ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 hover:bg-orange-200' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 hover:bg-teal-200'
              }`}
              title={timerRunning ? 'Pause' : 'Start'}
            >
              {timerRunning ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <button onClick={timerReset} title="Reset timer" className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════ TAB BAR ═══════════════ */}
      <div className="flex bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden">
        {(['words', 'phrases', 'practice'] as const).map((t, i) => (
          <button
            key={t}
            onClick={() => t === 'practice' ? startPractice() : setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all ${
              i > 0 ? 'border-l border-slate-100 dark:border-gray-700' : ''
            } ${
              tab === t
                ? 'bg-teal-600 dark:bg-orange-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-gray-700 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <span className="capitalize">{t}</span>
            {t !== 'practice' && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400'
              }`}>
                {t === 'words' ? words.length : phrases.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════ WORDS TAB ═══════════════ */}
      {tab === 'words' && (
        <div className="space-y-3">

          {/* Add card */}
          <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Add words</p>
            <div className="flex gap-2 items-start">
              <textarea
                value={wordInput}
                onChange={e => setWordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addWords(); } }}
                placeholder="أضف كلمة أو عدة كلمات…"
                rows={2}
                dir="rtl"
                style={{ fontFamily: 'Amiri, serif', fontSize: '1.25rem' }}
                className="vocab-input flex-1 min-w-0 px-3 py-2 border border-slate-200 dark:border-gray-600 rounded-xl bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-orange-500 resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 transition"
              />
              <button
                onClick={addWords}
                className="px-4 py-2 bg-teal-600 dark:bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors flex-shrink-0"
              >
                Add
              </button>
            </div>

            {/* Category pill selector — replaces the old <select> */}
            <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-gray-700">
              <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 mr-0.5">Type:</span>
              {allCats.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCat(c)}
                  className={pillBadge(selectedCat === c)}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
              {/* Inline custom category input */}
              <input
                value={newCatInput}
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomCat()}
                placeholder="+ custom…"
                className="vocab-input w-24 px-2.5 py-1 text-xs border border-dashed border-slate-300 dark:border-gray-500 rounded-full bg-transparent text-slate-500 dark:text-slate-400 focus:outline-none focus:border-teal-400 dark:focus:border-orange-400 placeholder:text-slate-300 dark:placeholder:text-slate-600 transition"
              />
            </div>
          </div>

          {/* Filters card */}
          <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-3 space-y-2.5">
            {/* Search */}
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                value={wordSearch}
                onChange={e => setWordSearch(e.target.value)}
                placeholder="Search words…"
                className="vocab-input w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-xl bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
              />
            </div>

            {/* Category filter pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 mr-0.5">Filter:</span>
              {['all', ...allCats].map(c => (
                <button key={c} onClick={() => setWordCatFilter(c)} className={pillBadge(wordCatFilter === c)}>
                  {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>

            {/* Sort pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 mr-0.5">Sort:</span>
              {[
                { value: 'default', label: 'Default' },
                { value: 'az', label: 'A → Z' },
                { value: 'priority', label: 'Priority' },
              ].map(s => (
                <button key={s.value} onClick={() => setWordSort(s.value)} className={pillBadge(wordSort === s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Words table */}
          {displayedWords.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <p className="text-sm">{words.length === 0 ? 'No words yet — add some above.' : 'No words match this filter.'}</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              {/* Legend */}
              <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-700/50">
                <span className="text-xs text-slate-400 dark:text-slate-500">Priority — click badge to cycle:</span>
                {[0, 1, 2].map(c => (
                  <span key={c} className={`text-xs px-2 py-0.5 rounded-full font-semibold ${clickBadge(c)}`}>
                    {clickLabel(c)}
                  </span>
                ))}
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">· Category — click to cycle</span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-gray-700">
                    <th className="w-14 px-3 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 text-left">Pri.</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 text-right">Word</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 text-left">Translation</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 text-left hidden md:table-cell">Transliteration</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-500 text-left hidden sm:table-cell">Category</th>
                    <th className="w-8 px-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-700/60">
                  {displayedWords.map((word, wi) => (
                    <tr
                      key={word.id}
                      className={`group/row transition-colors hover:bg-slate-50 dark:hover:bg-gray-700/40 ${clickColor(word.clicks)}`}
                    >
                      {/* Priority badge */}
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => cycleWordClicks(word.id)}
                          className={`text-xs px-2 py-0.5 rounded-full font-bold cursor-pointer transition-all hover:scale-105 ${clickBadge(word.clicks)}`}
                          title="Click to cycle priority"
                        >
                          {clickLabel(word.clicks)}
                        </button>
                      </td>

                      {/* Arabic word */}
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className="text-slate-800 dark:text-slate-100"
                          style={{ fontFamily: 'Amiri, serif', fontSize: '1.35rem' }}
                          dir="rtl"
                        >
                          {word.text}
                        </span>
                      </td>

                      {/* Translation — Enter moves to transliteration */}
                      <td className="px-3 py-2.5">
                        <input
                          id={`translation-${word.id}`}
                          value={word.translation}
                          onChange={e => updateWordTranslation(word.id, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              document.getElementById(`transliteration-${word.id}`)?.focus();
                            }
                          }}
                          placeholder="Translation…"
                          className="vocab-input w-full px-2 py-1 text-sm border border-transparent hover:border-slate-200 dark:hover:border-gray-600 focus:border-teal-400 dark:focus:border-teal-500 rounded-lg bg-transparent focus:bg-white dark:focus:bg-gray-700 text-slate-700 dark:text-slate-200 focus:outline-none transition placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        />
                      </td>

                      {/* Transliteration — Enter moves to next word's translation */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <input
                          id={`transliteration-${word.id}`}
                          value={word.transliteration ?? ''}
                          onChange={e => updateWordTransliteration(word.id, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const next = displayedWords[wi + 1];
                              if (next) document.getElementById(`translation-${next.id}`)?.focus();
                            }
                          }}
                          placeholder="e.g. kitāb…"
                          className="vocab-input w-full px-2 py-1 text-sm border border-transparent hover:border-slate-200 dark:hover:border-gray-600 focus:border-teal-400 dark:focus:border-teal-500 rounded-lg bg-transparent focus:bg-white dark:focus:bg-gray-700 text-slate-500 dark:text-slate-400 focus:outline-none transition placeholder:text-slate-300 dark:placeholder:text-slate-600 italic"
                        />
                      </td>

                      {/* Category — click badge to cycle */}
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <button
                          onClick={() => cycleWordCategory(word.id)}
                          title="Click to change category"
                          className="text-xs px-2.5 py-0.5 rounded-full font-semibold capitalize transition-all hover:scale-105 bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 hover:text-teal-700 dark:hover:text-teal-300"
                        >
                          {word.category}
                        </button>
                      </td>

                      {/* Delete */}
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => removeWord(word.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-full opacity-0 group-hover/row:opacity-100 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="px-4 py-2.5 border-t border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-700/50">
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {displayedWords.length} word{displayedWords.length !== 1 ? 's' : ''}
                  {words.length !== displayedWords.length ? ` shown of ${words.length}` : ''}
                  {' · '}
                  {words.reduce((s, w) => s + w.clicks + 1, 0)} rep{words.reduce((s, w) => s + w.clicks + 1, 0) !== 1 ? 's' : ''} in practice
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ PHRASES TAB ═══════════════ */}
      {tab === 'phrases' && (
        <div className="space-y-3">
          {/* Add card */}
          <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Add phrases</p>
            <div className="flex gap-2 items-start">
              <textarea
                value={phraseInput}
                onChange={e => setPhraseInput(e.target.value)}
                placeholder="أضف جملة… (سطر جديد = عبارة جديدة)"
                rows={3}
                dir="rtl"
                style={{ fontFamily: 'Amiri, serif', fontSize: '1.25rem' }}
                className="vocab-input flex-1 px-3 py-2 border border-slate-200 dark:border-gray-600 rounded-xl bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 transition"
              />
              <button
                onClick={addPhrases}
                className="self-end px-4 py-2 bg-teal-600 dark:bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors flex-shrink-0"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Each line becomes a separate phrase.</p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                value={phraseSearch}
                onChange={e => setPhraseSearch(e.target.value)}
                placeholder="Search phrases…"
                className="vocab-input w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 transition"
              />
            </div>
            {(['all', 'any', 'yellow', 'red'] as const).map(f => (
              <button
                key={f}
                onClick={() => setPhraseFilter(f)}
                className={pillBadge(phraseFilter === f)}
              >
                {f === 'all' ? 'All' : f === 'any' ? 'Has priority' : f === 'yellow' ? '×2 priority' : '×3 priority'}
              </button>
            ))}
          </div>

          {/* Phrases */}
          {displayedPhrases.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <p className="text-sm">{phrases.length === 0 ? 'No phrases yet — add some above.' : 'No phrases match this filter.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedPhrases.map(phrase => {
                const realIdx = phrases.indexOf(phrase);
                const hasNotes = phrase.grammarNotes.length > 0;
                return (
                  <div
                    key={phrase.id}
                    className={`bg-white dark:bg-gray-800 border rounded-2xl overflow-hidden transition-colors ${
                      phrase.clicks === 2
                        ? 'border-red-200 dark:border-red-800/60'
                        : phrase.clicks === 1
                        ? 'border-yellow-200 dark:border-yellow-700/60'
                        : 'border-slate-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <button
                        onClick={() => cyclePhraseClicks(phrase.id)}
                        className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 mt-2 cursor-pointer hover:scale-105 transition-all ${clickBadge(phrase.clicks)}`}
                        title="Click to cycle priority"
                      >
                        {clickLabel(phrase.clicks)}
                      </button>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p
                          className="text-right leading-relaxed text-slate-800 dark:text-slate-100"
                          style={{ fontFamily: 'Amiri, serif', fontSize: '1.45rem', direction: 'rtl' }}
                        >
                          {phrase.text}
                        </p>
                        <input
                          value={phrase.translation}
                          onChange={e => updatePhraseTranslation(phrase.id, e.target.value)}
                          placeholder="Translation…"
                          className="vocab-input w-full px-2 py-1 text-sm border border-transparent hover:border-slate-200 dark:hover:border-gray-600 focus:border-teal-400 dark:focus:border-teal-500 rounded-lg bg-transparent focus:bg-white dark:focus:bg-gray-700 text-slate-600 dark:text-slate-300 focus:outline-none transition placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 flex-shrink-0 items-end">
                        <button
                          onClick={() => openGrammar(realIdx)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                            hasNotes
                              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                              : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-300'
                          }`}
                        >
                          {hasNotes ? `✎ ${phrase.grammarNotes.length}` : '✎ Study'}
                        </button>
                        <button
                          onClick={() => removePhrase(phrase.id)}
                          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {hasNotes && (
                      <div className="px-4 pb-3 flex flex-wrap gap-1">
                        {phrase.grammarNotes.map(note => (
                          <span
                            key={note.id}
                            className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${
                              note.needsStudy
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            <span style={{ fontFamily: 'Amiri, serif' }}>
                              {phrase.text.split('').filter((_, i) => note.indices.includes(i)).join('')}
                            </span>
                            {note.note && <span className="opacity-70">: {note.note}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ PRACTICE TAB ═══════════════ */}
      {tab === 'practice' && (
        <div className="space-y-4">
          {/* Mode pills */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mode:</span>
            {(['words', 'phrases'] as const).map(m => (
              <button
                key={m}
                onClick={() => setPracticeMode(m)}
                className={pillBadge(practiceMode === m)}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
            <button
              onClick={startPractice}
              className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Reshuffle
            </button>
          </div>

          {practiceWon ? (
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl p-12 text-center">
              <div className="text-5xl mb-4">✦</div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">أحسنت!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">You completed all {practiceTotal} cards.</p>
              <button
                onClick={startPractice}
                className="px-8 py-3 bg-teal-600 dark:bg-orange-500 text-white rounded-full font-semibold hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors"
              >
                Practice again
              </button>
            </div>
          ) : practiceQueue.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl p-12 text-center">
              <div className="text-4xl mb-4 text-slate-300 dark:text-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-14 h-14 mx-auto">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 3.741-1.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
                </svg>
              </div>
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
                Add {practiceMode} with translations, then start practicing.
              </p>
              <button
                onClick={startPractice}
                className="px-6 py-2.5 bg-teal-600 dark:bg-orange-500 text-white rounded-full font-semibold text-sm hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors"
              >
                Start
              </button>
            </div>
          ) : currentCard ? (
            <div className="space-y-4">
              {/* Progress */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 dark:bg-orange-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(practiceIdx / practiceTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-400 dark:text-slate-500 tabular-nums flex-shrink-0">
                  {practiceIdx} / {practiceTotal}
                </span>
              </div>

              {/* Flashcard */}
              <div
                className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl p-8 sm:p-12 flex flex-col items-center justify-center min-h-[260px] cursor-pointer select-none group/card hover:border-teal-300 dark:hover:border-orange-500 transition-colors"
                onClick={() => setShowingArabic(a => !a)}
              >
                {showingArabic ? (
                  <p
                    className="text-slate-800 dark:text-slate-100 text-center leading-loose"
                    style={{ fontFamily: 'Amiri, serif', fontSize: 'clamp(2rem, 5vw, 3rem)', direction: 'rtl' }}
                  >
                    {currentCard.text}
                  </p>
                ) : (
                  <p className="text-xl sm:text-2xl text-slate-700 dark:text-slate-200 font-medium text-center">
                    {currentCard.translation || '(no translation)'}
                  </p>
                )}
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-6 group-hover/card:text-slate-400 dark:group-hover/card:text-slate-500 transition-colors">
                  {showingArabic ? 'tap to reveal translation' : 'tap to show Arabic'}
                </p>
              </div>

              {/* Controls */}
              <div className="flex gap-3">
                <button
                  onClick={handleWrong}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-base bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                >
                  ✗  Wrong
                </button>
                <button
                  onClick={handleCorrect}
                  className="flex-1 py-3.5 rounded-2xl font-bold text-base bg-teal-600 dark:bg-orange-500 text-white hover:bg-teal-700 dark:hover:bg-orange-600 transition-colors shadow-sm"
                >
                  ✓  Correct
                </button>
              </div>
              <div className="text-center">
                <button
                  onClick={() => {
                    // Flip current card AND set session-wide preference
                    const next = !showingArabic;
                    setShowingArabic(next);
                    setShowArabicFirst(next);
                  }}
                  className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors underline underline-offset-2"
                >
                  {showingArabic ? 'Show translation first for all cards' : 'Show Arabic first for all cards'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default VocabularyPracticePage;
