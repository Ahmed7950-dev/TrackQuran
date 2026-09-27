// components/letterCardsLayout.ts
// -----------------------------------------------------------------------------
// Where everything sits on the board, as a share of the background image
// (1672 × 941). The slot numbers were MEASURED from the frames painted into
// Background.png, so cards land in the frames the artwork already draws.
//
// The numbers below were placed by hand against the artwork. Nothing else in
// the game reads pixels, so this is the only file to touch to move anything.
// -----------------------------------------------------------------------------

export const BOARD = { w: 1672, h: 941 };

/** A box on the board, in per-cent of whatever contains it. */
export interface Box { x: number; y: number; w: number; h: number }

export interface Layout {
  /** The student's five, along the top — the red banners are theirs. */
  studentHand: Box[];
  /** The tutor's five, along the bottom, under the blue banners. */
  tutorHand: Box[];
  /** The pile both sides draw from, on the left. */
  drawPile: Box;
  /** The two cards in play, either side of the compass in the middle. */
  thrownTutor: Box;
  thrownStudent: Box;
  /**
   * Where the letter goes INSIDE a card, as a share of the card. The white
   * panel runs x 7.7% → 92.2%, y 8.2% → 51.2%; several animals reach up into
   * it, so the letter takes only the upper two thirds of that panel.
   */
  letterBox: Box;
  /** The letter's size, as a share of the CARD's width. */
  letterSize: number;
}

const pc = (x: number, y: number, w: number, h: number): Box => ({
  x: (x / BOARD.w) * 100,
  y: (y / BOARD.h) * 100,
  w: (w / BOARD.w) * 100,
  h: (h / BOARD.h) * 100,
});

export const DEFAULT_LAYOUT: Layout = {
  studentHand: [
    pc(488, 100, 114, 170), pc(631, 100, 114, 170), pc(778, 100, 114, 170),
    pc(926, 100, 114, 170), pc(1072, 100, 114, 170),
  ],
  tutorHand: [
    pc(484, 648, 115, 172), pc(629, 648, 115, 172), pc(777, 648, 115, 172),
    pc(927, 648, 115, 172), pc(1073, 648, 115, 172),
  ],
  drawPile: pc(13, 342, 187, 218),
  thrownTutor: pc(647, 339, 150, 226),
  thrownStudent: pc(855, 339, 150, 226),
  letterBox: { x: 9.5, y: 6.5, w: 84.5, h: 28.7 },
  letterSize: 42,
};
