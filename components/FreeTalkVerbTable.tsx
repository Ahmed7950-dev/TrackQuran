// ─────────────────────────────────────────────────────────────────────────────
// FreeTalkVerbTable — the Free Talk verbs as ONE table (the "Table" view next to
// the cards). Each verb is a group of rows, one row per tense it has a form in,
// with the pronouns across the top. Only what was written shows: a form not
// added yet is a faint dot, a pronoun that has no imperative is hatched.
//
// Arabic script reads right to left, so the table does too. The verb and tense
// columns stay pinned while a wide table (a phone, or MSA with the dual)
// scrolls sideways. Search dims the verbs that don't match, as on the cards.
// Design: claude.ai/artifact/UxR4S2VV8GHKw8dSDd7dP7.
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { ArabicVerb, TENSES, TenseKey, VerbScript, VerbVariety } from '../services/arabicVerbsService';
import { PronounGroup, hasDual, pronounLabel, pronounsFor, tableOrder } from '../utils/arabicVerbPronouns';
import { AR_FONT, TENSE_NAME, TENSE_TONE, cellText, filledKeys, headword, showMeaning } from '../utils/freeTalkVerbs';

const GROUP_NAME: Record<PronounGroup, string> = { singular: 'Singular', dual: 'Dual', plural: 'Plural' };

interface Props {
  verbs: ArabicVerb[];
  variety: VerbVariety;
  script: VerbScript;
  /** Search: the ids that match, or null when nothing is searched. */
  matches: Set<string> | null;
  onEdit?: (v: ArabicVerb) => void;
}

const FreeTalkVerbTable: React.FC<Props> = ({ verbs, variety, script, matches, onEdit }) => {
  const ar = script === 'arabic';

  // The columns: the singular always, the dual and the plural once any verb has them.
  const groups: { key: PronounGroup; first: boolean }[] = [{ key: 'singular', first: true }];
  if (hasDual(variety) && verbs.some(v => TENSES.some(t => v.conjugations[t]?.dual))) groups.push({ key: 'dual', first: false });
  if (verbs.some(v => TENSES.some(t => v.conjugations[t]?.plural))) groups.push({ key: 'plural', first: false });
  const columns = groups.flatMap(g => pronounsFor(variety, 'past', g.key).map((p, i) => ({ p, groupEdge: i === 0 && !g.first })));
  const groupSizes = groups.map(g => ({ ...g, size: pronounsFor(variety, 'past', g.key).length }));
  const hasImperative = new Set(tableOrder(variety, 'imperative', true, true).map(p => p.key));

  // Pinned columns: an opaque background so the scrolled cells pass under them.
  const pinVerb = 'sticky start-0 w-[108px] min-w-[108px] max-w-[108px] sm:w-[176px] sm:min-w-[176px] sm:max-w-[176px]';
  const pinTense = `sticky start-[108px] sm:start-[176px] ${ar ? 'shadow-[-8px_0_10px_-9px_rgba(15,23,42,0.45)]' : 'shadow-[8px_0_10px_-9px_rgba(15,23,42,0.45)]'}`;
  const formText = ar
    ? 'text-[20px] sm:text-[23px] font-bold leading-[1.5]'
    : 'text-[13.5px] sm:text-[15px] font-semibold leading-[1.4]';

  return (
    <div dir={ar ? 'rtl' : 'ltr'} className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <table className="w-full border-separate border-spacing-0 text-slate-900 dark:text-slate-100">
        <caption className="sr-only">Verbs and their conjugations</caption>
        <thead>
          <tr>
            <th rowSpan={2} scope="col" className={`${pinVerb} z-[2] bg-slate-50 dark:bg-gray-900 px-2.5 sm:px-4 pb-2.5 align-bottom text-start text-[10.5px] sm:text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400`}>Verb</th>
            <th rowSpan={2} scope="col" className={`${pinTense} z-[2] bg-slate-50 dark:bg-gray-900 px-2 sm:px-2.5 pb-2.5 align-bottom text-start text-[10.5px] sm:text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400`}>Tense</th>
            {groupSizes.map(g => (
              <th key={g.key} colSpan={g.size} scope="colgroup"
                className={`bg-slate-50 dark:bg-gray-900 pt-2.5 pb-0.5 px-2 text-center text-[10.5px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400 ${g.first ? '' : 'border-s border-slate-200 dark:border-gray-700'}`}>
                {GROUP_NAME[g.key]}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map(({ p, groupEdge }) => (
              <th key={p.key} scope="col"
                className={`bg-slate-50 dark:bg-gray-900 px-2 pt-1 pb-2 text-center align-bottom min-w-[86px] sm:min-w-[96px] ${groupEdge ? 'border-s border-slate-200 dark:border-gray-700' : ''}`}>
                <span dir={ar ? 'rtl' : 'ltr'} className={`block whitespace-nowrap font-bold text-slate-700 dark:text-slate-200 ${ar ? 'text-[17px] sm:text-[19px] leading-[1.4]' : 'text-[12.5px] sm:text-[13.5px]'}`}
                  style={ar ? { fontFamily: AR_FONT } : undefined}>{pronounLabel(p, script)}</span>
                {ar && <span dir="ltr" className="block whitespace-nowrap text-[11px] font-semibold text-slate-500 dark:text-slate-400">{p.tr}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verbs.map(v => {
            const written = TENSES.filter(t => filledKeys(v, t, script).length > 0);
            const rows: (TenseKey | null)[] = written.length ? written : [null];
            const dim = matches ? !matches.has(v.id) : false;
            const hit = matches ? matches.has(v.id) : false;
            const head = headword(v, script);
            return rows.map((tense, ri) => {
              const t = tense ? v.conjugations[tense] : undefined;
              const shown = tense && t ? new Set(tableOrder(v.variety, tense, t.dual, t.plural).map(p => p.key)) : new Set<string>();
              const top = ri === 0 ? 'border-t border-slate-200 dark:border-gray-700' : 'border-t border-slate-100 dark:border-gray-700/60';
              return (
                <tr key={`${v.id}-${tense ?? 'none'}`} className={`transition-opacity ${dim ? 'opacity-25' : ''}`}>
                  {ri === 0 && (
                    <th rowSpan={rows.length} scope="rowgroup"
                      onDoubleClick={onEdit ? () => onEdit(v) : undefined}
                      className={`${pinVerb} z-[1] ${top} bg-white dark:bg-gray-800 px-2.5 sm:px-4 py-2 text-start align-middle font-normal`}>
                      <span className="flex items-start gap-1 sm:gap-1.5">
                        <span className="flex-1 min-w-0">
                          <span dir="ltr" className={`block text-[11px] sm:text-[12.5px] font-bold leading-snug break-words ${hit ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-600 dark:text-slate-300'}`}>{showMeaning(v.meaning)}</span>
                          <span dir={ar ? 'rtl' : 'ltr'} className={`block font-bold truncate ${ar ? 'text-[21px] sm:text-[27px] leading-[1.55]' : 'text-[15px] sm:text-[18px] leading-[1.35]'}`}
                            style={ar ? { fontFamily: AR_FONT } : undefined}>{head || '·'}</span>
                        </span>
                        {onEdit && (
                          <button type="button" onClick={() => onEdit(v)} aria-label={`Edit ${showMeaning(v.meaning)}`} title="Edit"
                            className="flex-shrink-0 -me-1 sm:me-0 mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-900/40 dark:hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.86 4.49 1.69-1.69a1.875 1.875 0 1 1 2.65 2.65L6.83 19.82a4.5 4.5 0 0 1-1.9 1.13L2 22l1.05-2.93a4.5 4.5 0 0 1 1.13-1.9L16.86 4.49Z" /></svg>
                          </button>
                        )}
                      </span>
                    </th>
                  )}
                  <td className={`${pinTense} z-[1] ${top} bg-white dark:bg-gray-800 px-2 sm:px-2.5 align-middle`}>
                    {tense && (
                      <span className={`inline-block whitespace-nowrap text-[10.5px] sm:text-[11.5px] font-bold px-2 py-0.5 rounded-full ${TENSE_TONE[tense]}`}>
                        <span className="sm:hidden">{tense === 'present' ? 'Pres' : tense === 'imperative' ? 'Imp' : 'Past'}</span>
                        <span className="hidden sm:inline">{TENSE_NAME[tense]}</span>
                      </span>
                    )}
                  </td>
                  {columns.map(({ p, groupEdge }) => {
                    const none = tense === 'imperative' && !hasImperative.has(p.key);
                    const text = tense && t && shown.has(p.key) ? cellText(t, p.key, script) : '';
                    return (
                      <td key={p.key}
                        className={`${top} ${groupEdge ? 'border-s border-slate-200 dark:border-gray-700' : ''} ${none ? 'ftv-none' : ''} h-12 sm:h-[54px] px-1.5 text-center align-middle whitespace-nowrap`}>
                        {none ? <span className="sr-only">none</span>
                          : text ? (
                            <span dir={ar ? 'rtl' : 'ltr'} className={formText} style={ar ? { fontFamily: AR_FONT } : undefined}>{text}</span>
                          ) : (
                            <><span aria-hidden="true" className="text-[18px] text-slate-300 dark:text-gray-600">·</span><span className="sr-only">not added</span></>
                          )}
                      </td>
                    );
                  })}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
};

export default FreeTalkVerbTable;
