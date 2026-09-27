// services/letterCardsEngine.ts
// -----------------------------------------------------------------------------
// The rules of the card game, with no React and no network in them, so they can
// be read — and tested — on their own.
//
// Both sides always hold the SAME letters: the tutor's copy in the isolated
// shape, the student's in the shape chosen for the game. A right answer takes
// the pair off the table and both draw again. A wrong one sends BOTH letters
// back to the pile and out of both hands, which is what keeps the two sides
// holding the same letters as each other, and costs a life.
// -----------------------------------------------------------------------------

type MatchForm = 'initial' | 'medial' | 'final';
import { ANIMALS, Animal, CardsEnd, CardsMode, HAND_SIZE } from './letterCardsDeck';

export interface Card { letter: string; animal: Animal }

export interface Snap {
  ph: 'dealing' | 'playing' | 'over';
  form: MatchForm;
  mode: CardsMode;
  tutorHand: Card[];
  studentHand: Card[];
  pile: string[];
  thrownTutor: Card | null;
  thrownStudent: Card | null;
  turn: 'tutor' | 'student';
  lives: number | null;
  livesMax: number | null;
  score: number;
  mistakes: number;
  total: number;
  wrongLetters: Record<string, number>;
  /** Bumped on every judgement so both screens flash the same result. */
  flash: { ok: boolean; n: number } | null;
  ended: CardsEnd | null;
}

export const shuffle = <T,>(a: T[], rnd: () => number = Math.random): T[] => {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  return c;
};

/** The animals on the table — a card dealt now never repeats one of them. */
export const animalsInPlay = (s: Pick<Snap, 'tutorHand' | 'studentHand' | 'thrownTutor' | 'thrownStudent'>): Set<Animal> =>
  new Set([
    ...s.tutorHand.map(c => c.animal),
    ...s.studentHand.map(c => c.animal),
    ...(s.thrownTutor ? [s.thrownTutor.animal] : []),
    ...(s.thrownStudent ? [s.thrownStudent.animal] : []),
  ]);

/** Fill both hands back to five from the pile, the same letters on each side. */
export const refill = (s: Snap, rnd: () => number = Math.random): Snap => {
  const tutorHand = [...s.tutorHand];
  const studentHand = [...s.studentHand];
  const pile = [...s.pile];
  const used = animalsInPlay({ tutorHand, studentHand, thrownTutor: s.thrownTutor, thrownStudent: s.thrownStudent });
  const free = shuffle(ANIMALS.filter(a => !used.has(a)), rnd);
  while (tutorHand.length < HAND_SIZE && pile.length > 0) {
    const a1 = free.pop(); const a2 = free.pop();
    if (!a1 || !a2) break;                    // 21 animals covers ten in play
    const letter = pile.shift()!;
    tutorHand.push({ letter, animal: a1 });
    studentHand.push({ letter, animal: a2 });
  }
  return { ...s, tutorHand, studentHand, pile };
};

export const deal = (
  letters: string[], form: MatchForm, lives: number | null, mode: CardsMode,
  rnd: () => number = Math.random,
): Snap => refill({
  ph: 'playing', form, mode,
  tutorHand: [], studentHand: [], pile: shuffle(letters, rnd),
  thrownTutor: null, thrownStudent: null, turn: 'tutor',
  lives, livesMax: lives, score: 0, mistakes: 0, total: letters.length,
  wrongLetters: {}, flash: null, ended: null,
}, rnd);

/** The tutor throws the card at `index`; it is the student's turn next. */
export const throwTutor = (s: Snap, index: number): Snap => {
  const card = s.tutorHand[index];
  if (s.ph !== 'playing' || s.turn !== 'tutor' || !card) return s;
  return { ...s, thrownTutor: card, tutorHand: s.tutorHand.filter((_, i) => i !== index), turn: 'student' };
};

/** The student answers with the card at `index` — not yet judged. */
export const throwStudent = (s: Snap, index: number): Snap => {
  const card = s.studentHand[index];
  if (s.ph !== 'playing' || s.turn !== 'student' || !card) return s;
  return { ...s, thrownStudent: card, studentHand: s.studentHand.filter((_, i) => i !== index) };
};

/** Judge what is on the table, refill, and end the game if it is over. */
export const judge = (s: Snap, rnd: () => number = Math.random): Snap => {
  const t = s.thrownTutor, u = s.thrownStudent;
  if (!t || !u) return s;
  const ok = t.letter === u.letter;
  let next: Snap = { ...s, flash: { ok, n: (s.flash?.n ?? 0) + 1 } };
  if (ok) {
    next = { ...next, score: s.score + 1, thrownTutor: null, thrownStudent: null, turn: 'tutor' };
  } else {
    const back = [t.letter, u.letter];
    next = {
      ...next,
      mistakes: s.mistakes + 1,
      lives: s.lives === null ? null : s.lives - 1,
      wrongLetters: { ...s.wrongLetters, [t.letter]: (s.wrongLetters[t.letter] ?? 0) + 1 },
      tutorHand: s.tutorHand.filter(c => !back.includes(c.letter)),
      studentHand: s.studentHand.filter(c => !back.includes(c.letter)),
      pile: shuffle([...s.pile, ...back], rnd),
      thrownTutor: null, thrownStudent: null, turn: 'tutor',
    };
  }
  next = refill(next, rnd);
  if (next.lives !== null && next.lives <= 0) return { ...next, ph: 'over', ended: 'lives' };
  if (next.pile.length === 0 && next.tutorHand.length === 0) return { ...next, ph: 'over', ended: 'done' };
  return next;
};
