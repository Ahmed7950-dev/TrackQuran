// utils/mistakeLetters.ts
// ---------------------------------------------------------------------------
// How a word is split into letters for letter-level mistakes. A mistake key is
// `surah:ayah:word:letter`, where word counts splitVerseWords() from 0 and
// letter is the index returned here — so every page that draws mistakes must
// split words exactly like this, or highlights land on the wrong letter.
// (Moved out of MistakesReviewPage unchanged so the recitation homework page
// can share it.)
// ---------------------------------------------------------------------------

import type React from 'react';
import { tanweenOnSeatAlif } from './quranicMarks';

export const isArabicLetter = (char: string | undefined): boolean => {
  if (!char) return false;
  const code = char.charCodeAt(0);
  // Basic Arabic letters (U+0621–U+064A)
  if (code >= 0x0621 && code <= 0x064A) return true;
  // Extended Arabic letters used in Quranic orthography
  // (e.g. ٱ Alef Wasla U+0671). Excludes U+0670 which is a combining mark.
  if (code >= 0x0671 && code <= 0x06D3) return true;
  if (code === 0x06D5) return true;
  if (code >= 0x06EE && code <= 0x06EF) return true;
  if (code >= 0x06FA && code <= 0x06FC) return true;
  return false;
};

export const parseWordIntoLetters = (word: string): Array<{ letter: string; index: number }> => {
  const letters: Array<{ letter: string; index: number }> = [];
  if (!word || typeof word !== 'string') return letters;
  word = tanweenOnSeatAlif(word); // display: fathatan on its seat alif (رَسُولاً)
  let letterIndex = 0;
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    if (isArabicLetter(char)) {
      letters.push({ letter: char, index: letterIndex });
      letterIndex++;
    } else {
      // Attach diacritics to the previous letter, or create a standalone unit
      if (letters.length > 0) {
        letters[letters.length - 1].letter += char;
      } else {
        letters.push({ letter: char, index: letterIndex });
      }
    }
  }
  return letters;
};

/**
 * A stopping sign (ۖ ۗ ۘ ۙ ۚ ۛ, U+06D6–U+06DC) that trails a letter unit.
 *
 * iOS clips these: inside a per-letter span the sign comes out as a sliver with
 * its top cut off, while the same text as one run draws it in full. Giving the
 * sign its own span with a hair of margin — so WebKit shapes it as its own run —
 * brings the whole glyph back. Verified on an iPhone simulator against the same
 * verse drawn as plain text.
 *
 * The split is DISPLAY ONLY: `parseWordIntoLetters` still returns the sign as
 * part of its letter, so every mistake key keeps pointing at the same letter.
 */
const TRAILING_WAQF = /[\u06D6-\u06DC]+$/;

export const splitTrailingWaqf = (unit: string): { glyph: string; waqf: string } => {
  const m = unit.match(TRAILING_WAQF);
  if (!m) return { glyph: unit, waqf: '' };
  return { glyph: unit.slice(0, unit.length - m[0].length), waqf: m[0] };
};

/**
 * The space before the sign is what makes iOS draw it whole, AND what keeps it
 * off the last letter: with the sign tight against the word it landed on top of
 * a tanween sitting on an alif (وَلُؤْلُؤًاۖ). Most of the space goes
 * between the word and the sign (0.5em), and a little after it (0.15em), so the
 * sign clears even a tanween on an alif and still reads as belonging to the word
 * it ends rather than the one that follows. Measured on an iPhone.
 */
export const WAQF_STYLE: React.CSSProperties = { display: 'inline', marginInline: '0.5em 0.15em' };
