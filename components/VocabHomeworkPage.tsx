// ─────────────────────────────────────────────────────────────────────────────
// VocabHomeworkPage — /vocab-homework/:id, no sign-in needed.
//
// One English word sits in the middle; ten Arabic words (the right one among
// them) orbit slowly around it. The student has 10 seconds to tap the right
// one. A wrong tap or running out of time loses the word and shows the answer,
// then the next word comes. At the end the score is saved (first finish only)
// and the tutor is notified.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  HOMEWORK_SECONDS_PER_WORD, HomeworkResult, HomeworkWord, VocabHomework,
  completeHomework, getVocabHomework, homeworkOptions, isHomeworkExpired,
} from '../services/vocabHomeworkService';

type Stage = 'loading' | 'missing' | 'intro' | 'playing' | 'finished';

interface Reveal { picked: string | null; correct: boolean }

const shuffle = <T,>(a: T[]): T[] => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

const fmtWhen = (d: string): string =>
  new Date(d).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

const ORBIT_SECONDS = 70;         // one slow lap around the English word
const REVEAL_RIGHT_MS = 750;
const REVEAL_WRONG_MS = 1600;

const goBack = () => {
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
};

const VocabHomeworkPage: React.FC<{ homeworkId: string }> = ({ homeworkId }) => {
  const [hw, setHw] = useState<VocabHomework | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [practice, setPractice] = useState(false);          // replay after finishing: nothing is saved
  const [deck, setDeck] = useState<HomeworkWord[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<HomeworkResult[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    document.title = 'Vocabulary homework';
    getVocabHomework(homeworkId).then(h => {
      setHw(h);
      setStage(h && h.status !== 'draft' && h.words.length ? 'intro' : 'missing');
    });
  }, [homeworkId]);

  const word = deck[idx];
  const options = useMemo(
    () => (word && hw ? homeworkOptions(word, hw.words, hw.distractors) : []),
    [word, hw],
  );

  const start = (asPractice: boolean) => {
    if (!hw) return;
    setPractice(asPractice);
    setDeck(shuffle(hw.words));
    setIdx(0);
    setResults([]);
    setReveal(null);
    setStage('playing');
  };

  // ── Answering ──────────────────────────────────────────────────────────────
  const revealRef = useRef<Reveal | null>(null);
  revealRef.current = reveal;
  const resultsRef = useRef<HomeworkResult[]>([]);
  resultsRef.current = results;

  const answer = (picked: string | null) => {
    if (!word || revealRef.current) return;
    const correct = picked === word.arabic;
    const r: Reveal = { picked, correct };
    revealRef.current = r;
    setReveal(r);
    const nextResults = [...resultsRef.current, { wordId: word.id, correct }];
    setResults(nextResults);
    window.setTimeout(() => {
      if (idx + 1 < deck.length) {
        setIdx(idx + 1);
        setReveal(null);
      } else {
        finish(nextResults);
      }
    }, correct ? REVEAL_RIGHT_MS : REVEAL_WRONG_MS);
  };
  const answerRef = useRef(answer);
  answerRef.current = answer;

  const finish = async (final: HomeworkResult[]) => {
    setStage('finished');
    if (!hw || practice || hw.status !== 'assigned') return;
    setSaving(true);
    const done = await completeHomework(hw, final);
    setSaving(false);
    if (done) setHw(done);
    else {
      // Someone finished it in another tab first — show what was stored.
      const fresh = await getVocabHomework(hw.id);
      if (fresh?.status === 'completed') setHw(fresh);
      else setSaveFailed(true);
    }
  };

  // ── The orbit + the timer (imperative, one rAF loop) ──────────────────────
  const arenaRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const timerRef = useRef<HTMLDivElement>(null);
  const secondsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (stage !== 'playing' || !options.length) return;
    const arena = arenaRef.current;
    if (!arena) return;

    // Arc-length table for the ellipse, so the chips are spaced evenly along
    // the path instead of bunching at the narrow ends.
    let rx = 0, ry = 0, total = 1;
    let table: Array<{ s: number; theta: number }> = [];
    const layout = () => {
      const W = arena.clientWidth, H = arena.clientHeight;
      let hw = 0, hh = 0;
      for (const el of chipRefs.current) {
        if (!el) continue;
        hw = Math.max(hw, el.offsetWidth / 2);
        hh = Math.max(hh, el.offsetHeight / 2);
      }
      rx = Math.max(30, W / 2 - hw - 6);
      ry = Math.max(30, H / 2 - hh - 6);
      const STEPS = 720;
      table = [{ s: 0, theta: 0 }];
      let s = 0, px = rx, py = 0;
      for (let i = 1; i <= STEPS; i++) {
        const th = (i / STEPS) * Math.PI * 2;
        const x = rx * Math.cos(th), y = ry * Math.sin(th);
        s += Math.hypot(x - px, y - py);
        table.push({ s, theta: th });
        px = x; py = y;
      }
      total = s || 1;
    };
    const thetaAt = (s: number): number => {
      let lo = 0, hi = table.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (table[mid].s < s) lo = mid + 1; else hi = mid; }
      return table[lo]?.theta ?? 0;
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(arena);

    const n = options.length;
    const phase0 = Math.random();
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      for (let i = 0; i < n; i++) {
        const el = chipRefs.current[i];
        if (!el) continue;
        const frac = (phase0 + i / n + t / ORBIT_SECONDS) % 1;
        const th = thetaAt(frac * total);
        const bob = Math.sin(t * 1.7 + i * 1.3) * 5;
        el.style.transform =
          `translate(calc(-50% + ${(rx * Math.cos(th)).toFixed(1)}px), calc(-50% + ${(ry * Math.sin(th) + bob).toFixed(1)}px))`;
      }
      if (!revealRef.current) {
        const left = Math.max(0, HOMEWORK_SECONDS_PER_WORD - t);
        if (timerRef.current) {
          timerRef.current.style.width = `${(left / HOMEWORK_SECONDS_PER_WORD) * 100}%`;
          timerRef.current.style.backgroundColor = left <= 3 ? '#f87171' : left <= 6 ? '#fbbf24' : '#34d399';
        }
        if (secondsRef.current) secondsRef.current.textContent = String(Math.ceil(left));
        if (left <= 0) answerRef.current(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [stage, options]);

  // ── Screens ────────────────────────────────────────────────────────────────
  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-gradient-to-br from-indigo-950 via-violet-950 to-slate-950 text-white px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );

  if (stage === 'loading') return shell(<p className="text-center text-violet-200">Loading your homework…</p>);

  if (stage === 'missing' || !hw) return shell(
    <div className="text-center space-y-3">
      <div className="text-6xl">🧺</div>
      <h1 className="text-2xl font-extrabold">Homework not found</h1>
      <p className="text-violet-200">This link doesn't lead to any homework. It may have been deleted — ask your teacher for a new link.</p>
    </div>,
  );

  const expired = isHomeworkExpired(hw);
  const byId = new Map(hw.words.map(w => [w.id, w] as [string, HomeworkWord]));

  const resultList = (list: HomeworkResult[]) => (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 divide-y divide-white/10 text-left max-h-[40vh] overflow-y-auto">
      {list.map((r, i) => {
        const w = byId.get(r.wordId);
        return (
          <div key={`${r.wordId}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${r.correct ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {r.correct ? '✓' : '✗'}
            </span>
            <span className="flex-1 min-w-0 truncate">{w?.english}</span>
            <span className="text-xl font-bold" dir="rtl">{w?.arabic}</span>
          </div>
        );
      })}
    </div>
  );

  // The homework's words, to study before playing — in the teacher's order.
  const wordTable = (
    <div className="text-left">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-300 mb-2">📖 Study the words first</p>
      <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 max-h-[45vh] overflow-y-auto">
        <table className="w-full table-fixed">
          <thead className="sticky top-0 bg-indigo-950/95 backdrop-blur">
            <tr className="text-[11px] uppercase tracking-wide text-violet-300">
              <th className="px-3 py-2 text-left font-bold w-[36%]">English</th>
              <th className="px-3 py-2 text-left font-bold">Transliteration</th>
              <th className="px-3 py-2 text-right font-bold w-[32%]">Arabic</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {hw.words.map(w => (
              <tr key={w.id}>
                <td className="px-3 py-2.5 font-semibold break-words">{w.english}</td>
                <td className="px-3 py-2.5 text-sm italic text-violet-200 break-words">{w.transliteration}</td>
                <td className="px-3 py-2.5 text-right text-2xl font-bold break-words" dir="rtl">{w.arabic}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (stage === 'intro') {
    if (hw.status === 'completed') return shell(
      <div className="text-center space-y-5">
        <div className="text-6xl">🏆</div>
        <h1 className="text-2xl font-extrabold">Homework done!</h1>
        <p className="text-violet-200">
          You got <b className="text-white">{hw.correctCount} of {hw.totalCount}</b> words right
          {hw.completedAt ? ` on ${fmtWhen(hw.completedAt)}` : ''}.
        </p>
        {hw.results && resultList(hw.results)}
        <button onClick={() => start(true)}
          className="w-full py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 font-bold">🔁 Practise again (not scored)</button>
      </div>,
    );
    if (expired) return shell(
      <div className="text-center space-y-3">
        <div className="text-6xl">⏰</div>
        <h1 className="text-2xl font-extrabold">The deadline has passed</h1>
        <p className="text-violet-200">This homework was due {fmtWhen(hw.deadline!)}. Ask your teacher for a new link.</p>
        {wordTable}
      </div>,
    );
    return shell(
      <div className="text-center space-y-6">
        <div className="text-7xl">🧺</div>
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold">Vocabulary homework</h1>
          {hw.studentName && <p className="text-violet-200">for {hw.studentName}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 py-4">
            <div className="text-3xl font-extrabold">{hw.words.length}</div>
            <div className="text-xs text-violet-200 uppercase tracking-wide">words</div>
          </div>
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 py-4">
            <div className="text-3xl font-extrabold">{HOMEWORK_SECONDS_PER_WORD}s</div>
            <div className="text-xs text-violet-200 uppercase tracking-wide">per word</div>
          </div>
        </div>
        <p className="text-violet-100 leading-relaxed">
          An English word appears in the middle, with Arabic words flying around it.
          <b className="text-white"> Tap the Arabic word with the same meaning</b> before the time runs out.
        </p>
        <p className="text-sm text-violet-300">
          {hw.deadline ? `Finish before ${fmtWhen(hw.deadline)}` : 'No deadline'}
        </p>
        {wordTable}
        <button onClick={() => start(false)}
          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-lg font-extrabold shadow-lg shadow-emerald-500/30">
          Start ▶
        </button>
      </div>,
    );
  }

  if (stage === 'finished') {
    const right = results.filter(r => r.correct).length;
    const pct = results.length ? right / results.length : 0;
    return shell(
      <div className="text-center space-y-5">
        <div className="text-7xl">{pct >= 0.8 ? '🏆' : pct >= 0.5 ? '🎉' : '💪'}</div>
        <h1 className="text-3xl font-extrabold">{pct >= 0.8 ? 'Excellent!' : pct >= 0.5 ? 'Well done!' : 'Keep practising!'}</h1>
        <p className="text-5xl font-extrabold">{right}<span className="text-violet-300 text-3xl"> / {results.length}</span></p>
        <p className="text-sm text-violet-200">
          {practice ? 'Practice round — this score was not sent.'
            : saving ? 'Sending your score to your teacher…'
              : saveFailed ? 'Your score could not be sent — check your connection and play again.'
                : 'Your teacher has your score. ✓'}
        </p>
        {resultList(results)}
        <div className="flex gap-3">
          <button onClick={() => start(true)} className="flex-1 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 font-bold">🔁 Practise again</button>
          <button onClick={goBack} className="flex-1 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 font-bold">Done</button>
        </div>
      </div>,
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  const right = results.filter(r => r.correct).length;
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-950 via-violet-950 to-slate-950 text-white flex flex-col overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-bold">Word {idx + 1} / {deck.length}</span>
          {practice && <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-bold">practice</span>}
          <span className="ml-auto font-bold text-emerald-300">✓ {right}</span>
          <span className="w-8 text-right font-mono font-bold"><span ref={secondsRef}>{HOMEWORK_SECONDS_PER_WORD}</span>s</span>
          <button onClick={() => { if (confirm('Leave the homework? Your progress in this round will be lost.')) setStage('intro'); }}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-lg leading-none" aria-label="Exit">×</button>
        </div>
        <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
          <div ref={timerRef} className="h-full rounded-full" style={{ width: '100%', backgroundColor: '#34d399' }} />
        </div>
      </div>

      {/* Arena */}
      <div ref={arenaRef} className="relative flex-1 m-2 sm:m-4">
        {/* The English word */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none
                        max-w-[34vw] sm:max-w-[40vw] text-center">
          <div className={`rounded-3xl px-4 sm:px-8 py-4 sm:py-6 ring-2 transition-colors duration-200 ${
            !reveal ? 'bg-white/10 ring-white/20'
              : reveal.correct ? 'bg-emerald-500/30 ring-emerald-400' : 'bg-red-500/25 ring-red-400'}`}>
            <p className="text-3xl sm:text-6xl font-extrabold leading-tight break-words">{word?.english}</p>
            {reveal && !reveal.correct && (
              <p className="mt-2 text-sm sm:text-base text-red-200 font-semibold">
                {reveal.picked ? 'Not quite' : "Time's up"} — it's <span className="text-white text-xl sm:text-2xl" dir="rtl">{word?.arabic}</span>
              </p>
            )}
          </div>
        </div>

        {/* The Arabic options */}
        {options.map((opt, i) => {
          const isAnswer = opt === word?.arabic;
          const state = !reveal ? 'idle'
            : isAnswer ? 'answer'
              : reveal.picked === opt ? 'wrong' : 'dim';
          return (
            <button key={`${idx}-${i}`}
              ref={el => { chipRefs.current[i] = el; }}
              onClick={() => answer(opt)}
              disabled={!!reveal}
              style={{ transform: 'translate(-50%, -50%)' }}
              className={`absolute left-1/2 top-1/2 z-10 max-w-[42vw] sm:max-w-[16rem] px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-2xl
                          text-xl sm:text-3xl font-bold leading-snug break-words shadow-lg will-change-transform
                          transition-[background-color,opacity,box-shadow] duration-200 ${
                state === 'idle' ? 'bg-white text-slate-900 hover:bg-amber-200 active:scale-95'
                  : state === 'answer' ? 'bg-emerald-400 text-slate-900 ring-4 ring-emerald-200 z-20'
                    : state === 'wrong' ? 'bg-red-500 text-white ring-4 ring-red-300 z-20'
                      : 'bg-white/30 text-slate-900 opacity-40'}`}
              dir="rtl">
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default VocabHomeworkPage;
