import React, { useState, useEffect, useRef, useCallback, useMemo, Fragment } from 'react';
import { getSharedReport, SharedReportData, recordVersePlay, getPageOfAyah, getReportPlays } from '../services/dataService';
import type { QuranHomework } from '../types';
import { supabase } from '../lib/supabase';
import { QURAN_METADATA, MILESTONES, TOTAL_QURAN_PAGES } from '../constants';
import Logo from './Logo';
import StudentDetailPage from './StudentDetailPage';
import AboutUsPage from './AboutUsPage';
import type { Student, AttendanceRecord, Progress, Mistake } from '../types';
import CalendarPage from './CalendarPage';
import { getStoredToken } from '../services/googleCalendarService';
import { getTeacherAvailability, AvailabilitySlot } from '../services/availabilityService';
import NotificationCenter from './NotificationCenter';
import TajweedPage from './TajweedPage';
import QaedahPage from './QaedahPage';
import AlphabetTrainerPage from './AlphabetTrainerPage';
import LettersTrainerPage from './LettersTrainerPage';
import StudentProgressPage from './StudentProgressPage';
import VerseAudioPlayer from './VerseAudioPlayer';

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

/** Returns the timestamp of the most recent mistake logged for a given verse key. */
const getVerseNewestTime = (verseKey: string, mistakes: Record<string, any>): number => {
  const [s, a] = verseKey.split(':');
  const prefix = `${s}:${a}:`;
  let max = 0;
  for (const [key, m] of Object.entries(mistakes)) {
    if (key.startsWith(prefix) && m?.date) {
      const t = new Date(m.date).getTime();
      if (!isNaN(t) && t > max) max = t;
    }
  }
  return max;
};

/**
 * Wraps U+06DF (ARABIC SMALL HIGH ROUNDED ZERO — the silent-letter marker used
 * in the Madinah Mushaf) in a span with 'Amiri Regular' so it renders as a
 * proper small circle instead of a generic glyph in Quranic fonts.
 */
const U06DF = '۟';
const processTextWithU06DF = (text: string): React.ReactNode => {
  if (!text.includes(U06DF)) return text;
  const parts: React.ReactNode[] = [];
  let current = '';
  let idx = 0;
  for (const ch of text) {
    if (ch === U06DF) {
      if (current) { parts.push(<span key={`t${idx++}`}>{current}</span>); current = ''; }
      parts.push(<span key={`d${idx++}`} style={{ fontFamily: 'Amiri Regular' }}>{ch}</span>);
    } else {
      current += ch;
    }
  }
  if (current) parts.push(<span key={`t${idx}`}>{current}</span>);
  return <>{parts}</>;
};

// Quranic fonts (same list as main app)
const QURANIC_FONTS = [
  { name: 'Hafs', displayName: 'Hafs' },
  { name: 'Amiri Regular', displayName: 'Amiri Regular' },
  { name: 'Elgharib KFGQPCHafs V10', displayName: 'Elgharib KFGQPCHafs V10' },
  { name: 'Elgharib HAFSTharwatEmara', displayName: 'Elgharib HAFSTharwatEmara' },
  { name: 'UthmanTN v2-0', displayName: 'UthmanTN v2-0' },
  { name: 'Uthmanic HAFS v22', displayName: 'Uthmanic HAFS v22' },
] as const;

// ── MistakesTab ───────────────────────────────────────────────────────────────

const MistakesTab: React.FC<{
  report: { student_name: string; report_data: SharedReportData };
  reportId: string;
  quranicFont: string;
  handleVersePlay: (verseKey: string) => void;
  versePlays: { [verseKey: string]: number };
}> = ({ report, reportId, quranicFont, handleVersePlay, versePlays }) => {
  const { student_name, report_data } = report;
  const { mistakes, verses, generatedAt, homeworkVerses = [] } = report_data;

  // Sort all verses newest-first before grouping
  const sortedVerses = [...verses].sort(
    (a, b) => getVerseNewestTime(b.verse_key, mistakes) - getVerseNewestTime(a.verse_key, mistakes)
  );

  const versesBySurah: Record<number, Array<{ verse_key: string; text_uthmani: string }>> = {};
  sortedVerses.forEach(v => {
    const surahNum = Number(v.verse_key.split(':')[0]);
    if (!versesBySurah[surahNum]) versesBySurah[surahNum] = [];
    versesBySurah[surahNum].push(v);
  });

  const renderVerse = (verse: { verse_key: string; text_uthmani: string }) => {
    const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
    // Replace standard sukun (U+0652) with Quranic small rounded zero (U+06E1)
    // so it renders correctly in all Quranic fonts (same fix as MistakesReviewPage).
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
              {/* processTextWithU06DF ensures the silent-letter marker renders as a proper circle */}
              {processTextWithU06DF(word)}
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
                  {/* Apply per-character U+06DF font switch inside letter spans too */}
                  {processTextWithU06DF(letter)}
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

  // Set of homework verse keys for O(1) lookup
  const homeworkSet = new Set(homeworkVerses);
  const homeworkCount = homeworkVerses.length;
  const homeworkDoneCount = homeworkVerses.filter(vk => (versePlays[vk] ?? 0) >= 3).length;

  return (
    <div className="space-y-6">

      {/* Homework summary banner — only when homework is assigned */}
      {homeworkCount > 0 && (
        <div className={`rounded-xl p-4 flex items-start gap-3 border ${
          homeworkDoneCount === homeworkCount
            ? 'bg-green-50 border-green-200'
            : 'bg-amber-50 border-amber-200'
        }`} dir="ltr">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-5 h-5 mt-0.5 flex-shrink-0 ${homeworkDoneCount === homeworkCount ? 'text-green-600' : 'text-amber-600'}`}>
            <path fillRule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.346 3 4.445V19.5l7-3.111 7 3.111V4.445c0-1.1-.806-1.994-1.93-2.135A48.17 48.17 0 0 0 10 2Z" clipRule="evenodd" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${homeworkDoneCount === homeworkCount ? 'text-green-800' : 'text-amber-800'}`}>
              {homeworkDoneCount === homeworkCount
                ? '✓ All homework complete — great work!'
                : `📌 Homework — ${homeworkCount} verse${homeworkCount !== 1 ? 's' : ''} assigned`}
            </p>
            <p className={`text-xs mt-0.5 ${homeworkDoneCount === homeworkCount ? 'text-green-700' : 'text-amber-700'}`}>
              {homeworkDoneCount === homeworkCount
                ? `You listened to all ${homeworkCount} verses 3 times each.`
                : `Listen to each marked verse 3 times to complete your homework. (${homeworkDoneCount}/${homeworkCount} done)`}
            </p>
          </div>
        </div>
      )}

      {/* Info banner */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-800" dir="ltr">
        <p className="font-semibold mb-1">📖 How to use this review</p>
        <p>Highlighted words and letters are the mistakes from your lesson. Click <strong>▶ Play</strong> on any verse to hear the correct recitation by Sheikh Al-Minshawi.</p>
      </div>

      {Object.entries(versesBySurah)
        // Sort surah groups so the one with the most recent mistake appears first
        .sort(([, vA], [, vB]) => {
          const newest = (vv: Array<{ verse_key: string }>) =>
            Math.max(0, ...vv.map(v => getVerseNewestTime(v.verse_key, mistakes)));
          return newest(vB) - newest(vA);
        })
        .map(([surahNum, surahVerses]) => {
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
                const isHomework = homeworkSet.has(verse.verse_key);
                const playCount = versePlays[verse.verse_key] ?? 0;
                const homeworkDone = isHomework && playCount >= 3;
                return (
                  <div
                    key={verse.verse_key}
                    className={`p-4 sm:p-6 transition-colors ${
                      isHomework
                        ? homeworkDone
                          ? 'border-l-4 border-green-400 bg-green-50/30'
                          : 'border-l-4 border-amber-400 bg-amber-50/40'
                        : ''
                    }`}
                  >
                    {/* Homework badge + progress dots */}
                    {isHomework && (
                      <div className="flex items-center gap-3 mb-3" dir="ltr">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                          homeworkDone
                            ? 'bg-green-100 text-green-700 border-green-300'
                            : 'bg-amber-100 text-amber-700 border-amber-300'
                        }`}>
                          {homeworkDone
                            ? (<>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
                                Homework Complete
                              </>)
                            : '📌 Homework'
                          }
                        </span>
                        {!homeworkDone && (
                          <div className="flex items-center gap-1.5">
                            {[0, 1, 2].map(i => (
                              <span
                                key={i}
                                className={`w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                                  i < playCount
                                    ? 'bg-amber-500 border-amber-500'
                                    : 'border-slate-300 bg-white'
                                }`}
                              />
                            ))}
                            <span className="text-xs text-slate-500 font-medium">{Math.min(playCount, 3)}/3</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div
                      className="text-slate-900 text-center select-none"
                      style={{ fontFamily: quranicFont, fontSize: '4rem', lineHeight: '7rem' }}
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
                      <VerseAudioPlayer surah={s} ayah={a} onEnded={() => handleVersePlay(`${s}:${a}`)} />
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
  const {
    recitationAchievements,
    memorizationAchievements,
    attendance,
    masteredTajweedRules,
    tafsirReviews = [],
    tafsirMemorizationReviews = [],
    tajweedCompletions = [],
  } = progress;

  const [quranBarView, setQuranBarView] = useState<'reading' | 'memorization'>('reading');
  const [milestoneView, setMilestoneView] = useState<'reading' | 'memorization'>('reading');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showAllRecitation, setShowAllRecitation] = useState(false);
  const [showAllMemorization, setShowAllMemorization] = useState(false);

  // ── Compute page sets ────────────────────────────────────────────────────────
  const recitedPages = useMemo(() => {
    const s = new Set<number>();
    recitationAchievements.forEach(ach => {
      const sp = getPageOfAyah(ach.startSurah, ach.startAyah);
      const ep = getPageOfAyah(ach.endSurah, ach.endAyah);
      if (sp > 0 && ep > 0) for (let i = sp; i <= ep; i++) s.add(i);
    });
    return s;
  }, [recitationAchievements]);

  const memorizedPages = useMemo(() => {
    const s = new Set<number>();
    memorizationAchievements.forEach(ach => {
      const sp = getPageOfAyah(ach.startSurah, ach.startAyah);
      const ep = getPageOfAyah(ach.endSurah, ach.endAyah);
      if (sp > 0 && ep > 0) for (let i = sp; i <= ep; i++) s.add(i);
    });
    return s;
  }, [memorizationAchievements]);

  // ── Surah quality maps for progress bar ─────────────────────────────────────
  const getSurahQualityMap = (achievements: Array<any>, qualityKey: string): Record<number, number> => {
    const map: Record<number, { total: number; count: number }> = {};
    achievements.forEach(ach => {
      for (let i = ach.startSurah; i <= ach.endSurah; i++) {
        if (!map[i]) map[i] = { total: 0, count: 0 };
        map[i].total += ach[qualityKey] || 0;
        map[i].count += 1;
      }
    });
    const avg: Record<number, number> = {};
    for (const k in map) avg[k] = map[k].total / map[k].count;
    return avg;
  };

  const recitedSurahsQuality = useMemo(() => getSurahQualityMap(recitationAchievements, 'readingQuality'), [recitationAchievements]);
  const memorizedSurahsQuality = useMemo(() => getSurahQualityMap(memorizationAchievements, 'memorizationQuality'), [memorizationAchievements]);

  // ── Attendance ───────────────────────────────────────────────────────────────
  const attendanceData = useMemo(() => ({
    present: attendance.filter(a => a.status === 'present').length,
    absent: attendance.filter(a => a.status === 'absent').length,
    rescheduled: attendance.filter(a => a.status === 'rescheduled').length,
  }), [attendance]);

  // ── Reading data ─────────────────────────────────────────────────────────────
  const readingData = useMemo(() => {
    const totalPages = recitedPages.size;
    const pagesRemaining = TOTAL_QURAN_PAGES - totalPages;
    const avgQuality = recitationAchievements.length > 0
      ? recitationAchievements.reduce((s, a) => s + (a.readingQuality || 0), 0) / recitationAchievements.length
      : 0;
    const sorted = [...recitationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const last = sorted[0];
    const lastAchievementText = last
      ? `${QURAN_METADATA.find(s => s.number === last.endSurah)?.name || ''} ${last.endAyah}`
      : '—';
    const tafsirBySurah = tafsirReviews.reduce((acc, r) => {
      if (!acc[r.surah]) acc[r.surah] = [];
      acc[r.surah].push(r.reviewQuality);
      return acc;
    }, {} as Record<number, number[]>);
    return { totalPages, pagesRemaining, avgQuality, lastAchievementText, tafsirBySurah, sorted };
  }, [recitedPages, recitationAchievements, tafsirReviews]);

  // ── Memorization data ────────────────────────────────────────────────────────
  const memorizationData = useMemo(() => {
    const totalPages = memorizedPages.size;
    const pagesRemaining = TOTAL_QURAN_PAGES - totalPages;
    const avgQuality = memorizationAchievements.length > 0
      ? memorizationAchievements.reduce((s, a) => s + (a.memorizationQuality || 0), 0) / memorizationAchievements.length
      : 0;
    const sorted = [...memorizationAchievements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const last = sorted[0];
    const lastAchievementText = last
      ? `${QURAN_METADATA.find(s => s.number === last.endSurah)?.name || ''} ${last.endAyah}`
      : '—';
    // Combine initial memorization + explicit recall reviews
    const allReviews: { surah: number; quality: number }[] = [];
    memorizationAchievements.forEach(ach => {
      for (let i = ach.startSurah; i <= ach.endSurah; i++) {
        allReviews.push({ surah: i, quality: ach.memorizationQuality });
      }
    });
    tafsirMemorizationReviews.forEach(r => {
      allReviews.push({ surah: r.surah, quality: r.reviewQuality });
    });
    const tafsirBySurah = allReviews.reduce((acc, r) => {
      if (!acc[r.surah]) acc[r.surah] = [];
      acc[r.surah].push(r.quality);
      return acc;
    }, {} as Record<number, number[]>);
    return { totalPages, pagesRemaining, avgQuality, lastAchievementText, tafsirBySurah, sorted };
  }, [memorizedPages, memorizationAchievements, tafsirMemorizationReviews]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const qualityColor = (q: number) => {
    if (q >= 9) return 'text-green-600';
    if (q >= 7) return 'text-teal-600';
    if (q >= 5) return 'text-yellow-600';
    return 'text-red-500';
  };
  const qualityBg = (q: number) => {
    if (q >= 8) return 'bg-green-500';
    if (q >= 5) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // ── Inner sub-components ─────────────────────────────────────────────────────

  // Simple Reading / Hifdh toggle
  const Toggle = ({ value, onChange }: {
    value: 'reading' | 'memorization';
    onChange: (v: 'reading' | 'memorization') => void;
  }) => (
    <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 flex-shrink-0">
      {(['reading', 'memorization'] as const).map(v => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all capitalize ${
            value === v ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {v === 'reading' ? 'Reading' : 'Hifdh'}
        </button>
      ))}
    </div>
  );

  // Stat card
  const StatCard = ({ title, value, subtext, colorClass = 'text-slate-800' }: {
    title: string; value: string | number; subtext?: string; colorClass?: string;
  }) => (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <p className="text-xs text-slate-500 mb-1 font-medium">{title}</p>
      <p className={`text-xl font-bold ${colorClass} truncate`}>{value}</p>
      {subtext && <p className="text-xs text-slate-400 mt-0.5">{subtext}</p>}
    </div>
  );

  // 114-surah Quran progress bar
  const ProgressSection = ({ qualityMap, pagesCompleted }: {
    qualityMap: Record<number, number>; pagesCompleted: number;
  }) => {
    const getQColor = (q: number) => {
      if (q > 9) return 'bg-orange-600'; if (q > 7) return 'bg-orange-500';
      if (q > 5) return 'bg-orange-400'; if (q > 3) return 'bg-orange-300';
      return 'bg-orange-200';
    };
    return (
      <>
        <div className="flex justify-end mb-2">
          <span className="text-sm font-bold text-teal-600">
            {((pagesCompleted / TOTAL_QURAN_PAGES) * 100).toFixed(1)}% Complete
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(114, minmax(0, 1fr))', minWidth: '600px' }}>
            {QURAN_METADATA.map(surah => {
              const quality = qualityMap[surah.number];
              const color = quality ? getQColor(quality) : 'bg-slate-200';
              return (
                <div key={surah.number} className="relative group first:rounded-s-sm last:rounded-e-sm">
                  <div className={`h-6 w-full ${color} transition-colors`} />
                  <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 left-1/2 -translate-x-1/2">
                    {surah.transliteratedName}
                    <svg className="absolute text-gray-800 h-2 w-full left-0 top-full" viewBox="0 0 255 255">
                      <polygon className="fill-current" points="0,0 127.5,127.5 255,0" />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 flex-wrap text-xs text-slate-500">
          <span className="font-medium">Quality:</span>
          {[
            { label: 'Excellent (9-10)', cls: 'bg-orange-600' },
            { label: 'Good (7-9)', cls: 'bg-orange-500' },
            { label: 'Average (5-7)', cls: 'bg-orange-400' },
            { label: 'Below avg (3-5)', cls: 'bg-orange-300' },
            { label: 'Needs work', cls: 'bg-orange-200' },
            { label: 'Not yet started', cls: 'bg-slate-200' },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1">
              <span className={`w-3 h-3 rounded-sm inline-block ${l.cls}`} />
              {l.label}
            </span>
          ))}
        </div>
      </>
    );
  };

  // Milestone journey
  const MilestoneSection = ({ completedPages }: { completedPages: Set<number> }) => (
    <div className="flex items-center overflow-x-auto py-2">
      {MILESTONES.map((milestone, index) => {
        const achieved = milestone.isAchieved(completedPages);
        const IconComponent = milestone.badgeIcon;
        return (
          <Fragment key={milestone.id}>
            <div className="relative flex flex-col items-center group w-20 flex-shrink-0">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 transition-all duration-300 ${
                achieved
                  ? 'bg-teal-500 border-teal-200 text-white'
                  : 'bg-slate-200 border-slate-300 text-slate-500'
              }`}>
                {achieved && typeof milestone.badgeIcon !== 'string' && milestone.id !== 'ya-seen' && milestone.id !== 'khatm'
                  ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )
                  : typeof IconComponent === 'string'
                    ? <span className="font-bold text-lg">{IconComponent}</span>
                    : IconComponent
                }
              </div>
              <p className={`text-center text-xs mt-2 font-semibold transition-colors ${achieved ? 'text-teal-600' : 'text-slate-400'}`}>
                {milestone.title}
              </p>
              <div className="absolute bottom-full mb-3 w-48 bg-slate-800 text-white text-xs rounded py-1.5 px-3 text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {milestone.description}
                <svg className="absolute text-slate-800 h-2 w-full left-0 top-full" viewBox="0 0 255 255">
                  <polygon className="fill-current" points="0,0 127.5,127.5 255,0" />
                </svg>
              </div>
            </div>
            {index < MILESTONES.length - 1 && (
              <div className={`flex-grow h-1 rounded ${achieved ? 'bg-teal-500' : 'bg-slate-300'}`} />
            )}
          </Fragment>
        );
      })}
    </div>
  );

  // Tafsir / recall reviews by surah
  const TafsirSection = ({ tafsirBySurah }: { tafsirBySurah: Record<number, number[]> }) => (
    Object.keys(tafsirBySurah).length > 0 ? (
      <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
        {Object.entries(tafsirBySurah).map(([surahNum, qualities]) => {
          const surah = QURAN_METADATA.find(s => s.number === +surahNum);
          if (!surah) return null;
          const avg = qualities.reduce((a, b) => a + b, 0) / qualities.length;
          return (
            <div key={surahNum}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-bold text-slate-800 text-sm">{surah.transliteratedName}</span>
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {qualities.length} review{qualities.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-indigo-600 font-bold">Avg: {avg.toFixed(1)}</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {qualities.map((q, i) => (
                  <div
                    key={i}
                    title={`Review ${i + 1}: ${q}/10`}
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm ${qualityBg(q)}`}
                  >
                    {q}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    ) : <p className="text-slate-400 italic text-sm">No reviews yet.</p>
  );

  // Attendance calendar
  const attendanceMap = new Map(attendance.map(a => [new Date(a.date).toDateString(), a.status]));
  const calMonth = calendarDate.getMonth();
  const calYear = calendarDate.getFullYear();
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calDays: React.ReactNode[] = Array.from({ length: calFirstDay }, (_, i) => (
    <div key={`e-${i}`} className="h-8 w-8" />
  ));
  for (let d = 1; d <= calDaysInMonth; d++) {
    const dateStr = new Date(calYear, calMonth, d).toDateString();
    const status = attendanceMap.get(dateStr);
    const isToday = dateStr === new Date().toDateString();
    const bg = status === 'present'
      ? 'bg-green-400 text-white'
      : status === 'absent'
        ? 'bg-red-400 text-white'
        : status === 'rescheduled'
          ? 'bg-orange-400 text-white'
          : 'bg-slate-100 text-slate-600';
    calDays.push(
      <div
        key={d}
        className={`h-8 w-8 flex items-center justify-center text-xs rounded-full ${bg} ${isToday ? 'ring-2 ring-teal-500' : ''}`}
      >
        {d}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Attendance ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <span>📅</span> Attendance
            <span className="text-xs text-slate-400 font-normal ml-1">
              ({attendanceData.present} present / {attendance.length} sessions)
            </span>
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard title="Present" value={attendanceData.present} subtext="days attended" colorClass="text-green-600" />
            <StatCard title="Absent" value={attendanceData.absent} subtext="days missed" colorClass="text-red-500" />
            <StatCard title="Rescheduled" value={attendanceData.rescheduled} colorClass="text-orange-500" />
          </div>
          {/* Calendar */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-3">
              <button
                onClick={() => setCalendarDate(new Date(calYear, calMonth - 1))}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-600 transition"
              >&lt;</button>
              <h4 className="font-semibold text-slate-700 text-sm">
                {calendarDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
              </h4>
              <button
                onClick={() => setCalendarDate(new Date(calYear, calMonth + 1))}
                className="p-1 rounded-full hover:bg-slate-200 text-slate-600 transition"
              >&gt;</button>
            </div>
            <div className="mx-auto w-max">
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-1">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <div key={i} className="h-8 w-8 flex items-center justify-center font-bold">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">{calDays}</div>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-400 inline-block" /> Present</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-400 inline-block" /> Rescheduled</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-400 inline-block" /> Absent</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Reading Progress ────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><span>📖</span> Reading Progress</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              title="Last Recitation"
              value={readingData.lastAchievementText}
            />
            <StatCard
              title="Pages Read"
              value={readingData.totalPages}
              subtext={`${readingData.pagesRemaining} pages to Khatm`}
              colorClass="text-teal-600"
            />
            <StatCard
              title="Avg. Reading Quality"
              value={readingData.avgQuality > 0 ? `${readingData.avgQuality.toFixed(1)} / 10` : '—'}
              colorClass={qualityColor(readingData.avgQuality)}
            />
          </div>
        </div>
      </div>

      {/* ── Memorization Progress ───────────────────────────────── */}
      {memorizationAchievements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2"><span>🧠</span> Memorization (Hifdh) Progress</h3>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                title="Pages Memorized"
                value={memorizationData.totalPages}
                subtext={`${memorizationData.pagesRemaining} pages to Khatm`}
                colorClass="text-purple-600"
              />
              <StatCard
                title="Avg. Memorization Quality"
                value={memorizationData.avgQuality > 0 ? `${memorizationData.avgQuality.toFixed(1)} / 10` : '—'}
                colorClass={qualityColor(memorizationData.avgQuality)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Quran Progress Bar ──────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800">Quran Progress</h3>
          <Toggle value={quranBarView} onChange={setQuranBarView} />
        </div>
        <ProgressSection
          qualityMap={quranBarView === 'reading' ? recitedSurahsQuality : memorizedSurahsQuality}
          pagesCompleted={quranBarView === 'reading' ? recitedPages.size : memorizedPages.size}
        />
      </div>

      {/* ── Milestone Journey ───────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-slate-800">Milestone Journey</h3>
          <Toggle value={milestoneView} onChange={setMilestoneView} />
        </div>
        <MilestoneSection completedPages={milestoneView === 'reading' ? recitedPages : memorizedPages} />
      </div>

      {/* ── Mastered Tajweed Rules ──────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <span>✅</span> Mastered Tajweed Rules
        </h3>
        {masteredTajweedRules.length > 0 ? (
          <ul className="space-y-2">
            {masteredTajweedRules.map((rule, i) => (
              <li key={i} className="flex items-center gap-2">
                <div className="bg-green-100 rounded-full p-1 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-slate-700 text-sm">{rule}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 italic text-sm">No tajweed rules mastered yet.</p>
        )}
      </div>

      {/* ── Tajweed Lessons Completed ─────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <span>🎓</span> Tajweed Lessons Completed
          <span className="text-xs font-normal text-slate-400 ml-1">({tajweedCompletions.length})</span>
        </h3>
        {tajweedCompletions.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {tajweedCompletions.map(c => (
              <li key={c.lessonId} className="py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="bg-green-100 rounded-full p-1 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-600">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-sm text-slate-700 truncate">{c.lessonTitle}</span>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">{formatDate(c.completedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-400 italic text-sm">No tajweed lessons completed yet.</p>
        )}
      </div>

      {/* ── Tafsir Reviews & Memorization Recall ───────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Tafsir Reviews</h3>
          <TafsirSection tafsirBySurah={readingData.tafsirBySurah} />
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Memorization Recall</h3>
          <TafsirSection tafsirBySurah={memorizationData.tafsirBySurah} />
        </div>
      </div>

      {/* ── All Recitation Sessions ─────────────────────────────── */}
      {recitationAchievements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <span className="text-teal-600">📖</span>
              Recitation Sessions
              <span className="text-xs text-slate-400 font-normal">({recitationAchievements.length} total)</span>
            </h3>
            {recitationAchievements.length > 5 && (
              <button
                onClick={() => setShowAllRecitation(s => !s)}
                className="text-xs text-teal-600 hover:underline flex-shrink-0"
              >
                {showAllRecitation ? 'Show less' : `Show all ${recitationAchievements.length}`}
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {readingData.sorted.slice(0, showAllRecitation ? undefined : 5).map(ach => (
              <div key={ach.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700" dir="rtl">
                    {QURAN_METADATA.find(s => s.number === ach.startSurah)?.name}
                    {ach.startAyah && ` (${ach.startAyah})`}
                    {ach.startSurah !== ach.endSurah && ` — ${QURAN_METADATA.find(s => s.number === ach.endSurah)?.name} (${ach.endAyah})`}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(ach.date)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Pages</p>
                    <p className="text-sm font-semibold text-slate-700">{ach.pagesCompleted}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Quality</p>
                    <p className={`text-sm font-bold ${qualityColor(ach.readingQuality)}`}>{ach.readingQuality}/10</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── All Memorization Sessions ───────────────────────────── */}
      {memorizationAchievements.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
              <span className="text-purple-600">🧠</span>
              Memorization Sessions
              <span className="text-xs text-slate-400 font-normal">({memorizationAchievements.length} total)</span>
            </h3>
            {memorizationAchievements.length > 5 && (
              <button
                onClick={() => setShowAllMemorization(s => !s)}
                className="text-xs text-purple-600 hover:underline flex-shrink-0"
              >
                {showAllMemorization ? 'Show less' : `Show all ${memorizationAchievements.length}`}
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-50">
            {memorizationData.sorted.slice(0, showAllMemorization ? undefined : 5).map(ach => (
              <div key={ach.id} className="px-4 py-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700" dir="rtl">
                    {QURAN_METADATA.find(s => s.number === ach.startSurah)?.name}
                    {ach.startAyah && ` (${ach.startAyah})`}
                    {ach.startSurah !== ach.endSurah && ` — ${QURAN_METADATA.find(s => s.number === ach.endSurah)?.name} (${ach.endAyah})`}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(ach.date)}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Pages</p>
                    <p className="text-sm font-semibold text-slate-700">{ach.pagesCompleted}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">Quality</p>
                    <p className={`text-sm font-bold ${qualityColor(ach.memorizationQuality)}`}>{ach.memorizationQuality}/10</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
  const backUrl = new URLSearchParams(window.location.search).get('from') ?? null;

  const [report, setReport] = useState<{ student_name: string; student_id: string; report_data: SharedReportData; teacher_id: string } | null>(null);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<'mistakes' | 'progress' | 'calendar' | 'quran' | 'tajweed' | 'qaedah' | 'alphabetTrainer' | 'lettersTrainer'>('quran');
  const [gcalToken, setGcalToken] = useState<string | null>(() => getStoredToken());
  const [portalTab, setPortalTab] = useState<'content' | 'about'>('content');
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [quranicFont, setQuranicFont] = useState<string>(() =>
    localStorage.getItem('quranicFont') || 'Hafs'
  );
  const [theme, setTheme] = useState<'light' | 'dark' | 'reading'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'reading') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [versePlays, setVersePlays] = useState<{ [verseKey: string]: number }>({});
  const [quranHomework, setQuranHomework] = useState<QuranHomework[]>([]);
  const [homeworkModal, setHomeworkModal] = useState<QuranHomework | null>(null);
  const channelRef = useRef<any>(null);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'reading') root.setAttribute('data-theme', 'reading');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'light' ? 'reading' : t === 'reading' ? 'dark' : 'light');
  };

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
      else {
        setReport(r);
        // Initialise font from teacher's saved preference stored in the report
        if (r.report_data.quranicFont) setQuranicFont(r.report_data.quranicFont);
        // Load homework assigned to this student
        if (r.report_data.quranHomework) setQuranHomework(r.report_data.quranHomework);
        // Load teacher's availability so student can see working hours
        if (r.teacher_id) getTeacherAvailability(r.teacher_id).then(setAvailabilitySlots);
      }
      setLoading(false);
    });

    // Load existing play counts from DB
    getReportPlays(reportId).then(plays => setVersePlays(plays));

    // Subscribe to real-time play broadcasts so the student's own counter updates live
    const ch = supabase.channel(`report-plays-${reportId}`);
    ch
      .on('broadcast', { event: 'play' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const vk = payload?.verse_key as string | undefined;
        if (vk) setVersePlays(prev => ({ ...prev, [vk]: (prev[vk] ?? 0) + 1 }));
      })
      // Teacher reset homework → clear play count so student sees 0/3 again
      .on('broadcast', { event: 'play_reset' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const vk = payload?.verse_key as string | undefined;
        if (vk) setVersePlays(prev => {
          const next = { ...prev };
          delete next[vk];
          return next;
        });
      })
      // Teacher updated homework assignment → update student's homeworkVerses in real time (Bug 3 fix)
      .on('broadcast', { event: 'homework_update' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const hw = payload?.homeworkVerses as string[] | undefined;
        if (hw !== undefined) {
          setReport(prev =>
            prev
              ? { ...prev, report_data: { ...prev.report_data, homeworkVerses: hw } }
              : null
          );
        }
      })
      // Teacher assigned new homework → update student's homework badge in real time
      .on('broadcast', { event: 'homework_assigned' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const hw = payload?.quranHomework as QuranHomework[] | undefined;
        if (hw !== undefined) setQuranHomework(hw);
      })
      // Teacher removed a verse → hide it from student's page immediately (Bug 2 fix)
      .on('broadcast', { event: 'verse_removed' }, ({ payload }: { payload: Record<string, unknown> }) => {
        const vk = payload?.verse_key as string | undefined;
        if (vk) {
          setReport(prev =>
            prev
              ? {
                  ...prev,
                  report_data: {
                    ...prev.report_data,
                    verses: prev.report_data.verses.filter(v => v.verse_key !== vk),
                  },
                }
              : null
          );
        }
      })
      .subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [reportId]);

  const handleVersePlay = useCallback(async (verseKey: string) => {
    await recordVersePlay(reportId, verseKey);
    channelRef.current?.send({ type: 'broadcast', event: 'play', payload: { verse_key: verseKey } });
    // Also update local state immediately so progress dots animate right away
    setVersePlays(prev => ({ ...prev, [verseKey]: (prev[verseKey] ?? 0) + 1 }));
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
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col" dir="rtl">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40" dir="ltr">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">

          {/* Back to family button — only shown when opened from a family link */}
          {backUrl && (
            <a
              href={backUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 transition-colors text-sm font-semibold flex-shrink-0"
              aria-label="Back to family page"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              <span className="hidden sm:inline">Family</span>
            </a>
          )}

          {/* Logo — clicking goes back to content */}
          <button onClick={() => setPortalTab('content')} className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0" aria-label="Go to portal">
            <Logo />
          </button>

          {/* Student Portal badge */}
          <span className="hidden sm:block text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-3 py-1 rounded-full flex-shrink-0 border border-teal-200 dark:border-teal-800">
            🎓 Student Portal
          </span>

          {/* Desktop nav links */}
          <nav className="flex-1 hidden md:flex justify-center items-center gap-6">
            <button
              onClick={() => setPortalTab(t => t === 'about' ? 'content' : 'about')}
              className={`text-sm font-medium transition-colors ${portalTab === 'about' ? 'text-teal-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-400'}`}
            >
              About Us
            </button>
            <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-400 transition-colors">
              Contact Us
            </a>
            <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">
              Support Us
            </a>
          </nav>

          <div className="flex-1 md:hidden" />

          <NotificationCenter teacherId={report?.teacher_id ?? ''} recipient="student" studentId={report?.student_id ?? ''} />

          {/* Student name badge + homework indicator */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 rounded-full">
              <span className="text-emerald-600 dark:text-emerald-400 text-sm">📖</span>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate max-w-[80px] sm:max-w-none">
                {student_name}
              </span>
            </div>
            {quranHomework.filter(hw => !hw.isDone).length > 0 && (
              <button
                onClick={() => setHomeworkModal(quranHomework.filter(hw => !hw.isDone)[0])}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/40 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-bold shadow-sm animate-pulse hover:animate-none hover:bg-violet-200 dark:hover:bg-violet-800/60 transition-colors"
              >
                📝
                <span className="hidden sm:inline">Homework!</span>
                {quranHomework.filter(hw => !hw.isDone).length > 1 && (
                  <span className="bg-violet-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {quranHomework.filter(hw => !hw.isDone).length}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            ) : theme === 'reading' ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" />
              </svg>
            )}
          </button>

          {/* Quranic font selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setIsFontMenuOpen(o => !o)}
              className="sr-font-btn p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Select Quranic font"
            >
              <span style={{ fontFamily: 'Amiri Regular', fontSize: '1.25rem' }}>ع</span>
            </button>
            {isFontMenuOpen && (
              <div className="sr-font-menu absolute end-0 mt-2 w-52 sm:w-64 bg-white dark:bg-gray-800 rounded-xl shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                <div className="py-1">
                  <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Quranic Font</div>
                  {QURANIC_FONTS.map(f => (
                    <button
                      key={f.name}
                      onClick={() => { setQuranicFont(f.name); setIsFontMenuOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                        quranicFont === f.name
                          ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 font-medium'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700'
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

          {/* Mobile nav links */}
          <div className="flex md:hidden items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setPortalTab(t => t === 'about' ? 'content' : 'about')}
              className={`text-xs font-medium transition-colors ${portalTab === 'about' ? 'text-teal-600 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-orange-400'}`}
            >
              About
            </button>
            <a href="#" className="text-xs font-medium text-white bg-teal-600 dark:bg-orange-600 px-2.5 py-1 rounded-full">
              Support
            </a>
          </div>
        </div>

        {/* Tab bar — hidden when About Us is open */}
        {portalTab === 'content' && (
          <div className="border-t border-slate-100 dark:border-gray-700" dir="ltr">
            <div className="container mx-auto px-3 sm:px-4 flex overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => setActiveTab('mistakes')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'mistakes'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Mistakes Review
              </button>
              <button
                onClick={() => setActiveTab('progress')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'progress'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                } ${!hasProgress ? 'opacity-40 cursor-not-allowed' : ''}`}
                disabled={!hasProgress}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
                My Progress
                {!hasProgress && <span className="text-xs ml-1 opacity-70">(share once to unlock)</span>}
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'calendar'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                Tutor's Availability
              </button>
              <button
                onClick={() => setActiveTab('quran')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'quran'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Quran
              </button>
              <button
                onClick={() => setActiveTab('tajweed')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'tajweed'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                Tajweed
              </button>
              <button
                onClick={() => setActiveTab('qaedah')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'qaedah'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
                Qaedah
              </button>
              <button
                onClick={() => setActiveTab('alphabetTrainer')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'alphabetTrainer'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.255 3A23.933 23.933 0 0 1 21 12c0 3.183-.62 6.22-1.745 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.89M8.25 8.885l-1.993.007a.75.75 0 0 0-.75.75v0a.75.75 0 0 0 .75.75H8.25" />
                </svg>
                Alphabet
              </button>
              <button
                onClick={() => setActiveTab('lettersTrainer')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'lettersTrainer'
                    ? 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Letters Trainer
              </button>
            </div>
          </div>
        )}
      </header>

      <main dir="ltr" className={`flex-grow py-6 ${activeTab === 'quran' ? 'w-full px-2 sm:px-3' : activeTab === 'qaedah' || activeTab === 'alphabetTrainer' || activeTab === 'lettersTrainer' ? 'w-full px-2 sm:px-4' : 'container mx-auto px-3 sm:px-6 lg:px-8'}`}>
        {portalTab === 'about' ? (
          <AboutUsPage />
        ) : (
          <>
            {activeTab === 'calendar' && (
              <CalendarPage
                gcalToken={gcalToken}
                onTokenChange={setGcalToken}
                isStudentView={true}
                availabilitySlots={availabilitySlots}
                teacherId={report?.teacher_id}
                studentId={report?.student_id}
                studentName={report?.student_name}
                portalType="quran"
              />
            )}
            {activeTab === 'mistakes' && (
              <MistakesTab
                report={report}
                reportId={reportId}
                quranicFont={quranicFont}
                handleVersePlay={handleVersePlay}
                versePlays={versePlays}
              />
            )}
            {activeTab === 'progress' && hasProgress && (() => {
              const sp = studentProgress!;
              const fakeStudent: Student = {
                id: 'shared-report',
                name: student_name,
                dob: sp.dob,
                recitationAchievements: sp.recitationAchievements,
                memorizationAchievements: sp.memorizationAchievements,
                attendance: sp.attendance as AttendanceRecord[],
                masteredTajweedRules: sp.masteredTajweedRules,
                tafsirReviews: sp.tafsirReviews,
                tafsirMemorizationReviews: sp.tafsirMemorizationReviews,
                mistakes: {},
              };
              return (
                <StudentDetailPage
                  student={fakeStudent}
                  students={[fakeStudent]}
                  quranMetadata={QURAN_METADATA}
                  readOnly
                />
              );
            })()}
            {activeTab === 'quran' && (() => {
              const sp = studentProgress;
              const quranFakeStudent: Student = {
                id: 'shared-report-quran',
                name: student_name,
                dob: sp?.dob,
                recitationAchievements: sp?.recitationAchievements ?? [],
                memorizationAchievements: sp?.memorizationAchievements ?? [],
                attendance: (sp?.attendance ?? []) as AttendanceRecord[],
                masteredTajweedRules: sp?.masteredTajweedRules ?? [],
                tafsirReviews: sp?.tafsirReviews ?? [],
                tafsirMemorizationReviews: sp?.tafsirMemorizationReviews ?? [],
                mistakes: (report_data.mistakes ?? {}) as Record<string, Mistake>,
              };
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const noop: any = () => {};
              /* eslint-enable @typescript-eslint/no-explicit-any */
              return (
                <StudentProgressPage
                  readOnly
                  toolbarStickyTop={156}
                  notesStudentId={report.student_id}
                  student={quranFakeStudent}
                  students={[quranFakeStudent]}
                  studentProgress={sp ? { surah: sp.recitationAchievements?.[sp.recitationAchievements.length - 1]?.endSurah ?? 1, ayah: sp.recitationAchievements?.[sp.recitationAchievements.length - 1]?.endAyah ?? 1 } : { surah: 1, ayah: 1 }}
                  studentMistakes={(report_data.mistakes ?? {}) as Record<string, Mistake>}
                  recitationAchievements={sp?.recitationAchievements ?? []}
                  memorizationAchievements={sp?.memorizationAchievements ?? []}
                  onUpdateProgress={noop}
                  onCycleMistakeLevel={noop}
                  onClearMistake={noop}
                  onLogRecitationRange={noop}
                  onRemoveRecitationAchievement={noop}
                  onLogMemorizationRange={noop}
                  onRemoveMemorizationAchievement={noop}
                  onLogTafseerRange={noop}
                  onRemoveTafseerRange={noop}
                  onGoBack={noop}
                />
              );
            })()}
            {activeTab === 'tajweed' && (
              <TajweedPage students={[]} preSelectedStudentId={report.student_id} />
            )}
            {activeTab === 'qaedah' && (
              <QaedahPage />
            )}
            {activeTab === 'alphabetTrainer' && (
              <AlphabetTrainerPage />
            )}
            {activeTab === 'lettersTrainer' && (
              <LettersTrainerPage preSelectedStudent={{ id: report.student_id, name: report.student_name }} />
            )}

            <footer className="text-center text-xs text-slate-400 dark:text-slate-600 py-8">
              <p>Generated by Lisan &amp; Quran · {new Date(generatedAt).toLocaleString()}</p>
            </footer>
          </>
        )}
      </main>

      {/* ── Homework detail modal ─────────────────────────────────────────────── */}
      {homeworkModal && (() => {
        const activeHw = quranHomework.filter(hw => !hw.isDone);
        const formatRange = (hw: QuranHomework) => {
          const startName = QURAN_METADATA.find(s => s.number === hw.startSurah)?.transliteratedName ?? `Surah ${hw.startSurah}`;
          const endName   = QURAN_METADATA.find(s => s.number === hw.endSurah)?.transliteratedName   ?? `Surah ${hw.endSurah}`;
          if (hw.startSurah === hw.endSurah && hw.startAyah === hw.endAyah) return `${startName} : ${hw.startAyah}`;
          return `${startName} ${hw.startAyah} → ${endName} ${hw.endAyah}`;
        };
        return (
          <div
            className="fixed inset-0 bg-black/60 z-[300] flex items-end sm:items-center justify-center p-4"
            onClick={() => setHomeworkModal(null)}
          >
            <div
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">📝</span>
                    <h3 className="text-lg font-bold text-white">Homework</h3>
                  </div>
                  {activeHw.length > 1 && (
                    <span className="text-violet-200 text-sm">
                      {activeHw.indexOf(homeworkModal) + 1} / {activeHw.length}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-violet-100 font-semibold text-base">{formatRange(homeworkModal)}</p>
              </div>

              {/* Body */}
              <div className="px-6 py-5">
                {homeworkModal.note ? (
                  <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800 rounded-2xl p-4 mb-5">
                    <p className="text-sm font-semibold text-violet-700 dark:text-violet-300 mb-1">Instructions from your teacher:</p>
                    <p className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{homeworkModal.note}</p>
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-5 italic">No specific instructions — practise the assigned verses.</p>
                )}

                {/* Navigate between multiple homework items */}
                {activeHw.length > 1 && (
                  <div className="flex gap-2 mb-4">
                    {activeHw.map((hw, i) => (
                      <button
                        key={hw.id}
                        onClick={() => setHomeworkModal(hw)}
                        className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                          hw.id === homeworkModal.id
                            ? 'bg-violet-600 text-white'
                            : 'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'
                        }`}
                      >
                        #{i + 1}
                      </button>
                    ))}
                  </div>
                )}

                {/* Done button */}
                <button
                  onClick={() => {
                    setQuranHomework(prev => prev.map(hw => hw.id === homeworkModal.id ? { ...hw, isDone: true } : hw));
                    setHomeworkModal(null);
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-base shadow-lg hover:from-violet-700 hover:to-purple-700 active:scale-95 transition-all"
                >
                  ✅ Done!
                </button>

                <button
                  onClick={() => setHomeworkModal(null)}
                  className="mt-2 w-full py-2 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default SharedReportPage;
