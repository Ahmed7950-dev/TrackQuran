// ─────────────────────────────────────────────────────────────────────────────
// VocabHomeworkBasket — the tutor's basket of words for vocabulary homework.
//
//   useHomeworkBasket  the draft basket (saved as it changes, so it survives a
//                      refresh) plus every homework already sent.
//   HomeworkBasket     the panel: the basket's words, "add saved words", a
//                      deadline (next lesson by default, a date, or open), the
//                      link, and the homework sent so far with scores.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArabicStudent, VocabWord } from '../types';
import { ensureShareTokenById } from '../services/arabicService';
import {
  HomeworkWord, VocabHomework, assignHomework, deleteVocabHomework, homeworkUrl,
  isHomeworkExpired, listVocabHomework, saveHomeworkBasket, toHomeworkWord,
} from '../services/vocabHomeworkService';

// ── State ────────────────────────────────────────────────────────────────────

export interface HomeworkBasketState {
  words: HomeworkWord[];
  ids: Set<string>;
  sent: VocabHomework[];
  loading: boolean;
  toggle: (w: VocabWord) => void;
  addMany: (ws: VocabWord[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  assign: (deadline: string | null, distractors: string[]) => Promise<VocabHomework | null>;
  deleteSent: (id: string) => Promise<void>;
}

export function useHomeworkBasket(student: ArabicStudent, enabled: boolean): HomeworkBasketState {
  const [words, setWords] = useState<HomeworkWord[]>([]);
  const [sent, setSent] = useState<VocabHomework[]>([]);
  const [loading, setLoading] = useState(enabled);
  const draftRef = useRef<VocabHomework | null>(null);
  // Saves run one after another, so the first add can't race a second one
  // into creating two draft rows.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoading(true);
    listVocabHomework(student.id).then(list => {
      if (!live) return;
      const draft = list.find(h => h.status === 'draft') ?? null;
      draftRef.current = draft;
      setWords(draft?.words ?? []);
      setSent(list.filter(h => h.status !== 'draft'));
      setLoading(false);
    });
    return () => { live = false; };
  }, [student.id, enabled]);

  const persist = useCallback((next: HomeworkWord[]) => {
    setWords(next);
    queue.current = queue.current.then(async () => {
      const saved = await saveHomeworkBasket({
        draftId: draftRef.current?.id ?? null,
        teacherId: student.teacherId, studentId: student.id, studentName: student.name,
        words: next,
      });
      if (saved) draftRef.current = saved;
    });
  }, [student.id, student.teacherId, student.name]);

  const ids = useMemo(() => new Set(words.map(w => w.id)), [words]);

  const toggle = (w: VocabWord) =>
    persist(ids.has(w.id) ? words.filter(x => x.id !== w.id) : [...words, toHomeworkWord(w)]);
  const addMany = (ws: VocabWord[]) => {
    const fresh = ws.filter(w => !ids.has(w.id)).map(toHomeworkWord);
    if (fresh.length) persist([...words, ...fresh]);
  };
  const remove = (id: string) => persist(words.filter(w => w.id !== id));
  const clear = () => persist([]);

  const assign = async (deadline: string | null, distractors: string[]) => {
    await queue.current;                        // the last word added is saved first
    const draft = draftRef.current;
    if (!draft || !draft.words.length) return null;
    const notifyId = student.shareToken ?? await ensureShareTokenById(student.id);
    const hw = await assignHomework({ draft, deadline, distractors, studentNotifyId: notifyId });
    if (!hw) return null;
    draftRef.current = null;                    // the next word starts a new basket
    setWords([]);
    setSent(prev => [hw, ...prev]);
    return hw;
  };

  const deleteSent = async (id: string) => {
    if (await deleteVocabHomework(id)) setSent(prev => prev.filter(h => h.id !== id));
  };

  return { words, ids, sent, loading, toggle, addMany, remove, clear, assign, deleteSent };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtWhen = (d: Date | string): string =>
  new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
const toLocalInput = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const shuffle = <T,>(a: T[]): T[] => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

type DeadlineMode = 'next' | 'custom' | 'open';

// ── Panel ────────────────────────────────────────────────────────────────────

interface Props {
  basket: HomeworkBasketState;
  student: ArabicStudent;
  /** Every word of the student's course — the wrong options come from here. */
  courseWords: VocabWord[];
  /** The words saved with "Review later". */
  savedWords: VocabWord[];
  nextLessonAt: Date | null;
  onClose: () => void;
}

const HomeworkBasket: React.FC<Props> = ({ basket, student, courseWords, savedWords, nextLessonAt, onClose }) => {
  const upcoming = nextLessonAt && nextLessonAt.getTime() > Date.now() ? nextLessonAt : null;
  const [mode, setMode] = useState<DeadlineMode>(upcoming ? 'next' : 'custom');
  const [custom, setCustom] = useState(() => toLocalInput(upcoming ?? new Date(Date.now() + 7 * 864e5)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [justSent, setJustSent] = useState<VocabHomework | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [openResults, setOpenResults] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const savedNotInBasket = savedWords.filter(w => !basket.ids.has(w.id));

  const copy = async (id: string) => {
    try { await navigator.clipboard.writeText(homeworkUrl(id)); } catch { /* insecure context */ }
    setCopied(id);
    window.setTimeout(() => setCopied(c => (c === id ? null : c)), 1500);
  };

  const generate = async () => {
    setError('');
    let deadline: string | null = null;
    if (mode === 'next' && upcoming) deadline = upcoming.toISOString();
    if (mode === 'custom') {
      const d = new Date(custom);
      if (Number.isNaN(d.getTime())) { setError('Pick a valid deadline.'); return; }
      if (d.getTime() <= Date.now()) { setError('The deadline has to be in the future.'); return; }
      deadline = d.toISOString();
    }
    setBusy(true);
    const inBasket = basket.ids;
    const distractors = shuffle(
      [...new Set(courseWords.filter(w => !inBasket.has(w.id)).map(w => w.arabic.trim()).filter(Boolean))],
    ).slice(0, 150);
    const hw = await basket.assign(deadline, distractors);
    setBusy(false);
    if (!hw) { setError('Could not create the homework — check your connection and try again.'); return; }
    setJustSent(hw);
    copy(hw.id);
  };

  const statusChip = (hw: VocabHomework) => {
    if (hw.status === 'completed') {
      const pct = hw.totalCount ? (hw.correctCount ?? 0) / hw.totalCount : 0;
      return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
          pct >= 0.8 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
            : pct >= 0.5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
          ✓ Done · {hw.correctCount}/{hw.totalCount}
        </span>
      );
    }
    if (isHomeworkExpired(hw)) {
      return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600 dark:bg-gray-700 dark:text-slate-300">Expired</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Waiting</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-white dark:bg-gray-800 border-b border-slate-100 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">🧺 Homework Basket</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">Words for {student.name} to practise before the deadline</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="flex-shrink-0 w-9 h-9 rounded-full text-2xl leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-600">×</button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-6">
          {/* ── Just sent ── */}
          {justSent && (
            <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-2">
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
                ✓ Homework sent — {student.name} got a notification in their portal.
              </p>
              <div className="flex items-center gap-2">
                <input readOnly value={homeworkUrl(justSent.id)} onFocus={e => e.currentTarget.select()}
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-gray-900 text-xs text-slate-700 dark:text-slate-200" />
                <button onClick={() => copy(justSent.id)}
                  className="flex-shrink-0 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                  {copied === justSent.id ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
            </div>
          )}

          {/* ── The basket ── */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                In the basket <span className="text-slate-400 font-semibold">({basket.words.length})</span>
              </h3>
              <div className="ml-auto flex flex-wrap gap-2">
                <button onClick={() => basket.addMany(savedWords)} disabled={savedNotInBasket.length === 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 disabled:opacity-40 disabled:cursor-default">
                  🔖 Add saved words{savedNotInBasket.length ? ` (${savedNotInBasket.length})` : ''}
                </button>
                {basket.words.length > 0 && (
                  <button onClick={basket.clear}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/30">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {basket.loading ? (
              <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
            ) : basket.words.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-gray-700 p-6 text-center">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">The basket is empty</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Close this and tap words in the vocabulary table, or add the saved words.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm table-fixed">
                  <colgroup><col /><col /><col style={{ width: '40px' }} /></colgroup>
                  <tbody>
                    {basket.words.map(w => (
                      <tr key={w.id} className="border-b border-slate-100 dark:border-gray-700 last:border-0">
                        <td className="px-3 py-2 text-right font-semibold text-base text-slate-800 dark:text-slate-100 break-words" dir="rtl">{w.arabic}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300 break-words">{w.english}</td>
                        <td className="px-1 py-2 text-center">
                          <button onClick={() => basket.remove(w.id)} aria-label={`Remove ${w.english}`}
                            className="w-7 h-7 rounded-full text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Deadline + link ── */}
          <section className="space-y-3 rounded-xl bg-slate-50 dark:bg-gray-900/40 p-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Deadline</h3>
            <div className="space-y-2">
              {upcoming && (
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input type="radio" name="hw-deadline" checked={mode === 'next'} onChange={() => setMode('next')}
                    className="mt-0.5 text-violet-600 focus:ring-violet-500" />
                  <span className="text-sm text-slate-700 dark:text-slate-200">
                    Until the next lesson <span className="text-slate-500 dark:text-slate-400">· {fmtWhen(upcoming)}</span>
                    <span className="ml-1.5 text-[10px] font-bold uppercase text-violet-600 dark:text-violet-400">suggested</span>
                  </span>
                </label>
              )}
              <label className="flex flex-wrap items-center gap-2.5 cursor-pointer">
                <input type="radio" name="hw-deadline" checked={mode === 'custom'} onChange={() => setMode('custom')}
                  className="text-violet-600 focus:ring-violet-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">On</span>
                <input type="datetime-local" value={custom}
                  onChange={e => { setCustom(e.target.value); setMode('custom'); }}
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-slate-700 dark:text-slate-200" />
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="radio" name="hw-deadline" checked={mode === 'open'} onChange={() => setMode('open')}
                  className="text-violet-600 focus:ring-violet-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">Keep it open (no deadline)</span>
              </label>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <button onClick={generate} disabled={busy || basket.words.length === 0}
              className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-default">
              {busy ? 'Creating…' : `🔗 Generate homework link${basket.words.length ? ` · ${basket.words.length} word${basket.words.length === 1 ? '' : 's'}` : ''}`}
            </button>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
              {student.name} is notified in their portal, and the link is copied so you can send it too.
            </p>
          </section>

          {/* ── Sent homework ── */}
          {basket.sent.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Sent homework</h3>
              <div className="rounded-xl border border-slate-200 dark:border-gray-700 divide-y divide-slate-100 dark:divide-gray-700">
                {basket.sent.map(hw => {
                  const byId = new Map(hw.words.map(w => [w.id, w] as [string, HomeworkWord]));
                  return (
                    <div key={hw.id} className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setOpenResults(o => (o === hw.id ? null : hw.id))}
                          disabled={hw.status !== 'completed'}
                          className="min-w-0 text-left disabled:cursor-default">
                          <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {hw.words.length} word{hw.words.length === 1 ? '' : 's'}
                            {hw.status === 'completed' && <span className="ml-1 text-xs text-slate-400">{openResults === hw.id ? '▾' : '▸'}</span>}
                          </span>
                          <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                            Sent {fmtWhen(hw.assignedAt ?? hw.createdAt)}
                            {' · '}{hw.completedAt ? `done ${fmtWhen(hw.completedAt)}` : hw.deadline ? `due ${fmtWhen(hw.deadline)}` : 'no deadline'}
                          </span>
                        </button>
                        <span className="ml-auto flex items-center gap-1.5">
                          {statusChip(hw)}
                          <button onClick={() => copy(hw.id)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30">
                            {copied === hw.id ? 'Copied ✓' : 'Copy link'}
                          </button>
                          <button onClick={() => { if (confirm('Delete this homework? The link stops working.')) basket.deleteSent(hw.id); }}
                            aria-label="Delete homework"
                            className="w-7 h-7 rounded-full text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30">×</button>
                        </span>
                      </div>
                      {openResults === hw.id && hw.results && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {hw.results.map(r => {
                            const w = byId.get(r.wordId);
                            return (
                              <span key={r.wordId}
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.correct
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                                {r.correct ? '✓' : '✗'} {w?.english ?? '—'} <span dir="rtl">{w?.arabic}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeworkBasket;
