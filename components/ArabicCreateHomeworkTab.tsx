// components/ArabicCreateHomeworkTab.tsx
// ---------------------------------------------------------------------------
// The tutor's homework library — write a piece of homework once, on its own
// topic, and give it to whichever student needs it.
//
// The library belongs to the tutor, not to a student: homework written here on
// one student's page is on every other student's page too, ready to assign.
//
// An entry is one of three kinds — written questions, pronoun pictures, a
// speaking dialogue — and each opens in the builder that kind already has:
// the lesson-homework screen, the Lesson 3 exercise editor, the dialogue
// builder. Nothing was rebuilt to bring the first two here; a library entry is
// just another id to hand them.
//
// And every entry goes out two ways, side by side on its row:
//   Assign          to the student whose page this is, once, with a deadline
//   Add to a lesson a card in that lesson's Homework tab, for everyone on it,
//                   until it is taken off again
// ---------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArabicLesson, ArabicStudent } from '../types';
import {
  HomeworkTemplate, KIND_LABEL, TemplateKind, listHomeworkTemplates, createHomeworkTemplate, updateHomeworkTemplate,
  deleteHomeworkTemplate, duplicateHomeworkTemplate, assignHomeworkTemplate,
  addTemplateToLesson, removeTemplateFromLesson,
} from '../services/arabicHomeworkTemplateService';
import { getArabicLessons } from '../services/arabicService';
import { listLessonExercises, type LessonExercise } from '../services/lessonExerciseService';
import { emptyContent, notReadyReason } from '../services/speakingHomeworkService';
import { HomeworkTab } from './ArabicLessonDetailPage';
import { PronounPicturesEditor } from './PronounPicturesExercise';
import SpeakingBuilder from './SpeakingBuilder';
import { Icon } from './speakingShared';

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

const KIND_ICON: Record<TemplateKind, (p: { className?: string }) => React.ReactElement> = {
  written: Icon.pen,
  pronoun_pictures: Icon.pictures,
  speaking: Icon.mic,
};
const KIND_TINT: Record<TemplateKind, string> = {
  written: 'bg-slate-100 text-slate-700 dark:bg-gray-700 dark:text-slate-200',
  pronoun_pictures: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  speaking: 'bg-amber-200 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
};
const KIND_WHAT: Record<TemplateKind, string> = {
  written: 'Multiple choice, fill the blank, matching, translation — marked for you where it can be.',
  pronoun_pictures: 'Four pictures that speak. The student works out who did it and writes the pronoun.',
  speaking: 'A speaker says a line, the student answers out loud. You mark each answer right or wrong.',
};
const KINDS: TemplateKind[] = ['written', 'pronoun_pictures', 'speaking'];

/** What is inside an entry, in a few words. */
const contents = (t: HomeworkTemplate): string => {
  if (t.kind === 'speaking') { const n = t.speaking?.lines.length ?? 0; return `${n} line${n === 1 ? '' : 's'}`; }
  if (t.kind === 'pronoun_pictures') { const n = t.roundCount ?? 0; return `${n} round${n === 1 ? '' : 's'}`; }
  const q = t.questionCount ?? 0;
  return `${q} question${q === 1 ? '' : 's'}`;
};

const lessonName = (l: ArabicLesson): string => l.title;

/**
 * Put a homework into lessons, or take it out. Each tick is saved as it is
 * made — this is a list of where it lives, not a form to submit.
 */
const LessonPicker: React.FC<{
  template: HomeworkTemplate;
  lessons: ArabicLesson[];
  teacherId: string;
  onClose: () => void;
  onChanged: (lessonIds: string[]) => void;
}> = ({ template, lessons, teacherId, onClose, onChanged }) => {
  const [inLessons, setInLessons] = useState<string[]>(template.lessonIds ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by = new Map<string, ArabicLesson[]>();
    for (const l of [...lessons].sort((a, b) => a.orderIndex - b.orderIndex)) {
      if (q && !l.title.toLowerCase().includes(q)) continue;
      const key = `${l.dialect === 'msa' ? 'Modern Standard Arabic' : 'Levantine'} · Level ${l.level}`;
      by.set(key, [...(by.get(key) ?? []), l]);
    }
    return [...by.entries()];
  }, [lessons, query]);

  const toggle = async (lesson: ArabicLesson) => {
    const has = inLessons.includes(lesson.id);
    setBusy(lesson.id); setError('');
    const ok = has
      ? await removeTemplateFromLesson(template.id, lesson.id)
      : await addTemplateToLesson(template.id, lesson.id, teacherId);
    setBusy(null);
    if (!ok) { setError('Could not save that — check your connection and try again.'); return; }
    const next = has ? inLessons.filter(id => id !== lesson.id) : [...inLessons, lesson.id];
    setInLessons(next);
    onChanged(next);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 p-4 flex items-center justify-center">
      <section role="dialog" aria-modal="true" aria-label={`Add ${template.title} to a lesson`}
        className="w-full max-w-lg max-h-[86vh] bg-white dark:bg-gray-800 rounded-3xl shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white truncate">Add “{template.title}” to a lesson</h2>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-300 mt-0.5">
              It becomes a card in that lesson’s Homework tab for every student who reaches it — and stays until you untick it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-10 h-10 flex-shrink-0 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center justify-center">
            <Icon.cross className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-2">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a lesson" aria-label="Find a lesson"
            className="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-slate-800 dark:text-slate-100" />
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}
        </div>
        <div className="flex-grow min-h-0 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
          {groups.length === 0 && <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">No lesson by that name.</p>}
          {groups.map(([name, list]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{name}</p>
              {list.map(l => {
                const on = inLessons.includes(l.id);
                return (
                  <button key={l.id} onClick={() => void toggle(l)} disabled={busy === l.id} role="checkbox" aria-checked={on}
                    className={`min-h-[48px] px-3 py-2 rounded-2xl border text-left flex items-center gap-3 disabled:opacity-60 ${
                      on ? 'border-teal-600 bg-teal-50 dark:bg-teal-900/25' : 'border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700/50'}`}>
                    <span aria-hidden="true" className={`w-6 h-6 flex-shrink-0 rounded-lg border-2 flex items-center justify-center ${
                      on ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-300 dark:border-gray-500'}`}>
                      {on && <Icon.check className="w-3.5 h-3.5" />}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{lessonName(l)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-gray-700 flex items-center gap-3">
          <p className="flex-1 text-[13px] font-semibold text-slate-600 dark:text-slate-300">
            {inLessons.length === 0 ? 'Not in any lesson.' : `In ${inLessons.length} lesson${inLessons.length === 1 ? '' : 's'}.`}
          </p>
          <button onClick={onClose} className="h-11 px-5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-extrabold">Done</button>
        </div>
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
  const [lessons, setLessons] = useState<ArabicLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<HomeworkTemplate | null>(null);   // being built
  /** The exercise row behind an open pronoun-pictures entry. */
  const [exercise, setExercise] = useState<LessonExercise | null>(null);
  const [assigning, setAssigning] = useState<HomeworkTemplate | null>(null);
  const [placing, setPlacing] = useState<HomeworkTemplate | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newKind, setNewKind] = useState<TemplateKind>('written');

  const load = useCallback(async () => {
    setRows(await listHomeworkTemplates(teacherId));
    setLoading(false);
  }, [teacherId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void getArabicLessons().then(setLessons); }, []);
  const lessonTitle = useMemo(() => new Map(lessons.map(l => [l.id, lessonName(l)])), [lessons]);

  const openEntry = async (t: HomeworkTemplate) => {
    setError(''); setMenu(null);
    if (t.kind === 'pronoun_pictures') {
      const [ex] = await listLessonExercises(t.id, true);
      if (!ex) { setError('This exercise could not be opened. Refresh and try again.'); return; }
      setExercise(ex);
    }
    setOpen(t);
  };

  const create = async () => {
    if (!newTitle.trim()) return;
    setBusy('new'); setError('');
    const made = await createHomeworkTemplate(teacherId, newTitle, undefined, newKind);
    setBusy(null);
    if (!made) {
      setError(newKind === 'written'
        ? 'Could not create the homework — check your connection.'
        : 'Could not create it. This kind of homework needs the latest database update to be applied first.');
      return;
    }
    setNewTitle('');
    await load();
    await openEntry(made);
  };

  const duplicate = async (t: HomeworkTemplate) => {
    setBusy(t.id); setMenu(null);
    await duplicateHomeworkTemplate(t);
    setBusy(null); setNote(`Copied “${t.title}”.`); await load();
  };

  const remove = async (t: HomeworkTemplate) => {
    setMenu(null);
    const where = (t.lessonIds ?? []).length;
    if (!window.confirm(`Delete “${t.title}” and everything in it?${where ? ` It will also leave the ${where} lesson${where === 1 ? '' : 's'} it is in.` : ''} Homework already with a student will stop working.`)) return;
    setBusy(t.id);
    await deleteHomeworkTemplate(t.id);
    setBusy(null); await load();
  };

  const rename = async (t: HomeworkTemplate) => {
    setMenu(null);
    const title = window.prompt('Homework title', t.title);
    if (title === null) return;
    await updateHomeworkTemplate(t.id, { title });
    await load();
  };

  const assignDialog = assigning && (
    <AssignDialog template={assigning} studentName={student.name} nextLessonAt={nextLessonAt}
      onClose={() => setAssigning(null)}
      onAssign={async deadline => {
        await assignHomeworkTemplate({ template: assigning, teacherId, studentId: student.id, studentName: student.name, deadline });
        setAssigning(null); setNote(`Sent “${assigning.title}” to ${student.name}.`);
      }} />
  );
  const lessonDialog = placing && (
    <LessonPicker template={placing} lessons={lessons} teacherId={teacherId}
      onClose={() => setPlacing(null)}
      onChanged={ids => {
        setRows(prev => prev.map(r => (r.id === placing.id ? { ...r, lessonIds: ids } : r)));
        setOpen(prev => (prev && prev.id === placing.id ? { ...prev, lessonIds: ids } : prev));
        setPlacing(prev => (prev ? { ...prev, lessonIds: ids } : prev));
      }} />
  );

  /** Why a speaking entry cannot go out yet, or ''. The other kinds always can. */
  const blocked = (t: HomeworkTemplate): string =>
    t.kind === 'speaking' ? notReadyReason(t.speaking ?? emptyContent()) : '';

  const giveButtons = (t: HomeworkTemplate, big = false) => {
    const why = blocked(t);
    const h = big ? 'h-11 px-4 text-sm' : 'h-11 px-3.5 text-[13.5px]';
    return (
      <>
        <button onClick={() => setPlacing(t)} disabled={!!why} title={why || 'A card in a lesson’s Homework tab, for every student on it'}
          className={`${h} rounded-xl border-2 border-teal-700 dark:border-teal-500 bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 font-extrabold flex items-center gap-1.5 disabled:opacity-40`}>
          <Icon.book className="w-4 h-4" /> Add to a lesson
        </button>
        <button onClick={() => setAssigning(t)} disabled={!!why} title={why || `For ${student.name} only, one time`}
          className={`${h} rounded-xl border-2 border-teal-700 bg-teal-700 hover:bg-teal-800 text-white font-extrabold disabled:opacity-40`}>
          Assign to {student.name.trim().split(/\s+/)[0]}
        </button>
      </>
    );
  };

  // ── Building one, in the builder its kind already has ──
  if (open) {
    const back = () => { setOpen(null); setExercise(null); void load(); };
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={back}
            className="h-11 flex items-center gap-1.5 pl-2.5 pr-3.5 rounded-[14px] border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 text-sm font-bold">
            <Icon.back className="w-[18px] h-[18px]" /> All homework
          </button>
          <div className="min-w-0 flex-[1_1_10rem]">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 truncate">{open.title}</h2>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">
              {KIND_LABEL[open.kind]}
              {(open.lessonIds ?? []).length > 0 && ` · in ${(open.lessonIds ?? []).map(id => lessonTitle.get(id) ?? 'a lesson').join(', ')}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{giveButtons(open, true)}</div>
        </div>
        {note && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{note}</p>}

        {open.kind === 'speaking' ? (
          <SpeakingBuilder templateId={open.id} title={open.title} initial={open.speaking ?? emptyContent()}
            onChanged={content => setOpen(prev => (prev ? { ...prev, speaking: content } : prev))} />
        ) : open.kind === 'pronoun_pictures' && exercise ? (
          <PronounPicturesEditor exercise={exercise}
            onChanged={ex => setExercise(ex)}
            onDeleted={async () => { await deleteHomeworkTemplate(open.id); back(); }} />
        ) : (
          <HomeworkTab
            lessonId={open.id}
            lessonTitle={open.title}
            isAdmin
            studentMode={false}
            studentId={student.id}
            studentName={student.name}
            teacherId={teacherId}
          />
        )}
        {assignDialog}
        {lessonDialog}
      </div>
    );
  }

  // ── The library ──
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Create homework</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Written once and kept for every student. Assign it to {student.name.trim().split(/\s+/)[0]} for one time, or add it to a lesson so it is always there.
        </p>
      </header>

      {note && <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{note}</p>}
      {error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>}

      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl p-4 sm:p-5 flex flex-col gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">New homework — choose a kind</p>
        <div role="radiogroup" aria-label="Kind of homework" className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
          {KINDS.map(k => {
            const KindIcon = KIND_ICON[k];
            const on = newKind === k;
            return (
              <button key={k} role="radio" aria-checked={on} onClick={() => setNewKind(k)}
                className={`text-left rounded-[20px] border-2 p-4 flex flex-col gap-2.5 transition-colors ${
                  on ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                    : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-slate-300 dark:hover:border-gray-600'}`}>
                <span aria-hidden="true" className={`w-11 h-11 rounded-[14px] flex items-center justify-center ${KIND_TINT[k]}`}>
                  <KindIcon className="w-[22px] h-[22px]" />
                </span>
                <span className="text-base font-extrabold text-slate-800 dark:text-slate-100">{KIND_LABEL[k]}</span>
                <span className="text-[13px] font-medium leading-snug text-slate-600 dark:text-slate-300">{KIND_WHAT[k]}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void create(); }}
            placeholder={newKind === 'speaking' ? 'Title — e.g. At the café' : newKind === 'pronoun_pictures' ? 'Title — e.g. Who did it?' : 'Title — e.g. Past tense verbs'}
            aria-label="Homework title"
            className="flex-[1_1_15rem] h-12 px-3.5 rounded-[14px] border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-[15px] font-bold text-slate-800 dark:text-slate-100" />
          <button onClick={create} disabled={!newTitle.trim() || busy === 'new'}
            className="h-12 px-5 rounded-[14px] bg-teal-700 hover:bg-teal-800 text-white text-[15px] font-extrabold disabled:opacity-40">
            {busy === 'new' ? 'Creating…' : 'Create and build'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">Loading homework…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl p-10 text-center">
          <p className="font-bold text-slate-700 dark:text-slate-200">No homework written yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choose a kind above, give it a title, and start building.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map(t => {
            const KindIcon = KIND_ICON[t.kind];
            const why = blocked(t);
            return (
              <article key={t.id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-[22px] px-4 py-3.5 flex flex-wrap items-center gap-3.5">
                <span aria-hidden="true" className={`w-[46px] h-[46px] flex-shrink-0 rounded-[14px] flex items-center justify-center ${KIND_TINT[t.kind]}`}>
                  <KindIcon className="w-[22px] h-[22px]" />
                </span>
                <div className="min-w-0 flex-[1_1_15rem] flex flex-col gap-1">
                  <h3 className="text-[16.5px] font-extrabold text-slate-800 dark:text-slate-100 truncate">{t.title}</h3>
                  <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                    {KIND_LABEL[t.kind]} · {contents(t)}
                    {` · changed ${new Date(t.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                  </p>
                  {(why || (t.lessonIds ?? []).length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {why && <span className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Not ready · {why}</span>}
                      {(t.lessonIds ?? []).map(id => (
                        <span key={id} className="text-xs font-bold rounded-full px-2.5 py-0.5 bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-900/30 dark:text-teal-200 dark:border-teal-800">
                          In {lessonTitle.get(id) ?? 'a lesson'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => void openEntry(t)}
                    className="h-11 px-3.5 rounded-xl bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 text-[13.5px] font-bold">Open</button>
                  <div className="relative">
                    <button onClick={() => setMenu(m => (m === t.id ? null : t.id))} aria-label={`More for ${t.title}: rename, duplicate, delete`}
                      aria-expanded={menu === t.id} disabled={busy === t.id}
                      className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 flex items-center justify-center disabled:opacity-40">
                      <Icon.dots className="w-[18px] h-[18px]" />
                    </button>
                    {menu === t.id && (
                      <>
                        <button aria-label="Close the menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(null)} />
                        <div role="menu" className="absolute right-0 top-12 z-20 w-40 rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-1.5 flex flex-col">
                          <button role="menuitem" onClick={() => void rename(t)} className="h-10 px-3 rounded-xl text-left text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700">Rename</button>
                          <button role="menuitem" onClick={() => void duplicate(t)} className="h-10 px-3 rounded-xl text-left text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700">Duplicate</button>
                          <button role="menuitem" onClick={() => void remove(t)} className="h-10 px-3 rounded-xl text-left text-sm font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20">Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                  {giveButtons(t)}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {assignDialog}
      {lessonDialog}
    </div>
  );
};

export default ArabicCreateHomeworkTab;
