import React, { useState } from 'react';
import { ArabicExamItem } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared rendering helpers for the exam pages (taking / preview / result /
// marking). Keeps the student-facing appearance identical everywhere.
// ─────────────────────────────────────────────────────────────────────────────

const FILL_SEP = ' | ';

function parseMatchingPairs(json: string): [string, string][] {
  try { return JSON.parse(json); } catch { return []; }
}

/** Renders a non-question content item (section, divider, headline, …). */
export const ExamContentItem: React.FC<{ item: ArabicExamItem }> = ({ item }) => {
  switch (item.itemType) {
    case 'section':
      return (
        <div className="mt-6 mb-2 border-b-2 border-amber-300 dark:border-amber-700 pb-1">
          <h3 className="text-lg font-extrabold text-amber-700 dark:text-amber-300">{item.content}</h3>
        </div>
      );
    case 'divider':
      return <hr className="my-4 border-slate-200 dark:border-gray-700" />;
    case 'headline':
      return <h4 className="mt-4 mb-1 text-base font-bold text-slate-800 dark:text-slate-100">{item.content}</h4>;
    case 'instruction':
      return (
        <p className="my-2 text-sm font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 rounded-lg px-3 py-2">
          {item.content}
        </p>
      );
    case 'paragraph':
      return <p className="my-2 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{item.content}</p>;
    case 'image':
      return item.imageUrl
        ? <img src={item.imageUrl} alt="" className="my-3 max-w-full rounded-xl border border-slate-200 dark:border-gray-700" />
        : null;
    default:
      return null;
  }
};

/**
 * Fill-in-the-blank with a chip pool. Student taps a chip to "hold" it, then
 * taps a blank slot to place it. Tapping a filled slot returns the chip to the
 * pool. Works on touch and desktop. Tutor marks this type manually.
 */
const FillBlankWithChoices: React.FC<{
  item: ArabicExamItem;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}> = ({ item, value, onChange, disabled }) => {
  const [selected, setSelected] = useState<string | null>(null);

  const parts = (item.content ?? '').split('___');
  const numBlanks = parts.length - 1;
  const blanks = (() => {
    const b = value ? value.split(FILL_SEP) : [];
    while (b.length < numBlanks) b.push('');
    return b.slice(0, numBlanks);
  })();
  const placed = new Set(blanks.filter(Boolean));

  const update = (idx: number, val: string) => {
    const next = [...blanks];
    next[idx] = val;
    onChange?.(next.join(FILL_SEP));
  };

  const handleBlankClick = (idx: number) => {
    if (disabled) return;
    if (blanks[idx]) {
      const removed = blanks[idx];
      update(idx, '');
      setSelected(removed);
    } else if (selected) {
      update(idx, selected);
      setSelected(null);
    }
  };

  const handleChipClick = (opt: string) => {
    if (disabled || placed.has(opt)) return;
    setSelected(prev => prev === opt ? null : opt);
  };

  return (
    <div>
      {/* Text with blank slots */}
      <div className="flex flex-wrap items-center gap-1.5 text-sm leading-loose" dir="auto">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {part && <span className="text-slate-700 dark:text-slate-200">{part}</span>}
            {i < numBlanks && (
              <button
                type="button"
                onClick={() => handleBlankClick(i)}
                className={`inline-flex items-center justify-center min-w-[72px] px-3 py-1 rounded-lg border-2 text-sm font-semibold transition-all ${
                  blanks[i]
                    ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                    : !disabled && selected
                    ? 'border-amber-300 border-dashed bg-amber-50/50 dark:bg-amber-900/10 text-slate-400 animate-pulse'
                    : 'border-slate-300 dark:border-gray-600 border-dashed text-slate-400'
                } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {blanks[i] || (disabled ? '—' : (!disabled && selected ? '↓' : '    '))}
              </button>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Chip pool */}
      {!disabled && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-gray-700">
          {(item.options ?? []).map(opt => {
            const isPlaced = placed.has(opt);
            const isSel = selected === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => handleChipClick(opt)}
                dir="auto"
                className={`px-3 py-1.5 rounded-full border-2 text-sm font-semibold transition-all select-none ${
                  isPlaced
                    ? 'opacity-30 border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-400 cursor-not-allowed line-through'
                    : isSel
                    ? 'border-amber-500 bg-amber-500 text-white shadow-md scale-105 cursor-pointer'
                    : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 hover:border-amber-400 cursor-pointer'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Answer input for a question item. `value` is the stored answer string.
 * fill_blank stores blanks joined by " | ".
 * matching stores JSON: [[left, chosenRight], ...].
 * When `disabled`, inputs are read-only (used by result/marking views).
 */
export const QuestionAnswerInput: React.FC<{
  item: ArabicExamItem;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}> = ({ item, value, onChange, disabled }) => {
  const type = item.questionType;
  const isArabic = type === 'translate_to_arabic';

  // fill_blank WITH choices → special chip-based drag/click UI
  if ((type === 'fill_blank' || type === 'fill_blank_options') && (item.options?.length ?? 0) > 0) {
    return <FillBlankWithChoices item={item} value={value} onChange={onChange} disabled={disabled} />;
  }

  // Multiple choice → option buttons
  if (type === 'multiple_choice') {
    return (
      <div className="space-y-1.5">
        {(item.options ?? []).map((opt, i) => {
          const selected = value === opt;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(opt)}
              dir="auto"
              className={`w-full text-start flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${
                selected
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 font-semibold'
                  : 'border-slate-200 dark:border-gray-600 text-slate-700 dark:text-slate-200 hover:border-amber-300'
              } ${disabled ? 'cursor-default' : ''}`}
            >
              <span className="font-bold text-slate-400 w-5">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  // True / False
  if (type === 'true_false') {
    return (
      <div className="flex gap-3">
        {['True', 'False'].map(v => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(v)}
              className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors ${
                selected
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                  : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'
              } ${disabled ? 'cursor-default' : ''}`}
            >{v}</button>
          );
        })}
      </div>
    );
  }

  // Fill in the blank (no choices) — inline inputs per ___
  if (type === 'fill_blank') {
    const parts = (item.content ?? '').split('___');
    const blanks = value ? value.split(FILL_SEP) : [];
    const setBlank = (idx: number, v: string) => {
      const next = [...blanks];
      while (next.length < parts.length - 1) next.push('');
      next[idx] = v;
      onChange?.(next.join(FILL_SEP));
    };
    return (
      <div className="flex flex-wrap items-center gap-1 text-sm" dir="auto">
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            <span className="text-slate-700 dark:text-slate-200">{part}</span>
            {i < parts.length - 1 && (
              <input
                value={blanks[i] ?? ''}
                disabled={disabled}
                onChange={e => setBlank(i, e.target.value)}
                dir="auto"
                className="inline-block w-28 px-2 py-1 bg-white dark:bg-gray-700 border-b-2 border-amber-400 focus:outline-none focus:border-amber-600 text-sm dark:text-white"
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  // Word matching — left words shown, right side selectable
  if (type === 'matching') {
    const pairs = parseMatchingPairs(item.correctAnswer ?? '[]');
    const leftWords = pairs.map(p => p[0]);
    // Sort right words alphabetically so order doesn't give the answer away
    const rightWords = [...pairs.map(p => p[1])].sort((a, b) => a.localeCompare(b));

    let studentPairs: [string, string][] = [];
    try { if (value) studentPairs = JSON.parse(value); } catch { /* ignore */ }

    const getChosen = (left: string) =>
      studentPairs.find(([l]) => l === left)?.[1] ?? '';

    const updatePair = (left: string, right: string) => {
      const next = leftWords.map(l => [l, l === left ? right : getChosen(l)] as [string, string]);
      onChange?.(JSON.stringify(next));
    };

    return (
      <div className="space-y-2">
        {leftWords.map(left => (
          <div key={left} className="flex items-center gap-3">
            <span className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200 min-w-0" dir="auto">{left}</span>
            <span className="text-slate-400 text-sm flex-shrink-0">→</span>
            <select
              value={getChosen(left)}
              disabled={disabled}
              onChange={e => updatePair(left, e.target.value)}
              dir="auto"
              className={`flex-1 min-w-0 px-2 py-1.5 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm dark:text-white ${disabled ? 'cursor-default' : ''}`}
            >
              <option value="">— choose —</option>
              {rightWords.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  // Short answer — textarea
  if (type === 'short_answer') {
    return (
      <textarea
        value={value}
        disabled={disabled}
        onChange={e => onChange?.(e.target.value)}
        rows={3}
        dir="auto"
        placeholder={disabled ? '' : 'Write your answer here…'}
        className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white resize-none"
      />
    );
  }

  // Free-text (translate_to_arabic / translate_to_english / fallback)
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={e => onChange?.(e.target.value)}
      dir={isArabic ? 'rtl' : 'ltr'}
      placeholder={disabled ? '' : 'Type your answer…'}
      className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
    />
  );
};

/**
 * Renders the "correct answer" hint under a question — handles matching pairs
 * specially instead of showing raw JSON.
 */
export const CorrectAnswerHint: React.FC<{ item: ArabicExamItem }> = ({ item }) => {
  if (!item.correctAnswer) return null;
  if (item.questionType === 'matching') {
    const pairs = parseMatchingPairs(item.correctAnswer);
    if (pairs.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="text-xs font-bold text-green-700 dark:text-green-300 mb-0.5">✔ Correct pairs:</p>
        <div className="space-y-0.5 pl-2">
          {pairs.map(([l, r]) => (
            <p key={l} className="text-xs text-green-700 dark:text-green-300">{l} → {r}</p>
          ))}
        </div>
      </div>
    );
  }
  return (
    <p className="text-xs text-green-700 dark:text-green-300 mt-2">
      ✔ Correct answer: <span dir="auto" className="font-semibold">{item.correctAnswer}</span>
    </p>
  );
};

/** Sequential display number for a question among all items (1-based). */
export function questionNumbers(items: ArabicExamItem[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const it of items) if (it.itemType === 'question') map.set(it.id, ++n);
  return map;
}
