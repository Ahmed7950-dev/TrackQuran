// components/TajweedExercisePage.tsx
// -----------------------------------------------------------------------------
// Tajweed exercises — the word challenge's shape, applied to whole verses.
//
// The tutor picks one or more of the ten rules; the run is shared out between
// them, so picking several gives a mixed drill. Each item is a Qur'anic verse
// that really carries its rule, with the word(s) that carry it painted in that
// rule's colour — the same palette the reader's tajweed colouring uses. The
// highlight can be hidden, which turns the drill from "read this" into "find it".
//
// Grading is the same two keys as every other challenge (N wrong, M correct), a
// wrong answer simply moves on, and finishing writes one activity log — so the
// day counts as attended and the calendar shows it like any other challenge.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Student, ActivityLog } from '../types';
import { splitVerseWords, renderWordWithMarks } from '../utils/quranicMarks';
import { useI18n } from '../context/I18nProvider';
import {
  buildTajweedExercise, TAJWEED_EXERCISE_RULES, tajweedExerciseRule,
  type TajweedExerciseRuleId, type TajweedExerciseItem, type TajweedRuleReport,
} from '../utils/tajweedExercises';

const LENGTHS = [10, 15, 20] as const;

type Phase = 'setup' | 'loading' | 'running' | 'done';

/** A run's frozen configuration — set ONCE, when Start is pressed, so a parent
 *  re-render can never rebuild the run under the student's feet. */
interface RunConfig { run: number; rules: TajweedExerciseRuleId[]; count: number }

const TajweedExercisePage: React.FC<{
  students: Student[];
  preSelectedStudentId?: string;
  onLogActivity?: (studentId: string, a: ActivityLog) => void;
  onExit: () => void;
}> = ({ students, preSelectedStudentId, onLogActivity, onExit }) => {
  const { t, language } = useI18n();

  const [phase,    setPhase]    = useState<Phase>('setup');
  const [selected, setSelected] = useState<TajweedExerciseRuleId[]>([]);
  const [count,    setCount]    = useState<number>(15);
  const [studentId, setStudentId] = useState(preSelectedStudentId ?? '');
  const [items,    setItems]    = useState<TajweedExerciseItem[]>([]);
  const [reports,  setReports]  = useState<TajweedRuleReport[]>([]);
  const [idx,      setIdx]      = useState(0);
  const [correct,  setCorrect]  = useState(0);
  const [showHint, setShowHint] = useState(true);
  const [flash,    setFlash]    = useState<'ok' | 'no' | null>(null);
  const finishedRef = useRef(false);

  const [cfg, setCfg] = useState<RunConfig | null>(null);
  const runNoRef = useRef(0);

  const ruleName = useCallback(
    (id: TajweedExerciseRuleId) => t(`tajweedExercise.rule.${id}`),
    [t],
  );

  // ── Build ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    setPhase('loading');
    buildTajweedExercise({ rules: cfg.rules, count: cfg.count })
      .then(built => {
        if (!alive) return;
        setItems(built.items);
        setReports(built.reports);
        setIdx(0); setCorrect(0); finishedRef.current = false;
        setPhase(built.items.length > 0 ? 'running' : 'done');
      })
      .catch(() => { if (alive) { setItems([]); setReports([]); setPhase('done'); } });
    return () => { alive = false; };
  }, [cfg]);

  const start = useCallback(() => {
    runNoRef.current += 1;
    setCfg({ run: runNoRef.current, rules: selected.slice(), count });
  }, [selected, count]);

  // ── Grading ───────────────────────────────────────────────────────────────
  const advance = useCallback((wasCorrect: boolean) => {
    if (finishedRef.current) return;
    setFlash(wasCorrect ? 'ok' : 'no');
    window.setTimeout(() => setFlash(null), 240);
    const total = items.length;
    const nextIdx = idx + 1;
    const nextCorrect = correct + (wasCorrect ? 1 : 0);
    setCorrect(nextCorrect);
    setIdx(nextIdx);
    if (nextIdx >= total) {
      finishedRef.current = true;
      // One log per finished run. The rules drilled go in the detail so the
      // calendar entry says what was practised, not just that something was.
      const names = (cfg?.rules ?? []).map(ruleName).join(' · ');
      if (studentId) onLogActivity?.(studentId, {
        kind: 'tajweed-exercise',
        title: t('tajweedExercise.logTitle', { score: nextCorrect, total }),
        detail: names,
        sourceId: `tjx-${Date.now()}`,
      });
      setPhase('done');
    }
  }, [items.length, idx, correct, cfg, ruleName, studentId, onLogActivity, t]);

  // Same keys as the other challenges: N = wrong, M = correct.
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

  const toggle = (id: TajweedExerciseRuleId) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const backToSetup = () => { setCfg(null); setPhase('setup'); };

  const student = useMemo(() => students.find(s => s.id === studentId), [students, studentId]);

  // ── Setup ─────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="max-w-3xl mx-auto px-4 pb-12">
        <button onClick={onExit}
          className="mb-5 px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400">
          {t('tajweedExercise.back')}
        </button>

        <h3 className="text-2xl font-black mb-1 text-slate-800 dark:text-slate-100">{t('tajweedExercise.title')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('tajweedExercise.intro')}</p>

        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          {t('tajweedExercise.rules')}
        </h4>
        <div className="grid sm:grid-cols-2 gap-2 mb-3">
          {TAJWEED_EXERCISE_RULES.map((rule, i) => {
            const on = selected.includes(rule.id);
            return (
              <button
                key={rule.id}
                onClick={() => toggle(rule.id)}
                aria-pressed={on}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-start transition-colors ${
                  on
                    ? 'bg-teal-600 dark:bg-orange-600 border-teal-600 dark:border-orange-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-teal-400'}`}
              >
                <span className={`w-6 h-6 flex-shrink-0 rounded-full text-[11px] font-black tabular-nums flex items-center justify-center ${
                  on ? 'bg-white/25' : 'bg-slate-100 dark:bg-gray-700 text-slate-400'}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold truncate">{ruleName(rule.id)}</span>
                  {rule.letters && (
                    <span dir="rtl" className={`block text-xs truncate font-quranic ${on ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
                      {rule.letters}
                    </span>
                  )}
                </span>
                <span className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/20"
                      style={{ background: rule.color }} />
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">
          {selected.length === 0
            ? t('tajweedExercise.rulesHint')
            : t('tajweedExercise.rulesChosen', { count: selected.length })}
        </p>

        {/* How many verses */}
        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
          {t('tajweedExercise.length')}
        </h4>
        <div className="flex gap-2 mb-6">
          {LENGTHS.map(n => (
            <button key={n} onClick={() => setCount(n)}
              className={`px-4 py-2 rounded-xl text-sm font-black border-2 transition-colors ${
                count === n
                  ? 'bg-teal-600 dark:bg-orange-600 border-teal-600 dark:border-orange-600 text-white'
                  : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-300 hover:border-teal-400'}`}>
              {n}
            </button>
          ))}
        </div>

        {/* Who it is logged to */}
        {!preSelectedStudentId && students.length > 0 && (
          <label className="block mb-6">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">
              {t('tajweedExercise.logTo')}
            </span>
            <select value={studentId} onChange={e => setStudentId(e.target.value)}
              className="w-full sm:w-72 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white text-sm font-semibold">
              <option value="">{t('tajweedExercise.logToNobody')}</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        <div className="flex items-center gap-3">
          <button onClick={start} disabled={selected.length === 0}
            className="px-6 py-2.5 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-bold disabled:opacity-40 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors">
            {t('tajweedExercise.start')}
          </button>
          {selected.length > 0 && (
            <button onClick={() => setSelected([])}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700">
              {t('tajweedExercise.clear')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 pb-12">
        <button onClick={onExit}
          className="mb-5 px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400">
          {t('tajweedExercise.back')}
        </button>
        <p className="text-sm text-center py-12 text-slate-400 dark:text-slate-500">{t('tajweedExercise.loading')}</p>
      </div>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const total = items.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const empty = reports.filter(r => r.empty);
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        {total === 0 ? (
          <>
            <p className="text-5xl mb-3">🔍</p>
            <h3 className="text-xl font-black mb-2 text-slate-800 dark:text-slate-100">{t('tajweedExercise.nothingFound')}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{t('tajweedExercise.nothingFoundHint')}</p>
          </>
        ) : (
          <>
            <p className="text-5xl mb-3">{pct >= 80 ? '🏆' : pct >= 50 ? '👏' : '💪'}</p>
            <h3 className="text-2xl font-black mb-1 text-slate-800 dark:text-slate-100">{t('tajweedExercise.finished')}</h3>
            <p className="text-4xl font-black my-4 text-teal-600 dark:text-orange-400 tabular-nums">{correct} / {total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t('tajweedExercise.scoreHint', { percent: pct })}</p>
            {student && <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-4">{t('tajweedExercise.loggedTo', { name: student.name })}</p>}
            {empty.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                {t('tajweedExercise.noticeEmpty', { rules: empty.map(r => ruleName(r.id)).join(', ') })}
              </p>
            )}
          </>
        )}
        <div className="flex items-center justify-center gap-3">
          <button onClick={backToSetup}
            className="px-6 py-2.5 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-bold hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors">
            {t('tajweedExercise.again')}
          </button>
          <button onClick={onExit}
            className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 font-bold hover:border-slate-400 transition-colors">
            {t('tajweedExercise.back')}
          </button>
        </div>
      </div>
    );
  }

  // ── Running ───────────────────────────────────────────────────────────────
  const item = items[idx];
  const rule = item ? tajweedExerciseRule(item.rule) : undefined;
  const allWords = item ? splitVerseWords(item.text) : [];
  // Only the part of the verse the rule lives in — see excerptRange.
  const words = item ? allWords.slice(item.from, item.to + 1) : [];
  const hit = new Set(item?.words ?? []);

  // How big the phrase can be drawn. Three times the old size is right for a
  // short one and impossible for a long one, so the size comes from the LENGTH:
  // ~400/chars of the card's width fills about two lines, clamped so a very
  // short phrase stops at 12rem (3× where it started) and a long one never
  // drops below 2.5rem. cqw measures the card, not the window, so it holds at
  // any width; a browser without container queries inherits the rem fallback
  // on the card instead.
  const shownChars = Math.max(8, words.join(' ').replace(/[ً-ٟؐ-ؚٰۖ-ۜ۟-ۧ۩-ۭ]/g, '').length);
  const verseFont = `clamp(2.5rem, ${(400 / shownChars).toFixed(1)}cqw, 12rem)`;
  const verseFallback = `${Math.max(2.5, Math.min(12, 44 / shownChars * 2.4)).toFixed(2)}rem`;

  return (
    <div className="max-w-5xl mx-auto px-4 pb-36">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onExit}
          className="px-4 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 flex-shrink-0">
          {t('tajweedExercise.exit')}
        </button>
        <div className="flex-1 h-3 rounded-full overflow-hidden bg-slate-200 dark:bg-gray-700">
          <div className="h-full bg-teal-500 dark:bg-amber-500 transition-all duration-300"
               style={{ width: `${items.length ? (idx / items.length) * 100 : 0}%` }} />
        </div>
        <span className="text-sm font-bold tabular-nums text-slate-500 dark:text-slate-300 flex-shrink-0">{idx + 1} / {items.length}</span>
        <span className="text-sm font-black tabular-nums text-teal-600 dark:text-orange-400 flex-shrink-0">{correct}</span>
      </div>

      {/* Which rule this verse is about */}
      {rule && (
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-black text-white"
                style={{ background: rule.color }}>
            {ruleName(rule.id)}
            {rule.letters && <span dir="rtl" className="font-quranic text-white/80 text-xs">{rule.letters}</span>}
          </span>
          <button onClick={() => setShowHint(v => !v)}
            className="text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-500 dark:text-slate-400 hover:border-slate-400 transition-colors">
            {showHint ? t('tajweedExercise.hideHint') : t('tajweedExercise.showHint')}
          </button>
        </div>
      )}

      {/* The verse */}
      <div dir="rtl"
        style={{ containerType: 'inline-size', fontSize: verseFallback }}
        className={`rounded-3xl border-2 bg-white dark:bg-gray-800 px-5 py-6 mb-2 transition-colors ${
        flash === 'ok' ? 'border-emerald-400' : flash === 'no' ? 'border-red-400' : 'border-slate-200 dark:border-gray-700'}`}>
        {/* Three times the size it was: a phrase this short can carry it, and
            the tutor is often reading it out over a call. */}
        <p className="font-quranic text-center leading-[1.7]" style={{ fontSize: verseFont }}>
          {item?.trimmedStart && <span className="text-slate-300 dark:text-gray-600">… </span>}
          {words.map((w, i) => (
            <React.Fragment key={i}>
              <span style={showHint && hit.has(item!.from + i) && rule
                ? { color: rule.color, fontWeight: 700 }
                : undefined}>
                {renderWordWithMarks(w, `tj${idx}-${i}`, 1.7)}
              </span>
              {i < words.length - 1 ? ' ' : ''}
            </React.Fragment>
          ))}
          {item?.trimmedEnd && <span className="text-slate-300 dark:text-gray-600"> …</span>}
        </p>
      </div>
      <p className="text-center text-xs font-bold text-slate-400 dark:text-slate-500 mb-5">{item?.verseKey}</p>

      <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-1 px-4 pt-6 pb-2 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-900 dark:via-gray-900/95">
        <div className="flex items-center justify-center gap-3 w-full max-w-2xl">
        <button onClick={() => advance(false)} aria-keyshortcuts="N"
          className="flex-1 max-w-[15rem] py-4 rounded-2xl bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white font-black text-lg shadow-lg ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
          <span>✗ {t('tajweedExercise.wrong')}</span>
          <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">N</kbd>
        </button>
        <button onClick={() => advance(true)} aria-keyshortcuts="M"
          className="flex-1 max-w-[15rem] py-4 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-lg shadow-lg ring-1 ring-white/15 transition-all active:scale-95 flex items-center justify-center gap-2.5">
          <span>✓ {t('tajweedExercise.correct')}</span>
          <kbd className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-black/25 text-[11px] font-bold ring-1 ring-white/20">M</kbd>
        </button>
        </div>
        <p className="text-center text-[11px] text-slate-400" dir={language === 'ar' ? 'rtl' : 'ltr'}>
          {t('tajweedExercise.keysHint')}
        </p>
      </div>
    </div>
  );
};

export default TajweedExercisePage;
