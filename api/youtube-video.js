/**
 * Vercel Serverless Function — how long a YouTube video is
 * GET /api/youtube-video?ids=abc123def45,xyz987uvw65
 *
 * The Media shelf filters by length ("under 10 minutes"). The Data API would
 * say, but it needs a key this app does not have; the watch page carries the
 * length in its player data (videoDetails.lengthSeconds), so read it there.
 * Server-side because youtube.com sends no CORS header.
 *
 * Response: { "abc123def45": { "seconds": 924 }, "xyz987uvw65": { "error": "…" } }
 */

const MAX_IDS = 12;

async function readLength(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
    headers: {
      // Without a browser agent YouTube serves a consent page with no player data.
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  if (!res.ok) return { error: `youtube answered ${res.status}` };
  const html = await res.text();
  // The video's own details, not a suggested video's further down the page.
  const at = html.indexOf(`"videoDetails":{"videoId":"${id}"`);
  if (at < 0) return { error: 'no player data on the page' };
  const m = /"lengthSeconds":"(\d+)"/.exec(html.slice(at, at + 4000));
  if (!m) return { error: 'no length on the page' };
  return { seconds: Number(m[1]) };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = String(req.query?.ids ?? '').trim();
  const ids = [...new Set(raw.split(',').map(s => s.trim()).filter(s => /^[\w-]{11}$/.test(s)))].slice(0, MAX_IDS);
  if (!ids.length) return res.status(400).json({ error: 'Pass ?ids=<video id>[,<video id>…]' });

  const out = {};
  const results = await Promise.all(ids.map(async id => {
    try { return [id, await readLength(id)]; }
    catch (err) { return [id, { error: String(err?.message ?? err) }]; }
  }));
  for (const [id, value] of results) out[id] = value;

  // A video's length never changes.
  res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=86400');
  return res.status(200).json(out);
}
