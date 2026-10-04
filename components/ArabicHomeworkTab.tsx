import React, { useCallback, useEffect, useState } from 'react';
import type { ArabicStudent, ArabicLesson } from '../types';
import { listVocabHomework, homeworkUrl, type VocabHomework } from '../services/vocabHomeworkService';
import { homeworkStatus, setArabicHomeworkStatus } from '../services/arabicHomeworkService';
import PushToggle from './PushToggle';
import InstallButton from './InstallButton';
import ArabicLessonDetailPage, { HomeworkTab } from './ArabicLessonDetailPage';

export default function ArabicHomeworkTab({ student, lessons, studentMode = false }: {
  student: ArabicStudent; lessons: ArabicLesson[]; studentMode?: boolean;
}) {
  const [rows, setRows] = useState<VocabHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [lesson, setLesson] = useState<ArabicLesson | null>(null);
  /** A homework the tutor wrote on its own — it opens on the template it was
   *  assigned from, in the same screen a lesson's homework uses. */
  const [custom, setCustom] = useState<VocabHomework | null>(null);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    try { setRows((await listVocabHomework(student.id)).filter(h => h.status !== 'draft')); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load homework.'); }
    finally { setLoading(false); }
  }, [student.id]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { setNow(Date.now()); void load(); }, 15000);
    window.addEventListener('focus', load); return () => { clearInterval(timer); window.removeEventListener('focus', load); }; }, [load]);
  const change = async (hw: VocabHomework, status: 'completed' | 'missed' | 'cancelled') => {
    setBusy(hw.id);
    try { await setArabicHomeworkStatus(hw, status); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update homework.'); }
    finally { setBusy(null); }
  };
  const render = (hw: VocabHomework) => {
    const status = homeworkStatus(hw, now);
    const active = status === 'With student';
    return <article key={hw.id} className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
      <div className="flex flex-wrap items-start gap-3"><div className="flex-1 min-w-0"><h3 className="font-bold text-slate-800 dark:text-white">{hw.title}</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hw.kind === 'lesson' ? 'Lesson homework' : hw.kind === 'word_cards' ? 'Word cards' : hw.kind === 'flashcards' ? 'Flashcards' : 'Vocabulary'}{hw.words.length > 0 && ` · ${hw.words.length} words`} · Assigned {new Date(hw.assignedAt ?? hw.createdAt).toLocaleDateString()}</p></div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status === 'Done' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : active ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300'}`}>{status}</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">{hw.deadline ? `Due ${new Date(hw.deadline).toLocaleString()}` : 'No deadline'}{hw.correctCount != null && hw.totalCount != null && ` · ${hw.correctCount}/${hw.totalCount} correct`}</p>
      <div className="flex flex-wrap gap-2">
        {hw.kind === 'custom' ? <button onClick={() => { if (hw.lessonId) setCustom(hw); else setError('This homework is missing.'); }} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold">{studentMode ? active ? 'Open homework' : 'View homework' : 'Review homework'}</button>
          : hw.kind === 'lesson' ? <button onClick={() => { const found = lessons.find(l => l.id === hw.lessonId); if (found) setLesson(found); else setError('Lesson not found.'); }} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold">{studentMode ? active ? 'Open homework' : 'View homework' : 'Review homework'}</button>
          : (active || !studentMode) && <a href={homeworkUrl(hw.id)} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold">{studentMode ? hw.progress ? 'Continue homework' : 'Start homework' : 'View homework'}</a>}
        {!studentMode && hw.status === 'assigned' && <>
          <button disabled={busy === hw.id} onClick={() => change(hw, 'completed')} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 text-sm">Mark done</button>
          <button disabled={busy === hw.id} onClick={() => change(hw, 'missed')} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm">Wasn’t done</button>
          <button disabled={busy === hw.id} onClick={() => change(hw, 'cancelled')} className="px-3 py-2 rounded-lg text-red-600 text-sm">Cancel</button>
        </>}
      </div>
    </article>;
  };
  const active = rows.filter(h => homeworkStatus(h, now) === 'With student');
  const history = rows.filter(h => homeworkStatus(h, now) !== 'With student');
  return <div className="space-y-5"><header className="flex justify-between items-center"><h2 className="text-xl font-bold text-slate-800 dark:text-white">Homework</h2><button onClick={load} className="text-sm text-teal-700 dark:text-teal-300">Refresh</button></header>
    {studentMode && <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700"><InstallButton variant="row" /><PushToggle recipient="student" teacherId={student.teacherId} studentId={student.shareToken} /></div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}{loading ? <p>Loading homework…</p> : <>
      <section className="space-y-3"><h3 className="font-bold text-slate-600 dark:text-slate-300">With student · {active.length}</h3>{active.length ? active.map(render) : <p className="text-sm text-slate-500">No homework waiting.</p>}</section>
      <section className="space-y-3"><h3 className="font-bold text-slate-600 dark:text-slate-300">History · {history.length}</h3>{history.length ? history.map(render) : <p className="text-sm text-slate-500">Finished, missed and cancelled homework will appear here.</p>}</section>
    </>}
    {custom && custom.lessonId && <section className="fixed inset-0 z-[80] bg-slate-100 dark:bg-gray-900 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => { setCustom(null); void load(); }} className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-sm font-bold text-slate-700 dark:text-slate-200">‹ Back</button>
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-white truncate">{custom.title}</h2>
        </div>
        <HomeworkTab lessonId={custom.lessonId} lessonTitle={custom.title} isAdmin={false} studentMode={studentMode}
          studentId={student.id} studentName={student.name} teacherId={student.teacherId}
          onHomeworkComplete={() => { void load(); }} />
      </div>
    </section>}
    {lesson && <ArabicLessonDetailPage lesson={lesson} students={[student]} preSelectedStudentId={student.id} teacherId={student.teacherId} studentMode={studentMode}
      initialTab="homework" onClose={() => { setLesson(null); void load(); }} onHomeworkComplete={() => { void load(); }} />}
  </div>;
}
