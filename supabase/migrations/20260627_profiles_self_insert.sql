-- 20260627_profiles_self_insert.sql
-- Fix: brand-new accounts (esp. Google OAuth, and student self-registration)
-- could not create their own profiles row — "new row violates row-level
-- security policy for table profiles" / 401. Existing tutors/admins already had
-- a row (created earlier), so they never hit this.
--
-- Allow an authenticated user to INSERT and UPDATE *their own* profile row
-- (id = auth.uid()). A user may set their role to 'teacher' or 'student' only —
-- never 'admin' — so self-service can't escalate privileges.

alter table public.profiles enable row level security;

-- INSERT own row (createTeacherProfile / markProfileAsStudent on first sign-in).
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (
    auth.uid() = id
    and (role is null or role in ('teacher', 'student'))
  );

-- UPDATE own row (markProfileAsStudent upsert → ON CONFLICT DO UPDATE; profile
-- name/bio edits). Scoped to the caller's own row only. No role check here so an
-- existing admin can still edit their own profile (their row's role is 'admin').
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
