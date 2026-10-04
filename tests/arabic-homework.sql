-- Run after the workflow migration, inside a rolled-back transaction.
do $$
declare
  test_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  response jsonb;
  review_count integer;
  rejected boolean;
begin
  insert into public.arabic_vocab_homework(id,teacher_id,student_id,status,kind,words)
    values(test_id,'homework-test','homework-test','assigned','flashcards',
      '[{"id":"one","arabic":"واحد","english":"one"},{"id":"two","arabic":"اثنان","english":"two"}]');
  response := public.answer_arabic_flashcard(test_id,'one',true,0);
  assert response->'homework'->>'status'='assigned', 'First answer must not complete the deck';
  assert jsonb_array_length(response->'homework'->'progress'->'results')=1, 'Resume position must be one';
  response := public.answer_arabic_flashcard(test_id,'one',true,0);
  select count(*) into review_count from public.arabic_vocab_reviews where answer_key=test_id::text || ':0';
  assert review_count=1, 'Retry must not duplicate strength';
  rejected := false;
  begin perform public.answer_arabic_flashcard(test_id,'wrong-word',false,1);
  exception when others then rejected := true; end;
  assert rejected, 'A word outside the assigned deck must be rejected';
  response := public.answer_arabic_flashcard(test_id,'two',false,1);
  assert response->'homework'->>'status'='completed', 'Final answer completes homework';
  assert (response->'homework'->>'correct_count')::integer=1, 'Right and wrong answers must be scored';
  assert (response->>'completed_now')::boolean, 'Completion should be notified once';
  response := public.answer_arabic_flashcard(test_id,'two',false,1);
  assert not (response->>'completed_now')::boolean, 'Duplicate finish must not notify again';
  select count(*) into review_count from public.arabic_vocab_reviews where student_id='homework-test' and not correct;
  assert review_count=1, 'Wrong answer must appear in strength immediately';

  insert into public.arabic_vocab_homework(id,teacher_id,student_id,status,kind,words,deadline)
    values(second_id,'homework-test','homework-test','assigned','flashcards',
      '[{"id":"one","arabic":"واحد","english":"one"}]', now()-interval '1 minute');
  rejected := false;
  begin perform public.answer_arabic_flashcard(second_id,'one',true,0);
  exception when others then rejected := true; end;
  assert rejected, 'Expired homework must not accept answers';
  update public.arabic_vocab_homework set deadline=null,status='cancelled' where id=second_id;
  rejected := false;
  begin perform public.answer_arabic_flashcard(second_id,'one',true,0);
  exception when others then rejected := true; end;
  assert rejected, 'Cancelled homework must not accept answers';
  update public.arabic_vocab_homework set status='assigned' where id=second_id;
  response := public.answer_arabic_flashcard(second_id,'one',true,0);
  assert response->'homework'->>'status'='completed', 'Open-ended homework must be playable';
end $$;
