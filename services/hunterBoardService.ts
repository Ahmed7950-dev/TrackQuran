// services/hunterBoardService.ts
// -----------------------------------------------------------------------------
// The board the Write round is drawn on — shared live between the screen the
// lesson is run from and whatever phones or tablets scan its code.
//
// Two decisions shape everything here:
//
//   Ink is STROKES, never a picture. A letter is a few hundred points; the same
//   letter as a PNG is a couple of hundred kilobytes. Storage on this project
//   is nearly full and the next overage stops it serving, so a drawing that has
//   to be kept is kept as numbers. It also means the tutor can draw ON a
//   submitted drawing without flattening what the student did.
//
//   Every stroke carries its OWNER, and owners are drawn on separate layers.
//   That is what makes "the student cannot rub out his teacher's ink" exact
//   rather than approximate: his eraser is composited into his own layer only.
//
// Coordinates are 0..1 inside a 4:3 box, so a phone held in the hand and a
// laptop across the table draw the same letter in the same place.
// -----------------------------------------------------------------------------

export type InkOwner = 'tutor' | 'student';

export interface Stroke {
  id: string;
  owner: InkOwner;
  /** An eraser is a stroke too — it is composited out instead of in. */
  erase: boolean;
  colour: string;
  /** Fraction of the board's width, so it scales with the screen. */
  width: number;
  /** [x, y] pairs, each 0..1. */
  pts: [number, number][];
}

export const BOARD_RATIO = 4 / 3;

/** The pens, chosen to read on paper-white and to stay apart for colour-blind
 *  eyes (they differ in lightness, not only in hue). */
export const PENS = [
  { name: 'Ink',    hex: '#1B2436' },
  { name: 'Coral',  hex: '#E2552B' },
  { name: 'Blue',   hex: '#2F6BD8' },
  { name: 'Green',  hex: '#1F7A4D' },
];

/** Stroke widths as a fraction of the board width. */
export const NIBS = [0.006, 0.012, 0.022];
export const ERASER_NIBS = [0.03, 0.06, 0.1];

export const boardChannel = (roomId: string): string => `hunter-board:${roomId}`;

export const BOARD_SITE = 'https://www.lisanquran.com';
export const boardUrl = (roomId: string, who: InkOwner): string =>
  `${BOARD_SITE}/board/${roomId}${who === 'tutor' ? '?me=tutor' : ''}`;

export const newRoomId = (): string => {
  try { return crypto.randomUUID(); } catch { /* older browser */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const newStrokeId = (): string => Math.random().toString(36).slice(2, 10);

/** Paint one stroke onto its layer. Erasing is the same path, taken out. */
export function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number): void {
  if (s.pts.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, s.width * w);
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = s.erase ? 'rgba(0,0,0,1)' : s.colour;
  ctx.beginPath();
  if (s.pts.length === 1) {
    // A tap is a dot, not nothing.
    const [x, y] = s.pts[0];
    ctx.arc(x * w, y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
    ctx.fill();
  } else {
    ctx.moveTo(s.pts[0][0] * w, s.pts[0][1] * h);
    for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * w, s.pts[i][1] * h);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Which layers a stroke touches.
 *
 * Ink lands on its owner's layer. An eraser does too — except the tutor's,
 * which takes out the student's ink as well, because marking means being able
 * to rub out what he got wrong. The student's never reaches the tutor's layer.
 */
export function layersFor(s: Stroke): InkOwner[] {
  if (s.erase && s.owner === 'tutor') return ['tutor', 'student'];
  return [s.owner];
}

export const ownerLabel: Record<InkOwner, string> = { tutor: 'Teacher', student: 'Student' };
