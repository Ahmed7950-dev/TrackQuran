// services/letterCardsDeck.ts
// The pieces of the card game that are just facts — no database, no React — so
// the rules can be loaded and tested on their own.

/** How many cards each side holds. */
export const HAND_SIZE = 5;

/** The animals, one card each. No two cards in play ever share one. */
export const ANIMALS = [
  'beer', 'camel', 'cat', 'chicken', 'cow', 'deer', 'dog', 'eagle', 'elephant',
  'fox', 'gorilla', 'horse', 'kangaroo', 'lion', 'monkey', 'rabbit',
  'rhinoceros', 'sheep', 'tiger', 'wolf', 'zebra',
] as const;
export type Animal = typeof ANIMALS[number];

export type CardsMode = 'multiplayer' | 'tutor';
export type CardsEnd = 'done' | 'lives';

export const animalSrc = (a: Animal): string => `/games/letter-cards/${a}.webp`;
export const CARD_BACK_STUDENT = '/games/letter-cards/backred.webp';
export const CARD_BACK_TUTOR = '/games/letter-cards/backblue.webp';
export const BOARD_BACKGROUND = '/games/letter-cards/background.webp';

/** A card landing on the table, and the chime for a letter answered right. */
export const SOUND_THROW = '/games/letter-cards/card.mp3';
export const SOUND_POINT = '/games/letter-cards/point.m4a';
