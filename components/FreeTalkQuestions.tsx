// ─────────────────────────────────────────────────────────────────────────────
// FreeTalkQuestions — "Talk questions" in the Free Talk tab.
//
// Speaking questions written for each lesson from that lesson's own words
// (table arabic_talk_questions, migration 20261121_talk_questions.sql): no
// AI service. The page reads the questions of the lessons the student has
// started or finished, in their variety, and plays 8 at a time, spread over
// those lessons, big, in the student's script: answer out loud, peek at a
// hint (how the answer could start) or the English if stuck, then the next
// one. ←/→ or a swipe moves between questions. Nothing is saved.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArabicLesson } from '../types';
import { VerbScript, VerbVariety } from '../services/arabicVerbsService';

interface Row {
  id: string; lesson_id: string; tense: 'past' | 'present';
  q_ar: string; q_tr: string; en: string; hint_ar: string; hint_tr: string;
  words: { ar: string; tr: string }[];
}
interface TalkQuestion { id: string; q: string; en: string; hint: string; uses: string[]; lesson: string }
type Focus = 'mixed' | 'past' | 'present';

const AR_FONT = "'Amiri', 'Amiri Regular', serif";
const SET = 8;

const shuffle = <T,>(a: T[]): T[] => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
};

/** Up to SET questions, taken in turn from each lesson (shuffled), so one
 *  big lesson does not fill the set; questions just shown come last. */
function pickSet(rows: Row[], recent: Set<string>): Row[] {
  const byLesson = new Map<string, Row[]>();
  for (const r of shuffle(rows)) byLesson.set(r.lesson_id, [...(byLesson.get(r.lesson_id) ?? []), r]);
  const queues = shuffle([...byLesson.values()]).map(q => [...q.filter(r => !recent.has(r.id)), ...q.filter(r => recent.has(r.id))]);
  const out: Row[] = [];
  while (out.length < SET && queues.some(q => q.length)) {
    for (const q of queues) { const r = q.shift(); if (r && out.length < SET) out.push(r); }
  }
  return out;
}

const FOCI: { key: Focus; label: string }[] = [
  { key: 'mixed', label: 'Mixed' }, { key: 'past', label: 'Past' }, { key: 'present', label: 'Present' },
];

const FreeTalkQuestions: React.FC<{
  /** Lessons the student has started or finished; none → all of the variety's lessons. */
  lessonIds: string[];
  /** The student's course lessons, for titles and the fallback above. */
  lessons: ArabicLesson[];
  variety: VerbVariety;
  script: VerbScript;
  onClose: () => void;
}> = ({ lessonIds, lessons, variety, script, onClose }) => {
  const [focus, setFocus] = useState<Focus>('mixed');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [questions, setQuestions] = useState<TalkQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const recent = useRef<Set<string>>(new Set());

  const ofVariety = useMemo(() => lessons.filter(l => (l.dialect ?? 'levantine') === variety), [lessons, variety]);
  const title = useMemo(() => new Map(lessons.map(l => [l.id, l.title])), [lessons]);
  const ids = useMemo(() => {
    const mine = new Set(ofVariety.map(l => l.id));
    const started = lessonIds.filter(id => mine.has(id));
    return started.length ? started : [...mine];
  }, [lessonIds, ofVariety]);

  // Read the questions of these lessons once.
  const fetchRows = useCallback(() => {
    setRows(null); setError(null);
    void supabase.from('arabic_talk_questions')
      .select('id, lesson_id, tense, q_ar, q_tr, en, hint_ar, hint_tr, words')
      .eq('dialect', variety).in('lesson_id', ids.length ? ids : ['-'])
      .then(({ data, error: err }) => {
        if (err) { setError(`The questions did not load: ${err.message}`); return; }
        setRows((data ?? []) as Row[]);
      });
  }, [variety, ids]);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const load = useCallback((f: Focus) => {
    if (!rows) return;
    setIdx(0); setShowHint(false); setShowEn(false); setError(null);
    const pool = f === 'mixed' ? rows : rows.filter(r => r.tense === f);
    if (!pool.length) {
      setQuestions([]);
      setError(rows.length
        ? `No ${f} questions in these lessons yet. Try ${f === 'past' ? 'Present' : 'Past'} or Mixed.`
        : 'There are no questions for these lessons yet.');
      return;
    }
    const set = pickSet(pool, recent.current);
    recent.current = new Set(set.map(r => r.id));
    const ar = script === 'arabic';
    setQuestions(set.map(r => ({
      id: r.id,
      q: (ar ? r.q_ar : r.q_tr) || r.q_ar,
      en: r.en,
      hint: (ar ? r.hint_ar : r.hint_tr) || r.hint_ar,
      uses: (r.words ?? []).map(w => (ar ? w.ar : w.tr) || w.ar),
      lesson: title.get(r.lesson_id) ?? '',
    })));
  }, [rows, script, title]);
  useEffect(() => { load(focus); /* a set as soon as the questions are in */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

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
              <p className="text-[13px] text-slate-500 dark:text-slate-400">Answer each one out loud, with the words from your lessons.</p>
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
            <button type="button" onClick={() => load(focus)} disabled={!rows}
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
              <p role={rows ? 'status' : 'alert'} className={`text-sm font-semibold ${rows ? 'text-slate-600 dark:text-slate-300' : 'text-red-600'}`}>{error}</p>
              {!rows && <button type="button" onClick={fetchRows} className="h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold">Try again</button>}
            </div>
          ) : !q ? (
            <div className="m-auto flex flex-col items-center gap-3 py-16" aria-live="polite">
              <div className="w-9 h-9 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Picking questions from your lessons…</p>
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
                {q.lesson && <p className="-mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{q.lesson}</p>}
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
