import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { QURAN_METADATA } from '../constants';
import { RecitationAchievement, QuranVerse, Student, Progress, MemorizationAchievement, Mistake } from '../types';
import MilestoneTracker from './MilestoneTracker';
import ExportReportModal from './ExportReportModal';
import { useI18n } from '../context/I18nProvider';
import { getPageOfAyah } from '../services/dataService';
import { pageVerseList } from '../services/quranPageData';
import ConfirmationModal from './ConfirmationModal';
import ModernToggle from './ModernToggle';

declare var confetti: any;

type LoggingMode = 'reading' | 'memorization';


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
  onLogRecitationRange: (studentId: string, range: { start: Progress, end: Progress }) => void;
  onRemoveRecitationAchievement: (studentId: string, achievementId: string) => void;
  onLogMemorizationRange: (studentId: string, range: { start: Progress, end: Progress }) => void;
  onRemoveMemorizationAchievement: (studentId: string, achievementId: string) => void;
  onGoBack: () => void;
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
const TANWEEN_GHUNNAH_TANWEEN_CHARS = ['\u064b', '\u064c', '\u064d']; // \u064b \u064c \u064d

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
    isLastLetterOfWord
}) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    
    React.useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    const getLetterColor = () => {
        if (clickState === 1) return 'bg-yellow-100 dark:bg-yellow-900/40';
        if (mistake) {
            if (mistake.errorType === 'tajweed') return 'bg-green-100 dark:bg-green-900/40';
            if (mistake.errorType === 'reading') return 'bg-red-100 dark:bg-red-900/40';
            // Mistake exists but errorType was cleared (verse removed from review) → yellow
            return 'bg-yellow-100 dark:bg-yellow-900/40';
        }
        return '';
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
        <span className="relative inline align-top" style={{ display: 'inline', fontFamily: 'inherit' }}>
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
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-40 pointer-events-auto group"
                    style={{ zIndex: 40 }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.zIndex = '9999';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.zIndex = '40';
                    }}
                >
                    <div className={`px-3 py-1 text-sm rounded-lg shadow-lg whitespace-nowrap max-w-[300px] font-medium transition-all ${
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
                    onLetterClick(letterKey);
                }}
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                className={`inline cursor-pointer rounded transition-colors relative z-10 ${getLetterColor()} ${
                    shouldHighlightSilent(letter)
                        ? '!text-slate-400 dark:!text-slate-500'
                        : `${showGhunnah && shouldHighlightGhunnah(letter, letterIndex, word, nextWord) ? '!text-green-600 dark:!text-green-400' : ''} ${showMadd && shouldHighlightMadd(letter, letterIndex, word, prevWord) ? '!text-pink-600 dark:!text-pink-400' : ''} ${showQalqalah && shouldHighlightQalqalah(letter, letterIndex, word, isLastWordInVerse, isLastLetterOfWord) ? '!text-sky-500 dark:!text-sky-400' : ''}`
                }`}
                style={{ display: 'inline', fontFamily: 'inherit', letterSpacing: '0', pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
            >
                {letter.includes('\u06DF') ? (
                    letter.split('').map((char, idx) => 
                        char === '\u06DF' ? (
                            <span key={idx} style={{ fontFamily: 'Amiri Regular' }}>{char}</span>
                        ) : (
                            <span key={idx}>{char}</span>
                        )
                    )
                ) : (
                    letter
                )}
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

    // Helper function to process unit text and wrap U+06DF characters in Amiri font
    const processUnitWithU06DF = (unitText: string, unitIndex: number, className: string = '') => {
        if (!unitText.includes('\u06DF')) {
            return <span key={unitIndex} className={className}>{unitText}</span>;
        }
        const parts: React.ReactNode[] = [];
        let currentPart = '';
        let charIndex = 0;
        for (let i = 0; i < unitText.length; i++) {
            const char = unitText[i];
            if (char === '\u06DF') {
                if (currentPart) {
                    parts.push(<span key={`${unitIndex}-part-${charIndex++}`}>{currentPart}</span>);
                    currentPart = '';
                }
                parts.push(
                    <span key={`${unitIndex}-u06df-${charIndex++}`} className={className} style={{ fontFamily: 'Amiri Regular' }}>
                        {'\u06DF'}
                    </span>
                );
            } else {
                currentPart += char;
            }
        }
        if (currentPart) {
            parts.push(<span key={`${unitIndex}-part-${charIndex++}`} className={className}>{currentPart}</span>);
        }
        return <React.Fragment key={unitIndex}>{parts}</React.Fragment>;
    };

    const renderedUnits = units.map((unit, index) => {

        // --- SILENT LETTER (always on, no toggle) ---
        // Letters bearing U+06DF (Small High Rounded Zero) are silent in continuous reading.
        // Examples: alif in "أَنَا", wāw in "أُولَٰئِكَ", lām in "ٱلشَّمْس". Show in grey.
        if (unit.includes(SILENT_MARKER)) {
            return processUnitWithU06DF(unit, index, 'text-slate-400 dark:text-slate-500');
        }

        // --- MADD RULE (Madd Far'ee — secondary madds) ---
        // Markers: U+0653 MADDAH ABOVE (Muttasil/Munfasil), U+06E4 SMALL HIGH MADDA (Lazim),
        // U+06E5 SMALL WAW & U+06E6 SMALL YEH (Madd Silah and similar sub-vowels).
        if (showMadd && MADD_MARKERS.some(m => unit.includes(m))) {
            return processUnitWithU06DF(unit, index, 'text-pink-600');
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
            return processUnitWithU06DF(unit, index, 'text-green-600');
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
                     return processUnitWithU06DF(unit, index, 'text-sky-500 dark:text-sky-400');
                 }
             }
        }
        
        return processUnitWithU06DF(unit, index);
    });

    return <>{renderedUnits}</>;
});


type SurahStatus = {
    id: number;
    name: string; // The Arabic name
    transliteratedName: string;
    englishName: string;
    status: 'completed' | 'in-progress' | 'not-started';
};

const SurahProgressBar: React.FC<{ surahStatuses: SurahStatus[], title: string, type: LoggingMode }> = ({ surahStatuses, title, type }) => {
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
                {surahStatuses.map(({ id, transliteratedName, status }) => {
                    const statusClass = {
                        'completed': colors[type].completed,
                        'in-progress': colors[type].inProgress,
                        'not-started': colors[type].notStarted
                    }[status];
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


const StudentProgressPage: React.FC<StudentProgressPageProps> = ({ student, students, studentProgress, studentMistakes, recitationAchievements, memorizationAchievements, onUpdateProgress, onCycleMistakeLevel, onClearMistake, onLogRecitationRange, onRemoveRecitationAchievement, onLogMemorizationRange, onRemoveMemorizationAchievement, onGoBack }) => {
    const [loggingMode, setLoggingMode] = useState<LoggingMode>('reading');
    const [errorType, setErrorType] = useState<'tajweed' | 'reading'>('tajweed');
    const [selectedSurahId, setSelectedSurahId] = useState<number>(studentProgress?.surah || 1);
    const [verses, setVerses] = useState<QuranVerse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [scrollToVerseKey, setScrollToVerseKey] = useState<string | null>(studentProgress ? `${studentProgress.surah}:${studentProgress.ayah}` : null);
    const [fontSize, setFontSize] = useState(5); 
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showTranslation, setShowTranslation] = useState(false);
    const [showQalqalah, setShowQalqalah] = useState(false);
    const [showGhunnah, setShowGhunnah] = useState(false);
    const [showMadd, setShowMadd] = useState(false);
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
    
    // New memorization mode state
    const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set()); // Set of word keys: "surah:ayah:wordIndex"
    const [hiddenWords, setHiddenWords] = useState<Set<string>>(new Set()); // Set of word keys that are hidden
    const [memorizationCounter, setMemorizationCounter] = useState<number>(0);
    const [showCounter, setShowCounter] = useState(false);
    const [showTryAgain, setShowTryAgain] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartWord, setDragStartWord] = useState<string | null>(null);
    const [dragEndWord, setDragEndWord] = useState<string | null>(null);

    const hoveredVerse = useRef<{ surah: number; ayah: number } | null>(null);
    const longPressTimer = useRef<number | null>(null);
    const longPressFired = useRef(false);
    const prevSurahStatusesRef = useRef<SurahStatus[]>();
    const prevLoggingModeRef = useRef<LoggingMode>();
    const scrollIntervalRef = useRef<number | null>(null);
    const wordPressTimer = useRef<number | null>(null);
    const wordLongPressFired = useRef(false);
    const letterClickStates = useRef<Record<string, number>>({}); // Track click states: 0 = none, 1 = yellow (pending), 2 = marked
    const [clickStateUpdateTrigger, setClickStateUpdateTrigger] = useState(0); // Force re-render when click states change
    const [showMistakeHighlight, setShowMistakeHighlight] = useState(false);
    const mistakeSoundRef = useRef<(() => void) | null>(null);
    const { t } = useI18n();

    const handleIncreaseSpeed = () => setScrollSpeed(prev => Math.min(100, prev + 5));
    const handleDecreaseSpeed = () => setScrollSpeed(prev => Math.max(1, prev - 5));

    useEffect(() => {
        const handleManualInteraction = () => { if (isAutoScrolling) setIsAutoScrolling(false); };
        if (isAutoScrolling) {
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
    }, [isAutoScrolling, scrollSpeed]);

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

    // Helper function to get all word keys between two word keys
    const getWordsBetween = useCallback((startKey: string, endKey: string): string[] => {
        const [startSurah, startAyah, startWord] = startKey.split(':').map(Number);
        const [endSurah, endAyah, endWord] = endKey.split(':').map(Number);
        
        const words: string[] = [];
        
        // Get all verses between start and end (inclusive)
        const allVerses = verses.filter(v => {
            const [s, a] = v.verse_key.split(':').map(Number);
            const startVerseNum = startSurah * 10000 + startAyah;
            const endVerseNum = endSurah * 10000 + endAyah;
            const currentVerseNum = s * 10000 + a;
            const minNum = Math.min(startVerseNum, endVerseNum);
            const maxNum = Math.max(startVerseNum, endVerseNum);
            return currentVerseNum >= minNum && currentVerseNum <= maxNum;
        });
        
        // Sort verses
        allVerses.sort((a, b) => {
            const [s1, a1] = a.verse_key.split(':').map(Number);
            const [s2, a2] = b.verse_key.split(':').map(Number);
            const num1 = s1 * 10000 + a1;
            const num2 = s2 * 10000 + a2;
            return num1 - num2;
        });
        
        let started = false;
        let ended = false;
        
        for (const verse of allVerses) {
            const [s, a] = verse.verse_key.split(':').map(Number);
            const verseWords = verse.text_uthmani.split(' ');
            
            for (let w = 0; w < verseWords.length; w++) {
                const wordKey = `${s}:${a}:${w}`;
                
                if (wordKey === startKey) started = true;
                if (wordKey === endKey) {
                    if (started) words.push(wordKey);
                    ended = true;
                    break;
                }
                if (started && !ended) words.push(wordKey);
            }
            if (ended) break;
        }
        
        // If we didn't find end, include it
        if (started && !ended) {
            words.push(endKey);
        }
        
        return words;
    }, [verses]);
    
    // Global mouse up handler for drag end
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                if (dragStartWord && dragEndWord) {
                    const wordsInRange = getWordsBetween(dragStartWord, dragEndWord);
                    setSelectedWords(new Set(wordsInRange));
                }
                setDragStartWord(null);
                setDragEndWord(null);
            }
        };
        
        if (isDragging) {
            window.addEventListener('mouseup', handleGlobalMouseUp);
            return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
        }
    }, [isDragging, dragStartWord, dragEndWord, getWordsBetween]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.code === 'Space') {
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                event.preventDefault();
                setIsAutoScrolling(prev => !prev);
            }
            
            // Ctrl key for mistake indication
            if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                event.preventDefault();
                
                // Show red highlight
                setShowMistakeHighlight(true);
                
                // Play mistake sound
                if (mistakeSoundRef.current) {
                    mistakeSoundRef.current();
                }
                
                // Remove highlight after animation
                setTimeout(() => {
                    setShowMistakeHighlight(false);
                }, 500);
            }
            
            // Memorization mode keyboard shortcuts
            if (loggingMode === 'memorization') {
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                
                if (event.key === '+' || event.key === '=') {
                    event.preventDefault();
                    setMemorizationCounter(prev => {
                        const newCount = prev + 1;
                        // Show counter with fade effect
                        setShowCounter(true);
                        setTimeout(() => setShowCounter(false), 1500);
                        return newCount;
                    });
                } else if (event.key === '0') {
                    event.preventDefault();
                    setMemorizationCounter(0);
                    // Show "try again!" with fade and vibration effect
                    setShowTryAgain(true);
                    // Trigger vibration if supported
                    if (navigator.vibrate) {
                        navigator.vibrate([100, 50, 100, 50, 100]);
                    }
                    setTimeout(() => setShowTryAgain(false), 1500);
                } else if (event.key.toLowerCase() === 'h') {
                    event.preventDefault();
                    const hv = hoveredVerse.current;
                    if (hv) {
                        const verse = { surah: hv.surah, ayah: hv.ayah };
                        setHiddenRanges(prev => {
                            const idx = prev.findIndex(range =>
                                isVerseAfterOrEqual(verse, range.start) && isVerseAfterOrEqual(range.end, verse)
                            );
                            if (idx > -1) {
                                // Verse is hidden → reveal it
                                return prev.filter((_, i) => i !== idx);
                            } else {
                                // Verse is visible → hide it
                                return [...prev, { start: verse, end: verse }];
                            }
                        });
                    }
                } else if (event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    if (selectedWords.size > 0) {
                        // Save selected words as memorized
                        // Get the verse range from selected words
                        const verseKeys = new Set<string>();
                        selectedWords.forEach(wordKey => {
                            const [surah, ayah] = wordKey.split(':').slice(0, 2);
                            verseKeys.add(`${surah}:${ayah}`);
                        });
                        
                        // Convert to verse ranges and save
                        const verseArray = Array.from(verseKeys).map(key => {
                            const [surah, ayah] = key.split(':').map(Number);
                            return { surah, ayah };
                        }).sort((a, b) => {
                            const numA = a.surah * 10000 + a.ayah;
                            const numB = b.surah * 10000 + b.ayah;
                            return numA - numB;
                        });
                        
                        if (verseArray.length > 0) {
                            const start = verseArray[0];
                            const end = verseArray[verseArray.length - 1];
                            onLogMemorizationRange(student.id, { start, end });
                            showToast(t('liveSession.memorizationSaved', { ayah: end.ayah }));
                        }
                    }
                }
            }
            
            // Error type shortcuts (only in reading mode)
            if (loggingMode === 'reading') {
                const target = event.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
                if (event.key.toLowerCase() === 'r') {
                    event.preventDefault();
                    setErrorType('reading');
                } else if (event.key.toLowerCase() === 't') {
                    event.preventDefault();
                    setErrorType('tajweed');
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [loggingMode]);

    const surahStatuses = useMemo<SurahStatus[]>(() => {
        const achievements = loggingMode === 'reading' ? recitationAchievements : memorizationAchievements;
        return QURAN_METADATA.map(surah => {
            const surahId = surah.number;
            let status: 'completed' | 'in-progress' | 'not-started' = 'not-started';

            for (const range of achievements) {
                if (surahId > range.startSurah && surahId < range.endSurah) {
                    status = 'completed'; break;
                }
                if (surahId === range.startSurah || surahId === range.endSurah) {
                    if (range.startSurah === surahId && range.endSurah === surahId && range.startAyah === 1 && range.endAyah === surah.numberOfAyahs) {
                         status = 'completed'; break;
                    } else {
                         status = 'in-progress';
                    }
                }
            }
            return {
                id: surah.number, name: surah.name, transliteratedName: surah.transliteratedName,
                englishName: surah.englishName, status
            };
        });
    }, [recitationAchievements, memorizationAchievements, loggingMode]);

    const getSurahNavButtonClass = (surahId: number, status: SurahStatus['status']) => {
        if (surahId === selectedSurahId) return 'bg-teal-600 dark:bg-orange-600 text-white shadow-lg transform scale-105';
        
        const modeColors = {
            reading: { completed: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900',
                       inProgress: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900' },
            memorization: { completed: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900',
                            inProgress: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900' }
        };
        const defaultClass = 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600';
        
        switch (status) {
            case 'completed': return modeColors[loggingMode].completed;
            case 'in-progress': return modeColors[loggingMode].inProgress;
            default: return defaultClass;
        }
    };

    const getDividerClass = (surahId: number, status: SurahStatus['status']) => {
        if (surahId === selectedSurahId) return 'bg-white/40 dark:bg-white/40';
        const modeColors = {
            reading: { completed: 'bg-teal-300 dark:bg-teal-700', inProgress: 'bg-amber-300 dark:bg-amber-700' },
            memorization: { completed: 'bg-sky-300 dark:bg-sky-700', inProgress: 'bg-indigo-300 dark:bg-indigo-700' }
        };
        switch (status) {
            case 'completed': return modeColors[loggingMode].completed;
            case 'in-progress': return modeColors[loggingMode].inProgress;
            default: return 'bg-slate-300 dark:bg-gray-600';
        }
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
                const response = await fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${selectedSurahId}`);
                if (!response.ok) throw new Error('Failed to fetch Surah data.');
                const data = await response.json();
                setVerses(data.verses);
                
                // Reset to first page range when surah changes
                if (data.verses && data.verses.length > 0) {
                    const firstVerse = data.verses[0];
                    const [surahNum, ayahNum] = firstVerse.verse_key.split(':').map(Number);
                    const firstPage = getPageOfAyah(surahNum, ayahNum);
                    const newStart = Math.max(1, Math.floor((firstPage - 1) / 5) * 5 + 1);
                    const newEnd = Math.min(604, newStart + 4);
                    setCurrentPageRange({ start: newStart, end: newEnd });
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
            
            // Update page range to include the target page
            const newStart = Math.max(1, Math.floor((targetPage - 1) / 5) * 5 + 1);
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
        const surahElement = document.getElementById(`surah-nav-${selectedSurahId}`);
        if (surahElement) surahElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [selectedSurahId]);

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
        if (typeof confetti === 'undefined' || !prevSurahStatusesRef.current || prevLoggingModeRef.current !== loggingMode) {
            prevSurahStatusesRef.current = surahStatuses;
            prevLoggingModeRef.current = loggingMode;
            return;
        }

        const prevStatuses = prevSurahStatusesRef.current;
        const newlyCompletedSurahs = surahStatuses.filter((current, index) => {
            const prev = prevStatuses[index];
            // Check if the current status is completed and the previous was not.
            return prev && current.status === 'completed' && prev.status !== 'completed';
        });

        if (newlyCompletedSurahs.length > 0) {
            confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 }, zIndex: 1000 });
            const completedNames = newlyCompletedSurahs.map(s => s.englishName).join(', ');
            showToast(t('liveSession.surahCompleted', { name: completedNames }));
        }

        // Always update the refs for the next render.
        prevSurahStatusesRef.current = surahStatuses;
        prevLoggingModeRef.current = loggingMode;
    }, [surahStatuses, loggingMode, showToast, t]);
    
    // Check if string contains Arabic characters
    const containsArabic = (str: string): boolean => {
        return /[\u0600-\u06FF]/.test(str);
    };
    
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
        for (const surah of QURAN_METADATA) {
            const scores = [
                // Arabic name matching (highest priority for Arabic input)
                containsArabic(term) ? calculateSimilarity(term, surah.name) : 0,
                // English name matching
                calculateSimilarity(normalizedTerm, surah.englishName),
                // Transliterated name matching
                calculateSimilarity(normalizedTerm, surah.transliteratedName),
                calculateSimilarity(normalizedTerm, surah.transliteratedName.replace(/-/g, ' ')),
                calculateSimilarity(normalizedTerm, surah.transliteratedName.replace(/-/g, '')),
                // Check if term matches part of the name
                !containsArabic(term) && surah.englishName.toLowerCase().includes(normalizedTerm) ? 0.7 : 0,
                !containsArabic(term) && surah.transliteratedName.toLowerCase().replace(/-/g, ' ').includes(normalizedTerm) ? 0.7 : 0,
                containsArabic(term) && surah.name.includes(term.trim()) ? 0.8 : 0,
            ];
            
            const maxScore = Math.max(...scores);
            if (maxScore > bestScore && maxScore > 0.4) { // Minimum threshold of 40% similarity
                bestScore = maxScore;
                bestMatch = { surah, score: maxScore };
            }
        }
        
        return bestMatch;
    };
    
    const handleSurahSelection = (id: number) => {
        setSelectedSurahId(id);
        // Page range will be reset in the useEffect when verses are loaded
    };
    
    const handleNextPages = () => {
        const newStart = Math.min(604, currentPageRange.end + 1);
        const newEnd = Math.min(604, newStart + 4);
        setCurrentPageRange({ start: newStart, end: newEnd });
    };
    
    const handlePreviousPages = () => {
        const newEnd = Math.max(1, currentPageRange.start - 1);
        const newStart = Math.max(1, newEnd - 4);
        setCurrentPageRange({ start: newStart, end: newEnd });
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
                containsArabic(term) ? calculateSimilarity(term, s.name) : 0,
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
    const handleDecreaseFontSize = () => setFontSize(prev => Math.max(prev - 1, 2));

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

    
    const handleVerseClick = (surahNum: number, ayahNum: number) => {
        const achievements = loggingMode === 'reading' ? recitationAchievements : memorizationAchievements;
        const { isLogged, achievementId } = getVerseRangeInfo(surahNum, ayahNum, achievements);

        if (isLogged && achievementId) {
            const ach = achievements.find(a => a.id === achievementId);
            if (ach) {
                const onConfirm = () => {
                    if (loggingMode === 'reading') {
                        onRemoveRecitationAchievement(student.id, achievementId);
                        showToast(t('liveSession.rangeRemoved'));
                    } else {
                        onRemoveMemorizationAchievement(student.id, achievementId);
                        showToast(t('liveSession.memorizationRangeRemoved'));
                    }
                };

                const title = loggingMode === 'reading' ? t('liveSession.removeRangeTitle') : t('liveSession.removeMemorizationRangeTitle');
                const messageKey = loggingMode === 'reading' ? 'liveSession.confirmRemoveRange' : 'liveSession.confirmRemoveMemorizationRange';
                
                setConfirmModalState({
                    isOpen: true,
                    title: title,
                    message: t(messageKey, { 
                        startSurah: QURAN_METADATA.find(s => s.number === ach.startSurah)?.transliteratedName, 
                        startAyah: ach.startAyah,
                        endSurah: QURAN_METADATA.find(s => s.number === ach.endSurah)?.transliteratedName, 
                        endAyah: ach.endAyah
                    }),
                    onConfirm: onConfirm
                });
            }
            return;
        }
    
        const clickedVerse = { surah: surahNum, ayah: ayahNum };
        if (!selectionStart) {
            setSelectionStart(clickedVerse);
        } else {
            if (!isVerseAfterOrEqual(clickedVerse, selectionStart)) {
                showToast(t('liveSession.endVerseError')); setSelectionStart(null); return;
            }
            if (loggingMode === 'reading') {
                onLogRecitationRange(student.id, { start: selectionStart, end: clickedVerse });
                showToast(t('liveSession.rangeSaved'));
            } else {
                onLogMemorizationRange(student.id, { start: selectionStart, end: clickedVerse });
                showToast(t('liveSession.memorizationRangeSaved'));
            }
            setSelectionStart(null);
        }
    };

    const handleVerseNumberPressStart = (surahNum: number, ayahNum: number) => {
        longPressFired.current = false;
        longPressTimer.current = window.setTimeout(() => {
            const currentVerse = { surah: surahNum, ayah: ayahNum };
            
            // Check if this verse is already hidden
            const containingRangeIndex = hiddenRanges.findIndex(range =>
                isVerseAfterOrEqual(currentVerse, range.start) && isVerseAfterOrEqual(range.end, currentVerse)
            );

            if (containingRangeIndex > -1) {
                // If it's in a hidden range, reveal it
                setHiddenRanges(prev => prev.filter((_, index) => index !== containingRangeIndex));
                setLongPressStart(null);
            } else if (!longPressStart) {
                // If no start is set, set this as the start
                setLongPressStart(currentVerse);
            } else {
                // If a start is set, complete the range
                const start = isVerseAfterOrEqual(currentVerse, longPressStart) ? longPressStart : currentVerse;
                const end = isVerseAfterOrEqual(currentVerse, longPressStart) ? currentVerse : longPressStart;
                setHiddenRanges(prev => [...prev, { start, end }]);
                setLongPressStart(null);
            }
            longPressFired.current = true;
        }, 500); // 500ms for long press
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
        if (loggingMode !== 'reading') return;
        
        const mistake = studentMistakes[letterKey];
        const currentState = letterClickStates.current[letterKey] || (mistake ? 2 : 0);
        
        if (currentState === 0) {
            // First click on unmarked letter: show yellow and open text input
            letterClickStates.current[letterKey] = 1;
            setEditingLetterKey(letterKey);
            setErrorTextInput('');
            
        } else if (currentState === 1) {
            // Second click on yellow (pending): remove error and close input
            // This happens when user clicks the letter again without entering text
            letterClickStates.current[letterKey] = 0;
            setEditingLetterKey(null);
            setErrorTextInput('');
            // Remove the mistake if it exists
            if (mistake) {
                const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
                onClearMistake(student.id, surah, ayah, wordIndex, letterIndex);
            }
            setClickStateUpdateTrigger(prev => prev + 1); // Force re-render to remove yellow color
        } else if (currentState === 2 && mistake) {
            // Second click on marked letter: turn yellow and remove mistake/annotation
            const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
            onClearMistake(student.id, surah, ayah, wordIndex, letterIndex);
            letterClickStates.current[letterKey] = 1;
            setEditingLetterKey(null);
            setErrorTextInput('');
            setClickStateUpdateTrigger(prev => prev + 1); // Force re-render to show yellow color
        }
    }, [loggingMode, studentMistakes, student.id, onClearMistake]);
    
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
        if (wordLongPressFired.current) {
            wordLongPressFired.current = false; // Reset the flag
            return; // Don't proceed if a long press just fired
        }

        // If a long press was just completed, this click on the text should cancel any pending "hiding" action
        // and reset the state so subsequent clicks work as expected.
        if (longPressFired.current) {
            longPressFired.current = false; // Reset the flag
            if (longPressStart) {
                setLongPressStart(null); // Cancel the hiding mode
            }
            return; // Don't proceed with other click actions on this specific click.
        }

        // Also cancel hiding mode if user clicks text while it's active
        if (longPressStart) {
            setLongPressStart(null);
            return;
        }

        // In memorization mode, clicking on a hidden verse should reveal it
        if (loggingMode === 'memorization') {
            const currentVerse = { surah: surahNum, ayah: ayahNum };
            const containingRangeIndex = hiddenRanges.findIndex(range =>
                isVerseAfterOrEqual(currentVerse, range.start) && isVerseAfterOrEqual(range.end, currentVerse)
            );

            if (containingRangeIndex > -1) {
                // If it's in a hidden range, reveal it
                setHiddenRanges(prev => prev.filter((_, index) => index !== containingRangeIndex));
                return;
            }
        }

        // In reading mode, letter clicks are handled by LetterWithError component
        // In memorization mode, word selection is handled by drag selection
    };


    const VerseMarker: React.FC<{ number: number; surah: number; isSelectedStart: boolean }> = ({ number, surah, isSelectedStart }) => {
        const verseKey = `${surah}:${number}`;
        const isRead = getVerseRangeInfo(surah, number, recitationAchievements).isLogged;
        const showReadFill = loggingMode === 'reading' && isRead;
        const isMemorized = getVerseRangeInfo(surah, number, memorizationAchievements).isLogged;
        const isLongPressStart = longPressStart?.surah === surah && longPressStart?.ayah === number;
        
        const glowClass = isSelectedStart ? 'ring-2 ring-offset-4 ring-teal-500 dark:ring-orange-500 animate-pulse' : '';
        const longPressGlowClass = isLongPressStart ? 'animate-glow' : '';

        return (
            <span
                onMouseDown={() => handleVerseNumberPressStart(surah, number)}
                onMouseUp={() => handleVerseNumberPressEnd(surah, number)}
                onTouchStart={() => handleVerseNumberPressStart(surah, number)}
                onTouchEnd={() => handleVerseNumberPressEnd(surah, number)}
                className={`inline-flex items-center justify-center w-12 h-12 mx-2 font-mono text-base font-bold text-slate-700 dark:text-slate-200 cursor-pointer relative transition-all rounded-full ${glowClass} ${longPressGlowClass}`}
                style={{ verticalAlign: 'middle' }} role="button" aria-label={`Mark progress at verse ${number}`}
            >
                <svg className="absolute inset-0 w-full h-full text-slate-200 dark:text-gray-700" viewBox="0 0 100 100" fill={ isMemorized ? '#38bdf8' : (showReadFill ? '#a7f3d0' : 'currentColor') }>
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
                surahContent.push(<PageSeparator key={`page-${currentPage}`} pageNumber={currentPage} />); 
                currentPage = versePage; 
            }
            
            const verseKey = `${surahNum}:${ayahNum}`;
            const isRead = getVerseRangeInfo(surahNum, ayahNum, recitationAchievements).isLogged;
            const showReadBg = loggingMode === 'reading' && isRead;
            const isMemorized = getVerseRangeInfo(surahNum, ayahNum, memorizationAchievements).isLogged;
            const isVerseHidden = hiddenRanges.some(range => isVerseAfterOrEqual({ surah: surahNum, ayah: ayahNum }, range.start) && isVerseAfterOrEqual(range.end, { surah: surahNum, ayah: ayahNum }));

            const verseWords = verse.text_uthmani.replace(/\u0652/g, '\u06e1').split(' ').map((word, wordIndex, wordsArray) => {
                if (loggingMode === 'reading') {
                    // Letter-based error marking in reading mode
                    const letters = parseWordIntoLetters(word);
                    if (letters.length === 0) {
                        // Fallback to showing the word as-is if no letters found
                        return (
                            <React.Fragment key={`word-${surahNum}:${ayahNum}:${wordIndex}`}>
                                <span>{word}</span>{' '}
                            </React.Fragment>
                        );
                    }
                    const isLastWordInVerse = wordIndex === wordsArray.length - 1;
                    return (
                        <span key={`word-${surahNum}:${ayahNum}:${wordIndex}`} className="relative inline" style={{ display: 'inline', fontFamily: 'inherit' }}>
                            {letters.map(({ letter, index: letterIndex }) => {
                                const letterKey = `${surahNum}:${ayahNum}:${wordIndex}:${letterIndex}`;
                                const mistake = studentMistakes[letterKey];
                                const isEditing = editingLetterKey === letterKey;
                                const clickState = letterClickStates.current[letterKey] || (mistake ? 2 : 0);
                                const isLastLetterOfWord = letterIndex === letters.length - 1;
                                
                                return (
                                    <LetterWithError
                                        key={letterKey}
                                        letter={letter}
                                        letterKey={letterKey}
                                        mistake={mistake}
                                        isEditing={isEditing}
                                        errorText={errorTextInput}
                                        onLetterClick={handleLetterClick}
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
                                    />
                                );
                            })}
                            {' '}
                        </span>
                    );
                } else {
                    // New memorization mode: drag selection, highlighting, and hiding
                    const key = `${surahNum}:${ayahNum}:${wordIndex}`;
                    const mistakeLevel = studentMistakes[key]?.level || 0;
                    const isSelected = selectedWords.has(key);
                    const isHidden = hiddenWords.has(key);
                    const isInDragRange = dragStartWord && dragEndWord && 
                        (() => {
                            const dragWords = getWordsBetween(dragStartWord, dragEndWord);
                            return dragWords.includes(key);
                        })();
                    
                    const handleMouseDown = (e: React.MouseEvent) => {
                        if (e.button !== 0) return; // Only left mouse button
                        e.preventDefault();
                        setIsDragging(true);
                        setDragStartWord(key);
                        setDragEndWord(key);
                        
                        // If clicking on selected word, deselect it
                        if (isSelected) {
                            setSelectedWords(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(key);
                                return newSet;
                            });
                        } else {
                            // Start new selection
                            setSelectedWords(new Set([key]));
                        }
                    };
                    
                    const handleMouseEnter = () => {
                        if (isDragging && dragStartWord) {
                            setDragEndWord(key);
                            // Update selection to include all words between start and end
                            const wordsInRange = getWordsBetween(dragStartWord, key);
                            setSelectedWords(new Set(wordsInRange));
                        }
                    };
                    
                    const handleMouseUp = () => {
                        if (isDragging) {
                            setIsDragging(false);
                            // Finalize selection
                            if (dragStartWord && dragEndWord) {
                                const wordsInRange = getWordsBetween(dragStartWord, dragEndWord);
                                setSelectedWords(new Set(wordsInRange));
                            }
                            setDragStartWord(null);
                            setDragEndWord(null);
                        }
                    };
                    
                    const handleClick = (e: React.MouseEvent) => {
                        if (!isDragging && isSelected) {
                            // Click to deselect
                            setSelectedWords(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(key);
                                return newSet;
                            });
                        }
                    };
                    
                    // Determine if word should be highlighted (selected or in drag range)
                    const shouldHighlight = isSelected || isInDragRange;

                    return (
                        <React.Fragment key={key}>
                            <span
                                data-word-key={key}
                                data-word-index={wordIndex}
                                className={`px-1 rounded-md transition-colors ${
                                    shouldHighlight ? 'bg-yellow-200 dark:bg-yellow-800/60' : ''
                                } ${getMistakeColor(mistakeLevel)}`}
                                onMouseDown={handleMouseDown}
                                onMouseEnter={handleMouseEnter}
                                onMouseUp={handleMouseUp}
                                onClick={handleClick}
                                style={{
                                    display: 'inline-block',
                                    visibility: isHidden ? 'hidden' : 'visible'
                                }}
                            >
                                <TajweedWord word={word} nextWord={wordsArray[wordIndex + 1] || ''} isLastWordInVerse={wordIndex === wordsArray.length - 1} showQalqalah={showQalqalah} showGhunnah={showGhunnah} showMadd={showMadd} />
                            </span>{' '}
                        </React.Fragment>
                    );
                }
            });
            const isSelectedStart = selectionStart?.surah === surahNum && selectionStart?.ayah === ayahNum;
            const verseMarker = (<VerseMarker key={`marker-${verse.verse_key}`} number={ayahNum} surah={surahNum} isSelectedStart={isSelectedStart}/>);
            const verseTextNode = (
                <span
                    key={`text-${verse.verse_key}`}
                    className={`px-1 py-1 rounded-md transition-opacity duration-300 ${isMemorized ? 'bg-sky-50 dark:bg-sky-900/30' : (showReadBg ? 'bg-teal-50 dark:bg-teal-900/30' : '')} ${isVerseHidden ? 'opacity-0' : 'opacity-100'} ${loggingMode === 'memorization' ? 'cursor-pointer' : ''}`}
                    onClick={(e) => handleVerseContainerClick(e, surahNum, ayahNum)}
                    onMouseEnter={() => { hoveredVerse.current = { surah: surahNum, ayah: ayahNum }; }}
                    onMouseLeave={() => { hoveredVerse.current = null; }}
                >
                    {verseWords}
                </span>
            );

            const verseContainerClass = `my-4${showTranslation ? '' : ' inline'}`;
            const verseContainerId = `verse-container-${verse.verse_key}`;

            if (showTranslation) {
                const verseContainer = (
                    <div id={verseContainerId} key={`verse-container-${verse.verse_key}`} className="my-4">
                        <div className="arabic-verse leading-[2.8]">{verseTextNode}{verseMarker}</div>
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
                    <div id={verseContainerId} key={verseContainerId} className={verseContainerClass}>
                        {verseTextNode}
                        {verseMarker}
                    </div>
                );
             }
        });
        const wrapperClassName = `font-quranic text-slate-900 dark:text-slate-100 text-center text-${fontSize}xl select-none p-6 sm:p-12` + (showTranslation ? '' : (loggingMode === 'reading' ? ' leading-[2.6]' : ' leading-[2.8]'));
        return (<div className={wrapperClassName}>{surahContent}</div>);
    };

    return (
        <div className="space-y-6 relative">
            {/* Red screen overlay for mistake indication */}
            {showMistakeHighlight && (
                <div 
                    className="fixed inset-0 bg-red-500/30 z-[9999] pointer-events-none"
                    style={{
                        animation: 'fadeOut 0.5s ease-out forwards'
                    }}
                />
            )}
            {/* Memorization counter display - center screen with fade effect */}
            {loggingMode === 'memorization' && showCounter && memorizationCounter > 0 && (
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
            {loggingMode === 'memorization' && showTryAgain && (
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
                    <div className="flex-grow">
                        <h1 className="text-2xl font-bold text-teal-800 dark:text-slate-100">{student.name} ({t('liveSession.age', { age: getAge(student.dob) })})</h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">{t('liveSession.currentProgress')}: {studentProgress ? `${QURAN_METADATA[studentProgress.surah - 1].transliteratedName}, Ayah ${studentProgress.ayah}` : t('liveSession.notSet')}</p>
                    </div>
                     <div className="flex-shrink-0 flex items-center gap-2"><button onClick={() => onGoBack()} className="p-2.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg></button></div>
                </div>
                {loggingMode === 'reading' 
                    ? <SurahProgressBar surahStatuses={surahStatuses} title={t('liveSession.overallProgress')} type="reading" />
                    : <SurahProgressBar surahStatuses={surahStatuses} title={t('liveSession.memorizationProgress')} type="memorization" />
                }
                <MilestoneTracker studentProgress={studentProgress} />
            </div>

            <div className="space-y-6">
                <div className="p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-t-none rounded-b-xl shadow-md border border-slate-200 dark:border-gray-700 sticky top-[100px] z-30">
                    {/* Toolbar: fixed left controls | scrollable surah pills | fixed right controls */}
                    <div className="flex items-center gap-2 min-w-0">
                        {/* ── Left: mode toggle (always visible) ── */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="relative flex items-center rounded-full bg-slate-200 dark:bg-gray-700 p-1 w-28 h-10">
                                {/* The moving part */}
                                <span className={`absolute left-1 w-8 h-8 rounded-full bg-white dark:bg-gray-800 shadow-md transform transition-transform duration-300 ease-in-out ${
                                    loggingMode === 'reading' ? 'translate-x-0' : 'translate-x-10'
                                }`}/>
                                
                                {/* Reading mode button */}
                                <button
                                    onClick={() => setLoggingMode('reading')}
                                    title={t('liveSession.reading')}
                                    aria-label={t('liveSession.reading')}
                                    className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-300 ${
                                        loggingMode === 'reading' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                    </svg>
                                </button>

                                {/* Memorization mode button */}
                                <button
                                    onClick={() => setLoggingMode('memorization')}
                                    title={t('liveSession.memorization')}
                                    aria-label={t('liveSession.memorization')}
                                    className={`relative z-10 w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-300 ${
                                        loggingMode === 'memorization' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-500 dark:text-slate-400'
                                    }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                    </svg>
                                </button>
                                
                                {/* Reveal All — only visible in memorization mode when something is hidden */}
                                {loggingMode === 'memorization' && (hiddenWords.size > 0 || hiddenRanges.length > 0) && (
                                    <>
                                        <div className="w-px h-6 bg-slate-300 dark:bg-gray-600 mx-1"></div>
                                        <button
                                            onClick={() => { setHiddenWords(new Set()); setHiddenRanges([]); }}
                                            title="Reveal all hidden verses"
                                            className="relative z-10 w-8 h-8 flex items-center justify-center rounded-full text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                            </svg>
                                        </button>
                                    </>
                                )}

                                {/* Error type toggle (R/T) - only visible in reading mode */}
                                {loggingMode === 'reading' && (
                                    <>
                                        <div className="w-px h-6 bg-slate-300 dark:bg-gray-600 mx-1"></div>
                                        <button
                                            onClick={() => setErrorType('reading')}
                                            className={`relative z-10 w-6 h-6 flex items-center justify-center rounded-full transition-colors duration-300 text-[10px] font-bold ${
                                                errorType === 'reading' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                                            }`}
                                            title={t('liveSession.readingError')}
                                        >
                                            R
                                        </button>
                                        <button
                                            onClick={() => setErrorType('tajweed')}
                                            className={`relative z-10 w-6 h-6 flex items-center justify-center rounded-full transition-colors duration-300 text-[10px] font-bold ${
                                                errorType === 'tajweed' ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'
                                            }`}
                                            title={t('liveSession.tajweedError')}
                                        >
                                            T
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* ── Middle: surah pills — only this section scrolls ── */}
                        <div className="flex-1 overflow-x-auto overflow-y-hidden horizontal-scrollbar min-w-0">
                            <div className="flex items-center gap-2 pb-0.5">
                                {surahStatuses.map(({ id, transliteratedName, status }) => (
                                    <button key={id} id={`surah-nav-${id}`} onClick={() => handleSurahSelection(id)}
                                        className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${getSurahNavButtonClass(id, status)}`}>
                                        <span className="font-mono text-xs">{id}</span>
                                        <div className={`w-px h-4 ${getDividerClass(id, status)}`} />
                                        <span className="tracking-wide">{transliteratedName}</span>
                                    </button>
                                ))}
                            </div>
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

                            {/* Tajweed colour toggles */}
                            <div className="flex items-center gap-1">
                                <button onClick={() => setShowTranslation(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showTranslation ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-teal-100'}`} aria-pressed={showTranslation} title={t('liveSession.toggleTranslation')}>T</button>
                                <button onClick={() => setShowQalqalah(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showQalqalah ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-sky-100'}`} aria-pressed={showQalqalah} title={t('liveSession.toggleQalqalah')}>Q</button>
                                <button onClick={() => setShowGhunnah(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showGhunnah ? 'bg-green-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-green-100'}`} aria-pressed={showGhunnah} title={t('liveSession.toggleGhunnah')}>G</button>
                                <button onClick={() => setShowMadd(prev => !prev)} className={`w-8 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-colors duration-200 px-2 ${showMadd ? 'bg-pink-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 hover:bg-pink-100'}`} aria-pressed={showMadd} title={t('liveSession.toggleMadd')}>M</button>
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
                </div>
                <div dir="rtl" className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-slate-200 dark:border-gray-700 min-h-[50vh] overflow-hidden">
                    <div>
                        <div className="text-center pt-12 pb-8 px-6 sm:px-12"><p className="text-4xl font-quranic text-slate-700 dark:text-slate-100">{selectedSurahInfo?.name}</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{selectedSurahInfo?.englishName}</p></div>
                        {showTranslation && isTranslationLoading && <div className="text-center my-4 p-3 bg-slate-100 dark:bg-gray-700 rounded-lg mx-6 sm:mx-12"><p className="text-slate-600 dark:text-slate-300 animate-pulse font-semibold">{t('liveSession.loadingTranslation')}</p></div>}
                        {showTranslation && translationError && <div className="text-center my-4 p-3 bg-red-100 text-red-700 rounded-lg mx-6 sm:mx-12"><p className="font-semibold">{translationError}</p></div>}
                        <hr className="w-48 h-1 mx-auto my-8 bg-teal-100 dark:bg-gray-700 border-0 rounded" />
                        {selectedSurahId !== 1 && selectedSurahId !== 9 && <p className="text-center font-quranic text-4xl text-slate-800 dark:text-slate-200 mb-12">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>}
                        {renderSurahContent()}
                        {/* Pagination Controls */}
                        {!isLoading && !error && verses.length > 0 && (
                            <div className="flex justify-center items-center gap-4 py-6 px-6 border-t border-slate-200 dark:border-gray-700">
                                <button
                                    onClick={handlePreviousPages}
                                    disabled={!hasPreviousPages()}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                                        hasPreviousPages()
                                            ? 'bg-teal-600 dark:bg-orange-600 text-white hover:bg-teal-700 dark:hover:bg-orange-700'
                                            : 'bg-slate-200 dark:bg-gray-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                    }`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                    </svg>
                                    <span>Previous 5 Pages</span>
                                </button>
                                <span className="text-slate-600 dark:text-slate-400 font-medium">
                                    Pages {toEasternArabicNumerals(currentPageRange.start)} - {toEasternArabicNumerals(currentPageRange.end)}
                                </span>
                                <button
                                    onClick={handleNextPages}
                                    disabled={!hasMorePages()}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors ${
                                        hasMorePages()
                                            ? 'bg-teal-600 dark:bg-orange-600 text-white hover:bg-teal-700 dark:hover:bg-orange-700'
                                            : 'bg-slate-200 dark:bg-gray-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                    }`}
                                >
                                    <span>Next 5 Pages</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {student && <ExportReportModal student={student} students={students} quranMetadata={QURAN_METADATA} isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />}
            {toastMessage && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-full shadow-lg transition-all animate-bounce z-50">{toastMessage}</div>}
            <SearchResultsModal isOpen={isSearchResultsModalOpen} onClose={() => setIsSearchResultsModalOpen(false)} results={searchResults} query={searchInput} onSelect={handleSelectSearchResult} />
            <ConfirmationModal isOpen={confirmModalState.isOpen} onClose={() => setConfirmModalState({ isOpen: false, title: '', message: '', onConfirm: () => {} })} onConfirm={confirmModalState.onConfirm} title={confirmModalState.title} message={confirmModalState.message} />
        </div>
    );
};

export default StudentProgressPage;
