-- The daily homework nudge. Runs every hour; the function itself only writes to
-- students whose LOCAL clock has just reached 17:00, so everyone gets it at the
-- same time of their own day, once (push_reminders_sent keyed by local date).
select cron.schedule(
  'homework-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://byybcaaglxgoeotnfpou.supabase.co/functions/v1/homework-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lesson_reminders_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
