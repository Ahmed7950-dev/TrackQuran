import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSharedReport, SharedReportData, recordVersePlay } from '../services/dataService';
import { supabase } from '../lib/supabase';
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

// Global ayah number required by cdn.islamic.network
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

const audioUrl = (surah: number, ayah: number) =>
  `https://cdn.islamic.network/quran/audio/128/ar.minshawi/${toGlobalAyah(surah, ayah)}.mp3`;

// Quranic fonts (same list as main app)
const QURANIC_FONTS = [
  { name: 'Hafs', displayName: 'Hafs' },
  { name: 'Amiri Regular', displayName: 'Amiri Regular' },
  { name: 'Elgharib KFGQPCHafs V10', displayName: 'Elgharib KFGQPCHafs V10' },
  { name: 'Elgharib HAFSTharwatEmara', displayName: 'Elgharib HAFSTharwatEmara' },
  { name: 'UthmanTN v2-0', displayName: 'UthmanTN v2-0' },
  { name: 'Uthmanic HAFS v22', displayName: 'Uthmanic HAFS v22' },
] as const;

// ── VerseAudioPlayer ──────────────────────────────────────────────────────────

const VerseAudioPlayer: React.FC<{ surah: number; ayah: number; onPlay?: () => void }> = ({ surah, ayah, onPlay }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

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
      audio.play().then(() => { setPlaying(true); onPlay?.(); }).catch(() => setError(true));
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
              <span className="text-xs text-slate-500 w-16 text-right flex-shrink-0">
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
                  speed === s ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
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

// ── MistakesTab ───────────────────────────────────────────────────────────────

const MistakesTab: React.FC<{
  report: { student_name: string; report_data: SharedReportData };
  reportId: string;
  quranicFont: string;
  handleVersePlay: (verseKey: string) => void;
}> = ({ report, reportId, quranicFont, handleVersePlay }) => {
  const { student_name, report_data } = report;
  const { mistakes, verses, generatedAt } = report_data;

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

      const annotations: Array<{ label: string; type: string }> = [];
      letters.forEach(({ index: li }) => {
        const lm = mistakes[`${surahNum}:${ayahNum}:${wi}:${li}`];
        if (lm?.errorText) annotations.push({ label: lm.errorText, type: lm.errorType ?? 'tajweed' });
      });

      return (
        <React.Fragment key={wordKey}>
          <span style={{ display: 'inline', fontFamily: 'inherit', position: 'relative', whiteSpace: 'nowrap' }}>
            {letters.map(({ letter, index: li }) => {
              const lk = `${surahNum}:${ayahNum}:${wi}:${li}`;
              const lm = mistakes[lk];
              const letterBg = lm?.errorText
                ? lm.errorType === 'tajweed' ? 'bg-green-200' : 'bg-red-200'
                : lm ? getMistakeBg(lm.level) : '';
              return (
                <span key={lk} className={`rounded ${letterBg}`} style={{ display: 'inline', fontFamily: 'inherit' }}>
                  {letter}
                </span>
              );
            })}
          </span>
          {annotations.length > 0 && (
            <span style={{ display: 'inline-flex', gap: '4px', verticalAlign: 'super', fontSize: '0.6em', marginRight: '2px' }}>
              {annotations.map((a, i) => (
                <span
                  key={i}
                  className={`px-1 py-0.5 rounded font-sans font-medium whitespace-nowrap ${
                    a.type === 'tajweed'
                      ? 'bg-green-100 text-green-800 border border-green-300'
                      : 'bg-red-100 text-red-800 border border-red-300'
                  }`}
                  style={{ fontFamily: 'sans-serif', lineHeight: 1.3 }}
                >
                  {a.label}
                </span>
              ))}
            </span>
          )}
          {' '}
        </React.Fragment>
      );
    });
  };

  if (verses.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p className="text-4xl mb-3">📖</p>
        <p>No mistakes recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800" dir="ltr">
        <p className="font-semibold mb-1">📖 How to use this review</p>
        <p>Highlighted words and letters are the mistakes from your lesson. Click <strong>▶ Play</strong> on any verse to hear the correct recitation by Sheikh Al-Minshawi.</p>
      </div>

      {Object.entries(versesBySurah).map(([surahNum, surahVerses]) => {
        const surahInfo = QURAN_METADATA.find(s => s.number === Number(surahNum));
        return (
          <div key={surahNum} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-4 sm:px-6 py-3" dir="ltr">
              <h2 className="text-white font-bold text-base sm:text-lg">
                {surahInfo?.number}. {surahInfo?.name}
                <span className="font-normal text-teal-100 text-sm sm:text-base ml-2">({surahInfo?.transliteratedName})</span>
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {surahVerses.map(verse => {
                const [s, a] = verse.verse_key.split(':').map(Number);
                return (
                  <div key={verse.verse_key} className="p-4 sm:p-6">
                    <div
                      className="text-slate-900 text-2xl sm:text-3xl leading-[3] sm:leading-[3.2] text-center select-none"
                      style={{ fontFamily: quranicFont }}
                      dir="rtl"
                    >
                      {renderVerse(verse)}
                      <span className="inline-flex items-center justify-center w-9 h-9 mx-1 font-mono text-sm font-bold text-slate-600 relative" style={{ verticalAlign: 'middle' }}>
                        <svg className="absolute inset-0 w-full h-full text-slate-200" viewBox="0 0 100 100" fill="currentColor">
                          <path d="M50,4 C24.6,4 4,24.6 4,50 C4,75.4 24.6,96 50,96 C75.4,96 96,75.4 96,50 C96,24.6 75.4,4 50,4 Z M50,10 C72.1,10 90,27.9 90,50 C90,72.1 72.1,90 50,90 C27.9,90 10,72.1 10,50 C10,27.9 27.9,10 50,10 Z" />
                          <path d="M50,16 C49.2,21.8 45.8,25.2 40,26 C34.2,26.8 30.8,30.2 30,36 C29.2,41.8 32.2,45.8 38,48 C43.8,50.2 48.2,53.2 50,60 C51.8,53.2 56.2,50.2 62,48 C67.8,45.8 70.8,41.8 70,36 C69.2,30.2 65.8,26.8 60,26 C54.2,25.2 50.8,21.8 50,16 Z" />
                        </svg>
                        <span className="relative z-10">{toEasternArabicNumerals(a)}</span>
                      </span>
                    </div>
                    <div dir="ltr">
                      <VerseAudioPlayer surah={s} ayah={a} onPlay={() => handleVersePlay(`${s}:${a}`)} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── ProgressTab ───────────────────────────────────────────────────────────────

const ProgressTab: React.FC<{
  studentName: string;
  progress: NonNullable<SharedReportData['studentProgress']>;
}> = ({ studentName, progress }) => {
  const { recitationAchievements, memorizationAchievements, attendance, masteredTajweedRules } = progress;

  // Compute stats
  const totalRecitationPages = recitationAchievements.reduce((s, a) => s + (a.pagesCompleted || 0), 0);
  const totalMemorizationPages = memorizationAchievements.reduce((s, a) => s + (a.pagesCompleted || 0), 0);
  const totalPoints = recitationAchievements.reduce((s, a) => s + (a.pointsEarned || 0), 0);
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : null;

  const avgReadingQuality = recitationAchievements.length > 0
    ? (recitationAchievements.reduce((s, a) => s + (a.readingQuality || 0), 0) / recitationAchievements.length).toFixed(1)
    : null;

  const avgMemQuality = memorizationAchievements.length > 0
    ? (memorizationAchievements.reduce((s, a) => s + (a.memorizationQuality || 0), 0) / memorizationAchievements.length).toFixed(1)
    : null;

  // Recent sessions (last 5)
  const recentRecitation = [...recitationAchievements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
  const recentMemorization = [...memorizationAchievements]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const surahName = (num: number) => QURAN_METADATA.find(s => s.number === num)?.transliteratedName ?? `Surah ${num}`;

  const qualityColor = (q: number) => {
    if (q >= 9) return 'text-green-600';
    if (q >= 7) return 'text-teal-600';
    if (q >= 5) return 'text-yellow-600';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-teal-600">{totalRecitationPages}</p>
          <p className="text-xs text-slate-500 mt-1">Pages Recited</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-purple-600">{totalMemorizationPages}</p>
          <p className="text-xs text-slate-500 mt-1">Pages Memorized</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-orange-500">{attendanceRate !== null ? `${attendanceRate}%` : '—'}</p>
          <p className="text-xs text-slate-500 mt-1">Attendance</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-yellow-500">{totalPoints.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1">Points Earned</p>
        </div>
      </div>

      {/* Quality averages */}
      {(avgReadingQuality || avgMemQuality) && (
        <div className="grid grid-cols-2 gap-3">
          {avgReadingQuality && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">Avg. Reading Quality</p>
              <p className={`text-xl font-bold ${qualityColor(Number(avgReadingQuality))}`}>{avgReadingQuality} / 10</p>
            </div>
          )}
          {avgMemQuality && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">Avg. Memorization Quality</p>
              <p className={`text-xl font-bold ${qualityColor(Number(avgMemQuality))}`}>{avgMemQuality} / 10</p>
            </div>
          )}
        </div>
      )}

      {/* Recent Recitation Sessions */}
      {recentRecitation.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <span className="text-teal-600">📖</span>
            <h3 className="font-semibold text-slate-800 text-sm">Recent Recitation Sessions</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {recentRecitation.map(ach => (
              <div key={ach.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {surahName(ach.startSurah)} {ach.startSurah !== ach.endSurah ? `→ ${surahName(ach.endSurah)}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(ach.date).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-slate-400">Pages</p>
                    <p className="text-sm font-semibold text-slate-700">{ach.pagesCompleted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Quality</p>
                    <p className={`text-sm font-semibold ${qualityColor(ach.readingQuality)}`}>{ach.readingQuality}/10</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Memorization Sessions */}
      {recentMemorization.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <span className="text-purple-600">🧠</span>
            <h3 className="font-semibold text-slate-800 text-sm">Recent Memorization Sessions</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {recentMemorization.map(ach => (
              <div key={ach.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {surahName(ach.startSurah)} {ach.startSurah !== ach.endSurah ? `→ ${surahName(ach.endSurah)}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">{new Date(ach.date).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-slate-400">Pages</p>
                    <p className="text-sm font-semibold text-slate-700">{ach.pagesCompleted}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Quality</p>
                    <p className={`text-sm font-semibold ${qualityColor(ach.memorizationQuality)}`}>{ach.memorizationQuality}/10</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mastered Tajweed Rules */}
      {masteredTajweedRules.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
            <span className="text-green-600">✅</span> Mastered Tajweed Rules
          </h3>
          <div className="flex flex-wrap gap-2">
            {masteredTajweedRules.map((rule, i) => (
              <span
                key={i}
                className="px-3 py-1 bg-green-50 text-green-800 border border-green-200 rounded-full text-xs font-medium"
              >
                {rule}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Attendance history (recent 20) */}
      {attendance.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
            <span>📅</span> Attendance
            <span className="text-xs text-slate-400 font-normal">({presentCount} present / {attendance.length} sessions)</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {[...attendance]
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .slice(0, 30)
              .map((rec, i) => (
                <div
                  key={i}
                  title={`${new Date(rec.date).toLocaleDateString()} — ${rec.status}`}
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                    rec.status === 'present'
                      ? 'bg-teal-100 text-teal-700'
                      : rec.status === 'excused'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-600'
                  }`}
                >
                  {rec.status === 'present' ? '✓' : rec.status === 'excused' ? '~' : '✗'}
                </div>
              ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Showing last 30 sessions. Green = present, yellow = excused, red = absent.</p>
        </div>
      )}

      {/* Empty state */}
      {recitationAchievements.length === 0 && memorizationAchievements.length === 0 && masteredTajweedRules.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-3">📊</p>
          <p>No progress data available yet.</p>
        </div>
      )}
    </div>
  );
};

// ── main page ─────────────────────────────────────────────────────────────────

const SharedReportPage: React.FC<{ reportId: string }> = ({ reportId }) => {
  const [report, setReport] = useState<{ student_name: string; report_data: SharedReportData } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'mistakes' | 'progress'>('mistakes');
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [quranicFont, setQuranicFont] = useState<string>(() =>
    localStorage.getItem('quranicFont') || 'Hafs'
  );
  const channelRef = useRef<any>(null);

  // Persist font choice
  useEffect(() => {
    document.documentElement.style.setProperty('--quranic-font', quranicFont);
    localStorage.setItem('quranicFont', quranicFont);
  }, [quranicFont]);

  // Close font menu on outside click
  useEffect(() => {
    if (!isFontMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('.sr-font-btn') && !t.closest('.sr-font-menu')) setIsFontMenuOpen(false);
    };
    const tid = setTimeout(() => document.addEventListener('click', handler, true), 0);
    return () => { clearTimeout(tid); document.removeEventListener('click', handler, true); };
  }, [isFontMenuOpen]);

  useEffect(() => {
    getSharedReport(reportId).then(r => {
      if (!r) setNotFound(true);
      else setReport(r);
      setLoading(false);
    });

    const ch = supabase.channel(`report-plays-${reportId}`);
    ch.subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [reportId]);

  const handleVersePlay = useCallback(async (verseKey: string) => {
    await recordVersePlay(reportId, verseKey);
    channelRef.current?.send({ type: 'broadcast', event: 'play', payload: { verse_key: verseKey } });
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
  const { generatedAt, studentProgress } = report_data;
  const hasProgress = !!studentProgress;

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40" dir="ltr">
        <div className="container mx-auto px-3 sm:px-4 py-3 flex items-center gap-2 sm:gap-4">
          <Logo />
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">
              {activeTab === 'mistakes' ? 'Mistakes Review' : 'My Progress'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 truncate">{student_name}</p>
          </div>

          {/* Quranic font selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setIsFontMenuOpen(o => !o)}
              className="sr-font-btn p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
              aria-label="Select Quranic font"
            >
              <span style={{ fontFamily: 'Amiri Regular', fontSize: '1.25rem' }}>ع</span>
            </button>
            {isFontMenuOpen && (
              <div className="sr-font-menu absolute end-0 mt-2 w-52 sm:w-64 bg-white rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                <div className="py-1">
                  <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Quranic Font</div>
                  {QURANIC_FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => { setQuranicFont(f.name); setIsFontMenuOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                        quranicFont === f.name
                          ? 'bg-teal-50 text-teal-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span style={{ fontFamily: f.name }}>{f.displayName}</span>
                      {quranicFont === f.name && (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 flex-shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 text-right flex-shrink-0 hidden sm:block">
            <p>Updated</p>
            <p>{new Date(generatedAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-t border-slate-100" dir="ltr">
          <div className="container mx-auto px-3 sm:px-4 flex">
            <button
              onClick={() => setActiveTab('mistakes')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'mistakes'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              Mistakes Review
            </button>
            <button
              onClick={() => setActiveTab('progress')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'progress'
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              } ${!hasProgress ? 'opacity-40 cursor-not-allowed' : ''}`}
              disabled={!hasProgress}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
              My Progress
              {!hasProgress && <span className="text-xs">(share once to unlock)</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-6 max-w-3xl" dir="ltr">
        {activeTab === 'mistakes' && (
          <MistakesTab
            report={report}
            reportId={reportId}
            quranicFont={quranicFont}
            handleVersePlay={handleVersePlay}
          />
        )}
        {activeTab === 'progress' && hasProgress && (
          <ProgressTab
            studentName={student_name}
            progress={studentProgress!}
          />
        )}

        <footer className="text-center text-xs text-slate-400 py-8">
          <p>Generated by Lisan &amp; Quran · {new Date(generatedAt).toLocaleString()}</p>
        </footer>
      </main>
    </div>
  );
};

export default SharedReportPage;
