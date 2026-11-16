-- ─── Free Talk updates live on the other side ───────────────────────────────
-- Run in the Supabase SQL Editor (or `supabase db query --linked -f …`).
--
-- A verb or a word the tutor adds shows on the student's open page (and the
-- other way round) without a refresh. The page listens to row changes of
-- the student's verbs and word lists, so both tables join the realtime
-- publication. Safe to run twice.

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arabic_verbs') then
    alter publication supabase_realtime add table public.arabic_verbs;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vocabulary_lists') then
    alter publication supabase_realtime add table public.vocabulary_lists;
  end if;
end $$;
