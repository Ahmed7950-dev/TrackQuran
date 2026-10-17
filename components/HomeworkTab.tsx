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
import type { LetterCardsAttempt, LetterCardsGame } from '../services/letterCardsService';
import { dueLabel, hunterMark, type HunterHomework } from '../services/lettersHunterHomeworkService';
import { outcomeOf, OUTCOME_LABEL, OUTCOME_PILL, type HomeworkOutcome } from '../utils/quranHomework';

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
  outcome: HomeworkOutcome;
  /** How it is recorded: reading verse by verse, or hifz in one take. */
  kind: 'reading' | 'hifz' | null;
  done: boolean;
  lastDate: string;
}

/**
 * One small action in a homework's header.
 *
 * Four tempers off one shape: a ghost for the ones that only navigate, and a
 * tinted fill for the three that CLOSE the homework — green for done, red for
 * not done, orange for withdrawn. Tinted rather than solid because three solid
 * blocks of colour in a row shout at the tutor every time the tab opens, and
 * none of them is the thing he does most.
 */
const LOOK: Record<string, string> = {
  ghost:  'border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700',
  green:  'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800/70 dark:hover:bg-emerald-900/50',
  red:    'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800/70 dark:hover:bg-rose-900/50',
  orange: 'bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800/70 dark:hover:bg-orange-900/50',
};

const ICON = {
  tick:  <path d="m5 13 4 4L19 7" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  bin:   <><path d="M4 7h16" /><path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" /><path d="M6.5 7.5 7.4 19a1.3 1.3 0 0 0 1.3 1.2h6.6a1.3 1.3 0 0 0 1.3-1.2l.9-11.5" /></>,
};

const Action: React.FC<{
  onClick: () => void;
  look: keyof typeof LOOK;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, look, icon, title, children }) => (
  <button onClick={onClick} title={title}
    className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-bold transition-colors ${LOOK[look]}`}>
    {icon && (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
    )}
    {children}
  </button>
);

/** The shape the student holds, as the card game names it. */
const CARD_FORM: Record<string, string> = { initial: 'Beginning', medial: 'Middle', final: 'End' };

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
  /** The lesson came and he had not done it. Closes it, in red. */
  onMarkMissed?: (hw: QuranHomework) => void;
  /** Withdrawn: it stays in History, its recordings do not. */
  onRemove?: (hw: QuranHomework) => void;
  /** Put a closed one back on the list — the way out of a mis-tap. */
  onReopen?: (hw: QuranHomework) => void;
  onClearFinished?: () => void;
  /** Student: open the recording page. */
  onRecord?: (hw: QuranHomework, rec: RecitationHomework | undefined) => void;
  /** Letter-card games set as homework, newest first, with every run of each. */
  cardGames?: LetterCardsGame[];
  cardAttempts?: Record<string, LetterCardsAttempt[]>;
  /** Student: open the board. */
  onPlayCards?: (game: LetterCardsGame) => void;
  /** Letters Hunter set as homework, newest first. */
  hunts?: HunterHomework[];
  /** Student: do it. Tutor: look at the drawings and mark them. */
  onOpenHunt?: (hw: HunterHomework) => void;
  onCopyHuntLink?: (hw: HunterHomework) => void;
}> = ({
  side, homework, recitations, untilLesson,
  onOpenVerses, onListen, onCopyLink, onMarkDone, onMarkMissed, onRemove, onReopen, onClearFinished, onRecord,
  cardGames, cardAttempts, onPlayCards, hunts, onOpenHunt, onCopyHuntLink,
}) => {
  const isTutor = side === 'tutor';
  /** History shows the last few without being asked; this reveals the rest. */
  const [showAllHistory, setShowAllHistory] = useState(false);

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
        kind: attempts[0].rec.kind === 'hifz' ? 'hifz' : 'reading',
        done: last.rec.status === 'passed' || last.hw.isDone,
        // A recitation that passed IS done, whatever the flag says.
        outcome: last.rec.status === 'passed' ? 'done' : outcomeOf(last.hw),
        lastDate: last.rec.createdAt,
      });
    }

    for (const hw of plain) {
      out.push({
        key: hw.id, hw, title: homeworkRange(hw), arabic: surahArabic(hw.startSurah),
        columns: [], attempts: [], plain: true, kind: null,
        done: !!hw.isDone, outcome: outcomeOf(hw), lastDate: hw.assignedAt,
      });
    }

    return out.sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
  }, [homework, recitations]);

  const openBlocks = useMemo(() => blocks.filter(b => !b.done), [blocks]);
  /** Everything closed, newest first — done, not done and withdrawn alike. */
  const history = useMemo(() => blocks.filter(b => b.done), [blocks]);
  const HISTORY_SHOWN = 5;
  const historyShown = showAllHistory ? history : history.slice(0, HISTORY_SHOWN);

  const verseNumber = (key: string) => key.split(':')[1];

  /** The segments of one row, lined up against the first try's verses. */
  const segments = (block: Block, a: Attempt) => (
    <span className="flex flex-wrap gap-1">
      {block.columns.map(v => {
        // The try that passes closes the whole homework: it stands as the
        // record that every verse set was read correctly, so it shows them
        // all by number, not the ones it happened to redo with ticks beside.
        const state: CellState = a.state === 'passed' ? 'pass'
          : a.verses.includes(v)
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

  /**
   * The homework as it now stands: every verse that was ever set, each with
   * the NEWEST recording of it — a verse re-recorded after being sent back
   * plays the corrected take, not the one it replaced. So one Listen plays the
   * whole homework read correctly, however many tries it took.
   */
  const wholeOf = (b: Block): RecitationHomework => {
    const first = b.attempts[0].rec;
    const last = b.attempts[b.attempts.length - 1].rec;
    const recordings: RecitationHomework['recordings'] = {};
    for (const a of b.attempts) Object.assign(recordings, a.rec.recordings);
    return {
      ...last,
      startSurah: first.startSurah, startAyah: first.startAyah,
      endSurah: first.endSurah, endAyah: first.endAyah,
      verses: first.verses,
      recordings,
    };
  };

  /** Only the last row offers it, and it plays the whole homework. */
  const canListen = (b: Block, a: Attempt) =>
    isTutor && !!onListen && a === b.attempts[b.attempts.length - 1]
    && b.attempts.some(x => !x.rec.purgedAt && Object.keys(x.rec.recordings).length > 0);

  const listenGhost = (b: Block) => (
    <button onClick={() => onListen!(wholeOf(b))} title="Listen to the whole homework, as it now stands"
      className="flex-shrink-0 h-8 px-3 rounded-full border border-slate-200 dark:border-gray-600 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 inline-flex items-center gap-1.5">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
      Listen
    </button>
  );

  /** The last column of a row: what there is to do, or how it went. */
  const action = (b: Block, a: Attempt) => {
    if (a.state === 'reviewed') {
      return (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="text-[22px] leading-none text-emerald-700 dark:text-emerald-400" style={{ fontFamily: SERIF, fontWeight: 700 }}>
              {a.passed.size}/{a.verses.length}
            </span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">read correctly</span>
          </span>
          {canListen(b, a) && listenGhost(b)}
        </span>
      );
    }
    if (a.state === 'passed') {
      return (
        <span className="inline-flex items-center gap-2">
          {pill('Passed', 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200')}
          {canListen(b, a) && listenGhost(b)}
        </span>
      );
    }
    if (a.state === 'submitted') {
      return isTutor && onListen
        ? <button onClick={() => onListen(wholeOf(b))}
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
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-gray-700">
        <h2 className="min-w-0 truncate text-xl sm:text-2xl text-slate-900 dark:text-slate-100 leading-tight" style={{ fontFamily: SERIF, fontWeight: 700 }}>
          {b.title}
        </h2>
        {b.kind && (
          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
            b.kind === 'hifz'
              ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
              : 'bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'}`}>
            {b.kind === 'hifz' ? 'Hifz' : 'Reading'}
          </span>
        )}
        <span dir="rtl" className="hidden sm:inline font-quranic text-lg text-slate-500 dark:text-slate-400">{b.arabic}</span>
        <span className="flex-grow" />

        {/* Closed: how it ended, and the way back if it was a mis-tap. */}
        {b.done && (
          <span className={`flex-shrink-0 inline-flex items-center h-8 px-3 rounded-full text-[12.5px] font-bold ${OUTCOME_PILL[b.outcome]}`}>
            {OUTCOME_LABEL[b.outcome]}
          </span>
        )}
        {b.done && isTutor && onReopen && (
          <button onClick={() => onReopen(b.hw)} title="Put it back on the list"
            className="flex-shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700">
            Reopen
          </button>
        )}

        {!b.done && <Action onClick={() => onOpenVerses(b.hw)} look="ghost">Open verses</Action>}

        {!b.done && isTutor && b.attempts.length > 0 && onCopyLink && (
          <Action onClick={() => onCopyLink(b.attempts[b.attempts.length - 1].rec)} look="ghost" title="Copy the recording link">
            Copy link
          </Action>
        )}

        {!b.done && isTutor && onMarkDone && (
          <Action onClick={() => onMarkDone(b.hw)} look="green" icon={ICON.tick}>Mark done</Action>
        )}
        {!b.done && isTutor && onMarkMissed && (
          <Action onClick={() => onMarkMissed(b.hw)} look="red" icon={ICON.cross}>Wasn't done</Action>
        )}
        {!b.done && isTutor && onRemove && (
          <Action onClick={() => onRemove(b.hw)} look="orange" icon={ICON.bin}>Remove</Action>
        )}
      </div>

      {b.plain ? (
        <div className="px-4 sm:px-6 py-3.5 flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{shortDate(b.hw.assignedAt)}</span>
          {b.hw.note && <span className="text-[13px] text-slate-600 dark:text-slate-300 flex-1 min-w-[10rem]">{b.hw.note}</span>}
          <span className="flex-grow" />
          {!b.done && pill(isTutor ? 'With the student' : 'To do', 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200')}
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
          <span className="justify-self-end">{action(b, a)}</span>
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

      {(hunts ?? []).map(h => {
        const mark = hunterMark(h);
        const waiting = h.status === 'submitted';
        return (
          <div key={h.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
              <span className="text-2xl" aria-hidden="true">◎</span>
              <div className="min-w-0">
                <p className="text-lg text-slate-900 dark:text-slate-100 leading-tight" style={{ fontFamily: SERIF, fontWeight: 600 }}>
                  Letters hunter ·{' '}
                  <span dir="rtl" lang="ar" style={{ fontFamily: "'Hafs', 'Amiri', serif" }}>{h.letters.join(' ')}</span>
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  set {shortDate(h.createdAt)} · {dueLabel(h)}
                  {waiting && ' · handed in, waiting to be marked'}
                </p>
              </div>
              <span className="flex-grow" />
              {mark && (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-[22px] leading-none text-emerald-700 dark:text-emerald-400" style={{ fontFamily: SERIF, fontWeight: 700 }}>
                    {mark.right}/{mark.total}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">marked</span>
                </span>
              )}
              {isTutor && onCopyHuntLink && (
                <button onClick={() => onCopyHuntLink(h)}
                  className="flex-shrink-0 h-9 px-4 rounded-full border border-slate-200 dark:border-gray-600 text-[13px] font-bold text-slate-600 dark:text-slate-300">
                  Copy link
                </button>
              )}
              {onOpenHunt && (isTutor ? h.status !== 'assigned' : h.status !== 'submitted') && (
                <button onClick={() => onOpenHunt(h)}
                  className={`flex-shrink-0 h-9 px-4 rounded-full text-[13px] font-black text-white ${
                    waiting && isTutor ? 'bg-orange-500 hover:bg-orange-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
                  {isTutor ? (waiting ? 'Mark the writing' : 'Look at it') : mark ? 'See the mark' : 'Do it'}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {(cardGames ?? []).map(g => {
        const tries = cardAttempts?.[g.id] ?? [];
        const best = tries.reduce((m, a) => Math.max(m, a.score), 0);
        return (
          <div key={g.id} className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
              <span className="text-2xl" aria-hidden="true">🃏</span>
              <div className="min-w-0">
                <p className="text-lg text-slate-900 dark:text-slate-100 leading-tight" style={{ fontFamily: SERIF, fontWeight: 600 }}>
                  {g.kind === 'words' ? 'Word cards' : `Letter cards · ${CARD_FORM[g.form ?? ''] ?? g.form}`}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {g.letters.length} {g.kind === 'words' ? 'word' : 'letter'}{g.letters.length === 1 ? '' : 's'} against the computer ·
                  {' '}set {shortDate(g.createdAt)} · play it as often as you like
                </p>
              </div>
              <span className="flex-grow" />
              {tries.length > 0 && (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-[22px] leading-none text-emerald-700 dark:text-emerald-400" style={{ fontFamily: SERIF, fontWeight: 700 }}>
                    {best}/{tries[0].total}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">best of {tries.length}</span>
                </span>
              )}
              {!isTutor && onPlayCards && (
                <button onClick={() => onPlayCards(g)}
                  className="flex-shrink-0 h-9 px-4 rounded-full bg-amber-500 text-white text-[13px] font-black hover:bg-amber-600">
                  {tries.length ? 'Play again' : 'Play'}
                </button>
              )}
            </div>
            {tries.length > 0 && (
              <div className="border-t border-slate-100 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700">
                {tries.map((a, i) => (
                  <div key={a.id} className="px-5 py-2 flex items-center gap-3 text-sm">
                    <span className="w-6 text-slate-400 dark:text-slate-500 tabular-nums">{tries.length - i}</span>
                    <span className="text-slate-500 dark:text-slate-400">{shortDate(a.createdAt)}</span>
                    <span className="flex-grow" />
                    {a.mistakes > 0 && (
                      <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">
                        {a.mistakes} wrong
                      </span>
                    )}
                    <span className={`text-[13px] font-black ${
                      a.endedReason === 'done' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'}`}>
                      {a.score}/{a.total}{a.endedReason === 'lives' ? ' · out of lives' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {openBlocks.length === 0 && (cardGames ?? []).length === 0 && (hunts ?? []).length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-10 text-center">
          <p className="text-lg text-slate-700 dark:text-slate-200" style={{ fontFamily: SERIF, fontWeight: 600 }}>
            {isTutor ? 'Nothing open' : 'All done'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isTutor ? 'Assign homework from the Quran page.' : 'Nothing to do until your next lesson.'}
          </p>
        </div>
      ) : openBlocks.map(blockCard)}

      {/* History — everything that is closed, whatever became of it: done,
          not done, and the ones the tutor took back. The last few are here
          without asking, because the question is almost always "what did we do
          last week"; the rest are a click away. */}
      {history.length > 0 && (
        <section className="flex flex-col gap-3 pt-2">
          <div className="flex items-center gap-3 px-1">
            <h2 className="text-xl text-slate-900 dark:text-slate-100" style={{ fontFamily: SERIF, fontWeight: 600 }}>
              History
            </h2>
            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-slate-100 dark:bg-gray-700 text-[12px] font-bold text-slate-500 dark:text-slate-400">
              {history.length}
            </span>
            <span className="flex-grow" />
            {isTutor && onClearFinished && (
              <button onClick={onClearFinished}
                className="text-[12px] font-bold text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                title="Delete the stored recordings of reviewed homework. The homework itself stays here.">
                Clear old recordings
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {historyShown.map(blockCard)}
          </div>

          {history.length > HISTORY_SHOWN && (
            <button onClick={() => setShowAllHistory(v => !v)}
              className="self-start py-2 px-1 flex items-center gap-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
              <svg className={`w-4 h-4 transition-transform ${showAllHistory ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
              {showAllHistory ? 'Show the last 5 only' : `Show all ${history.length}`}
            </button>
          )}
        </section>
      )}

    </div>
  );
};

export default HomeworkTab;
