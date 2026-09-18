-- Portal students have no auth session (their link is the credential), so the
-- anon role needs to manage its own push subscription rows, the same pattern
-- the other portal-writable tables use.
drop policy if exists "push subs anon" on push_subscriptions;
create policy "push subs anon" on push_subscriptions
  for all to anon using (true) with check (true);
