// services/versionWatch.ts
// -----------------------------------------------------------------------------
// The installed home-screen app keeps one page alive for days: iOS does not
// reload it when it goes to the background, so a new build never reaches the
// student until they close the app and open it again. This watches for one.
//
// index.html is the only unhashed file a Vite build serves, so the module
// script it points at IS the build id. Fetch it uncached now and then; when the
// name changes, a newer build is live and we reload — quietly, only while the
// page is visible and nothing is mid-flight (a recording, an upload).
//
// Mark work that must not be interrupted with `setBusy(true)` / `setBusy(false)`.
// -----------------------------------------------------------------------------

const CHECK_EVERY_MS = 5 * 60 * 1000;
const FIRST_CHECK_MS = 20 * 1000;

let bootBuild: string | null = null;
let reloading = false;
let busy = 0;

/** Hold off a reload while something must not be interrupted. */
export function setBusy(on: boolean): void {
  busy = Math.max(0, busy + (on ? 1 : -1));
}

const buildOf = (html: string): string | null => {
  const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
};

const currentBuild = (): string | null => {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  return el?.getAttribute('src') ?? null;
};

async function liveBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return buildOf(await res.text());
  } catch {
    return null;                                   // offline — try again later
  }
}

/** A brake: however odd the answers get, never reload twice in a minute. */
function tooSoon(): boolean {
  try {
    const last = Number(sessionStorage.getItem('versionWatch:reloadedAt') ?? 0);
    return Date.now() - last < 60_000;
  } catch { return false; }
}

async function check(): Promise<void> {
  if (reloading || !bootBuild || busy > 0) return;
  const live = await liveBuild();
  if (!live || live === bootBuild) return;
  if (busy > 0 || tooSoon()) return;                // catch it on the next pass
  reloading = true;
  try { sessionStorage.setItem('versionWatch:reloadedAt', String(Date.now())); } catch { /* private */ }
  window.location.reload();
}

/** Start watching. Safe to call once, as early as possible. */
export function watchForNewBuild(): void {
  bootBuild = currentBuild();
  if (!bootBuild) return;                          // dev server — nothing to watch
  window.setTimeout(check, FIRST_CHECK_MS);
  window.setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('pageshow', () => void check());
}


