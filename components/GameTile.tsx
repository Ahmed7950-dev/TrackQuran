// components/GameTile.tsx
// ---------------------------------------------------------------------------
// One game or challenge on the Arabic side, drawn the way the Quran alphabet
// rails are: the artwork IS the tile. The picture carries the game's name, so
// a tile with a file shows nothing else — no icon, no label, no hint.
//
// The box is exactly 4:1 — 8:1 for the one that takes a whole row — and the
// picture is object-cover, so a master at that ratio is never cropped: what
// you draw is what is shown. Art lives at /games/arabic/<art>.webp — see
// public/games/arabic/README.md for the spec.
//
// A tile whose file is missing falls back to the icon-and-label card it had
// before, so the pictures can arrive one at a time without anything breaking.
// ---------------------------------------------------------------------------
import React, { useState } from 'react';

export type GameTone = 'amber' | 'sky' | 'teal' | 'rose' | 'orange' | 'violet';

/** Full class strings, never built by hand: Tailwind only ships what it sees. */
const TONE: Record<GameTone, { box: string; chip: string; title: string; hint: string }> = {
  amber: {
    box:   'border-amber-200 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20',
    chip:  'bg-amber-100 dark:bg-amber-900/30',
    title: 'text-amber-800 dark:text-amber-200',
    hint:  'text-amber-600/70 dark:text-amber-300/60',
  },
  sky: {
    box:   'border-sky-200 dark:border-sky-800/60 bg-sky-50/60 dark:bg-sky-900/10 hover:bg-sky-50 dark:hover:bg-sky-900/20',
    chip:  'bg-sky-100 dark:bg-sky-900/30',
    title: 'text-sky-800 dark:text-sky-200',
    hint:  'text-sky-600/70 dark:text-sky-300/60',
  },
  teal: {
    box:   'border-teal-200 dark:border-teal-800/60 bg-teal-50/60 dark:bg-teal-900/10 hover:bg-teal-50 dark:hover:bg-teal-900/20',
    chip:  'bg-teal-100 dark:bg-teal-900/30',
    title: 'text-teal-800 dark:text-teal-200',
    hint:  'text-teal-600/70 dark:text-teal-300/60',
  },
  rose: {
    box:   'border-rose-200 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20',
    chip:  'bg-rose-100 dark:bg-rose-900/30',
    title: 'text-rose-800 dark:text-rose-200',
    hint:  'text-rose-600/70 dark:text-rose-300/60',
  },
  orange: {
    box:   'border-orange-200 dark:border-orange-800/60 bg-orange-50/60 dark:bg-orange-900/10 hover:bg-orange-50 dark:hover:bg-orange-900/20',
    chip:  'bg-orange-100 dark:bg-orange-900/30',
    title: 'text-orange-800 dark:text-orange-200',
    hint:  'text-orange-600/70 dark:text-orange-300/60',
  },
  violet: {
    box:   'border-violet-200 dark:border-violet-800/60 bg-violet-50/60 dark:bg-violet-900/10 hover:bg-violet-50 dark:hover:bg-violet-900/20',
    chip:  'bg-violet-100 dark:bg-violet-900/30',
    title: 'text-violet-800 dark:text-violet-200',
    hint:  'text-violet-600/70 dark:text-violet-300/60',
  },
};

interface Props {
  /** File stem under /games/arabic/ — 'wordcards' loads wordcards.webp. */
  art: string;
  /** Only shown when the artwork is missing; it is the picture's job otherwise. */
  name: string;
  hint?: string;
  icon: string;
  tone: GameTone;
  disabled?: boolean;
  /** The basket is not a game: it takes the whole row, at 8:1. */
  wide?: boolean;
  /** A count or flag that belongs on top of the picture (the basket's total). */
  badge?: React.ReactNode;
  onClick: () => void;
}

const GameTile: React.FC<Props> = ({ art, name, hint, icon, tone, disabled, wide, badge, onClick }) => {
  const [noArt, setNoArt] = useState(false);
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint ? `${name} — ${hint}` : name}
      aria-label={name}
      className={`group relative w-full overflow-hidden rounded-2xl border text-start transition-all duration-150
        disabled:opacity-40 disabled:cursor-default disabled:hover:translate-y-0 ${
        wide ? 'aspect-[8/1] sm:col-span-2' : 'aspect-[4/1]'} ${
        noArt
          ? t.box
          : 'border-transparent hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-black/40'
      }`}
    >
      {noArt ? (
        <span className="relative h-full flex items-center gap-3 px-4">
          <span className={`flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center text-2xl ${t.chip}`}>{icon}</span>
          <span className="min-w-0">
            <span className={`block text-sm font-bold truncate ${t.title}`}>{name}</span>
            {hint && <span className={`block text-xs truncate ${t.hint}`}>{hint}</span>}
          </span>
        </span>
      ) : (
        <img
          src={`/games/arabic/${art}.webp`}
          alt=""
          draggable={false}
          onError={() => setNoArt(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-150 group-hover:scale-[1.015]"
        />
      )}
      {badge}
    </button>
  );
};

export default GameTile;
