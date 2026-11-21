/**
 * Vercel Serverless Function — who a YouTube channel is, and what it posted
 * GET /api/youtube-channel?link=https://www.youtube.com/@qabasanime
 *
 * For the Media tab's watched channels. The channel page names the channel
 * (canonical UC… id, og:title, og:image); its uploads are a playlist whose id
 * is the channel id with UC swapped for UULF (long videos, no Shorts) — or UU
 * (everything) for a channel that has only Shorts. That playlist is read the
 * same way /api/youtube-playlist reads any other.
 *
 * Response: { channelId, title, thumb, handle, uploadsId, videos: [{ id, title, length, age }] }
 *        or { error } with status 400 / 404 / 502.
 */
import { channelFrom, channelUrl, fetchPage, readPlaylist } from './_youtube.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = channelUrl(req.query?.link);
  if (!url) return res.status(400).json({ error: 'That is not a YouTube channel link.' });

  let who;
  try {
    who = channelFrom(await fetchPage(url));
  } catch (err) {
    return res.status(502).json({ error: String(err?.message ?? err) });
  }
  if (!who.channelId) return res.status(404).json({ error: 'No channel at that link.' });

  const tail = who.channelId.slice(2);
  let uploadsId = `UULF${tail}`;
  let list = await readPlaylist(uploadsId).catch(err => ({ error: String(err?.message ?? err) }));
  if (list.error) {
    uploadsId = `UU${tail}`;
    list = await readPlaylist(uploadsId).catch(err => ({ error: String(err?.message ?? err) }));
  }
  const videos = list.error ? [] : (list.videos?.length ? list.videos : list.videoIds.map(id => ({ id, title: '', length: null, age: null })));

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json({
    channelId: who.channelId,
    title: who.title ?? 'YouTube channel',
    thumb: who.thumb,
    handle: who.handle,
    uploadsId,
    videos,
  });
}
