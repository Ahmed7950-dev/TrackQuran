// ─────────────────────────────────────────────────────────────────────────────
// RecitationReviewPanel — floats over the tutor's live-logging Quran page while
// reviewing a recitation homework. Each verse's recording plays from here (one
// by one, or all in order), and playing a verse scrolls the Quran page to it —
// so mistakes are logged exactly as in a live lesson, into the student's normal
// mistakes map. Then Passed / Needs revision notifies the student.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { QURAN_METADATA } from '../constants';
import {
  RecitationHomework, rangeLabel, recitationUrl, reviewRecitationHomework, versesOfRange,
} from '../services/recitationHomeworkService';

const RecitationReviewPanel: React.FC<{
  rec: RecitationHomework;
  onJumpToVerse: (key: string) => void;
  onReviewed: (rec: RecitationHomework) => void;
  onClose: () => void;
}> = ({ rec, onJumpToVerse, onReviewed, onClose }) => {
  const verses = versesOfRange(rec);
  const [playing, setPlaying] = useState<string | null>(null);
  const [chain, setChain] = useState(false);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<'passed' | 'needs_revision' | null>(null);
  const [err, setErr] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chainRef = useRef(false);
  chainRef.current = chain;

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const play = (key: string, keepChain = false) => {
    const r = rec.recordings[key];
    const a = audioRef.current ?? (audioRef.current = new Audio());
    if (!r) return;
    if (playing === key && !keepChain) { a.pause(); setPlaying(null); setChain(false); return; }
    if (!keepChain) setChain(false);
    onJumpToVerse(key);
    a.src = r.url;
    a.onended = () => {
      setPlaying(null);
      if (!chainRef.current) return;
      const i = verses.findIndex(([s, v]) => `${s}:${v}` === key);
      const next = verses.slice(i + 1).find(([s, v]) => rec.recordings[`${s}:${v}`]);
      if (next) play(`${next[0]}:${next[1]}`, true); else setChain(false);
    };
    a.play().then(() => setPlaying(key)).catch(() => { setPlaying(null); setErr('This recording could not be played.'); });
  };

  const playAll = () => {
    if (chain) { audioRef.current?.pause(); setChain(false); setPlaying(null); return; }
    const first = verses.find(([s, v]) => rec.recordings[`${s}:${v}`]);
    if (!first) return;
    setChain(true);
    chainRef.current = true;
    play(`${first[0]}:${first[1]}`, true);
  };

  const decide = async (verdict: 'passed' | 'needs_revision') => {
    setErr(''); setBusy(verdict);
    audioRef.current?.pause();
    const done = await reviewRecitationHomework(rec, verdict);
    setBusy(null);
    if (!done) { setErr('Could not save the review — check your connection.'); return; }
    onReviewed(done);
  };

  const recorded = verses.filter(([s, v]) => rec.recordings[`${s}:${v}`]).length;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed bottom-4 end-4 z-[250] px-4 py-3 rounded-full bg-teal-600 text-white font-black shadow-xl">
        🎧 Review {playing ? '· playing' : ''}
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 end-3 z-[250] w-[min(22rem,calc(100vw-1.5rem))] max-h-[70vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-2xl">
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b border-slate-100 dark:border-gray-700">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wide text-teal-600">🎧 Reviewing recitation</p>
          <p className="text-sm font-bold truncate">{rec.studentName} · {rangeLabel(rec)}</p>
          <p className="text-[11px] text-slate-400">{recorded}/{verses.length} verses recorded · log mistakes on the page as usual</p>
        </div>
        <button onClick={() => setOpen(false)} title="Minimise" className="w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700">–</button>
        <button onClick={() => { audioRef.current?.pause(); onClose(); }} title="Close" className="w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 text-lg leading-none">×</button>
      </div>

      <div className="px-3 py-2">
        <button onClick={playAll} disabled={recorded === 0}
          className={`w-full py-2 rounded-xl text-sm font-black ${chain ? 'bg-slate-700 text-white' : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'} disabled:opacity-40`}>
          {chain ? '⏹ Stop playing all' : '▶ Play all in order'}
        </button>
      </div>

      <div className="overflow-y-auto px-3 pb-2 space-y-1">
        {verses.map(([s, v]) => {
          const key = `${s}:${v}`;
          const r = rec.recordings[key];
          const name = QURAN_METADATA.find(m => m.number === s)?.transliteratedName;
          return (
            <div key={key} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${playing === key ? 'bg-teal-50 dark:bg-teal-900/30' : ''}`}>
              <button onClick={() => onJumpToVerse(key)} className="flex-1 min-w-0 text-left text-sm font-semibold truncate hover:underline">
                {rec.startSurah !== rec.endSurah ? `${name} ` : ''}Verse {v}
              </button>
              {r ? (
                <>
                  <span className="text-[11px] tabular-nums text-slate-400">{Math.round(r.ms / 1000)}s</span>
                  <button onClick={() => play(key)}
                    className={`w-9 h-9 rounded-full font-black ${playing === key ? 'bg-teal-600 text-white' : 'bg-slate-100 dark:bg-gray-700'}`}>
                    {playing === key ? '⏸' : '▶'}
                  </button>
                </>
              ) : (
                <span className="text-[11px] text-slate-400 italic">{rec.purgedAt ? 'cleared' : 'not recorded'}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 pt-2 pb-3 border-t border-slate-100 dark:border-gray-700 space-y-2">
        {err && <p className="text-xs font-semibold text-red-600">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => decide('needs_revision')} disabled={!!busy}
            className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-black disabled:opacity-50">
            {busy === 'needs_revision' ? 'Saving…' : '🔁 Needs revision'}
          </button>
          <button onClick={() => decide('passed')} disabled={!!busy}
            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black disabled:opacity-50">
            {busy === 'passed' ? 'Saving…' : '✅ Passed'}
          </button>
        </div>
        <button onClick={() => navigator.clipboard?.writeText(recitationUrl(rec.id)).catch(() => {})}
          className="w-full text-[11px] text-slate-400 hover:text-teal-600 underline">Copy the student's recording link</button>
      </div>
    </div>
  );
};

export default RecitationReviewPanel;
