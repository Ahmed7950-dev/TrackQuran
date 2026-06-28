import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { QURAN_METADATA } from '../constants';
import { RecitationAchievement, QuranVerse, Student, Progress, MemorizationAchievement, Mistake } from '../types';
import MilestoneTracker from './MilestoneTracker';
import { audioUrl, versesInSurah } from './VerseAudioPlayer';
import { loadVerseNotes, saveVerseNote } from '../services/tadabburService';
import ExportReportModal from './ExportReportModal';
import { useI18n } from '../context/I18nProvider';
import { getPageOfAyah, saveStudentTeacherNote } from '../services/dataService';
import { pageVerseList } from '../services/quranPageData';
import { wordMarkPlan, correctiveWordFont, splitVerseWords } from '../utils/quranicMarks';
import ConfirmationModal from './ConfirmationModal';
declare var confetti: any;

type LogType = 'reading' | 'reading-revision' | 'hifz' | 'hifz-revision' | 'tafseer' | 'homework';


interface StudentProgressPageProps {
  student: Student;
  students: Student[];
  studentProgress?: Progress;
  studentMistakes: { [key: string]: Mistake };
  recitationAchievements: RecitationAchievement[];
  memorizationAchievements: MemorizationAchievement[];
  onUpdateProgress: (studentId: string, surah: number, ayah: number) => void;
  onCycleMistakeLevel: (studentId: string, surah: number, ayah: number, wordIndex: number, letterIndex?: number, errorType?: 'tajweed' | 'reading', errorText?: string) => void;
  onClearMistake: (studentId: string, surah: number, ayah: number, wordIndex: number, letterIndex?: number) => void;
  onLogRecitationRange: (studentId: string, range: { start: Progress, end: Progress }, quality: number, isRevision: boolean) => void;
  onRemoveRecitationAchievement: (studentId: string, achievementId: string) => void;
  onLogMemorizationRange: (studentId: string, range: { start: Progress, end: Progress }, quality: number, isRevision: boolean) => void;
  onRemoveMemorizationAchievement: (studentId: string, achievementId: string) => void;
  onLogTafseerRange: (studentId: string, range: { start: Progress, end: Progress }) => void;
  onRemoveTafseerRange: (studentId: string, reviewId: string) => void;
  onLogHomework?: (studentId: string, range: { start: Progress, end: Progress }, note: string) => void;
  /**
   * When set, immediately navigates the Quran view to this verse key ("surah:ayah").
   * Useful for jumping to homework verses from outside the component.
   */
  jumpToVerseKey?: string | null;
  /**
   * Extra content rendered inside the student name card, next to the student name.
   * Used by the shared report page to inject a homework badge.
   */
  nameCardExtra?: React.ReactNode;
  /**
   * Verse ranges to highlight as homework. Verses inside these ranges get a
   * distinctive violet left-border highlight. Pass an empty array (or omit) to
   * show no highlights.
   */
  homeworkRanges?: Array<{ id: string; startSurah: number; startAyah: number; endSurah: number; endAyah: number }>;
  onGoBack: () => void;
  /** When true: disables all logging interactions; verse-number click plays audio instead */
  readOnly?: boolean;
  /**
   * Top offset (px) for the sticky surah navigation toolbar.
   * Set to the height of the page header above this component.
   * Defaults to 100 (tutor app header). Pass a higher value when
   * rendering inside SharedReportPage which has a taller header.
   */
  toolbarStickyTop?: number;
  /**
   * When provided, verse notes (Tadabbur) are loaded for this student ID.
   * In readOnly mode the student can also write/edit notes.
   * In live (tutor) mode notes are shown read-only as context.
   */
  notesStudentId?: string;
  /**
   * Called (on the tutor side) each time the tutor presses Ctrl to signal a
   * mistake. The parent can use this to broadcast the event to the student.
   */
  onMistakeBuzz?: () => void;
  /**
   * Incrementing counter from the parent. Every time it changes the component
   * fires the red-flash + buzz sound — used to replay the tutor's Ctrl press
   * on the student's screen in real time.
   */
  externalBuzzTrigger?: number;
  /**
   * Called (on the tutor side) when the tutor long-presses a letter.
   * The parent broadcasts the letter key so the student's screen scrolls to it.
   */
  onLetterFocus?: (letterKey: string) => void;
  /**
   * Letter key received from outside (student side). When it changes the
   * component scrolls to that letter and highlights it in purple.
   */
  focusedLetterKey?: string | null;
  /**
   * Called (tutor side) when cursor mode is active and the cursor moves to a
   * new letter, or null when cursor mode is toggled off.
   */
  onCursorMove?: (key: string | null) => void;
  /**
   * The letter key the tutor's cursor is currently over (student side).
   * Shows an orange pulsing dot on that letter.
   */
  cursorLetterKey?: string | null;
}

const getAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
);

const SpinnerIcon = () => (
    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


const QALQALAH_LETTERS = ['ق', 'ط', 'ب', 'ج', 'د'];
const IKHFA_LETTERS = ['ص', 'ذ', 'ث', 'ك', 'ج', 'ش', 'ق', 'س', 'د', 'ط', 'ز', 'ف', 'ت', 'ض', 'ظ'];
const IDGHAM_LETTERS = ['ي', 'ر', 'م', 'ل', 'و', 'ن'];
const IQLAB_LETTER = 'ب';
const TANWEEN_CHARS = ['ً', 'ٍ', 'ٌ'];
const SUKUN = 'ۡ'; // U+06E1 - Quranic Sukun
const MADDAH = '\u0653'; // ARABIC MADDAH ABOVE
const SMALL_HIGH_MADDA = '\u06e4'; // ARABIC SMALL HIGH MADDA \u2014 Madd L\u0101zim marker
const SMALL_WAW = '\u06e5';        // ARABIC SMALL WAW \u2014 Madd \u1e62ilah / sub-vowel marker
const SMALL_YEH = '\u06e6';        // ARABIC SMALL YEH \u2014 Madd \u1e62ilah / sub-vowel marker
const SILENT_MARKER = '\u06df';    // ARABIC SMALL HIGH ROUNDED ZERO \u2014 silent letter (Madinah Mushaf)
const MADD_MARKERS = [MADDAH, SMALL_HIGH_MADDA, SMALL_WAW, SMALL_YEH];

// Waqf signs (U+06D6-U+06DF), imala (U+06EA), and ishmam (U+06EB) are now
// handled by the 'QuranMarkFix' @font-face unicode-range rules in index.html.
// Font substitution happens at the glyph level so Arabic text stays in a single
// unbroken text run and Safari/iOS correctly connects letter forms.

const TANWEEN_GHUNNAH_TANWEEN_CHARS = ['\u064b', '\u064c', '\u064d']; // \u064b \u064c \u064d

// Iqlab: U+06E2 (small high meem) stacked on a tanween (U+064B/U+064C). None of
// the bundled Quranic fonts position this pair correctly \u2014 the meem glyph is
// drawn on top of the tanween, overlapping it. When a letter cluster contains
// both, we strip the meem from the inline text (so the tanween renders cleanly)
// and draw the meem ourselves in an absolutely-positioned overlay above it.

const IQLAB_HIGH_MEEM = '\u06e2';
const hasIqlabMeem = (text: string): boolean =>
    text.includes(IQLAB_HIGH_MEEM) && (text.includes('\u064b') || text.includes('\u064c'));

// Iqlab high meem overlay: anchored to the horizontal centre of the unit (above
// the tanween), width-independent. See the render site in LetterWithError.

// Unicode constants for Ghunnah rules
const NOON = '\u0646'; // U+0646 - ن
const MEEM = '\u0645'; // U+0645 - م
const SHADDAH = '\u0651'; // U+0651 - ّ
const SUKUN_UNICODE = '\u0652'; // U+0652 - ْ
const SPACE = '\u0020'; // U+0020 - space

// Letters that trigger Ghunnah for Noon
const GHUNNAH_TRIGGER_LETTERS = [
    '\u064A', // ي
    '\u0646', // ن
    '\u0645', // م
    '\u0648', // و
    '\u0628', // ب
    '\u0635', // ص
    '\u0630', // ذ
    '\u062B', // ث
    '\u0643', // ك
    '\u062C', // ج
    '\u0634', // ش
    '\u0642', // ق
    '\u0633', // س
    '\u062F', // د
    '\u0637', // ط
    '\u0632', // ز
    '\u0641', // ف
    '\u062A', // ت
    '\u0636', // ض
    '\u0638'  // ظ
];

const isArabicLetter = (char: string | undefined): boolean => {
    if (!char) return false;
    const code = char.charCodeAt(0);
    // Basic Arabic letters (U+0621–U+064A)
    if (code >= 0x0621 && code <= 0x064A) return true;
    // Extended Arabic letters used in Quranic orthography
    // (e.g. ٱ Alef Wasla U+0671). Excludes U+0670 which is a combining mark.
    if (code >= 0x0671 && code <= 0x06D3) return true;
    if (code === 0x06D5) return true;          // ۥ
    if (code >= 0x06EE && code <= 0x06EF) return true; // ۮ ۯ
    if (code >= 0x06FA && code <= 0x06FC) return true; // ۺ ۻ ۼ
    return false;
};

const parseWordIntoUnits = (word: string): string[] => {
    const units: string[] = [];
    if (!word) return units;
    let currentUnit = '';
    for (const char of word) {
        if (isArabicLetter(char)) {
            if (currentUnit) {
                units.push(currentUnit);
            }
            currentUnit = char;
        } else {
            currentUnit += char;
        }
    }
    if (currentUnit) {
        units.push(currentUnit);
    }
    return units;
};

// Parse word into individual letters with their indices
const parseWordIntoLetters = (word: string): Array<{ letter: string; index: number }> => {
    const letters: Array<{ letter: string; index: number }> = [];
    if (!word || typeof word !== 'string') return letters;
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

// ── Cursive joining for per-letter spans ──────────────────────────────────────
// Each letter is rendered in its own inline element so it can be tapped/marked.
// iOS Safari shapes every inline element as an ISOLATED text run, so Arabic
// letters fail to join and the word looks broken. Injecting a Zero-Width Joiner
// (U+200D) at a letter's connecting edges forces each isolated span to render in
// its correct contextual form (initial / medial / final), so they line up and
// appear connected. Harmless on browsers that already join across spans.
const ZWJ = '‍';
// Base letters that do NOT connect to the FOLLOWING letter (right-joining only
// or non-joining): alif forms, dal/thal, ra/zay, waw forms, hamza, teh marbuta,
// alef maksura.
const NON_FORWARD_JOINING = new Set<string>([
  'ا', 'أ', 'إ', 'آ', 'ٱ', // ا أ إ آ ٱ
  'د', 'ذ',                               // د ذ
  'ر', 'ز',                               // ر ز
  'و', 'ؤ',                               // و ؤ
  'ء',                                         // ء
  'ة',                                         // ة
  'ى',                                         // ى
]);
const connectsForward = (ch: string): boolean => !!ch && isArabicLetter(ch) && !NON_FORWARD_JOINING.has(ch);

// Check if a letter should be highlighted green based on Ghunnah rules
const shouldHighlightGhunnah = (letter: string, letterIndex: number, word: string, nextWord: string): boolean => {
    if (!letter || letter.length === 0 || !word) return false;
    
    // Note: word might have U+0652 replaced with U+06E1, so we need to check both
    const QURANIC_SUKUN = '\u06E1'; // U+06E1 - Quranic Sukun (used in the text)
    
    // Tanween marks
    const TANWEEN_FATHA = '\u064B'; // U+064B - Tanween Fatha
    const TANWEEN_DAMMA = '\u064C'; // U+064C - Tanween Damma
    const TANWEEN_KASRA = '\u064D'; // U+064D - Tanween Kasra
    const ARABIC_SMALL_HIGH_MADDA = '\u06ED'; // U+06ED - Arabic Small High Madda
    const ALIF = '\u0627'; // U+0627 - Alif
    
    const letterChar = letter[0]; // Get the base letter (first character)
    
    // Vowel marks
    const FATHA = '\u064E'; // U+064E - Fatha
    const DAMMA = '\u064F'; // U+064F - Damma
    const KASRA = '\u0650'; // U+0650 - Kasra
    
    const fullText = word + (nextWord ? SPACE + nextWord : '');
    
    // Check if letter has fatha, damma, or kasra - if so, exclude from highlighting
    const hasVowel = letter.includes(FATHA) || letter.includes(DAMMA) || letter.includes(KASRA);
    
    // Check for tanween in the letter unit
    const hasTanween = letter.includes(TANWEEN_FATHA) || 
                       letter.includes(TANWEEN_DAMMA) || 
                       letter.includes(TANWEEN_KASRA);
    
    // Rule 3: Any of the 3 types of tanween followed by space followed by trigger letters
    // Check this FIRST before checking if letter is NOON or MEEM, as tanween can be on any letter
    if (hasTanween) {
        // Find the position of this letter in the word
        let letterPos = -1;
        let currentIndex = 0;
        for (let i = 0; i < word.length; i++) {
            if (isArabicLetter(word[i])) {
                if (currentIndex === letterIndex) {
                    letterPos = i;
                    break;
                }
                currentIndex++;
            }
        }
        
        if (letterPos >= 0) {
            // Count characters in the letter unit (letter + diacritics including tanween)
            let unitEndPos = letterPos;
            for (let i = letterPos; i < word.length; i++) {
                if (isArabicLetter(word[i]) && i > letterPos) {
                    break;
                }
                unitEndPos = i + 1;
            }
            
            // Build fullText to check what comes after the letter unit
            const fullText = word + (nextWord ? SPACE + nextWord : '');
            const remainingText = fullText.substring(unitEndPos);
            
            // Special case 1: U+064B (tanween fatha) followed directly by U+0627 (alif) followed by space and trigger letter
            // This should highlight the letter with tanween fatha and the alif
            if (letter.includes(TANWEEN_FATHA) && remainingText.length >= 2) {
                // Check if pattern is: U+0627 (alif), then space (no U+06ED in between)
                let checkPosSimple = 0;
                // Skip any diacritics to find U+0627 (alif)
                while (checkPosSimple < remainingText.length && !isArabicLetter(remainingText[checkPosSimple]) && remainingText[checkPosSimple] !== SPACE) {
                    checkPosSimple++;
                }
                
                if (checkPosSimple < remainingText.length && remainingText[checkPosSimple] === ALIF) {
                    // Found U+0627, now check for space after it
                    let spacePosSimple = checkPosSimple + 1;
                    // Skip any diacritics to find space
                    while (spacePosSimple < remainingText.length && !isArabicLetter(remainingText[spacePosSimple]) && remainingText[spacePosSimple] !== SPACE) {
                        spacePosSimple++;
                    }
                    
                    if (spacePosSimple < remainingText.length && remainingText[spacePosSimple] === SPACE) {
                        // Check if next word exists and starts with a trigger letter
                        if (nextWord && nextWord.length > 0) {
                            for (let i = 0; i < nextWord.length; i++) {
                                if (isArabicLetter(nextWord[i])) {
                                    if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[i])) {
                                        return true;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            
            // Special case 2: U+064B (tanween fatha) followed by U+06ED followed by U+0627 followed by space and trigger letter
            // This should highlight the letter with tanween fatha, U+06ED, and U+0627
            if (letter.includes(TANWEEN_FATHA) && remainingText.length >= 3) {
                // Check if pattern is: U+06ED, U+0627, then space
                let checkPos = 0;
                // Skip any diacritics to find U+06ED
                while (checkPos < remainingText.length && !isArabicLetter(remainingText[checkPos]) && remainingText[checkPos] !== ARABIC_SMALL_HIGH_MADDA && remainingText[checkPos] !== SPACE) {
                    checkPos++;
                }
                
                if (checkPos < remainingText.length && remainingText[checkPos] === ARABIC_SMALL_HIGH_MADDA) {
                    // Found U+06ED, now check for U+0627 after it
                    let alifPos = checkPos + 1;
                    // Skip any diacritics to find U+0627
                    while (alifPos < remainingText.length && !isArabicLetter(remainingText[alifPos]) && remainingText[alifPos] !== SPACE) {
                        alifPos++;
                    }
                    
                    if (alifPos < remainingText.length && remainingText[alifPos] === ALIF) {
                        // Found U+0627, now check for space after it
                        let spacePos = alifPos + 1;
                        // Skip any diacritics to find space
                        while (spacePos < remainingText.length && !isArabicLetter(remainingText[spacePos]) && remainingText[spacePos] !== SPACE) {
                            spacePos++;
                        }
                        
                        if (spacePos < remainingText.length && remainingText[spacePos] === SPACE) {
                            // Check if next word exists and starts with a trigger letter
                            if (nextWord && nextWord.length > 0) {
                                for (let i = 0; i < nextWord.length; i++) {
                                    if (isArabicLetter(nextWord[i])) {
                                        if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[i])) {
                                            return true;
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // Also check if current letter is U+0627 (alif) and look backwards for tanween fatha pattern
            if (letterChar === ALIF && letterIndex > 0) {
                // First check for simple pattern: tanween fatha directly before alif (no U+06ED)
                // Find the position of this alif
                let alifPosSimple = -1;
                let currentIndexSimple = 0;
                for (let i = 0; i < word.length; i++) {
                    if (isArabicLetter(word[i])) {
                        if (currentIndexSimple === letterIndex) {
                            alifPosSimple = i;
                            break;
                        }
                        currentIndexSimple++;
                    }
                }
                
                if (alifPosSimple > 0) {
                    // Check the text before alif for tanween fatha
                    let beforeAlif = word.substring(0, alifPosSimple);
                    // Find the last Arabic letter before alif
                    let lastLetterPos = -1;
                    for (let j = beforeAlif.length - 1; j >= 0; j--) {
                        if (isArabicLetter(beforeAlif[j])) {
                            lastLetterPos = j;
                            break;
                        }
                    }
                    
                    if (lastLetterPos >= 0) {
                        // Check if the letter at lastLetterPos has tanween fatha
                        // Check a few characters after lastLetterPos for tanween fatha
                        let checkEnd = Math.min(beforeAlif.length, lastLetterPos + 5);
                        let context = beforeAlif.substring(lastLetterPos, checkEnd);
                        if (context.includes(TANWEEN_FATHA)) {
                            // Check if there's U+06ED between tanween and alif (if so, skip this simple pattern)
                            let afterLastLetter = word.substring(lastLetterPos);
                            let hasMaddaBetween = afterLastLetter.includes(ARABIC_SMALL_HIGH_MADDA);
                            
                            if (!hasMaddaBetween) {
                                // Simple pattern: tanween fatha directly before alif
                                // Check if there's space after alif, then trigger letter
                                const fullTextForSimple = word + (nextWord ? SPACE + nextWord : '');
                                let afterAlif = fullTextForSimple.substring(alifPosSimple + 1);
                                // Skip diacritics to find space
                                let spaceCheckPos = 0;
                                while (spaceCheckPos < afterAlif.length && !isArabicLetter(afterAlif[spaceCheckPos]) && afterAlif[spaceCheckPos] !== SPACE) {
                                    spaceCheckPos++;
                                }
                                
                                if (spaceCheckPos < afterAlif.length && afterAlif[spaceCheckPos] === SPACE) {
                                    // Check if next word starts with trigger letter
                                    if (nextWord && nextWord.length > 0) {
                                        for (let k = 0; k < nextWord.length; k++) {
                                            if (isArabicLetter(nextWord[k])) {
                                                if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[k])) {
                                                    return true;
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Also check for pattern with U+06ED: tanween fatha + U+06ED before alif
                // Find the position of this alif
                let alifPosMadda = -1;
                let currentIndexMadda = 0;
                for (let i = 0; i < word.length; i++) {
                    if (isArabicLetter(word[i])) {
                        if (currentIndexMadda === letterIndex) {
                            alifPosMadda = i;
                            break;
                        }
                        currentIndexMadda++;
                    }
                }
                
                if (alifPosMadda > 0) {
                    // Check the text before alif for the pattern
                    let beforeAlifMadda = word.substring(0, alifPosMadda);
                    // Look for U+06ED immediately before alif
                    if (beforeAlifMadda.length > 0) {
                        // Check last few characters for U+06ED
                        for (let i = beforeAlifMadda.length - 1; i >= Math.max(0, beforeAlifMadda.length - 10); i--) {
                            if (beforeAlifMadda[i] === ARABIC_SMALL_HIGH_MADDA) {
                                // Found U+06ED, check if there's tanween fatha before it
                                let beforeMadda = beforeAlifMadda.substring(0, i);
                                // Find the last Arabic letter before U+06ED
                                let lastLetterPosMadda = -1;
                                for (let j = beforeMadda.length - 1; j >= 0; j--) {
                                    if (isArabicLetter(beforeMadda[j])) {
                                        lastLetterPosMadda = j;
                                        break;
                                    }
                                }
                                
                                if (lastLetterPosMadda >= 0) {
                                    // Check if the letter at lastLetterPos has tanween fatha
                                    // Check a few characters after lastLetterPos for tanween fatha
                                    let checkEnd = Math.min(beforeMadda.length, lastLetterPosMadda + 5);
                                    let context = beforeMadda.substring(lastLetterPosMadda, checkEnd);
                                    if (context.includes(TANWEEN_FATHA)) {
                                        // Check if there's space after alif, then trigger letter
                                        const fullTextMadda = word + (nextWord ? SPACE + nextWord : '');
                                        let afterAlifMadda = fullTextMadda.substring(alifPosMadda + 1);
                                        // Skip diacritics to find space
                                        let spaceCheckPosMadda = 0;
                                        while (spaceCheckPosMadda < afterAlifMadda.length && !isArabicLetter(afterAlifMadda[spaceCheckPosMadda]) && afterAlifMadda[spaceCheckPosMadda] !== SPACE) {
                                            spaceCheckPosMadda++;
                                        }
                                        
                                        if (spaceCheckPosMadda < afterAlifMadda.length && afterAlifMadda[spaceCheckPosMadda] === SPACE) {
                                            // Check if next word starts with trigger letter
                                            if (nextWord && nextWord.length > 0) {
                                                for (let k = 0; k < nextWord.length; k++) {
                                                    if (isArabicLetter(nextWord[k])) {
                                                        if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[k])) {
                                                            return true;
                                                        }
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
            
            // Also check if current letter unit contains U+06ED (it might be attached to a letter)
            if (letter.includes(ARABIC_SMALL_HIGH_MADDA)) {
                // Check if there's tanween fatha before and alif after
                // Look backwards for tanween fatha
                let beforeLetter = word.substring(0, letterPos);
                // Find last Arabic letter before current letter
                let lastLetterPos = -1;
                for (let i = beforeLetter.length - 1; i >= 0; i--) {
                    if (isArabicLetter(beforeLetter[i])) {
                        lastLetterPos = i;
                        break;
                    }
                }
                
                if (lastLetterPos >= 0) {
                    // Check if letter at lastLetterPos has tanween fatha
                    let checkStart = Math.max(0, lastLetterPos);
                    let checkEnd = Math.min(word.length, letterPos);
                    let context = word.substring(checkStart, checkEnd);
                    if (context.includes(TANWEEN_FATHA)) {
                        // Check if alif comes after current letter
                        const fullText = word + (nextWord ? SPACE + nextWord : '');
                        let afterLetter = fullText.substring(unitEndPos);
                        // Find alif in remaining text
                        for (let i = 0; i < afterLetter.length; i++) {
                            if (isArabicLetter(afterLetter[i]) && afterLetter[i] === ALIF) {
                                // Check if space comes after alif
                                let afterAlif = afterLetter.substring(i + 1);
                                let spacePos = 0;
                                while (spacePos < afterAlif.length && !isArabicLetter(afterAlif[spacePos]) && afterAlif[spacePos] !== SPACE) {
                                    spacePos++;
                                }
                                if (spacePos < afterAlif.length && afterAlif[spacePos] === SPACE) {
                                    // Check if next word starts with trigger letter
                                    if (nextWord && nextWord.length > 0) {
                                        for (let j = 0; j < nextWord.length; j++) {
                                            if (isArabicLetter(nextWord[j])) {
                                                if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[j])) {
                                                    return true;
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
            }
            
            // Regular case: Check if remaining text starts with space (letter with tanween is at end of word)
            if (remainingText.length >= 1 && remainingText[0] === SPACE) {
                // Check if next word exists and starts with a trigger letter
                if (nextWord && nextWord.length > 0) {
                    // Find the first Arabic letter in nextWord
                    for (let i = 0; i < nextWord.length; i++) {
                        if (isArabicLetter(nextWord[i])) {
                            if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[i])) {
                                return true;
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // Only check ن and م for other rules
    if (letterChar !== NOON && letterChar !== MEEM) return false;
    
    // Find the position of this letter in the word by counting Arabic letters
    let letterPos = -1;
    let currentIndex = 0;
    for (let i = 0; i < word.length; i++) {
        if (isArabicLetter(word[i])) {
            if (currentIndex === letterIndex) {
                letterPos = i;
                break;
            }
            currentIndex++;
        }
    }
    
    if (letterPos < 0) return false;
    
    // Count characters in the letter unit (letter + diacritics)
    let unitEndPos = letterPos;
    for (let i = letterPos; i < word.length; i++) {
        if (isArabicLetter(word[i]) && i > letterPos) {
            break; // Found next letter
        }
        unitEndPos = i + 1;
    }
    
    const remainingText = fullText.substring(unitEndPos);
    
    // Helper to get next Arabic letter, skipping diacritics
    const getNextArabicLetter = (text: string, startPos: number): { pos: number; letter: string | null } => {
        for (let i = startPos; i < text.length; i++) {
            if (isArabicLetter(text[i])) {
                return { pos: i, letter: text[i] };
            }
            if (text[i] === SPACE) {
                // Continue after space
                continue;
            }
        }
        return { pos: -1, letter: null };
    };
    
    // Rule 1: ن or م with shaddah (any type of shaddah, regardless of vowels)
    if (letterChar === NOON || letterChar === MEEM) {
        // Check for shaddah in multiple ways to ensure we catch it
        // 1. Check if shaddah is in the letter unit itself (parseWordIntoLetters attaches diacritics)
        const hasShaddahInLetter = letter.includes(SHADDAH);
        
        // 2. Check if shaddah appears immediately after the letter in remaining text
        const hasShaddahAfter = remainingText.length >= 1 && remainingText[0] === SHADDAH;
        
        // 3. Also check the original word at the letter position (in case parsing missed it)
        let hasShaddahInWord = false;
        if (letterPos >= 0 && letterPos < word.length) {
            // Check a few characters after the letter position for shaddah
            for (let i = letterPos + 1; i < Math.min(letterPos + 5, word.length); i++) {
                if (word[i] === SHADDAH) {
                    hasShaddahInWord = true;
                    break;
                }
                // Stop if we hit another Arabic letter
                if (isArabicLetter(word[i])) {
                    break;
                }
            }
        }
        
        if (hasShaddahInLetter || hasShaddahAfter || hasShaddahInWord) {
            // Highlight if it has shaddah, regardless of vowels
            return true;
        }
    }
    
    // Rule 2: ن with sukoon or without any vowel coming before trigger letters (same word or between words)
    if (letterChar === NOON) {
        if (hasVowel) {
            return false; // Exclude if has fatha, damma, or kasra
        }
        
        // Check if ن has sukoon or no vowel
        const hasSukun = letter.includes(SUKUN_UNICODE) || letter.includes(QURANIC_SUKUN);
        const hasNoVowel = !hasVowel && !hasSukun && !hasTanween;
        
        if (hasSukun || hasNoVowel) {
            // Check next letter in same word or next word
            const next = getNextArabicLetter(remainingText, 0);
            if (next.letter && GHUNNAH_TRIGGER_LETTERS.includes(next.letter)) {
                return true;
            }
            
            // Check if there's a space and next word starts with trigger letter
            if (remainingText.length >= 1 && remainingText[0] === SPACE) {
                if (nextWord && nextWord.length > 0) {
                    for (let i = 0; i < nextWord.length; i++) {
                        if (isArabicLetter(nextWord[i])) {
                            if (GHUNNAH_TRIGGER_LETTERS.includes(nextWord[i])) {
                                return true;
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
    
    // Rule 4: م (with vowel, sukoon, or without vowels) coming before another م or ب
    if (letterChar === MEEM) {
        if (hasVowel) {
            return false; // Exclude if has fatha, damma, or kasra
        }
        
        // Check if next letter is م or ب (in same word or next word)
        const next = getNextArabicLetter(remainingText, 0);
        if (next.letter && (next.letter === MEEM || next.letter === '\u0628')) {
            return true;
        }
        
        // Check if there's a space and next word starts with م or ب
        if (remainingText.length >= 1 && remainingText[0] === SPACE) {
            if (nextWord && nextWord.length > 0) {
                for (let i = 0; i < nextWord.length; i++) {
                    if (isArabicLetter(nextWord[i])) {
                        if (nextWord[i] === MEEM || nextWord[i] === '\u0628') {
                            return true;
                        }
                        break;
                    }
                }
            }
        }
    }
    
    return false;
};

// Check if a letter should be highlighted pink based on Madd rules
const shouldHighlightMadd = (letter: string, letterIndex: number, word: string, prevWord: string): boolean => {
    if (!letter || letter.length === 0 || !word) return false;
    
    const letterChar = letter[0]; // Get the base letter (first character)
    
    // Check if the letter unit contains any madd marker
    // (MADDAH U+0653, SMALL HIGH MADDA U+06E4, SMALL WAW U+06E5, SMALL YEH U+06E6)
    if (MADD_MARKERS.some(m => letter.includes(m))) {
        return true;
    }

    // Check if the current letter is a standalone madd marker
    if (MADD_MARKERS.includes(letterChar) || MADD_MARKERS.includes(letter)) {
        return true;
    }
    
    // Check if MADDAH appears immediately after this letter in the remaining text
    // Find the position of this letter in the word
    let letterPos = -1;
    let currentIndex = 0;
    for (let i = 0; i < word.length; i++) {
        if (isArabicLetter(word[i])) {
            if (currentIndex === letterIndex) {
                letterPos = i;
                break;
            }
            currentIndex++;
        }
    }
    
    if (letterPos >= 0) {
        // Count characters in the letter unit (letter + diacritics)
        let unitEndPos = letterPos;
        for (let i = letterPos; i < word.length; i++) {
            if (isArabicLetter(word[i]) && i > letterPos) {
                break;
            }
            unitEndPos = i + 1;
        }
        
        // Check if a madd marker appears immediately after this letter
        const remainingText = word.substring(unitEndPos);
        if (remainingText.length >= 1 && MADD_MARKERS.includes(remainingText[0])) {
            return true;
        }

        // Also check if a madd marker appears anywhere in the remaining diacritics of this letter
        for (let i = 0; i < Math.min(remainingText.length, 10); i++) {
            if (MADD_MARKERS.includes(remainingText[i])) {
                return true;
            }
            if (isArabicLetter(remainingText[i])) {
                break;
            }
        }
    }
    
    return false;
};

// Check if a letter should be highlighted light blue based on Qalqalah rules
const shouldHighlightQalqalah = (letter: string, letterIndex: number, word: string, isLastWordInVerse: boolean, isLastLetterOfWord: boolean): boolean => {
    if (!letter || letter.length === 0 || !word) return false;
    
    const letterChar = letter[0]; // Get the base letter (first character)
    
    // Check if the letter is one of the Qalqalah letters: ق, ط, ب, ج, د
    if (!QALQALAH_LETTERS.includes(letterChar)) {
        return false;
    }
    
    // Check if the letter has sukun (U+0652 or U+06E1)
    const SUKUN_UNICODE = '\u0652'; // U+0652 - Standard Sukun
    const QURANIC_SUKUN = '\u06E1'; // U+06E1 - Quranic Sukun
    const hasSukun = letter.includes(SUKUN_UNICODE) || letter.includes(QURANIC_SUKUN);
    
    // Check if it's at the end of the verse (last word and last letter)
    if (isLastWordInVerse && isLastLetterOfWord) {
        return true;
    }
    
    // Check if it has sukun
    if (hasSukun) {
        return true;
    }
    
    return false;
};


// Silent letters are marked in the Madinah Mushaf with U+06DF (Small High Rounded Zero).
// These letters are written but not pronounced (e.g. the alif in "أَنَا", the wāw in
// "أُولَٰئِكَ", the lām in الشَّمْس when reading wasl). Returns true if this letter is silent.
const shouldHighlightSilent = (letter: string): boolean => {
    if (!letter) return false;
    return letter.includes(SILENT_MARKER);
};

// Component for rendering a letter with error marking
const LetterWithError: React.FC<{
    letter: string;
    letterKey: string;
    mistake: Mistake | undefined;
    isEditing: boolean;
    errorText: string;
    onLetterClick: (key: string) => void;
    onTextChange: (text: string) => void;
    onTextSubmit: (key: string, text: string) => void;
    onTextCancel: () => void;
    showQalqalah: boolean;
    showGhunnah: boolean;
    showMadd: boolean;
    clickState: number; // 0 = none, 1 = yellow (pending), 2 = marked
    word: string; // Full word for Ghunnah context
    nextWord: string; // Next word for Ghunnah context
    prevWord: string; // Previous word for Madd context
    letterIndex: number; // Index of letter in word
    onLongPress?: (key: string) => void;
    isFocused?: boolean;
    isCursorActive?: boolean;
    joinLead?: boolean;
    joinTrail?: boolean;
}> = ({
    letter,
    letterKey,
    mistake,
    isEditing,
    errorText,
    onLetterClick,
    onTextChange,
    onTextSubmit,
    onTextCancel,
    showQalqalah,
    showGhunnah,
    showMadd,
    clickState,
    word,
    nextWord,
    prevWord,
    letterIndex,
    isLastWordInVerse,
    isLastLetterOfWord,
    onLongPress,
    isFocused,
    isCursorActive,
    joinLead,
    joinTrail,
}) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const longPressTimer = React.useRef<number | null>(null);
    const isLongPressActive = React.useRef(false);

    const cancelLongPress = () => {
        if (longPressTimer.current !== null) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const startLongPress = () => {
        if (!onLongPress) return;
        isLongPressActive.current = false;
        cancelLongPress();
        longPressTimer.current = window.setTimeout(() => {
            isLongPressActive.current = true;
            onLongPress(letterKey);
        }, 500);
    };
    
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const getLetterStyle = (): React.CSSProperties => {
        if (clickState === 1) return {
            backgroundColor: 'rgba(254,240,138,0.80)',
            borderBottom: '2px solid #ca8a04',
            borderRadius: '3px',
        };
        if (mistake) {
            if (mistake.errorType === 'tajweed') return {
                backgroundColor: 'rgba(134,239,172,0.70)',
                borderBottom: '2px solid #16a34a',
                borderRadius: '3px',
            };
            if (mistake.errorType === 'reading') return {
                backgroundColor: 'rgba(252,165,165,0.75)',
                borderBottom: '2px solid #dc2626',
                borderRadius: '3px',
            };
            // Mistake exists but errorType was cleared → yellow
            return {
                backgroundColor: 'rgba(254,240,138,0.80)',
                borderBottom: '2px solid #ca8a04',
                borderRadius: '3px',
            };
        }
        return {};
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (errorText.trim()) {
                onTextSubmit(letterKey, errorText.trim());
            } else {
                onTextCancel();
            }
        } else if (e.key === 'Escape') {
            onTextCancel();
        }
    };

    return (
        <span id={`letter-${letterKey}`} className="relative inline align-top" style={{ display: 'inline', fontFamily: 'inherit' }}>
            {isEditing && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-auto">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
                        <div className="flex items-center gap-1 px-2 py-1">
                            <input
                                ref={inputRef}
                                type="text"
                                value={errorText}
                                onChange={(e) => onTextChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => {
                                    setTimeout(() => {
                                        if (errorText.trim()) {
                                            onTextSubmit(letterKey, errorText.trim());
                                        } else {
                                            onTextCancel();
                                        }
                                    }, 200);
                                }}
                                className="flex-1 text-xs bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none border-0 p-0"
                                placeholder="Type..."
                                style={{ width: '80px' }}
                            />
                            <button
                                onClick={() => {
                                    if (errorText.trim()) {
                                        onTextSubmit(letterKey, errorText.trim());
                                    } else {
                                        onTextCancel();
                                    }
                                }}
                                className="w-4 h-4 flex items-center justify-center rounded bg-teal-500 dark:bg-orange-500 hover:bg-teal-600 dark:hover:bg-orange-600 transition-colors flex-shrink-0"
                                title="Enter"
                            >
                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {mistake && mistake.errorText && !isEditing && (
                <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-0.5 sm:mb-3 z-40 pointer-events-auto group"
                    style={{ zIndex: 40 }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.zIndex = '9999';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.zIndex = '40';
                    }}
                >
                    <div className={`px-1.5 py-0.5 text-[10px] leading-tight rounded-md sm:px-3 sm:py-1 sm:text-sm sm:rounded-lg shadow-lg whitespace-nowrap max-w-[180px] sm:max-w-[300px] font-medium transition-all ${
                        mistake.errorType === 'tajweed' 
                            ? 'bg-green-100 dark:bg-green-900/60 text-green-800 dark:text-green-200 border-2 border-green-300 dark:border-green-700'
                            : 'bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 border-2 border-red-300 dark:border-red-700'
                    } group-hover:shadow-2xl`} title={mistake.errorText}>
                        {mistake.errorText}
                    </div>
                </div>
            )}
            <span
                onClick={(e) => {
                    e.stopPropagation();
                    if (isLongPressActive.current) { isLongPressActive.current = false; return; }
                    onLetterClick(letterKey);
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                    startLongPress();
                }}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={startLongPress}
                onTouchEnd={cancelLongPress}
                onTouchCancel={cancelLongPress}
                className={`inline cursor-pointer transition-colors ${isCursorActive ? 'cursor-pointer-glow' : ''} ${
                    shouldHighlightSilent(letter)
                        ? '!text-slate-400 dark:!text-slate-500'
                        : `${showGhunnah && shouldHighlightGhunnah(letter, letterIndex, word, nextWord) ? '!text-green-600 dark:!text-green-400' : ''} ${showMadd && shouldHighlightMadd(letter, letterIndex, word, prevWord) ? '!text-pink-600 dark:!text-pink-400' : ''} ${showQalqalah && shouldHighlightQalqalah(letter, letterIndex, word, isLastWordInVerse, isLastLetterOfWord) ? '!text-sky-500 dark:!text-sky-400' : ''}`
                }`}
                // NOTE: do NOT add `position: relative` + `z-index` here. iOS Safari has a
                // long-standing bug where an INLINE element with position:relative and a
                // z-index intermittently fails to paint its background-color (the mistake
                // highlight) while absolutely-positioned children still render — which made
                // the annotation appear above a letter with no highlight on iPad. The
                // overlays (annotation, cursor dot, edit popup) anchor to the outer span,
                // and the iqlab meem has its own relative wrapper, so neither is needed here.
                // box-decoration-break:clone keeps the highlight painting if a letter wraps.
                style={{ display: 'inline', fontFamily: 'inherit', letterSpacing: '0', pointerEvents: 'auto', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone', ...getLetterStyle(), ...(isFocused ? { backgroundColor: 'rgba(139,92,246,0.30)', borderRadius: '4px', outline: '2.5px solid rgba(139,92,246,0.9)', outlineOffset: '2px' } : {}) }}
            >
                {hasIqlabMeem(letter) ? (
                    // Iqlab meem overlay. We strip the U+06E2 from the inline text (so the
                    // tanween renders cleanly) and re-draw it ourselves above the tanween.
                    // The tanween is a combining mark, so it always renders centred above its
                    // base letter — i.e. at the HORIZONTAL CENTRE of this unit, regardless of
                    // how wide the base letter is. So we anchor the meem to the centre with
                    // left:0/right:0 + text-align:center (width-independent) rather than a
                    // percentage offset (which only lands right for one specific letter width).
                    // The small translateX nudges it slightly "after" the tanween (leftward in
                    // RTL), and top raises it just above the tanween.
                    <span style={{ position: 'relative', display: 'inline' }}>
                        {(joinLead ? ZWJ : '') + letter.replace(/ۢ/g, '') + (joinTrail ? ZWJ : '')}
                        <span style={{ position: 'absolute', top: '-0.34em', left: 0, right: 0, textAlign: 'center', transform: 'translateX(-0.06em)', fontSize: '1em', lineHeight: 1, pointerEvents: 'none', fontFamily: "'Hafs', serif" }}>{IQLAB_HIGH_MEEM}</span>
                    </span>
                ) : (joinLead ? ZWJ : '') + letter + (joinTrail ? ZWJ : '')}
            </span>
        </span>
    );
};

LetterWithError.displayName = 'LetterWithError';

const TajweedWord: React.FC<{
    word: string;
    nextWord: string;
    isLastWordInVerse: boolean;
    showQalqalah: boolean;
    showGhunnah: boolean;
    showMadd: boolean;
}> = React.memo(({ word, nextWord, isLastWordInVerse, showQalqalah, showGhunnah, showMadd }) => {
    const units = parseWordIntoUnits(word);

    const getFirstArabicLetter = (w: string): string | null => {
        if (!w) return null;
        for (const char of w) {
            if (isArabicLetter(char)) return char;
        }
        return null;
    };

    const processUnitWithSpecialChars = (unitText: string, unitIndex: number, className: string = '') =>
        <span key={unitIndex} className={className}>{unitText}</span>;

    const renderedUnits = units.map((unit, index) => {

        // --- SILENT LETTER (always on, no toggle) ---
        // Letters bearing U+06DF (Small High Rounded Zero) are silent in continuous reading.
        // Examples: alif in "أَنَا", wāw in "أُولَٰئِكَ", lām in "ٱلشَّمْس". Show in grey.
        if (unit.includes(SILENT_MARKER)) {
            return processUnitWithSpecialChars(unit, index, 'text-slate-400 dark:text-slate-500');
        }

        // --- MADD RULE (Madd Far'ee — secondary madds) ---
        // Markers: U+0653 MADDAH ABOVE (Muttasil/Munfasil), U+06E4 SMALL HIGH MADDA (Lazim),
        // U+06E5 SMALL WAW & U+06E6 SMALL YEH (Madd Silah and similar sub-vowels).
        if (showMadd && MADD_MARKERS.some(m => unit.includes(m))) {
            return processUnitWithSpecialChars(unit, index, 'text-pink-600');
        }

        let ghunnahRuleApplied = false;

        // --- GHUNNAH RULES ---
        if (showGhunnah) {
            // Build full text context: current word + space + next word for pattern matching
            const fullText = word + (nextWord ? SPACE + nextWord : '');

            // Find the position of this unit's start in the word
            let unitStartPos = 0;
            for (let i = 0; i < index; i++) {
                unitStartPos += units[i].length;
            }

            // --- Tanween + ghunnah trigger ---
            // Any of the 3 tanweens (ً ٌ ٍ) followed by a ghunnah trigger letter in the next
            // word triggers Idghaam-with-Ghunnah / Iqlab / Ikhfaa — color the bearing letter green.
            const hasTanween = TANWEEN_GHUNNAH_TANWEEN_CHARS.some(t => unit.includes(t));
            if (hasTanween && nextWord) {
                let firstNextLetter: string | null = null;
                for (const ch of nextWord) {
                    if (isArabicLetter(ch)) { firstNextLetter = ch; break; }
                }
                if (firstNextLetter && GHUNNAH_TRIGGER_LETTERS.includes(firstNextLetter)) {
                    ghunnahRuleApplied = true;
                }
            }

            // Check if this unit starts with U+0646 (ن) or U+0645 (م)
            const unitStartsWithNoon = !ghunnahRuleApplied && unit.startsWith(NOON);
            const unitStartsWithMeem = !ghunnahRuleApplied && unit.startsWith(MEEM);
            
            if (unitStartsWithNoon || unitStartsWithMeem) {
                // Find the exact position of the letter in the full text
                const letterPos = unitStartPos;
                const letter = fullText[letterPos];
                
                // Skip diacritics in the current unit to get the position after the letter and its diacritics
                let posAfterLetter = letterPos + 1;
                // Skip any diacritics that might be in the same unit
                while (posAfterLetter < fullText.length && posAfterLetter < unitStartPos + unit.length) {
                    const char = fullText[posAfterLetter];
                    // Check if it's a diacritic (not an Arabic letter and not space)
                    if (!isArabicLetter(char) && char !== SPACE) {
                        posAfterLetter++;
                    } else {
                        break;
                    }
                }
                
                const remainingText = fullText.substring(posAfterLetter);
                
                // Rule 1: U+0646 followed by U+0652 followed by trigger letters
                if (letter === NOON && remainingText.length >= 2) {
                    if (remainingText[0] === SUKUN_UNICODE && GHUNNAH_TRIGGER_LETTERS.includes(remainingText[1])) {
                        ghunnahRuleApplied = true;
                    }
                    // Rule 2: U+0646 followed by trigger letters (no sukun) - skip diacritics first
                    else {
                        let nextLetterPos = 0;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos]) && remainingText[nextLetterPos] !== SPACE) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && GHUNNAH_TRIGGER_LETTERS.includes(remainingText[nextLetterPos])) {
                            ghunnahRuleApplied = true;
                        }
                    }
                    // Rule 3: U+0646 followed by U+0652 followed by space followed by trigger letters
                    if (!ghunnahRuleApplied && remainingText.length >= 3 && remainingText[0] === SUKUN_UNICODE && remainingText[1] === SPACE) {
                        let nextLetterPos = 2;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos])) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && GHUNNAH_TRIGGER_LETTERS.includes(remainingText[nextLetterPos])) {
                            ghunnahRuleApplied = true;
                        }
                    }
                    // Rule 4: U+0646 followed by space followed by trigger letters
                    if (!ghunnahRuleApplied && remainingText.length >= 2 && remainingText[0] === SPACE) {
                        let nextLetterPos = 1;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos])) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && GHUNNAH_TRIGGER_LETTERS.includes(remainingText[nextLetterPos])) {
                            ghunnahRuleApplied = true;
                        }
                    }
                }
                
                // Rule 5: U+0646 or U+0645 followed by U+0651 (shaddah)
                if (!ghunnahRuleApplied) {
                    // Check if shaddah is in the unit itself or right after
                    if (unit.includes(SHADDAH) || (remainingText.length >= 1 && remainingText[0] === SHADDAH)) {
                        ghunnahRuleApplied = true;
                    }
                }
                
                // Rule 6-9: U+0645 rules
                if (!ghunnahRuleApplied && letter === MEEM) {
                    // Rule 6: U+0645 followed by U+0652 followed by U+0645 or U+0628
                    if (remainingText.length >= 2 && remainingText[0] === SUKUN_UNICODE) {
                        let nextLetterPos = 1;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos])) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && (remainingText[nextLetterPos] === MEEM || remainingText[nextLetterPos] === '\u0628')) {
                            ghunnahRuleApplied = true;
                        }
                    }
                    // Rule 7: U+0645 followed by U+0645 or U+0628 (skip diacritics)
                    if (!ghunnahRuleApplied && remainingText.length >= 1) {
                        let nextLetterPos = 0;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos]) && remainingText[nextLetterPos] !== SPACE) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && (remainingText[nextLetterPos] === MEEM || remainingText[nextLetterPos] === '\u0628')) {
                            ghunnahRuleApplied = true;
                        }
                    }
                    // Rule 8: U+0645 followed by U+0652 followed by space followed by U+0645 or U+0628
                    if (!ghunnahRuleApplied && remainingText.length >= 3 && remainingText[0] === SUKUN_UNICODE && remainingText[1] === SPACE) {
                        let nextLetterPos = 2;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos])) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && (remainingText[nextLetterPos] === MEEM || remainingText[nextLetterPos] === '\u0628')) {
                            ghunnahRuleApplied = true;
                        }
                    }
                    // Rule 9: U+0645 followed by space followed by U+0645 or U+0628
                    if (!ghunnahRuleApplied && remainingText.length >= 2 && remainingText[0] === SPACE) {
                        let nextLetterPos = 1;
                        while (nextLetterPos < remainingText.length && !isArabicLetter(remainingText[nextLetterPos])) {
                            nextLetterPos++;
                        }
                        if (nextLetterPos < remainingText.length && (remainingText[nextLetterPos] === MEEM || remainingText[nextLetterPos] === '\u0628')) {
                            ghunnahRuleApplied = true;
                        }
                    }
                }
            }
        }

        if (ghunnahRuleApplied) {
            return processUnitWithSpecialChars(unit, index, 'text-green-600');
        }

        // --- QALQALAH RULE ---
        if (showQalqalah) {
             const baseLetter = unit[0];
             if (QALQALAH_LETTERS.includes(baseLetter)) {
                 const hasSukun = unit.includes(SUKUN);
                 // Is this unit the last *letter* of the word?
                 let isLastLetterOfWord = true;
                 for (let i = index + 1; i < units.length; i++) {
                     if (getFirstArabicLetter(units[i])) {
                         isLastLetterOfWord = false;
                         break;
                     }
                 }
                 
                 if (hasSukun || (isLastWordInVerse && isLastLetterOfWord)) {
                     return processUnitWithSpecialChars(unit, index, 'text-sky-500 dark:text-sky-400');
                 }
             }
        }
        
        return processUnitWithSpecialChars(unit, index);
    });

    // If the word carries a mark the selected font renders wrong (silent U+06DF,
    // imāla U+06EA, ishmām U+06EB), render the WHOLE word in the corrective font
    // so letters stay joined and the mark attaches (see correctiveWordFont).
    const wordFont = correctiveWordFont(word);
    if (wordFont) {
        return <span style={{ fontFamily: wordFont }}>{renderedUnits}</span>;
    }
    return <>{renderedUnits}</>;
});


type SurahStatus = {
    id: number;
    name: string; // The Arabic name
    transliteratedName: string;
    englishName: string;
    status: 'completed' | 'in-progress' | 'not-started';    // reading/recitation
    memStatus: 'completed' | 'in-progress' | 'not-started'; // memorization (hifdh)
};

const SurahProgressBar: React.FC<{ surahStatuses: SurahStatus[], title: string, type: 'reading' | 'memorization' }> = ({ surahStatuses, title, type }) => {
    const colors = {
        reading: {
            completed: 'bg-teal-400',
            inProgress: 'bg-amber-400',
            notStarted: 'bg-slate-200 hover:bg-slate-300'
        },
        memorization: {
            completed: 'bg-sky-400',
            inProgress: 'bg-indigo-400',
            notStarted: 'bg-slate-200 hover:bg-slate-300'
        }
    };

    return (
        <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">{title}</h4>
            <div className="flex flex-wrap gap-1">
                {surahStatuses.map(({ id, transliteratedName, status, memStatus }) => {
                    const effectiveStatus = type === 'memorization' ? memStatus : status;
                    const statusClass = {
                        'completed': colors[type].completed,
                        'in-progress': colors[type].inProgress,
                        'not-started': colors[type].notStarted
                    }[effectiveStatus];
                    return (
                        <div key={id} className="relative group flex-grow" style={{ minWidth: '0.5%' }}>
                            <div
                                className={`h-4 rounded-sm w-full ${statusClass} transition-colors`}
                            />
                            <div className="absolute bottom-full mb-2 w-max px-2 py-1 bg-gray-800 dark:bg-black text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20 left-1/2 -translate-x-1/2">
                                {transliteratedName}
                                <svg className="absolute text-gray-800 dark:text-black h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255">
                                    <polygon className="fill-current" points="0,0 127.5,127.5 255,0"/>
                                </svg>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SearchResultsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    results: any[];
    query: string;
    onSelect: (verseKey: string) => void;
}> = ({ isOpen, onClose, results, query, onSelect }) => {
    const { t } = useI18n();
    if (!isOpen) return null;

    const highlightText = (text: string, query: string) => {
        if (!query) return text;
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        return text.split(regex).map((part, index) => 
            regex.test(part) 
                ? <strong key={index} className="bg-yellow-200 dark:bg-yellow-500/50 dark:text-yellow-200 rounded px-1">{part}</strong> 
                : part
        );
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                        {t('liveSession.searchResultsTitle', { query })}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-300 dark:hover:text-white text-2xl">&times;</button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-2 pr-2">
                    {results.map((result) => (
                        <div 
                            key={result.verse_key} 
                            onClick={() => onSelect(result.verse_key)}
                            className="p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 cursor-pointer border dark:border-gray-700"
                        >
                            <p className="font-bold text-teal-600 dark:text-orange-500 mb-1">Surah {result.verse_key.replace(':', ', Ayah ')}</p>
                            <p className="font-quranic text-xl" dir="rtl">
                                {highlightText(result.text, query)}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};


/** Returns true when verse (surahNum, ayahNum) falls inside any of the given homework ranges. */
const isVerseInHomeworkRange = (
    surahNum: number,
    ayahNum: number,
    ranges: Array<{ id: string; startSurah: number; startAyah: number; endSurah: number; endAyah: number }>
): boolean => {
    if (!ranges || ranges.length === 0) return false;
    for (const r of ranges) {
        const start = r.startSurah * 10000 + r.startAyah;
        const end   = r.endSurah   * 10000 + r.endAyah;
        const cur   = surahNum     * 10000 + ayahNum;
        if (cur >= start && cur <= end) return true;
    }
    return false;
};

// ── 4-colour log model ──────────────────────────────────────────────────────
// green = hifz (reading implied) · orange = read only · purple = homework ·
// blue = tafsir. Tafsir layered on top of another state shows as a blue underline.
const VERSE_BG: Record<string, string> = {
    green:  'bg-green-100 dark:bg-green-900/40',
    orange: 'bg-orange-100 dark:bg-orange-900/30',
    purple: 'bg-purple-100 dark:bg-purple-900/30',
    blue:   'bg-blue-100 dark:bg-blue-900/30',
    none:   '',
};
const VERSE_UNDERLINE = 'border-b-4 border-blue-400 dark:border-blue-500';
const VERSE_MARKER_FILL: Record<string, string> = {
    green: '#86efac', orange: '#fdba74', purple: '#d8b4fe', blue: '#93c5fd', none: 'currentColor',
};

const StudentProgressPage: React.FC<StudentProgressPageProps> = ({ student, students, studentProgress, studentMistakes, recitationAchievements, memorizationAchievements, onUpdateProgress, onCycleMistakeLevel, onClearMistake, onLogRecitationRange, onRemoveRecitationAchievement, onLogMemorizationRange, onRemoveMemorizationAchievement, onLogTafseerRange, onRemoveTafseerRange, onLogHomework, onGoBack, readOnly = false, toolbarStickyTop = 100, notesStudentId, jumpToVerseKey, nameCardExtra, homeworkRanges = [], onMistakeBuzz, externalBuzzTrigger, onLetterFocus, focusedLetterKey, onCursorMove, cursorLetterKey }) => {
    // ── Log-type modal state ──────────────────────────────────────────────────
    const [pendingLogRange, setPendingLogRange] = useState<{ start: Progress; end: Progress } | null>(null);
    const [readOnlyAudioVerse, setReadOnlyAudioVerse] = useState<{ surah: number; ayah: number } | null>(null);
    const [readOnlySpeed, setReadOnlySpeed] = useState(1);
    const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
    const surahNavScrollRef = useRef<HTMLDivElement | null>(null);
    const readOnlyAudioRef = useRef<HTMLAudioElement | null>(null);
    // true while a tap on an ayah number is playing the surah sequentially from
    // that ayah to the end (vs a single-verse play from tapping the verse text).
    const readOnlySeqRef = useRef(false);

    /** Start/stop sequential recitation from an ayah number (student portal). */
    const handleAyahNumberRecite = (surah: number, ayah: number) => {
        const audio = readOnlyAudioRef.current;
        if (!audio) return;
        // A tap while anything is playing simply stops it.
        if (readOnlyAudioVerse) {
            audio.pause();
            readOnlySeqRef.current = false;
            setReadOnlyAudioVerse(null);
            return;
        }
        // Otherwise start playing from this ayah and continue to the surah's end.
        readOnlySeqRef.current = true;
        audio.pause();
        audio.src = audioUrl(surah, ayah);
        audio.playbackRate = readOnlySpeed;
        audio.play().catch(() => {});
        setReadOnlyAudioVerse({ surah, ayah });
    };
    // ── Tadabbur (verse notes) ────────────────────────────────────────────────
    const [tadabburMode, setTadabburMode] = useState(false);
    const [verseNotes, setVerseNotes] = useState<Record<string, string>>({});
    /** Tutor-side toggle: show / hide student Tadabbur notes during a live session */
    const [showStudentNotes, setShowStudentNotes] = useState(true);
    const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);
    const [editingNoteText, setEditingNoteText] = useState('');
    const [savingNoteKey, setSavingNoteKey] = useState<string | null>(null);
    const [logTypeStep, setLogTypeStep] = useState<'type' | 'quality' | 'homework-note' | null>(null);
    const [selectedLogType, setSelectedLogType] = useState<LogType | null>(null);
    const [logQuality, setLogQuality] = useState<number>(8);
    const [homeworkNote, setHomeworkNote] = useState<string>('');
    // true when the popup was opened by clicking an already-logged verse (shows only revision/tafseer)
    const [errorType, setErrorType] = useState<'tajweed' | 'reading'>('reading');
    const [selectedSurahId, setSelectedSurahId] = useState<number>(studentProgress?.surah || 1);
    const [verses, setVerses] = useState<QuranVerse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [scrollToVerseKey, setScrollToVerseKey] = useState<string | null>(studentProgress ? `${studentProgress.surah}:${studentProgress.ayah}` : null);
    const [showScrollTop, setShowScrollTop] = useState(false); // floating "back to surah start" button
    // Default to text-7xl on desktop (≥768 px), text-4xl on mobile
    // Desktop opens large (text-7xl); phones open at 1rem (text-base, fontSize 1)
    // so the verses + mistake annotations fit without overlapping.
    const [fontSize, setFontSize] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth >= 768 ? 7 : 1
    );
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showTranslation, setShowTranslation] = useState(false);
    const [showQalqalah, setShowQalqalah] = useState(false);
    const [showGhunnah, setShowGhunnah] = useState(false);
    const [showMadd, setShowMadd] = useState(false);
    const [showTajweedMenu, setShowTajweedMenu] = useState(false);
    // ── Focus / word-by-word reading mode ───────────────────────────────────
    const [focusMode, setFocusMode] = useState(false);
    const [currentAyah, setCurrentAyah] = useState(1);
    const currentAyahRef        = useRef(1);
    const carouselContainerRef  = useRef<HTMLDivElement>(null);
    const carouselStripRef      = useRef<HTMLDivElement>(null);
    const verseBarRef           = useRef<HTMLDivElement>(null);
    const verseFirstWordEls     = useRef<Map<number, HTMLDivElement>>(new Map());
    const scrollKeyHeldRef      = useRef<'left' | 'right' | null>(null);
    const scrollVelocityRef     = useRef(0);
    const scrollTransformRef    = useRef(0);          // current translateX in px (imperative)
    const progressBarFillRef    = useRef<HTMLDivElement>(null);
    // Refs that mirror state values so the RAF loop can read them without stale closures
    const isAutoScrollingRef    = useRef(false);
    const scrollSpeedRef        = useRef(50);
    const tajweedMenuRef    = useRef<HTMLDivElement>(null);
    // ── Tools menu (combines Translation + Tajweed + Teacher Notes) ───────
    const [showToolsMenu, setShowToolsMenu] = useState(false);
    const toolsMenuRef = useRef<HTMLDivElement>(null);

    // ── Teacher's Notes popup ────────────────────────────────────────────────
    const [teacherNote, setTeacherNote] = useState(student.teacherNote ?? '');
    const noteWindowRef = useRef<Window | null>(null);
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [isTranslationLoading, setIsTranslationLoading] = useState(false);
    const [translationError, setTranslationError] = useState<string | null>(null);
    const [tafsirs, setTafsirs] = useState<Record<string, string>>({});
    const [isTafsirLoading, setIsTafsirLoading] = useState(false);
    const [tafsirError, setTafsirError] = useState<string | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState(50); // Default speed 1-100
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearchResultsModalOpen, setIsSearchResultsModalOpen] = useState(false);
    const [selectionStart, setSelectionStart] = useState<Progress | null>(null);
    const [currentPageRange, setCurrentPageRange] = useState<{ start: number; end: number }>({ start: 1, end: 5 });
    const [confirmModalState, setConfirmModalState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });


    const [hiddenRanges, setHiddenRanges] = useState<{ start: Progress; end: Progress }[]>([]);
    const [longPressStart, setLongPressStart] = useState<Progress | null>(null);
    
    // Letter error marking state
    const [editingLetterKey, setEditingLetterKey] = useState<string | null>(null);
    const [errorTextInput, setErrorTextInput] = useState<string>('');
    
    // Memorization practice state (counter for tracking recitation count)
    const [memorizationCounter, setMemorizationCounter] = useState<number>(0);
    const [showCounter, setShowCounter] = useState(false);
    const [showTryAgain, setShowTryAgain] = useState(false);

    const hoveredVerse = useRef<{ surah: number; ayah: number } | null>(null);
    const longPressTimer = useRef<number | null>(null);
    const longPressFired = useRef(false);
    const prevSurahStatusesRef = useRef<SurahStatus[]>();
    const scrollIntervalRef = useRef<number | null>(null);
    const letterClickStates = useRef<Record<string, number>>({}); // Track click states: 0 = none, 1 = yellow (pending), 2 = marked
    const quranBodyRef = useRef<HTMLDivElement>(null); // For scroll-to-top on page navigation
    const [clickStateUpdateTrigger, setClickStateUpdateTrigger] = useState(0); // Force re-render when click states change
    const [showMistakeHighlight, setShowMistakeHighlight] = useState(false);
    const mistakeSoundRef = useRef<(() => void) | null>(null);
    // Keep onMistakeBuzz in a ref so the keydown handler (registered once with []
    // deps) always calls the latest prop value without stale-closure issues.
    const onMistakeBuzzRef = useRef(onMistakeBuzz);
    useEffect(() => { onMistakeBuzzRef.current = onMistakeBuzz; }, [onMistakeBuzz]);

    // Keep onLetterFocus in a ref for the same reason (used in a stable callback).
    const onLetterFocusRef = useRef(onLetterFocus);
    useEffect(() => { onLetterFocusRef.current = onLetterFocus; }, [onLetterFocus]);

    // Cursor mode (C key toggle, tutor side only).
    const [cursorModeActive, setCursorModeActive] = useState(false);
    const cursorModeRef = useRef(false);
    useEffect(() => { cursorModeRef.current = cursorModeActive; }, [cursorModeActive]);
    // The letter the tutor's own cursor is over — mirrors the glow the student
    // sees so the tutor can confirm exactly which letter they're pointing at.
    const [localCursorKey, setLocalCursorKey] = useState<string | null>(null);
    const onCursorMoveRef = useRef(onCursorMove);
    useEffect(() => { onCursorMoveRef.current = onCursorMove; }, [onCursorMove]);
    const { t } = useI18n();

    const handleIncreaseSpeed = () => setScrollSpeed(prev => Math.min(100, prev + 5));
    const handleDecreaseSpeed = () => setScrollSpeed(prev => Math.max(1, prev - 5));

    // ── Close tajweed menu on outside click ──────────────────────────────────
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (tajweedMenuRef.current && !tajweedMenuRef.current.contains(e.target as Node)) {
                setShowTajweedMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── ReadOnly hidden audio: update playback rate live ─────────────────────
    useEffect(() => {
        if (readOnlyAudioRef.current) {
            readOnlyAudioRef.current.playbackRate = readOnlySpeed;
        }
    }, [readOnlySpeed]);

    // ── Tadabbur: load notes when notesStudentId is available ─────────────────
    useEffect(() => {
        if (!notesStudentId) return;
        loadVerseNotes(notesStudentId)
            .then(setVerseNotes)
            .catch(err => console.warn('[Tadabbur] load notes failed:', err));
    }, [notesStudentId]);

    // ── Tadabbur: save / delete a note then update local state ────────────────
    const handleSaveNote = useCallback(async (surahNum: number, ayahNum: number, text: string) => {
        if (!notesStudentId) return;
        const key = `${surahNum}:${ayahNum}`;
        setSavingNoteKey(key);
        try {
            await saveVerseNote(notesStudentId, surahNum, ayahNum, text);
            setVerseNotes(prev => {
                const trimmed = text.trim();
                if (trimmed) return { ...prev, [key]: trimmed };
                const next = { ...prev };
                delete next[key];
                return next;
            });
            setEditingNoteKey(null);
            setEditingNoteText('');
        } catch (err) {
            console.error('[Tadabbur] save failed:', err);
        } finally {
            setSavingNoteKey(null);
        }
    }, [notesStudentId]);

    // ── Teacher's Notes popup + postMessage listener ─────────────────────────
    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type !== 'quran_teacher_note' || e.data?.studentId !== student.id) return;
            const val: string = e.data.value ?? '';
            setTeacherNote(val);
            saveStudentTeacherNote(student.id, val);
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [student.id]);

    const openTeacherNoteWindow = useCallback(() => {
        if (noteWindowRef.current && !noteWindowRef.current.closed) {
            noteWindowRef.current.focus();
            return;
        }
        const win = window.open('', `quran_note_${student.id}`, 'width=820,height=750,resizable=yes,scrollbars=yes');
        if (!win) return;
        noteWindowRef.current = win;
        // Escape only the initial raw value for safe JSON embedding
        const rawNote = teacherNote ?? '';
        const studentIdStr = student.id;
        const studentName = student.name;
        // JSON-encode the raw string so it survives embedding in JS
        const jsonNote = JSON.stringify(rawNote);
        const jsonStudentId = JSON.stringify(studentIdStr);
        win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Teacher’s Notes — ${studentName}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f8fafc;display:flex;flex-direction:column;height:100vh;padding:16px;gap:10px}
    header{display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    h1{font-size:16px;font-weight:700;color:#1e293b}
    .sub{font-size:12px;color:#64748b;margin-top:2px}
    .status{font-size:11px;font-weight:600;color:#94a3b8}
    .status.saving{color:#f59e0b}.status.saved{color:#22c55e}
    #notes-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px}
    .empty{text-align:center;color:#94a3b8;font-size:13px;padding:32px 0}
    .note-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;position:relative}
    .note-date{font-size:11px;color:#94a3b8;font-weight:600;margin-bottom:5px}
    .note-text{font-size:13.5px;color:#334155;white-space:pre-wrap;line-height:1.6}
    .del-btn{position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:#cbd5e1;font-size:16px;line-height:1;padding:2px 5px;border-radius:4px}
    .del-btn:hover{color:#ef4444;background:#fef2f2}
    .add-area{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px;flex-shrink:0}
    .new-note{width:100%;padding:8px 10px;font-size:13.5px;border:1px solid #e2e8f0;border-radius:7px;resize:vertical;min-height:72px;font-family:inherit;color:#1e293b;outline:none}
    .new-note:focus{border-color:#0d9488;box-shadow:0 0 0 2px rgba(13,148,136,.15)}
    .add-btn{margin-top:7px;padding:7px 18px;background:#0d9488;color:#fff;border:none;border-radius:7px;font-weight:600;font-size:13px;cursor:pointer}
    .add-btn:hover{background:#0f766e}
  </style>
</head>
<body>
  <header>
    <div><h1>🗒️ Teacher’s Notes</h1><div class="sub">${studentName}</div></div>
    <span class="status" id="st"></span>
  </header>
  <div id="notes-list"></div>
  <div class="add-area">
    <textarea class="new-note" id="new-note" placeholder="Write a new note…"></textarea>
    <button class="add-btn" onclick="addNote()">+ Add Note</button>
  </div>
  <script>
    var SEP='\\n\\n---\\n\\n';
    var STUDENT_ID=${jsonStudentId};
    var notes=parseNotes(${jsonNote});
    renderNotes();

    function parseNotes(raw){
      if(!raw||!raw.trim())return[];
      var entries=raw.indexOf(SEP)!==-1?raw.split(SEP):[raw];
      return entries.filter(function(e){return e.trim();}).map(function(entry){
        var m=entry.match(/^\\[([^\\]]+)\\]\\n([\\s\\S]*)$/);
        if(m)return{date:m[1],text:m[2].trim()};
        return{date:'',text:entry.trim()};
      });
    }
    function serializeNotes(){
      return notes.map(function(n){return'['+n.date+']\\n'+n.text;}).join(SEP);
    }
    function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
    function renderNotes(){
      var list=document.getElementById('notes-list');
      if(!notes.length){list.innerHTML='<div class="empty">No notes yet — add your first note below.</div>';return;}
      list.innerHTML=notes.map(function(n,i){
        return '<div class="note-card">'
          +(n.date?'<div class="note-date">'+esc(n.date)+'</div>':'')
          +'<div class="note-text">'+esc(n.text)+'</div>'
          +'<button class="del-btn" title="Delete" onclick="deleteNote('+i+')">×</button>'
          +'</div>';
      }).join('');
    }
    function addNote(){
      var ta=document.getElementById('new-note');
      var text=ta.value.trim();
      if(!text)return;
      var now=new Date();
      var date=now.toLocaleDateString('en-GB',{year:'numeric',month:'short',day:'numeric'})
               +' '+now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      notes.unshift({date:date,text:text});
      ta.value='';
      renderNotes();
      save();
    }
    function deleteNote(i){
      if(!confirm('Delete this note?'))return;
      notes.splice(i,1);
      renderNotes();
      save();
    }
    function save(){
      var val=serializeNotes();
      var st=document.getElementById('st');
      st.className='status saving';st.textContent='Saving…';
      if(window.opener&&!window.opener.closed){
        window.opener.postMessage({type:'quran_teacher_note',studentId:STUDENT_ID,value:val},'*');
        setTimeout(function(){st.className='status saved';st.textContent='✓ Saved';},400);
      }
    }
    document.getElementById('new-note').addEventListener('keydown',function(e){
      if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();addNote();}
    });
  <\/script>
</body>
</html>`);
        win.document.close();
    }, [student.id, student.name, teacherNote]);

    // Keep refs in sync so the RAF loop always reads current values without stale closures
    useEffect(() => { isAutoScrollingRef.current = isAutoScrolling; }, [isAutoScrolling]);
    useEffect(() => { scrollSpeedRef.current = scrollSpeed; }, [scrollSpeed]);

    // External jump — navigate to a specific verse when jumpToVerseKey changes
    useEffect(() => {
        if (!jumpToVerseKey) return;
        const [surahNum] = jumpToVerseKey.split(':').map(Number);
        if (surahNum && !isNaN(surahNum)) {
            setSelectedSurahId(surahNum);
            setScrollToVerseKey(jumpToVerseKey);
        }
    }, [jumpToVerseKey]);

    // Navigate carousel to the first word of a given ayah
    const scrollToAyah = useCallback((targetAyah: number) => {
        const el        = verseFirstWordEls.current.get(targetAyah);
        const container = carouselContainerRef.current;
        const strip     = carouselStripRef.current;
        if (!el || !container || !strip) return;
        const containerW = container.offsetWidth;
        const minT = -(Math.max(0, strip.offsetWidth - containerW));
        const maxT = 0;
        // Use getBoundingClientRect to get position relative to the strip regardless
        // of offsetParent — the diff cancels out the current translateX transform.
        const elLeftInStrip = el.getBoundingClientRect().left - strip.getBoundingClientRect().left;
        const targetT = Math.max(minT, Math.min(maxT, containerW / 2 - (elLeftInStrip + el.offsetWidth / 2)));
        scrollTransformRef.current = targetT;
        scrollVelocityRef.current  = 0;
        strip.style.transform = `translateX(${targetT}px)`;
        setCurrentAyah(targetAyah);
        currentAyahRef.current = targetAyah;
        if (progressBarFillRef.current && minT !== 0) {
            const pct = (targetT - minT) / (maxT - minT);
            progressBarFillRef.current.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
        }
    }, []);

    type FocusItem =
        | { kind: 'word';   word: string; surah: number; ayah: number; wordIdx: number }
        | { kind: 'marker'; surah: number; ayah: number };

    const focusWordList = useMemo<FocusItem[]>(() => {
        const list: FocusItem[] = [];
        verses.forEach(verse => {
            const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
            const words = splitVerseWords(verse.text_uthmani).filter(w => w.trim());
            words.forEach((word, wordIdx) => {
                list.push({ kind: 'word', word, surah: surahNum, ayah: ayahNum, wordIdx });
            });
            // Insert verse-end marker so ayah number appears between verses
            list.push({ kind: 'marker', surah: surahNum, ayah: ayahNum });
        });
        return list;
    }, [verses]);

    // Reset carousel to start when focusWordList changes (new surah loaded)
    useEffect(() => {
        if (!focusMode) return;
        // Note: verseFirstWordEls is kept up-to-date by inline ref callbacks on
        // every render — no manual clear needed here (clearing would briefly empty
        // the map before the next re-render repopulates it, causing missed clicks).
        const strip     = carouselStripRef.current;
        const container = carouselContainerRef.current;
        // Defer one frame so new DOM is fully laid out
        const id = requestAnimationFrame(() => {
            if (!strip || !container) return;
            const minT = -(Math.max(0, strip.offsetWidth - container.offsetWidth));
            scrollTransformRef.current = minT;
            scrollVelocityRef.current  = 0;
            strip.style.transform = `translateX(${minT}px)`;
            if (progressBarFillRef.current) progressBarFillRef.current.style.width = '0%';
            setCurrentAyah(1);
            currentAyahRef.current = 1;
        });
        return () => cancelAnimationFrame(id);
    }, [focusWordList, focusMode]);

    // Keep the active verse number visible in the verse bar
    useEffect(() => {
        if (!focusMode || !verseBarRef.current) return;
        const bar = verseBarRef.current;
        const btn = bar.querySelector<HTMLElement>(`[data-versenum="${currentAyah}"]`);
        btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [currentAyah, focusMode]);

    useEffect(() => {
        const handleManualInteraction = () => { if (isAutoScrolling) setIsAutoScrolling(false); };
        // In focus mode the horizontal RAF loop drives scrolling — skip vertical scroll
        if (isAutoScrolling && !focusMode) {
            const intervalDelay = 155 - (scrollSpeed * 1.5);
            scrollIntervalRef.current = window.setInterval(() => {
                if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) setIsAutoScrolling(false);
                else window.scrollBy(0, 1);
            }, intervalDelay);
            window.addEventListener('wheel', handleManualInteraction);
            window.addEventListener('touchmove', handleManualInteraction);
        } else if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
        return () => {
            if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
            window.removeEventListener('wheel', handleManualInteraction);
            window.removeEventListener('touchmove', handleManualInteraction);
        };
    }, [isAutoScrolling, scrollSpeed, focusMode]);

    // Initialize mistake sound effect
    useEffect(() => {
        // Create a simple error sound using Web Audio API
        const createMistakeSound = () => {
            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.type = 'sine';
                oscillator.frequency.value = 200; // Low frequency for error sound
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            } catch (error) {
                console.warn('Could not play mistake sound:', error);
            }
        };
        
        // Store the function in a ref so we can call it
        mistakeSoundRef.current = createMistakeSound;
    }, []);

    // React to a buzz broadcast from the tutor (student-side only).
    // externalBuzzTrigger is an incrementing counter; every new value means
    // the tutor just pressed Ctrl — show the red flash + play the sound here too.
    useEffect(() => {
        if (externalBuzzTrigger === undefined || externalBuzzTrigger === 0) return;
        setShowMistakeHighlight(true);
        if (mistakeSoundRef.current) mistakeSoundRef.current();
        setTimeout(() => setShowMistakeHighlight(false), 500);
    }, [externalBuzzTrigger]);

    // Highlighted letter key — set when tutor long-presses a letter and the
    // broadcast arrives on the student side via focusedLetterKey prop.
    const [highlightedLetterKey, setHighlightedLetterKey] = useState<string | null>(null);
    const highlightClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!focusedLetterKey) return;
        setHighlightedLetterKey(focusedLetterKey);
        if (highlightClearTimer.current) clearTimeout(highlightClearTimer.current);
        highlightClearTimer.current = setTimeout(() => setHighlightedLetterKey(null), 3000);
        // Element may not be in the DOM yet if we're navigating to a different
        // surah/page — retry up to 5 times with increasing delays.
        const tryScroll = (attempt: number) => {
            const el = document.getElementById(`letter-${focusedLetterKey}`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (attempt < 5) {
                setTimeout(() => tryScroll(attempt + 1), 300 + attempt * 200);
            }
        };
        tryScroll(0);
    }, [focusedLetterKey]);

    // Stable callback for tutor long-press: highlights locally (instant feedback)
    // then broadcasts to the student. Uses refs so it never goes stale.
    const handleLetterLongPress = useCallback((key: string) => {
        setHighlightedLetterKey(key);
        if (highlightClearTimer.current) clearTimeout(highlightClearTimer.current);
        highlightClearTimer.current = setTimeout(() => setHighlightedLetterKey(null), 3000);
        onLetterFocusRef.current?.(key);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            // Prevent Enter from scrolling the page while the Quran view is active
            if (event.key === 'Enter') { event.preventDefault(); return; }

            if (event.code === 'Space') {
                event.preventDefault();
                setIsAutoScrolling(prev => !prev);
            }

            // Ctrl key for mistake indication
            if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                setShowMistakeHighlight(true);
                if (mistakeSoundRef.current) mistakeSoundRef.current();
                setTimeout(() => setShowMistakeHighlight(false), 500);
                // Notify parent so it can broadcast the buzz to the student's portal
                onMistakeBuzzRef.current?.();
            }

            // Repetition counter (+ / 0)
            if (event.key === '+' || event.key === '=') {
                event.preventDefault();
                setMemorizationCounter(prev => { const n = prev + 1; setShowCounter(true); setTimeout(() => setShowCounter(false), 1500); return n; });
            } else if (event.key === '0') {
                event.preventDefault();
                setMemorizationCounter(0);
                setShowTryAgain(true);
                if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 100]);
                setTimeout(() => setShowTryAgain(false), 1500);
            }

            // H key — hide/reveal hovered verse
            if (event.key.toLowerCase() === 'h') {
                event.preventDefault();
                const hv = hoveredVerse.current;
                if (hv) {
                    const verse = { surah: hv.surah, ayah: hv.ayah };
                    setHiddenRanges(prev => {
                        const idx = prev.findIndex(r => isVerseAfterOrEqual(verse, r.start) && isVerseAfterOrEqual(r.end, verse));
                        return idx > -1 ? prev.filter((_, i) => i !== idx) : [...prev, { start: verse, end: verse }];
                    });
                }
            }

            // Error type shortcuts
            if (event.key.toLowerCase() === 'r') { event.preventDefault(); setErrorType('reading'); }
            else if (event.key.toLowerCase() === 't') { event.preventDefault(); setErrorType('tajweed'); }

            // C key — toggle live cursor sharing with student
            if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                const newMode = !cursorModeRef.current;
                cursorModeRef.current = newMode;
                setCursorModeActive(newMode);
                if (!newMode) onCursorMoveRef.current?.(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Mousemove tracker — only active when cursor mode is on (tutor side).
    useEffect(() => {
        if (!cursorModeActive || readOnly) { setLocalCursorKey(null); return; }
        let lastKey: string | null = null;
        let scheduled = false;
        const handleMouseMove = (e: MouseEvent) => {
            if (scheduled) return;
            scheduled = true;
            setTimeout(() => {
                scheduled = false;
                const els = document.elementsFromPoint(e.clientX, e.clientY);
                let foundKey: string | null = null;
                outer: for (const el of els) {
                    let node: Element | null = el;
                    while (node) {
                        if (node.id?.startsWith('letter-')) {
                            foundKey = node.id.slice(7);
                            break outer;
                        }
                        node = node.parentElement;
                    }
                }
                if (foundKey !== lastKey) {
                    lastKey = foundKey;
                    setLocalCursorKey(foundKey);          // mirror the glow locally
                    onCursorMoveRef.current?.(foundKey);  // broadcast to the student
                }
            }, 50);
        };
        document.addEventListener('mousemove', handleMouseMove);
        return () => document.removeEventListener('mousemove', handleMouseMove);
    }, [cursorModeActive, readOnly]);

    // ── Focus-mode: RAF momentum scroll driven by arrow keys ─────────────────
    useEffect(() => {
        if (!focusMode) return;
        const SPEED    = 10;   // px per frame while key is held
        const FRICTION = 0.87; // velocity decay per frame on key release
        let animId: number;
        let initialized = false;
        let frameCount  = 0;

        const loop = () => {
            const strip     = carouselStripRef.current;
            const container = carouselContainerRef.current;
            if (strip && container) {
                const stripW     = strip.offsetWidth;   // max-content width (all words)
                const containerW = container.offsetWidth;
                const minT = -(Math.max(0, stripW - containerW)); // word[0] on right
                const maxT = 0;                                    // last word on left

                if (!initialized) {
                    scrollTransformRef.current = minT;
                    strip.style.transform = `translateX(${minT}px)`;
                    initialized = true;
                }

                if (isAutoScrollingRef.current) {
                    scrollVelocityRef.current = 0.3 + (scrollSpeedRef.current / 100) * 9.7;
                    if (scrollTransformRef.current >= maxT) {
                        scrollVelocityRef.current = 0;
                        setIsAutoScrolling(false);
                    }
                } else if (scrollKeyHeldRef.current === 'left')  scrollVelocityRef.current =  SPEED;
                else if   (scrollKeyHeldRef.current === 'right') scrollVelocityRef.current = -SPEED;
                else                                             scrollVelocityRef.current *= FRICTION;

                if (Math.abs(scrollVelocityRef.current) > 0.15) {
                    scrollTransformRef.current = Math.max(minT, Math.min(maxT, scrollTransformRef.current + scrollVelocityRef.current));
                    strip.style.transform = `translateX(${scrollTransformRef.current}px)`;

                    if (progressBarFillRef.current && minT !== 0) {
                        const pct = (scrollTransformRef.current - minT) / (maxT - minT);
                        progressBarFillRef.current.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
                    }
                }

                // Throttled: detect which verse is at the center every ~15 frames
                frameCount++;
                if (frameCount % 15 === 0 && verseFirstWordEls.current.size > 0) {
                    const centerX = -scrollTransformRef.current + containerW / 2;
                    let closestAyah = currentAyahRef.current;
                    let closestDist = Infinity;
                    verseFirstWordEls.current.forEach((el, ayah) => {
                        const dist = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centerX);
                        if (dist < closestDist) { closestDist = dist; closestAyah = ayah; }
                    });
                    if (closestAyah !== currentAyahRef.current) {
                        currentAyahRef.current = closestAyah;
                        setCurrentAyah(closestAyah);
                    }
                }
            }
            animId = requestAnimationFrame(loop);
        };
        animId = requestAnimationFrame(loop);

        const onKeyDown = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
            if (e.key === 'ArrowLeft')  { e.preventDefault(); scrollKeyHeldRef.current = 'left';  }
            if (e.key === 'ArrowRight') { e.preventDefault(); scrollKeyHeldRef.current = 'right'; }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') scrollKeyHeldRef.current = null;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup',   onKeyUp);
        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup',   onKeyUp);
            scrollKeyHeldRef.current  = null;
            scrollVelocityRef.current = 0;
        };
    }, [focusMode]);

    // surahStatuses based on reading (recitation non-revision) + memorization achievements
    const surahStatuses = useMemo<SurahStatus[]>(() => {
        const readingAchs = recitationAchievements.filter(a => !a.isRevision);
        const memAchs     = memorizationAchievements.filter(a => !a.isRevision);

        const getSurahAchStatus = (
            surahId: number,
            totalAyahs: number,
            achs: typeof readingAchs
        ): 'completed' | 'in-progress' | 'not-started' => {
            let result: 'completed' | 'in-progress' | 'not-started' = 'not-started';
            for (const range of achs) {
                if (surahId > range.startSurah && surahId < range.endSurah) {
                    return 'completed';
                }
                if (surahId === range.startSurah || surahId === range.endSurah) {
                    if (range.startSurah === surahId && range.endSurah === surahId &&
                        range.startAyah === 1 && range.endAyah === totalAyahs) {
                        return 'completed';
                    }
                    result = 'in-progress';
                }
            }
            return result;
        };

        return QURAN_METADATA.map(surah => ({
            id: surah.number,
            name: surah.name,
            transliteratedName: surah.transliteratedName,
            englishName: surah.englishName,
            status:    getSurahAchStatus(surah.number, surah.numberOfAyahs, readingAchs),
            memStatus: getSurahAchStatus(surah.number, surah.numberOfAyahs, memAchs),
        }));
    }, [recitationAchievements, memorizationAchievements]);


    // Returns pill colour based on read + memorization status combined:
    //   both logged     → purple/violet  (fully mastered)
    //   memorized only  → sky/blue
    //   read only       → teal (completed) / amber (in-progress)
    //   neither         → grey
    // Aggregate homework/tafsir flags for a whole surah (for the nav-bar tint).
    const surahHasHomework = (surahId: number) =>
        homeworkRanges.some(r => surahId >= r.startSurah && surahId <= r.endSurah);
    const surahHasTafsir = (surahId: number) =>
        (student.tafsirReviews || []).some(r => {
            const ss = r.startSurah ?? r.surah; const es = r.endSurah ?? r.surah;
            return surahId >= ss && surahId <= es;
        });

    // Surah-name tint mirrors the verse model: green=hifz, orange=read,
    // purple=homework, blue=tafsir, with a blue underline when tafsir overlaps.
    const getSurahNavButtonClass = (surahId: number, status: SurahStatus['status'], memStatus: SurahStatus['memStatus']) => {
        if (surahId === selectedSurahId) return 'bg-teal-600 dark:bg-orange-600 text-white shadow-lg transform scale-105';
        const hasRead = status !== 'not-started';
        const hasMem  = memStatus !== 'not-started';
        const hasTaf  = surahHasTafsir(surahId);
        const underline = hasTaf && (hasMem || hasRead) ? ' border-b-2 border-blue-400 dark:border-blue-500' : '';
        if (hasMem)  return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900' + underline;
        if (hasRead) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900' + underline;
        if (surahHasHomework(surahId)) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900';
        if (hasTaf)  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900';
        return 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600';
    };

    const getDividerClass = (surahId: number, status: SurahStatus['status'], memStatus: SurahStatus['memStatus']) => {
        if (surahId === selectedSurahId) return 'bg-white/40 dark:bg-white/40';
        const hasRead = status !== 'not-started';
        const hasMem  = memStatus !== 'not-started';
        if (hasMem)  return 'bg-green-300 dark:bg-green-700';
        if (hasRead) return 'bg-orange-300 dark:bg-orange-700';
        if (surahHasHomework(surahId)) return 'bg-purple-300 dark:bg-purple-700';
        if (surahHasTafsir(surahId))   return 'bg-blue-300 dark:bg-blue-700';
        return 'bg-slate-300 dark:bg-gray-600';
    };

    const toEasternArabicNumerals = (num: number): string => {
        const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        return String(num).split('').map(digit => arabicNumerals[parseInt(digit, 10)]).join('');
    };

    useEffect(() => {
        const fetchSurah = async () => {
            if (!selectedSurahId) return;
            setIsLoading(true); setError(null);
            try {
                const selectedMeta = QURAN_METADATA.find(s => s.number === selectedSurahId);
                if (!selectedMeta) throw new Error('Surah not found.');

                const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${selectedMeta.number}`);
                if (!response.ok) throw new Error('Failed to fetch Surah data.');
                const data = await response.json();
                setVerses(data.verses);

                // Set page range to cover the full surah. Derive the real page span
                // from the verses themselves (via getPageOfAyah) — the SAME function
                // the render filter uses — so it can't disagree with QURAN_METADATA
                // and hide the tail of a short surah behind "Next 5 Pages".
                const pages = (data.verses as { verse_key: string }[]).map(v => {
                  const [s, a] = v.verse_key.split(':').map(Number);
                  return getPageOfAyah(s, a);
                });
                const firstPage = pages.length ? Math.min(...pages) : selectedMeta.startPage;
                const lastPage  = pages.length ? Math.max(...pages) : selectedMeta.endPage;
                if (lastPage - firstPage <= 4) {
                  // Surah fits in ≤ 5 pages — show the whole thing, no paging needed.
                  setCurrentPageRange({ start: firstPage, end: lastPage });
                } else {
                  // Start exactly at the surah's first page; never before it.
                  const newEnd = Math.min(lastPage, firstPage + 4);
                  setCurrentPageRange({ start: firstPage, end: newEnd });
                }
            } catch (err: any) {
                setError(err.message); setVerses([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSurah();
    }, [selectedSurahId]);

    useEffect(() => {
        const fetchTranslation = async () => {
            if (!selectedSurahId || !showTranslation) { setTranslations({}); return; }
            setIsTranslationLoading(true); setTranslationError(null);
            try {
                const response = await fetch(`https://api.alquran.cloud/v1/surah/${selectedSurahId}/en.sahih`);
                if (!response.ok) throw new Error('Failed to fetch translation data from the network.');
                const data = await response.json();
                if (data.code !== 200 || !data.data || !data.data.ayahs) throw new Error('Invalid or unexpected API response for translation.');
                const translationMap = data.data.ayahs.reduce((acc: Record<string, string>, item: { numberInSurah: number, text: string }) => {
                    acc[`${selectedSurahId}:${item.numberInSurah}`] = item.text; return acc;
                }, {});
                setTranslations(translationMap);
            } catch (err: any) {
                console.error("Failed to fetch Translation", err);
                setTranslationError(t('liveSession.translationError'));
            } finally {
                setIsTranslationLoading(false);
            }
        };
        fetchTranslation();
    }, [selectedSurahId, showTranslation, t]);

    useEffect(() => {
        const fetchTafsir = async () => {
            if (!selectedSurahId || !showTranslation || verses.length === 0) { setTafsirs({}); return; }
            setIsTafsirLoading(true);
            setTafsirError(null);
            try {
                // Using spa5k tafsir API - prioritizing simple explanations
                // Try en-tafsir-ibn-abbas first (very simple and concise), then en-tazkirul-quran (simple), then en-al-jalalayn
                const tafsirSources = ['en-tafsir-ibn-abbas', 'en-tazkirul-quran', 'en-al-jalalayn'];
                let tafsirMap: Record<string, string> = {};
                
                for (const source of tafsirSources) {
                    try {
                        // Fetch tafsir for all verses in the surah
                        const promises = verses.map(async (verse) => {
                            try {
                                const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
                                // Use raw GitHub URL for more reliable access
                                const response = await fetch(`https://raw.githubusercontent.com/spa5k/tafsir_api/main/tafsir/${source}/${surahNum}/${ayahNum}.json`);
                                if (!response.ok) return null;
                                const data = await response.json();
                                if (data && data.text) {
                                    return { verseKey: verse.verse_key, text: data.text };
                                }
                                return null;
                            } catch {
                                return null;
                            }
                        });
                        
                        const results = await Promise.all(promises);
                        results.forEach(result => {
                            if (result && result.text) {
                                tafsirMap[result.verseKey] = result.text;
                            }
                        });
                        
                        // If we got some results, use this source
                        if (Object.keys(tafsirMap).length > 0) {
                            setTafsirs(tafsirMap);
                            return;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch tafsir from ${source}`, err);
                        continue;
                    }
                }
                // If all sources failed, just don't show tafsir (silent failure)
                setTafsirs({});
            } catch (err: any) {
                console.error("Failed to fetch Tafsir", err);
                setTafsirs({});
            } finally {
                setIsTafsirLoading(false);
            }
        };
        fetchTafsir();
    }, [selectedSurahId, showTranslation, verses]);

    useEffect(() => {
        if (scrollToVerseKey && verses.length > 0) {
            const [surahNum, ayahNum] = scrollToVerseKey.split(':').map(Number);
            const targetPage = getPageOfAyah(surahNum, ayahNum);

            // Determine the surah's actual first page so we never open a window
            // that starts before the surah begins (which would show empty space).
            const [firstVSurah, firstVAyah] = verses[0].verse_key.split(':').map(Number);
            const surahFirstPage = getPageOfAyah(firstVSurah, firstVAyah);

            // Align to a 5-page grid but clamp so we never go before the surah's
            // first page — that was the root cause of the "wrong pages" bug.
            const gridStart = Math.max(1, Math.floor((targetPage - 1) / 5) * 5 + 1);
            const newStart = Math.max(surahFirstPage, gridStart);
            const newEnd = Math.min(604, newStart + 4);
            setCurrentPageRange({ start: newStart, end: newEnd });
            
            // Scroll to verse after a short delay to allow rendering
            setTimeout(() => {
                const element = document.getElementById(`verse-container-${scrollToVerseKey}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setScrollToVerseKey(null);
                }
            }, 100);
        }
    }, [verses, scrollToVerseKey]);
    
    useEffect(() => {
        const nav = surahNavScrollRef.current;
        // Pinned Al-Fatiha (1) and An-Nas (114) sit OUTSIDE the scroll list, so
        // scrollIntoView can't move the inner strip — nudge it to the matching end
        // so the nav bar also slides to that side of the Quran.
        if (nav) {
            if (selectedSurahId === 1)        nav.scrollTo({ left: 0, behavior: 'smooth' });
            else if (selectedSurahId === 114) nav.scrollTo({ left: nav.scrollWidth, behavior: 'smooth' });
        }
        const surahElement = document.getElementById(`surah-nav-${selectedSurahId}`);
        if (surahElement) surahElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [selectedSurahId]);

    // Show a floating "back to the start of the surah" button once scrolled past
    // the beginning of the Quran body.
    useEffect(() => {
        const onScroll = () => {
            const top = quranBodyRef.current?.offsetTop ?? 0;
            setShowScrollTop(window.scrollY > top + 240);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const showToast = useCallback((message: string) => {
        setToastMessage(message);
        setTimeout(() => setToastMessage(null), 3000);
    }, []);

    useEffect(() => {
        if (typeof confetti === 'undefined') {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.5.1/dist/confetti.browser.min.js";
            script.async = true; document.body.appendChild(script);
        }
    }, []);

    useEffect(() => {
        // If it's the first run, if the previous statuses aren't stored yet,
        // or if the logging mode has changed, we should not check for newly
        // completed surahs. Instead, we just update our references and wait
        // for the next change (e.g., a new achievement being logged).
        if (typeof confetti === 'undefined' || !prevSurahStatusesRef.current) {
            prevSurahStatusesRef.current = surahStatuses;
            return;
        }

        const prevStatuses = prevSurahStatusesRef.current;
        const newlyCompletedSurahs = surahStatuses.filter((current, index) => {
            const prev = prevStatuses[index];
            return prev && current.status === 'completed' && prev.status !== 'completed';
        });

        if (newlyCompletedSurahs.length > 0) {
            confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, zIndex: 1000 });
            const completedNames = newlyCompletedSurahs.map(s => s.englishName).join(', ');
            showToast(t('liveSession.surahCompleted', { name: completedNames }));
        }

        prevSurahStatusesRef.current = surahStatuses;
    }, [surahStatuses, showToast, t]);
    
    // Check if string contains Arabic characters
    const containsArabic = (str: string): boolean => {
        return /[\u0600-\u06FF]/.test(str);
    };

    // Strip Arabic diacritical marks (tashkeel) so "\u0627\u0644\u0641\u0627\u062A\u062D\u0629" matches "\u0627\u0644\u0641\u064E\u0627\u062A\u0650\u062D\u064E\u0629"
    const stripArabicDiacritics = (str: string): string =>
        str.replace(/[\u064B-\u065F\u0610-\u061A\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g, '');

    // Normalize string for comparison (lowercase for non-Arabic, trim for Arabic)
    const normalizeString = (str: string): string => {
        const trimmed = str.trim();
        // Only lowercase if it doesn't contain Arabic characters
        return containsArabic(trimmed) ? trimmed : trimmed.toLowerCase();
    };
    
    // Fuzzy string matching using Levenshtein distance
    const calculateSimilarity = (str1: string, str2: string): number => {
        const s1 = normalizeString(str1);
        const s2 = normalizeString(str2);
        
        // Exact match
        if (s1 === s2) return 1.0;
        
        // Check if one contains the other
        if (s1.includes(s2) || s2.includes(s1)) return 0.8;
        
        // Calculate Levenshtein distance
        const len1 = s1.length;
        const len2 = s2.length;
        
        if (len1 === 0) return len2 === 0 ? 1.0 : 0;
        if (len2 === 0) return 0;
        
        const matrix: number[][] = [];
        for (let i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        const distance = matrix[len1][len2];
        const maxLen = Math.max(len1, len2);
        return 1 - (distance / maxLen);
    };
    
    // Find best matching surah
    const findBestMatchingSurah = (term: string): { surah: typeof QURAN_METADATA[0], score: number } | null => {
        const normalizedTerm = normalizeString(term);
        let bestMatch: { surah: typeof QURAN_METADATA[0], score: number } | null = null;
        let bestScore = 0;
        
        // First, try exact number match (only if term doesn't contain Arabic)
        if (!containsArabic(term)) {
            const numMatch = parseInt(normalizedTerm, 10);
            if (!isNaN(numMatch) && numMatch >= 1 && numMatch <= 114) {
                const surah = QURAN_METADATA.find(s => s.number === numMatch);
                if (surah) {
                    return { surah, score: 1.0 };
                }
            }
        }
        
        // Then try fuzzy matching on names (including Arabic name)
        const isArabicQuery = containsArabic(term);
        const strippedTerm = isArabicQuery ? stripArabicDiacritics(term.trim()) : normalizedTerm;

        for (const surah of QURAN_METADATA) {
            const strippedSurahName = stripArabicDiacritics(surah.name);
            const scores = [
                // Arabic name matching — compare stripped versions so diacritics don't cause mismatches
                isArabicQuery ? calculateSimilarity(strippedTerm, strippedSurahName) : 0,
                // Arabic substring match (very reliable: "الفلق" is contained in "سورة الفلق")
                isArabicQuery && strippedSurahName.includes(strippedTerm) ? 0.95 : 0,
                isArabicQuery && strippedTerm.includes(strippedSurahName) ? 0.9 : 0,
                // English name matching
                calculateSimilarity(normalizedTerm, surah.englishName),
                // Transliterated name matching
                calculateSimilarity(normalizedTerm, surah.transliteratedName),
                calculateSimilarity(normalizedTerm, surah.transliteratedName.replace(/-/g, ' ')),
                calculateSimilarity(normalizedTerm, surah.transliteratedName.replace(/-/g, '')),
                // Check if term matches part of the name
                !isArabicQuery && surah.englishName.toLowerCase().includes(normalizedTerm) ? 0.7 : 0,
                !isArabicQuery && surah.transliteratedName.toLowerCase().replace(/-/g, ' ').includes(normalizedTerm) ? 0.7 : 0,
            ];

            const maxScore = Math.max(...scores);
            // Lower threshold for Arabic queries since they tend to be shorter and more precise
            const threshold = isArabicQuery ? 0.3 : 0.4;
            if (maxScore > bestScore && maxScore > threshold) {
                bestScore = maxScore;
                bestMatch = { surah, score: maxScore };
            }
        }
        
        return bestMatch;
    };
    
    const handleSurahSelection = (id: number) => {
        setSelectedSurahId(id);
        // Open at the START of the surah (page range + scroll both target ayah 1).
        setScrollToVerseKey(`${id}:1`);
    };
    
    const handleNextPages = () => {
        const newStart = Math.min(604, currentPageRange.end + 1);
        const newEnd = Math.min(604, newStart + 4);
        setCurrentPageRange({ start: newStart, end: newEnd });
        quranBodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handlePreviousPages = () => {
        const newEnd = Math.max(1, currentPageRange.start - 1);
        const newStart = Math.max(1, newEnd - 4);
        setCurrentPageRange({ start: newStart, end: newEnd });
        quranBodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    
    // Calculate if there are more pages to show
    const hasMorePages = () => {
        if (verses.length === 0) return false;
        const lastVerse = verses[verses.length - 1];
        const [surahNum, ayahNum] = lastVerse.verse_key.split(':').map(Number);
        const lastPage = getPageOfAyah(surahNum, ayahNum);
        return currentPageRange.end < lastPage;
    };
    
    const hasPreviousPages = () => {
        if (verses.length === 0) return false;
        const firstVerse = verses[0];
        const [surahNum, ayahNum] = firstVerse.verse_key.split(':').map(Number);
        const firstPage = getPageOfAyah(surahNum, ayahNum);
        return currentPageRange.start > firstPage;
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault(); 
        const term = searchInput.trim(); 
        if (!term) return;
        
        setIsSearchResultsModalOpen(false); 
        setSearchResults([]); 
        setIsSearching(true);
        
        // Check if input is a number (page number) - with fuzzy matching
        const pageNum = parseInt(term, 10);
        if (!isNaN(pageNum)) {
            // Exact match
            if (pageNum >= 1 && pageNum <= 604) {
                const pageEntry = pageVerseList.find(([page]) => page === pageNum);
                if (pageEntry) {
                    const [, surahNum, ayahNum] = pageEntry;
                    const firstVerseKey = `${surahNum}:${ayahNum}`;
                    
                    if (selectedSurahId !== surahNum) {
                        setSelectedSurahId(surahNum);
                    }
                    setScrollToVerseKey(firstVerseKey);
                    setIsSearching(false);
                    return;
                }
            }
            
            // Fuzzy match: find closest page
            if (pageNum > 0) {
                const closestPage = Math.max(1, Math.min(604, pageNum));
                const pageEntry = pageVerseList.find(([page]) => page === closestPage);
                if (pageEntry) {
                    const [, surahNum, ayahNum] = pageEntry;
                    const firstVerseKey = `${surahNum}:${ayahNum}`;
                    
                    if (selectedSurahId !== surahNum) {
                        setSelectedSurahId(surahNum);
                    }
                    setScrollToVerseKey(firstVerseKey);
                    setIsSearching(false);
                    showToast(`Page ${closestPage} (closest match)`);
                    return;
                }
            }
        }
        
        // Check for verse key format (surah:ayah) - with fuzzy matching
        if (term.includes(':')) {
            const parts = term.split(':');
            if (parts.length === 2) {
                const surahStr = parts[0].trim();
                const ayahStr = parts[1].trim();
                const surahNum = parseInt(surahStr, 10);
                const ayahNum = parseInt(ayahStr, 10);
                
                // Exact match
                if (!isNaN(surahNum) && surahNum >= 1 && surahNum <= 114 && !isNaN(ayahNum) && ayahNum > 0) {
                    const surah = QURAN_METADATA.find(s => s.number === surahNum);
                    if (surah && ayahNum <= surah.numberOfAyahs) {
                        if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum);
                        setScrollToVerseKey(`${surahNum}:${ayahNum}`);
                        setIsSearching(false);
                        return;
                    }
                    // If ayah is out of range, go to last ayah of surah
                    if (surah && ayahNum > surah.numberOfAyahs) {
                        if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum);
                        setScrollToVerseKey(`${surahNum}:${surah.numberOfAyahs}`);
                        setIsSearching(false);
                        showToast(`Verse ${surahNum}:${surah.numberOfAyahs} (last verse in surah)`);
                        return;
                    }
                }
                
                // Fuzzy match: try to find closest surah
                if (!isNaN(surahNum) && surahNum >= 1 && surahNum <= 114) {
                    const surah = QURAN_METADATA.find(s => s.number === surahNum);
                    if (surah) {
                        const validAyah = !isNaN(ayahNum) && ayahNum > 0 
                            ? Math.min(ayahNum, surah.numberOfAyahs) 
                            : 1;
                        if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum);
                        setScrollToVerseKey(`${surahNum}:${validAyah}`);
                        setIsSearching(false);
                        if (validAyah !== ayahNum) {
                            showToast(`Verse ${surahNum}:${validAyah} (closest match)`);
                        }
                        return;
                    }
                }
            }
        }
        
        // Search by surah name with fuzzy matching
        const surahMatch = findBestMatchingSurah(term);
        if (surahMatch && surahMatch.score > 0.4) {
            setSelectedSurahId(surahMatch.surah.number);
            setIsSearching(false);
            if (surahMatch.score < 0.9) {
                showToast(`Found: ${surahMatch.surah.englishName} (${surahMatch.surah.transliteratedName})`);
            }
            return;
        }
        
        // Text search in verses
        try {
            const response = await fetch(`https://api.quran.com/api/v4/search?q=${encodeURIComponent(term)}`); 
            if (!response.ok) throw new Error('Search API failed');
            const data = await response.json(); 
            const results = data.search?.results;
            if (results && results.length > 0) {
                if (results.length === 1) {
                    const verseKey = results[0].verse_key; 
                    const [surahNum] = verseKey.split(':').map(Number);
                    if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum); 
                    setScrollToVerseKey(verseKey);
                } else { 
                    setSearchResults(results); 
                    setIsSearchResultsModalOpen(true); 
                }
                setIsSearching(false); 
                return;
            }
        } catch (searchError) { 
            console.error("Word search failed:", searchError); 
        }
        
        // If nothing found, try to suggest similar surahs
        const suggestions: string[] = [];
        const allMatches = QURAN_METADATA.map(s => ({
            surah: s,
            score: Math.max(
                containsArabic(term) ? calculateSimilarity(stripArabicDiacritics(term), stripArabicDiacritics(s.name)) : 0,
                calculateSimilarity(normalizeString(term), s.englishName),
                calculateSimilarity(normalizeString(term), s.transliteratedName),
                calculateSimilarity(normalizeString(term), s.transliteratedName.replace(/-/g, ' '))
            )
        })).filter(m => m.score > 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);
        
        if (allMatches.length > 0) {
            const suggestionText = allMatches.map(m => 
                containsArabic(term) 
                    ? `${m.surah.name} (${m.surah.englishName})`
                    : `${m.surah.englishName} (${m.surah.transliteratedName})`
            ).join(', ');
            alert(`No exact match found for "${term}". Did you mean: ${suggestionText}?`);
        } else {
            alert(t('liveSession.searchNotFound', { query: searchInput }));
        }
        setIsSearching(false);
    };

    const handleSelectSearchResult = (verseKey: string) => {
        const [surahNum] = verseKey.split(':').map(Number);
        if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum);
        setScrollToVerseKey(verseKey); setIsSearchResultsModalOpen(false); setSearchResults([]);
    };

    const handleIncreaseFontSize = () => setFontSize(prev => Math.min(prev + 1, 8));
    const handleDecreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 1));

    const selectedSurahInfo = QURAN_METADATA.find(s => s.number === selectedSurahId);
    
    const getMistakeColor = (level: number): string => {
        switch (level) {
            case 1: return 'bg-yellow-200/70'; // 1st click
            case 2: return 'bg-orange-200/70'; // 2nd click
            case 3: return 'bg-red-200/70';    // 3rd click
            case 4: return 'bg-orange-200/70'; // 4th click (correction)
            case 5: return 'bg-yellow-200/70'; // 5th click (correction)
            default: return 'transparent';     // 0 or undefined
        }
    };

    const isVerseAfterOrEqual = (v1: Progress, v2: Progress) => (v1.surah > v2.surah) || (v1.surah === v2.surah && v1.ayah >= v2.ayah);
    
    const getVerseRangeInfo = useCallback((surahNum: number, ayahNum: number, achievements: (RecitationAchievement | MemorizationAchievement)[]) => {
        const currentVerse = { surah: surahNum, ayah: ayahNum };
        for (const ach of achievements) {
            if (isVerseAfterOrEqual(currentVerse, { surah: ach.startSurah, ayah: ach.startAyah }) && isVerseAfterOrEqual({ surah: ach.endSurah, ayah: ach.endAyah }, currentVerse)) {
                return { isLogged: true, achievementId: ach.id };
            }
        }
        return { isLogged: false, achievementId: null };
    }, []);

    // Returns the id of the first tafseer review covering this verse, or null
    const getTafseerRangeInfo = useCallback((surahNum: number, ayahNum: number): { isLogged: boolean; reviewId: string | null } => {
        const v = { surah: surahNum, ayah: ayahNum };
        for (const r of (student.tafsirReviews || [])) {
            const startSurah = r.startSurah ?? r.surah;
            const startAyah  = r.startAyah  ?? 1;
            const endSurah   = r.endSurah   ?? r.surah;
            const endAyah    = r.endAyah    ?? (QURAN_METADATA.find(m => m.number === endSurah)?.numberOfAyahs ?? 1);
            if (isVerseAfterOrEqual(v, { surah: startSurah, ayah: startAyah }) && isVerseAfterOrEqual({ surah: endSurah, ayah: endAyah }, v)) {
                return { isLogged: true, reviewId: r.id };
            }
        }
        return { isLogged: false, reviewId: null };
    }, [student.tafsirReviews]);

    const isVerseHomework = useCallback((surahNum: number, ayahNum: number) => {
        const v = { surah: surahNum, ayah: ayahNum };
        return homeworkRanges.some(r =>
            isVerseAfterOrEqual(v, { surah: r.startSurah, ayah: r.startAyah }) &&
            isVerseAfterOrEqual({ surah: r.endSurah, ayah: r.endAyah }, v));
    }, [homeworkRanges]);

    // Resolve a verse to its log colour. Memorized implies read (→ green), so
    // existing hifz logs automatically count as read with no data migration.
    const verseLogColor = useCallback((surahNum: number, ayahNum: number) => {
        const isMemorized = getVerseRangeInfo(surahNum, ayahNum, memorizationAchievements).isLogged;
        const isRead      = getVerseRangeInfo(surahNum, ayahNum, recitationAchievements).isLogged;
        const isTafseer   = getTafseerRangeInfo(surahNum, ayahNum).isLogged;
        const isHomework  = isVerseHomework(surahNum, ayahNum);
        const base = isMemorized ? 'green' : isRead ? 'orange' : isHomework ? 'purple' : isTafseer ? 'blue' : 'none';
        const underline = isTafseer && base !== 'blue' && base !== 'none';
        return { base, underline };
    }, [getVerseRangeInfo, getTafseerRangeInfo, isVerseHomework, memorizationAchievements, recitationAchievements]);

    
    // ── Range-log helpers ─────────────────────────────────────────────────────
    // Check if a surah has any non-revision reading/hifz logs
    // Returns true when any existing non-revision reading log overlaps the given verse range.
    // Using range overlap (not just surah membership) so removed verses don't falsely trigger
    // "Revision" when the same or nearby verses are logged again.
    const hasReadingForRange = (start: Progress, end: Progress) =>
        recitationAchievements.some(a =>
            !a.isRevision &&
            isVerseAfterOrEqual({ surah: a.endSurah, ayah: a.endAyah }, start) &&
            isVerseAfterOrEqual(end, { surah: a.startSurah, ayah: a.startAyah })
        );

    const hasHifzForRange = (start: Progress, end: Progress) =>
        memorizationAchievements.some(a =>
            !a.isRevision &&
            isVerseAfterOrEqual({ surah: a.endSurah, ayah: a.endAyah }, start) &&
            isVerseAfterOrEqual(end, { surah: a.startSurah, ayah: a.startAyah })
        );

    // Returns true when any tafseer log overlaps the given verse range.
    const hasTafseerForRange = (start: Progress, end: Progress) =>
        (student.tafsirReviews || []).some(r => {
            const rStart: Progress = { surah: r.startSurah ?? r.surah, ayah: r.startAyah ?? 1 };
            const rEnd:   Progress = { surah: r.endSurah ?? r.surah,   ayah: r.endAyah   ?? (QURAN_METADATA.find(m => m.number === (r.endSurah ?? r.surah))?.numberOfAyahs ?? 1) };
            return isVerseAfterOrEqual(rEnd, start) && isVerseAfterOrEqual(end, rStart);
        });

    const openLogModal = (range: { start: Progress; end: Progress }) => {
        setPendingLogRange(range);
        setLogQuality(8);
        setSelectedLogType(null);
        setLogTypeStep('type');
    };

    const handleVerseClick = (surahNum: number, ayahNum: number) => {
        // Modal already open — ignore
        if (pendingLogRange) return;

        const verse = { surah: surahNum, ayah: ayahNum };

        if (!selectionStart) {
            // First click — always start range selection regardless of logged state
            setSelectionStart(verse);
            return;
        }

        // Second click — complete the range and open the adaptive log modal
        if (!isVerseAfterOrEqual(verse, selectionStart)) {
            showToast(t('liveSession.endVerseError'));
            setSelectionStart(null);
            return;
        }
        openLogModal({ start: selectionStart, end: verse });
        setSelectionStart(null);
    };

    const confirmLog = () => {
        if (!pendingLogRange || !selectedLogType) return;
        if (selectedLogType === 'reading') {
            onLogRecitationRange(student.id, pendingLogRange, logQuality, false);
            showToast(t('liveSession.rangeSaved'));
        } else if (selectedLogType === 'reading-revision') {
            onLogRecitationRange(student.id, pendingLogRange, logQuality, true);
            showToast('Reading revision saved');
        } else if (selectedLogType === 'hifz') {
            onLogMemorizationRange(student.id, pendingLogRange, logQuality, false);
            onLogRecitationRange(student.id, pendingLogRange, logQuality, false); // hifz implies reading
            showToast(t('liveSession.memorizationRangeSaved'));
        } else if (selectedLogType === 'hifz-revision') {
            onLogMemorizationRange(student.id, pendingLogRange, logQuality, true);
            onLogRecitationRange(student.id, pendingLogRange, logQuality, true); // hifz revision implies reading
            showToast('Hifz revision saved');
        } else if (selectedLogType === 'tafseer') {
            onLogTafseerRange(student.id, pendingLogRange);
            showToast('Tafseer logged');
        } else if (selectedLogType === 'homework') {
            if (onLogHomework) onLogHomework(student.id, pendingLogRange, homeworkNote.trim());
            showToast('Homework assigned 📝');
        }
        setPendingLogRange(null);
        setLogTypeStep(null);
        setSelectedLogType(null);
        setHomeworkNote('');
    };

    const cancelLogModal = () => {
        setPendingLogRange(null);
        setLogTypeStep(null);
        setSelectedLogType(null);
        setHomeworkNote('');
    };

    const handleVerseNumberPressStart = (surahNum: number, ayahNum: number) => {
        longPressFired.current = false;
        longPressTimer.current = window.setTimeout(() => {
            longPressFired.current = true;
            const currentVerse = { surah: surahNum, ayah: ayahNum };

            // ── Long-press on a LOGGED verse → offer removal ──────────────
            // Check ALL achievements (including revisions) so they can all be deleted
            const readInfo    = getVerseRangeInfo(surahNum, ayahNum, recitationAchievements);
            const memInfo     = getVerseRangeInfo(surahNum, ayahNum, memorizationAchievements);
            const tafseerInfo = getTafseerRangeInfo(surahNum, ayahNum);

            if (readInfo.isLogged && readInfo.achievementId) {
                const ach = recitationAchievements.find(a => a.id === readInfo.achievementId);
                if (ach) {
                    setConfirmModalState({
                        isOpen: true,
                        title: 'Remove Reading Log',
                        message: `Remove reading log for ${QURAN_METADATA.find(s => s.number === ach.startSurah)?.transliteratedName} ${ach.startAyah} – ${QURAN_METADATA.find(s => s.number === ach.endSurah)?.transliteratedName} ${ach.endAyah}?`,
                        onConfirm: () => { onRemoveRecitationAchievement(student.id, readInfo.achievementId!); showToast(t('liveSession.rangeRemoved')); },
                    });
                    return;
                }
            }
            if (memInfo.isLogged && memInfo.achievementId) {
                const ach = memorizationAchievements.find(a => a.id === memInfo.achievementId);
                if (ach) {
                    setConfirmModalState({
                        isOpen: true,
                        title: 'Remove Hifz Log',
                        message: `Remove hifz log for ${QURAN_METADATA.find(s => s.number === ach.startSurah)?.transliteratedName} ${ach.startAyah} – ${QURAN_METADATA.find(s => s.number === ach.endSurah)?.transliteratedName} ${ach.endAyah}?`,
                        onConfirm: () => { onRemoveMemorizationAchievement(student.id, memInfo.achievementId!); showToast(t('liveSession.memorizationRangeRemoved')); },
                    });
                    return;
                }
            }
            if (tafseerInfo.isLogged && tafseerInfo.reviewId) {
                const rev = (student.tafsirReviews || []).find(r => r.id === tafseerInfo.reviewId);
                if (rev) {
                    const startSurah = rev.startSurah ?? rev.surah;
                    const endSurah   = rev.endSurah   ?? rev.surah;
                    const startAyah  = rev.startAyah  ?? 1;
                    const endAyah    = rev.endAyah    ?? (QURAN_METADATA.find(m => m.number === endSurah)?.numberOfAyahs ?? '?');
                    setConfirmModalState({
                        isOpen: true,
                        title: 'Remove Tafseer Log',
                        message: `Remove tafseer log for ${QURAN_METADATA.find(s => s.number === startSurah)?.transliteratedName} ${startAyah} – ${QURAN_METADATA.find(s => s.number === endSurah)?.transliteratedName} ${endAyah}?`,
                        onConfirm: () => { onRemoveTafseerRange(student.id, tafseerInfo.reviewId!); showToast('Tafseer log removed'); },
                    });
                    return;
                }
            }

            // ── Long-press on a NON-logged verse → toggle hiding ──────────
            const containingRangeIndex = hiddenRanges.findIndex(range =>
                isVerseAfterOrEqual(currentVerse, range.start) && isVerseAfterOrEqual(range.end, currentVerse)
            );
            if (containingRangeIndex > -1) {
                setHiddenRanges(prev => prev.filter((_, i) => i !== containingRangeIndex));
                setLongPressStart(null);
            } else if (!longPressStart) {
                setLongPressStart(currentVerse);
            } else {
                const start = isVerseAfterOrEqual(currentVerse, longPressStart) ? longPressStart : currentVerse;
                const end   = isVerseAfterOrEqual(currentVerse, longPressStart) ? currentVerse : longPressStart;
                setHiddenRanges(prev => [...prev, { start, end }]);
                setLongPressStart(null);
            }
        }, 500);
    };
    
    const handleVerseNumberPressEnd = (surahNum: number, ayahNum: number) => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
        }
        if (!longPressFired.current) {
            // This is a short click, handle regular range selection
            handleVerseClick(surahNum, ayahNum);
        }
    };
    

    const handleLetterClick = useCallback((letterKey: string) => {

        const mistake = studentMistakes[letterKey];
        const currentState = letterClickStates.current[letterKey] || (mistake ? 2 : 0);

        if (currentState === 0) {
            // ── 1st click: immediately mark red/green + open comment input ──
            letterClickStates.current[letterKey] = 2;
            setEditingLetterKey(letterKey);
            setErrorTextInput('');
            // Save to DB right away with current errorType (comment is optional, added later)
            const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
            onCycleMistakeLevel(student.id, surah, ayah, wordIndex, letterIndex, errorType, '');
            setClickStateUpdateTrigger(prev => prev + 1);

        } else if (currentState === 2) {
            // ── 2nd click: turn yellow, remove comment, persist yellow to DB ──
            letterClickStates.current[letterKey] = 1;
            setEditingLetterKey(null);
            setErrorTextInput('');
            const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
            // Save with no errorType so it renders yellow and survives page close/reopen
            onCycleMistakeLevel(student.id, surah, ayah, wordIndex, letterIndex, undefined, undefined);
            setClickStateUpdateTrigger(prev => prev + 1);

        } else if (currentState === 1) {
            // ── 3rd click: remove entirely ──
            letterClickStates.current[letterKey] = 0;
            setEditingLetterKey(null);
            setErrorTextInput('');
            if (mistake) {
                const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
                onClearMistake(student.id, surah, ayah, wordIndex, letterIndex);
            }
            setClickStateUpdateTrigger(prev => prev + 1);
        }
    }, [studentMistakes, student.id, onClearMistake, onCycleMistakeLevel, errorType]);
    
    const handleLetterTextSubmit = useCallback((letterKey: string, text: string) => {
        const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
        letterClickStates.current[letterKey] = 2; // Mark as completed
        setEditingLetterKey(null);
        setErrorTextInput('');
        // Add the mistake with error type and text
        onCycleMistakeLevel(student.id, surah, ayah, wordIndex, letterIndex, errorType, text);
    }, [errorType, student.id, onCycleMistakeLevel, studentMistakes]);

    const handleLetterTextCancel = useCallback(() => {
        if (editingLetterKey) {
            letterClickStates.current[editingLetterKey] = 0;
        }
        setEditingLetterKey(null);
        setErrorTextInput('');
    }, [editingLetterKey]);

    const handleVerseContainerClick = (e: React.MouseEvent<HTMLSpanElement>, surahNum: number, ayahNum: number) => {
        // If a long press was just completed, reset and ignore this click
        if (longPressFired.current) {
            longPressFired.current = false;
            if (longPressStart) setLongPressStart(null);
            return;
        }

        // Cancel hiding mode if user clicks text while it's active
        if (longPressStart) {
            setLongPressStart(null);
            return;
        }

        // Clicking on a hidden verse reveals it
        const currentVerse = { surah: surahNum, ayah: ayahNum };
        const containingRangeIndex = hiddenRanges.findIndex(range =>
            isVerseAfterOrEqual(currentVerse, range.start) && isVerseAfterOrEqual(range.end, currentVerse)
        );
        if (containingRangeIndex > -1) {
            setHiddenRanges(prev => prev.filter((_, index) => index !== containingRangeIndex));
        }
    };


    const VerseMarker: React.FC<{ number: number; surah: number; isSelectedStart: boolean }> = ({ number, surah, isSelectedStart }) => {
        // Include ALL logs (first-time + revisions) so the table and live page stay in sync
        const isLongPressStart = longPressStart?.surah === surah && longPressStart?.ayah === number;
        const glowClass = (!readOnly && isSelectedStart) ? 'ring-2 ring-offset-4 ring-teal-500 dark:ring-orange-500 animate-pulse' : '';
        const longPressGlowClass = (!readOnly && isLongPressStart) ? 'animate-glow' : '';
        // green = hifz(+reading), orange = read, purple = homework, blue = tafsir
        const svgFill = VERSE_MARKER_FILL[verseLogColor(surah, number).base];

        if (readOnly) {
            // In readOnly mode (student portal): tapping the verse number plays the
            // recitation from this ayah to the end of the surah. Tapping again (any
            // number) stops it.
            const isPlayingHere = readOnlyAudioVerse?.surah === surah && readOnlyAudioVerse?.ayah === number;
            return (
                <span
                    onClick={() => handleAyahNumberRecite(surah, number)}
                    className={`inline-flex items-center justify-center w-12 h-12 mx-2 font-mono text-base font-bold text-slate-700 dark:text-slate-200 relative cursor-pointer rounded-full transition-all ${isPlayingHere ? 'ring-2 ring-teal-500 dark:ring-teal-400' : ''}`}
                    style={{ verticalAlign: 'middle' }} role="button" aria-label={`Play recitation from verse ${number}`}
                >
                    <svg className="absolute inset-0 w-full h-full text-slate-200 dark:text-gray-700" viewBox="0 0 100 100" fill={svgFill}>
                        <path d="M50,4 C24.6,4 4,24.6 4,50 C4,75.4 24.6,96 50,96 C75.4,96 96,75.4 96,50 C96,24.6 75.4,4 50,4 Z M50,10 C72.1,10 90,27.9 90,50 C90,72.1 72.1,90 50,90 C27.9,90 10,72.1 10,50 C10,27.9 27.9,10 50,10 Z" />
                        <path d="M50,16 C49.2,21.8 45.8,25.2 40,26 C34.2,26.8 30.8,30.2 30,36 C29.2,41.8 32.2,45.8 38,48 C43.8,50.2 48.2,53.2 50,60 C51.8,53.2 56.2,50.2 62,48 C67.8,45.8 70.8,41.8 70,36 C69.2,30.2 65.8,26.8 60,26 C54.2,25.2 50.8,21.8 50,16 Z" />
                    </svg>
                    <span className="relative z-10">{toEasternArabicNumerals(number)}</span>
                </span>
            );
        }

        return (
            <span
                onMouseDown={() => handleVerseNumberPressStart(surah, number)}
                onMouseUp={() => handleVerseNumberPressEnd(surah, number)}
                onTouchStart={() => handleVerseNumberPressStart(surah, number)}
                onTouchEnd={() => handleVerseNumberPressEnd(surah, number)}
                className={`inline-flex items-center justify-center w-12 h-12 mx-2 font-mono text-base font-bold text-slate-700 dark:text-slate-200 cursor-pointer relative transition-all rounded-full ${glowClass} ${longPressGlowClass}`}
                style={{ verticalAlign: 'middle' }} role="button" aria-label={`Mark progress at verse ${number}`}
            >
                <svg className="absolute inset-0 w-full h-full text-slate-200 dark:text-gray-700" viewBox="0 0 100 100" fill={svgFill}>
                    <path d="M50,4 C24.6,4 4,24.6 4,50 C4,75.4 24.6,96 50,96 C75.4,96 96,75.4 96,50 C96,24.6 75.4,4 50,4 Z M50,10 C72.1,10 90,27.9 90,50 C90,72.1 72.1,90 50,90 C27.9,90 10,72.1 10,50 C10,27.9 27.9,10 50,10 Z" />
                    <path d="M50,16 C49.2,21.8 45.8,25.2 40,26 C34.2,26.8 30.8,30.2 30,36 C29.2,41.8 32.2,45.8 38,48 C43.8,50.2 48.2,53.2 50,60 C51.8,53.2 56.2,50.2 62,48 C67.8,45.8 70.8,41.8 70,36 C69.2,30.2 65.8,26.8 60,26 C54.2,25.2 50.8,21.8 50,16 Z" />
                </svg>
                <span className="relative z-10">{toEasternArabicNumerals(number)}</span>
            </span>
        );
    };

    const PageSeparator: React.FC<{ pageNumber: number }> = ({ pageNumber }) => (
        <div className="w-full my-8 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm font-sans" aria-hidden="true">
            <hr className="w-full border-slate-200 dark:border-gray-600 border-dashed" /><span className="whitespace-nowrap px-4 tracking-wider bg-white dark:bg-gray-800">{t('liveSession.page')} {toEasternArabicNumerals(pageNumber)}</span><hr className="w-full border-slate-200 dark:border-gray-600 border-dashed" />
        </div>
    );

    const renderSurahContent = () => {
        if (isLoading) return <div className="flex justify-center items-center h-full p-12"><p>{t('liveSession.loadingSurah')}</p></div>;
        if (error) return <div className="text-center text-red-500 p-12">{error}</div>;

        const surahContent: React.ReactNode[] = []; let currentPage = -1;
        let hasShownFirstPageInRange = false;
        let currentRenderedSurah = -1; // Track surah transitions for multi-surah pages

        verses.forEach((verse, verseIndex) => {
            const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
            const versePage = getPageOfAyah(surahNum, ayahNum);

            // Only render verses within the current page range
            if (versePage < currentPageRange.start || versePage > currentPageRange.end) {
                return;
            }

            if (!hasShownFirstPageInRange) {
                currentPage = versePage;
                hasShownFirstPageInRange = true;
            } else if (versePage !== currentPage) {
                // Label the separator with the page that is STARTING (versePage),
                // not the one that just ended — so the marker reads as a page header
                // rather than a confusing footer that's one page behind.
                surahContent.push(<PageSeparator key={`page-${versePage}`} pageNumber={versePage} />);
                currentPage = versePage;
            }

            // Insert a surah name header when the surah changes (handles multi-surah pages)
            // The first surah is already shown in the top header, so only add headers for subsequent surahs
            if (surahNum !== currentRenderedSurah) {
                if (currentRenderedSurah !== -1) {
                    // A new surah starts mid-content — show its header
                    const surahMeta = QURAN_METADATA.find(s => s.number === surahNum);
                    if (surahMeta) {
                        surahContent.push(
                            <div key={`surah-header-${surahNum}`} className="text-center pt-10 pb-6 px-2">
                                <p className="text-4xl font-quranic text-slate-700 dark:text-slate-100">{surahMeta.name}</p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{surahMeta.englishName} · {surahMeta.transliteratedName}</p>
                                <hr className="w-48 h-1 mx-auto my-6 bg-teal-100 dark:bg-gray-700 border-0 rounded" />
                            </div>
                        );
                    }
                }
                currentRenderedSurah = surahNum;
            }
            
            const verseKey = `${surahNum}:${ayahNum}`;
            // Include ALL logs (first-time + revisions + tafseer) so highlighting matches the progress table
            const isRead      = getVerseRangeInfo(surahNum, ayahNum, recitationAchievements).isLogged;
            const isMemorized = getVerseRangeInfo(surahNum, ayahNum, memorizationAchievements).isLogged;
            const isTafseer   = getTafseerRangeInfo(surahNum, ayahNum).isLogged;
            const vColor = verseLogColor(surahNum, ayahNum);
            const isVerseHidden = hiddenRanges.some(range => isVerseAfterOrEqual({ surah: surahNum, ayah: ayahNum }, range.start) && isVerseAfterOrEqual(range.end, { surah: surahNum, ayah: ayahNum }));

            const verseWords = splitVerseWords(verse.text_uthmani).map((word, wordIndex, wordsArray) => {
                // Letter-based error marking (always shown)
                const letters = parseWordIntoLetters(word);
                if (letters.length === 0) {
                    return (
                        <React.Fragment key={`word-${surahNum}:${ayahNum}:${wordIndex}`}>
                            <span>{word}</span>{' '}
                        </React.Fragment>
                    );
                }
                const isLastWordInVerse = wordIndex === wordsArray.length - 1;
                const markPlan = wordMarkPlan(word);
                return (
                    <span key={`word-${surahNum}:${ayahNum}:${wordIndex}`} className="relative inline" style={{ display: 'inline', fontFamily: markPlan.mode === 'wholeWord' ? markPlan.font : 'inherit' }}>
                        {letters.map(({ letter, index: letterIndex }) => {
                            const letterKey = `${surahNum}:${ayahNum}:${wordIndex}:${letterIndex}`;
                            const mistake = studentMistakes[letterKey];
                            const isEditing = editingLetterKey === letterKey;
                            const clickState = letterClickStates.current[letterKey] || (mistake ? 2 : 0);
                            const isLastLetterOfWord = letterIndex === letters.length - 1;
                            // Cursive-join hints so each isolated letter span shapes correctly on iOS.
                            const joinLead  = letterIndex > 0 && connectsForward(letters[letterIndex - 1].letter[0]);
                            const joinTrail = !isLastLetterOfWord && connectsForward(letter[0]);
                            return (
                                <LetterWithError
                                    key={letterKey}
                                    letter={letter}
                                    joinLead={joinLead}
                                    joinTrail={joinTrail}
                                    letterKey={letterKey}
                                    mistake={mistake}
                                    isEditing={isEditing}
                                    errorText={errorTextInput}
                                    onLetterClick={readOnly ? () => {} : handleLetterClick}
                                    onTextChange={setErrorTextInput}
                                    onTextSubmit={handleLetterTextSubmit}
                                    onTextCancel={handleLetterTextCancel}
                                    showQalqalah={showQalqalah}
                                    showGhunnah={showGhunnah}
                                    showMadd={showMadd}
                                    clickState={clickState}
                                    word={word}
                                    nextWord={wordsArray[wordIndex + 1] || ''}
                                    prevWord={wordsArray[wordIndex - 1] || ''}
                                    letterIndex={letterIndex}
                                    isLastWordInVerse={isLastWordInVerse}
                                    isLastLetterOfWord={isLastLetterOfWord}
                                    isFocused={highlightedLetterKey === letterKey}
                                    isCursorActive={cursorLetterKey === letterKey || localCursorKey === letterKey}
                                    onLongPress={!readOnly ? handleLetterLongPress : undefined}
                                />
                            );
                        })}
                        {' '}
                    </span>
                );
            });
            const isSelectedStart = selectionStart?.surah === surahNum && selectionStart?.ayah === ayahNum;
            const verseMarker = (<VerseMarker key={`marker-${verse.verse_key}`} number={ayahNum} surah={surahNum} isSelectedStart={isSelectedStart}/>);
            const isVerseNowPlaying = readOnly && readOnlyAudioVerse?.surah === surahNum && readOnlyAudioVerse?.ayah === ayahNum;
            const verseTextNode = (
                <span
                    key={`text-${verse.verse_key}`}
                    className={`px-1 py-1 rounded-md transition-all duration-300
                        ${VERSE_BG[vColor.base]} ${vColor.underline ? VERSE_UNDERLINE : ''}
                        ${isVerseHidden ? 'opacity-0' : 'opacity-100'}
                        ${readOnly ? 'cursor-pointer' : ''}
                        ${isVerseNowPlaying ? 'ring-2 ring-teal-500 dark:ring-teal-400' : ''}`}
                    // readOnly: use CAPTURE phase so LetterWithError's stopPropagation() (bubble phase) can't block us
                    // Skip audio if the click originated inside the Tadabbur note section
                    onClickCapture={readOnly ? (e) => {
                        if ((e.target as Element).closest?.('[data-tadabbur]')) return;
                        const audio = readOnlyAudioRef.current;
                        if (!audio) return;
                        const isSame = readOnlyAudioVerse?.surah === surahNum && readOnlyAudioVerse?.ayah === ayahNum;
                        if (isSame) {
                            if (audio.paused) {
                                audio.play().catch(() => {});
                            } else {
                                audio.pause();
                                setReadOnlyAudioVerse(null);
                            }
                            return;
                        }
                        readOnlySeqRef.current = false; // verse-text tap = single ayah only
                        audio.pause();
                        audio.src = audioUrl(surahNum, ayahNum);
                        audio.playbackRate = readOnlySpeed;
                        audio.play().catch(() => {});
                        setReadOnlyAudioVerse({ surah: surahNum, ayah: ayahNum });
                    } : undefined}
                    onClick={!readOnly ? (e) => handleVerseContainerClick(e, surahNum, ayahNum) : undefined}
                    onMouseEnter={!readOnly ? () => { hoveredVerse.current = { surah: surahNum, ayah: ayahNum }; } : undefined}
                    onMouseLeave={!readOnly ? () => { hoveredVerse.current = null; } : undefined}
                >
                    {verseWords}
                </span>
            );

            // ── Tadabbur note section ─────────────────────────────────────────
            const noteKey = `${surahNum}:${ayahNum}`;
            const existingNote = verseNotes[noteKey] ?? '';
            const isEditingThisNote = editingNoteKey === noteKey;
            const isSavingThisNote = savingNoteKey === noteKey;
            // readOnly (student portal): show when tadabbur mode is on OR a note already exists.
            // Tutor live session: show only when showStudentNotes is enabled and a note exists.
            const showNoteArea = !!notesStudentId && (
              readOnly
                ? (tadabburMode || !!existingNote)
                : (showStudentNotes && !!existingNote)
            );

            const noteSection = showNoteArea ? (
                <div dir="ltr" className="mt-3 font-sans text-left" data-tadabbur="true">
                    {isEditingThisNote ? (
                        /* ── Edit mode: auto-saves on blur, no Save button needed ── */
                        <div className="flex flex-col gap-1.5">
                            <textarea
                                value={editingNoteText}
                                onChange={e => setEditingNoteText(e.target.value)}
                                rows={3}
                                autoFocus
                                placeholder="اكتب تأملك في هذه الآية... / Write your reflection on this verse..."
                                className="w-full p-3 text-sm border-2 border-emerald-400 dark:border-emerald-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 resize-none transition"
                                onKeyDown={e => {
                                    if (e.key === 'Escape') { setEditingNoteKey(null); setEditingNoteText(''); }
                                }}
                                onBlur={() => handleSaveNote(surahNum, ayahNum, editingNoteText)}
                            />
                            <span className="text-[10px] text-slate-400">
                                {isSavingThisNote
                                    ? <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin" />Saving…</span>
                                    : 'Saves automatically · Esc to discard'}
                            </span>
                        </div>
                    ) : existingNote ? (
                        /* ── Note exists: show it; student can click anywhere to edit ── */
                        <div
                            className={`group relative p-3 rounded-xl border text-sm leading-relaxed whitespace-pre-wrap
                                bg-emerald-50 dark:bg-emerald-900/20
                                border-emerald-200 dark:border-emerald-800
                                text-slate-700 dark:text-slate-300
                                ${readOnly ? 'cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition-all' : ''}`}
                            onClick={readOnly
                                ? () => { setEditingNoteKey(noteKey); setEditingNoteText(existingNote); }
                                : undefined}
                        >
                            <div className="flex items-start gap-2">
                                <span className="flex-shrink-0 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mt-0.5">
                                    {readOnly ? '✍️' : '🎓'}
                                </span>
                                <p>{existingNote}</p>
                            </div>
                            {readOnly && (
                                <span className="absolute top-2 end-2 text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    Edit ✏️
                                </span>
                            )}
                            {!readOnly && (
                                <span className="absolute top-2 end-2 text-[10px] text-emerald-500 font-semibold opacity-60">
                                    Student's Tadabbur
                                </span>
                            )}
                        </div>
                    ) : tadabburMode ? (
                        /* ── Tadabbur mode ON, no note yet: open edit immediately ── */
                        <button
                            onClick={() => { setEditingNoteKey(noteKey); setEditingNoteText(''); }}
                            className="w-full text-left text-xs text-emerald-600 dark:text-emerald-400 py-2 px-3 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 hover:border-emerald-500 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/10 transition-all font-medium"
                        >
                            + تدبر / Add reflection
                        </button>
                    ) : null}
                </div>
            ) : null;

            // Force block container when note section is visible (breaks inline Quran flow intentionally)
            const verseContainerClass = `my-4${showTranslation || showNoteArea ? '' : ' inline'}`;
            const verseContainerId = `verse-container-${verse.verse_key}`;

            // Homework verse highlight — soft purple background, no border lines
            const isHwVerse = isVerseInHomeworkRange(surahNum, ayahNum, homeworkRanges);
            const hwHighlightClass = isHwVerse
                ? ' bg-violet-100/70 dark:bg-violet-900/25 rounded-lg'
                : '';

            if (showTranslation) {
                const verseContainer = (
                    <div id={verseContainerId} key={`verse-container-${verse.verse_key}`} className={`my-4${hwHighlightClass}`}>
                        <div className="arabic-verse leading-[2.8]">{verseTextNode}{verseMarker}</div>
                        {noteSection}
                        <div key={`trans-container-${verse.verse_key}`} dir="ltr" className="translation-container mt-4 text-left font-sans text-base leading-relaxed space-y-3">
                            {isTranslationLoading ? (
                                <div className="p-4 bg-slate-50 dark:bg-gray-700/50 rounded-lg text-slate-500 animate-pulse">{t('liveSession.loadingTranslation')}</div>
                            ) : translations[verse.verse_key] ? (
                                <div className="p-4 bg-slate-50 dark:bg-gray-700/50 rounded-lg text-slate-700 dark:text-slate-300">
                                    <p className="font-bold text-teal-700 dark:text-orange-500 mb-2">{t('liveSession.translation')}:</p>
                                    <p>{translations[verse.verse_key]}</p>
                                </div>
                            ) : translationError ? (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">{translationError}</div>
                            ) : null}
                            {isTafsirLoading ? (
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-slate-500 animate-pulse">Loading explanation...</div>
                            ) : tafsirs[verse.verse_key] ? (
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-slate-700 dark:text-slate-300">
                                    <p className="font-bold text-blue-700 dark:text-blue-400 mb-2">Explanation:</p>
                                    <p>{tafsirs[verse.verse_key]}</p>
                                </div>
                            ) : tafsirError ? (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">{tafsirError}</div>
                            ) : null}
                        </div>
                    </div>
                );
                surahContent.push(verseContainer);
            } else {
                surahContent.push(
                    <div id={verseContainerId} key={verseContainerId} className={`${verseContainerClass}${hwHighlightClass}`}>
                        {verseTextNode}
                        {verseMarker}
                        {noteSection}
                    </div>
                );
             }
        });
        const sizeClass = fontSize <= 1 ? 'text-base' : `text-${fontSize}xl`;
        const wrapperClassName = `font-quranic text-slate-900 dark:text-slate-100 text-center ${sizeClass} select-none py-6 px-2 sm:py-10 sm:px-4` + (showTranslation ? '' : ' leading-[2.6]');
        return (<div className={wrapperClassName}>{surahContent}</div>);
    };

    return (
        <div className="space-y-6 relative px-2 sm:px-4 lg:px-6 py-4 sm:py-6 lg:py-8">
            {/* Cursor-sharing indicator (tutor side) — confirms the student can
                see where the tutor is pointing. Toggle with the C key. */}
            {cursorModeActive && !readOnly && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500 text-white text-sm font-bold shadow-lg shadow-cyan-500/40 pointer-events-none select-none">
                    <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                    </span>
                    Pointer visible to student · press C to stop
                </div>
            )}
            {/* Red screen overlay for mistake indication */}
            {showMistakeHighlight && (
                <div 
                    className="fixed inset-0 bg-red-500/30 z-[9999] pointer-events-none"
                    style={{
                        animation: 'fadeOut 0.5s ease-out forwards'
                    }}
                />
            )}
            {/* Repetition counter display - center screen with fade effect */}
            {showCounter && memorizationCounter > 0 && (
                <div 
                    className="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center"
                    style={{
                        animation: 'fadeInOut 1.5s ease-in-out'
                    }}
                >
                    <span 
                        className="text-9xl font-bold text-gray-400 dark:text-gray-500"
                        style={{
                            opacity: 0.7,
                            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        {memorizationCounter}
                    </span>
                </div>
            )}
            {/* Try again display - center screen with fade and vibration effect */}
            {showTryAgain && (
                <div 
                    className="fixed inset-0 z-[9998] pointer-events-none flex items-center justify-center"
                    style={{
                        animation: 'fadeInOut 1.5s ease-in-out, shake 0.5s ease-in-out'
                    }}
                >
                    <span 
                        className="text-7xl font-bold text-gray-400 dark:text-gray-500"
                        style={{
                            opacity: 0.7,
                            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        Try Again!
                    </span>
                </div>
            )}
            <style>{`
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
                @keyframes fadeInOut {
                    0% {
                        opacity: 0;
                        transform: scale(0.8);
                    }
                    20% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    80% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    100% {
                        opacity: 0;
                        transform: scale(0.8);
                    }
                }
                /* Tutor's live pointer — pulsing cyan highlight on the student's screen */
                @keyframes cursorGlow {
                    0%, 100% { background-color: rgba(34,211,238,0.35); box-shadow: 0 0 0 2px rgba(6,182,212,0.55); }
                    50%      { background-color: rgba(34,211,238,0.60); box-shadow: 0 0 10px 3px rgba(6,182,212,0.85); }
                }
                .cursor-pointer-glow {
                    border-radius: 5px;
                    animation: cursorGlow 1.1s ease-in-out infinite;
                }
                @keyframes shake {
                    0%, 100% {
                        transform: translateX(0);
                    }
                    10%, 30%, 50%, 70%, 90% {
                        transform: translateX(-10px);
                    }
                    20%, 40%, 60%, 80% {
                        transform: translateX(10px);
                    }
                }
            `}</style>
            <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200 dark:bg-gray-800 dark:border-gray-700">
                <div className="flex justify-between items-start">
                    <div className="flex-grow min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-bold text-teal-800 dark:text-slate-100">{student.name}{student.dob ? ` (${t('liveSession.age', { age: getAge(student.dob) })})` : ''}</h1>
                            {nameCardExtra}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">{t('liveSession.currentProgress')}: {studentProgress ? `${QURAN_METADATA[studentProgress.surah - 1].transliteratedName}, Ayah ${studentProgress.ayah}` : t('liveSession.notSet')}</p>
                    </div>
                     {!readOnly && (
                     <div className="flex-shrink-0 flex items-center gap-2"><button onClick={() => onGoBack()} className="p-2.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg></button></div>
                     )}
                </div>
                <SurahProgressBar surahStatuses={surahStatuses} title={t('liveSession.overallProgress')} type="reading" />
                <MilestoneTracker studentProgress={studentProgress} />
            </div>

            <div className="space-y-6">
                <div className="p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-t-none rounded-b-xl shadow-md border border-slate-200 dark:border-gray-700 sticky z-30" style={{ top: `${toolbarStickyTop}px` }}>
                    {/* Toolbar: fixed left controls | scrollable surah pills | fixed right controls.
                        Wraps on narrow screens so the right-side controls stay reachable. */}
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {/* ── Left: speed control (readOnly) OR error type toggle (live) ── */}
                        {readOnly ? (
                        <div className="relative flex-shrink-0" dir="ltr">
                            {/* Speed: a single circle showing the current rate; click to pick. */}
                            <button
                                onClick={() => setSpeedMenuOpen(o => !o)}
                                title="Recitation speed"
                                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-gray-700/60 flex items-center justify-center text-[11px] font-extrabold text-teal-700 dark:text-teal-300 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors shadow-sm leading-none"
                            >
                                {readOnlySpeed}×
                            </button>
                            {speedMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setSpeedMenuOpen(false)} />
                                    <div className="absolute top-full left-0 mt-1 z-40 flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 p-1">
                                        <span className="px-2 pt-0.5 pb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500 select-none">🔊 Speed</span>
                                        {[0.5, 0.75, 1, 1.25, 1.5].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => { setReadOnlySpeed(s); setSpeedMenuOpen(false); }}
                                                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-center transition-colors ${readOnlySpeed === s ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                            >
                                                {s}×
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <div className={`flex items-center gap-1 rounded-full px-2 py-1 h-10 transition-colors duration-300 ${errorType === 'reading' ? 'bg-red-100 dark:bg-red-900/40 ring-1 ring-red-400' : errorType === 'tajweed' ? 'bg-green-100 dark:bg-green-900/40 ring-1 ring-green-400' : 'bg-slate-200 dark:bg-gray-700'}`}>
                                <button
                                    onClick={() => setErrorType('reading')}
                                    className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors duration-300 text-[10px] font-bold ${errorType === 'reading' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
                                    title={t('liveSession.readingError')}
                                >R</button>
                                <button
                                    onClick={() => setErrorType('tajweed')}
                                    className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors duration-300 text-[10px] font-bold ${errorType === 'tajweed' ? 'bg-green-500 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:bg-green-100 dark:hover:bg-green-900/30'}`}
                                    title={t('liveSession.tajweedError')}
                                >T</button>
                                {hiddenRanges.length > 0 && (
                                    <>
                                        <div className="w-px h-4 bg-slate-300 dark:bg-gray-600 mx-1" />
                                        <button
                                            onClick={() => setHiddenRanges([])}
                                            title="Reveal all hidden verses"
                                            className="w-6 h-6 flex items-center justify-center rounded-full text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                            </svg>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        )}
                        {/* ── Middle: surah pills — first & last pinned, middle scrolls ── */}
                        <div className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
                            {/* First surah (Al-Fatihah) — pinned */}
                            {surahStatuses[0] && (
                                <button
                                    id={`surah-nav-${surahStatuses[0].id}`}
                                    onClick={() => handleSurahSelection(surahStatuses[0].id)}
                                    className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 sm:gap-2 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${getSurahNavButtonClass(surahStatuses[0].id, surahStatuses[0].status, surahStatuses[0].memStatus)}`}>
                                    <span className="font-mono text-xs">{surahStatuses[0].id}</span>
                                    <div className={`w-px h-4 ${getDividerClass(surahStatuses[0].id, surahStatuses[0].status, surahStatuses[0].memStatus)}`} />
                                    <span className="tracking-wide">{surahStatuses[0].transliteratedName}</span>
                                </button>
                            )}
                            <div className="w-px h-6 bg-slate-300 dark:bg-gray-500 flex-shrink-0" />
                            {/* Scroll-left arrow */}
                            <button
                                onClick={() => surahNavScrollRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
                                aria-label="Scroll surahs left"
                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-base leading-none"
                            >‹</button>
                            {/* Surahs 2–113 — scrollable */}
                            <div ref={surahNavScrollRef} className="flex-1 overflow-x-auto overflow-y-hidden horizontal-scrollbar min-w-0">
                                <div className="flex items-center gap-1 sm:gap-2 pb-0.5">
                                    {surahStatuses.slice(1, -1).map(({ id, transliteratedName, status, memStatus }) => (
                                        <button key={id} id={`surah-nav-${id}`} onClick={() => handleSurahSelection(id)}
                                            className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 sm:gap-2 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${getSurahNavButtonClass(id, status, memStatus)}`}>
                                            <span className="font-mono text-xs">{id}</span>
                                            <div className={`w-px h-4 ${getDividerClass(id, status, memStatus)}`} />
                                            <span className="tracking-wide">{transliteratedName}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Scroll-right arrow */}
                            <button
                                onClick={() => surahNavScrollRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                                aria-label="Scroll surahs right"
                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-base leading-none"
                            >›</button>
                            <div className="w-px h-6 bg-slate-300 dark:bg-gray-500 flex-shrink-0" />
                            {/* Last surah (An-Nas) — pinned */}
                            {surahStatuses.length > 1 && surahStatuses[surahStatuses.length - 1] && (
                                <button
                                    id={`surah-nav-${surahStatuses[surahStatuses.length - 1].id}`}
                                    onClick={() => handleSurahSelection(surahStatuses[surahStatuses.length - 1].id)}
                                    className={`flex-shrink-0 flex items-center gap-1 px-2 py-0.5 sm:gap-2 sm:px-3 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap ${getSurahNavButtonClass(surahStatuses[surahStatuses.length - 1].id, surahStatuses[surahStatuses.length - 1].status, surahStatuses[surahStatuses.length - 1].memStatus)}`}>
                                    <span className="font-mono text-xs">{surahStatuses[surahStatuses.length - 1].id}</span>
                                    <div className={`w-px h-4 ${getDividerClass(surahStatuses[surahStatuses.length - 1].id, surahStatuses[surahStatuses.length - 1].status, surahStatuses[surahStatuses.length - 1].memStatus)}`} />
                                    <span className="tracking-wide">{surahStatuses[surahStatuses.length - 1].transliteratedName}</span>
                                </button>
                            )}
                        </div>

                        {/* ── Right: tool controls (always visible) ── */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Font size */}
                            <div className="flex items-center gap-1 bg-slate-200 dark:bg-gray-700 rounded-lg p-1">
                                <button onClick={handleDecreaseFontSize} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.decreaseFont')}>-</button>
                                <span className="text-slate-600 dark:text-slate-300 font-semibold w-7 text-center text-sm">A</span>
                                <button onClick={handleIncreaseFontSize} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.increaseFont')}>+</button>
                            </div>

                            {/* Auto-scroll */}
                            <div className={`flex items-center gap-2 bg-slate-200 dark:bg-gray-700 rounded-lg p-1 transition-all duration-300 ease-in-out ${isAutoScrolling ? 'w-32' : 'w-auto'}`}>
                                <button onClick={() => setIsAutoScrolling(prev => !prev)} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition flex-shrink-0" title={isAutoScrolling ? t('liveSession.toggleAutoScrollPause') : t('liveSession.toggleAutoScrollPlay')}>
                                    {isAutoScrolling ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v10a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5ZM12.5 3.5A1.5 1.5 0 0 1 14 5v10a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5Z" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m9 12.75 3 3m0 0 3-3m-3 3v-7.5" /></svg>}
                                </button>
                                {isAutoScrolling && (<div className="flex items-center justify-center gap-1 flex-grow"><button onClick={handleDecreaseSpeed} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.decreaseScrollSpeed')} title={t('liveSession.decreaseScrollSpeed')}>-</button><span className="text-sm font-mono text-slate-700 dark:text-slate-200 w-8 text-center">{scrollSpeed}</span><button onClick={handleIncreaseSpeed} className="w-7 h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.increaseScrollSpeed')} title={t('liveSession.increaseScrollSpeed')}>+</button></div>)}
                            </div>

                            {/* ── Right-side compact controls ── */}
                            <div className="flex items-center gap-1.5">
                                {/* Focus / word-by-word mode toggle */}
                                <button
                                    onClick={() => setFocusMode(p => !p)}
                                    title={focusMode ? 'Exit focus mode' : 'Focus mode — scroll through words'}
                                    className={`h-7 px-2.5 flex items-center justify-center rounded-md text-[11px] font-bold transition-colors duration-200 ${focusMode ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-900/30'}`}
                                >
                                    🔍
                                </button>

                                {/* ── "Tools" combined dropdown ── */}
                                <div className="relative" ref={toolsMenuRef}>
                                    <button
                                        onClick={() => setShowToolsMenu(p => !p)}
                                        title="Tools"
                                        className={`h-7 px-2.5 flex items-center gap-1.5 rounded-md text-xs font-semibold transition-colors duration-200 ${
                                            showToolsMenu || showTranslation || showQalqalah || showGhunnah || showMadd || teacherNote
                                                ? 'bg-teal-600 text-white shadow-md'
                                                : 'bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-300 hover:bg-teal-100 dark:hover:bg-teal-900/30'
                                        }`}
                                    >
                                        Tools
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-70"><path d="M6 8L1 3h10L6 8z"/></svg>
                                    </button>

                                    {showToolsMenu && (
                                        <div className="absolute top-full mt-1.5 end-0 z-50 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-xl p-3 flex flex-col gap-1 min-w-[190px]">
                                            {/* Translation */}
                                            <button onClick={() => setShowTranslation(p => !p)} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${showTranslation ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                <span className="w-4 h-4 flex items-center justify-center text-xs font-bold">T</span>
                                                Translation
                                            </button>

                                            <div className="border-t border-slate-100 dark:border-gray-700 my-1" />
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">Tajweed Highlights</p>

                                            <button onClick={() => setShowQalqalah(p => !p)} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${showQalqalah ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                <span className="w-3 h-3 rounded-full bg-sky-400 flex-shrink-0" />{t('liveSession.toggleQalqalah')}
                                            </button>
                                            <button onClick={() => setShowGhunnah(p => !p)} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${showGhunnah ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />{t('liveSession.toggleGhunnah')}
                                            </button>
                                            <button onClick={() => setShowMadd(p => !p)} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${showMadd ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                <span className="w-3 h-3 rounded-full bg-pink-500 flex-shrink-0" />{t('liveSession.toggleMadd')}
                                            </button>

                                            {/* Teacher's Notes */}
                                            {!readOnly && (<>
                                                <div className="border-t border-slate-100 dark:border-gray-700 my-1" />
                                                <button onClick={() => { openTeacherNoteWindow(); setShowToolsMenu(false); }} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${teacherNote ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                    <span className="text-base">🗒️</span> Teacher's Notes
                                                </button>
                                                {notesStudentId && (
                                                    <button onClick={() => setShowStudentNotes(p => !p)} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${showStudentNotes ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                        <span className="text-base">✍️</span> Student Notes
                                                    </button>
                                                )}
                                            </>)}

                                            {/* Tadabbur */}
                                            {readOnly && notesStudentId && (<>
                                                <div className="border-t border-slate-100 dark:border-gray-700 my-1" />
                                                <button onClick={() => { setTadabburMode(p => !p); setShowToolsMenu(false); }} className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tadabburMode ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                    <span style={{ fontFamily: 'Amiri Regular', fontSize: '0.85rem' }}>تدبر</span> Tadabbur
                                                </button>
                                            </>)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Search */}
                            <form onSubmit={handleSearch} className="flex gap-2 items-center">
                                <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder={t('liveSession.searchPlaceholder')} className="w-24 px-2 py-2 text-sm bg-white dark:bg-gray-900 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:focus:ring-orange-500 focus:outline-none transition" />
                                <button type="submit" disabled={isSearching} className="bg-teal-600 dark:bg-orange-600 text-white p-2.5 rounded-lg hover:bg-teal-700 dark:hover:bg-orange-700 transition disabled:bg-slate-400 dark:disabled:bg-gray-600" aria-label={t('liveSession.search')}>
                                    {isSearching ? <SpinnerIcon/> : <SearchIcon/>}
                                </button>
                            </form>
                        </div>
                    </div>
                    {/* ── Verse navigation bar — shown in sticky toolbar during focus mode ── */}
                    {focusMode && (
                        <div className="border-t border-slate-100 dark:border-gray-700 mt-2 pt-2">
                            <div
                                ref={verseBarRef}
                                className="flex overflow-x-auto gap-1 py-0.5 px-1"
                                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                            >
                                {Array.from({ length: selectedSurahInfo?.numberOfAyahs ?? 0 }, (_, i) => i + 1).map(ayah => (
                                    <button
                                        key={ayah}
                                        data-versenum={ayah}
                                        onClick={() => scrollToAyah(ayah)}
                                        className={`flex-shrink-0 min-w-[2rem] h-7 px-2 rounded-lg text-[11px] font-semibold transition-all duration-200 ${
                                            currentAyah === ayah
                                                ? 'bg-violet-600 text-white shadow-md scale-110 ring-2 ring-violet-300 dark:ring-violet-700'
                                                : 'bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 hover:text-violet-700 dark:hover:text-violet-300'
                                        }`}
                                    >
                                        {ayah}
                                    </button>
                                ))}
                            </div>
                            <p className="text-center text-[9px] text-slate-300 dark:text-slate-600 mt-0.5 tracking-wide">Verse {currentAyah} of {selectedSurahInfo?.numberOfAyahs ?? '—'}</p>
                        </div>
                    )}
                </div>
                <div dir="rtl" ref={quranBodyRef} className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-slate-200 dark:border-gray-700 min-h-[50vh] overflow-hidden">
                    <div>
                        {/* ── Focus / word-by-word strip ───────────────────────────────────── */}
                        {focusMode ? (
                            (() => {
                                const surahLabel = selectedSurahInfo
                                    ? `${selectedSurahInfo.transliteratedName}`
                                    : '';
                                const slotStyle: React.CSSProperties = {
                                    flexShrink: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0.5rem 2.5vw',
                                    userSelect: 'none',
                                    overflow: 'visible',
                                    position: 'relative',
                                };
                                return (
                                    <div dir="ltr" className="flex flex-col justify-center min-h-[60vh] py-10 select-none bg-white dark:bg-gray-800">
                                        {/* Surah label */}
                                        <p className="text-center text-xs font-semibold text-violet-500 dark:text-violet-400 mb-6 tracking-widest uppercase">{surahLabel}</p>

                                        {/* ── Free-scroll carousel — auto-width, RAF-driven ── */}
                                        <div
                                            ref={carouselContainerRef}
                                            style={{
                                                width: '100%',
                                                overflow: 'hidden',
                                                // Fade edges to indicate more content
                                                WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
                                                maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
                                            }}
                                        >
                                            {/* Strip — transform is set imperatively by the RAF loop */}
                                            <div
                                                ref={carouselStripRef}
                                                style={{
                                                    display: 'flex',
                                                    flexDirection: 'row-reverse',
                                                    width: 'max-content',
                                                    willChange: 'transform',
                                                }}
                                            >
                                                {focusWordList.map((item, i) => {
                                                    if (item.kind === 'marker') {
                                                        return (
                                                            <div key={`fm-${item.surah}:${item.ayah}`} style={slotStyle}>
                                                                <span
                                                                    className="font-quranic text-slate-400 dark:text-slate-500 flex items-center justify-center rounded-full border-2 border-current"
                                                                    style={{ fontSize: '2.5rem', width: '4rem', height: '4rem' }}
                                                                >
                                                                    {toEasternArabicNumerals(item.ayah)}
                                                                </span>
                                                            </div>
                                                        );
                                                    }

                                                    const letters = parseWordIntoLetters(item.word);
                                                    const prevFocusItem = focusWordList[i - 1];
                                                    const nextFocusItem = focusWordList[i + 1];
                                                    const prevWordStr = prevFocusItem?.kind === 'word' ? prevFocusItem.word : '';
                                                    const nextWordStr = nextFocusItem?.kind === 'word' ? nextFocusItem.word : '';
                                                    return (
                                                        <div
                                                            key={`fw-${item.surah}:${item.ayah}:${item.wordIdx}`}
                                                            ref={item.wordIdx === 0 ? (el) => {
                                                                if (el) verseFirstWordEls.current.set(item.ayah, el);
                                                                else verseFirstWordEls.current.delete(item.ayah);
                                                            } : undefined}
                                                            className="font-quranic text-slate-900 dark:text-slate-100"
                                                            style={{ ...slotStyle, fontSize: '10.5rem', lineHeight: 2.2 }}
                                                        >
                                                            {(() => { const fwPlan = wordMarkPlan(item.word); return (
                                                            <span dir="rtl" className="relative inline" style={{ display: 'inline', fontFamily: fwPlan.mode === 'wholeWord' ? fwPlan.font : 'inherit' }}>
                                                                {letters.length === 0 ? item.word : letters.map(({ letter, index: li }) => {
                                                                    const lk = `${item.surah}:${item.ayah}:${item.wordIdx}:${li}`;
                                                                    const mk = studentMistakes[lk];
                                                                    const cs = letterClickStates.current[lk] || (mk ? 2 : 0);
                                                                    return (
                                                                        <LetterWithError
                                                                            key={lk}
                                                                            letter={letter}
                                                                            joinLead={li > 0 && connectsForward(letters[li - 1].letter[0])}
                                                                            joinTrail={li !== letters.length - 1 && connectsForward(letter[0])}
                                                                            letterKey={lk}
                                                                            mistake={mk}
                                                                            isEditing={editingLetterKey === lk}
                                                                            errorText={errorTextInput}
                                                                            onLetterClick={readOnly ? () => {} : handleLetterClick}
                                                                            onTextChange={setErrorTextInput}
                                                                            onTextSubmit={handleLetterTextSubmit}
                                                                            onTextCancel={handleLetterTextCancel}
                                                                            showQalqalah={showQalqalah}
                                                                            showGhunnah={showGhunnah}
                                                                            showMadd={showMadd}
                                                                            clickState={cs}
                                                                            word={item.word}
                                                                            nextWord={nextWordStr}
                                                                            prevWord={prevWordStr}
                                                                            letterIndex={li}
                                                                            isLastWordInVerse={false}
                                                                            isLastLetterOfWord={li === letters.length - 1}
                                                                            isFocused={highlightedLetterKey === lk}
                                                                            isCursorActive={cursorLetterKey === lk || localCursorKey === lk}
                                                                            onLongPress={!readOnly ? handleLetterLongPress : undefined}
                                                                        />
                                                                    );
                                                                })}
                                                            </span>
                                                            ); })()}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* ── Progress bar (updated imperatively) ── */}
                                        <div className="mt-10 flex flex-col items-center gap-1.5">
                                            <div className="w-52 h-1 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                <div ref={progressBarFillRef} className="h-full bg-violet-500 rounded-full" style={{ width: '0%' }} />
                                            </div>
                                            <p className="text-[9px] text-slate-300 dark:text-slate-600 tracking-wide">← scroll · →</p>
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                        <>
                        <div className="text-center pt-12 pb-8 px-2"><p className="text-4xl font-quranic text-slate-700 dark:text-slate-100">{selectedSurahInfo?.name}</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{selectedSurahInfo?.englishName}</p></div>
                        {showTranslation && isTranslationLoading && <div className="text-center my-4 p-3 bg-slate-100 dark:bg-gray-700 rounded-lg mx-6 sm:mx-12"><p className="text-slate-600 dark:text-slate-300 animate-pulse font-semibold">{t('liveSession.loadingTranslation')}</p></div>}
                        {showTranslation && translationError && <div className="text-center my-4 p-3 bg-red-100 text-red-700 rounded-lg mx-6 sm:mx-12"><p className="font-semibold">{translationError}</p></div>}
                        <hr className="w-48 h-1 mx-auto my-8 bg-teal-100 dark:bg-gray-700 border-0 rounded" />
                        {selectedSurahId !== 1 && selectedSurahId !== 9 && <p className="text-center font-quranic text-4xl text-slate-800 dark:text-slate-200 mb-12">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>}
                        {renderSurahContent()}
                        {/* Colour legend (left) + pagination controls (right) */}
                        {!isLoading && !error && verses.length > 0 && (
                            <div dir="ltr" className="flex flex-wrap justify-between items-center gap-x-4 gap-y-3 py-6 px-4 border-t border-slate-200 dark:border-gray-700">
                                {/* Legend */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-300 dark:bg-green-700" />Read &amp; memorized</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-300 dark:bg-orange-700" />Read</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-300 dark:bg-purple-700" />Homework</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300 dark:bg-blue-700" />Tafsir</span>
                                </div>
                                {/* Pager — only when the surah spans more than one window */}
                                {(hasPreviousPages() || hasMorePages()) && (
                                    <div className="flex items-center gap-3 ms-auto">
                                        <button
                                            onClick={handlePreviousPages}
                                            disabled={!hasPreviousPages()}
                                            className="group flex items-center gap-1.5 ps-3 pe-4 py-2.5 rounded-full text-sm font-semibold shadow-sm transition-all duration-200 border enabled:bg-white enabled:dark:bg-gray-800 enabled:text-teal-700 enabled:dark:text-orange-300 enabled:border-teal-200 enabled:dark:border-orange-900/50 enabled:hover:bg-teal-50 enabled:dark:hover:bg-orange-900/20 enabled:hover:shadow-md enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 disabled:opacity-0 disabled:pointer-events-none disabled:border-transparent"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4 transition-transform group-hover:-translate-x-0.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                            </svg>
                                            <span>Previous</span>
                                        </button>
                                        <span className="px-3.5 py-1.5 rounded-full bg-teal-600 dark:bg-orange-600 text-white text-xs font-bold shadow-sm whitespace-nowrap">
                                            {t('liveSession.page')} {toEasternArabicNumerals(currentPageRange.start)}–{toEasternArabicNumerals(currentPageRange.end)}
                                        </span>
                                        <button
                                            onClick={handleNextPages}
                                            disabled={!hasMorePages()}
                                            className="group flex items-center gap-1.5 ps-4 pe-3 py-2.5 rounded-full text-sm font-semibold shadow-sm transition-all duration-200 border enabled:bg-teal-600 enabled:dark:bg-orange-600 enabled:text-white enabled:border-teal-600 enabled:dark:border-orange-600 enabled:hover:bg-teal-700 enabled:dark:hover:bg-orange-700 enabled:hover:shadow-md enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 disabled:opacity-0 disabled:pointer-events-none disabled:border-transparent"
                                        >
                                            <span>Next</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4 transition-transform group-hover:translate-x-0.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        </>
                        )}
                    </div>
                </div>
            </div>
            {student && <ExportReportModal student={student} students={students} quranMetadata={QURAN_METADATA} isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />}
            {toastMessage && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-lg transition-all animate-bounce z-50">{toastMessage}</div>}
            {/* Back to the start of the current surah */}
            {showScrollTop && (
                <button
                    onClick={() => setScrollToVerseKey(`${selectedSurahId}:1`)}
                    aria-label="Back to start of surah"
                    title="Back to start of surah"
                    className="fixed bottom-6 end-6 z-50 w-12 h-12 flex items-center justify-center rounded-full bg-teal-600 dark:bg-orange-600 text-white shadow-lg hover:bg-teal-700 dark:hover:bg-orange-700 hover:-translate-y-0.5 active:translate-y-0 transition-all"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                </button>
            )}
            <SearchResultsModal isOpen={isSearchResultsModalOpen} onClose={() => setIsSearchResultsModalOpen(false)} results={searchResults} query={searchInput} onSelect={handleSelectSearchResult} />
            <ConfirmationModal isOpen={confirmModalState.isOpen} onClose={() => setConfirmModalState({ isOpen: false, title: '', message: '', onConfirm: () => {} })} onConfirm={confirmModalState.onConfirm} title={confirmModalState.title} message={confirmModalState.message} />

            {/* ── Log Type Modal ────────────────────────────────────────────── */}
            {logTypeStep && pendingLogRange && (
                <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4" onClick={cancelLogModal}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        {logTypeStep === 'type' ? (
                            <>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    Log Progress
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    {QURAN_METADATA.find(s => s.number === pendingLogRange.start.surah)?.transliteratedName} {pendingLogRange.start.ayah}
                                    {(pendingLogRange.start.surah !== pendingLogRange.end.surah || pendingLogRange.start.ayah !== pendingLogRange.end.ayah)
                                        ? ` → ${QURAN_METADATA.find(s => s.number === pendingLogRange.end.surah)?.transliteratedName} ${pendingLogRange.end.ayah}`
                                        : ''}
                                </p>
                                <div className="space-y-2">

                                    {/* ── Reading: show Revision if surah already has reading, else first-time Reading ── */}
                                    {hasReadingForRange(pendingLogRange.start, pendingLogRange.end) ? (
                                        <button onClick={() => { setSelectedLogType('reading-revision'); setLogTypeStep('quality'); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-semibold transition-colors">
                                            <span className="text-xl">🔄</span> Log Reading Revision
                                        </button>
                                    ) : (
                                        <button onClick={() => { setSelectedLogType('reading'); setLogTypeStep('quality'); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 font-semibold transition-colors">
                                            <span className="text-xl">📖</span> Log Reading
                                        </button>
                                    )}

                                    {/* ── Hifz: show Revision if surah already has hifz, else first-time Hifz ── */}
                                    {hasHifzForRange(pendingLogRange.start, pendingLogRange.end) ? (
                                        <button onClick={() => { setSelectedLogType('hifz-revision'); setLogTypeStep('quality'); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-200 font-semibold transition-colors">
                                            <span className="text-xl">🔁</span> Log Hifz Revision
                                        </button>
                                    ) : (
                                        <button onClick={() => { setSelectedLogType('hifz'); setLogTypeStep('quality'); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-200 font-semibold transition-colors">
                                            <span className="text-xl">🧠</span> Log Hifz
                                        </button>
                                    )}

                                    {/* ── Tafseer — hidden once surah already has tafseer ── */}
                                    {!hasTafseerForRange(pendingLogRange.start, pendingLogRange.end) && (
                                        <button onClick={() => {
                                            if (!pendingLogRange) return;
                                            onLogTafseerRange(student.id, pendingLogRange);
                                            showToast('Tafseer logged');
                                            setPendingLogRange(null); setLogTypeStep(null); setSelectedLogType(null);
                                        }}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-semibold transition-colors">
                                            <span className="text-xl">📚</span> Log Tafseer
                                        </button>
                                    )}

                                    {/* ── Homework ── */}
                                    {onLogHomework && (
                                        <button onClick={() => { setSelectedLogType('homework'); setHomeworkNote(''); setLogTypeStep('homework-note'); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/60 text-violet-800 dark:text-violet-200 font-semibold transition-colors">
                                            <span className="text-xl">📝</span> Assign Homework
                                        </button>
                                    )}
                                </div>
                                <button onClick={cancelLogModal} className="mt-4 w-full py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">Cancel</button>
                            </>
                        ) : logTypeStep === 'homework-note' ? (
                            <>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    📝 Assign Homework
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    {QURAN_METADATA.find(s => s.number === pendingLogRange.start.surah)?.transliteratedName} {pendingLogRange.start.ayah}
                                    {(pendingLogRange.start.surah !== pendingLogRange.end.surah || pendingLogRange.start.ayah !== pendingLogRange.end.ayah)
                                        ? ` → ${QURAN_METADATA.find(s => s.number === pendingLogRange.end.surah)?.transliteratedName} ${pendingLogRange.end.ayah}`
                                        : ''}
                                </p>
                                <textarea
                                    autoFocus
                                    value={homeworkNote}
                                    onChange={e => setHomeworkNote(e.target.value)}
                                    placeholder="Write instructions for the student (optional)…"
                                    rows={4}
                                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 mb-4"
                                />
                                <div className="flex gap-3">
                                    <button onClick={() => setLogTypeStep('type')} className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">Back</button>
                                    <button onClick={confirmLog} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors">Assign</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {selectedLogType === 'reading' ? 'Reading Quality' :
                                     selectedLogType === 'reading-revision' ? 'Reading Revision Quality' :
                                     selectedLogType === 'hifz' ? 'Hifz Quality' : 'Hifz Revision Quality'}
                                </h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Rate the quality (1–10)</p>
                                <div className="flex items-center gap-4 mb-6">
                                    <input
                                        type="range" min={1} max={10} value={logQuality}
                                        onChange={e => setLogQuality(Number(e.target.value))}
                                        className="flex-1 accent-teal-600"
                                    />
                                    <span className="text-3xl font-bold text-teal-700 dark:text-teal-300 w-8 text-center">{logQuality}</span>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setLogTypeStep('type')} className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">Back</button>
                                    <button onClick={confirmLog} className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors">Save</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── ReadOnly hidden audio element ───────────────────────────── */}
            {readOnly && (
                <audio
                    ref={readOnlyAudioRef}
                    onEnded={() => {
                        // Sequential mode (started from an ayah number): advance to the
                        // next ayah until the surah ends, then stop.
                        if (readOnlySeqRef.current && readOnlyAudioVerse) {
                            const { surah, ayah } = readOnlyAudioVerse;
                            if (ayah < versesInSurah(surah)) {
                                const next = ayah + 1;
                                const audio = readOnlyAudioRef.current;
                                if (audio) {
                                    audio.src = audioUrl(surah, next);
                                    audio.playbackRate = readOnlySpeed;
                                    audio.play().catch(() => {});
                                }
                                setReadOnlyAudioVerse({ surah, ayah: next });
                                return;
                            }
                        }
                        readOnlySeqRef.current = false;
                        setReadOnlyAudioVerse(null);
                    }}
                    preload="none"
                    style={{ display: 'none' }}
                />
            )}
        </div>
    );
};

export default StudentProgressPage;
