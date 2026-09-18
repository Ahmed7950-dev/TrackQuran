import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ARABIC_LETTERS,
  letterAudioUrl,
  listLettersWithAudio,
  uploadLetterAudio,
  deleteLetterAudio,
} from '../services/letterAudioService';

// ─────────────────────────────────────────────────────────────────────────────
// Admin panel tab: manage pronunciation audio for each Arabic letter.
// Record in-browser (MediaRecorder), upload a file, preview, replace, delete.
// Letters without audio fall back to browser TTS in the airplane game.
// ─────────────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'recorded' | 'missing';

const AdminLetterAudioTab: React.FC = () => {
  const [withAudio, setWithAudio] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busyLetter, setBusyLetter] = useState<string | null>(null);
  const [recordingLetter, setRecordingLetter] = useState<string | null>(null);
  const [playingLetter, setPlayingLetter] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputLetter = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setWithAudio(await listLettersWithAudio());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Stop any recording / playback on unmount
  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioRef.current?.pause();
  }, []);

  // ── Record ─────────────────────────────────────────────────────────────────
  const startRecording = async (letter: string) => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      // Own array per take: a shared one lets the previous recorder's final
      // flush land at the head of this take's file.
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          setBusyLetter(letter);
          const url = await uploadLetterAudio(letter, blob);
          if (!url) setError(`Failed to save audio for ${letter}`);
          await refresh();
          setBusyLetter(null);
        }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecordingLetter(letter);
    } catch {
      setError('Microphone access denied — allow the microphone or upload a file instead.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecordingLetter(null);
  };

  // ── Upload from file ───────────────────────────────────────────────────────
  const pickFile = (letter: string) => {
    fileInputLetter.current = letter;
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const letter = fileInputLetter.current;
    if (!file || !letter) return;
    if (!file.type.startsWith('audio/')) { setError('Please choose an audio file.'); return; }
    setError('');
    setBusyLetter(letter);
    const url = await uploadLetterAudio(letter, file);
    if (!url) setError(`Failed to upload audio for ${letter}`);
    await refresh();
    setBusyLetter(null);
  };

  // ── Preview / delete ───────────────────────────────────────────────────────
  const playPreview = (letter: string) => {
    audioRef.current?.pause();
    const audio = new Audio(`${letterAudioUrl(letter)}?t=${Date.now()}`);
    audioRef.current = audio;
    setPlayingLetter(letter);
    audio.onended = () => setPlayingLetter(null);
    audio.onerror = () => { setPlayingLetter(null); setError(`Could not play audio for ${letter}`); };
    audio.play().catch(() => setPlayingLetter(null));
  };

  const removeAudio = async (letter: string) => {
    if (!window.confirm(`Delete the audio for "${letter}"?`)) return;
    setBusyLetter(letter);
    const ok = await deleteLetterAudio(letter);
    if (!ok) setError(`Failed to delete audio for ${letter}`);
    await refresh();
    setBusyLetter(null);
  };

  const missingCount = ARABIC_LETTERS.length - withAudio.size;
  const done         = withAudio.size;
  const pct          = Math.round((done / ARABIC_LETTERS.length) * 100);
  const shown        = ARABIC_LETTERS.filter(l =>
    filter === 'all' ? true : filter === 'recorded' ? withAudio.has(l) : !withAudio.has(l)
  );

  const chip = (id: Filter, label: string) => (
    <button
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${
        filter === id
          ? 'bg-white dark:bg-gray-800 text-slate-800 dark:text-slate-100 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >{label}</button>
  );

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileChosen} />

      {/* Header: progress + filters */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-5 py-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Arabic letter audio</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {loading ? 'Checking…' : `${done} of ${ARABIC_LETTERS.length} letters recorded`} · used by the Letter Flight game; the rest fall back to the browser voice.
          </p>
        </div>
        <div className="h-2 w-40 sm:w-56 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full transition-all ${missingCount === 0 ? 'bg-green-500' : 'bg-teal-600'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex-1" />
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex-shrink-0">
          {chip('all', `All ${ARABIC_LETTERS.length}`)}
          {chip('recorded', `Recorded ${done}`)}
          {chip('missing', `Missing ${missingCount}`)}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {shown.map(letter => {
          const has = withAudio.has(letter);
          const busy = busyLetter === letter;
          const recording = recordingLetter === letter;
          return (
            <div
              key={letter}
              className={`rounded-2xl p-3.5 flex flex-col items-center gap-2 ${
                recording ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800'
                : has ? 'bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700'
                : 'bg-white dark:bg-gray-800 border-2 border-dashed border-slate-300 dark:border-gray-600'
              }`}
            >
              <span
                style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '2.4rem', lineHeight: 1 }}
                className={recording ? 'text-red-600 dark:text-red-300' : has ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-gray-500'}
              >
                {letter}
              </span>

              <span className={`flex items-center gap-1.5 text-[11px] font-extrabold ${
                recording ? 'text-red-600 dark:text-red-300'
                : has ? 'text-green-700 dark:text-green-400'
                : 'text-slate-400'
              }`}>
                {(recording || has) && (
                  <span className={`w-[7px] h-[7px] rounded-full ${recording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                )}
                {busy ? 'Saving…' : recording ? 'Recording' : has ? 'Recorded' : 'No audio yet'}
              </span>

              <div className="flex gap-2">
                {recording ? (
                  <button
                    onClick={stopRecording}
                    className="h-9 px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center gap-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
                    Stop
                  </button>
                ) : has ? (
                  <>
                    <button
                      onClick={() => playPreview(letter)}
                      disabled={busy}
                      title="Preview"
                      aria-label={`Play ${letter}`}
                      className="w-9 h-9 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      {playingLetter === letter
                        ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>}
                    </button>
                    <button
                      onClick={() => pickFile(letter)}
                      disabled={busy || recordingLetter !== null}
                      title="Replace audio file"
                      aria-label={`Replace the audio for ${letter}`}
                      className="w-9 h-9 rounded-full border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
                      </svg>
                    </button>
                    <button
                      onClick={() => removeAudio(letter)}
                      disabled={busy}
                      title="Delete"
                      aria-label={`Delete the audio for ${letter}`}
                      className="w-9 h-9 rounded-full border border-slate-200 dark:border-gray-600 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startRecording(letter)}
                      disabled={busy || recordingLetter !== null}
                      title="Record from microphone"
                      aria-label={`Record ${letter}`}
                      className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3ZM19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => pickFile(letter)}
                      disabled={busy || recordingLetter !== null}
                      title="Upload audio file"
                      aria-label={`Upload a file for ${letter}`}
                      className="w-9 h-9 rounded-full border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="col-span-full text-center text-sm text-slate-400 py-10">Nothing here — every letter is on the other tab.</p>
        )}
      </div>
    </div>
  );
};

export default AdminLetterAudioTab;
