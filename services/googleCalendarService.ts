/**
 * Google Calendar OAuth2 + API service
 * Uses Google Identity Services (GSI) token-based flow.
 * Requires VITE_GOOGLE_CLIENT_ID in .env
 */

const SCOPES        = 'https://www.googleapis.com/auth/calendar.readonly';
const STORAGE_KEY   = 'gcal_access_token';
const EXPIRY_KEY    = 'gcal_token_expiry';
const CONNECTED_KEY = 'gcal_was_connected'; // persists across token expiry

export interface GCalEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  colorId?: string;
}

/* ------------------------------------------------------------------ */
/*  Token helpers                                                        */
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

function storeToken(token: string, expiresIn: number) {
  localStorage.setItem(STORAGE_KEY,   token);
  localStorage.setItem(EXPIRY_KEY,    String(Date.now() + expiresIn * 1000));
  localStorage.setItem(CONNECTED_KEY, 'true');
}

export function disconnectGoogleCalendar() {
  const token = localStorage.getItem(STORAGE_KEY);
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  localStorage.removeItem(CONNECTED_KEY);
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
/*  OAuth2 helpers                                                      */
/* ------------------------------------------------------------------ */

type TokenResponse = { access_token?: string; expires_in?: number; error?: string };

function buildTokenClient(
  clientId: string,
  prompt: string,
  callback: (resp: TokenResponse) => void,
) {
  return window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope:     SCOPES,
    prompt,
    callback,
  });
}

/** Full connect — shows Google account picker */
export function connectGoogleCalendar(
  onSuccess: (token: string) => void,
  onError:   (err: string) => void,
) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) { onError('VITE_GOOGLE_CLIENT_ID is not configured.'); return; }

  loadGIS().then(() => {
    buildTokenClient(clientId, 'select_account', (resp) => {
      if (resp.error || !resp.access_token) {
        onError(resp.error ?? 'Unknown OAuth error');
        return;
      }
      storeToken(resp.access_token, resp.expires_in ?? 3600);
      onSuccess(resp.access_token);
    }).requestAccessToken();
  }).catch(err => onError(String(err)));
}

/**
 * Silent re-auth — no popup, uses existing Google session.
 * Call this on page load when the token is expired but the user was previously connected.
 * Falls back to calling onFailure() if Google can't issue a token silently.
 */
export function silentRefresh(
  onSuccess: (token: string) => void,
  onFailure: () => void,
) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) { onFailure(); return; }

  loadGIS().then(() => {
    buildTokenClient(clientId, '', (resp) => {
      if (resp.error || !resp.access_token) {
        onFailure();
        return;
      }
      storeToken(resp.access_token, resp.expires_in ?? 3600);
      onSuccess(resp.access_token);
    }).requestAccessToken();
  }).catch(() => onFailure());
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
      disconnectGoogleCalendar();
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

/* ------------------------------------------------------------------ */
/*  Global type augmentation for GIS                                    */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: object) => { requestAccessToken: () => void };
          revoke: (token: string, cb: () => void) => void;
        };
      };
    };
  }
}
