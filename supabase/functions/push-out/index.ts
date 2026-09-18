/**
 * Supabase Edge Function: push-out
 *
 * Sends one web push to every device a recipient has registered.
 * Called right after a notification row is written (see notificationService).
 *
 * Body: { recipient: 'tutor' | 'student', teacherId, studentId?, title, body, url?, tag? }
 *
 * Required secrets:
 *   supabase secrets set VAPID_PUBLIC_KEY=<public>
 *   supabase secrets set VAPID_PRIVATE_KEY=<private>
 *   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@lisanquran.com';
  if (!publicKey || !privateKey) return json({ error: 'VAPID keys are not set' }, 500);

  let input: Record<string, any>;
  try {
    input = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { recipient, teacherId, studentId, title, body, url, tag } = input ?? {};
  if (!recipient || !teacherId || !title) return json({ error: 'recipient, teacherId and title are required' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // A signed-in tutor may send themselves a test push; everyone else must be
  // backed by a real notification row (below).
  let verified = false;
  if (input.test) {
    const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '') ?? '';
    const { data: who } = await supabase.auth.getUser(token);
    verified = !!who?.user && who.user.id === teacherId;
    if (!verified) return json({ error: 'sign in to send a test push' }, 403);
  }

  // This endpoint takes no JWT (portal students have no session), so tie every
  // push to a notification row written in the last two minutes. Without that
  // anyone knowing a teacher id could push arbitrary text to their phone.
  const since = new Date(Date.now() - 120_000).toISOString();
  const { data: backing } = verified ? { data: null } : await supabase
    .from('booking_notifications')
    .select('id')
    .eq('recipient', recipient)
    .eq('teacher_id', teacherId)
    .eq('title', title)
    .gte('created_at', since)
    .limit(1);
  if (!verified && !backing?.length) return json({ error: 'no matching notification', sent: 0 }, 403);

  let query = supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('recipient', recipient)
    .eq('teacher_id', teacherId);
  if (recipient === 'student') query = query.eq('student_id', studentId ?? '');

  const { data: subs, error } = await query;
  if (error) return json({ error: error.message }, 500);
  if (!subs?.length) return json({ sent: 0, note: 'no devices registered' });

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/', tag });
  let sent = 0;
  const gone: string[] = [];

  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600, urgency: 'high' },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode;
      // 404/410 — the browser threw this subscription away; stop keeping it.
      if (status === 404 || status === 410) gone.push(sub.id);
      else {
        await supabase.from('push_subscriptions')
          .update({ last_error: `${status ?? ''} ${(e as Error)?.message ?? ''}`.trim() })
          .eq('id', sub.id);
      }
    }
  }));

  if (gone.length) await supabase.from('push_subscriptions').delete().in('id', gone);

  return json({ sent, removed: gone.length, devices: subs.length });
});
