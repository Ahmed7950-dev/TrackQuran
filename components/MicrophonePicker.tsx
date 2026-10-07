// components/MicrophonePicker.tsx
// ---------------------------------------------------------------------------
// Which microphone to record with.
//
// A laptop with a headset plugged in has at least two, and the browser picks
// one on its own — usually the built-in one, which is the worse of the two for
// recording words a child has to hear clearly. This lets the choice be made,
// and remembers it.
//
// Two things make this fiddlier than it looks:
//
//   1. Device NAMES are hidden until the microphone has been allowed once.
//      Before that, enumerateDevices() returns entries with empty labels, so
//      the list is useless. Hence the "Show my microphones" button, which asks
//      for permission purely to learn the names and then stops the stream.
//
//   2. Devices come and go. A headset unplugged mid-session leaves a saved id
//      pointing at nothing, so the recorder asks for it loosely and falls back
//      to the default rather than failing outright.
// ---------------------------------------------------------------------------
import React, { useCallback, useEffect, useState } from 'react';

const STORE_KEY = 'adminAudio.micId';

export interface Microphones {
  mics: MediaDeviceInfo[];
  micId: string;
  setMicId: (id: string) => void;
  /** True once the browser is willing to tell us the device names. */
  named: boolean;
  /** Ask for the microphone just to learn the names, then let it go. */
  reveal: () => Promise<void>;
  error: string;
}

/**
 * The audio constraint to hand to getUserMedia.
 *
 * `ideal`, never `exact`: a saved id whose device has since been unplugged
 * makes `exact` throw, and the tutor would see "microphone access denied" for
 * what is really a missing headset. `ideal` quietly falls back to the default.
 */
export const micConstraint = (micId: string): MediaStreamConstraints['audio'] =>
  micId ? { deviceId: { ideal: micId } } : true;

export function useMicrophones(): Microphones {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicIdState] = useState<string>(() => {
    try { return localStorage.getItem(STORE_KEY) ?? ''; } catch { return ''; }
  });
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setMics(all.filter(d => d.kind === 'audioinput'));
    } catch {
      setError('Could not read the list of microphones.');
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => { void load(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, [load]);

  const setMicId = useCallback((id: string) => {
    setMicIdState(id);
    try { id ? localStorage.setItem(STORE_KEY, id) : localStorage.removeItem(STORE_KEY); }
    catch { /* private mode */ }
  }, []);

  const reveal = useCallback(async () => {
    setError('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());   // we only wanted the permission
      await load();
    } catch {
      setError('Microphone access denied — allow it to choose a device.');
    }
  }, [load]);

  // Chosen device gone (headset unplugged): fall back rather than record silence.
  useEffect(() => {
    if (micId && mics.length > 0 && !mics.some(m => m.deviceId === micId)) setMicId('');
  }, [mics, micId, setMicId]);

  const named = mics.some(m => !!m.label);
  return { mics, micId, setMicId, named, reveal, error };
}

const MicrophonePicker: React.FC<{ mic: Microphones; className?: string }> = ({ mic, className }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
    <label htmlFor="admin-mic" className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="2" width="6" height="11" rx="3" />
        <path d="M19 10.5V12a7 7 0 0 1-14 0v-1.5" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
      Microphone
    </label>

    <select
      id="admin-mic"
      value={mic.micId}
      onChange={e => mic.setMicId(e.target.value)}
      className="h-9 px-2 max-w-[260px] rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
    >
      <option value="">Browser default</option>
      {mic.mics.map((m, i) => (
        <option key={m.deviceId || i} value={m.deviceId}>
          {m.label || `Microphone ${i + 1}`}
        </option>
      ))}
    </select>

    {!mic.named && (
      <button type="button" onClick={() => void mic.reveal()}
        title="The browser hides device names until the microphone has been allowed once"
        className="h-9 px-3 rounded-lg border border-slate-300 dark:border-gray-600 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700">
        Show my microphones
      </button>
    )}

    {mic.error && <span className="text-xs font-semibold text-red-600 dark:text-red-400">{mic.error}</span>}
  </div>
);

export default MicrophonePicker;
