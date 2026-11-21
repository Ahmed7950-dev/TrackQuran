/**
 * Vercel Serverless Function — what a YouTube playlist holds right now
 * GET /api/youtube-playlist?ids=PLaaa,PLbbb
 *
 * The Media shelf wants to say "new" when the tutor adds a video to one of
 * their playlists on YouTube. Three ways to ask, and only one of them works:
 *
 *   the Data API      needs a key this app deliberately does not have;
 *   the RSS feed      (feeds/videos.xml?playlist_id=…) stops at 15 entries, so
 *                     a 42-video list reads as 15 and never changes again;
 *   the playlist PAGE carries the whole list in its initial data — 11 and 42
 *                     for the two lists on the shelf, matching exactly what
 *                     the player itself reports.
 *
 * So: fetch the page and read the ids out of it. It has to happen here rather
 * than in the browser because youtube.com sends no CORS header — the fetch is
 * simply refused there.
 *
 * Response: { "PLaaa": { "videoIds": [...], "count": 11, "videos": [{ id, title, length, age }] },
 *             "PLbbb": { "error": "…" } }
 * `videos` carries the titles (used by the watched-channels pop-up, which
 * reads a channel's uploads list through this same route); it is empty if
 * YouTube's page layout ever changes, and `videoIds` still works then.
 */

import { readPlaylist } from './_youtube.js';

const MAX_IDS = 12;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = String(req.query?.ids ?? '').trim();
  const ids = raw.split(',').map(s => s.trim()).filter(s => /^[\w-]{2,64}$/.test(s)).slice(0, MAX_IDS);
  if (!ids.length) return res.status(400).json({ error: 'Pass ?ids=<playlist id>[,<playlist id>…]' });

  const out = {};
  const results = await Promise.all(ids.map(async id => {
    try { return [id, await readPlaylist(id)]; }
    catch (err) { return [id, { error: String(err?.message ?? err) }]; }
  }));
  for (const [id, value] of results) out[id] = value;

  // A playlist does not change minute to minute, and the client throttles on
  // top of this; the cache is what stops a refresh storm costing anything.
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json(out);
}
