// ─────────────────────────────────────────────────────────────────────────────
// FreeTalkPractice — practise the verbs of Free Talk. A round is up to 10
// random forms, drawn only from what was written: a verb, one of its tenses,
// one of its pronouns. The card shows the meaning, the tense and the pronoun
// ("To Write · Past · إحنا"); the student says the form.
//
//   · Flashcards: "Show answer" turns the card over (both writings), then the
//     student marks it "Again" or "Got it".
//   · Choose: four forms to pick from. The wrong ones are the SAME verb in
//     other pronouns and tenses (other verbs only when this one has too few
//     forms), so the student has to know the conjugation, not just the verb.
//
// Practice only: nothing is saved (the user's choice). The end of a round
// lists what was missed, to practise again or start a new round.
// Design: claude.ai/artifact/UxR4S2VV8GHKw8dSDd7dP7.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArabicVerb, TENSES, TenseKey, VerbScript } from '../services/arabicVerbsService';
import { Pronoun, pronounLabel, tableOrder } from '../utils/arabicVerbPronouns';
import { AR_FONT, TENSE_NAME, TENSE_TONE, cellText, otherScript, showMeaning } from '../utils/freeTalkVerbs';

const ROUND = 10;
const MODE_KEY = 'freeTalk:practiceMode';
type Mode = 'cards' | 'choose';

/** One written form: the card asks for `main` (the student's script). */
interface Form {
  id: string;
  verb: ArabicVerb;
  tense: TenseKey;
  pron: Pronoun;
  main: string;
  sub: string;
}

function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every form written in the student's script. */
function formsOf(verbs: ArabicVerb[], script: VerbScript): Form[] {
  const other = otherScript(script);
  const out: Form[] = [];
  for (const v of verbs) {
    for (const tense of TENSES) {
      const t = v.conjugations[tense];
      if (!t) continue;
      for (const p of tableOrder(v.variety, tense, t.dual, t.plural)) {
        const main = cellText(t, p.key, script);
        if (main) out.push({ id: `${v.id}:${tense}:${p.key}`, verb: v, tense, pron: p, main, sub: cellText(t, p.key, other) });
      }
    }
  }
  return out;
}

/** The form and up to three wrong ones, in a random order. Wrong ones never
 *  read the same as the answer (كتبت is "I", "you" and "she" alike). */
function choicesFor(f: Form, pool: Form[]): Form[] {
  const seen = new Set([f.main]);
  const out: Form[] = [];
  const take = (list: Form[]) => {
    for (const x of shuffle(list)) {
      if (out.length >= 3) return;
      if (seen.has(x.main)) continue;
      seen.add(x.main);
      out.push(x);
    }
  };
  take(pool.filter(x => x.verb.id === f.verb.id));
  // A verb with only a few forms written: the same slot of other verbs, then any.
  if (out.length < 3) take(pool.filter(x => x.verb.id !== f.verb.id && x.tense === f.tense && x.pron.key === f.pron.key));
  if (out.length < 3) take(pool.filter(x => x.verb.id !== f.verb.id && x.tense === f.tense));
  if (out.length < 3) take(pool.filter(x => x.verb.id !== f.verb.id));
  return shuffle([f, ...out]);
}

const loadMode = (): Mode => {
  try { return localStorage.getItem(MODE_KEY) === 'choose' ? 'choose' : 'cards'; } catch { return 'cards'; }
};

interface Props {
  verbs: ArabicVerb[];
  script: VerbScript;
  onClose: () => void;
}

/** Whether there is anything to practise at all. */
export const canPractise = (verbs: ArabicVerb[], script: VerbScript) => formsOf(verbs, script).length > 0;

const FreeTalkPractice: React.FC<Props> = ({ verbs, script, onClose }) => {
  const ar = script === 'arabic';
  // The forms as they were when practice opened: a verb saved meanwhile on the
  // other side must not reshuffle the card being answered.
  const [pool] = useState(() => formsOf(verbs, script));
  const canChoose = useMemo(() => new Set(pool.map(f => f.main)).size > 1, [pool]);
  const [mode, setMode] = useState<Mode>(() => (canChoose ? loadMode() : 'cards'));
  const [round, setRound] = useState<Form[]>(() => shuffle(pool).slice(0, ROUND));
  const [results, setResults] = useState<boolean[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const total = round.length;
  const done = results.length >= total;
  const form = done ? null : round[results.length];
  const options = useMemo(() => (form && canChoose ? choicesFor(form, pool) : []), [form, pool, canChoose]);
  const choosing = mode === 'choose' && options.length > 1;

  const chooseMode = (m: Mode) => {
    setMode(m); setRevealed(false); setPicked(null);
    try { localStorage.setItem(MODE_KEY, m); } catch { /* private mode */ }
  };
  const answer = useCallback((ok: boolean) => {
    setResults(r => r.concat([ok]));
    setRevealed(false); setPicked(null);
  }, []);
  const startRound = (forms: Form[]) => {
    setRound(shuffle(forms).slice(0, ROUND));
    setResults([]); setRevealed(false); setPicked(null);
  };
  const missed = round.filter((_, k) => results[k] === false);

  // Keys on a computer: Enter or Space turns the card / goes on, 1–4 picks, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (done || !form) return;
      if (choosing) {
        const n = Number(e.key);
        if (!picked && n >= 1 && n <= options.length) { e.preventDefault(); setPicked(options[n - 1].id); return; }
        if (picked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); answer(options.find(o => o.id === picked)?.main === form.main); }
        return;
      }
      if (!revealed && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setRevealed(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, done, form, choosing, picked, options, revealed, answer]);

  // The page behind stays put while practising.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const mainFont = ar ? { fontFamily: AR_FONT } : undefined;
  const subFont = ar ? undefined : { fontFamily: AR_FONT };
  const mainDir = ar ? 'rtl' : 'ltr';
  const subDir = ar ? 'ltr' : 'rtl';
  const score = results.filter(Boolean).length;
  const shownNo = done ? total : results.length + 1;
  const segment = (on: boolean) => `h-9 px-4 rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${on
    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`;
  const bigBtn = 'h-14 rounded-2xl text-base font-extrabold flex items-center justify-center gap-2';

  return (
    <div className="fixed inset-0 z-[60] flex sm:items-center justify-center bg-slate-900/50 sm:p-6" role="dialog" aria-modal="true" aria-label="Verb practice"
      onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-[440px] h-[100dvh] sm:h-[min(720px,92dvh)] bg-slate-50 dark:bg-gray-900 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-slate-100"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

        {/* ── Top: close, progress, mode ── */}
        <div className="px-4 pt-4 flex flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} aria-label="Close practice"
              className="flex-shrink-0 w-11 h-11 rounded-full border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                <span>Practice</span>
                <span className="tabular-nums">{shownNo} / {total}</span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-amber-600 rounded-full transition-[width] duration-300" style={{ width: `${total ? Math.round((results.length / total) * 100) : 0}%` }} />
              </div>
            </div>
          </div>
          {!done && (
            <div role="group" aria-label="Practice mode" className="self-center flex gap-0.5 p-[3px] bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-[13px]">
              <button type="button" aria-pressed={!choosing} onClick={() => chooseMode('cards')} className={segment(!choosing)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><rect x="7" y="3.5" width="13" height="16" rx="2.5" strokeLinejoin="round" /><path strokeLinejoin="round" d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H15" /></svg>
                Flashcards
              </button>
              <button type="button" aria-pressed={choosing} onClick={() => chooseMode('choose')} disabled={!canChoose} className={segment(choosing)}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" /><rect x="13" y="3.5" width="7.5" height="7.5" rx="2" /><rect x="3.5" y="13" width="7.5" height="7.5" rx="2" /><rect x="13" y="13" width="7.5" height="7.5" rx="2" /></svg>
                Choose
              </button>
            </div>
          )}
        </div>

        {form ? (
          <>
            {/* ── The card ── */}
            <div className="flex-1 min-h-0 px-4 pt-4 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-[28px] shadow-[0_26px_50px_-30px_rgba(15,23,42,0.35)] px-5 py-6 flex flex-col items-center gap-3.5">
                <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${TENSE_TONE[form.tense]}`}>{TENSE_NAME[form.tense]}</span>
                <p className="m-0 text-[28px] sm:text-[30px] font-extrabold tracking-tight text-center leading-tight">{showMeaning(form.verb.meaning)}</p>
                <div className="flex flex-col items-center px-5 pt-1 pb-1.5 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-700 rounded-2xl">
                  <span dir={mainDir} className={`font-bold text-slate-700 dark:text-slate-200 ${ar ? 'text-[34px] leading-[1.5]' : 'text-2xl leading-tight'}`} style={mainFont}>{pronounLabel(form.pron, script)}</span>
                  <span dir={subDir} className="text-[13px] font-semibold text-slate-500 dark:text-slate-400" style={subFont}>{pronounLabel(form.pron, ar ? 'translit' : 'arabic')}</span>
                </div>
                {!choosing && (
                  <div className="flex-1 w-full min-h-[120px] flex flex-col justify-center">
                    {revealed ? (
                      <div className="flex-1 min-h-[120px] rounded-[20px] border-2 border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 flex flex-col items-center justify-center px-3 py-2" aria-live="polite">
                        <span dir={mainDir} className={`font-bold text-center ${ar ? 'text-[50px] leading-[1.45]' : 'text-[34px] leading-tight'}`} style={mainFont}>{form.main}</span>
                        {form.sub && <span dir={subDir} className="text-[17px] font-bold text-amber-700 dark:text-amber-300" style={subFont}>{form.sub}</span>}
                      </div>
                    ) : (
                      <div className="flex-1 min-h-[120px] rounded-[20px] border-2 border-dashed border-slate-200 dark:border-gray-600 flex items-center justify-center text-[46px] font-extrabold text-slate-300 dark:text-gray-600" aria-hidden="true">?</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Answering ── */}
            <div className="px-4 pt-4 pb-5 flex flex-col gap-2.5">
              {!choosing && !revealed && (
                <button type="button" onClick={() => setRevealed(true)} className={`${bigBtn} bg-slate-900 hover:bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></svg>
                  Show answer
                </button>
              )}
              {!choosing && revealed && (
                <div className="grid grid-cols-2 gap-2.5">
                  <button type="button" onClick={() => answer(false)} className={`${bigBtn} border-[1.5px] border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 hover:border-slate-400`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-[19px] h-[19px]"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 1 0 2.4-5.7" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4.5v4.5h4.5" /></svg>
                    Again
                  </button>
                  <button type="button" onClick={() => answer(true)} className={`${bigBtn} bg-amber-600 hover:bg-amber-700 text-white shadow-[0_8px_18px_-8px_rgba(217,119,6,0.7)]`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.6} stroke="currentColor" className="w-[19px] h-[19px]"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    Got it
                  </button>
                </div>
              )}
              {choosing && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    {options.map(o => {
                      const after = picked !== null;
                      const ok = after && o.main === form.main;
                      const bad = after && o.id === picked && o.main !== form.main;
                      return (
                        <button key={o.id} type="button" disabled={after} onClick={() => setPicked(o.id)}
                          aria-label={`${o.main}${o.sub ? ` ${o.sub}` : ''}`}
                          className={`relative h-20 rounded-[18px] px-2 flex flex-col items-center justify-center transition-opacity disabled:cursor-default ${ok
                            ? 'border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30'
                            : bad ? 'border-2 border-red-600 bg-red-50 dark:bg-red-900/30'
                            : `border-[1.5px] border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${after ? 'opacity-40' : 'hover:border-amber-400'}`}`}>
                          <span dir={mainDir} className={`font-bold ${ar ? 'text-[27px] leading-[1.45]' : 'text-lg leading-tight'}`} style={mainFont}>{o.main}</span>
                          {o.sub && <span dir={subDir} className="text-[12.5px] font-semibold text-slate-500 dark:text-slate-400" style={subFont}>{o.sub}</span>}
                          {ok && (
                            <span aria-hidden="true" className="absolute top-2 end-2 w-[22px] h-[22px] rounded-full bg-emerald-600 text-white flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.2} stroke="currentColor" className="w-[13px] h-[13px]"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                            </span>
                          )}
                          {bad && (
                            <span aria-hidden="true" className="absolute top-2 end-2 w-[22px] h-[22px] rounded-full bg-red-600 text-white flex items-center justify-center">
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3.2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" /></svg>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="sr-only" aria-live="polite">{picked === null ? '' : options.find(o => o.id === picked)?.main === form.main ? 'Correct' : `Not quite: ${form.main}`}</p>
                  {picked !== null && (
                    <button type="button" onClick={() => answer(options.find(o => o.id === picked)?.main === form.main)}
                      className={`${bigBtn} bg-slate-900 hover:bg-slate-700 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white`}>
                      Next
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-[19px] h-[19px] rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          /* ── Round done ── */
          <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-6 pb-5 flex flex-col items-center gap-4">
            <div className="relative w-[168px] h-[168px] flex-shrink-0">
              <svg viewBox="0 0 168 168" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="84" cy="84" r="70" fill="none" strokeWidth="12" className="stroke-amber-200 dark:stroke-amber-900/50" />
                <circle cx="84" cy="84" r="70" fill="none" strokeWidth="12" strokeLinecap="round" className="stroke-amber-600"
                  strokeDasharray={`${total ? (score / total) * 439.8 : 0} 439.8`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[44px] font-extrabold tracking-tight leading-none tabular-nums">{score}</span>
                <span className="mt-1 text-[13px] font-bold text-slate-500 dark:text-slate-400">of {total}</span>
              </div>
            </div>
            <p className="m-0 text-[22px] font-extrabold">Round done</p>
            {missed.length > 0 && (
              <div className="w-full flex flex-col gap-2">
                <span className="ps-1 text-[11px] font-extrabold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">Missed</span>
                {missed.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl">
                    <div className="min-w-0 flex flex-col gap-1">
                      <span className="text-sm font-extrabold truncate">{showMeaning(f.verb.meaning)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${TENSE_TONE[f.tense]}`}>{TENSE_NAME[f.tense]}</span>
                        <span dir={mainDir} className={`font-bold text-slate-600 dark:text-slate-300 ${ar ? 'text-lg' : 'text-[13px]'}`} style={mainFont}>{pronounLabel(f.pron, script)}</span>
                      </span>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span dir={mainDir} className={`font-bold ${ar ? 'text-[26px] leading-[1.45]' : 'text-[17px]'}`} style={mainFont}>{f.main}</span>
                      {f.sub && <span dir={subDir} className="text-xs font-bold text-amber-700 dark:text-amber-300" style={subFont}>{f.sub}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-auto w-full flex flex-col gap-2.5 pt-1.5">
              {missed.length > 0 && (
                <button type="button" onClick={() => startRound(missed)} className={`${bigBtn} bg-amber-600 hover:bg-amber-700 text-white shadow-[0_8px_18px_-8px_rgba(217,119,6,0.7)]`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-[19px] h-[19px]"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 1 0 2.4-5.7" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 4.5v4.5h4.5" /></svg>
                  Practice missed
                </button>
              )}
              <button type="button" onClick={() => startRound(pool)} className={`${bigBtn} border-[1.5px] border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 hover:border-slate-400`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[19px] h-[19px]"><rect x="7" y="3.5" width="13" height="16" rx="2.5" strokeLinejoin="round" /><path strokeLinejoin="round" d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H15" /></svg>
                New round
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FreeTalkPractice;
