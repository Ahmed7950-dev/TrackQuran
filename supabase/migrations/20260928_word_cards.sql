-- ─── The card game, played with words ────────────────────────────────────────
-- Same table, same rules: the pile in `letters` holds the keys of the cards. For
-- a letters game those keys ARE the letters; for a vocabulary game they are the
-- word ids, and `words` carries what each card says — the tutor throws the
-- Arabic, the student answers with its meaning. `form` only means something to
-- a letters game, so it may now be null.
alter table public.letter_cards_games
  add column if not exists kind text not null default 'letters',
  add column if not exists words jsonb;
alter table public.letter_cards_games alter column form drop not null;
alter table public.letter_cards_games drop constraint if exists letter_cards_games_kind_check;
alter table public.letter_cards_games
  add constraint letter_cards_games_kind_check check (kind in ('letters', 'words'));
