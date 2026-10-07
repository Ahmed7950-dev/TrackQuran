-- New teachers wait for the admin to let them in.
--
-- Signing up has been open and ungated: anyone who found the site got a working
-- teacher account the moment they registered, which is how two strangers ended
-- up in the teacher list. Signing up stays open — the account is just inert
-- until it is approved.
alter table public.profiles
  add column if not exists approved boolean not null default false;

comment on column public.profiles.approved is
  'A teacher may use the app only once an admin approves them. Admins and students are unaffected.';

-- Everyone already here keeps working: this is a gate on new arrivals, not a
-- lockout of the people who have been using it for months.
update public.profiles set approved = true where approved = false;
