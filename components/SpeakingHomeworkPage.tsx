// components/SpeakingHomeworkPage.tsx
// -----------------------------------------------------------------------------
// /speak/<attempt id> — the link a speaking homework is done from. No session
// is needed: the id is the key, as it is for /recite and /vocab-homework.
//
// A student gets the recorder while the try is open and the result once it has
// been sent. The tutor whose student it is, signed in and opening the same
// link, gets the marking screen instead.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { applyTheme, readTheme } from '../utils/theme';
import { getAttempt, listChain, speakUrl, type SpeakingAttempt } from '../services/speakingHomeworkService';
import { SpeakingResult, SpeakingRunner, tryName } from './SpeakingRunner';
import SpeakingReview from './SpeakingReview';

const SpeakingHomeworkPage: React.FC<{ attemptId: string }> = ({ attemptId }) => {
  const [a, setA] = useState<SpeakingAttempt | null | undefined>(undefined);
  const [chain, setChain] = useState<SpeakingAttempt[]>([]);
  const [tutor, setTutor] = useState<boolean | null>(null);
  const [portal, setPortal] = useState<string | null>(null);

  useEffect(() => { applyTheme(readTheme()); }, []);

  const load = useCallback(async () => {
    const found = await getAttempt(attemptId);
    setA(found);
    if (!found) return;
    setChain(await listChain(found.rootId));
    const { data } = await supabase.auth.getSession();
    setTutor(data.session?.user?.id === found.teacherId);
    const { data: stu } = await supabase.from('arabic_students').select('share_token').eq('id', found.studentId).maybeSingle();
    if (stu?.share_token) setPortal(`${window.location.origin}/arabic/s/${stu.share_token}`);
  }, [attemptId]);
  useEffect(() => { void load(); }, [load]);

  // Marked while the page sat in the background: show it when he comes back.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible' && a && a.status !== 'open') void load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [a, load]);

  const exit = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = portal ?? '/';
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-900 text-slate-600 dark:text-slate-300 text-center">
      {children}
    </div>
  );
  if (a === undefined || (a && tutor === null)) return shell(<p className="font-semibold">Loading your homework…</p>);
  if (a === null) return shell(
    <div>
      <p className="text-lg font-extrabold text-slate-800 dark:text-white">This homework is not here any more.</p>
      <p className="mt-1 text-sm font-medium">It may have been removed by your teacher.</p>
    </div>,
  );

  const index = Math.max(0, chain.findIndex(t => t.id === a.id));

  if (tutor) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 dark:bg-gray-900 px-4 sm:px-6 py-6">
        <SpeakingReview attempt={a} tryLabel={tryName(index)} onClose={exit}
          onDone={() => { void load(); }} />
      </div>
    );
  }

  if (a.status === 'open') {
    return <SpeakingRunner key={a.id} attempt={a} onChanged={setA} onSubmitted={sent => { setA(sent); void load(); }} onExit={exit} />;
  }
  const next = chain.find(t => t.parentId === a.id) ?? null;
  return (
    <SpeakingResult attempt={a} next={next}
      onOpenNext={n => { window.location.href = speakUrl(n.id); }}
      onExit={exit} />
  );
};

export default SpeakingHomeworkPage;
