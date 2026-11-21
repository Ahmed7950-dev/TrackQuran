// services/mediaService.ts
// ---------------------------------------------------------------------------
// The Media shelf: YouTube videos and playlists a tutor watches with students.
//
// Two halves that belong to different owners, which is the whole shape of this
// feature:
//
//   the SHELF   belongs to the tutor — a link added from one student's page is
//               on the shelf from every other student's page too;
//   the MARKS   belong to a student — where that student stopped, in that reel.
//
// Nothing here is reachable from a student's share link; the tab exists only in
// the tutor app, and the tables say so (see the migration's policies).
// ---------------------------------------------------------------------------
import { supabase } from '../lib/supabase';

export type MediaKind = 'video' | 'playlist';

export interface MediaCategory {
  id: string;
  name: string;
  hue: string | null;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  categoryId: string | null;
  title: string;
  kind: MediaKind;
  youtubeId: string;
  url: string;
  /** How many videos a playlist holds — unknown until it has been opened once. */
  itemCount: number | null;
  /** A playlist's still: its first video's, fetched once from oEmbed. Null on a
   *  single video, which builds its own from the id. */
  thumbUrl: string | null;
  /** What the playlist held when YouTube was last asked. */
  latestVideoIds: string[] | null;
  /** What the tutor has already been shown. Null until the first check. */
  seenVideoIds: string[] | null;
  checkedAt: string | null;
  /** Languages it can be heard in, base codes ({ar,en}); null = not known.
   *  See supabase/migrations/20261124_media_audio_langs.sql. */
  audioLangs: string[] | null;
  createdAt: string;
}

/** True when English is one of the reel's sound tracks. */
export const hasEnglishSound = (it: MediaItem): boolean => !!it.audioLangs?.includes('en');

export interface MediaProgress {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number | null;
  playlistIndex: number;
  watchedIndexes: number[];
  finished: boolean;
  updatedAt: string;
}

/* ── Reading a YouTube link ──────────────────────────────────────────── */

export interface ParsedLink { kind: MediaKind; youtubeId: string; url: string }

/**
 * What a pasted link actually points at.
 *
 * A playlist wins over a video: a "watch?v=…&list=…" link is what you get from
 * the share button halfway through a playlist, and the tutor who pasted it
 * meant the list. Returns null when it is not a YouTube link at all, so the
 * form can say so instead of saving something that will never play.
 */
export function parseYouTubeLink(raw: string): ParsedLink | null {
  const text = raw.trim();
  if (!text) return null;

  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  const isYouTube = host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com';
  if (!isYouTube) return null;

  const list = u.searchParams.get('list');
  if (list && !/^(WL|LL)$/.test(list)) {
    return { kind: 'playlist', youtubeId: list, url: `https://www.youtube.com/playlist?list=${list}` };
  }

  // youtu.be/<id>, /watch?v=<id>, /embed/<id>, /shorts/<id>, /live/<id>
  const path = u.pathname.replace(/^\/+/, '');
  const fromPath = /^(embed|shorts|live|v)\/([\w-]{6,})/.exec(path);
  const id = host === 'youtu.be' ? path.split('/')[0]
    : u.searchParams.get('v') ?? (fromPath ? fromPath[2] : '');
  if (!id || !/^[\w-]{6,}$/.test(id)) return null;

  return { kind: 'video', youtubeId: id, url: `https://www.youtube.com/watch?v=${id}` };
}

/** The still YouTube serves for a video. */
export const videoThumb = (youtubeId: string): string =>
  `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;

/**
 * A playlist's still — its first video's.
 *
 * There is no `i.ytimg.com` path for a playlist, and listing one needs an API
 * key this app does not have. oEmbed answers for a playlist URL though, with
 * CORS open and no key, so one fetch gets the thumbnail. Returns null rather
 * than throwing: a missing picture must never stop the shelf drawing.
 */
export async function fetchPlaylistThumb(playlistId: string): Promise<string | null> {
  try {
    const target = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`);
    if (!res.ok) return null;
    const data = await res.json() as { thumbnail_url?: string };
    return typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null;
  } catch {
    return null;
  }
}

/* ── How long a video is ──────────────────────────────────────────────── */

const LENGTHS_KEY = 'mediaVideoLengths';

function readLengthCache(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(LENGTHS_KEY) || '{}') || {}; } catch { return {}; }
}

/**
 * How long one video is, read by a hidden 1-pixel YouTube player: it knows
 * the length as soon as it is ready. Done in the tutor's browser because
 * YouTube answers a server with "confirm you're not a bot" instead (tried:
 * the watch page and the player endpoint both refuse from Vercel).
 */
function lengthFromPlayer(id: string): Promise<number | null> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const YT = (window as any).YT;
  return new Promise(resolve => {
    const host = document.createElement('div');
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none';
    box.appendChild(host);
    document.body.appendChild(box);
    let player: any = null;
    let done = false;
    const finish = (sec: number | null) => {
      if (done) return;
      done = true;
      try { player?.destroy?.(); } catch { /* already gone */ }
      box.remove();
      resolve(sec && sec > 0 ? Math.round(sec) : null);
    };
    const timer = window.setTimeout(() => finish(null), 10000);
    try {
      player = new YT.Player(host, {
        width: 1, height: 1, videoId: id,
        playerVars: { autoplay: 0, controls: 0, mute: 1 },
        events: {
          onReady: () => {
            let tries = 0;
            const look = () => {
              const d = Number(player?.getDuration?.() ?? 0);
              if (d > 0 || tries++ > 20) { window.clearTimeout(timer); finish(d); }
              else window.setTimeout(look, 150);
            };
            look();
          },
          onError: () => { window.clearTimeout(timer); finish(null); },
        },
      });
    } catch { window.clearTimeout(timer); finish(null); }
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Seconds per video id. A length never changes, so each one is read once and
 * kept on this device. `loadApi` loads the YouTube IFrame API. Ids YouTube
 * would not answer for are simply missing.
 */
export async function fetchVideoLengths(ids: string[], loadApi: () => Promise<void>): Promise<Map<string, number>> {
  const cache = readLengthCache();
  const out = new Map<string, number>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    if (typeof cache[id] === 'number') out.set(id, cache[id]);
    else missing.push(id);
  }
  if (!missing.length) return out;
  try { await loadApi(); } catch { return out; }
  // Three at a time: each is a real (hidden) player.
  const queue = [...missing];
  await Promise.all([0, 1, 2].map(async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const sec = await lengthFromPlayer(id);
      if (sec) { out.set(id, sec); cache[id] = sec; }
    }
  }));
  try { localStorage.setItem(LENGTHS_KEY, JSON.stringify(cache)); } catch { /* storage off */ }
  return out;
}

/** The still to draw for a reel, or null when there is nothing to draw yet. */
export const thumbFor = (item: MediaItem): string | null =>
  item.kind === 'video' ? videoThumb(item.youtubeId) : item.thumbUrl;

/** Seconds → "7:04" / "1:12:30". */
export function timecode(total: number | null | undefined): string {
  if (total == null || !Number.isFinite(total) || total < 0) return '--:--';
  const s = Math.floor(total % 60);
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 && m < 10 ? `0${m}` : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${s < 10 ? '0' : ''}${s}`;
}

/* ── Categories ──────────────────────────────────────────────────────── */

type CatRow = { id: string; name: string; hue: string | null; created_at: string };
const toCat = (r: CatRow): MediaCategory => ({
  id: r.id, name: r.name, hue: r.hue, createdAt: r.created_at,
});

export async function listCategories(): Promise<MediaCategory[]> {
  const { data, error } = await supabase.from('media_categories')
    .select('id, name, hue, created_at').order('name');
  if (error) { console.error('listCategories:', error.message); return []; }
  return (data as CatRow[]).map(toCat);
}

export async function createCategory(teacherId: string, name: string, hue?: string): Promise<MediaCategory | null> {
  const { data, error } = await supabase.from('media_categories')
    .insert({ teacher_id: teacherId, name: name.trim(), hue: hue ?? null })
    .select('id, name, hue, created_at').single();
  if (error) { console.error('createCategory:', error.message); return null; }
  return toCat(data as CatRow);
}

export async function renameCategory(id: string, name: string): Promise<boolean> {
  const { error } = await supabase.from('media_categories').update({ name: name.trim() }).eq('id', id);
  if (error) { console.error('renameCategory:', error.message); return false; }
  return true;
}

/** Reels in the category are kept; they fall back to "no category". */
export async function deleteCategory(id: string): Promise<boolean> {
  const { error } = await supabase.from('media_categories').delete().eq('id', id);
  if (error) { console.error('deleteCategory:', error.message); return false; }
  return true;
}

/* ── The shelf ───────────────────────────────────────────────────────── */

type ItemRow = {
  id: string; category_id: string | null; title: string; kind: MediaKind;
  youtube_id: string; url: string; item_count: number | null;
  thumb_url: string | null; created_at: string;
  latest_video_ids: string[] | null; seen_video_ids: string[] | null; checked_at: string | null;
  audio_langs?: string[] | null;
};
const toItem = (r: ItemRow): MediaItem => ({
  id: r.id, categoryId: r.category_id, title: r.title, kind: r.kind,
  youtubeId: r.youtube_id, url: r.url, itemCount: r.item_count,
  thumbUrl: r.thumb_url ?? null,
  latestVideoIds: r.latest_video_ids ?? null, seenVideoIds: r.seen_video_ids ?? null,
  checkedAt: r.checked_at ?? null,
  audioLangs: r.audio_langs ?? null,
  createdAt: r.created_at,
});

const ITEM_COLS = 'id, category_id, title, kind, youtube_id, url, item_count, thumb_url, created_at, latest_video_ids, seen_video_ids, checked_at';
/** The same plus audio_langs. Kept as its own whole literal (see the note on
 *  row-type inference) and only used once the column is known to exist, so the
 *  shelf still opens before migration 20261124 has been run. */
const ITEM_COLS_SOUND = 'id, category_id, title, kind, youtube_id, url, item_count, thumb_url, created_at, latest_video_ids, seen_video_ids, checked_at, audio_langs';
let soundColumn = true;
const missingSoundColumn = (msg: string | undefined) => !!msg && msg.includes('audio_langs');

export async function listMedia(): Promise<MediaItem[]> {
  if (soundColumn) {
    const { data, error } = await supabase.from('media_items')
      .select(ITEM_COLS_SOUND).order('created_at', { ascending: false });
    if (!error) return (data as ItemRow[]).map(toItem);
    if (!missingSoundColumn(error.message)) { console.error('listMedia:', error.message); return []; }
    soundColumn = false;
  }
  const { data, error } = await supabase.from('media_items')
    .select(ITEM_COLS).order('created_at', { ascending: false });
  if (error) { console.error('listMedia:', error.message); return []; }
  return (data as ItemRow[]).map(toItem);
}

/** Returns a string instead of throwing: "already on the shelf" is the one
 *  failure the tutor can do something about, so it is worth saying plainly. */
export async function addMedia(input: {
  teacherId: string; title: string; link: ParsedLink; categoryId: string | null;
  /** The tutor's pick on the add form; null = left unset. */
  audioLangs?: string[] | null;
}): Promise<{ item: MediaItem } | { error: string }> {
  const thumbUrl = input.link.kind === 'playlist'
    ? await fetchPlaylistThumb(input.link.youtubeId) : null;
  const row: Record<string, unknown> = {
    teacher_id: input.teacherId,
    category_id: input.categoryId,
    title: input.title.trim(),
    kind: input.link.kind,
    youtube_id: input.link.youtubeId,
    url: input.link.url,
    thumb_url: thumbUrl,
  };
  if (soundColumn && input.audioLangs?.length) row.audio_langs = input.audioLangs;
  const { data, error } = soundColumn
    ? await supabase.from('media_items').insert(row).select(ITEM_COLS_SOUND).single()
    : await supabase.from('media_items').insert(row).select(ITEM_COLS).single();

  if (error) {
    if (error.code === '23505') return { error: 'That link is already on the shelf.' };
    console.error('addMedia:', error.message);
    return { error: 'Could not add that link.' };
  }
  return { item: toItem(data as ItemRow) };
}

export async function updateMedia(
  id: string,
  patch: { title?: string; categoryId?: string | null; itemCount?: number; thumbUrl?: string | null; audioLangs?: string[] | null },
): Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.audioLangs !== undefined) row.audio_langs = patch.audioLangs;
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.itemCount !== undefined) row.item_count = patch.itemCount;
  if (patch.thumbUrl !== undefined) row.thumb_url = patch.thumbUrl;
  if (!Object.keys(row).length) return true;
  const { error } = await supabase.from('media_items').update(row).eq('id', id);
  if (error) { console.error('updateMedia:', error.message); return false; }
  return true;
}

export async function deleteMedia(id: string): Promise<boolean> {
  const { error } = await supabase.from('media_items').delete().eq('id', id);
  if (error) { console.error('deleteMedia:', error.message); return false; }
  return true;
}

/* ── One student's marks ─────────────────────────────────────────────── */

type ProgRow = {
  item_id: string; position_seconds: number; duration_seconds: number | null;
  playlist_index: number; watched_indexes: number[] | null; finished: boolean; updated_at: string;
};
const toProg = (r: ProgRow): MediaProgress => ({
  itemId: r.item_id,
  positionSeconds: Number(r.position_seconds) || 0,
  durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
  playlistIndex: r.playlist_index ?? 0,
  watchedIndexes: r.watched_indexes ?? [],
  finished: !!r.finished,
  updatedAt: r.updated_at,
});

const PROG_COLS = 'item_id, position_seconds, duration_seconds, playlist_index, watched_indexes, finished, updated_at';

/** Every mark this student has, by reel id. */
export async function loadProgress(studentId: string): Promise<Map<string, MediaProgress>> {
  const out = new Map<string, MediaProgress>();
  if (!studentId) return out;
  const { data, error } = await supabase.from('media_progress').select(PROG_COLS).eq('student_id', studentId);
  if (error) { console.error('loadProgress:', error.message); return out; }
  for (const r of (data ?? []) as ProgRow[]) out.set(r.item_id, toProg(r));
  return out;
}

/**
 * Where this student is now. Called while a video plays, so it upserts on the
 * (reel, student) pair rather than reading first: two saves racing each other
 * both land, and the later one wins, which is what "where we stopped" means.
 */
export async function saveProgress(studentId: string, p: {
  itemId: string; positionSeconds: number; durationSeconds?: number | null;
  playlistIndex?: number; watchedIndexes?: number[]; finished?: boolean;
}): Promise<boolean> {
  if (!studentId) return false;
  const row: Record<string, unknown> = {
    item_id: p.itemId,
    student_id: studentId,
    position_seconds: Math.max(0, Math.round(p.positionSeconds)),
    playlist_index: p.playlistIndex ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (p.durationSeconds != null) row.duration_seconds = Math.round(p.durationSeconds);
  if (p.watchedIndexes) row.watched_indexes = p.watchedIndexes;
  if (p.finished !== undefined) row.finished = p.finished;

  const { error } = await supabase.from('media_progress').upsert(row, { onConflict: 'item_id,student_id' });
  if (error) { console.error('saveProgress:', error.message); return false; }
  return true;
}

/** Start this reel over for this student. */
export async function clearProgress(studentId: string, itemId: string): Promise<boolean> {
  const { error } = await supabase.from('media_progress')
    .delete().eq('student_id', studentId).eq('item_id', itemId);
  if (error) { console.error('clearProgress:', error.message); return false; }
  return true;
}

/**
 * How far through a reel this student is, 0–1.
 *
 * A playlist counts VIDEOS watched, not seconds — seconds would need every
 * video's length, which costs an API key. A single video counts seconds, and
 * falls back to 0 until the player has reported a duration.
 */
export function watchedFraction(item: MediaItem, p?: MediaProgress): number {
  if (!p) return 0;
  if (p.finished) return 1;
  if (item.kind === 'playlist') {
    const total = item.itemCount ?? 0;
    if (total < 1) return 0;
    return Math.min(1, p.watchedIndexes.length / total);
  }
  if (!p.durationSeconds || p.durationSeconds < 1) return 0;
  return Math.min(1, p.positionSeconds / p.durationSeconds);
}

/** Watched to within a few seconds of the end counts as watched: players stop
 *  short, and nobody wants to chase the last two seconds to turn a reel green. */
/* ── What is new on the shelf ─────────────────────────────────────────── */

/** How long an answer about a playlist is trusted before asking again. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * The videos added to this playlist since the tutor last looked.
 *
 * Empty until a playlist has been checked twice: the first check only writes
 * down what is there, so a list that has sat on the shelf for months does not
 * announce all of itself as new.
 */
export function newVideoIds(item: MediaItem): string[] {
  if (item.kind !== 'playlist' || !item.latestVideoIds || !item.seenVideoIds) return [];
  const seen = new Set(item.seenVideoIds);
  return item.latestVideoIds.filter(id => !seen.has(id));
}

export const hasNewVideos = (item: MediaItem): boolean => newVideoIds(item).length > 0;

/** Everything new across the shelf — what the tab badge counts. */
export const totalNewVideos = (items: MediaItem[]): number =>
  items.reduce((n, it) => n + newVideoIds(it).length, 0);

/**
 * Ask YouTube what the tutor's playlists hold now, and write it down.
 *
 * Only playlists that have not been asked about in CHECK_EVERY_MS, so the
 * ordinary case costs one database read and no network at all. Returns the
 * items it changed; an empty array means nothing moved.
 */
export async function refreshPlaylistNews(items: MediaItem[]): Promise<MediaItem[]> {
  const now = Date.now();
  const due = items.filter(it =>
    it.kind === 'playlist' &&
    (!it.checkedAt || now - new Date(it.checkedAt).getTime() > CHECK_EVERY_MS));
  if (!due.length) return [];

  let answer: Record<string, { videoIds?: string[]; error?: string }>;
  try {
    const res = await fetch(`/api/youtube-playlist?ids=${due.map(d => encodeURIComponent(d.youtubeId)).join(',')}`);
    if (!res.ok) return [];
    answer = await res.json();
  } catch {
    return [];                      // offline, or the route is not deployed yet
  }

  const changed: MediaItem[] = [];
  for (const it of due) {
    const got = answer?.[it.youtubeId];
    if (!got || !Array.isArray(got.videoIds) || !got.videoIds.length) continue;
    const latest = got.videoIds;
    // First sight of this playlist: write both lists, so nothing reads as new.
    const seen = it.seenVideoIds ?? latest;
    const checkedAt = new Date().toISOString();
    const { error } = await supabase.from('media_items')
      .update({ latest_video_ids: latest, seen_video_ids: seen, checked_at: checkedAt })
      .eq('id', it.id);
    if (error) { console.error('refreshPlaylistNews:', error.message); continue; }
    changed.push({ ...it, latestVideoIds: latest, seenVideoIds: seen, checkedAt });
  }
  return changed;
}

/** The tutor has looked: what is on the list now is what they have been shown. */
export async function markPlaylistSeen(item: MediaItem): Promise<boolean> {
  if (item.kind !== 'playlist' || !item.latestVideoIds) return true;
  const { error } = await supabase.from('media_items')
    .update({ seen_video_ids: item.latestVideoIds })
    .eq('id', item.id);
  if (error) { console.error('markPlaylistSeen:', error.message); return false; }
  return true;
}

/* ── Watched channels ─────────────────────────────────────────────────
 * A YouTube channel the tutor follows. Opening Media reads each one that is
 * not muted (through /api/youtube-playlist on its uploads list) and offers
 * whatever it posted since the tutor last decided. See migration
 * 20261125_media_channels.sql. */

export interface ChannelVideo { id: string; title: string; length: string | null; age: string | null }

export interface MediaChannel {
  id: string;
  channelId: string;
  handle: string | null;
  title: string;
  thumbUrl: string | null;
  uploadsId: string;
  categoryId: string | null;
  muted: boolean;
  latestVideos: ChannelVideo[];
  seenVideoIds: string[];
  checkedAt: string | null;
  createdAt: string;
}

/** What /api/youtube-channel answers for a channel link. */
export interface ChannelInfo {
  channelId: string; title: string; thumb: string | null; handle: string | null;
  uploadsId: string; videos: ChannelVideo[];
}

/** A channel link (/@handle, /channel/UC…, /c/…, /user/…) → true. Videos and
 *  playlists are parseYouTubeLink's; this only says "it is a channel". */
export function isChannelLink(raw: string): boolean {
  const text = raw.trim();
  if (/^@[\w.-]{2,100}$/.test(text)) return true;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return false; }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  if (host !== 'youtube.com') return false;
  const [first, second] = u.pathname.split('/').filter(Boolean);
  return !!first && (/^@[\w.-]{2,100}$/.test(decodeURIComponent(first))
    || (first === 'channel' && /^UC[\w-]{22}$/.test(second ?? ''))
    || ((first === 'c' || first === 'user') && !!second));
}

export async function resolveChannel(link: string): Promise<ChannelInfo | { error: string }> {
  try {
    const res = await fetch(`/api/youtube-channel?link=${encodeURIComponent(link.trim())}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.error) return { error: body?.error ?? 'Could not reach YouTube.' };
    return body as ChannelInfo;
  } catch {
    return { error: 'Could not reach YouTube. Check the connection.' };
  }
}

type ChannelRow = {
  id: string; channel_id: string; handle: string | null; title: string; thumb_url: string | null;
  uploads_id: string; category_id: string | null; muted: boolean;
  latest_videos: ChannelVideo[] | null; seen_video_ids: string[] | null;
  checked_at: string | null; created_at: string;
};
const toChannel = (r: ChannelRow): MediaChannel => ({
  id: r.id, channelId: r.channel_id, handle: r.handle, title: r.title, thumbUrl: r.thumb_url,
  uploadsId: r.uploads_id, categoryId: r.category_id, muted: r.muted,
  latestVideos: Array.isArray(r.latest_videos) ? r.latest_videos : [],
  seenVideoIds: r.seen_video_ids ?? [], checkedAt: r.checked_at, createdAt: r.created_at,
});
const CHANNEL_COLS = 'id, channel_id, handle, title, thumb_url, uploads_id, category_id, muted, latest_videos, seen_video_ids, checked_at, created_at';

/** Every watched channel, oldest first. Empty (not an error) before the
 *  migration has been run. */
export async function listChannels(): Promise<MediaChannel[]> {
  const { data, error } = await supabase.from('media_channels')
    .select(CHANNEL_COLS).order('created_at', { ascending: true });
  if (error) { console.error('listChannels:', error.message); return []; }
  return (data as ChannelRow[]).map(toChannel);
}

/** Start watching. Everything it has posted so far counts as seen: only what
 *  comes after today is offered. */
export async function addChannel(teacherId: string, info: ChannelInfo, categoryId: string | null)
  : Promise<{ channel: MediaChannel } | { error: string }> {
  const { data, error } = await supabase.from('media_channels').insert({
    teacher_id: teacherId,
    channel_id: info.channelId,
    handle: info.handle,
    title: info.title,
    thumb_url: info.thumb,
    uploads_id: info.uploadsId,
    category_id: categoryId,
    latest_videos: info.videos,
    seen_video_ids: info.videos.map(v => v.id),
    checked_at: new Date().toISOString(),
  }).select(CHANNEL_COLS).single();
  if (error) {
    if (error.code === '23505') return { error: 'You are already watching that channel.' };
    console.error('addChannel:', error.message);
    return { error: 'Could not save the channel.' };
  }
  return { channel: toChannel(data as ChannelRow) };
}

export async function updateChannel(id: string, patch: { muted?: boolean; categoryId?: string | null; seenVideoIds?: string[] })
  : Promise<boolean> {
  const row: Record<string, unknown> = {};
  if (patch.muted !== undefined) row.muted = patch.muted;
  if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
  if (patch.seenVideoIds !== undefined) row.seen_video_ids = patch.seenVideoIds;
  if (!Object.keys(row).length) return true;
  const { error } = await supabase.from('media_channels').update(row).eq('id', id);
  if (error) { console.error('updateChannel:', error.message); return false; }
  return true;
}

export async function deleteChannel(id: string): Promise<boolean> {
  const { error } = await supabase.from('media_channels').delete().eq('id', id);
  if (error) { console.error('deleteChannel:', error.message); return false; }
  return true;
}

const CHANNEL_EVERY_MS = 30 * 60 * 1000;

/** Ask YouTube what each unmuted channel holds now (at most every half hour
 *  per channel). Returns the channels that were re-read. */
export async function refreshChannelNews(channels: MediaChannel[]): Promise<MediaChannel[]> {
  const now = Date.now();
  const due = channels.filter(c => !c.muted
    && (!c.checkedAt || now - new Date(c.checkedAt).getTime() > CHANNEL_EVERY_MS));
  if (!due.length) return [];
  const changed: MediaChannel[] = [];
  for (let i = 0; i < due.length; i += 12) {
    const batch = due.slice(i, i + 12);
    let answer: Record<string, { videos?: ChannelVideo[]; videoIds?: string[]; error?: string }>;
    try {
      const res = await fetch(`/api/youtube-playlist?ids=${batch.map(c => encodeURIComponent(c.uploadsId)).join(',')}`);
      if (!res.ok) continue;
      answer = await res.json();
    } catch { continue; }
    for (const c of batch) {
      const got = answer?.[c.uploadsId];
      if (!got || got.error) continue;
      const videos: ChannelVideo[] = got.videos?.length
        ? got.videos
        : (got.videoIds ?? []).map(id => ({ id, title: '', length: null, age: null }));
      if (!videos.length) continue;
      const checkedAt = new Date().toISOString();
      const { error } = await supabase.from('media_channels')
        .update({ latest_videos: videos, checked_at: checkedAt }).eq('id', c.id);
      if (error) { console.error('refreshChannelNews:', error.message); continue; }
      changed.push({ ...c, latestVideos: videos, checkedAt });
    }
  }
  return changed;
}

/** What a channel posted that the tutor has not been offered yet and that is
 *  not already on the shelf. Nothing for a muted channel. */
export function pendingChannelVideos(c: MediaChannel, shelfVideoIds: Set<string>): ChannelVideo[] {
  if (c.muted) return [];
  const seen = new Set(c.seenVideoIds);
  return c.latestVideos.filter(v => !seen.has(v.id) && !shelfVideoIds.has(v.id));
}

/** For the Media tab's badge: every pending video across the channels. */
export function totalChannelNews(channels: MediaChannel[], items: MediaItem[]): number {
  const shelf = new Set(items.filter(it => it.kind === 'video').map(it => it.youtubeId));
  return channels.reduce((n, c) => n + pendingChannelVideos(c, shelf).length, 0);
}

/** A channel's picture, or null; YouTube's is large, so ask for a small one. */
export const channelThumb = (c: { thumbUrl: string | null }): string | null =>
  c.thumbUrl ? c.thumbUrl.replace(/=s\d+-/, '=s88-') : null;

export const NEAR_END_SECONDS = 15;
export const isAtEnd = (position: number, duration: number | null | undefined): boolean =>
  !!duration && duration > 0 && position >= duration - NEAR_END_SECONDS;
