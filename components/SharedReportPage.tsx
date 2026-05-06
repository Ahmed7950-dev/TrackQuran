import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSharedReport, SharedReportData } from '../services/dataService';
import { QURAN_METADATA } from '../constants';
import Logo from './Logo';

// ── helpers ──────────────────────────────────────────────────────────────────

const toEasternArabicNumerals = (num: number): string =>
  String(num).split('').map(d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d, 10)]).join('');

const isArabicLetter = (char: string | undefined): boolean => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code >= 0x0621 && code <= 0x064a) return true;
  if (code >= 0x0671 && code <= 0x06d3) return true;
  if (code === 0x06d5) return true;
  if (code >= 0x06ee && code <= 0x06ef) return true;
  if (code >= 0x06fa && code <= 0x06fc) return true;
  return false;
};

const parseWordIntoLetters = (word: string): Array<{ letter: string; index: number }> => {
  const letters: Array<{ letter: string; index: number }> = [];
  let li = 0;
  for (let i = 0; i < word.length; i++) {
    const ch = word[i];
    if (isArabicLetter(ch)) {
      letters.push({ letter: ch, index: li++ });
    } else if (letters.length > 0) {
      letters[letters.length - 1].letter += ch;
    } else {
      letters.push({ letter: ch, index: li++ });
    }
  }
  return letters;
};

const getMistakeBg = (level: number) => {
  switch (level) {
    case 1: return 'bg-yellow-200/70';
    case 2: return 'bg-orange-300/70';
    case 3: return 'bg-red-400/70';
    default: return '';
  }
};

// Minshawi individual-ayah audio URL from everyayah.com
const audioUrl = (surah: number, ayah: number) =>
  `https://everyayah.com/data/Minshawi_Murattal_64kbps/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

// ── sub-components ────────────────────────────────────────────────────────────

const VerseAudioPlayer: React.FC<{ surah: number; ayah: number }> = ({ surah, ayah }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Reset when verse changes
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setLoaded(false);
    setError(false);
    if (audioRef.current) {
      audioRef.current.load();
    }
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

  const handleEnded = () => { setPlaying(false); setProgress(0); };

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
    <div className="flex flex-col gap-2 mt-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
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
          {/* Progress bar + play + time */}
          <div className="flex items-center gap-2">
            {/* Play / pause */}
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

            {/* Seek bar */}
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

            {/* Time */}
            {duration > 0 && (
              <span className="text-xs text-slate-500 w-16 text-right flex-shrink-0">
                {fmt((progress / 100) * duration)} / {fmt(duration)}
              </span>
            )}
          </div>

          {/* Speed buttons */}
          <div className="flex items-center gap-1 flex-wrap" dir="ltr">
            <span className="text-xs text-slate-400 mr-1">Speed:</span>
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition ${
                  speed === s
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
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

// ── main page ─────────────────────────────────────────────────────────────────

const SharedReportPage: React.FC<{ reportId: string }> = ({ reportId }) => {
  const [report, setReport] = useState<{ student_name: string; report_data: SharedReportData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getSharedReport(reportId).then(r => {
      if (!r) setNotFound(true);
      else setReport(r);
      setLoading(false);
    });
  }, [reportId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <p className="text-slate-500">Loading report…</p>
        </div>
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow p-8 text-center max-w-sm w-full">
          <Logo />
          <h1 className="mt-6 text-xl font-bold text-slate-800">Report not found</h1>
          <p className="mt-2 text-slate-500 text-sm">This link may have expired or been removed by the teacher.</p>
        </div>
      </div>
    );
  }

  const { student_name, report_data } = report;
  const { mistakes, verses, generatedAt } = report_data;

  // Group verses by surah
  const versesBySurah: Record<number, Array<{ verse_key: string; text_uthmani: string }>> = {};
  verses.forEach(v => {
    const surahNum = Number(v.verse_key.split(':')[0]);
    if (!versesBySurah[surahNum]) versesBySurah[surahNum] = [];
    versesBySurah[surahNum].push(v);
  });

  const renderVerse = (verse: { verse_key: string; text_uthmani: string }) => {
    const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
    const words = verse.text_uthmani.replace(/ْ/g, 'ۡ').split(' ');

    return words.map((word, wi) => {
      const wordKey = `${surahNum}:${ayahNum}:${wi}`;
      const wordMistake = mistakes[wordKey];
      const letters = parseWordIntoLetters(word);

      const hasLetterAnnotations = letters.some(({ index: li }) => {
        const lk = `${surahNum}:${ayahNum}:${wi}:${li}`;
        return mistakes[lk]?.errorText;
      });

      if (!hasLetterAnnotations) {
        return (
          <React.Fragment key={wordKey}>
            <span className={`px-1 rounded-md ${wordMistake ? getMistakeBg(wordMistake.level) : ''}`}>
              {word}
            </span>{' '}
          </React.Fragment>
        );
      }

      return (
        <span key={wordKey} className="relative inline whitespace-nowrap" style={{ fontFamily: 'inherit' }}>
          {letters.map(({ letter, index: li }) => {
            const lk = `${surahNum}:${ayahNum}:${wi}:${li}`;
            const lm = mistakes[lk];
            const letterBg = lm?.errorText
              ? lm.errorType === 'tajweed'
                ? 'bg-green-100'
                : 'bg-red-100'
              : '';
            return (
              <span key={lk} className="relative inline-block align-top" style={{ fontFamily: 'inherit' }}>
                {lm?.errorText && (
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-10 pointer-events-none">
                    <span className={`block px-2 py-0.5 text-xs rounded shadow whitespace-nowrap font-medium ${
                      lm.errorType === 'tajweed'
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}>
                      {lm.errorText}
                    </span>
                  </span>
                )}
                <span className={`inline rounded ${letterBg}`} style={{ fontFamily: 'inherit' }}>
                  {letter}
                </span>
              </span>
            );
          })}
          {' '}
        </span>
      );
    });
  };

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40" dir="ltr">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Logo />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-800">Mistakes Review</h1>
            <p className="text-sm text-slate-500">{student_name}</p>
          </div>
          <div className="text-xs text-slate-400 text-right">
            <p>Generated</p>
            <p>{new Date(generatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-8">
        {/* Info banner */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800" dir="ltr">
          <p className="font-semibold mb-1">📖 How to use this review</p>
          <p>The highlighted words and letters below contain the mistakes from your lesson. Click <strong>▶ Play</strong> on any verse to listen to the correct recitation by Sheikh Al-Minshawi.</p>
        </div>

        {Object.entries(versesBySurah).map(([surahNum, surahVerses]) => {
          const surahInfo = QURAN_METADATA.find(s => s.number === Number(surahNum));
          return (
            <div key={surahNum} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {/* Surah header */}
              <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-3" dir="ltr">
                <h2 className="text-white font-bold text-lg">
                  {surahInfo?.number}. {surahInfo?.name}
                  <span className="font-normal text-teal-100 text-base ml-2">({surahInfo?.transliteratedName})</span>
                </h2>
              </div>

              <div className="divide-y divide-slate-100">
                {surahVerses.map(verse => {
                  const [s, a] = verse.verse_key.split(':').map(Number);
                  return (
                    <div key={verse.verse_key} className="p-6">
                      {/* Verse text — RTL, Quranic font */}
                      <div
                        className="font-quranic text-slate-900 text-3xl leading-[3.2] text-center select-none"
                        dir="rtl"
                      >
                        {renderVerse(verse)}
                        {/* Verse number badge */}
                        <span className="inline-flex items-center justify-center w-10 h-10 mx-1 font-mono text-sm font-bold text-slate-600 relative" style={{ verticalAlign: 'middle' }}>
                          <svg className="absolute inset-0 w-full h-full text-slate-200" viewBox="0 0 100 100" fill="currentColor">
                            <path d="M50,4 C24.6,4 4,24.6 4,50 C4,75.4 24.6,96 50,96 C75.4,96 96,75.4 96,50 C96,24.6 75.4,4 50,4 Z M50,10 C72.1,10 90,27.9 90,50 C90,72.1 72.1,90 50,90 C27.9,90 10,72.1 10,50 C10,27.9 27.9,10 50,10 Z" />
                            <path d="M50,16 C49.2,21.8 45.8,25.2 40,26 C34.2,26.8 30.8,30.2 30,36 C29.2,41.8 32.2,45.8 38,48 C43.8,50.2 48.2,53.2 50,60 C51.8,53.2 56.2,50.2 62,48 C67.8,45.8 70.8,41.8 70,36 C69.2,30.2 65.8,26.8 60,26 C54.2,25.2 50.8,21.8 50,16 Z" />
                          </svg>
                          <span className="relative z-10">{toEasternArabicNumerals(a)}</span>
                        </span>
                      </div>

                      {/* Audio player */}
                      <div dir="ltr">
                        <VerseAudioPlayer surah={s} ayah={a} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <footer className="text-center text-xs text-slate-400 pb-8" dir="ltr">
          <p>Generated by TrackQuran · {new Date(generatedAt).toLocaleString()}</p>
        </footer>
      </main>
    </div>
  );
};

export default SharedReportPage;
