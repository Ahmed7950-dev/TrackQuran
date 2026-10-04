// components/ArabicCreateHomeworkTab.tsx
// ---------------------------------------------------------------------------
// The tutor's homework library — write a piece of homework once, on its own
// topic, and give it to whichever student needs it.
//
// The library belongs to the tutor, not to a student: homework written here on
// one student's page is on every other student's page too, ready to assign.
//
// Building one opens the SAME screen the admin uses for a lesson's homework —
// a template is just another id to hand it — so every question type, the
// student's runner and the marking all work on these without being rebuilt.
// ---------------------------------------------------------------------------
import React, { useCallback, useEffect, useState } from 'react';
import type { ArabicStudent } from '../types';
import {
  HomeworkTemplate, listHomeworkTemplates, createHomeworkTemplate, updateHomeworkTemplate,
  deleteHomeworkTemplate, duplicateHomeworkTemplate, assignHomeworkTemplate,
} from '../services/arabicHomeworkTemplateService';
import { HomeworkTab } from './ArabicLessonDetailPage';

/** Deadline picker, in the same words the vocabulary homework uses. */
const AssignDialog: React.FC<{
  template: HomeworkTemplate;
  studentName: string;
  nextLessonAt: Date | null;
  onClose: () => void;
  onAssign: (deadline: string | null) => Promise<void>;
}> = ({ template, studentName, nextLessonAt, onClose, onAssign }) => {
  const upcoming = nextLessonAt && +nextLessonAt > Date.now() ? nextLessonAt : null;
  const [mode, setMode] = useState<'next' | 'custom' | 'open'>(upcoming ? 'next' : 'open');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = async () => {
    const when = new Date(custom);
    const deadline = mode === 'next' ? upcoming?.toISOString() ?? null
      : mode === 'custom' && Number.isFinite(+when) ? when.toISOString() : null;
    if (mode === 'custom' && (!deadline || Date.parse(deadline) <= Date.now())) {
      setError('Choose a future deadline.'); return;
    }
    setBusy(true); setError('');
    try { await onAssign(deadline); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not assign the homework.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 p-4 flex items-center justify-center">
      <section role="dialog" aria-modal="true" aria-label={`Assign ${template.title}`}
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl p-6 space-y-4 shadow-xl">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white truncate">{template.title}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">To {studentName}</p>
          </div>
          <button disabled={busy} onClick={onClose} aria-label="Close" className="p-2 text-slate-500">✕</button>
        </div>
        <label className="block text-sm text-slate-600 dark:text-slate-300">
          Deadline
          <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}
            className="block w-full mt-1 p-3 rounded-lg bg-slate-100 dark:bg-gray-700 dark:text-white">
            {upcoming && <option value="next">Next lesson · {upcoming.toLocaleString()}</option>}
            <option value="custom">Choose date and time</option>
            <option value="open">No deadline</option>
          </select>
        </label>
        {mode === 'custom' && (
          <input aria-label="Homework deadline" type="datetime-local" value={custom}
            onChange={e => setCustom(e.target.value)}
            className="w-full p-3 rounded-lg bg-slate-100 dark:bg-gray-700 dark:text-white" />
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} onClick={go}
          className="w-full py-3 rounded-xl bg-teal-700 text-white font-bold disabled:opacity-50">
          {busy ? 'Assigning…' : `Assign to ${studentName}`}
        </button>
      </section>
    </div>
  );
};

const ArabicCreateHomeworkTab: React.FC<{
  student: ArabicStudent;
  teacherId: string;
  nextLessonAt?: Date | null;
}> = ({ student, teacherId, nextLessonAt = null }) => {
  const [rows, setRows] = useState<HomeworkTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<HomeworkTemplate | null>(null);   // being built
  const [assigning, setAssigning] = useState<HomeworkTemplate | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');

  const load = useCallback(async () => {
    setRows(await listHomeworkTemplates(teacherId));
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!newTitle.trim()) return;
    setBusy('new');
    const made = await createHomeworkTemplate(teacherId, newTitle, newTopic);
    setBusy(null); setNewTitle(''); setNewTopic('');
    if (made) { await load(); setOpen(made); }
  };

  const duplicate = async (t: HomeworkTemplate) => {
    setBusy(t.id);
    await duplicateHomeworkTemplate(t);
    setBusy(null); setNote(`Copied “${t.title}”.`); await load();
  };

  const remove = async (t: HomeworkTemplate) => {
    if (!window.confirm(`Delete “${t.title}” and everything in it? Homework already with a student will stop working.`)) return;
    setBusy(t.id);
    await deleteHomeworkTemplate(t.id);
    setBusy(null); await load();
  };

  const rename = async (t: HomeworkTemplate) => {
    const title = window.prompt('Homework title', t.title);
    if (title === null) return;
    const topic = window.prompt('Topic (optional)', t.topic ?? '') ?? '';
    await updateHomeworkTemplate(t.id, { title, topic });
    await load();
  };

  // ── Building one: the admin's own homework screen, pointed at the template ──
  if (open) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setOpen(null); void load(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 text-sm font-semibold">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            All homework
          </button>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">{open.title}</h2>
            {open.topic && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{open.topic}</p>}
          </div>
          <span className="flex-grow" />
          <button onClick={() => setAssigning(open)}
            className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-extrabold">
            Assign to {student.name}
          </button>
        </div>
        <HomeworkTab
          lessonId={open.id}
          lessonTitle={open.title}
          isAdmin
          studentMode={false}
          studentId={student.id}
          studentName={student.name}
          teacherId={teacherId}
        />
        {assigning && (
          <AssignDialog template={assigning} studentName={student.name} nextLessonAt={nextLessonAt}
            onClose={() => setAssigning(null)}
            onAssign={async deadline => {
              await assignHomeworkTemplate({ template: assigning, teacherId, studentId: student.id, studentName: student.name, deadline });
              setAssigning(null); setNote(`Sent “${assigning.title}” to ${student.name}.`);
            }} />
        )}
      </div>
    );
  }

  // ── The library ──
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Create homework</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Written once and kept for every student — build it here, then assign it from whichever student needs it.
        </p>
      </header>

      {note && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{note}</p>}

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">New homework</p>
        <div className="flex flex-wrap gap-2">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Title — e.g. Past tense verbs" aria-label="Homework title"
            className="flex-1 min-w-[200px] h-11 px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-slate-800 dark:text-slate-100" />
          <input value={newTopic} onChange={e => setNewTopic(e.target.value)}
            placeholder="Topic (optional)" aria-label="Homework topic"
            className="w-[180px] h-11 px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-slate-800 dark:text-slate-100" />
          <button onClick={create} disabled={!newTitle.trim() || busy === 'new'}
            className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-extrabold disabled:opacity-40">
            {busy === 'new' ? 'Creating…' : 'Create and build'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-6 text-center">Loading homework…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-10 text-center">
          <div className="text-4xl mb-2">📝</div>
          <p className="font-bold text-slate-700 dark:text-slate-200">No homework written yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Give it a title above and start building.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(t => (
            <article key={t.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-extrabold text-slate-800 dark:text-slate-100 truncate">{t.title}</h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {t.topic ? `${t.topic} · ` : ''}
                  {t.questionCount ?? 0} question{(t.questionCount ?? 0) === 1 ? '' : 's'}
                  {` · ${t.itemCount ?? 0} item${(t.itemCount ?? 0) === 1 ? '' : 's'}`}
                  {` · changed ${new Date(t.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setOpen(t)}
                  className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 text-xs font-bold">Open</button>
                <button onClick={() => rename(t)}
                  className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 text-xs font-bold">Rename</button>
                <button disabled={busy === t.id} onClick={() => duplicate(t)}
                  className="h-9 px-3 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-40">Duplicate</button>
                <button disabled={busy === t.id} onClick={() => remove(t)}
                  className="h-9 px-3 rounded-lg text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">Delete</button>
                <button onClick={() => setAssigning(t)}
                  className="h-9 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold">
                  Assign
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {assigning && (
        <AssignDialog template={assigning} studentName={student.name} nextLessonAt={nextLessonAt}
          onClose={() => setAssigning(null)}
          onAssign={async deadline => {
            await assignHomeworkTemplate({ template: assigning, teacherId, studentId: student.id, studentName: student.name, deadline });
            setAssigning(null); setNote(`Sent “${assigning.title}” to ${student.name}.`);
          }} />
      )}
    </div>
  );
};

export default ArabicCreateHomeworkTab;
