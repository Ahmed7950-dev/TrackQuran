// ─────────────────────────────────────────────────────────────────────────────
// RecitationHomeworkPage — /recite/:id, no sign-in needed.
//
// "Prepare reading" homework, one verse at a time: the verse is drawn big with
// the live-logging page's own word renderer and Quran font; tapping it plays
// Al-Minshawi (as often as the student likes). The student records their own
// recitation, listens back, records again until happy, and moves on. A side
// panel (a strip on phones) shows how many verses are recorded. When every
// verse has a take, Submit notifies the tutor.
//
// Each take is uploaded as soon as it stops — so leaving the page loses
// nothing — and replaces the verse's previous take (see saveVerseRecording).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVersesForSurah } from '../services/dataService';
import { splitVerseWords, renderWordWithMarks } from '../utils/quranicMarks';
import { audioUrl } from './VerseAudioPlayer';
import { QURAN_METADATA } from '../constants';
import {
  RecitationHomework, RECORDER_BITRATE, getRecitationHomework, pickRecorderMime,
  portalHomeworkUrl, rangeLabel, saveVerseRecording, submitRecitationHomework, versesOfRange,
} from '../services/recitationHomeworkService';

const MAX_TAKE_MS = 5 * 60 * 1000;

const toArabicDigits = (n: number): string => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const fmtSecs = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type TakeState = 'idle' | 'recording' | 'saving';

const RecitationHomeworkPage: React.FC<{ recitationId: string }> = ({ recitationId }) => {
  const [rec, setRec] = useState<RecitationHomework | null | undefined>(undefined);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [take, setTake] = useState<TakeState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [minshawiPlaying, setMinshawiPlaying] = useState(false);
  const [minePlaying, setMinePlaying] = useState(false);
  /** Takes recorded in this visit, playable instantly before the upload's URL. */
  const localUrls = useRef<Record<string, string>>({});

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const minshawiRef = useRef<HTMLAudioElement | null>(null);
  const mineRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    document.title = 'Recitation homework';
    getRecitationHomework(recitationId).then(setRec);
  }, [recitationId]);

  const verses = useMemo(() => (rec ? versesOfRange(rec) : []), [rec]);
  const key = verses[idx] ? `${verses[idx][0]}:${verses[idx][1]}` : '';

  // Verse texts, one fetch per surah (cached by dataService).
  useEffect(() => {
    if (!rec) return;
    let live = true;
    const surahs = [...new Set(verses.map(v => v[0]))];
    Promise.all(surahs.map(s => getVersesForSurah(s))).then(all => {
      if (!live) return;
      const map: Record<string, string> = {};
      for (const list of all) for (const v of list) map[v.verse_key] = v.text_uthmani;
      setTexts(map);
    }).catch(() => setError('Could not load the verses — check your connection and reload.'));
    return () => { live = false; };
  }, [rec, verses]);

  // Open on the first verse still without a recording.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!rec || openedRef.current || !verses.length) return;
    openedRef.current = true;
    const first = verses.findIndex(([s, a]) => !rec.recordings[`${s}:${a}`]);
    setIdx(first >= 0 ? first : 0);
  }, [rec, verses]);

  const stopAudio = () => {
    minshawiRef.current?.pause(); setMinshawiPlaying(false);
    mineRef.current?.pause(); setMinePlaying(false);
  };
  useEffect(() => { stopAudio(); }, [idx]);

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  };
  useEffect(() => () => { releaseMic(); stopAudio(); }, []);

  const editable = !!rec && (rec.status === 'assigned' || rec.status === 'needs_revision') && !rec.purgedAt;

  const playMinshawi = () => {
    if (!verses[idx] || take === 'recording') return;
    const a = minshawiRef.current ?? (minshawiRef.current = new Audio());
    if (minshawiPlaying) { a.pause(); setMinshawiPlaying(false); return; }
    mineRef.current?.pause(); setMinePlaying(false);
    a.src = audioUrl(verses[idx][0], verses[idx][1]);
    a.onended = () => setMinshawiPlaying(false);
    a.onerror = () => { setMinshawiPlaying(false); setError('The recitation could not be played.'); };
    a.play().then(() => setMinshawiPlaying(true)).catch(() => setMinshawiPlaying(false));
  };

  const playMine = () => {
    const url = localUrls.current[key] ?? rec?.recordings[key]?.url;
    if (!url) return;
    const a = mineRef.current ?? (mineRef.current = new Audio());
    if (minePlaying) { a.pause(); setMinePlaying(false); return; }
    minshawiRef.current?.pause(); setMinshawiPlaying(false);
    a.src = url;
    a.onended = () => setMinePlaying(false);
    a.play().then(() => setMinePlaying(true)).catch(() => setMinePlaying(false));
  };

  const startRecording = async () => {
    if (!rec || !verses[idx]) return;
    setError('');
    stopAudio();
    const mime = pickRecorderMime();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Try Chrome or Safari.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError('Allow microphone access to record your recitation (check the browser’s site settings).');
      return;
    }
    streamRef.current = stream;
    const [s, a] = verses[idx];
    const r = mime
      ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: RECORDER_BITRATE })
      : new MediaRecorder(stream, { audioBitsPerSecond: RECORDER_BITRATE });
    chunksRef.current = [];
    r.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    r.onstop = async () => {
      releaseMic();
      const ms = Date.now() - startedAtRef.current;
      const blob = new Blob(chunksRef.current, { type: r.mimeType || mime || 'audio/webm' });
      if (blob.size === 0 || ms < 400) { setTake('idle'); setError('That recording was empty — hold on a moment longer and try again.'); return; }
      const k = `${s}:${a}`;
      if (localUrls.current[k]) URL.revokeObjectURL(localUrls.current[k]);
      localUrls.current[k] = URL.createObjectURL(blob);
      setTake('saving');
      const saved = await saveVerseRecording(rec.id, s, a, blob, ms);
      setTake('idle');
      if (saved) setRec(saved);
      else setError('Your recording could not be saved — check your connection and record again.');
    };
    recorderRef.current = r;
    startedAtRef.current = Date.now();
    setElapsed(0);
    r.start(1000);
    setTake('recording');
    tickRef.current = window.setInterval(() => {
      const e = Date.now() - startedAtRef.current;
      setElapsed(e);
      if (e >= MAX_TAKE_MS) stopRecording();
    }, 250);
  };

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }, []);

  const submit = async () => {
    if (!rec) return;
    setSubmitting(true);
    const done = await submitRecitationHomework(rec);
    setSubmitting(false);
    if (done) setRec(done);
    else setError('Could not submit — check your connection and try again.');
  };

  // ── Screens ───────────────────────────────────────────────────────────────
  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-[#fdf8ee] dark:bg-gray-900 text-slate-800 dark:text-slate-100">{children}</div>
  );
  if (rec === undefined) return shell(<p className="text-center py-24 text-slate-400">Loading your homework…</p>);
  if (!rec) return shell(
    <div className="text-center py-24 px-4"><p className="text-5xl mb-3">🎙</p>
      <p className="font-black">Homework not found</p>
      <p className="text-sm text-slate-500">It may have been removed — ask your teacher for a new link.</p></div>,
  );

  const recordedCount = verses.filter(([s, a]) => rec.recordings[`${s}:${a}`]).length;
  const allRecorded = recordedCount === verses.length && verses.length > 0;
  const [s, a] = verses[idx] ?? [rec.startSurah, rec.startAyah];
  const text = texts[key];
  const hasTake = !!(localUrls.current[key] || rec.recordings[key]);
  const surahName = QURAN_METADATA.find(m => m.number === s);
  const portalLink = rec.reportId ? portalHomeworkUrl(rec.reportId, rec.homeworkId) : null;

  const statusBanner =
    rec.status === 'submitted' ? { cls: 'bg-sky-50 border-sky-200 text-sky-800 dark:bg-sky-900/30 dark:border-sky-800 dark:text-sky-200', text: '📨 Submitted — your teacher will listen and review it.' }
    : rec.status === 'passed' ? { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-200', text: '✅ Passed! Your teacher reviewed this homework.' }
    : rec.status === 'needs_revision' ? { cls: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-200', text: '🔁 Needs revision — check the mistakes in your Quran page, then record the verses again and resubmit.' }
    : null;

  const progressPanel = (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-3 sm:p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Recorded</p>
        <p className="text-sm font-black tabular-nums"><span className="text-emerald-600">{recordedCount}</span> / {verses.length}</p>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden mb-3">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${verses.length ? (recordedCount / verses.length) * 100 : 0}%` }} />
      </div>
      <div className="flex lg:flex-wrap gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
        {verses.map(([vs, va], i) => {
          const done = !!rec.recordings[`${vs}:${va}`];
          return (
            <button key={`${vs}:${va}`} onClick={() => take === 'idle' && setIdx(i)}
              title={`${QURAN_METADATA.find(m => m.number === vs)?.transliteratedName} ${va}${done ? ' · recorded' : ''}`}
              className={`flex-shrink-0 min-w-[2.25rem] h-9 px-1.5 rounded-lg text-xs font-bold border-2 transition-colors ${
                i === idx ? 'border-sky-500 ring-2 ring-sky-300/60' : 'border-transparent'} ${
                done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-slate-300'}`}>
              {done ? '✓' : ''}{va}
            </button>
          );
        })}
      </div>
      {editable && (
        <button onClick={submit} disabled={!allRecorded || submitting || take !== 'idle'}
          className="mt-3 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black disabled:opacity-40 disabled:cursor-not-allowed">
          {submitting ? 'Submitting…' : allRecorded ? '📨 Submit homework' : `Record all verses to submit (${verses.length - recordedCount} left)`}
        </button>
      )}
    </div>
  );

  return shell(
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
      <header className="mb-3 sm:mb-4">
        <p className="text-xs font-black uppercase tracking-wide text-teal-700 dark:text-teal-400">🎙 Recitation homework</p>
        <h1 className="text-xl sm:text-2xl font-black">{rangeLabel(rec)}</h1>
        {rec.studentName && <p className="text-sm text-slate-500">for {rec.studentName}</p>}
        {rec.note && <p className="mt-2 text-sm bg-white/70 dark:bg-gray-800 rounded-xl px-3 py-2 whitespace-pre-wrap">{rec.note}</p>}
      </header>

      {statusBanner && (
        <div className={`mb-3 rounded-xl border px-4 py-3 text-sm font-semibold ${statusBanner.cls}`}>
          {statusBanner.text}
          {portalLink && rec.status !== 'assigned' && rec.status !== 'submitted' && (
            <a href={portalLink} className="ms-2 underline font-black">Open my Quran page →</a>
          )}
        </div>
      )}
      {rec.purgedAt && (
        <p className="mb-3 text-xs text-slate-500">The recordings of this homework were cleared after the review to save space.</p>
      )}

      <div className="grid lg:grid-cols-[1fr_18rem] gap-3 sm:gap-5 items-start">
        {/* Phones: progress first, as a compact strip */}
        <div className="lg:hidden">{progressPanel}</div>

        <main className="space-y-3 sm:space-y-4 min-w-0">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-slate-500">{surahName?.transliteratedName} · verse {a}</span>
            <span className="text-slate-400 tabular-nums">{idx + 1} / {verses.length}</span>
          </div>

          {/* The verse — tap to hear Al-Minshawi */}
          <button onClick={playMinshawi} disabled={take === 'recording'}
            className={`w-full rounded-3xl border-2 bg-white dark:bg-gray-800 px-3 sm:px-8 py-6 sm:py-10 text-center transition-colors ${
              minshawiPlaying ? 'border-teal-500 ring-4 ring-teal-200/60 dark:ring-teal-800/60' : 'border-amber-200 dark:border-gray-700 hover:border-teal-400'}`}>
            {text ? (
              <p dir="rtl" className="font-quranic text-slate-900 dark:text-slate-100 break-words" style={{ fontSize: 'clamp(1.9rem, 6.5vw, 4.25rem)', lineHeight: 2.6 }}>
                {splitVerseWords(text).map((w, i, arr) => (
                  <React.Fragment key={i}>{renderWordWithMarks(w, `r${i}`, 2.6)}{i < arr.length - 1 ? ' ' : ''}</React.Fragment>
                ))}
                {' '}
                <span className="inline-flex items-center justify-center rounded-full border-2 border-amber-400 text-amber-700 dark:text-amber-300 align-middle font-sans font-bold"
                  style={{ width: '1.2em', height: '1.2em', fontSize: '0.5em' }}>{toArabicDigits(a)}</span>
              </p>
            ) : (
              <p className="py-10 text-slate-400">Loading the verse…</p>
            )}
            <p className={`mt-2 text-sm font-bold ${minshawiPlaying ? 'text-teal-600' : 'text-slate-400'}`}>
              {minshawiPlaying ? '🔊 Al-Minshawi is reciting — tap to stop' : '🔊 Tap the verse to listen to Al-Minshawi'}
            </p>
          </button>

          {/* My recording */}
          <div className="rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {take === 'recording' ? (
                <button onClick={stopRecording}
                  className="flex-1 min-w-[12rem] py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black flex items-center justify-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-white animate-pulse" /> Stop · {fmtSecs(elapsed)}
                </button>
              ) : (
                <button onClick={startRecording} disabled={!editable || take === 'saving' || !text}
                  className="flex-1 min-w-[12rem] py-3.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black disabled:opacity-40 disabled:cursor-not-allowed">
                  {take === 'saving' ? 'Saving…' : hasTake ? '🎙 Record again' : '🎙 Record my recitation'}
                </button>
              )}
              {hasTake && take !== 'recording' && (
                <button onClick={playMine} disabled={take === 'saving'}
                  className={`flex-1 min-w-[10rem] py-3.5 rounded-xl font-black border-2 ${minePlaying
                    ? 'bg-sky-600 border-sky-600 text-white' : 'bg-sky-50 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-200'}`}>
                  {minePlaying ? '⏸ Stop' : '▶ Listen to mine'}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {hasTake ? 'Happy with it? Go to the next verse. Not yet? Record again — it replaces this one.' : 'Listen first as many times as you like, then record yourself reading the verse.'}
            </p>
            {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0 || take !== 'idle'}
              className="flex-1 py-3 rounded-xl bg-slate-200 dark:bg-gray-700 font-bold disabled:opacity-40">‹ Previous</button>
            <button onClick={() => setIdx(i => Math.min(verses.length - 1, i + 1))} disabled={idx >= verses.length - 1 || take !== 'idle'}
              className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-40">Next ›</button>
          </div>
        </main>

        <aside className="hidden lg:block lg:sticky lg:top-6">{progressPanel}</aside>
      </div>
    </div>,
  );
};

export default RecitationHomeworkPage;
