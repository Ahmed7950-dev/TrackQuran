import ReactDOM from 'react-dom';
import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import lottie from 'lottie-web';
import StudentProfileIcon from './StudentProfileIcon';
import { QURAN_METADATA } from '../constants';
import { RecitationAchievement, QuranVerse, Student, Progress, MemorizationAchievement, Mistake } from '../types';
import MilestoneTracker from './MilestoneTracker';
import { audioUrl, versesInSurah } from './VerseAudioPlayer';
import { loadVerseNotes, saveVerseNote } from '../services/tadabburService';
import ExportReportModal from './ExportReportModal';
import { useI18n } from '../context/I18nProvider';
import { getPageOfAyah, saveStudentTeacherNote, getRecitedPagesSet, getMemorizedPagesSet } from '../services/dataService';
import { pageVerseList } from '../services/quranPageData';
import { wordMarkPlan, correctiveWordFont, splitVerseWords, tanweenOnSeatAlif, unitOverlayPlan, renderUnitOverlays, VowelAdjustment, VowelAdjMap, currentQuranicFont, TURKISH_FONT } from '../utils/quranicMarks';
import { loadVowelAdjustments, loadRecitationManifest, recitationVerseUrl, RecitationManifest } from '../services/quranLabService';
import MistakeRing, { computeRingData, translitOf, EMPTY_MISTAKE_LABEL, MISTAKE_AREAS, TAJWEED_AREAS } from './MistakeRing';
import { RECITERS, ReciterKey, reciterOf, fullSurahUrl, timedSurahUrl, timedTimings, everyayahUrl, AyahTiming } from '../services/recitersService';
import { analyzeVerseTajweed, TajweedRule, TAJWEED_RULES, TAJWEED_LEGEND_ORDER, TAJWEED_DESCRIPTIONS } from '../services/tajweedColorService';
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
  /** Persists the student's permanent habit flags (outer ring toggles). */
  onSetPermanentFlags?: (studentId: string, flags: string[]) => void;
  /** Rewrites history: folds custom mistake notes into a fixed ring label. */
  onReassignMistakes?: (studentId: string, fromLabels: string[], toLabel: string) => void;
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
   * Bumped every time the parent asks for a jump, so asking for the SAME verse
   * twice still navigates. Without it, tapping one homework item, scrolling
   * away, then tapping it again did nothing (the key never changed).
   */
  jumpNonce?: number;
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
   * Called (on the tutor side) each time the tutor presses N to signal a
   * mistake. The parent can use this to broadcast the event to the student.
   */
  onMistakeBuzz?: () => void;
  /**
   * Incrementing counter from the parent. Every time it changes the component
   * fires the red-flash + buzz sound — used to replay the tutor's N press
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



// Waqf signs (U+06D6-U+06DF), imala (U+06EA), and ishmam (U+06EB) are now
// handled by the 'QuranMarkFix' @font-face unicode-range rules in index.html.
// Font substitution happens at the glyph level so Arabic text stays in a single
// unbroken text run and Safari/iOS correctly connects letter forms.


// Iqlab: U+06E2 (small high meem) stacked on a tanween (U+064B/U+064C). None of
// the bundled Quranic fonts position this pair correctly \u2014 the meem glyph is
// drawn on top of the tanween, overlapping it. When a letter cluster contains
// both, we strip the meem from the inline text (so the tanween renders cleanly)
// and draw the meem ourselves in an absolutely-positioned overlay above it, at
// the per-unit, per-font clearance measured in utils/quranicMarks.



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


// Parse word into individual letters with their indices
const parseWordIntoLetters = (word: string): Array<{ letter: string; index: number }> => {
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

// Tajweed rule detection now lives in services/tajweedColorService.ts (verse-level
// engine validated against Quran.com's tajweed annotations). The generated classes
// below color letter units per rule, with dark-mode variants.
const TAJWEED_CSS = (Object.keys(TAJWEED_RULES) as TajweedRule[])
    .map(r => `.tj-${r}{color:${TAJWEED_RULES[r].color}} .dark .tj-${r}{color:${TAJWEED_RULES[r].colorDark}}`)
    .join('\n');

// Tajweed colouring preference. Absent (first visit) = OFF; '1' once enabled.
const TAJWEED_PREF_KEY = 'quranful:showTajweed';

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
    tajweedClass?: string; // 'tj-<rule>' color class from the tajweed engine
    tajweedTitle?: string; // rule name shown on hover (student side only)
    clickState: number; // 0 = none, 1 = yellow (pending), 2 = marked
    onLongPress?: (key: string) => void;
    isFocused?: boolean;
    isCursorActive?: boolean;
    joinLead?: boolean;
    joinTrail?: boolean;
    markLineHeight?: number; // leading of the surrounding Quran block (for mark overlays)
    vowelAdj?: Record<string, VowelAdjustment>; // admin vowel-position corrections for this unit
    focusMode?: boolean; // word-by-word focus reading — render the mistake note larger/readable
    ringCounts?: Record<string, number>;             // fixed mistake label → count (whole student)
    ringPermFlags?: string[];                        // permanent habit flags
    /** 'reading' (r key) draws the reading ring, 'tajweed' (t key) the tajweed one. */
    ringMode?: 'reading' | 'tajweed';
    onToggleFlag?: (flag: string) => void;
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
    tajweedClass,
    tajweedTitle,
    clickState,
    onLongPress,
    isFocused,
    isCursorActive,
    joinLead,
    joinTrail,
    markLineHeight = 2.6,
    vowelAdj,
    focusMode,
    ringCounts = {},
    ringPermFlags = [],
    ringMode = 'reading',
    onToggleFlag,
}) => {
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

    return (
        <span id={`letter-${letterKey}`} className="relative inline align-top" style={{ display: 'inline', fontFamily: 'inherit' }}>
            {isEditing && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9999] grid place-items-center pointer-events-none">
                    <MistakeRing
                        counts={ringCounts}
                        permFlags={ringPermFlags}
                        areas={ringMode === 'tajweed' ? TAJWEED_AREAS : MISTAKE_AREAS}
                        mode={ringMode}
                        translit={translitOf(letter)}
                        errorText={errorText}
                        onTextChange={onTextChange}
                        onPick={(label) => {
                            // "No comment" logs an EMPTY note — the letter stays
                            // highlighted with no text attached.
                            if (label === EMPTY_MISTAKE_LABEL) { onTextSubmit(letterKey, ''); return; }
                            // "Letter ?" logs the letter itself, nothing else.
                            const text = label === 'Letter recognition' ? translitOf(letter) : label;
                            const cur = errorText.trim();
                            onTextSubmit(letterKey, cur ? `${cur} ${text}` : text);
                        }}
                        onToggleFlag={(f) => onToggleFlag?.(f)}
                        onSubmitText={() => { if (errorText.trim()) onTextSubmit(letterKey, errorText.trim()); else onTextCancel(); }}
                        onCancel={onTextCancel}
                    />
                </div>,
                document.body
            )}
            {mistake && mistake.errorText && !isEditing && (
                <div
                    className={`absolute bottom-full left-1/2 -translate-x-1/2 z-40 pointer-events-auto group ${focusMode ? 'mb-3 sm:mb-6' : 'mb-0.5 sm:mb-3'}`}
                    style={{ zIndex: 40 }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.zIndex = '9999';
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.zIndex = '40';
                    }}
                >
                    <div className={`shadow-lg transition-all ${
                        focusMode
                            ? 'px-4 py-2 text-xl sm:text-3xl leading-snug rounded-2xl whitespace-normal break-words max-w-[70vw] sm:max-w-[640px] font-semibold'
                            : 'px-1.5 py-0.5 text-[10px] leading-tight rounded-md sm:px-3 sm:py-1 sm:text-sm sm:rounded-lg whitespace-nowrap max-w-[180px] sm:max-w-[300px] font-medium'
                    } ${
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
                title={tajweedTitle}
                className={`inline cursor-pointer transition-colors ${isCursorActive ? 'cursor-pointer-glow' : ''} ${tajweedClass ?? ''}`}
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
                {(() => {
                    // Overlay marks: the iqlab meems (stripped from the inline
                    // text and re-drawn at their measured positions — the fonts
                    // overprint them otherwise) plus any admin vowel-position
                    // corrections for this exact unit in the current font.
                    const text = (joinLead ? ZWJ : '') + letter + (joinTrail ? ZWJ : '');
                    const overlays = unitOverlayPlan(letter, markLineHeight, vowelAdj);
                    return overlays ? renderUnitOverlays(text, overlays) : text;
                })()}
            </span>
        </span>
    );
};

LetterWithError.displayName = 'LetterWithError';

type SurahStatus = {
    id: number;
    name: string; // The Arabic name
    transliteratedName: string;
    englishName: string;
    status: 'completed' | 'in-progress' | 'not-started';    // reading/recitation
    memStatus: 'completed' | 'in-progress' | 'not-started'; // memorization (hifdh)
};

const SurahProgressBar: React.FC<{
    surahStatuses: SurahStatus[], title: string, type: 'reading' | 'memorization',
    /** Same category colors + priority as the surah nav bar (mem > read > homework > tafsir). */
    hasHomework?: (id: number) => boolean,
    hasTafsir?: (id: number) => boolean,
    /** Segment click → jump to that surah's beginning. */
    onSelectSurah?: (id: number) => void,
}> = ({ surahStatuses, title, type, hasHomework, hasTafsir, onSelectSurah }) => {
    // Mirrors getSurahNavButtonClass so the mini-map and the nav bar speak the
    // same color language: green=hifz, orange=read, purple=homework, blue=tafsir.
    const segmentClass = (status: SurahStatus['status'], memStatus: SurahStatus['memStatus'], id: number) => {
        if (memStatus !== 'not-started') return 'bg-green-400 dark:bg-green-600 hover:bg-green-500';
        if (status !== 'not-started') return 'bg-orange-400 dark:bg-orange-600 hover:bg-orange-500';
        if (hasHomework?.(id)) return 'bg-purple-400 dark:bg-purple-600 hover:bg-purple-500';
        if (hasTafsir?.(id)) return 'bg-blue-400 dark:bg-blue-600 hover:bg-blue-500';
        return 'bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 dark:hover:bg-gray-600';
    };

    return (
        <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">{title}</h4>
            <div className="flex flex-wrap gap-1">
                {surahStatuses.map(({ id, transliteratedName, status, memStatus }) => {
                    const statusClass = segmentClass(status, memStatus, id);
                    return (
                        <div key={id} className="relative group flex-grow" style={{ minWidth: '0.5%' }}>
                            <button
                                type="button"
                                aria-label={transliteratedName}
                                onClick={onSelectSurah ? () => onSelectSurah(id) : undefined}
                                className={`h-4 rounded-sm w-full block ${statusClass} transition-colors ${onSelectSurah ? 'cursor-pointer' : 'cursor-default'}`}
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

// A Lottie animation that rests on its first frame and plays while `play` is true.
const LottieIcon: React.FC<{ src: string; play: boolean; className?: string }> = ({ src, play, className }) => {
    const ref = useRef<HTMLDivElement>(null);
    const animRef = useRef<ReturnType<typeof lottie.loadAnimation> | null>(null);
    useEffect(() => {
        if (!ref.current) return;
        const anim = lottie.loadAnimation({ container: ref.current, renderer: 'svg', loop: true, autoplay: false, path: src });
        anim.goToAndStop(0, true);
        animRef.current = anim;
        return () => anim.destroy();
    }, [src]);
    useEffect(() => {
        const a = animRef.current;
        if (!a) return;
        if (play) a.play(); else a.goToAndStop(0, true);
    }, [play]);
    return <div ref={ref} className={className} aria-hidden="true" />;
};

const LOG_OPTION_COLORS: Record<string, string> = {
    orange: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/60',
    green:  'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/60',
    blue:   'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900/60',
    purple: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/60',
};

// A log-type card: animated Lottie icon (plays on hover/focus) + label.
const LogOption: React.FC<{ src: string; label: string; sub?: string; color: 'orange' | 'green' | 'blue' | 'purple'; onClick: () => void }> = ({ src, label, sub, color, onClick }) => {
    const [hover, setHover] = useState(false);
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            onFocus={() => setHover(true)} onBlur={() => setHover(false)}
            className={`flex flex-col items-center justify-center gap-1 p-3 rounded-2xl border font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${LOG_OPTION_COLORS[color]}`}
        >
            <LottieIcon src={src} play={hover} className="w-14 h-14" />
            <span className="text-sm font-bold leading-tight">{label}</span>
            {sub && <span className="text-[10px] font-semibold opacity-70 leading-none">{sub}</span>}
        </button>
    );
};

const StudentProgressPage: React.FC<StudentProgressPageProps> = ({ student, students, studentProgress, studentMistakes, recitationAchievements, memorizationAchievements, onUpdateProgress, onCycleMistakeLevel, onClearMistake, onSetPermanentFlags, onReassignMistakes, onLogRecitationRange, onRemoveRecitationAchievement, onLogMemorizationRange, onRemoveMemorizationAchievement, onLogTafseerRange, onRemoveTafseerRange, onLogHomework, onGoBack, readOnly = false, toolbarStickyTop = 100, notesStudentId, jumpToVerseKey, jumpNonce = 0, nameCardExtra, homeworkRanges = [], onMistakeBuzz, externalBuzzTrigger, onLetterFocus, focusedLetterKey, onCursorMove, cursorLetterKey }) => {
    // ── Log-type modal state ──────────────────────────────────────────────────
    const [pendingLogRange, setPendingLogRange] = useState<{ start: Progress; end: Progress } | null>(null);
    const [readOnlyAudioVerse, setReadOnlyAudioVerse] = useState<{ surah: number; ayah: number } | null>(null);
    const [readOnlySpeed, setReadOnlySpeed] = useState(1);
    /** One compound popup for speed + reciter + verse repeat. */
    const [audioMenuOpen, setAudioMenuOpen] = useState(false);
    /** Tutor-side listen mode: verse taps play recitation instead of logging. */
    const [tutorListen, setTutorListen] = useState(false);
    const listenActive = readOnly || tutorListen;
    /** Times each verse plays before moving on (verse-by-verse reciters). */
    const [verseRepeat, setVerseRepeat] = useState<number>(() => {
        try { const v = parseInt(localStorage.getItem('quranVerseRepeat') ?? '1', 10); return [1, 2, 3, 5].includes(v) ? v : 1; } catch { return 1; }
    });
    useEffect(() => { try { localStorage.setItem('quranVerseRepeat', String(verseRepeat)); } catch { /* private mode */ } }, [verseRepeat]);
    const verseRepeatRef = useRef(verseRepeat);
    verseRepeatRef.current = verseRepeat;
    /** How many times the CURRENT per-ayah file has played so far. */
    const repeatDoneRef = useRef(1);
    const surahNavScrollRef = useRef<HTMLDivElement | null>(null);
    // Phone-only vertical surah picker. The horizontal pill strip needs width
    // to be usable — on a phone it shows two or three names and fights the
    // pinned first/last pills and both arrows for space. Small screens get a
    // single current-surah button that opens a vertical list instead, opened
    // centred on the current surah so its neighbours are visible above/below.
    const [surahPickerOpen, setSurahPickerOpen] = useState(false);
    const readOnlyAudioRef = useRef<HTMLAudioElement | null>(null);
    // true while a tap on an ayah number is playing the surah sequentially from
    // that ayah to the end (vs a single-verse play from tapping the verse text).
    const readOnlySeqRef = useRef(false);

    /** Newest playback request — lets a superseded load's rejection be ignored. */
    const audioReqRef = useRef(0);
    const audioUnlockedRef = useRef(false);
    const [audioFailed, setAudioFailed] = useState(false);

    // ── Reciter choice (student portal). Minshawi = per-ayah files with the
    // tap-a-verse player. Al-Dukhain = surah files + mp3quran ayat timings
    // (measured accurate for his read): seek to the tapped verse, an rAF
    // watcher stops or walks the highlight at boundaries. Bin Humaid and
    // Al-Nufais have no per-ayah source and no trustworthy timings, so they
    // are FULL-SURAH only: any tap plays the whole surah from the beginning;
    // tapping again stops. Remembered per browser. ────────────────────────────
    const [reciter, setReciter] = useState<ReciterKey>(() => {
        try { return reciterOf(localStorage.getItem('quranReciter')).key; } catch { return 'minshawi'; }
    });
    useEffect(() => {
        try { localStorage.setItem('quranReciter', reciter); } catch { /* private mode */ }
    }, [reciter]);

    // ── Turkish mushaf mode ───────────────────────────────────────────────────
    // The Hamdullah font renders its OWN text source (public/quran-tr, Istanbul
    // rasm) — letter positions there don't correspond to the Uthmani text, so
    // mistakes logged on it are namespaced with a "T" key prefix and kept
    // fully separate. Tajweed coloring stays off (the engine reads Uthmani
    // spelling).
    const turkishSource = currentQuranicFont() === TURKISH_FONT;

    // ── Admin vowel-position corrections (Quran Lab) ──────────────────────────
    // One small JSON in storage; applied per font + letter unit while rendering.
    const [vowelAdjMap, setVowelAdjMap] = useState<VowelAdjMap | null>(null);
    useEffect(() => { loadVowelAdjustments().then(setVowelAdjMap).catch(() => { /* offline */ }); }, []);

    // ── Tutor recitation (Quran Lab) ─────────────────────────────────────────
    // The 🎙️ picker only offers "Ustadh Ahmed" once the lab's manifest says
    // published; sequential playback walks the RECORDED verses and skips gaps.
    const [recManifest, setRecManifest] = useState<RecitationManifest | null>(null);
    useEffect(() => { loadRecitationManifest().then(setRecManifest).catch(() => { /* offline */ }); }, []);
    useEffect(() => {
        if (reciter === 'ustadh' && recManifest && !recManifest.published) setReciter('minshawi');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recManifest, reciter]);
    /** True while a whole surah (bin Humaid) is loaded/playing — its `ended`
     *  must not fall into the per-ayah chain. */
    const fullSurahRef = useRef(false);
    /** Which surah's file is currently loaded in the element (surah-file modes). */
    const loadedSurahRef = useRef(0);
    /** Active timed-surah playback (Al-Dukhain): timing table + position.
     *  `activeIdx` is the row being recited, `plays` its repeat count so far. */
    const timedRef = useRef<{ surah: number; timings: AyahTiming[]; activeIdx: number; plays: number; sequential: boolean } | null>(null);
    const timedRafRef = useRef(0);

    /** rAF watcher for timed-surah playback: stops at the bound and, in
     *  sequential mode, moves the verse highlight as boundaries pass. */
    const watchTimed = useCallback((req: number) => {
        cancelAnimationFrame(timedRafRef.current);
        const step = () => {
            const audio = readOnlyAudioRef.current;
            const td = timedRef.current;
            if (!audio || !td || req !== audioReqRef.current) return;
            const ms = audio.currentTime * 1000;
            const row = td.timings[td.activeIdx];
            if (ms >= row.endMs - 20) {
                if (td.plays < verseRepeatRef.current) {
                    // Repeat this verse: seek back to its start.
                    td.plays += 1;
                    try { audio.currentTime = row.startMs / 1000; } catch { /* ignore */ }
                } else if (td.sequential && td.activeIdx < td.timings.length - 1) {
                    // Move to the next verse (the file is already there).
                    td.activeIdx += 1;
                    td.plays = 1;
                    const next = td.timings[td.activeIdx];
                    setReadOnlyAudioVerse(v =>
                        v && v.surah === td.surah && v.ayah === next.ayah ? v : { surah: td.surah, ayah: next.ayah });
                } else {
                    try { audio.pause(); } catch { /* ignore */ }
                    timedRef.current = null;
                    setReadOnlyAudioVerse(null);
                    return;
                }
            }
            timedRafRef.current = requestAnimationFrame(step);
        };
        timedRafRef.current = requestAnimationFrame(step);
    }, []);

    // ── Recitation playback (student portal) ──────────────────────────────
    // iPad Safari is stricter here than any desktop browser, and every failure
    // used to disappear into a bare `.catch(() => {})` — the student tapped an
    // ayah and simply nothing happened. Three separate things bite:
    //   1. `playbackRate` assigned to a not-yet-loaded element can THROW on
    //      Safari, which took the `play()` call on the next line down with it,
    //      so the tap never even attempted playback. It is applied on 'playing'
    //      now, after the media is running.
    //   2. A fresh `src` with preload="none" needs an explicit `load()` before
    //      `play()`, or Safari sometimes never starts fetching.
    //   3. Safari only lets an element play programmatically once it has been
    //      started inside a real user gesture — which is why the end-of-ayah
    //      chain could die halfway through a surah. See the unlock effect.
    const playVerse = useCallback((surah: number, ayah: number, sequential: boolean) => {
        const audio = readOnlyAudioRef.current;
        if (!audio) return;
        const req = ++audioReqRef.current;
        readOnlySeqRef.current = sequential;
        repeatDoneRef.current = 1;
        setAudioFailed(false);
        setReadOnlyAudioVerse({ surah, ayah });
        try { audio.pause(); } catch { /* Safari can throw mid-load */ }

        const fail = (err?: DOMException | Error) => {
            if (req !== audioReqRef.current) return;   // a newer tap replaced this one
            if ((err as DOMException)?.name === 'AbortError') return;   // superseded load
            console.warn('[recitation] failed:', (err as Error)?.name, (err as Error)?.message);
            readOnlySeqRef.current = false;
            fullSurahRef.current = false;
            timedRef.current = null;
            setReadOnlyAudioVerse(null);
            setAudioFailed(true);
        };

        const rec = reciterOf(reciter);

        if (rec.mode === 'fullSurah') {
            // Whole surah from the start, whatever was tapped. The sentinel
            // ayah 0 marks "surah playing": it can never equal a real verse, so
            // no per-verse ring lights up, while the tap-to-stop toggle and the
            // playing state still work.
            fullSurahRef.current = true;
            timedRef.current = null;
            readOnlySeqRef.current = false;
            setReadOnlyAudioVerse({ surah, ayah: 0 });
            const url = fullSurahUrl(rec.key, surah);
            if (audio.src !== url) {
                loadedSurahRef.current = surah;
                audio.src = url;
                try { audio.load(); } catch { /* ignore */ }
            } else {
                try { audio.currentTime = 0; } catch { /* not loaded yet */ }
            }
            audio.play().catch(fail);
            return;
        }

        if (rec.mode === 'timedSurah') {
            // One file per surah + a per-ayah timing table (Al-Dukhain, Al-Salimi). Seek to
            // the tapped verse; the rAF watcher stops at its end (verse tap) or
            // walks the highlight to the end of the surah (ayah-number tap).
            // The per-ayah `ended` chain must never fire for this mode.
            fullSurahRef.current = false;
            readOnlySeqRef.current = false;
            timedTimings(rec, surah).then(timings => {
                if (req !== audioReqRef.current) return;
                const idx = Math.max(0, timings.findIndex(t => t.ayah === ayah));
                const row = timings[idx];
                timedRef.current = { surah, timings, activeIdx: idx, plays: 1, sequential };
                const seekPlay = () => {
                    try { audio.currentTime = row.startMs / 1000; } catch { /* pre-metadata */ }
                    audio.play().then(() => { if (req === audioReqRef.current) watchTimed(req); }).catch(fail);
                };
                const url = timedSurahUrl(rec, surah);
                // Safari ignores currentTime before loadedmetadata, so a fresh
                // file seeks inside that event, not right after load().
                if (audio.src === url && audio.readyState >= 1) { seekPlay(); return; }
                loadedSurahRef.current = surah;
                audio.src = url;
                const onMeta = () => {
                    audio.removeEventListener('loadedmetadata', onMeta);
                    if (req === audioReqRef.current) seekPlay();
                };
                audio.addEventListener('loadedmetadata', onMeta);
                try { audio.load(); } catch { /* ignore */ }
            }).catch(fail);
            return;
        }

        fullSurahRef.current = false;
        timedRef.current = null;
        loadedSurahRef.current = 0;
        // perAyah: one file per verse — Minshawi from the islamic.network CDN,
        // the everyayah reciters from their own folders, the tutor's own
        // recitation from Supabase Storage.
        audio.src = rec.key === 'ustadh' ? recitationVerseUrl(surah, ayah)
          : rec.everyayah ? everyayahUrl(rec.everyayah, surah, ayah)
          : audioUrl(surah, ayah);
        try { audio.load(); } catch { /* ignore */ }
        audio.play().catch(fail);
    }, [reciter, watchTimed]);

    const stopVerse = useCallback(() => {
        audioReqRef.current++;
        readOnlySeqRef.current = false;
        fullSurahRef.current = false;
        timedRef.current = null;
        cancelAnimationFrame(timedRafRef.current);
        try { readOnlyAudioRef.current?.pause(); } catch { /* ignore */ }
        setReadOnlyAudioVerse(null);
    }, []);

    useEffect(() => { if (!tutorListen) stopVerse(); }, [tutorListen, stopVerse]);

    // Safari marks an <audio> element as user-activated the first time play() is
    // called on it inside a gesture. Do that once, on the first touch anywhere,
    // against a silent zero-length clip — so later programmatic plays (the
    // ayah-to-ayah chain) are already allowed.
    const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    useEffect(() => {
        if (!readOnly && !tutorListen) return;
        const unlock = () => {
            const a = readOnlyAudioRef.current;
            if (!a || audioUnlockedRef.current) return;
            audioUnlockedRef.current = true;
            if (a.src) return;                  // already playing something real
            a.src = SILENT_WAV;
            a.play().then(() => { try { a.pause(); } catch { /* ignore */ } }).catch(() => { /* fine */ });
        };
        window.addEventListener('touchend', unlock, { passive: true });
        window.addEventListener('mousedown', unlock);
        return () => {
            window.removeEventListener('touchend', unlock);
            window.removeEventListener('mousedown', unlock);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readOnly, tutorListen]);

    // Clear the failure notice after a few seconds.
    useEffect(() => {
        if (!audioFailed) return;
        const t = setTimeout(() => setAudioFailed(false), 5000);
        return () => clearTimeout(t);
    }, [audioFailed]);

    /** Start/stop sequential recitation from an ayah number (student portal). */
    const handleAyahNumberRecite = (surah: number, ayah: number) => {
        // A tap while anything is playing simply stops it.
        if (readOnlyAudioVerse) { stopVerse(); return; }
        playVerse(surah, ayah, true);
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
    // Where this tutor/student was last reading. Restored ahead of the
    // last-logged verse so leaving the Quran tab and coming back reopens the
    // same page, not wherever the last achievement happened to end.
    const viewKey = `quranful:quranView:${student.id}`;
    const readSavedView = (): { surah: number; verse: string } | null => {
        try {
            const raw = localStorage.getItem(`quranful:quranView:${student.id}`);
            if (!raw) return null;
            const v = JSON.parse(raw);
            return (typeof v?.surah === 'number' && typeof v?.verse === 'string') ? v : null;
        } catch { return null; }
    };
    const savedViewOnMount = useRef(readSavedView()).current;
    const [selectedSurahId, setSelectedSurahId] = useState<number>(savedViewOnMount?.surah || studentProgress?.surah || 1);
    const [verses, setVerses] = useState<QuranVerse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
    const [scrollToVerseKey, setScrollToVerseKey] = useState<string | null>(
        savedViewOnMount?.verse ?? (studentProgress ? `${studentProgress.surah}:${studentProgress.ayah}` : null));
    const didResumeRef = useRef(false); // resume to the last-log position only once, on first open
    const [showScrollTop, setShowScrollTop] = useState(false); // floating "back to surah start" button
    // Default to text-7xl on desktop (≥768 px), text-4xl on mobile
    // Desktop opens large (text-7xl); phones open at 1rem (text-base, fontSize 1)
    // so the verses + mistake annotations fit without overlapping.
    const [fontSize, setFontSize] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth >= 768 ? 7 : 1
    );
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showTranslation, setShowTranslation] = useState(false);
    // One switch for the full tajweed color-coding (QPC palette, all rules).
    // OFF on a first visit — plain mushaf text is what a reader expects to open
    // to, and the colors compete with the red/green mistake highlighting. The
    // choice is remembered per browser once it's been toggled either way.
    const [showTajweed, setShowTajweed] = useState(() => {
        try { return localStorage.getItem(TAJWEED_PREF_KEY) === '1'; } catch { return false; }
    });
    useEffect(() => {
        try { localStorage.setItem(TAJWEED_PREF_KEY, showTajweed ? '1' : '0'); } catch { /* private mode / quota */ }
    }, [showTajweed]);

    const verseTajweedMaps = useMemo(() => {
        const m = new Map<string, Map<string, TajweedRule>>();
        if (showTajweed) verses.forEach(v => m.set(v.verse_key, analyzeVerseTajweed(v.text_uthmani, turkishSource)));
        return m;
    }, [verses, showTajweed, turkishSource]);
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

    // The click that opens the ring pre-marks the letter with no note; exclude
    // it so "No comment" doesn't light up merely because the ring is open.
    const ringData = useMemo(() => computeRingData(studentMistakes, editingLetterKey), [studentMistakes, editingLetterKey]);
    const ringPermFlags = ringData.permFlags;
    const handleToggleFlag = useCallback((flag: string) => {
        if (readOnly || !onSetPermanentFlags) return;
        const next = ringPermFlags.includes(flag) ? ringPermFlags.filter(f => f !== flag) : [...ringPermFlags, flag];
        onSetPermanentFlags(student.id, next);
    }, [readOnly, onSetPermanentFlags, ringPermFlags, student.id]);
    
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
    const { t, language } = useI18n();
    // Localized name of a tajweed rule — shown to the student on hover.
    const tajweedLabel = useCallback((r: TajweedRule) => (
        language === 'ar' ? TAJWEED_RULES[r].labelAr : TAJWEED_RULES[r].label
    ), [language]);

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
            try { readOnlyAudioRef.current.playbackRate = readOnlySpeed; } catch { /* Safari: not loaded yet */ }
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

    // External jump — navigate to a specific verse whenever the parent asks.
    // Keyed on the nonce as well as the verse so a repeat request to the SAME
    // verse still moves the view.
    useEffect(() => {
        if (!jumpToVerseKey) return;
        const [surahNum] = jumpToVerseKey.split(':').map(Number);
        if (surahNum && !isNaN(surahNum)) {
            didResumeRef.current = true;   // an explicit jump outranks resuming
            setSelectedSurahId(surahNum);
            setScrollToVerseKey(jumpToVerseKey);
        }
    }, [jumpToVerseKey, jumpNonce]);

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
        | { kind: 'word';   word: string; surah: number; ayah: number; wordIdx: number; isVerseStart: boolean }
        | { kind: 'marker'; surah: number; ayah: number };

    const focusWordList = useMemo<FocusItem[]>(() => {
        const list: FocusItem[] = [];
        verses.forEach(verse => {
            const [surahNum, ayahNum] = verse.verse_key.split(':').map(Number);
            // Index over the RAW split (same as normal mode) so a mistake's
            // wordIndex maps to the same physical word in both views; just skip
            // empty tokens without renumbering.
            let isVerseStart = true;
            splitVerseWords(verse.text_uthmani, turkishSource).forEach((word, wordIdx) => {
                if (!word.trim()) return;
                list.push({ kind: 'word', word, surah: surahNum, ayah: ayahNum, wordIdx, isVerseStart });
                isVerseStart = false;
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
    // the tutor just pressed N — show the red flash + play the sound here too.
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

            // N key for mistake indication (was Ctrl — same key as the fluency test's buzz)
            if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
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

    // Surahs with a log dated TODAY get a stronger shade of their category
    // color, so today's work stands out from older sessions at a glance.
    const surahLoggedToday = (surahId: number, kind: 'read' | 'mem'): boolean => {
        const today = new Date().toDateString();
        const list = kind === 'read' ? (student.recitationAchievements || []) : (student.memorizationAchievements || []);
        return list.some(a => {
            if (new Date(a.date).toDateString() !== today) return false;
            const ss = (a as { startSurah?: number; surah?: number }).startSurah ?? (a as { surah?: number }).surah;
            const es = (a as { endSurah?: number; surah?: number }).endSurah ?? (a as { surah?: number }).surah;
            return ss !== undefined && es !== undefined && surahId >= ss && surahId <= es;
        });
    };

    // Surah-name tint mirrors the verse model: green=hifz, orange=read,
    // purple=homework, blue=tafsir, with a blue underline when tafsir overlaps.
    const getSurahNavButtonClass = (surahId: number, status: SurahStatus['status'], memStatus: SurahStatus['memStatus']) => {
        if (surahId === selectedSurahId) return 'bg-teal-600 dark:bg-orange-600 text-white shadow-lg transform scale-105';
        const hasRead = status !== 'not-started';
        const hasMem  = memStatus !== 'not-started';
        const hasTaf  = surahHasTafsir(surahId);
        const underline = hasTaf && (hasMem || hasRead) ? ' border-b-2 border-blue-400 dark:border-blue-500' : '';
        if (hasMem && surahLoggedToday(surahId, 'mem'))
            return 'bg-green-300 text-green-900 dark:bg-green-700 dark:text-green-50 font-bold hover:bg-green-400 dark:hover:bg-green-600' + underline;
        if (hasMem)  return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900' + underline;
        if (hasRead && surahLoggedToday(surahId, 'read'))
            return 'bg-orange-300 text-orange-900 dark:bg-orange-700 dark:text-orange-50 font-bold hover:bg-orange-400 dark:hover:bg-orange-600' + underline;
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

    useEffect(() => {
        if (!surahPickerOpen) return;
        // Instant, not smooth — smooth from list-top to surah 90 takes seconds.
        const t = setTimeout(() => {
            document.getElementById(`surah-pick-${selectedSurahId}`)
                ?.scrollIntoView({ block: 'center' });
        }, 30);
        return () => clearTimeout(t);
    }, [surahPickerOpen, selectedSurahId]);

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

                const response = await fetch(turkishSource
                    ? `/quran-tr/${selectedMeta.number}.json`
                    : `https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${selectedMeta.number}`);
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
    }, [selectedSurahId, turkishSource]);

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

    // First open: resume to the last-log position once it's available. The initial
    // useState may have been empty if the resume point loaded after this mounted.
    // Guarded so it never yanks the user away after they start navigating/logging.
    useEffect(() => {
        if (didResumeRef.current) return;
        // An explicit navigation (e.g. "Go to homework" via jumpToVerseKey) takes
        // precedence over resuming — don't clobber it.
        if (jumpToVerseKey) { didResumeRef.current = true; return; }
        // Where they actually left off wins over the last logged verse.
        const saved = readSavedView();
        if (saved) {
            didResumeRef.current = true;
            setSelectedSurahId(saved.surah);
            setScrollToVerseKey(saved.verse);
            return;
        }
        if (!studentProgress) return;
        didResumeRef.current = true;
        setSelectedSurahId(studentProgress.surah);
        setScrollToVerseKey(`${studentProgress.surah}:${studentProgress.ayah}`);
    }, [studentProgress, jumpToVerseKey]);

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
            
            // Scroll to verse after a short delay to allow rendering. The key is
            // cleared either way — leaving it set meant every later verse fetch
            // yanked the reader back to it.
            const target = scrollToVerseKey;
            setTimeout(() => {
                document.getElementById(`verse-container-${target}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setScrollToVerseKey(prev => (prev === target ? null : prev));
            }, 120);
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

    // ── Remember where they were reading ──────────────────────────────────
    // The top-most verse still on screen is saved as they scroll (and once more
    // on unmount), so switching tabs and coming back reopens this exact spot.
    // Reads the surah through a ref so the listener is installed only once.
    const selectedSurahIdRef = useRef(selectedSurahId);
    useEffect(() => { selectedSurahIdRef.current = selectedSurahId; }, [selectedSurahId]);
    useEffect(() => {
        let timer: number | null = null;
        const save = () => {
            timer = null;
            const els = document.querySelectorAll('[id^="verse-container-"]');
            let topVerse: string | null = null;
            for (let i = 0; i < els.length; i++) {
                // First verse whose body is still below the sticky toolbar.
                if (els[i].getBoundingClientRect().bottom > 160) {
                    topVerse = els[i].id.slice('verse-container-'.length);
                    break;
                }
            }
            if (!topVerse) return;
            try {
                localStorage.setItem(viewKey, JSON.stringify({ surah: selectedSurahIdRef.current, verse: topVerse }));
            } catch { /* private mode / quota */ }
        };
        const onScroll = () => { if (timer === null) timer = window.setTimeout(save, 400); };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (timer !== null) window.clearTimeout(timer);
            save();
        };
    }, [viewKey]);

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

    // Convert Arabic-Indic (\u0660-\u0669) and Eastern Arabic (\u06F0-\u06F9) digits to ASCII so a
    // tutor typing "\u0665\u0660" or "\u0662:\u0662\u0665\u0665" on an Arabic keyboard can jump to pages/verses.
    const normalizeDigits = (str: string): string =>
        str.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
           .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));

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

    // Top-N surah matches for the live search typeahead (same scoring as
    // findBestMatchingSurah, but keeps every candidate above the threshold).
    const getTopSurahMatches = (term: string, n = 5): { surah: typeof QURAN_METADATA[0], score: number }[] => {
        const normalizedTerm = normalizeString(term);
        const isArabicQuery = containsArabic(term);
        const strippedTerm = isArabicQuery ? stripArabicDiacritics(term.trim()) : normalizedTerm;
        const threshold = isArabicQuery ? 0.3 : 0.4;
        const out: { surah: typeof QURAN_METADATA[0], score: number }[] = [];
        for (const surah of QURAN_METADATA) {
            const strippedSurahName = stripArabicDiacritics(surah.name);
            const score = Math.max(
                isArabicQuery ? calculateSimilarity(strippedTerm, strippedSurahName) : 0,
                isArabicQuery && strippedSurahName.includes(strippedTerm) ? 0.95 : 0,
                isArabicQuery && strippedTerm.includes(strippedSurahName) ? 0.9 : 0,
                calculateSimilarity(normalizedTerm, surah.englishName),
                calculateSimilarity(normalizedTerm, surah.transliteratedName),
                calculateSimilarity(normalizedTerm, surah.transliteratedName.replace(/-/g, ' ')),
                calculateSimilarity(normalizedTerm, surah.transliteratedName.replace(/-/g, '')),
                !isArabicQuery && surah.englishName.toLowerCase().includes(normalizedTerm) ? 0.7 : 0,
                !isArabicQuery && surah.transliteratedName.toLowerCase().replace(/-/g, ' ').includes(normalizedTerm) ? 0.7 : 0,
            );
            if (score > threshold) out.push({ surah, score });
        }
        return out.sort((a, b) => b.score - a.score).slice(0, n);
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

    // ── Live search typeahead — instant suggestions while typing (no network).
    //    Recognizes page numbers, surah numbers, verse keys (Western or Arabic
    //    digits) and fuzzy surah names in Arabic / English / transliteration.
    const searchSuggestions = useMemo(() => {
        const raw = normalizeDigits(searchInput.trim());
        if (!raw) return [] as { key: string; icon: string; label: string; sub?: string; go: () => void }[];
        const out: { key: string; icon: string; label: string; sub?: string; go: () => void }[] = [];
        const jump = (surahNum: number, verseKey: string) => {
            if (selectedSurahId !== surahNum) setSelectedSurahId(surahNum);
            setScrollToVerseKey(verseKey);
            setShowSearchSuggestions(false);
        };
        const openSurah = (id: number) => { handleSurahSelection(id); setShowSearchSuggestions(false); };

        if (/^\d+$/.test(raw)) {
            const n = parseInt(raw, 10);
            if (n >= 1 && n <= 604) {
                out.push({ key: `pg-${n}`, icon: '📄', label: `Page ${n}`, go: () => {
                    const entry = pageVerseList.find(([p]) => p === n);
                    if (entry) jump(entry[1], `${entry[1]}:${entry[2]}`);
                } });
            }
            if (n >= 1 && n <= 114) {
                const s = QURAN_METADATA.find(m => m.number === n);
                if (s) out.push({ key: `su-${n}`, icon: '📖', label: `${n}. ${s.transliteratedName}`, sub: `${s.name} · ${s.englishName}`, go: () => openSurah(n) });
            }
            return out;
        }

        const vm = raw.match(/^(\d+)\s*[:،]\s*(\d+)$/);
        if (vm) {
            const sNum = parseInt(vm[1], 10), aNum = parseInt(vm[2], 10);
            const s = QURAN_METADATA.find(m => m.number === sNum);
            if (s) {
                const ayah = Math.max(1, Math.min(aNum, s.numberOfAyahs));
                out.push({ key: `vs-${sNum}-${ayah}`, icon: '🎯', label: `Verse ${sNum}:${ayah}`, sub: `${s.transliteratedName}${ayah !== aNum ? ' (closest)' : ''}`, go: () => jump(sNum, `${sNum}:${ayah}`) });
            }
            return out;
        }

        if (raw.length >= 2) {
            for (const m of getTopSurahMatches(raw, 5)) {
                out.push({ key: `su-${m.surah.number}`, icon: '📖', label: `${m.surah.number}. ${m.surah.transliteratedName}`, sub: `${m.surah.name} · ${m.surah.englishName}`, go: () => openSurah(m.surah.number) });
            }
        }
        return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput, selectedSurahId]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        // Normalize Arabic-Indic digits (and the Arabic comma as a verse separator)
        // so "٥٠" or "٢،٢٥٥" work like "50" / "2:255".
        const term = normalizeDigits(searchInput.trim()).replace(/،/g, ':');
        if (!term) return;

        setShowSearchSuggestions(false);
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
        
        // Local-first text search: scan the currently loaded surah (diacritic-
        // insensitive). During live logging the word being searched is almost
        // always in the surah on screen — this jumps instantly, no network.
        if (containsArabic(term)) {
            const strippedTerm = stripArabicDiacritics(term);
            const localHits = verses.filter(v => stripArabicDiacritics(v.text_uthmani).includes(strippedTerm));
            if (localHits.length === 1) {
                setScrollToVerseKey(localHits[0].verse_key);
                setIsSearching(false);
                return;
            }
            if (localHits.length > 1) {
                setSearchResults(localHits.map(v => ({ verse_key: v.verse_key, text: v.text_uthmani })));
                setIsSearchResultsModalOpen(true);
                setIsSearching(false);
                return;
            }
        }

        // Global text search (quran.com). Strip diacritics from Arabic queries —
        // partially-vowelled input returns far fewer/none results otherwise.
        try {
            const apiTerm = containsArabic(term) ? stripArabicDiacritics(term) : term;
            const response = await fetch(`https://api.quran.com/api/v4/search?q=${encodeURIComponent(apiTerm)}&size=20`);
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
            // Non-blocking: show a toast + reopen the typeahead so the tutor can
            // pick a suggestion without dismissing a dialog mid-lesson.
            showToast(`No match for "${term}" — did you mean: ${suggestionText}?`);
            setShowSearchSuggestions(true);
        } else {
            showToast(t('liveSession.searchNotFound', { query: searchInput }));
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

    // ── Automatic quality score ──────────────────────────────────────────────
    // Score falls with the density of mistakes logged TODAY inside the range
    // (old mistakes on the same verses don't re-penalize a fresh reading).
    // Reading mistakes weigh 1, tajweed ½. rate = weighted/verses, and
    // score = 10·e^(−2.2·rate) rounded into 1–10:
    //   0/verse→10 · 1 per 10 verses→8 · 1 per 5→6 · 1 per 2→3 · 1 per verse→1.
    const autoScoreForRange = (range: { start: Progress; end: Progress }) => {
        const today = new Date().toDateString();
        const inRange = (su: number, ay: number) => {
            if (su < range.start.surah || su > range.end.surah) return false;
            if (su === range.start.surah && ay < range.start.ayah) return false;
            if (su === range.end.surah && ay > range.end.ayah) return false;
            return true;
        };
        let weighted = 0, count = 0;
        for (const [key, m] of Object.entries(student.mistakes || {})) {
            const parts = key.replace(/^T/, '').split(':').map(Number);
            if (parts.length < 2 || parts.some(isNaN)) continue;
            const mm = m as { date?: string; errorType?: string };
            if (!mm.date || new Date(mm.date).toDateString() !== today) continue;
            if (!inRange(parts[0], parts[1])) continue;
            weighted += mm.errorType === 'tajweed' ? 0.5 : 1;
            count += 1;
        }
        let verses = 0;
        for (let su = range.start.surah; su <= range.end.surah; su++) {
            const meta = QURAN_METADATA[su - 1];
            const from = su === range.start.surah ? range.start.ayah : 1;
            const to = su === range.end.surah ? range.end.ayah : meta.numberOfAyahs;
            verses += Math.max(0, to - from + 1);
        }
        const rate = verses > 0 ? weighted / verses : 0;
        const score = Math.max(1, Math.min(10, Math.round(10 * Math.exp(-2.2 * rate))));
        return { score, count, verses };
    };

    const confirmLog = (quality: number = logQuality) => {
        if (!pendingLogRange || !selectedLogType) return;
        if (selectedLogType === 'reading') {
            onLogRecitationRange(student.id, pendingLogRange, quality, false);
            showToast(t('liveSession.rangeSaved'));
        } else if (selectedLogType === 'reading-revision') {
            onLogRecitationRange(student.id, pendingLogRange, quality, true);
            showToast('Reading revision saved');
        } else if (selectedLogType === 'hifz') {
            // hifz implies reading — the memorization handler logs BOTH atomically
            onLogMemorizationRange(student.id, pendingLogRange, quality, false);
            showToast(t('liveSession.memorizationRangeSaved'));
        } else if (selectedLogType === 'hifz-revision') {
            onLogMemorizationRange(student.id, pendingLogRange, quality, true);
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
    
    /** Pin the window scroll across a state change that closes the ring. The
     *  ring lives in a portal on document.body; tearing it down while its input
     *  is focused let the page drift (most visibly: Enter-to-log jumped the
     *  reader down the page). Re-asserting the offset for a few frames is
     *  cheap and holds regardless of which teardown step caused the move. */
    const keepScroll = useCallback(() => {
        const y = window.scrollY;
        let frames = 0;
        const hold = () => {
            if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
            if (++frames < 4) requestAnimationFrame(hold);
        };
        requestAnimationFrame(hold);
    }, []);

    const handleLetterTextSubmit = useCallback((letterKey: string, text: string) => {
        keepScroll();
        const [surah, ayah, wordIndex, letterIndex] = letterKey.split(':').map(Number);
        letterClickStates.current[letterKey] = 2; // Mark as completed
        setEditingLetterKey(null);
        setErrorTextInput('');
        // Add the mistake with error type and text
        onCycleMistakeLevel(student.id, surah, ayah, wordIndex, letterIndex, errorType, text);
    }, [errorType, student.id, onCycleMistakeLevel, studentMistakes, keepScroll]);

    const handleLetterTextCancel = useCallback(() => {
        keepScroll();
        if (editingLetterKey) {
            letterClickStates.current[editingLetterKey] = 0;
            // The first click pre-marks the letter before the ring opens; a
            // cancel with nothing logged should leave no trace behind.
            const m = studentMistakes[editingLetterKey];
            if (m && !m.errorText) {
                const [surah, ayah, wordIndex, letterIndex] = editingLetterKey.split(':').map(Number);
                onClearMistake(student.id, surah, ayah, wordIndex, letterIndex);
            }
        }
        setEditingLetterKey(null);
        setErrorTextInput('');
    }, [editingLetterKey, studentMistakes, onClearMistake, student.id, keepScroll]);

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


    // Ayah circle sizing. It used to be a flat w-12 h-12 (48px) at every text
    // size — fine beside 72px desktop verses, but three times the letter height
    // on a phone, where the Quran opens at 16px.
    //
    // The clamp goes on FONT-SIZE (where `em` means the surrounding Quran text)
    // and the box is then sized in the marker's OWN em. Sizing the box directly
    // in `em` does not work: `em` in width resolves against the element's own
    // font-size, so a marker that also shrinks its own text feeds itself and
    // stops growing — it pinned at 31px however large the verses got.
    const verseMarkerStyle: React.CSSProperties = {
        verticalAlign: 'middle',
        // em = the Quran text size; the vw term caps the circle on narrow
        // phone screens (375px → ~9.75px numeral, ~23px circle) without
        // touching tablets/desktop, where 0.6em/22px governs.
        fontSize: 'clamp(9px, min(0.6em, 2.6vw), 22px)',
        width: '2.35em',                        // em here = the line above
        height: '2.35em',
        margin: '0 0.45em',
    };

    const VerseMarker: React.FC<{ number: number; surah: number; isSelectedStart: boolean }> = ({ number, surah, isSelectedStart }) => {
        // Include ALL logs (first-time + revisions) so the table and live page stay in sync
        const isLongPressStart = longPressStart?.surah === surah && longPressStart?.ayah === number;
        const glowClass = (!readOnly && isSelectedStart) ? 'ring-2 ring-offset-4 ring-teal-500 dark:ring-orange-500 animate-pulse' : '';
        const longPressGlowClass = (!readOnly && isLongPressStart) ? 'animate-glow' : '';
        // green = hifz(+reading), orange = read, purple = homework, blue = tafsir
        const svgFill = VERSE_MARKER_FILL[verseLogColor(surah, number).base];

        if (listenActive) {
            // Listen mode (student portal, or tutor 🎧): tapping the verse number plays the
            // recitation from this ayah to the end of the surah. Tapping again (any
            // number) stops it.
            const isPlayingHere = readOnlyAudioVerse?.surah === surah && readOnlyAudioVerse?.ayah === number;
            return (
                <span
                    onClick={() => handleAyahNumberRecite(surah, number)}
                    className={`inline-flex items-center justify-center flex-shrink-0 font-mono font-bold text-slate-700 dark:text-slate-200 relative cursor-pointer rounded-full transition-all ${isPlayingHere ? 'ring-2 ring-teal-500 dark:ring-teal-400' : ''}`}
                    style={verseMarkerStyle} role="button" aria-label={`Play recitation from verse ${number}`}
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
                className={`inline-flex items-center justify-center flex-shrink-0 font-mono font-bold text-slate-700 dark:text-slate-200 cursor-pointer relative transition-all rounded-full ${glowClass} ${longPressGlowClass}`}
                style={verseMarkerStyle} role="button" aria-label={`Mark progress at verse ${number}`}
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

            const verseWords = splitVerseWords(verse.text_uthmani, turkishSource).map((word, wordIndex, wordsArray) => {
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
                            const baseKey = `${surahNum}:${ayahNum}:${wordIndex}:${letterIndex}`;
                            // Turkish-text mistakes live under their own namespace.
                            const letterKey = turkishSource ? `T${baseKey}` : baseKey;
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
                                    onLetterClick={listenActive ? () => {} : handleLetterClick}
                                    onTextChange={setErrorTextInput}
                                    onTextSubmit={handleLetterTextSubmit}
                                    ringCounts={errorType === 'tajweed' ? ringData.tajweedCounts : ringData.counts}
                                    ringPermFlags={ringPermFlags}
                                    ringMode={errorType}
                                    onToggleFlag={handleToggleFlag}
                                    onTextCancel={handleLetterTextCancel}
                                    tajweedClass={(() => { const r = verseTajweedMaps.get(verse.verse_key)?.get(`${wordIndex}:${letterIndex}`); return r ? `tj-${r}` : undefined; })()}
                                    markLineHeight={showTranslation ? 2.8 : 2.6}
                                    tajweedTitle={readOnly ? (() => { const r = verseTajweedMaps.get(verse.verse_key)?.get(`${wordIndex}:${letterIndex}`); return r ? tajweedLabel(r) : undefined; })() : undefined}
                                    clickState={clickState}
                                    isFocused={highlightedLetterKey === letterKey}
                                    isCursorActive={cursorLetterKey === letterKey || localCursorKey === letterKey}
                                    onLongPress={!listenActive ? handleLetterLongPress : undefined}
                                    vowelAdj={vowelAdjMap?.[currentQuranicFont()]?.[baseKey]}
                                />
                            );
                        })}
                        {' '}
                    </span>
                );
            });
            const isSelectedStart = selectionStart?.surah === surahNum && selectionStart?.ayah === ayahNum;
            const verseMarker = (<VerseMarker key={`marker-${verse.verse_key}`} number={ayahNum} surah={surahNum} isSelectedStart={isSelectedStart}/>);
            const isVerseNowPlaying = listenActive && readOnlyAudioVerse?.surah === surahNum && readOnlyAudioVerse?.ayah === ayahNum;
            const verseTextNode = (
                <span
                    key={`text-${verse.verse_key}`}
                    className={`px-1 py-1 rounded-md transition-all duration-300
                        ${VERSE_BG[vColor.base]} ${vColor.underline ? VERSE_UNDERLINE : ''}
                        ${isVerseHidden ? 'opacity-0' : 'opacity-100'}
                        ${listenActive ? 'cursor-pointer' : ''}
                        ${isVerseNowPlaying ? 'ring-2 ring-teal-500 dark:ring-teal-400' : ''}`}
                    // readOnly: use CAPTURE phase so LetterWithError's stopPropagation() (bubble phase) can't block us
                    // Skip audio if the click originated inside the Tadabbur note section
                    onClickCapture={listenActive ? (e) => {
                        if ((e.target as Element).closest?.('[data-tadabbur]')) return;
                        const audio = readOnlyAudioRef.current;
                        if (!audio) return;
                        // Full-surah mode: one tap starts the surah, the next stops it.
                        if (readOnlyAudioVerse?.ayah === 0) { stopVerse(); return; }
                        const isSame = readOnlyAudioVerse?.surah === surahNum && readOnlyAudioVerse?.ayah === ayahNum;
                        if (isSame) {
                            if (audio.paused) audio.play().catch(() => setAudioFailed(true));
                            else stopVerse();
                            return;
                        }
                        playVerse(surahNum, ayahNum, false);   // verse text = this ayah only
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

    // Shared recitation-settings pill (speed + reciter + verse repeat) —
    // rendered on the student toolbar and beside the tutor's 🎧 listen toggle.
    const recitationSettings = (
        <>
                            {/* One compound button: speed, reciter and verse-repeat live
                                together in a small settings window. */}
                            <button
                                onClick={() => setAudioMenuOpen(o => !o)}
                                title="Recitation settings"
                                aria-label="Recitation settings"
                                className="h-8 sm:h-9 px-2.5 sm:px-3 rounded-full bg-slate-100 dark:bg-gray-700/60 flex items-center gap-1 text-[11px] font-extrabold text-teal-700 dark:text-teal-300 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors shadow-sm leading-none"
                            >
                                <span className="text-sm leading-none">🎙️</span>
                                <span>{readOnlySpeed}×</span>
                                {verseRepeat > 1 && <span className="text-amber-600 dark:text-amber-400">↻{verseRepeat}</span>}
                            </button>
                            {audioMenuOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setAudioMenuOpen(false)} />
                                    <div className="absolute top-full left-0 mt-1 z-40 bg-white dark:bg-gray-800 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10 p-2 w-[250px]">
                                        {/* Speed */}
                                        <span className="block px-1 pb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500 select-none">🔊 Speed</span>
                                        <div className="flex gap-1 mb-2.5">
                                            {[0.5, 0.75, 1, 1.25, 1.5].map(sp => (
                                                <button
                                                    key={sp}
                                                    onClick={() => setReadOnlySpeed(sp)}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-colors ${readOnlySpeed === sp ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                                >
                                                    {sp}×
                                                </button>
                                            ))}
                                        </div>
                                        {/* Verse repeat — meaningless for full-surah reciters */}
                                        <span className="block px-1 pb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500 select-none">
                                            🔁 Repeat each verse{reciterOf(reciter).mode === 'fullSurah' ? ' — verse-by-verse reciters only' : ''}
                                        </span>
                                        <div className={`flex gap-1 mb-2.5 ${reciterOf(reciter).mode === 'fullSurah' ? 'opacity-40 pointer-events-none' : ''}`}>
                                            {[1, 2, 3, 5].map(n => (
                                                <button
                                                    key={n}
                                                    onClick={() => setVerseRepeat(n)}
                                                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-colors ${verseRepeat === n ? 'bg-amber-500 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                                >
                                                    {n === 1 ? 'once' : `${n}×`}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Reciter */}
                                        <span className="block px-1 pb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500 select-none">🎙️ Reciter</span>
                                        <div className="flex flex-col max-h-64 overflow-y-auto">
                                            {RECITERS.filter(r => r.key !== 'ustadh' || recManifest?.published).map(r => (
                                                <button
                                                    key={r.key}
                                                    onClick={() => {
                                                        if (r.key !== reciter) { stopVerse(); loadedSurahRef.current = 0; setReciter(r.key); }
                                                        setAudioMenuOpen(false);
                                                    }}
                                                    className={`px-3 py-2 rounded-lg text-xs font-bold text-start flex items-center justify-between gap-3 transition-colors ${reciter === r.key ? 'bg-teal-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                                >
                                                    <span>
                                                        {r.name}
                                                        <span className={`block text-[9px] font-semibold ${reciter === r.key ? 'text-white/70' : 'text-slate-400'}`}>
                                                            {r.mode === 'fullSurah' ? 'full surah' : 'verse by verse'}
                                                        </span>
                                                    </span>
                                                    <span dir="rtl" className="font-quranic text-base leading-none">{r.nameAr}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
        </>
    );

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
                            <StudentProfileIcon src={(student as { profileIcon?: string }).profileIcon} size={60} mode="always" />
                            <h1 className="text-2xl font-bold text-teal-800 dark:text-slate-100">{student.name}{student.dob ? ` (${t('liveSession.age', { age: getAge(student.dob) })})` : ''}</h1>
                            {nameCardExtra}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">{t('liveSession.currentProgress')}: {studentProgress ? `${QURAN_METADATA[studentProgress.surah - 1].transliteratedName}, Ayah ${studentProgress.ayah}` : t('liveSession.notSet')}</p>
                    </div>
                     {!readOnly && (
                     <div className="flex-shrink-0 flex items-center gap-2"><button onClick={() => onGoBack()} className="p-2.5 bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg></button></div>
                     )}
                </div>
                <SurahProgressBar
                    surahStatuses={surahStatuses} title={t('liveSession.overallProgress')} type="reading"
                    hasHomework={surahHasHomework} hasTafsir={surahHasTafsir}
                    onSelectSurah={handleSurahSelection}
                />
                <MilestoneTracker completedPages={new Set<number>([...getRecitedPagesSet(student), ...getMemorizedPagesSet(student)])} />
            </div>

            <div className="space-y-6">
                <div className="px-2 py-2 sm:p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-t-none rounded-b-xl shadow-md border border-slate-200 dark:border-gray-700 sticky z-30" style={{ top: `${toolbarStickyTop}px` }}>
                    {/* Toolbar: fixed left controls | scrollable surah pills | fixed right controls.
                        Wraps on narrow screens so the right-side controls stay reachable. */}
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {/* ── Left: speed control (readOnly) OR error type toggle (live) ── */}
                        {readOnly ? (
                        <div className="relative flex items-center gap-1.5 flex-shrink-0" dir="ltr">
                            {recitationSettings}
                        </div>
                        ) : (
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Listen mode: verse taps play recitation instead of logging */}
                            <div className="relative flex items-center gap-1.5" dir="ltr">
                                <button
                                    onClick={() => setTutorListen(o => !o)}
                                    title={tutorListen ? 'Listening — tap to return to mistake logging' : 'Listen mode: tap verses to hear the recitation'}
                                    aria-label="Toggle listen mode"
                                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm shadow-sm leading-none transition-colors ${tutorListen ? 'bg-teal-600 text-white ring-2 ring-teal-300 dark:ring-teal-700' : 'bg-slate-100 dark:bg-gray-700/60 hover:bg-slate-200 dark:hover:bg-gray-600'}`}
                                >
                                    🎧
                                </button>
                                {recitationSettings}
                            </div>
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
                        {/* ── Middle (phones): current surah button → vertical picker ── */}
                        <button
                            onClick={() => setSurahPickerOpen(true)}
                            className="sm:hidden flex-1 min-w-0 flex items-center justify-between gap-2 px-3 py-1.5 rounded-full text-sm font-semibold bg-teal-600 dark:bg-orange-600 text-white shadow-md"
                            aria-label="Choose surah"
                        >
                            <span className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-xs opacity-80 flex-shrink-0">{selectedSurahId}</span>
                                <span className="truncate tracking-wide">
                                    {surahStatuses.find(st => st.id === selectedSurahId)?.transliteratedName ?? ''}
                                </span>
                            </span>
                            <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M8 15l4 4 4-4" />
                            </svg>
                        </button>

                        {/* ── Middle (sm+): surah pills — first & last pinned, middle scrolls ── */}
                        <div className="hidden flex-1 sm:flex items-center gap-1 sm:gap-2 min-w-0 overflow-hidden">
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

                        {/* ── Right: tool controls. On phones this is its own full-width
                            row under the surah button, everything compact; from sm it goes
                            back to the inline cluster. ── */}
                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:gap-2 flex-shrink-0 w-full sm:w-auto min-w-0">
                            {/* Font size */}
                            <div className="flex items-center bg-slate-200 dark:bg-gray-700 rounded-lg p-0.5 sm:p-1 sm:gap-1">
                                <button onClick={handleDecreaseFontSize} className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.decreaseFont')}>-</button>
                                <span className="text-slate-600 dark:text-slate-300 font-semibold w-5 sm:w-7 text-center text-sm">A</span>
                                <button onClick={handleIncreaseFontSize} className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition" aria-label={t('liveSession.increaseFont')}>+</button>
                            </div>

                            {/* Auto-scroll */}
                            <div className={`flex items-center gap-1 sm:gap-2 bg-slate-200 dark:bg-gray-700 rounded-lg p-0.5 sm:p-1 transition-all duration-300 ease-in-out ${isAutoScrolling ? 'w-auto sm:w-32' : 'w-auto'}`}>
                                <button onClick={() => setIsAutoScrolling(prev => !prev)} className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 font-bold transition flex-shrink-0" title={isAutoScrolling ? t('liveSession.toggleAutoScrollPause') : t('liveSession.toggleAutoScrollPlay')}>
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
                                            showToolsMenu || showTranslation || showTajweed || teacherNote
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
                                            <div className={`flex items-center gap-1 rounded-lg transition-colors ${showTajweed ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''}`}>
                                                <button onClick={() => setShowTajweed(p => !p)} className={`flex-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${showTajweed ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'}`}>
                                                    <span className="w-4 h-4 flex items-center justify-center text-sm">🎨</span>
                                                    {t('liveSession.tajweedColors')}
                                                </button>
                                                <button
                                                    onClick={() => setShowTajweedMenu(true)}
                                                    title={t('liveSession.tajweedInfo')}
                                                    aria-label={t('liveSession.tajweedInfo')}
                                                    className={`me-1.5 w-5 h-5 flex-shrink-0 rounded-full border flex items-center justify-center text-xs font-bold transition-colors ${showTajweed ? 'border-emerald-400 text-emerald-600 dark:text-emerald-300 dark:border-emerald-600 hover:bg-emerald-200/60 dark:hover:bg-emerald-800/50' : 'border-slate-300 text-slate-400 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-700'}`}
                                                >i</button>
                                            </div>

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

                            {/* Search — with instant typeahead (pages, verses, surah names) */}
                            <div className="relative flex-1 sm:flex-none min-w-0">
                                <form onSubmit={handleSearch} className="flex gap-1 sm:gap-2 items-center">
                                    <input type="text" value={searchInput}
                                        onChange={e => { setSearchInput(e.target.value); setShowSearchSuggestions(true); }}
                                        onFocus={() => { if (searchInput.trim()) setShowSearchSuggestions(true); }}
                                        onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
                                        onKeyDown={e => { if (e.key === 'Escape') setShowSearchSuggestions(false); }}
                                        placeholder={t('liveSession.searchPlaceholder')} className="w-full sm:w-36 min-w-0 px-2 py-1.5 sm:py-2 text-sm bg-white dark:bg-gray-900 dark:text-white border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:focus:ring-orange-500 focus:outline-none transition" />
                                    <button type="submit" disabled={isSearching} className="bg-teal-600 dark:bg-orange-600 text-white p-2 sm:p-2.5 rounded-lg hover:bg-teal-700 dark:hover:bg-orange-700 transition disabled:bg-slate-400 dark:disabled:bg-gray-600 flex-shrink-0" aria-label={t('liveSession.search')}>
                                        {isSearching ? <SpinnerIcon/> : <SearchIcon/>}
                                    </button>
                                </form>
                                {showSearchSuggestions && searchSuggestions.length > 0 && (
                                    <div className="absolute top-full right-0 mt-1.5 w-72 max-w-[85vw] bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 rounded-xl shadow-2xl z-50 overflow-hidden py-1">
                                        {searchSuggestions.map(s => (
                                            <button key={s.key} type="button"
                                                onMouseDown={e => { e.preventDefault(); s.go(); }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-teal-50 dark:hover:bg-gray-700 transition-colors">
                                                <span className="text-base flex-shrink-0">{s.icon}</span>
                                                <span className="flex-1 min-w-0">
                                                    <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{s.label}</span>
                                                    {s.sub && <span className="block text-xs text-slate-400 dark:text-slate-500 truncate" dir="auto">{s.sub}</span>}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
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
                                                // Vertical room so the mistake note above a word isn't clipped by
                                                // overflow:hidden. The mask fades left/right only (vertically uniform),
                                                // so this padding stays fully visible.
                                                paddingTop: '6rem',
                                                paddingBottom: '6rem',
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
                                                            ref={item.isVerseStart ? (el) => {
                                                                if (el) verseFirstWordEls.current.set(item.ayah, el);
                                                                else verseFirstWordEls.current.delete(item.ayah);
                                                            } : undefined}
                                                            className="font-quranic text-slate-900 dark:text-slate-100"
                                                            style={{ ...slotStyle, fontSize: '10.5rem', lineHeight: 2.2 }}
                                                        >
                                                            {(() => { const fwPlan = wordMarkPlan(item.word); return (
                                                            <span dir="rtl" className="relative inline" style={{ display: 'inline', fontFamily: fwPlan.mode === 'wholeWord' ? fwPlan.font : 'inherit' }}>
                                                                {letters.length === 0 ? item.word : letters.map(({ letter, index: li }) => {
                                                                    const baseLk = `${item.surah}:${item.ayah}:${item.wordIdx}:${li}`;
                                                                    const lk = turkishSource ? `T${baseLk}` : baseLk;
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
                                                                            onLetterClick={listenActive ? () => {} : handleLetterClick}
                                                                            onTextChange={setErrorTextInput}
                                                                            onTextSubmit={handleLetterTextSubmit}
                                                                            ringCounts={errorType === 'tajweed' ? ringData.tajweedCounts : ringData.counts}
                                                                            ringPermFlags={ringPermFlags}
                                                                            ringMode={errorType}
                                                                            onToggleFlag={handleToggleFlag}
                                                                            onTextCancel={handleLetterTextCancel}
                                                                            tajweedClass={(() => { const r = verseTajweedMaps.get(`${item.surah}:${item.ayah}`)?.get(`${item.wordIdx}:${li}`); return r ? `tj-${r}` : undefined; })()}
                                                                            markLineHeight={2.2}
                                                                            tajweedTitle={readOnly ? (() => { const r = verseTajweedMaps.get(`${item.surah}:${item.ayah}`)?.get(`${item.wordIdx}:${li}`); return r ? tajweedLabel(r) : undefined; })() : undefined}
                                                                            clickState={cs}
                                                                            isFocused={highlightedLetterKey === lk}
                                                                            isCursorActive={cursorLetterKey === lk || localCursorKey === lk}
                                                                            onLongPress={!listenActive ? handleLetterLongPress : undefined}
                                                                            vowelAdj={vowelAdjMap?.[currentQuranicFont()]?.[baseLk]}
                                                                            focusMode
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
                        <div className="text-center pt-12 pb-8 px-2">
                            {readOnly ? (
                                <><p className="text-4xl font-quranic text-slate-700 dark:text-slate-100">{selectedSurahInfo?.name}</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{selectedSurahInfo?.englishName}</p></>
                            ) : (
                                <button
                                    onClick={() => selectedSurahInfo && openLogModal({ start: { surah: selectedSurahId, ayah: 1 }, end: { surah: selectedSurahId, ayah: selectedSurahInfo.numberOfAyahs } })}
                                    title="Log the entire surah"
                                    className="group inline-flex flex-col items-center rounded-2xl px-6 py-2 transition-colors hover:bg-teal-50 dark:hover:bg-orange-900/20"
                                >
                                    <p className="text-4xl font-quranic text-slate-700 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-orange-300 transition-colors">{selectedSurahInfo?.name}</p>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{selectedSurahInfo?.englishName}</p>
                                    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 dark:text-orange-400 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10 3a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4a1 1 0 0 1 1-1Z" /></svg>
                                        Tap to log the whole surah
                                    </span>
                                </button>
                            )}
                        </div>
                        {showTranslation && isTranslationLoading && <div className="text-center my-4 p-3 bg-slate-100 dark:bg-gray-700 rounded-lg mx-6 sm:mx-12"><p className="text-slate-600 dark:text-slate-300 animate-pulse font-semibold">{t('liveSession.loadingTranslation')}</p></div>}
                        {showTranslation && translationError && <div className="text-center my-4 p-3 bg-red-100 text-red-700 rounded-lg mx-6 sm:mx-12"><p className="font-semibold">{translationError}</p></div>}
                        <hr className="w-48 h-1 mx-auto my-8 bg-teal-100 dark:bg-gray-700 border-0 rounded" />
                        {selectedSurahId !== 1 && selectedSurahId !== 9 && <p className="text-center font-quranic text-4xl text-slate-800 dark:text-slate-200 mb-12">{turkishSource ? 'بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّح۪يمِ' : 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ'}</p>}
                        {renderSurahContent()}
                        {/* Colour legend (left) + pagination controls (right) */}
                        {!isLoading && !error && verses.length > 0 && (
                            <div dir="ltr" className="flex flex-wrap justify-between items-center gap-x-3 gap-y-2 sm:gap-x-4 sm:gap-y-3 py-4 px-2 sm:py-6 sm:px-4 border-t border-slate-200 dark:border-gray-700">
                                {/* Legend */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-300 dark:bg-green-700" />Read &amp; memorized</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-300 dark:bg-orange-700" />Read</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-300 dark:bg-purple-700" />Homework</span>
                                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-300 dark:bg-blue-700" />Tafsir</span>
                                </div>
                                {/* Pager — only when the surah spans more than one window */}
                                <div className="flex items-center gap-1.5 sm:gap-3 ms-auto">
                                    {/* Left: previous 5 pages within the surah, else jump to the previous surah */}
                                    {hasPreviousPages() ? (
                                        <button
                                            onClick={handlePreviousPages}
                                            className="group flex items-center gap-1 sm:gap-1.5 ps-2.5 pe-3 py-1.5 text-xs sm:ps-3 sm:pe-4 sm:py-2.5 sm:text-sm rounded-full font-semibold shadow-sm transition-all duration-200 border bg-white dark:bg-gray-800 text-teal-700 dark:text-orange-300 border-teal-200 dark:border-orange-900/50 hover:bg-teal-50 dark:hover:bg-orange-900/20 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:-translate-x-0.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                            </svg>
                                            <span>Previous</span>
                                        </button>
                                    ) : selectedSurahId > 1 ? (
                                        <button
                                            onClick={() => handleSurahSelection(selectedSurahId - 1)}
                                            className="group flex items-center gap-1 sm:gap-1.5 ps-2.5 pe-3 py-1.5 text-xs sm:ps-3 sm:pe-4 sm:py-2.5 sm:text-sm rounded-full font-semibold shadow-sm transition-all duration-200 border bg-white dark:bg-gray-800 text-teal-700 dark:text-orange-300 border-teal-200 dark:border-orange-900/50 hover:bg-teal-50 dark:hover:bg-orange-900/20 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:-translate-x-0.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                            </svg>
                                            <span>Previous Surah</span>
                                        </button>
                                    ) : null}

                                    {(hasPreviousPages() || hasMorePages()) && (
                                        <span className="px-2.5 py-1 text-[10px] sm:px-3.5 sm:py-1.5 sm:text-xs rounded-full bg-teal-600 dark:bg-orange-600 text-white font-bold shadow-sm whitespace-nowrap">
                                            {t('liveSession.page')} {toEasternArabicNumerals(currentPageRange.start)}–{toEasternArabicNumerals(currentPageRange.end)}
                                        </span>
                                    )}

                                    {/* Right: next 5 pages within the surah, else jump to the next surah */}
                                    {hasMorePages() ? (
                                        <button
                                            onClick={handleNextPages}
                                            className="group flex items-center gap-1 sm:gap-1.5 ps-3 pe-2.5 py-1.5 text-xs sm:ps-4 sm:pe-3 sm:py-2.5 sm:text-sm rounded-full font-semibold shadow-sm transition-all duration-200 border bg-teal-600 dark:bg-orange-600 text-white border-teal-600 dark:border-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                            <span>Next</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:translate-x-0.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                            </svg>
                                        </button>
                                    ) : selectedSurahId < 114 ? (
                                        <button
                                            onClick={() => handleSurahSelection(selectedSurahId + 1)}
                                            className="group flex items-center gap-1 sm:gap-1.5 ps-3 pe-2.5 py-1.5 text-xs sm:ps-4 sm:pe-3 sm:py-2.5 sm:text-sm rounded-full font-semibold shadow-sm transition-all duration-200 border bg-teal-600 dark:bg-orange-600 text-white border-teal-600 dark:border-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                                        >
                                            <span>Next Surah</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:translate-x-0.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                            </svg>
                                        </button>
                                    ) : null}
                                </div>
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
            <style>{TAJWEED_CSS}</style>
            {showTajweedMenu && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowTajweedMenu(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-gray-700">
                            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <span>🎨</span>{t('liveSession.tajweedInfoTitle')}
                            </h3>
                            <button onClick={() => setShowTajweedMenu(false)} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 text-xl leading-none">×</button>
                        </div>
                        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
                            {TAJWEED_LEGEND_ORDER.map(ruleId => (
                                <div key={ruleId} className="flex items-start gap-3">
                                    <span className="w-3.5 h-3.5 mt-1 rounded-full flex-shrink-0 ring-1 ring-black/10 dark:ring-white/10" style={{ background: TAJWEED_RULES[ruleId].color }} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{TAJWEED_RULES[ruleId].label}</span>
                                            <span dir="rtl" className="text-sm font-semibold text-slate-600 dark:text-slate-300 flex-shrink-0">{TAJWEED_RULES[ruleId].labelAr}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{TAJWEED_DESCRIPTIONS[ruleId].en}</p>
                                        <p dir="rtl" className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{TAJWEED_DESCRIPTIONS[ruleId].ar}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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
                                <div className="grid grid-cols-2 gap-2.5">

                                    {/* ── Reading: Revision if surah already has reading, else first-time ── */}
                                    {hasReadingForRange(pendingLogRange.start, pendingLogRange.end) ? (
                                        <LogOption src="/animations/reading.json" label="Reading" sub="Revision" color="orange"
                                            onClick={() => { setSelectedLogType('reading-revision'); setLogTypeStep('quality'); }} />
                                    ) : (
                                        <LogOption src="/animations/reading.json" label="Reading" color="orange"
                                            onClick={() => { setSelectedLogType('reading'); setLogTypeStep('quality'); }} />
                                    )}

                                    {/* ── Hifz: Revision if surah already has hifz, else first-time ── */}
                                    {hasHifzForRange(pendingLogRange.start, pendingLogRange.end) ? (
                                        <LogOption src="/animations/hifz.json" label="Hifz" sub="Revision" color="green"
                                            onClick={() => { setSelectedLogType('hifz-revision'); setLogTypeStep('quality'); }} />
                                    ) : (
                                        <LogOption src="/animations/hifz.json" label="Hifz" color="green"
                                            onClick={() => { setSelectedLogType('hifz'); setLogTypeStep('quality'); }} />
                                    )}

                                    {/* ── Tafseer — hidden once surah already has tafseer ── */}
                                    {!hasTafseerForRange(pendingLogRange.start, pendingLogRange.end) && (
                                        <LogOption src="/animations/tafsir.json" label="Tafsir" color="blue"
                                            onClick={() => {
                                                if (!pendingLogRange) return;
                                                onLogTafseerRange(student.id, pendingLogRange);
                                                showToast('Tafseer logged');
                                                setPendingLogRange(null); setLogTypeStep(null); setSelectedLogType(null);
                                            }} />
                                    )}

                                    {/* ── Homework ── */}
                                    {onLogHomework && (
                                        <LogOption src="/animations/homework.json" label="Homework" color="purple"
                                            onClick={() => { setSelectedLogType('homework'); setHomeworkNote(''); setLogTypeStep('homework-note'); }} />
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
                                {/* One-tap suggestions — most homework is one of these four. */}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {[
                                        { label: '📖 Memorize', text: 'Memorize this range.' },
                                        { label: '🔁 Revise', text: 'Revise this range.' },
                                        { label: '👀 Prepare for reading', text: 'Prepare this range for reading in the next lesson.' },
                                        { label: '✍️ Write tafsir', text: 'Write the tafsir of this range in your notebook.' },
                                    ].map(c => (
                                        <button
                                            key={c.label}
                                            type="button"
                                            onClick={() => setHomeworkNote(n => n.trim() ? `${n.trim()}\n${c.text}` : c.text)}
                                            className="px-3 py-1.5 rounded-full text-xs font-bold bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/70 transition-colors active:scale-95"
                                        >
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
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
                                    <button onClick={() => confirmLog()} className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition-colors">Assign</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
                                    {selectedLogType === 'reading' ? 'Reading Quality' :
                                     selectedLogType === 'reading-revision' ? 'Reading Revision Quality' :
                                     selectedLogType === 'hifz' ? 'Hifz Quality' : 'Hifz Revision Quality'}
                                </h3>
                                {(() => {
                                    const auto = autoScoreForRange(pendingLogRange);
                                    return (
                                        <div className="mb-4">
                                            <div className="rounded-2xl bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600 px-4 py-3 mb-3 text-center">
                                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Auto score</p>
                                                <p className={`text-4xl font-black ${auto.score >= 8 ? 'text-teal-600 dark:text-teal-400' : auto.score >= 5 ? 'text-amber-500' : 'text-rose-500'}`}>{auto.score}<span className="text-lg text-slate-400">/10</span></p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{auto.count} mistake{auto.count === 1 ? '' : 's'} · {auto.verses} verse{auto.verses === 1 ? '' : 's'}</p>
                                            </div>
                                            <button
                                                onClick={() => { setLogQuality(auto.score); confirmLog(auto.score); }}
                                                className="w-full py-3 rounded-xl bg-teal-600 dark:bg-orange-600 text-white font-black text-base hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors active:scale-[0.98]"
                                            >
                                                Save with score {auto.score}
                                            </button>
                                        </div>
                                    );
                                })()}
                                <p className="text-xs text-slate-400 dark:text-slate-500 mb-2 text-center">or set it manually</p>
                                <div className="grid grid-cols-5 gap-2 mb-5">
                                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                                        <button
                                            key={n}
                                            onClick={() => { setLogQuality(n); confirmLog(n); }}
                                            aria-label={`Score ${n} out of 10`}
                                            className={`aspect-square rounded-full text-lg font-black transition-all active:scale-90 border-2 ${
                                                n <= 4
                                                    ? 'border-rose-200 text-rose-600 hover:bg-rose-500 hover:text-white hover:border-rose-500 dark:border-rose-900 dark:text-rose-400'
                                                    : n <= 7
                                                        ? 'border-amber-200 text-amber-600 hover:bg-amber-500 hover:text-white hover:border-amber-500 dark:border-amber-900 dark:text-amber-400'
                                                        : 'border-teal-200 text-teal-600 hover:bg-teal-600 hover:text-white hover:border-teal-600 dark:border-teal-900 dark:text-teal-400'
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => setLogTypeStep('type')} className="w-full py-2.5 rounded-xl bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-slate-200 font-semibold hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors">Back</button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* A failed play() used to be completely silent — the student tapped
                and nothing happened, with nothing to tell them to try again. */}
            {listenActive && audioFailed && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-2.5 rounded-2xl bg-slate-900/90 text-white text-sm font-semibold shadow-xl flex items-center gap-2">
                    <span>🔇</span>
                    <span>Couldn&apos;t start the recitation — tap the verse again.</span>
                </div>
            )}

            {/* ── Phone surah picker: vertical list, same colours as the pills ── */}
            {surahPickerOpen && (
                <div className="fixed inset-0 z-[200] flex items-end bg-black/50" onClick={() => setSurahPickerOpen(false)}>
                    <div
                        className="w-full max-h-[78vh] bg-white dark:bg-gray-800 rounded-t-3xl shadow-2xl flex flex-col"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-100 dark:border-gray-700">
                            <p className="font-black text-slate-800 dark:text-slate-100">Surahs</p>
                            <button
                                onClick={() => setSurahPickerOpen(false)}
                                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-gray-700 text-slate-500 dark:text-slate-300 font-bold"
                                aria-label="Close surah picker"
                            >✕</button>
                        </div>
                        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pt-2 space-y-1" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
                            {surahStatuses.map(({ id, name, transliteratedName, status, memStatus }) => (
                                <button
                                    key={id}
                                    id={`surah-pick-${id}`}
                                    onClick={() => { handleSurahSelection(id); setSurahPickerOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${getSurahNavButtonClass(id, status, memStatus)}`}
                                >
                                    <span className="font-mono text-xs w-7 text-start flex-shrink-0">{id}</span>
                                    <div className={`w-px h-4 flex-shrink-0 ${getDividerClass(id, status, memStatus)}`} />
                                    <span className="tracking-wide truncate">{transliteratedName}</span>
                                    <span className="ms-auto font-quranic text-lg leading-none flex-shrink-0" dir="rtl">{name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Recitation audio element (student portal + tutor listen mode) ── */}
            {listenActive && (
                <audio
                    ref={readOnlyAudioRef}
                    onEnded={() => {
                        // bin Humaid plays one file per surah — its end IS the surah's
                        // end, never a per-ayah boundary to chain across.
                        if (fullSurahRef.current) {
                            fullSurahRef.current = false;
                            readOnlySeqRef.current = false;
                            setReadOnlyAudioVerse(null);
                            return;
                        }
                        // Timed-surah (Al-Dukhain): the file ran out before the
                        // watcher's stop bound — end of playback, nothing to chain.
                        if (timedRef.current) {
                            timedRef.current = null;
                            readOnlySeqRef.current = false;
                            setReadOnlyAudioVerse(null);
                            return;
                        }
                        // Verse repeat (per-ayah reciters): replay the same file
                        // until it has played the chosen number of times.
                        if (readOnlyAudioVerse && repeatDoneRef.current < verseRepeatRef.current) {
                            repeatDoneRef.current += 1;
                            const a = readOnlyAudioRef.current;
                            if (a) {
                                try { a.currentTime = 0; } catch { /* not seekable */ }
                                a.play().catch(() => { /* superseded */ });
                                return;
                            }
                        }
                        // Sequential mode (started from an ayah number): advance to the
                        // next ayah until the surah ends, then stop.
                        if (readOnlySeqRef.current && readOnlyAudioVerse) {
                            const { surah, ayah } = readOnlyAudioVerse;
                            if (reciter === 'ustadh') {
                                // The tutor's recitation may have gaps — walk to
                                // the next RECORDED verse instead of blind +1.
                                const done = recManifest?.verses ?? {};
                                for (let a = ayah + 1; a <= versesInSurah(surah); a++) {
                                    if (done[`${surah}:${a}`]) { playVerse(surah, a, true); return; }
                                }
                            } else if (ayah < versesInSurah(surah)) {
                                playVerse(surah, ayah + 1, true);
                                return;
                            }
                        }
                        readOnlySeqRef.current = false;
                        setReadOnlyAudioVerse(null);
                    }}
                    // Safari resets playbackRate when a new source loads, so it is
                    // (re)applied once the media is actually running.
                    onPlaying={() => {
                        const a = readOnlyAudioRef.current;
                        if (a) { try { a.playbackRate = readOnlySpeed; } catch { /* ignore */ } }
                    }}
                    onError={() => {
                        // A 404/network error on the CDN never rejects play(), so it
                        // has to be caught here or the verse just sits silent.
                        if (!readOnlyAudioRef.current?.src?.startsWith('data:')) {
                            readOnlySeqRef.current = false;
                            setReadOnlyAudioVerse(null);
                            setAudioFailed(true);
                        }
                    }}
                    preload="none"
                    style={{ display: 'none' }}
                />
            )}
        </div>
    );
};

export default StudentProgressPage;
