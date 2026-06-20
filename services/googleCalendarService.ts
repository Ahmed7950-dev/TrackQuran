/**
 * Google Calendar OAuth2 + API service
 *
 * Uses the Authorization Code flow (GIS initCodeClient) so a long-lived
 * refresh token is obtained on first connect and stored in localStorage.
 * All token exchanges and refreshes go through a Supabase Edge Function
 * ("google-token") that holds the client_secret server-side.
 *
 * After the initial connect the user is NEVER asked to log in again —
 * the refresh token silently obtains new access tokens via the Edge Function,
 * with no dependency on third-party cookies or Chrome Privacy Sandbox.
 *
 * Required env vars (in .env):
 *   VITE_GOOGLE_CLIENT_ID
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Required Supabase secrets (deploy once via CLI):
 *   supabase secrets set GOOGLE_CLIENT_ID=<your-client-id>
 *   supabase secrets set GOOGLE_CLIENT_SECRET=<your-client-secret>
 *   supabase functions deploy google-token
 */

const SCOPES        = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
const STORAGE_KEY   = 'gcal_access_token';
const EXPIRY_KEY    = 'gcal_token_expiry';
const REFRESH_KEY   = 'gcal_refresh_token';   // Long-lived; persists across sessions
const CONNECTED_KEY = 'gcal_was_connected';

export interface GCalEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  colorId?: string;
}

/* ------------------------------------------------------------------ */
/*  Token storage helpers                                               */
/* ------------------------------------------------------------------ */

export function getStoredToken(): string | null {
  const token  = localStorage.getItem(STORAGE_KEY);
  const expiry = localStorage.getItem(EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

/** True if the user has ever connected — survives token expiry */
export function wasConnected(): boolean {
  return localStorage.getItem(CONNECTED_KEY) === 'true';
}

function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

function storeAccessToken(token: string, expiresIn: number) {
  localStorage.setItem(STORAGE_KEY,   token);
  localStorage.setItem(EXPIRY_KEY,    String(Date.now() + expiresIn * 1000));
  localStorage.setItem(CONNECTED_KEY, 'true');
}

function storeRefreshToken(token: string) {
  localStorage.setItem(REFRESH_KEY, token);
}

export function disconnectGoogleCalendar() {
  // Revoke the refresh token — this also invalidates all linked access tokens
  const refreshToken = getStoredRefreshToken();
  if (refreshToken) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
      method: 'POST',
    }).catch(() => { /* best-effort */ });
  }
  // Also revoke access token via GIS if available
  const accessToken = localStorage.getItem(STORAGE_KEY);
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {});
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(CONNECTED_KEY);
  cancelAutoRefresh();
}

/* ------------------------------------------------------------------ */
/*  Supabase Edge Function helpers                                      */
/* ------------------------------------------------------------------ */

function edgeFnUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/functions/v1/google-token`;
}

function edgeFnHeaders(): HeadersInit {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${anonKey}`,
    'apikey':        anonKey,
  };
}

/** Exchange an authorization code for access + refresh tokens (server-side). */
async function exchangeCode(code: string, redirectUri: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}> {
  const res = await fetch(edgeFnUrl(), {
    method:  'POST',
    headers: edgeFnHeaders(),
    body:    JSON.stringify({ action: 'exchange', code, redirectUri }),
  });
  const data = await res.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (data.error || !data.access_token) {
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${data.error_description ?? data.error ?? JSON.stringify(data)}`);
  }
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn:    data.expires_in ?? 3600,
  };
}

/**
 * Silently get a fresh access token using the stored refresh token.
 * Calls the Edge Function — no user interaction, no cookies required.
 * Returns the new access token, or null if the refresh token is missing or revoked.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(edgeFnUrl(), {
      method:  'POST',
      headers: edgeFnHeaders(),
      body:    JSON.stringify({ action: 'refresh', refreshToken }),
    });
    const data = await res.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (data.error || !data.access_token) {
      // `invalid_grant` means the refresh token is PERMANENTLY dead (revoked, or
      // expired — Google expires refresh tokens after 7 days while the OAuth
      // consent screen is in "Testing" mode). Retrying it is pointless and only
      // spams 400s. Clear the dead token and stop the auto-refresh poller so the
      // app shows ONE clean reconnect prompt instead of erroring every 60s.
      // Other errors (network blips, 5xx) are transient — keep the token, retry.
      if (data.error === 'invalid_grant') {
        localStorage.removeItem(REFRESH_KEY);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(EXPIRY_KEY);
        cancelAutoRefresh();
      } else {
        console.warn('[GCal] Silent token refresh failed (transient):', data.error);
      }
      return null;
    }
    storeAccessToken(data.access_token, data.expires_in ?? 3600);
    // If Google rotates the refresh token, store the new one
    if (data.refresh_token) storeRefreshToken(data.refresh_token);
    return data.access_token;
  } catch (err) {
    console.warn('[GCal] Token refresh exception:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Proactive auto-refresh                                              */
/*                                                                      */
/*  Polls every 60 s. When the access token has < 10 min remaining,    */
/*  calls the Edge Function to get a fresh one — completely silent,     */
/*  no popup, no cookies needed.                                        */
/* ------------------------------------------------------------------ */

let _refreshInterval: ReturnType<typeof setInterval> | null = null;
let _isRefreshing = false;

export function scheduleAutoRefresh(
  onNewToken: (token: string) => void,
  onExpired:  () => void,
): void {
  cancelAutoRefresh();

  const checkAndRefresh = () => {
    if (_isRefreshing) return;
    const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? '0');
    if (!expiry) return;

    const msLeft = expiry - Date.now();
    if (msLeft > 10 * 60 * 1000) return;   // > 10 min left — skip
    if (msLeft < -60 * 60 * 1000) return;  // > 1 hr past expiry — give up

    _isRefreshing = true;
    refreshAccessToken()
      .then(newToken => {
        _isRefreshing = false;
        if (newToken) onNewToken(newToken);
        else          onExpired();
      })
      .catch(() => {
        _isRefreshing = false;
        onExpired();
      });
  };

  checkAndRefresh();
  _refreshInterval = setInterval(checkAndRefresh, 60_000);
}

export function cancelAutoRefresh(): void {
  if (_refreshInterval !== null) {
    clearInterval(_refreshInterval);
    _refreshInterval = null;
  }
  _isRefreshing = false;
}

/* ------------------------------------------------------------------ */
/*  GIS script loader                                                   */
/* ------------------------------------------------------------------ */

let gisLoaded = false;

export function loadGIS(): Promise<void> {
  if (gisLoaded || document.getElementById('gis-script')) {
    gisLoaded = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const script    = document.createElement('script');
    script.id       = 'gis-script';
    script.src      = 'https://accounts.google.com/gsi/client';
    script.async    = true;
    script.onload   = () => { gisLoaded = true; resolve(); };
    script.onerror  = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

/* ------------------------------------------------------------------ */
/*  OAuth2 — Authorization Code flow                                   */
/* ------------------------------------------------------------------ */

/**
 * Full connect — opens a Google OAuth2 popup.
 * Uses a manual auth URL so we control the redirect_uri exactly,
 * avoiding the redirect_uri mismatch that GIS initCodeClient can cause.
 * Stores the refresh token so all future sessions are completely silent.
 */
export function connectGoogleCalendar(
  onSuccess: (token: string) => void,
  onError:   (err: string) => void,
) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) { onError('VITE_GOOGLE_CLIENT_ID is not configured.'); return; }

  const redirectUri = `${window.location.origin}/gcal-callback`;

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',   // Always show consent so Google issues a fresh refresh_token
  }).toString();

  const popup = window.open(authUrl, 'gcal-auth', 'width=520,height=620,top=100,left=200');
  if (!popup) {
    onError('Popup was blocked — please allow popups for this site and try again.');
    return;
  }

  // The GCalOAuthCallback page posts the code back via postMessage then closes itself.
  // We rely solely on that message to know auth finished — we deliberately do NOT
  // poll `popup.closed`. Once the popup navigates to accounts.google.com (which
  // sets Cross-Origin-Opener-Policy), the browser severs the opener link and logs
  // a COOP warning on every `popup.closed` read — twice a second — even inside a
  // try/catch. The only cleanup we need is a one-shot timeout to drop the listener
  // if the user abandons the popup without completing consent.
  let cleanupTimer: ReturnType<typeof setTimeout>;

  const handleMessage = async (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (!event.data?.gcalCode && !event.data?.gcalError) return;

    window.removeEventListener('message', handleMessage);
    clearTimeout(cleanupTimer);

    if (event.data.gcalError) {
      onError(event.data.gcalError);
      return;
    }

    try {
      const tokens = await exchangeCode(event.data.gcalCode, redirectUri);
      storeAccessToken(tokens.accessToken, tokens.expiresIn);
      if (tokens.refreshToken) storeRefreshToken(tokens.refreshToken);
      onSuccess(tokens.accessToken);
    } catch (err) {
      onError(String(err));
    }
  };

  window.addEventListener('message', handleMessage);

  // If no message arrives within 5 minutes, the user abandoned the popup — drop
  // the listener so it doesn't linger.
  cleanupTimer = setTimeout(() => {
    window.removeEventListener('message', handleMessage);
  }, 5 * 60 * 1000);
}

/**
 * Silent re-auth — uses the stored refresh token via the Edge Function.
 * No popup, no cookies. Falls back to onFailure() only if the refresh
 * token is missing or has been revoked by the user.
 */
export function silentRefresh(
  onSuccess: (token: string) => void,
  onFailure: () => void,
): void {
  refreshAccessToken()
    .then(token => { if (token) onSuccess(token); else onFailure(); })
    .catch(() => onFailure());
}

/**
 * One-click reconnect — used when silentRefresh fails (refresh token revoked).
 * Tries the stored refresh token first; if that fails, opens the full OAuth popup.
 */
export function reconnectGoogleCalendar(
  onSuccess: (token: string) => void,
  onError:   (err: string) => void,
) {
  refreshAccessToken().then(token => {
    if (token) {
      onSuccess(token);
    } else {
      // Refresh token revoked or cleared — show full connect flow
      connectGoogleCalendar(onSuccess, onError);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Calendar API fetch                                                  */
/* ------------------------------------------------------------------ */

async function fetchCalendarIds(token: string): Promise<string[]> {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50',
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    if (res.status === 401) {
      // Access token rejected — clear it so silentRefresh runs on next tick
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(EXPIRY_KEY);
      throw new Error('Token expired — please reconnect Google Calendar.');
    }
    throw new Error(`GCal API error ${res.status}`);
  }
  const data = await res.json() as { items?: { id: string }[] };
  return (data.items ?? []).map(c => c.id);
}

async function fetchEventsFromCalendar(
  token: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin:      timeMin.toISOString(),
    timeMax:      timeMax.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '250',
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json() as { items?: GCalEvent[] };
  return data.items ?? [];
}

export async function fetchGCalEvents(
  token: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GCalEvent[]> {
  const calendarIds = await fetchCalendarIds(token);
  const results     = await Promise.all(
    calendarIds.map(id => fetchEventsFromCalendar(token, id, timeMin, timeMax)),
  );
  const seen = new Set<string>();
  const all:  GCalEvent[] = [];
  for (const events of results) {
    for (const ev of events) {
      if (!seen.has(ev.id)) { seen.add(ev.id); all.push(ev); }
    }
  }
  return all;
}

/**
 * Create a Google Calendar event with an auto-generated Meet link.
 * Returns the hangoutLink (e.g. "https://meet.google.com/abc-defg-hij") or null on failure.
 * The event lasts 1 hour starting at startISO.
 */
export async function createGoogleMeetLink(
  studentName: string,
  startISO: string,
): Promise<string | null> {
  // Try stored token first, refresh if needed
  let token = getStoredToken();
  if (!token) token = await refreshAccessToken();
  if (!token) return null;

  const start = new Date(startISO);
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // +1 hour

  try {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: `Arabic Lesson — ${studentName}`,
          start:   { dateTime: start.toISOString() },
          end:     { dateTime: end.toISOString() },
          conferenceData: {
            createRequest: { requestId: `lisan-${studentName.replace(/\s/g, '')}-${Date.now()}` },
          },
        }),
      },
    );
    if (!res.ok) {
      console.error('[GCal] createMeetLink failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return (data.hangoutLink as string) ?? null;
  } catch (err) {
    console.error('[GCal] createMeetLink exception:', err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Global type augmentation for GIS                                    */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: object) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
          initCodeClient:  (cfg: object) => { requestCode: () => void };
          revoke: (token: string, cb: () => void) => void;
        };
      };
    };
  }
}
