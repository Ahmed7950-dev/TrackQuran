// ─────────────────────────────────────────────────────────────────────────────
// HomeworkTab — one card per piece of homework, whatever state it is in, on
// both sides: the tutor's tab and the student's portal.
//
// A recording that was sent back used to appear three times (a new homework, a
// "needs revision" row in the recitation history, and the old one under
// Completed). Here the tries live inside the one card: 1 recorded → 2 sent back
// → 3 recorded again, and finished work folds away at the bottom.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { QURAN_METADATA } from '../constants';
import { QuranHomework } from '../types';
import { RecitationHomework, versesOf } from '../services/recitationHomeworkService';

const SERIF = "'Cormorant Garamond', Georgia, serif";

type Tone = 'violet' | 'amber' | 'green';

const TONE = {
  violet: { chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200', dot: 'bg-violet-600', main: 'bg-violet-700 hover:bg-violet-800', card: 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700' },
  amber:  { chip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200', dot: 'bg-amber-600', main: 'bg-amber-700 hover:bg-amber-800', card: 'bg-amber-50/70 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' },
  green:  { chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200', dot: 'bg-emerald-600', main: 'bg-emerald-700 hover:bg-emerald-800', card: 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700' },
} as const;

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

interface Try { n: number; text: string; current: boolean }

/** The tries of a recording homework, oldest first, following the chain back. */
const triesOf = (rec: RecitationHomework | undefined, all: Record<string, RecitationHomework>): Try[] => {
  if (!rec) return [];
  const chain: RecitationHomework[] = [];
  for (let r: RecitationHomework | undefined = rec, guard = 0; r && guard < 10; guard++) {
    chain.unshift(r);
    r = r.parentId ? all[r.parentId] : undefined;
  }
  const out: Try[] = [];
  chain.forEach((r, i) => {
    const total = versesOf(r).length;
    const hifz = r.kind === 'hifz';
    const done = hifz ? (Object.keys(r.recordings).length ? total : 0) : Object.keys(r.recordings).length;
    const last = i === chain.length - 1;
    if (!last) {
      const wrong = r.reassignedCount ?? 0;
      out.push({ n: out.length + 1, text: `${total} verse${total === 1 ? '' : 's'}${wrong ? ` · ${wrong} wrong` : ''}`, current: false });
      if (wrong) out.push({ n: out.length + 1, text: `${wrong} sent back`, current: false });
    } else {
      out.push({
        n: out.length + 1,
        text: r.status === 'submitted' ? (hifz ? `${total} verse${total === 1 ? '' : 's'} sent` : `${done} of ${total} sent`)
          : r.status === 'passed' ? 'passed'
          : hifz ? (done ? 'recorded' : `${total} verse${total === 1 ? '' : 's'} to recite`)
          : `${done} of ${total} recorded`,
        current: true,
      });
    }
  });
  return out;
};

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

  const open = useMemo(() => homework.filter(hw => !hw.isDone), [homework]);
  const finished = useMemo(
    () => homework.filter(hw => hw.isDone).sort((a, b) => (b.assignedAt ?? '').localeCompare(a.assignedAt ?? '')),
    [homework]);

  const card = (hw: QuranHomework) => {
    const rec = hw.recitationId ? recitations[hw.recitationId] : undefined;
    const isRecording = !!hw.recitationId;
    const sentBack = isRecording && !!rec?.parentId;
    const submitted = rec?.status === 'submitted';

    const tone: Tone = submitted ? 'green' : sentBack ? 'amber' : 'violet';
    const t = TONE[tone];
    const state = submitted ? (isTutor ? 'Waiting for you' : 'Sent')
      : sentBack ? (isTutor ? 'Sent back' : 'Record again')
      : isTutor ? 'With the student' : 'To do';

    const tries = triesOf(rec, recitations);
    const backCount = sentBack ? versesOf(rec!).length : 0;

    // One clear action, and one quiet one beside it.
    // Nothing recorded on this try yet? The previous try is the useful listen.
    const parent = rec?.parentId ? recitations[rec.parentId] : undefined;
    const parentHasAudio = !!parent && Object.keys(parent.recordings).length > 0 && !parent.purgedAt;
    const main = isTutor
      ? (submitted ? { label: 'Listen and mark', run: () => rec && onListen?.(rec) }
        : isRecording && rec && Object.keys(rec.recordings).length > 0 ? { label: 'Listen', run: () => onListen?.(rec) }
        : parentHasAudio ? { label: 'Listen to try 1', run: () => onListen?.(parent!) }
        : { label: 'Open verses', run: () => onOpenVerses(hw) })
      // Already sent: there is nothing for the student to do but wait.
      : (submitted ? null
        : isRecording ? { label: sentBack ? `Record the ${backCount} verse${backCount === 1 ? '' : 's'}` : 'Record', run: () => onRecord?.(hw, rec) }
        : { label: 'Open verses', run: () => onOpenVerses(hw) });
    const second = isTutor
      ? { label: 'Open verses', run: () => onOpenVerses(hw) }
      : { label: 'Open verses', run: () => onOpenVerses(hw) };

    return (
      <article key={hw.id} className={`border rounded-3xl p-5 sm:p-6 flex flex-col gap-4 shadow-sm ${t.card}`}>
        <div className="flex items-start sm:items-center gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-lg sm:text-2xl text-slate-900 dark:text-slate-100 leading-tight" style={{ fontFamily: SERIF, fontWeight: 600 }}>
              {homeworkRange(hw)}
            </p>
            <p className="flex items-center gap-2 mt-0.5">
              <span className="font-quranic text-base text-slate-400 dark:text-slate-500">{surahArabic(hw.startSurah)}</span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-gray-600" />
              <span className="text-[13px] text-slate-400 dark:text-slate-500">{shortDate(hw.assignedAt)}</span>
            </p>
          </div>
          <span className="flex-grow" />
          <span className={`h-8 px-3 sm:px-3.5 rounded-full text-xs sm:text-[13px] font-bold flex items-center gap-2 flex-shrink-0 ${t.chip}`}>
            <span className={`w-[7px] h-[7px] rounded-full ${t.dot}`} />{state}
          </span>
        </div>

        {hw.note && !sentBack && (
          <p className="ps-4 border-s-2 border-violet-200 dark:border-violet-800 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
            {hw.note}
          </p>
        )}

        {/* The tries: a row each on a phone (and whenever there are more than
            three — side by side they cut their own words off), one segmented
            strip otherwise. */}
        {tries.length > 1 && (
          <div className={`flex rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden ${
            tries.length > 3 ? 'flex-col' : 'flex-col sm:flex-row'}`}>
            {tries.map(tr => (
              <span key={tr.n}
                className={`px-3 py-2.5 flex items-center gap-2.5 border-slate-200 dark:border-gray-700 ${
                  tries.length > 3 ? 'border-b last:border-b-0' : 'border-b sm:border-b-0 sm:border-e sm:flex-1 sm:min-w-0 last:border-b-0 sm:last:border-e-0'} ${
                  tr.current ? 'bg-white dark:bg-gray-800' : 'bg-slate-50 dark:bg-gray-700/40'}`}>
                <span className={`w-5 h-5 rounded-full border text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${
                  tr.current ? 'border-amber-400 text-amber-700 dark:text-amber-300' : 'border-slate-300 dark:border-gray-600 text-slate-500 dark:text-slate-400'}`}>{tr.n}</span>
                <span className={`text-[13px] whitespace-nowrap ${tr.current ? 'text-slate-700 dark:text-slate-200 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>{tr.text}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2.5 flex-wrap">
          {main && (
            <button onClick={main.run}
              className={`h-11 px-4 sm:px-5 rounded-full text-white text-sm font-bold whitespace-nowrap ${t.main} transition-colors`}>
              {main.label}
            </button>
          )}
          {main?.label !== second.label && (
            <button onClick={second.run}
              className="h-11 px-4 rounded-full border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 text-sm whitespace-nowrap transition-colors hover:bg-slate-50 dark:hover:bg-gray-700">
              {second.label}
            </button>
          )}
          <span className="flex-grow" />
          {isTutor && (
            <div className="relative">
              <button onClick={() => setMenuFor(menuFor === hw.id ? null : hw.id)}
                aria-label="More" aria-haspopup="true" aria-expanded={menuFor === hw.id}
                className="w-11 h-11 rounded-full border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-400 dark:text-slate-400 flex items-center justify-center hover:text-slate-600">
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
              </button>
              {menuFor === hw.id && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuFor(null)} />
                  <div className="absolute end-0 bottom-full mb-2 z-40 w-52 p-1.5 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-xl flex flex-col">
                    {rec && (
                      <button onClick={() => { onCopyLink?.(rec); setMenuFor(null); }}
                        className="px-3 py-2 rounded-xl text-start text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700">
                        Copy the recording link
                      </button>
                    )}
                    <button onClick={() => { onMarkDone?.(hw); setMenuFor(null); }}
                      className="px-3 py-2 rounded-xl text-start text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700">
                      Mark as done
                    </button>
                    <button onClick={() => { onRemove?.(hw); setMenuFor(null); }}
                      className="px-3 py-2 rounded-xl text-start text-sm font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30">
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </article>
    );
  };

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

      {open.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-10 text-center">
          <p className="text-lg text-slate-700 dark:text-slate-200" style={{ fontFamily: SERIF, fontWeight: 600 }}>
            {isTutor ? 'Nothing open' : 'All done'}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isTutor ? 'Assign homework from the Quran page.' : 'Nothing to do until your next lesson.'}
          </p>
        </div>
      ) : open.map(card)}

      <div className="flex items-center gap-3">
        <button onClick={() => setShowFinished(f => !f)}
          className="py-2 flex items-center gap-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <svg className={`w-4 h-4 transition-transform ${showFinished ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          Finished <span className="text-slate-400 dark:text-slate-500">{finished.length}</span>
        </button>
        <span className="flex-grow" />
        {isTutor && showFinished && finished.length > 0 && onClearFinished && (
          <button onClick={onClearFinished} className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline">
            Clear finished
          </button>
        )}
      </div>

      {showFinished && finished.length > 0 && (
        <div className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-slate-100 dark:divide-gray-700 overflow-hidden">
          {finished.map(hw => {
            const rec = hw.recitationId ? recitations[hw.recitationId] : undefined;
            const passed = rec?.status === 'passed';
            return (
              <div key={hw.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-[15px] text-slate-700 dark:text-slate-200" style={{ fontFamily: SERIF, fontWeight: 600 }}>{homeworkRange(hw)}</span>
                <span className="text-[13px] text-slate-400 dark:text-slate-500">{shortDate(hw.assignedAt)}</span>
                <span className="flex-grow" />
                {passed && <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">passed</span>}
                {isTutor && rec && Object.keys(rec.recordings).length > 0 && !rec.purgedAt && (
                  <button onClick={() => onListen?.(rec)}
                    className="h-8 px-3 rounded-full border border-slate-200 dark:border-gray-600 text-[13px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700">
                    Listen
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HomeworkTab;
