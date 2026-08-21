// components/AdminQuranLabTab.tsx
// -----------------------------------------------------------------------------
// Quran Lab — two admin tools on one mushaf view:
//
//   Vowels     click a word → pick one of its marks → nudge it with the arrow
//              keys (live preview) → Save. Saved per FONT + letter unit to a
//              JSON in storage; the tutor page and every student portal apply
//              it when rendering (via unitOverlayPlan in quranicMarks).
//
//   Recording  record the tutor's own recitation verse by verse. Verse tap =
//              record that verse (3-2-1 countdown); ayah-number tap = chained
//              takes (Space/tap closes a verse and instantly arms the next).
//              Every take is mastered (see utils/recitationMastering) and
//              uploaded as one mp3 per verse. Listen mode plays them back.
//              Publish makes the recitation appear in the 🎙️ reciter picker.
// -----------------------------------------------------------------------------

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QURAN_METADATA } from '../constants';
import {
  splitVerseWords, tanweenOnSeatAlif, almSeedForUnit, unitOverlayPlan, renderUnitOverlays,
  marksInUnit, MARK_NAMES, BELOW_MARKS, VowelAdjMap, VowelAdjustment,
} from '../utils/quranicMarks';
import {
  loadVowelAdjustments, saveVowelAdjustments,
  loadRecitationManifest, saveRecitationManifest, RecitationManifest,
  recitationVerseUrl, uploadRecitationVerse,
} from '../services/quranLabService';
import { masterTake } from '../utils/recitationMastering';

// ── Local copies of the reader's letter segmentation (same as SharedReportPage) ──
const isArabicLetter = (char: string | undefined): boolean => {
  if (!char) return false;
  const c = char.charCodeAt(0);
  return (c >= 0x0621 && c <= 0x064A) || (c >= 0x0671 && c <= 0x06D3) || c === 0x06D5
    || (c >= 0x06EE && c <= 0x06EF) || (c >= 0x06FA && c <= 0x06FC);
};

const parseWordIntoLetters = (word: string): Array<{ letter: string; index: number }> => {
  const letters: Array<{ letter: string; index: number }> = [];
  if (!word) return letters;
  word = tanweenOnSeatAlif(word);
  let letterIndex = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if (isArabicLetter(char)) {
      letters.push({ letter: char, index: letterIndex });
      letterIndex++;
    } else if (letters.length > 0) {
      letters[letters.length - 1].letter += char;
    } else {
      letters.push({ letter: char, index: letterIndex });
    }
  }
  return letters;
};

const ZWJ = '‍';
const NON_FORWARD_JOINING = new Set<string>(['ا', 'أ', 'إ', 'آ', 'ٱ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ء', 'ة', 'ى']);
const connectsForward = (ch: string): boolean => !!ch && isArabicLetter(ch) && !NON_FORWARD_JOINING.has(ch);

const toEastern = (n: number): string => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);

const FONTS = ['Hafs', 'Amiri Regular', 'Elgharib KFGQPCHafs V10', 'Elgharib HAFSTharwatEmara', 'UthmanTN v2-0', 'Uthmanic HAFS v22', 'Hamdullah'];

const TOTAL_AYAHS = 6236;

// ── Mastering effect levels (0–100, 50 = shipped default; 0 = stage off) ─────
interface FxLevels { echo: number; reverb: number; clarity: number; softness: number; compression: number; loudness: number }
const FX_DEFAULTS: FxLevels = { echo: 50, reverb: 50, clarity: 50, softness: 50, compression: 50, loudness: 50 };
const FX_CONTROLS: Array<{ key: keyof FxLevels; label: string; hint: string }> = [
  { key: 'echo',        label: 'Echo',     hint: 'Repeating echo — 0 = none, 50 = light, 100 = strong' },
  { key: 'reverb',      label: 'Reverb',   hint: 'Room space around the voice — 0 = dry, 100 = big hall' },
  { key: 'clarity',     label: 'Clarity',  hint: 'Presence lift that helps intelligibility' },
  { key: 'softness',    label: 'Softness', hint: 'Tames sharp س / ص / ش sibilance' },
  { key: 'compression', label: 'Evenness', hint: 'Steady studio volume — 0 keeps your natural dynamics' },
  { key: 'loudness',    label: 'Loudness', hint: 'Final level of the saved file' },
];

interface Verse { verse_key: string; text_uthmani: string }

type Tool = 'vowels' | 'recording';
type RecPhase =
  | { kind: 'idle' }
  | { kind: 'countdown'; ayah: number; n: number; chained: boolean }
  | { kind: 'recording'; ayah: number; chained: boolean; startedAt: number };

const AdminQuranLabTab: React.FC = () => {
  const [tool, setTool] = useState<Tool>('vowels');
  const [surah, setSurah] = useState(1);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Font must be declared before the verses effect below reads it.
  const [font, setFont] = useState(FONTS[0]);

  // ── Verses ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    setLoading(true); setError(null);
    fetch(font === 'Hamdullah'
      ? `/quran-tr/${surah}.json`
      : `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surah}`)
      .then(r => r.json())
      .then(d => { if (!dead) { setVerses(d.verses ?? []); setLoading(false); } })
      .catch(() => { if (!dead) { setError('Could not load the surah.'); setLoading(false); } });
    return () => { dead = true; };
  }, [surah, font]);

  // ══ VOWELS TOOL ═══════════════════════════════════════════════════════════
  const [adjMap, setAdjMap] = useState<VowelAdjMap>({});
  const [adjLoaded, setAdjLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    loadVowelAdjustments().then(m => { setAdjMap(m); setAdjLoaded(true); });
  }, []);

  /** Selected unit + mark being nudged. `work` is the live (unsaved) offset. */
  const [sel, setSel] = useState<{ letterKey: string; unit: string } | null>(null);
  const [pickedMark, setPickedMark] = useState<string | null>(null);
  const [work, setWork] = useState<VowelAdjustment>({ dx: 0, dy: 0 });
  const [dirty, setDirty] = useState(false);

  const savedAdjFor = (letterKey: string): Record<string, VowelAdjustment> | undefined =>
    adjMap[font]?.[letterKey];

  const beginPick = (mark: string) => {
    if (!sel) return;
    const existing = savedAdjFor(sel.letterKey)?.[mark];
    setPickedMark(mark);
    setWork(existing ?? { dx: 0, dy: BELOW_MARKS.has(mark) ? 0.55 : -0.45 });
    setDirty(!existing); // a fresh overlay is already a change worth saving
  };

  const closeEditor = () => { setSel(null); setPickedMark(null); setDirty(false); };

  // Arrow keys nudge the picked mark. Step 0.02em, Shift = 0.1em.
  useEffect(() => {
    if (!pickedMark) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      let handled = true;
      setWork(w => {
        switch (e.key) {
          case 'ArrowUp': return { ...w, dy: +(w.dy - step).toFixed(3) };
          case 'ArrowDown': return { ...w, dy: +(w.dy + step).toFixed(3) };
          case 'ArrowLeft': return { ...w, dx: +(w.dx - step).toFixed(3) };
          case 'ArrowRight': return { ...w, dx: +(w.dx + step).toFixed(3) };
          default: handled = false; return w;
        }
      });
      if (e.key === 'Escape') closeEditor();
      else if (handled) { e.preventDefault(); setDirty(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickedMark]);

  const persistMap = async (next: VowelAdjMap) => {
    setSaving(true);
    setAdjMap(next);
    const ok = await saveVowelAdjustments(next);
    setSaving(false);
    if (ok) { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); }
    else alert('Saving to storage failed — check the connection and try again.');
  };

  const saveCurrent = () => {
    if (!sel || !pickedMark) return;
    const next: VowelAdjMap = { ...adjMap, [font]: { ...(adjMap[font] ?? {}) } };
    next[font][sel.letterKey] = { ...(next[font][sel.letterKey] ?? {}), [pickedMark]: work };
    persistMap(next);
    setDirty(false);
  };

  const resetCurrent = () => {
    if (!sel || !pickedMark) return;
    const fontMap = { ...(adjMap[font] ?? {}) };
    const unitAdj = { ...(fontMap[sel.letterKey] ?? {}) };
    delete unitAdj[pickedMark];
    if (Object.keys(unitAdj).length) fontMap[sel.letterKey] = unitAdj;
    else delete fontMap[sel.letterKey];
    persistMap({ ...adjMap, [font]: fontMap });
    closeEditor();
  };

  // ══ RECORDING TOOL ════════════════════════════════════════════════════════
  const [recMode, setRecMode] = useState<'record' | 'listen'>('record');
  const [manifest, setManifest] = useState<RecitationManifest>({ published: false, verses: {} });
  const [manifestLoaded, setManifestLoaded] = useState(false);
  const [phase, setPhase] = useState<RecPhase>({ kind: 'idle' });
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [micError, setMicError] = useState<string | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>(() => { try { return localStorage.getItem('qlabMicId') || ''; } catch { return ''; } });
  const micIdRef = useRef(micId);
  micIdRef.current = micId;
  /** Label of the device ACTUALLY feeding the recorder (from the live track). */
  const [activeMicLabel, setActiveMicLabel] = useState('');
  const [fx, setFx] = useState<FxLevels>(() => {
    try {
      const raw = localStorage.getItem('qlabMasterFx');
      if (raw) return { ...FX_DEFAULTS, ...JSON.parse(raw) };
      // Migrate the old echo-only setting.
      const legacy = parseInt(localStorage.getItem('qlabEchoLevel') ?? '', 10);
      return Number.isFinite(legacy) ? { ...FX_DEFAULTS, echo: Math.max(0, Math.min(100, legacy)) } : FX_DEFAULTS;
    } catch { return FX_DEFAULTS; }
  });
  const fxRef = useRef(fx);
  fxRef.current = fx;
  useEffect(() => { try { localStorage.setItem('qlabMasterFx', JSON.stringify(fx)); } catch { /* private mode */ } }, [fx]);
  const [fxOpen, setFxOpen] = useState(false);
  const meterFillRef = useRef<HTMLDivElement | null>(null);
  const monitorCtxRef = useRef<AudioContext | null>(null);
  const monitorRafRef = useRef(0);
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [playSeq, setPlaySeq] = useState(false);
  const [recTick, setRecTick] = useState(0); // elapsed-seconds display while recording

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const phaseRef = useRef<RecPhase>(phase);
  phaseRef.current = phase;
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bustRef = useRef(Date.now()); // cache-bust re-recorded verses in this session

  useEffect(() => {
    loadRecitationManifest().then(m => { setManifest(m); setManifestLoaded(true); });
  }, []);

  // Elapsed timer while recording.
  useEffect(() => {
    if (phase.kind !== 'recording') return;
    const iv = setInterval(() => setRecTick(t => t + 1), 1000);
    setRecTick(0);
    return () => clearInterval(iv);
  }, [phase.kind === 'recording' ? (phase as { ayah: number }).ayah : -1, phase.kind]);

  const versesInThisSurah = QURAN_METADATA[surah - 1]?.numberOfAyahs ?? verses.length;

  const stopMeter = () => {
    cancelAnimationFrame(monitorRafRef.current);
    monitorCtxRef.current?.close().catch(() => { /* already closed */ });
    monitorCtxRef.current = null;
    if (meterFillRef.current) meterFillRef.current.style.width = '0%';
  };

  /** Live input level bar — the visible proof of WHICH mic is picking up. */
  const startMeter = (stream: MediaStream) => {
    stopMeter();
    try {
      const ctx = new AudioContext();
      monitorCtxRef.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an); // analyser only — never the speakers
      const buf = new Uint8Array(an.fftSize);
      const step = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
        if (meterFillRef.current) meterFillRef.current.style.width = `${Math.min(100, Math.round(peak * 140))}%`;
        monitorRafRef.current = requestAnimationFrame(step);
      };
      monitorRafRef.current = requestAnimationFrame(step);
    } catch { /* meter is best-effort */ }
  };

  const refreshMics = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setMics(devs.filter(d => d.kind === 'audioinput'));
    } catch { /* unsupported */ }
  }, []);

  // Keep the device list fresh (plugging in a DJI mic fires this).
  useEffect(() => {
    refreshMics();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshMics);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshMics);
  }, [refreshMics]);

  const ensureMic = async (): Promise<MediaStream | null> => {
    if (streamRef.current?.active) return streamRef.current;
    const base = {
      echoCancellation: false,   // nothing plays during a take; EC dulls recitation
      noiseSuppression: true,    // capture-side speech noise removal
      autoGainControl: true,
      channelCount: 1,
    };
    const wanted = micIdRef.current;
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: wanted ? { ...base, deviceId: { exact: wanted } } : base,
        });
      } catch (e) {
        // The chosen device is gone/unavailable — fall back to the default so
        // recording still works; the active-label line shows what's really used.
        if (wanted) stream = await navigator.mediaDevices.getUserMedia({ audio: base });
        else throw e;
      }
      streamRef.current = stream;
      setActiveMicLabel(stream.getAudioTracks()[0]?.label || 'Microphone');
      startMeter(stream);
      refreshMics(); // labels become available once permission is granted
      setMicError(null);
      return stream;
    } catch {
      setMicError('Microphone access was refused — allow it in the browser and try again.');
      return null;
    }
  };

  const stopMic = () => {
    stopMeter();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setActiveMicLabel('');
  };

  const onPickMic = async (id: string) => {
    setMicId(id);
    try { localStorage.setItem('qlabMicId', id); } catch { /* private mode */ }
    const cur = phaseRef.current;
    if (cur.kind !== 'idle') return; // never yank the device mid-take
    if (streamRef.current) { stopMic(); micIdRef.current = id; await ensureMic(); }
  };

  // Release the mic when leaving the tool / unmounting.
  useEffect(() => () => { try { recorderRef.current?.stop(); } catch { /* not recording */ } stopMic(); }, []);
  useEffect(() => { if (tool !== 'recording' || recMode !== 'record') { setPhase({ kind: 'idle' }); try { recorderRef.current?.stop(); } catch { /* idle */ } stopMic(); } }, [tool, recMode]);

  const beginTake = useCallback(async (ayah: number, chained: boolean, withCountdown: boolean) => {
    const stream = await ensureMic();
    if (!stream) return;
    if (withCountdown) {
      for (let n = 3; n >= 1; n--) {
        setPhase({ kind: 'countdown', ayah, n, chained });
        await new Promise(r => setTimeout(r, 700));
        // A newer click may have replaced this countdown.
        const cur = phaseRef.current;
        if (cur.kind !== 'countdown' || cur.ayah !== ayah) return;
      }
    }
    const rec = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const raw = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const key = `${surah}:${ayah}`;
      setProcessing(p => new Set(p).add(key));
      masterTake(raw, {
        echoLevel: fxRef.current.echo, reverbLevel: fxRef.current.reverb,
        clarityLevel: fxRef.current.clarity, softnessLevel: fxRef.current.softness,
        compressionLevel: fxRef.current.compression, loudnessLevel: fxRef.current.loudness,
      })
        .then(async ({ blob, durMs }) => {
          const ok = await uploadRecitationVerse(surah, ayah, blob);
          if (!ok) throw new Error('upload failed');
          const next: RecitationManifest = {
            ...manifestRef.current,
            verses: { ...manifestRef.current.verses, [key]: { d: durMs } },
          };
          setManifest(next);
          bustRef.current = Date.now();
          await saveRecitationManifest(next);
        })
        .catch(() => alert(`Verse ${key}: processing or upload failed — record it again.`))
        .finally(() => setProcessing(p => { const n = new Set(p); n.delete(key); return n; }));
    };
    recorderRef.current = rec;
    rec.start();
    setPhase({ kind: 'recording', ayah, chained, startedAt: Date.now() });
  }, [surah]);

  /** Finish the running take; in chained mode arm the next verse instantly. */
  const finishTake = useCallback((advance: boolean) => {
    const cur = phaseRef.current;
    if (cur.kind !== 'recording') return;
    try { recorderRef.current?.stop(); } catch { /* already stopped */ }
    recorderRef.current = null;
    if (advance && cur.chained && cur.ayah < versesInThisSurah) {
      beginTake(cur.ayah + 1, true, false);
    } else {
      setPhase({ kind: 'idle' });
      stopMic();
    }
  }, [beginTake, versesInThisSurah]);

  // Space = next verse, Enter/Escape = finish & save, while recording.
  useEffect(() => {
    if (tool !== 'recording') return;
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current.kind !== 'recording') return;
      if (e.key === ' ') { e.preventDefault(); finishTake(true); }
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); finishTake(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, finishTake]);

  const isRecorded = (ayah: number) => !!manifest.verses[`${surah}:${ayah}`];

  const playAyah = useCallback((ayah: number, sequential: boolean) => {
    const a = audioRef.current;
    if (!a) return;
    setPlaySeq(sequential);
    setPlayingAyah(ayah);
    a.src = recitationVerseUrl(surah, ayah, bustRef.current);
    a.play().catch(() => { setPlayingAyah(null); alert('Playback failed — is this verse recorded?'); });
  }, [surah]);

  const stopPlayback = () => {
    try { audioRef.current?.pause(); } catch { /* fine */ }
    setPlayingAyah(null); setPlaySeq(false);
  };

  const onPlaybackEnded = () => {
    if (!playSeq || playingAyah === null) { setPlayingAyah(null); return; }
    // Continue to the NEXT RECORDED verse in this surah.
    for (let a = playingAyah + 1; a <= versesInThisSurah; a++) {
      if (isRecorded(a)) { playAyah(a, true); return; }
    }
    setPlayingAyah(null); setPlaySeq(false);
  };

  const recordedCount = Object.keys(manifest.verses).length;

  const togglePublish = async () => {
    const next = { ...manifest, published: !manifest.published };
    setManifest(next);
    const ok = await saveRecitationManifest(next);
    if (!ok) { setManifest(manifest); alert('Could not update the publish flag.'); }
  };

  // ── Verse interaction dispatch ────────────────────────────────────────────
  const onVerseTap = (ayah: number) => {
    if (tool !== 'recording') return;
    if (recMode === 'listen') {
      if (playingAyah === ayah) stopPlayback(); else playAyah(ayah, false);
      return;
    }
    const cur = phaseRef.current;
    if (cur.kind === 'recording') { finishTake(cur.chained); return; }
    if (cur.kind === 'countdown') return;
    beginTake(ayah, false, true);
  };

  const onAyahNumberTap = (ayah: number) => {
    if (tool !== 'recording') return;
    if (recMode === 'listen') {
      if (playingAyah !== null) stopPlayback(); else playAyah(ayah, true);
      return;
    }
    const cur = phaseRef.current;
    if (cur.kind === 'recording') { finishTake(true); return; }
    if (cur.kind === 'countdown') return;
    beginTake(ayah, true, true);
  };

  // ── Rendering ─────────────────────────────────────────────────────────────
  const renderVowelWord = (word: string, verseKey: string, wordIdx: number) => {
    const letters = parseWordIntoLetters(word);
    if (!letters.length) return <span>{word}</span>;
    return (
      <span className="relative inline" style={{ display: 'inline' }}>
        {letters.map(({ letter, index: li }) => {
          const letterKey = `${verseKey}:${wordIdx}:${li}`;
          const joinLead = li > 0 && connectsForward(letters[li - 1].letter[0]);
          const joinTrail = li < letters.length - 1 && connectsForward(letter[0]);
          const text = almSeedForUnit(letter) + (joinLead ? ZWJ : '') + letter + (joinTrail ? ZWJ : '');
          // Live preview: the picked mark follows `work` before it is saved.
          let adj = savedAdjFor(letterKey);
          if (sel?.letterKey === letterKey && pickedMark) adj = { ...(adj ?? {}), [pickedMark]: work };
          const overlays = unitOverlayPlan(letter, 2.6, adj);
          const isSel = sel?.letterKey === letterKey;
          return (
            <span
              key={letterKey}
              onClick={() => { setSel({ letterKey, unit: letter }); setPickedMark(null); setDirty(false); }}
              className={`cursor-pointer transition-colors ${isSel ? 'bg-violet-200/70 dark:bg-violet-600/40 rounded' : 'hover:bg-violet-100/60 dark:hover:bg-violet-900/30'}`}
              style={{ display: 'inline' }}
            >
              {overlays ? renderUnitOverlays(text, overlays) : text}
            </span>
          );
        })}
      </span>
    );
  };

  const renderRecordingWord = (word: string) => {
    const letters = parseWordIntoLetters(word);
    if (!letters.length) return <span>{word}</span>;
    return (
      <span style={{ display: 'inline' }}>
        {letters.map(({ letter }, li) => {
          const overlays = unitOverlayPlan(letter, 2.6, undefined);
          const joinLead = li > 0 && connectsForward(letters[li - 1].letter[0]);
          const joinTrail = li < letters.length - 1 && connectsForward(letter[0]);
          const text = almSeedForUnit(letter) + (joinLead ? ZWJ : '') + letter + (joinTrail ? ZWJ : '');
          return <React.Fragment key={li}>{overlays ? renderUnitOverlays(text, overlays) : text}</React.Fragment>;
        })}
      </span>
    );
  };

  const selMarks = sel ? marksInUnit(sel.unit) : [];
  const activeRecordingAyah = phase.kind === 'recording' ? phase.ayah : phase.kind === 'countdown' ? phase.ayah : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Tool switch + shared controls ── */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <div className="flex rounded-full bg-slate-100 dark:bg-gray-700 p-1">
          {(['vowels', 'recording'] as const).map(k => (
            <button
              key={k}
              onClick={() => { setTool(k); closeEditor(); stopPlayback(); }}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${tool === k ? 'bg-teal-600 text-white shadow' : 'text-slate-500 dark:text-slate-300'}`}
            >
              {k === 'vowels' ? '‎ َ ُ ِ ‎ Vowels' : '🎙️ Recitation'}
            </button>
          ))}
        </div>

        <select
          value={surah}
          onChange={e => { setSurah(+e.target.value); closeEditor(); stopPlayback(); setPhase({ kind: 'idle' }); }}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          {QURAN_METADATA.map(s => (
            <option key={s.number} value={s.number}>{s.number}. {s.transliteratedName} — {s.name}</option>
          ))}
        </select>

        {tool === 'vowels' && (
          <select
            value={font}
            onChange={e => { setFont(e.target.value); closeEditor(); }}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-semibold text-slate-700 dark:text-slate-200"
            title="Adjustments are saved per font"
          >
            {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        )}

        {tool === 'recording' && (
          <div className="flex rounded-full bg-slate-100 dark:bg-gray-700 p-1">
            {(['record', 'listen'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setRecMode(m); stopPlayback(); }}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${recMode === m ? (m === 'record' ? 'bg-red-600 text-white shadow' : 'bg-emerald-600 text-white shadow') : 'text-slate-500 dark:text-slate-300'}`}
              >
                {m === 'record' ? '● Record' : '▶ Listen'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Tool hint / status line ── */}
      {tool === 'vowels' ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Click a letter to list its marks, pick one, then nudge with the <b>arrow keys</b> (Shift = bigger steps). Adjustments apply to the <b>{font}</b> font on the tutor page and every student portal.
          {!adjLoaded && ' Loading saved adjustments…'}
        </p>
      ) : (
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          {recMode === 'record' ? (
            <span>Tap a <b>verse</b> to record it · tap an <b>ayah number</b> to chain from there (Space/tap = next verse, Enter = finish &amp; save).</span>
          ) : (
            <span>Tap a <b>verse</b> to hear it · tap an <b>ayah number</b> to play on through the recorded verses.</span>
          )}
          <span className="font-semibold text-teal-600 dark:text-teal-400">{recordedCount} / {TOTAL_AYAHS} verses recorded</span>
          {manifestLoaded && (
            <button
              onClick={togglePublish}
              className={`px-3 py-1 rounded-full font-bold text-white ${manifest.published ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-400 hover:bg-slate-500'}`}
            >
              {manifest.published ? '✓ Published — students can pick it' : 'Publish to reciter picker'}
            </button>
          )}
          {recMode === 'record' && (
            <span className="flex items-center gap-2 w-full sm:w-auto">
              <span>🎤</span>
              <select
                value={micId}
                onChange={e => onPickMic(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[220px]"
                title="Which microphone to record with"
              >
                <option value="">Default microphone</option>
                {mics.map(m => (
                  <option key={m.deviceId} value={m.deviceId}>{m.label || 'Microphone'}</option>
                ))}
              </select>
              {activeMicLabel ? (
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="w-20 h-2 rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                    <div ref={meterFillRef} className="h-full bg-emerald-500 transition-[width] duration-75" style={{ width: '0%' }} />
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[160px]" title={activeMicLabel}>
                    ● {activeMicLabel}
                  </span>
                </span>
              ) : (
                <button onClick={() => ensureMic()} className="px-2.5 py-1 rounded-full text-xs font-bold text-white bg-teal-600 hover:bg-teal-700">
                  Test mic
                </button>
              )}
            </span>
          )}
          {recMode === 'record' && (
            <button
              onClick={() => setFxOpen(o => !o)}
              className={`px-3 py-1 rounded-full font-bold border transition-colors ${fxOpen ? 'bg-teal-600 text-white border-teal-600' : 'border-slate-300 dark:border-gray-600 text-slate-600 dark:text-slate-300 hover:border-teal-400'}`}
              title="Adjust the sound of new recordings"
            >
              🎛️ Effects{JSON.stringify(fx) !== JSON.stringify(FX_DEFAULTS) ? ' •' : ''}
            </button>
          )}
          {micError && <span className="text-red-600 font-semibold">{micError}</span>}
        </div>
      )}

      {/* ── Effects panel ── */}
      {tool === 'recording' && recMode === 'record' && fxOpen && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {FX_CONTROLS.map(c => (
              <label key={c.key} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300" title={c.hint}>
                <span className="w-20 font-bold flex-shrink-0">{c.label}</span>
                <input
                  type="range" min={0} max={100} step={5} value={fx[c.key]}
                  onChange={e => setFx(f => ({ ...f, [c.key]: +e.target.value }))}
                  className="flex-1 accent-teal-600"
                />
                <span className="tabular-nums font-semibold w-9 text-end flex-shrink-0">
                  {fx[c.key] === 0 && c.key !== 'loudness' ? 'off' : `${fx[c.key]}%`}
                </span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              50% = the standard studio sound. Changes apply to NEW recordings — re-record a verse to give it the new sound.
            </p>
            <button
              onClick={() => setFx(FX_DEFAULTS)}
              className="px-3 py-1 rounded-lg text-xs font-bold text-slate-500 hover:text-teal-600 border border-slate-200 dark:border-gray-600 flex-shrink-0 ms-3"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}

      {/* ── Mushaf ── */}
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 sm:p-8"
        style={{ ['--quranic-font' as string]: `'${font}'` } as React.CSSProperties}
      >
        {loading ? (
          <p className="text-center text-slate-400 animate-pulse py-16">Loading surah…</p>
        ) : error ? (
          <p className="text-center text-red-500 py-16">{error}</p>
        ) : (
          <div dir="rtl" className="font-quranic text-4xl sm:text-5xl text-slate-900 dark:text-slate-100" style={{ lineHeight: 2.6 }}>
            {verses.map(v => {
              const ayah = +v.verse_key.split(':')[1];
              const words = splitVerseWords(v.text_uthmani);
              const recorded = isRecorded(ayah);
              const isActive = activeRecordingAyah === ayah;
              const isPlaying = playingAyah === ayah;
              const busy = processing.has(`${surah}:${ayah}`);
              return (
                <React.Fragment key={v.verse_key}>
                  <span
                    onClick={() => onVerseTap(ayah)}
                    className={`px-1 py-1 rounded-md transition-all ${tool === 'recording' ? 'cursor-pointer' : ''} ${isActive ? 'bg-red-100 dark:bg-red-900/40 ring-2 ring-red-500' : isPlaying ? 'ring-2 ring-emerald-500' : tool === 'recording' && recMode === 'listen' && recorded ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
                  >
                    {words.map((w, wi) => (
                      <React.Fragment key={wi}>
                        {tool === 'vowels' ? renderVowelWord(w, v.verse_key, wi) : renderRecordingWord(w)}
                        {wi < words.length - 1 ? ' ' : ''}
                      </React.Fragment>
                    ))}
                  </span>
                  {/* Ayah number circle */}
                  <span
                    onClick={() => onAyahNumberTap(ayah)}
                    className={`inline-flex items-center justify-center align-middle rounded-full border-2 select-none mx-2 ${tool === 'recording' ? 'cursor-pointer' : ''} ${recorded && tool === 'recording' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-slate-300 dark:border-gray-600 text-slate-500 dark:text-slate-400'}`}
                    style={{ width: '1.7em', height: '1.7em', fontSize: '0.45em', lineHeight: 1, verticalAlign: 'middle' }}
                    title={tool === 'recording' ? (recMode === 'record' ? 'Record from here onwards' : 'Play from here onwards') : undefined}
                  >
                    {busy ? '…' : toEastern(ayah)}
                  </span>
                  {' '}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recording status bar ── */}
      {tool === 'recording' && phase.kind !== 'idle' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-gray-900/95 text-white rounded-2xl shadow-2xl px-5 py-3">
          {phase.kind === 'countdown' ? (
            <span className="text-lg font-black tabular-nums">Recording {surah}:{phase.ayah} in… {phase.n}</span>
          ) : (
            <>
              <span className="flex items-center gap-2 font-bold">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                {surah}:{phase.ayah} · {recTick}s
              </span>
              {phase.chained && (
                <button onClick={() => finishTake(true)} className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-sm font-bold">
                  Next verse (Space)
                </button>
              )}
              <button onClick={() => finishTake(false)} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold">
                ■ Finish (Enter)
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Vowel editor panel ── */}
      {tool === 'vowels' && sel && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ring-1 ring-black/10 dark:ring-white/10 p-4 w-[min(94vw,480px)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              <span dir="rtl" className="font-quranic text-2xl align-middle me-2" style={{ ['--quranic-font' as string]: `'${font}'` } as React.CSSProperties}>{sel.unit}</span>
              {sel.letterKey} · {font}
            </span>
            <button onClick={closeEditor} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1">×</button>
          </div>

          {!pickedMark ? (
            selMarks.length ? (
              <div className="flex flex-wrap gap-2">
                {selMarks.map((m, i) => {
                  const saved = !!savedAdjFor(sel.letterKey)?.[m];
                  return (
                    <button
                      key={`${m}${i}`}
                      onClick={() => beginPick(m)}
                      className={`flex flex-col items-center px-3 py-2 rounded-xl border-2 transition-colors ${saved ? 'border-violet-400 bg-violet-50 dark:bg-violet-900/30' : 'border-slate-200 dark:border-gray-600 hover:border-violet-300'}`}
                    >
                      <span dir="rtl" className="font-quranic text-3xl leading-none" style={{ ['--quranic-font' as string]: `'${font}'` } as React.CSSProperties}>{sel.unit[0]}{m}</span>
                      <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-1">{MARK_NAMES[m] ?? 'Mark'}{saved ? ' ·  adjusted' : ''}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">This letter has no marks to adjust.</p>
            )
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <p className="font-bold text-slate-700 dark:text-slate-200 mb-0.5">{MARK_NAMES[pickedMark] ?? 'Mark'}</p>
                <p>← → ↑ ↓ to nudge · Shift = ×5</p>
                <p className="tabular-nums mt-0.5">dx {work.dx.toFixed(2)}em · dy {work.dy.toFixed(2)}em</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={saveCurrent}
                  disabled={saving || !dirty}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold text-white ${savedFlash ? 'bg-emerald-600' : 'bg-teal-600 hover:bg-teal-700 disabled:opacity-40'}`}
                >
                  {saving ? 'Saving…' : savedFlash ? '✓ Saved' : 'Save'}
                </button>
                <button onClick={resetCurrent} disabled={saving} className="px-4 py-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-red-600 border border-slate-200 dark:border-gray-600">
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <audio ref={audioRef} onEnded={onPlaybackEnded} onError={() => setPlayingAyah(null)} preload="none" style={{ display: 'none' }} />
    </div>
  );
};

export default AdminQuranLabTab;
