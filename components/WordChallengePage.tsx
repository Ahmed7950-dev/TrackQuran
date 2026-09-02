// components/WordChallengePage.tsx
// -----------------------------------------------------------------------------
// Word challenge — the tutor picks letters in the Alphabet tab, then chooses on
// the setup screen which reading rules to test (fatha, kasra, damma, madd,
// shaddah, sukoon, tanween, hamzat al-wasl, ta marbuta, iltiqaa as-sakinayn,
// lafz al-jalalah). The student reads 20 Qur'anic items containing the chosen
// letters; a two-word category shows BOTH words, because the phenomenon only
// exists across the join. Same presentation as the fluency test (one big segment
// drawn with renderWordWithMarks so the hand-patched fonts and mark overlays
// apply) and the same two-key grading, but untimed: the tutor taps Correct or
// Wrong, a wrong answer simply moves on — nothing restarts — and the run ends
// with a score out of 20.
//
// The categories and their predicates live in utils/quranWordCategories.ts; this
// file only renders whatever the registry contains, so the coming tajweed half
// needs no change here beyond its i18n labels.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderWordWithMarks } from '../utils/quranicMarks';
import {
  buildChallengeItems, WORD_CATEGORIES,
  type CategoryId, type ChallengeItem, type CategoryReport,
} from '../utils/quranWordCategories';
import { useI18n } from '../context/I18nProvider';

export const WORD_CHALLENGE_TOTAL = 20;

// Re-exported so existing importers keep working; the implementations moved to
// utils/quranWordCategories.ts where they can be unit-tested without React.
export { baseLettersOf, wordHasAnyLetter, buildWordItems } from '../utils/quranWordCategories';

type Phase = 'setup' | 'loading' | 'running' | 'done';

/** A run's frozen configuration. Set ONCE, when the tutor presses Start. */
interface RunConfig { run: number; letters: string[]; categories: CategoryId[]; }

const WordChallengePage: React.FC<{
  letters: string[];
  /** Reports the finished run so it can enter the student's logbook. */
  onFinish?: (correct: number, total: number) => void;
  onExit: () => void;
  childMode?: boolean;
}> = ({ letters, onFinish, onExit, childMode = false }) => {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('setup');
  const [selected, setSelected] = useState<CategoryId[]>([]);
  const [items, setItems] = useState<ChallengeItem[]>([]);
  const [reports, setReports] = useState<CategoryReport[]>([]);
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'no' | null>(null);
  const finishedRef = useRef(false);

  // ── The restart bug ───────────────────────────────────────────────────────
  // The parent hands us a NEW `letters` array on every render
  // (AlphabetTrainerPage: LETTERS.filter(...) is rebuilt each time), so an effect
  // keyed on the array IDENTITY rebuilt the whole run whenever the parent
  // re-rendered — worst of all at the run's own end: onFinish → onLogActivity →
  // App setStudents → parent render → new array → rebuild, which swallowed the
  // score screen and started a fresh 20-word challenge. (It only bit the first
  // run of the day per letter set, because withActivityLog returns the same
  // student for an already-logged event and setStudents then bails out.)
  //
  // Fix: the build depends on nothing the parent owns. Pressing Start snapshots
  // the letters and categories into `cfg`, a state object whose identity changes
  // only on that click, and the effect keys on `cfg`. Parent re-renders — and the
  // header's live "log to" / hardcore / child-mode controls — are now no-ops for
  // a running or finished run. Deliberately NOT a ref guard: a ref survives
  // StrictMode's simulated remount, which would cancel the first build and skip
  // the second, leaving 'loading' on screen forever in dev.
  const [cfg, setCfg] = useState<RunConfig | null>(null);
  const runNoRef = useRef(0);
  const lettersKey = letters.join('|');

  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    setPhase('loading');
    buildChallengeItems({
      letters: cfg.letters,
      categories: cfg.categories,
      count: WORD_CHALLENGE_TOTAL,
    }).then(built => {
      if (!alive) return;
      setItems(built.items);
      setReports(built.reports);
      setIdx(0); setCorrect(0); finishedRef.current = false;
      setPhase(built.items.length > 0 ? 'running' : 'done');
    }).catch(() => { if (alive) { setItems([]); setReports([]); setPhase('done'); } });
    return () => { alive = false; };
  }, [cfg]);

  const start = useCallback(() => {
    runNoRef.current += 1;
    setCfg({
      run: runNoRef.current,
      letters: lettersKey ? lettersKey.split('|') : [],
      categories: selected.slice(),
    });
  }, [lettersKey, selected]);

  const advance = useCallback((wasCorrect: boolean) => {
    if (finishedRef.current) return;                 // a late key after the last item
    setFlash(wasCorrect ? 'ok' : 'no');
    window.setTimeout(() => setFlash(null), 260);
    const total       = items.length;
    const nextIdx     = idx + 1;
    const nextCorrect = correct + (wasCorrect ? 1 : 0);
    setCorrect(nextCorrect);
    setIdx(nextIdx);
    // Ending the run happens HERE, in the event handler — not inside a setState
    // updater, where it ran during render: React 19 warns about updating App from
    // another component's render, and StrictMode double-invokes updaters.
    // (Click and keydown are discrete events, flushed synchronously, so `idx` and
    // `correct` are fresh on every press.)
    if (nextIdx >= total) {
      finishedRef.current = true;
      onFinish?.(nextCorrect, total);                // score includes this answer
      setPhase('done');
    }
  }, [idx, correct, items.length, onFinish]);

  // Same two keys as the fluency test: N = wrong, M = correct.
  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); advance(false); }
      else if (k === 'm') { e.preventDefault(); advance(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, advance]);

  const item = items[idx];
  const pct = items.length ? Math.round(((idx + 1) / items.length) * 100) : 0;
  const scoreLine = useMemo(() => `${correct} / ${items.length || WORD_CHALLENGE_TOTAL}`, [correct, items.length]);

  const catName = useCallback((id: CategoryId | 'letters'): string =>
    id === 'letters' ? t('wordChallenge.cat.letters') : t(`wordChallenge.cat.${id}`), [t]);

  /** Categories that could not be served as asked — shown, never silently faked. */
  const notices = useMemo(() => reports.filter(r => r.empty || r.relaxed), [reports]);

  const backToSetup = () => { setCfg(null); setItems([]); setReports([]); setPhase('setup'); };

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    const toggle = (id: CategoryId) =>
      setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    return (
      <div className="max-w-3xl mx-auto px-4 pb-12">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onExit}
            className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400">
            {t('wordChallenge.exit')}
          </button>
        </div>
        <h3 className={`text-2xl font-black mb-1 ${childMode ? 'text-blue-700' : 'text-slate-800 dark:text-slate-100'}`}>
          {t('wordChallenge.setupTitle')}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">
          {t('wordChallenge.setupIntro', { count: WORD_CHALLENGE_TOTAL, letters: letters.length })}
        </p>
        <p dir="rtl" className="font-quranic text-2xl text-teal-700 dark:text-orange-300 mb-6">{letters.join(' ')}</p>

        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          {t('wordChallenge.categories')}
        </h4>
        <div className="flex flex-wrap gap-2 mb-3">
          {WORD_CATEGORIES.map(cat => {
            const on = selected.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => toggle(cat.id)}
                aria-pressed={on}
                className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors flex items-center gap-2 ${
                  on
                    ? 'bg-teal-600 dark:bg-orange-600 border-teal-600 dark:border-orange-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-teal-400'}`}
              >
                <span>{catName(cat.id)}</span>
                {cat.arity === 2 && (
                  <span className={`text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    on ? 'bg-white/20' : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400'}`}>
                    {t('wordChallenge.pairBadge')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
          {selected.length === 0
            ? t('wordChallenge.categoriesHint')
            : t('wordChallenge.categoriesChosen', { count: selected.length })}
        </p>

        <div className="flex items-center gap-3">
          <button onClick={start}
            className="px-6 py-2.5 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-bold hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors">
            {t('wordChallenge.start')}
          </button>
          {selected.length > 0 && (
            <button onClick={() => setSelected([])}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700">
              {t('wordChallenge.clear')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">{t('wordChallenge.loading')}</p>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const total = items.length || WORD_CHALLENGE_TOTAL;
    const pctScore = total ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        {items.length === 0 ? (
          <>
            <p className="text-5xl mb-3">🔍</p>
            <h3 className="text-xl font-black mb-2 text-slate-800 dark:text-slate-100">{t('wordChallenge.nothingFound')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('wordChallenge.nothingFoundHint')}</p>
          </>
        ) : (
          <>
            <p className="text-5xl mb-3">{pctScore >= 80 ? '🏆' : pctScore >= 50 ? '👏' : '💪'}</p>
            <h3 className={`text-2xl font-black mb-1 ${childMode ? 'text-blue-700' : 'text-slate-800 dark:text-slate-100'}`}>
              {t('wordChallenge.finished')}
            </h3>
            <p className="text-4xl font-black my-4 text-teal-600 dark:text-orange-400 tabular-nums">{correct} / {total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('wordChallenge.scoreHint', { percent: pctScore })}</p>
          </>
        )}
        <div className="flex items-center justify-center gap-3">
          <button onClick={backToSetup}
            className="px-6 py-2.5 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-bold hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors">
            {t('wordChallenge.again')}
          </button>
          <button onClick={onExit}
            className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 font-bold hover:border-slate-400 transition-colors">
            {t('wordChallenge.back')}
          </button>
        </div>
      </div>
    );
  }

  // ── Running ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 pb-10">
      {/* Progress row */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={onExit}
          className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 flex-shrink-0">
          {t('wordChallenge.exit')}
        </button>
        <div className="flex-1 h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-gray-700">
          <div className="h-full rounded-full bg-teal-500 dark:bg-amber-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums text-slate-500 dark:text-slate-300 flex-shrink-0">
          {idx + 1} / {items.length}
        </span>
        <span className="text-sm font-black tabular-nums text-teal-600 dark:text-orange-400 flex-shrink-0">{scoreLine}</span>
      </div>

      {/* What this item is testing */}
      {item && (
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-300">
            {catName(item.category)}
          </span>
          {item.variant && (
            <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-300">
              {t(`wordChallenge.variant.${item.variant}`)}
            </span>
          )}
          {item.relaxed && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-gray-800 text-[11px] font-bold text-slate-400 dark:text-slate-500">
              {t('wordChallenge.withoutLetters')}
            </span>
          )}
        </div>
      )}

      {/* The item — same rendering path as the fluency test. A 2-word item shows
          both words side by side so the phenomenon at the join is visible. */}
      <div
        dir="rtl"
        className={`rounded-3xl border-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-center px-6 py-14 mb-4 transition-colors ${
          flash === 'ok' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
          : flash === 'no' ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
          : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
      >
        {(item?.words ?? []).map((w, i) => (
          <span key={i} className="font-quranic leading-[2.2]" style={{ fontSize: 'clamp(2.6rem, 11vw, 5.5rem)' }}>
            {renderWordWithMarks(w, `wc${idx}_${i}`, 2.2)}
          </span>
        ))}
      </div>

      {/* Categories that could not be served as asked */}
      {notices.length > 0 && (
        <div className="mb-4 text-center text-[11px] text-amber-600 dark:text-amber-400 space-y-0.5">
          {notices.map(r => (
            <p key={r.id}>
              {r.empty
                ? t('wordChallenge.noticeEmpty', { category: catName(r.id) })
                : t('wordChallenge.noticeRelaxed', { category: catName(r.id) })}
            </p>
          ))}
        </div>
      )}

      {/* Grading — wrong just moves on */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={() => advance(false)} aria-keyshortcuts="N"
          className="flex-1 max-w-[15rem] py-4 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black text-lg shadow-lg shadow-red-950/30 ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
          <span>✗ {t('wordChallenge.wrong')}</span>
          <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">N</kbd>
        </button>
        <button onClick={() => advance(true)} aria-keyshortcuts="M"
          className="flex-1 max-w-[15rem] py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-lg shadow-lg shadow-emerald-950/30 ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
          <span>✓ {t('wordChallenge.correct')}</span>
          <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">M</kbd>
        </button>
      </div>
    </div>
  );
};

export default WordChallengePage;
