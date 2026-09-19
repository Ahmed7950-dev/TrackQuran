// services/installService.ts
// ---------------------------------------------------------------------------
// "Add to Home Screen" — as close to one tap as each platform allows.
//
//  • Chrome / Edge / Samsung (Android, desktop): the browser hands us a
//    beforeinstallprompt event; calling prompt() on it opens the real install
//    dialog. It fires early and only once, so it is captured at startup.
//  • iPhone / iPad: Apple offers no API at all. The best we can do is a guide
//    pointing at the Share button — and inside an app's own browser
//    (Instagram, Facebook…) Add to Home Screen does not exist, so there the
//    guide says to open the page in Safari first.
// ---------------------------------------------------------------------------

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallMode =
  | 'installed'       // already running from the Home Screen / as an app
  | 'prompt'          // the browser gave us a real install dialog to open
  | 'ios'             // iPhone/iPad in Safari (or Chrome/Edge on iOS): show the steps
  | 'ios-inapp'       // iPhone inside another app's browser: open in Safari first
  | 'android-manual'  // Android without a prompt (Firefox, some Samsung builds): menu steps
  | 'none';           // desktop browser that cannot install — show nothing

let deferred: BeforeInstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

/** Call once at startup, before React renders — the event will not repeat. */
export function initInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();              // keep Chrome's own mini-bar away; we show ours
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    justInstalled = true;
    notify();
  });
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const ua = () => navigator.userAgent;

export const isIOSDevice = (): boolean =>
  !/Android/.test(ua()) && (
    /iPad|iPhone|iPod/.test(ua()) ||
    // iPadOS presents itself as a Mac; a touch screen gives it away.
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );

export const isStandaloneApp = (): boolean =>
  (navigator as any).standalone === true ||
  window.matchMedia?.('(display-mode: standalone)').matches === true;

/** Apps that open links in their own browser, where Add to Home Screen is missing. */
const IN_APP = /FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|LinkedInApp|Twitter|GSA\//;

export function installMode(): InstallMode {
  if (justInstalled || isStandaloneApp()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOSDevice()) return IN_APP.test(ua()) ? 'ios-inapp' : 'ios';
  if (/Android/.test(ua())) return 'android-manual';
  return 'none';
}

/** Which iOS browser — the Share button sits in a different place in each. */
export function iosBrowser(): 'safari' | 'chrome' | 'edge' | 'firefox' | 'other' {
  const u = ua();
  if (/CriOS/.test(u)) return 'chrome';
  if (/EdgiOS/.test(u)) return 'edge';
  if (/FxiOS/.test(u)) return 'firefox';
  if (/Safari/.test(u)) return 'safari';
  return 'other';
}

/** Open the real install dialog. Must run from a tap. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null;                  // a prompt event can only be used once
  notify();
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome === 'accepted') justInstalled = true;
  notify();
  return outcome;
}
