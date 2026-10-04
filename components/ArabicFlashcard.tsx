import React from 'react';

/** Shared presentation; the caller still owns scoring, revision and progress. */
export default function ArabicFlashcard({ word, flipped, onFlip, onKnow, onReview, disabled = false, reviewLabel = 'Review later' }: {
  word: { english: string; arabic: string; transliteration?: string }; flipped: boolean;
  onFlip: () => void; onKnow: () => void; onReview: () => void; disabled?: boolean; reviewLabel?: string;
}) {
  return <div className="space-y-5">
    <button type="button" aria-label={flipped ? 'Show English word' : 'Reveal Arabic word'} aria-pressed={flipped} onClick={onFlip}
      className={`w-full min-h-[320px] sm:min-h-[380px] rounded-3xl border p-6 sm:p-10 flex flex-col justify-center items-center gap-6 shadow-sm transition-colors ${flipped ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700'}`}>
      <span className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{flipped ? 'Arabic' : 'Do you know this word?'}</span>
      <span dir={flipped ? 'rtl' : 'auto'} className="block max-w-full break-words font-bold text-slate-900 dark:text-white" style={{ fontSize: flipped ? 'clamp(3.5rem, 8vw, 6rem)' : 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.6 }}>{flipped ? word.arabic : word.english}</span>
      {flipped && word.transliteration && <span className="text-xl sm:text-2xl text-amber-800 dark:text-amber-200 italic">{word.transliteration}</span>}
      {flipped && <span className="text-lg sm:text-xl text-slate-600 dark:text-slate-300">{word.english}</span>}
      <span className="text-sm text-slate-500 dark:text-slate-400">{flipped ? 'Tap to flip back' : 'Tap to reveal'}</span>
    </button>
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      <button disabled={disabled} onClick={onReview} className="min-h-20 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 font-bold text-base sm:text-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:opacity-50 transition-colors"><span aria-hidden="true" className="block mb-1 text-2xl">↺</span>{reviewLabel}</button>
      <button disabled={disabled} onClick={onKnow} className="min-h-20 p-4 rounded-2xl bg-emerald-700 text-white font-bold text-base sm:text-lg hover:bg-emerald-800 disabled:opacity-50 shadow-sm transition-colors"><span aria-hidden="true" className="block mb-1 text-2xl">✓</span>I know</button>
    </div>
  </div>;
}
