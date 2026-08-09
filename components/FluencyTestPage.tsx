import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Student } from '../types';
import { getVersesForSurah } from '../services/dataService';
import { splitVerseWords, renderWordWithMarks } from '../utils/quranicMarks';
import { FluencyResult, listFluencyResults, saveFluencyResult } from '../services/fluencyService';

// ─────────────────────────────────────────────────────────────────────────────
// Fluency Test — tutor-only tab. A ladder of 10 levels; each test is 10 random
// Quran segments the student reads aloud against the clock while the tutor
// drives Passed / Buzz. Score = total time; at or under the level's ideal time
// passes the level.
//
//   Level N = 10 segments of ~3·N base letters each (whole words, spaces and
//   diacritics not counted), ideal time 15·N seconds.
//
// Segments render exactly like the live logging page: font-quranic (so the
// hand-patched fonts and the U+06DF sukoon fix apply) plus renderWordWithMarks
// for the measured iqlab-meem overlays and corrective-font words.
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_COLORS = [
  '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316',
  '#ef4444', '#ec4899', '#a855f7', '#6366f1', '#0ea5e9',
];

export interface FluencyLevel { n: number; letters: number; idealMs: number; color: string }
export const FLUENCY_LEVELS: FluencyLevel[] = Array.from({ length: 10 }, (_, i) => ({
  n: i + 1,
  letters: (i + 1) * 3,
  idealMs: (i + 1) * 15_000,
  color: LEVEL_COLORS[i],
}));

// Base Arabic letters only — diacritics and spaces never count. Same ranges as
// the live logging page's isArabicLetter.
const isBaseLetter = (ch: string): boolean => {
  const c = ch.charCodeAt(0);
  return (c >= 0x0621 && c <= 0x064A) || (c >= 0x0671 && c <= 0x06D3) || c === 0x06D5
    || (c >= 0x06EE && c <= 0x06EF) || (c >= 0x06FA && c <= 0x06FC);
};
export const countBaseLetters = (s: string): number => [...s].filter(isBaseLetter).length;

/** 10 random segments for a level. Level 1 = single 3-letter words; higher
 *  levels take consecutive words from ONE verse until the letter target is
 *  reached (so a segment never crops a word and never crosses a verse). */
export async function buildFluencyItems(level: number): Promise<string[]> {
  const target = level * 3;
  const items: string[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (items.length < 10 && guard++ < 500) {
    // Short targets exist everywhere; long ones need the long-verse surahs.
    const maxSurah = target <= 9 ? 114 : target <= 18 ? 77 : 48;
    const surah = 1 + Math.floor(Math.random() * maxSurah);
    const verses = await getVersesForSurah(surah);
    if (verses.length === 0) continue;
    const v = verses[Math.floor(Math.random() * verses.length)];
    const words = splitVerseWords(v.text_uthmani);
    if (level === 1) {
      const cands = words.map((w, i) => ({ w, i })).filter(({ w }) => countBaseLetters(w) === 3);
      if (cands.length === 0) continue;
      const c = cands[Math.floor(Math.random() * cands.length)];
      const key = `${v.verse_key}:${c.i}`;
      if (used.has(key)) continue;
      used.add(key);
      items.push(c.w);
    } else {
      const start = Math.floor(Math.random() * words.length);
      const seg: string[] = [];
      let letters = 0;
      for (let i = start; i < words.length && letters < target; i++) {
        seg.push(words[i]);
        letters += countBaseLetters(words[i]);
      }
      // Reject a run that fell short (verse ended) OR overshot by more than 3
      // letters — "more or less" should mean a word boundary's worth, not a
      // segment nearly double its level (a short start word followed by a long
      // one could produce 11 letters on a 6-letter level).
      if (letters < target || letters > target + 3) continue;
      const key = `${v.verse_key}:${start}:${seg.length}`;
      if (used.has(key)) continue;
      used.add(key);
      items.push(seg.join(' '));
    }
  }
  return items;
}

const fmtTime = (ms: number): string => {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// ─── Per-student aggregates ──────────────────────────────────────────────────

interface StudentStanding {
  bestAt: (level: number) => number | null;   // fastest ms, any attempt
  passed: (level: number) => boolean;
  currentLevel: number;                       // first unpassed level; 11 = all done
  attempts: (level: number) => FluencyResult[];
}

const standingOf = (rows: FluencyResult[]): StudentStanding => {
  const byLevel = new Map<number, FluencyResult[]>();
  for (const r of rows) {
    if (!byLevel.has(r.level)) byLevel.set(r.level, []);
    byLevel.get(r.level)!.push(r);
  }
  const passed = (l: number) => (byLevel.get(l) ?? []).some(r => r.passed);
  let current = 1;
  while (current <= 10 && passed(current)) current++;
  return {
    bestAt: l => {
      const rs = byLevel.get(l);
      return rs?.length ? Math.min(...rs.map(r => r.timeMs)) : null;
    },
    passed,
    currentLevel: current,
    attempts: l => byLevel.get(l) ?? [],
  };
};

// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'ladder' | 'countdown' | 'running' | 'result';

const FluencyTestPage: React.FC<{ student: Student; students: Student[] }> = ({ student, students }) => {
  const [allRows, setAllRows] = useState<FluencyResult[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [phase, setPhase] = useState<Phase>('ladder');
  const [count, setCount] = useState(3);
  const [items, setItems] = useState<string[]>([]);
  const [itemIdx, setItemIdx] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [buzzes, setBuzzes] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const startAtRef = useRef(0);
  const buzzesRef = useRef(0);
  const finishedRef = useRef(false);

  const reload = useCallback(() => {
    const ids = [...new Set([student.id, ...students.map(s => s.id)])];
    listFluencyResults(ids).then(setAllRows);
  }, [student.id, students]);
  useEffect(() => { reload(); }, [reload]);

  // DEV-only inspection hook for the browser test harness.
  useEffect(() => {
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as unknown as Record<string, unknown>).__flSetRows = setAllRows;
    }
  }, []);

  const rowsByStudent = useMemo(() => {
    const m = new Map<string, FluencyResult[]>();
    for (const r of allRows) {
      if (!m.has(r.studentId)) m.set(r.studentId, []);
      m.get(r.studentId)!.push(r);
    }
    return m;
  }, [allRows]);
  const myStanding = useMemo(() => standingOf(rowsByStudent.get(student.id) ?? []), [rowsByStudent, student.id]);

  // ── keyframes ────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = 'fluency-styles';
    if (document.getElementById(id)) return;
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
      @keyframes fl-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-10px)} 40%{transform:translateX(10px)} 60%{transform:translateX(-7px)} 80%{transform:translateX(7px)} }
      @keyframes fl-pop { from{transform:scale(.4);opacity:0} to{transform:scale(1);opacity:1} }
      .fl-shake { animation: fl-shake .4s ease; }
      .fl-pop { animation: fl-pop .45s cubic-bezier(.34,1.56,.64,1) both; }
    `;
    document.head.appendChild(el);
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // ── buzz sound ───────────────────────────────────────────────────────────
  const acRef = useRef<AudioContext | null>(null);
  const playBuzz = useCallback(() => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = acRef.current ?? (acRef.current = new AC());
      if (ac.state === 'suspended') void ac.resume();
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'square'; o.frequency.value = 140;
      g.gain.setValueAtTime(0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.28);
      o.connect(g).connect(ac.destination);
      o.start(); o.stop(ac.currentTime + 0.3);
    } catch { /* no audio — the shake still shows */ }
  }, []);

  // ── test flow ────────────────────────────────────────────────────────────
  const startTest = async (level: number) => {
    setLoadingItems(true);
    const built = await buildFluencyItems(level);
    setLoadingItems(false);
    if (built.length < 10) return;   // network hiccup — stay on the ladder
    setItems(built);
    setItemIdx(0);
    setElapsedMs(0);
    setBuzzes(0);
    buzzesRef.current = 0;
    finishedRef.current = false;
    setCount(3);
    setPhase('countdown');
  };

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      startAtRef.current = performance.now();
      setPhase('running');
      return;
    }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count]);

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => setElapsedMs(performance.now() - startAtRef.current), 100);
    return () => clearInterval(t);
  }, [phase]);

  const level = selectedLevel !== null ? FLUENCY_LEVELS[selectedLevel - 1] : null;

  const handlePassed = () => {
    if (phase !== 'running' || !level) return;
    if (itemIdx + 1 < items.length) { setItemIdx(i => i + 1); return; }
    // finished — freeze the clock exactly here
    if (finishedRef.current) return;
    finishedRef.current = true;
    const total = Math.round(performance.now() - startAtRef.current);
    setElapsedMs(total);
    setPhase('result');
    void saveFluencyResult({
      studentId: student.id,
      level: level.n,
      timeMs: total,
      buzzes: buzzesRef.current,
      passed: total <= level.idealMs,
    }).then(reload);
  };

  const handleBuzz = () => {
    if (phase !== 'running') return;
    buzzesRef.current += 1;
    setBuzzes(b => b + 1);
    setShaking(true);
    playBuzz();
    setTimeout(() => setShaking(false), 420);
  };

  const exitTest = () => { setPhase('ladder'); };

  // ── ladder chips ─────────────────────────────────────────────────────────
  /** Vertical position of a score inside a level block: passed sits at the
   *  head; a miss sinks by how far past the ideal it landed (a miss twice the
   *  ideal is at the bottom). */
  const chipTopPct = (timeMs: number, idealMs: number): number => {
    if (timeMs <= idealMs) return 0;
    const overshoot = Math.min(1, (timeMs - idealMs) / idealMs);
    return 12 + overshoot * 66;
  };

  interface Chip { name: string; timeMs: number | null; topPct: number; isMe: boolean }
  const chipsFor = (lv: FluencyLevel): Chip[] => {
    const chips: Chip[] = [];
    const mine = myStanding.bestAt(lv.n);
    if (mine !== null) {
      chips.push({ name: student.name, timeMs: mine, topPct: chipTopPct(mine, lv.idealMs), isMe: true });
    } else if (myStanding.currentLevel === lv.n) {
      chips.push({ name: student.name, timeMs: null, topPct: 80, isMe: true });
    }
    if (showAll) {
      for (const s of students) {
        if (s.id === student.id) continue;
        const st = standingOf(rowsByStudent.get(s.id) ?? []);
        if (st.currentLevel !== lv.n && !(st.currentLevel === 11 && lv.n === 10)) continue;
        const best = st.bestAt(lv.n);
        chips.push({ name: s.name, timeMs: best, topPct: best !== null ? chipTopPct(best, lv.idealMs) : 80, isMe: false });
      }
    }
    return chips.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));
  };

  // ─── TEST OVERLAY ────────────────────────────────────────────────────────
  if ((phase === 'countdown' || phase === 'running' || phase === 'result') && level) {
    const nearIdeal = elapsedMs >= level.idealMs * 0.8;
    const overIdeal = elapsedMs > level.idealMs;
    const item = items[itemIdx] ?? '';
    const itemLetters = Math.max(3, countBaseLetters(item));
    // Single short word → huge; a 30-letter run → still large but wrappable.
    const fontSize = `clamp(2.4rem, ${Math.round(240 / (itemLetters + 4))}vw, 8.5rem)`;
    const passedResult = elapsedMs <= level.idealMs;

    return (
      <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: 'linear-gradient(165deg,#0f172a 0%,#1e293b 100%)' }}>
        {/* top bar: exit · level · timer · progress */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={exitTest} className="px-3 py-1.5 rounded-xl bg-white/10 text-white/80 text-sm font-bold hover:bg-white/20 transition-colors">✕ Exit</button>
          <span className="px-3 py-1.5 rounded-xl text-sm font-black text-white" style={{ background: level.color }}>
            Level {level.n}
          </span>
          <div className="ml-auto flex items-center gap-3">
            {buzzes > 0 && <span className="text-amber-400 text-sm font-bold">⚡ {buzzes}</span>}
            <span className="text-white/50 text-sm font-bold tabular-nums">{itemIdx + 1} / 10</span>
          </div>
        </div>

        {/* timer */}
        <div className="text-center">
          <span className={`text-6xl sm:text-7xl font-black tabular-nums transition-colors ${overIdeal ? 'text-red-500 animate-pulse' : nearIdeal ? 'text-red-400' : 'text-white'}`}>
            {fmtTime(elapsedMs)}
          </span>
          <p className="text-white/40 text-xs font-bold mt-1 uppercase tracking-widest">ideal {fmtTime(level.idealMs)}</p>
        </div>

        {/* progress dots */}
        <div className="flex justify-center gap-1.5 mt-3">
          {items.map((_, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i < itemIdx ? 'bg-emerald-400' : i === itemIdx && phase === 'running' ? 'bg-white' : 'bg-white/20'}`} />
          ))}
        </div>

        {/* the segment — live-logging rendering */}
        <div className="flex-1 flex items-center justify-center px-4 py-4 min-h-0">
          {phase === 'countdown' ? (
            <span key={count} className="fl-pop text-white font-black" style={{ fontSize: '9rem' }}>{count === 0 ? '﷽' : count}</span>
          ) : phase === 'result' ? (
            <div className="fl-pop text-center bg-white dark:bg-gray-800 rounded-3xl shadow-2xl px-8 sm:px-14 py-10 max-w-lg w-full">
              <p className="text-6xl mb-3">{passedResult ? '🏆' : '⏱️'}</p>
              <p className={`text-3xl font-black ${passedResult ? 'text-emerald-600' : 'text-slate-800 dark:text-slate-100'}`}>
                {passedResult ? `Level ${level.n} passed!` : 'Not this time'}
              </p>
              <p className="mt-3 text-slate-500 dark:text-slate-400 font-semibold">
                {fmtTime(elapsedMs)} <span className="text-slate-400">· ideal {fmtTime(level.idealMs)}</span>
                {buzzes > 0 && <span className="text-amber-500"> · ⚡ {buzzes} buzz{buzzes === 1 ? '' : 'es'}</span>}
              </p>
              {!passedResult && (
                <p className="mt-1 text-sm text-slate-400">{fmtTime(elapsedMs - level.idealMs)} over — the score lands on the ladder.</p>
              )}
              <div className="mt-7 flex gap-3 justify-center">
                <button onClick={() => startTest(level.n)} className="px-6 py-2.5 rounded-2xl font-bold text-white transition-transform active:scale-95" style={{ background: level.color }}>
                  ↻ Try again
                </button>
                <button onClick={exitTest} className="px-6 py-2.5 rounded-2xl font-bold bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">
                  Back to levels
                </button>
              </div>
            </div>
          ) : (
            <div className={`w-full max-w-5xl bg-[#fdf8ee] rounded-3xl border-4 px-6 sm:px-12 py-10 sm:py-14 text-center shadow-2xl ${shaking ? 'fl-shake' : ''}`}
              style={{ borderColor: shaking ? '#ef4444' : '#fcd34d' }}>
              <p key={itemIdx} dir="rtl" className="font-quranic text-slate-900 fl-pop" style={{ fontSize, lineHeight: 2.2 }}>
                {item.split(' ').map((w, i, arr) => (
                  <React.Fragment key={i}>{renderWordWithMarks(w, `f${i}`, 2.2)}{i < arr.length - 1 ? ' ' : ''}</React.Fragment>
                ))}
              </p>
            </div>
          )}
        </div>

        {/* tutor buttons */}
        {phase === 'running' && (
          <div className="px-4 pb-6 pt-2 flex gap-4 justify-center">
            <button onClick={handleBuzz}
              className="w-40 sm:w-52 py-4 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-black text-xl shadow-lg shadow-red-900/40 transition-all active:scale-95">
              ⚡ Buzz
            </button>
            <button onClick={handlePassed}
              className="w-40 sm:w-52 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-xl shadow-lg shadow-emerald-900/40 transition-all active:scale-95">
              ✓ Passed
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── LADDER ──────────────────────────────────────────────────────────────
  const allDone = myStanding.currentLevel === 11;
  return (
    <div className="max-w-5xl mx-auto">
      {/* header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">⏱️ Fluency Test</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {student.name} · {allDone ? 'all 10 levels passed 🏆' : <>currently on <b className="text-slate-700 dark:text-slate-200">Level {myStanding.currentLevel}</b></>}
            </p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Show all students</span>
            <span onClick={() => setShowAll(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showAll ? 'bg-teal-600' : 'bg-slate-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showAll ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
        {/* ── the ladder — level 10 on top ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
          {allDone && (
            <div className="text-center pb-2 text-3xl" title="All levels passed">🏆</div>
          )}
          <div className="space-y-1.5">
            {[...FLUENCY_LEVELS].reverse().map(lv => {
              const isPassed = myStanding.passed(lv.n);
              const isSelected = selectedLevel === lv.n;
              const chips = chipsFor(lv);
              return (
                <button
                  key={lv.n}
                  onClick={() => setSelectedLevel(lv.n)}
                  className={`relative w-full h-[68px] rounded-xl text-left transition-all overflow-hidden ${isSelected ? 'ring-4 ring-offset-1 ring-slate-400 dark:ring-slate-300 dark:ring-offset-gray-800' : 'hover:brightness-95 dark:hover:brightness-110'}`}
                  style={{ background: isPassed ? 'linear-gradient(135deg,#cbd5e1,#94a3b8)' : `linear-gradient(135deg, ${lv.color}, ${lv.color}cc)` }}
                >
                  <div className="absolute inset-y-0 left-0 flex items-center gap-2.5 px-3">
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-lg ${isPassed ? 'bg-white/60 text-slate-600' : 'bg-white/25 text-white'}`}>
                      {isPassed ? '✓' : lv.n}
                    </span>
                    <span className={isPassed ? 'text-slate-600' : 'text-white'}>
                      <span className="block text-sm font-black leading-tight">Level {lv.n}</span>
                      <span className="block text-[11px] font-semibold opacity-85 leading-tight">
                        10 × ~{lv.letters} letters · {fmtTime(lv.idealMs)}
                      </span>
                    </span>
                  </div>
                  {/* score chips — head = made the ideal, lower = further past it */}
                  <div className="absolute inset-y-0 right-1.5 w-[46%]">
                    {chips.map((c, i) => (
                      <span key={`${c.name}-${i}`}
                        className={`absolute rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap shadow-sm max-w-full truncate ${
                          c.isMe ? 'bg-white text-slate-800' : 'bg-slate-900/70 text-white'}`}
                        style={{ top: `${4 + c.topPct * 0.66}%`, right: `${(i % 3) * 33}%` }}>
                        {showAll ? `${c.name.split(' ')[0]} ` : ''}{c.timeMs !== null ? fmtTime(c.timeMs) : '·'}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 leading-relaxed">
            Grey = passed (tap to retake). A score at the <b>top edge</b> of a level beat its ideal time;
            the further below the edge, the further past the ideal it finished.
          </p>
        </div>

        {/* ── level detail / start panel ── */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm lg:sticky lg:top-24">
          {level === null ? (
            <div className="text-center py-16 text-slate-400 dark:text-slate-500">
              <p className="text-4xl mb-3">👈</p>
              <p className="font-semibold">Pick a level to see its test.</p>
              <p className="text-sm mt-2 max-w-sm mx-auto leading-relaxed">
                Each test is 10 random Quran segments. The student reads; you press
                <b className="text-emerald-600"> Passed</b> to move on or <b className="text-red-500">Buzz</b> on a stumble.
                Finish all 10 inside the ideal time to pass the level.
              </p>
            </div>
          ) : (() => {
            const isPassed = myStanding.passed(level.n);
            const best = myStanding.bestAt(level.n);
            const recent = [...myStanding.attempts(level.n)].reverse().slice(0, 6);
            return (
              <>
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow" style={{ background: level.color }}>
                    {level.n}
                  </span>
                  <div>
                    <h3 className="font-black text-lg text-slate-800 dark:text-slate-100">Level {level.n}{isPassed && ' · passed ✓'}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      10 segments of ~{level.letters} letters · ideal time <b>{fmtTime(level.idealMs)}</b>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-5">
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-700/50 border border-slate-100 dark:border-gray-700 p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Best time</p>
                    <p className={`text-2xl font-black ${best !== null && best <= level.idealMs ? 'text-emerald-600' : 'text-slate-700 dark:text-slate-200'}`}>
                      {best !== null ? fmtTime(best) : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-gray-700/50 border border-slate-100 dark:border-gray-700 p-3 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">To pass</p>
                    <p className="text-2xl font-black text-slate-700 dark:text-slate-200">≤ {fmtTime(level.idealMs)}</p>
                  </div>
                </div>

                <button
                  onClick={() => startTest(level.n)}
                  disabled={loadingItems}
                  className="mt-5 w-full py-4 rounded-2xl font-black text-lg text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: level.color }}
                >
                  {loadingItems ? 'Picking verses…' : '▶ Start test'}
                </button>

                {recent.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Recent attempts</p>
                    <div className="space-y-1.5">
                      {recent.map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-sm rounded-lg bg-slate-50 dark:bg-gray-700/40 px-3 py-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.passed ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtTime(a.timeMs)}</span>
                          {a.buzzes > 0 && <span className="text-amber-500 text-xs font-bold">⚡{a.buzzes}</span>}
                          <span className="ms-auto text-xs text-slate-400">
                            {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default FluencyTestPage;
