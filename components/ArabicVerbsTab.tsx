// ─────────────────────────────────────────────────────────────────────────────
// ArabicVerbsTab — the Verbs tool on an Arabic student's page.
//
//   · The tutor writes a verb once: its English meaning, then up to three
//     tables (past, present, imperative), each starting with the singular
//     pronouns and growing a dual (MSA only) and a plural column on request.
//   · Every verb belongs to a variety, and every student of this tutor who
//     learns that variety sees it. Each cell keeps both writings, so the
//     Arabic-script student and the transliteration student share one card.
//   · The page is a wall of small cards. Search lights the matching ones up
//     green and dims the rest. Open a card and it plays its own conjugations
//     in place: ←/→ through the pronouns, ↑/↓ through the tenses, only what
//     was written; on a phone the same by swiping the card.
//   · Students see the page from level 2 on, read-only. The tutor can always
//     open it, picks the script once per student, and edits. The variety
//     comes from the student's details (what was chosen when they were added);
//     only a student learning both gets a switch.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArabicStudent } from '../types';
import {
  ArabicVerb, TENSES, TenseKey, VerbPrefs, VerbScript, VerbTable, VerbVariety,
  deleteVerb, getVerbPrefs, listVerbs, saveVerb, saveVerbPrefs,
} from '../services/arabicVerbsService';
import {
  PronounGroup, hasDual, normForSearch, pronounLabel, pronounsFor, tableOrder,
} from '../utils/arabicVerbPronouns';

const TENSE_NAME: Record<TenseKey, string> = { past: 'Past', present: 'Present', imperative: 'Imperative' };
const TENSE_SHORT: Record<TenseKey, string> = { past: 'Past', present: 'Pres', imperative: 'Imp' };
const VARIETY_NAME: Record<VerbVariety, string> = { levantine: 'Palestinian', msa: 'MSA' };
const AR_FONT = "'Amiri', 'Amiri Regular', serif";

const cellText = (t: VerbTable | undefined, key: string, script: VerbScript) =>
  ((script === 'arabic' ? t?.cells[key]?.ar : t?.cells[key]?.tr) ?? '').trim();

/** The pronouns of one tense that actually have a form in this script. */
function filledKeys(v: ArabicVerb, tense: TenseKey, script: VerbScript): string[] {
  const t = v.conjugations[tense];
  if (!t) return [];
  return tableOrder(v.variety, tense, t.dual, t.plural).map(p => p.key).filter(k => cellText(t, k, script));
}

/** The form that names the card: "he" in the past, as a dictionary does. */
function headword(v: ArabicVerb, script: VerbScript): string {
  const he = cellText(v.conjugations.past, 's3m', script);
  if (he) return he;
  for (const tense of TENSES) {
    const k = filledKeys(v, tense, script)[0];
    if (k) return cellText(v.conjugations[tense], k, script);
  }
  return '';
}

const learnsBothOf = (s: ArabicStudent) => s.arabicDialects.includes('msa') && s.arabicDialects.includes('levantine');

/** The variety from the student's details: Palestinian when they learn Levantine, else MSA. */
function defaultVariety(s: ArabicStudent): VerbVariety {
  return s.arabicDialects.includes('levantine') || !s.arabicDialects.includes('msa') ? 'levantine' : 'msa';
}

// ── One card ────────────────────────────────────────────────────────────────

interface Pos { tense: TenseKey; key: string }

const VerbCard: React.FC<{
  verb: ArabicVerb;
  script: VerbScript;
  open: Pos | null;
  match: 'hit' | 'dim' | null;
  onOpen: (p: Pos | null) => void;
  onEdit?: () => void;
}> = ({ verb, script, open, match, onOpen, onEdit }) => {
  const ar = script === 'arabic';
  const tenses = TENSES.filter(t => filledKeys(verb, t, script).length > 0);
  const head = headword(verb, script);
  const first: Pos | null = tenses.length ? { tense: tenses[0], key: filledKeys(verb, tenses[0], script)[0] } : null;
  const pos = open ?? null;
  const keys = pos ? filledKeys(verb, pos.tense, script) : [];
  const touch = useRef<{ x: number; y: number } | null>(null);

  const move = (dTense: number, dKey: number) => {
    const cur = pos ?? first;
    if (!cur) return;
    if (dTense) {
      const nt = tenses[tenses.indexOf(cur.tense) + dTense];
      if (!nt) return;
      const nk = filledKeys(verb, nt, script);
      onOpen({ tense: nt, key: nk.includes(cur.key) ? cur.key : nk[0] });
    } else {
      const ks = filledKeys(verb, cur.tense, script);
      const nk = ks[ks.indexOf(cur.key) + dKey];
      if (nk) onOpen({ tense: cur.tense, key: nk });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onOpen(null); return; }
    if (e.key === 'Enter' && !pos && first) { e.preventDefault(); onOpen(first); return; }
    const map: Record<string, [number, number]> = ar
      // Arabic reads right to left: the arrow moves the way the eye does.
      ? { ArrowLeft: [0, 1], ArrowRight: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }
      : { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    if (!pos) { if (first) onOpen(first); return; }
    move(m[0], m[1]);
  };

  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current; touch.current = null;
    if (!s || !pos) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    if (Math.abs(dx) > Math.abs(dy)) move(0, (ar ? dx > 0 : dx < 0) ? 1 : -1);
    else move(dy < 0 ? 1 : -1, 0);
  };

  const ring = match === 'hit'
    ? 'border-2 border-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18),0_0_26px_rgba(16,185,129,0.55)]'
    : pos ? 'border-2 border-amber-500 shadow-[0_10px_26px_rgba(217,119,6,0.18)]'
    : 'border border-slate-200 dark:border-gray-700 shadow-sm hover:-translate-y-px';

  return (
    <div className={`relative ${pos ? 'col-span-2 sm:col-span-1' : ''}`}>
      <button
        type="button"
        onClick={() => { if (!pos && first) onOpen(first); }}
        onDoubleClick={onEdit}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-label={`${verb.meaning}${head ? `, ${head}` : ''}`}
        aria-expanded={!!pos}
        className={`w-full text-start rounded-2xl bg-white dark:bg-gray-800 px-4 py-3.5 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${pos ? 'h-[150px] sm:h-[128px]' : 'h-[112px] sm:h-[128px]'} ${ring} ${match === 'dim' ? 'opacity-25 grayscale' : ''}`}
        style={{ touchAction: pos ? 'none' : 'pan-y' }}
      >
        {!pos ? (
          <span className="flex flex-col-reverse justify-between sm:flex-row sm:items-center sm:justify-start gap-1.5 sm:gap-3 h-full">
            <span className="sm:flex-1 min-w-0">
              <span className="block text-[13px] font-bold text-slate-600 dark:text-slate-300 truncate">{verb.meaning}</span>
              <span className="flex gap-1 mt-2">
                {TENSES.map(t => (
                  <span key={t} className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded-full ${tenses.includes(t)
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-300 dark:bg-gray-700 dark:text-gray-500 line-through'}`}>{TENSE_SHORT[t]}</span>
                ))}
              </span>
            </span>
            <span dir={ar ? 'rtl' : 'ltr'} className="self-end sm:self-auto whitespace-nowrap text-slate-900 dark:text-slate-100 font-bold leading-[1.35]"
              style={ar ? { fontFamily: AR_FONT, fontSize: 32 } : { fontSize: 22 }}>{head || '·'}</span>
          </span>
        ) : (
          <span className="flex flex-col h-full gap-1.5">
            <span className="flex items-center gap-1.5">
              {tenses.map(t => (
                <span key={t} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${t === pos.tense
                  ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-gray-700 dark:text-slate-300'}`}>{TENSE_NAME[t]}</span>
              ))}
              <span className="flex-1" />
              <span className="text-[11px] font-semibold text-slate-400 truncate max-w-[40%]">{verb.meaning}</span>
            </span>
            <span dir={ar ? 'rtl' : 'ltr'} className="flex-1 flex items-center justify-between gap-2 min-h-0">
              <span className="px-2.5 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300 font-bold"
                style={ar ? { fontFamily: AR_FONT, fontSize: 15 } : { fontSize: 12 }}>
                {pronounLabel(tableOrder(verb.variety, pos.tense, true, true).find(p => p.key === pos.key) ?? { key: '', ar: '', tr: '' }, script)}
              </span>
              <span className="font-bold leading-none text-slate-900 dark:text-slate-100 truncate"
                style={ar ? { fontFamily: AR_FONT, fontSize: 32 } : { fontSize: 24 }}>
                {cellText(verb.conjugations[pos.tense], pos.key, script)}
              </span>
            </span>
            <span dir={ar ? 'rtl' : 'ltr'} className="flex items-center justify-center gap-1" aria-hidden="true">
              {keys.map(k => (
                <span key={k} className={`h-1.5 rounded-full transition-all ${k === pos.key ? 'w-4 bg-amber-600' : 'w-1.5 bg-slate-200 dark:bg-gray-600'}`} />
              ))}
            </span>
            <span className="sm:hidden text-center text-[10.5px] text-slate-400">Swipe sideways for pronouns, up or down for tenses</span>
          </span>
        )}
      </button>
      {pos && onEdit && (
        <button type="button" onClick={onEdit} aria-label={`Edit ${verb.meaning}`}
          className="absolute -top-2 -end-2 w-8 h-8 rounded-full bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 shadow flex items-center justify-center text-slate-500 hover:text-amber-700">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m16.86 4.49 1.69-1.69a1.875 1.875 0 1 1 2.65 2.65L6.83 19.82a4.5 4.5 0 0 1-1.9 1.13L2 22l1.05-2.93a4.5 4.5 0 0 1 1.13-1.9L16.86 4.49Z" /></svg>
        </button>
      )}
    </div>
  );
};

// ── The editor ──────────────────────────────────────────────────────────────

const emptyTable = (): VerbTable => ({ dual: false, plural: false, cells: {} });

const VerbEditor: React.FC<{
  initial: ArabicVerb | null;
  variety: VerbVariety;
  script: VerbScript;
  teacherId: string;
  onDone: (changed: boolean) => void;
}> = ({ initial, variety, script, teacherId, onDone }) => {
  const ar = script === 'arabic';
  const [meaning, setMeaning] = useState(initial?.meaning ?? '');
  const [tables, setTables] = useState<Partial<Record<TenseKey, VerbTable>>>(() =>
    initial ? JSON.parse(JSON.stringify(initial.conjugations)) : { past: emptyTable() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setCell = (tense: TenseKey, key: string, value: string) => setTables(prev => {
    const t = prev[tense] ?? emptyTable();
    const cell = { ...(t.cells[key] ?? {}), [ar ? 'ar' : 'tr']: value };
    return { ...prev, [tense]: { ...t, cells: { ...t.cells, [key]: cell } } };
  });
  const setFlag = (tense: TenseKey, flag: 'dual' | 'plural', on: boolean) =>
    setTables(prev => ({ ...prev, [tense]: { ...(prev[tense] ?? emptyTable()), [flag]: on } }));

  const anyFilled = TENSES.some(t => tables[t] && tableOrder(variety, t, tables[t]!.dual, tables[t]!.plural)
    .some(p => cellText(tables[t], p.key, script) || (tables[t]!.cells[p.key]?.[ar ? 'tr' : 'ar'] ?? '').trim()));

  const save = async () => {
    if (!meaning.trim()) { setError('Write the meaning in English first.'); return; }
    if (!anyFilled) { setError('Fill at least one cell.'); return; }
    // Keep only the cells of the columns and tables that are showing.
    const clean: Partial<Record<TenseKey, VerbTable>> = {};
    for (const t of TENSES) {
      const tb = tables[t];
      if (!tb) continue;
      const cells: VerbTable['cells'] = {};
      for (const p of tableOrder(variety, t, tb.dual, tb.plural)) {
        const c = tb.cells[p.key];
        const a = c?.ar?.trim(), r = c?.tr?.trim();
        if (a || r) cells[p.key] = { ...(a ? { ar: a } : {}), ...(r ? { tr: r } : {}) };
      }
      clean[t] = { dual: tb.dual && hasDual(variety), plural: tb.plural, cells };
    }
    setBusy(true); setError(null);
    const res = await saveVerb({ id: initial?.id, teacherId, variety, meaning, conjugations: clean });
    setBusy(false);
    if (typeof res === 'string') { setError(`Not saved: ${res}`); return; }
    onDone(true);
  };

  const remove = async () => {
    if (!initial) return;
    setBusy(true);
    const err = await deleteVerb(initial.id);
    setBusy(false);
    if (err) { setError(`Not deleted: ${err}`); return; }
    onDone(true);
  };

  const groupLabel: Record<PronounGroup, string> = { singular: 'Singular', dual: 'Dual', plural: 'Plural' };

  const table = (tense: TenseKey) => {
    const tb = tables[tense]!;
    const groups: PronounGroup[] = ['singular', ...(tb.dual && hasDual(variety) ? ['dual' as const] : []), ...(tb.plural ? ['plural' as const] : [])];
    const adds = [
      ...(!tb.dual && hasDual(variety) && pronounsFor(variety, tense, 'dual').length ? [{ label: 'Add dual', go: () => setFlag(tense, 'dual', true) }] : []),
      ...(!tb.plural ? [{ label: 'Add plural', go: () => setFlag(tense, 'plural', true) }] : []),
    ];
    return (
      <section key={tense} aria-label={`${TENSE_NAME[tense]} tense`}
        className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 sm:px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2.5">
          <span className="text-sm font-extrabold text-amber-800 dark:text-amber-300">{TENSE_NAME[tense]}</span>
          {tense === 'imperative' && <span className="hidden sm:inline text-xs text-amber-700 dark:text-amber-400">only the "you" pronouns have an imperative</span>}
          <span className="flex-1" />
          {tense !== 'past' && (
            <button type="button" onClick={() => setTables(prev => { const n = { ...prev }; delete n[tense]; return n; })}
              className="h-8 px-2.5 rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40">Remove table</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <div dir={ar ? 'rtl' : 'ltr'} className="flex flex-col sm:flex-row sm:items-stretch gap-4 p-4 sm:p-5 sm:min-w-max">
            {groups.map(g => (
              <div key={g} className="flex flex-col gap-2">
                <span dir="ltr" className={`flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400 ${ar ? 'self-end sm:self-start' : ''}`}>
                  {groupLabel[g]}
                  {g !== 'singular' && (
                    <button type="button" onClick={() => setFlag(tense, g === 'dual' ? 'dual' : 'plural', false)} aria-label={`Remove ${groupLabel[g].toLowerCase()}`}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-gray-700">×</button>
                  )}
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  {pronounsFor(variety, tense, g).map(p => {
                    const other = (tb.cells[p.key]?.[ar ? 'tr' : 'ar'] ?? '').trim();
                    return (
                      <label key={p.key} className="flex sm:flex-col items-center sm:items-stretch gap-2.5 sm:gap-1.5 sm:w-[118px]">
                        <span className="w-[76px] sm:w-auto flex-shrink-0 text-center py-1.5 rounded-lg bg-slate-50 dark:bg-gray-700/60 border border-slate-200 dark:border-gray-600 text-amber-700 dark:text-amber-300 font-bold"
                          style={ar ? { fontFamily: AR_FONT, fontSize: 17 } : { fontSize: 13 }}>{pronounLabel(p, script)}</span>
                        <span className="flex-1 sm:flex-none flex flex-col gap-0.5 min-w-0">
                          <input
                            dir={ar ? 'rtl' : 'ltr'}
                            aria-label={`${TENSE_NAME[tense]}, ${p.tr}`}
                            value={(ar ? tb.cells[p.key]?.ar : tb.cells[p.key]?.tr) ?? ''}
                            onChange={e => setCell(tense, p.key, e.target.value)}
                            placeholder="…"
                            className="w-full h-11 px-2.5 text-center rounded-[10px] border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                            style={ar ? { fontFamily: AR_FONT, fontSize: 20, fontWeight: 700 } : { fontSize: 14, fontWeight: 600 }}
                          />
                          {other && <span dir={ar ? 'ltr' : 'rtl'} className="text-[11px] text-center text-slate-400 truncate" title="Written in the other script">{other}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {adds.length > 0 && (
              <div dir="ltr" className="flex sm:flex-col justify-start sm:justify-end gap-1.5">
                {adds.map(a => (
                  <button key={a.label} type="button" onClick={a.go}
                    className="h-9 px-3 rounded-[10px] border border-dashed border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-bold whitespace-nowrap hover:bg-amber-100">
                    + {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  const tableAdds = (['present', 'imperative'] as TenseKey[]).filter(t => !tables[t]);

  return (
    <div className="flex flex-col gap-4 pb-28">
      <button type="button" onClick={() => onDone(false)}
        className="self-start flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4 rtl:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        Verbs
      </button>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{initial ? 'Edit verb' : 'New verb'}</h2>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
            Saved to the {VARIETY_NAME[variety]} verbs, so every student learning {VARIETY_NAME[variety]} sees it.
          </p>
        </div>
        <span className="text-xs font-bold text-amber-800 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 px-3 py-1.5 rounded-full">
          {VARIETY_NAME[variety]} · {ar ? 'Arabic script' : 'Transliteration'}
        </span>
      </div>

      <label className="flex flex-col gap-1.5 max-w-[520px] text-[13px] font-bold text-slate-700 dark:text-slate-200">
        Meaning in English
        <input value={meaning} onChange={e => setMeaning(e.target.value)} placeholder="to write" autoFocus={!initial}
          className="h-12 px-3.5 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-base font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" />
      </label>

      {TENSES.filter(t => tables[t]).map(table)}

      {tableAdds.length > 0 && (
        <div className="grid grid-cols-2 sm:flex gap-2.5">
          {tableAdds.map(t => (
            <button key={t} type="button" onClick={() => setTables(prev => ({ ...prev, [t]: emptyTable() }))}
              className="h-12 px-5 rounded-xl border border-dashed border-slate-400 bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-amber-50 dark:hover:bg-gray-700">
              + {t === 'present' ? 'Present tense' : 'Imperative'}
            </button>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 bg-white/95 dark:bg-gray-800/95 backdrop-blur border-t border-slate-200 dark:border-gray-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-2.5">
          {error
            ? <span role="alert" className="text-[13px] font-semibold text-red-600 dark:text-red-400 truncate">{error}</span>
            : <span className="hidden sm:inline text-[13px] text-slate-500 dark:text-slate-400">Empty cells are fine. They are skipped when the card is played.</span>}
          <span className="flex-1" />
          {initial && (confirmDelete ? (
            <>
              <span className="text-xs font-semibold text-red-600">Delete for every student?</span>
              <button type="button" disabled={busy} onClick={remove} className="h-11 px-3 rounded-xl bg-red-600 text-white text-sm font-bold">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 px-3 rounded-xl bg-slate-100 dark:bg-gray-700 text-sm font-semibold">Keep</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-11 px-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Delete</button>
          ))}
          <button type="button" onClick={() => onDone(false)} className="h-11 px-4 rounded-xl border border-slate-300 dark:border-gray-600 text-sm font-bold text-slate-700 dark:text-slate-200">Cancel</button>
          <button type="button" disabled={busy} onClick={save}
            className="h-11 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-extrabold">{busy ? 'Saving…' : 'Save verb'}</button>
        </div>
      </div>
    </div>
  );
};

// ── First open, tutor: the script, once ─────────────────────────────────────

const Setup: React.FC<{ student: ArabicStudent; onDone: (p: VerbPrefs) => void }> = ({ student, onDone }) => {
  const [script, setScript] = useState<VerbScript>('arabic');
  const variety = defaultVariety(student);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    const err = await saveVerbPrefs(student.id, { script, variety });
    setBusy(false);
    if (err) { setError(`Not saved: ${err}`); return; }
    onDone({ script, variety });
  };
  const option = (on: boolean) => `text-start rounded-2xl p-4 transition-colors ${on
    ? 'border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border border-slate-200 dark:border-gray-700 hover:border-slate-300'}`;
  return (
    <div className="flex justify-center py-6">
      <div role="dialog" aria-label={`Set up Verbs for ${student.name}`}
        className="w-full max-w-[600px] bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-[22px] shadow-xl p-6 sm:p-7 flex flex-col gap-5">
        <div>
          <h2 className="text-[22px] font-extrabold text-slate-900 dark:text-slate-100">Set up Verbs for {student.name}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
            You choose this once for {student.name}. The verbs follow the dialect in {student.name}'s details: {VARIETY_NAME[variety]}.
          </p>
        </div>
        <fieldset>
          <legend className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-500">How verbs are written</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" role="radio" aria-checked={script === 'arabic'} onClick={() => setScript('arabic')} className={option(script === 'arabic')}>
              <span className="block text-[15px] font-extrabold text-slate-900 dark:text-slate-100">Arabic script</span>
              <span dir="rtl" className="block mt-2 text-end text-[28px] font-bold text-slate-900 dark:text-slate-100" style={{ fontFamily: AR_FONT }}>كتبت · بكتب</span>
            </button>
            <button type="button" role="radio" aria-checked={script === 'translit'} onClick={() => setScript('translit')} className={option(script === 'translit')}>
              <span className="block text-[15px] font-extrabold text-slate-900 dark:text-slate-100">Transliteration</span>
              <span className="block mt-3 text-[22px] font-bold text-slate-900 dark:text-slate-100">katabt · baktob</span>
            </button>
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={go} className="h-11 px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold disabled:opacity-60">
            {busy ? 'Saving…' : 'Open Verbs'}
          </button>
        </div>
      </div>
    </div>
  );
};

const VarietySwitch: React.FC<{ value: VerbVariety; onChange: (v: VerbVariety) => void }> = ({ value, onChange }) => (
  <div role="radiogroup" aria-label="Variety" className="inline-flex p-[3px] rounded-xl bg-slate-200 dark:bg-gray-700">
    {(['levantine', 'msa'] as VerbVariety[]).map(v => (
      <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`h-9 px-4 rounded-[9px] text-[13px] transition-colors ${value === v
          ? 'bg-white dark:bg-gray-900 text-amber-800 dark:text-amber-300 font-bold shadow-sm'
          : 'text-slate-600 dark:text-slate-300 font-semibold hover:text-slate-900'}`}>
        {VARIETY_NAME[v]}
      </button>
    ))}
  </div>
);

// ── The tab ─────────────────────────────────────────────────────────────────

interface Props {
  student: ArabicStudent;
  studentMode?: boolean;
  /** The student has started level 2 (decided by the page, which also locks the tab pill). */
  unlocked: boolean;
}

const ArabicVerbsTab: React.FC<Props> = ({ student, studentMode = false, unlocked }) => {
  const teacherId = student.teacherId;
  const [prefs, setPrefs] = useState<VerbPrefs | null | 'loading'>('loading');
  const [variety, setVariety] = useState<VerbVariety>(defaultVariety(student));
  const [verbs, setVerbs] = useState<ArabicVerb[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<{ id: string; pos: Pos } | null>(null);
  const [editing, setEditing] = useState<ArabicVerb | 'new' | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPrefs('loading');
    void getVerbPrefs(student.id).then(p => {
      if (!live) return;
      setPrefs(p);
      // The details decide; a saved switch only counts for a student who learns both.
      setVariety(p && learnsBothOf(student) ? p.variety : defaultVariety(student));
    });
    return () => { live = false; };
  }, [student.id]);

  const reload = useCallback(() => {
    setVerbs(null);
    void listVerbs(teacherId, variety).then(setVerbs);
  }, [teacherId, variety]);
  useEffect(() => { reload(); }, [reload]);

  const script: VerbScript = prefs && prefs !== 'loading' ? prefs.script : 'arabic';
  const learnsBoth = learnsBothOf(student);
  const showSwitch = learnsBoth;

  const changeVariety = async (v: VerbVariety) => {
    setVariety(v); setOpen(null);
    if (studentMode || !prefs || prefs === 'loading') return;
    const err = await saveVerbPrefs(student.id, { script: prefs.script, variety: v });
    setSwitchError(err ? `The switch was not saved: ${err}` : null);
    if (!err) setPrefs({ ...prefs, variety: v });
  };

  const q = normForSearch(query);
  const matches = useMemo(() => {
    if (!q || !verbs) return null;
    const hit = new Set<string>();
    for (const v of verbs) {
      const words = [v.meaning, ...TENSES.flatMap(t => Object.values(v.conjugations[t]?.cells ?? {}).flatMap(c => [c.ar ?? '', c.tr ?? '']))];
      if (words.some(w => normForSearch(w).includes(q))) hit.add(v.id);
    }
    return hit;
  }, [q, verbs]);

  // Clicking anywhere outside the open card closes it.
  const wallRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (wallRef.current && !wallRef.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  // ── States before the page ──
  if (studentMode && !unlocked) {
    return (
      <div className="flex justify-center py-14">
        <div className="max-w-[440px] text-center flex flex-col items-center gap-3">
          <span className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className="w-7 h-7"><rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Verbs open at level 2</h2>
          <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">They appear as soon as you start your first level 2 lesson.</p>
        </div>
      </div>
    );
  }
  if (prefs === 'loading') {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" /></div>;
  }
  if (!studentMode && prefs === null) {
    return <Setup student={student} onDone={p => { setPrefs(p); setVariety(defaultVariety(student)); }} />;
  }
  if (editing && !studentMode) {
    return (
      <VerbEditor
        initial={editing === 'new' ? null : editing}
        variety={variety}
        script={script}
        teacherId={teacherId}
        onDone={changed => { setEditing(null); setOpen(null); if (changed) reload(); }}
      />
    );
  }

  const hits = matches ? matches.size : 0;
  const count = verbs?.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {!studentMode && !unlocked && (
        <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-2.5">
          {student.name} has not started level 2 yet, so this tab is locked on their side. You can still add verbs.
        </p>
      )}

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[26px] font-extrabold text-slate-900 dark:text-slate-100">Verbs</h2>
            <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400" aria-live="polite">
              {verbs === null ? '' : q ? (hits ? `${hits} of ${count} match` : 'No verb matches') : `${count} ${VARIETY_NAME[variety]} verb${count === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            {showSwitch && <VarietySwitch value={variety} onChange={changeVariety} />}
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 px-2.5 py-1.5 rounded-full">
              {!showSwitch && `${VARIETY_NAME[variety]} · `}{script === 'arabic' ? 'Arabic script' : 'Transliteration'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <label className="relative flex-1 sm:flex-none">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="m20 20-3.5-3.5" /></svg>
            </span>
            <input type="search" value={query} onChange={e => { setQuery(e.target.value); setOpen(null); }}
              aria-label="Search verbs" placeholder={script === 'arabic' ? 'Search: كتب or write' : 'Search: katab or write'}
              className="w-full sm:w-[300px] h-11 ps-9 pe-3 rounded-xl border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20" />
          </label>
          {!studentMode && (
            <button type="button" onClick={() => setEditing('new')}
              className="flex-shrink-0 h-11 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
              <span className="hidden sm:inline">Add verb</span><span className="sm:hidden">Add</span>
            </button>
          )}
        </div>
      </div>
      {switchError && <p role="alert" className="text-sm font-semibold text-red-600">{switchError}</p>}

      {verbs === null ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" /></div>
      ) : verbs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-dashed border-slate-300 dark:border-gray-600 rounded-2xl py-14 px-6 text-center">
          <p className="text-base font-bold text-slate-700 dark:text-slate-200">No {VARIETY_NAME[variety]} verbs yet</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {studentMode ? 'Your teacher has not added any yet.' : `Add one, and every student learning ${VARIETY_NAME[variety]} will see it.`}
          </p>
        </div>
      ) : (
        <div ref={wallRef} className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 sm:gap-3.5">
          {verbs.map(v => (
            <VerbCard
              key={v.id}
              verb={v}
              script={script}
              open={open?.id === v.id ? open.pos : null}
              match={matches ? (matches.has(v.id) ? 'hit' : 'dim') : null}
              onOpen={pos => setOpen(pos ? { id: v.id, pos } : null)}
              onEdit={studentMode ? undefined : () => setEditing(v)}
            />
          ))}
        </div>
      )}

      {verbs && verbs.length > 0 && (
        <div className="hidden sm:flex items-center justify-center gap-5 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 font-bold">← →</kbd>pronouns</span>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 font-bold">↑ ↓</kbd>past, present, imperative</span>
          <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded-md border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 font-bold">Esc</kbd>close the card</span>
          {!studentMode && <span>Double-click a card to edit it</span>}
        </div>
      )}
    </div>
  );
};

export default ArabicVerbsTab;
