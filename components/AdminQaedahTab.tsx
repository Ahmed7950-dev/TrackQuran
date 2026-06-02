import React, { useState, useEffect, useRef } from 'react';
import {
  QaedahTopic,
  QaedahWord,
  listQaedahTopics,
  createQaedahTopic,
  updateQaedahTopic,
  deleteQaedahTopic,
  reorderQaedahTopics,
  listQaedahWords,
  createQaedahWord,
  createQaedahWordsBulk,
  updateQaedahWord,
  deleteQaedahWord,
} from '../services/qaedahService';

const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif" };

// ─── Component ────────────────────────────────────────────────────────────────

const AdminQaedahTab: React.FC = () => {

  // ── Topics state ─────────────────────────────────────────────────────────
  const [topics,        setTopics]        = useState<QaedahTopic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<QaedahTopic | null>(null);

  // Add topic form
  const [newTitleEn, setNewTitleEn] = useState('');
  const [newTitleAr, setNewTitleAr] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);

  // Edit topic inline
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editEn,    setEditEn]    = useState('');
  const [editAr,    setEditAr]    = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete topic confirm
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);

  // ── Words state ───────────────────────────────────────────────────────────
  const [words,        setWords]        = useState<QaedahWord[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);

  // Add single word
  const [newWord,    setNewWord]    = useState('');
  const [addingWord, setAddingWord] = useState(false);

  // Bulk add words (textarea)
  const [bulkText,     setBulkText]     = useState('');
  const [bulkAdding,   setBulkAdding]   = useState(false);
  const [showBulk,     setShowBulk]     = useState(false);

  // Edit word inline
  const [editWordId,   setEditWordId]   = useState<string | null>(null);
  const [editWordText, setEditWordText] = useState('');
  const [savingWord,   setSavingWord]   = useState(false);

  // Delete word confirm
  const [deletingWordId, setDeletingWordId] = useState<string | null>(null);

  const wordInputRef = useRef<HTMLInputElement>(null);

  // ── Load topics ───────────────────────────────────────────────────────────
  const loadTopics = async () => {
    const data = await listQaedahTopics();
    setTopics(data);
    setTopicsLoading(false);
  };

  useEffect(() => { loadTopics(); }, []);

  // ── Load words for selected topic ─────────────────────────────────────────
  const loadWords = async (topicId: string) => {
    setWordsLoading(true);
    const data = await listQaedahWords(topicId);
    setWords(data);
    setWordsLoading(false);
  };

  const handleSelectTopic = (topic: QaedahTopic) => {
    setSelectedTopic(topic);
    setEditId(null);
    setEditWordId(null);
    setNewWord('');
    setBulkText('');
    setShowBulk(false);
    loadWords(topic.id);
  };

  // ── Add topic ─────────────────────────────────────────────────────────────
  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitleEn.trim()) return;
    setAddingTopic(true);
    const created = await createQaedahTopic({ titleEn: newTitleEn.trim(), titleAr: newTitleAr.trim() || undefined });
    if (created) {
      setTopics(prev => [...prev, created]);
      setNewTitleEn('');
      setNewTitleAr('');
    }
    setAddingTopic(false);
  };

  // ── Save edit topic ────────────────────────────────────────────────────────
  const handleSaveEditTopic = async (id: string) => {
    if (!editEn.trim()) return;
    setSavingEdit(true);
    const ok = await updateQaedahTopic(id, { titleEn: editEn.trim(), titleAr: editAr.trim() });
    if (ok) {
      setTopics(prev => prev.map(t => t.id === id ? { ...t, titleEn: editEn.trim(), titleAr: editAr.trim() } : t));
      if (selectedTopic?.id === id) setSelectedTopic(prev => prev ? { ...prev, titleEn: editEn.trim(), titleAr: editAr.trim() } : prev);
    }
    setEditId(null);
    setSavingEdit(false);
  };

  // ── Delete topic ───────────────────────────────────────────────────────────
  const handleDeleteTopic = async (id: string) => {
    const ok = await deleteQaedahTopic(id);
    if (ok) {
      setTopics(prev => prev.filter(t => t.id !== id));
      if (selectedTopic?.id === id) { setSelectedTopic(null); setWords([]); }
    }
    setDeletingTopicId(null);
  };

  // ── Move topic up/down ─────────────────────────────────────────────────────
  const moveTopic = async (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= topics.length) return;
    const reordered = [...topics];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setTopics(reordered);
    await reorderQaedahTopics(reordered);
  };

  // ── Add single word ────────────────────────────────────────────────────────
  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim() || !selectedTopic) return;
    setAddingWord(true);
    const created = await createQaedahWord({ topicId: selectedTopic.id, word: newWord.trim() });
    if (created) {
      setWords(prev => [...prev, created]);
      setNewWord('');
      wordInputRef.current?.focus();
    }
    setAddingWord(false);
  };

  // ── Bulk add words ─────────────────────────────────────────────────────────
  const handleBulkAdd = async () => {
    if (!bulkText.trim() || !selectedTopic) return;
    // Split by newline, comma, or Arabic comma ، — trim & dedupe blanks
    const raw = bulkText.split(/[\n،,]+/).map(w => w.trim()).filter(Boolean);
    if (raw.length === 0) return;
    setBulkAdding(true);
    const count = await createQaedahWordsBulk(selectedTopic.id, raw);
    if (count > 0) {
      await loadWords(selectedTopic.id);
      setBulkText('');
      setShowBulk(false);
    }
    setBulkAdding(false);
  };

  // ── Save edit word ─────────────────────────────────────────────────────────
  const handleSaveEditWord = async (id: string) => {
    if (!editWordText.trim()) return;
    setSavingWord(true);
    const ok = await updateQaedahWord(id, editWordText.trim());
    if (ok) setWords(prev => prev.map(w => w.id === id ? { ...w, word: editWordText.trim() } : w));
    setEditWordId(null);
    setSavingWord(false);
  };

  // ── Delete word ────────────────────────────────────────────────────────────
  const handleDeleteWord = async (id: string) => {
    const ok = await deleteQaedahWord(id);
    if (ok) setWords(prev => prev.filter(w => w.id !== id));
    setDeletingWordId(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:flex-row gap-6">

      {/* ── LEFT: Topics panel ───────────────────────────────────────────────── */}
      <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
        <h2 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
          <span style={HAFS}>القاعدة النورانية</span>
          <span className="text-slate-400 text-sm font-normal">— Lessons</span>
        </h2>

        {/* Add topic form */}
        <form onSubmit={handleAddTopic} className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 space-y-2 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">New Lesson</p>
          <input
            value={newTitleEn}
            onChange={e => setNewTitleEn(e.target.value)}
            placeholder="Title (English) e.g. Short Vowels: Fatha"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <input
            value={newTitleAr}
            onChange={e => setNewTitleAr(e.target.value)}
            placeholder="العنوان بالعربية (اختياري)"
            dir="rtl"
            style={HAFS}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            type="submit"
            disabled={!newTitleEn.trim() || addingTopic}
            className="w-full py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {addingTopic ? 'Adding…' : '+ Add Lesson'}
          </button>
        </form>

        {/* Topics list */}
        {topicsLoading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
        ) : topics.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No lessons yet. Add one above.</div>
        ) : (
          <div className="space-y-1.5">
            {topics.map((topic, idx) => (
              <div
                key={topic.id}
                className={`group rounded-xl border transition-all ${
                  selectedTopic?.id === topic.id
                    ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-600'
                    : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-slate-300'
                }`}
              >
                {editId === topic.id ? (
                  /* Edit form inline */
                  <div className="p-3 space-y-2">
                    <input
                      autoFocus
                      value={editEn}
                      onChange={e => setEditEn(e.target.value)}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <input
                      value={editAr}
                      onChange={e => setEditAr(e.target.value)}
                      dir="rtl"
                      style={HAFS}
                      className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEditTopic(topic.id)} disabled={savingEdit}
                        className="flex-1 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg">
                        {savingEdit ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditId(null)}
                        className="flex-1 py-1.5 border border-slate-300 dark:border-gray-500 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : deletingTopicId === topic.id ? (
                  /* Delete confirm */
                  <div className="p-3 space-y-2">
                    <p className="text-xs text-red-600 dark:text-red-400 font-semibold">
                      Delete &ldquo;{topic.titleEn}&rdquo; and all its words?
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => handleDeleteTopic(topic.id)}
                        className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg">
                        Yes, delete
                      </button>
                      <button onClick={() => setDeletingTopicId(null)}
                        className="flex-1 py-1.5 border border-slate-300 dark:border-gray-500 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal row */
                  <button
                    onClick={() => handleSelectTopic(topic)}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5"
                  >
                    <span className="w-6 h-6 flex-shrink-0 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{topic.titleEn}</p>
                      {topic.titleAr && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate" style={HAFS}>{topic.titleAr}</p>
                      )}
                    </div>
                    {/* Action buttons — shown on hover */}
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {/* Move up */}
                      <button onClick={e => { e.stopPropagation(); moveTopic(idx, -1); }} disabled={idx === 0}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                        title="Move up">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                      </button>
                      {/* Move down */}
                      <button onClick={e => { e.stopPropagation(); moveTopic(idx, 1); }} disabled={idx === topics.length - 1}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors"
                        title="Move down">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      </button>
                      {/* Edit */}
                      <button onClick={e => { e.stopPropagation(); setEditId(topic.id); setEditEn(topic.titleEn); setEditAr(topic.titleAr); }}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-400 hover:text-teal-600 transition-colors"
                        title="Edit">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                      </button>
                      {/* Delete */}
                      <button onClick={e => { e.stopPropagation(); setDeletingTopicId(topic.id); }}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-400 hover:text-red-500 transition-colors"
                        title="Delete">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT: Words panel ───────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {!selectedTopic ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="text-5xl mb-3" style={HAFS}>ب</div>
            <p className="font-semibold text-sm">Select a lesson to manage its words</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Words header */}
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-bold text-slate-700 dark:text-slate-200">{selectedTopic.titleEn}</h3>
                {selectedTopic.titleAr && (
                  <p className="text-sm text-slate-400" style={HAFS}>{selectedTopic.titleAr}</p>
                )}
              </div>
              <span className="ml-auto text-xs text-slate-400 bg-slate-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                {words.length} word{words.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setShowBulk(b => !b)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-teal-300 dark:border-teal-600 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
              >
                {showBulk ? 'Hide Bulk Add' : '⚡ Bulk Add'}
              </button>
            </div>

            {/* Single word add form */}
            <form onSubmit={handleAddWord} className="flex gap-2">
              <input
                ref={wordInputRef}
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
                placeholder="Type a word in Arabic…"
                dir="rtl"
                style={HAFS}
                className="flex-1 px-3 py-2 text-base rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <button
                type="submit"
                disabled={!newWord.trim() || addingWord}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                {addingWord ? '…' : '+ Add'}
              </button>
            </form>

            {/* Bulk add panel */}
            {showBulk && (
              <div className="bg-slate-50 dark:bg-gray-900 rounded-xl border border-slate-200 dark:border-gray-700 p-4 space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Paste multiple words — separate by newline, comma (,) or Arabic comma (،)
                </p>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={5}
                  dir="rtl"
                  style={HAFS}
                  placeholder={'بَ، تَ، ثَ\nجَ، حَ، خَ'}
                  className="w-full px-3 py-2 text-lg rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkAdd}
                    disabled={!bulkText.trim() || bulkAdding}
                    className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {bulkAdding ? 'Adding…' : `⚡ Add All`}
                  </button>
                  <button onClick={() => { setBulkText(''); setShowBulk(false); }}
                    className="px-4 py-2 border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 text-sm font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Words list */}
            {wordsLoading ? (
              <div className="text-center py-10 text-slate-400 text-sm">Loading words…</div>
            ) : words.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                No words yet — add some above.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {words.map(w => (
                  <div
                    key={w.id}
                    className="group relative bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden"
                  >
                    {editWordId === w.id ? (
                      /* Inline edit */
                      <div className="p-2 space-y-1.5">
                        <input
                          autoFocus
                          value={editWordText}
                          onChange={e => setEditWordText(e.target.value)}
                          dir="rtl"
                          style={HAFS}
                          className="w-full px-2 py-1 text-lg rounded border border-slate-300 dark:border-gray-500 bg-slate-50 dark:bg-gray-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 text-center"
                        />
                        <div className="flex gap-1">
                          <button onClick={() => handleSaveEditWord(w.id)} disabled={savingWord}
                            className="flex-1 py-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded">
                            {savingWord ? '…' : '✓'}
                          </button>
                          <button onClick={() => setEditWordId(null)}
                            className="flex-1 py-1 border border-slate-300 dark:border-gray-500 text-slate-500 dark:text-slate-400 text-xs rounded hover:bg-slate-50 dark:hover:bg-gray-700">
                            ✗
                          </button>
                        </div>
                      </div>
                    ) : deletingWordId === w.id ? (
                      /* Delete confirm */
                      <div className="p-2 space-y-1.5">
                        <p className="text-xs text-center text-red-500 font-semibold">Delete?</p>
                        <div className="flex gap-1">
                          <button onClick={() => handleDeleteWord(w.id)}
                            className="flex-1 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded">Yes</button>
                          <button onClick={() => setDeletingWordId(null)}
                            className="flex-1 py-1 border border-slate-300 dark:border-gray-500 text-slate-500 text-xs rounded hover:bg-slate-50 dark:hover:bg-gray-700">No</button>
                        </div>
                      </div>
                    ) : (
                      /* Normal display */
                      <>
                        <div
                          className="flex items-center justify-center py-3 px-2"
                          style={{ ...HAFS, fontSize: 'clamp(1.4rem, 4vw, 2rem)', lineHeight: 1.4, direction: 'rtl', minHeight: 64 }}
                        >
                          {w.word}
                        </div>
                        {/* Action overlay */}
                        <div className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 bg-white/80 dark:bg-gray-800/80 backdrop-blur-[1px] transition-opacity">
                          <button
                            onClick={() => { setEditWordId(w.id); setEditWordText(w.word); }}
                            className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-600 hover:bg-teal-100 transition-colors"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeletingWordId(w.id)}
                            className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-500 hover:bg-red-100 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminQaedahTab;
