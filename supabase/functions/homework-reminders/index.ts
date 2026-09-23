/**
 * Supabase Edge Function: homework-reminders
 *
 * The daily nudge. Run every hour by pg_cron; for each student whose LOCAL
 * clock has just reached SEND_HOUR, and who still has homework open, pushes
 * one reminder with how long is left until their next lesson:
 *
 *   "You still haven't done your homework: record Maryam 3–10.
 *    2 days 5 hours left until your next lesson — do it now."
 *
 * Push ONLY, like lesson-reminders: nothing appears under the bell. One per
 * student per local day (push_reminders_sent), and nothing within
 * QUIET_HOURS_BEFORE of the lesson itself, where the 20-minute reminder takes
 * over.
 *
 * Auth: the cron job sends x-cron-secret (kept in Vault); nothing else may call it.
 *   ?dry=1[&hour=<0-23>][&any=1]  → preview, sends nothing. `hour` pretends the
 *   local clock says that hour; `any` ignores the hour gate altogether.
 *
 * Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RECENT_DAYS, list, loadOpenHomework, loadStudents, pushUrl } from '../_shared/openHomework.ts';

/** The student's local hour when the reminder goes out. */
const SEND_HOUR = 17;
/** Closer to the lesson than this, the 20-minute reminder says it instead. */
const QUIET_HOURS_BEFORE = 3;
/** Students whose timezone we don't know are reminded on this clock. */
const DEFAULT_TZ = 'Europe/Istanbul';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; student_id: string };

/** The hour (0–23) and the date (YYYY-MM-DD) on a student's own clock. */
const localNow = (tz: string, at: Date): { hour: number; date: string } => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
    return { hour: Number(get('hour')) % 24, date: `${get('year')}-${get('month')}-${get('day')}` };
  } catch {
    return { hour: at.getUTCHours(), date: at.toISOString().slice(0, 10) };
  }
};

/** "2 days 5 hours", "5 hours", "under an hour". */
const untilLabel = (ms: number): string => {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'under an hour';
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  const dayPart = d ? `${d} day${d === 1 ? '' : 's'}` : '';
  const hourPart = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  return [dayPart, hourPart].filter(Boolean).join(' ') || 'under an hour';
};

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const dry = params.get('dry') === '1';
  const anyHour = dry && params.get('any') === '1';
  const forcedHour = dry && params.get('hour') !== null ? Number(params.get('hour')) : null;

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date();
  const nowMs = now.getTime();

  // 1. Every student with a phone registered. The id is a Quran students.id or
  //    an Arabic share token.
  const { data: subsRaw, error: subErr } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, student_id')
    .eq('recipient', 'student');
  if (subErr) return json({ error: subErr.message }, 500);
  const subsByPushId = new Map<string, Sub[]>();
  for (const s of (subsRaw ?? []) as Sub[]) {
    subsByPushId.set(s.student_id, [...(subsByPushId.get(s.student_id) ?? []), s]);
  }
  const pushIds = [...subsByPushId.keys()];
  if (!pushIds.length) return json({ students: 0 });

  // 2. Back to the students themselves (a push id is either kind).
  const [{ data: quranRows }, { data: arabicRows }] = await Promise.all([
    db.from('students').select('id').in('id', pushIds),
    db.from('arabic_students').select('id, share_token').in('share_token', pushIds),
  ]);
  const studentIds = [
    ...(quranRows ?? []).map((q: { id: string }) => q.id),
    ...(arabicRows ?? []).map((a: { id: string }) => a.id),
  ];
  if (!studentIds.length) return json({ students: 0 });

  const { quranById, arabicById, pushIdOf } = await loadStudents(db, studentIds);

  // 3. Whose local clock has just reached the sending hour?
  const clockOf = new Map<string, { hour: number; date: string }>();
  const atSendHour = studentIds.filter(id => {
    const tz = (quranById.get(id)?.timezone || arabicById.get(id)?.timezone || DEFAULT_TZ) as string;
    const clock = localNow(tz, now);
    clockOf.set(id, clock);
    return anyHour || clock.hour === (forcedHour ?? SEND_HOUR);
  });
  if (!atSendHour.length) return json({ students: studentIds.length, atSendHour: 0 });

  // 4. …and has not been reminded on that local day already.
  const keyOf = (id: string) => `hw-daily:${pushIdOf(id) ?? id}:${clockOf.get(id)?.date}`;
  const { data: already } = await db.from('push_reminders_sent').select('key').in('key', atSendHour.map(keyOf));
  const sentKeys = new Set((already ?? []).map((r: { key: string }) => r.key));
  const candidates = dry ? atSendHour : atSendHour.filter(id => !sentKeys.has(keyOf(id)));
  if (!candidates.length) return json({ students: studentIds.length, atSendHour: atSendHour.length, due: 0 });

  // 5. What is still open, and when their next lesson is.
  const since = new Date(nowMs - RECENT_DAYS * 86_400_000).toISOString();
  const [{ homeworkFor, reportOf }, { data: sessions }] = await Promise.all([
    loadOpenHomework(db, candidates, since, quranById, arabicById),
    db.from('arabic_lesson_sessions')
      .select('student_id, start_at')
      .eq('status', 'confirmed')
      .in('student_id', candidates)
      .gt('start_at', now.toISOString())
      .order('start_at', { ascending: true }),
  ]);
  const nextLesson = new Map<string, string>();
  for (const s of (sessions ?? []) as { student_id: string; start_at: string }[]) {
    if (!nextLesson.has(s.student_id)) nextLesson.set(s.student_id, s.start_at);
  }

  // 6. Compose and send.
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!dry) {
    if (!publicKey || !privateKey) return json({ error: 'VAPID keys are not set' }, 500);
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@lisanquran.com', publicKey, privateKey);
  }

  const report: unknown[] = [];
  const gone: string[] = [];
  let skippedNoHomework = 0;
  let skippedNearLesson = 0;

  for (const studentId of candidates) {
    const { items, reciteId } = homeworkFor(studentId);
    if (!items.length) { skippedNoHomework++; continue; }

    const startAt = nextLesson.get(studentId);
    const msLeft = startAt ? Date.parse(startAt) - nowMs : null;
    if (msLeft !== null && msLeft < QUIET_HOURS_BEFORE * 3_600_000) { skippedNearLesson++; continue; }

    const pushId = pushIdOf(studentId);
    if (!pushId) continue;
    const subs = subsByPushId.get(pushId) ?? [];
    if (!subs.length) continue;

    const isQuran = quranById.has(studentId);
    const title = 'Your homework is still waiting';
    const body = msLeft !== null
      ? `You still haven't done your homework: ${list(items)}. ${untilLabel(msLeft)} left until your next lesson — do it now.`
      : `You still haven't done your homework: ${list(items)}. Do it now, before your next lesson.`;
    const url = pushUrl({ isQuran, reciteId, reportId: reportOf.get(studentId), pushId });
    // One a day per phone: a later send replaces the one on screen.
    const tag = `hw-daily:${pushId}`;

    let delivered = 0;
    if (!dry) {
      const payload = JSON.stringify({ title, body, url, tag });
      await Promise.all(subs.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload, { TTL: 6 * 3600, urgency: 'normal' },   // stale by the next morning
          );
          delivered++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) gone.push(sub.id);
        }
      }));
      await db.from('push_reminders_sent').upsert({ key: keyOf(studentId), devices: delivered });
    }
    report.push({
      student: studentId, devices: subs.length, delivered,
      hoursToLesson: msLeft === null ? null : Math.round(msLeft / 3_600_000), title, body, url,
    });
  }

  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
  return json({
    dry, students: studentIds.length, atSendHour: atSendHour.length, due: candidates.length,
    skippedNoHomework, skippedNearLesson, removed: gone.length, sent: report,
  });
});
