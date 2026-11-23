// services/tajweedColorService.ts
// -----------------------------------------------------------------------------
// Tajweed color-coding engine for the live Quran reader.
//
// Analyzes a verse of Madani Uthmani text (api.quran.com `text_uthmani`) and
// assigns at most one tajweed rule to each *letter unit* (one base Arabic
// letter + its trailing combining marks — the same segmentation the reader
// uses for per-letter tap targets).
//
// The rule model and colors mirror Quran.com's tajweed script (QPC/Tarteel
// `uthmani_tajweed` classes). The Madani orthography itself encodes most
// rules: an UNMARKED nūn/mīm signals assimilation (ikhfā/idghām), U+06E2
// small-high-mīm signals iqlāb, a shadda on the following letter signals
// complete idghām, U+0653 maddah signals the 4-6 count madds, U+06DF marks
// silent letters, and so on.
//
// Validated against Quran.com's own annotations on 681 verses spanning 13
// surahs (7,884 labeled letter units): 99.87% agreement, plus four deliberate,
// pedagogy-driven divergences from their raw data: distinct colors for the two
// idghām kinds, ghunnah on verse-initial نّ/مّ (the idghām continues across the
// verse break), izhār (uncolored) at the 75:27 saktah, and U+06E0 marked silent.
// -----------------------------------------------------------------------------

export type TajweedRule =
  | 'ghunnah'
  | 'ikhafa'
  | 'ikhafa_shafawi'
  | 'idgham_ghunnah'
  | 'idgham_wo_ghunnah'
  | 'idgham_shafawi'
  | 'idgham_mutajanisayn'
  | 'idgham_mutaqaribayn'
  | 'iqlab'
  | 'qalaqah'
  | 'madda_normal'
  | 'madda_permissible'
  | 'madda_necessary'
  | 'madda_obligatory'
  | 'ham_wasl'
  | 'laam_shamsiyah'
  | 'slnt'
  /** Display-only: never returned by analyzeVerseTajweed. The letters of madd
   *  themselves (findMaddLetters), shown in a colour of their own. */
  | 'madd_letter';

export interface TajweedRuleMeta {
  label: string;      // legend label (English)
  labelAr: string;    // legend label (Arabic)
  color: string;      // light-mode text color (QPC tajweed palette)
  colorDark: string;  // dark-mode variant (lightened for contrast)
}

export const TAJWEED_RULES: Record<TajweedRule, TajweedRuleMeta> = {
  ghunnah:             { label: 'Ghunnah',                labelAr: 'غُنَّة',            color: '#FF7E1E', colorDark: '#FF9A4D' },
  ikhafa:              { label: 'Ikhfa',                  labelAr: 'إخفاء',            color: '#9400A8', colorDark: '#D45BE5' },
  ikhafa_shafawi:      { label: 'Ikhfa Shafawi',          labelAr: 'إخفاء شفوي',       color: '#D500B7', colorDark: '#F35BDE' },
  idgham_ghunnah:      { label: 'Idgham (with ghunnah)',  labelAr: 'إدغام بغنة',       color: '#169777', colorDark: '#35C79F' },
  idgham_wo_ghunnah:   { label: 'Idgham (no ghunnah)',    labelAr: 'إدغام بلا غنة',    color: '#169200', colorDark: '#4BC72E' },
  idgham_shafawi:      { label: 'Idgham Shafawi',         labelAr: 'إدغام شفوي',       color: '#58B800', colorDark: '#7EDC2A' },
  idgham_mutajanisayn: { label: 'Idgham Mutajanisayn',    labelAr: 'إدغام متجانسين',   color: '#A1A1A1', colorDark: '#BDBDBD' },
  idgham_mutaqaribayn: { label: 'Idgham Mutaqaribayn',    labelAr: 'إدغام متقاربين',   color: '#A1A1A1', colorDark: '#BDBDBD' },
  iqlab:               { label: 'Iqlab',                  labelAr: 'إقلاب',            color: '#26BFFD', colorDark: '#5FD1FF' },
  qalaqah:             { label: 'Qalqalah',               labelAr: 'قلقلة',            color: '#DD0008', colorDark: '#FF5A60' },
  madda_normal:        { label: 'Madd (2 counts)',        labelAr: 'مد طبيعي',         color: '#537FFF', colorDark: '#7D9DFF' },
  madda_permissible:   { label: 'Madd (2, 4, 6)',         labelAr: 'مد عارض',          color: '#4050FF', colorDark: '#7580FF' },
  madda_necessary:     { label: 'Madd (6 counts)',        labelAr: 'مد لازم',          color: '#000EBC', colorDark: '#5B67F1' },
  madda_obligatory:    { label: 'Madd (4-5 counts)',      labelAr: 'مد واجب',          color: '#2144C1', colorDark: '#6486F0' },
  ham_wasl:            { label: 'Hamzat Wasl (silent)',   labelAr: 'همزة وصل',         color: '#AAAAAA', colorDark: '#8A8A8A' },
  laam_shamsiyah:      { label: 'Silent Lam (sun letters)', labelAr: 'لام شمسية',      color: '#AAAAAA', colorDark: '#8A8A8A' },
  slnt:                { label: 'Silent letter',          labelAr: 'حرف لا يُنطق',     color: '#AAAAAA', colorDark: '#8A8A8A' },
  madd_letter:         { label: 'Madd letters',           labelAr: 'حروف المد',        color: '#E6007E', colorDark: '#FF4FA8' },
};

// Short, teacher-facing explanation of each rule (English + Arabic) for the
// "what do these colors mean?" info panel.
export const TAJWEED_DESCRIPTIONS: Record<TajweedRule, { en: string; ar: string }> = {
  ghunnah:             { en: 'Nasal sound held ~2 counts on a doubled ن or م.',                 ar: 'غُنّة بمقدار حركتين على النون أو الميم المشدّدة.' },
  ikhafa:              { en: 'Nūn sākinah / tanwīn hidden with light nasalization before 15 letters.', ar: 'إخفاء النون الساكنة والتنوين مع غُنّة عند خمسة عشر حرفاً.' },
  ikhafa_shafawi:      { en: 'Mīm sākinah hidden with nasalization before ب.',                    ar: 'إخفاء الميم الساكنة عند حرف الباء.' },
  idgham_ghunnah:      { en: 'Nūn / tanwīn merged into ي و م ن with nasalization.',              ar: 'إدغام بغُنّة في حروف (يَنْمُو).' },
  idgham_wo_ghunnah:   { en: 'Nūn / tanwīn merged into ل ر without nasalization.',                ar: 'إدغام بلا غُنّة في اللام والراء.' },
  idgham_shafawi:      { en: 'Mīm sākinah merged into a following م.',                            ar: 'إدغام الميم الساكنة في الميم.' },
  idgham_mutajanisayn: { en: 'Two letters of the same articulation point assimilate.',           ar: 'إدغام حرفين من مخرج واحد (متجانسين).' },
  idgham_mutaqaribayn: { en: 'Two letters of close articulation points assimilate.',             ar: 'إدغام حرفين متقاربين في المخرج.' },
  iqlab:               { en: 'Nūn / tanwīn turns into a hidden mīm before ب.',                    ar: 'قلب النون الساكنة والتنوين ميماً عند الباء.' },
  qalaqah:             { en: 'Echoing bounce on ق ط ب ج د when sākin.',                            ar: 'قلقلة حروف (قُطْبُ جَدٍّ) عند سكونها.' },
  madda_normal:        { en: 'Natural prolongation of 2 counts.',                                 ar: 'مدّ طبيعي بمقدار حركتين.' },
  madda_permissible:   { en: 'Prolongation at a stop — 2, 4 or 6 counts.',                        ar: 'مدّ عارض للسكون (2 أو 4 أو 6 حركات).' },
  madda_necessary:     { en: 'Obligatory prolongation of 6 counts.',                              ar: 'مدّ لازم بمقدار ست حركات.' },
  madda_obligatory:    { en: 'Prolongation before a hamza — 4 to 5 counts.',                      ar: 'مدّ واجب متصل (4 إلى 5 حركات).' },
  ham_wasl:            { en: 'Connecting hamza — silent when continuing from before.',            ar: 'همزة وصل تسقط عند الوصل.' },
  laam_shamsiyah:      { en: 'Lām not pronounced before a sun letter.',                           ar: 'لام شمسية لا تُنطق.' },
  slnt:                { en: 'A written letter that is not pronounced.',                           ar: 'حرف يُكتب ولا يُنطق.' },
  madd_letter:         { en: 'Alif, waw and ya with no vowel, and the small alif, waw and ya.',     ar: 'الألف والواو والياء الساكنة، والألف والواو والياء الصغيرة.' },
};

// Legend display order: pronunciation rules first, silent/gray last.
export const TAJWEED_LEGEND_ORDER: TajweedRule[] = [
  'ghunnah', 'ikhafa', 'ikhafa_shafawi', 'idgham_ghunnah', 'idgham_wo_ghunnah',
  'idgham_shafawi', 'iqlab', 'qalaqah', 'madd_letter', 'madda_normal', 'madda_permissible',
  'madda_obligatory', 'madda_necessary', 'idgham_mutajanisayn', 'idgham_mutaqaribayn',
  'ham_wasl', 'laam_shamsiyah', 'slnt',
];

// ── Unicode inventory of the Madani Uthmani encoding ─────────────────────────
const SUKUN = 'ْ', SUKUN_Q = 'ۡ', SHADDA = 'ّ', MADDAH = 'ٓ', DAGGER = 'ٰ';
const TANWEEN = ['ً', 'ٌ', 'ٍ']; // fathatan, dammatan, kasratan
const HIGH_MEEM = 'ۢ', LOW_MEEM = 'ۭ'; // iqlab marks
const SMALL_WAW = 'ۥ', SMALL_YEH = 'ۦ', SMALL_HIGH_YEH = 'ۧ';
const SMALL_HIGH_NOON = 'ۨ'; // U+06E8 — hidden noon (21:88 نُـۨجِى) → ikhfa
const SILENT0 = '۟'; // small high rounded zero — silent letter
const SILENT2 = '۠'; // small high rectangular zero — not colored by QPC
const HAMZA_ABOVE = 'ٔ';
const QALQALAH_SET = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
const IKHFA_SET = new Set(['ص', 'ذ', 'ث', 'ك', 'ج', 'ش', 'ق', 'س', 'د', 'ط', 'ز', 'ف', 'ت', 'ض', 'ظ']);
const IDGHAM_GH_SET = new Set(['ي', 'ن', 'م', 'و']);
const IDGHAM_NO_SET = new Set(['ل', 'ر']);
const HAMZA_SET = new Set(['ء', 'أ', 'إ', 'ؤ', 'ئ', 'آ']);
const VOWELS = ['َ', 'ُ', 'ِ']; // fatha, damma, kasra

export const isArabicLetterUnit = (ch: string | undefined): boolean => {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  if (c >= 0x0621 && c <= 0x064A) return true;
  if (c >= 0x0671 && c <= 0x06D3) return true;
  if (c === 0x06D5) return true;
  if (c >= 0x06EE && c <= 0x06EF) return true;
  if (c >= 0x06FA && c <= 0x06FC) return true;
  return false;
};

interface Unit { wi: number; ui: number; u: string; base: string }

export const segmentWord = (w: string): string[] => {
  const units: string[] = [];
  for (const ch of w) {
    if (isArabicLetterUnit(ch)) units.push(ch);
    else if (units.length) units[units.length - 1] += ch;
    else units.push(ch);
  }
  return units;
};

/**
 * Analyze one verse of Uthmani text. Returns a map keyed `"<wordIdx>:<letterUnitIdx>"`
 * (indices matching the reader's word split on spaces + per-letter-unit parse)
 * to the tajweed rule coloring that unit.
 */
// Match utils/quranicMarks.splitVerseWords: standalone waqf-sign tokens merge
// into the preceding word, so word indices line up with the reader's.
const STANDALONE_WAQF_RE = /^[ۖ-ۜ]+$/;
export const splitTajweedWords = (textUthmani: string): string[] => {
  const raw = textUthmani.split(' ');
  const out: string[] = [];
  for (const w of raw) {
    if (STANDALONE_WAQF_RE.test(w) && out.length > 0) out[out.length - 1] += w;
    else out.push(w);
  }
  return out;
};

/**
 * `turkish` mode reads the Istanbul (Ali al-Qari) orthography of the bundled
 * Turkish text instead of Madani conventions. The differences that matter:
 *   - assimilating nūn/mīm carry an EXPLICIT sukun (Madani leaves them bare
 *     to signal ikhfā/idghām — in Madani an explicit sukun means izhār);
 *   - iqlāb is usually written plain (nūn-sukun + ب), only ~87 carry a meem;
 *   - U+06EA is the everyday long-i mark → counts as a vowel;
 *   - no hamzat-wasl letter (U+0671) and no silah marks → those rules stay
 *     uncolored, matching what Turkish readers expect from their mushaf;
 *   - sun-letter lam follows a plain ا instead of ٱ.
 */
export function analyzeVerseTajweed(verse: string, turkish = false): Map<string, TajweedRule> {
  const flat: Unit[] = [];
  splitTajweedWords(verse).forEach((w, wi) => segmentWord(w).forEach((u, ui) => flat.push({ wi, ui, u, base: u[0] })));
  const L = flat.length;
  const out: (TajweedRule | undefined)[] = new Array(L);
  const set = (i: number, r: TajweedRule, force = false) => { if (i >= 0 && i < L && (force || !out[i])) out[i] = r; };
  const marks = (i: number) => flat[i].u.slice(1);
  const has = (i: number, ch: string) => i >= 0 && i < L && marks(i).includes(ch);
  const isLetterUnit = (i: number) => isArabicLetterUnit(flat[i].base);
  const isSilentUnit = (i: number) => has(i, SILENT0) || has(i, SILENT2);
  const isWaqfUnit = (i: number) => i >= 0 && i < L && !isLetterUnit(i);
  const hasSukun = (i: number) => has(i, SUKUN) || has(i, SUKUN_Q);
  // Waqf signs merged into a word (splitVerseWords) are inert for rule logic.
  const inertMarks = (i: number) => marks(i).replace(/[ۖ-ۜ]/g, '');
  // Turkish long-vowel strokes (U+06EA below / U+06EB above) vowel the letter.
  const TR_VOWEL_MARKS = ['\u06EA', '\u06EB'];
  const bareNoVowel = (i: number) => { const m = marks(i); return !VOWELS.some(v => m.includes(v)) && !m.includes(SUKUN) && !m.includes(SUKUN_Q) && !m.includes(SHADDA) && !TANWEEN.some(t => m.includes(t)) && !(turkish && TR_VOWEL_MARKS.some(v => m.includes(v))); };
  const hasTanween = (i: number) => TANWEEN.some(t => marks(i).includes(t));

  let lastPron = L - 1;
  while (lastPron > 0 && (isWaqfUnit(lastPron) || isSilentUnit(lastPron))) lastPron--;

  // Next pronounced letter: skips waqf-sign units, silent-marked letters, and
  // the bare alif/alif-maksura that carries a fathatan's silent seat.
  const nextPron = (i: number): number => {
    let j = i + 1;
    while (j < L && (isWaqfUnit(j) || isSilentUnit(j) || (['ا', 'ى'].includes(flat[j].base) && inertMarks(j) === ''))) j++;
    return j < L ? j : -1;
  };
  // Label a..b inclusive: letter units only (waqf signs are never colored).
  const cluster = (a: number, b: number, rule: TajweedRule) => { for (let k = a; k <= b; k++) if (isLetterUnit(k)) set(k, rule, k === a); };

  for (let i = 0; i < L; i++) {
    if (!isLetterUnit(i)) continue;
    const f = flat[i]; const m = marks(i); const b = f.base;

    // Silent letters (U+06DF, e.g. the plural alif ا۟) — except after a dagger
    // alif, where QPC marks the preceding (silent) waw instead.
    if (has(i, SILENT0)) { if (!(i > 0 && has(i - 1, DAGGER))) set(i, 'slnt'); }
    // A waw/yeh written but read as ā (dagger alif on it): silent when unvowelled
    // (صَلَوٰة), a 2-count madd when vowelled (ٱلصَّوَٰعِق).
    if ((b === 'و' || b === 'ي') && m.includes(DAGGER) && !m.includes(MADDAH)) {
      if (VOWELS.some(v => m.includes(v))) set(i, 'madda_normal');
      else set(i, 'slnt');
    }

    // Hamzat wasl — silent in continuous reading; the verse-initial one IS pronounced.
    if (b === 'ٱ' && i > 0) set(i, 'ham_wasl');
    // Sun-letter lam: bare ل after ٱ with a mushaddad letter next. The lam of
    // the divine name (ٱ + ل + لّ + ه) is not tagged by QPC.
    if (b === 'ل' && inertMarks(i) === '' && i > 0 && (flat[i - 1].base === 'ٱ' || (turkish && flat[i - 1].base === 'ا')) && i + 1 < L && has(i + 1, SHADDA)
      && !(flat[i + 1].base === 'ل' && flat[i + 2]?.base === 'ه')) set(i, 'laam_shamsiyah');

    // ── Madd family (U+0653 maddah = the long madds) ──
    if (m.includes(MADDAH)) {
      let j = nextPron(i);
      // Turkish places the maddah on the letter BEFORE the stretch letter
      // (Madani puts it on the stretch letter itself) — hop over one bare
      // madd letter so the hamza / shadda that decides the kind is visible,
      // and color the stretch letter along with the carrier.
      let stretch = -1;
      if (turkish && j !== -1 && ['و', 'ي', 'ا', 'ى'].includes(flat[j].base) && inertMarks(j) === '') {
        stretch = j;
        j = nextPron(j);
      }
      if ((m.includes(SMALL_WAW) || m.includes(SMALL_YEH)) && b !== 'ه') {
        // non-pronoun small-waw seat (فَأْوُۥٓ) — QPC leaves uncolored
      } else if (j !== -1 && (HAMZA_SET.has(flat[j].base) || flat[j].u.includes(HAMZA_ABOVE)
          || (turkish && flat[j].base === 'ا' && VOWELS.some(v => flat[j].u.includes(v))))) {
        set(i, 'madda_obligatory', true);
        if (stretch !== -1) set(stretch, 'madda_obligatory');
        // hamza seated on a tatweel right after a tatweel-carried madd (ـٰٓـَٔ)
        if (b === 'ـ' && flat[j].base === 'ـ' && flat[j].u.includes(HAMZA_ABOVE)) set(j, 'madda_obligatory');
      } else if (j !== -1 && (has(j, SHADDA) || hasSukun(j) || (turkish && has(j, MADDAH)))) {
        set(i, 'madda_necessary', true);
        if (stretch !== -1) set(stretch, 'madda_necessary');
      } else if (j === -1) {
        // Verse-final: bare muqattaʿāt letters (سٓ) keep madd lazim; a word-final
        // ىٰٓ/ـِۦٓ loses its madd when stopping → uncolored.
        if (m === MADDAH) set(i, 'madda_necessary', true);
      }
      continue;
    }
    // Silah (small waw/yeh on the ha pronoun) & dagger alif → 2-count madd.
    // Silah drops entirely when stopping at the verse end.
    if (m.includes(SMALL_WAW) || m.includes(SMALL_YEH) || m.includes(SMALL_HIGH_YEH)) {
      if (i !== lastPron) set(i, 'madda_normal');
    } else if (m.includes(DAGGER) && !['ى', 'و', 'ي'].includes(b) && !m.includes(HAMZA_ABOVE)) {
      set(i, 'madda_normal');
    }

    // ── Nūn sākinah & tanween ──
    const noonSakin = b === 'ن' && !m.includes(SHADDA) && (m.includes(SUKUN) || m.includes(SUKUN_Q) || bareNoVowel(i));
    const tanw = hasTanween(i);
    const iqlabMark = m.includes(HIGH_MEEM) || m.includes(LOW_MEEM);
    if (noonSakin || tanw || iqlabMark) {
      const j = nextPron(i);
      // If the target itself carries tanween it starts its own forward cluster
      // (e.g. كَنزٌ لَّهُم: the ز joins the idgham, the ن stays uncolored).
      if (j !== -1 && !hasTanween(j)) {
        const nb = flat[j].base;
        // Fathatan writes a silent alif seat; QPC starts the span at the alif
        // when the carrier is a lam-alif ligature or carries a shadda.
        const fathatanAlif = tanw && i + 1 < L && ['ا', 'ى'].includes(flat[i + 1]?.base) && inertMarks(i + 1) === '';
        const skipCarrier = fathatanAlif && (b === 'ل' || m.includes(SHADDA));
        const start = skipCarrier ? i + 1 : i;
        // Tanween on a hamza (شَىْءٍ): the span also covers the letter before it,
        // without overriding that letter's own label.
        const pullback = b === 'ء' && i > 0 && isLetterUnit(i - 1);
        if ((iqlabMark || (turkish && (noonSakin || tanw))) && nb === 'ب') {
          cluster((fathatanAlif || m.includes(SHADDA)) ? i + 1 : i, j, 'iqlab');
        } else if ((noonSakin && (bareNoVowel(i) || turkish)) || tanw) {
          if (IKHFA_SET.has(nb)) { cluster(start, j, 'ikhafa'); if (pullback) set(i - 1, 'ikhafa'); }
          else if (IDGHAM_GH_SET.has(nb) && (turkish ? flat[j].wi !== f.wi : (has(j, SHADDA) || nb === 'ي' || nb === 'و'))) { cluster(start, j, 'idgham_ghunnah'); if (pullback) set(i - 1, 'idgham_ghunnah'); }
          else if (IDGHAM_NO_SET.has(nb) && (turkish ? flat[j].wi !== f.wi : has(j, SHADDA))) cluster(start, j, 'idgham_wo_ghunnah');
        }
        // NOTE: 75:27 (مَنْ ۜ رَاقٍ) stays uncolored on purpose — the explicit sukun
        // + saktah mean Hafs recites izhar there, even though quran.com's dataset
        // tags it idgham (a known data quirk).
      }
    }

    // ── Hidden noon written as U+06E8 (a single Quranic occurrence, 21:88) ──
    if (m.includes(SMALL_HIGH_NOON)) {
      const j = nextPron(i);
      if (j !== -1 && IKHFA_SET.has(flat[j].base)) cluster(i, j, 'ikhafa');
    }

    // ── Mīm sākinah ──
    if (b === 'م' && !m.includes(SHADDA) && ((bareNoVowel(i) && !m.includes(SUKUN) && !m.includes(SUKUN_Q)) || (turkish && hasSukun(i)))) {
      const j = nextPron(i);
      if (j !== -1) {
        const nb = flat[j].base;
        if (nb === 'ب') cluster(i, j, 'ikhafa_shafawi');
        else if (nb === 'م') cluster(i, j, 'idgham_shafawi');
      }
    }

    // ── Idghām mutajānisayn / mutaqāribayn (only the assimilated letter is colored) ──
    if (!m.includes(SHADDA) && !out[i] && (bareNoVowel(i) || m.includes(SUKUN) || m.includes(SUKUN_Q))) {
      const j2 = i + 1 < L && isLetterUnit(i + 1) ? i + 1 : -1;
      if (j2 !== -1 && (has(j2, SHADDA) || turkish) && !out[j2]) {
        const pair = b + flat[j2].base;
        if (['دت', 'تد', 'تط', 'طت', 'ذظ', 'ثذ', 'بم'].includes(pair)) set(i, 'idgham_mutajanisayn');
        else if (['قك', 'لر'].includes(pair)) set(i, 'idgham_mutaqaribayn');
      }
    }

    // ── Ghunnah mushaddadah (نّ / مّ) — not on a tanween carrier (mid-verse),
    //    and not verse-initial (that shadda is cross-verse assimilation). ──
    if ((b === 'ن' || b === 'م') && m.includes(SHADDA) && (!hasTanween(i) || i === lastPron)) set(i, 'ghunnah');

    // ── Qalqalah: explicit sukun, or stopping on it at the verse end ──
    if (QALQALAH_SET.has(b) && (m.includes(SUKUN) || m.includes(SUKUN_Q) || i === lastPron)) set(i, 'qalaqah');
  }

  // ── Madd ʿārid lil-sukūn: the long vowel right before the verse-final letter ──
  if (lastPron >= 1) {
    let i = lastPron - 1;
    while (i > 0 && (isWaqfUnit(i) || isSilentUnit(i))) i--;
    const m = inertMarks(i);
    const isLong = (['ا', 'و', 'ي', 'ى'].includes(flat[i].base) && m === '') || m.includes(DAGGER);
    if (isLong && (!out[i] || out[i] === 'madda_normal')) out[i] = 'madda_permissible';
  }

  const res = new Map<string, TajweedRule>();
  flat.forEach((f, idx) => { if (out[idx]) res.set(`${f.wi}:${f.ui}`, out[idx]!); });
  return res;
}


// ── Letters of madd ──────────────────────────────────────────────────────────
// A separate layer from the rules above: every letter that is read long.
//   - ا / ى after a fatha, و after a damma, ي / ى after a kasra, written bare
//     (the Madani text puts a sukun only on the leen letters, وْ يْ, which
//     are not madd letters);
//   - the small alif (U+0670), small waw (U+06E5) and small ya (U+06E6/7).
//     These are marks, so the letter unit carrying them is what lights up;
//     the Madani text seats most small alifs on a tatweel of their own (ـٰ);
//   - Turkish text: its long-vowel strokes (U+06EA long i, U+06EB long u)
//     and the vertical fatha (U+0670) play the part of the small letters.
// Left out, because they are not read long:
//   - a madd letter ending a word when the next word starts with hamzat wasl
//     (فِى ٱلْأَرْضِ, قَالُوا۟ ٱدْخُلُوا۟): two sakins meet and it drops;
//   - a silah on the verse's last letter (dropped when stopping there);
//   - a small ya / waw that carries its own vowel or shadda (ءَاتَىٰنِۦَ: a
//     consonant), and a small alif seating a hamza (فَٱدَّٰرَْٰٔتُمْ);
//   - the silent seat alif of a fathatan, except on the verse's last letter,
//     where stopping turns the fathatan into a long ā (madd al-ʿiwad).
const FATHA = 'َ', DAMMA = 'ُ', KASRA = 'ِ';
const FATHATAN = 'ً', DAMMATAN = 'ٌ', KASRATAN = 'ٍ';
const TR_LONG_I = '۪', TR_LONG_U = '۫';

export function findMaddLetters(verse: string, turkish = false): Set<string> {
  const flat: Unit[] = [];
  splitTajweedWords(verse).forEach((w, wi) => segmentWord(w).forEach((u, ui) => flat.push({ wi, ui, u, base: u[0] })));
  const L = flat.length;
  const isLetterUnit = (i: number) => i >= 0 && i < L && isArabicLetterUnit(flat[i].base);
  const marks = (i: number) => flat[i].u.slice(1).replace(/[ۖ-ۜ]/g, '');
  const isSilent = (i: number) => /[۟۠]/.test(flat[i].u);
  /** Nothing on it but (perhaps) a maddah: the shape of a written madd letter. */
  const bare = (i: number) => marks(i).replace(/ٓ/g, '') === '';
  /** The letter before, in the same word. */
  const prev = (i: number) => (i > 0 && flat[i - 1].wi === flat[i].wi && isLetterUnit(i - 1) ? i - 1 : -1);

  let lastPron = L - 1;
  while (lastPron > 0 && (!isLetterUnit(lastPron) || isSilent(lastPron))) lastPron--;
  /** The pronoun's long vowel (silah) is not read when stopping on it. */
  const silahAtStop = (i: number) => i === lastPron && flat[i].base === 'ه';

  const madd: boolean[] = new Array(L).fill(false);
  for (let i = 0; i < L; i++) {
    if (!isLetterUnit(i) || isSilent(i)) continue;
    const m = marks(i); const b = flat[i].base;

    // Small alif — unless it only seats a hamza.
    if (m.includes(DAGGER)) { if (!m.includes(HAMZA_ABOVE)) madd[i] = true; continue; }
    // Small waw / ya — a consonant when a vowel or shadda follows it.
    const small = [SMALL_WAW, SMALL_YEH, SMALL_HIGH_YEH].map(c => m.indexOf(c)).filter(k => k >= 0);
    if (small.length) {
      const after = m.slice(Math.min(...small) + 1);
      if (!/[َُِّ]/.test(after) && !silahAtStop(i)) madd[i] = true;
      continue;
    }
    if (turkish && m.includes(TR_LONG_U)) { if (!silahAtStop(i)) madd[i] = true; continue; }
    if (turkish && m.includes(TR_LONG_I)) {
      // The long-i stroke before a written ي: the ي is the madd letter. With
      // no ي after it, the stroke stands for one (the silah بِه۪).
      const n = i + 1;
      const yaFollows = n < L && flat[n].wi === flat[i].wi && ['ي', 'ى'].includes(flat[n].base) && bare(n);
      if (!yaFollows && !silahAtStop(i)) madd[i] = true;
      continue;
    }

    if (!['ا', 'ى', 'و', 'ي'].includes(b) || !bare(i)) continue;
    const p = prev(i);
    if (p === -1) continue;
    const pm = marks(p);
    const fatha = pm.includes(FATHA) && !pm.includes(FATHATAN);
    const damma = pm.includes(DAMMA) && !pm.includes(DAMMATAN);
    const kasra = pm.includes(KASRA) && !pm.includes(KASRATAN);
    const trA = turkish && pm.includes(DAGGER);
    // Turkish writes hamzat wasl after a prefix as a plain alif: وَالْ, فَاسْتَمِعْ,
    // وَالشَّمْسِ, وَالَّذ۪ينَ. A sukun, a bare (sun-letter) lam, or a shadda that
    // no maddah announces comes next — never the case after a madd alif.
    if (turkish && b === 'ا' && i + 1 < L && flat[i + 1].wi === flat[i].wi) {
      const nm = marks(i + 1);
      if (/[ْۡ]/.test(nm) || (flat[i + 1].base === 'ل' && nm === '') || (nm.includes(SHADDA) && !pm.includes(MADDAH))) continue;
    }
    if ((b === 'ا' || b === 'ى') && (fatha || trA)) madd[i] = true;
    else if (b === 'ي' && trA) madd[i] = true;          // Turkish: اَتٰيكَ, the ā written with ي
    else if (b === 'و' && (damma || (turkish && pm.includes(TR_LONG_U)))) madd[i] = true;
    else if ((b === 'ي' || b === 'ى') && (kasra || (turkish && pm.includes(TR_LONG_I)))) madd[i] = true;
    else if (i === lastPron && (b === 'ا' || b === 'ى') && pm.includes(FATHATAN)) madd[i] = true;
  }

  // Two sakins: the madd letter ending a word drops before hamzat wasl. The
  // Turkish text writes that hamza as a plain alif with no vowel.
  const startsWithWasl = (wi: number) => {
    const k = flat.findIndex(f => f.wi === wi);
    if (k === -1) return false;
    return flat[k].base === 'ٱ' || (turkish && flat[k].base === 'ا' && marks(k) === '');
  };
  for (let i = 0; i < L; i++) {
    if (!madd[i]) continue;
    // Last pronounced letter of its word (a silent alif may trail it: قَالُوا۟).
    let k = i + 1;
    while (k < L && flat[k].wi === flat[i].wi && (!isLetterUnit(k) || isSilent(k))) k++;
    const wordEnds = k >= L || flat[k].wi !== flat[i].wi;
    if (wordEnds && flat[i].wi + 1 <= flat[L - 1].wi && startsWithWasl(flat[i].wi + 1)) madd[i] = false;
  }

  const res = new Set<string>();
  flat.forEach((f, idx) => { if (madd[idx]) res.add(`${f.wi}:${f.ui}`); });
  return res;
}


/**
 * What the reader colours a letter with, given the rules the viewer chose to
 * see. The letters of madd beat the 2-count madd (it is the same letter seen
 * as a madd) and the silent mark (صَلَوٰة: the small alif on a silent waw is
 * what is read), but not the rules that say more: the 4-6 count madds, and
 * the nūn/mīm rules whose clusters run through a letter (نَفْسٍ وَٰحِدَةٍ).
 */
export function displayTajweedRule(
  rule: TajweedRule | undefined,
  isMaddLetter: boolean,
  on: (r: TajweedRule) => boolean,
): TajweedRule | undefined {
  const weak = rule === 'madda_normal' || rule === 'slnt';
  if (rule && !weak && on(rule)) return rule;
  if (isMaddLetter && on('madd_letter')) return 'madd_letter';
  if (rule && on(rule)) return rule;
  return undefined;
}
