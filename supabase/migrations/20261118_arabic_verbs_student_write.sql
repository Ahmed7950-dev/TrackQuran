-- ─── Students can add, edit and delete their own verbs ──────────────────────
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- The student's page has no sign-in: it is opened by the student's link
-- (arabic_students.share_token). So instead of opening the table to anyone,
-- the student writes through two functions that take that link token and
-- only ever touch verbs of the student it belongs to. The tutor keeps writing
-- straight to the table (policy arabic_verbs_write, auth.uid()).

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
  return v;
end $$;

create or replace function public.student_delete_verb(p_token text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s_id text;
begin
  select id::text into s_id from public.arabic_students where share_token::text = p_token;
  if s_id is null then raise exception 'This student link is not valid.'; end if;
  delete from public.arabic_verbs where id = p_id and student_id = s_id;
  if not found then raise exception 'That verb is not on this page.'; end if;
end $$;

revoke all on function public.student_save_verb(text, uuid, text, text, jsonb) from public;
revoke all on function public.student_delete_verb(text, uuid) from public;
grant execute on function public.student_save_verb(text, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.student_delete_verb(text, uuid) to anon, authenticated;
