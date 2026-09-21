-- pg_cron logs every run in cron.job_run_details and never deletes them; the
-- every-minute lesson-reminders job adds ~1,440 rows a day. Keep a week.
select cron.unschedule('cron-log-cleanup') where exists (select 1 from cron.job where jobname = 'cron-log-cleanup');
select cron.schedule(
  'cron-log-cleanup',
  '17 3 * * 0',          -- Sundays 03:17 UTC
  $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$
);
