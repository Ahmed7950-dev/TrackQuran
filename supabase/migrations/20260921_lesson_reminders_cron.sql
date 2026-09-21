-- Every minute: ask lesson-reminders to push the lessons ~20 minutes out.
-- The x-cron-secret is read from Vault at run time, never stored in the job.
select cron.unschedule('lesson-reminders') where exists (select 1 from cron.job where jobname = 'lesson-reminders');
select cron.schedule(
  'lesson-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://byybcaaglxgoeotnfpou.supabase.co/functions/v1/lesson-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lesson_reminders_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
