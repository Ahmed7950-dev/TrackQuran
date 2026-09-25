// ─────────────────────────────────────────────────────────────────────────────
// RecitationHomeworkPage — /recite/:id, no sign-in needed.
//
// Reading homework, one verse at a time: the verse is drawn big with
// the live-logging page's own word renderer and Quran font; tapping it plays
// Al-Minshawi (as often as the student likes). The student records their own
// recitation, listens back, records again until happy, and moves on. A side
// panel (a strip on phones) shows how many verses are recorded. When every
// verse has a take, Submit notifies the tutor.
//
// Hifz homework is the same page with the verses withheld: every verse of the
// range is listed showing only its first word, tapping one opens it in full, a
// switch hides even the first words, there is no reciter to lean on, and the
// whole range is recited from memory in ONE take.
//
// Each take is uploaded as soon as it stops — so leaving the page loses
// nothing — and replaces the previous one (see saveVerseRecording).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVersesForSurah } from '../services/dataService';
import {
  splitVerseWords, renderWordWithMarks, currentQuranicFont, TURKISH_FONT,
  wordMarkPlan, hasLowMeem, renderLowMeemUnit, almSeedForUnit,
} from '../utils/quranicMarks';
import { parseWordIntoLetters, splitTrailingWaqf, WAQF_STYLE } from '../utils/mistakeLetters';
import { supabase } from '../lib/supabase';
import type { Mistake } from '../types';
import { audioUrl } from './VerseAudioPlayer';
import { QURAN_METADATA, QURANIC_FONTS } from '../constants';
import {
  RecitationHomework, RECORDER_BITRATE, getRecitationHomework, isFullyRecorded, pickRecorderMime,
  portalHomeworkUrl, rangeLabel, saveVerseRecording, saveWholeRecording, submitRecitationHomework,
  versesOf, WHOLE_TAKE,
} from '../services/recitationHomeworkService';

const MAX_TAKE_MS = 5 * 60 * 1000;

const toArabicDigits = (n: number): string => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const fmtSecs = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type TakeState = 'idle' | 'recording' | 'saving';
type ReciteTheme = 'morning' | 'night';

/** The Turkish script needs its own text source; this page reads the Uthmani text. */
const FONT_OPTIONS = QURANIC_FONTS.filter(f => f.name !== TURKISH_FONT);

// "Mushaf Morning" (day) and "Night Study" (night) — from the design canvas.
const PALETTES = {
  morning: {
    page: '#F4EEDF', card: '#FFFBF2', cardBorder: '#E6DAC0', stage: '#FFFDF7', stageBorder: '#E3C98E',
    ink: '#1F2A24', verseInk: '#14201A', muted: '#5B6259', faint: '#8C846F',
    gold: '#B8872E', goldInk: '#8A6A24', goldSoft: '#FFF4DC', goldHalo: '#F4E5C2',
    primary: '#1F5E4A', onPrimary: '#FFFBF2', track: '#E9DFC9',
    chipDone: '#1F5E4A', chipDoneInk: '#FFFBF2', chipIdle: '#FFFBF2', chipIdleBorder: '#DCCFB3', chipIdleInk: '#6B6556',
    record: '#B5452F', recordRing: '#F3D9D2', recordInk: '#FFFBF2', recording: '#C8492F', recordingSoft: '#F6D2C9',
    mine: '#2F7A62', mineRing: '#DDE8E2', mineInk: '#FFFBF2',
    ghost: '#FFFBF2', ghostBorder: '#D8CBAE', ghostInk: '#3E4640',
    hint: '#EFF5F1', hintInk: '#1F5E4A', tip: '#1F2A24', tipInk: '#FFFBF2',
    noticeBg: '#FFF4DC', noticeBorder: '#E9D2A0', noticeInk: '#6E5116',
  },
  night: {
    page: '#0F1728', card: '#151F35', cardBorder: '#22304D', stage: '#111A2D', stageBorder: '#2A3857',
    ink: '#E8ECF3', verseInk: '#F4F1E8', muted: '#A3AEC2', faint: '#8E9BB3',
    gold: '#D9B25F', goldInk: '#F1D595', goldSoft: '#2A2A1E', goldHalo: 'rgba(217,178,95,0.16)',
    primary: '#5CC8B0', onPrimary: '#0B1F1B', track: '#24324F',
    chipDone: '#1F4F4A', chipDoneInk: '#A8E8DA', chipIdle: '#131C30', chipIdleBorder: '#2B3A5A', chipIdleInk: '#9FB0C8',
    record: '#E0677A', recordRing: '#3A2230', recordInk: '#1A0B10', recording: '#EF5B6E', recordingSoft: '#4A2432',
    mine: '#8FA8FF', mineRing: '#22354F', mineInk: '#0E1630',
    ghost: '#151F35', ghostBorder: '#2B3A5A', ghostInk: '#C9D2E1',
    hint: '#1A2A3F', hintInk: '#9FB0C8', tip: '#E8ECF3', tipInk: '#0F1728',
    noticeBg: '#2A2418', noticeBorder: '#4A3D22', noticeInk: '#F1D595',
  },
} as const;

const RecitationHomeworkPage: React.FC<{ recitationId: string }> = ({ recitationId }) => {
  const [rec, setRec] = useState<RecitationHomework | null | undefined>(undefined);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [take, setTake] = useState<TakeState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [minshawiPlaying, setMinshawiPlaying] = useState(false);
  const [minePlaying, setMinePlaying] = useState(false);
  /** On a reassigned homework: the one the tutor checked — its takes can be replayed. */
  const [prevRec, setPrevRec] = useState<RecitationHomework | null>(null);
  const [prevPlaying, setPrevPlaying] = useState(false);
  // Viewport width — the verse and the comment pills scale with it (see LH).
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  /** Takes recorded in this visit, playable instantly before the upload's URL. */
  const localUrls = useRef<Record<string, string>>({});
  /** Hifz: the verses the student has opened, and whether even the first words are hidden. */
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [blind, setBlind] = useState(false);

  // Day / night, remembered on this device (defaults to the app's own theme).
  const [theme, setTheme] = useState<ReciteTheme>(() => {
    try {
      const saved = localStorage.getItem('reciteTheme');
      if (saved === 'morning' || saved === 'night') return saved;
      return localStorage.getItem('theme') === 'dark' ? 'night' : 'morning';
    } catch { return 'morning'; }
  });
  useEffect(() => { try { localStorage.setItem('reciteTheme', theme); } catch { /* private mode */ } }, [theme]);

  // Quran font — the same setting the portal and live logging page use.
  const [quranFont, setQuranFont] = useState<string>(() => {
    const f = currentQuranicFont();
    return FONT_OPTIONS.some(o => o.name === f) ? f : 'Hafs';
  });
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  useEffect(() => {
    document.documentElement.style.setProperty('--quranic-font', quranFont);
  }, [quranFont]);
  // Saved only when the student picks one — just opening this page must not
  // overwrite a portal choice it can't show (the Turkish script).
  const pickFont = (name: string) => {
    setQuranFont(name);
    try { localStorage.setItem('quranicFont', name); } catch { /* private mode */ }
  };

  // The design's display and body faces.
  useEffect(() => {
    const id = 'recite-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Figtree:wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const startingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const minshawiRef = useRef<HTMLAudioElement | null>(null);
  const mineRef = useRef<HTMLAudioElement | null>(null);
  const prevRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    document.title = 'Recitation homework';
    getRecitationHomework(recitationId).then(setRec);
  }, [recitationId]);

  // The mistakes the tutor has logged on these verses — live, the same marks as
  // on the tutor's Quran page (recitation_mistakes returns only this homework's
  // verses). Refreshed when the student comes back to the page, so marks logged
  // meanwhile appear without a reload.
  const parentId = rec?.parentId;
  useEffect(() => {
    if (!parentId) { setPrevRec(null); return; }
    let live = true;
    getRecitationHomework(parentId).then(p => { if (live) setPrevRec(p); });
    return () => { live = false; };
  }, [parentId]);

  // The tutor opening this page from their own app is signed in; a student
  // arriving by link is not. Decides where Back leads when there is no history.
  const teacherId = rec?.teacherId;
  const [isTutor, setIsTutor] = useState(false);
  useEffect(() => {
    if (!teacherId) return;
    supabase.auth.getSession().then(({ data }) => setIsTutor(data.session?.user?.id === teacherId));
  }, [teacherId]);

  const [liveMistakes, setLiveMistakes] = useState<Record<string, Mistake> | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      supabase.rpc('recitation_mistakes', { p_id: recitationId }).then(({ data, error }) => {
        if (live && !error && data && typeof data === 'object') setLiveMistakes(data as Record<string, Mistake>);
      });
    };
    load();
    const onShow = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { live = false; document.removeEventListener('visibilitychange', onShow); };
  }, [recitationId]);

  const verses = useMemo(() => (rec ? versesOf(rec) : []), [rec]);
  const key = verses[idx] ? `${verses[idx][0]}:${verses[idx][1]}` : '';

  // Verse texts, one fetch per surah (cached by dataService).
  useEffect(() => {
    if (!rec) return;
    let live = true;
    const surahs = [...new Set(verses.map(v => v[0]))];
    Promise.all(surahs.map(s => getVersesForSurah(s))).then(all => {
      if (!live) return;
      const map: Record<string, string> = {};
      for (const list of all) for (const v of list) map[v.verse_key] = v.text_uthmani;
      setTexts(map);
    }).catch(() => setError('Could not load the verses — check your connection and reload.'));
    return () => { live = false; };
  }, [rec, verses]);

  // Open on the first verse still without a recording.
  const openedRef = useRef(false);
  useEffect(() => {
    if (!rec || openedRef.current || !verses.length) return;
    openedRef.current = true;
    const first = verses.findIndex(([s, a]) => !rec.recordings[`${s}:${a}`]);
    setIdx(first >= 0 ? first : 0);
  }, [rec, verses]);

  const stopAudio = () => {
    minshawiRef.current?.pause(); setMinshawiPlaying(false);
    mineRef.current?.pause(); setMinePlaying(false);
    prevRef.current?.pause(); setPrevPlaying(false);
  };
  useEffect(() => { stopAudio(); }, [idx]);

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
  };
  useEffect(() => () => { releaseMic(); stopAudio(); }, []);

  const editable = !!rec && (rec.status === 'assigned' || rec.status === 'needs_revision') && !rec.purgedAt;

  const playMinshawi = () => {
    if (!verses[idx] || take === 'recording') return;
    const a = minshawiRef.current ?? (minshawiRef.current = new Audio());
    if (minshawiPlaying) { a.pause(); setMinshawiPlaying(false); return; }
    mineRef.current?.pause(); setMinePlaying(false);
    prevRef.current?.pause(); setPrevPlaying(false);
    a.src = audioUrl(verses[idx][0], verses[idx][1]);
    a.onended = () => setMinshawiPlaying(false);
    a.onerror = () => { setMinshawiPlaying(false); setError('The recitation could not be played.'); };
    a.play().then(() => setMinshawiPlaying(true)).catch(() => setMinshawiPlaying(false));
  };

  /** The take the teacher reviewed and marked — from the homework this one redoes. */
  const playPrev = () => {
    const url = prevRec?.recordings[rec?.kind === 'hifz' ? WHOLE_TAKE : key]?.url;
    if (!url || take === 'recording') return;
    const a = prevRef.current ?? (prevRef.current = new Audio());
    if (prevPlaying) { a.pause(); setPrevPlaying(false); return; }
    minshawiRef.current?.pause(); setMinshawiPlaying(false);
    mineRef.current?.pause(); setMinePlaying(false);
    a.src = url;
    a.onended = () => setPrevPlaying(false);
    a.play().then(() => setPrevPlaying(true)).catch(() => setPrevPlaying(false));
  };

  const playMine = () => {
    const k = rec?.kind === 'hifz' ? WHOLE_TAKE : key;
    const url = localUrls.current[k] ?? rec?.recordings[k]?.url;
    if (!url) return;
    const a = mineRef.current ?? (mineRef.current = new Audio());
    if (minePlaying) { a.pause(); setMinePlaying(false); return; }
    minshawiRef.current?.pause(); setMinshawiPlaying(false);
    prevRef.current?.pause(); setPrevPlaying(false);
    a.src = url;
    a.onended = () => setMinePlaying(false);
    a.play().then(() => setMinePlaying(true)).catch(() => setMinePlaying(false));
  };

  const startRecording = async () => {
    if (!rec || (!verses[idx] && rec.kind !== 'hifz')) return;
    // Re-entrancy guard: getUserMedia is async, so a double tap could otherwise
    // start two recorders — and the one we forget about keeps the mic open and
    // keeps emitting chunks into every later take.
    if (startingRef.current || take !== 'idle') return;
    startingRef.current = true;
    try {
      await beginRecording();
    } finally {
      startingRef.current = false;
    }
  };

  const beginRecording = async () => {
    if (!rec || (!verses[idx] && rec.kind !== 'hifz')) return;
    const whole = rec.kind === 'hifz';
    setError('');
    stopAudio();
    // Retire any recorder still alive from an earlier take before opening a new one.
    const stale = recorderRef.current;
    if (stale) {
      stale.ondataavailable = null;
      stale.onstop = null;
      if (stale.state !== 'inactive') { try { stale.stop(); } catch { /* already gone */ } }
      recorderRef.current = null;
    }
    releaseMic();
    const mime = pickRecorderMime();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Try Chrome or Safari.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError('Allow microphone access to record your recitation (check the browser’s site settings).');
      return;
    }
    streamRef.current = stream;
    const [s, a] = verses[idx] ?? [rec.startSurah, rec.startAyah];
    const r = mime
      ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: RECORDER_BITRATE })
      : new MediaRecorder(stream, { audioBitsPerSecond: RECORDER_BITRATE });
    // Each take gets its OWN chunk array. A shared one lets the previous
    // recorder's final flush — which arrives after stop(), once this take has
    // already begun — land at the head of the new take, leaving a file whose
    // container header starts thousands of bytes in. Nothing can play that.
    const chunks: Blob[] = [];
    r.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      releaseMic();
      const ms = Date.now() - startedAtRef.current;
      const blob = new Blob(chunks, { type: r.mimeType || mime || 'audio/webm' });
      if (blob.size === 0 || ms < 400) { setTake('idle'); setError('That recording was empty — hold on a moment longer and try again.'); return; }
      const k = whole ? WHOLE_TAKE : `${s}:${a}`;
      if (localUrls.current[k]) URL.revokeObjectURL(localUrls.current[k]);
      localUrls.current[k] = URL.createObjectURL(blob);
      setTake('saving');
      const saved = whole
        ? await saveWholeRecording(rec.id, blob, ms)
        : await saveVerseRecording(rec.id, s, a, blob, ms);
      setTake('idle');
      if (saved) setRec(saved);
      else setError('Your recording could not be saved — check your connection and record again.');
    };
    recorderRef.current = r;
    startedAtRef.current = Date.now();
    setElapsed(0);
    r.start(1000);
    setTake('recording');
    tickRef.current = window.setInterval(() => {
      const e = Date.now() - startedAtRef.current;
      setElapsed(e);
      if (e >= MAX_TAKE_MS) stopRecording();
    }, 250);
  };

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }, []);

  const submit = async () => {
    if (!rec) return;
    setSubmitting(true);
    const done = await submitRecitationHomework(rec);
    setSubmitting(false);
    if (done) setRec(done);
    else setError('Could not submit — check your connection and try again.');
  };

  // ── Screens ───────────────────────────────────────────────────────────────
  const P = PALETTES[theme];
  const DISPLAY = "'Fraunces', Georgia, serif";
  const BODY = "'Figtree', system-ui, sans-serif";

  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh]" style={{ background: P.page, color: P.ink, fontFamily: BODY }}>{children}</div>
  );
  if (rec === undefined) return shell(<p className="text-center py-24" style={{ color: P.faint }}>Loading your homework…</p>);
  if (!rec) return shell(
    <div className="text-center py-24 px-4">
      <p className="font-bold text-lg" style={{ fontFamily: DISPLAY }}>Homework not found</p>
      <p className="text-sm" style={{ color: P.muted }}>It may have been removed — ask your teacher for a new link.</p>
    </div>,
  );

  const isHifz = rec.kind === 'hifz';
  const wholeTake = rec.recordings[WHOLE_TAKE];
  const allRecorded = isFullyRecorded(rec);
  // Hifz has one take for the whole range, so the ring is all-or-nothing.
  const recordedCount = isHifz
    ? (wholeTake ? verses.length : 0)
    : verses.filter(([vs, va]) => rec.recordings[`${vs}:${va}`]).length;
  const [s, a] = verses[idx] ?? [rec.startSurah, rec.startAyah];
  const text = texts[key];
  const takeKey = isHifz ? WHOLE_TAKE : key;
  const hasTake = !!(localUrls.current[takeKey] || rec.recordings[takeKey]);
  const takeMs = rec.recordings[takeKey]?.ms;
  const surahName = QURAN_METADATA.find(m => m.number === s);
  const portalLink = rec.reportId ? portalHomeworkUrl(rec.reportId, rec.homeworkId) : null;
  const pct = verses.length ? recordedCount / verses.length : 0;

  // Back: return to where they came from inside the app (the portal's homework
  // tab, the tutor's page); opened fresh — a link, a push notification, a new
  // tab — go to their main page instead: the tutor's app, or the student's portal.
  const goBack = () => {
    stopAudio();
    let fromHere = false;
    try { fromHere = !!document.referrer && new URL(document.referrer).origin === window.location.origin; } catch { /* bad referrer */ }
    if (fromHere && window.history.length > 1) { window.history.back(); return; }
    window.location.href = isTutor ? '/' : rec.reportId ? `/report/${rec.reportId}` : '/';
  };
  const multiSurah = rec.startSurah !== rec.endSurah;

  // A reassigned homework carries the tutor's logged mistakes. Keys are the
  // live page's: surah:ayah:word[:letter], word counted by splitVerseWords and
  // letter by parseWordIntoLetters — the same split the Mistakes page uses.
  // Live marks first; the copy saved on a reassigned homework only if the live
  // lookup is unavailable.
  const mistakes: Record<string, Mistake> = liveMistakes ?? rec.mistakes ?? {};
  // Comment pills sit above their letter; at the normal spacing they covered the
  // line above (measured), so a verse with comments gets taller lines. Mark
  // overlays are positioned from the line height, so it is passed to them too.
  // The take the teacher reviewed, for this verse (gone once audio is purged).
  const prevTake = prevRec && !prevRec.purgedAt ? prevRec.recordings[takeKey] : undefined;
  const verseHasComments = Object.entries(mistakes).some(([k, m]) => k.startsWith(`${s}:${a}:`) && m?.errorText);
  // The gap has to fit one comment pill (fixed px) under a verse sized in vw,
  // so it is worked out in px and turned back into a line-height ratio. The
  // numbers mirror the two clamp()s below: verse clamp(2.4rem, 6.2vw, 6.5rem),
  // pill clamp(11px, 1.6vw, 15px); a pill is ~1.25 lines + padding + border.
  const versePx = Math.min(104, Math.max(38.4, vw * 0.062));
  const pillPx = Math.min(15, Math.max(11, vw * 0.016));
  const LH = verseHasComments ? Math.round((2.1 + (pillPx * 1.25 + 22) / versePx) * 100) / 100 : 2.1;
  const verseMistakeCount = Object.entries(mistakes)
    .filter(([k, m]) => k.startsWith(`${s}:${a}:`) && m?.errorType).length;

  // Exactly the tutor's Quran page: pink + red underline for reading, green +
  // green underline for tajweed, yellow for a mark whose type was cleared.
  const letterStyle = (m: Mistake): React.CSSProperties =>
    m.errorType === 'tajweed' ? { backgroundColor: 'rgba(134,239,172,0.70)', borderBottom: '2px solid #16a34a', borderRadius: 3 }
    : m.errorType === 'reading' ? { backgroundColor: 'rgba(252,165,165,0.75)', borderBottom: '2px solid #dc2626', borderRadius: 3 }
    : { backgroundColor: 'rgba(254,240,138,0.80)', borderBottom: '2px solid #ca8a04', borderRadius: 3 };
  // Whole-word marks by click count, as on the Quran page.
  const wordLevelBg = (level: number) =>
    level === 3 ? 'rgba(254,202,202,0.70)' : level === 2 || level === 4 ? 'rgba(254,215,170,0.70)' : 'rgba(254,240,138,0.70)';
  const night = theme === 'night';
  const bubble = (m: Mistake) => m.errorText ? (
    <span aria-hidden="true" className="absolute left-1/2 pointer-events-none"
      style={{
        bottom: '100%', transform: 'translateX(-50%)', marginBottom: 4, zIndex: 20,
        fontFamily: BODY, fontSize: 'clamp(11px, 1.6vw, 15px)', fontWeight: 600, lineHeight: 1.25,
        whiteSpace: 'nowrap', padding: '2px 9px', borderRadius: 8, boxShadow: '0 4px 10px rgba(0,0,0,.12)',
        ...(m.errorType === 'tajweed'
          ? night ? { background: 'rgba(20,83,45,.75)', color: '#BBF7D0', border: '2px solid #15803D' }
                  : { background: '#DCFCE7', color: '#166534', border: '2px solid #86EFAC' }
          : night ? { background: 'rgba(127,29,29,.75)', color: '#FECACA', border: '2px solid #B91C1C' }
                  : { background: '#FEE2E2', color: '#991B1B', border: '2px solid #FCA5A5' }),
      }}>
      {m.errorText}
    </span>
  ) : null;

  const markedWord = (word: string, wi: number, vs: number = s, va: number = a, lh: number = LH): React.ReactNode => {
    const wordKey = `${vs}:${va}:${wi}`;
    const letters = parseWordIntoLetters(word);
    const hasLetterMistake = letters.some(l => mistakes[`${wordKey}:${l.index}`]);
    const wordMistake = mistakes[wordKey];

    if (!hasLetterMistake) {
      if (!wordMistake) return renderWordWithMarks(word, `r${vs}-${va}-${wi}`, lh);
      return (
        <span className="relative inline rounded-lg"
          style={wordMistake.errorType ? letterStyle(wordMistake) : { background: wordLevelBg(wordMistake.level), borderRadius: 8 }}>
          {bubble(wordMistake)}
          {renderWordWithMarks(word, `r${vs}-${va}-${wi}`, lh)}
        </span>
      );
    }

    // Letter by letter, exactly as the Mistakes page draws it, so the highlight
    // sits on the letter the tutor marked and the word still joins up.
    const plan = wordMarkPlan(word);
    return (
      <span className="relative inline"
        style={{ display: 'inline', whiteSpace: 'nowrap', letterSpacing: 0,
          fontFamily: plan.mode === 'wholeWord' ? plan.font : 'inherit' }}>
        {letters.map(({ letter, index }) => {
          const m = mistakes[`${wordKey}:${index}`];
          // A stopping sign sits beside the letter, never inside its span —
          // iOS clips it to a sliver otherwise (see splitTrailingWaqf).
          const { glyph, waqf } = splitTrailingWaqf(letter);
          return (
            <span key={index} className="relative inline" style={{ display: 'inline', margin: 0, padding: 0 }}>
              {m && bubble(m)}
              <span className="relative inline" style={{ display: 'inline', ...(m ? letterStyle(m) : {}) }}>
                {hasLowMeem(glyph) ? renderLowMeemUnit(glyph, glyph, lh) : almSeedForUnit(glyph) + glyph}
              </span>
              {waqf && <span style={WAQF_STYLE}>{waqf}</span>}
            </span>
          );
        })}
      </span>
    );
  };

  const eyebrow = rec.status === 'submitted' ? 'Submitted' : rec.status === 'passed' ? 'Passed'
    : rec.status === 'needs_revision' ? 'Needs revision' : isHifz ? 'Hifz homework' : 'Recitation homework';
  const subline = rec.status === 'submitted' ? 'Your teacher will listen and review it.'
    : rec.status === 'passed' ? 'Your teacher reviewed this homework — well done.'
    : isHifz ? (allRecorded
        ? 'Recorded — listen back once more, then send it to your teacher'
        : `Recite all ${verses.length} verse${verses.length === 1 ? '' : 's'} from memory in one recording`)
    : allRecorded ? `All ${verses.length} verses recorded — listen back once more, then send it to your teacher`
    : `${recordedCount} of ${verses.length} verses recorded`;
  const notice = rec.status === 'needs_revision'
    ? 'Your teacher left notes on this homework. Look at the mistakes in your Quran page, then record the verses again and resubmit.'
    : rec.status === 'passed' && portalLink ? 'See any notes your teacher left in your Quran page.'
    : null;

  // ── Pieces ──
  const svg = (children: React.ReactNode, size = 24, fill = false) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
  const I = {
    mic: svg(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><path d="M12 18v4" /></>, 34),
    stop: svg(<rect x="6" y="6" width="12" height="12" rx="2.5" />, 28, true),
    play: svg(<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />, 32, true),
    pause: svg(<><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></>, 30, true),
    send: svg(<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></>, 26),
    prev: svg(<path d="m15 18-6-6 6-6" />),
    next: svg(<path d="m9 18 6-6-6-6" />),
    speaker: svg(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>, 18),
    sun: svg(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>, 20),
    moon: svg(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />, 20),
  };

  /** Icon-only buttons: the label shows on hover and is the accessible name. */
  const withTip = (tip: string, button: React.ReactNode, place: 'above' | 'below' | 'below-end' = 'above') => (
    <span className="group relative inline-flex">
      {button}
      <span role="tooltip"
        className={`pointer-events-none absolute z-40 whitespace-nowrap rounded-[10px] px-3 py-1.5 text-[13px] font-semibold shadow-lg opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 ${
          place === 'above' ? 'bottom-full mb-3 left-1/2 -translate-x-1/2' : place === 'below' ? 'top-full mt-3 left-1/2 -translate-x-1/2' : 'top-full mt-3 right-0'}`}
        style={{ background: P.tip, color: P.tipInk }}>
        {tip}
      </span>
    </span>
  );

  const bigRound = 'relative flex items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100 w-[4.75rem] h-[4.75rem] sm:w-[5.75rem] sm:h-[5.75rem]';
  const smallRound = 'flex items-center justify-center rounded-full transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 w-12 h-12 sm:w-14 sm:h-14';

  const ring = (size: number, stroke: number) => {
    const r = (size - stroke) / 2 - 1;
    const c = 2 * Math.PI * r;
    return (
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={P.track} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            stroke={rec.status === 'needs_revision' ? P.gold : P.primary}
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dashoffset .5s ease' }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-bold tabular-nums" style={{ fontSize: size > 60 ? 17 : 13 }}>
          {recordedCount}/{verses.length}
        </span>
      </div>
    );
  };

  const bars = (color: string, on: boolean) => (
    <span aria-hidden="true" className="inline-flex items-center gap-[3px] h-5">
      {[0.45, 0.8, 1, 0.6, 0.9, 0.5, 0.75].map((h, i) => (
        <span key={i} className={`w-[3px] rounded-full ${on ? 'rh-bar' : ''}`}
          style={{ background: color, height: on ? undefined : `${h * 100}%`, animationDelay: `${i * 0.09}s` }} />
      ))}
    </span>
  );

  /** Hifz: the verses of the range, each holding back all but its first word. */
  const hifzStage = (
    <div className="flex-grow flex flex-col gap-2.5 sm:gap-3">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-1">
        <span className="text-[12px] sm:text-[14px] font-semibold tracking-[0.06em]" style={{ color: P.goldInk }}>
          {blind ? 'Every verse is hidden' : 'Only the first word of each verse'}
        </span>
        <span className="flex-grow" />
        {revealed.size > 0 && (
          <button onClick={() => setRevealed(new Set())}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
            style={{ background: P.ghost, border: `1.5px solid ${P.ghostBorder}`, color: P.ghostInk, fontFamily: BODY }}>
            Close the {revealed.size} open verse{revealed.size === 1 ? '' : 's'}
          </button>
        )}
        <button onClick={() => { setBlind(b => !b); setRevealed(new Set()); }}
          aria-pressed={blind}
          className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
          style={blind
            ? { background: P.primary, color: P.onPrimary, border: `1.5px solid ${P.primary}`, fontFamily: BODY }
            : { background: P.ghost, border: `1.5px solid ${P.ghostBorder}`, color: P.ghostInk, fontFamily: BODY }}>
          {blind ? 'Show the first words' : 'Hide everything'}
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:gap-2.5">
        {verses.map(([vs, va]) => {
          const vk = `${vs}:${va}`;
          const vText = texts[vk];
          const open = revealed.has(vk);
          const words = vText ? splitVerseWords(vText) : [];
          const firstWord = words.findIndex(w => parseWordIntoLetters(w).length > 0);
          const marks = Object.entries(mistakes).filter(([k, mm]) => k.startsWith(`${vk}:`) && mm?.errorType).length;
          return (
            <button key={vk}
              onClick={() => setRevealed(prev => {
                const next = new Set(prev);
                if (next.has(vk)) next.delete(vk); else next.add(vk);
                return next;
              })}
              disabled={!vText}
              aria-expanded={open}
              aria-label={`${QURAN_METADATA.find(m => m.number === vs)?.transliteratedName} verse ${va}${open ? ', open' : ', hidden — tap to reveal'}`}
              className="w-full text-start rounded-[18px] sm:rounded-[22px] px-3 sm:px-6 py-3 sm:py-5 transition-colors"
              style={{ background: P.stage, border: `${theme === 'morning' ? 2 : 1}px solid ${open ? P.primary : P.stageBorder}` }}>
              <span className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center justify-center rounded-full text-[12px] font-bold tabular-nums"
                  style={{ minWidth: 26, height: 26, padding: '0 6px', border: `2px solid ${P.gold}`, color: P.goldInk, fontFamily: BODY }}>
                  {va}
                </span>
                {multiSurah && (
                  <span className="text-[12px] font-semibold" style={{ color: P.faint }}>
                    {QURAN_METADATA.find(m => m.number === vs)?.transliteratedName}
                  </span>
                )}
                {marks > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ background: 'rgba(239,68,68,0.12)', color: theme === 'night' ? '#FCA5A5' : '#B91C1C', fontFamily: BODY }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#DC2626' }} />
                    {marks} mistake{marks === 1 ? '' : 's'}
                  </span>
                )}
                <span className="flex-grow" />
                <span className="text-[12px] font-semibold" style={{ color: P.faint, fontFamily: BODY }}>
                  {open ? 'tap to hide' : 'tap to reveal'}
                </span>
              </span>

              {!vText ? (
                <span className="block py-3 text-[14px]" style={{ color: P.faint }}>Loading…</span>
              ) : (
                <p dir="rtl" lang="ar" className="font-quranic m-0 break-words text-center"
                  style={{ color: P.verseInk, fontSize: 'clamp(1.7rem, 4.4vw, 3.4rem)', lineHeight: 2.1 }}>
                  {open ? (<>
                    {words.map((w, i) => (
                      <React.Fragment key={i}>{markedWord(w, i, vs, va, 2.1)}{i < words.length - 1 ? ' ' : ''}</React.Fragment>
                    ))}
                    {' '}
                    <span className="inline-flex items-center justify-center rounded-full align-middle whitespace-nowrap"
                      style={{ minWidth: '1.35em', height: '1.35em', padding: '0 0.25em', fontSize: '0.4em', lineHeight: 1, border: `3px solid ${P.gold}`, color: P.goldInk, fontFamily: BODY, fontWeight: 700 }}>
                      {toArabicDigits(va)}
                    </span>
                  </>) : blind ? (
                    <span style={{ color: P.faint, letterSpacing: '0.35em' }}>• • • • •</span>
                  ) : (<>
                    {firstWord >= 0 ? markedWord(words[firstWord], firstWord, vs, va, 2.1) : null}
                    <span style={{ color: P.faint }}>{'  '}…</span>
                  </>)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const liveLine = take === 'recording'
    ? { color: P.recording, text: `Recording · ${fmtSecs(elapsed)}` }
    : take === 'saving' ? { color: P.faint, text: 'Saving your recording…' }
    : minePlaying ? { color: P.mine, text: `Playing your recitation${takeMs ? ` · ${fmtSecs(takeMs)}` : ''}` }
    : null;

  return shell(
    <div className="w-full px-3 sm:px-8 lg:px-14 py-4 sm:py-8 flex flex-col gap-3 sm:gap-6 min-h-[100dvh]">
      <style>{`
        @keyframes rh-bar { 0%,100% { height: 30% } 50% { height: 100% } }
        .rh-bar { animation: rh-bar .8s ease-in-out infinite; }
        @keyframes rh-halo { 0% { transform: scale(1); opacity: .45 } 100% { transform: scale(1.55); opacity: 0 } }
        .rh-halo { animation: rh-halo 1.3s ease-out infinite; }
      `}</style>

      {/* ── Header: progress, title, tools, submit, verse chips ── */}
      <header className="rounded-[24px] sm:rounded-[28px] px-4 sm:px-8 py-4 sm:py-6 flex flex-col gap-3 sm:gap-5"
        style={{ background: P.card, border: `1px solid ${P.cardBorder}` }}>
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-6">
          {withTip(isTutor ? 'Back to LisanQuran' : 'Back to my page',
            <button onClick={goBack} disabled={take !== 'idle'}
              aria-label={isTutor ? 'Back to LisanQuran' : 'Back to my Quran page'}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors flex-shrink-0 disabled:opacity-40"
              style={{ background: P.ghost, border: `1.5px solid ${P.ghostBorder}`, color: P.ghostInk }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>, 'below')}
          <span className="hidden sm:block">{ring(76, 8)}</span>
          <span className="sm:hidden">{ring(52, 6)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] sm:text-[13px] font-bold uppercase tracking-[0.15em]" style={{ color: rec.status === 'needs_revision' ? P.gold : P.goldInk }}>{eyebrow}</p>
            <h1 className="m-0 text-[20px] sm:text-[clamp(1.6rem,2.6vw,2.25rem)] font-bold leading-tight break-words" style={{ fontFamily: DISPLAY }}>{rangeLabel(rec)}</h1>
            <p className="hidden sm:block text-[15px] mt-0.5" style={{ color: P.muted }}>
              {rec.studentName ? `${rec.studentName} · ` : ''}{subline}
            </p>
          </div>

          {/* Tools: day/night + font. On phones they get their own row under the title. */}
          <div className="order-last sm:order-none basis-full sm:basis-auto flex items-center justify-end gap-2 sm:gap-3 -mt-1 sm:mt-0">
          {withTip(theme === 'morning' ? 'Night mode' : 'Day mode',
            <button onClick={() => setTheme(t => (t === 'morning' ? 'night' : 'morning'))}
              aria-label={theme === 'morning' ? 'Switch to night mode' : 'Switch to day mode'}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors"
              style={{ background: P.ghost, border: `1.5px solid ${P.ghostBorder}`, color: P.ghostInk }}>
              {theme === 'morning' ? I.moon : I.sun}
            </button>, 'below')}

          {/* Quran font */}
          <span className="relative inline-flex">
            {withTip('Quran font',
              <button onClick={() => setFontMenuOpen(o => !o)} aria-label="Choose the Quran font" aria-expanded={fontMenuOpen}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-colors"
                style={{ background: fontMenuOpen ? P.goldSoft : P.ghost, border: `1.5px solid ${fontMenuOpen ? P.gold : P.ghostBorder}`, color: P.ghostInk }}>
                <span className="font-quranic text-[22px] leading-none" style={{ marginTop: -4 }}>ع</span>
              </button>, 'below')}
            {fontMenuOpen && (
              <>
                <span className="fixed inset-0 z-40" onClick={() => setFontMenuOpen(false)} />
                <span role="menu" className="absolute right-0 top-full mt-3 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-2xl"
                  style={{ background: P.card, border: `1px solid ${P.cardBorder}` }}>
                  <span className="block px-3 pt-1 pb-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: P.faint }}>Quran font</span>
                  {FONT_OPTIONS.map(f => (
                    <button key={f.name} role="menuitemradio" aria-checked={quranFont === f.name}
                      onClick={() => { pickFont(f.name); setFontMenuOpen(false); }}
                      className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors"
                      style={{ background: quranFont === f.name ? P.goldSoft : 'transparent', color: P.ink }}>
                      <span className="min-w-0 text-[13px] font-semibold truncate">{f.displayName}</span>
                      <span dir="rtl" className="flex-shrink-0 whitespace-nowrap text-[20px] leading-none" style={{ fontFamily: `'${f.name}', serif`, color: P.verseInk }}>بِسۡمِ ٱللَّهِ</span>
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
          </div>

          {/* Submit */}
          {editable && withTip(
            submitting ? 'Submitting…' : allRecorded ? (rec.status === 'needs_revision' ? 'Resubmit homework' : 'Submit homework')
              : `Record all verses to submit (${verses.length - recordedCount} left)`,
            <button onClick={submit} disabled={!allRecorded || submitting || take !== 'idle'}
              aria-label={allRecorded ? 'Submit homework' : 'Record all verses to submit'}
              className="relative flex items-center justify-center rounded-full w-[3.25rem] h-[3.25rem] sm:w-[4.5rem] sm:h-[4.5rem] transition-all active:scale-95 disabled:cursor-not-allowed"
              style={allRecorded
                ? { background: P.primary, color: P.onPrimary, border: `5px solid ${P.goldHalo}`, boxShadow: `0 0 0 8px ${theme === 'night' ? 'rgba(92,200,176,0.14)' : 'rgba(31,94,74,0.12)'}` }
                : { background: P.chipIdle, color: P.faint, border: `2px solid ${P.chipIdleBorder}` }}>
              {submitting ? <span className="w-7 h-7 rounded-full border-4 border-current border-t-transparent animate-spin" /> : I.send}
            </button>, 'below-end')}
        </div>

        {notice && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3 text-[14px] sm:text-[15px] leading-snug"
            style={{ background: P.noticeBg, border: `1px solid ${P.noticeBorder}`, color: P.noticeInk }}>
            <span className="flex-1 min-w-[14rem]">{notice}</span>
            {portalLink && <a href={portalLink} className="font-bold whitespace-nowrap" style={{ color: P.noticeInk }}>Open my Quran page →</a>}
          </div>
        )}
        {rec.purgedAt && (
          <p className="text-xs" style={{ color: P.faint }}>The recordings of this homework were cleared after the review to save space.</p>
        )}

        {/* Verse chips — centred, grouped by surah */}
        {!isHifz && (
        <nav aria-label="Verses" className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {verses.map(([vs, va], i) => {
            const done = !!rec.recordings[`${vs}:${va}`];
            const current = i === idx;
            const marked = Object.entries(mistakes).some(([k, mm]) => k.startsWith(`${vs}:${va}:`) && mm?.errorType);
            const newSurah = i === 0 || verses[i - 1][0] !== vs;
            return (
              <React.Fragment key={`${vs}:${va}`}>
                {multiSurah && newSurah && (
                  <>
                    {i > 0 && <span className="hidden sm:block w-px h-7 mx-2" style={{ background: P.cardBorder }} />}
                    <span className="hidden sm:inline text-[12px] font-bold uppercase tracking-[0.12em] pr-1" style={{ color: P.faint }}>
                      {QURAN_METADATA.find(m => m.number === vs)?.transliteratedName}
                    </span>
                  </>
                )}
                <button onClick={() => take === 'idle' && setIdx(i)}
                  aria-label={`${QURAN_METADATA.find(m => m.number === vs)?.transliteratedName} verse ${va}${done ? ', recorded' : ''}${current ? ', current' : ''}${marked ? ', has mistakes' : ''}`}
                  aria-current={current ? 'step' : undefined}
                  className="relative rounded-full text-[14px] sm:text-[16px] font-bold tabular-nums transition-all w-[38px] h-[38px] sm:w-[46px] sm:h-[46px]"
                  style={current
                    ? { background: P.goldSoft, color: P.goldInk, border: `3px solid ${P.gold}`, boxShadow: `0 0 0 4px ${P.goldHalo}` }
                    : done
                      ? { background: P.chipDone, color: P.chipDoneInk, border: 'none' }
                      : { background: P.chipIdle, color: P.chipIdleInk, border: `1.5px solid ${P.chipIdleBorder}` }}>
                  {va}
                  {/* This verse has marks from the teacher — go look. */}
                  {marked && (
                    <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full"
                      style={{ background: '#DC2626', border: `2px solid ${P.card}` }} />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </nav>
        )}
      </header>

      {/* ── The verse — tap to hear Al-Minshawi ── */}
      <main className="flex-grow flex flex-col rounded-[24px] sm:rounded-[32px] p-2.5 sm:p-3.5" style={{ background: P.card, border: `1px solid ${P.cardBorder}` }}>
        {/* Reassigned homework: the take the teacher listened to and marked */}
        {prevTake && (
          <button onClick={playPrev} disabled={take === 'recording'}
            aria-label={prevPlaying ? 'Stop the recording your teacher checked' : 'Listen to the recording your teacher checked'}
            className="mb-2.5 sm:mb-3 flex items-center justify-center gap-2.5 rounded-[16px] px-4 py-2.5 text-[13px] sm:text-[15px] font-semibold transition-colors disabled:opacity-50"
            style={prevPlaying
              ? { background: P.gold, color: theme === 'night' ? '#1a1406' : '#fff', fontFamily: BODY }
              : { background: P.goldSoft, color: P.goldInk, border: `1.5px solid ${P.gold}`, fontFamily: BODY }}>
            {prevPlaying
              ? bars(theme === 'night' ? '#1a1406' : '#fff', true)
              : <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 flex-shrink-0" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>}
            <span>{prevPlaying ? 'Playing the recording your teacher checked · tap to stop' : 'Listen to the recording your teacher checked'}</span>
            <span className="tabular-nums opacity-75">{fmtSecs(prevTake.ms)}</span>
          </button>
        )}
        {isHifz ? hifzStage : (
        <button onClick={playMinshawi} disabled={take === 'recording' || !text}
          aria-label={`Play Al-Minshawi reciting ${surahName?.transliteratedName} verse ${a}`}
          className="flex-grow flex flex-col items-center justify-center gap-4 sm:gap-6 rounded-[18px] sm:rounded-[22px] px-3 sm:px-10 py-6 sm:py-10 transition-colors"
          style={{ background: P.stage, border: `${theme === 'morning' ? 2 : 1}px solid ${minshawiPlaying ? P.primary : P.stageBorder}` }}>
          <span className="flex items-center gap-3 text-[12px] sm:text-[14px] font-semibold tracking-[0.06em]" style={{ color: P.goldInk }}>
            <span className="hidden sm:block w-10 h-px" style={{ background: P.gold }} />
            {surahName?.transliteratedName} · Verse {a}
            <span className="hidden sm:block w-10 h-px" style={{ background: P.gold }} />
          </span>
          {verseMistakeCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] sm:text-[14px] font-bold"
              style={{ background: 'rgba(239,68,68,0.12)', color: theme === 'night' ? '#FCA5A5' : '#B91C1C', fontFamily: BODY }}>
              <span className="w-2 h-2 rounded-full" style={{ background: '#DC2626' }} />
              Your teacher marked {verseMistakeCount} mistake{verseMistakeCount === 1 ? '' : 's'} here — fix {verseMistakeCount === 1 ? 'it' : 'them'}, then record again
            </span>
          )}
          {text ? (
            <p dir="rtl" lang="ar" className="font-quranic m-0 text-center break-words"
              style={{ color: P.verseInk, fontSize: 'clamp(2.4rem, 6.2vw, 6.5rem)', lineHeight: LH }}>
              {splitVerseWords(text).map((w, i, arr) => (
                <React.Fragment key={i}>{markedWord(w, i)}{i < arr.length - 1 ? ' ' : ''}</React.Fragment>
              ))}
              {' '}
              <span className="inline-flex items-center justify-center rounded-full align-middle whitespace-nowrap"
                style={{ minWidth: '1.35em', height: '1.35em', padding: '0 0.25em', fontSize: '0.4em', lineHeight: 1, border: `3px solid ${P.gold}`, color: P.goldInk, fontFamily: BODY, fontWeight: 700 }}>
                {toArabicDigits(a)}
              </span>
            </p>
          ) : (
            <p className="py-16" style={{ color: P.faint }}>Loading the verse…</p>
          )}
          <span className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-[13px] sm:text-[15px] font-semibold"
            style={minshawiPlaying ? { background: P.primary, color: P.onPrimary } : { background: P.hint, color: P.hintInk }}>
            {minshawiPlaying ? bars(P.onPrimary, true) : I.speaker}
            {minshawiPlaying ? 'Al-Minshawi is reciting · tap to stop' : 'Tap the verse to hear Al-Minshawi'}
          </span>
        </button>
        )}
      </main>

      {/* ── Controls — pinned to the bottom while a long verse scrolls ── */}
      <footer className="sticky bottom-2 sm:bottom-5 z-30 rounded-[24px] px-3 sm:px-6 py-3 sm:py-4 flex flex-col items-center gap-2.5"
        style={{
          background: P.card,
          border: `1px solid ${take === 'recording' ? P.recordingSoft : P.cardBorder}`,
          boxShadow: theme === 'night' ? '0 18px 40px -20px rgba(0,0,0,.8)' : '0 18px 40px -22px rgba(120,90,40,.45)',
        }}>
        {liveLine && (
          <div aria-live="polite" className="flex items-center gap-3 text-[14px] font-bold tabular-nums" style={{ color: liveLine.color }}>
            {take === 'recording' && <span className="w-2.5 h-2.5 rounded-full" style={{ background: P.recording }} />}
            {liveLine.text}
            {(take === 'recording' || minePlaying) && bars(liveLine.color, true)}
          </div>
        )}
        <div className="flex items-center justify-center gap-4 sm:gap-7">
          {!isHifz && withTip('Previous verse',
            <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0 || take !== 'idle'} aria-label="Previous verse"
              className={smallRound} style={{ background: P.ghost, border: `1.5px solid ${P.ghostBorder}`, color: P.ghostInk }}>
              {I.prev}
            </button>)}

          {take === 'recording'
            ? withTip('Stop recording',
              <button onClick={stopRecording} aria-label="Stop recording" className={bigRound}
                style={{ background: P.recording, color: P.recordInk === '#1A0B10' ? '#fff' : P.recordInk, border: `7px solid ${P.recordingSoft}` }}>
                <span className="absolute -inset-2 rounded-full rh-halo" style={{ background: P.recording }} />
                <span className="relative">{I.stop}</span>
              </button>)
            : withTip(take === 'saving' ? 'Saving…' : hasTake ? 'Record again'
                : isHifz ? 'Record the whole range from memory' : 'Record my recitation',
              <button onClick={startRecording} disabled={!editable || take === 'saving' || (isHifz ? !Object.keys(texts).length : !text)}
                aria-label={hasTake ? 'Record again' : 'Record my recitation'} className={bigRound}
                style={{
                  background: P.record, color: P.recordInk, border: `6px solid ${P.recordRing}`,
                  boxShadow: theme === 'morning' ? '0 14px 30px -12px rgba(181,69,47,.7)' : '0 14px 30px -12px rgba(224,103,122,.5)',
                  opacity: !editable || (isHifz ? !Object.keys(texts).length : !text) ? 0.45 : 1,
                }}>
                {take === 'saving' ? <span className="w-8 h-8 rounded-full border-4 border-current border-t-transparent animate-spin" /> : I.mic}
              </button>)}

          {withTip(
            !hasTake ? 'Not recorded yet' : minePlaying ? 'Pause' : `Listen to my recitation${takeMs ? ` (${fmtSecs(takeMs)})` : ''}`,
            <button onClick={playMine} disabled={!hasTake || take !== 'idle'}
              aria-label={!hasTake ? 'My recitation — not recorded yet' : minePlaying ? 'Pause my recitation' : 'Listen to my recitation'}
              className={bigRound}
              style={{
                background: P.mine, color: P.mineInk, border: `6px solid ${P.mineRing}`,
                opacity: hasTake ? 1 : 0.45,
                boxShadow: minePlaying ? `0 0 0 8px ${theme === 'night' ? 'rgba(143,168,255,.16)' : 'rgba(47,122,98,.14)'}` : undefined,
              }}>
              {minePlaying ? I.pause : <span className="translate-x-0.5">{I.play}</span>}
            </button>)}

          {!isHifz && withTip('Next verse',
            <button onClick={() => setIdx(i => Math.min(verses.length - 1, i + 1))} disabled={idx >= verses.length - 1 || take !== 'idle'} aria-label="Next verse"
              className={smallRound} style={{ background: P.primary, color: P.onPrimary, border: 'none' }}>
              {I.next}
            </button>)}
        </div>
        {error && <p className="text-center text-[14px] font-semibold" style={{ color: P.recording }}>{error}</p>}
      </footer>
    </div>,
  );
};

export default RecitationHomeworkPage;
