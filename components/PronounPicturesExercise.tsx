// components/PronounPicturesExercise.tsx
// -----------------------------------------------------------------------------
// The pronoun-pictures exercise: four pictures in a fixed order — He · You (M)
// · You (F) · She — that swap to a second picture and say their pronoun when
// you point at them. A round asks a question ("who ate the cheese?") and the
// student writes the pronoun belonging to whichever of the four did it.
//
// Three screens, one per kind of person looking at it:
//   Editor  — the admin builds it: the four voices, then round after round.
//   Runner  — the student works through it; a tutor can play it alongside them.
//   Review  — the tutor marks what came back, and may overrule the marking.
//
// The pronoun text is the ANSWER, so it is never shown while the student is
// answering: the pictures and the voices are what they have to go on. It
// appears afterwards, next to the picture that was right.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LessonExercise, ExerciseRound, ExerciseSubmission, RoundPic,
  SLOTS, emptyRound, saveLessonExercise, deleteLessonExercise,
  uploadExerciseImage, uploadExerciseAudio,
  submitAttempt, listSubmissions, listExerciseInbox, returnAttempt,
} from '../services/lessonExerciseService';
import MicrophonePicker, { useMicrophones, openMic } from './MicrophonePicker';
import { createNotification } from '../services/notificationService';

/* ── Shared bits ──────────────────────────────────────────────────────────── */

/** One player for the whole exercise, so two pronouns never talk at once. */
function useVoice() {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { try { ref.current?.pause(); } catch { /* gone */ } }, []);
  return useCallback((url: string | null | undefined) => {
    if (!url) return;
    let a = ref.current;
    if (!a) { a = new Audio(); ref.current = a; }
    try { a.pause(); } catch { /* nothing playing */ }
    a.src = url;
    void a.play().catch(() => { /* a browser that wants a tap first */ });
  }, []);
}

type TileState = 'idle' | 'right' | 'muted';

/**
 * One of the four pictures.
 *
 * A mouse points and it answers; a finger has no hover, so a tap does the same
 * thing and a second tap puts it back. Both go through pointer events and are
 * told apart by pointerType — binding mouseenter AND click means a hybrid
 * laptop fires both.
 */
const PictureTile: React.FC<{
  pic: RoundPic | undefined;
  audioUrl?: string | null;
  /** Shown under the picture — the answer, so only after the marking. */
  label?: { arabic: string; translit: string } | null;
  state?: TileState;
  onPlay: (url: string | null | undefined) => void;
}> = ({ pic, audioUrl, label, state = 'idle', onPlay }) => {
  const [on, setOn] = useState(false);
  const url = (on && pic?.hoverUrl) ? pic.hoverUrl : pic?.url;

  const show = () => { setOn(true); onPlay(audioUrl); };
  const hide = () => setOn(false);

  const ring = state === 'right'
    ? 'ring-4 ring-emerald-400 dark:ring-emerald-500'
    : on ? 'ring-4 ring-amber-300 dark:ring-amber-500/70'
    : 'ring-1 ring-slate-200 dark:ring-gray-700';

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <button
        type="button"
        onPointerEnter={e => { if (e.pointerType === 'mouse') show(); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') hide(); }}
        onPointerDown={e => { if (e.pointerType !== 'mouse') { e.preventDefault(); on ? hide() : show(); } }}
        onFocus={show}
        onBlur={hide}
        style={{ touchAction: 'manipulation' }}
        className={`group relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-100 dark:bg-gray-700 ${ring} transition-all duration-150 ${on ? 'scale-[1.03] shadow-lg' : 'shadow-sm'} ${state === 'muted' ? 'opacity-60' : ''}`}>
        {url ? (
          <img src={url} alt="" draggable={false} className="w-full h-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-3xl text-slate-300 dark:text-gray-600">🖼</span>
        )}
        {(audioUrl || pic?.hoverUrl) && (
          <span className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/45 backdrop-blur text-white text-xs flex items-center justify-center opacity-80 group-hover:opacity-100">
            {audioUrl ? '🔊' : '👀'}
          </span>
        )}
        {state === 'right' && (
          <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold shadow">✓</span>
        )}
      </button>
      {label && (
        <div className="text-center leading-tight">
          <div dir="rtl" className="text-lg font-bold text-slate-800 dark:text-slate-100">{label.arabic || '—'}</div>
          {label.translit && <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">{label.translit}</div>}
        </div>
      )}
    </div>
  );
};

/** The four, across on a screen with room and two-by-two on a phone. */
const TileRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">{children}</div>
);

const Pill: React.FC<{ tone: 'ok' | 'bad' | 'wait'; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
    tone === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : tone === 'bad' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'}`}>{children}</span>
);

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/* ═══════════════════════════════════════════════════════════════════════════
   RUNNER — the student answering, or a tutor playing it with them
   ═══════════════════════════════════════════════════════════════════════════ */

export const PronounPicturesRunner: React.FC<{
  exercise: LessonExercise;
  studentId?: string;
  studentName?: string;
  /** True when it is the student's own screen: drafts, submitting, retries. */
  studentMode: boolean;
  /** Who to tell when it is handed in. */
  teacherId?: string;
  lessonTitle?: string;
  onSubmitted?: () => void;
}> = ({ exercise, studentId, studentName, studentMode, teacherId, lessonTitle, onSubmitted }) => {
  const play = useVoice();
  const draftKey = `lessonExercise:${exercise.id}:${studentId ?? 'anon'}`;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [done, setDone] = useState<ExerciseSubmission | null>(null);
  const [past, setPast] = useState<ExerciseSubmission[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const topRef = useRef<HTMLDivElement>(null);

  // Pick the draft back up — a half-answered exercise survives a closed tab.
  useEffect(() => {
    if (!studentMode) { setDraftReady(true); return; }
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
      if (saved && typeof saved === 'object') setAnswers(saved);
    } catch { /* no usable draft */ }
    setDraftReady(true);
  }, [draftKey, studentMode]);
  useEffect(() => {
    if (!studentMode || !draftReady || done) return;
    try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* storage off */ }
  }, [answers, draftKey, draftReady, studentMode, done]);

  const loadPast = useCallback(() => {
    if (!studentId) return;
    void listSubmissions(exercise.id, studentId).then(rows => {
      setPast(rows);
      // Still showing the last result when they come back to it.
      setDone(d => d ?? (rows[0] && studentMode ? rows[0] : null));
    });
  }, [exercise.id, studentId, studentMode]);
  useEffect(loadPast, [loadPast]);

  const rounds = exercise.rounds;
  const unanswered = rounds.filter(r => !(answers[r.id] ?? '').trim()).length;

  const submit = async () => {
    if (!studentId || sending || unanswered > 0) return;
    setSending(true); setError('');
    const sub = await submitAttempt(exercise, studentId, answers);
    setSending(false);
    if (!sub) { setError('Could not send your answers. They are still saved here — try again.'); return; }
    try { localStorage.removeItem(draftKey); } catch { /* optional */ }
    setDone(sub);
    setPast(p => [sub, ...p]);
    // Tell the tutor, exactly as the written homework does — otherwise work
    // arrives and nobody knows until someone happens to open the card.
    if (teacherId) {
      void createNotification({
        teacherId, studentId, recipient: 'tutor', bookingId: null,
        type: 'homework_submitted',
        title: `${studentName ?? 'Student'} finished ${exercise.title}`,
        body: lessonTitle ?? '', metadata: { lessonId: exercise.lessonId, exerciseId: exercise.id },
      }).catch(() => { /* the answers are safe either way */ });
    }
    onSubmitted?.();
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const again = () => {
    setDone(null);
    setAnswers({});
    topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const marked = done?.marks ?? null;

  if (!rounds.length) {
    return (
      <div className="p-10 text-center text-slate-500 dark:text-slate-400">
        <div className="text-4xl mb-2">🧩</div>
        <p className="text-sm">This exercise has no rounds yet.</p>
      </div>
    );
  }

  return (
    <div ref={topRef} className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* ── The score, once it has been handed in ── */}
      {done && (
        <div className={`rounded-2xl p-5 text-center border-2 ${
          done.score === done.total
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'}`}>
          <div className="text-4xl mb-1">{done.score === done.total ? '🌟' : '💪'}</div>
          <div className="text-3xl font-extrabold text-slate-800 dark:text-white">{done.score} / {done.total}</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            {done.status === 'returned'
              ? 'Your tutor has checked this.'
              : 'Sent to your tutor. The right answers are below.'}
          </p>
          {done.tutorNote && (
            <p className="mt-3 text-sm text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-gray-800/60 rounded-xl px-4 py-2 inline-block text-left">
              <span className="font-bold">Tutor:</span> {done.tutorNote}
            </p>
          )}
          {studentMode && (
            <div className="mt-4">
              <button onClick={again}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm active:scale-95 transition-all">
                Try it again
              </button>
            </div>
          )}
        </div>
      )}

      {!done && (
        <div className="rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 px-4 py-3 text-sm text-sky-800 dark:text-sky-200">
          Point at a picture to hear who it is, then write the pronoun that answers the question.
        </div>
      )}

      {/* ── Round after round ── */}
      {rounds.map((round, ri) => {
        const mark = marked?.[round.id];
        const typed = done ? (done.answers[round.id] ?? '') : (answers[round.id] ?? '');
        const right = exercise.slots[round.correct];
        return (
          <section key={round.id}
            className={`rounded-3xl bg-white dark:bg-gray-800 border shadow-sm overflow-hidden ${
              mark ? (mark.correct ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700')
                   : 'border-slate-200 dark:border-gray-700'}`}>
            <header className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 dark:bg-gray-700/40 border-b border-slate-200 dark:border-gray-700">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Round {ri + 1} <span className="text-slate-300 dark:text-gray-600">/ {rounds.length}</span>
              </span>
              {mark && (mark.correct ? <Pill tone="ok">✓ Correct</Pill> : <Pill tone="bad">✗ Not right</Pill>)}
            </header>

            <div className="p-5 space-y-5">
              <TileRow>
                {SLOTS.map((s, i) => (
                  <PictureTile key={s.key}
                    pic={round.pics?.[i]}
                    audioUrl={exercise.slots[i]?.audioUrl}
                    onPlay={play}
                    state={done ? (i === round.correct ? 'right' : 'muted') : 'idle'}
                    label={done && i === round.correct
                      ? { arabic: exercise.slots[i]?.arabic ?? '', translit: exercise.slots[i]?.translit ?? '' }
                      : null}
                  />
                ))}
              </TileRow>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p dir="auto" className="flex-1 text-lg sm:text-xl font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                  {round.question || <span className="text-slate-400 italic text-base">No question written yet</span>}
                </p>
                <div className="sm:w-56 flex-shrink-0">
                  <input
                    dir="auto"
                    value={typed}
                    readOnly={!!done || !studentMode}
                    onChange={e => setAnswers(p => ({ ...p, [round.id]: e.target.value }))}
                    placeholder="write the pronoun"
                    className={`w-full px-4 py-3 rounded-xl border-2 text-center text-xl font-bold bg-white dark:bg-gray-700 dark:text-white focus:outline-none transition-colors ${
                      mark ? (mark.correct ? 'border-emerald-400 text-emerald-700 dark:text-emerald-300'
                                           : 'border-red-400 text-red-600 dark:text-red-300')
                           : 'border-slate-300 dark:border-gray-600 focus:border-amber-500 focus:ring-2 focus:ring-amber-200'}`}
                  />
                  {mark && !mark.correct && right && (
                    <p dir="rtl" className="mt-1.5 text-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {right.arabic}
                      {right.translit && <span dir="ltr" className="block text-[11px] italic font-medium text-slate-500">{right.translit}</span>}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* ── Hand it in ── */}
      {studentMode && !done && (
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 bg-gradient-to-t from-white via-white dark:from-gray-900 dark:via-gray-900 to-transparent">
          {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400 text-center">{error}</p>}
          <button
            onClick={submit}
            disabled={unanswered > 0 || sending}
            className="w-full py-3.5 rounded-2xl text-white text-base font-bold shadow-lg transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-700 disabled:hover:bg-emerald-600">
            {sending ? 'Sending…'
              : unanswered > 0 ? `Answer all ${rounds.length} rounds to send (${unanswered} left)`
              : 'Send my answers to my tutor'}
          </button>
        </div>
      )}

      {/* ── Earlier goes ── */}
      {studentMode && past.length > 1 && (
        <div className="pt-2">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Earlier tries</h4>
          <div className="space-y-1.5">
            {past.slice(done ? 1 : 0).map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2 rounded-xl bg-slate-50 dark:bg-gray-800 text-sm">
                <span className="text-slate-500 dark:text-slate-400">{fmtWhen(p.submittedAt)}</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">{p.score} / {p.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!studentMode && studentName && (
        <p className="text-center text-xs text-slate-400">
          Playing it through with {studentName} — nothing here is saved as their answer.
        </p>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   REVIEW — the tutor marking what came back
   ═══════════════════════════════════════════════════════════════════════════ */

export const PronounPicturesReview: React.FC<{
  exercise: LessonExercise;
  studentId: string;
  studentName?: string;
}> = ({ exercise, studentId, studentName }) => {
  const play = useVoice();
  const [subs, setSubs] = useState<ExerciseSubmission[] | null>(null);
  const [marks, setMarks] = useState<Record<string, { correct: boolean; auto: boolean }>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void listSubmissions(exercise.id, studentId).then(rows => {
      setSubs(rows);
      if (rows[0]) { setMarks(rows[0].marks ?? {}); setNote(rows[0].tutorNote ?? ''); }
    });
  }, [exercise.id, studentId]);

  const latest = subs?.[0] ?? null;
  const score = useMemo(() => Object.values(marks).filter(m => m.correct).length, [marks]);

  const flip = (roundId: string) =>
    setMarks(m => ({ ...m, [roundId]: { correct: !(m[roundId]?.correct), auto: false } }));

  const handBack = async () => {
    if (!latest) return;
    setBusy(true);
    const ok = await returnAttempt(latest.id, marks, note);
    setBusy(false);
    if (!ok) { window.alert('Could not save the marking.'); return; }
    setSaved(true);
    setSubs(rows => rows ? [{ ...rows[0], marks, score, tutorNote: note || null, status: 'returned' as const }, ...rows.slice(1)] : rows);
  };

  if (subs === null) return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;

  if (!latest) {
    return (
      <PronounPicturesRunner exercise={exercise} studentId={studentId} studentName={studentName} studentMode={false} />
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white">{studentName ?? 'Student'}’s answers</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sent {fmtWhen(latest.submittedAt)}
            {subs.length > 1 && ` · try ${subs.length}`}
            {latest.status === 'returned' && ' · already handed back'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold text-slate-800 dark:text-white">{score} / {latest.total}</div>
          <p className="text-[11px] text-slate-400">marked automatically — change any of it below</p>
        </div>
      </div>

      {exercise.rounds.map((round, ri) => {
        const m = marks[round.id];
        const typed = latest.answers[round.id] ?? '';
        const right = exercise.slots[round.correct];
        return (
          <section key={round.id} className={`rounded-3xl bg-white dark:bg-gray-800 border shadow-sm overflow-hidden ${
            m?.correct ? 'border-emerald-300 dark:border-emerald-700' : 'border-red-300 dark:border-red-700'}`}>
            <header className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 dark:bg-gray-700/40 border-b border-slate-200 dark:border-gray-700">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Round {ri + 1}</span>
              <div className="flex items-center gap-2">
                {m && !m.auto && <span className="text-[10px] text-slate-400">changed by you</span>}
                <button onClick={() => flip(round.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    m?.correct ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-red-500 text-white hover:bg-red-600'}`}>
                  {m?.correct ? '✓ Correct' : '✗ Wrong'} — tap to change
                </button>
              </div>
            </header>
            <div className="p-5 space-y-4">
              <TileRow>
                {SLOTS.map((s, i) => (
                  <PictureTile key={s.key} pic={round.pics?.[i]} audioUrl={exercise.slots[i]?.audioUrl} onPlay={play}
                    state={i === round.correct ? 'right' : 'muted'}
                    label={i === round.correct ? { arabic: exercise.slots[i]?.arabic ?? '', translit: exercise.slots[i]?.translit ?? '' } : null} />
                ))}
              </TileRow>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <p dir="auto" className="flex-1 min-w-[12rem] font-semibold text-slate-800 dark:text-slate-100">{round.question}</p>
                <div>
                  <span className="text-xs text-slate-400 block">wrote</span>
                  <span dir="auto" className={`text-lg font-bold ${m?.correct ? 'text-emerald-600' : 'text-red-600'}`}>{typed || '—'}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">answer</span>
                  <span dir="rtl" className="text-lg font-bold text-slate-700 dark:text-slate-200">{right?.arabic || '—'}</span>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-5 space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">A note for {studentName ?? 'the student'}</label>
        <textarea value={note} onChange={e => { setNote(e.target.value); setSaved(false); }} rows={2}
          placeholder="Optional — a word about how it went"
          className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white" />
        <div className="flex items-center gap-3">
          <button onClick={handBack} disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm active:scale-95 transition-all disabled:opacity-50">
            {busy ? 'Saving…' : latest.status === 'returned' ? 'Save the changes' : 'Hand it back'}
          </button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   EDITOR — the admin building it
   ═══════════════════════════════════════════════════════════════════════════ */

type PendingPic = { round: number; slot: number; which: 'url' | 'hoverUrl' } | null;

export const PronounPicturesEditor: React.FC<{
  exercise: LessonExercise;
  onChanged: (ex: LessonExercise) => void;
  onDeleted: () => void;
}> = ({ exercise, onChanged, onDeleted }) => {
  const play = useVoice();
  const mic = useMicrophones();
  const [ex, setEx] = useState<LessonExercise>(exercise);
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [busyPic, setBusyPic] = useState<string | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const [micError, setMicError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<PendingPic>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  useEffect(() => { setEx(exercise); }, [exercise]);

  /** Write it down at once. Pictures and recordings are too expensive to lose
   *  to a closed tab, so nothing here waits for a Save button. */
  const commit = useCallback(async (next: LessonExercise) => {
    setEx(next);
    onChanged(next);
    setStatus('saving');
    const ok = await saveLessonExercise(next.id, {
      title: next.title, published: next.published, slots: next.slots, rounds: next.rounds,
    });
    setStatus(ok ? 'saved' : 'error');
  }, [onChanged]);

  const setRound = (i: number, patch: Partial<ExerciseRound>) =>
    commit({ ...ex, rounds: ex.rounds.map((r, k) => k === i ? { ...r, ...patch } : r) });

  const setPic = (i: number, slot: number, which: 'url' | 'hoverUrl', url: string | null) =>
    commit({ ...ex, rounds: ex.rounds.map((r, k) => k === i ? {
      ...r, pics: [0, 1, 2, 3].map(s => s === slot ? { ...(r.pics?.[s] ?? { url: null, hoverUrl: null }), [which]: url } : (r.pics?.[s] ?? { url: null, hoverUrl: null })),
    } : r) });

  const setSlot = (i: number, patch: Partial<{ arabic: string; translit: string; audioUrl: string | null }>) =>
    commit({ ...ex, slots: ex.slots.map((s, k) => k === i ? { ...s, ...patch } : s) });

  // ── Pictures ──
  const pickPic = (round: number, slot: number, which: 'url' | 'hoverUrl') => {
    pending.current = { round, slot, which };
    fileRef.current?.click();
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = pending.current;
    pending.current = null;
    if (!file || !target) return;
    const tag = `${target.round}:${target.slot}:${target.which}`;
    setBusyPic(tag);
    const url = await uploadExerciseImage(file, ex.id);
    setBusyPic(null);
    if (!url) { window.alert('Could not upload that picture.'); return; }
    setPic(target.round, target.slot, target.which, url);
  };

  // ── The four voices ──
  const record = async (i: number) => {
    setMicError('');
    try {
      const opened = await openMic(mic.micId);
      mic.noteUsed(opened);
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(opened.stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        opened.stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (!blob.size) return;
        const url = await uploadExerciseAudio(blob, ex.id, ex.slots[i].key);
        if (!url) { setMicError('Could not save that recording.'); return; }
        setSlot(i, { audioUrl: url });
      };
      recRef.current = rec;
      rec.start();
      setRecording(i);
    } catch {
      setMicError('Microphone access denied — allow the microphone and try again.');
    }
  };
  const stopRecording = () => { recRef.current?.stop(); recRef.current = null; setRecording(null); };

  const addRound = () => commit({ ...ex, rounds: [...ex.rounds, emptyRound()] });
  const removeRound = (i: number) => {
    if (!window.confirm(`Delete round ${i + 1}?`)) return;
    commit({ ...ex, rounds: ex.rounds.filter((_, k) => k !== i) });
  };
  const moveRound = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= ex.rounds.length) return;
    const next = [...ex.rounds];
    const [m] = next.splice(i, 1);
    next.splice(to, 0, m);
    commit({ ...ex, rounds: next });
  };

  const removeExercise = async () => {
    if (!window.confirm(`Delete “${ex.title}” and every answer sent for it? This cannot be undone.`)) return;
    const ok = await deleteLessonExercise(ex.id);
    if (!ok) { window.alert('Could not delete it.'); return; }
    onDeleted();
  };

  /** What still needs doing before it is worth publishing. */
  const problems: string[] = [];
  if (!ex.slots.every(s => s.arabic.trim())) problems.push('write the Arabic for all four pronouns');
  if (!ex.slots.every(s => s.audioUrl)) problems.push('record all four pronouns');
  if (!ex.rounds.length) problems.push('add at least one round');
  ex.rounds.forEach((r, i) => {
    if (!r.question.trim()) problems.push(`round ${i + 1} has no question`);
    if (![0, 1, 2, 3].every(s => r.pics?.[s]?.url)) problems.push(`round ${i + 1} is missing a picture`);
  });

  const inp = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />

      {/* ── Title · publish · delete ── */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[14rem]">
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Exercise name</label>
            <input value={ex.title} onChange={e => setEx({ ...ex, title: e.target.value })}
              onBlur={() => commit(ex)} className={inp} placeholder="e.g. Who did it? — pronouns" />
          </div>
          <div className="flex items-center gap-2">
            {status === 'saving' && <span className="text-xs text-slate-400">saving…</span>}
            {status === 'saved' && <span className="text-xs text-emerald-600 font-semibold">saved ✓</span>}
            {status === 'error' && <span className="text-xs text-red-600 font-semibold">not saved — try again</span>}
            <button onClick={removeExercise}
              className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">🗑 Delete</button>
          </div>
        </div>

        <div className={`rounded-xl p-4 border ${ex.published
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
          : 'bg-slate-50 dark:bg-gray-700/40 border-slate-200 dark:border-gray-700'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-white">
                {ex.published ? 'Published — students and tutors can see it' : 'Not published — only you can see it'}
              </p>
              {!!problems.length && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Still to do: {problems.join(' · ')}</p>
              )}
            </div>
            <button onClick={() => commit({ ...ex, published: !ex.published })}
              className={`px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm active:scale-95 transition-all ${
                ex.published ? 'bg-slate-500 hover:bg-slate-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
              {ex.published ? 'Unpublish' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {/* ── The four pronouns, recorded once for the whole exercise ── */}
      <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-5 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 dark:text-white">The four pronouns</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Always in this order, left to right, in every round. The recording plays when the student points at that picture — one set for the whole exercise.
          </p>
        </div>
        <MicrophonePicker mic={mic} />
        {micError && <p className="text-sm text-red-600 dark:text-red-400">{micError}</p>}
        <div className="grid sm:grid-cols-2 gap-3">
          {ex.slots.map((s, i) => (
            <div key={s.key} className="rounded-xl border border-slate-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300">
                  {i + 1} · {SLOTS[i].english}
                </span>
                <div className="flex items-center gap-1">
                  {s.audioUrl && (
                    <button onClick={() => play(s.audioUrl)} title="Listen"
                      className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">▶</button>
                  )}
                  {recording === i ? (
                    <button onClick={stopRecording}
                      className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-bold animate-pulse">■ Stop</button>
                  ) : (
                    <button onClick={() => record(i)} disabled={recording !== null}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white text-xs font-bold disabled:opacity-40">
                      🎙 {s.audioUrl ? 'Re-record' : 'Record'}
                    </button>
                  )}
                </div>
              </div>
              <input dir="rtl" value={s.arabic} onChange={e => setEx({ ...ex, slots: ex.slots.map((x, k) => k === i ? { ...x, arabic: e.target.value } : x) })}
                onBlur={() => commit(ex)} placeholder="هو" className={`${inp} text-lg font-bold text-center`} />
              <input value={s.translit} onChange={e => setEx({ ...ex, slots: ex.slots.map((x, k) => k === i ? { ...x, translit: e.target.value } : x) })}
                onBlur={() => commit(ex)} placeholder="huwwe" className={`${inp} text-center italic`} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400">
          Either spelling is accepted when the answer is marked, Arabic or transliteration, and the harakat need not match.
        </p>
      </div>

      {/* ── Rounds ── */}
      {ex.rounds.map((round, ri) => (
        <div key={round.id} className="rounded-3xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-5 py-3 bg-slate-50 dark:bg-gray-700/40 border-b border-slate-200 dark:border-gray-700">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Round {ri + 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => moveRound(ri, -1)} disabled={ri === 0} title="Move up"
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-600 disabled:opacity-30">↑</button>
              <button onClick={() => moveRound(ri, 1)} disabled={ri === ex.rounds.length - 1} title="Move down"
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-600 disabled:opacity-30">↓</button>
              <button onClick={() => removeRound(ri)} title="Delete round"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">🗑</button>
            </div>
          </header>

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {SLOTS.map((s, si) => {
                const pic = round.pics?.[si] ?? { url: null, hoverUrl: null };
                const isRight = round.correct === si;
                return (
                  <div key={s.key} className={`rounded-2xl border-2 p-2 space-y-2 transition-colors ${
                    isRight ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-gray-700'}`}>
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{si + 1} · {s.english}</span>
                      {ex.slots[si]?.audioUrl && (
                        <button onClick={() => play(ex.slots[si].audioUrl)} title="Listen" className="text-xs text-slate-400 hover:text-amber-600">🔊</button>
                      )}
                    </div>

                    {/* The picture the student sees first */}
                    <button onClick={() => pickPic(ri, si, 'url')}
                      className="relative w-full aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-gray-700 hover:ring-2 hover:ring-amber-400 transition-all">
                      {pic.url
                        ? <img src={pic.url} alt="" className="w-full h-full object-cover" />
                        : <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
                            <span className="text-2xl">＋</span><span className="text-[10px] font-semibold">picture</span>
                          </span>}
                      {busyPic === `${ri}:${si}:url` && <span className="absolute inset-0 bg-black/40 text-white text-xs flex items-center justify-center">uploading…</span>}
                    </button>

                    {/* The one it swaps to while being pointed at */}
                    <button onClick={() => pickPic(ri, si, 'hoverUrl')}
                      className="relative w-full h-14 rounded-xl overflow-hidden bg-slate-100 dark:bg-gray-700 hover:ring-2 hover:ring-amber-400 transition-all">
                      {pic.hoverUrl
                        ? <img src={pic.hoverUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-slate-400">＋ hover picture</span>}
                      {busyPic === `${ri}:${si}:hoverUrl` && <span className="absolute inset-0 bg-black/40 text-white text-xs flex items-center justify-center">uploading…</span>}
                    </button>

                    <button onClick={() => setRound(ri, { correct: si })}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isRight ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'}`}>
                      {isRight ? '✓ the answer' : 'mark as answer'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">The question</label>
              <input dir="auto" value={round.question}
                onChange={e => setEx({ ...ex, rounds: ex.rounds.map((r, k) => k === ri ? { ...r, question: e.target.value } : r) })}
                onBlur={() => commit(ex)} placeholder="مين أكل الجبنة؟"
                className={`${inp} text-lg`} />
            </div>
          </div>
        </div>
      ))}

      <button onClick={addRound}
        className="w-full py-3 rounded-2xl border-2 border-dashed border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-500 dark:text-slate-400 hover:border-amber-400 hover:text-amber-600 transition-colors">
        ＋ Add round {ex.rounds.length + 1}
      </button>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   WHO HAS SENT IT IN — the admin's list, under the builder
   ═══════════════════════════════════════════════════════════════════════════ */

export const ExerciseInbox: React.FC<{ exercise: LessonExercise; nameOf: (id: string) => string }> = ({ exercise, nameOf }) => {
  const [rows, setRows] = useState<ExerciseSubmission[]>([]);
  useEffect(() => { void listExerciseInbox(exercise.id).then(setRows); }, [exercise.id]);
  if (!rows.length) return null;
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8">
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Sent in</h4>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-4 py-2 rounded-xl bg-slate-50 dark:bg-gray-800 text-sm">
            <span className="text-slate-700 dark:text-slate-200 font-medium">{nameOf(r.studentId)}</span>
            <span className="flex items-center gap-3">
              <span className="text-slate-400 text-xs">{fmtWhen(r.submittedAt)}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{r.score} / {r.total}</span>
              {r.status === 'returned' ? <Pill tone="ok">handed back</Pill> : <Pill tone="wait">to mark</Pill>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
