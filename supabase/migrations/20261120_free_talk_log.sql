-- ─── Free Talk marks the calendar ───────────────────────────────────────────
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- A day the STUDENT adds or edits a verb, or adds a word, in Free Talk shows
-- in their Arabic calendar as attended, with a "Free Talk" chip. What the
-- tutor does there is not logged (that is in a lesson, already logged).
--
-- The student's page has no sign-in, so rows are written only by functions
-- that take the student's link token: student_save_verb (re-created below,
-- unchanged apart from the log line) and student_log_free_talk_word.
-- Nobody can write the table directly. Safe to run twice.

create table if not exists public.arabic_free_talk_logs (
  id          uuid primary key default gen_random_uuid(),
  student_id  text not null,
  kind        text not null check (kind in ('verb_added', 'verb_edited', 'word_added')),
  label       text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists arabic_free_talk_logs_student_idx
  on public.arabic_free_talk_logs (student_id, created_at);

alter table public.arabic_free_talk_logs enable row level security;
drop policy if exists arabic_free_talk_logs_read on public.arabic_free_talk_logs;
create policy arabic_free_talk_logs_read on public.arabic_free_talk_logs
  for select to anon, authenticated using (true);

-- The student saves a verb: as before, plus one log line.
create or replace function public.student_save_verb(
  p_token text, p_id uuid, p_variety text, p_meaning text, p_conjugations jsonb
) returns public.arabic_verbs
language plpgsql security definer set search_path = public as $$
declare
  s_id text; s_teacher text; v public.arabic_verbs;
begin
  select id::text, teacher_id::text into s_id, s_teacher
    from public.arabic_students where share_token::text = p_token;
  if s_id is null then raise exception 'This student link is not valid.'; end if;
  if p_variety not in ('levantine', 'msa') then raise exception 'Unknown variety.'; end if;
  if coalesce(btrim(p_meaning), '') = '' then raise exception 'Write the meaning first.'; end if;
  if pg_column_size(p_conjugations) > 60000 then raise exception 'This verb is too large.'; end if;

  if p_id is null then
    insert into public.arabic_verbs (teacher_id, student_id, variety, meaning, conjugations)
    values (s_teacher, s_id, p_variety, btrim(p_meaning), coalesce(p_conjugations, '{}'::jsonb))
    returning * into v;
  else
    update public.arabic_verbs
       set variety = p_variety, meaning = btrim(p_meaning),
           conjugations = coalesce(p_conjugations, '{}'::jsonb), updated_at = now()
     where id = p_id and student_id = s_id
    returning * into v;
    if v.id is null then raise exception 'That verb is not on this page.'; end if;
  end if;

  insert into public.arabic_free_talk_logs (student_id, kind, label)
  values (s_id, case when p_id is null then 'verb_added' else 'verb_edited' end, left(btrim(p_meaning), 80));
  return v;
end $$;

-- The student added a word to their Free Talk word list.
create or replace function public.student_log_free_talk_word(p_token text, p_label text)
returns void
language plpgsql security definer set search_path = public as $$
declare s_id text;
begin
  select id::text into s_id from public.arabic_students where share_token::text = p_token;
  if s_id is null then raise exception 'This student link is not valid.'; end if;
  -- a calendar mark, not a counter: a day holds at most 300 lines per student
  if (select count(*) from public.arabic_free_talk_logs
       where student_id = s_id and created_at > now() - interval '1 day') >= 300 then
    return;
  end if;
  insert into public.arabic_free_talk_logs (student_id, kind, label)
  values (s_id, 'word_added', left(coalesce(btrim(p_label), ''), 80));
end $$;

revoke all on function public.student_log_free_talk_word(text, text) from public;
grant execute on function public.student_log_free_talk_word(text, text) to anon, authenticated;
grant execute on function public.student_save_verb(text, uuid, text, text, jsonb) to anon, authenticated;
