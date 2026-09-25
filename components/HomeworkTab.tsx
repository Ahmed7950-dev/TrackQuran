// ─────────────────────────────────────────────────────────────────────────────
// HomeworkTab — one block per piece of homework, one ROW per try, on both
// sides: the tutor's tab and the student's portal.
//
// A row is: the try's number, the day it was set, a segment per verse with the
// verse number in it, and what to do about it. The segments keep the columns of
// the FIRST try, so when a verse is sent back its segment stays under the one
// it came from: try 1 shows every verse (green where it was read correctly, red
// where it was not), try 2 shows only the red ones, in the same places.
//
// Once the last try passes, the whole block folds into Finished as a single
// line — the corrected reading, with none of the wrong ones kept.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { QURAN_METADATA } from '../constants';
import { QuranHomework } from '../types';
import { RecitationHomework, rangeLabel, versesOf } from '../services/recitationHomeworkService';

const SERIF = "'Cormorant Garamond', Georgia, serif";

const surahName = (n: number) => QURAN_METADATA.find(m => m.number === n)?.transliteratedName ?? `Surah ${n}`;
const surahArabic = (n: number) => QURAN_METADATA.find(m => m.number === n)?.name ?? '';

export const homeworkRange = (hw: Pick<QuranHomework, 'startSurah' | 'startAyah' | 'endSurah' | 'endAyah'>): string => {
  const s = surahName(hw.startSurah);
  if (hw.startSurah === hw.endSurah) {
    return hw.startAyah === hw.endAyah ? `${s} ${hw.startAyah}` : `${s} ${hw.startAyah}–${hw.endAyah}`;
  }
  return `${s} ${hw.startAyah} → ${surahName(hw.endSurah)} ${hw.endAyah}`;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** A segment: one verse of the first try, as this try left it. */
type CellState = 'pass' | 'fail' | 'open' | 'done' | 'gone';

const CELL: Record<CellState, string> = {
  pass: 'bg-emerald-100 border-emerald-400 text-emerald-800 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-200',
  fail: 'bg-rose-100 border-rose-400 text-rose-800 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-200',
  open: 'bg-white border-slate-300 text-slate-600 dark:bg-gray-900/40 dark:border-gray-600 dark:text-slate-300',
  done: 'bg-emerald-50 border-emerald-300 text-emerald-600 dark:bg-emerald-900/25 dark:border-emerald-800 dark:text-emerald-400',
  gone: 'border-dashed border-slate-200 text-transparent dark:border-gray-700',
};

/** Every segment is this size — small enough that a long surah still fits. */
const SEG = 'min-w-[1.6rem] h-6 px-1 rounded-md border text-[11px] font-bold flex items-center justify-center';

const Tick: React.FC = () => (
  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

interface Attempt {
  rec: RecitationHomework;
  hw: QuranHomework;
  n: number;
  /** The verse keys of this try, in order. */
  verses: string[];
  /** Verses this try got right / was sent back for. Empty while undecided. */
  passed: Set<string>;
  failed: Set<string>;
  /** Verses already read correctly in an earlier try — ticked, in their place. */
  before: Set<string>;
  state: 'with-student' | 'submitted' | 'reviewed' | 'passed';
}

interface Block {
  key: string;
  /** The homework the last try belongs to — what the menu and links act on. */
  hw: QuranHomework;
  title: string;
  arabic: string;
  /** The verses of the first try: the columns every row lines up against. */
  columns: string[];
  attempts: Attempt[];
  /** No recording homework: one plain row, nothing to line up. */
  plain: boolean;
  done: boolean;
  lastDate: string;
}

const HomeworkTab: React.FC<{
  side: 'tutor' | 'student';
  homework: QuranHomework[];
  recitations: Record<string, RecitationHomework>;
  /** Student side: "2 days 5 hours", shown beside the title. */
  untilLesson?: string | null;
  onOpenVerses: (hw: QuranHomework) => void;
  /** Tutor. */
  onListen?: (rec: RecitationHomework) => void;
  onCopyLink?: (rec: RecitationHomework) => void;
  onMarkDone?: (hw: QuranHomework) => void;
  onRemove?: (hw: QuranHomework) => void;
  onClearFinished?: () => void;
  /** Student: open the recording page. */
  onRecord?: (hw: QuranHomework, rec: RecitationHomework | undefined) => void;
}> = ({
  side, homework, recitations, untilLesson,
  onOpenVerses, onListen, onCopyLink, onMarkDone, onRemove, onClearFinished, onRecord,
}) => {
  const isTutor = side === 'tutor';
  const [showFinished, setShowFinished] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  /** Homework grouped by the chain its recording belongs to, oldest try first. */
  const blocks = useMemo<Block[]>(() => {
    const rootOf = (rec: RecitationHomework): string => {
      let r = rec;
      for (let i = 0; i < 10 && r.parentId; i++) {
        const p = recitations[r.parentId];
        if (!p) break;
        r = p;
      }
      return r.id;
    };

    const byRoot = new Map<string, QuranHomework[]>();
    const plain: QuranHomework[] = [];
    for (const hw of homework) {
      const rec = hw.recitationId ? recitations[hw.recitationId] : undefined;
      if (!rec) { plain.push(hw); continue; }
      const k = rootOf(rec);
      byRoot.set(k, [...(byRoot.get(k) ?? []), hw]);
    }

    const out: Block[] = [];

    for (const [key, list] of byRoot) {
      const tries = list
        .map(hw => ({ hw, rec: recitations[hw.recitationId!]! }))
        .sort((a, b) => a.rec.createdAt.localeCompare(b.rec.createdAt));
      const settled = new Set<string>();
      const attempts: Attempt[] = tries.map(({ hw, rec }, i) => {
        const verses = versesOf(rec).map(([s, a]) => `${s}:${a}`);
        const next = tries[i + 1]?.rec;
        // The try after this one holds exactly the verses this one got wrong.
        const failed = new Set(next ? versesOf(next).map(([s, a]) => `${s}:${a}`) : []);
        const decided = !!next || rec.status === 'passed';
        const passed = new Set(decided ? verses.filter(v => !failed.has(v)) : []);
        const state: Attempt['state'] = next ? 'reviewed'
          : rec.status === 'passed' ? 'passed'
          : rec.status === 'submitted' ? 'submitted'
          : 'with-student';
        const before = new Set(settled);
        passed.forEach(v => settled.add(v));
        return { rec, hw, n: i + 1, verses, passed, failed, state, before };
      });
      const last = attempts[attempts.length - 1];
      out.push({
        key,
        hw: last.hw,
        title: rangeLabel(attempts[0].rec),
        arabic: surahArabic(attempts[0].rec.startSurah),
        columns: attempts[0].verses,
        attempts,
        plain: false,
        done: last.rec.status === 'passed' || last.hw.isDone,
        lastDate: last.rec.createdAt,
      });
    }

    for (const hw of plain) {
      out.push({
        key: hw.id, hw, title: homeworkRange(hw), arabic: surahArabic(hw.startSurah),
        columns: [], attempts: [], plain: true, done: !!hw.isDone, lastDate: hw.assignedAt,
      });
    }

    return out.sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
  }, [homework, recitations]);

  const openBlocks = useMemo(() => blocks.filter(b => !b.done), [blocks]);
  const doneBlocks = useMemo(() => blocks.filter(b => b.done), [blocks]);

  const verseNumber = (key: string) => key.split(':')[1];

  /** The segments of one row, lined up against the first try's verses. */
  const segments = (block: Block, a: Attempt) => (
    <span className="flex flex-wrap gap-1">
      {block.columns.map(v => {
        const state: CellState = a.verses.includes(v)
          ? (a.passed.has(v) ? 'pass' : a.failed.has(v) ? 'fail' : 'open')
          : a.before.has(v) ? 'done' : 'gone';
        return (
          <span key={v} aria-hidden={state === 'gone'}
            title={state === 'done' ? `Verse ${verseNumber(v)} — already read correctly` : undefined}
            className={`${SEG} ${CELL[state]}`}>
            {state === 'done' ? <Tick /> : state === 'gone' ? '' : verseNumber(v)}
          </span>
        );
      })}
      {/* A later try can hold a verse the first one never had (a wider reassign). */}
      {a.verses.filter(v => !block.columns.includes(v)).map(v => (
        <span key={v} className={`${SEG} ${CELL[a.passed.has(v) ? 'pass' : a.failed.has(v) ? 'fail' : 'open']}`}>
          {verseNumber(v)}
        </span>
      ))}
    </span>
  );

  const pill = (text: string, cls: string) => (
    <span className={`inline-flex items-center h-8 px-3 rounded-full text-[13px] font-bold ${cls}`}>{text}</span>
  );

  /** The last column of a row: what there is to do, or how it went. */
  const action = (a: Attempt) => {
    if (a.state === 'reviewed') {
      return (
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-[22px] leading-none text-emerald-700 dark:text-emerald-400" style={{ fontFamily: SERIF, fontWeight: 700 }}>
            {a.passed.size}/{a.verses.length}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">read correctly</span>
        </span>
      );
    }
    if (a.state === 'passed') return pill('Passed', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200');
    if (a.state === 'submitted') {
      return isTutor && onListen
        ? <button onClick={() => onListen(a.rec)}
            className="h-9 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-bold">Listen</button>
        : pill('Sent', 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300');
    }
    return isTutor
      ? pill('With the student', 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200')
      : (
        <button onClick={() => onRecord?.(a.hw, a.rec)}
          className="h-9 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-[13px] font-bold">
          Record
        </button>
      );
  };

  const blockCard = (b: Block) => (
    <section key={b.key} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3.5 border-b border-slate-100 dark:border-gray-700">
        <h2 className="min-w-0 truncate text-xl sm:text-2xl text-slate-900 dark:text-slate-100 leading-tight" style={{ fontFamily: SERIF, fontWeight: 700 }}>
          {b.title}
        </h2>
        <span dir="rtl" className="hidden sm:inline font-quranic text-lg text-slate-500 dark:text-slate-400">{b.arabic}</span>
        <span className="flex-grow" />
        <button onClick={() => onOpenVerses(b.hw)}
          className="flex-shrink-0 h-8 px-3 rounded-full border border-slate-200 dark:border-gray-600 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700">
          Open verses
        </button>
        {isTutor && (
          <span className="relative flex-shrink-0">
            <button onClick={() => setMenuFor(m => (m === b.key ? null : b.key))}
              aria-label="More" className="w-8 h-8 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 text-lg leading-none">⋯</button>
            {menuFor === b.key && (
              <>
                <span className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                <span className="absolute end-0 top-full mt-1 z-20 w-48 py-1 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 shadow-xl flex flex-col">
                  {b.attempts.length > 0 && onCopyLink && (
                    <button onClick={() => { onCopyLink(b.attempts[b.attempts.length - 1].rec); setMenuFor(null); }}
                      className="px-4 py-2 text-start text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700">Copy the link</button>
                  )}
                  {onMarkDone && (
                    <button onClick={() => { onMarkDone(b.hw); setMenuFor(null); }}
                      className="px-4 py-2 text-start text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700">Mark done</button>
                  )}
                  {onRemove && (
                    <button onClick={() => { onRemove(b.hw); setMenuFor(null); }}
                      className="px-4 py-2 text-start text-[13px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">Remove</button>
                  )}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {b.plain ? (
        <div className="px-4 sm:px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{shortDate(b.hw.assignedAt)}</span>
          {b.hw.note && <span className="text-[13px] text-slate-600 dark:text-slate-300 flex-1 min-w-[10rem]">{b.hw.note}</span>}
          <span className="flex-grow" />
          {pill(isTutor ? 'With the student' : 'To do', 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200')}
        </div>
      ) : b.attempts.map(a => (
        <div key={a.rec.id}
          className="grid items-center gap-x-3 gap-y-2.5 px-4 sm:px-6 py-3 border-t border-slate-50 dark:border-gray-700/60
                     grid-cols-[1.75rem_1fr_auto] sm:grid-cols-[2.25rem_5.5rem_minmax(0,1fr)_auto]">
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-[10px] bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 text-[13px] font-bold flex items-center justify-center">
            {a.n}
          </span>
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">{shortDate(a.rec.createdAt)}</span>
          <span className="col-span-full sm:col-span-1 sm:order-none order-last">{segments(b, a)}</span>
          <span className="justify-self-end">{action(a)}</span>
        </div>
      ))}
    </section>
  );

  return (
    <div className="max-w-3xl mx-auto px-1 sm:px-0 py-2 flex flex-col gap-4">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-gray-700">
        <h1 className="text-2xl sm:text-3xl text-slate-900 dark:text-slate-100" style={{ fontFamily: SERIF, fontWeight: 600 }}>
          {isTutor ? 'Homework' : 'My homework'}
        </h1>
        <span className="flex-grow" />
        {!isTutor && untilLesson && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Lesson in <strong className="text-slate-800 dark:text-slate-100">{untilLesson}</strong>
          </span>
        )}
      </div>

      {openBlocks.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-10 text-center">
          <p className="text-lg text-slate-700 dark:text-slate-200" style={{ fontFamily: SERIF, fontWeight: 600 }}>
            {isTutor ? 'Nothing open' : 'All done'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isTutor ? 'Assign homework from the Quran page.' : 'Nothing to do until your next lesson.'}
          </p>
        </div>
      ) : openBlocks.map(blockCard)}

      <div className="flex items-center gap-3">
        <button onClick={() => setShowFinished(f => !f)}
          className="py-2 flex items-center gap-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <svg className={`w-4 h-4 transition-transform ${showFinished ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          Finished <span className="text-slate-400 dark:text-slate-500">{doneBlocks.length}</span>
        </button>
        <span className="flex-grow" />
        {isTutor && showFinished && doneBlocks.length > 0 && onClearFinished && (
          <button onClick={onClearFinished} className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline">
            Clear finished
          </button>
        )}
      </div>

      {/* Finished: the whole block as it played out — every try, and the
          verses that were sent back. */}
      {showFinished && doneBlocks.length > 0 && (
        <div className="flex flex-col gap-4">
          {doneBlocks.map(blockCard)}
        </div>
      )}

    </div>
  );
};

export default HomeworkTab;
