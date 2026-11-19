# Backgrounds for the Arabic game and challenge tiles

One file per tile, dropped in here. A tile with no file keeps its plain tinted
look — icon, name and hint — so the pictures can arrive one at a time.

    aspect ratio   4 : 1   (the tile is exactly 4:1 at every screen size)
    master size    1280 × 320 px
    format         .webp   (cwebp -q 78; a flat illustration lands around
                            35 KB, a busy painted one around 120 KB)

The tile is rendered with `object-cover`, and because the box is also 4:1 the
picture is never cropped: what you draw is what is shown.

A tile with artwork shows NOTHING else — no name, no hint, no icon — so the
picture has to carry the game's name itself. Keep the title away from the very
edge: a 24 px margin all round clears the 10-12 px rounded corners. Tiles are
small now (about 40 px tall on a phone), so the title should be big and bold
enough to read at that size.

Nothing is ever dimmed and there is no selected state here (a tap starts the
game), so draw for how it should normally look. Hovering lifts the tile a
little and scales the picture by 1.5%, which is why the art should run to all
four edges rather than sit on a border.

File names, exactly:

  flashcards.webp   Start Flashcard Challenge   (Flip · memorise · repeat)
  wordflight.webp   Word Flight Game            (Catch the falling words)
  wordrace.webp     Word Race Game              (Run to the Arabic word)
  wordcards.webp    Word Cards Game             (Throw a card, match its pair)
  crossword.webp    Crossword                   (Fill the grid · N words)
  letterwheel.webp  Letter Wheel                (Join the letters into the word)
  quickmatch.webp   Quick Match                 (60 seconds · match or not)
  wordsearch.webp   Word Search                 (Find the hidden words)
  wordsnake.webp    Word Snake                  (Eat the letters in order)
  saved.webp        Revise saved words          (the 🔖 list)

The same files serve both places the tiles appear: the Practise box in Lessons
Vocabulary, and the Games row on the header's Vocabulary page.

How the real sizes land (Nov 2026 layout: two across on a phone with the
first tile on its own row, three across from 640 px up):

    phone   375 px wide   first tile 309 × 77, the rest 151 × 38
    laptop 1280 px wide   tile 275 × 69   (Practise box, three columns)
                          tile 281 × 70   (Vocabulary page, three columns)

So 1280 px across covers every case at 2× or better.
