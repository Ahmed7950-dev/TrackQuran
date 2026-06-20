-- ============================================================
-- Fix: student self-login did not return assigned Quran homework.
--
-- find_student_by_name_and_dob() builds the student_data JSON that the student
-- portal casts directly to the camelCase `Student` type. It was missing the
-- `quranHomework` field, so a logged-in student never saw homework the teacher
-- assigned (teacher side already persists it to students.quran_homework via
-- saveStudent). This recreates the function with camelCase keys matching the
-- frontend `Student` interface and adds quranHomework.
-- ============================================================

create or replace function public.find_student_by_name_and_dob(
  p_first_name text,
  p_last_name  text,
  p_dob        text
)
returns table (
  student_data jsonb,
  teacher_id   uuid
)
language sql
security definer
stable
as $$
  select
    jsonb_build_object(
      'id',                        s.id,
      'name',                      s.name,
      'dob',                       s.dob,
      'recitationAchievements',    s.recitation_achievements,
      'memorizationAchievements',  s.memorization_achievements,
      'attendance',                s.attendance,
      'masteredTajweedRules',      to_jsonb(s.mastered_tajweed_rules),
      'tafsirReviews',             s.tafsir_reviews,
      'tafsirMemorizationReviews', s.tafsir_memorization_reviews,
      'mistakes',                  s.mistakes,
      'quranHomework',             coalesce(s.quran_homework, '[]'::jsonb)
    ) as student_data,
    s.teacher_id
  from public.students s
  where lower(s.name) = lower(trim(p_first_name) || ' ' || trim(p_last_name))
    and s.dob = p_dob
  limit 1;
$$;
