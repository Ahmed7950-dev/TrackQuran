/**
 * Reading YouTube pages without an API key — shared by the Media routes.
 * (The leading underscore keeps Vercel from serving this file as a route.)
 *
 * Playlist and channel pages carry their contents in `var ytInitialData`,
 * and youtube.com sends no CORS header, so this has to run on the server.
 * Watch pages and the player endpoint answer a server with a bot check; the
 * playlist and channel pages do not.
 */

const HEADERS = {
  // Without a browser agent YouTube serves a consent interstitial with no list in it.
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

export async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`youtube answered ${res.status}`);
  return res.text();
}

/** Every distinct video id the page mentions, in the order it mentions them. */
export function videoIdsFrom(html) {
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

function initialData(html) {
  const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/**
 * The videos a playlist page lists, newest first for an uploads list:
 * [{ id, title, length: "33:02" | null, age: "2 days ago" | null }].
 * Empty when the page has none, or YouTube changed its layout — callers fall
 * back to bare ids from videoIdsFrom.
 */
export function videosFrom(html) {
  const data = initialData(html);
  if (!data) return [];
  const out = [];
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { for (const v of o) walk(v); return; }
    const lv = o.lockupViewModel;
    if (lv && typeof lv.contentId === 'string' && /^[\w-]{11}$/.test(lv.contentId)) {
      if (!seen.has(lv.contentId)) {
        seen.add(lv.contentId);
        const md = lv.metadata?.lockupMetadataViewModel;
        const title = md?.title?.content ?? '';
        const image = JSON.stringify(lv.contentImage ?? {});
        const length = (/"text":"(\d{1,2}:\d\d(?::\d\d)?)"/.exec(image) ?? [])[1] ?? null;
        const parts = JSON.stringify(md?.metadata ?? {});
        const age = (/"content":"([^"]*\bago)"/.exec(parts) ?? [])[1] ?? null;
        out.push({ id: lv.contentId, title, length, age });
      }
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  walk(data);
  return out;
}

export async function readPlaylist(id, limit = 100) {
  const html = await fetchPage(`https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`);
  const videos = videosFrom(html);
  const videoIds = videos.length ? videos.map(v => v.id) : videoIdsFrom(html);
  if (!videoIds.length) return { error: 'no videos found on the page' };
  return { videoIds, count: videoIds.length, truncated: videoIds.length >= limit, videos };
}

/**
 * A channel link → its address on youtube.com, or null if it is not one.
 * Accepts a URL (/@handle, /channel/UC…, /c/name, /user/name, with or without
 * a trailing /videos), a bare @handle or a bare UC… id.
 */
export function channelUrl(raw) {
  const text = String(raw ?? '').trim();
  if (/^UC[\w-]{22}$/.test(text)) return `https://www.youtube.com/channel/${text}`;
  if (/^@[\w.-]{2,100}$/.test(text)) return `https://www.youtube.com/${text}`;
  let u;
  try { u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  if (host !== 'youtube.com') return null;
  const [first, second] = u.pathname.split('/').filter(Boolean);
  if (first && /^@[\w.-]{2,100}$/.test(decodeURIComponent(first))) return `https://www.youtube.com/${first}`;
  if (first === 'channel' && second && /^UC[\w-]{22}$/.test(second)) return `https://www.youtube.com/channel/${second}`;
  if ((first === 'c' || first === 'user') && second && /^[\w.-]{1,100}$/.test(second)) return `https://www.youtube.com/${first}/${second}`;
  return null;
}

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Who a channel page belongs to: { channelId, title, thumb, handle }. */
export function channelFrom(html) {
  const channelId = (/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/.exec(html) ?? [])[1]
    ?? (/"externalId":"(UC[\w-]{22})"/.exec(html) ?? [])[1]
    ?? null;
  const title = (/<meta property="og:title" content="([^"]*)"/.exec(html) ?? [])[1] ?? null;
  const thumb = (/<meta property="og:image" content="([^"]*)"/.exec(html) ?? [])[1] ?? null;
  const handle = (/"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/(@[^"]+)"/.exec(html) ?? [])[1] ?? null;
  return { channelId, title: title && decode(title), thumb: thumb && decode(thumb), handle };
}
