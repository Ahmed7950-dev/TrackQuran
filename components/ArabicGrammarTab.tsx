// components/ArabicGrammarTab.tsx
// -----------------------------------------------------------------------------
// Grammar — every rule in the level on one page, and practice for each lesson.
//
// The rules themselves come from the lessons (`grammarSummary`), so this page
// never holds a second copy of the curriculum: edit a lesson's grammar and this
// changes with it. What it adds is the drilling — the exercises in
// utils/arabicGrammarExercises.
//
// One page, two uses: the tutor reads down it to see what the level covers and
// runs a drill in the lesson; the student opens the same page in their portal
// and practises on their own.
// -----------------------------------------------------------------------------
import React, { useMemo, useState } from 'react';
import { ArabicLesson } from '../types';
import {
  GRAMMAR_EXERCISES, answerIsRight, type GrammarExercise,
} from '../utils/arabicGrammarExercises';

/** Grammar points live in `grammar_summary` as a JSON array of strings; older
 *  rows are plain text and count as a single point. */
function parseGrammarRows(raw?: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
      return parsed.map(s => s.trim()).filter(Boolean);
    }
  } catch { /* not JSON → legacy plain text */ }
  return [raw.trim()].filter(Boolean);
}

/* ── The drill ───────────────────────────────────────────────────────── */

const Drill: React.FC<{
  lessonTitle: string;
  items: GrammarExercise[];
  onClose: () => void;
}> = ({ lessonTitle, items, onClose }) => {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(0);
  const [done, setDone] = useState(false);

  const q = items[i];
  const isLast = i === items.length - 1;

  const check = () => {
    if (checked || !q) return;
    const ok = q.kind === 'write'
      ? answerIsRight(typed, q.accept)
      : picked === q.answer;
    if (ok) setRight(n => n + 1);
    setChecked(true);
  };

  const next = () => {
    if (isLast) { setDone(true); return; }
    setI(n => n + 1);
    setTyped(''); setPicked(null); setChecked(false);
  };

  const wasRight = checked && (q?.kind === 'write'
    ? answerIsRight(typed, q.accept)
    : picked === q?.answer);

  if (done) {
    const pct = Math.round((right / items.length) * 100);
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-6 text-center">
          <p className="text-5xl font-black text-teal-600 dark:text-amber-400 tabular-nums">{right}<span className="text-2xl text-slate-400">/{items.length}</span></p>
          <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
            {pct === 100 ? 'Every one right.' : pct >= 70 ? 'Solid — look again at the ones you missed.' : 'Worth going back over this lesson’s rules.'}
          </p>
          <div className="mt-5 flex gap-2">
            <button onClick={() => { setI(0); setTyped(''); setPicked(null); setChecked(false); setRight(0); setDone(false); }}
              className="flex-1 h-11 rounded-xl border border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-700 dark:text-slate-200">
              Again
            </button>
            <button onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-teal-600 dark:bg-amber-600 text-white text-sm font-bold">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-lg bg-white dark:bg-gray-800 sm:rounded-2xl border border-slate-200 dark:border-gray-700 flex flex-col min-h-[100dvh] sm:min-h-0">

        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-gray-700">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-amber-400 truncate">{lessonTitle}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{i + 1} of {items.length} · {right} right</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-5">
          <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 dark:bg-gray-700 text-[11px] font-bold text-slate-600 dark:text-slate-300">
            {q.point}
          </span>
          <p className="mt-3 text-[17px] font-bold leading-relaxed text-slate-800 dark:text-slate-100">{q.prompt}</p>

          {q.kind === 'write' ? (
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') (checked ? next() : check()); }}
              disabled={checked}
              autoFocus
              dir="ltr"
              placeholder="Write it in transliteration…"
              className="mt-4 w-full h-12 px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100 disabled:opacity-70"
            />
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {q.options.map((opt, n) => {
                const chosen = picked === n;
                const correct = checked && n === q.answer;
                const wrongPick = checked && chosen && n !== q.answer;
                return (
                  <button key={n} onClick={() => !checked && setPicked(n)} disabled={checked}
                    className={`text-start px-4 py-3 rounded-xl border text-[15px] transition-colors ${
                      correct ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/25 text-emerald-800 dark:text-emerald-200 font-bold'
                      : wrongPick ? 'border-red-400 bg-red-50 dark:bg-red-900/25 text-red-800 dark:text-red-200'
                      : chosen ? 'border-teal-500 bg-teal-50 dark:bg-amber-900/20 text-slate-800 dark:text-slate-100'
                      : 'border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 hover:border-slate-400'}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {checked && (
            <div className={`mt-4 p-3 rounded-xl text-sm leading-relaxed ${
              wasRight ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-900 dark:text-emerald-200'
                       : 'bg-amber-50 dark:bg-amber-900/25 text-amber-900 dark:text-amber-100'}`}>
              <span className="font-black">{wasRight ? 'Right. ' : 'Not quite. '}</span>
              {q.kind === 'write' && !wasRight && (
                <span className="font-bold">Answer: {q.accept[0]}. </span>
              )}
              {q.why}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-gray-700">
          {!checked ? (
            <button onClick={check}
              disabled={q.kind === 'write' ? !typed.trim() : picked === null}
              className="w-full h-12 rounded-xl bg-teal-600 dark:bg-amber-600 text-white font-bold disabled:opacity-40">
              Check
            </button>
          ) : (
            <button onClick={next} className="w-full h-12 rounded-xl bg-slate-800 dark:bg-gray-600 text-white font-bold">
              {isLast ? 'See the score' : 'Next'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── The page ────────────────────────────────────────────────────────── */

const ArabicGrammarTab: React.FC<{
  /** Already filtered to the student's dialect. */
  lessons: ArabicLesson[];
}> = ({ lessons }) => {
  const levels = useMemo(
    () => [...new Set(lessons.map(l => l.level ?? 1))].sort((a, b) => a - b),
    [lessons],
  );
  const [level, setLevel] = useState<number>(levels[0] ?? 1);

  const inLevel = useMemo(
    () => lessons.filter(l => (l.level ?? 1) === level).sort((a, b) => a.orderIndex - b.orderIndex),
    [lessons, level],
  );

  const [drill, setDrill] = useState<{ title: string; items: GrammarExercise[] } | null>(null);

  const totalPoints = inLevel.reduce((n, l) => n + parseGrammarRows(l.grammarSummary).length, 0);
  const totalDrills = inLevel.reduce((n, l) => n + (GRAMMAR_EXERCISES[l.orderIndex]?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Grammar</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {totalPoints} rules across {inLevel.length} lessons · {totalDrills} exercises
            </p>
          </div>
          <span className="flex-grow" />
          {levels.length > 1 && (
            <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-700">
              {levels.map(n => (
                <button key={n} onClick={() => setLevel(n)}
                  className={`h-8 px-3 rounded-lg text-xs font-bold ${
                    level === n ? 'bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400'}`}>
                  Level {n}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {inLevel.map(l => {
        const points = parseGrammarRows(l.grammarSummary);
        const items = GRAMMAR_EXERCISES[l.orderIndex] ?? [];
        if (points.length === 0 && items.length === 0) return null;
        return (
          <div key={l.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-gray-700">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 min-w-0 truncate">{l.title}</h4>
              <span className="flex-grow" />
              {items.length > 0 && (
                <button onClick={() => setDrill({ title: l.title, items })}
                  className="h-9 px-4 rounded-xl bg-teal-600 dark:bg-amber-600 text-white text-sm font-bold whitespace-nowrap">
                  Practise ({items.length})
                </button>
              )}
            </div>
            {points.length > 0 && (
              <ul className="px-5 py-4 space-y-2.5">
                {points.map((p, n) => (
                  <li key={n} className="flex gap-3 text-[14.5px] leading-relaxed text-slate-700 dark:text-slate-200">
                    <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 text-[11px] font-black flex items-center justify-center">
                      {n + 1}
                    </span>
                    <span className="min-w-0">{p}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {inLevel.length === 0 && (
        <p className="py-16 text-center text-sm text-slate-400">No lessons in this level yet.</p>
      )}

      {drill && <Drill lessonTitle={drill.title} items={drill.items} onClose={() => setDrill(null)} />}
    </div>
  );
};

export default ArabicGrammarTab;
