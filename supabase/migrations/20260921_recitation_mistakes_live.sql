-- The recording page (/recite/<id>) shows the mistakes the tutor has logged on
-- the homework's verses, LIVE — the same marks as the tutor's Quran page.
-- Link visitors cannot read `students` (RLS), so this returns just those
-- mistakes to whoever holds the homework id (the link's own credential).
-- Turkish-script keys (T…) are left out: the recording page shows Uthmani text.
create or replace function public.recitation_mistakes(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from quran_recitation_homework h
  join students s on s.id = h.student_id
  cross join lateral jsonb_each(
    case when jsonb_typeof(s.mistakes) = 'object' then s.mistakes else '{}'::jsonb end
  ) e
  where h.id = p_id
    and e.key ~ '^[0-9]+:[0-9]+(:[0-9]+){1,2}$'
    and case
      when coalesce(array_length(h.verses, 1), 0) > 0
        then (split_part(e.key, ':', 1) || ':' || split_part(e.key, ':', 2)) = any (h.verses)
      else (split_part(e.key, ':', 1)::int, split_part(e.key, ':', 2)::int) >= (h.start_surah, h.start_ayah)
       and (split_part(e.key, ':', 1)::int, split_part(e.key, ':', 2)::int) <= (h.end_surah, h.end_ayah)
    end
$$;

revoke all on function public.recitation_mistakes(uuid) from public;
grant execute on function public.recitation_mistakes(uuid) to anon, authenticated;
