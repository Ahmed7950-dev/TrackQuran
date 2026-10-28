// utils/qaedahWalk.ts
// -----------------------------------------------------------------------------
// Reading a word one sound at a time.
//
// Going over a Qaedah word with a student, the tutor points at the letter, then
// at the vowel on it, then at the next letter — because that is the order the
// word is actually sounded out, and a beginner who is shown the whole word at
// once reads the shape instead of the letters.
//
// So a word becomes a list of steps, each step the characters to light up:
//
//   كُتِبَ   →   ك · ُ · ت · ِ · ب · َ
//   حَرَّمَ   →   ح · َ · ر · ّ · َ · م · َ
//
// A shadda is a step of its own and comes BEFORE the vowel sitting on it: the
// letter is doubled first, and only then does it take its vowel. The words in
// the lesson store it that way already (ر ّ َ), but the order is enforced here
// rather than trusted, so a word typed the other way round still reads right.
// -----------------------------------------------------------------------------

const SHADDA = 'ّ';
const TATWEEL = 'ـ';

/** A mark that sits on a letter rather than standing as one. */
export const isMark = (ch: string): boolean => {
  const x = ch.codePointAt(0) ?? 0;
  return (x >= 0x064B && x <= 0x065F)   // harakat, tanween, shadda, sukoon
    || x === 0x0670                     // dagger alif
    || (x >= 0x06D6 && x <= 0x06ED);    // the small quranic marks
};

/** A letter the reader actually says. */
const isLetter = (ch: string): boolean => {
  const x = ch.codePointAt(0) ?? 0;
  return (x >= 0x0621 && x <= 0x063A)
    || (x >= 0x0641 && x <= 0x064A)
    || (x >= 0x0671 && x <= 0x06D3);
};

/**
 * The steps for one word: each is the character indices to light up together.
 * Anything that is neither a letter nor a mark — a space between two words, a
 * direction mark — belongs to no step and is simply drawn.
 */
export function walkSteps(word: string): number[][] {
  const chars = [...word];
  const steps: number[][] = [];
  let i = 0;

  while (i < chars.length) {
    if (!isLetter(chars[i])) { i++; continue; }   // stray mark or a space

    // The letter, plus any tatweel stretching it — one thing to point at.
    const base = [i];
    i++;
    while (i < chars.length && chars[i] === TATWEEL) { base.push(i); i++; }

    const marks: number[] = [];
    while (i < chars.length && isMark(chars[i])) { marks.push(i); i++; }

    steps.push(base);
    // Doubled first, then the vowel that sits on the doubling.
    for (const k of marks) if (chars[k] === SHADDA) steps.push([k]);
    for (const k of marks) if (chars[k] !== SHADDA) steps.push([k]);
  }
  return steps;
}

/** How many steps a word takes to read. */
export const stepCount = (word: string): number => walkSteps(word).length;

/** Move within the word, stopping at either end rather than wrapping. */
export const clampStep = (at: number, total: number): number =>
  total <= 0 ? 0 : Math.max(0, Math.min(at, total - 1));

/* ── Where a mark actually sits ───────────────────────────────────────── */
//
// A letter and the marks on it are ONE grapheme cluster, and a browser paints
// a cluster in the colour of its first character — so wrapping a fatha in its
// own <span> and colouring it does nothing at all. Proved in every font on the
// shelf, Hafs and Amiri alike.
//
// The way through is to draw the word twice, the top copy coloured and clipped
// to just the piece being pointed at. That needs the piece's box, and a fixed
// table of heights will not give it: a fatha tucked under a shadda covers
// almost exactly the shadda's rows, and a tall ك climbs into the mark zone.
//
// So the box is measured rather than guessed. The word is drawn on a canvas
// with the mark and again without it, and the pixels that differ ARE the mark
// — exact, whatever the font does with it.

export interface Box {
  /** All four, in em, from the baseline (y) and the word's right edge (x). */
  top: number; bottom: number; right: number; left: number;
  /**
   * The mark's own pixels, cropped to the box, as a mask.
   *
   * The box alone is not enough: a fatha on a shadda'd letter is drawn INSIDE
   * the shadda's curve, so their boxes nest and pointing at one catches the
   * other. The mask is the pixels that belong to this mark and nothing else.
   */
  mask: string;
}

const MEASURE_PX = 120;
const CW = 1000, CH = 420;
const cache = new Map<string, Map<number, Box>>();

/** Has this family actually loaded? */
export function fontReady(fontFamily: string): boolean {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts?.check) return true;                 // no way to ask: assume yes
  try { return fonts.check(`${MEASURE_PX}px ${fontFamily}`); } catch { return true; }
}

let ctx: CanvasRenderingContext2D | null | undefined;
function canvas(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    ctx = c.getContext('2d', { willReadFrequently: true });
  } catch { ctx = null; }
  return ctx;
}

const ORIGIN_X = CW - 40, ORIGIN_Y = 300;

/** The alpha map of one string, drawn at the shared origin. */
function inkOf(c: CanvasRenderingContext2D, text: string, font: string): Uint8ClampedArray {
  c.clearRect(0, 0, CW, CH);
  c.font = font;
  c.direction = 'rtl';
  c.textAlign = 'right';
  c.fillStyle = '#fff';
  c.fillText(text, ORIGIN_X, ORIGIN_Y);
  return c.getImageData(0, 0, CW, CH).data;
}

/**
 * The box of every MARK in the word, keyed by its index in the string.
 * Letters are not measured: a letter cannot be taken out without changing how
 * its neighbours join, and it does not need to be — see WalkWord.
 */
export function measureMarks(word: string, fontFamily: string): Map<number, Box> {
  const key = `${word}|${fontFamily}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const out = new Map<number, Box>();
  const c = canvas();
  if (!c) { cache.set(key, out); return out; }

  // Not until the Arabic font is actually here. A canvas asked for a font it
  // does not have falls back to the system serif without a word, and the boxes
  // measured from THAT are wrong for the text on screen — wrong, and cached
  // for good. Answer empty instead, and do not remember it: the caller asks
  // again when the font arrives.
  if (!fontReady(fontFamily)) return out;

  // A long word must still fit the canvas, or the marks past the edge are
  // never seen. Shrink to fit and convert with the size actually drawn.
  c.font = `${MEASURE_PX}px ${fontFamily}`;
  const wide = c.measureText(word).width;
  const px = wide > ORIGIN_X - 20 ? Math.max(24, Math.floor(MEASURE_PX * (ORIGIN_X - 20) / wide)) : MEASURE_PX;
  const font = `${px}px ${fontFamily}`;
  const chars = [...word];
  const full = inkOf(c, word, font);
  const W = CW;

  /** The pixels the word gains from `drop`, as a box plus a mask image. */
  const diffOf = (drop: number[]): Box | null => {
    const without = inkOf(c, chars.filter((_, k) => !drop.includes(k)).join(''), font);
    let top = -1, bottom = -1, left = -1, right = -1;
    for (let y = 0; y < CH; y++) {
      for (let x = 0; x < W; x++) {
        const k = (y * W + x) * 4 + 3;
        if (full[k] > 40 && without[k] <= 40) {
          if (top < 0) top = y;
          bottom = y;
          if (left < 0 || x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (top < 0) return null;           // nothing we can see changed

    // Cut the mark's own pixels out as a mask image, cropped to its box.
    //
    // Solid, and grown by a pixel. The mask is cut at MEASURE_PX and stretched
    // to whatever size the word is drawn at, so soft edges arrive softer still
    // — and a mask that does not quite cover leaves a red rim around a mark
    // that was supposed to go back to black. A pixel of margin costs nothing:
    // above and below a letter there is nothing else to cover.
    const GROW = 1;
    const mw = right - left + 1 + GROW * 2, mh = bottom - top + 1 + GROW * 2;
    const hit = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= CH) return false;
      const k = (y * W + x) * 4 + 3;
      return full[k] > 40 && without[k] <= 40;
    };
    const cut = c.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const sx = left - GROW + x, sy = top - GROW + y;
        let on = false;
        for (let dy = -GROW; dy <= GROW && !on; dy++)
          for (let dx = -GROW; dx <= GROW && !on; dx++) on = hit(sx + dx, sy + dy);
        const dst = (y * mw + x) * 4;
        cut.data[dst] = cut.data[dst + 1] = cut.data[dst + 2] = 255;
        cut.data[dst + 3] = on ? 255 : 0;
      }
    }
    const cutCv = document.createElement('canvas');
    cutCv.width = mw; cutCv.height = mh;
    cutCv.getContext('2d')?.putImageData(cut, 0, 0);

    return {
      mask: cutCv.toDataURL(),
      // The box IS the mask image's bounds, grown pixel included.
      top:    (top - GROW - ORIGIN_Y) / px,
      bottom: (bottom + GROW - ORIGIN_Y) / px,
      right:  (ORIGIN_X - (right + GROW)) / px,
      left:   (ORIGIN_X - (left - GROW)) / px,
    };
  };

  // One entry per mark, and one per LETTER holding all of its marks together.
  //
  // The whole cluster has to be measured in one go rather than added up from
  // the marks: where a shadda and the fatha tucked inside it overlap, neither
  // one's own diff claims those pixels — each is still drawn by the other's
  // "without" — and a letter restored mark by mark kept a red hairline along
  // the seam.
  for (let i = 0; i < chars.length; i++) {
    if (isMark(chars[i]) || !isLetter(chars[i])) continue;
    const marks: number[] = [];
    for (let k = i + 1; k < chars.length && isMark(chars[k]); k++) marks.push(k);
    for (const m of marks) { const b = diffOf([m]); if (b) out.set(m, b); }
    if (marks.length > 1) { const b = diffOf(marks); if (b) out.set(i, b); }
    else if (marks.length === 1) { const b = out.get(marks[0]); if (b) out.set(i, b); }
  }
  cache.set(key, out);
  return out;
}
