-- ─── The Free Talk board, shared by tutor and student ──────────────────────
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- One board per student. Both sides type on it; the page sends every change
-- live to the other side over a realtime broadcast channel, and saves the
-- text here (a moment after typing stops) so it is there next time.
--
-- Read by anyone (like the verbs). Written only through save_free_talk_board:
-- the tutor (signed in, the student's teacher) or the student (their link
-- token). Safe to run twice.

create table if not exists public.arabic_free_talk_boards (
  student_id  text primary key,
  body        text not null default '',
  updated_by  text not null default 'tutor' check (updated_by in ('tutor', 'student')),
  updated_at  timestamptz not null default now()
);

alter table public.arabic_free_talk_boards enable row level security;
drop policy if exists arabic_free_talk_boards_read on public.arabic_free_talk_boards;
create policy arabic_free_talk_boards_read on public.arabic_free_talk_boards
  for select to anon, authenticated using (true);

create or replace function public.save_free_talk_board(p_student_id text, p_token text, p_body text)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare ok boolean; who text;
begin
  if length(coalesce(p_body, '')) > 20000 then raise exception 'The board is too long.'; end if;
  if p_token is not null then
    select true into ok from public.arabic_students
     where id = p_student_id and share_token::text = p_token;
    if ok is null then raise exception 'This student link is not valid.'; end if;
    who := 'student';
  else
    select true into ok from public.arabic_students
     where id = p_student_id and teacher_id = auth.uid()::text;
    if ok is null then raise exception 'This is not your student.'; end if;
    who := 'tutor';
  end if;
  insert into public.arabic_free_talk_boards (student_id, body, updated_by, updated_at)
  values (p_student_id, coalesce(p_body, ''), who, now())
  on conflict (student_id) do update
    set body = excluded.body, updated_by = excluded.updated_by, updated_at = now();
  return now();
end $$;

revoke all on function public.save_free_talk_board(text, text, text) from public;
grant execute on function public.save_free_talk_board(text, text, text) to anon, authenticated;
