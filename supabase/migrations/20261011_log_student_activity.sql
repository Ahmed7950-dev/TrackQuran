-- Appending to the logbook without carrying a copy of the rest of the row.
--
-- Activity logs live in students.attendance (jsonb). Writing one used to mean a
-- whole-row save, which is the same hazard that lost a student's marked
-- mistakes: a second window holding an older copy of the row writes its copy
-- back and the newest entries are gone. This appends server side instead —
-- nothing but the attendance array is touched.
--
-- It is also the only way the STUDENT side can log at all. A student writing a
-- tadabbur reflection on their portal link is anonymous: it cannot save a
-- student row, but it can call this.
--
-- Deliberately narrow, because anon may call it: it can only APPEND an
-- attendance record, only of a known activity kind, and only one per student
-- per kind+source per day. It cannot read, edit or remove anything.
create or replace function public.log_student_activity(
  p_student_id text,
  p_kind       text,
  p_title      text,
  p_detail     text default null,
  p_source_id  text default null,
  -- The writer's own noon-stamped day, so the entry lands on the day they are
  -- actually having rather than on UTC's.
  p_when       timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance jsonb;
  v_day        date := (p_when at time zone 'UTC')::date;
  v_record     jsonb;
begin
  if p_kind not in (
    'fluency', 'tajweed', 'letters', 'letters-tajweed', 'game',
    'tajweed-exercise', 'qaedah', 'tadabbur', 'letter-cards'
  ) then
    raise exception 'unknown activity kind %', p_kind using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'activity needs a title' using errcode = 'check_violation';
  end if;

  select coalesce(case when jsonb_typeof(s.attendance) = 'array' then s.attendance end, '[]'::jsonb)
    into v_attendance
    from students s
   where s.id = p_student_id
     for update;

  if not found then
    raise exception 'no student %', p_student_id using errcode = 'no_data_found';
  end if;

  -- Already logged today? Same rule as the client: kind + sourceId when there
  -- is one, kind + title when there is not.
  if exists (
    select 1
      from jsonb_array_elements(v_attendance) a
     where a -> 'activity' ->> 'kind' = p_kind
       and ((p_source_id is not null and a -> 'activity' ->> 'sourceId' = p_source_id)
            or (p_source_id is null and a -> 'activity' ->> 'title' = p_title))
       and ((a ->> 'date')::timestamptz at time zone 'UTC')::date = v_day
  ) then
    return false;
  end if;

  v_record := jsonb_strip_nulls(jsonb_build_object(
    'id',     'act-' || p_kind || '-' || floor(extract(epoch from now()) * 1000)::bigint
                      || '-' || substr(md5(random()::text), 1, 5),
    'date',   to_jsonb(p_when),
    'status', 'PRESENT',
    'activity', jsonb_strip_nulls(jsonb_build_object(
      'kind',     p_kind,
      'title',    left(btrim(p_title), 200),
      'detail',   left(nullif(btrim(coalesce(p_detail, '')), ''), 200),
      'sourceId', p_source_id
    ))
  ));

  update students s set attendance = v_attendance || jsonb_build_array(v_record)
   where s.id = p_student_id;

  return true;
end;
$$;

revoke all on function public.log_student_activity(text, text, text, text, text, timestamptz) from public;
grant execute on function public.log_student_activity(text, text, text, text, text, timestamptz) to anon, authenticated;
