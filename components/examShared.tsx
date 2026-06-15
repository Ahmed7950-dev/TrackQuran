import React from 'react';
import { ArabicExamItem } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Shared rendering helpers for the exam pages (taking / preview / result /
// marking). Keeps the student-facing appearance identical everywhere.
// ─────────────────────────────────────────────────────────────────────────────

const FILL_SEP = ' | ';

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
 * Answer input for a question item. `value` is the stored answer string
 * (fill_blank stores blanks joined by " | "). When `disabled`, inputs are
 * read-only (used by result/marking views).
 */
export const QuestionAnswerInput: React.FC<{
  item: ArabicExamItem;
  value: string;
  onChange?: (v: string) => void;
  disabled?: boolean;
}> = ({ item, value, onChange, disabled }) => {
  const type = item.questionType;
  const isArabic = type === 'translate_to_arabic';

  // Multiple choice & fill-blank-with-options → single-select option buttons
  if (type === 'multiple_choice' || type === 'fill_blank_options') {
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

  // Fill in the blank — render an input for each ___ in the prompt
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

/** Sequential display number for a question among all items (1-based). */
export function questionNumbers(items: ArabicExamItem[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const it of items) if (it.itemType === 'question') map.set(it.id, ++n);
  return map;
}
