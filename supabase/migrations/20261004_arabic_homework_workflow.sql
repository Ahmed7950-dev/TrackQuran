-- Unified Arabic homework. Existing vocabulary homework links stay valid.
alter table public.arabic_vocab_homework
  drop constraint if exists arabic_vocab_homework_status_check;
alter table public.arabic_vocab_homework
  add constraint arabic_vocab_homework_status_check
  check (status in ('draft','assigned','completed','missed','cancelled'));
alter table public.arabic_vocab_homework
  add column if not exists kind text not null default 'orbit'
    check (kind in ('orbit','flashcards','word_cards','lesson')),
  add column if not exists title text,
  add column if not exists lesson_id text,
  add column if not exists game_id uuid,
  add column if not exists progress jsonb,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists arabic_homework_lesson_unique
  on public.arabic_vocab_homework(student_id, lesson_id) where kind = 'lesson';
create unique index if not exists arabic_homework_game_unique
  on public.arabic_vocab_homework(game_id) where game_id is not null;

-- Keep earlier word-card assignments in the new history.
insert into public.arabic_vocab_homework
  (teacher_id,student_id,student_name,status,kind,title,game_id,words,created_at,assigned_at,completed_at,correct_count,total_count)
select teacher_id,student_id,student_name,
  case when status='completed' then 'completed' else 'assigned' end,
  'word_cards','Word cards',id,coalesce(words,'[]'::jsonb),created_at,created_at,completed_at,score,cardinality(letters)
from public.letter_cards_games where mode='solo' and kind='words'
on conflict do nothing;

-- Preserve homework from lessons that were already taught.
insert into public.arabic_vocab_homework
  (teacher_id,student_id,student_name,status,kind,title,lesson_id,assigned_at,completed_at)
select s.teacher_id,s.id,s.name,
  case when c.student_id is not null then 'completed' else 'assigned' end,
  'lesson',l.title,l.id,now(),c.completed_at
from public.arabic_students s
join public.arabic_lessons l on s.completed_lesson_ids ? l.id
left join public.arabic_homework_completions c on c.student_id=s.id and c.lesson_id=l.id
where exists (select 1 from public.homework_items i where i.lesson_id=l.id)
on conflict do nothing;

-- Publish answers immediately to strength subscribers (if not already added).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='arabic_vocab_reviews') then
    alter publication supabase_realtime add table public.arabic_vocab_reviews;
  end if;
end $$;

-- Idempotent answer writes when a student retries after losing connectivity.
alter table public.arabic_vocab_reviews add column if not exists answer_key text;
create unique index if not exists arabic_vocab_review_answer_unique
  on public.arabic_vocab_reviews(answer_key);

-- Answer + progress + strength are one transaction. A retry cannot count twice,
-- and another tab cannot overwrite a newer position or a cancelled assignment.
create or replace function public.answer_arabic_flashcard(
  homework_id uuid, word_id text, correct boolean, expected_index integer
) returns jsonb language plpgsql set search_path = public as $$
declare
  hw public.arabic_vocab_homework;
  answers jsonb;
  answer_count integer;
  finished boolean := false;
begin
  select * into hw from public.arabic_vocab_homework where id=homework_id for update;
  if not found or hw.kind <> 'flashcards' then raise exception 'Flashcard homework not found'; end if;
  answers := coalesce(hw.progress->'results', '[]'::jsonb);
  answer_count := jsonb_array_length(answers);
  if expected_index < answer_count then
    return jsonb_build_object('homework',to_jsonb(hw),'completed_now',false);
  end if;
  if hw.status <> 'assigned' or (hw.deadline is not null and hw.deadline < now()) then
    raise exception 'This homework is no longer open';
  end if;
  if expected_index <> answer_count or hw.words->expected_index->>'id' is distinct from word_id then
    raise exception 'Homework progress changed. Reopen the assignment to continue';
  end if;
  insert into public.arabic_vocab_reviews(student_id,word_id,correct,answer_key)
    values(hw.student_id,word_id,correct,homework_id::text || ':' || expected_index::text)
    on conflict (answer_key) do nothing;
  answers := answers || jsonb_build_array(jsonb_build_object('wordId',word_id,'correct',correct));
  finished := jsonb_array_length(answers)=jsonb_array_length(hw.words);
  update public.arabic_vocab_homework set
    progress=jsonb_build_object('results',answers), updated_at=now(),
    status=case when finished then 'completed' else status end,
    results=case when finished then answers else results end,
    correct_count=case when finished then (select count(*) from jsonb_array_elements(answers) a where (a->>'correct')::boolean) else correct_count end,
    total_count=case when finished then jsonb_array_length(answers) else total_count end,
    completed_at=case when finished then now() else completed_at end
  where id=homework_id returning * into hw;
  return jsonb_build_object('homework',to_jsonb(hw),'completed_now',finished);
end $$;
grant execute on function public.answer_arabic_flashcard(uuid,text,boolean,integer) to anon, authenticated;
