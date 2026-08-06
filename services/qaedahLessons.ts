// ─────────────────────────────────────────────────────────────────────────────
// Short bilingual teaching notes for the ten Qaedah Nooraniyya lessons — shown
// above the word list so the tutor (or a parent sitting with the student) has
// the rule, the sound, and the thing learners usually get wrong, without
// leaving the page.
//
// Keyed by the topic's order_index (1–10, the order they were seeded in
// 20260101_qaedah_tables.sql), with a title match as a fallback so a renamed or
// re-ordered topic still finds its note.
// ─────────────────────────────────────────────────────────────────────────────

export interface QaedahLessonNote {
  /** One line: what this lesson is. */
  en: string;
  ar: string;
  /** How it sounds / how to say it. */
  soundEn: string;
  soundAr: string;
  /** The mistake learners make here. */
  watchEn: string;
  watchAr: string;
  /** A worked example, Arabic. */
  example: string;
  emoji: string;
}

const NOTES: Record<number, QaedahLessonNote & { match: string[] }> = {
  1: {
    match: ['fatha'],
    emoji: '◌َ',
    en: 'The fatha is a small slanted stroke written above the letter. It opens the mouth on a short "a".',
    ar: 'الفتحة شَرطة صغيرة مائلة تُكتب فوق الحرف، وتُنطق بفتح الفم بصوت "أَ" قصير.',
    soundEn: 'One count only — as short as a clap. بَ is "ba", never "baa".',
    soundAr: 'حركة واحدة فقط، بمقدار نقرة واحدة. "بَ" وليست "با".',
    watchEn: 'Stretching it into a madd. If you can hold the sound, it is too long.',
    watchAr: 'الخطأ الشائع مدّها. إن استطعت إطالة الصوت فقد أخطأت.',
    example: 'بَ  تَ  ثَ  —  كَتَبَ',
  },
  2: {
    match: ['kasrah', 'kasra'],
    emoji: '◌ِ',
    en: 'The kasrah is the same small stroke, but written below the letter. It lowers the jaw into a short "i".',
    ar: 'الكسرة شَرطة صغيرة تُكتب تحت الحرف، وتُنطق بخفض الفكّ بصوت "إِ" قصير.',
    soundEn: 'One count, with the lips slightly drawn back. بِ is "bi".',
    soundAr: 'حركة واحدة مع انخفاض الفكّ الأسفل. "بِ" تُنطق "بِ".',
    watchEn: 'Letting it drift towards a fatha. Keep the jaw down, not open.',
    watchAr: 'الحذر من ميلها نحو الفتحة. اخفض الفكّ ولا تفتحه.',
    example: 'بِ  تِ  ثِ  —  عَلِمَ',
  },
  3: {
    match: ['dammah', 'damma'],
    emoji: '◌ُ',
    en: 'The dammah is a small waw written above the letter. The lips round forward into a short "u".',
    ar: 'الضمة واو صغيرة تُكتب فوق الحرف، وتُنطق بضمّ الشفتين بصوت "أُ" قصير.',
    soundEn: 'One count, lips rounded like a small circle. بُ is "bu".',
    soundAr: 'حركة واحدة مع ضمّ الشفتين على شكل دائرة صغيرة.',
    watchEn: 'Not rounding the lips enough — it then sounds like a fatha.',
    watchAr: 'عدم ضمّ الشفتين كفاية فتُسمع كالفتحة.',
    example: 'بُ  تُ  ثُ  —  كُتُبٌ',
  },
  4: {
    match: ['alif'],
    emoji: 'ـَا',
    en: 'A fatha followed by a silent alif (or a small standing alif ٰ) stretches the "a" sound.',
    ar: 'الفتحة متبوعة بألف ساكنة (أو ألف صغيرة قائمة ٰ) تمدّ صوت الفتحة.',
    soundEn: 'Two counts — twice the length of a plain fatha. بَا is "baa".',
    soundAr: 'حركتان، أي ضِعف الفتحة القصيرة. "بَا" تُمدّ.',
    watchEn: 'Cutting it short, or over-stretching to four or six counts.',
    watchAr: 'قصرها، أو مدّها أكثر من حركتين.',
    example: 'بَا  قَالَ  —  ذَٰلِكَ',
  },
  5: {
    match: ['yaa', 'ya'],
    emoji: 'ـِي',
    en: 'A kasrah followed by a silent yaa (or a small yaa) stretches the "i" sound.',
    ar: 'الكسرة متبوعة بياء ساكنة (أو ياء صغيرة) تمدّ صوت الكسرة.',
    soundEn: 'Two counts. بِي is "bee". The yaa itself is never pronounced separately.',
    soundAr: 'حركتان. "بِي" تُمدّ، والياء لا تُنطق حرفًا مستقلًّا.',
    watchEn: 'Pronouncing the yaa as a consonant, which adds a letter that is not read.',
    watchAr: 'نطق الياء حرفًا مستقلًّا فيُزاد حرف لا يُقرأ.',
    example: 'بِي  قِيلَ  —  فِيهِ',
  },
  6: {
    match: ['waw'],
    emoji: 'ـُو',
    en: 'A dammah followed by a silent waw (or a small waw) stretches the "u" sound.',
    ar: 'الضمة متبوعة بواو ساكنة (أو واو صغيرة) تمدّ صوت الضمة.',
    soundEn: 'Two counts, lips held rounded throughout. بُو is "boo".',
    soundAr: 'حركتان مع بقاء الشفتين مضمومتين طوال المدّ.',
    watchEn: 'Releasing the lips early, which shortens the madd.',
    watchAr: 'إرخاء الشفتين مبكّرًا فيقصُر المدّ.',
    example: 'بُو  يَقُولُ  —  نُوحٌ',
  },
  7: {
    match: ['sukoon', 'sukun'],
    emoji: 'ـْ',
    en: 'A sukoon is a small circle meaning the letter carries no vowel at all — it closes the syllable.',
    ar: 'السكون دائرة صغيرة تعني أنّ الحرف بلا حركة، فيُغلق به المقطع.',
    soundEn: 'Say the letter and stop dead on it. Join it to the letter before, never to the one after.',
    soundAr: 'انطق الحرف واقطع الصوت عليه، ووصله بما قبله لا بما بعده.',
    watchEn: 'Sneaking a tiny vowel in after it — the most common beginner habit.',
    watchAr: 'إقحام حركة خفيفة بعده، وهو أكثر أخطاء المبتدئين.',
    example: 'أَبْ  مِنْ  —  اَنْعَمْتَ',
  },
  8: {
    match: ['tanween'],
    emoji: 'ـٌ ـٍ ـً',
    en: 'A doubled vowel sign (ـً ـٍ ـٌ) adds a noon sound with no noon written.',
    ar: 'التنوين حركتان متماثلتان (ـً ـٍ ـٌ) تُنطق نونًا ساكنة بلا نون مكتوبة.',
    soundEn: 'كِتَابٌ is read "kitaabun", كِتَابٍ "kitaabin", كِتَابًا "kitaaban".',
    soundAr: '"كِتَابٌ" تُقرأ كِتَابُنْ، و"كِتَابٍ" كِتَابِنْ، و"كِتَابًا" كِتَابَنْ.',
    watchEn: 'It only sounds like a plain noon when stopping is not intended — and it vanishes when you stop.',
    watchAr: 'يسقط التنوين عند الوقف، فيُقرأ الحرف ساكنًا أو بألف.',
    example: 'كِتَابٌ  بَيْتٍ  —  عَلِيمًا',
  },
  9: {
    match: ['shaddah', 'shadda'],
    emoji: 'ـّ',
    en: 'A shaddah marks a doubled letter: the same letter written once but read twice.',
    ar: 'الشدّة تدلّ على حرف مُضعَّف: حرف واحد مكتوب يُنطق حرفين.',
    soundEn: 'The first is sākin, the second carries the vowel. Press on the letter before releasing it.',
    soundAr: 'الأول ساكن والثاني متحرّك، فاضغط على الحرف قبل إطلاقه.',
    watchEn: 'Rushing past it. A shaddah on ن or م also needs its ghunnah held two counts.',
    watchAr: 'الإسراع بها. والشدّة على النون والميم تحتاج غنّة بمقدار حركتين.',
    example: 'رَبَّ  إِنَّ  —  مُحَمَّدٌ',
  },
  10: {
    match: ['hamzatul', 'hamzat', 'wasl'],
    emoji: 'ٱ',
    en: 'Hamzatul-Wasl is a connecting alif: pronounced when you begin with it, skipped when you reach it mid-flow.',
    ar: 'همزة الوصل ألف تُنطق عند البدء بها، وتسقط عند وصلها بما قبلها.',
    soundEn: 'Starting: ٱلْحَمْدُ is "al-hamdu". Continuing: … وَٱلْحَمْدُ is "wal-hamdu".',
    soundAr: 'عند الابتداء: "ٱلْحَمْدُ" تُنطق الْحَمْدُ. وعند الوصل: "وَٱلْحَمْدُ" تُنطق وَلْحَمْدُ.',
    watchEn: 'Pronouncing it in the middle of a phrase, which inserts a letter that is not read.',
    watchAr: 'نطقها في وسط الكلام فيُزاد حرف لا يُقرأ.',
    example: 'ٱقْرَأْ  ٱلْحَمْدُ  —  وَٱسْتَغْفِرْ',
  },
};

/**
 * The note for a lesson. Matches on order_index first; if the topics were
 * re-ordered or renamed, falls back to a keyword in the English title.
 */
export const qaedahLessonNote = (
  orderIndex: number,
  titleEn: string,
): QaedahLessonNote | null => {
  const byOrder = NOTES[orderIndex];
  const lc = (titleEn || '').toLowerCase();
  if (byOrder && byOrder.match.some(m => lc.includes(m))) return byOrder;
  const byTitle = Object.values(NOTES).find(n => n.match.some(m => lc.includes(m)));
  return byTitle ?? byOrder ?? null;
};
