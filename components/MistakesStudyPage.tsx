import React, { useMemo, useState } from 'react';
import { Mistake, Student } from '../types';
import MistakeRing, { computeRingData, MISTAKE_AREAS, TAJWEED_AREAS, PERMANENT_MISTAKES } from './MistakeRing';
import MistakeMap from './MistakeSessionGrid';
import { isLetterMistakeKey } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// Mistakes Study — a read-only analysis of everything the tutor has logged for
// this student: both rings as an overview, the session map (reading | tajweed),
// then per-area breakdowns, the letters the student confuses (Letter ?), the
// tajweed rules they slip on, their own custom notes, and habits.
// ─────────────────────────────────────────────────────────────────────────────

const ARABIC_BY_TRANSLIT: Record<string, string> = {
  alif: 'ا', ba: 'ب', ta: 'ت', tha: 'ث', jeem: 'ج', haa: 'ح', kha: 'خ', dal: 'د',
  dhal: 'ذ', ra: 'ر', zay: 'ز', seen: 'س', sheen: 'ش', saad: 'ص', daad: 'ض',
  taa: 'ط', dhaa: 'ظ', ayn: 'ع', ghayn: 'غ', fa: 'ف', qaf: 'ق', kaf: 'ك',
  lam: 'ل', meem: 'م', noon: 'ن', ha: 'ه', waw: 'و', ya: 'ي', hamza: 'ء',
  'ta marbuta': 'ة', hamzah: 'ء', jim: 'ج', geem: 'ج', ain: 'ع', ayin: 'ع',
  ghain: 'غ', zain: 'ز', shin: 'ش', sin: 'س', mim: 'م', nun: 'ن',
};

const Bar: React.FC<{ value: number; max: number; color: string }> = ({ value, max, color }) => (
  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
    <div className="h-full rounded-full transition-all" style={{ width: `${max > 0 ? Math.max(4, (value / max) * 100) : 0}%`, background: color }} />
  </div>
);

const DAY = 24 * 60 * 60 * 1000;

const MistakesStudyPage: React.FC<{ student: Student }> = ({ student }) => {
  // What a student was getting wrong a year ago says little about today, so the
  // page opens on the last month and the whole history is a tap away.
  const [range, setRange] = useState<'month' | 'all'>('month');

  const scoped = useMemo((): Record<string, Mistake> => {
    const all = student.mistakes || {};
    if (range === 'all') return all;
    const cutoff = Date.now() - 30 * DAY;
    const out: Record<string, Mistake> = {};
    for (const [k, m] of Object.entries(all)) {
      // The permanent-habit flags are not a dated mistake — they are a standing
      // note about the student — so they stand in both views.
      if (!isLetterMistakeKey(k)) { out[k] = m; continue; }
      const at = Date.parse(m.date ?? '');
      if (!isNaN(at) && at >= cutoff) out[k] = m;
    }
    return out;
  }, [student.mistakes, range]);

  /** The session map reads the whole student, so it gets the scoped copy. */
  const scopedStudent = useMemo(() => ({ ...student, mistakes: scoped }), [student, scoped]);
  const allTimeTotal = useMemo(() => Object.keys(student.mistakes || {}).filter(isLetterMistakeKey).length, [student.mistakes]);

  const data = useMemo(() => computeRingData(scoped), [scoped]);
  const maxCount = Math.max(1, ...Object.values(data.counts), ...data.customAll.map(([, c]) => c));
  const areaTotals = MISTAKE_AREAS.map(a => ({
    area: a,
    total: a.subs.reduce((s, l) => s + (data.counts[l] ?? 0), 0),
  }));
  const worst = [...areaTotals].sort((a, b) => b.total - a.total)[0];
  const confusionMax = Math.max(1, ...data.letterConfusions.map(([, c]) => c));

  // Tajweed rules, worst first — the mirror of the reading breakdown.
  const tajweedRows = TAJWEED_AREAS
    .map(a => ({ area: a, label: a.subs[0], count: data.tajweedCounts[a.subs[0]] ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const tajweedMax = Math.max(1, ...tajweedRows.map(r => r.count), ...data.tajweedCustomAll.map(([, c]) => c));
  const worstTajweed = tajweedRows[0];

  const nothingLogged = data.total === 0 && data.tajweedTotal === 0 && data.permFlags.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">Mistakes Study</h2>
              <div role="group" aria-label="How far back to look"
                className="flex items-center gap-0.5 p-0.5 rounded-full bg-slate-100 dark:bg-gray-700/60">
                {([['month', 'Last 30 days'], ['all', 'All time']] as const).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setRange(key)} aria-pressed={range === key}
                    className={`h-7 px-3 rounded-full text-[11px] font-bold transition-colors ${range === key
                      ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {student.name} · {data.total} reading · {data.tajweedTotal} tajweed
              {worst && worst.total > 0 && <> · biggest challenge: <span className="font-bold" style={{ color: worst.area.color }}>{worst.area.subs[0]}{worst.area.subs.length > 1 ? ` / ${worst.area.subs[1]}` : ''}</span></>}
              {worstTajweed && worstTajweed.count > 0 && <> · weakest rule: <span className="font-bold" style={{ color: worstTajweed.area.color }}>{worstTajweed.label}</span></>}
            </p>
            {range === 'month' && allTimeTotal > data.total + data.tajweedTotal && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Showing the last 30 days · {allTimeTotal} logged in all
              </p>
            )}
          </div>
          {/* Permanent habits */}
          <div className="flex flex-wrap gap-1.5">
            {PERMANENT_MISTAKES.map(f => {
              const on = data.permFlags.includes(f);
              return (
                <span key={f} className={`px-2.5 py-1 rounded-full text-xs font-bold ${on
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-400 dark:bg-gray-700 dark:text-slate-500 line-through decoration-transparent'}`}>
                  {on ? '✓ ' : ''}{f}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {nothingLogged ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-10 text-center shadow-sm">
          <p className="text-4xl mb-2">🌱</p>
          <p className="text-slate-600 dark:text-slate-300 font-semibold">
            {range === 'month' && allTimeTotal > 0 ? 'Nothing logged in the last 30 days.' : 'No mistakes logged yet.'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            {range === 'month' && allTimeTotal > 0
              ? <>There are {allTimeTotal} older ones — switch to <button type="button" onClick={() => setRange('all')} className="font-bold text-teal-600 dark:text-teal-400 underline">All time</button> to see them.</>
              : 'Log mistakes during live reading and this page fills up with the full picture.'}
          </p>
        </div>
      ) : (
        <>
          {/* Both rings, as a read-only overview */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm flex flex-col items-center">
              <p className="text-[11px] font-black uppercase tracking-wider text-rose-500 mb-2 self-start">Reading mistakes</p>
              <MistakeRing readOnly counts={data.counts} permFlags={data.permFlags} />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 sm:p-6 shadow-sm flex flex-col items-center">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-600 mb-2 self-start">Tajweed mistakes</p>
              <MistakeRing readOnly mode="tajweed" areas={TAJWEED_AREAS} counts={data.tajweedCounts} permFlags={data.permFlags} />
            </div>
          </div>

          {/* Which mistake happened in which session — reading | tajweed */}
          <MistakeMap student={scopedStudent} />

          {/* Per-area breakdowns */}
          <div className="grid sm:grid-cols-2 gap-4">
            {areaTotals.map(({ area, total }) => (
              <div key={area.name} className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: area.color }} />
                  <p className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">{area.title}</p>
                  <span className="ms-auto text-xs font-bold text-slate-400">{total}× {data.total > 0 ? `· ${Math.round((total / data.total) * 100)}%` : ''}</span>
                </div>
                <div className="space-y-2">
                  {area.subs.map(label => {
                    const c = data.counts[label] ?? 0;
                    return (
                      <div key={label} className="flex items-center gap-2.5">
                        <span className={`w-24 flex-shrink-0 text-xs font-semibold ${c > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                          {label === 'Letter recognition' ? 'Letter ?' : label}
                        </span>
                        <Bar value={c} max={maxCount} color={area.color} />
                        <span className="w-7 text-end text-xs font-bold text-slate-500 dark:text-slate-400">{c || '—'}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Letter ? area: the actual letters the student confuses */}
                {area.name === 'recognition' && data.letterConfusions.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-gray-700">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Letters the student confuses</p>
                    <div className="flex flex-wrap gap-2">
                      {data.letterConfusions.map(([tr, c]) => (
                        <span key={tr}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-sm font-bold"
                          style={{ borderColor: area.color, color: area.color, opacity: 0.55 + 0.45 * (c / confusionMax) }}>
                          <span className="font-quranic text-xl leading-none">{ARABIC_BY_TRANSLIT[tr] ?? ''}</span>
                          <span className="capitalize">{tr}</span>
                          <span className="text-xs font-black">×{c}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Tajweed breakdown — same shape as the reading areas, one card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-3 h-3 rounded-full flex-shrink-0 bg-emerald-500" />
              <p className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Tajweed rules</p>
              <span className="ms-auto text-xs font-bold text-slate-400">{data.tajweedTotal}× total</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {tajweedRows.map(({ area, label, count }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className={`w-36 flex-shrink-0 text-xs font-semibold ${count > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
                    {label}
                  </span>
                  <Bar value={count} max={tajweedMax} color={area.color} />
                  <span className="w-7 text-end text-xs font-bold text-slate-500 dark:text-slate-400">{count || '—'}</span>
                </div>
              ))}
              {data.tajweedCustomAll.map(([label, c]) => (
                <div key={`c-${label}`} className="flex items-center gap-2.5">
                  <span className="w-36 flex-shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title={label}>{label}</span>
                  <Bar value={c} max={tajweedMax} color="#94a3b8" />
                  <span className="w-7 text-end text-xs font-bold text-slate-500 dark:text-slate-400">{c}</span>
                </div>
              ))}
            </div>
            {data.tajweedTotal === 0 && (
              <p className="text-xs text-slate-400 italic mt-2">
                Nothing logged yet. During live reading press <b>t</b>, then tap a letter to log a tajweed mistake.
              </p>
            )}
          </div>

          {/* Custom mistakes */}
          {data.customAll.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
              <p className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 mb-3">Custom mistakes</p>
              <div className="space-y-2">
                {data.customAll.map(([label, c], i) => {
                  const colors = ['#8296ab', '#b48ef5', '#3ec3d5', '#ef8080', '#e2b93d', '#63c584'];
                  return (
                    <div key={label} className="flex items-center gap-2.5">
                      <span className="w-40 sm:w-56 flex-shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title={label}>{label}</span>
                      <Bar value={c} max={maxCount} color={colors[i % colors.length]} />
                      <span className="w-7 text-end text-xs font-bold text-slate-500 dark:text-slate-400">{c}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MistakesStudyPage;
