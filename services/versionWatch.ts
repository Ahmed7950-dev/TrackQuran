// services/versionWatch.ts
// -----------------------------------------------------------------------------
// The installed home-screen app keeps one page alive for days: iOS does not
// reload it when it goes to the background, so a new build never reached the
// student until they closed the app and opened it again.
//
// This only concerns THAT app. In a browser — on a computer above all — nothing
// here runs: a page that reloads itself while you are working is worse than a
// page that is a build behind, and a browser tab is reloaded often enough
// anyway. So: standalone only, only when you come back to the app after leaving
// it, and at most once per session, whatever the answers look like.
//
// index.html is the only unhashed file a Vite build serves, so the module
// script it points at IS the build id.
//
// Work that must not be interrupted marks itself with `setBusy(true)`.
// -----------------------------------------------------------------------------

/** Long enough that flicking away and back is not "coming back to the app". */
const AWAY_LONG_ENOUGH_MS = 30 * 1000;

let bootBuild: string | null = null;
let hiddenAt = 0;
let reloading = false;
let busy = 0;

/** Hold off a reload while something must not be interrupted. */
export function setBusy(on: boolean): void {
  busy = Math.max(0, busy + (on ? 1 : -1));
}

/** Installed on a home screen — the only place this does anything. */
const installed = (): boolean => {
  try {
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
    return window.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch { return false; }
};

const currentBuild = (): string | null =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')
    ?.getAttribute('src') ?? null;

async function liveBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const m = (await res.text()).match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
    return m ? m[1] : null;
  } catch {
    return null;                                   // offline — leave it alone
  }
}

/** Once per session. A CDN serving index.html from two deployments at once
 *  would otherwise have the app reloading itself over and over. */
function alreadyDone(): boolean {
  try { return sessionStorage.getItem('versionWatch:done') === '1'; } catch { return false; }
}

async function checkOnReturn(): Promise<void> {
  if (reloading || !bootBuild || busy > 0 || alreadyDone()) return;
  if (!hiddenAt || Date.now() - hiddenAt < AWAY_LONG_ENOUGH_MS) return;
  const live = await liveBuild();
  if (!live || live === bootBuild || busy > 0) return;
  reloading = true;
  try { sessionStorage.setItem('versionWatch:done', '1'); } catch { /* private mode */ }
  window.location.reload();
}

/** Start watching. Safe to call once, as early as possible. */
export function watchForNewBuild(): void {
  if (!installed()) return;                        // a browser tab: never
  bootBuild = currentBuild();
  if (!bootBuild) return;                          // dev server — nothing to watch
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    void checkOnReturn();
  });
}
