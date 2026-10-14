-- ─── Letters Hunter, set as homework ─────────────────────────────────────────
-- The same hunt the tutor runs in the lesson, sent home. Only the rounds that
-- need nobody listening go: spot the letter, sound discrimination, and write.
-- The first two mark themselves; the drawings wait for the tutor.
--
-- Unlike the practice tables written before it, this one is NOT anon-readable.
-- The student has no session, so his three ways in are security-definer
-- functions keyed by id or by his student id, and the table itself is closed to
-- everyone but the tutor who set the work. Same ergonomics, no open table.
--
-- Drawings are STROKES, not images: a letter is a few hundred numbers where a
-- picture of it is a couple of hundred kilobytes, and storage on this project
-- is nearly full. It also lets the tutor draw ON a drawing when marking,
-- keeping his ink and the student's apart.

create table if not exists public.letters_hunter_homework (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   text not null,
  student_id   text not null,
  student_name text,
  letters      text[] not null,
  -- {"spot":{"on":true,"rounds":5},"sounds":{...},"write":{...}}
  plan         jsonb not null,
  due_at       timestamptz,                      -- null = no deadline
  status       text not null default 'assigned'
               check (status in ('assigned', 'submitted', 'marked')),
  -- what the app marked by itself (rounds 1 and 2)
  auto_right   integer,
  auto_total   integer,
  auto_detail  jsonb,                            -- [{"id":"spot","right":4,"rounds":5}]
  -- [{"letter":"ز","strokes":[…],"tutorStrokes":[…],"verdict":"right"}]
  drawings     jsonb,
  reminded_at  timestamptz,                      -- the nudge before the deadline
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  marked_at    timestamptz
);

create index if not exists letters_hunter_homework_student_idx
  on public.letters_hunter_homework (student_id, created_at desc);
create index if not exists letters_hunter_homework_teacher_idx
  on public.letters_hunter_homework (teacher_id, created_at desc);

alter table public.letters_hunter_homework enable row level security;

-- The tutor who set it, and nobody else.
drop policy if exists letters_hunter_homework_owner on public.letters_hunter_homework;
create policy letters_hunter_homework_owner on public.letters_hunter_homework
  for all using (teacher_id = auth.uid()::text) with check (teacher_id = auth.uid()::text);

-- ── The student's three ways in ──────────────────────────────────────────────

-- His homework list, for the portal's homework tab.
create or replace function public.list_hunter_homework(p_student text)
returns setof public.letters_hunter_homework
language sql security definer set search_path = public as $$
  select * from public.letters_hunter_homework
  where student_id = p_student
  order by created_at desc
  limit 50;
$$;

-- One piece of it, for the link.
create or replace function public.get_hunter_homework(p_id uuid)
returns setof public.letters_hunter_homework
language sql security definer set search_path = public as $$
  select * from public.letters_hunter_homework where id = p_id;
$$;

-- Handing it in. Only from 'assigned', so a second pass cannot overwrite the
-- work the tutor is already marking.
create or replace function public.submit_hunter_homework(
  p_id uuid, p_right integer, p_total integer, p_detail jsonb, p_drawings jsonb
) returns boolean
language plpgsql security definer set search_path = public as $$
declare hit int;
begin
  update public.letters_hunter_homework
     set status = 'submitted',
         auto_right = p_right,
         auto_total = p_total,
         auto_detail = p_detail,
         drawings = p_drawings,
         submitted_at = now()
   where id = p_id and status = 'assigned';
  get diagnostics hit = row_count;
  return hit > 0;
end;
$$;

grant execute on function public.list_hunter_homework(text) to anon, authenticated;
grant execute on function public.get_hunter_homework(uuid) to anon, authenticated;
grant execute on function public.submit_hunter_homework(uuid, integer, integer, jsonb, jsonb) to anon, authenticated;
