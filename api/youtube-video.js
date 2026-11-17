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

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** The watch page. Works from a home connection; from a data centre YouTube
 *  often serves a "confirm you're not a bot" page instead, hence the fallback. */
async function fromWatchPage(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) return { error: `watch page ${res.status}` };
  const html = await res.text();
  // The video's own details, not a suggested video's further down the page.
  const at = html.indexOf(`"videoDetails":{"videoId":"${id}"`);
  const m = at < 0 ? null : /"lengthSeconds":"(\d+)"/.exec(html.slice(at, at + 4000));
  if (m) return { seconds: Number(m[1]) };
  const title = /<title>([^<]{0,80})/.exec(html)?.[1] ?? '';
  return { error: `watch page: no length (${html.length} bytes, "${title}")` };
}

/** The player endpoint YouTube's own web player calls. It answers with the
 *  video's details even when it will not hand out the streams. */
async function fromPlayerApi(id) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en', gl: 'US' } },
      videoId: id,
    }),
  });
  if (!res.ok) return { error: `player api ${res.status}` };
  const data = await res.json();
  const sec = Number(data?.videoDetails?.videoId === id ? data.videoDetails.lengthSeconds : NaN);
  if (sec > 0) return { seconds: sec };
  return { error: `player api: no length (${data?.playabilityStatus?.status ?? 'no status'})` };
}

async function readLength(id) {
  const a = await fromWatchPage(id).catch(err => ({ error: String(err?.message ?? err) }));
  if (a.seconds) return a;
  const b = await fromPlayerApi(id).catch(err => ({ error: String(err?.message ?? err) }));
  if (b.seconds) return b;
  return { error: `${a.error}; ${b.error}` };
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

  // A video's length never changes, so a full answer is kept a month; a
  // failed one is not kept at all, or the failure would stick.
  const allFound = Object.values(out).every(v => v.seconds);
  res.setHeader('Cache-Control', allFound ? 's-maxage=2592000, stale-while-revalidate=86400' : 'no-store');
  return res.status(200).json(out);
}
