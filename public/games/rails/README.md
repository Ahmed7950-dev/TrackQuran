# Backgrounds for the game and challenge cards

One file per card, dropped in here. A card with no file keeps its plain tinted
look, so they can arrive one at a time.

    aspect ratio   4 : 1   (the card is exactly 4:1 at every screen size)
    master size    1280 × 320 px
    format         .webp   (cwebp -q 78, roughly 25–60 KB each)

The card is rendered with `object-cover`, and because the box is also 4:1 the
picture is never cropped — what you draw is what is shown.

A card with artwork shows NOTHING else — no name, no hint, no icon — so the
picture has to carry the game's name itself. Keep the title away from the very
edge: a 24 px margin all round clears the 16 px rounded corners.

Every card is shown in its own colours; the chosen one is lifted a little
brighter (brightness 1.14) and gets a ring around it. Nothing is ever dimmed,
so draw for how it should normally look.

File names, exactly:

  challenges   guess.webp  wordchallenge.webp  formdrill.webp  lettermatch.webp
  games        lettercards.webp  tower.webp  airplane.webp  race.webp
               battle.webp  flappy.webp  letterhunt.webp  oddletter.webp
