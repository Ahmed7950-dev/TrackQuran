import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Student, ActivityLog } from '../types';
import { getVersesForSurah } from '../services/dataService';
import { splitVerseWords, renderWordWithMarks } from '../utils/quranicMarks';
import { FluencyResult, listFluencyResults, saveFluencyResult, deleteFluencyResult } from '../services/fluencyService';
import { QURANIC_FONTS } from '../constants';
import StudentProfileIcon from './StudentProfileIcon';

// ─────────────────────────────────────────────────────────────────────────────
// Fluency Test — tutor-only tab. A ladder of 10 levels; each test is 10 random
// Quran segments the student reads aloud against the clock while the tutor
// drives Passed / Buzz. Score = total time; at or under the level's ideal time
// passes the level.
//
//   Level N = 10 segments of ~3·N base letters each (whole words, spaces and
//   diacritics not counted). Ideal time = 20·N seconds: 20s, 40s, 60s … 200s
//   (third revision, 2026-08-11 — the 1.5s-per-letter budget proved too loose).
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
// Ideal times hand-picked by the tutor (2026-08-11).
const IDEAL_SECONDS = [40, 50, 65, 70, 75, 80, 85, 90, 95, 100];
export const FLUENCY_LEVELS: FluencyLevel[] = Array.from({ length: 10 }, (_, i) => ({
  n: i + 1,
  letters: (i + 1) * 3,
  idealMs: IDEAL_SECONDS[i] * 1000,
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
  // Judged against the CURRENT ideal, not the stored passed flag — when the
  // tutor loosens a level's time, runs that fit the new bar count as passes.
  const passed = (l: number) => (byLevel.get(l) ?? []).some(r => r.timeMs <= FLUENCY_LEVELS[l - 1].idealMs);
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

type Phase = 'ladder' | 'challenge' | 'countdown' | 'running' | 'result';

const FluencyTestPage: React.FC<{ student: Student; students: Student[]; onLogActivity?: (studentId: string, a: ActivityLog) => void }> = ({ student, students, onLogActivity }) => {
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

  // ── Quranic font (same picker + same global preference as the Quran page) ──
  const [font, setFont] = useState<string>(() => {
    try { const f = localStorage.getItem('quranicFont') || 'Hafs'; return QURANIC_FONTS.some(o => o.name === f) ? f : 'Hafs'; }
    catch { return 'Hafs'; }
  });
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  useEffect(() => {
    document.documentElement.style.setProperty('--quranic-font', font);
    try { localStorage.setItem('quranicFont', font); } catch { /* private mode */ }
  }, [font]);

  // ── Fit the segment to its box ────────────────────────────────────────────
  // The old vw-based size grew with letter count, so a long level-10 verse
  // overflowed the card and covered the buttons. The type is binary-searched
  // down instead: as large as possible while still fitting exactly.
  const textBoxRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);

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

  useLayoutEffect(() => {
    if (phase !== 'running') return;
    let dead = false;
    const fit = () => {
      const box = textBoxRef.current, el = textRef.current;
      if (dead || !box || !el) return;
      const availH = box.clientHeight, availW = box.clientWidth;
      if (!availH || !availW) return;
      let lo = 16, hi = 190, best = lo;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (el.scrollHeight <= availH && el.scrollWidth <= availW + 1) { best = mid; lo = mid; }
        else hi = mid;
      }
      el.style.fontSize = `${best}px`;
    };
    // The box can still be laid out at zero on the first frame — retry until
    // it has a real size, then keep it fitted through window resizes and
    // rotations (ResizeObserver alone is not dependable everywhere).
    let raf = 0;
    const fitSoon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); };
    fit();
    if (!textBoxRef.current?.clientHeight) fitSoon();
    const ro = new ResizeObserver(fit);
    if (textBoxRef.current) ro.observe(textBoxRef.current);
    window.addEventListener('resize', fitSoon);
    window.addEventListener('orientationchange', fitSoon);
    // Font files change the metrics — refit once they have loaded.
    document.fonts?.ready?.then(() => { if (!dead) fit(); }).catch(() => { /* ignore */ });
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', fitSoon);
      window.removeEventListener('orientationchange', fitSoon);
    };
  }, [phase, itemIdx, items, font]);

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
    const passed = total <= level.idealMs;
    void saveFluencyResult({
      studentId: student.id,
      level: level.n,
      timeMs: total,
      buzzes: buzzesRef.current,
      passed,
    }).then(() => {
      reload();
      // The attempt also enters the student's logbook (= attendance for the day).
      // sourceId is level+time: re-running the SAME level to the same
      // millisecond twice in one day is not a thing, so this both dedupes a
      // double-fire and keeps a second, different attempt as its own log.
      onLogActivity?.(student.id, {
        kind: 'fluency',
        title: `Fluency test — level ${level.n}`,
        detail: `${(total / 1000).toFixed(1)}s · ${buzzesRef.current} buzz${buzzesRef.current === 1 ? '' : 'es'} · ${passed ? 'passed' : 'not passed'}`,
        sourceId: `L${level.n}-${total}`,
      });
    });
  };

  const handleBuzz = () => {
    if (phase !== 'running') return;
    buzzesRef.current += 1;
    setBuzzes(b => b + 1);
    setShaking(true);
    playBuzz();
    setTimeout(() => setShaking(false), 420);
  };

  // N = buzz, M = passed — keeps the tutor's hands off the mouse mid-reading.
  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); handleBuzz(); }
      else if (k === 'm') { e.preventDefault(); handlePassed(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exitTest = () => { setPhase('challenge'); };

  // ── Removing a score (tutor) ─────────────────────────────────────────────
  // Only ever this student's own attempts — the list it hangs off is built
  // from myStanding. Standings recompute from whatever rows remain.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const removeAttempt = async (a: FluencyResult) => {
    const when = new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (!window.confirm(`Remove ${student.name}'s ${fmtTime(a.timeMs)} score from ${when}?\n\nThis can't be undone.`)) return;
    setDeletingId(a.id);
    const ok = await deleteFluencyResult(a.id);
    setDeletingId(null);
    if (ok) setAllRows(rows => rows.filter(r => r.id !== a.id));
    else window.alert('Could not remove that score — check the connection and try again.');
  };

  // ── ladder chips ─────────────────────────────────────────────────────────
  /** Vertical position of a score inside a level block: passed sits at the
   *  head; a miss sinks by how far past the ideal it landed (a miss twice the
   *  ideal is at the bottom). */
  const chipTopPct = (timeMs: number, idealMs: number): number => {
    if (timeMs <= idealMs) return 0;
    const overshoot = Math.min(1, (timeMs - idealMs) / idealMs);
    return 12 + overshoot * 66;
  };

  /** Only students who actually have a score on this level get a marker. */
  interface Chip { name: string; timeMs: number; topPct: number; isMe: boolean; icon?: string; id: string }
  const chipsFor = (lv: FluencyLevel): Chip[] => {
    const chips: Chip[] = [];
    const mine = myStanding.bestAt(lv.n);
    if (mine !== null) {
      chips.push({ name: student.name, timeMs: mine, topPct: chipTopPct(mine, lv.idealMs), isMe: true, icon: student.profileIcon, id: student.id });
    }
    if (showAll) {
      for (const s of students) {
        if (s.id === student.id) continue;
        const st = standingOf(rowsByStudent.get(s.id) ?? []);
        if (st.currentLevel !== lv.n && !(st.currentLevel === 11 && lv.n === 10)) continue;
        const best = st.bestAt(lv.n);
        if (best === null) continue;   // no score yet → no marker
        chips.push({ name: s.name, timeMs: best, topPct: chipTopPct(best, lv.idealMs), isMe: false, icon: s.profileIcon, id: s.id });
      }
    }
    return chips.sort((a, b) => a.timeMs - b.timeMs);
  };

  // ─── TEST OVERLAY ────────────────────────────────────────────────────────
  if ((phase === 'countdown' || phase === 'running' || phase === 'result') && level) {
    const nearIdeal = elapsedMs >= level.idealMs * 0.8;
    const overIdeal = elapsedMs > level.idealMs;
    const item = items[itemIdx] ?? '';
    const passedResult = elapsedMs <= level.idealMs;

    return (
      <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: 'linear-gradient(165deg,#0f172a 0%,#1e293b 100%)' }}>
        {/* top bar: exit · level · timer · progress */}
        <div className="flex-shrink-0 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 pb-2" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
          <button onClick={exitTest} className="px-3 py-1.5 rounded-xl bg-white/10 text-white/80 text-sm font-bold hover:bg-white/20 transition-colors">✕ Exit</button>
          <span className="px-3 py-1.5 rounded-xl text-sm font-black text-white" style={{ background: level.color }}>
            Level {level.n}
          </span>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {buzzes > 0 && <span className="text-amber-400 text-sm font-bold">⚡ {buzzes}</span>}
            <span className="text-white/50 text-sm font-bold tabular-nums">{itemIdx + 1} / 10</span>
            {/* Quranic font — same list as the main Quran page */}
            <div className="relative">
              <button
                onClick={() => setFontMenuOpen(o => !o)}
                aria-label="Select Quranic font"
                title="Quranic font"
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <span className="text-xl leading-none" style={{ fontFamily: 'Amiri Regular' }}>ع</span>
              </button>
              {fontMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFontMenuOpen(false)} />
                  <div className="absolute end-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-xl shadow-2xl ring-1 ring-black/10 z-20 py-1 max-h-[60vh] overflow-y-auto">
                    <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quranic font</div>
                    {QURANIC_FONTS.map(f => (
                      <button
                        key={f.name}
                        onClick={() => { setFont(f.name); setFontMenuOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 ${font === f.name ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-semibold' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                      >
                        <span style={{ fontFamily: f.name }}>{f.displayName}</span>
                        {font === f.name && <span className="text-teal-600 dark:text-teal-400">✓</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* timer */}
        <div className="flex-shrink-0 text-center">
          <span className={`text-6xl sm:text-7xl font-black tabular-nums transition-colors ${overIdeal ? 'text-red-500 animate-pulse' : nearIdeal ? 'text-red-400' : 'text-white'}`}>
            {fmtTime(elapsedMs)}
          </span>
          <p className="text-white/40 text-xs font-bold mt-1 uppercase tracking-widest">ideal {fmtTime(level.idealMs)}</p>
        </div>

        {/* progress dots */}
        <div className="flex-shrink-0 flex justify-center gap-1.5 mt-2">
          {items.map((_, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i < itemIdx ? 'bg-emerald-400' : i === itemIdx && phase === 'running' ? 'bg-white' : 'bg-white/20'}`} />
          ))}
        </div>

        {/* the segment — live-logging rendering */}
        <div className="flex-1 min-h-0 flex items-center justify-center px-2 sm:px-4 py-3 overflow-hidden">
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
                <button onClick={() => setPhase('ladder')} className="px-6 py-2.5 rounded-2xl font-bold bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">
                  Back to levels
                </button>
              </div>
            </div>
          ) : (
            <div className={`w-full h-full bg-[#fdf8ee] rounded-3xl border-4 px-3 sm:px-8 py-4 sm:py-6 shadow-2xl overflow-hidden ${shaking ? 'fl-shake' : ''}`}
              style={{ borderColor: shaking ? '#ef4444' : '#fcd34d' }}>
              {/* Measured box — the segment is scaled to fill it exactly. */}
              <div ref={textBoxRef} className="w-full h-full flex items-center justify-center overflow-hidden">
                <p ref={textRef} key={itemIdx} dir="rtl" className="font-quranic text-slate-900 fl-pop w-full text-center" style={{ fontSize: '4rem', lineHeight: 2.2 }}>
                  {item.split(' ').map((w, i, arr) => (
                    <React.Fragment key={i}>{renderWordWithMarks(w, `f${i}`, 2.2)}{i < arr.length - 1 ? ' ' : ''}</React.Fragment>
                  ))}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* tutor buttons */}
        {phase === 'running' && (
          <div className="flex-shrink-0 px-3 sm:px-4 pt-2 flex gap-3 sm:gap-4 justify-center" style={{ paddingBottom: 'calc(0.9rem + env(safe-area-inset-bottom))' }}>
            <button onClick={handleBuzz} aria-keyshortcuts="N"
              className="flex-1 max-w-[15rem] py-3 sm:py-4 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black text-lg sm:text-xl shadow-lg shadow-red-950/40 ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
              <span>⚡ Buzz</span>
              <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">N</kbd>
            </button>
            <button onClick={handlePassed} aria-keyshortcuts="M"
              className="flex-1 max-w-[15rem] py-3 sm:py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-lg sm:text-xl shadow-lg shadow-emerald-950/40 ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
              <span>✓ Passed</span>
              <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">M</kbd>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── CHALLENGE PAGE — where a ladder click lands ─────────────────────────
  if (phase === 'challenge' && level) {
    const isPassed = myStanding.passed(level.n);
    const best = myStanding.bestAt(level.n);
    const recent = [...myStanding.attempts(level.n)].reverse().slice(0, 6);
    return (
      <div className="max-w-xl mx-auto">
        <button onClick={() => setPhase('ladder')}
          className="mb-4 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-sm font-bold text-slate-600 dark:text-slate-300 shadow-sm hover:border-slate-400 transition-colors">
          ← All levels
        </button>
        <div className="bg-white dark:bg-gray-800 rounded-3xl border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="px-6 py-7 text-white"
            style={{ background: `linear-gradient(135deg, ${level.color}, color-mix(in srgb, ${level.color} 70%, black))` }}>
            <div className="flex items-center gap-4">
              <span className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center font-black text-3xl">{level.n}</span>
              <div>
                <h3 className="font-black text-2xl leading-tight">Level {level.n}{isPassed && ' · passed ✓'}</h3>
                <p className="text-sm font-semibold opacity-90 mt-0.5">
                  10 segments of ~{level.letters} letters · ideal time {fmtTime(level.idealMs)}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-2 gap-3">
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
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-3">
              The student reads each segment aloud — press <b className="text-emerald-600">Passed</b> to move on,
              <b className="text-red-500"> Buzz</b> on a stumble. The clock never stops.
            </p>

            {recent.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Recent attempts</p>
                <div className="space-y-1.5">
                  {recent.map(a => (
                    <div key={a.id} className="group flex items-center gap-2 text-sm rounded-lg bg-slate-50 dark:bg-gray-700/40 px-3 py-1.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.passed ? 'bg-emerald-500' : 'bg-red-400'}`} />
                      <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">{fmtTime(a.timeMs)}</span>
                      {a.buzzes > 0 && <span className="text-amber-500 text-xs font-bold">⚡{a.buzzes}</span>}
                      <span className="ms-auto text-xs text-slate-400">
                        {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>
                      <button
                        onClick={() => removeAttempt(a)}
                        disabled={deletingId === a.id}
                        title="Remove this score"
                        aria-label={`Remove the ${fmtTime(a.timeMs)} score`}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-white hover:bg-red-500 disabled:opacity-40 transition-colors sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                      >
                        {deletingId === a.id ? '…' : '✕'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── LADDER — a thermometer column: each level is an ideal-time "gate" on
  // top of its colored block; score diamonds point at where a run landed
  // (on the gate = beat the ideal, below it = how far past). ────────────────
  const GATE_H = 48, BLOCK_H = 96;   // px — marker anchors are computed from these
  const AVATAR = 40, AV_BOX = AVATAR + 6;  // icon + its ring padding
  const PASSED = '#16a34a';          // finished levels + their gates go green
  const allDone = myStanding.currentLevel === 11;
  /** The highest level this student has a score on — the only one that shows
   *  their avatar; lower levels just carry the number. */
  const myTopScored = FLUENCY_LEVELS.reduce((top, lv) => myStanding.bestAt(lv.n) !== null ? lv.n : top, 0);
  /** Stable colour for a student's initial-letter avatar (no Lottie icon set). */
  const avatarHue = (name: string): number =>
    [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);

  const diamondLabel = (ms: number): string => ms < 100_000 ? (ms / 1000).toFixed(2) : fmtTime(ms);

  return (
    <div className="max-w-2xl mx-auto">
      {/* header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">⏱️ Fluency Test</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {student.name} · {allDone ? 'all 10 levels passed 🏆' : <>currently on <b className="text-slate-700 dark:text-slate-200">Level {myStanding.currentLevel}</b></>}
            </p>
          </div>
          {/* the whole control toggles — the label text used to be dead */}
          <label onClick={() => setShowAll(v => !v)} className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Show all students</span>
            <span
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showAll ? 'bg-teal-600' : 'bg-slate-300 dark:bg-gray-600'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showAll ? 'translate-x-6' : 'translate-x-1'}`} />
            </span>
          </label>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 py-8 shadow-sm overflow-x-auto">
        {allDone && <div className="text-center pb-3 text-4xl" title="All levels passed">🏆</div>}

        {/* The column. Centered; diamonds hang off the right side. */}
        <div className="w-44 mx-auto">
          {[...FLUENCY_LEVELS].reverse().map(lv => {
            const isPassed = myStanding.passed(lv.n);
            const allChips = chipsFor(lv);
            const myChips = allChips.filter(c => c.isMe);
            const otherChips = allChips.filter(c => !c.isMe).slice(0, 3);
            return (
              <div key={lv.n} className="relative">
                <button
                  onClick={() => { setSelectedLevel(lv.n); setPhase('challenge'); }}
                  className="block w-full group"
                  aria-label={`Level ${lv.n} — open challenge`}
                >
                  {/* gate: this level's ideal time — the bar a run must beat */}
                  <div
                    className="relative z-10 mx-auto w-44 flex items-center justify-center rounded-lg text-white font-black text-lg transition-transform group-hover:scale-[1.04] group-active:scale-95"
                    style={{
                      height: GATE_H,
                      background: `color-mix(in srgb, ${isPassed ? PASSED : lv.color} 82%, white)`,
                      border: `6px solid color-mix(in srgb, ${isPassed ? PASSED : lv.color} 62%, black)`,
                    }}
                  >
                    {Math.round(lv.idealMs / 1000)} s
                  </div>
                  {/* body: grey once passed, colored otherwise */}
                  <div
                    className="mx-auto w-36 flex items-center justify-center text-white font-black text-4xl transition-all group-hover:brightness-95"
                    style={{ height: BLOCK_H, background: isPassed ? PASSED : lv.color }}
                  >
                    {lv.n}
                  </div>
                </button>

                {/* Score markers: THIS student's on the right of the column,
                    everyone else's on the left. A marker is the student's
                    avatar with their name and score in small text under it. */}
                {[...myChips.map(c => ({ c, side: 'right' as const })),
                  ...otherChips.map(c => ({ c, side: 'left' as const }))].map(({ c, side }, idx) => {
                  const i = side === 'right' ? idx : idx - myChips.length;
                  const topPx = c.timeMs <= lv.idealMs
                    ? GATE_H / 2
                    : GATE_H + 8 + (c.topPct / 100) * (BLOCK_H - 22);
                  // This student keeps the avatar only on their best-reached
                  // level; the levels below it just carry the number.
                  const withAvatar = !c.isMe || lv.n === myTopScored;
                  const marker = withAvatar ? (
                    <div className="flex flex-col items-center" title={`${c.name} · ${diamondLabel(c.timeMs)}`}>
                      {/* transparent behind the avatar — only the ring shows */}
                      <div
                        className={`rounded-full flex items-center justify-center ${c.isMe ? 'ring-2 ring-teal-500' : 'ring-2 ring-slate-300 dark:ring-gray-500'}`}
                        style={{ width: AV_BOX, height: AV_BOX }}
                      >
                        {c.icon
                          ? <StudentProfileIcon src={c.icon} size={AVATAR} mode="always" />
                          : <span
                              className="rounded-full flex items-center justify-center text-base font-black text-white"
                              style={{ width: AVATAR, height: AVATAR, background: `hsl(${avatarHue(c.name)} 62% 45%)` }}
                            >{c.name.trim().charAt(0).toUpperCase()}</span>}
                      </div>
                      <p className="mt-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[68px] truncate leading-tight">
                        {c.name.split(' ')[0]}
                      </p>
                      <p className={`text-[10px] font-black tabular-nums leading-tight ${c.isMe ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {diamondLabel(c.timeMs)}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center" style={{ height: AV_BOX }} title={`${c.name} · ${diamondLabel(c.timeMs)}`}>
                      <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 text-[11px] font-black tabular-nums shadow-sm">
                        {diamondLabel(c.timeMs)}
                      </span>
                    </div>
                  );
                  // the connector leaves the column at the avatar's mid-height
                  const line = (
                    <div className="h-1.5 w-6 rounded bg-slate-400 dark:bg-slate-500"
                      style={{ marginTop: AV_BOX / 2 - 3, opacity: i === 0 ? 1 : 0 }} />
                  );
                  return (
                    <div key={`${c.id}-${c.name}-${idx}`} className="absolute flex items-start z-20 pointer-events-none"
                      style={side === 'right'
                        ? { top: topPx, left: 'calc(50% + 88px)', transform: `translateY(-${AV_BOX / 2}px)`, marginLeft: i * 76 }
                        : { top: topPx, right: 'calc(50% + 88px)', transform: `translateY(-${AV_BOX / 2}px)`, marginRight: i * 76 }}>
                      {side === 'right' ? <>{line}{marker}</> : <>{marker}{line}</>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-6 text-center px-6 leading-relaxed">
          Tap a level to open its challenge. Green = passed (tap to retake).
          A marker beside the <b>gate</b> beat that level's ideal time; below it, the further down, the further past the ideal it finished.
        </p>
      </div>
    </div>
  );
};

export default FluencyTestPage;
