-- Which side of a word the STUDENT holds: the meaning (default) or the Arabic.
-- The tutor always holds the other one.
alter table public.letter_cards_games
  add column if not exists words_side text not null default 'english';
alter table public.letter_cards_games drop constraint if exists letter_cards_games_words_side_check;
alter table public.letter_cards_games
  add constraint letter_cards_games_words_side_check check (words_side in ('english', 'arabic'));
