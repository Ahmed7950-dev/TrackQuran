import React from 'react';
import { Mistake } from '../types';
import { PERM_MISTAKE_FLAGS_KEY, isLetterMistakeKey } from '../constants';

// ─────────────────────────────────────────────────────────────────────────────
// MistakeRing — the letter-click mistake logger as a three-ring donut chart.
//
//   OUTER ring  — 4 permanent habits (toggles; on/off, not per-occurrence).
//   MIDDLE ring — 8 fixed mistake areas, each ONE slice in its own hue with
//                 its variants stacked as concentric layers (Stop over No stop).
//   INNER ring  — custom mistakes from the student's history; tap re-logs.
//                 The center ⇄ button starts merge mode: select customs, then
//                 tap a middle layer to fold them into that fixed mistake.
//   CENTER      — free-text box + cancel (or a summary in readOnly mode).
// ─────────────────────────────────────────────────────────────────────────────

export interface MistakeArea {
  name: string;
  color: string;          // base hex
  subs: string[];         // logged errorText labels, in order
}

// Fixed areas in the tutor's required order. The logged text = sub label
// (Letter recognition logs "Letter recognition (<translit>)" — see onPick).
export const MISTAKE_AREAS: MistakeArea[] = [
  { name: 'length',   color: '#0ea5a4', subs: ['Short', 'Long'] },
  { name: 'hold',     color: '#7c86f8', subs: ['Hold', 'No Hold'] },
  { name: 'harakah',  color: '#f0a626', subs: ['Fatha', 'Kasrah', 'Dammah'] },
  { name: 'silence',  color: '#f26d8c', subs: ['Silent', 'Not Silent'] },
  { name: 'weight',   color: '#a186f2', subs: ['Heavy', 'Light'] },
  { name: 'change',   color: '#3cb2ec', subs: ['Change to Alif', 'Change to Ha'] },
  { name: 'stop',     color: '#8fc93a', subs: ['Stop', 'No Stop'] },
  { name: 'recognition', color: '#f59a63', subs: ['Letter recognition'] },
];
export const FIXED_MISTAKE_LABELS = new Set(MISTAKE_AREAS.flatMap(a => a.subs));

export const PERMANENT_MISTAKES = ['Fast reading', 'Choppy reading', 'Breaking up words', 'Articulation points'];

// ── Letter transliteration (Letter recognition + history normalization) ──────
export const TRANSLIT: Record<string, string> = {
  'ا': 'alif', 'أ': 'alif', 'إ': 'alif', 'آ': 'alif', 'ٱ': 'alif', 'ب': 'ba', 'ت': 'ta',
  'ث': 'tha', 'ج': 'jeem', 'ح': 'haa', 'خ': 'kha', 'د': 'dal', 'ذ': 'dhal', 'ر': 'ra',
  'ز': 'zay', 'س': 'seen', 'ش': 'sheen', 'ص': 'saad', 'ض': 'daad', 'ط': 'taa', 'ظ': 'dhaa',
  'ع': 'ayn', 'غ': 'ghayn', 'ف': 'fa', 'ق': 'qaf', 'ك': 'kaf', 'ل': 'lam', 'م': 'meem',
  'ن': 'noon', 'ه': 'ha', 'و': 'waw', 'ي': 'ya', 'ى': 'ya', 'ئ': 'hamza', 'ؤ': 'hamza',
  'ء': 'hamza', 'ة': 'ta marbuta',
};
export const translitOf = (glyph: string): string => {
  for (const ch of glyph) { const t = TRANSLIT[ch]; if (t) return t; }
  return glyph.replace(/[ً-ٰٟۖ-ۭ‍]/g, '') || glyph;
};

const LETTER_NAMES = new Set([
  ...Object.values(TRANSLIT),
  'hamzah', 'alef', 'aleph', 'jim', 'geem', 'ain', 'ayin', 'ghain', 'zain', 'thal',
  'dhaal', 'sad', 'dad', 'shin', 'sin', 'teh', 'tah', 'heh', 'mim', 'miim', 'nun',
  'baa', 'yaa', 'waaw', 'raa', 'daal', 'kaaf', 'laam', 'qaaf', 'faa', 'khaa',
]);

export interface RingData {
  counts: Record<string, number>;              // fixed label → count
  customCounts: Array<[string, number]>;       // top customs for the inner ring
  customAll: Array<[string, number]>;          // every custom (study page)
  permFlags: string[];
  letterConfusions: Array<[string, number]>;   // translit → count (Letter ?)
  total: number;                               // all counted ring mistakes
}

/** Shared history → ring-data folding. Case-insensitive against the fixed
 *  labels, aliases fold in (Stretch → Long), bare letter names count as
 *  Letter recognition, green tajweed-mode logs are excluded. */
export const computeRingData = (mistakes: Record<string, Mistake>): RingData => {
  const fixedByLc = new Map([...FIXED_MISTAKE_LABELS].map(l => [l.toLowerCase(), l] as const));
  const aliases: Record<string, string> = { 'stretch': 'Long' };
  const counts: Record<string, number> = {};
  const custom = new Map<string, number>();
  const confusions = new Map<string, number>();
  for (const [k, m] of Object.entries(mistakes)) {
    if (!isLetterMistakeKey(k)) continue;
    if (m.errorType === 'tajweed') continue;     // green logs stay out of the ring
    const raw = m.errorText?.trim();
    if (!raw) continue;
    const lc = raw.toLowerCase();
    const recogMatch = lc.match(/^letter recognition\s*\(?\s*([^)]*)/);
    if (recogMatch || LETTER_NAMES.has(lc)) {
      counts['Letter recognition'] = (counts['Letter recognition'] ?? 0) + 1;
      const letter = (recogMatch ? recogMatch[1].trim() : lc) || 'unknown';
      confusions.set(letter, (confusions.get(letter) ?? 0) + 1);
    } else if (fixedByLc.has(lc)) {
      const canon = fixedByLc.get(lc)!;
      counts[canon] = (counts[canon] ?? 0) + 1;
    } else if (aliases[lc]) {
      counts[aliases[lc]] = (counts[aliases[lc]] ?? 0) + 1;
    } else {
      custom.set(raw, (custom.get(raw) ?? 0) + 1);
    }
  }
  const customAll = [...custom.entries()].sort((a, b) => b[1] - a[1]);
  const permFlags = mistakes[PERM_MISTAKE_FLAGS_KEY]?.errorText?.split('|').filter(Boolean) ?? [];
  const total = Object.values(counts).reduce((a, b) => a + b, 0) + customAll.reduce((a, [, c]) => a + c, 0);
  return {
    counts,
    customCounts: customAll.slice(0, 6),
    customAll,
    permFlags,
    letterConfusions: [...confusions.entries()].sort((a, b) => b[1] - a[1]),
    total,
  };
};

// Short display names so labels fit the arc (logged text stays the full label).
const DISPLAY: Record<string, string> = {
  'No Hold': 'No hold', 'Not Silent': 'Not silent', 'Change to Alif': 'To Alif',
  'Change to Ha': 'To Ha', 'No Stop': 'No stop', 'Letter recognition': 'Letter ?',
};
const FLAG_DISPLAY: Record<string, string> = {
  'Fast reading': 'Fast', 'Choppy reading': 'Choppy',
  'Breaking up words': 'Breaks words', 'Articulation points': 'Articulation',
};

const CX = 215, CY = 215;
const R_HOLE = 64, R_IN0 = 68, R_IN1 = 96, R_MID0 = 112, R_MID1 = 176, R_OUT0 = 192, R_OUT1 = 212;

const pt = (r: number, aDeg: number): [number, number] => {
  const a = ((aDeg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
/** Annular sector path from angle a0→a1 (degrees clockwise, 0 = top). */
const sector = (r0: number, r1: number, a0: number, a1: number): string => {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(r1, a0), [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
};

/** Text following the ring's curve. Bottom-half arcs run reversed so the
 *  text never renders upside down; the font auto-fits the arc length. */
const ArcText: React.FC<{ id: string; r: number; a0: number; a1: number; text: string; fill: string; size?: number; weight?: number }> =
  ({ id, r, a0, a1, text, fill, size = 10, weight = 700 }) => {
    const mid = (a0 + a1) / 2;
    const flip = mid > 90 && mid < 270;
    const arcLen = (r * (a1 - a0) * Math.PI) / 180;
    size = Math.max(6, Math.min(size, (arcLen - 3) / (text.length * 0.58)));
    const rr = flip ? r + size * 0.38 : r - size * 0.38;
    const [x0, y0] = pt(rr, flip ? a1 : a0);
    const [x1, y1] = pt(rr, flip ? a0 : a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    const d = `M${x0.toFixed(2)},${y0.toFixed(2)} A${rr},${rr} 0 ${large} ${flip ? 0 : 1} ${x1.toFixed(2)},${y1.toFixed(2)}`;
    return (
      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <path id={id} d={d} fill="none" />
        <text fill={fill} fontSize={size} fontWeight={weight}>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
        </text>
      </g>
    );
  };

interface MistakeRingProps {
  counts: Record<string, number>;
  customCounts: Array<[string, number]>;
  permFlags: string[];
  translit?: string;
  errorText?: string;
  readOnly?: boolean;                          // study view: no logging, summary center
  onTextChange?: (v: string) => void;
  onPick?: (label: string) => void;
  onToggleFlag?: (flag: string) => void;
  onSubmitText?: () => void;
  onCancel?: () => void;
  /** Merge mode: fold the selected custom mistakes into a fixed label. */
  onReassign?: (customLabels: string[], toFixedLabel: string) => void;
}

const GAP = 1.4;   // degrees between slices
const RGAP = 2;    // radial gap between stacked layers

const MistakeRing: React.FC<MistakeRingProps> = ({
  counts, customCounts, permFlags, translit = '', errorText = '', readOnly = false,
  onTextChange, onPick, onToggleFlag, onSubmitText, onCancel, onReassign,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [selectMode, setSelectMode] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  React.useEffect(() => { if (!readOnly) inputRef.current?.focus(); }, [readOnly]);
  React.useEffect(() => {
    if (readOnly) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const totalFixed = MISTAKE_AREAS.reduce((s, a) => s + a.subs.reduce((x, l) => x + (counts[l] ?? 0), 0), 0);

  const areaWeight = (a: MistakeArea) => {
    const c = a.subs.reduce((x, l) => x + (counts[l] ?? 0), 0);
    return totalFixed === 0 ? 1 : 0.55 + 3.2 * (c / totalFixed);
  };
  const weights = MISTAKE_AREAS.map(areaWeight);
  const wSum = weights.reduce((a, b) => a + b, 0);

  const pickMiddle = (label: string) => {
    if (readOnly) return;
    if (selectMode && selected.size > 0) {
      onReassign?.([...selected], label);
      setSelectMode(false);
      setSelected(new Set());
      return;
    }
    onPick?.(label);
  };
  const pickInner = (label: string) => {
    if (readOnly) return;
    if (selectMode) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(label)) next.delete(label); else next.add(label);
        return next;
      });
      return;
    }
    onPick?.(label);
  };

  // Middle ring: one slice per area, subs stacked as concentric layers.
  const middle: React.ReactNode[] = [];
  let angle = 0;
  MISTAKE_AREAS.forEach((area, ai) => {
    const span = (weights[ai] / wSum) * 360;
    const a0 = angle + GAP / 2, a1 = angle + span - GAP / 2;
    const n = area.subs.length;
    const layerH = (R_MID1 - R_MID0 - RGAP * (n - 1)) / n;
    area.subs.forEach((label, si) => {
      const r1 = R_MID1 - si * (layerH + RGAP);
      const r0 = r1 - layerH;
      const on = (counts[label] ?? 0) > 0;
      const display = DISPLAY[label] ?? label;
      middle.push(
        <g key={`m-${label}`} className={readOnly ? undefined : 'mr-seg'} onClick={() => pickMiddle(label)}>
          <path d={sector(r0, r1, a0, a1)}
            fill={area.color} fillOpacity={on ? 0.92 - si * 0.16 : 0.16}
            stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.5} />
          <ArcText id={`mr-m-${ai}-${si}`} r={(r0 + r1) / 2} a0={a0} a1={a1}
            text={display} fill={on ? '#ffffff' : '#3f4c5e'} size={11} />
        </g>
      );
    });
    angle += span;
  });

  // Outer ring — permanent habit toggles (4 × 90°).
  const outer = PERMANENT_MISTAKES.map((flag, i) => {
    const a0 = i * 90, a1 = (i + 1) * 90;
    const on = permFlags.includes(flag);
    return (
      <g key={`o-${flag}`} className={readOnly ? undefined : 'mr-seg'} onClick={() => { if (!readOnly) onToggleFlag?.(flag); }}>
        <path d={sector(R_OUT0, R_OUT1, a0 + GAP / 2, a1 - GAP / 2)}
          fill={on ? '#10b981' : '#ffffff'} fillOpacity={on ? 0.9 : 0.88}
          stroke="#ffffff" strokeOpacity={0.9} strokeWidth={1.5} />
        <ArcText id={`mr-o-${i}`} r={(R_OUT0 + R_OUT1) / 2} a0={a0 + GAP / 2} a1={a1 - GAP / 2}
          text={`${on ? '✓ ' : ''}${FLAG_DISPLAY[flag]}`} fill={on ? '#ffffff' : '#475569'} size={11} />
      </g>
    );
  });

  // Inner ring — customs, sized by count. In merge mode they toggle selection.
  const customTotal = customCounts.reduce((s, [, c]) => s + c, 0);
  let ia = 0;
  const inner = customCounts.map(([label, c], i) => {
    const span = (c / customTotal) * 360;
    const colors = ['#8296ab', '#b48ef5', '#3ec3d5', '#ef8080', '#e2b93d', '#63c584'];
    const col = colors[i % colors.length];
    const isSel = selected.has(label);
    const el = (
      <g key={`i-${label}`} className={readOnly ? undefined : 'mr-seg'} onClick={() => pickInner(label)}>
        <path d={sector(R_IN0, R_IN1, ia + GAP / 2, ia + span - GAP / 2)}
          fill={col} fillOpacity={isSel ? 1 : 0.82}
          stroke={isSel ? '#0f172a' : '#ffffff'} strokeOpacity={0.95} strokeWidth={isSel ? 2.5 : 1.5} />
        {span > 20 && (
          <ArcText id={`mr-i-${i}`} r={(R_IN0 + R_IN1) / 2} a0={ia + GAP / 2} a1={ia + span - GAP / 2}
            text={`${isSel ? '✓ ' : ''}${label.length > 16 ? label.slice(0, 15) + '…' : label}`} fill="#ffffff" size={9.5} />
        )}
      </g>
    );
    ia += span;
    return el;
  });

  return (
    <div dir="ltr" className="relative pointer-events-auto" style={{ width: 'min(88vw, 78vh, 560px)', height: 'min(88vw, 78vh, 560px)' }}>
      <svg viewBox="0 0 430 430" className="w-full h-full" style={{ filter: 'drop-shadow(0 10px 24px rgba(15,23,42,0.30))' }}>
        <circle cx={CX} cy={CY} r={R_OUT1 + 3} fill="#f6f8fb" fillOpacity={0.72} />
        <circle cx={CX} cy={CY} r={(R_IN1 + R_MID0) / 2} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={2} />
        <circle cx={CX} cy={CY} r={(R_MID1 + R_OUT0) / 2} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={2} />
        <circle cx={CX} cy={CY} r={R_HOLE} fill="#ffffff" fillOpacity={0.97} stroke="#e2e8f0" />
        {!readOnly && <style>{`.mr-seg { cursor: pointer; } .mr-seg:hover path { filter: brightness(0.92) saturate(1.35); }`}</style>}
        {outer}
        {middle}
        {customCounts.length > 0 && inner}
      </svg>
      {/* Center hole */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto flex flex-col items-center gap-1 text-center" style={{ width: '26%' }}>
          {readOnly ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 leading-none">Mistakes</p>
              <p className="text-2xl font-black text-slate-700 leading-none">{totalFixed + customTotal}</p>
            </>
          ) : selectMode ? (
            <>
              <p className="text-[10px] font-bold text-teal-600 leading-tight">Select below, then tap a mistake in the middle ring</p>
              <p className="text-[10px] text-slate-400 leading-none">{selected.size} selected</p>
              <button type="button" onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                className="mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 hover:bg-slate-300">Stop</button>
            </>
          ) : (
            <>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 leading-none">{translit}</p>
              <input
                ref={inputRef}
                type="text"
                value={errorText}
                onChange={e => onTextChange?.(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') { e.preventDefault(); onSubmitText?.(); }
                  else if (e.key === 'Escape') { e.preventDefault(); onCancel?.(); }
                }}
                placeholder="Other…"
                className="w-full text-center text-[11px] bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none border-b border-slate-200 focus:border-teal-400 pb-0.5"
              />
              <div className="flex items-center gap-1 mt-0.5 flex-wrap justify-center">
                {errorText.trim() && (
                  <button type="button" onClick={() => onSubmitText?.()}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500 text-white hover:bg-teal-600">Log</button>
                )}
                <button type="button" onClick={() => onCancel?.()}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 hover:bg-slate-300">Cancel</button>
                {customCounts.length > 0 && onReassign && (
                  <button type="button" title="Merge custom mistakes into a fixed one"
                    onClick={() => setSelectMode(true)}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200">⇄ Merge</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MistakeRing;
