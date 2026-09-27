// components/letterCardsLayout.ts
// -----------------------------------------------------------------------------
// Where everything sits on the board, as a share of the background image
// (1672 × 941). The numbers below were MEASURED from the painted slots in
// Background.png, so the cards land in the frames the artwork already draws.
//
// To move anything: open the game with ?calibrate=1, drag the placeholders, and
// paste the numbers it prints back into this file. Nothing else reads pixels.
// -----------------------------------------------------------------------------

export const BOARD = { w: 1672, h: 941 };

/** A box on the board, in per-cent of the background. */
export interface Box { x: number; y: number; w: number; h: number }

const pc = (x: number, y: number, w: number, h: number): Box => ({
  x: (x / BOARD.w) * 100,
  y: (y / BOARD.h) * 100,
  w: (w / BOARD.w) * 100,
  h: (h / BOARD.h) * 100,
});

/** The student's five, along the top — the red banners are theirs. */
export const STUDENT_HAND: Box[] = [
  pc(414, 87, 150, 177), pc(594, 87, 150, 177), pc(774, 87, 150, 177),
  pc(957, 87, 150, 177), pc(1140, 87, 150, 177),
];

/** The tutor's five, along the bottom, under the blue banners. */
export const TUTOR_HAND: Box[] = [
  pc(390, 641, 156, 193), pc(579, 641, 156, 193), pc(768, 641, 156, 193),
  pc(957, 641, 156, 193), pc(1146, 641, 156, 193),
];

/** The pile both sides draw from, on the left. */
export const DRAW_PILE: Box = pc(39, 357, 129, 189);

/** The two cards in play, either side of the compass in the middle. */
export const THROWN_TUTOR: Box = pc(640, 372, 156, 193);
export const THROWN_STUDENT: Box = pc(876, 372, 156, 193);

/**
 * Where the letter goes INSIDE a card, as a share of the card.
 *
 * The white panel measured across the artwork runs x 7.7% → 92.2%, y 8.2% →
 * 51.2%. Several animals reach up into it (the lion's mane fills the middle of
 * it), so the letter takes only the upper two thirds of that panel, as asked.
 */
export const LETTER_BOX: Box = { x: 7.7, y: 8.2, w: 84.5, h: 28.7 };

/** Every box the calibration overlay lets you drag, in one list. */
export const NAMED_BOXES = (): { key: string; label: string; box: Box }[] => [
  ...STUDENT_HAND.map((box, i) => ({ key: `student${i}`, label: `Student ${i + 1}`, box })),
  ...TUTOR_HAND.map((box, i) => ({ key: `tutor${i}`, label: `Tutor ${i + 1}`, box })),
  { key: 'draw', label: 'Draw pile', box: DRAW_PILE },
  { key: 'thrownTutor', label: 'Thrown · tutor', box: THROWN_TUTOR },
  { key: 'thrownStudent', label: 'Thrown · student', box: THROWN_STUDENT },
];
