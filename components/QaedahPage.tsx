import React, { useState, useEffect, useCallback, useRef } from 'react';
import TowerDefenseGame, { TowerDefenseRef } from './TowerDefenseGame';
import CraneBuilderGame from './CraneBuilderGame';
import {
  QaedahTopic,
  QaedahWord,
  listQaedahTopics,
  listQaedahWords,
} from '../services/qaedahService';

// ─── Constants ────────────────────────────────────────────────────────────────

const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif" };

const PRAISE = [
  { emoji: '🌟', text: 'Amazing!' },   { emoji: '🎉', text: 'Woohoo!' },
  { emoji: '⭐', text: 'Super Star!' }, { emoji: '🏆', text: 'You nailed it!' },
  { emoji: '🦁', text: 'So brave!' },  { emoji: '🚀', text: 'Blast off!' },
  { emoji: '🌈', text: 'Brilliant!' }, { emoji: '🎊', text: 'Fantastic!' },
  { emoji: '🐝', text: 'Bee-utiful!'}, { emoji: '💫', text: 'Dazzling!' },
];

const CONFETTI_COLORS = ['#ff6b9d','#ffd93d','#6bcb77','#4d96ff','#ff9a3c','#c77dff','#ff595e','#6af2f0'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Component ────────────────────────────────────────────────────────────────

type View = 'list' | 'words' | 'challenge' | 'win';

const QaedahPage: React.FC<{ isStudentView?: boolean }> = ({ isStudentView = false }) => {

  // ── Data state ───────────────────────────────────────────────────────────
  const [topics,       setTopics]       = useState<QaedahTopic[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<QaedahTopic | null>(null);
  const [words,        setWords]        = useState<QaedahWord[]>([]);
  const [wordsLoading, setWordsLoading] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [view,        setView]        = useState<View>('list');
  const [childMode,   setChildMode]   = useState(false);
  const [levelFilter, setLevelFilter] = useState<'all' | 1 | 2 | 3>('all');
  const [showCrane,   setShowCrane]   = useState(false);

  // ── Challenge state ───────────────────────────────────────────────────────
  const [queue,       setQueue]      = useState<string[]>([]);
  const [pos,         setPos]        = useState(0);
  const [restartMsg,  setRestartMsg] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [shaking,     setShaking]    = useState(false);
  const [popup, setPopup] = useState<{ emoji: string; text: string; phase: 'hidden' | 'in' | 'out' }>({
    emoji: '🌟', text: 'Amazing!', phase: 'hidden',
  });

  const gameRef            = useRef<TowerDefenseRef>(null);
  const consecutiveCorrect = useRef(0);

  // Enemy soldiers: in the student portal they spawn automatically at random
  // intervals; on the tutor side they're sent via the hidden "R" shortcut.
  useEffect(() => {
    if (!childMode || view !== 'challenge') return;
    if (isStudentView) {
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        timer = setTimeout(() => { gameRef.current?.spawnEnemySoldier(); schedule(); }, 4000 + Math.random() * 5000);
      };
      schedule();
      return () => clearTimeout(timer);
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        gameRef.current?.spawnEnemySoldier();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [childMode, view, isStudentView]);

  // ── CSS keyframes ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = 'qd-styles';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = `
      @keyframes qd-card-in  { from{opacity:0;transform:scale(.88) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
      @keyframes qd-card-kid { from{opacity:0;transform:scale(.6) rotate(-6deg)} to{opacity:1;transform:scale(1) rotate(0)} }
      @keyframes qd-shake    { 0%,100%{transform:translateX(0)} 18%{transform:translateX(-11px) rotate(-2deg)} 36%{transform:translateX(11px) rotate(2deg)} 54%{transform:translateX(-8px)} 72%{transform:translateX(8px)} }
      @keyframes qd-pop-in   { from{transform:translate(-50%,-50%) scale(0);opacity:0} to{transform:translate(-50%,-50%) scale(1);opacity:1} }
      @keyframes qd-pop-out  { from{transform:translate(-50%,-50%) scale(1);opacity:1} to{transform:translate(-50%,-50%) scale(.6);opacity:0} }
      @keyframes qd-bounce   { from{transform:scale(0) rotate(-15deg)} to{transform:scale(1) rotate(0)} }
      @keyframes qd-confetti { 0%{transform:translateY(0) rotate(0deg);opacity:1} 85%{opacity:1} 100%{transform:translateY(105vh) rotate(760deg);opacity:0} }
      .qd-card-in  { animation: qd-card-in  .35s cubic-bezier(.4,0,.2,1) both; }
      .qd-card-kid { animation: qd-card-kid .4s  cubic-bezier(.34,1.56,.64,1) both; }
      .qd-shake    { animation: qd-shake .45s ease; }
      .qd-pop-in   { animation: qd-pop-in  .5s  cubic-bezier(.34,1.56,.64,1) forwards; }
      .qd-pop-out  { animation: qd-pop-out .28s ease forwards; }
      .qd-bounce   { animation: qd-bounce  .7s  cubic-bezier(.34,1.56,.64,1) .25s both; }
    `;
    document.head.appendChild(s);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // ── Load topics on mount ─────────────────────────────────────────────────
  useEffect(() => {
    listQaedahTopics().then(t => { setTopics(t); setLoading(false); });
  }, []);

  // ── Load words when topic selected ───────────────────────────────────────
  const selectTopic = async (topic: QaedahTopic) => {
    setSelectedTopic(topic);
    setWordsLoading(true);
    setLevelFilter('all');
    const w = await listQaedahWords(topic.id);
    setWords(w);
    setWordsLoading(false);
    setView('words');
  };

  // ── Confetti ─────────────────────────────────────────────────────────────
  const launchConfetti = useCallback((count: number) => {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        const dur = 1.5 + Math.random() * 1.8;
        Object.assign(el.style, {
          position: 'fixed', top: '-20px', zIndex: '9999', pointerEvents: 'none',
          left: (Math.random() * 100) + 'vw',
          background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          width: (7 + Math.random() * 10) + 'px',
          height: (7 + Math.random() * 10) + 'px',
          animationName: 'qd-confetti',
          animationDuration: dur + 's',
          animationTimingFunction: 'linear',
          animationFillMode: 'forwards',
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), dur * 1000 + 200);
      }, i * 20);
    }
  }, []);

  // ── Celebrate (popup + optional callback) ────────────────────────────────
  const celebrate = useCallback((onDone: () => void) => {
    const p = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    setPopup({ emoji: p.emoji, text: p.text, phase: 'in' });
    launchConfetti(55);
    setTimeout(() => {
      setPopup(prev => ({ ...prev, phase: 'out' }));
      setTimeout(() => { setPopup(prev => ({ ...prev, phase: 'hidden' })); onDone(); }, 300);
    }, 1100);
  }, [launchConfetti]);

  // ── Advance to next word ──────────────────────────────────────────────────
  const advance = useCallback(() => {
    setPos(prev => {
      const next = prev + 1;
      if (next >= queue.length) { if (childMode) launchConfetti(120); setView('win'); }
      return next;
    });
  }, [queue.length, childMode, launchConfetti]);

  // ── Start challenge ───────────────────────────────────────────────────────
  const handleStart = () => {
    const filtered = levelFilter === 'all' ? words : words.filter(w => w.level === levelFilter);
    if (filtered.length === 0) return;
    const q = shuffle(filtered.map(w => w.word));
    setQueue(q);
    setPos(0);
    setRestartMsg('');
    consecutiveCorrect.current = 0;
    gameRef.current?.setStreak(0);
    gameRef.current?.reset();
    setView('challenge');
  };

  // ── Correct answer ────────────────────────────────────────────────────────
  const handleCorrect = () => {
    if (celebrating) return;
    setRestartMsg('');
    consecutiveCorrect.current += 1;
    const streak = consecutiveCorrect.current;
    if (streak >= 6) {
      consecutiveCorrect.current = 0;
      gameRef.current?.spawnJafarSoldier();
      gameRef.current?.setStreak(0);
    } else if (streak === 3) {
      gameRef.current?.spawnBilalSoldier();
      gameRef.current?.setStreak(streak);
    } else {
      gameRef.current?.spawnPlayerSoldier();
      gameRef.current?.setStreak(streak);
    }
    if (childMode) {
      setCelebrating(true);
      celebrate(() => { setCelebrating(false); advance(); });
    } else {
      advance();
    }
  };

  // ── Wrong answer ──────────────────────────────────────────────────────────
  const handleWrong = () => {
    if (celebrating) return;
    consecutiveCorrect.current = 0;
    gameRef.current?.spawnEnemySoldier();
    gameRef.current?.setStreak(0);
    if (childMode) {
      setShaking(true);
      setRestartMsg('Try again! 💪');
      setTimeout(() => {
        setShaking(false);
        setPos(0);
        setQueue(q => shuffle([...q]));
      }, 500);
    } else {
      setRestartMsg('Reshuffled — try again!');
      setPos(0);
      setQueue(q => shuffle([...q]));
    }
  };

  const pct    = queue.length > 0 ? Math.round((pos / queue.length) * 100) : 0;
  const word   = queue[pos] ?? '';

  // ── Praise popup overlay ──────────────────────────────────────────────────
  const praiseOverlay = popup.phase !== 'hidden' && (
    <div
      className={`fixed left-1/2 top-1/3 z-[9999] pointer-events-none text-center ${
        popup.phase === 'in' ? 'qd-pop-in' : 'qd-pop-out'
      }`}
      style={{ transform: 'translate(-50%,-50%)' }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl px-8 py-5 border-2 border-indigo-200 dark:border-indigo-700">
        <div className="text-5xl mb-1">{popup.emoji}</div>
        <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-300">{popup.text}</div>
      </div>
    </div>
  );

  // ─── VIEW: LIST ───────────────────────────────────────────────────────────
  const renderList = () => (
    <div className="max-w-2xl mx-auto px-4 pb-12 pt-2">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100" style={HAFS}>
          القاعدة النورانية
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Qaedah Nooraniyya — select a lesson to practice
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <div className="text-4xl mb-3" style={HAFS}>ب</div>
          <p className="text-sm">Loading lessons…</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-4xl mb-3">📖</p>
          <p className="font-semibold">No lessons yet.</p>
          <p className="text-sm mt-1">An admin can add topics from the Admin Panel.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic, idx) => (
            <button
              key={topic.id}
              onClick={() => selectTopic(topic)}
              className="w-full text-left flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-teal-400 dark:hover:border-teal-500 hover:-translate-y-0.5 transition-all duration-150 group"
            >
              {/* Lesson number badge */}
              <span className="w-9 h-9 flex-shrink-0 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-bold text-sm flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 transition-colors">
                {idx + 1}
              </span>
              {/* Titles */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm truncate">
                  {topic.titleEn}
                </p>
                {topic.titleAr && (
                  <p className="text-slate-400 dark:text-slate-500 text-sm mt-0.5 truncate" style={HAFS}>
                    {topic.titleAr}
                  </p>
                )}
              </div>
              {/* Arrow */}
              <svg className="w-4 h-4 text-slate-400 group-hover:text-teal-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // ─── VIEW: WORDS ──────────────────────────────────────────────────────────
  const renderWords = () => (
    <div className="max-w-2xl mx-auto px-4 pb-12 pt-2">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setView('list')}
          className="p-2 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 transition-colors flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate">{selectedTopic?.titleEn}</h2>
          {selectedTopic?.titleAr && (
            <p className="text-sm text-slate-400 dark:text-slate-500 truncate" style={HAFS}>{selectedTopic.titleAr}</p>
          )}
        </div>
      </div>

      {wordsLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Loading words…</div>
      ) : words.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-3xl mb-2" style={HAFS}>؟</p>
          <p className="font-semibold">No words in this lesson yet.</p>
        </div>
      ) : (
        <>
          {/* Level filter */}
          {(() => {
            const counts: Record<'all'|1|2|3, number> = {
              all: words.length,
              1: words.filter(w => w.level === 1).length,
              2: words.filter(w => w.level === 2).length,
              3: words.filter(w => w.level === 3).length,
            };
            const levels: Array<{ key: 'all'|1|2|3; label: string; activeClass: string }> = [
              { key: 'all', label: 'All',     activeClass: 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900' },
              { key: 1,     label: 'Level 1', activeClass: 'bg-teal-600 text-white' },
              { key: 2,     label: 'Level 2', activeClass: 'bg-amber-500 text-white' },
              { key: 3,     label: 'Level 3', activeClass: 'bg-rose-500 text-white' },
            ];
            return (
              <div className="flex gap-2 flex-wrap mb-4">
                {levels.map(({ key, label, activeClass }) => (
                  counts[key] > 0 && (
                    <button key={key} onClick={() => setLevelFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border ${
                        levelFilter === key
                          ? activeClass + ' border-transparent'
                          : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-slate-400'
                      }`}>
                      {label} <span className="opacity-70 text-xs">({counts[key]})</span>
                    </button>
                  )
                ))}
              </div>
            );
          })()}

          {/* Word grid — Hafs font, large */}
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-8">
            {words.map(w => (
              <div
                key={w.id}
                className="flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 py-3 px-1 shadow-sm"
                style={{ ...HAFS, fontSize: 'clamp(1.4rem, 5vw, 2rem)', lineHeight: 1.4, direction: 'rtl' }}
              >
                {w.word}
              </div>
            ))}
          </div>

          {/* Start button */}
          {(() => {
            const count = levelFilter === 'all' ? words.length : words.filter(w => w.level === levelFilter).length;
            return (
              <div className="flex justify-center gap-3 flex-wrap">
                <button
                  onClick={handleStart}
                  disabled={count === 0}
                  className={`px-8 py-3 rounded-2xl font-bold text-base transition-all active:scale-95 shadow-lg disabled:opacity-50 ${
                    childMode
                      ? 'bg-orange-400 hover:bg-orange-500 text-white shadow-orange-200'
                      : 'bg-teal-600 dark:bg-amber-600 hover:bg-teal-700 dark:hover:bg-amber-700 text-white'
                  }`}
                >
                  ⚔️ Start Challenge — {count} word{count !== 1 ? 's' : ''}
                </button>
                <button
                  onClick={() => setShowCrane(true)}
                  disabled={count === 0}
                  className="px-8 py-3 rounded-2xl font-bold text-base transition-all active:scale-95 shadow-lg disabled:opacity-50 bg-sky-600 hover:bg-sky-700 text-white shadow-sky-200 dark:shadow-none"
                >
                  🏗️ Build the Word
                </button>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );

  // ─── VIEW: CHALLENGE ──────────────────────────────────────────────────────
  const renderChallenge = () => {
    // Shared top bar — includes Adult/Child toggle (challenge page only)
    const topBar = (
      <div className="flex items-center gap-3">
        <button
          onClick={() => setView('words')}
          className={`px-4 py-1.5 text-sm border transition-colors flex-shrink-0 ${
            childMode
              ? 'rounded-full border-2 border-blue-200 font-bold text-blue-600 hover:border-blue-400 bg-white'
              : 'rounded-lg border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400'
          }`}
        >← Back</button>
        <div className={`flex-1 h-3 rounded-full overflow-hidden ${childMode ? 'bg-indigo-100' : 'bg-slate-200 dark:bg-gray-700'}`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${childMode ? '' : 'bg-amber-500 dark:bg-amber-400'}`}
            style={{ width: `${pct}%`, ...(childMode ? { background: 'linear-gradient(90deg,#ff6b9d,#ffd93d,#6bcb77)' } : {}) }}
          />
        </div>
        <span className={`text-sm flex-shrink-0 min-w-[3rem] text-right ${childMode ? 'font-extrabold text-blue-700' : 'text-slate-400 dark:text-slate-500'}`}>
          {pos} / {queue.length}
        </span>
        {/* Adult / Child toggle — challenge page only */}
        <button
          onClick={() => setChildMode(m => !m)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
            childMode
              ? 'bg-indigo-500 border-indigo-400 text-white shadow-sm'
              : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-slate-400'
          }`}
        >
          {childMode ? '🧒 Child' : '👤 Adult'}
        </button>
      </div>
    );

    // ── Child mode: canvas-first, word card overlaid, buttons below ──────────
    if (childMode) {
      return (
        <>
          {praiseOverlay}

          {/* Top bar above the canvas */}
          <div className="px-4 pt-2 pb-2">
            {topBar}
          </div>

          {/* Battle arena — word card floated inside as an overlay */}
          <div className="relative w-full">
            <TowerDefenseGame ref={gameRef} />

            {/* Word card overlay — top-center, small padding from canvas edge.
                pointer-events-none so clicks pass through to the game. */}
            <div
              className="absolute left-1/2 -translate-x-1/2 pointer-events-none select-none"
              style={{ top: 10, zIndex: 5 }}
            >
              <div
                key={`${pos}-${word}`}
                className={`flex items-center justify-center rounded-3xl qd-card-kid border-4 border-indigo-200 shadow-xl ${shaking ? 'qd-shake' : ''}`}
                style={{
                  width: 'min(420px, 76vw)', height: 'min(150px, 34vw)',
                  minHeight: 100,
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  padding: '0 16px',
                }}
              >
                <span
                  style={{
                    ...HAFS,
                    fontSize: 'clamp(3.6rem, 11vw, 6rem)',
                    lineHeight: 1.2,
                    direction: 'rtl',
                    color: '#3c4a8a',
                    whiteSpace: 'nowrap',
                  }}
                >{word}</span>
              </div>
            </div>
          </div>

          {/* Correct / Wrong buttons below canvas */}
          <div className="px-4 pt-3 pb-2 max-w-sm mx-auto w-full">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleCorrect}
                disabled={celebrating}
                className="py-4 rounded-full bg-green-500 hover:bg-green-400 text-white font-bold text-lg shadow-md shadow-green-200 transition-all active:scale-95 disabled:opacity-60"
              >✅ Yes!</button>
              <button
                onClick={handleWrong}
                disabled={celebrating}
                className="py-4 rounded-full bg-rose-500 hover:bg-rose-400 text-white font-bold text-lg shadow-md shadow-rose-200 transition-all active:scale-95 disabled:opacity-60"
              >❌ No</button>
            </div>
            {restartMsg && (
              <p className="text-center mt-3 text-sm font-semibold text-pink-500">{restartMsg}</p>
            )}
          </div>
        </>
      );
    }

    // ── Adult mode — original stacked layout (no game canvas) ────────────────
    return (
      <>
        {praiseOverlay}
        <div className="max-w-xl mx-auto px-4 pb-4 pt-2">
          <div className="flex items-center gap-3 mb-6">
            {topBar}
          </div>

          {/* Word card */}
          <div className="flex justify-center mb-10">
            <div
              key={`${pos}-${word}`}
              className={`flex items-center justify-center bg-white dark:bg-gray-800 rounded-3xl qd-card-in border border-amber-200/60 dark:border-gray-600 shadow-md ${shaking ? 'qd-shake' : ''}`}
              style={{ width: 'min(260px,75vw)', height: 'min(180px,50vw)', minHeight: 120 }}
            >
              <span
                style={{
                  ...HAFS,
                  fontSize: 'clamp(3rem,14vw,6rem)',
                  lineHeight: 1.2,
                  direction: 'rtl',
                }}
                className="text-slate-700 dark:text-slate-200"
              >{word}</span>
            </div>
          </div>

          {/* Correct / Wrong buttons */}
          <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
            <button
              onClick={handleCorrect}
              disabled={celebrating}
              className="py-5 rounded-2xl bg-teal-600 dark:bg-teal-700 hover:bg-teal-700 dark:hover:bg-teal-600 text-white font-bold text-lg transition-all active:scale-95 disabled:opacity-60"
            >✓ Correct</button>
            <button
              onClick={handleWrong}
              disabled={celebrating}
              className="py-5 rounded-2xl bg-red-500 dark:bg-red-700 hover:bg-red-600 dark:hover:bg-red-600 text-white font-bold text-lg transition-all active:scale-95 disabled:opacity-60"
            >✗ Wrong</button>
          </div>

          {restartMsg && (
            <p className="text-center mt-4 text-sm font-semibold text-red-400">{restartMsg}</p>
          )}
        </div>
      </>
    );
  };

  // ─── VIEW: WIN ────────────────────────────────────────────────────────────
  const renderWin = () => (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className={`flex items-center justify-center text-4xl mb-6 ${
        childMode
          ? 'qd-bounce w-28 h-28 rounded-full bg-yellow-100 border-4 border-yellow-300 shadow-lg'
          : 'w-24 h-24 rounded-full bg-white dark:bg-gray-800 border-2 border-amber-300'
      }`}>
        {childMode ? '🏆' : '✓'}
      </div>
      <h2 className={`mb-2 font-bold ${childMode ? 'text-4xl font-extrabold text-pink-500' : 'text-3xl text-amber-600 dark:text-amber-400'}`}
        style={childMode ? {} : HAFS}
      >
        {childMode ? '🌟 Well Done! 🌟' : 'Lesson Complete'}
      </h2>
      <p className={`mb-8 max-w-xs ${childMode ? 'text-lg font-bold text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
        {childMode
          ? <>{`You practised ${queue.length} words!`}<br />Amazing work! 🎉</>
          : `You went through all ${queue.length} words.`}
      </p>
      <div className="flex gap-3 flex-wrap justify-center">
        <button
          onClick={handleStart}
          className={`px-6 py-2.5 font-bold transition-all active:scale-95 ${
            childMode
              ? 'rounded-full bg-orange-400 hover:bg-orange-500 text-white shadow-md'
              : 'rounded-xl bg-teal-600 dark:bg-amber-600 hover:bg-teal-700 dark:hover:bg-amber-700 text-white'
          }`}
        >{childMode ? '🔁 Play Again' : 'Practice Again'}</button>
        <button
          onClick={() => setView('words')}
          className={`px-6 py-2.5 font-bold transition-all active:scale-95 ${
            childMode
              ? 'rounded-full bg-white border-2 border-blue-300 text-blue-600 hover:border-blue-500'
              : 'rounded-xl border border-slate-300 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-500'
          }`}
        >Back to Lesson</button>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-[60vh] ${childMode && view === 'challenge' ? '' : 'max-w-3xl mx-auto'}`}>
      {view === 'list'      && renderList()}
      {view === 'words'     && renderWords()}
      {view === 'challenge' && renderChallenge()}
      {view === 'win'       && renderWin()}

      {showCrane && (
        <CraneBuilderGame
          words={(levelFilter === 'all' ? words : words.filter(w => w.level === levelFilter)).map(w => w.word)}
          topicTitle={selectedTopic?.titleEn}
          onExit={() => setShowCrane(false)}
        />
      )}
    </div>
  );
};

export default QaedahPage;
