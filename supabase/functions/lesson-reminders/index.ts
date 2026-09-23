/**
 * Supabase Edge Function: lesson-reminders
 *
 * Run every minute by pg_cron. Finds lessons starting in about 20 minutes and
 * pushes a reminder to the student's phone — adding any homework they have not
 * done yet. Push ONLY: no booking_notifications row, so nothing appears under
 * the bell in the app. Each lesson is reminded once (push_reminders_sent).
 *
 * Auth: the cron job sends x-cron-secret (kept in Vault); nothing else may call it.
 *   ?dry=1&from=<min>&to=<min>[&all=1]  → preview the messages for a window, sends
 *   nothing; all=1 includes students with no phone registered.
 *
 * Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RECENT_DAYS, list, loadOpenHomework, loadStudents, pushUrl } from '../_shared/openHomework.ts';

// The cron runs every minute; a lesson is caught the first minute it is 21 or
// fewer minutes away — so ~20 minutes ahead — and a late-booked lesson still
// gets reminded as long as it is at least 15 minutes out.
const WINDOW_FROM_MIN = 15;
const WINDOW_TO_MIN = 21;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

type Sub = { id: string; endpoint: string; p256dh: string; auth: string; student_id: string };

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const dry = params.get('dry') === '1';
  const fromMin = dry ? Number(params.get('from') ?? WINDOW_FROM_MIN) : WINDOW_FROM_MIN;
  const toMin = dry ? Number(params.get('to') ?? WINDOW_TO_MIN) : WINDOW_TO_MIN;

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  // 1. Lessons in the window.
  const { data: sessions, error: sErr } = await db
    .from('arabic_lesson_sessions')
    .select('id, teacher_id, student_id, start_at, family_link_id')
    .eq('status', 'confirmed')
    .gt('start_at', iso(now + fromMin * 60_000))
    .lte('start_at', iso(now + toMin * 60_000));
  if (sErr) return json({ error: sErr.message }, 500);
  if (!sessions?.length) return json({ lessons: 0 });

  // 2. …not reminded yet.
  const keys = sessions.map(s => `lesson:${s.id}`);
  const { data: done } = await db.from('push_reminders_sent').select('key').in('key', keys);
  const sent = new Set((done ?? []).map(r => r.key));
  const due = sessions.filter(s => !sent.has(`lesson:${s.id}`));
  if (!due.length) return json({ lessons: sessions.length, due: 0 });

  // 3. Who they are. A session's student_id is students.id (Quran) or
  //    arabic_students.id (Arabic); an Arabic portal registers its phone under
  //    the share token, so map that across.
  const ids = [...new Set(due.map(s => s.student_id))];
  const { quranById, arabicById, pushIdOf } = await loadStudents(db, ids);

  const pushIds = [...new Set(ids.map(pushIdOf).filter((x): x is string => !!x))];
  const { data: subsRaw } = pushIds.length
    ? await db.from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, student_id')
        .eq('recipient', 'student').in('student_id', pushIds)
    : { data: [] as Sub[] };
  const subsByPushId = new Map<string, Sub[]>();
  for (const s of (subsRaw ?? []) as Sub[]) {
    subsByPushId.set(s.student_id, [...(subsByPushId.get(s.student_id) ?? []), s]);
  }

  // Only students with a registered phone are worth the homework lookups.
  const reachable = dry && params.get('all') === '1'
    ? due                                     // preview everyone, phone or not
    : due.filter(s => (subsByPushId.get(pushIdOf(s.student_id) ?? '') ?? []).length > 0);

  // 4. Homework still open, per student.
  const since = iso(now - RECENT_DAYS * 86_400_000);
  const reachableIds = [...new Set(reachable.map(s => s.student_id))];
  const { homeworkFor, reportOf } = await loadOpenHomework(db, reachableIds, since, quranById, arabicById);

  // 5. Compose and send.
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!dry) {
    if (!publicKey || !privateKey) return json({ error: 'VAPID keys are not set' }, 500);
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@lisanquran.com', publicKey, privateKey);
  }

  const report: unknown[] = [];
  const gone: string[] = [];

  for (const s of reachable) {
    const pushId = pushIdOf(s.student_id)!;
    const subs = subsByPushId.get(pushId) ?? [];
    const isQuran = quranById.has(s.student_id);
    const minutes = Math.max(1, Math.round((Date.parse(s.start_at) - now) / 60_000));
    const { items, reciteId } = homeworkFor(s.student_id);

    const title = `Your ${isQuran ? 'Quran' : 'Arabic'} lesson starts in ${minutes} minutes`;
    const body = items.length
      ? `Homework not done yet: ${list(items)}. There's still time before your lesson!`
      : 'Get ready — tap to open your page.';
    const url = pushUrl({ isQuran, reciteId, reportId: reportOf.get(s.student_id), pushId });
    // Siblings in one family lesson share a tag, so a shared phone shows one.
    const tag = `lesson:${s.teacher_id}:${s.start_at}`;

    let delivered = 0;
    if (!dry) {
      const payload = JSON.stringify({ title, body, url, tag });
      await Promise.all(subs.map(async sub => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload, { TTL: 1200, urgency: 'high' },     // useless after the lesson starts
          );
          delivered++;
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) gone.push(sub.id);
        }
      }));
      await db.from('push_reminders_sent').upsert({ key: `lesson:${s.id}`, devices: delivered });
    }
    report.push({ lesson: s.id, student: s.student_id, minutes, devices: subs.length, delivered, title, body, url });
  }

  if (gone.length) await db.from('push_subscriptions').delete().in('id', gone);
  return json({ dry, lessons: sessions.length, due: due.length, reachable: reachable.length, removed: gone.length, sent: report });
});
