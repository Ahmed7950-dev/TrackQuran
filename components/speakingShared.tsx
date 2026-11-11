// components/speakingShared.tsx
// -----------------------------------------------------------------------------
// The pieces every speaking-homework screen is made of: the speaker's photo,
// the icons, one audio player, and one microphone.
// -----------------------------------------------------------------------------
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RECORDER_BITRATE, pickRecorderMime } from '../services/recitationHomeworkService';

export const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ── Icons ─────────────────────────────────────────────────────────────── */

type IconProps = { className?: string };
const stroke = (d: React.ReactNode, w = 2.2) => ({ className = 'w-5 h-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true">{d}</svg>
);

export const Icon = {
  back: stroke(<path d="m15 18-6-6 6-6" />, 2.4),
  mic: stroke(<><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><path d="M12 18v3.5" /></>, 2),
  replay: stroke(<><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></>),
  bulb: stroke(<><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></>),
  eye: stroke(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  check: stroke(<path d="m5 12 5 5 9-10" />, 3),
  cross: stroke(<path d="M6 6l12 12M18 6 6 18" />, 3),
  arrow: stroke(<><path d="M5 12h14" /><path d="m13 5 7 7-7 7" /></>, 2.6),
  lock: stroke(<><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>, 2.4),
  speaker: stroke(<><path d="M4 9.5v5h3.5l5 4v-13l-5 4z" /><path d="M16.5 9a4.5 4.5 0 0 1 0 6" /></>),
  upload: stroke(<><path d="M12 16V4" /><path d="m6 10 6-6 6 6" /><path d="M4 20h16" /></>),
  trash: stroke(<><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 13h9l1-13" /></>),
  up: stroke(<path d="m6 15 6-6 6 6" />, 2.6),
  down: stroke(<path d="m6 9 6 6 6-6" />, 2.6),
  plus: stroke(<path d="M12 5v14M5 12h14" />, 2.8),
  pen: stroke(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>, 2.1),
  pictures: stroke(<><rect x="4" y="5" width="7" height="7" rx="1.2" /><rect x="13" y="5" width="7" height="7" rx="1.2" /><rect x="4" y="14" width="7" height="5" rx="1.2" /><rect x="13" y="14" width="7" height="5" rx="1.2" /></>, 2.1),
  book: stroke(<><path d="M5 4.5h10a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" /><path d="M11.5 9v6M8.5 12h6" /></>, 2.4),
  play: ({ className = 'w-5 h-5' }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </svg>
  ),
  pause: ({ className = 'w-5 h-5' }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ),
  stop: ({ className = 'w-5 h-5' }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
    </svg>
  ),
  dots: ({ className = 'w-5 h-5' }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
    </svg>
  ),
};

/* ── The speaker ───────────────────────────────────────────────────────── */

/**
 * The speaker's photo in its amber ring. `speaking` sends two rings out from
 * it, which is how the student knows whose turn it is without reading anything.
 */
export const SpeakerAvatar: React.FC<{
  url: string | null; size: number; speaking?: boolean; className?: string;
}> = ({ url, size, speaking = false, className = '' }) => {
  const ring = Math.max(2, Math.round(size / 58));
  return (
    <span className={`relative inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}>
      {speaking && (
        <>
          <span aria-hidden="true" className="sp-ring absolute inset-0 rounded-full border-amber-500" style={{ borderWidth: ring }} />
          <span aria-hidden="true" className="sp-ring sp-ring-late absolute inset-0 rounded-full border-amber-500" style={{ borderWidth: ring }} />
        </>
      )}
      <span role="img" aria-label="The speaker"
        className="relative block w-full h-full rounded-full overflow-hidden bg-amber-200 dark:bg-amber-900/60"
        style={{ boxShadow: `0 0 0 ${ring}px var(--sp-gap, #fff), 0 0 0 ${ring * 2 + 1}px #f59e0b` }}>
        {url ? (
          <img src={url} alt="" className="w-full h-full object-cover" draggable={false} />
        ) : (
          <svg viewBox="0 0 174 174" className="w-full h-full" aria-hidden="true">
            <circle cx="87" cy="70" r="34" fill="#92400E" />
            <path d="M22 174c4-40 30-58 65-58s61 18 65 58z" fill="#B45309" />
          </svg>
        )}
      </span>
    </span>
  );
};

/** The keyframes the speaking screens share. Rendered once per screen. */
export const SpeakingStyles: React.FC = () => (
  <style>{`
    @keyframes sp-ring { 0% { transform: scale(1); opacity: .55 } 100% { transform: scale(1.34); opacity: 0 } }
    .sp-ring { animation: sp-ring 1.8s ease-out infinite; border-style: solid; }
    .sp-ring-late { animation-delay: .9s; }
    @keyframes sp-bar { 0%,100% { height: 30% } 50% { height: 100% } }
    .sp-bar { animation: sp-bar .8s ease-in-out infinite; }
    @keyframes sp-pulse { 0%,100% { box-shadow: 0 0 0 8px rgba(225,29,72,.18) } 50% { box-shadow: 0 0 0 16px rgba(225,29,72,.08) } }
    .sp-recording { animation: sp-pulse 1.4s ease-in-out infinite; }
    .dark { --sp-gap: #1f2937; }
    @media (prefers-reduced-motion: reduce) { .sp-ring, .sp-bar, .sp-recording { animation: none } .sp-ring { opacity: .35 } }
  `}</style>
);

/** Four bars that move while something is playing. */
export const Bars: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden="true" className={`inline-flex items-end gap-[3px] h-3.5 ${className}`}>
    {[0, 0.12, 0.24, 0.36].map(d => (
      <span key={d} className="sp-bar w-[3px] rounded-sm bg-current" style={{ animationDelay: `${d}s` }} />
    ))}
  </span>
);

/* ── One player ────────────────────────────────────────────────────────── */

/**
 * One audio element for a whole screen, so starting a recording stops whatever
 * was playing. `playing` is the key of what is running; `progress` runs 0–1.
 */
export function usePlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => {
      const a = audioRef.current;
      if (a && Number.isFinite(a.duration) && a.duration > 0) setProgress(a.currentTime / a.duration);
    }, 120);
    return () => window.clearInterval(iv);
  }, [playing]);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlaying(null);
  }, []);

  /** Play `url` under `key`; the same key again pauses it. Resolves to whether
   *  it actually started — a browser may refuse sound before the first tap. */
  const play = useCallback(async (key: string, url: string, onEnded?: () => void): Promise<boolean> => {
    const a = audioRef.current ?? (audioRef.current = new Audio());
    if (playing === key) { a.pause(); setPlaying(null); return false; }
    a.pause();
    a.src = url;
    a.onended = () => { setPlaying(null); setProgress(1); onEnded?.(); };
    a.onerror = () => { setPlaying(null); setFailed(key); };
    setProgress(0); setFailed(null);
    try { await a.play(); setPlaying(key); return true; }
    catch { setPlaying(null); return false; }
  }, [playing]);

  return { playing, progress, failed, play, stop };
}

/* ── One microphone ────────────────────────────────────────────────────── */

/** Below this peak the take is silence: a muted or dead microphone. */
const SILENT_PEAK = 0.01;

/**
 * Record one take. Each take has its own chunk list (a shared one lets the
 * previous recorder's last flush land at the head of the next file, and nothing
 * can play that), a silent take is refused rather than uploaded, and the level
 * meter is driven by rAF straight onto the element — never through React.
 */
export function useRecorder(opts: { maxMs: number; onTake: (blob: Blob, ms: number) => void | Promise<void> }) {
  const [state, setState] = useState<'idle' | 'recording'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const peakRef = useRef(0);
  const meterOkRef = useRef(false);
  const startingRef = useRef(false);
  const onTakeRef = useRef(opts.onTake);
  onTakeRef.current = opts.onTake;

  const release = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { srcRef.current?.disconnect(); } catch { /* already gone */ }
    srcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
  }, []);

  useEffect(() => () => {
    const r = recRef.current;
    if (r) { r.ondataavailable = null; r.onstop = null; if (r.state !== 'inactive') { try { r.stop(); } catch { /* gone */ } } }
    release();
    void ctxRef.current?.close().catch(() => {});
  }, [release]);

  const stop = useCallback(() => {
    const r = recRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }, []);

  const start = useCallback(async () => {
    if (startingRef.current || recRef.current?.state === 'recording') return;
    startingRef.current = true;
    try {
      setError('');
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
        setError('Allow the microphone to record your answer (check the browser’s site settings).');
        return;
      }
      streamRef.current = stream;
      const mime = pickRecorderMime();
      const r = mime
        ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: RECORDER_BITRATE })
        : new MediaRecorder(stream, { audioBitsPerSecond: RECORDER_BITRATE });
      const chunks: Blob[] = [];
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        release();
        setState('idle');
        const ms = Date.now() - startedRef.current;
        const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
        if (blob.size === 0 || ms < 400) { setError('That was too short — hold on a moment longer and try again.'); return; }
        if (meterOkRef.current && peakRef.current < SILENT_PEAK) {
          setError('Nothing was heard — that recording is silent. Check the microphone is not muted, then record again.');
          return;
        }
        void onTakeRef.current(blob, ms);
      };
      recRef.current = r;
      startedRef.current = Date.now();
      setElapsed(0);

      // The level: analyser only, nothing reaches the speakers.
      peakRef.current = 0; meterOkRef.current = false;
      try {
        const Ctx: typeof AudioContext | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = ctxRef.current ?? (ctxRef.current = new Ctx());
          void ctx.resume().catch(() => {});
          const src = ctx.createMediaStreamSource(stream);
          const an = ctx.createAnalyser();
          an.fftSize = 1024;
          src.connect(an);
          srcRef.current = src;
          meterOkRef.current = true;
          const buf = new Float32Array(an.fftSize);
          const tick = () => {
            rafRef.current = requestAnimationFrame(tick);
            an.getFloatTimeDomainData(buf);
            let p = 0;
            for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; }
            if (p > peakRef.current) peakRef.current = p;
            const m = meterRef.current;
            if (m) m.style.transform = `scaleX(${Math.min(1, Math.max(0.02, (20 * Math.log10(p || 1e-9) + 60) / 60))})`;
          };
          tick();
        }
      } catch { meterOkRef.current = false; }   // no meter: the take is kept unjudged

      r.start(1000);
      setState('recording');
      tickRef.current = window.setInterval(() => {
        const e = Date.now() - startedRef.current;
        setElapsed(e);
        if (e >= opts.maxMs) stop();
      }, 250);
    } finally {
      startingRef.current = false;
    }
  }, [opts.maxMs, release, stop]);

  return { state, elapsed, error, setError, start, stop, meterRef };
}
