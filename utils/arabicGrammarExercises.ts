// utils/arabicGrammarExercises.ts
// -----------------------------------------------------------------------------
// Grammar practice for the Palestinian (levantine) course, level 1.
//
// The grammar POINTS themselves live on each lesson row (`grammar_summary`) and
// are written by the tutor — this file never restates them. What it holds is the
// practice: exercises keyed by the lesson's order index.
//
// Two rules the exercises are written to, both from the brief:
//
//   1. The answer is never in the question. No "ana ___ (I am a student)", where
//      the English hands over the word; no multiple choice where three options
//      are not real Arabic. Every distractor here is a form the student has met,
//      and is wrong for a reason the rule decides.
//   2. They test the rule, not recall of a sentence. Most are transformations
//      ("make it feminine", "now say it about her") or corrections, because a
//      student can parrot a sentence without being able to change it.
//
// Free-text answers are matched after normalising, so hyphens, spacing and case
// never decide a mark; genuine spelling variants (ee/i, 7/h, 5/kh, q/2) are
// listed per item instead of guessed at.
// -----------------------------------------------------------------------------

export type GrammarExercise = {
  /** The rule being tested, in a few words — shown on the card. */
  point: string;
  /** Why the answer is the answer. Shown after answering, right or wrong. */
  why: string;
} & (
  | { kind: 'choose'; prompt: string; options: string[]; answer: number }
  | { kind: 'write'; prompt: string; accept: string[] }
);

/**
 * How an answer is compared. Hyphens and spaces are how a learner shows the
 * seams in a word (beet-ha, beet ha, beetha) — none of them is a mistake, so
 * none of them decides a mark.
 */
export const normaliseAnswer = (s: string): string =>
  s.toLowerCase()
    .replace(/[ــ]/g, '')
    .replace(/[-_'’`.,!?؟\s]+/g, '')
    .trim();

export const answerIsRight = (given: string, accept: string[]): boolean => {
  const g = normaliseAnswer(given);
  return g.length > 0 && accept.some(a => normaliseAnswer(a) === g);
};

/** Lesson order index → its exercises. Levantine level 1. */
export const GRAMMAR_EXERCISES: Record<number, GrammarExercise[]> = {

  // ── 1. Hello — attached pronouns, and no verb "to be" ──────────────────
  1: [
    {
      kind: 'choose', point: 'No verb "to be"',
      prompt: 'Only ONE of these says "she is a teacher" the way Arabic says it. Which?',
      options: ['hiyya ostaathah', 'hiyya bitkoon ostaathah', 'hiyya fee ostaathah', 'hiyya kaanat ostaathah'],
      answer: 0,
      why: 'Arabic puts nothing between the two words. The others are all real Arabic, but they say "she will be", "there is", and "she was".',
    },
    {
      kind: 'write', point: 'No verb "to be"',
      prompt: 'Three words become two in Arabic. Write "I am Ahmad".',
      accept: ['ana a7mad', 'ana ahmad', 'ana a7med', 'ana ahmed'],
      why: 'ana a7mad — "am" is not translated at all.',
    },
    {
      kind: 'choose', point: 'Attached pronouns',
      prompt: 'ism-ee, ism-ak, ism-ha — what is the part that changes doing?',
      options: [
        'Saying WHOSE name it is',
        'Saying whether the name is definite',
        'Making the word feminine',
        'Turning the noun into a question',
      ],
      answer: 0,
      why: 'The suffix carries the owner: ‑ee my, ‑ak your, ‑ha her. The word for "name" never changes.',
    },
    {
      kind: 'write', point: 'Attached pronouns',
      prompt: 'A man asks your name. Write his question (two words).',
      accept: ['shoo ismak', 'shu ismak', 'sho ismak', 'shoo esmak', 'shu esmak', 'shoo ismk'],
      why: 'shoo ism-ak? — the ‑ak is pointed at the man you are speaking to.',
    },
    {
      kind: 'choose', point: 'No verb "to be"',
      prompt: 'A student writes: "ana howwa taalib". What has gone wrong?',
      options: [
        'howwa has been used as if it meant "am"',
        'taalib should be feminine',
        'ana should come last',
        'Nothing — it is correct',
      ],
      answer: 0,
      why: 'howwa means "he". English "I am" tempts you to translate "am", but there is nothing to translate: ana taalib.',
    },
  ],

  // ── 2. Family — gender, haad/haadi, the extra و ────────────────────────
  2: [
    {
      kind: 'write', point: 'haad / haadi',
      prompt: 'You point at a woman and say "this is my mother". Write it.',
      accept: ['haadi immee', 'haadi immi', 'haadi emmee', 'hadi immee', 'hadi immi', 'haady immee', 'haadi ommee', 'hadi ommi'],
      why: 'haadi (feminine) because the person pointed at is female — not haad.',
    },
    {
      kind: 'choose', point: 'The extra و with أخ / أب',
      prompt: 'Which is "his brother"?',
      options: ['a5-ooh', 'a5-oh', 'a5-ha', 'a5'],
      answer: 0,
      why: 'أخ takes an extra و before a suffix: a5 → a5-ooh. a5-oh skips it, a5-ha is "her brother".',
    },
    {
      kind: 'write', point: 'The extra و with أخ / أب',
      prompt: 'Same trick as "his brother", but with أب. Write "her father".',
      accept: ['abooha', 'abuha', 'abooha', 'abooh-ha', 'abuuha'],
      why: 'ab → aboo‑ + ha = aboo-ha. The و appears as soon as a suffix is added.',
    },
    {
      kind: 'choose', point: 'Formal vs everyday words',
      prompt: 'You are writing your mother\'s name on an official form. Which word fits?',
      options: ['waalidah', 'imm', 'ukht', 'bint'],
      answer: 0,
      why: 'waalidah is the formal word; imm is what you say at home. The other two are "sister" and "daughter".',
    },
    {
      kind: 'choose', point: 'Everything has a gender',
      prompt: 'Which of these would take haadi rather than haad?',
      options: ['sayyarah', 'beet', 'kitaab', 'qalam'],
      answer: 0,
      why: 'sayyarah ends in ة, so it is feminine and takes haadi. The other three are masculine.',
    },
  ],

  // ── 3. Pronouns — the possessive suffixes in full ──────────────────────
  3: [
    {
      kind: 'choose', point: '‑ak vs ‑ik',
      prompt: 'You hear "ism-ik". Who is being spoken to?',
      options: ['A woman', 'A man', 'A group', 'Nobody — it means "my name"'],
      answer: 0,
      why: '‑ik is for a woman, ‑ak for a man. One vowel is the whole difference, and it is the one most often missed.',
    },
    {
      kind: 'write', point: 'Possessive suffixes',
      prompt: 'beet means house. Write "her house".',
      accept: ['beetha', 'baitha', 'bytha', 'beet-ha'],
      why: 'beet-ha. The noun does not change; the owner is the ending.',
    },
    {
      kind: 'write', point: 'Possessive suffixes',
      prompt: 'Now the same noun, but speaking TO a woman about her own house.',
      accept: ['beetik', 'baitik', 'beet-ik'],
      why: 'beet-ik — "your house" to a woman. beet-ha would be "her house", about someone not present.',
    },
    {
      kind: 'choose', point: 'ة switches gender',
      prompt: 'taalib is a male student. Which is the female one?',
      options: ['taalibah', 'taalib-ee', 'taalib-ha', 'taalibeen'],
      answer: 0,
      why: 'Adding ة (‑ah) makes it feminine. The other two endings are possessives, and the last is a plural.',
    },
    {
      kind: 'choose', point: 'No verb "to be" + suffixes',
      prompt: 'Which one means "his name is Ahmad"?',
      options: ['ism-oh a7mad', 'ism-ee a7mad', 'ism-ak a7mad', 'ism-ha a7mad'],
      answer: 0,
      why: '‑oh is "his". Note there is still no word for "is" — the two words sit side by side.',
    },
  ],

  // ── 4. Revision — agreement, and questions by tone ─────────────────────
  4: [
    {
      kind: 'write', point: 'Adjectives take gender',
      prompt: 'A man is 7elu. Write the same about a woman (two words, starting hiyya).',
      accept: ['hiyya 7elwe', 'hiyya 7elweh', 'hiyya 7elwah', 'hiya 7elwe', 'hiyya helwe', 'hiya helwe', 'hiyya 7elwa'],
      why: 'hiyya 7elwe — the adjective moves to its feminine form, and still no "is".',
    },
    {
      kind: 'choose', point: 'Yes/no questions',
      prompt: 'How do you turn "inta taalib" into a question?',
      options: [
        'Say it with a rising tone and change nothing',
        'Put shoo at the front',
        'Put hal at the front',
        'Move taalib to the front',
      ],
      answer: 0,
      why: 'Nothing is added — the voice does the work. shoo asks "what", so shoo inta taalib is not a yes/no question.',
    },
    {
      kind: 'choose', point: 'No verb "to be"',
      prompt: 'Which sentence is NOT possible in Arabic?',
      options: ['inta bitkoon mhandes alyoum', 'inta mhandes', 'inta mish mhandes', 'inta kaanit mhandes'],
      answer: 3,
      why: 'kaanit is the "she" form — with inta it has to be konit. The first is odd but sayable; the rest are fine.',
    },
    {
      kind: 'write', point: 'Adjectives take gender',
      prompt: 'Write "she is not beautiful" — three words.',
      accept: ['hiyya mish 7elwe', 'hiya mish 7elwe', 'hiyya mish 7elweh', 'hiyya mish 7elwah', 'hiyya mish helwe', 'hiya mish helwe'],
      why: 'mish goes BEFORE the word it negates, and the adjective stays feminine.',
    },
    {
      kind: 'choose', point: 'Adjectives take gender',
      prompt: 'Which pair do NOT agree?',
      options: ['bint kabeer', 'walad kabeer', 'bint kabeerah', 'sayyarah kabeerah'],
      answer: 0,
      why: 'bint is feminine, so the adjective has to be kabeerah. The other three already agree.',
    },
  ],

  // ── 5. Definite and Indefinite ─────────────────────────────────────────
  5: [
    {
      kind: 'choose', point: 'haad + noun vs haad + el‑noun',
      prompt: 'Which one means "this is a book", not "this book"?',
      options: ['haad kitaab', 'haad el-kitaab', 'el-kitaab haad', 'haadi kitaab'],
      answer: 0,
      why: 'Without ال it is a whole sentence: "this is a book". Add ال and it becomes the phrase "this book".',
    },
    {
      kind: 'write', point: 'ة becomes ‑at before a suffix',
      prompt: 'madrasah means school. Write "my school".',
      accept: ['madrastee', 'madrasti', 'madrast-ee', 'madrasatee', 'madrasati'],
      why: 'madrast-ee. The ة hardens to t as soon as anything is attached.',
    },
    {
      kind: 'write', point: 'Definite with ال',
      prompt: 'sayyarah is a car. Write "the car".',
      accept: ['essayyarah', 'es-sayyarah', 'elsayyarah', 'el-sayyarah', 'assayyara', 'es-sayyara', 'essayyara'],
      why: 'es-sayyarah. ال is written the same every time even though the l here is pronounced as the s.',
    },
    {
      kind: 'choose', point: 'ة becomes ‑at before a suffix',
      prompt: 'A student writes "madrasah-ee" for "my school". What is wrong?',
      options: [
        'The ة must become t: madrast-ee',
        'The suffix should be ‑ak',
        'It needs ال in front',
        'Nothing is wrong',
      ],
      answer: 0,
      why: 'A ة never survives in front of a suffix — it turns into t.',
    },
    {
      kind: 'choose', point: 'Indefinite = no ال',
      prompt: 'How do you say "a book" in Arabic?',
      options: ['kitaab', 'waa7ed kitaab', 'el-kitaab', 'kitaab waa7ed'],
      answer: 0,
      why: 'There is no word for "a". The bare noun is already indefinite; waa7ed means the number one.',
    },
  ],

  // ── 6. Adjectives — the phrase/sentence trap ───────────────────────────
  6: [
    {
      kind: 'choose', point: 'Agreement in definiteness',
      prompt: 'Which one is the PHRASE "the big house" (not a sentence)?',
      options: ['el-beet el-kabeer', 'el-beet kabeer', 'beet el-kabeer', 'beet kabeer'],
      answer: 0,
      why: 'Both words carry ال, so it is one phrase. el-beet kabeer is a whole sentence: "the house is big".',
    },
    {
      kind: 'choose', point: 'Agreement in definiteness',
      prompt: 'And which of those same four says "the house is big"?',
      options: ['el-beet kabeer', 'el-beet el-kabeer', 'beet el-kabeer', 'beet kabeer'],
      answer: 0,
      why: 'ال on the noun but not the adjective splits them into subject and statement. This pair is the commonest mistake in the lesson.',
    },
    {
      kind: 'write', point: 'Adjective follows the noun',
      prompt: 'Write "a beautiful car" — two words, no ال.',
      accept: ['sayyarah 7elwe', 'sayyara 7elwe', 'sayyarah 7elweh', 'sayyarah 7elwah', 'sayyarah helwe', 'sayyara helwe'],
      why: 'sayyarah 7elwe — noun first, and the adjective takes the feminine form to match.',
    },
    {
      kind: 'write', point: 'Agreement in definiteness',
      prompt: 'Now make that same phrase definite: "the beautiful car".',
      accept: ['essayyarah el7elwe', 'es-sayyarah el-7elwe', 'elsayyarah el7elwe', 'essayyara el7elwe', 'es-sayyara el-7elwe', 'essayyarah elhelwe'],
      why: 'BOTH words take ال. Putting it on only one of them changes the meaning into a sentence.',
    },
    {
      kind: 'choose', point: 'Agreement in gender',
      prompt: 'Which is wrong?',
      options: ['el-bint el-kabeer', 'el-walad el-kabeer', 'el-bint el-kabeerah', 'bint kabeerah'],
      answer: 0,
      why: 'bint is feminine, so the adjective must be el-kabeerah. Definiteness agrees here, but gender does not.',
    },
  ],

  // ── 7. Not & Was ───────────────────────────────────────────────────────
  7: [
    {
      kind: 'write', point: 'kaan + ending',
      prompt: 'Write "she was sick" — two words.',
      accept: ['kaanat mareedah', 'kaanit mareedah', 'kaanat mareeda', 'kaanit mareeda', 'kanat mareedah'],
      why: 'kaanat is the "she" form, and the adjective is feminine too.',
    },
    {
      kind: 'choose', point: 'kaan + ending',
      prompt: '"konit" could be two different people. Which two?',
      options: ['I, and you (m)', 'I, and he', 'you (f), and she', 'he, and she'],
      answer: 0,
      why: 'ana konit and inta konit share a form. Only the pronoun tells them apart — which is why it is usually said.',
    },
    {
      kind: 'write', point: 'mish goes before',
      prompt: 'Write "he is not sick" — three words.',
      accept: ['howwa mish mareed', 'howa mish mareed', 'huwwa mish mareed'],
      why: 'mish sits in front of what it negates, and there is still no "is".',
    },
    {
      kind: 'choose', point: 'A suffix already makes it definite',
      prompt: 'Which one is wrong?',
      options: ['el-madrast-ee', 'madrast-ee', 'el-madrasah', 'madrasah'],
      answer: 0,
      why: 'A possessive suffix already makes the noun definite, so ال on top of it is one too many.',
    },
    {
      kind: 'write', point: 'kaan + ending',
      prompt: 'Speaking TO a woman: "you were a student". Three words.',
      accept: ['inti konti taalibah', 'enti konti taalibah', 'inti kunti taalibah', 'inti konti taliba', 'inti konti taalibeh'],
      why: 'konti for "you (f)", and the noun is feminine to match her.',
    },
  ],

  // ── 8. Numbers 1–12 ────────────────────────────────────────────────────
  8: [
    {
      kind: 'write', point: 'Compound numbers join with wi',
      prompt: 'Write 27 in words.',
      accept: ['sab3ah wi 3ishreen', 'sab3a wi 3ishreen', 'sab3ah w 3ishreen', 'sab3ah wa 3ishreen', 'sab3a w 3ishreen'],
      why: 'The ones come first, then wi, then the tens — the opposite order to English.',
    },
    {
      kind: 'choose', point: 'Compound numbers join with wi',
      prompt: 'Someone says "3ishreen wi sab3ah". What has been done the English way?',
      options: [
        'The tens have been put before the ones',
        'wi should be omitted',
        'sab3ah should be feminine',
        'Nothing — it is correct',
      ],
      answer: 0,
      why: 'Arabic says the small part first: sab3ah wi 3ishreen.',
    },
    {
      kind: 'choose', point: 'mawjood / hinaak',
      prompt: '"Is there sugar at home?" Which word asks whether it EXISTS?',
      options: ['mawjood', 'hinaak', 'haad', 'meen'],
      answer: 0,
      why: 'mawjood = "there is / is available". hinaak points at a place: "over there".',
    },
    {
      kind: 'write', point: 'Compound numbers join with wi',
      prompt: 'Write 41 in words.',
      accept: ['waa7ad wi arb3een', 'waa7ed wi arb3een', 'wa7ad wi arb3een', 'waa7ad wi arba3een', 'waa7ed wi arba3een', 'wa7ed wi arb3een'],
      why: 'waa7ad wi arb3een — ones, wi, tens, every time.',
    },
    {
      kind: 'choose', point: 'mawjood / hinaak',
      prompt: 'Which sentence says the book is PRESENT, rather than saying where it is?',
      options: ['el-kitaab mawjood', 'el-kitaab hinaak', 'el-kitaab fee el-beet', 'el-kitaab haad'],
      answer: 0,
      why: 'mawjood answers "is there one?". The others answer "where?" or point at it.',
    },
  ],

  // ── 9. Idafah ──────────────────────────────────────────────────────────
  9: [
    {
      kind: 'write', point: 'Possessed + possessor',
      prompt: 'Write "Ahmad\'s pen" — two words.',
      accept: ['qalam a7mad', 'alam a7mad', '2alam a7mad', 'qalam ahmad', 'alam ahmad', 'qalam a7med'],
      why: 'The thing owned comes first, the owner second, and nothing goes between them.',
    },
    {
      kind: 'choose', point: 'The first word never takes ال',
      prompt: 'Which one is wrong?',
      options: ['el-beet el-ostaath', 'beet el-ostaath', 'beet a7mad', 'qalam el-bint'],
      answer: 0,
      why: 'The first word of an idafah never carries ال — it is already definite because of what follows it.',
    },
    {
      kind: 'write', point: 'ال goes on the possessor',
      prompt: 'Write "the teacher\'s house" — two words.',
      accept: ['beet elostaath', 'beet el-ostaath', 'bait elostaath', 'beet elustaath', 'beet el-ustaath'],
      why: 'beet el-ostaath. ال goes on the owner, never on the thing owned.',
    },
    {
      kind: 'choose', point: 'Name vs common noun',
      prompt: 'Why does "qalam a7mad" have no ال anywhere, while "beet el-ostaath" has one?',
      options: [
        'A name is already definite; a common noun needs ال',
        'qalam is masculine and beet is feminine',
        'Because a7mad is shorter',
        'It is a mistake — both should have ال',
      ],
      answer: 0,
      why: 'A7mad names one person already. ostaath could be any teacher until ال pins it down.',
    },
    {
      kind: 'write', point: 'Possessed + possessor',
      prompt: 'Write "the girl\'s school" — two words.',
      accept: ['madraset elbint', 'madraset el-bint', 'madrasat elbint', 'madrasat el-bint', 'madraset elbent'],
      why: 'madraset el-bint. The ة on madrasah hardens to t because another word now leans on it.',
    },
  ],

  // ── 10. Have — and the two negations ───────────────────────────────────
  10: [
    {
      kind: 'write', point: '3ind + suffix',
      prompt: 'Write "I have a car" — two words.',
      accept: ['3indee sayyarah', '3indi sayyarah', '3indee sayyara', '3indi sayyara', '3ind-ee sayyarah'],
      why: '3ind-ee sayyarah. "Have" is not a verb here — it is a preposition with an ending.',
    },
    {
      kind: 'choose', point: 'mish vs maa',
      prompt: 'Which negation goes with 3ind-ee?',
      options: ['maa 3ind-ee', 'mish 3ind-ee', 'laa 3ind-ee', 'bidoon 3ind-ee'],
      answer: 0,
      why: 'maa is the one for verbs and for 3ind. mish is for nouns and adjectives: howwa mish mareed.',
    },
    {
      kind: 'choose', point: 'mish vs maa',
      prompt: 'And which negation goes with "howwa mhandes"?',
      options: ['mish', 'maa', 'both work equally', 'neither — it cannot be negated'],
      answer: 0,
      why: 'mhandes is a noun, so mish. Picking the wrong one of the two is the main thing this lesson tests.',
    },
    {
      kind: 'write', point: '3ind + suffix',
      prompt: 'Ask a man whether he has a pen — two words.',
      accept: ['3indak qalam', '3indak alam', '3indak 2alam', '3ind-ak qalam'],
      why: '3ind-ak qalam? Nothing is added to make it a question — the tone does it.',
    },
    {
      kind: 'choose', point: 'Complex idafah',
      prompt: '"the daughter of the shop owner" — where does ال go?',
      options: [
        'Only on the last word: bint saa7ib el-ma7al',
        'On every word: el-bint el-saa7ib el-ma7al',
        'On the first word only: el-bint saa7ib ma7al',
        'Nowhere at all: bint saa7ib ma7al',
      ],
      answer: 0,
      why: 'In a chain, only the final owner takes ال. Everything before it is made definite by what follows.',
    },
  ],

  // ── 11. Days and Months ────────────────────────────────────────────────
  11: [
    {
      kind: 'write', point: 'ayya = which',
      prompt: 'Ask "which day?" — two words.',
      accept: ['ayya yoom', 'aya yoom', 'ayya yom', 'ayy yoom'],
      why: 'ayya yoom? ayya comes BEFORE the noun, unlike haad in this lesson.',
    },
    {
      kind: 'choose', point: 'haad follows the noun here',
      prompt: 'Which one means "this month"?',
      options: ['shahir haad', 'haad shahir', 'haad esh-shahir', 'esh-shahir'],
      answer: 0,
      why: 'With a time word, haad comes after: shahir haad. haad shahir would be "this is a month".',
    },
    {
      kind: 'choose', point: 'ayya vs haad',
      prompt: 'One asks a question, one points at something. Which pair is the right way round?',
      options: [
        'ayya asks; haad points',
        'haad asks; ayya points',
        'Both ask',
        'Both point',
      ],
      answer: 0,
      why: 'ayya yoom? is a question. shahir haad is pointing at one you both know.',
    },
    {
      kind: 'write', point: 'haad follows the noun here',
      prompt: 'Write "this week" the way this lesson does it — two words.',
      accept: ['jum3a haad', 'jum3ah haad', 'esboo3 haad', 'usboo3 haad', 'jum3a had'],
      why: 'The time word first, haad second — the same shape as shahir haad.',
    },
    {
      kind: 'choose', point: 'ayya = which',
      prompt: 'A student writes "shoo yoom?" meaning "which day?". Why is ayya better?',
      options: [
        'shoo asks WHAT, ayya asks WHICH of a known set',
        'shoo is only for people',
        'shoo cannot start a sentence',
        'There is no difference',
      ],
      answer: 0,
      why: 'Days are a known set of seven, so the question is "which one" — ayya.',
    },
  ],

  // ── 12. That & Ordinal Numbers ─────────────────────────────────────────
  12: [
    {
      kind: 'write', point: 'Near vs far',
      prompt: 'haad is "this (m)". Write the far one — "that (m)".',
      accept: ['hadaak', 'hadak', 'hadaake', 'hadhaak'],
      why: 'hadaak. The near/far pair is haad → hadaak.',
    },
    {
      kind: 'write', point: 'Near vs far',
      prompt: 'Now the feminine far one — "that (f)".',
      accept: ['hadeek', 'hadik', 'hadeeke'],
      why: 'haady → hadeek. Both halves change: nearness and gender.',
    },
    {
      kind: 'choose', point: 'Ordinals take ‑ah',
      prompt: 'Which is the odd one out in how it is formed?',
      options: ['oolaa', 'taanyah', 'taaltah', 'raab3ah'],
      answer: 0,
      why: 'The others all take the feminine ‑ah ending. oolaa (first) is irregular and has to be learnt on its own.',
    },
    {
      kind: 'choose', point: 'feeh / mawjood',
      prompt: 'What do feeh and mawjood have in common?',
      options: [
        'Both say something exists, whatever they literally mean',
        'Both are question words',
        'Both are feminine',
        'Both mean "in"',
      ],
      answer: 0,
      why: 'feeh looks like "in it" and mawjood like "found", but both are used plainly for "there is".',
    },
    {
      kind: 'write', point: 'Ordinals take ‑ah',
      prompt: 'Write "the third lesson" — two words, both definite.',
      accept: ['eddars ettaalit', 'ed-dars et-taalit', 'eddars ettaalet', 'el-7essah et-taaltah', 'el7essah ettaaltah'],
      why: 'Both words take ال, like any noun + adjective pair from lesson 6.',
    },
  ],

  // ── 13. Nationality & Prepositions ─────────────────────────────────────
  13: [
    {
      kind: 'write', point: 'Nisba ‑ee / ‑iyyah',
      prompt: 'masr is Egypt. Write "Egyptian" about a woman.',
      accept: ['masriyyah', 'masriyya', 'masreyyah', 'misriyyah', 'masriyeh'],
      why: 'masr-iyyah. The feminine takes ‑iyyah, not just ‑ah.',
    },
    {
      kind: 'write', point: 'Drop a final stretching letter',
      prompt: 'soorya is Syria. Write "Syrian" about a man.',
      accept: ['sooree', 'soori', 'suuree', 'suri', 'sooriy'],
      why: 'The final stretching letter goes before the ending is added: soorya → soor-ee, not sooryaa-ee.',
    },
    {
      kind: 'write', point: 'Drop the ال first',
      prompt: 'el-urdun is Jordan. Write "Jordanian" about a man.',
      accept: ['urdunee', 'urduni', 'ordonee', 'ordoni', 'urdoni', 'urdunii'],
      why: 'ال is dropped first, then the ending: urdun-ee. el-urdun-ee would keep a "the" that does not belong.',
    },
    {
      kind: 'choose', point: 'Nisba rules together',
      prompt: 'Which of these breaks a rule from this lesson?',
      options: ['el-urdun-ee', 'masr-ee', 'soor-ee', 'masr-iyyah'],
      answer: 0,
      why: 'The ال has to go before the ending is added.',
    },
    {
      kind: 'choose', point: 'Nisba ‑ee / ‑iyyah',
      prompt: 'Why is "masr-ah" wrong for an Egyptian woman?',
      options: [
        'A nationality takes ‑iyyah, not the plain feminine ‑ah',
        'masr is already feminine',
        'Nationalities have no feminine',
        'It is not wrong',
      ],
      answer: 0,
      why: 'The plain ‑ah is for ordinary adjectives. A nationality has its own longer ending.',
    },
  ],

  // ── 14. Elative & Relative Pronoun ─────────────────────────────────────
  14: [
    {
      kind: 'write', point: 'The af3al pattern',
      prompt: 'kabeer means big. Write "bigger".',
      accept: ['akbar', 'aakbar'],
      why: 'The three letters of the adjective are poured into the pattern af3al: k‑b‑r → akbar.',
    },
    {
      kind: 'write', point: 'The af3al pattern',
      prompt: 'Same pattern. qareeb means near — write "nearer".',
      accept: ['aqrab', 'a2rab', 'akrab', 'agrab'],
      why: 'q‑r‑b → aqrab. Once you see the pattern you can build it from any adjective.',
    },
    {
      kind: 'choose', point: 'The af3al pattern',
      prompt: 'Does Arabic have separate words for "bigger" and "biggest"?',
      options: [
        'No — akbar does both, and the sentence decides',
        'Yes — akbar and el-akbar are different words',
        'Yes — akbar and kabeer jiddan',
        'No — there is no comparative at all',
      ],
      answer: 0,
      why: 'One form covers both. That is why it is called the elative rather than the comparative.',
    },
    {
      kind: 'write', point: 'A noun after illy takes a suffix',
      prompt: 'Complete so it means "whose age is twenty": el-walad illy ___ 3ishreen.',
      accept: ['3omroh', '3omro', '3umroh', '3umro', '3omr-oh'],
      why: '3omr-oh — literally "his age". Arabic keeps the owner on the noun where English drops it into "whose".',
    },
    {
      kind: 'choose', point: 'illy joins two sentences',
      prompt: 'What does illy do?',
      options: [
        'Joins two sentences into one',
        'Makes a noun definite',
        'Turns a statement into a question',
        'Marks the comparative',
      ],
      answer: 0,
      why: 'illy is the hinge: "the boy" + "he is tall" becomes "the boy who is tall".',
    },
  ],

  // ── 15. Colors & Grocery ───────────────────────────────────────────────
  15: [
    {
      kind: 'choose', point: 'The ‑ee of the imperative',
      prompt: 'In "tfaddal-ee", what is the ‑ee doing?',
      options: [
        'Marking that you are speaking to a woman',
        'Meaning "my"',
        'Making it a question',
        'Making it plural',
      ],
      answer: 0,
      why: 'This is the trap of the lesson: the possessive ‑ee means "my", but on a command the same sound means you are talking to a woman.',
    },
    {
      kind: 'write', point: 'Colors agree like adjectives',
      prompt: 'a5dar is green. Write "the green tree" — two words, both definite (shajarah = tree, feminine).',
      accept: ['eshshajarah el5adrah', 'esh-shajarah el-5adrah', 'eshshajara el5adra', 'esh-shajara el-khadra', 'eshshajarah elkhadrah'],
      why: 'Colors behave like any adjective: after the noun, feminine to match, and ال on both.',
    },
    {
      kind: 'write', point: 'bi‑ + kam',
      prompt: 'Ask "how much for?" — one word.',
      accept: ['bikam', 'bi-kam', 'bkam', 'beekam'],
      why: 'bi‑ (for) joins kam (how many) into bi-kam.',
    },
    {
      kind: 'write', point: 'bidd conjugates',
      prompt: 'Write "I want" — one word.',
      accept: ['biddee', 'biddi', 'bidee', 'bidi', 'bidd-ee'],
      why: 'bidd takes the same endings as 3ind: bidd-ee, bidd-ak, bidd-ik.',
    },
    {
      kind: 'choose', point: 'bidd conjugates',
      prompt: 'Which one is "she wants"?',
      options: ['bidha', 'biddak', 'biddee', 'biddik'],
      answer: 0,
      why: '‑ha is "her", so bidd-ha. The others are you (m), I, and you (f).',
    },
  ],

  // ── 16. At the Bus Station ─────────────────────────────────────────────
  16: [
    {
      kind: 'choose', point: 'Paired body parts are feminine',
      prompt: 'Which is correct?',
      options: ['eed-ee kabeerah', 'eed-ee kabeer', 'raas-ee kabeerah', 'daan-ee kabeer'],
      answer: 0,
      why: 'eed is a paired body part, so it is feminine whatever its ending — the adjective must be kabeerah.',
    },
    {
      kind: 'choose', point: 'raas is the exception to look out for',
      prompt: 'Which of these is NOT a paired body part, yet is still in the lesson\'s feminine list?',
      options: ['raas', '3een', 'daan', 'eed'],
      answer: 0,
      why: 'You only have one head, but raas goes with the others. It has to be remembered rather than worked out.',
    },
    {
      kind: 'write', point: 'la‑ before a place',
      prompt: 'Write "to the clinic" — one joined word (3iyaadah = clinic).',
      accept: ['lal3iyaadah', 'la-l-3iyaadah', 'lel3iyaadah', 'lal3iyada', 'lil3iyaadah', 'la l 3iyaadah'],
      why: 'la‑ + ال + the noun run together: la-l-3iyaadah.',
    },
    {
      kind: 'write', point: 'la‑ before a place',
      prompt: 'Ask "to where?" — one word.',
      accept: ['lawain', 'la-wain', 'lawein', 'lawen', 'lawayn'],
      why: 'la‑ (to) joins wain (where): la-wain?',
    },
    {
      kind: 'choose', point: 'Paired body parts are feminine',
      prompt: 'Why is "3een-ee kabeer" wrong, when 3een has no ة?',
      options: [
        'Paired body parts are feminine whatever their ending',
        '3een is plural',
        'The suffix ‑ee makes it feminine',
        'It is not wrong',
      ],
      answer: 0,
      why: 'The ة is the usual sign of feminine, but this small group is feminine without it.',
    },
  ],

  // ── 17. At the Airplane ────────────────────────────────────────────────
  17: [
    {
      kind: 'write', point: 'il‑ + suffix = possession',
      prompt: 'Write "mine" — one word.',
      accept: ['ilee', 'ili', 'il-ee', 'elee', 'eli', 'illee'],
      why: 'A hamza in front of لـ turns it into a possessive: il-ee.',
    },
    {
      kind: 'write', point: 'la-meen',
      prompt: 'Ask "whose is it?" / "belongs to who?" — one word.',
      accept: ['lameen', 'la-meen', 'lamin', 'lameeen'],
      why: 'la‑ (belongs to) + meen (who) = la-meen?',
    },
    {
      kind: 'choose', point: 'il‑ vs the noun suffix',
      prompt: 'What is the difference between "beet-ee" and "il-ee"?',
      options: [
        'beet-ee names the thing; il-ee just says it is mine',
        'They are identical',
        'il-ee is feminine',
        'beet-ee is a question',
      ],
      answer: 0,
      why: 'beet-ee is "my house". il-ee answers "whose?" without naming the thing at all.',
    },
    {
      kind: 'write', point: 'il‑ + suffix = possession',
      prompt: 'Answer la-meen with "hers" — one word.',
      accept: ['ilha', 'il-ha', 'elha', 'illha'],
      why: 'il-ha. The endings are the same family as 3ind-ha and bidd-ha.',
    },
    {
      kind: 'choose', point: 'il‑ + suffix = possession',
      prompt: 'Which one means "yours", speaking to a man?',
      options: ['il-ak', 'il-ik', 'il-oh', 'il-ee'],
      answer: 0,
      why: '‑ak is for a man. The same ‑ak/‑ik pair as every lesson since the third.',
    },
  ],

  // ── 18. Numbers 13–19, and the dual ────────────────────────────────────
  18: [
    {
      kind: 'write', point: '13–19 take ‑tashar',
      prompt: 'arba3ah is 4. Write 14.',
      accept: ['arba3tashar', 'arba3-tashar', 'arbatashar', 'arba3taashar'],
      why: 'The ة is dropped and ‑tashar added: arba3-tashar.',
    },
    {
      kind: 'write', point: 'The dual',
      prompt: 'kitaab is a book. Write "two books" — one word.',
      accept: ['kitaabeen', 'kitabeen', 'kitaben', 'kitaabain'],
      why: 'Arabic has a form just for two: add ‑een. You do not say "two books" with a number.',
    },
    {
      kind: 'choose', point: 'The dual',
      prompt: 'Why is "itneen kitaab" not how you say "two books"?',
      options: [
        'Two has its own ending — kitaab-een — so the number is not needed',
        'itneen is feminine',
        'kitaab cannot be counted',
        'It is correct',
      ],
      answer: 0,
      why: 'The dual ending already carries "two". Saying the number as well is the English habit.',
    },
    {
      kind: 'write', point: '20–99',
      prompt: 'Write 23 in words.',
      accept: ['talaatah wi 3ishreen', 'talaata wi 3ishreen', 'talaatah w 3ishreen', 'thalaathah wi 3ishreen', 'talatah wi 3ishreen'],
      why: 'Ones, then wi, then tens — the same shape as 27 in lesson 8.',
    },
    {
      kind: 'choose', point: 'ma3‑ee vs 3ind‑ee',
      prompt: 'You are at the till and want to say the money is ON you right now. Which?',
      options: ['ma3-ee', '3ind-ee', 'il-ee', 'bidd-ee'],
      answer: 0,
      why: 'ma3-ee is "with me" — on my person. 3ind-ee is "I have", which could be at home.',
    },
  ],

  // ── 19. Numbers 20–100 and beyond ──────────────────────────────────────
  19: [
    {
      kind: 'write', point: 'Hundreds take ‑miyyah',
      prompt: 'Write 400 in words — one word.',
      accept: ['arba3miyyah', 'arba3miyya', 'arba3meyyah', 'arba3mieh', 'arba3miyeh'],
      why: 'The digit joins straight onto ‑miyyah: arba3-miyyah.',
    },
    {
      kind: 'write', point: 'Hundreds, then ones, then tens',
      prompt: 'Write 326 in words.',
      accept: [
        'talatmiyyah wi sittah wi 3ishreen', 'talatmiyya wi sittah wi 3ishreen',
        'talatmiyyah w sittah w 3ishreen', 'thalathmiyyah wi sittah wi 3ishreen',
        'talatmiyyah wi sitta wi 3ishreen',
      ],
      why: 'Hundreds first, then the ones, then the tens — so the middle of the number is said last but one.',
    },
    {
      kind: 'choose', point: 'Hundreds, then ones, then tens',
      prompt: 'Someone says "talatmiyyah wi 3ishreen wi sittah" for 326. What is the English habit showing?',
      options: [
        'The tens have been said before the ones',
        'The hundreds are in the wrong place',
        'wi has been used twice',
        'Nothing — it is correct',
      ],
      answer: 0,
      why: 'Only the last two parts are out of order, which makes it easy to miss when you hear it.',
    },
    {
      kind: 'choose', point: 'awwal before a noun',
      prompt: 'Which one means "the first lesson"?',
      options: ['awwal dars', 'ed-dars el-awwal', 'dars awwal', 'el-awwal dars'],
      answer: 0,
      why: 'awwal goes in FRONT of the noun, unlike every other ordinal, which follows it.',
    },
    {
      kind: 'choose', point: 'fee / bi‑ and la‑',
      prompt: 'Which statement is true of fee and bi‑?',
      options: [
        'Both mean "in" and both are correct',
        'fee is correct and bi‑ is a mistake',
        'bi‑ only goes with numbers',
        'They mean opposite things',
      ],
      answer: 0,
      why: 'They are two forms of the same preposition. The same goes for la and la‑.',
    },
  ],

  // ── 20. Verb to Be ─────────────────────────────────────────────────────
  20: [
    {
      kind: 'choose', point: 'beykoon before an adjective',
      prompt: '"el-jaww beykoon baarid bi-sh-shitaa". What does beykoon add?',
      options: [
        'That it is usually so, not just now',
        'That it is happening at this moment',
        'That it happened in the past',
        'Nothing at all',
      ],
      answer: 0,
      why: 'Before an adjective, beykoon makes it a habit: the weather IS COLD in winter, as a rule.',
    },
    {
      kind: 'write', point: 'raa7 + verb = future',
      prompt: 'Write "he will be" — two words. Careful with the second one.',
      accept: ['raa7 yekoon', 'ra7 yekoon', 'raa7 ikoon', 'ra7 ykoon', 'raa7 yikoon'],
      why: 'raa7 yekoon. The second verb drops its ب — beykoon would be one b too many.',
    },
    {
      kind: 'choose', point: 'raa7 + verb = future',
      prompt: 'Why is "raa7 beykoon" wrong?',
      options: [
        'A verb after raa7 drops its ب',
        'raa7 is past, so it cannot start a future',
        'beykoon is feminine',
        'It is not wrong',
      ],
      answer: 0,
      why: 'raa7 already marks the future, so the ب on the second verb has no work left to do.',
    },
    {
      kind: 'choose', point: 'beykoon before a noun',
      prompt: '"howwa ostaath" and "howwa beykoon ostaath" — what does the second add?',
      options: [
        'Emphasis, not a change of meaning',
        'That he used to be a teacher',
        'That he is not a teacher',
        'A question',
      ],
      answer: 0,
      why: 'Before a noun it only leans on the statement. Before an adjective it would mean "usually".',
    },
    {
      kind: 'write', point: 'The present "to be" exists',
      prompt: 'Write "I will be at home" — three words (bi-l-beet = at home).',
      accept: ['raa7 akoon bilbeet', 'ra7 akoon bilbeet', 'raa7 akoon bi-l-beet', 'raa7 akoon belbeet', 'ra7 akoon belbeet', 'raa7 akuun bilbeet'],
      why: 'raa7 akoon bi-l-beet — the "I" form after raa7 is akoon, with no ب.',
    },
  ],
};
