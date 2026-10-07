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
  loadProgress, saveProgress, clearProgress,
  parseYouTubeLink, videoThumb, thumbFor, fetchPlaylistThumb, timecode, watchedFraction,
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

/** One tick per video in a playlist — the same small-segment language the
 *  Qaedah words and the Tadabbur verses already speak. */
const Ticks: React.FC<{ total: number; done: number[]; current?: number; all?: boolean }> =
  ({ total, done, current, all }) => (
    <div className="flex flex-wrap gap-[3px]">
      {Array.from({ length: Math.max(total, 1) }, (_, i) => {
        const seen = all || done.includes(i);
        return (
          <span key={i} title={`Video ${i + 1}${seen ? ' — watched' : ''}`}
            style={{
              width: 20, height: 7, borderRadius: 2,
              background: seen ? C.green : i === current ? C.amber : C.track,
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
  onProgress: (p: MediaProgress) => void;
  onItemCount: (n: number) => void;
  onClose: () => void;
}

const Booth: React.FC<BoothProps> = ({
  item, studentId, studentName, progress, onProgress, onItemCount, onClose,
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
  const pct = duration && duration > 0 ? Math.min(100, (now / duration) * 100) : 0;
  const resumePct = duration && duration > 0 ? Math.min(100, (resumeAt / duration) * 100) : 0;

  const markFinished = () => {
    const all = item.kind === 'playlist' && total > 0
      ? Array.from({ length: total }, (_, i) => i) : watched;
    setFinished(true); setWatched(all);
    persistRef.current({ finished: true, watchedIndexes: all });
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
                <button type="button" onClick={markFinished} disabled={finished}
                  className="flex items-center gap-2 h-11 px-5 rounded-[9px] text-sm font-bold disabled:opacity-60"
                  style={{ background: finished ? C.greenBg : 'var(--m-good-fill)', border: finished ? `1px solid ${C.greenLine}` : 0, color: finished ? C.green : 'var(--m-good-on)' }}>
                  <Icon d={CHECK} size={16} stroke={2.6} /> {finished ? 'Finished' : 'Mark finished'}
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
                      of {total || '?'} finished with {studentName}
                    </span>
                  </div>
                  <div className="mt-3"><Ticks total={total} done={watched} current={index} /></div>
                </div>

                <div style={{ maxHeight: 440, overflowY: 'auto' }}>
                  {Array.from({ length: total }, (_, i) => {
                    const on = i === index;
                    const seen = watched.includes(i);
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
                          <span className="block text-sm font-medium" style={{ color: on ? C.ink : seen ? C.muted : C.body }}>
                            Video {i + 1}
                          </span>
                          <span className="block mt-1" style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>
                            {on ? `PLAYING · ${timecode(now)}` : seen ? 'WATCHED' : '—'}
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

/* ── Paste a link ────────────────────────────────────────────────────── */

const AddLink: React.FC<{
  categories: MediaCategory[];
  defaultCategory: string | null;
  onCancel: () => void;
  onAdd: (title: string, link: ParsedLink, categoryId: string | null) => Promise<string | null>;
  onNewCategory: (name: string) => Promise<MediaCategory | null>;
}> = ({ categories, defaultCategory, onCancel, onAdd, onNewCategory }) => {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<string | null>(defaultCategory);
  const [newCat, setNewCat] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const link = useMemo(() => parseYouTubeLink(url), [url]);
  const looksLikeTry = url.trim().length > 6;

  const submit = async () => {
    if (!link || !title.trim()) return;
    setBusy(true); setError('');
    const problem = await onAdd(title, link, cat);
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
            <p className="mt-1 mb-0 text-[13.5px]" style={{ color: C.muted }}>It goes on the shelf for every student, not just this one.</p>
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
            placeholder="https://www.youtube.com/watch?v=…"
            style={{ ...field, fontFamily: MONO, fontSize: 13, borderColor: link ? C.greenLine : C.edge }} />

          {link && (
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
          {!link && looksLikeTry && (
            <p className="mt-3 mb-0 text-[13px]" style={{ color: 'var(--m-bad-ink)' }}>That is not a YouTube video or playlist link.</p>
          )}

          <div className="mt-6">
            <label htmlFor="media-title" className="block mb-2" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>TITLE ON THE SHELF</label>
            <input id="media-title" type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What you will call it" style={{ ...field, fontSize: 15, fontWeight: 500 }} />
            <p className="mt-2 mx-0.5 mb-0 text-[12.5px]" style={{ color: C.dim }}>
              Your words, not YouTube&rsquo;s — this is what the search box looks through.
            </p>
          </div>

          <div className="mt-6">
            <p className="m-0 mb-2.5" style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: C.dim }}>CATEGORY</p>
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

          {error && <p role="alert" className="mt-5 mb-0 text-[13.5px]" style={{ color: 'var(--m-bad-ink)' }}>{error}</p>}
        </div>

        <div className="flex items-center gap-2.5 px-5 sm:px-6 py-4" style={{ borderTop: `1px solid ${C.line}`, background: C.panel }}>
          <span className="flex-grow" />
          <button type="button" onClick={onCancel} className="h-11 px-4 rounded-[9px] text-sm font-semibold"
            style={{ background: 'transparent', border: `1px solid ${C.edge}`, color: C.body }}>Cancel</button>
          <button type="button" onClick={() => void submit()} disabled={!link || !title.trim() || busy}
            className="h-11 px-5 rounded-[9px] text-sm font-bold disabled:opacity-50"
            style={{ background: C.amber, color: C.onAmber, border: 0 }}>
            {busy ? 'Adding…' : 'Put it on the shelf'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ── The shelf ───────────────────────────────────────────────────────── */

interface MediaPageProps {
  teacherId: string;
  studentId?: string;
  studentName?: string;
}

const MediaPage: React.FC<MediaPageProps> = ({ teacherId, studentId, studentName }) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cats, setCats] = useState<MediaCategory[]>([]);
  const [marks, setMarks] = useState<Map<string, MediaProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unwatched' | 'finished'>('all');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<MediaItem | null>(null);
  const [newCat, setNewCat] = useState('');
  const [catForm, setCatForm] = useState(false);

  const who = studentName ?? '';

  useEffect(() => {
    let dead = false;
    void Promise.all([listMedia(), listCategories()]).then(([i, c]) => {
      if (dead) return;
      setItems(i); setCats(c); setLoading(false);
    });
    return () => { dead = true; };
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
      if (filter === 'all') return true;
      const done = marks.get(it.id)?.finished ?? false;
      return filter === 'finished' ? done : !done;
    });
  }, [items, channel, query, filter, marks]);

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

  const doAdd = async (title: string, link: ParsedLink, categoryId: string | null): Promise<string | null> => {
    const res = await addMedia({ teacherId, title, link, categoryId });
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

  const move = async (it: MediaItem) => {
    const names = ['None', ...cats.map(c => c.name)];
    const pick = window.prompt(`Move "${it.title}" to which category?\n\n${names.map((n, i) => `${i}. ${n}`).join('\n')}`, '0');
    if (pick == null) return;
    const n = Number(pick);
    if (!Number.isInteger(n) || n < 0 || n >= names.length) return;
    const categoryId = n === 0 ? null : cats[n - 1].id;
    if (await updateMedia(it.id, { categoryId })) {
      setItems(prev => prev.map(x => (x.id === it.id ? { ...x, categoryId } : x)));
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
        onProgress={noteProgress}
        onItemCount={n => noteCount(current.id, n)}
        onClose={() => setOpen(null)}
      />
    );
  }

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

          <button type="button" onClick={() => setAdding(true)}
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
                <button type="button" onClick={() => setOpen(resume.item)}
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
            </div>

            <h2 className="m-0 mb-3" style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 500, letterSpacing: '0.12em', color: C.dim }}>
              {(channel === 'all' ? 'EVERYTHING' : (cats.find(c => c.id === channel)?.name ?? '').toUpperCase())} · {shown.length} REEL{shown.length === 1 ? '' : 'S'}
            </h2>

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
              <div className="flex flex-col gap-2.5">
                {shown.map(it => {
                  const p = marks.get(it.id);
                  const done = !!p?.finished;
                  const frac = watchedFraction(it, p);
                  const started = !!p && (p.positionSeconds > 5 || p.watchedIndexes.length > 0);
                  const edge = done ? C.green : started ? C.amber : C.track;
                  const total = it.itemCount ?? 0;

                  const stamp = it.kind === 'playlist'
                    ? done ? `All ${total || ''} watched`.trim()
                      : started ? `Stopped in video ${(p?.playlistIndex ?? 0) + 1}${total ? ` of ${total}` : ''}`
                        : 'Not started'
                    : done ? 'Watched to the end'
                      : started ? `Stopped at ${timecode(p?.positionSeconds)}${p?.durationSeconds ? ` of ${timecode(p.durationSeconds)}` : ''}`
                        : 'Not started';

                  return (
                    <div key={it.id} className="relative flex flex-wrap items-center gap-4"
                      style={{ padding: '14px 14px 14px 20px', borderRadius: 12, background: C.card, border: `1px solid ${done ? C.greenLine : C.line}` }}>
                      <span className="absolute left-0" style={{ top: 14, bottom: 14, width: 3, borderRadius: '0 3px 3px 0', background: edge }} />

                      <button type="button" onClick={() => setOpen(it)} disabled={!studentId}
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
                              <span>{it.kind === 'playlist' ? (total ? `${total} videos` : 'length unknown yet') : 'single'}</span>
                              {it.categoryId && (<>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1.5">
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: hueOf(it.categoryId) }} />
                                  {cats.find(c => c.id === it.categoryId)?.name}
                                </span>
                              </>)}
                            </p>
                          </div>
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

                      <div className="flex-shrink-0 flex items-center gap-1">
                        <button type="button" onClick={() => void rename(it)} aria-label={`Rename ${it.title}`}
                          className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: C.dim, border: 0 }}>
                          <Icon d={PENCIL} size={17} stroke={1.8} />
                        </button>
                        <button type="button" onClick={() => void move(it)} aria-label={`Move ${it.title} to another category`}
                          className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: C.dim, border: 0 }}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M3 7.5h7l2 2.5h9v9.5H3z" /><path d="M3 7.5V5h5.5" />
                          </svg>
                        </button>
                        <button type="button" onClick={() => void remove(it)} aria-label={`Take ${it.title} off the shelf`}
                          className="flex items-center justify-center w-11 h-11 rounded-[9px]" style={{ background: 'transparent', color: C.dim, border: 0 }}>
                          <Icon d={TRASH} size={17} stroke={1.8} />
                        </button>
                      </div>
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
          defaultCategory={channel === 'all' ? null : channel}
          onCancel={() => setAdding(false)}
          onAdd={doAdd}
          onNewCategory={doNewCategory}
        />
      )}
    </div>
  );
};

export default MediaPage;
