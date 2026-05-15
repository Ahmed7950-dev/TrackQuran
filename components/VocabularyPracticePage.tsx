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
      saveVocabularyList({ id: activeListId, student_id: studentId, name: listName, words, phrases });
      setIsDirty(false);
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [isDirty, activeListId, listName, words, phrases, studentId]);

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

  // ─── helpers ───────────────────────────────────────────────────────────────

  const loadList = (list: VocabList) => {
    setActiveListId(list.id);
    setWords(list.words ?? []);
    setPhrases(list.phrases ?? []);
    setListName(list.name);
    setIsDirty(false);
    setTab('words');
  };

  const newList = () => {
    const id = crypto.randomUUID();
    setActiveListId(id);
    setWords([]);
    setPhrases([]);
    setListName('');
    setIsDirty(false);
    setTab('words');
    showToast('New list started — save it when ready');
  };

  const openSaveModal = () => {
    setSaveModalInput(listName);
    setShowSaveModal(true);
  };

  const handleSave = async () => {
    const name = saveModalInput.trim();
    if (!name) return;
    if (!activeListId) return;
    setListName(name);
    await saveVocabularyList({ id: activeListId, student_id: studentId, name, words, phrases });
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
      id: crypto.randomUUID(), text: t, translation: '', clicks: 0, category: selectedCat,
    }));
    setWords(prev => { const next = [...prev, ...newWords]; return next; });
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

  const updateWordCategory = (id: string, cat: string) => {
    setWords(prev => prev.map(w => w.id === id ? { ...w, category: cat } : w));
    setIsDirty(true);
  };

  const removeWord = (id: string) => {
    setWords(prev => prev.filter(w => w.id !== id));
    setIsDirty(true);
  };

  const allCats = [...CATEGORIES, ...customCats];

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
    setShowingArabic(true);
    setTab('practice');
  }, [practiceMode, words, phrases, showToast]);

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
    setPracticeIdx(i => i + 1);
    setShowingArabic(true);
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
  if (wordSearch) displayedWords = displayedWords.filter(w => w.text.includes(wordSearch) || w.translation.toLowerCase().includes(wordSearch.toLowerCase()));
  if (wordSort === 'az') displayedWords = [...displayedWords].sort((a, b) => a.text.localeCompare(b.text, 'ar'));
  else if (wordSort === 'priority') displayedWords = [...displayedWords].sort((a, b) => b.clicks - a.clicks);

  let displayedPhrases = phrases;
  if (phraseSearch) displayedPhrases = displayedPhrases.filter(p => p.text.includes(phraseSearch) || p.translation.toLowerCase().includes(phraseSearch.toLowerCase()));
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

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <svg className="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Loading vocabulary…
      </div>
    );
  }

  return (
    <div className="vocab-reading-mode">

      {/* ── Alarm overlay ── */}
      {showAlarm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowAlarm(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-5xl mb-4">⏰</p>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Time's up!</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-6">Your study session is complete.</p>
            <button onClick={() => setShowAlarm(false)} className="px-6 py-2 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition">OK</button>
          </div>
        </div>
      )}

      {/* ── Save modal ── */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowSaveModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Save List</h3>
            <input
              value={saveModalInput}
              onChange={e => setSaveModalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="List name…"
              autoFocus
              className="vocab-input w-full px-4 py-2 border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-xl transition">Cancel</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Grammar modal ── */}
      {grammarPhraseIdx !== null && grammarPhrase && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={closeGrammar}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-gray-700">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Grammar Study</h3>
              <button onClick={closeGrammar} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Phrase chars */}
              <p className="text-xs text-slate-500 dark:text-slate-400">Click and drag to select characters, then add a note.</p>
              <div
                className="text-right select-none p-3 bg-slate-50 dark:bg-gray-700 rounded-xl leading-loose"
                style={{ fontFamily: 'Amiri, serif', fontSize: '1.6rem', direction: 'rtl' }}
                onMouseLeave={() => setIsDragging(false)}
                onMouseUp={handleCharMouseUp}
              >
                {grammarPhrase.text.split('').map((ch, i) => (
                  <span
                    key={i}
                    className={`cursor-pointer rounded px-0.5 transition-colors ${getCharColor(i)}`}
                    onMouseDown={() => handleCharMouseDown(i)}
                    onMouseEnter={() => handleCharMouseEnter(i)}
                  >
                    {ch}
                  </span>
                ))}
              </div>

              {/* Add note controls */}
              <div className="space-y-2">
                <input
                  value={gsNoteInput}
                  onChange={e => setGsNoteInput(e.target.value)}
                  placeholder="Note text (optional)…"
                  className="vocab-input w-full px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => addGrammarNote(false)}
                    disabled={gsSelection.length === 0}
                    className="flex-1 px-3 py-2 text-sm bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-xl font-semibold hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-40 transition"
                  >
                    Add note
                  </button>
                  <button
                    onClick={() => addGrammarNote(true)}
                    disabled={gsSelection.length === 0}
                    className="flex-1 px-3 py-2 text-sm bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded-xl font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/60 disabled:opacity-40 transition"
                  >
                    ? Needs study
                  </button>
                </div>
              </div>

              {/* Existing notes */}
              {grammarPhrase.grammarNotes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Notes</p>
                  {grammarPhrase.grammarNotes.map(note => (
                    <div key={note.id} className={`flex items-start gap-2 p-2 rounded-xl text-sm ${note.needsStudy ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium" style={{ fontFamily: 'Amiri, serif', direction: 'rtl' }}>
                          {note.indices.map(i => grammarPhrase.text[i]).join('')}
                        </p>
                        {note.note && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{note.note}</p>}
                        {note.needsStudy && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Needs study</span>}
                      </div>
                      <button onClick={() => deleteGrammarNote(grammarPhraseIdx, note.id)} className="text-slate-400 hover:text-red-500 flex-shrink-0 transition">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
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

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── Lists bar ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-3 mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mr-1">Lists:</span>
        {lists.map(list => (
          <div key={list.id} className="flex items-center gap-1 group">
            <button
              onClick={() => loadList(list)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                activeListId === list.id
                  ? 'bg-teal-600 dark:bg-orange-600 text-white'
                  : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-gray-600'
              }`}
            >
              {list.name}
            </button>
            <button
              onClick={() => handleDeleteList(list)}
              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity"
              title="Delete list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          onClick={newList}
          className="px-3 py-1.5 text-sm rounded-lg font-medium bg-slate-100 dark:bg-gray-700 text-teal-600 dark:text-orange-400 hover:bg-teal-50 dark:hover:bg-gray-600 border border-dashed border-teal-300 dark:border-orange-700 transition-colors"
        >
          + New list
        </button>

        {/* Timer — pushed to the right */}
        <div className="ml-auto flex items-center gap-2">
          <span className={`font-mono text-sm font-bold ${timerSecondsLeft === 0 ? 'text-red-500' : 'text-slate-700 dark:text-slate-200'}`}>
            {fmt(timerSecondsLeft)}
          </span>
          <input
            type="number"
            min={1}
            max={120}
            value={timerMinutes}
            onChange={e => { const v = Math.max(1, Math.min(120, Number(e.target.value))); setTimerMinutes(v); if (!timerRunning) setTimerSecondsLeft(v * 60); }}
            className="vocab-input w-12 text-center text-xs border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 py-1"
            title="Minutes"
          />
          <button onClick={timerToggle} className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition ${timerRunning ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' : 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'}`}>
            {timerRunning ? 'Pause' : 'Start'}
          </button>
          <button onClick={timerReset} className="px-2.5 py-1 text-xs rounded-lg font-semibold bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-600 transition">
            Reset
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 mb-3 flex items-center">
        {(['words', 'phrases', 'practice'] as const).map(t => (
          <button
            key={t}
            onClick={() => t === 'practice' ? startPractice() : setTab(t)}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors capitalize ${
              tab === t
                ? 'text-teal-600 dark:text-orange-400 border-b-2 border-teal-600 dark:border-orange-400'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t === 'words' ? `Words (${words.length})` : t === 'phrases' ? `Phrases (${phrases.length})` : 'Practice'}
          </button>
        ))}
        <div className="px-3 flex-shrink-0">
          <button
            onClick={openSaveModal}
            className="px-4 py-1.5 text-sm bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-lg hover:bg-teal-700 dark:hover:bg-orange-700 transition"
          >
            {listName ? `Save "${listName}"` : 'Save'}
          </button>
        </div>
      </div>

      {/* ── WORDS TAB ── */}
      {tab === 'words' && (
        <div className="space-y-3">
          {/* Add words */}
          <div className="vocab-card bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Add Arabic Words</h3>
            <div className="flex gap-2 flex-wrap">
              <textarea
                value={wordInput}
                onChange={e => setWordInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addWords(); } }}
                placeholder="Type Arabic words (space or newline separated)…"
                rows={2}
                dir="rtl"
                style={{ fontFamily: 'Amiri, serif' }}
                className="vocab-input flex-1 min-w-0 px-3 py-2 text-xl border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <div className="flex flex-col gap-2">
                <select
                  value={selectedCat}
                  onChange={e => setSelectedCat(e.target.value)}
                  className="vocab-input px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {allCats.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <button
                  onClick={addWords}
                  className="px-4 py-2 bg-teal-600 dark:bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 dark:hover:bg-orange-700 transition"
                >
                  Add
                </button>
              </div>
            </div>
            {/* Custom category */}
            <div className="flex gap-2 mt-3">
              <input
                value={newCatInput}
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomCat()}
                placeholder="New category name…"
                className="vocab-input flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button onClick={addCustomCat} className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition">+ Category</button>
            </div>
          </div>

          {/* Search / filter / sort */}
          <div className="flex flex-wrap gap-2">
            <input
              value={wordSearch}
              onChange={e => setWordSearch(e.target.value)}
              placeholder="Search words…"
              className="vocab-input flex-1 min-w-[140px] px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <select
              value={wordCatFilter}
              onChange={e => setWordCatFilter(e.target.value)}
              className="vocab-input px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All categories</option>
              {allCats.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <select
              value={wordSort}
              onChange={e => setWordSort(e.target.value)}
              className="vocab-input px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="default">Default order</option>
              <option value="az">A → Z</option>
              <option value="priority">Priority first</option>
            </select>
          </div>

          {/* Words table */}
          {displayedWords.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm">No words yet. Add some above!</p>
            </div>
          ) : (
            <div className="vocab-card bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-gray-700">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Priority</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Word</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Translation</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide hidden sm:table-cell">Category</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-gray-700">
                  {displayedWords.map(word => (
                    <tr key={word.id} className={`vocab-table-row transition-colors hover:bg-slate-50 dark:hover:bg-gray-750 ${clickColor(word.clicks)}`}>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => cycleWordClicks(word.id)}
                          className={`text-xs px-2 py-0.5 rounded-full font-bold cursor-pointer transition ${clickBadge(word.clicks)}`}
                          title="Click to cycle priority"
                        >
                          {clickLabel(word.clicks)}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span style={{ fontFamily: 'Amiri, serif', fontSize: '1.3rem' }} className="text-slate-800 dark:text-slate-100" dir="rtl">
                          {word.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={word.translation}
                          onChange={e => updateWordTranslation(word.id, e.target.value)}
                          placeholder="Translation…"
                          className="vocab-input w-full px-2 py-1 text-sm border border-transparent hover:border-slate-300 dark:hover:border-gray-600 focus:border-teal-400 dark:focus:border-teal-500 rounded-lg bg-transparent focus:bg-white dark:focus:bg-gray-700 text-slate-700 dark:text-slate-200 focus:outline-none transition"
                        />
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <select
                          value={word.category}
                          onChange={e => updateWordCategory(word.id, e.target.value)}
                          className="vocab-input text-xs px-2 py-1 border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          {allCats.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-3">
                        <button onClick={() => removeWord(word.id)} className="text-slate-300 hover:text-red-400 transition">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── PHRASES TAB ── */}
      {tab === 'phrases' && (
        <div className="space-y-3">
          {/* Add phrases */}
          <div className="vocab-card bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Add Arabic Phrases</h3>
            <div className="flex gap-2">
              <textarea
                value={phraseInput}
                onChange={e => setPhraseInput(e.target.value)}
                placeholder="One phrase per line…"
                rows={3}
                dir="rtl"
                style={{ fontFamily: 'Amiri, serif' }}
                className="vocab-input flex-1 px-3 py-2 text-xl border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <button
                onClick={addPhrases}
                className="self-end px-4 py-2 bg-teal-600 dark:bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 dark:hover:bg-orange-700 transition"
              >
                Add
              </button>
            </div>
          </div>

          {/* Search / filter */}
          <div className="flex flex-wrap gap-2">
            <input
              value={phraseSearch}
              onChange={e => setPhraseSearch(e.target.value)}
              placeholder="Search phrases…"
              className="vocab-input flex-1 min-w-[140px] px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {(['all', 'any', 'yellow', 'red'] as const).map(f => (
              <button
                key={f}
                onClick={() => setPhraseFilter(f)}
                className={`px-3 py-2 text-xs font-semibold rounded-xl transition ${phraseFilter === f ? 'bg-teal-600 dark:bg-orange-600 text-white' : 'bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-teal-400 dark:hover:border-orange-400'}`}
              >
                {f === 'all' ? 'All' : f === 'any' ? 'Priority' : f === 'yellow' ? 'Practice more' : 'Practice most'}
              </button>
            ))}
          </div>

          {/* Phrases list */}
          {displayedPhrases.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <p className="text-3xl mb-2">💬</p>
              <p className="text-sm">No phrases yet. Add some above!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedPhrases.map((phrase, idx) => {
                const realIdx = phrases.indexOf(phrase);
                return (
                  <div key={phrase.id} className={`vocab-card bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 p-3 ${clickColor(phrase.clicks)}`}>
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => cyclePhraseClicks(phrase.id)}
                        className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 mt-1 transition ${clickBadge(phrase.clicks)}`}
                        title="Click to cycle priority"
                      >
                        {clickLabel(phrase.clicks)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-right mb-1" style={{ fontFamily: 'Amiri, serif', fontSize: '1.4rem', direction: 'rtl' }}>
                          {phrase.text}
                        </p>
                        <input
                          value={phrase.translation}
                          onChange={e => updatePhraseTranslation(phrase.id, e.target.value)}
                          placeholder="Translation…"
                          className="vocab-input w-full px-2 py-1 text-sm border border-transparent hover:border-slate-300 dark:hover:border-gray-600 focus:border-teal-400 dark:focus:border-teal-500 rounded-lg bg-transparent focus:bg-white dark:focus:bg-gray-700 text-slate-700 dark:text-slate-200 focus:outline-none transition"
                        />
                      </div>
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => openGrammar(realIdx)}
                          className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 font-semibold transition"
                          title="Open grammar study"
                        >
                          Grammar
                        </button>
                        <button onClick={() => removePhrase(phrase.id)} className="text-slate-300 hover:text-red-400 transition text-center">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 mx-auto">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {/* Grammar note previews */}
                    {phrase.grammarNotes.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {phrase.grammarNotes.map(note => (
                          <span
                            key={note.id}
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${note.needsStudy ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'}`}
                          >
                            {phrase.text.split('').filter((_, i) => note.indices.includes(i)).join('')}
                            {note.note ? `: ${note.note}` : ''}
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

      {/* ── PRACTICE TAB ── */}
      {tab === 'practice' && (
        <div className="space-y-4">
          {/* Mode selector */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-slate-500 dark:text-slate-400">Practice:</span>
            {(['words', 'phrases'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setPracticeMode(m); }}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition capitalize ${practiceMode === m ? 'bg-teal-600 dark:bg-orange-600 text-white' : 'bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-teal-400 dark:hover:border-orange-400'}`}
              >
                {m}
              </button>
            ))}
            <button
              onClick={startPractice}
              className="ml-auto px-4 py-2 text-sm font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 transition"
            >
              Shuffle
            </button>
          </div>

          {practiceWon ? (
            /* ── Win screen ── */
            <div className="vocab-card bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-10 text-center">
              <p className="text-6xl mb-4">🎉</p>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Well done!</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-6">You went through all {practiceTotal} cards.</p>
              <button onClick={startPractice} className="px-6 py-2.5 bg-teal-600 dark:bg-orange-600 text-white rounded-xl font-semibold hover:bg-teal-700 dark:hover:bg-orange-700 transition">Practice again</button>
            </div>
          ) : practiceQueue.length === 0 ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <p className="text-4xl mb-3">📚</p>
              <p className="text-sm">Add some {practiceMode} with translations to start practicing.</p>
              <button onClick={startPractice} className="mt-4 px-6 py-2.5 bg-teal-600 dark:bg-orange-600 text-white rounded-xl font-semibold hover:bg-teal-700 dark:hover:bg-orange-700 transition text-sm">Start</button>
            </div>
          ) : currentCard ? (
            <div className="space-y-4">
              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 dark:bg-orange-500 rounded-full transition-all duration-300"
                    style={{ width: `${(practiceIdx / practiceTotal) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex-shrink-0">{practiceIdx}/{practiceTotal}</span>
              </div>

              {/* Card */}
              <div
                className="vocab-card bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-8 text-center cursor-pointer select-none min-h-[220px] flex flex-col items-center justify-center"
                onClick={() => setShowingArabic(a => !a)}
                title="Click to flip"
              >
                {showingArabic ? (
                  <p style={{ fontFamily: 'Amiri, serif', fontSize: '2.5rem', direction: 'rtl', lineHeight: 1.5 }} className="text-slate-800 dark:text-slate-100">
                    {currentCard.text}
                  </p>
                ) : (
                  <p className="text-xl text-slate-700 dark:text-slate-200 font-medium">{currentCard.translation || '(no translation)'}</p>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">{showingArabic ? 'Click to see translation' : 'Click to see Arabic'}</p>
              </div>

              {/* Toggle & buttons */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setShowingArabic(a => !a)}
                  className="px-4 py-2 text-sm bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-600 font-semibold transition"
                >
                  {showingArabic ? 'Show translation' : 'Show Arabic'}
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleWrong}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-lg rounded-xl transition shadow"
                >
                  ✗ Wrong
                </button>
                <button
                  onClick={handleCorrect}
                  className="flex-1 py-3 bg-teal-500 dark:bg-orange-500 hover:bg-teal-600 dark:hover:bg-orange-600 text-white font-bold text-lg rounded-xl transition shadow"
                >
                  ✓ Correct
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
