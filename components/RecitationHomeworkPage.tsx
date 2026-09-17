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
    <div className="min-h-[100dvh] bg-gradient-to-b from-[#f7f2e6] via-[#f3ecdc] to-[#ebe1cb] dark:from-gray-950 dark:via-gray-900 dark:to-gray-900 text-slate-800 dark:text-slate-100">
      {children}
    </div>
  );
  if (rec === undefined) return shell(<p className="text-center py-24 text-slate-400">Loading your homework…</p>);
  if (!rec) return shell(
    <div className="text-center py-24 px-4"><p className="text-5xl mb-3">🎙</p>
      <p className="font-black">Homework not found</p>
      <p className="text-sm text-slate-500">It may have been removed — ask your teacher for a new link.</p></div>,
  );

  const recordedCount = verses.filter(([vs, va]) => rec.recordings[`${vs}:${va}`]).length;
  const allRecorded = recordedCount === verses.length && verses.length > 0;
  const [s, a] = verses[idx] ?? [rec.startSurah, rec.startAyah];
  const text = texts[key];
  const hasTake = !!(localUrls.current[key] || rec.recordings[key]);
  const takeMs = rec.recordings[key]?.ms;
  const surahName = QURAN_METADATA.find(m => m.number === s);
  const portalLink = rec.reportId ? portalHomeworkUrl(rec.reportId, rec.homeworkId) : null;
  const pct = verses.length ? recordedCount / verses.length : 0;

  const statusBanner =
    rec.status === 'submitted' ? { cls: 'from-sky-500 to-indigo-500', icon: '📨', text: 'Submitted — your teacher will listen and review it.' }
    : rec.status === 'passed' ? { cls: 'from-emerald-500 to-teal-500', icon: '✅', text: 'Passed! Your teacher reviewed this homework.' }
    : rec.status === 'needs_revision' ? { cls: 'from-amber-500 to-orange-500', icon: '🔁', text: 'Needs revision — check the mistakes in your Quran page, then record the verses again and resubmit.' }
    : null;

  // ── Icons ──
  const Icon = {
    mic: <svg viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Z"/><path d="M18.5 11.5a.75.75 0 0 0-1.5 0 5 5 0 0 1-10 0 .75.75 0 0 0-1.5 0 6.5 6.5 0 0 0 5.75 6.46V20.5H9a.75.75 0 0 0 0 1.5h6a.75.75 0 0 0 0-1.5h-2.25v-2.54a6.5 6.5 0 0 0 5.75-6.46Z"/></svg>,
    stop: <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>,
    play: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M7.5 5.2v13.6a1 1 0 0 0 1.52.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 7.5 5.2Z"/></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>,
    prev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7"/></svg>,
    next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>,
  };
  const SoundBars: React.FC<{ on: boolean; cls?: string }> = ({ on, cls = 'bg-current' }) => (
    <span className="inline-flex items-end gap-[3px] h-4" aria-hidden>
      {[0, 1, 2, 3].map(i => (
        <span key={i} className={`w-[3px] rounded-full ${cls} ${on ? 'rh-bar' : ''}`}
          style={{ height: on ? undefined : '35%', animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );

  // Progress ring
  const R = 26, C = 2 * Math.PI * R;
  const ring = (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" className="stroke-black/10 dark:stroke-white/10" />
        <circle cx="32" cy="32" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
          className="stroke-emerald-500 transition-all duration-500" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums">{recordedCount}/{verses.length}</span>
    </div>
  );

  const pill = 'inline-flex items-center justify-center gap-2.5 rounded-2xl font-bold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';
  /** Round icon buttons carry no text — the label shows on hover (and is the
   *  button's accessible name). */
  const withTip = (tip: string, button: React.ReactNode, below = false, alignEnd = false) => (
    <span className="group relative inline-flex">
      {button}
      <span role="tooltip"
        className={`pointer-events-none absolute ${alignEnd ? 'right-0' : 'left-1/2 -translate-x-1/2'} ${below ? 'top-full mt-2' : 'bottom-full mb-2'} z-30 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-100 px-2.5 py-1 text-xs font-bold text-white dark:text-slate-900 shadow-lg opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100`}>
        {tip}
      </span>
    </span>
  );
  const roundBtn = 'relative w-[4.25rem] h-[4.25rem] sm:w-20 sm:h-20 rounded-full text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100';

  return shell(
    <div className="w-full px-3 sm:px-6 lg:px-10 py-4 sm:py-6 space-y-4 sm:space-y-5">
      <style>{`
        @keyframes rh-bar { 0%,100% { height: 25% } 50% { height: 100% } }
        .rh-bar { animation: rh-bar .8s ease-in-out infinite; }
        @keyframes rh-pulse { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.65); opacity: 0 } }
        .rh-pulse { animation: rh-pulse 1.4s ease-out infinite; }
      `}</style>

      {/* ── Top: title + progress, stretched across ── */}
      <section className="rounded-3xl bg-white/80 dark:bg-gray-800/80 backdrop-blur border border-white dark:border-gray-700 shadow-[0_8px_30px_-12px_rgba(120,90,40,0.25)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          {ring}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-teal-700 dark:text-teal-400">Recitation homework</p>
            <h1 className="text-xl sm:text-2xl font-black leading-tight">{rangeLabel(rec)}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {rec.studentName ? `${rec.studentName} · ` : ''}{recordedCount === verses.length ? 'All verses recorded' : `${verses.length - recordedCount} verse${verses.length - recordedCount === 1 ? '' : 's'} left to record`}
            </p>
          </div>
          {editable && withTip(
            submitting ? 'Submitting…' : allRecorded ? 'Submit homework'
              : `Record all verses to submit (${verses.length - recordedCount} left)`,
            <button onClick={submit} disabled={!allRecorded || submitting || take !== 'idle'}
              aria-label={allRecorded ? 'Submit homework' : 'Record all verses to submit'}
              className={`${roundBtn} bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 shadow-xl shadow-emerald-600/35 hover:shadow-emerald-600/55 hover:brightness-105`}>
              {submitting
                ? <span className="w-8 h-8 rounded-full border-4 border-white/40 border-t-white animate-spin" />
                : <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 translate-x-0.5"><path d="M3.48 3.1a1 1 0 0 1 1.08-.13l16 8a1 1 0 0 1 0 1.78l-16 8A1 1 0 0 1 3.2 19.6L5.6 12 3.2 4.4a1 1 0 0 1 .28-1.3ZM7.3 13l-1.6 5.02L17.76 12 5.7 5.98 7.3 11H13a1 1 0 1 1 0 2H7.3Z"/></svg>}
            </button>,
            true, true,
          )}
        </div>
        {rec.note && (
          <p className="mt-3 text-sm rounded-2xl bg-amber-50/80 dark:bg-amber-900/20 text-amber-900 dark:text-amber-100 px-4 py-2.5 whitespace-pre-wrap">📝 {rec.note}</p>
        )}

        {/* Verse chips — the whole width */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {verses.map(([vs, va], i) => {
            const done = !!rec.recordings[`${vs}:${va}`];
            const current = i === idx;
            const newSurah = i > 0 && verses[i - 1][0] !== vs;
            return (
              <React.Fragment key={`${vs}:${va}`}>
                {(i === 0 || newSurah) && rec.startSurah !== rec.endSurah && (
                  <span className="self-center px-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
                    {QURAN_METADATA.find(m => m.number === vs)?.transliteratedName}
                  </span>
                )}
                <button onClick={() => take === 'idle' && setIdx(i)}
                  title={`${QURAN_METADATA.find(m => m.number === vs)?.transliteratedName} ${va}${done ? ' · recorded' : ''}`}
                  className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full text-sm font-black tabular-nums transition-all ${
                    done ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-white dark:bg-gray-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-gray-600 hover:border-teal-400'
                  } ${current ? 'ring-4 ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ring-amber-400 scale-110' : ''}`}>
                  {va}
                  {done && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white text-emerald-600 text-[10px] leading-4 shadow">✓</span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {statusBanner && (
        <div className={`rounded-2xl bg-gradient-to-r ${statusBanner.cls} text-white px-5 py-3.5 shadow-lg flex flex-wrap items-center gap-x-4 gap-y-2`}>
          <span className="text-xl">{statusBanner.icon}</span>
          <span className="font-bold flex-1 min-w-[12rem]">{statusBanner.text}</span>
          {portalLink && (rec.status === 'passed' || rec.status === 'needs_revision') && (
            <a href={portalLink} className={`${pill} px-4 py-2 bg-white/20 hover:bg-white/30 text-sm`}>Open my Quran page →</a>
          )}
        </div>
      )}
      {rec.purgedAt && (
        <p className="text-xs text-slate-500">The recordings of this homework were cleared after the review to save space.</p>
      )}

      {/* ── The verse — full width; tap to hear Al-Minshawi ── */}
      <section className="rounded-[2rem] bg-[#fffdf7] dark:bg-gray-800 border border-amber-100 dark:border-gray-700 shadow-[0_20px_50px_-24px_rgba(120,90,40,0.35)] overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-8 pt-4 sm:pt-5">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100/80 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 px-3 py-1 text-xs sm:text-sm font-black">
            {surahName?.transliteratedName} <span className="opacity-50">•</span> Verse {a}
          </span>
          <span className="text-xs sm:text-sm font-bold text-slate-400 tabular-nums">{idx + 1} of {verses.length}</span>
        </div>
        <button onClick={playMinshawi} disabled={take === 'recording' || !text}
          className={`group block w-full px-4 sm:px-10 pt-2 pb-6 sm:pb-8 text-center transition-colors ${minshawiPlaying ? 'bg-teal-50/60 dark:bg-teal-900/10' : 'hover:bg-amber-50/40 dark:hover:bg-gray-700/30'}`}>
          {text ? (
            <p dir="rtl" className={`font-quranic break-words transition-colors ${minshawiPlaying ? 'text-teal-900 dark:text-teal-100' : 'text-slate-900 dark:text-slate-100'}`}
              style={{ fontSize: 'clamp(2.1rem, 5.4vw, 5.75rem)', lineHeight: 2.5 }}>
              {splitVerseWords(text).map((w, i, arr) => (
                <React.Fragment key={i}>{renderWordWithMarks(w, `r${i}`, 2.5)}{i < arr.length - 1 ? ' ' : ''}</React.Fragment>
              ))}
              {' '}
              <span className="inline-flex items-center justify-center rounded-full border-[3px] border-amber-400 text-amber-700 dark:text-amber-300 align-middle font-sans font-black whitespace-nowrap"
                style={{ minWidth: '1.6em', height: '1.6em', padding: '0 0.3em', fontSize: '0.42em', lineHeight: 1 }}>{toArabicDigits(a)}</span>
            </p>
          ) : (
            <p className="py-16 text-slate-400">Loading the verse…</p>
          )}
          <span className={`mt-1 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
            minshawiPlaying ? 'bg-teal-600 text-white' : 'bg-white dark:bg-gray-700 text-slate-500 dark:text-slate-300 shadow-sm group-hover:text-teal-700'}`}>
            <SoundBars on={minshawiPlaying} cls={minshawiPlaying ? 'bg-white' : 'bg-teal-500'} />
            {minshawiPlaying ? 'Al-Minshawi is reciting · tap to stop' : 'Tap the verse to listen to Al-Minshawi'}
          </span>
        </button>
      </section>

      {/* ── Controls dock — stays at the bottom of the screen while a long verse scrolls ── */}
      <section className="sticky bottom-2 sm:bottom-4 z-20 rounded-3xl bg-white/85 dark:bg-gray-800/85 backdrop-blur border border-white dark:border-gray-700 shadow-[0_12px_40px_-18px_rgba(120,90,40,0.35)] px-2.5 sm:px-6 py-3 sm:py-5">
        <div className="flex items-center justify-center gap-3 sm:gap-8">
          {/* Previous */}
          {withTip('Previous verse',
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0 || take !== 'idle'} aria-label="Previous verse"
              className={`${pill} w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-gray-600`}>
              {Icon.prev}
            </button>)}

          {/* Record */}
          {take === 'recording'
            ? withTip('Stop recording',
              <button onClick={stopRecording} aria-label="Stop recording"
                className={`${roundBtn} bg-gradient-to-br from-red-500 to-rose-700 shadow-xl shadow-red-600/40`}>
                <span className="absolute inset-0 rounded-full bg-red-500 rh-pulse" />
                <span className="relative">{Icon.stop}</span>
              </button>)
            : withTip(take === 'saving' ? 'Saving…' : hasTake ? 'Record again' : 'Record my recitation',
              <button onClick={startRecording} disabled={!editable || take === 'saving' || !text} aria-label={hasTake ? 'Record again' : 'Record my recitation'}
                className={`${roundBtn} bg-gradient-to-br from-rose-400 via-rose-500 to-pink-600 shadow-xl shadow-rose-500/40 hover:shadow-rose-500/60 hover:brightness-105`}>
                {take === 'saving'
                  ? <span className="w-8 h-8 rounded-full border-4 border-white/40 border-t-white animate-spin" />
                  : Icon.mic}
              </button>)}

          {/* My recitation */}
          {withTip(
            !hasTake ? 'Not recorded yet' : minePlaying ? 'Stop' : `Listen to my recitation${takeMs ? ` (${fmtSecs(takeMs)})` : ''}`,
            <button onClick={playMine} disabled={!hasTake || take !== 'idle'} aria-label={hasTake ? 'Listen to my recitation' : 'Not recorded yet'}
              className={`${roundBtn} bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/40 hover:shadow-indigo-500/60 hover:brightness-105 ${minePlaying ? 'ring-4 ring-indigo-300/70' : ''}`}>
              {minePlaying ? <span className="scale-125">{Icon.pause}</span> : <span className="scale-125 translate-x-0.5">{Icon.play}</span>}
            </button>)}

          {/* Next */}
          {withTip('Next verse',
            <button onClick={() => setIdx(i => Math.min(verses.length - 1, i + 1))} disabled={idx >= verses.length - 1 || take !== 'idle'} aria-label="Next verse"
              className={`${pill} w-11 h-11 sm:w-14 sm:h-14 rounded-full text-white bg-gradient-to-br from-teal-500 to-teal-700 shadow-md shadow-teal-700/25 hover:brightness-110`}>
              {Icon.next}
            </button>)}
        </div>

        {take === 'recording' && (
          <p className="mt-2 text-center text-sm font-black tabular-nums text-red-600">● Recording {fmtSecs(elapsed)}</p>
        )}
        <p className="hidden sm:block mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          {take === 'recording' ? 'Recite the verse, then tap the red button to stop.'
            : hasTake ? 'Happy with it? Go to the next verse. Not yet? Record again — it replaces this one.'
            : 'Tap the verse to listen as many times as you like, then tap the microphone and recite it.'}
        </p>
        {error && <p className="mt-2 text-center text-sm font-semibold text-red-600">{error}</p>}
      </section>
    </div>,
  );
};

export default RecitationHomeworkPage;
