// utils/quranWordCategories.ts
// -----------------------------------------------------------------------------
// Word categories for the Alphabet tab's word challenge.
//
// Every predicate here was derived from, and counted against, the app's OWN text
// source: all 6236 verses of api.quran.com/api/v4/quran/verses/uthmani (the
// endpoint getVersesForSurah uses), passed through splitVerseWords().
//
// THE ONE THING THAT BREAKS NAIVE RULES: splitVerseWords() rewrites every sukun
// U+0652 → U+06E1 (the khaa-head the Uthmani fonts draw), so `w.includes('ْ')`
// matches ZERO words on the path that reaches the UI. Every rule below therefore
// accepts both codepoints, which also keeps it correct on raw `text_uthmani` and
// on the Turkish path (splitVerseWords(t, true) keeps U+0652).
//
// The module is a REGISTRY: WORD_CATEGORIES lists every category with its arity
// (1 word or a 2-word pair) and its predicate. Adding the coming tajweed half is
// a matter of appending entries with group: 'tajweed' — the builder and the UI
// iterate the registry and need no change.
// -----------------------------------------------------------------------------

import { getVersesForSurah } from '../services/dataService';
import { splitVerseWords } from './quranicMarks';

// ─────────────────────────────────────────────────────────────────────────────
// Codepoints (all counts are occurrences in the 77,647-word Uthmani corpus)
// ─────────────────────────────────────────────────────────────────────────────
const FATHA        = 'َ'; // ARABIC FATHA               122948
const DAMMA        = 'ُ'; // ARABIC DAMMA                37320
const KASRA        = 'ِ'; // ARABIC KASRA                45970
const FATHATAN     = 'ً'; // ARABIC FATHATAN              3741
const DAMMATAN     = 'ٌ'; // ARABIC DAMMATAN              2519
const KASRATAN     = 'ٍ'; // ARABIC KASRATAN              2633
const SHADDA       = 'ّ'; // ARABIC SHADDA               22678
const SUKUN        = 'ْ'; // ARABIC SUKUN     (raw API)  37148 → rewritten
const SUKUN_KHAA   = 'ۡ'; // SMALL HIGH DOTLESS HEAD OF KHAH (what the UI sees)
const DAGGER_ALEF  = 'ٰ'; // ARABIC LETTER SUPERSCRIPT ALEF 9726
const SMALL_WAW    = 'ۥ'; //  1257      SMALL_YEH = U+06E6  957
const ALEF         = 'ا';
const ALEF_MAKSURA = 'ى';
const WAW          = 'و';
const YEH          = 'ي';
const WASLA        = 'ٱ'; // ARABIC LETTER ALEF WASLA    13483
const MADDAH       = 'ٓ'; // ARABIC MADDAH ABOVE          5376
const TA_MARBUTA   = 'ة'; //                              2344
const LAM          = 'ل';
const HEH          = 'ه';
const MEEM         = 'م';

const SHORT_VOWELS = FATHA + DAMMA + KASRA;
const TANWEEN      = FATHATAN + DAMMATAN + KASRATAN;
const VOWELS       = SHORT_VOWELS + TANWEEN;

/** Real Arabic letters. Excludes U+0640 tatweel (a mark carrier: مَـٰلِكِ) and the
 *  small waw/yeh U+06E5/U+06E6, which are marks, not letters. */
const LETTER_RE = /[ء-غف-يٱ]/;
/** Waqf signs U+06D6–U+06DC — splitVerseWords glues these onto the previous word. */
const WAQF_RE = /[ۖ-ۜ]/;
/** U+06D8 waqf lāzim — the one stop that is compulsory, not merely permitted. */
const WAQF_LAZIM = 'ۘ';

// ─────────────────────────────────────────────────────────────────────────────
// Letter matching (moved here from WordChallengePage so the builder is pure)
// ─────────────────────────────────────────────────────────────────────────────

/** Diacritics and connector marks — ignored when matching a chosen letter. */
const isMark = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed)
    || c === 0x0640 || c === 0x200c || c === 0x200d || c === 0x061c;
};

/** Alef/ya/waw/ha variants fold onto their base so "ا" matches أ إ آ ٱ.
 *  The dagger alef U+0670 is deliberately NOT here: it is a MARK, filtered by
 *  isMark above, and a word carrying one (ذَٰلِكَ, مَـٰلِكِ) shows no alef LETTER for the
 *  student to recognise. It is a madd, and the madd category is where it counts. */
const FOLD: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا',
  'ى': 'ي', 'ئ': 'ي', 'ؤ': 'و', 'ة': 'ه',
};

export const baseLettersOf = (word: string): string[] =>
  [...word].filter(ch => !isMark(ch)).map(ch => FOLD[ch] ?? ch).filter(ch => /[ء-ي]/.test(ch));

/** Does this word contain at least one of the chosen letters? */
export const wordHasAnyLetter = (word: string, letters: string[]): boolean => {
  const base = new Set(baseLettersOf(word));
  return letters.some(l => base.has(FOLD[l] ?? l));
};

/** A token that carries no Arabic letter: '' (110 surah-opening verses have a
 *  leading space in text_uthmani), U+06DE rub-el-hizb (199×), U+06E9 sajdah (15×).
 *  STANDALONE_WAQF_RE only merges U+06D6–U+06DC, so these survive the split. */
export const isQuranWord = (token: string): boolean => LETTER_RE.test(token);

const lastVowel = (s: string): string | null => {
  for (let i = s.length - 1; i >= 0; i--) if (VOWELS.includes(s[i])) return s[i];
  return null;
};
const lastLetter = (s: string): string => {
  for (let i = s.length - 1; i >= 0; i--) if (LETTER_RE.test(s[i])) return s[i];
  return '';
};

// ─────────────────────────────────────────────────────────────────────────────
// Letter/mark segmentation — "WHICH letter carries this mark?"
//
// `hasFatha(w)` answers "is there a fatha anywhere in this word", which is not
// what a tutor drilling "ب with a fatha" is asking: with letters = [ب], only 37%
// of the fatha pool, and 21% of the sukoon pool, carries the mark ON a ب
// (نَعۡبُدُ, بِسۡمِ …). The focus* predicates below answer the sharper question, and
// the builder PREFERS the words they accept — as a preference, never a filter,
// so a rare letter still gets a full run.
// ─────────────────────────────────────────────────────────────────────────────

interface LetterSpan {
  ch: string;
  /** Everything written on this letter, up to the next letter: harakat, tanween,
   *  sukoon, shadda, dagger alef, tatweel, waqf signs. */
  marks: string;
}

const letterSpans = (word: string): LetterSpan[] => {
  const out: LetterSpan[] = [];
  for (const ch of word) {
    if (LETTER_RE.test(ch)) out.push({ ch, marks: '' });
    else if (out.length > 0) out[out.length - 1].marks += ch;
  }
  return out;
};

/** A madd letter must be written BARE — same class as NOT_VOCALISED. */
const VOCALISED_RE = /[ً-ْ۟۠ۡ]/;
/** U+06DF / U+06E0: this letter is written but NOT pronounced (ءَامَنُوا۟). */
const SILENT_RE = /[۟۠]/;
/** A madd written as a mark on its own carrier: dagger alef, small waw/yeh. */
const MADD_MARK_RE = /[ٰۥۦۧ]/;

/** Is the letter at `i` the CARRIER of a long vowel? Returns how it is written:
 *  'mark'   — the madd rides on this letter (مَـٰلِكِ, بِهِۦ);
 *  'letter' — the madd is the NEXT letter (نَا, قُو, بِي);
 *  null     — no madd here. */
const maddKindAt = (toks: LetterSpan[], i: number): 'mark' | 'letter' | null => {
  if (MADD_MARK_RE.test(toks[i].marks)) return 'mark';
  const next = toks[i + 1];
  if (!next || VOCALISED_RE.test(next.marks)) return null;
  const v = toks[i].marks;
  if ((next.ch === ALEF || next.ch === ALEF_MAKSURA) && v.includes(FATHA)) return 'letter';
  if (next.ch === WAW && v.includes(DAMMA)) return 'letter';
  if ((next.ch === YEH || next.ch === ALEF_MAKSURA) && v.includes(KASRA)) return 'letter';
  return null;
};

/** Does one of the chosen letters CARRY this mark? */
const markOnChosenLetter = (word: string, letters: string[], mark: RegExp): boolean => {
  if (letters.length === 0) return false;
  const want = new Set(letters.map(l => FOLD[l] ?? l));
  return letterSpans(word).some(t => want.has(FOLD[t.ch] ?? t.ch) && mark.test(t.marks));
};

/** Is one of the chosen letters lengthened — as the carrier (بَا) or as the madd
 *  letter itself (the alef of بَا)? */
const longVowelOnChosenLetter = (word: string, letters: string[]): boolean => {
  if (letters.length === 0) return false;
  const want = new Set(letters.map(l => FOLD[l] ?? l));
  const toks = letterSpans(word);
  for (let i = 0; i < toks.length; i++) {
    const kind = maddKindAt(toks, i);
    if (!kind) continue;
    if (want.has(FOLD[toks[i].ch] ?? toks[i].ch)) return true;
    if (kind === 'letter' && want.has(FOLD[toks[i + 1].ch] ?? toks[i + 1].ch)) return true;
  }
  return false;
};

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-WORD PREDICATES  (counts = word tokens out of 77,647)
// ─────────────────────────────────────────────────────────────────────────────

/** FATHA U+064E only — 68,551 words (88.3%).
 *  Trap: FATHATAN U+064B is NOT a fatha; 444 words carry one and no U+064E at
 *  all (إِثۡمًا, إِذًا). A range test /[ً-َ]/ swallows all three tanweens. */
export const hasFatha = (word: string): boolean => word.includes(FATHA);

/** KASRA U+0650 only — 37,552 words (48.4%).
 *  Traps: KASRATAN U+064D is not a kasra (1,423 words have one and no U+0650).
 *  U+0655 hamza-below and U+0656 subscript alef never occur — hamza-below is the
 *  precomposed إ U+0625 plus a separate U+0650, which this predicate catches. */
export const hasKasra = (word: string): boolean => word.includes(KASRA);

/** DAMMA U+064F only — 29,391 words (37.9%).
 *  Traps: DAMMATAN U+064C is not a damma (1,954 words have one and no U+064F);
 *  U+0657 inverted damma never occurs; U+06E5 small waw follows a real damma in
 *  1,256 of its 1,257 occurrences, so it needs no clause of its own. */
export const hasDamma = (word: string): boolean => word.includes(DAMMA);

/** Nothing vocalic may follow a madd letter — it must be written BARE.
 *  U+06E1 has to be in this class explicitly: it sits OUTSIDE U+064B–U+0652, so
 *  a lookahead without it lets شَىۡءٍ (a leen diphthong) pass as a false madd. */
const NOT_VOCALISED = '(?![\\u064B-\\u0652\\u06DF\\u06E0\\u06E1])';
const LONG_VOWEL_RE = new RegExp(
    '[\\u0670\\u06E5\\u06E6\\u06E7]'               // dagger alef / small waw / small yeh / small high yeh
  + '|\\u064E[\\u0627\\u0649]' + NOT_VOCALISED     // fatha + alef | alef maksura
  + '|\\u064F\\u0648'          + NOT_VOCALISED     // damma + waw
  + '|\\u0650[\\u064A\\u0649]' + NOT_VOCALISED     // kasra + yeh  | alef maksura
);                                                 // no /g flag: .test() must stay stateless

/** LONG VOWEL / madd — 43,562 words (56.1%).
 *  Anchored on the PRECEDING short vowel, never on "the letter is bare": 20 other
 *  letters appear bare in this text (lam 5,393 in ٱللَّهِ, noon 5,139 in يُنفِقُونَ,
 *  meem 1,308 in هُم …), and a madd letter never carries a written sukoon (waw
 *  after damma bearing U+06E1 = 0 occurrences).
 *  The lookahead is load-bearing: without it أُو۟لَـٰٓئِكَ (U+06DF = silent waw, 255×),
 *  إِيَّاكَ (shadda on the yeh), شَىۡءٍ and أَنَا۠ all count as false madds.
 *  Alef wasla U+0671 is deliberately absent — it follows a fatha 2,087× (وَٱللَّهُ)
 *  but is elided. U+0622 alef-with-madda never occurs; madd-over-hamza is written
 *  U+0627 U+0653, and U+0653 is NOT a blocker (جَآءَ is a genuine, longer madd).
 *  U+0670 counts by presence alone: all 9,726 are a long /aː/. */
export const hasLongVowel = (word: string): boolean => LONG_VOWEL_RE.test(word);

/** SHADDA U+0651 only — 21,700 words (27.9%). No presentation forms (U+FE7C/FE7D)
 *  exist in this corpus. Order is base → shadda → vowel, so `includes` is safe. */
export const hasShadda = (word: string): boolean => word.includes(SHADDA);

/** SUKOON — 31,254 words (40.3%). Both codepoints, see the header note.
 *  U+06DF small high rounded zero (3,988×) and U+06E0 (66×) are NOT sukoons:
 *  they mark a letter that is NOT pronounced (ءَامَنُوا۟, أُو۟لَـٰٓئِكَ) — the opposite. */
export const hasSukoon = (word: string): boolean =>
  word.includes(SUKUN) || word.includes(SUKUN_KHAA);

/** TANWEEN — 8,893 words. Exactly three codepoints exist; there is NO separate
 *  iqlab/ikhfa tanween codepoint — the variant is an ordinary tanween followed by
 *  a small meem, U+06E2 above (247 words: أَلِيمٌۢ) or U+06ED below (99 words:
 *  كَافِرٍۭ) — so matching the tanween picks those up for free. */
export const hasTanween = (word: string): boolean => /[ً-ٍ]/.test(word);

/** Everything allowed to trail a word-final tanween: the silent alef/alef-maksura
 *  of ـًا / ـًى, the iqlab meems U+06E2/U+06ED, the silent-letter zeros
 *  U+06DF/U+06E0, and waqf signs. */
const TANWEEN_TAIL_RE = /^[اىۭۢ۟۠ۖ-ۜ]*$/;

/** The tanween is NOT the last character in 3,159 of the 8,893 words. Never write
 *  `w.endsWith(tanween)`. Measured: this is true for 8,893 of 8,893 — every
 *  tanween in the Quran is word-final in sound. */
export const endsWithTanween = (word: string): boolean => {
  let t = -1;
  for (let i = 0; i < word.length; i++) if (TANWEEN.includes(word[i])) t = i;
  return t >= 0 && TANWEEN_TAIL_RE.test(word.slice(t + 1));
};

// ─────────────────────────────────────────────────────────────────────────────
// TWO-WORD PREDICATES — the phenomenon only exists across the join, so the item
// must show BOTH words.
// ─────────────────────────────────────────────────────────────────────────────

/** HAMZAT AL-WASL — 10,538 pairs. wordB opens with U+0671, the only encoding this
 *  text uses (13,483×). Word-INITIAL only: 2,679 waṣls sit inside a word (بِٱللَّهِ)
 *  and are always elided, teaching nothing about the join. The muqaṭṭaʿāt الٓمٓ /
 *  الٓرۚ start with a BARE U+0627 and are not waṣl — a "starts with alef" rule eats
 *  them. The istifhām form writes it U+0627 U+0653 instead (ءَآللَّهُ, 6 words).
 *  Waqf lāzim U+06D8 on wordA is excluded (3 pairs: 6:20 أَبۡنَآءَهُمُۘ ٱلَّذِينَ, 6:124,
 *  7:148): there the reader MUST stop, so the waṣl is begun with a full hamza —
 *  the opposite of the rule being drilled. The other stop signs are optional, and
 *  reading the pair joined stays correct. */
export const isHamzatWaslPair = (a: string, b: string): boolean =>
  isQuranWord(a) && b.startsWith(WASLA) && !a.includes(WAQF_LAZIM);

/** TA MARBUTA — 1,937 drillable pairs. wordA's last LETTER is ة (word-final in
 *  100% of its 2,344 occurrences) — but never its last CHARACTER: a haraka/tanween
 *  always follows, so `endsWith('ة')` is false every time.
 *  The pair is the item because the drill is the /t/ reading in continuation; the
 *  285 pairs whose wordA carries a waqf sign (2:7 غِشَـٰوَةٌۖ وَلَهُمۡ) are dropped, because
 *  stopping there is legitimate and then the ة is read /h/ — the tutor would have
 *  no way to say which of the two readings "Correct" meant. */
export const isTaMarbutaPair = (a: string, b: string): boolean =>
  lastLetter(a) === TA_MARBUTA && isQuranWord(b) && !WAQF_RE.test(a);

/** wordA's last PRONOUNCED sound is a madd letter — the first of the two saakins
 *  in ٱهۡدِنَا ٱلصِّرَٰطَ, and the one that gets DROPPED (ḥadhf ḥarf al-madd).
 *  Three ways the muṣḥaf writes it:
 *    · a mark on its carrier — مُوسَىٰ (dagger alef), بِهِۦ (small yeh, the ṣilah);
 *    · a bare ا/ى/و/ي after the matching short vowel — ٱهۡدِنَا, فِى, وَقُودُهَا;
 *    · the same, behind a silent letter — لَقُوا۟, where the alef carries U+06DF and
 *      is not read, so the madd is the waw before it.
 *  ى is checked against BOTH fatha (عَلَى /aː/) and kasra (ٱلَّذِى /iː/). */
export const endsWithMaddLetter = (a: string): boolean => {
  const toks = letterSpans(a);
  let i = toks.length - 1;
  while (i >= 0 && SILENT_RE.test(toks[i].marks)) i--;
  if (i < 0) return false;
  const t = toks[i];
  if (MADD_MARK_RE.test(t.marks)) return true;
  if (i === 0 || VOCALISED_RE.test(t.marks)) return false;
  const pv = toks[i - 1].marks;
  if (t.ch === ALEF) return pv.includes(FATHA);
  if (t.ch === ALEF_MAKSURA) return pv.includes(FATHA) || pv.includes(KASRA);
  if (t.ch === WAW) return pv.includes(DAMMA);
  if (t.ch === YEH) return pv.includes(KASRA);
  return false;
};

/** ILTIQAA AS-SAKINAYN — 2,699 drillable pairs.
 *  wordB opens with hamzat al-waṣl, which is dropped in continuation and exposes
 *  the saakin underneath (the lam-sukun of ٱلْ, the shadda of a shamsiyya, or a
 *  verb's ٱسْـ/ٱنْـ). That waṣl is the ONLY generator of the second saakin in this
 *  text: 0 words begin with an explicit sukoon without one.
 *  wordA supplies the FIRST saakin, and it does so in two ways — both are the
 *  textbook cases and the item is labelled with which one it is:
 *    'madd'    2,666 pairs — a madd letter, dropped:  ٱهۡدِنَا ٱلصِّرَٰطَ (1:6);
 *    'tanween'    33 pairs — the noon of a tanween, which then takes a kasra:
 *                            بِغُلَـٰمٍ ٱسۡمُهُۥ (3:39).
 *  Only the tanween half shipped first, so the category served 1.2% of itself and
 *  a 20-item run showed 62% of every instance that exists (32 distinct items in all;
 *  there are now 1,221). */
export const isIltiqaaSakinaynPair = (a: string, b: string): boolean => {
  if (!b.startsWith(WASLA)) return false;
  return endsWithTanween(a) || endsWithMaddLetter(a);
};

/** Drop the pairs whose wordA carries a waqf sign — including 7:148
 *  سَبِيلًاۘ ٱتَّخَذُوهُ with U+06D8 waqf lāzim, where the reader stops and the two
 *  saakins never meet. */
export const isIltiqaaSakinaynDrillPair = (a: string, b: string): boolean =>
  isIltiqaaSakinaynPair(a, b) && !WAQF_RE.test(a);

/** Which of the two saakins wordA supplies — the item's sub-label. */
export const iltiqaaVariant = (a: string): 'tanween' | 'madd' =>
  endsWithTanween(a) ? 'tanween' : 'madd';

// ── LAFZ AL-JALALAH ───────── 2,704 words = 2,124 pairs + 546 internal + 34 ──
/** The jalālah core carries no dagger alef here: U+0644 U+0651 U+064E U+0647. */
const JALALAH_CORE = LAM + SHADDA + FATHA + HEH;

/** Index of the shadda-bearing lam of الله in `w`, or -1. Accepts the three
 *  written bodies: ٱللَّه (article waṣl), ءَآللَّه (istifhām madd, 10:59 & 27:59) and
 *  لِلَّه / لِّلَّه (the li- prefix, where the waṣl and one lam are dropped).
 *  Rejects لَعَلَّهُم, كُلَّهَا, مَحِلَّهُۥ … (161 words) and — via the ending test — the two
 *  words a looser rule always gets wrong: ٱللَّهَبِ (111:3) and ٱللَّهۡوِ (31:6). */
const jalalahCoreIndex = (w: string): number => {
  const i = w.indexOf(JALALAH_CORE);
  if (i < 0) return -1;
  const pre = w.slice(0, i);
  const body =
    pre.endsWith(WASLA + LAM) ||
    pre.endsWith(ALEF + MADDAH + LAM) ||
    pre.endsWith(LAM + KASRA) ||
    pre.endsWith(LAM + SHADDA + KASRA);
  if (!body) return -1;
  const rest = w.slice(i + JALALAH_CORE.length);
  if (!rest || !SHORT_VOWELS.includes(rest[0])) return -1;          // the heh's own vowel
  let tail = rest.slice(1);
  if (tail.startsWith(MEEM + SHADDA + FATHA)) tail = tail.slice(3); // ٱللَّهُمَّ
  return /^[ۖ-ۜ]*$/.test(tail) ? i : -1;
};

export const hasLafzAlJalalah = (w: string): boolean => jalalahCoreIndex(w) >= 0;

export type JalalahWeight = 'heavy' | 'light';

/** HEAVY (tafkhīm) after fatha/damma, LIGHT (tarqīq) after kasra.
 *  The governing vowel is the one immediately before the jalālah body, so it comes
 *  from wordB ITSELF whenever wordB carries a prefix (بِٱللَّهِ light, وَٱللَّهُ heavy,
 *  لِلَّهِ light) and only otherwise from the end of wordA. Anchoring on wordB's first
 *  lam instead is the classic bug: it makes ٱلۡحَمۡدُ لِلَّهِ (1:2) come out heavy.
 *  The vowel that governs is the one actually PRONOUNCED at the join: when wordA
 *  ends in a tanween and wordB is waṣl-initial, the two saakins meet and the
 *  tanween's noon takes a KASRA, so the lam is light however the tanween is
 *  written — قَوۡمًاۙ ٱللَّهُ (7:164) is "qawman-illāhu", tarqīq, and so is خَيۡرًاۖ ٱللَّهُ
 *  (11:31). Reading the written fathatan/dammatan instead made both heavy. */
export const jalalahWeight = (a: string, b: string): JalalahWeight | null => {
  const i = jalalahCoreIndex(b);
  if (i < 0) return null;
  const inB = lastVowel(b.slice(0, i));
  if (inB === null && b.startsWith(WASLA) && endsWithTanween(a)) return 'light';
  const v = inB ?? lastVowel(a);
  if (v === null) return null;
  return v === KASRA || v === KASRATAN ? 'light' : 'heavy';
};

/** The 2,124 pairs where wordA actually decides the weight — the only ones worth
 *  showing as a two-word item. */
export const isJalalahPair = (a: string, b: string): boolean => {
  const i = jalalahCoreIndex(b);
  return i >= 0 && lastVowel(b.slice(0, i)) === null && lastVowel(a) !== null;
};

// ─────────────────────────────────────────────────────────────────────────────
// THE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export type CategoryId =
  | 'fatha' | 'kasra' | 'damma' | 'longVowel' | 'shadda' | 'sukoon' | 'tanween'
  | 'hamzatWasl' | 'taMarbuta' | 'iltiqaa' | 'jalalah';

/** 'letters' = the plain rule (any word containing a chosen letter) used when no
 *  category is picked and as the builder's last-resort top-up. */
export type ItemCategoryId = CategoryId | 'letters';

export interface WordCategory {
  id: CategoryId;
  /** 'basic' = reading. The tajweed half appends group: 'tajweed' entries here. */
  group: 'basic' | 'tajweed';
  /** 1 = one word; 2 = two consecutive words of the same verse. */
  arity: 1 | 2;
  matchWord?: (word: string) => boolean;
  matchPair?: (a: string, b: string) => boolean;
  /** Optional sub-label for an item, e.g. the jalālah's heavy/light. */
  variantOf?: (words: string[]) => string | null;
  /** True when a CHOSEN letter is the one carrying this category's mark. The
   *  builder prefers these words; it never requires them, so a rare letter still
   *  gets a full run out of the plain "contains the letter" match. */
  focusWord?: (word: string, letters: string[]) => boolean;
}

export const WORD_CATEGORIES: readonly WordCategory[] = [
  { id: 'fatha',      group: 'basic', arity: 1, matchWord: hasFatha,
    focusWord: (w, ls) => markOnChosenLetter(w, ls, /[َ]/) },
  { id: 'kasra',      group: 'basic', arity: 1, matchWord: hasKasra,
    focusWord: (w, ls) => markOnChosenLetter(w, ls, /[ِ]/) },
  { id: 'damma',      group: 'basic', arity: 1, matchWord: hasDamma,
    focusWord: (w, ls) => markOnChosenLetter(w, ls, /[ُ]/) },
  { id: 'longVowel',  group: 'basic', arity: 1, matchWord: hasLongVowel,
    focusWord: longVowelOnChosenLetter },
  { id: 'shadda',     group: 'basic', arity: 1, matchWord: hasShadda,
    focusWord: (w, ls) => markOnChosenLetter(w, ls, /[ّ]/) },
  { id: 'sukoon',     group: 'basic', arity: 1, matchWord: hasSukoon,
    focusWord: (w, ls) => markOnChosenLetter(w, ls, /[ْۡ]/) },
  { id: 'tanween',    group: 'basic', arity: 1, matchWord: hasTanween,
    focusWord: (w, ls) => markOnChosenLetter(w, ls, /[ً-ٍ]/) },
  { id: 'hamzatWasl', group: 'basic', arity: 2, matchPair: isHamzatWaslPair },
  { id: 'taMarbuta',  group: 'basic', arity: 2, matchPair: isTaMarbutaPair },
  {
    id: 'iltiqaa', group: 'basic', arity: 2, matchPair: isIltiqaaSakinaynDrillPair,
    variantOf: ws => (ws.length === 2 ? iltiqaaVariant(ws[0]) : null),
  },
  {
    id: 'jalalah', group: 'basic', arity: 2, matchPair: isJalalahPair,
    variantOf: ws => (ws.length === 2 ? jalalahWeight(ws[0], ws[1]) : null),
  },
] as const;

export const CATEGORY_IDS: readonly CategoryId[] = WORD_CATEGORIES.map(c => c.id);

const CATEGORY_BY_ID = new Map<CategoryId, WordCategory>(WORD_CATEGORIES.map(c => [c.id, c]));
export const categoryById = (id: CategoryId): WordCategory | undefined => CATEGORY_BY_ID.get(id);

// ─────────────────────────────────────────────────────────────────────────────
// THE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

export interface ChallengeItem {
  /** 1 word, or 2 CONSECUTIVE words of the same verse for an arity-2 category. */
  words: string[];
  category: ItemCategoryId;
  /** e.g. 'heavy' | 'light' for the jalālah. */
  variant?: string;
  /** True when no match containing a chosen letter existed and the letter filter
   *  had to be dropped for this item. */
  relaxed?: boolean;
}

export interface CategoryReport {
  id: CategoryId;
  /** Items asked of this category. */
  wanted: number;
  /** Items it actually contributed. */
  used: number;
  /** At least one item ignored the chosen letters. */
  relaxed: boolean;
  /** Nothing at all was found for it — the UI must say so. */
  empty: boolean;
}

export interface ChallengeBuild {
  items: ChallengeItem[];
  reports: CategoryReport[];
  /** Surahs actually scanned — the bound that makes the search terminate. */
  scanned: number;
}

type VerseLike = { text_uthmani: string };
export type VerseFetcher = (surah: number) => Promise<VerseLike[]>;

const SURAH_COUNT = 114;
/** Surahs fetched per round trip. The whole run is bounded by SURAH_COUNT. */
const SCAN_BATCH = 8;
/** Per-TIER cap: a tier never needs more than a few runs' worth of choices.
 *  Capping the tiers TOGETHER was a real bug: the letter-ignoring matches, which
 *  are ~30× more numerous, filled the cap first and locked the on-letter matches
 *  out. letters = [ظ] then served 17% of its items from the chosen letter even
 *  though 247 qualifying ظ words exist, and scanned all 114 surahs to do it. */
const POOL_CAP = 240;

const shuffle = <T,>(arr: T[], rnd: () => number): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Same word, any spelling → once. Pairs key on both words. */
const itemKey = (words: string[]): string => words.map(w => baseLettersOf(w).join('')).join('|');

/** Three tiers, best first:
 *  focus  — a chosen letter carries the category's mark  (ب in بَعۡدِ for 'fatha')
 *  strict — the word contains a chosen letter            (ب in نَعۡبُدُ)
 *  loose  — no chosen letter at all; only used as a last resort, and flagged. */
type Tier = 'focus' | 'strict' | 'loose';
interface Pool { focus: ChallengeItem[]; strict: ChallengeItem[]; loose: ChallengeItem[]; keys: Set<string>; }
const emptyPool = (): Pool => ({ focus: [], strict: [], loose: [], keys: new Set() });

const push = (pool: Pool, item: ChallengeItem, tier: Tier): void => {
  if (pool[tier].length >= POOL_CAP) return;
  const k = itemKey(item.words);
  if (pool.keys.has(k)) return;
  pool.keys.add(k);
  pool[tier].push(tier === 'loose' ? { ...item, relaxed: true } : item);
};

export interface BuildOptions {
  letters: string[];
  categories?: CategoryId[];
  count?: number;
  /** Injectable for tests; defaults to the app's cached surah fetcher. */
  fetchVerses?: VerseFetcher;
  /** Injectable for deterministic tests. */
  random?: () => number;
}

/**
 * Build one run's items.
 *
 * Termination is structural: the search walks a SHUFFLED list of the 114 surahs
 * and stops when the list is exhausted, so no configuration can hang — a category
 * with no match anywhere simply reports empty. Quotas are shared out evenly; a
 * category serves its share from the best tier it can fill (see Pool), then hands
 * the shortfall to the other selected categories, and finally to the plain letter
 * rule. The scan stops once every category has enough ON-LETTER matches; the
 * sharper focus tier is a preference, never something the scan waits for, so a
 * rare letter costs no extra round trips.
 */
export async function buildChallengeItems(opts: BuildOptions): Promise<ChallengeBuild> {
  const letters = opts.letters ?? [];
  const count = opts.count ?? 20;
  const rnd = opts.random ?? Math.random;
  const fetchVerses = opts.fetchVerses ?? (getVersesForSurah as unknown as VerseFetcher);
  const cats = (opts.categories ?? []).filter(id => CATEGORY_BY_ID.has(id));

  if (count <= 0) return { items: [], reports: [], scanned: 0 };
  // Nothing to match against: the letter rule can never succeed, and every
  // category would be run with the filter permanently relaxed. Bail out instead
  // of burning 114 fetches.
  if (letters.length === 0 && cats.length === 0) return { items: [], reports: [], scanned: 0 };

  // Quotas: floor share, remainder to a random subset so no category is favoured.
  const quota = new Map<CategoryId, number>();
  if (cats.length > 0) {
    const base = Math.floor(count / cats.length);
    let rest = count - base * cats.length;
    for (const id of shuffle(cats, rnd)) {
      quota.set(id, base + (rest > 0 ? 1 : 0));
      if (rest > 0) rest--;
    }
  }

  const pools = new Map<CategoryId, Pool>(cats.map(id => [id, emptyPool()]));
  const plain = emptyPool();

  // No letters chosen = no letter filter, rather than a filter nothing can pass.
  // Before, wordHasAnyLetter(w, []) was false for every word, so the plain pool
  // could never fill, satisfied() never returned true, and a categories-only run
  // fetched all 114 surahs and then flagged all 20 items "outside your letters".
  const noFilter = letters.length === 0;
  const hasLetter = (w: string): boolean => noFilter || wordHasAnyLetter(w, letters);

  const satisfied = (): boolean => {
    if (cats.length === 0) return plain.strict.length >= count;
    for (const id of cats) {
      const p = pools.get(id)!;
      if (p.focus.length + p.strict.length < (quota.get(id) ?? 0)) return false;
    }
    return plain.strict.length >= count;   // enough for the last-resort top-up too
  };

  const scanVerse = (text: string): void => {
    const words = splitVerseWords(text).filter(isQuranWord);
    for (const w of words) {
      if (baseLettersOf(w).length >= 3 && hasLetter(w)) {
        push(plain, { words: [w], category: 'letters' }, 'strict');
      }
    }
    for (const id of cats) {
      const cat = CATEGORY_BY_ID.get(id)!;
      const pool = pools.get(id)!;
      if (cat.arity === 1 && cat.matchWord) {
        for (const w of words) {
          if (baseLettersOf(w).length < 3) continue;   // a 2-letter particle is no challenge
          if (!cat.matchWord(w)) continue;
          const tier: Tier = !hasLetter(w) ? 'loose'
            : cat.focusWord?.(w, letters) ? 'focus' : 'strict';
          push(pool, { words: [w], category: id }, tier);
        }
      } else if (cat.arity === 2 && cat.matchPair) {
        for (let i = 0; i < words.length - 1; i++) {
          const a = words[i], b = words[i + 1];
          if (!cat.matchPair(a, b)) continue;
          const variant = cat.variantOf?.([a, b]) ?? undefined;
          // A pair is about the join, so there is no focus tier: either word
          // carrying a chosen letter is as on-topic as the drill gets.
          const tier: Tier = hasLetter(a) || hasLetter(b) ? 'strict' : 'loose';
          push(pool, { words: [a, b], category: id, ...(variant ? { variant } : {}) }, tier);
        }
      }
    }
  };

  // ── bounded scan ──────────────────────────────────────────────────────────
  const order = shuffle(Array.from({ length: SURAH_COUNT }, (_, i) => i + 1), rnd);
  let scanned = 0;
  for (let i = 0; i < order.length && !satisfied(); i += SCAN_BATCH) {
    const batch = order.slice(i, i + SCAN_BATCH);
    const results = await Promise.all(batch.map(s => fetchVerses(s).catch(() => [] as VerseLike[])));
    scanned += batch.length;
    for (const verses of results) for (const v of verses) scanVerse(v.text_uthmani);
  }

  // ── selection ─────────────────────────────────────────────────────────────
  const items: ChallengeItem[] = [];
  const used = new Set<string>();
  const take = (list: ChallengeItem[], n: number): number => {
    let got = 0;
    for (const it of list) {
      if (got >= n || items.length >= count) break;
      const k = itemKey(it.words);
      if (used.has(k)) continue;
      used.add(k);
      items.push(it);
      got++;
    }
    return got;
  };

  const reports: CategoryReport[] = [];
  if (cats.length === 0) {
    take(shuffle(plain.strict, rnd), count);
  } else {
    const shuffled = new Map<CategoryId, Pool>(
      cats.map(id => {
        const p = pools.get(id)!;
        return [id, {
          focus: shuffle(p.focus, rnd), strict: shuffle(p.strict, rnd),
          loose: shuffle(p.loose, rnd), keys: p.keys,
        }];
      }),
    );
    for (const id of cats) {
      const want = quota.get(id) ?? 0;
      const p = shuffled.get(id)!;
      const focusGot = take(p.focus, want);
      const strictGot = focusGot < want ? take(p.strict, want - focusGot) : 0;
      const onLetter = focusGot + strictGot;
      const looseGot = onLetter < want ? take(p.loose, want - onLetter) : 0;
      reports.push({
        id, wanted: want, used: onLetter + looseGot,
        relaxed: looseGot > 0,
        empty: onLetter + looseGot === 0,
      });
    }
    // Top up: the other selected categories first (still on-topic), then the
    // plain letter rule, so a short run never happens because one category is rare.
    for (const pass of ['focus', 'strict', 'loose'] as const) {
      for (const id of cats) {
        if (items.length >= count) break;
        const before = items.length;
        const got = take(shuffled.get(id)![pass], count - items.length);
        if (got > 0) {
          const r = reports.find(x => x.id === id)!;
          r.used += items.length - before;
          if (pass === 'loose') r.relaxed = true;
          r.empty = false;
        }
      }
    }
    if (items.length < count) take(shuffle(plain.strict, rnd), count - items.length);
  }

  return { items: shuffle(items, rnd), reports, scanned };
}

/**
 * Back-compatible plain-letter builder: N distinct words containing the chosen
 * letters, 3+ base letters each.
 */
export async function buildWordItems(letters: string[], count = 20): Promise<string[]> {
  if (letters.length === 0) return [];
  const built = await buildChallengeItems({ letters, count });
  return built.items.map(it => it.words.join(' '));
}
