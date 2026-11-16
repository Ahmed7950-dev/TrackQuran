// ─────────────────────────────────────────────────────────────────────────────
// FreeTalkQuestions — "Talk questions" in the Free Talk tab.
//
// Sends the student's own verbs (with the forms they wrote) and the words
// they have learned to /api/talk-questions, which asks Gemini for 8 questions
// whose answers need those verbs and words. The questions play one at a time,
// big, in the student's script and variety: answer out loud, peek at a hint
// (how the answer could start) or the English if stuck, then the next one.
// ←/→ or a swipe moves between questions. Nothing is saved.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArabicVerb, TENSES, VerbScript, VerbVariety } from '../services/arabicVerbsService';
import { tableOrder } from '../utils/arabicVerbPronouns';

export interface TalkWord { ar: string; tr: string; en: string }
interface TalkQuestion { q: string; en: string; hint: string; uses: string[] }
type Focus = 'mixed' | 'past' | 'present';

const AR_FONT = "'Amiri', 'Amiri Regular', serif";
const MAX_VERBS = 30;
const MAX_WORDS = 80;

/** Pronoun keys in words the model reads without a table. */
const WHO: Record<string, string> = {
  s1: 'I', s2m: 'you (m)', s2f: 'you (f)', s3m: 'he', s3f: 'she',
  d2: 'you two', d3m: 'they two (m)', d3f: 'they two (f)',
  p1: 'we', p2: 'you all', p2m: 'you all (m)', p2f: 'you all (f)', p3: 'they', p3m: 'they (m)', p3f: 'they (f)',
};

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

async function fetchQuestions(
  verbs: ArabicVerb[], words: TalkWord[], variety: VerbVariety, script: VerbScript, focus: Focus,
): Promise<TalkQuestion[] | string> {
  const pick = (c: { ar?: string; tr?: string } | undefined) => ((script === 'arabic' ? c?.ar : c?.tr) ?? '').trim();
  const body = {
    variety, script, focus,
    verbs: shuffle(verbs).slice(0, MAX_VERBS).map(v => ({
      meaning: v.meaning,
      forms: Object.fromEntries(TENSES.filter(t => v.conjugations[t]).map(t => {
        const tb = v.conjugations[t]!;
        return [t, Object.fromEntries(tableOrder(v.variety, t, tb.dual, tb.plural)
          .map(p => [WHO[p.key] ?? p.key, pick(tb.cells[p.key])]).filter(([, f]) => f))];
      })),
    })),
    words: shuffle(words)
      .map(w => ({ w: (script === 'arabic' ? w.ar || w.tr : w.tr || w.ar).trim(), en: w.en.trim() }))
      .filter(w => w.w).slice(0, MAX_WORDS),
  };
  try {
    const r = await fetch('/api/talk-questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(data.questions)) return data.error ?? `The questions did not load (error ${r.status}).`;
    return data.questions as TalkQuestion[];
  } catch {
    return 'The questions did not load. Check the internet connection and try again.';
  }
}

const FOCI: { key: Focus; label: string }[] = [
  { key: 'mixed', label: 'Mixed' }, { key: 'past', label: 'Past' }, { key: 'present', label: 'Present' },
];

const FreeTalkQuestions: React.FC<{
  verbs: ArabicVerb[];
  words: TalkWord[];
  variety: VerbVariety;
  script: VerbScript;
  onClose: () => void;
}> = ({ verbs, words, variety, script, onClose }) => {
  const [focus, setFocus] = useState<Focus>('mixed');
  const [questions, setQuestions] = useState<TalkQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const run = useRef(0);

  const load = useCallback((f: Focus) => {
    const mine = ++run.current;
    setQuestions(null); setError(null); setIdx(0); setShowHint(false); setShowEn(false);
    // Google is sometimes busy for a moment: one quiet retry before showing an error.
    void fetchQuestions(verbs, words, variety, script, f)
      .then(res => (typeof res === 'string' && mine === run.current ? fetchQuestions(verbs, words, variety, script, f) : res))
      .then(res => {
      if (mine !== run.current) return;   // a newer request replaced this one
      if (typeof res === 'string') setError(res); else setQuestions(res);
    });
  }, [verbs, words, variety, script]);
  useEffect(() => { load(focus); /* first set on open */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = questions?.length ?? 0;
  const go = useCallback((d: number) => {
    setIdx(i => Math.max(0, Math.min(total - 1, i + d)));
    setShowHint(false); setShowEn(false);
  }, [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [go, onClose]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const q = questions?.[idx];
  const ar = script === 'arabic';
  const isVerb = (u: string) => /^to\s/i.test(u);
  const last = idx === total - 1;

  return (
    <div className="fixed inset-0 z-[60] flex sm:items-center justify-center bg-slate-900/50 sm:p-6" role="dialog" aria-modal="true" aria-label="Talk questions"
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-[640px] h-[100dvh] sm:h-auto sm:max-h-[90dvh] bg-slate-50 dark:bg-gray-900 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {/* ── Top: title, focus, close ── */}
        <div className="px-4 sm:px-6 pt-4 pb-3 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">Talk questions</h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">Answer each one out loud, with your verbs and words.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="flex-shrink-0 w-10 h-10 -me-2 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Which tense" className="flex p-1 rounded-xl bg-slate-100 dark:bg-gray-700">
              {FOCI.map(f => (
                <button key={f.key} type="button" role="radio" aria-checked={focus === f.key}
                  onClick={() => { if (f.key !== focus) { setFocus(f.key); load(f.key); } }}
                  className={`h-8 px-3 rounded-lg text-[13px] font-bold ${focus === f.key ? 'bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <button type="button" onClick={() => load(focus)} disabled={!questions && !error}
              className="h-9 px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[13px] font-bold text-slate-700 dark:text-slate-200 hover:border-amber-500 disabled:opacity-50 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" /></svg>
              <span className="hidden min-[400px]:inline">New questions</span><span className="min-[400px]:hidden">New</span>
            </button>
          </div>
        </div>

        {/* ── The question ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 flex flex-col">
          {error ? (
            <div className="m-auto max-w-sm text-center flex flex-col items-center gap-3 py-10">
              <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>
              <button type="button" onClick={() => load(focus)} className="h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold">Try again</button>
            </div>
          ) : !q ? (
            <div className="m-auto flex flex-col items-center gap-3 py-16" aria-live="polite">
              <div className="w-9 h-9 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Writing questions from your verbs and words…</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4"
              onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={e => {
                const s = touch.current; touch.current = null;
                if (!s) return;
                const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
                if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
              }}>
              <div className="flex items-center gap-1.5" aria-label={`Question ${idx + 1} of ${total}`}>
                {questions!.map((_, i) => (
                  <button key={i} type="button" aria-label={`Question ${i + 1}`} onClick={() => { setIdx(i); setShowHint(false); setShowEn(false); }}
                    className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-amber-500' : i < idx ? 'w-3 bg-amber-300 dark:bg-amber-700' : 'w-3 bg-slate-300 dark:bg-gray-600'}`} />
                ))}
                <span className="ms-auto text-xs font-bold text-slate-400">{idx + 1} / {total}</span>
              </div>

              <div className="flex-1 min-h-[200px] bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl px-5 py-8 sm:px-8 flex flex-col items-center justify-center gap-5 text-center">
                <p dir={ar ? 'rtl' : 'ltr'} lang={ar ? 'ar' : undefined} aria-live="polite"
                  className={ar ? 'text-[30px] sm:text-[36px] leading-[1.7] font-bold text-slate-900 dark:text-slate-50' : 'text-[22px] sm:text-[26px] leading-snug font-bold text-slate-900 dark:text-slate-50'}
                  style={ar ? { fontFamily: AR_FONT } : undefined}>
                  {q.q}
                </p>
                {q.uses.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {q.uses.map(u => (
                      <span key={u} dir="auto"
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${isVerb(u)
                          ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
                          : 'bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800'}`}>
                        {u}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button type="button" aria-expanded={showHint} onClick={() => setShowHint(s => !s)}
                  className={`min-h-[52px] px-3 py-2 rounded-2xl border text-start ${showHint ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800' : 'border-slate-200 bg-white dark:bg-gray-800 dark:border-gray-700'}`}>
                  <span className="block text-[11px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400">Hint</span>
                  {showHint
                    ? <span dir={ar ? 'rtl' : 'ltr'} className={`block ${ar ? 'text-xl text-right' : 'text-[15px]'} font-bold text-slate-800 dark:text-slate-100`} style={ar ? { fontFamily: AR_FONT } : undefined}>{q.hint || '…'}</span>
                    : <span className="block text-[13px] text-slate-500 dark:text-slate-400">How the answer starts</span>}
                </button>
                <button type="button" aria-expanded={showEn} onClick={() => setShowEn(s => !s)}
                  className={`min-h-[52px] px-3 py-2 rounded-2xl border text-start ${showEn ? 'border-slate-300 bg-slate-100 dark:bg-gray-700 dark:border-gray-600' : 'border-slate-200 bg-white dark:bg-gray-800 dark:border-gray-700'}`}>
                  <span className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">English</span>
                  {showEn
                    ? <span className="block text-[15px] font-semibold text-slate-800 dark:text-slate-100">{q.en || '…'}</span>
                    : <span className="block text-[13px] text-slate-500 dark:text-slate-400">What it means</span>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Back / next ── */}
        {q && (
          <div className="px-4 sm:px-6 py-3 bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 flex items-center gap-2.5">
            <button type="button" onClick={() => go(-1)} disabled={idx === 0}
              className="h-12 px-4 rounded-xl border border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-700 dark:text-slate-200 disabled:opacity-40">Back</button>
            <span className="hidden sm:block flex-1 text-center text-xs text-slate-400">← → or swipe</span>
            {last ? (
              <button type="button" onClick={() => load(focus)}
                className="flex-1 sm:flex-none h-12 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold">More questions</button>
            ) : (
              <button type="button" onClick={() => go(1)}
                className="flex-1 sm:flex-none h-12 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold">Next question</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeTalkQuestions;
