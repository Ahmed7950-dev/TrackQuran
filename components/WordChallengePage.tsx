// components/WordChallengePage.tsx
// -----------------------------------------------------------------------------
// Word challenge — the tutor picks letters in the Alphabet tab, and the student
// reads 20 random Qur'anic WORDS that contain those letters. Same presentation
// as the fluency test (one big segment on screen, drawn with renderWordWithMarks
// so the hand-patched fonts and mark overlays apply) and the same two-key
// grading, but untimed: the tutor taps Correct or Wrong, a wrong answer simply
// moves on — nothing restarts — and the run ends with a score out of 20.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVersesForSurah } from '../services/dataService';
import { splitVerseWords, renderWordWithMarks } from '../utils/quranicMarks';
import { useI18n } from '../context/I18nProvider';

export const WORD_CHALLENGE_TOTAL = 20;

/** Diacritics and connector marks — ignored when matching a chosen letter. */
const isMark = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed)
    || c === 0x0640 || c === 0x200c || c === 0x200d || c === 0x061c;
};

/** Alef/ya/waw/ha variants fold onto their base so "ا" matches أ إ آ ٱ. */
const FOLD: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ٰ': 'ا',
  'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه',
};

export const baseLettersOf = (word: string): string[] =>
  [...word].filter(ch => !isMark(ch)).map(ch => FOLD[ch] ?? ch).filter(ch => /[ء-ي]/.test(ch));

/** Does this word contain at least one of the chosen letters? */
export const wordHasAnyLetter = (word: string, letters: string[]): boolean => {
  const base = new Set(baseLettersOf(word));
  return letters.some(l => base.has(FOLD[l] ?? l));
};

/**
 * 20 distinct Qur'anic words containing the chosen letters. Words are 3+ base
 * letters (a two-letter particle is no challenge) and never repeat, even when
 * the same word occurs in different verses.
 */
export async function buildWordItems(letters: string[], count = WORD_CHALLENGE_TOTAL): Promise<string[]> {
  const items: string[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (items.length < count && guard++ < 900) {
    const surah = 1 + Math.floor(Math.random() * 114);
    const verses = await getVersesForSurah(surah);
    if (verses.length === 0) continue;
    const v = verses[Math.floor(Math.random() * verses.length)];
    const words = splitVerseWords(v.text_uthmani);
    const cands = words.filter(w =>
      baseLettersOf(w).length >= 3 && wordHasAnyLetter(w, letters));
    if (cands.length === 0) continue;
    const w = cands[Math.floor(Math.random() * cands.length)];
    const key = baseLettersOf(w).join('');       // same word, any spelling → once
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(w);
  }
  return items;
}

type Phase = 'loading' | 'running' | 'done';

const WordChallengePage: React.FC<{
  letters: string[];
  /** Reports the finished run so it can enter the student's logbook. */
  onFinish?: (correct: number, total: number) => void;
  onExit: () => void;
  childMode?: boolean;
}> = ({ letters, onFinish, onExit, childMode = false }) => {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [flash, setFlash] = useState<'ok' | 'no' | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    setPhase('loading');
    buildWordItems(letters).then(built => {
      if (!alive) return;
      setItems(built);
      setIdx(0); setCorrect(0); finishedRef.current = false;
      setPhase(built.length > 0 ? 'running' : 'done');
    }).catch(() => { if (alive) setPhase('done'); });
    return () => { alive = false; };
  }, [letters]);

  const advance = useCallback((wasCorrect: boolean) => {
    setFlash(wasCorrect ? 'ok' : 'no');
    window.setTimeout(() => setFlash(null), 260);
    setCorrect(c => c + (wasCorrect ? 1 : 0));
    setIdx(prev => {
      const next = prev + 1;
      if (next >= items.length && !finishedRef.current) {
        finishedRef.current = true;
        // score includes the answer just given
        onFinish?.(correct + (wasCorrect ? 1 : 0), items.length);
        setPhase('done');
      }
      return next;
    });
  }, [items.length, correct, onFinish]);

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

  const word = items[idx];
  const pct = items.length ? Math.round((idx / items.length) * 100) : 0;
  const scoreLine = useMemo(() => `${correct} / ${items.length || WORD_CHALLENGE_TOTAL}`, [correct, items.length]);

  if (phase === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">{t('wordChallenge.loading')}</p>
      </div>
    );
  }

  if (phase === 'done') {
    const total = items.length || WORD_CHALLENGE_TOTAL;
    const pctScore = total ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-5xl mb-3">{pctScore >= 80 ? '🏆' : pctScore >= 50 ? '👏' : '💪'}</p>
        <h3 className={`text-2xl font-black mb-1 ${childMode ? 'text-blue-700' : 'text-slate-800 dark:text-slate-100'}`}>
          {t('wordChallenge.finished')}
        </h3>
        <p className="text-4xl font-black my-4 text-teal-600 dark:text-orange-400 tabular-nums">{correct} / {total}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('wordChallenge.scoreHint', { percent: pctScore })}</p>
        <button onClick={onExit}
          className="px-6 py-2.5 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-bold hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors">
          {t('wordChallenge.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 pb-10">
      {/* Progress row */}
      <div className="flex items-center gap-3 mb-5">
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

      {/* The word — same rendering path as the fluency test */}
      <div
        dir="rtl"
        className={`rounded-3xl border-2 flex items-center justify-center text-center px-6 py-14 mb-6 transition-colors ${
          flash === 'ok' ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
          : flash === 'no' ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
          : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
      >
        <span className="font-quranic leading-[2.2]" style={{ fontSize: 'clamp(2.6rem, 11vw, 5.5rem)' }}>
          {word ? renderWordWithMarks(word, `wc${idx}`, 2.2) : ''}
        </span>
      </div>

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
