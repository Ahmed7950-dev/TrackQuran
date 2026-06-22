// components/VerseAudioPlayer.tsx
// Shared audio player for Sheikh Al-Minshawi recitations.
// Used by both SharedReportPage (Mistakes tab) and StudentProgressPage (read-only student view).

import React, { useRef, useState, useEffect } from 'react';

// ── Global-ayah helpers ───────────────────────────────────────────────────────

const SURAH_VERSE_COUNTS = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
  59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
  52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
  21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
];

const toGlobalAyah = (surah: number, ayah: number): number => {
  let n = 0;
  for (let i = 0; i < surah - 1; i++) n += SURAH_VERSE_COUNTS[i];
  return n + ayah;
};

export const audioUrl = (surah: number, ayah: number): string =>
  `https://cdn.islamic.network/quran/audio/128/ar.minshawi/${toGlobalAyah(surah, ayah)}.mp3`;

/** Number of ayahs in a surah (1-indexed surah number). */
export const versesInSurah = (surah: number): number => SURAH_VERSE_COUNTS[surah - 1] ?? 0;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  surah: number;
  ayah: number;
  onEnded?: () => void;
}

const VerseAudioPlayer: React.FC<Props> = ({ surah, ayah, onEnded }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [speed,   setSpeed]     = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded,   setLoaded]   = useState(false);
  const [error,    setError]    = useState(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setLoaded(false);
    setError(false);
    if (audioRef.current) audioRef.current.load();
  }, [surah, ayah]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setError(true));
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleLoaded = () => {
    setLoaded(true);
    setDuration(audioRef.current?.duration ?? 0);
  };

  const handleEnded = () => { setPlaying(false); setProgress(0); onEnded?.(); };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const val = Number(e.target.value);
    audio.currentTime = (val / 100) * audio.duration;
    setProgress(val);
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  };

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];

  return (
    <div className="flex flex-col gap-2 mt-3 bg-slate-50 dark:bg-gray-700/50 rounded-xl p-3 border border-slate-200 dark:border-gray-600">
      <audio
        ref={audioRef}
        src={audioUrl(surah, ayah)}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoaded}
        onEnded={handleEnded}
        onError={() => setError(true)}
        preload="none"
      />
      {error ? (
        <p className="text-xs text-red-500 text-center">Could not load audio. Check your connection.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              disabled={!loaded && !playing}
              className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700 disabled:bg-slate-300 transition"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1.5 accent-teal-600 cursor-pointer"
              aria-label="Seek"
            />
            {duration > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 w-16 text-right flex-shrink-0">
                {fmt((progress / 100) * duration)} / {fmt(duration)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap" dir="ltr">
            <span className="text-xs text-slate-400 mr-1">Speed:</span>
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                  speed === s ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-gray-600 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-gray-500'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default VerseAudioPlayer;
