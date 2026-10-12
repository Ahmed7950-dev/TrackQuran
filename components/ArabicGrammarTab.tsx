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
import { GRAMMAR_EXERCISES, type GrammarExercise } from '../utils/arabicGrammarExercises';

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

/**
 * A prompt with its glosses picked out. Anything written [like this] is a word
 * the lesson has not taught, and is drawn in its own colour so the student can
 * see at a glance what is a hint and what is the question.
 */
const Prompt: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\[[^\]]*\])/g).map((part, n) =>
      part.startsWith('[') && part.endsWith(']')
        ? <span key={n} className="text-amber-700 dark:text-amber-400 font-semibold">{part}</span>
        : <React.Fragment key={n}>{part}</React.Fragment>,
    )}
  </>
);

/* ── The drill ───────────────────────────────────────────────────────── */

/**
 * The student answers; nothing is marked as they go.
 *
 * Correction is the tutor's, so the run shows no right/wrong and no model
 * answer — a verdict after each card would also tell the student the answer to
 * the next one by elimination. At the end the answers are laid out together:
 * the tutor marks them, and a student practising alone sees only what they
 * wrote, to go through with the tutor later.
 */
const Drill: React.FC<{
  lessonTitle: string;
  items: GrammarExercise[];
  /** Student's own portal: no model answers, no marking. */
  studentMode: boolean;
  onClose: () => void;
}> = ({ lessonTitle, items, studentMode, onClose }) => {
  const [i, setI] = useState(0);
  const [given, setGiven] = useState<Record<number, string | number>>({});
  const [reviewing, setReviewing] = useState(false);
  /** The tutor's marks, by question. Nothing is filled in by the app. */
  const [marks, setMarks] = useState<Record<number, 'right' | 'wrong'>>({});

  const q = items[i];
  const isLast = i === items.length - 1;
  const answered = given[i] !== undefined && String(given[i]).trim() !== '';

  const marked = Object.values(marks);
  const rightCount = marked.filter(m => m === 'right').length;

  // ── Review ──────────────────────────────────────────────────────────
  if (reviewing) {
    return (
      <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto" role="dialog" aria-modal="true">
        <div className="w-full sm:max-w-2xl bg-white dark:bg-gray-800 sm:rounded-2xl border border-slate-200 dark:border-gray-700 flex flex-col min-h-[100dvh] sm:min-h-0 sm:max-h-[90vh]">
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-gray-700">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-amber-400 truncate">{lessonTitle}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {studentMode
                  ? `${items.length} answers — your tutor will go through these with you`
                  : `Mark each one · ${marked.length} of ${items.length} marked${marked.length ? ` · ${rightCount} right` : ''}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close"
              className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {items.map((it, n) => {
              const raw = given[n];
              const said = it.kind === 'write'
                ? (typeof raw === 'string' ? raw : '')
                : (typeof raw === 'number' ? it.options[raw] : '');
              const mark = marks[n];
              return (
                <div key={n} className={`rounded-xl border p-4 ${
                  mark === 'right' ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/15'
                  : mark === 'wrong' ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/15'
                  : 'border-slate-200 dark:border-gray-700'}`}>
                  <p className="text-[11px] font-black text-slate-400 dark:text-slate-500">{n + 1}</p>
                  <p className="mt-1 text-[15px] font-bold text-slate-800 dark:text-slate-100">
                    <Prompt text={it.prompt} />
                  </p>
                  {it.gloss && it.gloss.length > 0 && (
                    <p className="mt-1 text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                      {it.gloss.map(g => `[${g}]`).join(' ')}
                    </p>
                  )}

                  <p className="mt-2.5 text-[15px]">
                    <span className="text-slate-500 dark:text-slate-400">Answered: </span>
                    {said
                      ? <span className="font-bold text-slate-800 dark:text-slate-100">{said}</span>
                      : <span className="italic text-slate-400">left blank</span>}
                  </p>

                  {!studentMode && (
                    <>
                      <p className="mt-1.5 text-[15px]">
                        <span className="text-slate-500 dark:text-slate-400">Model: </span>
                        <span className="font-bold text-teal-700 dark:text-amber-400">
                          {it.kind === 'write' ? it.model[0] : it.options[it.answer]}
                        </span>
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                        <span className="font-bold">{it.point} · </span>{it.why}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => setMarks(m => ({ ...m, [n]: 'right' }))}
                          className={`h-10 px-4 rounded-xl text-sm font-bold border ${
                            mark === 'right' ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>
                          ✓ Right
                        </button>
                        <button onClick={() => setMarks(m => ({ ...m, [n]: 'wrong' }))}
                          className={`h-10 px-4 rounded-xl text-sm font-bold border ${
                            mark === 'wrong' ? 'bg-red-600 border-red-600 text-white'
                              : 'border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>
                          ✗ Wrong
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-5 py-4 border-t border-slate-200 dark:border-gray-700 flex gap-2">
            <button onClick={() => { setI(0); setGiven({}); setMarks({}); setReviewing(false); }}
              className="flex-1 h-12 rounded-xl border border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-700 dark:text-slate-200">
              Again
            </button>
            <button onClick={onClose}
              className="flex-1 h-12 rounded-xl bg-teal-600 dark:bg-amber-600 text-white text-sm font-bold">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!q) return null;

  // ── Answering ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-black/50 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-lg bg-white dark:bg-gray-800 sm:rounded-2xl border border-slate-200 dark:border-gray-700 flex flex-col min-h-[100dvh] sm:min-h-0">

        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-gray-700">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-wider text-teal-700 dark:text-amber-400 truncate">{lessonTitle}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{i + 1} of {items.length}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-5">
          {/* No rule name here on purpose: naming it answers half the question. */}
          <p className="text-[17px] font-bold leading-relaxed text-slate-800 dark:text-slate-100">
            <Prompt text={q.prompt} />
          </p>
          {q.gloss && q.gloss.length > 0 && (
            <p className="mt-2 text-[14px] font-semibold text-amber-700 dark:text-amber-400">
              {q.gloss.map(g => `[${g}]`).join(' ')}
            </p>
          )}

          {q.kind === 'write' ? (
            <input
              value={typeof given[i] === 'string' ? given[i] as string : ''}
              onChange={e => setGiven(g => ({ ...g, [i]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && answered) (isLast ? setReviewing(true) : setI(n => n + 1)); }}
              autoFocus
              dir="ltr"
              placeholder="Write it in transliteration…"
              className="mt-4 w-full h-12 px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-slate-100"
            />
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {q.options.map((opt, n) => {
                const chosen = given[i] === n;
                return (
                  <button key={n} onClick={() => setGiven(g => ({ ...g, [i]: n }))}
                    className={`text-start px-4 py-3 rounded-xl border text-[15px] transition-colors ${
                      chosen ? 'border-teal-500 bg-teal-50 dark:bg-amber-900/20 text-slate-800 dark:text-slate-100 font-bold'
                             : 'border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 hover:border-slate-400'}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-200 dark:border-gray-700 flex gap-2">
          {i > 0 && (
            <button onClick={() => setI(n => n - 1)}
              className="h-12 px-5 rounded-xl border border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-700 dark:text-slate-200">
              Back
            </button>
          )}
          <button onClick={() => (isLast ? setReviewing(true) : setI(n => n + 1))} disabled={!answered}
            className="flex-1 h-12 rounded-xl bg-teal-600 dark:bg-amber-600 text-white font-bold disabled:opacity-40">
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── The page ────────────────────────────────────────────────────────── */

const ArabicGrammarTab: React.FC<{
  /** Already filtered to the student's dialect. */
  lessons: ArabicLesson[];
  /** The student's own portal — no model answers, no marking. */
  studentMode?: boolean;
}> = ({ lessons, studentMode = false }) => {
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

      {drill && <Drill lessonTitle={drill.title} items={drill.items} studentMode={studentMode} onClose={() => setDrill(null)} />}
    </div>
  );
};

export default ArabicGrammarTab;
