-- Recitation homework comes in two kinds.
--   reading : the student hears the verse and records it, one verse at a time
--   hifz    : the verses are hidden (only their first word shows) and the
--             student recites the whole range in ONE recording, from memory.
-- The single hifz take lives in `recordings` under the reserved key 'all'.
alter table public.quran_recitation_homework
  add column if not exists kind text not null default 'reading';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quran_recitation_homework_kind_check'
  ) then
    alter table public.quran_recitation_homework
      add constraint quran_recitation_homework_kind_check
      check (kind in ('reading', 'hifz'));
  end if;
end $$;
