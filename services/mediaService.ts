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
  createdAt: string;
}

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
};
const toItem = (r: ItemRow): MediaItem => ({
  id: r.id, categoryId: r.category_id, title: r.title, kind: r.kind,
  youtubeId: r.youtube_id, url: r.url, itemCount: r.item_count,
  thumbUrl: r.thumb_url ?? null, createdAt: r.created_at,
});

const ITEM_COLS = 'id, category_id, title, kind, youtube_id, url, item_count, thumb_url, created_at';

export async function listMedia(): Promise<MediaItem[]> {
  const { data, error } = await supabase.from('media_items')
    .select(ITEM_COLS).order('created_at', { ascending: false });
  if (error) { console.error('listMedia:', error.message); return []; }
  return (data as ItemRow[]).map(toItem);
}

/** Returns a string instead of throwing: "already on the shelf" is the one
 *  failure the tutor can do something about, so it is worth saying plainly. */
export async function addMedia(input: {
  teacherId: string; title: string; link: ParsedLink; categoryId: string | null;
}): Promise<{ item: MediaItem } | { error: string }> {
  const thumbUrl = input.link.kind === 'playlist'
    ? await fetchPlaylistThumb(input.link.youtubeId) : null;
  const { data, error } = await supabase.from('media_items').insert({
    teacher_id: input.teacherId,
    category_id: input.categoryId,
    title: input.title.trim(),
    kind: input.link.kind,
    youtube_id: input.link.youtubeId,
    url: input.link.url,
    thumb_url: thumbUrl,
  }).select(ITEM_COLS).single();

  if (error) {
    if (error.code === '23505') return { error: 'That link is already on the shelf.' };
    console.error('addMedia:', error.message);
    return { error: 'Could not add that link.' };
  }
  return { item: toItem(data as ItemRow) };
}

export async function updateMedia(
  id: string,
  patch: { title?: string; categoryId?: string | null; itemCount?: number; thumbUrl?: string | null },
): Promise<boolean> {
  const row: Record<string, unknown> = {};
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
export const NEAR_END_SECONDS = 15;
export const isAtEnd = (position: number, duration: number | null | undefined): boolean =>
  !!duration && duration > 0 && position >= duration - NEAR_END_SECONDS;
