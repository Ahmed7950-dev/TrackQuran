// ─────────────────────────────────────────────────────────────────────────────
// TadabburLabPage — every word the student has a meaning for, grouped surah →
// verse: hear it (Quran.com word-by-word recitation), pick a few, and revise
// them as flashcards with the same red/green strength bar as the Arabic words.
// The tutor can send a picked deck to the student's portal as homework.
//
// The same page serves both sides: `readOnly` is the student's portal, where
// meanings can't be edited and decks can't be assigned.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QURAN_METADATA } from '../constants';
import { QuranVerse } from '../types';
import { loadWordMeanings } from '../services/tadabburService';
import {
  loadWordStrength, recordWordReview, withWordReview, WordStrength, isWeak,
  wordAudioUrl, wordKey, listWordHomework, assignWordHomework, completeWordHomework,
  deleteWordHomework, WordHomework, DeckWord,
} from '../services/tadabburLabService';
import { fetchSurahWbw, alignWbw } from '../services/wordByWordService';
import { getVersesForSurah } from '../services/dataService';
import { splitVerseWords, renderWordWithMarks } from '../utils/quranicMarks';
import { createNotification } from '../services/notificationService';
import VocabStrengthBar from './VocabStrengthBar';

interface LabWord {
  key: string;
  surah: number;
  ayah: number;
  wordIndex: number;
  wordText: string;
  meaning: string;
  /** 1-based place among the verse's words on Quran.com — the audio address. */
  position: number | null;
}

const surahName = (n: number) => QURAN_METADATA.find(m => m.number === n)?.transliteratedName ?? `Surah ${n}`;
const surahArabic = (n: number) => QURAN_METADATA.find(m => m.number === n)?.name ?? '';

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const TadabburLabPage: React.FC<{
  studentId: string;
  studentName: string;
  /** The student's portal: read-only, and finishing a deck reports back. */
  readOnly?: boolean;
  teacherId?: string;
  /** Tutor side: open the Quran page at this verse in tadabbur mode. */
  onOpenVerse?: (verseKey: string) => void;
}> = ({ studentId, studentName, readOnly = false, teacherId, onOpenVerse }) => {
  const [words, setWords] = useState<LabWord[]>([]);
  const [verseText, setVerseText] = useState<Record<string, string>>({});
  const [strength, setStrength] = useState<WordStrength>(new Map());
  const [homework, setHomework] = useState<WordHomework[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'weak' | 'new'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // ── Flashcard run ────────────────────────────────────────────────────────
  const [deck, setDeck] = useState<LabWord[] | null>(null);
  const [deckHomeworkId, setDeckHomeworkId] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ right: 0, again: 0 });
  const [done, setDone] = useState(false);

  const [assigning, setAssigning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // ── Load: meanings → their surahs' text and word-by-word data ────────────
  const reload = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setErr('');
    try {
      const [meanings, str, hw] = await Promise.all([
        loadWordMeanings(studentId),
        loadWordStrength(studentId),
        listWordHomework(studentId).catch(() => [] as WordHomework[]),
      ]);
      setStrength(str);
      setHomework(hw);

      const entries = Object.entries(meanings);
      const surahs = [...new Set(entries.map(([k]) => Number(k.split(':')[0])))];
      const texts: Record<string, string> = {};
      const positions = new Map<string, number>();

      await Promise.all(surahs.map(async surah => {
        const [verses, wbw] = await Promise.all([
          getVersesForSurah(surah).catch(() => [] as QuranVerse[]),
          fetchSurahWbw(surah).catch(() => null),
        ]);
        for (const v of verses) {
          texts[v.verse_key] = v.text_uthmani;
          const api = wbw?.get(v.verse_key);
          if (!api) continue;
          const align = alignWbw(splitVerseWords(v.text_uthmani), api);
          if (!align) continue;
          align.forEach((apiIndex, wordIndex) => {
            if (apiIndex >= 0) positions.set(`${v.verse_key}:${wordIndex}`, apiIndex + 1);
          });
        }
      }));

      setVerseText(texts);
      setWords(entries.map(([key, m]) => {
        const [surah, ayah, wordIndex] = key.split(':').map(Number);
        return {
          key, surah, ayah, wordIndex,
          wordText: m.wordText || '',
          meaning: m.meaning,
          position: positions.get(key) ?? null,
        };
      }).sort((a, b) => a.surah - b.surah || a.ayah - b.ayah || a.wordIndex - b.wordIndex));
    } catch (e) {
      console.error('[Tadabbur Lab] load failed:', e);
      setErr('Could not load the words — check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { reload(); }, [reload]);

  // ── Audio ────────────────────────────────────────────────────────────────
  const play = useCallback((w: LabWord) => {
    if (!w.position) return;
    const a = audioRef.current ?? (audioRef.current = new Audio());
    if (playingKey === w.key && !a.paused) { a.pause(); setPlayingKey(null); return; }
    a.src = wordAudioUrl(w.surah, w.ayah, w.position);
    a.onended = () => setPlayingKey(null);
    a.play().then(() => setPlayingKey(w.key)).catch(() => setPlayingKey(null));
  }, [playingKey]);

  // ── The list ─────────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return words.filter(w => {
      if (filter === 'weak' && !isWeak(strength.get(w.key))) return false;
      if (filter === 'new' && (strength.get(w.key)?.length ?? 0) > 0) return false;
      if (!q) return true;
      return w.meaning.toLowerCase().includes(q) || w.wordText.includes(search.trim());
    });
  }, [words, search, filter, strength]);

  const grouped = useMemo(() => {
    const bySurah = new Map<number, Map<number, LabWord[]>>();
    for (const w of visible) {
      const verses = bySurah.get(w.surah) ?? new Map<number, LabWord[]>();
      verses.set(w.ayah, [...(verses.get(w.ayah) ?? []), w]);
      bySurah.set(w.surah, verses);
    }
    return [...bySurah.entries()].map(([surah, verses]) => ({
      surah,
      verses: [...verses.entries()].map(([ayah, list]) => ({ ayah, words: list })),
      count: [...verses.values()].reduce((n, l) => n + l.length, 0),
    }));
  }, [visible]);

  const weakCount = useMemo(() => words.filter(w => isWeak(strength.get(w.key))).length, [words, strength]);
  const freshCount = useMemo(() => words.filter(w => !(strength.get(w.key)?.length)).length, [words, strength]);
  const knownPct = useMemo(() => {
    const answered = words.map(w => strength.get(w.key)).filter((a): a is boolean[] => !!a?.length);
    if (!answered.length) return null;
    const right = answered.filter(a => a[a.length - 1]).length;
    return Math.round((right / answered.length) * 100);
  }, [words, strength]);
  const verseCount = useMemo(() => new Set(words.map(w => `${w.surah}:${w.ayah}`)).size, [words]);

  const togglePick = (key: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pickMany = (list: LabWord[]) => setPicked(prev => {
    const next = new Set(prev);
    const allIn = list.every(w => next.has(w.key));
    list.forEach(w => (allIn ? next.delete(w.key) : next.add(w.key)));
    return next;
  });

  // ── Start / finish a run ─────────────────────────────────────────────────
  const startDeck = (list: LabWord[], homeworkId: string | null = null) => {
    if (!list.length) return;
    setDeck(shuffle(list));
    setDeckHomeworkId(homeworkId);
    setCardIndex(0);
    setFlipped(false);
    setScore({ right: 0, again: 0 });
    setDone(false);
  };

  const answer = async (correct: boolean) => {
    if (!deck) return;
    const card = deck[cardIndex];
    if (!card) return;
    setStrength(prev => withWordReview(prev, card.key, correct));
    recordWordReview(studentId, card.key, correct);
    setScore(s => ({ right: s.right + (correct ? 1 : 0), again: s.again + (correct ? 0 : 1) }));
    // "Show me again" sends the card to the back of the queue, once.
    const queue = correct ? deck : [...deck, card];
    setDeck(queue);
    setFlipped(false);
    if (cardIndex + 1 >= queue.length) {
      setDone(true);
      if (deckHomeworkId) await finishHomework(deckHomeworkId, correct);
    } else {
      setCardIndex(i => i + 1);
    }
  };

  const finishHomework = async (id: string, lastCorrect: boolean) => {
    const total = deck?.length ?? 0;
    const right = score.right + (lastCorrect ? 1 : 0);
    const ok = await completeWordHomework(id, right, total);
    if (!ok) return;
    setHomework(prev => prev.map(h => h.id === id
      ? { ...h, status: 'completed', completedAt: new Date().toISOString(), scoreCorrect: right, scoreTotal: total }
      : h));
    if (teacherId) {
      createNotification({
        teacherId, studentId, recipient: 'tutor', bookingId: null,
        type: 'tadabbur_deck_completed',
        title: 'Tadabbur words revised',
        body: `${studentName} finished the ${total}-word deck — knew ${right} of ${total}.`,
      }).catch(() => { /* the bell is best-effort */ });
    }
  };

  const sendAsHomework = async () => {
    const list = words.filter(w => picked.has(w.key));
    if (!list.length) return;
    setAssigning(true);
    setErr('');
    try {
      const deckWords: DeckWord[] = list.map(w => ({ surah: w.surah, ayah: w.ayah, wordIndex: w.wordIndex, wordText: w.wordText }));
      const created = await assignWordHomework(studentId, deckWords);
      if (created) setHomework(prev => [created, ...prev]);
      setPicked(new Set());
      if (teacherId) {
        createNotification({
          teacherId, studentId, recipient: 'student', bookingId: null,
          type: 'tadabbur_deck_assigned',
          title: 'Words to revise',
          body: `Your teacher sent ${list.length} word${list.length === 1 ? '' : 's'} to revise in the Tadabbur Lab.`,
        }).catch(() => { /* best effort */ });
      }
    } catch (e) {
      console.error('[Tadabbur Lab] assign failed:', e);
      setErr('Could not send the homework — check the connection and try again.');
    } finally {
      setAssigning(false);
    }
  };

  const wordsOfHomework = (hw: WordHomework): LabWord[] =>
    hw.words.map(dw => words.find(w => w.key === wordKey(dw.surah, dw.ayah, dw.wordIndex)))
      .filter((w): w is LabWord => !!w);

  // ── Pieces ───────────────────────────────────────────────────────────────
  const speaker = (w: LabWord) => (
    <button
      onClick={() => play(w)}
      disabled={!w.position}
      title={w.position ? `Hear ${w.wordText}` : 'No recitation for this word'}
      aria-label={w.position ? `Hear ${w.wordText}` : 'No recitation for this word'}
      className={`flex-shrink-0 w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
        playingKey === w.key
          ? 'bg-blue-700 border-blue-700 text-white'
          : 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 disabled:opacity-40'}`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );

  const tick = (w: LabWord) => {
    const on = picked.has(w.key);
    return (
      <button
        onClick={() => togglePick(w.key)}
        aria-pressed={on}
        aria-label={on ? `Take ${w.wordText} out of the deck` : `Add ${w.wordText} to the deck`}
        title={on ? 'In the deck' : 'Add to the deck'}
        className={`flex-shrink-0 w-[22px] h-[22px] rounded-md border-[1.5px] flex items-center justify-center transition-colors ${
          on ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white dark:bg-gray-700 border-slate-300 dark:border-gray-500 text-transparent hover:border-blue-400'}`}
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
      </button>
    );
  };

  const wordCard = (w: LabWord) => (
    <div key={w.key}
      className={`w-[150px] px-2.5 pt-2 pb-2.5 rounded-2xl flex flex-col items-center gap-1 transition-colors ${
        picked.has(w.key)
          ? 'border-2 border-blue-700 bg-blue-50 dark:bg-blue-900/30'
          : 'border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
      <div className="flex items-center gap-1.5 w-full">
        {tick(w)}
        <span className="flex-grow" />
        {speaker(w)}
      </div>
      <span dir="rtl" className="font-quranic text-2xl leading-[1.7] text-slate-900 dark:text-slate-100 text-center">
        {renderWordWithMarks(w.wordText, w.key, 1.7)}
      </span>
      <span className="text-[13px] font-bold text-blue-700 dark:text-blue-300 text-center leading-tight">{w.meaning}</span>
      <VocabStrengthBar answers={strength.get(w.key) ?? []} />
    </div>
  );

  // ── Flashcards ───────────────────────────────────────────────────────────
  if (deck && !done) {
    const card = deck[cardIndex];
    const verse = verseText[`${card.surah}:${card.ayah}`];
    const pieces = verse ? splitVerseWords(verse) : [];
    return (
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setDeck(null); setDeckHomeworkId(null); }}
            className="h-9 px-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-bold text-slate-600 dark:text-slate-300">
            ← Back to the lab
          </button>
          <div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">
              Flashcards · {deck.length} word{deck.length === 1 ? '' : 's'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Say the meaning out loud, then turn the card.</p>
          </div>
          <span className="flex-grow" />
          <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300">Card {cardIndex + 1} of {deck.length}</span>
        </div>

        <div className="h-2 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden">
          <div className="h-full rounded-full bg-amber-400 transition-all duration-300" style={{ width: `${(cardIndex / deck.length) * 100}%` }} />
        </div>

        <button onClick={() => setFlipped(f => !f)}
          className={`w-full rounded-3xl border p-8 sm:p-10 flex flex-col items-center justify-center gap-4 min-h-[300px] transition-colors ${
            flipped ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700'}`}>
          {!flipped ? (
            <>
              <span className="text-xs font-extrabold tracking-widest uppercase text-slate-400">What does this mean?</span>
              <span dir="rtl" className="font-quranic text-5xl sm:text-6xl leading-[1.6] text-slate-900 dark:text-slate-100">
                {renderWordWithMarks(card.wordText, card.key, 1.6)}
              </span>
              <span className="text-xs text-slate-300 dark:text-slate-600">tap to turn it over</span>
            </>
          ) : (
            <>
              <span dir="rtl" className="font-quranic text-4xl leading-[1.5] text-slate-900 dark:text-slate-100">
                {renderWordWithMarks(card.wordText, card.key, 1.5)}
              </span>
              <span className="text-2xl sm:text-3xl font-black text-blue-900 dark:text-blue-200">{card.meaning}</span>
              {verse && (
                <span dir="rtl" className="font-quranic text-xl leading-[2] text-slate-600 dark:text-slate-300 bg-white dark:bg-gray-900/40 rounded-2xl px-4 py-2 border border-blue-100 dark:border-blue-900 text-center">
                  {pieces.map((p, i) => (
                    <span key={i} className={i === card.wordIndex ? 'text-blue-700 dark:text-blue-300 border-b-2 border-blue-500' : ''}>
                      {renderWordWithMarks(p, `${card.key}-c${i}`, 2)}{' '}
                    </span>
                  ))}
                </span>
              )}
              <span className="text-[13px] font-bold text-slate-500 dark:text-slate-400">{surahName(card.surah)} · {card.ayah}</span>
            </>
          )}
        </button>

        <div className="flex items-center justify-center">
          <button onClick={() => play(card)} disabled={!card.position}
            className="h-10 px-4 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm font-extrabold flex items-center gap-2 disabled:opacity-40">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6.5 9H3v6h3.5L11 19z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
            Hear it
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-5">
          <button onClick={() => answer(false)}
            className="py-5 rounded-3xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 font-black flex flex-col items-center gap-1">
            <span className="text-2xl">🔖</span>
            Show me again
          </button>
          <button onClick={() => answer(true)}
            className="py-5 rounded-3xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-black flex flex-col items-center gap-1">
            <span className="text-2xl">👍</span>
            I knew it
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap p-4 rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700">
          <span className="text-[13px] font-extrabold text-slate-600 dark:text-slate-300">This word so far</span>
          <VocabStrengthBar answers={strength.get(card.key) ?? []} />
          <span className="flex-grow" />
          <span className="text-[13px] text-slate-500 dark:text-slate-400">
            Session: <strong className="text-emerald-700 dark:text-emerald-400">{score.right} known</strong> · <strong className="text-rose-700 dark:text-rose-400">{score.again} to see again</strong>
          </span>
        </div>
      </div>
    );
  }

  if (deck && done) {
    return (
      <div className="max-w-2xl mx-auto p-6 sm:p-12 text-center space-y-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-slate-100">Deck finished</h2>
        <p className="text-slate-500 dark:text-slate-400">
          {score.right} of {deck.length} known first time{score.again ? ` · ${score.again} to see again` : ''}.
        </p>
        {deckHomeworkId && <p className="text-emerald-700 dark:text-emerald-400 font-bold">Your teacher can see it's done.</p>}
        <div className="flex gap-3 justify-center pt-2">
          <button onClick={() => { setDeck(null); setDeckHomeworkId(null); }}
            className="h-11 px-5 rounded-xl bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-slate-200 font-bold">Back to the lab</button>
          <button onClick={() => startDeck(deck, null)}
            className="h-11 px-5 rounded-xl bg-emerald-700 text-white font-black">Go again</button>
        </div>
      </div>
    );
  }

  // ── The lab ──────────────────────────────────────────────────────────────
  const pickedWords = words.filter(w => picked.has(w.key));
  const openDecks = homework.filter(h => h.status === 'assigned');

  return (
    <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">Tadabbur Lab</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {readOnly ? 'Every word you have a meaning for — hear it, then revise it.'
              : <>Every word <strong className="text-slate-800 dark:text-slate-100">{studentName}</strong> has a meaning for, ready to hear and revise.</>}
          </p>
        </div>
        <span className="flex-grow" />
        <div className="flex flex-wrap gap-2">
          {[
            { v: String(new Set(words.map(w => w.surah)).size), l: 'Surahs', c: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
            { v: String(verseCount), l: 'Verses', c: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
            { v: String(words.length), l: 'Words', c: 'bg-slate-100 dark:bg-gray-700 text-slate-800 dark:text-slate-100' },
            { v: knownPct === null ? '—' : `${knownPct}%`, l: 'Known', c: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
          ].map(s => (
            <div key={s.l} className={`min-w-[96px] px-4 py-2 rounded-2xl ${s.c}`}>
              <div className="text-2xl font-black leading-tight">{s.v}</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {err && <p className="px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm font-semibold">{err}</p>}

      {/* homework decks */}
      {openDecks.map(hw => {
        const list = wordsOfHomework(hw);
        return (
          <div key={hw.id} className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
            <span className="text-xl">📋</span>
            <div className="min-w-0">
              <p className="font-black text-violet-900 dark:text-violet-200">
                {readOnly ? 'Your teacher sent words to revise' : 'Waiting for the student'}
              </p>
              <p className="text-sm text-violet-700 dark:text-violet-300">
                {hw.words.length} word{hw.words.length === 1 ? '' : 's'} · sent {new Date(hw.assignedAt).toLocaleDateString()}
              </p>
            </div>
            <span className="flex-grow" />
            {readOnly ? (
              <button onClick={() => startDeck(list, hw.id)} disabled={!list.length}
                className="h-10 px-5 rounded-xl bg-violet-700 text-white font-black disabled:opacity-40">Start</button>
            ) : (
              <button onClick={async () => { if (await deleteWordHomework(hw.id)) setHomework(p => p.filter(h => h.id !== hw.id)); }}
                className="h-10 px-4 rounded-xl border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 font-bold">Cancel</button>
            )}
          </div>
        );
      })}
      {!readOnly && homework.filter(h => h.status === 'completed').slice(0, 2).map(hw => (
        <div key={hw.id} className="flex flex-wrap items-center gap-3 p-3 px-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span>✅</span>
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
            Revised {hw.scoreCorrect ?? 0} of {hw.scoreTotal ?? hw.words.length} · {hw.completedAt ? new Date(hw.completedAt).toLocaleDateString() : ''}
          </p>
          <span className="flex-grow" />
          <button onClick={async () => { if (await deleteWordHomework(hw.id)) setHomework(p => p.filter(h => h.id !== hw.id)); }}
            className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline">Clear</button>
        </div>
      ))}

      {/* tools */}
      <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl">
        <input
          type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search a word or a meaning…" aria-label="Search words and meanings"
          className="h-10 px-3 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-slate-800 dark:text-slate-100 w-full sm:w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div role="group" aria-label="Filter" className="flex items-center gap-1 p-1 rounded-full bg-slate-100 dark:bg-gray-700">
          {([
            ['all', `All ${words.length}`],
            ['weak', `Weak ${weakCount}`],
            ['new', `Never revised ${freshCount}`],
          ] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={`h-8 px-3 rounded-full text-[13px] font-bold transition-colors ${
                filter === id ? 'bg-blue-700 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="flex-grow" />
        {weakCount > 0 && (
          <button onClick={() => startDeck(words.filter(w => isWeak(strength.get(w.key))))}
            className="h-10 px-4 rounded-xl border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-red-700 dark:text-red-400 text-[13px] font-extrabold">
            Revise the weak {weakCount}
          </button>
        )}
        <button onClick={() => startDeck(words)} disabled={!words.length}
          className="h-10 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-extrabold disabled:opacity-40">
          Flashcards · all {words.length}
        </button>
      </div>

      {loading ? (
        <p className="p-10 text-center text-slate-500 dark:text-slate-400 animate-pulse">Loading the words…</p>
      ) : !words.length ? (
        <div className="p-10 text-center rounded-3xl border border-dashed border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800">
          <p className="text-lg font-bold text-slate-700 dark:text-slate-200">No words yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {readOnly
              ? 'Word meanings your teacher writes in Tadabbur mode show up here.'
              : 'Open the Quran page in Tadabbur mode and tap a word to give it a meaning.'}
          </p>
        </div>
      ) : !visible.length ? (
        <p className="p-10 text-center text-slate-500 dark:text-slate-400">Nothing matches that.</p>
      ) : grouped.map(g => (
        <section key={g.surah} className="p-4 sm:p-6 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-black flex items-center justify-center">{g.surah}</span>
            <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{surahName(g.surah)}</span>
            <span className="font-quranic text-lg text-slate-600 dark:text-slate-300">{surahArabic(g.surah)}</span>
            <span className="text-[13px] text-slate-500 dark:text-slate-400">{g.verses.length} verses · {g.count} words</span>
            <span className="flex-grow" />
            <button onClick={() => pickMany(g.verses.flatMap(v => v.words))}
              className="h-8 px-3 rounded-lg border border-slate-200 dark:border-gray-600 text-blue-700 dark:text-blue-300 text-xs font-extrabold">
              Pick all {g.count}
            </button>
          </div>

          {g.verses.map(v => (
            <div key={v.ayah} className="flex flex-wrap items-start gap-3 pt-3 border-t border-slate-100 dark:border-gray-700">
              <div className="flex flex-col gap-1.5 items-start flex-shrink-0">
                <button onClick={() => onOpenVerse?.(`${g.surah}:${v.ayah}`)}
                  disabled={!onOpenVerse}
                  title={onOpenVerse ? 'Open this verse in the Quran page' : undefined}
                  className="h-8 px-3 rounded-full bg-blue-700 text-white text-[13px] font-extrabold disabled:opacity-90">
                  {g.surah}:{v.ayah}
                </button>
                <button onClick={() => pickMany(v.words)}
                  className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 text-[11px] font-extrabold">
                  Pick these {v.words.length}
                </button>
              </div>
              <div dir="rtl" className="flex-grow flex flex-wrap gap-2.5">
                {v.words.map(wordCard)}
              </div>
            </div>
          ))}
        </section>
      ))}

      <p className="px-2 text-xs text-slate-500 dark:text-slate-400">
        Every word plays from the Quran.com word-by-word recitation — that exact word, in that exact verse.
      </p>

      {/* the picked deck follows you down the page */}
      {pickedWords.length > 0 && (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 p-3 sm:px-5 rounded-2xl bg-slate-900 text-white shadow-2xl">
          <span className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center font-black">{pickedWords.length}</span>
          <span className="font-extrabold">word{pickedWords.length === 1 ? '' : 's'} picked</span>
          <span dir="rtl" className="font-quranic text-lg text-slate-300 truncate max-w-[16rem] hidden sm:inline">
            {pickedWords.slice(0, 4).map(w => w.wordText).join(' · ')}
          </span>
          <span className="flex-grow" />
          <button onClick={() => setPicked(new Set())}
            className="h-9 px-3 rounded-xl border border-slate-600 text-slate-300 text-[13px] font-bold">Clear</button>
          {!readOnly && (
            <button onClick={sendAsHomework} disabled={assigning}
              className="h-9 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-extrabold disabled:opacity-50">
              {assigning ? 'Sending…' : 'Send as homework'}
            </button>
          )}
          <button onClick={() => startDeck(pickedWords)}
            className="h-9 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black">
            Flashcards with these {pickedWords.length}
          </button>
        </div>
      )}
    </div>
  );
};

export default TadabburLabPage;
