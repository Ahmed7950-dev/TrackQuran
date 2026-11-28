-- The site is one school now: students sign up on their own, tutors APPLY.
--
-- 1. tutor_applications: what a tutor tells us when applying at /teach.
--    One row per account; the applicant reads and edits their own, the admin
--    reads them all.
-- 2. guard_profile_privileges: a signed-in user could, until now, update their
--    own profiles row freely (the RLS update policy checks only the row id),
--    so a waiting applicant could set approved = true, or role = 'admin', on
--    themselves. Only the admin may change those two columns now. The one
--    change a non-admin keeps is the /join wizard turning a brand-new,
--    never-approved account into a student.
-- 3. admin_list_people / admin_list_student_signups: the admin panel lists
--    tutors and student sign-ups with their e-mail address, which lives in
--    auth.users where the browser cannot read it.

-- ── 1. Tutor applications ────────────────────────────────────────────────────
create table if not exists public.tutor_applications (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null,
  email            text,
  phone            text,
  country          text,
  gender           text check (gender in ('male', 'female')),
  native_language  text,
  english_level    text check (english_level in ('basic', 'good', 'fluent', 'native')),
  years_teaching   integer check (years_teaching between 0 and 80),
  ijazah           text,
  teaches_kids     boolean not null default false,
  about            text,
  sample_url       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.tutor_applications enable row level security;

drop policy if exists "applicant reads own application" on public.tutor_applications;
create policy "applicant reads own application" on public.tutor_applications
  for select using (user_id = auth.uid() or public.get_my_role() = 'admin');

drop policy if exists "applicant writes own application" on public.tutor_applications;
create policy "applicant writes own application" on public.tutor_applications
  for insert with check (user_id = auth.uid());

drop policy if exists "applicant updates own application" on public.tutor_applications;
create policy "applicant updates own application" on public.tutor_applications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "admin deletes applications" on public.tutor_applications;
create policy "admin deletes applications" on public.tutor_applications
  for delete using (user_id = auth.uid() or public.get_my_role() = 'admin');

revoke all on public.tutor_applications from anon;

-- ── 2. Only the admin hands out access ───────────────────────────────────────
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
begin
  -- No signed-in user: the sign-up trigger (handle_new_user), the SQL editor,
  -- the service key. RLS already keeps the anonymous browser out.
  if auth.uid() is null then
    return new;
  end if;

  select role into caller_role from public.profiles where id = auth.uid();
  if caller_role = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.approved := false;
    if new.role is null or new.role not in ('teacher', 'student') then
      new.role := 'teacher';
    end if;
    return new;
  end if;

  -- UPDATE by anyone but the admin
  new.approved := old.approved;
  if new.role is distinct from old.role then
    if not (old.role = 'teacher' and old.approved = false and new.role = 'student') then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ── 3. Admin lists (with e-mail) ─────────────────────────────────────────────
create or replace function public.admin_list_people()
returns table (
  id uuid, name text, role text, approved boolean, created_at timestamptz,
  email text, last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.name, p.role, p.approved, p.created_at,
         u.email::text, u.last_sign_in_at
  from public.profiles p
  left join auth.users u on u.id = p.id
  where public.get_my_role() = 'admin'
  order by p.created_at;
$$;

create or replace function public.admin_list_student_signups()
returns table (
  student_id text, subject text, name text, approval_status text,
  created_at timestamptz, auth_user_id uuid, email text,
  teacher_id text, teacher_name text
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.id::text, 'quran', s.name, s.approval_status, s.created_at,
         s.auth_user_id, u.email::text, s.teacher_id::text, t.name
  from public.students s
  left join auth.users u on u.id = s.auth_user_id
  left join public.profiles t on t.id = s.teacher_id
  where s.auth_user_id is not null and public.get_my_role() = 'admin'
  union all
  select a.id::text, 'arabic', a.name, a.approval_status, a.created_at,
         a.auth_user_id, u.email::text, a.teacher_id, t.name
  from public.arabic_students a
  left join auth.users u on u.id = a.auth_user_id
  left join public.profiles t on t.id::text = a.teacher_id
  where a.auth_user_id is not null and public.get_my_role() = 'admin'
  order by 5 desc;
$$;

revoke all on function public.admin_list_people() from public, anon;
revoke all on function public.admin_list_student_signups() from public, anon;
grant execute on function public.admin_list_people() to authenticated;
grant execute on function public.admin_list_student_signups() to authenticated;
