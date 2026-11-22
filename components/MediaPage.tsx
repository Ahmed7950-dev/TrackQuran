// components/MediaPage.tsx
// ---------------------------------------------------------------------------
// Media — the projection booth.
//
// A tutor's shelf of YouTube videos and playlists to watch with a student. The
// shelf is shared across every student; the marks on it are not. Each reel
// carries ONE student's seek line, so the shelf answers the question the start
// of a lesson actually asks: where did we stop?
//
// Deliberately dark, and dark in light mode too. It is the one page in the app
// you sit and WATCH, and a cream panel around a video is a lamp in the eye.
//
// Tutor-only: nothing on a student's share link renders this, and the tables
// behind it refuse anyone but the owning tutor (see the migration).
//
// Progress is kept by the YouTube IFrame Player API, which is the only way to
// know where a video is: an ordinary <iframe> tells you nothing. Playlists are
// counted in VIDEOS rather than seconds, because seconds would mean fetching
// every video's length, and that needs an API key this app does not have.
// ---------------------------------------------------------------------------
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MediaCategory, MediaItem, MediaProgress, ParsedLink,
  listCategories, createCategory, deleteCategory,
  listMedia, addMedia, updateMedia, deleteMedia,
  refreshPlaylistNews, markPlaylistSeen, newVideoIds, totalNewVideos,
  loadProgress, saveProgress, clearProgress,
  parseYouTubeLink, videoThumb, thumbFor, fetchPlaylistThumb, fetchVideoLengths, timecode, watchedFraction,
  hasEnglishSound,
  MediaChannel, ChannelInfo, ChannelVideo, isChannelLink, resolveChannel, listChannels, addChannel,
  updateChannel, deleteChannel, refreshChannelNews, pendingChannelVideos, totalChannelNews, channelThumb,
} from '../services/mediaService';

/* ── The booth's palette ──────────────────────────────────────────────
 * Custom properties, not fixed hexes: the three sets live in index.html
 * under `.media-booth`, `.dark .media-booth` and
 * `[data-theme="reading"] .media-booth`, so the tab follows the site's
 * light, reading and dark modes like everything else.
 * ──────────────────────────────────────────────────────────────────── */
const C = {
  ground: 'var(--m-ground)',
  panel:  'var(--m-panel)',
  card:   'var(--m-card)',
  raised: 'var(--m-raised)',
  line:   'var(--m-line)',
  edge:   'var(--m-edge)',
  ink:    'var(--m-ink)',
  body:   'var(--m-body)',
  muted:  'var(--m-muted)',
  dim:    'var(--m-dim)',
  amber:  'var(--m-accent)',
  onAmber:'var(--m-on-accent)',
  chip:   'var(--m-chip)',
  green:  'var(--m-good)',
  greenLine: 'var(--m-good-line)',
  greenBg:'var(--m-good-bg)',
  track:  'var(--m-track)',
  well:   'var(--m-well)',
  wellFg: 'var(--m-well-fg)',
  screen: 'var(--m-screen)',
};
const MONO = "'DM Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Archivo', system-ui, -apple-system, sans-serif";

/** The dot beside a category. Hue only ever decorates — never the only signal. */
const HUES = ['#D9861C', '#3C7FBF', '#8A5BB5', '#3F9160', '#C25A5A', '#2F9A94'];

/* ── The YouTube IFrame Player API ───────────────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
let ytApi: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (ytApi) return ytApi;
  ytApi = new Promise<void>((resolve, reject) => {
    if ((window as any).YT?.Player) { resolve(); return; }
    // The API calls ONE global when it is ready. Chaining rather than replacing
    // keeps any other loader on the page working.
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => reject(new Error('YouTube player could not load'));
    document.head.appendChild(s);
  });
  return ytApi;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ── Small pieces ────────────────────────────────────────────────────── */

const Icon: React.FC<{ d: string; size?: number; fill?: boolean; stroke?: number }> =
  ({ d, size = 17, fill = false, stroke = 1.9 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );

const PLAY   = 'M8 5.5v13l11-6.5z';
const PLUS   = 'M12 5v14M5 12h14';
const CHECK  = 'M4 12.5l5.2 5.2L20 7';
const BACK   = 'M14.5 5.5L8 12l6.5 6.5';
const PENCIL = 'M16.5 3.9l3.6 3.6L8 19.6 3.6 21l1.4-4.4z';
const TRASH  = 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13';
const REDO   = 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V10h5.2';
const CLOSE  = 'M6 6l12 12M18 6L6 18';
/** A speaker; SOUND_ON adds the waves, SOUND_OFF a cross. */
const SPEAKER   = 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z';
const SOUND_ON  = 'M15.5 9a4 4 0 0 1 0 6M18.2 6.5a7.5 7.5 0 0 1 0 11';
const SOUND_OFF = 'M16 9.5l5 5M21 9.5l-5 5';
const BELL     = 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0';
const BELL_OFF = 'M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8M10 20.5a2 2 0 0 0 4 0M3.5 3.5l17 17';
const CHEVRON  = 'M8 10l4 4 4-4';
const FOLDER   = 'M3 7.5h7l2 2.5h9v9.5H3zM3 7.5V5h5.5';

/** One tick per video in a playlist — the same small-segment language the
 *  Qaedah words and the Tadabbur verses already speak. */
const Ticks: React.FC<{ total: number; done: number[]; current?: number; all?: boolean; fresh?: number[] }> =
  ({ total, done, current, all, fresh }) => (
    <div className="flex flex-wrap gap-[3px]">
      {Array.from({ length: Math.max(total, 1) }, (_, i) => {
        const seen = all || done.includes(i);
        const isNew = !!fresh?.includes(i);
        return (
          <span key={i} title={`Video ${i + 1}${seen ? ' — watched' : ''}${isNew ? ' — new' : ''}`}
            style={{
              width: 20, height: 7, borderRadius: 2,
              background: seen ? C.green : i === current ? C.amber : C.track,
              // A new one that has not been watched yet is ringed rather than
              // filled: the fill already means "playing".
              boxShadow: isNew && !seen && i !== current ? `inset 0 0 0 1.5px ${C.amber}` : undefined,
            }} />
        );
      })}
    </div>
  );

/* ── The booth: one reel playing ─────────────────────────────────────── */

interface BoothProps {
  item: MediaItem;
  studentId: string;
  studentName: string;
  progress?: MediaProgress;
  /** Videos added to the playlist since the tutor last opened it. Caught at
   *  the moment of opening, because opening is what marks them seen. */
  newIds?: string[];
  onProgress: (p: MediaProgress) => void;
  onItemCount: (n: number) => void;
  onClose: () => void;
}

const Booth: React.FC<BoothProps> = ({
  item, studentId, studentName, progress, newIds, onProgress, onItemCount, onClose,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const playerRef = useRef<any>(null);
  const [ready, setReady]   = useState(false);
  const [failed, setFailed] = useState('');
  const [now, setNow]       = useState(progress?.positionSeconds ?? 0);
  const [duration, setDuration] = useState<number | null>(progress?.durationSeconds ?? null);
  const [index, setIndex]   = useState(progress?.playlistIndex ?? 0);
  const [watched, setWatched] = useState<number[]>(progress?.watchedIndexes ?? []);
  const [finished, setFinished] = useState(!!progress?.finished);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [titles, setTitles] = useState<any[]>([]);

  // Where the student was when they left. Read once: it is a starting point,
  // not a live value, and must not jump about as the new position is saved.
  const resumeAt = useRef(progress?.positionSeconds ?? 0).current;

  // The save path reads these rather than closing over state, so the interval
  // and the unmount handler always write what is on screen now.
  const live = useRef({ now, duration, index, watched, finished });
  live.current = { now, duration, index, watched, finished };

  const persist = useCallback((over?: Partial<MediaProgress>) => {
    const s = live.current;
    const next: MediaProgress = {
      itemId: item.id,
      positionSeconds: s.now,
      durationSeconds: s.duration,
      playlistIndex: s.index,
      watchedIndexes: s.watched,
      finished: s.finished,
      updatedAt: new Date().toISOString(),
      ...over,
    };
    onProgress(next);
    void saveProgress(studentId, {
      itemId: item.id,
      positionSeconds: next.positionSeconds,
      durationSeconds: next.durationSeconds,
      playlistIndex: next.playlistIndex,
      watchedIndexes: next.watchedIndexes,
      finished: next.finished,
    });
  }, [item.id, studentId, onProgress]);

  const persistRef = useRef(persist);
  persistRef.current = persist;

  // ── Build the player ──────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    loadYouTubeApi().then(() => {
      if (dead || !mountRef.current) return;
      const YT = (window as any).YT;

      const common = {
        host: 'https://www.youtube-nocookie.com',
        playerVars: {
          rel: 0, modestbranding: 1, playsinline: 1,
          start: Math.floor(resumeAt),
          origin: window.location.origin,
        },
        events: {
          onReady: (e: any) => {
            if (dead) return;
            setReady(true);
            const d = e.target.getDuration?.();
            if (d) setDuration(d);
            // A playlist only knows its own length once it has loaded.
            const list = e.target.getPlaylist?.();
            if (Array.isArray(list) && list.length && list.length !== item.itemCount) {
              onItemCount(list.length);
            }
            if (Array.isArray(list)) setTitles(list);
          },
          onStateChange: (e: any) => {
            if (dead) return;
            const YTS = (window as any).YT?.PlayerState ?? {};
            const d = e.target.getDuration?.();
            if (d) setDuration(d);
            const at = e.target.getPlaylistIndex?.();
            if (typeof at === 'number' && at >= 0) setIndex(at);

            if (e.data === YTS.PAUSED) { setNow(e.target.getCurrentTime?.() ?? 0); persistRef.current(); }

            if (e.data === YTS.ENDED) {
              if (item.kind === 'playlist') {
                const here = typeof at === 'number' && at >= 0 ? at : live.current.index;
                const seen = live.current.watched.includes(here)
                  ? live.current.watched : [...live.current.watched, here];
                setWatched(seen);
                const total = item.itemCount ?? seen.length;
                const done = seen.length >= total;
                if (done) setFinished(true);
                persistRef.current({ watchedIndexes: seen, finished: done });
              } else {
                setFinished(true);
                persistRef.current({ finished: true, positionSeconds: d ?? live.current.now });
              }
            }
          },
          onError: () => { if (!dead) setFailed('YouTube would not play this link. Check it still works.'); },
        },
      };

      playerRef.current = new YT.Player(mountRef.current, item.kind === 'playlist'
        ? { ...common, playerVars: { ...common.playerVars, listType: 'playlist', list: item.youtubeId, index: progress?.playlistIndex ?? 0 } }
        : { ...common, videoId: item.youtubeId });
    }).catch(() => { if (!dead) setFailed('The YouTube player could not load. Check the connection.'); });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return () => {
      dead = true;
      try { playerRef.current?.destroy?.(); } catch { /* already gone */ }
      playerRef.current = null;
    };
    // Built once per reel: re-running would restart the video mid-lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // ── Follow the playhead, and save every few seconds of it ─────────────
  useEffect(() => {
    if (!ready) return;
    let sinceSave = 0;
    const tick = window.setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      const t = p.getCurrentTime() ?? 0;
      setNow(t);
      const at = p.getPlaylistIndex?.();
      if (typeof at === 'number' && at >= 0) setIndex(at);
      sinceSave += 1;
      // Saving on every tick would be a write a second; five is close enough
      // to "where we stopped" and leaves the table alone.
      if (sinceSave >= 5) { sinceSave = 0; persistRef.current(); }
    }, 1000);
    return () => clearInterval(tick);
  }, [ready]);

  // Leaving the page — closing the tab, switching away, unmounting — must keep
  // the place. This is the case the whole feature is for.
  useEffect(() => {
    const flush = () => persistRef.current();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, []);

  const total = item.itemCount ?? titles.length ?? 0;

  /** Which position each new video sits at.
   *
   *  The player's own `getPlaylist()` is the truth about the order — it is the
   *  very list being played. Until it answers, the ids read off the playlist
   *  page stand in, so the marks are right from the first paint rather than
   *  appearing a second later. */
  const freshAt = useMemo(() => {
    if (!newIds?.length) return [] as number[];
    const order: string[] = titles.length ? titles : (item.latestVideoIds ?? []);
    const want = new Set(newIds);
    const out: number[] = [];
    order.forEach((id, i) => { if (want.has(id)) out.push(i); });
    return out;
  }, [newIds, titles, item.latestVideoIds]);
  const pct = duration && duration > 0 ? Math.min(100, (now / duration) * 100) : 0;
  const resumePct = duration && duration > 0 ? Math.min(100, (resumeAt / duration) * 100) : 0;

  const isList = item.kind === 'playlist';
  /** For a playlist the button is about the video on screen, not the reel. */
  const thisDone = isList ? watched.includes(index) : finished;

  const markFinished = () => {
    if (!isList) {
      setFinished(true);
      persistRef.current({ finished: true });
      return;
    }
    // Only the video that is open. Marking one used to mark the whole list,
    // which threw away the very thing the ticks are for. The reel turns green
    // by itself once every video in it has been watched — here, or by playing
    // one to the end, which the ENDED handler records the same way.
    if (watched.includes(index)) return;
    const seen = [...watched, index].sort((a, b) => a - b);
    const all = total > 0 && seen.length >= total;
    setWatched(seen);
    if (all) setFinished(true);
    persistRef.current({ watchedIndexes: seen, finished: all });
  };

  const startAgain = async () => {
    setFinished(false); setWatched([]); setNow(0); setIndex(0);
    await clearProgress(studentId, item.id);
    onProgress({
      itemId: item.id, positionSeconds: 0, durationSeconds: duration,
      playlistIndex: 0, watchedIndexes: [], finished: false, updatedAt: new Date().toISOString(),
    });
    try { playerRef.current?.seekTo?.(0, true); playerRef.current?.playVideoAt?.(0); } catch { /* not ready */ }
  };

  return (
    <div className="media-booth w-full" style={{ background: C.ground, fontFamily: SANS, color: C.ink, minHeight: '100vh' }}>
      {/* back bar */}
      <div style={{ background: C.ground, borderBottom: `1px solid ${C.line}` }}>
        <div className="w-full px-4 sm:px-7 lg:px-10 py-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { persistRef.current(); onClose(); }}
            className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-[9px] text-sm font-semibold"
            style={{ background: C.raised, border: `1px solid ${C.edge}`, color: C.body }}>
            <Icon d={BACK} stroke={2.1} /> Shelf
          </button>
          <span className="flex-grow" />
          <p className="m-0 flex items-center gap-2" style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.06em', color: C.muted }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green }} />
            SAVING {studentName.toUpperCase()}&rsquo;S PLACE AS IT PLAYS
          </p>
        </div>
      </div>

      <div className="w-full px-4 sm:px-7 lg:px-10 py-6">
        <div className="flex flex-wrap gap-7">

          {/* ── stage ──────────────────────────────────────────────── */}
          <div className="flex-[999_1_520px] min-w-0">
            {/* Full width, but never taller than the window: a 16:9 screen let
                loose on a wide monitor pushes the scrubber and the Mark
                finished button below the fold, which is where the work is. */}
            <div className="rounded-[14px] overflow-hidden mx-auto"
              style={{ background: C.screen, border: `1px solid ${C.line}`, maxWidth: 'calc((100vh - 330px) * 16 / 9)' }}>
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <div className="absolute inset-0">
                  {/* The API replaces this node with its iframe. */}
                  <div ref={mountRef} className="w-full h-full" />
                </div>
                {!ready && !failed && (
                  <p className="absolute inset-0 flex items-center justify-center m-0"
                    style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.1em', color: C.dim }}>
                    {resumeAt > 0 ? `RESUMING AT ${timecode(resumeAt)}` : 'LOADING'}
                  </p>
                )}
              </div>
            </div>

            {failed && (
              <p role="alert" className="mt-3 mb-0 px-4 py-3 rounded-[10px] text-sm"
                style={{ background: 'var(--m-bad-bg)', border: '1px solid var(--m-bad-line)', color: 'var(--m-bad-ink)' }}>{failed}</p>
            )}

            {/* ── the scrubber, with last session's mark still on it ── */}
            <div className="mt-4 mx-auto px-5 py-5 rounded-[13px]"
              style={{ background: C.panel, border: `1px solid ${C.line}`, maxWidth: 'calc((100vh - 330px) * 16 / 9)' }}>
              <div className="relative" style={{ height: 34 }}>
                <div className="absolute left-0 right-0" style={{ top: 14, height: 6, borderRadius: 3, background: C.track }} />
                <div className="absolute left-0" style={{ top: 14, height: 6, width: `${pct}%`, borderRadius: 3, background: finished ? C.green : C.amber }} />
                {resumeAt > 0 && (
                  <div className="absolute" title={`Where you stopped last time — ${timecode(resumeAt)}`}
                    style={{ left: `${resumePct}%`, top: 4, bottom: 4, width: 2, background: C.ink }} />
                )}
                <div className="absolute" style={{ left: `${pct}%`, top: 9, width: 16, height: 16, marginLeft: -8, borderRadius: '50%', background: C.ink, border: `3px solid ${finished ? C.green : C.amber}` }} />
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <p className="m-0" style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}>
                  {timecode(now)} <span style={{ color: C.dim }}>/ {timecode(duration)}</span>
                </p>
                {resumeAt > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md"
                    style={{ background: C.raised, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.07em', color: C.muted }}>
                    <span style={{ display: 'inline-block', width: 2, height: 11, background: C.ink }} />
                    LAST STOP {timecode(resumeAt)}
                  </span>
                )}
                <span className="flex-grow" />
                <button type="button" onClick={() => void startAgain()}
                  className="flex items-center gap-2 h-11 px-4 rounded-[9px] text-sm font-semibold"
                  style={{ background: C.raised, border: `1px solid ${C.edge}`, color: C.body }}>
                  <Icon d={REDO} size={16} stroke={2} /> Start again
                </button>
                <button type="button" onClick={markFinished} disabled={thisDone}
                  title={isList ? 'Marks only the video playing now' : undefined}
                  className="flex items-center gap-2 h-11 px-5 rounded-[9px] text-sm font-bold disabled:opacity-60"
                  style={{ background: thisDone ? C.greenBg : 'var(--m-good-fill)', border: thisDone ? `1px solid ${C.greenLine}` : 0, color: thisDone ? C.green : 'var(--m-good-on)' }}>
                  <Icon d={CHECK} size={16} stroke={2.6} />
                  {isList
                    ? (thisDone ? `Video ${index + 1} done` : `Mark video ${index + 1} done`)
                    : (finished ? 'Finished' : 'Mark finished')}
                </button>
              </div>
            </div>

            <div className="mt-5 mx-auto" style={{ maxWidth: 'calc((100vh - 330px) * 16 / 9)' }}>
              <h1 className="m-0 font-semibold" style={{ fontSize: 26, lineHeight: 1.22, letterSpacing: '-0.02em', color: C.ink }}>{item.title}</h1>
              <p className="mt-2 mb-0 text-sm" style={{ color: C.muted }}>
                {item.kind === 'playlist'
                  ? `Video ${index + 1}${total ? ` of ${total}` : ''} in this list`
                  : 'Single video'}
              </p>
            </div>
          </div>

          {/* ── the queue ──────────────────────────────────────────── */}
          {item.kind === 'playlist' && (
            <aside className="flex-[1_1_300px] min-w-0">
              <div className="rounded-[13px] overflow-hidden" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <div className="px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <p className="m-0" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>IN THIS LIST</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span style={{ fontFamily: MONO, fontSize: 25, lineHeight: 1, color: C.green }}>{watched.length}</span>
                    <span className="text-[13px]" style={{ color: C.muted }}>
                      of {total || '?'} watched with {studentName}
                    </span>
                  </div>
                  {freshAt.length > 0 && (
                    <p className="m-0 mt-2" style={{ fontFamily: MONO, fontSize: 11, color: C.amber }}>
                      {freshAt.length} NEW SINCE YOU LAST OPENED IT
                    </p>
                  )}
                  <div className="mt-3"><Ticks total={total} done={watched} current={index} fresh={freshAt} /></div>
                </div>

                <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                  {Array.from({ length: total }, (_, i) => {
                    const on = i === index;
                    const seen = watched.includes(i);
                    const isNew = freshAt.includes(i);
                    return (
                      <button key={i} type="button"
                        onClick={() => { try { playerRef.current?.playVideoAt?.(i); setIndex(i); } catch { /* not ready */ } }}
                        className="flex items-start gap-3 w-full px-5 py-3 text-left"
                        style={{ minHeight: 56, borderLeft: `3px solid ${on ? C.amber : 'transparent'}`, background: on ? C.raised : 'transparent' }}>
                        <span className="flex-shrink-0 flex items-center justify-center"
                          style={{ width: 25, height: 25, borderRadius: 6, fontFamily: MONO, fontSize: 11.5, background: on ? C.amber : C.track, color: on ? C.onAmber : C.dim }}>
                          {i + 1}
                        </span>
                        <span className="flex-grow min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium" style={{ color: on ? C.ink : seen ? C.muted : C.body }}>
                            Video {i + 1}
                            {isNew && (
                              <span style={{
                                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em', lineHeight: 1,
                                padding: '3px 6px', borderRadius: 4,
                                border: `1px solid ${C.amber}`, color: C.amber, background: C.chip,
                              }}>NEW</span>
                            )}
                          </span>
                          <span className="block mt-1" style={{ fontFamily: MONO, fontSize: 11, color: isNew && !on && !seen ? C.amber : C.dim }}>
                            {on ? `PLAYING · ${timecode(now)}` : seen ? 'WATCHED' : isNew ? 'JUST ADDED TO THE LIST' : '—'}
                          </span>
                        </span>
                        {seen && <span style={{ color: C.green, flexShrink: 0 }}><Icon d={CHECK} size={16} stroke={2.6} /></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="mt-4 mx-0.5 mb-0 text-[12.5px] leading-relaxed" style={{ color: C.dim }}>
                Leaving the page keeps the place. Open this reel for another student
                and you get <span style={{ color: C.muted }}>their</span> mark, not this one.
              </p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

type ShelfView = 'icons' | 'list' | 'gallery';
const VIEW_KEY = 'mediaShelfView';
const VIEWS: { id: ShelfView; label: string; d: string }[] = [
  { id: 'icons', label: 'Icons', d: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { id: 'list', label: 'List', d: 'M4 6h2M10 6h10M4 12h2M10 12h10M4 18h2M10 18h10' },
  { id: 'gallery', label: 'Gallery', d: 'M3 5h18v10H3zM3 19h7M14 19h7' },
];

/** The length filter's bands, in minutes. Each starts where the one before
 *  it stops (5 to under 10, 10 to under 15…), and the last is open-ended so a
 *  long film can be found too. */
const LENGTH_BANDS: Array<{ from: number; to: number }> = [
  { from: 0, to: 5 }, { from: 5, to: 10 }, { from: 10, to: 15 },
  { from: 15, to: 20 }, { from: 20, to: 25 }, { from: 25, to: Infinity },
];

/* ── Paste a link ────────────────────────────────────────────────────── */

const AddLink: React.FC<{
  categories: MediaCategory[];
  shelf: MediaItem[];
  defaultCategory: string | null;
  onCancel: () => void;
  onAdd: (title: string, link: ParsedLink, categoryId: string | null, audioLangs: string[] | null) => Promise<string | null>;
  onNewCategory: (name: string) => Promise<MediaCategory | null>;
  /** Channels already watched, to say so instead of adding one twice. */
  channels: MediaChannel[];
  onWatch: (info: ChannelInfo, categoryId: string | null) => Promise<string | null>;
  /** Opened from "Watch a channel": the box asks for a channel link. */
  forChannel?: boolean;
}> = ({ categories, shelf, defaultCategory, onCancel, onAdd, onNewCategory, channels, onWatch, forChannel = false }) => {
  const [url, setUrl] = useState('');
  /** Languages it can be heard in; empty = not said. */
  const [sound, setSound] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<string | null>(defaultCategory);
  const [newCat, setNewCat] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isChannel = useMemo(() => isChannelLink(url), [url]);
  const link = useMemo(() => (isChannel ? null : parseYouTubeLink(url)), [url, isChannel]);
  const looksLikeTry = url.trim().length > 6;
  const already = useMemo(() => (link
    ? shelf.find(it => it.kind === link.kind && it.youtubeId === link.youtubeId) ?? null
    : null), [link, shelf]);

  // A channel link is looked up on the server (who it is, what it has posted).
  const [found, setFound] = useState<{ state: 'idle' | 'looking' | 'found' | 'error'; info?: ChannelInfo; error?: string }>({ state: 'idle' });
  useEffect(() => {
    if (!isChannel) { setFound({ state: 'idle' }); return; }
    let dead = false;
    setFound({ state: 'looking' });
    const t = window.setTimeout(async () => {
      const got = await resolveChannel(url);
      if (dead) return;
      setFound('error' in got ? { state: 'error', error: got.error } : { state: 'found', info: got });
    }, 450);
    return () => { dead = true; window.clearTimeout(t); };
  }, [url, isChannel]);
  const watching = found.info ? channels.find(c => c.channelId === found.info!.channelId) ?? null : null;

  const submit = async () => {
    if (isChannel) {
      if (found.state !== 'found' || !found.info || watching) return;
      setBusy(true); setError('');
      const problem = await onWatch(found.info, cat);
      setBusy(false);
      if (problem) setError(problem);
      return;
    }
    if (!link || already || !title.trim()) return;
    setBusy(true); setError('');
    const problem = await onAdd(title, link, cat, sound.length ? [...sound].sort() : null);
    setBusy(false);
    if (problem) setError(problem);
  };

  const field: React.CSSProperties = {
    width: '100%', height: 48, padding: '0 15px', borderRadius: 10,
    background: C.card, color: C.ink, border: `1px solid ${C.edge}`, outline: 'none',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
      style={{ background: 'rgba(5,6,7,0.72)' }} role="dialog" aria-modal="true" aria-label="Paste a link">
      <div className="w-full sm:max-w-[620px] sm:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.ink, fontFamily: SANS, minHeight: '100dvh', maxHeight: '100dvh' }}>

        <div className="flex items-start gap-3.5 px-5 sm:px-6 pt-5 pb-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="min-w-0 flex-grow">
            <h2 className="m-0 font-semibold" style={{ fontSize: 19, letterSpacing: '-0.015em' }}>Paste a link</h2>
            <p className="mt-1 mb-0 text-[13.5px]" style={{ color: C.muted }}>A video, a playlist or a channel.</p>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close"
            className="flex-shrink-0 flex items-center justify-center w-11 h-11 -mt-1 -mr-2 rounded-[9px]"
            style={{ background: 'transparent', color: C.dim }}>
            <Icon d={CLOSE} size={19} stroke={2.1} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto px-5 sm:px-6 py-5">
          <label htmlFor="media-url" className="block mb-2" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>YOUTUBE LINK</label>
          <input id="media-url" type="url" value={url} onChange={e => setUrl(e.target.value)} autoFocus
            placeholder={forChannel ? 'https://www.youtube.com/@channel' : 'https://www.youtube.com/watch?v=…'}
            style={{ ...field, fontFamily: MONO, fontSize: 13, borderColor: already || watching || found.state === 'error' ? 'var(--m-bad-ink)' : link || found.state === 'found' ? C.greenLine : C.edge }} />

          {isChannel && found.state === 'looking' && (
            <p className="mt-3 mb-0" style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.06em', color: C.dim }}>LOOKING UP THE CHANNEL…</p>
          )}
          {isChannel && found.state === 'error' && (
            <p role="alert" className="mt-3 mb-0 text-[13.5px]" style={{ color: 'var(--m-bad-ink)' }}>{found.error}</p>
          )}
          {isChannel && found.state === 'found' && found.info && (
            <div className="flex items-center gap-3.5 mt-3.5 px-4 py-3 rounded-[12px]"
              style={{ background: watching ? 'var(--m-bad-bg)' : C.greenBg, border: `1px solid ${watching ? 'var(--m-bad-line)' : C.greenLine}` }}>
              <ChannelAvatar ch={{ title: found.info.title, thumbUrl: found.info.thumb }} size={46} />
              <div className="min-w-0 flex-grow">
                <p className="m-0 text-[15.5px] font-semibold truncate">{found.info.title}</p>
                <p className="m-0 mt-0.5 truncate" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: watching ? 'var(--m-bad-ink)' : C.green }}>
                  {watching ? 'ALREADY WATCHING' : `CHANNEL${found.info.handle ? ` · ${found.info.handle.toUpperCase()}` : ''} · ${found.info.videos.length} VIDEOS`}
                </p>
              </div>
              {!watching && <span className="flex-shrink-0" style={{ color: C.green }}><Icon d={CHECK} size={19} stroke={2.4} /></span>}
            </div>
          )}

          {already && (
            <p role="alert" className="mt-3 mb-0 text-[13.5px]" style={{ color: 'var(--m-bad-ink)' }}>
              Already on the shelf: <strong>{already.title}</strong>
            </p>
          )}
          {link && !already && (
            <div className="flex items-center gap-3.5 mt-3.5 px-4 py-3 rounded-[11px]"
              style={{ background: C.greenBg, border: `1px solid ${C.greenLine}` }}>
              <span className="flex-shrink-0 flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 8, background: C.greenBg, color: C.green }}>
                <Icon d={CHECK} size={16} stroke={2.4} />
              </span>
              <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: C.green }}>
                {link.kind === 'playlist'
                  ? <>A <strong style={{ color: C.green }}>playlist</strong>. One title covers the whole list.</>
                  : <>A single <strong style={{ color: C.green }}>video</strong>.</>}
              </p>
            </div>
          )}
          {!link && !isChannel && looksLikeTry && (
            <p className="mt-3 mb-0 text-[13px]" style={{ color: 'var(--m-bad-ink)' }}>That is not a YouTube video or playlist link.</p>
          )}

          {!isChannel && <div className="mt-6">
            <label htmlFor="media-title" className="block mb-2" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>TITLE ON THE SHELF</label>
            <input id="media-title" type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What you will call it" style={{ ...field, fontSize: 15, fontWeight: 500 }} />
            <p className="mt-2 mx-0.5 mb-0 text-[12.5px]" style={{ color: C.dim }}>
              Your words, not YouTube&rsquo;s — this is what the search box looks through.
            </p>
          </div>}

          <div className="mt-6">
            <p className="m-0 mb-2.5" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>{isChannel ? 'ITS NEW VIDEOS GO TO' : 'CATEGORY'}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setCat(null)}
                className="inline-flex items-center h-11 px-4 rounded-[9px] text-[13.5px]"
                style={{ background: cat === null ? C.raised : C.card, border: `1px solid ${cat === null ? C.edge : C.line}`, color: cat === null ? C.ink : C.body, fontWeight: cat === null ? 600 : 500 }}>
                None
              </button>
              {categories.map((c, i) => {
                const on = cat === c.id;
                const hue = c.hue ?? HUES[i % HUES.length];
                return (
                  <button key={c.id} type="button" onClick={() => setCat(c.id)}
                    className="inline-flex items-center gap-2 h-11 px-4 rounded-[9px] text-[13.5px]"
                    style={{ background: on ? C.raised : C.card, border: `1px solid ${on ? hue : C.line}`, color: on ? C.ink : C.body, fontWeight: on ? 600 : 500 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: hue }} />
                    {c.name}
                  </button>
                );
              })}
              {!adding ? (
                <button type="button" onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-2 h-11 px-4 rounded-[9px] text-[13.5px] font-medium"
                  style={{ border: `1px dashed ${C.edge}`, background: 'transparent', color: C.muted }}>
                  <Icon d={PLUS} size={14} stroke={2.2} /> New
                </button>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <label htmlFor="media-newcat" className="sr-only">New category name</label>
                  <input id="media-newcat" value={newCat} onChange={e => setNewCat(e.target.value)} autoFocus
                    placeholder="Category name"
                    style={{ ...field, width: 170, height: 44, fontSize: 13.5 }} />
                  <button type="button" disabled={!newCat.trim()}
                    onClick={async () => {
                      const made = await onNewCategory(newCat);
                      if (made) { setCat(made.id); setNewCat(''); setAdding(false); }
                    }}
                    className="h-11 px-4 rounded-[9px] text-[13.5px] font-bold disabled:opacity-50"
                    style={{ background: C.amber, color: C.onAmber, border: 0 }}>Add</button>
                </span>
              )}
            </div>
          </div>

          {!isChannel && <div className="mt-6">
            <p className="m-0 mb-2.5" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>SOUND</p>
            <div role="group" aria-label="Sound" className="flex flex-wrap gap-2">
              {([['en', 'English'], ['ar', 'Arabic']] as const).map(([code, label]) => {
                const on = sound.includes(code);
                return (
                  <button key={code} type="button" aria-pressed={on}
                    onClick={() => setSound(prev => (on ? prev.filter(x => x !== code) : [...prev, code]))}
                    className="inline-flex items-center gap-2 h-11 px-4 rounded-[9px] text-[13.5px]"
                    style={{ background: on ? C.raised : C.card, border: `1px solid ${on ? C.amber : C.line}`, color: on ? C.ink : C.body, fontWeight: on ? 600 : 500 }}>
                    <Icon d={on ? `${SPEAKER}${SOUND_ON}` : SPEAKER} size={15} stroke={1.9} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>}

          {error && <p role="alert" className="mt-5 mb-0 text-[13.5px]" style={{ color: 'var(--m-bad-ink)' }}>{error}</p>}
        </div>

        <div className="flex items-center gap-2.5 px-5 sm:px-6 py-4" style={{ borderTop: `1px solid ${C.line}`, background: C.panel }}>
          <span className="flex-grow" />
          <button type="button" onClick={onCancel} className="h-11 px-4 rounded-[9px] text-sm font-semibold"
            style={{ background: 'transparent', border: `1px solid ${C.edge}`, color: C.body }}>Cancel</button>
          {isChannel ? (
            <button type="button" onClick={() => void submit()} disabled={found.state !== 'found' || !!watching || busy}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-[9px] text-sm font-bold disabled:opacity-50"
              style={{ background: C.amber, color: C.onAmber, border: 0 }}>
              <Icon d={BELL} size={16} stroke={2} /> {busy ? 'Saving…' : 'Watch channel'}
            </button>
          ) : (
            <button type="button" onClick={() => void submit()} disabled={!link || !!already || !title.trim() || busy}
              className="h-11 px-5 rounded-[9px] text-sm font-bold disabled:opacity-50"
              style={{ background: C.amber, color: C.onAmber, border: 0 }}>
              {busy ? 'Adding…' : 'Put it on the shelf'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── A watched channel's picture ───────────────────────────────────────── */

const ChannelAvatar: React.FC<{ ch: { title: string; thumbUrl: string | null }; size: number }> = ({ ch, size }) => {
  const [broken, setBroken] = useState(false);
  const src = channelThumb(ch);
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} referrerPolicy="no-referrer"
      className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size, background: C.raised }} />;
  }
  return (
    <span className="flex-shrink-0 rounded-full flex items-center justify-center font-bold"
      style={{ width: size, height: size, background: C.raised, border: `1px solid ${C.edge}`, color: C.amber, fontSize: Math.round(size * 0.42) }}>
      {ch.title.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
};

/* ── "This channel published new videos" ──────────────────────────────────
 * One channel at a time. Add puts the ticked ones on the shelf and counts the
 * unticked ones as skipped; Skip counts them all as skipped; the cross means
 * "later" and asks again next time Media opens. Drawn on the Media canvas,
 * "Channels & categories" page. */

const NewVideosDialog: React.FC<{
  channel: MediaChannel;
  videos: ChannelVideo[];
  step: { n: number; of: number };
  categories: MediaCategory[];
  counts: Map<string, number>;
  hueOf: (id: string | null) => string;
  onAdd: (picked: Array<{ video: ChannelVideo; categoryId: string | null }>) => Promise<string | null>;
  onNewCategory: (name: string) => Promise<MediaCategory | null>;
  onSkip: () => Promise<string | null>;
  onMute: () => Promise<string | null>;
  onLater: () => void;
}> = ({ channel, videos, step, categories, counts, hueOf, onAdd, onNewCategory, onSkip, onMute, onLater }) => {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(videos.map(v => v.id)));
  /** Each video's own category; they all start where this channel's went last. */
  const [catOf, setCatOf] = useState<Record<string, string | null>>({});
  const categoryOf = (id: string): string | null => (id in catOf ? catOf[id] : channel.categoryId);
  /** The category menu: for one video, or '*' for all of them. */
  const [menu, setMenu] = useState<{ key: string; rect: DOMRect } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A new channel in the same dialog starts fresh.
  useEffect(() => { setPicked(new Set(videos.map(v => v.id))); setCatOf({}); setMenu(null); setError(''); },
    [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc closes the menu first (it listens itself); only then the dialog.
  useEffect(() => {
    if (menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onLater(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onLater, menu]);

  const n = videos.length;
  const chosen = videos.filter(v => picked.has(v.id));
  const nameOf = (id: string | null) => categories.find(c => c.id === id)?.name ?? null;
  const openMenu = (key: string, e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault(); e.stopPropagation();          // inside the row's label: do not tick
    setMenu({ key, rect: e.currentTarget.getBoundingClientRect() });
  };
  const shared = videos.length && videos.every(v => categoryOf(v.id) === categoryOf(videos[0].id)) ? categoryOf(videos[0].id) : undefined;
  const menuVideo = menu && menu.key !== '*' ? videos.find(v => v.id === menu.key) ?? null : null;
  const run = async (job: () => Promise<string | null>) => {
    setBusy(true); setError('');
    const problem = await job();
    setBusy(false);
    if (problem) setError(problem);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-6"
      style={{ background: 'rgba(5,6,7,0.72)' }} role="dialog" aria-modal="true" aria-label={`New videos from ${channel.title}`}>
      <div className="w-full sm:max-w-[640px] flex flex-col overflow-hidden rounded-t-[20px] sm:rounded-2xl"
        style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.ink, fontFamily: SANS, maxHeight: '92dvh', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div className="sm:hidden flex justify-center pt-2"><span style={{ width: 40, height: 4, borderRadius: 2, background: C.edge }} /></div>

        <div className="flex-grow overflow-y-auto">
          <div className="flex items-center gap-2.5 pl-5 sm:pl-7 pr-3 pt-3 sm:pt-4">
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.amber }}>
              NEW ON YOUTUBE{step.of > 1 ? ` · ${step.n} OF ${step.of}` : ''}
            </span>
            <span className="flex-grow" />
            <button type="button" onClick={onLater} aria-label="Later" title="Later"
              className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: C.dim, border: 0 }}>
              <Icon d={CLOSE} size={19} stroke={2.1} />
            </button>
          </div>

          <div className="flex items-center gap-4 px-5 sm:px-7 pt-1">
            <ChannelAvatar ch={channel} size={52} />
            <div className="min-w-0">
              <h2 className="m-0 font-semibold text-[19px] sm:text-[22px]" style={{ letterSpacing: '-0.015em', lineHeight: 1.25 }}>
                {channel.title} published {n === 1 ? 'a new video' : `${n} new videos`}
              </h2>
              <p className="m-0 mt-1 text-[14px]" style={{ color: C.muted }}>Add {n === 1 ? 'it' : 'them'} to the shelf?</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-5 sm:px-7 pt-5">
            <span className="flex-grow" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>
              {n} VIDEO{n === 1 ? '' : 'S'}
            </span>
            {n > 1 && (
              <button type="button" onClick={e => openMenu('*', e)} aria-haspopup="menu" aria-expanded={menu?.key === '*'}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 rounded-[7px]"
                style={{ height: 30, border: `1px dashed ${menu?.key === '*' ? C.amber : C.edge}`, background: 'transparent', color: C.muted, fontFamily: MONO, fontSize: 11.5 }}>
                Set all <Icon d={CHEVRON} size={13} stroke={2} />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 px-5 sm:px-7 pt-2.5">
            {videos.map(v => {
              const on = picked.has(v.id);
              const cid = categoryOf(v.id);
              const cname = nameOf(cid);
              const open = menu?.key === v.id;
              return (
                <label key={v.id} className="flex items-center gap-3.5 p-2.5 rounded-[11px] cursor-pointer"
                  style={{ background: C.raised, border: `1px solid ${on ? C.amber : C.line}` }}>
                  <input type="checkbox" className="sr-only" checked={on}
                    onChange={() => setPicked(prev => { const next = new Set(prev); if (next.has(v.id)) next.delete(v.id); else next.add(v.id); return next; })} />
                  <span className="flex-shrink-0 flex items-center justify-center rounded-md"
                    style={{ width: 22, height: 22, background: on ? C.amber : 'transparent', border: on ? 0 : `1.5px solid ${C.edge}`, color: C.onAmber }}>
                    {on && <Icon d={CHECK} size={14} stroke={3} />}
                  </span>
                  <span className="relative flex-shrink-0 overflow-hidden w-[104px] sm:w-[136px]" style={{ aspectRatio: '16 / 9', borderRadius: 8, background: C.well }}>
                    <img src={videoThumb(v.id)} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    {v.length && (
                      <span className="absolute right-1 bottom-1 px-1 rounded" style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', fontFamily: MONO, fontSize: 10.5, lineHeight: '17px' }}>{v.length}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex flex-col gap-1.5">
                    <span className="text-[14px] sm:text-[15px] font-semibold line-clamp-2" style={{ lineHeight: 1.35 }}>{v.title || 'Untitled video'}</span>
                    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      {v.age && <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: C.amber }}>{v.age.toUpperCase()}</span>}
                      <button type="button" onClick={e => openMenu(v.id, e)} aria-haspopup="menu" aria-expanded={open}
                        aria-label={`Category for ${v.title || 'this video'}: ${cname ?? 'none'}. Change it`}
                        className="inline-flex items-center gap-1.5 pl-2 pr-1 rounded-[7px] max-w-full"
                        style={{ height: 28, border: `1px solid ${open ? C.amber : C.edge}`, background: open ? C.chip : 'transparent', color: cname ? C.body : C.dim, fontFamily: MONO, fontSize: 11.5 }}>
                        {cname
                          ? <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: '50%', background: hueOf(cid) }} />
                          : <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${C.dim}` }} />}
                        <span className="truncate">{cname ?? 'No category'}</span>
                        <Icon d={CHEVRON} size={13} stroke={2} />
                      </button>
                      {/* Watch it first. Inside the row's label: must not tick. */}
                      <a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        aria-label={`Open ${v.title || 'this video'} on YouTube`} title="Open on YouTube"
                        className="inline-flex items-center gap-1.5 pl-1.5 pr-2 rounded-[7px] no-underline"
                        style={{ height: 28, border: `1px solid ${C.edge}`, background: 'transparent', color: C.body, fontFamily: MONO, fontSize: 11.5 }}>
                        <span className="flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 13, borderRadius: 4, background: '#ff0033', color: '#fff' }}>
                          <Icon d={PLAY} size={9} fill />
                        </span>
                        YouTube
                      </a>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {error && <p role="alert" className="mx-5 sm:mx-7 mt-4 mb-0 text-[13.5px]" style={{ color: 'var(--m-bad-ink)' }}>{error}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 sm:px-7 py-4 mt-4" style={{ borderTop: `1px solid ${C.line}` }}>
          <button type="button" disabled={busy} onClick={() => void run(onMute)}
            className="inline-flex items-center gap-2 h-11 px-3 rounded-[9px] text-[13.5px] font-medium disabled:opacity-50 max-sm:order-3 max-sm:w-full max-sm:justify-center"
            style={{ background: 'transparent', border: 0, color: C.muted }}>
            <Icon d={BELL_OFF} size={16} stroke={1.8} /> Mute channel
          </button>
          <span className="flex-grow max-sm:hidden" />
          <button type="button" disabled={busy} onClick={() => void run(onSkip)}
            className="h-[46px] px-[18px] rounded-[10px] text-sm font-semibold disabled:opacity-50 max-sm:flex-1"
            style={{ background: 'transparent', border: `1px solid ${C.edge}`, color: C.body }}>Skip</button>
          <button type="button" disabled={busy || !chosen.length} onClick={() => void run(() => onAdd(chosen.map(v => ({ video: v, categoryId: categoryOf(v.id) }))))}
            className="inline-flex items-center justify-center gap-2 h-[46px] px-5 rounded-[10px] text-sm font-bold disabled:opacity-50 max-sm:flex-[2]"
            style={{ background: C.amber, color: C.onAmber, border: 0 }}>
            <Icon d={PLUS} size={16} stroke={2.3} />
            {busy ? 'Adding…' : `Add ${chosen.length === n && n > 1 ? `all ${n}` : chosen.length} to the shelf`}
          </button>
        </div>
      </div>

      {menu && (
        <CategoryMenu
          target={menuVideo
            ? { title: menuVideo.title || 'This video', categoryId: categoryOf(menuVideo.id), thumb: videoThumb(menuVideo.id) }
            : { title: `All ${n} videos`, categoryId: shared, thumb: null }}
          heading={menuVideo ? 'PUT IT IN' : 'SET ALL TO'}
          anchor={menu.rect}
          categories={categories}
          counts={counts}
          hueOf={hueOf}
          onPick={id => {
            setCatOf(prev => (menu.key === '*'
              ? Object.fromEntries(videos.map(v => [v.id, id]))
              : { ...prev, [menu.key]: id }));
            setMenu(null);
          }}
          onNew={onNewCategory}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
};

/* ── Picking a reel's category ───────────────────────────────────────────
 * A small menu beside whatever was tapped (the folder button, or the
 * category chip on the card); a sheet from the bottom on a phone. A tap
 * moves the reel and closes it. */

const CategoryMenu: React.FC<{
  /** What is being placed: a reel on the shelf, or a video in the pop-up.
   *  categoryId undefined = a mix (nothing ticked). */
  target: { title: string; categoryId: string | null | undefined; thumb: string | null };
  heading?: string;
  anchor: DOMRect;
  categories: MediaCategory[];
  counts: Map<string, number>;
  hueOf: (id: string | null) => string;
  onPick: (categoryId: string | null) => void;
  onNew: (name: string) => Promise<MediaCategory | null>;
  onClose: () => void;
}> = ({ target, heading = 'MOVE TO', anchor, categories, counts, hueOf, onPick, onNew, onClose }) => {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const sheet = typeof window !== 'undefined' && window.innerWidth < 640;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // The page scrolling away from the menu closes it; scrolling inside it does not.
    const onScroll = (e: Event) => { if (!sheet && !box.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose, sheet]);

  const make = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const made = await onNew(name);
    setBusy(false);
    if (made) onPick(made.id);
    else window.alert('Could not make that category. Check the connection and try again.');
  };

  const rows = [{ id: null as string | null, name: 'No category' }, ...categories.map(c => ({ id: c.id as string | null, name: c.name }))];
  const rowH = sheet ? 52 : 40;
  const list = (
    <>
      {rows.map(r => {
        const on = target.categoryId === r.id;
        return (
          <button key={r.id ?? 'none'} type="button" role="menuitemradio" aria-checked={on} onClick={() => onPick(r.id)}
            className="flex items-center gap-3 w-full px-3 rounded-[8px] text-left"
            style={{ height: rowH, border: 0, background: on ? C.raised : 'transparent', color: on ? C.ink : C.body, fontWeight: on ? 600 : 500, fontSize: sheet ? 15 : 14 }}>
            {r.id
              ? <span className="flex-shrink-0" style={{ width: 9, height: 9, borderRadius: '50%', background: hueOf(r.id) }} />
              : <span className="flex-shrink-0" style={{ width: 9, height: 9, borderRadius: '50%', border: `1.5px solid ${C.dim}` }} />}
            <span className="flex-grow min-w-0 truncate">{r.name}</span>
            {on
              ? <span style={{ color: C.amber }}><Icon d={CHECK} size={16} stroke={2.6} /></span>
              : r.id && <span style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>{counts.get(r.id) ?? 0}</span>}
          </button>
        );
      })}
      <div style={{ height: 1, background: C.line, margin: '6px 4px' }} />
      <div className="flex gap-1.5 p-1">
        <label htmlFor="media-menu-newcat" className="sr-only">New category name</label>
        <input id="media-menu-newcat" value={name} onChange={e => setName(e.target.value)} placeholder="New category"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void make(); } }}
          className="flex-grow min-w-0 px-2.5 rounded-[8px] text-[13.5px]"
          style={{ height: sheet ? 44 : 38, border: `1px solid ${C.edge}`, background: C.card, color: C.ink, outline: 'none' }} />
        <button type="button" onClick={() => void make()} disabled={!name.trim() || busy} aria-label="Add category"
          className="flex-shrink-0 flex items-center justify-center rounded-[8px] disabled:opacity-50"
          style={{ width: sheet ? 44 : 38, height: sheet ? 44 : 38, border: 0, background: C.amber, color: C.onAmber }}>
          <Icon d={PLUS} size={16} stroke={2.3} />
        </button>
      </div>
    </>
  );

  if (sheet) {
    return (
      <div className="fixed inset-0 z-[70] flex items-end" style={{ background: 'rgba(5,6,7,0.72)', fontFamily: SANS }} onClick={onClose}>
        <div role="menu" aria-label={`Category for ${target.title}`} onClick={e => e.stopPropagation()}
          className="w-full rounded-t-[20px] px-3 pt-2 pb-5 overflow-y-auto"
          style={{ background: C.panel, borderTop: `1px solid ${C.line}`, color: C.ink, maxHeight: '85dvh' }}>
          <div className="flex justify-center"><span style={{ width: 40, height: 4, borderRadius: 2, background: C.edge }} /></div>
          <div className="flex items-center gap-3 px-2 pt-3.5 pb-3">
            {target.thumb && <img src={target.thumb} alt="" className="flex-shrink-0 object-cover" style={{ width: 64, height: 36, borderRadius: 6 }} />}
            <div className="min-w-0">
              <p className="m-0" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>{heading}</p>
              <p className="m-0 mt-0.5 text-[14.5px] font-semibold truncate">{target.title}</p>
            </div>
          </div>
          {list}
        </div>
      </div>
    );
  }

  const est = rows.length * rowH + 120;
  const below = anchor.bottom + 6 + est < window.innerHeight - 8;
  const top = below ? anchor.bottom + 6 : Math.max(8, anchor.top - 6 - est);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - 288);
  return (
    <>
      <div className="fixed inset-0 z-[69]" onClick={onClose} aria-hidden="true" />
      <div ref={box} role="menu" aria-label={`Category for ${target.title}`}
        className="fixed z-[70] p-2 rounded-xl overflow-y-auto"
        style={{ top, left, width: 280, maxHeight: window.innerHeight - 16, background: C.panel, border: `1px solid ${C.edge}`, color: C.ink, fontFamily: SANS, boxShadow: '0 18px 50px rgba(0,0,0,0.4)' }}>
        <p className="m-0 px-3 pt-1.5 pb-2" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>{heading}</p>
        {list}
      </div>
    </>
  );
};

/* ── The shelf ───────────────────────────────────────────────────────── */

interface MediaPageProps {
  teacherId: string;
  studentId?: string;
  studentName?: string;
  /** How many unwatched-by-the-tutor new videos the shelf holds, as it changes,
   *  so the Media tab's badge follows along without reloading the shelf. */
  onNewsChange?: (count: number) => void;
}

const MediaPage: React.FC<MediaPageProps> = ({ teacherId, studentId, studentName, onNewsChange }) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cats, setCats] = useState<MediaCategory[]>([]);
  const [marks, setMarks] = useState<Map<string, MediaProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unwatched' | 'finished'>('all');
  /** Which LENGTH_BANDS entry the shelf is narrowed to; null = any length. */
  const [band, setBand] = useState<number | null>(null);
  /** Only reels that can be heard in English. */
  const [englishOnly, setEnglishOnly] = useState(false);
  /** How the shelf is laid out; remembered on this device. */
  const [view, setView] = useState<ShelfView>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      return v === 'icons' || v === 'gallery' ? v : 'list';
    } catch { return 'list'; }
  });
  const pickView = (v: ShelfView) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage off */ }
  };
  /** Seconds per video id, read from YouTube once and kept on this device. */
  const [lengths, setLengths] = useState<Map<string, number>>(new Map());
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  /** What was new in the reel being opened, kept for as long as it is open. */
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [newCat, setNewCat] = useState('');
  const [catForm, setCatForm] = useState(false);
  /** Watched YouTube channels, and whether this visit has asked YouTube yet. */
  const [channels, setChannels] = useState<MediaChannel[]>([]);
  const [channelsReady, setChannelsReady] = useState(false);
  /** The channel whose "new videos" pop-up is open, and the ones after it. */
  const [newsFor, setNewsFor] = useState<string | null>(null);
  const newsQueue = useRef<string[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const autoOffered = useRef(false);
  /** The add box was opened from "Watch a channel". */
  const [addAsChannel, setAddAsChannel] = useState(false);
  /** The category menu: which reel, and where it was opened from. */
  const [catMenu, setCatMenu] = useState<{ item: MediaItem; rect: DOMRect } | null>(null);

  const who = studentName ?? '';

  useEffect(() => {
    let dead = false;
    void Promise.all([listMedia(), listCategories()]).then(async ([i, c]) => {
      if (dead) return;
      setItems(i); setCats(c); setLoading(false);
      // Ask YouTube what the playlists hold now. Throttled in the service, so
      // opening the tab twice in a morning costs one round trip, not two.
      const changed = await refreshPlaylistNews(i);
      if (dead || !changed.length) return;
      const byId = new Map(changed.map(x => [x.id, x]));
      setItems(prev => prev.map(x => byId.get(x.id) ?? x));
    });
    return () => { dead = true; };
  }, []);

  // One number for the tab badge, recomputed whenever the shelf changes.
  useEffect(() => { onNewsChange?.(totalNewVideos(items) + totalChannelNews(channels, items)); }, [items, channels, onNewsChange]);

  // Watched channels: read them, then ask YouTube what each has posted (the
  // service skips any asked about in the last half hour, and muted ones).
  useEffect(() => {
    let dead = false;
    void (async () => {
      const list = await listChannels();
      if (dead) return;
      setChannels(list);
      const fresh = await refreshChannelNews(list);
      if (dead) return;
      if (fresh.length) {
        const byId = new Map(fresh.map(c => [c.id, c]));
        setChannels(prev => prev.map(c => byId.get(c.id) ?? c));
      }
      setChannelsReady(true);
    })();
    return () => { dead = true; };
  }, []);

  const shelfVideoIds = useMemo(
    () => new Set(items.filter(it => it.kind === 'video').map(it => it.youtubeId)), [items]);
  const pendingOf = useCallback((c: MediaChannel) => pendingChannelVideos(c, shelfVideoIds), [shelfVideoIds]);

  const openNews = useCallback((ids: string[]) => {
    if (!ids.length) return;
    newsQueue.current = ids.slice(1);
    setNewsTotal(ids.length);
    setNewsFor(ids[0]);
  }, []);
  const nextNews = useCallback(() => {
    const [head, ...rest] = newsQueue.current;
    newsQueue.current = rest;
    setNewsFor(head ?? null);
  }, []);
  const closeNews = useCallback(() => { newsQueue.current = []; setNewsFor(null); }, []);

  // A channel in the queue with nothing left to offer (muted meanwhile, or its
  // videos were added by hand) is passed over.
  useEffect(() => {
    if (!newsFor) return;
    const ch = channels.find(c => c.id === newsFor);
    if (!ch || !pendingOf(ch).length) nextNews();
  }, [newsFor, channels, pendingOf, nextNews]);

  // Opening Media: if a watched channel posted something, ask once per visit.
  useEffect(() => {
    if (autoOffered.current || loading || !channelsReady) return;
    autoOffered.current = true;
    openNews(channels.filter(c => pendingOf(c).length > 0).map(c => c.id));
  }, [loading, channelsReady, channels, pendingOf, openNews]);

  /** Opening a playlist is the tutor looking at it: nothing in it is new now.
   *
   *  The ids are caught on the way in, because this is the moment they stop
   *  counting as new — without that the booth would open with no idea which
   *  video had just arrived, which is the one thing the tutor wants to see. */
  const openItem = useCallback((it: MediaItem) => {
    const fresh = newVideoIds(it);
    setFreshIds(fresh);
    setOpen(it);
    if (!fresh.length) return;
    const seen = it.latestVideoIds;
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, seenVideoIds: seen } : x)));
    void markPlaylistSeen(it);
  }, []);

  useEffect(() => {
    let dead = false;
    if (!studentId) { setMarks(new Map()); return; }
    void loadProgress(studentId).then(m => { if (!dead) setMarks(m); });
    return () => { dead = true; };
  }, [studentId]);

  const noteProgress = useCallback((p: MediaProgress) => {
    setMarks(prev => new Map(prev).set(p.itemId, p));
  }, []);

  // Playlists put on the shelf before stills were stored have none. Fetch each
  // one once, quietly, and keep it — a reel added today already arrives with
  // its picture, so this runs for the old ones and then never again.
  useEffect(() => {
    const missing = items.filter(it => it.kind === 'playlist' && !it.thumbUrl);
    if (!missing.length) return;
    let dead = false;
    void (async () => {
      for (const it of missing) {
        const url = await fetchPlaylistThumb(it.youtubeId);
        if (dead || !url) continue;
        setItems(prev => prev.map(x => (x.id === it.id ? { ...x, thumbUrl: url } : x)));
        void updateMedia(it.id, { thumbUrl: url });
      }
    })();
    return () => { dead = true; };
  }, [items]);

  // Every video's length, for the length filter and the card.
  useEffect(() => {
    const ids = items.filter(it => it.kind === 'video' && !lengths.has(it.youtubeId)).map(it => it.youtubeId);
    if (!ids.length) return;
    let dead = false;
    void fetchVideoLengths(ids, loadYouTubeApi).then(got => {
      if (dead || !got.size) return;
      setLengths(prev => { const next = new Map(prev); got.forEach((v, k) => next.set(k, v)); return next; });
    });
    return () => { dead = true; };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A video's length: YouTube's, or what the player reported while watching. */
  const lengthOf = useCallback((it: MediaItem): number | null => {
    if (it.kind !== 'video') return null;
    return lengths.get(it.youtubeId) ?? marks.get(it.id)?.durationSeconds ?? null;
  }, [lengths, marks]);

  const hueOf = useCallback((id: string | null): string => {
    if (!id) return C.dim;
    const i = cats.findIndex(c => c.id === id);
    return cats[i]?.hue ?? HUES[(i < 0 ? 0 : i) % HUES.length];
  }, [cats]);

  // ── What the shelf shows right now ──────────────────────────────────
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(it => {
      if (channel !== 'all' && it.categoryId !== channel) return false;
      if (q && !it.title.toLowerCase().includes(q)) return false;
      if (band != null) {
        const len = lengthOf(it);
        const { from, to } = LENGTH_BANDS[band];
        if (len == null || len < from * 60 || len >= to * 60) return false;
      }
      if (englishOnly && !hasEnglishSound(it)) return false;
      if (filter === 'all') return true;
      const done = marks.get(it.id)?.finished ?? false;
      return filter === 'finished' ? done : !done;
    });
  }, [items, channel, query, filter, marks, band, lengthOf, englishOnly]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (it.categoryId) m.set(it.categoryId, (m.get(it.categoryId) ?? 0) + 1);
    return m;
  }, [items]);

  const standing = useMemo(() => {
    let done = 0, started = 0;
    for (const it of items) {
      const p = marks.get(it.id);
      if (p?.finished) done += 1;
      else if (p && (p.positionSeconds > 5 || p.watchedIndexes.length)) started += 1;
    }
    return { done, started, rest: items.length - done - started };
  }, [items, marks]);

  /** The reel to offer first: the most recently touched one not yet finished. */
  const resume = useMemo(() => {
    if (!studentId) return null;
    let best: { item: MediaItem; p: MediaProgress } | null = null;
    for (const it of items) {
      const p = marks.get(it.id);
      if (!p || p.finished) continue;
      if (p.positionSeconds < 5 && !p.watchedIndexes.length) continue;
      if (!best || p.updatedAt > best.p.updatedAt) best = { item: it, p };
    }
    return best;
  }, [items, marks, studentId]);

  const doAdd = async (title: string, link: ParsedLink, categoryId: string | null, audioLangs: string[] | null): Promise<string | null> => {
    const res = await addMedia({ teacherId, title, link, categoryId, audioLangs });
    if ('error' in res) return res.error;
    setItems(prev => [res.item, ...prev]);
    setAdding(false);
    return null;
  };

  const doNewCategory = async (name: string): Promise<MediaCategory | null> => {
    const made = await createCategory(teacherId, name, HUES[cats.length % HUES.length]);
    if (made) setCats(prev => [...prev, made].sort((a, b) => a.name.localeCompare(b.name)));
    return made;
  };

  const rename = async (it: MediaItem) => {
    const next = window.prompt('Title on the shelf', it.title);
    if (next == null || !next.trim() || next.trim() === it.title) return;
    if (await updateMedia(it.id, { title: next })) {
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, title: next.trim() } : x)));
    }
  };

  /** The category menu moves the reel at once; a failed save puts it back. */
  const openCatMenu = (it: MediaItem, e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setCatMenu({ item: it, rect: e.currentTarget.getBoundingClientRect() });
  };
  const pickCategory = async (it: MediaItem, categoryId: string | null) => {
    setCatMenu(null);
    if (it.categoryId === categoryId) return;
    const before = it.categoryId;
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, categoryId } : x)));
    if (!(await updateMedia(it.id, { categoryId }))) {
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, categoryId: before } : x)));
      window.alert(`Could not move "${it.title}". Check the connection and try again.`);
    }
  };

  // ── Watched channels ───────────────────────────────────────────────────
  const watchChannel = async (info: ChannelInfo, categoryId: string | null): Promise<string | null> => {
    const res = await addChannel(teacherId, info, categoryId);
    if ('error' in res) return res.error;
    setChannels(prev => [...prev, res.channel]);
    setAdding(false);
    return null;
  };
  /** Everything the pop-up offered counts as seen from now on. */
  const markOffered = async (ch: MediaChannel, ids: string[], patch: { categoryId?: string | null } = {}): Promise<boolean> => {
    const seen = Array.from(new Set([...ch.seenVideoIds, ...ids]));
    if (!(await updateChannel(ch.id, { seenVideoIds: seen, ...patch }))) return false;
    setChannels(prev => prev.map(c => (c.id === ch.id ? { ...c, seenVideoIds: seen, ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}) } : c)));
    return true;
  };
  const addFromChannel = async (ch: MediaChannel, offered: ChannelVideo[], picked: Array<{ video: ChannelVideo; categoryId: string | null }>): Promise<string | null> => {
    const failed: ChannelVideo[] = [];
    // Oldest first, so the newest lands at the top of the shelf.
    for (const { video: v, categoryId } of [...picked].reverse()) {
      const res = await addMedia({
        teacherId, title: v.title || 'New video', categoryId,
        link: { kind: 'video', youtubeId: v.id, url: `https://www.youtube.com/watch?v=${v.id}` },
      });
      if ('error' in res) { if (!/already on the shelf/i.test(res.error)) failed.push(v); continue; }
      setItems(prev => [res.item, ...prev]);
    }
    // Next time the pop-up starts on the category used most this time.
    const tally = new Map<string | null, number>();
    for (const p of picked) tally.set(p.categoryId, (tally.get(p.categoryId) ?? 0) + 1);
    const usual = picked.length ? [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0] : ch.categoryId;
    const failedIds = new Set(failed.map(v => v.id));
    if (!(await markOffered(ch, offered.map(v => v.id).filter(id => !failedIds.has(id)), { categoryId: usual }))) {
      return 'The videos were added, but the channel could not be updated. Check the connection.';
    }
    if (failed.length) return `Could not add ${failed.length === 1 ? 'one video' : `${failed.length} videos`}. Try again.`;
    nextNews();
    return null;
  };
  const skipChannel = async (ch: MediaChannel, offered: ChannelVideo[]): Promise<string | null> => {
    if (!(await markOffered(ch, offered.map(v => v.id)))) return 'Could not save that. Check the connection and try again.';
    nextNews();
    return null;
  };
  const setMuted = async (ch: MediaChannel, muted: boolean): Promise<boolean> => {
    setChannels(prev => prev.map(c => (c.id === ch.id ? { ...c, muted } : c)));
    if (await updateChannel(ch.id, { muted })) return true;
    setChannels(prev => prev.map(c => (c.id === ch.id ? { ...c, muted: ch.muted } : c)));
    window.alert(`Could not ${muted ? 'mute' : 'unmute'} ${ch.title}. Check the connection and try again.`);
    return false;
  };
  const removeChannel = async (ch: MediaChannel) => {
    if (!window.confirm(`Stop watching ${ch.title}? Videos already on the shelf stay.`)) return;
    if (await deleteChannel(ch.id)) setChannels(prev => prev.filter(c => c.id !== ch.id));
    else window.alert(`Could not remove ${ch.title}. Check the connection and try again.`);
  };

  /** The speaker on a reel: English on or off. The rest of its languages stay. */
  const toggleEnglish = async (it: MediaItem) => {
    const before = it.audioLangs;
    const next = hasEnglishSound(it)
      ? (before ?? []).filter(l => l !== 'en')
      : [...(before ?? []), 'en'].sort();
    setItems(prev => prev.map(x => (x.id === it.id ? { ...x, audioLangs: next } : x)));
    if (!(await updateMedia(it.id, { audioLangs: next }))) {
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, audioLangs: before } : x)));
      window.alert(`Could not save the sound for "${it.title}". Check the connection and try again.`);
    }
  };

  const remove = async (it: MediaItem) => {
    if (!window.confirm(`Take "${it.title}" off the shelf for every student?`)) return;
    if (await deleteMedia(it.id)) setItems(prev => prev.filter(x => x.id !== it.id));
  };

  const noteCount = useCallback((id: string, n: number) => {
    setItems(prev => prev.map(x => (x.id === id ? { ...x, itemCount: n } : x)));
    void updateMedia(id, { itemCount: n });
  }, []);

  // ── The booth takes the whole page ──────────────────────────────────
  if (open && studentId) {
    const current = items.find(x => x.id === open.id) ?? open;
    return (
      <Booth
        item={current}
        studentId={studentId}
        studentName={who || 'this student'}
        progress={marks.get(current.id)}
        newIds={freshIds}
        onProgress={noteProgress}
        onItemCount={n => noteCount(current.id, n)}
        onClose={() => setOpen(null)}
      />
    );
  }

  /** The category on a card, as the button that changes it. */
  const catChip = (it: MediaItem) => {
    const name = cats.find(c => c.id === it.categoryId)?.name ?? null;
    const on = catMenu?.item.id === it.id;
    return (
      <button type="button" onClick={e => openCatMenu(it, e)} aria-haspopup="menu" aria-expanded={on}
        aria-label={`Category: ${name ?? 'none'}. Change it`}
        className="inline-flex items-center gap-1.5 pl-2 pr-1 rounded-[6px] hover:border-[var(--m-edge)]"
        style={{ height: 24, border: `1px solid ${on ? C.amber : C.line}`, background: on ? C.chip : 'transparent', color: name ? C.body : C.dim, fontFamily: MONO, fontSize: 11.5 }}>
        {name
          ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: hueOf(it.categoryId) }} />
          : <span style={{ width: 7, height: 7, borderRadius: '50%', border: `1.5px solid ${C.dim}` }} />}
        {name ?? 'No category'}
        <Icon d={CHEVRON} size={13} stroke={2} />
      </button>
    );
  };

  const chipStyle = (on: boolean): React.CSSProperties => ({
    height: 38, padding: '0 15px', borderRadius: 7, border: 0, fontSize: 13,
    fontWeight: on ? 600 : 500, background: on ? C.track : 'transparent', color: on ? C.ink : C.muted,
  });

  return (
    <div className="media-booth w-full" style={{ background: C.ground, color: C.ink, fontFamily: SANS, minHeight: '100vh' }}>

      {/* ── booth header ─────────────────────────────────────────────── */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.line}` }}>
        <div className="w-full px-4 sm:px-7 lg:px-10 py-5 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center justify-center flex-shrink-0"
              style={{ width: 38, height: 38, borderRadius: 10, background: C.raised, border: `1px solid ${C.edge}`, color: C.amber }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="7" width="14" height="10" rx="2.5" />
                <path d="M16 11.2l5.2-2.6v6.8L16 12.8z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="m-0 font-semibold" style={{ fontSize: 21, letterSpacing: '-0.015em' }}>Media</h1>
              <p className="m-0 mt-0.5" style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.04em', color: C.muted }}>
                SHELF SHARED · MARKS PER STUDENT
              </p>
            </div>
          </div>

          <span className="flex-grow" />

          {who && (
            <div className="flex items-center gap-2.5 pl-4 pr-2" style={{ height: 46, borderRadius: 10, background: C.raised, border: `1px solid ${C.edge}` }}>
              <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.1em', color: C.muted }}>MARKS FOR</span>
              <span className="flex items-center gap-2 text-[14.5px] font-semibold">
                <span className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: '50%', background: C.amber, color: C.onAmber, fontSize: 11.5, fontWeight: 700 }}>
                  {who.trim().charAt(0).toUpperCase()}
                </span>
                {who}
              </span>
            </div>
          )}

          <button type="button" onClick={() => { setAddAsChannel(false); setAdding(true); }}
            className="flex items-center gap-2 px-5 text-[14.5px] font-bold"
            style={{ height: 46, borderRadius: 10, border: 0, background: C.amber, color: C.onAmber }}>
            <Icon d={PLUS} size={17} stroke={2.2} /> Paste a link
          </button>
        </div>
      </div>

      <div className="w-full px-4 sm:px-7 lg:px-10 py-7">
        {!who && (
          <p className="mt-0 mb-6 px-4 py-3 rounded-[10px] text-[13.5px]"
            style={{ background: 'var(--m-warn-bg)', border: '1px solid var(--m-warn-line)', color: 'var(--m-warn-ink)' }}>
            No student is open, so the shelf shows no marks. Open a student first to
            watch with them and keep their place.
          </p>
        )}

        <div className="flex flex-wrap gap-8 lg:gap-10">

          {/* ══ channels rail ═══════════════════════════════════════════ */}
          <nav aria-label="Categories" className="flex-[1_1_210px] lg:max-w-[260px] min-w-0 max-lg:order-2">
            <p className="m-0 mb-3" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>CATEGORIES</p>
            <div className="flex flex-col gap-[3px]">
              {[{ id: 'all', name: 'Everything', hue: C.dim, n: items.length } as const,
                ...cats.map((c, i) => ({ id: c.id, name: c.name, hue: c.hue ?? HUES[i % HUES.length], n: counts.get(c.id) ?? 0 }))]
                .map(c => {
                  const on = channel === c.id;
                  // Two real buttons side by side: a delete nested INSIDE the
                  // row button would be invalid markup and Tab would skip it.
                  return (
                    <div key={c.id} className="flex items-center gap-0.5 pr-1"
                      style={{ borderRadius: 9, background: on ? C.raised : 'transparent' }}>
                      <button type="button" onClick={() => setChannel(c.id)}
                        className="flex items-center gap-3 flex-grow min-w-0 px-3.5 text-sm"
                        style={{ height: 44, border: 0, borderRadius: 9, background: 'transparent', fontWeight: on ? 600 : 500, color: on ? C.ink : C.body }}>
                        <span className="flex-shrink-0" style={{ width: 8, height: 8, borderRadius: '50%', background: c.hue }} />
                        <span className="flex-grow text-left min-w-0 truncate">{c.name}</span>
                        <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{c.n}</span>
                      </button>
                      {c.id !== 'all' && (
                        <button type="button" aria-label={`Delete the category ${c.name}`}
                          onClick={async () => {
                            if (!window.confirm(`Delete the category "${c.name}"? Its videos stay on the shelf.`)) return;
                            if (await deleteCategory(c.id)) {
                              setCats(prev => prev.filter(x => x.id !== c.id));
                              setItems(prev => prev.map(x => (x.categoryId === c.id ? { ...x, categoryId: null } : x)));
                              if (channel === c.id) setChannel('all');
                            }
                          }}
                          className="flex-shrink-0 flex items-center justify-center"
                          style={{ width: 32, height: 44, border: 0, borderRadius: 9, background: 'transparent', color: C.dim }}>
                          <Icon d={CLOSE} size={13} stroke={2} />
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

            {!catForm ? (
              <button type="button" onClick={() => setCatForm(true)}
                className="flex items-center gap-2.5 w-full mt-2.5 px-3.5 text-[13.5px] font-medium"
                style={{ height: 44, border: `1px dashed ${C.edge}`, borderRadius: 9, background: 'transparent', color: C.muted }}>
                <Icon d={PLUS} size={15} stroke={2} /> New category
              </button>
            ) : (
              <div className="flex gap-2 mt-2.5">
                <label htmlFor="cat-name" className="sr-only">New category name</label>
                <input id="cat-name" value={newCat} onChange={e => setNewCat(e.target.value)} autoFocus
                  placeholder="Name"
                  onKeyDown={async e => {
                    if (e.key !== 'Enter' || !newCat.trim()) return;
                    if (await doNewCategory(newCat)) { setNewCat(''); setCatForm(false); }
                  }}
                  style={{ flexGrow: 1, minWidth: 0, height: 44, padding: '0 12px', borderRadius: 9, background: C.card, color: C.ink, border: `1px solid ${C.edge}`, fontSize: 13.5 }} />
                <button type="button" disabled={!newCat.trim()}
                  onClick={async () => { if (await doNewCategory(newCat)) { setNewCat(''); setCatForm(false); } }}
                  className="px-4 text-[13.5px] font-bold disabled:opacity-50"
                  style={{ height: 44, borderRadius: 9, border: 0, background: C.amber, color: C.onAmber }}>Add</button>
              </div>
            )}

            {/* ── Watched channels ─────────────────────────────────── */}
            <div className="flex items-center mt-8 mb-2.5">
              <p className="m-0 flex-grow" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>CHANNELS</p>
              {channels.length > 0 && <span style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>{channels.length}</span>}
            </div>
            <div className="flex flex-col gap-0.5">
              {channels.map(ch => {
                const waiting = pendingOf(ch).length;
                const home = `https://www.youtube.com/${ch.handle ?? `channel/${ch.channelId}`}`;
                return (
                  <div key={ch.id} className="group flex items-center gap-0.5 pr-1 hover:bg-[var(--m-raised)] focus-within:bg-[var(--m-raised)]"
                    style={{ borderRadius: 9 }}>
                    <button type="button"
                      onClick={() => (waiting ? openNews([ch.id]) : window.open(home, '_blank', 'noopener'))}
                      title={waiting ? `${waiting} new` : 'Open on YouTube'}
                      className="flex items-center gap-2.5 flex-grow min-w-0 pl-2.5 pr-1 text-sm"
                      style={{ height: 48, border: 0, borderRadius: 9, background: 'transparent', color: C.body, opacity: ch.muted ? 0.62 : 1 }}>
                      <ChannelAvatar ch={ch} size={30} />
                      <span className="flex-grow text-left min-w-0 truncate font-medium">{ch.title}</span>
                      {waiting > 0 && (
                        <span className="flex-shrink-0 px-2 rounded-[5px] [@media(hover:hover)]:group-hover:hidden [@media(hover:hover)]:group-focus-within:hidden"
                          style={{ background: C.amber, color: C.onAmber, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', lineHeight: '22px' }}>
                          {waiting} NEW
                        </span>
                      )}
                      {ch.muted && <span className="flex-shrink-0 group-hover:hidden group-focus-within:hidden [@media(hover:none)]:hidden" style={{ color: C.dim }} aria-label="Muted"><Icon d={BELL_OFF} size={15} stroke={1.8} /></span>}
                    </button>
                    <button type="button" onClick={() => void setMuted(ch, !ch.muted)} aria-pressed={ch.muted}
                      aria-label={ch.muted ? `Unmute ${ch.title}` : `Mute ${ch.title}`} title={ch.muted ? 'Unmute' : 'Mute'}
                      className="flex-shrink-0 hidden items-center justify-center group-hover:flex group-focus-within:flex [@media(hover:none)]:flex"
                      style={{ width: 34, height: 44, border: 0, borderRadius: 8, background: 'transparent', color: ch.muted ? C.amber : C.body }}>
                      <Icon d={ch.muted ? BELL_OFF : BELL} size={16} stroke={1.8} />
                    </button>
                    <button type="button" onClick={() => void removeChannel(ch)} aria-label={`Stop watching ${ch.title}`} title="Remove"
                      className="flex-shrink-0 hidden items-center justify-center group-hover:flex group-focus-within:flex [@media(hover:none)]:flex"
                      style={{ width: 34, height: 44, border: 0, borderRadius: 8, background: 'transparent', color: C.body }}>
                      <Icon d={TRASH} size={16} stroke={1.8} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => { setAddAsChannel(true); setAdding(true); }}
              className="flex items-center gap-2.5 w-full mt-2.5 px-3.5 text-[13.5px] font-medium"
              style={{ height: 44, border: `1px dashed ${C.edge}`, borderRadius: 9, background: 'transparent', color: C.muted }}>
              <Icon d={PLUS} size={15} stroke={2} /> Watch a channel
            </button>

            {who && items.length > 0 && (
              <div className="mt-7 p-4.5 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.line}`, padding: 18 }}>
                <p className="m-0 mb-3.5" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>
                  {who.toUpperCase()} · ON THE SHELF
                </p>
                <div className="flex items-baseline gap-2">
                  <span style={{ fontFamily: MONO, fontSize: 34, lineHeight: 1, color: C.green }}>{standing.done}</span>
                  <span className="text-[13px]" style={{ color: C.muted }}>of {items.length} finished</span>
                </div>
                <div className="flex flex-wrap gap-[3px] mt-3.5">
                  {items.map((it, i) => {
                    const p = marks.get(it.id);
                    const state = p?.finished ? 'done' : p && (p.positionSeconds > 5 || p.watchedIndexes.length) ? 'part' : 'none';
                    return (
                      <span key={it.id} title={`${it.title} — ${state === 'done' ? 'finished' : state === 'part' ? 'part-watched' : 'not started'}`}
                        style={{ width: 9, height: 15, borderRadius: 2, background: state === 'done' ? C.green : state === 'part' ? C.amber : C.track }}
                        aria-hidden={i > 0 ? 'true' : undefined} />
                    );
                  })}
                </div>
                <p className="mt-3.5 mb-0 text-[12.5px]" style={{ color: C.dim }}>
                  {standing.started} part-watched · {standing.rest} not started
                </p>
              </div>
            )}
          </nav>

          {/* ══ the shelf ═══════════════════════════════════════════════ */}
          <div className="flex-[999_1_620px] min-w-0 max-lg:order-1">

            {resume && (
              <section className="mb-8">
                <h2 className="m-0 mb-3" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.12em', color: C.amber }}>
                  PICK UP WHERE WE STOPPED
                </h2>
                <button type="button" onClick={() => openItem(resume.item)}
                  className="flex flex-wrap items-stretch w-full text-left rounded-[14px] overflow-hidden"
                  style={{ background: C.card, border: `1px solid ${C.edge}` }}>
                  <span className="relative flex-[1_1_300px] min-w-0 flex items-center justify-center" style={{ background: C.well, minHeight: 170 }}>
                    {thumbFor(resume.item) && (
                      <img src={thumbFor(resume.item)!} alt=""
                        className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 'var(--m-thumb-dim)' }} />
                    )}
                    <span className="relative flex items-center justify-center" style={{ width: 62, height: 62, borderRadius: '50%', background: C.amber, color: C.onAmber }}>
                      <Icon d={PLAY} size={24} fill />
                    </span>
                    <span className="absolute left-5 bottom-3.5 px-2 py-1 rounded"
                      style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.06em', color: '#E7EAED', background: 'rgba(10,11,12,0.82)' }}>
                      PAUSED {timecode(resume.p.positionSeconds)}
                    </span>
                  </span>
                  <span className="flex-[1_1_280px] min-w-0 flex flex-col justify-center gap-3" style={{ padding: '22px 24px' }}>
                    <span>
                      <span className="inline-block px-2.5 py-0.5 rounded"
                        style={{ background: C.chip, color: C.amber, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em' }}>
                        {(cats.find(c => c.id === resume.item.categoryId)?.name ?? 'NO CATEGORY').toUpperCase()}
                      </span>
                      <span className="block mt-2.5 font-semibold" style={{ fontSize: 21, lineHeight: 1.26, letterSpacing: '-0.015em' }}>{resume.item.title}</span>
                      <span className="block mt-1.5 text-[13.5px]" style={{ color: C.muted }}>
                        {resume.item.kind === 'playlist'
                          ? `Video ${resume.p.playlistIndex + 1}${resume.item.itemCount ? ` of ${resume.item.itemCount}` : ''} in this list`
                          : 'Single video'}
                      </span>
                    </span>
                    <span className="block">
                      <span className="block relative overflow-hidden" style={{ height: 5, borderRadius: 3, background: C.track }}>
                        <span className="absolute left-0 top-0 bottom-0" style={{ width: `${watchedFraction(resume.item, resume.p) * 100}%`, background: C.amber }} />
                      </span>
                      <span className="flex justify-between mt-2" style={{ fontFamily: MONO, fontSize: 12, color: C.muted }}>
                        <span>{timecode(resume.p.positionSeconds)}</span>
                        <span>{timecode(resume.p.durationSeconds)}</span>
                      </span>
                    </span>
                  </span>
                </button>
              </section>
            )}

            {/* search + filter */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="flex-[999_1_260px] min-w-0 relative flex items-center">
                <span className="absolute left-4 flex" style={{ color: C.dim }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" />
                  </svg>
                </span>
                <label htmlFor="media-search" className="sr-only">Search the shelf by title</label>
                <input id="media-search" type="search" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search by title…"
                  style={{ width: '100%', height: 46, padding: '0 16px 0 42px', borderRadius: 10, border: `1px solid ${C.edge}`, background: C.card, color: C.ink, fontSize: 14.5, outline: 'none' }} />
              </div>
              <div className="flex gap-[3px] p-1" style={{ borderRadius: 10, background: C.card, border: `1px solid ${C.line}` }}>
                <button type="button" onClick={() => setFilter('all')} style={chipStyle(filter === 'all')}>All</button>
                <button type="button" onClick={() => setFilter('unwatched')} style={chipStyle(filter === 'unwatched')}>Unwatched</button>
                <button type="button" onClick={() => setFilter('finished')} style={chipStyle(filter === 'finished')}>Finished</button>
              </div>
              <div role="group" aria-label="Video length" className="flex items-center gap-[3px] p-1 max-w-full overflow-x-auto" style={{ borderRadius: 10, background: C.card, border: `1px solid ${C.line}` }}>
                <span className="flex-shrink-0 flex items-center pl-2 pr-1" style={{ color: C.dim }} aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                  </svg>
                </span>
                <button type="button" onClick={() => setBand(null)} aria-pressed={band == null} style={{ ...chipStyle(band == null), padding: '0 12px', flexShrink: 0 }}>Any</button>
                {LENGTH_BANDS.map(({ from, to }, i) => (
                  <button key={from} type="button" onClick={() => setBand(i)} aria-pressed={band === i}
                    aria-label={from === 0 ? `Under ${to} minutes` : to === Infinity ? `${from} minutes or more` : `${from} to ${to} minutes`}
                    style={{ ...chipStyle(band === i), padding: '0 11px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {from === 0 ? <>&lt;{to}</> : to === Infinity ? <>{from}+</> : <>{from}–{to}</>}
                    <span style={{ fontSize: 11, opacity: 0.75 }}>m</span>
                  </button>
                ))}
              </div>
              <div className="flex p-1" style={{ borderRadius: 10, background: C.card, border: `1px solid ${C.line}` }}>
                <button type="button" onClick={() => setEnglishOnly(v => !v)} aria-pressed={englishOnly}
                  title="Only reels with English sound"
                  className="flex items-center gap-2"
                  style={{ ...chipStyle(englishOnly), padding: '0 13px', whiteSpace: 'nowrap' }}>
                  <Icon d={`${SPEAKER}${SOUND_ON}`} size={16} stroke={1.9} />
                  English
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <h2 className="m-0 flex-grow min-w-0" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.12em', color: C.dim }}>
                {(channel === 'all' ? 'EVERYTHING' : (cats.find(c => c.id === channel)?.name ?? '').toUpperCase())} · {shown.length} REEL{shown.length === 1 ? '' : 'S'}
              </h2>
              <div role="group" aria-label="View" className="flex-shrink-0 flex gap-[3px] p-1" style={{ borderRadius: 10, background: C.card, border: `1px solid ${C.line}` }}>
                {VIEWS.map(v => (
                  <button key={v.id} type="button" onClick={() => pickView(v.id)} aria-pressed={view === v.id} aria-label={v.label} title={v.label}
                    className="flex items-center justify-center gap-1.5"
                    style={{ ...chipStyle(view === v.id), padding: '0 11px', minWidth: 44 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={v.d} /></svg>
                    <span className="hidden sm:inline">{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="py-16 text-center text-sm" style={{ color: C.dim }}>Opening the shelf…</p>
            ) : shown.length === 0 ? (
              <div className="py-16 px-6 text-center rounded-xl" style={{ background: C.panel, border: `1px dashed ${C.edge}` }}>
                <p className="m-0 text-[15px] font-semibold">{items.length === 0 ? 'The shelf is empty' : 'Nothing matches'}</p>
                <p className="mt-2 mb-0 text-[13.5px]" style={{ color: C.muted }}>
                  {items.length === 0
                    ? 'Paste a YouTube link and it will be here for every student.'
                    : 'Try another word, or a different category.'}
                </p>
              </div>
            ) : (
              <div className={view === 'icons'
                ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-x-3 gap-y-4'
                : view === 'gallery'
                  ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5'
                  : 'flex flex-col gap-2.5'}>
                {shown.map(it => {
                  const p = marks.get(it.id);
                  const done = !!p?.finished;
                  const frac = watchedFraction(it, p);
                  const started = !!p && (p.positionSeconds > 5 || p.watchedIndexes.length > 0);
                  const fresh = newVideoIds(it).length;
                  const edge = done ? C.green : started ? C.amber : C.track;
                  const total = it.itemCount ?? 0;

                  const stamp = it.kind === 'playlist'
                    ? done ? `All ${total || ''} watched`.trim()
                      : started ? `Stopped in video ${(p?.playlistIndex ?? 0) + 1}${total ? ` of ${total}` : ''}`
                        : 'Not started'
                    : done ? 'Watched to the end'
                      : started ? `Stopped at ${timecode(p?.positionSeconds)}${p?.durationSeconds ? ` of ${timecode(p.durationSeconds)}` : ''}`
                        : 'Not started';

                  const thumb = thumbFor(it);
                  const len = lengthOf(it);
                  const lenLabel = it.kind === 'playlist' ? (total ? `${total} videos` : null) : (len != null ? timecode(len) : null);
                  const barPct = `${(done ? 1 : frac) * 100}%`;
                  const english = hasEnglishSound(it);
                  const actions = (
                    <div className="flex-shrink-0 flex items-center gap-1">
                      <button type="button" onClick={() => void toggleEnglish(it)} aria-pressed={english}
                        aria-label={`English sound for ${it.title}`} title={english ? 'English sound' : 'No English sound'}
                        className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: english ? C.amber : C.dim, border: 0 }}>
                        <Icon d={`${SPEAKER}${english ? SOUND_ON : SOUND_OFF}`} size={17} stroke={1.8} />
                      </button>
                      <button type="button" onClick={() => void rename(it)} aria-label={`Rename ${it.title}`}
                        className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: C.dim, border: 0 }}>
                        <Icon d={PENCIL} size={17} stroke={1.8} />
                      </button>
                      <button type="button" onClick={e => openCatMenu(it, e)} aria-label={`Category for ${it.title}`} title="Category"
                        aria-haspopup="menu" aria-expanded={catMenu?.item.id === it.id}
                        className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: catMenu?.item.id === it.id ? C.raised : 'transparent', color: C.dim, border: 0 }}>
                        <Icon d={FOLDER} size={17} stroke={1.8} />
                      </button>
                      <button type="button" onClick={() => void remove(it)} aria-label={`Take ${it.title} off the shelf`}
                        className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: C.dim, border: 0 }}>
                        <Icon d={TRASH} size={17} stroke={1.8} />
                      </button>
                    </div>
                  );

                  /* ICONS: a small picture and the title, many to a row. */
                  if (view === 'icons') return (
                    <button key={it.id} type="button" onClick={() => openItem(it)} disabled={!studentId}
                      aria-label={`Play ${it.title}`} title={it.title}
                      className="flex flex-col gap-1.5 min-w-0 text-left disabled:opacity-60"
                      style={{ background: 'transparent', border: 0, padding: 0, color: C.ink }}>
                      <span className="relative block w-full overflow-hidden"
                        style={{ aspectRatio: '16 / 9', borderRadius: 9, background: C.well, border: `1px solid ${done ? C.greenLine : C.line}` }}>
                        {thumb && <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 'var(--m-thumb-dim)' }} />}
                        {lenLabel && (
                          <span className="absolute right-1 bottom-1.5 px-1 rounded" style={{ background: 'rgba(0,0,0,0.78)', color: '#fff', fontFamily: MONO, fontSize: 10.5, lineHeight: '16px' }}>{lenLabel}</span>
                        )}
                        {done && (
                          <span className="absolute left-1 top-1 flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: 'var(--m-good-fill)', color: 'var(--m-good-on)' }}>
                            <Icon d={CHECK} size={12} stroke={3} />
                          </span>
                        )}
                        {fresh > 0 && (
                          <span className="absolute left-1 top-1 px-1.5 rounded" style={{ background: C.amber, color: C.onAmber, fontFamily: MONO, fontSize: 10, lineHeight: '17px' }}>NEW {fresh}</span>
                        )}
                        {studentId && (
                          <span className="absolute left-0 right-0 bottom-0" style={{ height: 3, background: 'rgba(0,0,0,0.35)' }}>
                            <span className="block h-full" style={{ width: barPct, background: done ? 'var(--m-good-fill)' : '#E8A33D' }} />
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 font-semibold" style={{ fontSize: 13, lineHeight: 1.3 }}>{it.title}</span>
                    </button>
                  );

                  /* GALLERY: a big picture with the details under it. */
                  if (view === 'gallery') return (
                    <div key={it.id} className="flex flex-col overflow-hidden"
                      style={{ borderRadius: 14, background: C.card, border: `1px solid ${done ? C.greenLine : C.line}` }}>
                      <button type="button" onClick={() => openItem(it)} disabled={!studentId}
                        aria-label={`Play ${it.title}`}
                        className="relative block w-full disabled:opacity-60"
                        style={{ aspectRatio: '16 / 9', background: C.well, border: 0, padding: 0 }}>
                        {thumb && <img src={thumb} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 'var(--m-thumb-dim)' }} />}
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex items-center justify-center rounded-full" style={{ width: 54, height: 54, background: 'rgba(0,0,0,0.55)', color: '#fff' }}>
                            <Icon d={PLAY} size={22} fill />
                          </span>
                        </span>
                        {lenLabel && (
                          <span className="absolute right-2.5 bottom-3 px-1.5 rounded-[5px]" style={{ background: 'rgba(0,0,0,0.78)', color: '#fff', fontFamily: MONO, fontSize: 12, lineHeight: '20px' }}>{lenLabel}</span>
                        )}
                        {(done || fresh > 0) && (
                          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 px-2 rounded-md"
                            style={{ background: done ? 'var(--m-good-fill)' : C.amber, color: done ? 'var(--m-good-on)' : C.onAmber, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', lineHeight: '22px' }}>
                            {done ? <><Icon d={CHECK} size={11} stroke={3} /> SEEN</> : `NEW ${fresh}`}
                          </span>
                        )}
                        {studentId && (
                          <span className="absolute left-0 right-0 bottom-0" style={{ height: 4, background: 'rgba(0,0,0,0.35)' }}>
                            <span className="block h-full" style={{ width: barPct, background: done ? 'var(--m-good-fill)' : '#E8A33D' }} />
                          </span>
                        )}
                      </button>
                      <div className="flex flex-col gap-1.5 flex-grow" style={{ padding: '14px 12px 8px 16px' }}>
                        <h3 className="m-0 line-clamp-2 font-semibold" style={{ fontSize: 16, lineHeight: 1.32 }}>{it.title}</h3>
                        <p className="m-0 flex items-center gap-2 flex-wrap" style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>
                          <span>{it.kind === 'playlist' ? 'PLAYLIST' : 'VIDEO'}</span>
                          <span>·</span>
                          {catChip(it)}
                        </p>
                        <div className="flex items-center gap-1 mt-auto pt-1">
                          <p className="m-0 flex-grow min-w-0" style={{ fontFamily: MONO, fontSize: 11.5, color: done ? C.green : started ? C.amber : C.dim }}>{studentId ? stamp : ''}</p>
                          {actions}
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <div key={it.id} className="relative flex flex-wrap items-center gap-4"
                      style={{ padding: '14px 14px 14px 20px', borderRadius: 12, background: C.card, border: `1px solid ${done ? C.greenLine : C.line}` }}>
                      <span className="absolute left-0" style={{ top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0', background: edge }} />

                      <button type="button" onClick={() => openItem(it)} disabled={!studentId}
                        aria-label={`Play ${it.title}`}
                        className="relative flex-shrink-0 flex items-center justify-center disabled:opacity-60"
                        style={{ width: 130, height: 74, borderRadius: 9, background: C.well, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                        {thumbFor(it) && (
                          <img src={thumbFor(it)!} alt=""
                            className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 'var(--m-thumb-dim)' }} />
                        )}
                        <span className="relative" style={{ color: C.ink }}><Icon d={PLAY} size={19} fill /></span>
                      </button>

                      <div className="flex-[999_1_230px] min-w-0 flex flex-col gap-2.5">
                        <div className="flex items-start gap-2.5">
                          <div className="min-w-0 flex-grow">
                            <h3 className="m-0 font-semibold" style={{ fontSize: 16, lineHeight: 1.34 }}>{it.title}</h3>
                            <p className="m-0 mt-1 flex items-center gap-2 flex-wrap" style={{ fontFamily: MONO, fontSize: 11.5, color: C.dim }}>
                              <span>{it.kind === 'playlist' ? 'PLAYLIST' : 'VIDEO'}</span>
                              <span>·</span>
                              <span>{it.kind === 'playlist' ? (total ? `${total} videos` : 'length unknown yet') : (lengthOf(it) != null ? timecode(lengthOf(it)) : 'single')}</span>
                              <span>·</span>
                              {catChip(it)}
                            </p>
                          </div>
                          {fresh > 0 && (
                            <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded"
                              title={`${fresh} video${fresh === 1 ? '' : 's'} added to this playlist on YouTube since you last opened it`}
                              style={{ border: `1px solid ${C.amber}`, background: C.chip, color: C.amber, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em' }}>
                              NEW {fresh}
                            </span>
                          )}
                          {done && (
                            <span className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded"
                              style={{ border: `1px solid ${C.greenLine}`, background: C.greenBg, color: C.green, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em' }}>
                              <Icon d={CHECK} size={12} stroke={2.6} /> SEEN
                            </span>
                          )}
                        </div>

                        {studentId && (
                          <div>
                            {it.kind === 'playlist' && total > 0
                              ? <Ticks total={total} done={p?.watchedIndexes ?? []} current={started ? p?.playlistIndex : undefined} all={done} />
                              : (
                                <div className="relative overflow-hidden" style={{ height: 4, borderRadius: 2, background: C.track }}>
                                  <span className="absolute left-0 top-0 bottom-0" style={{ width: `${frac * 100}%`, background: done ? C.green : C.amber }} />
                                </div>
                              )}
                            <p className="m-0 mt-1.5" style={{ fontFamily: MONO, fontSize: 11.5, color: done ? C.green : started ? C.amber : C.dim }}>{stamp}</p>
                          </div>
                        )}
                      </div>

                      {actions}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {adding && (
        <AddLink
          categories={cats}
          shelf={items}
          defaultCategory={channel === 'all' ? null : channel}
          onCancel={() => setAdding(false)}
          onAdd={doAdd}
          onNewCategory={doNewCategory}
          channels={channels}
          onWatch={watchChannel}
          forChannel={addAsChannel}
        />
      )}

      {(() => {
        const ch = newsFor ? channels.find(c => c.id === newsFor) : null;
        const offered = ch ? pendingOf(ch) : [];
        if (!ch || !offered.length) return null;
        return (
          <NewVideosDialog
            key={ch.id}
            channel={ch}
            videos={offered}
            step={{ n: newsTotal - newsQueue.current.length, of: newsTotal }}
            categories={cats}
            counts={counts}
            hueOf={hueOf}
            onAdd={picked => addFromChannel(ch, offered, picked)}
            onNewCategory={doNewCategory}
            onSkip={() => skipChannel(ch, offered)}
            onMute={async () => { if (!(await setMuted(ch, true))) return 'Could not mute the channel.'; nextNews(); return null; }}
            onLater={closeNews}
          />
        );
      })()}

      {catMenu && (
        <CategoryMenu
          target={(() => { const it = items.find(x => x.id === catMenu.item.id) ?? catMenu.item; return { title: it.title, categoryId: it.categoryId, thumb: thumbFor(it) }; })()}
          anchor={catMenu.rect}
          categories={cats}
          counts={counts}
          hueOf={hueOf}
          onPick={id => void pickCategory(items.find(x => x.id === catMenu.item.id) ?? catMenu.item, id)}
          onNew={doNewCategory}
          onClose={() => setCatMenu(null)}
        />
      )}
    </div>
  );
};

export default MediaPage;
