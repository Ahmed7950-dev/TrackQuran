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

const AdminLetterAudioTab: React.FC = () => {
  const [withAudio, setWithAudio] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyLetter, setBusyLetter] = useState<string | null>(null);
  const [recordingLetter, setRecordingLetter] = useState<string | null>(null);
  const [playingLetter, setPlayingLetter] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
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

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileChosen} />

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Arabic Letter Audio</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pronunciation clips used by the Letter Flight airplane game. Letters without audio fall back to the browser's Arabic voice.
          </p>
        </div>
        <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
          missingCount === 0
            ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
            : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
        }`}>
          {loading ? 'Checking…' : missingCount === 0 ? '✓ All 28 letters have audio' : `⚠️ ${missingCount} letter${missingCount === 1 ? '' : 's'} missing audio`}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" style={{ direction: 'rtl' }}>
        {ARABIC_LETTERS.map(letter => {
          const has = withAudio.has(letter);
          const busy = busyLetter === letter;
          const recording = recordingLetter === letter;
          return (
            <div
              key={letter}
              className={`rounded-2xl border-2 p-3 flex flex-col items-center bg-white dark:bg-gray-800 ${
                recording ? 'border-red-400 ring-2 ring-red-200'
                : has ? 'border-green-200 dark:border-green-800'
                : 'border-slate-200 dark:border-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span style={{ fontFamily: "'Hafs', 'Amiri', serif", fontSize: '2.4rem', lineHeight: 1 }} className="text-slate-800 dark:text-slate-100">
                  {letter}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full ${has ? 'bg-green-500' : 'bg-slate-300 dark:bg-gray-600'}`} title={has ? 'Has audio' : 'No audio'} />
              </div>

              <div className="flex gap-1.5 flex-wrap justify-center" style={{ direction: 'ltr' }}>
                {recording ? (
                  <button
                    onClick={stopRecording}
                    className="px-3 py-1 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold animate-pulse"
                  >■ Stop</button>
                ) : (
                  <button
                    onClick={() => startRecording(letter)}
                    disabled={busy || recordingLetter !== null}
                    className="px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 disabled:opacity-40"
                    title="Record from microphone"
                  >🎙 Rec</button>
                )}
                <button
                  onClick={() => pickFile(letter)}
                  disabled={busy || recordingLetter !== null}
                  className="px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 disabled:opacity-40"
                  title={has ? 'Replace audio file' : 'Upload audio file'}
                >{has ? '↻' : '⬆'} File</button>
                {has && (
                  <>
                    <button
                      onClick={() => playPreview(letter)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 text-xs font-bold hover:bg-green-100 disabled:opacity-40"
                      title="Preview"
                    >{playingLetter === letter ? '🔊' : '▶'}</button>
                    <button
                      onClick={() => removeAudio(letter)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-full bg-slate-50 dark:bg-gray-700 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                      title="Delete"
                    >🗑</button>
                  </>
                )}
              </div>
              {busy && <span className="text-[10px] text-slate-400 mt-1.5">Saving…</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminLetterAudioTab;
