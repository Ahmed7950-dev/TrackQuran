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
const isMark = (ch: string): boolean => {
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
