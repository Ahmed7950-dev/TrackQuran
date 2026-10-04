import React, { useState } from 'react';

export default function ArabicHomeworkChoice({ title, count, nextLessonAt, onClose, onPlay, onAssign }: {
  title: string; count: number; nextLessonAt: Date | null; onClose: () => void;
  onPlay: () => void; onAssign: (deadline: string | null) => Promise<void>;
}) {
  const upcoming = nextLessonAt && +nextLessonAt > Date.now() ? nextLessonAt : null;
  const [mode, setMode] = useState<'next' | 'custom' | 'open'>(upcoming ? 'next' : 'open');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assign = async () => {
    const customDate = new Date(custom);
    const deadline = mode === 'next' ? upcoming?.toISOString() ?? null : mode === 'custom' && Number.isFinite(+customDate) ? customDate.toISOString() : null;
    if (mode === 'custom' && (!deadline || Date.parse(deadline) <= Date.now())) { setError('Choose a future deadline.'); return; }
    setBusy(true); setError('');
    try { await onAssign(deadline || null); } catch (e) { setError(e instanceof Error ? e.message : 'Could not assign homework. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[70] bg-black/50 p-4 flex items-center justify-center">
    <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl p-6 space-y-5 shadow-xl">
      <div className="flex justify-between items-center"><h2 className="text-xl font-bold text-slate-800 dark:text-white">{title}</h2><button disabled={busy} onClick={onClose} aria-label="Close" className="p-2 text-slate-500">✕</button></div>
      <p className="text-slate-500 dark:text-slate-300">{count} selected words</p>
      <button disabled={busy} onClick={onPlay} className="w-full p-4 rounded-xl border-2 border-teal-500 text-teal-800 dark:text-teal-200 text-left font-bold">Practise now with student<span className="block text-sm font-normal mt-1">Start the challenge together.</span></button>
      <div className="border-t border-slate-200 dark:border-gray-600 pt-4 space-y-3"><h3 className="font-bold text-slate-800 dark:text-white">Assign as homework</h3>
        <label className="block text-sm text-slate-600 dark:text-slate-300">Deadline<select value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="block w-full mt-1 p-3 rounded-lg bg-slate-100 dark:bg-gray-700">
          {upcoming && <option value="next">Next lesson · {upcoming.toLocaleString()}</option>}<option value="custom">Choose date and time</option><option value="open">No deadline</option>
        </select></label>
        {mode === 'custom' && <input aria-label="Homework deadline" type="datetime-local" value={custom} onChange={e => setCustom(e.target.value)} className="w-full p-3 rounded-lg bg-slate-100 dark:bg-gray-700 dark:text-white" />}
        <button disabled={busy} onClick={assign} className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold disabled:opacity-50">{busy ? 'Assigning…' : 'Assign homework'}</button>
      </div>{error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
    </section>
  </div>;
}
