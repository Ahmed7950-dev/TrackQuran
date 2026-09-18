import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  wordAudioUrl,
  listWordsWithAudio,
  uploadWordAudio,
  deleteWordAudio,
} from '../services/wordAudioService';
import { listQaedahTopics, listQaedahWords, QaedahTopic, QaedahWord } from '../services/qaedahService';

// ─────────────────────────────────────────────────────────────────────────────
// Admin panel tab: manage pronunciation audio for each Qaedah word.
// Pick a Qaedah topic (kasrah, madd, …), then record in-browser (MediaRecorder),
// upload a file, preview, replace, or delete the audio for each word.
// Words without audio fall back to browser TTS in the Crane Builder game.
// ─────────────────────────────────────────────────────────────────────────────

const HAFS: React.CSSProperties = { fontFamily: "'Hafs', 'Amiri', serif", direction: 'rtl' };

const AdminWordAudioTab: React.FC = () => {
  const [topics, setTopics] = useState<QaedahTopic[]>([]);
  const [topicId, setTopicId] = useState<string>('');
  const [words, setWords] = useState<QaedahWord[]>([]);
  const [withAudio, setWithAudio] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [busyWord, setBusyWord] = useState<string | null>(null);
  const [recordingWord, setRecordingWord] = useState<string | null>(null);
  const [playingWord, setPlayingWord] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputWord = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load topics on mount.
  useEffect(() => {
    listQaedahTopics().then(t => {
      setTopics(t);
      setLoading(false);
      if (t.length > 0) setTopicId(t[0].id);
    });
  }, []);

  const refreshWords = useCallback(async (tid: string) => {
    if (!tid) { setWords([]); setWithAudio(new Set()); return; }
    setWordsLoading(true);
    const w = await listQaedahWords(tid);
    setWords(w);
    setWithAudio(await listWordsWithAudio(w.map(x => x.word)));
    setWordsLoading(false);
  }, []);

  useEffect(() => { refreshWords(topicId); }, [topicId, refreshWords]);

  // Stop any recording / playback on unmount.
  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioRef.current?.pause();
  }, []);

  // ── Record ─────────────────────────────────────────────────────────────────
  const startRecording = async (word: string) => {
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
          setBusyWord(word);
          const url = await uploadWordAudio(word, blob);
          if (!url) setError(`Failed to save audio for ${word}`);
          await refreshWords(topicId);
          setBusyWord(null);
        }
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecordingWord(word);
    } catch {
      setError('Microphone access denied — allow the microphone or upload a file instead.');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecordingWord(null);
  };

  // ── Upload from file ─────────────────────────────────────────────────────────
  const pickFile = (word: string) => {
    fileInputWord.current = word;
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const word = fileInputWord.current;
    if (!file || !word) return;
    if (!file.type.startsWith('audio/')) { setError('Please choose an audio file.'); return; }
    setError('');
    setBusyWord(word);
    const url = await uploadWordAudio(word, file);
    if (!url) setError(`Failed to upload audio for ${word}`);
    await refreshWords(topicId);
    setBusyWord(null);
  };

  // ── Preview / delete ─────────────────────────────────────────────────────────
  const playPreview = (word: string) => {
    audioRef.current?.pause();
    const audio = new Audio(`${wordAudioUrl(word)}?t=${Date.now()}`);
    audioRef.current = audio;
    setPlayingWord(word);
    audio.onended = () => setPlayingWord(null);
    audio.onerror = () => { setPlayingWord(null); setError(`Could not play audio for ${word}`); };
    audio.play().catch(() => setPlayingWord(null));
  };

  const removeAudio = async (word: string) => {
    if (!window.confirm(`Delete the audio for "${word}"?`)) return;
    setBusyWord(word);
    const ok = await deleteWordAudio(word);
    if (!ok) setError(`Failed to delete audio for ${word}`);
    await refreshWords(topicId);
    setBusyWord(null);
  };

  const missingCount = words.length - words.filter(w => withAudio.has(w.word)).length;

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFileChosen} />

      {/* Header: lesson picker + progress */}
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-5 py-4 mb-4 flex items-center gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">Qaedah word audio</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {topicId && !wordsLoading && words.length > 0
              ? `${words.length - missingCount} of ${words.length} words recorded · `
              : ''}
            used by the Crane Builder game; the rest fall back to the browser voice.
          </p>
        </div>
        {topicId && words.length > 0 && (
          <div className="h-2 w-40 sm:w-56 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
            <div
              className={`h-full rounded-full transition-all ${missingCount === 0 ? 'bg-green-500' : 'bg-teal-600'}`}
              style={{ width: `${Math.round(((words.length - missingCount) / words.length) * 100)}%` }}
            />
          </div>
        )}
        <span className="flex-1" />
        <div className="flex items-center gap-2 flex-shrink-0">
          <label htmlFor="word-audio-lesson" className="text-xs font-extrabold tracking-[0.08em] text-slate-500 dark:text-slate-400 uppercase">Lesson</label>
          {loading ? (
            <span className="text-sm text-slate-400">Loading lessons…</span>
          ) : topics.length === 0 ? (
            <span className="text-sm text-slate-400">No Qaedah lessons yet — add some in the Qaedah tab first.</span>
          ) : (
            <select
              id="word-audio-lesson"
              value={topicId}
              onChange={e => setTopicId(e.target.value)}
              className="w-56 sm:w-72 h-10 px-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            >
              {topics.map(t => (
                <option key={t.id} value={t.id}>{t.titleEn}{t.titleAr ? ` — ${t.titleAr}` : ''}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-sm font-semibold">
          {error}
        </div>
      )}

      {wordsLoading ? (
        <div className="py-16 text-center text-slate-400">Loading words…</div>
      ) : words.length === 0 ? (
        topicId && <div className="py-16 text-center text-slate-400">This lesson has no words yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {words.map(({ id, word }) => {
            const has = withAudio.has(word);
            const busy = busyWord === word;
            const recording = recordingWord === word;
            return (
              <div
                key={id}
                className={`rounded-2xl p-3.5 flex flex-col items-center gap-2 ${
                  recording ? 'bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-800'
                  : has ? 'bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700'
                  : 'bg-white dark:bg-gray-800 border-2 border-dashed border-slate-300 dark:border-gray-600'
                }`}
              >
                <span
                  style={{ ...HAFS, fontSize: '2.1rem', lineHeight: 1.3 }}
                  className={recording ? 'text-red-600 dark:text-red-300' : has ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-gray-500'}
                >
                  {word}
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
                        onClick={() => playPreview(word)}
                        disabled={busy}
                        title="Preview"
                        aria-label={`Play ${word}`}
                        className="w-9 h-9 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                      >
                        {playingWord === word
                          ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
                          : <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z" /></svg>}
                      </button>
                      <button
                        onClick={() => pickFile(word)}
                        disabled={busy || recordingWord !== null}
                        title="Replace audio file"
                        aria-label={`Replace the audio for ${word}`}
                        className="w-9 h-9 rounded-full border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeAudio(word)}
                        disabled={busy}
                        title="Delete"
                        aria-label={`Delete the audio for ${word}`}
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
                        onClick={() => startRecording(word)}
                        disabled={busy || recordingWord !== null}
                        title="Record from microphone"
                        aria-label={`Record ${word}`}
                        className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center disabled:opacity-40 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3ZM19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => pickFile(word)}
                        disabled={busy || recordingWord !== null}
                        title="Upload audio file"
                        aria-label={`Upload a file for ${word}`}
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
        </div>
      )}
    </div>
  );
};

export default AdminWordAudioTab;
