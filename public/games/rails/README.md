# Backgrounds for the game and challenge cards

One file per card, dropped in here. A card with no file keeps its plain tinted
look, so they can arrive one at a time.

    aspect ratio   4 : 1   (the card is exactly 4:1 at every screen size)
    master size    1280 × 320 px
    format         .webp   (cwebp -q 78, roughly 25–60 KB each)

The card is rendered with `object-cover`, and because the box is also 4:1 the
picture is never cropped — what you draw is what is shown.

The name and the hint are written across the LEFT of the card, over a dark
gradient (opaque on the left, clear on the right). So:

  * keep the left 55% quiet — texture, sky, a wall, not faces or small detail;
  * put the subject in the right third, clear of the rounded corners;
  * a 24 px margin all round stays clear of the 16 px corner radius and of the
    tick that marks the chosen card (top right, inside 40 px).

File names, exactly:

  challenges   guess.webp  wordchallenge.webp  formdrill.webp  lettermatch.webp
  games        lettercards.webp  tower.webp  airplane.webp  race.webp
               battle.webp  flappy.webp  letterhunt.webp  oddletter.webp
