// services/pushService.ts
// ---------------------------------------------------------------------------
// Web push for the tutor (students come later — the table already has their
// columns). One subscription per browser/device, stored in push_subscriptions;
// the push-out Edge Function reads them and sends.
//
// iOS only delivers web push to a site added to the Home Screen, so the UI has
// to say that rather than fail silently — hence pushSupport().
// ---------------------------------------------------------------------------

import { supabase } from '../lib/supabase';

// The VAPID *public* key is meant to ship in the browser — it only identifies
// this app to the push service. The private half lives in the Edge Function's
// secrets. The env var is here so the pair can be rotated without a code change.
const VAPID_PUBLIC_KEY =
  ((import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  'BOYEJxU1h0Q6swkcGDQyGRl-MyMwXoUbAklssMsXKCjrcMS2GeZ2nXuLZgVEJ0ZZZ7ouwYEXDiI0F-7IifnHIIQ';

export type PushState = 'unsupported' | 'needs-home-screen' | 'blocked' | 'off' | 'on';

const isIOS = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);

/** iOS shows the install banner only in Safari; standalone means "from the Home Screen". */
const isStandalone = (): boolean =>
  (navigator as any).standalone === true ||
  window.matchMedia?.('(display-mode: standalone)').matches === true;

/** What this browser can do right now, before any permission prompt. */
export function pushSupport(): Exclude<PushState, 'on' | 'off'> | 'available' {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    // On iOS the APIs are simply absent until the app runs from the Home Screen.
    return isIOS() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  }
  if (isIOS() && !isStandalone()) return 'needs-home-screen';
  if (Notification.permission === 'denied') return 'blocked';
  return 'available';
}

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

const keyOf = (sub: PushSubscription, name: 'p256dh' | 'auth'): string => {
  const key = sub.getKey(name);
  if (!key) return '';
  return btoa(String.fromCharCode(...new Uint8Array(key)));
};

/** A human label so the tutor can tell their devices apart. */
const deviceLabel = (): string => {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : 'Device';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Vivaldi/.test(ua) ? 'Vivaldi'
    : /Edg/.test(ua) ? 'Edge' : /Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua) ? 'Safari' : 'Browser';
  return isStandalone() ? `${device} · Home Screen` : `${device} · ${browser}`;
};

export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.error('service worker registration failed:', e);
    return null;
  }
}

/** Is this device already subscribed? */
export async function currentPushState(): Promise<PushState> {
  const support = pushSupport();
  if (support !== 'available') return support;
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

/**
 * Ask permission and subscribe this device. MUST be called from a user
 * gesture — iOS and Chrome both refuse otherwise, and a refusal is sticky.
 */
export async function enablePush(input: {
  recipient: 'tutor' | 'student';
  teacherId: string;
  studentId?: string;
}): Promise<{ ok: boolean; state: PushState; error?: string }> {
  const support = pushSupport();
  if (support !== 'available') return { ok: false, state: support };
  if (!VAPID_PUBLIC_KEY) return { ok: false, state: 'off', error: 'Push is not configured (missing VAPID key).' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, state: permission === 'denied' ? 'blocked' : 'off' };
  }

  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerPushWorker());
  if (!reg) return { ok: false, state: 'off', error: 'Could not start the notification worker.' };
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e: any) {
      return { ok: false, state: 'off', error: e?.message ?? 'Subscription was refused.' };
    }
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint:    sub.endpoint,
    p256dh:      keyOf(sub, 'p256dh'),
    auth:        keyOf(sub, 'auth'),
    recipient:   input.recipient,
    teacher_id:  input.teacherId,
    student_id:  input.studentId ?? null,
    label:       deviceLabel(),
    last_seen_at: new Date().toISOString(),
    last_error:  null,
  }, { onConflict: 'endpoint' });

  if (error) {
    console.error('enablePush save:', error.message);
    return { ok: false, state: 'off', error: 'Could not save this device.' };
  }
  return { ok: true, state: 'on' };
}

/** Stop pushes to this device and forget it. */
export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    try { await sub.unsubscribe(); } catch { /* already gone */ }
  }
  return 'off';
}

/**
 * Send a push for a notification that was just written. Fire and forget: the
 * row is the source of truth, a missed push only costs the phone alert.
 */
export async function sendPushFor(input: {
  recipient: 'tutor' | 'student';
  teacherId: string;
  studentId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Tutor-only: a push they asked for themselves, verified by their session. */
  test?: boolean;
}): Promise<void> {
  try {
    await supabase.functions.invoke('push-out', { body: input });
  } catch {
    // never let a push failure break the thing that caused it
  }
}
