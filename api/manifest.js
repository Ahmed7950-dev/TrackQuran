/**
 * Vercel Serverless Function — per-portal web app manifest
 * GET /api/manifest?start=/portal/<id>
 *
 * iOS takes "Add to Home Screen" from the manifest in the HTML as served, and
 * the site-wide manifest says start_url "/" — so a student's icon opened the
 * tutor sign-in page. Portal pages link here instead (see api/portal.js), and
 * the icon opens the student's own page. On iOS only that installed icon can
 * receive push, so it has to be right.
 */

// Only a token-link portal may become a start_url — nothing else is accepted.
const PORTAL = [
  /^\/report\/[a-f0-9-]{36}$/i,
  /^\/portal\/[a-f0-9-]{36}$/i,
  /^\/arabic\/s\/[a-f0-9-]{36}$/i,
  /^\/family\/[a-f0-9-]{36}$/i,
];

export const portalPath = (value) =>
  typeof value === 'string' && PORTAL.some(re => re.test(value)) ? value : null;

export default function handler(req, res) {
  const start = portalPath(req.query?.start) ?? '/';

  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(JSON.stringify({
    // A distinct id per portal, so each student's icon is its own app rather
    // than a second copy of the tutor's.
    id: start,
    name: 'LisanQuran',
    short_name: 'LisanQuran',
    description: 'Quran & Arabic learning with your tutor.',
    start_url: start,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#1a8148',
    theme_color: '#1a8148',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }));
}
