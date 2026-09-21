// utils/mistakeLetters.ts
// ---------------------------------------------------------------------------
// How a word is split into letters for letter-level mistakes. A mistake key is
// `surah:ayah:word:letter`, where word counts splitVerseWords() from 0 and
// letter is the index returned here — so every page that draws mistakes must
// split words exactly like this, or highlights land on the wrong letter.
// (Moved out of MistakesReviewPage unchanged so the recitation homework page
// can share it.)
// ---------------------------------------------------------------------------

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
