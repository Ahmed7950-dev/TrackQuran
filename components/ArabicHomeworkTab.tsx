import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ArabicStudent, ArabicLesson } from '../types';
import { listVocabHomework, homeworkUrl, type VocabHomework } from '../services/vocabHomeworkService';
import { homeworkStatus, setArabicHomeworkStatus } from '../services/arabicHomeworkService';
import { listLetterCardsAttempts, type LetterCardsAttempt } from '../services/letterCardsService';
import PushToggle from './PushToggle';
import InstallButton from './InstallButton';
import ArabicLessonDetailPage, { HomeworkTab } from './ArabicLessonDetailPage';
import { getHomeworkTemplates, KIND_LABEL, type HomeworkTemplate } from '../services/arabicHomeworkTemplateService';
import { listLessonExercises, type LessonExercise } from '../services/lessonExerciseService';
import {
  listAttemptsForStudent, speakUrl, toChains, type SpeakingAttempt, type SpeakingChain,
} from '../services/speakingHomeworkService';
import { PronounPicturesReview, PronounPicturesRunner } from './PronounPicturesExercise';
import SpeakingBlock from './SpeakingBlock';
import SpeakingReview from './SpeakingReview';
import { tryName } from './SpeakingRunner';

export default function ArabicHomeworkTab({ student, lessons, studentMode = false, openSpeakingId = null, onOpenSpeakingConsumed }: {
  student: ArabicStudent; lessons: ArabicLesson[]; studentMode?: boolean;
  /** A speaking try to open straight onto its marking — the tutor arriving
   *  from the "has completed his speaking homework" notification. */
  openSpeakingId?: string | null;
  onOpenSpeakingConsumed?: () => void;
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
  /** Every go the student has had at a word-cards homework, newest first.
   *  Without this a word-cards row said only "assigned" — the tutor could not
   *  see that he had played it three times and stalled at 6/10. */
  const [cardTries, setCardTries] = useState<Record<string, LetterCardsAttempt[]>>({});
  /** What KIND each homework from the library is — written questions, pronoun
   *  pictures or a speaking dialogue — since the row itself only says 'custom'. */
  const [templates, setTemplates] = useState<Map<string, HomeworkTemplate>>(new Map());
  /** Every go this student has had at a speaking homework, assigned or done
   *  from a lesson, each with all its tries. */
  const [chains, setChains] = useState<SpeakingChain[]>([]);
  /** The speaking try the tutor is marking — its own page. */
  const [marking, setMarking] = useState<SpeakingAttempt | null>(null);
  /** An assigned pronoun-pictures homework, open — its own page too. */
  const [pictures, setPictures] = useState<{ hw: VocabHomework; exercise: LessonExercise } | null>(null);
  const load = useCallback(async () => {
    try {
      const list = (await listVocabHomework(student.id)).filter(h => h.status !== 'draft');
      const [kinds, attempts] = await Promise.all([
        getHomeworkTemplates(list.filter(h => h.kind === 'custom' && h.lessonId).map(h => h.lessonId!)),
        listAttemptsForStudent(student.id),
      ]);
      setTemplates(kinds);
      setChains(toChains(attempts));
      setRows(list);
      const gameIds = list.filter(h => h.kind === 'word_cards' && h.gameId).map(h => h.gameId!);
      setCardTries(gameIds.length ? await listLetterCardsAttempts(gameIds) : {});
      setError('');
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load homework.'); }
    finally { setLoading(false); }
  }, [student.id]);
  useEffect(() => { void load(); const timer = window.setInterval(() => { setNow(Date.now()); void load(); }, 15000);
    window.addEventListener('focus', load); return () => { clearInterval(timer); window.removeEventListener('focus', load); }; }, [load]);
  /** A homework is its OWN page, not a lid over this one: while one is open
   *  the list is not rendered at all. It also pushes a history entry, so the
   *  phone's back gesture and the browser's back button close it the way they
   *  close any page — which is the difference people actually feel between a
   *  page and an overlay. */
  const openPage = useCallback((next: {
    custom?: VocabHomework; lesson?: ArabicLesson; marking?: SpeakingAttempt;
    pictures?: { hw: VocabHomework; exercise: LessonExercise };
  }) => {
    window.history.pushState({ arabicHomeworkPage: true }, '');
    if (next.custom) setCustom(next.custom);
    if (next.lesson) setLesson(next.lesson);
    if (next.marking) setMarking(next.marking);
    if (next.pictures) setPictures(next.pictures);
  }, []);
  const closePage = useCallback(() => {
    // Let popstate do the closing, so the entry we pushed is consumed rather
    // than left on the stack for the back button to walk through later.
    if ((window.history.state as { arabicHomeworkPage?: boolean } | null)?.arabicHomeworkPage) {
      window.history.back();
      return;
    }
    setCustom(null); setLesson(null); setMarking(null); setPictures(null); void load();
  }, [load]);
  useEffect(() => {
    if (!custom && !lesson && !marking && !pictures) return;
    const onPop = () => { setCustom(null); setLesson(null); setMarking(null); setPictures(null); void load(); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [custom, lesson, marking, pictures, load]);

  // Arriving from the notification: straight onto that try's marking.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!openSpeakingId || loading || openedFor.current === openSpeakingId) return;
    openedFor.current = openSpeakingId;   // once: closing it must not reopen it
    const found = chains.flatMap(c => c.tries).find(t => t.id === openSpeakingId);
    onOpenSpeakingConsumed?.();
    if (found && !studentMode) openPage({ marking: found });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSpeakingId, loading, chains]);

  /** A homework from the library opens in whatever its kind is done in. */
  const openCustom = async (hw: VocabHomework) => {
    if (!hw.lessonId) { setError('This homework is missing.'); return; }
    if (templates.get(hw.lessonId)?.kind === 'pronoun_pictures') {
      const [exercise] = await listLessonExercises(hw.lessonId, true);
      if (!exercise) { setError('This exercise is missing.'); return; }
      openPage({ pictures: { hw, exercise } });
      return;
    }
    openPage({ custom: hw });
  };
  const lessonTitleOf = (id: string | null) => lessons.find(l => l.id === id)?.title ?? 'a lesson';
  const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  const change = async (hw: VocabHomework, status: 'completed' | 'missed' | 'cancelled') => {
    setBusy(hw.id);
    try { await setArabicHomeworkStatus(hw, status); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update homework.'); }
    finally { setBusy(null); }
  };
  /** Every go at a word-cards homework: when, what he scored, how many he got
   *  wrong, and whether he finished or ran out of lives. Best score first in
   *  the heading, because that is the one question asked about a game that can
   *  be replayed. */
  const tries = (hw: VocabHomework) => {
    if (hw.kind !== 'word_cards' || !hw.gameId) return null;
    const list = cardTries[hw.gameId] ?? [];
    if (!list.length) {
      return <p className="text-xs text-slate-400 dark:text-slate-500">
        {studentMode ? 'You have not played it yet.' : 'He has not opened it yet.'}
      </p>;
    }
    const best = list.reduce((m, a) => Math.max(m, a.score), 0);
    const outOf = list[0].total;
    return <div className="rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-gray-700/50">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
          {list.length} {list.length === 1 ? 'go' : 'goes'}
        </span>
        <span className="flex-grow" />
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">best {best}/{outOf}</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-gray-700">
        {list.slice(0, 5).map((a, i) => (
          <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-xs">
            <span className="w-5 text-slate-400 dark:text-slate-500 tabular-nums">{list.length - i}</span>
            <span className="text-slate-500 dark:text-slate-400">
              {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
            <span className="flex-grow" />
            {a.mistakes > 0 && <span className="font-bold text-rose-600 dark:text-rose-400">{a.mistakes} wrong</span>}
            <span className={`font-bold ${a.endedReason === 'done'
              ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}>
              {a.score}/{a.total}{a.endedReason === 'lives' ? ' · out of lives' : a.endedReason === 'done' ? '' : ' · left early'}
            </span>
          </div>
        ))}
      </div>
    </div>;
  };

  /** The go at a speaking homework that an assignment row stands for. */
  const chainOf = (hw: VocabHomework) =>
    hw.kind === 'custom' && hw.lessonId && templates.get(hw.lessonId)?.kind === 'speaking'
      ? chains.find(c => c.tries[0].homeworkId === hw.id) : undefined;
  /** Still open, as far as the lists are concerned. A speaking homework stays
   *  open until every line is right — a deadline passing while it is with the
   *  tutor for marking does not make it "wasn't done". */
  const isOpen = (hw: VocabHomework) => {
    const chain = chainOf(hw);
    return chain ? hw.status === 'assigned' && !chain.passed : homeworkStatus(hw, now) === 'With student';
  };
  const speakingBlock = (chain: SpeakingChain, context: string, hw?: VocabHomework) => (
    <SpeakingBlock key={chain.rootId} chain={chain} studentMode={studentMode} context={context}
      onOpen={!hw || hw.status === 'assigned' ? a => { window.location.href = speakUrl(a.id); } : undefined}
      onMark={studentMode ? undefined : a => openPage({ marking: a })}
      extra={!studentMode && hw && hw.status === 'assigned' && !chain.passed ? (
        <button disabled={busy === hw.id} onClick={() => change(hw, 'cancelled')}
          className="h-12 px-4 rounded-2xl border border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-700 dark:text-slate-200 disabled:opacity-50">
          Cancel homework
        </button>
      ) : undefined} />
  );

  const render = (hw: VocabHomework) => {
    const chain = chainOf(hw);
    if (chain) {
      return speakingBlock(chain,
        `assigned ${shortDay(hw.assignedAt ?? hw.createdAt)}${hw.deadline ? ` · due ${new Date(hw.deadline).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}${hw.status === 'cancelled' ? ' · cancelled' : ''}`,
        hw);
    }
    const status = homeworkStatus(hw, now);
    const active = status === 'With student';
    return <article key={hw.id} className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
      <div className="flex flex-wrap items-start gap-3"><div className="flex-1 min-w-0"><h3 className="font-bold text-slate-800 dark:text-white">{hw.title}</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{hw.kind === 'lesson' ? 'Lesson homework' : hw.kind === 'word_cards' ? 'Word cards' : hw.kind === 'flashcards' ? 'Flashcards' : hw.kind === 'custom' ? KIND_LABEL[templates.get(hw.lessonId ?? '')?.kind ?? 'written'] : 'Vocabulary'}{hw.words.length > 0 && ` · ${hw.words.length} words`} · Assigned {new Date(hw.assignedAt ?? hw.createdAt).toLocaleDateString()}</p></div>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${status === 'Done' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : active ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300'}`}>{status}</span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">{hw.deadline ? `Due ${new Date(hw.deadline).toLocaleString()}` : 'No deadline'}{hw.correctCount != null && hw.totalCount != null && ` · ${hw.correctCount}/${hw.totalCount} correct`}</p>
      <div className="flex flex-wrap gap-2">
        {hw.kind === 'custom' ? <button onClick={() => { void openCustom(hw); }} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold">{studentMode ? active ? 'Open homework' : 'View homework' : 'Review homework'}</button>
          : hw.kind === 'lesson' ? <button onClick={() => { const found = lessons.find(l => l.id === hw.lessonId); if (found) openPage({ lesson: found }); else setError('Lesson not found.'); }} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold">{studentMode ? active ? 'Open homework' : 'View homework' : 'Review homework'}</button>
          : (active || !studentMode) && <a href={homeworkUrl(hw.id)} className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold">{studentMode ? hw.progress ? 'Continue homework' : 'Start homework' : 'View homework'}</a>}
        {!studentMode && hw.status === 'assigned' && <>
          <button disabled={busy === hw.id} onClick={() => change(hw, 'completed')} className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 text-sm">Mark done</button>
          <button disabled={busy === hw.id} onClick={() => change(hw, 'missed')} className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm">Wasn’t done</button>
          <button disabled={busy === hw.id} onClick={() => change(hw, 'cancelled')} className="px-3 py-2 rounded-lg text-red-600 text-sm">Cancel</button>
        </>}
      </div>
      {tries(hw)}
    </article>;
  };
  // Its own page: nothing of the list renders behind it.
  if (marking) {
    const chain = chains.find(c => c.rootId === marking.rootId);
    const index = Math.max(0, chain?.tries.findIndex(t => t.id === marking.id) ?? 0);
    return <SpeakingReview attempt={marking} tryLabel={tryName(index)} onClose={closePage} onDone={closePage} />;
  }
  if (pictures) {
    return <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={closePage} className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-sm font-bold text-slate-700 dark:text-slate-200">‹ Back</button>
        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white truncate">{pictures.hw.title}</h2>
      </div>
      {studentMode
        ? <PronounPicturesRunner exercise={pictures.exercise} studentId={student.id} studentName={student.name} studentMode
            teacherId={student.teacherId} lessonTitle={pictures.hw.title}
            onSubmitted={() => {
              // Handing it in is doing it: the exercise marks itself.
              if (pictures.hw.status === 'assigned') void setArabicHomeworkStatus(pictures.hw, 'completed').catch(() => {});
            }} />
        : <PronounPicturesReview exercise={pictures.exercise} studentId={student.id} studentName={student.name} />}
    </div>;
  }
  if (custom && custom.lessonId) {
    return <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={closePage} className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 text-sm font-bold text-slate-700 dark:text-slate-200">‹ Back</button>
        <h2 className="text-lg font-extrabold text-slate-800 dark:text-white truncate">{custom.title}</h2>
      </div>
      <HomeworkTab lessonId={custom.lessonId} lessonTitle={custom.title} isAdmin={false} studentMode={studentMode}
        studentId={student.id} studentName={student.name} teacherId={student.teacherId}
        onHomeworkComplete={() => { void load(); }} />
    </div>;
  }
  if (lesson) {
    return <ArabicLessonDetailPage asPage lesson={lesson} students={[student]} preSelectedStudentId={student.id}
      teacherId={student.teacherId} studentMode={studentMode} initialTab="homework"
      onClose={closePage} onHomeworkComplete={() => { void load(); }} />;
  }

  const active = rows.filter(isOpen);
  const history = rows.filter(h => !isOpen(h));
  // Speaking homework done straight from a lesson has no assignment row of its
  // own — the go itself is what there is to show.
  const fromLessons = chains.filter(c => !c.tries[0].homeworkId);
  const lessonOpen = fromLessons.filter(c => !c.passed);
  const lessonDone = fromLessons.filter(c => c.passed);
  const lessonBlock = (c: SpeakingChain) => speakingBlock(c, `from ${lessonTitleOf(c.tries[0].lessonId)}`);
  return <div className="space-y-5"><header className="flex justify-between items-center"><h2 className="text-xl font-bold text-slate-800 dark:text-white">Homework</h2><button onClick={load} className="text-sm text-teal-700 dark:text-teal-300">Refresh</button></header>
    {studentMode && <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-gray-700"><InstallButton variant="row" /><PushToggle recipient="student" teacherId={student.teacherId} studentId={student.shareToken} /></div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}{loading ? <p>Loading homework…</p> : <>
      <section className="space-y-3"><h3 className="font-bold text-slate-600 dark:text-slate-300">With student · {active.length + lessonOpen.length}</h3>{active.length + lessonOpen.length ? <>{active.map(render)}{lessonOpen.map(lessonBlock)}</> : <p className="text-sm text-slate-500">No homework waiting.</p>}</section>
      <section className="space-y-3"><h3 className="font-bold text-slate-600 dark:text-slate-300">History · {history.length + lessonDone.length}</h3>{history.length + lessonDone.length ? <>{history.map(render)}{lessonDone.map(lessonBlock)}</> : <p className="text-sm text-slate-500">Finished, missed and cancelled homework will appear here.</p>}</section>
    </>}
  </div>;
}
