import React, { useEffect, useRef, useState } from 'react';
import type { MistakeVoice } from '../types';
import {
  MAX_VOICE_MS, RECORDER_BITRATE, pickRecorderMime, voiceLength,
} from '../services/mistakeVoiceService';

// ─────────────────────────────────────────────────────────────────────────────
// VoiceNoteButton — record one short correction, or play back the one that is
// already there. Small enough to live inside the mistake ring's centre hole.
//
// Three things it refuses to do, each from something that went wrong before:
//   • it never shares a chunk array between takes (a leaked flush from the
//     previous take makes the next file unplayable),
//   • it never saves a silent take: a dead microphone produces a perfectly
//     valid file that peaks near nothing, and a note the student cannot hear is
//     worse than no note at all,
//   • it never keeps a take whose ring was closed mid-recording — the audio is
//     uploaded only once it can be attached to a mark, so nothing is orphaned.
// ─────────────────────────────────────────────────────────────────────────────

/** Real speech peaks two orders of magnitude above a dead mic's floor. */
const SILENT_PEAK = 0.01;

type Props = {
  /** The note already attached to this mistake, if any. */
  voice?: MistakeVoice | null;
  /** Upload the take and attach it. False = it did not land, and we say so. */
  onSave: (blob: Blob, ms: number) => Promise<boolean>;
  onDelete: () => void;
  disabled?: boolean;
};

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);
const MIC = 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-4 4.9V19h3v2H8v-2h3v-3.1A5 5 0 0 1 7 11h2a3 3 0 0 0 6 0h2Z';
const PLAY = 'M8 5v14l11-7L8 5Z';
const STOP = 'M7 7h10v10H7z';

const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ' +
             'transition-colors disabled:opacity-50 disabled:cursor-default';

const VoiceNoteButton: React.FC<Props> = ({ voice, onSave, onDelete, disabled }) => {
  const [state, setState] = useState<'idle' | 'recording' | 'saving'>('idle');
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const peakRef = useRef(0);
  const meterOkRef = useRef(true);
  const startedRef = useRef(0);
  const discardRef = useRef(false);
  const aliveRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Let go of the microphone and everything watching it. */
  const release = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => { /* already closed */ });
    ctxRef.current = null;
    recRef.current = null;
  };

  const stop = () => {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();   // onstop finishes the job
    else release();
  };

  useEffect(() => () => {
    aliveRef.current = false;
    discardRef.current = true;                         // a closed ring keeps nothing
    stop();
    audioRef.current?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setErr(null);
    const mime = pickRecorderMime();
    if (!mime) { setErr('No recorder'); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch { setErr('Mic blocked'); return; }
    if (!aliveRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
    streamRef.current = stream;

    // Live level watch — the silent-take guard below reads its peak.
    peakRef.current = 0;
    meterOkRef.current = true;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const watch = () => {
        analyser.getFloatTimeDomainData(buf);
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i]);
          if (v > peakRef.current) peakRef.current = v;
        }
        rafRef.current = requestAnimationFrame(watch);
      };
      watch();
    } catch {
      meterOkRef.current = false;   // no meter: save unjudged rather than refuse everything
    }

    const chunks: Blob[] = [];      // one array per take — never shared
    // Both of these throw for real: a track that ended between the permission
    // and here, or a device another app has taken. Letting it escape would
    // leave the mic open and the button looking idle but dead.
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: RECORDER_BITRATE });
    } catch { release(); setErr('Mic not ready'); return; }
    recRef.current = rec;
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      const ms = Date.now() - startedRef.current;
      const peak = peakRef.current, judged = meterOkRef.current;
      release();
      if (discardRef.current) return;
      if (judged && peak < SILENT_PEAK) {
        setState('idle'); setSecs(0); setErr('No sound — check the mic'); return;
      }
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      if (!blob.size) { setState('idle'); setSecs(0); setErr('Nothing recorded'); return; }
      setState('saving');
      const ok = await onSave(blob, ms);
      if (!aliveRef.current) return;
      setState('idle'); setSecs(0);
      if (!ok) setErr('Did not save');
    };

    discardRef.current = false;
    startedRef.current = Date.now();
    try { rec.start(); } catch { release(); setErr('Mic not ready'); return; }
    setState('recording');
    setSecs(0);
    tickRef.current = window.setInterval(() => {
      const el = Date.now() - startedRef.current;
      setSecs(Math.floor(el / 1000));
      if (el >= MAX_VOICE_MS) stop();
    }, 250);
  };

  const play = () => {
    if (!voice?.url) return;
    const a = audioRef.current ?? (audioRef.current = new Audio());
    if (playing) { a.pause(); setPlaying(false); return; }
    a.src = voice.url;
    a.onended = () => setPlaying(false);
    a.onerror = () => { setPlaying(false); setErr('Will not play'); };
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  const remove = () => {
    audioRef.current?.pause();
    setPlaying(false);
    setErr(null);
    onDelete();
  };

  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className="inline-flex items-center gap-1">
        {state === 'recording' ? (
          <button type="button" onClick={stop} title="Stop and attach"
            className={`${PILL} bg-rose-600 text-white hover:bg-rose-700`}>
            <Icon d={STOP} />
            <span className="tabular-nums">0:{String(secs).padStart(2, '0')}</span>
          </button>
        ) : state === 'saving' ? (
          <span className={`${PILL} bg-slate-200 text-slate-500`}>Saving…</span>
        ) : voice ? (
          <>
            <button type="button" onClick={play} title="Play your note"
              className={`${PILL} ${playing ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}>
              <Icon d={PLAY} />
              <span className="tabular-nums">{voiceLength(voice.ms)}</span>
            </button>
            <button type="button" onClick={remove} title="Delete the note"
              className="w-4 h-4 rounded-full text-[10px] font-black leading-none text-slate-400 hover:text-rose-600"
              aria-label="Delete the voice note">×</button>
          </>
        ) : (
          <button type="button" onClick={start} disabled={disabled} title="Record a voice note on this letter"
            className={`${PILL} bg-amber-100 text-amber-800 hover:bg-amber-200`}>
            <Icon d={MIC} />
            Note
          </button>
        )}
      </span>
      {err && <span className="text-[8px] font-bold leading-tight text-rose-500 text-center">{err}</span>}
    </span>
  );
};

export default VoiceNoteButton;
