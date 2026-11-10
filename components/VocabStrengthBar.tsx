// ─────────────────────────────────────────────────────────────────────────────
// VocabStrengthBar — how well the student knows a word: ten segments, one per
// of the last ten answers, oldest on the left. Green = knew it, red = didn't
// ("Review later"), grey = not answered that many times yet.
//
// The answers fill from the LEFT and the empty slots trail off to the right,
// so a word's record reads as a bar that grows as it is practised. The whole
// document flips to RTL in the Arabic interface, which mirrored this and put
// the first answer on the right, so the direction is pinned here.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { STRENGTH_SLOTS } from '../services/vocabHomeworkService';

const VocabStrengthBar: React.FC<{ answers: boolean[] }> = ({ answers }) => {
  const recent = answers.slice(-STRENGTH_SLOTS);
  const right = recent.filter(Boolean).length;
  const label = recent.length
    ? `${right} of the last ${recent.length} flashcard answer${recent.length === 1 ? '' : 's'} correct`
    : 'Not practised with flashcards yet';
  // Pad on the RIGHT: the oldest answer sits at the left end and the unused
  // slots wait beyond the newest one.
  const slots: Array<boolean | null> = [
    ...recent,
    ...Array<null>(STRENGTH_SLOTS - recent.length).fill(null),
  ];
  return (
    <div role="img" aria-label={label} title={label} dir="ltr"
      className="flex items-center justify-center gap-[2px] sm:gap-[3px] pt-1">
      {slots.map((s, i) => (
        <span key={i}
          className={`h-3.5 w-[5px] sm:w-2 rounded-[2px] ${
            s === null ? 'bg-slate-200 dark:bg-gray-600'
              : s ? 'bg-emerald-500' : 'bg-red-500'
          }`} />
      ))}
    </div>
  );
};

export default VocabStrengthBar;
