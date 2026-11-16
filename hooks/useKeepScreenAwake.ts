// ─────────────────────────────────────────────────────────────────────────────
// useKeepScreenAwake — stops the phone screen from dimming and locking while
// the page is open (Screen Wake Lock API: Chrome/Android, Safari iOS 16.4+).
//
// The browser drops the lock whenever the page is hidden (app switch, screen
// off), so it is asked for again when the page comes back. Some browsers only
// grant it after a tap, so a refused first ask is retried on the next touch.
// Where the API does not exist nothing happens and the phone sleeps as usual.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';

interface WakeLockLike { released: boolean; release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void }

export function useKeepScreenAwake(active = true): void {
  useEffect(() => {
    const api = (navigator as any).wakeLock as { request: (t: 'screen') => Promise<WakeLockLike> } | undefined;
    if (!active || !api) return;
    let lock: WakeLockLike | null = null;
    let stopped = false;
    let asking = false;

    const ask = async () => {
      if (stopped || asking || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      asking = true;
      try {
        lock = await api.request('screen');
        if (stopped) { void lock.release(); return; }
      } catch {
        lock = null;   // not allowed yet (no tap) or battery saver: the next touch tries again
      } finally {
        asking = false;
      }
    };

    void ask();
    const onVisible = () => { void ask(); };
    const onTouch = () => { void ask(); };
    document.addEventListener('visibilitychange', onVisible);
    document.addEventListener('pointerdown', onTouch, { passive: true });
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      document.removeEventListener('pointerdown', onTouch);
      if (lock && !lock.released) void lock.release();
    };
  }, [active]);
}
