import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ArabicStudent, ArabicLesson } from '../types';
import { getArabicLessons, getStudentByShareToken } from '../services/arabicService';
import { getVocabHomework, type VocabHomework, type HomeworkResult } from '../services/vocabHomeworkService';
import { answerAssignedFlashcard, homeworkStatus } from '../services/arabicHomeworkService';
import ArabicFlashcard from './ArabicFlashcard';
import ArabicLessonDetailPage from './ArabicLessonDetailPage';

export default function AssignedArabicHomework({ homework: initial }: { homework: VocabHomework }) {
  const [hw, setHw] = useState(initial);
  const [tutor, setTutor] = useState<boolean | null>(null);
  const [lesson, setLesson] = useState<ArabicLesson | null>(null);
  const [student, setStudent] = useState<ArabicStudent | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const key = `arabicHomework:${hw.id}`;
  const [results, setResults] = useState<HomeworkResult[]>(() => {
    const remote = hw.progress?.results ?? [];
    try { const local = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (Array.isArray(local) && local.length > remote.length && local.every((r, i) => r.wordId === hw.words[i]?.id && typeof r.correct === 'boolean')) return local;
    } catch { /* use server progress */ }
    return remote;
  });
  const gate = useRef(false);
  const synced = useRef(hw.progress?.results?.length ?? 0);
  useEffect(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!live) return;
      setTutor(data.session?.user?.id === hw.teacherId);
      if (hw.kind === 'lesson') {
        const [lessons, result] = await Promise.all([getArabicLessons(), supabase.from('arabic_students').select('share_token').eq('id', hw.studentId).single()]);
        const s = result.data?.share_token ? await getStudentByShareToken(result.data.share_token) : null;
        if (live) { setLesson(lessons.find(l => l.id === hw.lessonId) ?? null); setStudent(s); if (!s) setError('Could not load the student. Please reopen your portal.'); }
      }
    })().catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [hw.id]);
  const back = () => { if (window.history.length > 1) window.history.back(); else window.location.href = '/'; };
  const sync = async (next: HomeworkResult[]) => {
    let saved = hw;
    for (let i = synced.current; i < next.length; i++) {
      saved = await answerAssignedFlashcard(hw, next[i].wordId, next[i].correct, i);
      synced.current = saved.progress?.results?.length ?? i + 1;
    }
    setHw(saved);
    if (saved.progress?.results) setResults(saved.progress.results);
    if (saved.status === 'completed') { try { localStorage.removeItem(key); } catch { /* optional cache */ } }
  };
  const answer = async (correct?: boolean) => {
    if (gate.current || tutor !== false) return;
    gate.current = true; setBusy(true); setError('');
    const next = correct === undefined ? results : [...results, { wordId: hw.words[results.length].id, correct }];
    try {
      // Check cancellation and deadline before accepting another answer.
      const fresh = await getVocabHomework(hw.id);
      if (fresh?.status === 'completed') { setHw(fresh); setResults(fresh.results ?? []); try { localStorage.removeItem(key); } catch {} return; }
      if (!fresh || homeworkStatus(fresh) !== 'With student') { if (fresh) setHw(fresh); throw new Error('This assignment is no longer open.'); }
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* database is still available */ }
      if (correct === false) {
        try { const revisionKey = `arabicVocabRevisionAll:${hw.studentId}`; const ids = new Set(JSON.parse(localStorage.getItem(revisionKey) ?? '[]')); ids.add(hw.words[results.length].id); localStorage.setItem(revisionKey, JSON.stringify([...ids])); } catch { /* optional revision list */ }
      }
      setResults(next); setFlipped(false);
      await sync(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Please retry.'); }
    finally { gate.current = false; setBusy(false); }
  };
  const status = homeworkStatus(hw);
  if (hw.kind === 'lesson' && lesson && student && tutor !== null) return <ArabicLessonDetailPage
    lesson={lesson} students={[student]} teacherId={hw.teacherId} preSelectedStudentId={student.id}
    studentMode={!tutor} initialTab="homework" onClose={back} />;
  return <main className="min-h-screen bg-slate-50 dark:bg-gray-900 p-4 sm:p-8"><div className="max-w-3xl mx-auto space-y-6">
    <header className="flex justify-between items-center gap-3"><div><h1 className="text-xl font-bold text-slate-900 dark:text-white">{hw.title}</h1><p className="text-sm text-slate-500">{hw.deadline ? `Due ${new Date(hw.deadline).toLocaleString()}` : 'No deadline'}</p></div><button onClick={back} className="px-4 py-2 rounded-xl bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200">Back</button></header>
    {error && <div role="alert" className="p-4 rounded-xl bg-rose-50 text-rose-800">{error}{hw.kind === 'flashcards' && status === 'With student' && <button disabled={busy} onClick={() => answer()} className="block underline mt-2">Retry saving progress</button>}</div>}
    {tutor === null ? <p>Loading…</p> : status !== 'With student' ? <section className="p-8 rounded-2xl bg-white dark:bg-gray-800 text-slate-800 dark:text-white"><h2 className="text-2xl font-bold">{status}</h2>{hw.totalCount != null && hw.correctCount != null && <p className="mt-3">{hw.correctCount} of {hw.totalCount} correct</p>}</section>
      : hw.kind === 'word_cards' && !tutor ? <a href={`/letter-cards/${hw.gameId}`} className="inline-block px-5 py-3 rounded-xl bg-teal-700 text-white">{hw.progress ? 'Continue word cards' : 'Start word cards'}</a>
      : (hw.kind === 'flashcards' || hw.kind === 'word_cards') && tutor ? <section className="space-y-3"><p className="text-slate-500">Student assignment · {hw.kind === 'flashcards' ? `${results.length}/${hw.words.length} answered` : `${hw.words.length} words`}</p>{hw.words.map(w => <div key={w.id} className="p-4 flex justify-between bg-white dark:bg-gray-800 rounded-xl text-slate-800 dark:text-white"><span>{w.english}</span><span dir="rtl" className="text-2xl">{w.arabic}</span></div>)}</section>
      : hw.kind === 'flashcards' && results.length < hw.words.length ? <><p className="text-slate-500">Card {results.length + 1} of {hw.words.length} · Progress saved after every answer</p><ArabicFlashcard word={hw.words[results.length]} flipped={flipped} onFlip={() => setFlipped(v => !v)} disabled={busy || !!error} onKnow={() => answer(true)} onReview={() => answer(false)} /></>
      : hw.kind === 'flashcards' ? <section className="p-8 bg-white dark:bg-gray-800 rounded-2xl text-slate-800 dark:text-white"><h2 className="text-2xl font-bold">All cards answered</h2><button disabled={busy} onClick={() => answer()} className="mt-4 px-5 py-3 rounded-xl bg-teal-700 text-white">{busy ? 'Saving…' : 'Save completion'}</button></section>
      : <p className="text-slate-500">Loading lesson homework…</p>}
  </div></main>;
}
