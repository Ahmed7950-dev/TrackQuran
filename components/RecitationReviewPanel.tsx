// ─────────────────────────────────────────────────────────────────────────────
// RecitationReviewPanel — a bar across the BOTTOM of the tutor's live-logging
// Quran page while reviewing a recitation homework (the page itself is
// untouched). Each verse's recording plays from here (one by one, or all in
// order), and playing a verse scrolls the page to it — so mistakes are logged
// exactly as in a live lesson, into the student's normal mistakes map. Then
// Passed / Needs revision notifies the student.
//
// Two lines when open, one slim strip when minimised, so the verses being
// marked stay visible; the page gets bottom padding to match.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react';
import { QURAN_METADATA } from '../constants';
import {
  RecitationHomework, rangeLabel, recitationUrl, reviewRecitationHomework, versesOfRange,
} from '../services/recitationHomeworkService';

const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

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
  const [copied, setCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chainRef = useRef(false);
  chainRef.current = chain;
  const [pos, setPos] = useState(0);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  // Keep the page clear of the bar — it is fixed, so the last verses would sit
  // under it otherwise.
  useEffect(() => {
    const el = barRef.current;
    const apply = () => { document.body.style.paddingBottom = `${(el?.offsetHeight ?? 0) + 12}px`; };
    apply();
    const ro = el ? new ResizeObserver(apply) : null;
    if (el && ro) ro.observe(el);
    return () => { ro?.disconnect(); document.body.style.paddingBottom = ''; };
  }, [open]);

  // Position readout while a recording plays.
  useEffect(() => {
    if (!playing) return;
    const iv = window.setInterval(() => setPos(audioRef.current?.currentTime ?? 0), 250);
    return () => window.clearInterval(iv);
  }, [playing]);

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
  const pct = verses.length ? recorded / verses.length : 0;
  const multiSurah = rec.startSurah !== rec.endSurah;
  const nowPlaying = playing ? rec.recordings[playing] : null;
  const playingLabel = playing
    ? `${multiSurah ? `${QURAN_METADATA.find(m => m.number === Number(playing.split(':')[0]))?.transliteratedName} ` : 'Verse '}${playing.split(':')[1]}`
    : '';

  const icon = {
    play: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>,
    pause: <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>,
    link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l2.9-2.9a5 5 0 0 0-7.1-7.1L11.5 4.4" /><path d="M14 11a5 5 0 0 0-7.1 0L4 13.9a5 5 0 0 0 7.1 7.1l1.4-1.4" /></svg>,
    minus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M5 12h14" /></svg>,
    up: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>,
    close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className="w-4 h-4" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  };
  const bars = (
    <span aria-hidden="true" className="inline-flex items-end gap-[3px] h-4">
      {[0.5, 1, 0.65, 0.85].map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-current rrp-bar" style={{ height: `${h * 100}%`, animationDelay: `${i * 0.11}s` }} />
      ))}
    </span>
  );
  const iconBtn = 'w-9 h-9 flex items-center justify-center rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-600 transition-colors';
  const verdictButtons = (small = false) => (
    <div className="flex items-center gap-2 flex-shrink-0">
      <button onClick={() => decide('needs_revision')} disabled={!!busy || recorded === 0}
        className={`${small ? 'h-10 px-3 text-[13px]' : 'h-12 sm:h-[52px] px-3 sm:px-5 text-sm'} rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-black hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
        {busy === 'needs_revision' ? 'Saving…' : 'Needs revision'}
      </button>
      <button onClick={() => decide('passed')} disabled={!!busy || recorded === 0}
        className={`${small ? 'h-10 px-4 text-[13px]' : 'h-12 sm:h-[52px] px-4 sm:px-6 text-sm'} rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black shadow-lg shadow-emerald-800/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}>
        {busy === 'passed' ? 'Saving…' : 'Passed'}
      </button>
    </div>
  );
  const style = <style>{`@keyframes rrp-bar { 0%,100% { height: 35% } 50% { height: 100% } } .rrp-bar { animation: rrp-bar .85s ease-in-out infinite; }`}</style>;

  // ── Minimised: one slim strip, playback keeps running ──
  if (!open) {
    return (
      <section ref={el => { barRef.current = el; }} aria-label="Recitation review, minimised"
        className="fixed inset-x-0 bottom-0 z-[250] flex items-center gap-x-2 sm:gap-x-3 px-3 sm:px-5 py-2 bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 shadow-[0_-14px_32px_-26px_rgba(15,23,42,0.5)]">
        {style}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-700 text-white text-[11px] font-black uppercase tracking-wide">🎧 Reviewing</span>
        <span className="text-sm font-black text-slate-800 dark:text-slate-100 truncate max-w-[9rem]">{rec.studentName}</span>
        <span className="hidden lg:inline text-sm text-slate-600 dark:text-slate-300 truncate max-w-[16rem]">{rangeLabel(rec)}</span>
        <span className="text-[13px] font-bold text-teal-700 dark:text-teal-300 flex-shrink-0">{recorded} / {verses.length}</span>
        {playing && nowPlaying && (
          <span className="hidden md:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-[13px] font-bold">
            {bars}{playingLabel} · {fmtClock(pos * 1000)} / {fmtClock(nowPlaying.ms)}
          </span>
        )}
        <span className="flex-grow" />
        {playing && (
          <button onClick={() => play(playing)} aria-label="Pause" className={`${iconBtn} rounded-full text-teal-700 dark:text-teal-300`}>{icon.pause}</button>
        )}
        {verdictButtons(true)}
        <button onClick={() => setOpen(true)} aria-label="Expand the review bar" className={iconBtn}>{icon.up}</button>
        <button onClick={() => { audioRef.current?.pause(); onClose(); }} aria-label="Close the review" className={iconBtn}>{icon.close}</button>
      </section>
    );
  }

  // ── Open: two lines ──
  return (
    <section ref={el => { barRef.current = el; }} aria-label="Recitation review"
      className="fixed inset-x-0 bottom-0 z-[250] bg-white dark:bg-gray-800 border-t border-slate-200 dark:border-gray-700 shadow-[0_-18px_40px_-28px_rgba(15,23,42,0.55)]">
      {style}
      {/* Line 1 — who, progress, window controls */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-6 pt-2.5 pb-1.5">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-700 text-white text-[11px] sm:text-xs font-black uppercase tracking-wide">🎧 Reviewing</span>
        <span className="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 truncate max-w-[10rem]">{rec.studentName}</span>
        <span className="hidden sm:inline text-slate-300 dark:text-gray-600">|</span>
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 truncate max-w-[16rem]">{rangeLabel(rec)}</span>
        <span className="inline-flex items-center gap-2">
          <span className="hidden sm:block w-28 h-[7px] rounded-full bg-slate-200 dark:bg-gray-700 overflow-hidden">
            <span className="block h-full rounded-full bg-teal-700 dark:bg-teal-500 transition-all" style={{ width: `${pct * 100}%` }} />
          </span>
          <span className="text-[13px] font-bold text-slate-600 dark:text-slate-300">{recorded} of {verses.length} recorded</span>
        </span>
        <span className="flex-grow" />
        <span className="hidden lg:inline text-[13px] text-slate-400 dark:text-slate-500">Log mistakes on the page as usual — playing a verse scrolls to it</span>
        <button onClick={() => { navigator.clipboard?.writeText(recitationUrl(rec.id)).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
          aria-label="Copy the student's recording link" title="Copy the student's recording link"
          className={`${iconBtn} ${copied ? 'text-emerald-600 border-emerald-300' : ''}`}>{copied ? '✓' : icon.link}</button>
        <button onClick={() => setOpen(false)} aria-label="Minimise the review bar" title="Minimise" className={iconBtn}>{icon.minus}</button>
        <button onClick={() => { audioRef.current?.pause(); onClose(); }} aria-label="Close the review" title="Close" className={iconBtn}>{icon.close}</button>
      </div>

      {/* Line 2 — play all · verses · verdict */}
      <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 pb-3">
        {recorded === 0 ? (
          <div className="flex-grow flex items-center gap-3 h-12 sm:h-[52px] px-4 rounded-xl border border-dashed border-slate-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-700/40 text-sm font-semibold text-slate-500 dark:text-slate-400">
            {rec.studentName ?? 'The student'} hasn't recorded any verse yet — the recordings appear here as they arrive.
          </div>
        ) : (
          <>
            <button onClick={playAll}
              className={`flex items-center gap-2 h-12 sm:h-[52px] px-3 sm:px-4 rounded-xl border text-[13px] sm:text-sm font-black flex-shrink-0 transition-colors ${
                chain ? 'bg-teal-700 border-teal-700 text-white' : 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100'}`}>
              {chain ? icon.pause : icon.play}<span className="hidden sm:inline">{chain ? 'Stop' : 'Play all'}</span>
            </button>

            <div role="group" aria-label="Verses" className="flex-grow flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
              {verses.map(([s, v], i) => {
                const key = `${s}:${v}`;
                const r = rec.recordings[key];
                const isPlaying = playing === key;
                const newSurah = multiSurah && i > 0 && verses[i - 1][0] !== s;
                const name = QURAN_METADATA.find(m => m.number === s)?.transliteratedName;
                return (
                  <React.Fragment key={key}>
                    {newSurah && <span className="w-px h-8 bg-slate-200 dark:bg-gray-600 flex-shrink-0" />}
                    <button onClick={() => (r ? play(key) : onJumpToVerse(key))}
                      aria-label={`${name} verse ${v}${r ? `, recording ${Math.round(r.ms / 1000)} seconds` : ', not recorded'}`}
                      aria-current={isPlaying ? 'true' : undefined}
                      className={`flex items-center gap-2 h-12 sm:h-[52px] px-2.5 sm:px-3.5 rounded-xl flex-shrink-0 transition-colors ${
                        isPlaying ? 'bg-teal-700 border-2 border-teal-700 text-white shadow-lg shadow-teal-700/25'
                        : r ? 'border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-teal-400'
                        : 'border border-dashed border-slate-300 dark:border-gray-600 bg-slate-50 dark:bg-gray-700/40'}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                        isPlaying ? 'bg-white/25 text-white'
                        : r ? 'bg-slate-100 dark:bg-gray-600 text-slate-800 dark:text-slate-100'
                        : 'bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-400'}`}>{v}</span>
                      <span className="flex flex-col items-start leading-tight">
                        {multiSurah && (
                          <span className={`text-[12px] font-bold ${isPlaying ? 'text-white' : r ? 'text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{name}</span>
                        )}
                        <span className={`text-[11px] sm:text-xs font-semibold ${isPlaying ? 'text-teal-100' : r ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400'}`}>
                          {r ? (isPlaying ? `${fmtClock(pos * 1000)} / ${fmtClock(r.ms)}` : fmtClock(r.ms)) : rec.purgedAt ? 'cleared' : 'not recorded'}
                        </span>
                      </span>
                      {isPlaying ? bars : r ? <span className="text-teal-700 dark:text-teal-300">{icon.play}</span> : null}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}
        {verdictButtons()}
      </div>
      {err && <p className="px-6 pb-2 text-xs font-semibold text-red-600">{err}</p>}
    </section>
  );
};

export default RecitationReviewPanel;
