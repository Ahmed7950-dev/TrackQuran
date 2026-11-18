-- ─── Quick match: each student's best score ─────────────────────────────────
-- The 60-second Arabic word game keeps one best score per student and per mode
-- (Arabic script or transliteration). Nothing else of a game is stored.
--
-- Closed table, like letters_hunter_homework: the student has no session, so
-- reading and saving go through two security-definer functions keyed by his
-- student id; the table itself is readable only by the tutor who owns him.

create table if not exists public.arabic_quick_match_best (
  student_id text not null,
  mode       text not null check (mode in ('arabic', 'translit')),
  best       integer not null default 0 check (best >= 0),
  games      integer not null default 0,
  best_at    timestamptz,
  updated_at timestamptz not null default now(),
  primary key (student_id, mode)
);

alter table public.arabic_quick_match_best enable row level security;

drop policy if exists arabic_quick_match_best_tutor on public.arabic_quick_match_best;
create policy arabic_quick_match_best_tutor on public.arabic_quick_match_best
  for select using (exists (
    select 1 from public.arabic_students s
    where s.id = arabic_quick_match_best.student_id and s.teacher_id = auth.uid()::text
  ));

-- Both modes' bests for one student.
create or replace function public.quick_match_best(p_student text)
returns table (mode text, best integer, games integer)
language sql security definer set search_path = public as $$
  select b.mode, b.best, b.games
  from public.arabic_quick_match_best b
  where b.student_id = p_student;
$$;

-- One finished game. Keeps the higher score and returns the best after it.
create or replace function public.save_quick_match_score(p_student text, p_mode text, p_score integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare result integer;
begin
  if p_mode not in ('arabic', 'translit') then raise exception 'bad mode'; end if;
  if p_score is null or p_score < 0 or p_score > 100000 then raise exception 'bad score'; end if;
  if not exists (select 1 from public.arabic_students where id = p_student) then
    raise exception 'unknown student';
  end if;
  insert into public.arabic_quick_match_best as b (student_id, mode, best, games, best_at, updated_at)
  values (p_student, p_mode, p_score, 1, now(), now())
  on conflict (student_id, mode) do update
    set games = b.games + 1,
        best_at = case when excluded.best > b.best then now() else b.best_at end,
        best = greatest(b.best, excluded.best),
        updated_at = now()
  returning b.best into result;
  return result;
end;
$$;

grant execute on function public.quick_match_best(text) to anon, authenticated;
grant execute on function public.save_quick_match_score(text, text, integer) to anon, authenticated;
