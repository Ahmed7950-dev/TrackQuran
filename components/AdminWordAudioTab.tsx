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
  const chunksRef = useRef<Blob[]>([]);
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
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
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

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Qaedah Word Audio</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pronunciation clips used by the Crane Builder game. Words without audio fall back to the browser's Arabic voice.
          </p>
        </div>
        {topicId && (
          <div className={`px-4 py-2 rounded-xl text-sm font-bold ${
            words.length > 0 && missingCount === 0
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          }`}>
            {wordsLoading ? 'Checking…'
              : words.length === 0 ? 'No words in this lesson'
              : missingCount === 0 ? `✓ All ${words.length} words have audio`
              : `⚠️ ${missingCount} of ${words.length} missing audio`}
          </div>
        )}
      </div>

      {/* Topic picker */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Lesson</label>
        {loading ? (
          <div className="text-sm text-slate-400">Loading lessons…</div>
        ) : topics.length === 0 ? (
          <div className="text-sm text-slate-400">No Qaedah lessons yet — add some in the Qaedah tab first.</div>
        ) : (
          <select
            value={topicId}
            onChange={e => setTopicId(e.target.value)}
            className="w-full sm:w-80 px-3 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {topics.map(t => (
              <option key={t.id} value={t.id}>{t.titleEn}{t.titleAr ? ` — ${t.titleAr}` : ''}</option>
            ))}
          </select>
        )}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {words.map(({ id, word }) => {
            const has = withAudio.has(word);
            const busy = busyWord === word;
            const recording = recordingWord === word;
            return (
              <div
                key={id}
                className={`rounded-2xl border-2 p-3 flex flex-col items-center bg-white dark:bg-gray-800 ${
                  recording ? 'border-red-400 ring-2 ring-red-200'
                  : has ? 'border-green-200 dark:border-green-800'
                  : 'border-slate-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span style={{ ...HAFS, fontSize: '2.1rem', lineHeight: 1.3 }} className="text-slate-800 dark:text-slate-100">
                    {word}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${has ? 'bg-green-500' : 'bg-slate-300 dark:bg-gray-600'}`} title={has ? 'Has audio' : 'No audio'} />
                </div>

                <div className="flex gap-1.5 flex-wrap justify-center">
                  {recording ? (
                    <button
                      onClick={stopRecording}
                      className="px-3 py-1 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold animate-pulse"
                    >■ Stop</button>
                  ) : (
                    <button
                      onClick={() => startRecording(word)}
                      disabled={busy || recordingWord !== null}
                      className="px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 disabled:opacity-40"
                      title="Record from microphone"
                    >🎙 Rec</button>
                  )}
                  <button
                    onClick={() => pickFile(word)}
                    disabled={busy || recordingWord !== null}
                    className="px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300 text-xs font-bold hover:bg-sky-100 disabled:opacity-40"
                    title={has ? 'Replace audio file' : 'Upload audio file'}
                  >{has ? '↻' : '⬆'} File</button>
                  {has && (
                    <>
                      <button
                        onClick={() => playPreview(word)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300 text-xs font-bold hover:bg-green-100 disabled:opacity-40"
                        title="Preview"
                      >{playingWord === word ? '🔊' : '▶'}</button>
                      <button
                        onClick={() => removeAudio(word)}
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
      )}
    </div>
  );
};

export default AdminWordAudioTab;
