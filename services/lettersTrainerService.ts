import { LETTERS_TRAINER_INITIAL_DATA } from './lettersTrainerInitialData';

export const TRAINER_STORAGE_KEY = 'arabic_trainer_v1';

export interface TrainerStudent {
  id: string;
  name: string;
}

export interface TrainerVerse {
  text: string;
  marks: number[];
}

export interface LetterChallenge {
  id: string;
  letters: string[];
  verses: TrainerVerse[];
  highlightOn: boolean;
  createdAt: number;
}

export interface TajweedChallenge {
  id: string;
  ruleName: string;
  verses: TrainerVerse[];
  highlightOn: boolean;
  createdAt: number;
}

export interface TrainerState {
  students: TrainerStudent[];
  challenges: LetterChallenge[];
  tajweedChallenges: TajweedChallenge[];
  completions: { [studentId: string]: { [challengeId: string]: number } };
  tajweedCompletions: { [studentId: string]: { [tajweedId: string]: number } };
}

const defaultState = (): TrainerState => ({
  students: [],
  challenges: [],
  tajweedChallenges: [],
  completions: {},
  tajweedCompletions: {},
});

const normalizeVerse = (v: any): TrainerVerse => {
  if (typeof v === 'string') return { text: v, marks: [] };
  return { text: v.text, marks: Array.isArray(v.marks) ? v.marks : [] };
};

export const normalizeTrainerState = (raw: any): TrainerState => {
  const s = raw && typeof raw === 'object' ? raw : {};
  const out: TrainerState = {
    students: Array.isArray(s.students) ? s.students : [],
    challenges: Array.isArray(s.challenges) ? s.challenges : [],
    tajweedChallenges: Array.isArray(s.tajweedChallenges) ? s.tajweedChallenges : [],
    completions: s.completions && typeof s.completions === 'object' ? s.completions : {},
    tajweedCompletions: s.tajweedCompletions && typeof s.tajweedCompletions === 'object' ? s.tajweedCompletions : {},
  };
  out.challenges.forEach(c => { c.verses = (c.verses || []).map(normalizeVerse); });
  out.tajweedChallenges.forEach(c => { c.verses = (c.verses || []).map(normalizeVerse); });
  return out;
};

export const loadTrainerState = (): TrainerState => {
  try {
    const raw = localStorage.getItem(TRAINER_STORAGE_KEY);
    if (!raw) {
      // First load: seed with the bundled JSON, then persist so the user
      // can edit/delete it from this point on.
      const seeded = normalizeTrainerState(LETTERS_TRAINER_INITIAL_DATA);
      localStorage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return normalizeTrainerState(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to load trainer state:', e);
    return defaultState();
  }
};

export const saveTrainerState = (state: TrainerState): void => {
  localStorage.setItem(TRAINER_STORAGE_KEY, JSON.stringify(state));
};

export const newTrainerId = (): string =>
  'id_' + Math.random().toString(36).slice(2, 10);

// --- Tokenizer ---------------------------------------------------------------

const isCombiningMark = (ch: string): boolean => {
  const c = ch.codePointAt(0)!;
  return (
    (c >= 0x0610 && c <= 0x061A) ||
    (c >= 0x064B && c <= 0x065F) ||
    c === 0x0670 ||
    (c >= 0x06D6 && c <= 0x06ED) ||
    (c >= 0x08D3 && c <= 0x08E1) ||
    (c >= 0x08E3 && c <= 0x08FF) ||
    c === 0x0640
  );
};

export interface VerseToken {
  text: string;
  clickable: boolean;
}

export const tokenizeVerse = (text: string): VerseToken[] => {
  const chars = Array.from(text);
  const tokens: VerseToken[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (/\s/.test(ch)) {
      tokens.push({ text: ch, clickable: false });
      i++;
      continue;
    }
    if (isCombiningMark(ch)) {
      if (tokens.length > 0 && tokens[tokens.length - 1].clickable) {
        tokens[tokens.length - 1].text += ch;
      } else {
        tokens.push({ text: ch, clickable: false });
      }
      i++;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    const isArabicLetter =
      (cp >= 0x0621 && cp <= 0x063A) ||
      (cp >= 0x0641 && cp <= 0x064A) ||
      (cp >= 0x066E && cp <= 0x06D3) ||
      (cp >= 0x06FA && cp <= 0x06FF);
    if (isArabicLetter) {
      let chunk = ch;
      let j = i + 1;
      while (j < chars.length && isCombiningMark(chars[j])) {
        chunk += chars[j];
        j++;
      }
      tokens.push({ text: chunk, clickable: true });
      i = j;
    } else {
      tokens.push({ text: ch, clickable: false });
      i++;
    }
  }
  return tokens;
};

export const autoMatchedIndices = (text: string, targetLetters: string[]): Set<number> => {
  if (!targetLetters || targetLetters.length === 0) return new Set();
  const targets = new Set(targetLetters);
  const out = new Set<number>();
  tokenizeVerse(text).forEach((tok, i) => {
    if (tok.clickable && targets.has(Array.from(tok.text)[0])) out.add(i);
  });
  return out;
};

export const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
