-- Tadabbur: a verse can show the reflections other students of the SAME tutor
-- wrote on it (read-only). Security definer so the student portal (anon) can
-- ask without being able to read the roster or another tutor's students —
-- an unknown student id matches no teacher and returns nothing.
create or replace function public.shared_verse_notes(p_student_id text, p_surah int)
returns table (student_id text, student_name text, ayah int, note_text text, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select n.student_id, s.name, n.ayah, n.note_text, n.updated_at
  from public.quran_verse_notes n
  join public.students s on s.id = n.student_id
  where n.surah = p_surah
    and n.student_id <> p_student_id
    and s.teacher_id = (select teacher_id from public.students where id = p_student_id)
  order by s.name, n.ayah;
$$;

revoke all on function public.shared_verse_notes(text, int) from public;
grant execute on function public.shared_verse_notes(text, int) to anon, authenticated;
