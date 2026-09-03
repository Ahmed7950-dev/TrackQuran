// components/LetterFormDrill.tsx
// -----------------------------------------------------------------------------
// Letter-form drill (adult mode) — only the letters the tutor chose, shown one
// at a time in a random position (isolated, beginning, middle, end) carrying one
// of the three short vowels (fatha, damma, kasra). Fluency-test presentation,
// ITEM_MS per letter, graded Correct / Wrong by the tutor.
//
// The tutor sets how many times each letter should appear before starting, so a
// two-letter set can still make a long drill.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../context/I18nProvider';

const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
export const VOWELS = [FATHA, DAMMA, KASRA];
const VOWEL_NAME: Record<string, string> = { [FATHA]: 'Fatha', [DAMMA]: 'Damma', [KASRA]: 'Kasra' };

type Form = 'isolated' | 'initial' | 'medial' | 'final';
const FORMS: Form[] = ['isolated', 'initial', 'medial', 'final'];
const FORM_NAME: Record<Form, string> = { isolated: 'Isolated', initial: 'Beginning', medial: 'Middle', final: 'End' };
/** These never connect to the LEFT, so they have only two real shapes. */
const NON_CONNECTORS = new Set(['ا', 'و', 'ر', 'ز', 'د', 'ذ']);

export const ITEM_MS = 3000;          // three seconds per letter
export const MAX_REPEATS = 20;

export interface DrillItem { letter: string; form: Form; vowel: string }

/** ZWJ/ZWNJ forces the positional glyph; the vowel rides on the letter itself. */
export const renderItem = (it: DrillItem): string => {
  const core = it.letter + it.vowel;
  switch (it.form) {
    case 'initial': return `${core}‍`;
    case 'medial':  return `‍${core}‍`;
    case 'final':   return `‍${core}`;
    default:        return `‌${core}‌`;
  }
};

/** Each chosen letter `repeats` times, in random form + vowel, shuffled. */
export function buildDrill(letters: string[], repeats: number): DrillItem[] {
  const items: DrillItem[] = [];
  for (const letter of letters) {
    for (let i = 0; i < repeats; i++) {
      let form = FORMS[Math.floor(Math.random() * FORMS.length)];
      if (NON_CONNECTORS.has(letter) && (form === 'initial' || form === 'medial')) {
        form = form === 'initial' ? 'isolated' : 'final';
      }
      items.push({ letter, form, vowel: VOWELS[Math.floor(Math.random() * VOWELS.length)] });
    }
  }
  for (let i = items.length - 1; i > 0; i--) {          // shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

type Phase = 'setup' | 'running' | 'done';

const LetterFormDrill: React.FC<{
  letters: string[];
  onExit: () => void;
  onFinish?: (correct: number, total: number, repeats: number) => void;
}> = ({ letters, onExit, onFinish }) => {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('setup');
  const [repeats, setRepeats] = useState(3);
  const [items, setItems] = useState<DrillItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState(0);          // ran out of time
  const [remaining, setRemaining] = useState(ITEM_MS);
  const doneRef = useRef(false);
  const gradedRef = useRef(false);                  // this item already answered

  const start = () => {
    const built = buildDrill(letters, Math.max(1, Math.min(MAX_REPEATS, repeats)));
    setItems(built); setIdx(0); setCorrect(0); setMissed(0);
    doneRef.current = false; gradedRef.current = false;
    setRemaining(ITEM_MS);
    setPhase('running');
  };

  const grade = useCallback((wasCorrect: boolean, timedOut = false) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    if (wasCorrect) setCorrect(c => c + 1);
    if (timedOut) setMissed(m => m + 1);
    setIdx(prev => {
      const next = prev + 1;
      if (next >= items.length && !doneRef.current) {
        doneRef.current = true;
        onFinish?.(correct + (wasCorrect ? 1 : 0), items.length, repeats);
        setPhase('done');
      } else {
        gradedRef.current = false;
        setRemaining(ITEM_MS);
      }
      return next;
    });
  }, [items.length, correct, repeats, onFinish]);

  // Timed exposure (ITEM_MS). Running out counts as missed — this is a speed
  // drill, and the on-screen wording reads the same constant so the two can
  // never disagree.
  useEffect(() => {
    if (phase !== 'running') return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      const left = ITEM_MS - (Date.now() - started);
      setRemaining(left > 0 ? left : 0);
      if (left <= 0) { window.clearInterval(tick); grade(false, true); }
    }, 50);
    return () => window.clearInterval(tick);
  }, [phase, idx, grade]);

  // Same keys as the other challenges: N = wrong, M = correct.
  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); grade(false); }
      else if (k === 'm') { e.preventDefault(); grade(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, grade]);

  const total = useMemo(() => letters.length * Math.max(1, Math.min(MAX_REPEATS, repeats)), [letters.length, repeats]);

  if (phase === 'setup') {
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-4xl mb-2">🔤</p>
        <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 mb-1">{t('letterDrill.title')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('letterDrill.intro', { seconds: ITEM_MS / 1000 })}</p>

        <label className="block text-start mb-5">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1">
            {t('letterDrill.repeatsLabel')}
          </span>
          <input
            type="number" min={1} max={MAX_REPEATS} value={repeats}
            onChange={e => setRepeats(Math.max(1, Math.min(MAX_REPEATS, parseInt(e.target.value || '1', 10) || 1)))}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-center text-lg font-black"
          />
          <span className="block mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t('letterDrill.totalHint', { letters: letters.length, total })}
          </span>
        </label>

        <button onClick={start} disabled={letters.length === 0}
          className="w-full py-3 rounded-xl bg-teal-600 dark:bg-amber-600 text-white font-black disabled:opacity-40 hover:bg-teal-700 transition-colors">
          {t('letterDrill.start')}
        </button>
        <button onClick={onExit} className="mt-3 w-full py-2 text-sm font-semibold text-slate-400 hover:text-slate-600">
          {t('letterDrill.back')}
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const pct = items.length ? Math.round((correct / items.length) * 100) : 0;
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-center">
        <p className="text-5xl mb-3">{pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</p>
        <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">{t('letterDrill.finished')}</h3>
        <p className="text-4xl font-black my-4 text-teal-600 dark:text-orange-400 tabular-nums">{correct} / {items.length}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          {t('letterDrill.scoreHint', { percent: pct })}{missed > 0 ? ` · ${t('letterDrill.missedHint', { count: missed })}` : ''}
        </p>
        <button onClick={onExit}
          className="px-6 py-2.5 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-bold hover:bg-teal-700">
          {t('letterDrill.back')}
        </button>
      </div>
    );
  }

  const item = items[idx];
  const pctBar = (remaining / ITEM_MS) * 100;

  return (
    <div className="max-w-3xl mx-auto px-4 pb-10">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onExit}
          className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 hover:border-slate-400 flex-shrink-0">
          {t('letterDrill.exit')}
        </button>
        <div className="flex-1 h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-gray-700">
          <div className="h-full bg-teal-500 dark:bg-amber-500 transition-all duration-300"
            style={{ width: `${items.length ? (idx / items.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums text-slate-500 dark:text-slate-300 flex-shrink-0">{idx + 1} / {items.length}</span>
        <span className="text-sm font-black tabular-nums text-teal-600 dark:text-orange-400 flex-shrink-0">{correct}</span>
      </div>

      {/* One-second exposure bar */}
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden mb-3">
        <div className={`h-full ${pctBar > 33 ? 'bg-emerald-400' : 'bg-red-400'}`} style={{ width: `${pctBar}%`, transition: 'width 50ms linear' }} />
      </div>

      <div dir="rtl" className="rounded-3xl border-2 border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center px-6 py-16 mb-3">
        <span className="font-quranic leading-[1.8]" style={{ fontSize: 'clamp(4rem, 22vw, 11rem)' }}>
          {item ? renderItem(item) : ''}
        </span>
      </div>
      {item && (
        <p className="text-center text-xs font-bold text-slate-400 dark:text-slate-500 mb-5">
          {FORM_NAME[item.form]} · {VOWEL_NAME[item.vowel]}
        </p>
      )}

      <div className="flex items-center justify-center gap-3">
        <button onClick={() => grade(false)} aria-keyshortcuts="N"
          className="flex-1 max-w-[15rem] py-4 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black text-lg shadow-lg ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
          <span>✗ {t('letterDrill.wrong')}</span>
          <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">N</kbd>
        </button>
        <button onClick={() => grade(true)} aria-keyshortcuts="M"
          className="flex-1 max-w-[15rem] py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-lg shadow-lg ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
          <span>✓ {t('letterDrill.correct')}</span>
          <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">M</kbd>
        </button>
      </div>
      <p className="text-center text-[11px] text-slate-400 mt-3">{t('letterDrill.timeoutNote', { seconds: ITEM_MS / 1000 })}</p>
    </div>
  );
};

export default LetterFormDrill;
