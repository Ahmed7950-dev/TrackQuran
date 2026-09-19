/**
 * Vercel Serverless Function — a student portal's HTML
 * Rewritten from /report/:id, /portal/:id, /arabic/s/:id and /family/:id
 * (see vercel.json) with ?p=<that path>.
 *
 * Serves the normal app shell with ONE change: the manifest link points at
 * /api/manifest for this portal, so "Add to Home Screen" saves the student's
 * page. It has to be in the HTML as sent — iOS reads the manifest before any
 * script can swap it.
 */

import { portalPath } from './manifest.js';

export default async function handler(req, res) {
  const path = portalPath(req.query?.p);
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = req.headers['x-forwarded-proto'] ?? 'https';

  let html;
  try {
    const r = await fetch(`${proto}://${host}/index.html`, { headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) throw new Error(`index.html ${r.status}`);
    html = await r.text();
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).send('<!doctype html><meta charset="utf-8"><p>Could not load the page — <a href="">try again</a>.</p>');
  }

  if (path) {
    const href = `/api/manifest?start=${encodeURIComponent(path)}`;
    html = html.replace(/<link\s+rel="manifest"[^>]*>/i, `<link rel="manifest" href="${href}" />`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Same rule as index.html: always fresh, so a deploy is picked up at once.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send(html);
}
