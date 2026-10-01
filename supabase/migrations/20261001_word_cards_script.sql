-- How the word half of a card is written: in Arabic script, or transliterated.
-- The pairing is unchanged — a word against its meaning — only the spelling of
-- the word side differs, for a student who cannot read the script yet.
alter table public.letter_cards_games
  add column if not exists words_script text not null default 'arabic';
alter table public.letter_cards_games drop constraint if exists letter_cards_games_words_script_check;
alter table public.letter_cards_games
  add constraint letter_cards_games_words_script_check check (words_script in ('arabic', 'translit'));
