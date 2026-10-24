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
 * Response: { "PLaaa": { "videoIds": [...], "count": 11 }, "PLbbb": { "error": "…" } }
 */

/** YouTube renders about this many into the page; the rest lazy-load. */
const PAGE_LIMIT = 100;
const MAX_IDS = 12;

/** Every distinct video id the page mentions, in the order it mentions them. */
function videoIdsFrom(html) {
  const out = [];
  const seen = new Set();
  const re = /"videoId":"([\w-]{11})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}

async function readPlaylist(id) {
  const res = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`, {
    headers: {
      // Without a browser agent YouTube serves a consent interstitial with no list in it.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) return { error: `youtube answered ${res.status}` };
  const html = await res.text();
  const videoIds = videoIdsFrom(html);
  if (!videoIds.length) return { error: 'no videos found on the page' };
  return { videoIds, count: videoIds.length, truncated: videoIds.length >= PAGE_LIMIT };
}

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
