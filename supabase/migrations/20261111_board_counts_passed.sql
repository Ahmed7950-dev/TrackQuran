-- ─── The board counts homework FINISHED, not homework handed in ──────────────
-- A recitation homework the tutor sends back is not done. The student records
-- the wrong verses again, which is a NEW row (`parent_id` → the one it came
-- from), so counting hand-ins gave him two points for one piece of homework —
-- and gave the point to a homework that was never right.
--
-- The point now lands when the tutor presses Passed, once per CHAIN: the row
-- is keyed on the FIRST homework of it, so however many times it goes back and
-- forth, it is one homework and one point. A chain still being revised counts
-- for nothing until it is finally right.
--
-- `closeFollowUps` passes the leftovers of a chain in one go, so several links
-- can be passed within a second of each other — all of them resolve to the
-- same root and `do nothing` keeps the first, with the time it was first
-- passed. (`log_homework_submission` is untouched: the letter hunts still
-- count on hand-in, having nothing to send back.)

create or replace function public.log_recitation_pass(p_rec uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_root  uuid;
  v_t     text;
  v_s     text;
  v_n     text;
  v_items integer;
begin
  if p_rec is null then return; end if;

  -- Up the chain to the homework it all started as.
  with recursive up as (
    select id, parent_id from public.quran_recitation_homework where id = p_rec
    union all
    select r.id, r.parent_id
      from public.quran_recitation_homework r
      join up on r.id = up.parent_id
  )
  select id into v_root from up where parent_id is null limit 1;
  v_root := coalesce(v_root, p_rec);

  select teacher_id, student_id, student_name,
         (select count(*) from jsonb_object_keys(coalesce(recordings, '{}'::jsonb)))
    into v_t, v_s, v_n, v_items
    from public.quran_recitation_homework where id = v_root;
  if v_t is null then return; end if;

  insert into public.homework_handins (teacher_id, student_id, student_name, kind, ref, items)
  values (v_t, v_s, v_n, 'recitation', v_root::text, v_items)
  on conflict (kind, ref) where ref is not null do nothing;
end;
$$;

grant execute on function public.log_recitation_pass(uuid) to anon, authenticated;

-- ── Rebuild the recitation side of the board on the new rule ────────────────
-- Everything logged so far was one row per hand-in. Replace it with one row
-- per chain that reached `passed`, dated when it first did.

delete from public.homework_handins where kind = 'recitation';

with recursive chain as (
  select r.id, r.id as root, r.status, r.reviewed_at, r.submitted_at
    from public.quran_recitation_homework r
   where r.parent_id is null
  union all
  select r.id, c.root, r.status, r.reviewed_at, r.submitted_at
    from public.quran_recitation_homework r
    join chain c on r.parent_id = c.id
),
done as (
  select root, min(coalesce(reviewed_at, submitted_at)) as at
    from chain
   where status = 'passed' and coalesce(reviewed_at, submitted_at) is not null
   group by root
)
insert into public.homework_handins (teacher_id, student_id, student_name, kind, ref, items, sent_at)
select h.teacher_id, h.student_id, h.student_name, 'recitation', h.id::text,
       (select count(*) from jsonb_object_keys(coalesce(h.recordings, '{}'::jsonb))),
       d.at
  from done d
  join public.quran_recitation_homework h on h.id = d.root
on conflict do nothing;
