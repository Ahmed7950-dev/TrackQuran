-- Marking a mistake used to rewrite the WHOLE student row, mistakes map and
-- all. Any writer holding an older copy of that student — the same tutor with
-- the app open in another tab or on another device — then wrote its copy back
-- and the newest marks were gone, with nothing shown to say so.
--
-- This merges instead: the patch is applied to whatever the row holds NOW, and
-- the named keys are removed. Nothing else on the row is touched, so two
-- windows can mark different pages without undoing each other.
create or replace function public.merge_student_mistakes(
  p_student_id text,
  p_patch      jsonb   default '{}'::jsonb,
  p_remove     text[]  default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mistakes jsonb;
begin
  update students s
     set mistakes = (
           coalesce(case when jsonb_typeof(s.mistakes) = 'object' then s.mistakes end, '{}'::jsonb)
           || coalesce(p_patch, '{}'::jsonb)
         ) - coalesce(p_remove, '{}'::text[])
   where s.id = p_student_id
     and s.teacher_id = auth.uid()
  returning s.mistakes into v_mistakes;

  if not found then
    raise exception 'no student % for this teacher', p_student_id
      using errcode = 'no_data_found';
  end if;
  return v_mistakes;
end;
$$;

revoke all on function public.merge_student_mistakes(text, jsonb, text[]) from public;
grant execute on function public.merge_student_mistakes(text, jsonb, text[]) to authenticated;
