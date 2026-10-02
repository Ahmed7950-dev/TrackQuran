# Backgrounds for the Arabic game and challenge tiles

One file per tile, dropped in here. A tile with no file keeps its plain tinted
look — icon, name and hint — so the pictures can arrive one at a time.

    aspect ratio   4 : 1   (the tile is exactly 4:1 at every screen size)
    master size    1280 × 320 px
    format         .webp   (cwebp -q 78; a flat illustration lands around
                            35 KB, a busy painted one around 120 KB)

The homework basket is the exception: it is not a game, it takes the whole row
on its own, and it is 8 : 1 — master 1920 × 240 px, same format.

The tile is rendered with `object-cover`, and because the box is also 4:1 the
picture is never cropped: what you draw is what is shown.

A tile with artwork shows NOTHING else — no name, no hint, no icon — so the
picture has to carry the game's name itself. Keep the title away from the very
edge: a 24 px margin all round clears the 16 px rounded corners.

Nothing is ever dimmed and there is no selected state here (a tap starts the
game), so draw for how it should normally look. Hovering lifts the tile a
little and scales the picture by 1.5%, which is why the art should run to all
four edges rather than sit on a border.

The only thing ever drawn over a picture is the homework basket's count, a
small violet circle in the top-right corner — leave that corner quiet on
`basket.webp`.

File names, exactly:

  flashcards.webp   Start Flashcard Challenge   (Flip · memorise · repeat)
  wordflight.webp   Word Flight Game            (Catch the falling words)
  wordrace.webp     Word Race Game              (Run to the Arabic word)
  wordcards.webp    Word Cards Game             (Throw a card, match its pair)
  saved.webp        Revise saved words          (the 🔖 list)
  basket.webp       Homework Basket             (tutor only, 8:1, full row)

The same files serve both places the tiles appear: the Practise box in Lessons
Vocabulary, and the Games row on the header's Vocabulary page.

How the real sizes land, measured in the portal:

    phone   390 px wide   tile 324 × 81
    tablet  820 px wide   tile 334 × 84
    laptop 1280 px wide   tile 419 × 105   (Practise box, two columns)
                          tile 281 ×  70   (Vocabulary page, three columns)
                          basket 848 × 106 (the whole row, at 8:1)

So 1280 px across covers every case at 2× or better.
