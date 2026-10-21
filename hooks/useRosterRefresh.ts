// hooks/useRosterRefresh.ts
// -----------------------------------------------------------------------------
// Read the roster again when the tutor comes back to the app.
//
// The roster is fetched once, at sign-in. Everything a lesson produces — the
// marks, the logged verses, a homework — is written straight to the database
// and kept in the state of the tab that did it, so that tab always looks
// right. Any OTHER tab or device still holds the copy it loaded at sign-in: a
// lesson marked on the phone was simply missing from the laptop that had been
// open since the morning, and that reads as work that was lost.
//
// Two things it must not do:
//
//   * Read while one of our own writes is still in the air. That read can be
//     served before the write commits, and the answer would put the work that
//     was just done back off the screen.
//   * Blank a roster that has students in it. The loader swallows its own
//     error and answers with an empty list, so "nothing came back" is not the
//     same as "there is nothing".
// -----------------------------------------------------------------------------
import { useEffect, useRef } from 'react';

export interface RosterRefreshOptions<T> {
  /** Off when nobody is signed in as a tutor. */
  enabled: boolean;
  /** Re-reads the roster. Resolves to [] when it could not. */
  load: () => Promise<T[]>;
  /** True while one of our own writes has not come back yet. */
  isWriting: () => boolean;
  /** Called with a roster worth showing — never with an empty one. */
  onRoster: (rows: T[]) => void;
  /** How often to look while the app is in front. */
  intervalMs?: number;
}

export function useRosterRefresh<T>({
  enabled, load, isWriting, onRoster, intervalMs = 5 * 60 * 1000,
}: RosterRefreshOptions<T>): void {
  // Through refs so a new closure on every render doesn't restart the timer.
  const latest = useRef({ load, isWriting, onRoster });
  latest.current = { load, isWriting, onRoster };

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    const refresh = () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (latest.current.isWriting()) return;
      latest.current.load()
        .then(rows => { if (!stopped && rows.length) latest.current.onRoster(rows); })
        .catch(() => { /* next time the tab is looked at */ });
    };

    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const id = window.setInterval(refresh, intervalMs);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
