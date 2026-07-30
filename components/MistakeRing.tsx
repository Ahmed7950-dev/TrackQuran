import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// MistakeRing — the letter-click mistake logger as a three-ring donut chart.
//
//   OUTER ring  — 4 permanent habits (toggles; on/off, not per-occurrence).
//   MIDDLE ring — 8 fixed mistake areas (16 sub-segments). Sized live by each
//                 area's share of the student's logged mistakes; equal + white
//                 while the student has none. One tap logs the mistake.
//   INNER ring  — custom mistakes the tutor typed before (derived from the
//                 student's history); appears only when any exist; tap re-logs.
//   CENTER      — free-text box (custom mistakes) + cancel.
// ─────────────────────────────────────────────────────────────────────────────

export interface MistakeArea {
  name: string;
  color: string;          // base hex
  subs: string[];         // logged errorText labels, in order
}

// Fixed areas in the tutor's required order. The logged text = sub label
// (Letter recognition logs "Letter recognition (<translit>)" — see onPick).
export const MISTAKE_AREAS: MistakeArea[] = [
  { name: 'length',   color: '#0d9488', subs: ['Short', 'Long'] },
  { name: 'hold',     color: '#6366f1', subs: ['Hold', 'No Hold'] },
  { name: 'harakah',  color: '#f59e0b', subs: ['Fatha', 'Kasrah', 'Dammah'] },
  { name: 'silence',  color: '#f43f5e', subs: ['Silent', 'Not Silent'] },
  { name: 'weight',   color: '#8b5cf6', subs: ['Heavy', 'Light'] },
  { name: 'change',   color: '#0ea5e9', subs: ['Change to Alif', 'Change to Ha'] },
  { name: 'stop',     color: '#84cc16', subs: ['Stop', 'No Stop'] },
  { name: 'recognition', color: '#fb923c', subs: ['Letter recognition'] },
];
export const FIXED_MISTAKE_LABELS = new Set(MISTAKE_AREAS.flatMap(a => a.subs));

export const PERMANENT_MISTAKES = ['Fast reading', 'Choppy reading', 'Breaking up words', 'Articulation points'];

// Short display names so labels fit the arc (logged text stays the full label).
const DISPLAY: Record<string, string> = {
  'No Hold': 'No hold', 'Not Silent': 'Not silent', 'Change to Alif': 'To Alif',
  'Change to Ha': 'To Ha', 'No Stop': 'No stop', 'Letter recognition': 'Letter ?',
};
const FLAG_DISPLAY: Record<string, string> = {
  'Fast reading': 'Fast', 'Choppy reading': 'Choppy',
  'Breaking up words': 'Breaks words', 'Articulation points': 'Articulation',
};

const CX = 170, CY = 170;
const R_HOLE = 62, R_IN0 = 66, R_IN1 = 92, R_MID0 = 96, R_MID1 = 140, R_OUT0 = 144, R_OUT1 = 166;

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

/** Label placed along the ring, rotated tangentially, kept upright. */
const ArcLabel: React.FC<{ r: number; angle: number; text: string; sub?: string; fill: string; size?: number }> =
  ({ r, angle, text, sub, fill, size = 9 }) => {
    const [x, y] = pt(r, angle);
    const flip = angle > 180;                       // left half → flip to stay readable
    const rot = flip ? angle + 90 : angle - 90;
    return (
      <text x={x} y={y} transform={`rotate(${rot} ${x} ${y})`} textAnchor="middle" dominantBaseline="middle"
        fill={fill} fontSize={size} fontWeight={700} style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <tspan x={x} dy={sub ? -4 : 0}>{text}</tspan>
        {sub && <tspan x={x} dy={10} fontSize={size - 1} fontWeight={800}>{sub}</tspan>}
      </text>
    );
  };

interface MistakeRingProps {
  counts: Record<string, number>;              // fixed label → times logged (recognition aggregated)
  customCounts: Array<[string, number]>;       // custom label → count (desc, capped by caller)
  permFlags: string[];
  translit: string;                            // clicked letter's transliteration
  errorText: string;
  onTextChange: (v: string) => void;
  onPick: (label: string) => void;             // logs + closes
  onToggleFlag: (flag: string) => void;
  onSubmitText: () => void;
  onCancel: () => void;
}

const GAP = 1.4; // degrees of breathing room between segments

const MistakeRing: React.FC<MistakeRingProps> = ({
  counts, customCounts, permFlags, translit, errorText,
  onTextChange, onPick, onToggleFlag, onSubmitText, onCancel,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);

  const totalFixed = MISTAKE_AREAS.reduce((s, a) => s + a.subs.reduce((x, l) => x + (counts[l] ?? 0), 0), 0);

  // Area angular weight: equal at zero mistakes, grows with its share.
  // The +blend keeps every area tappable no matter how lopsided the data is.
  const areaWeight = (a: MistakeArea) => {
    const c = a.subs.reduce((x, l) => x + (counts[l] ?? 0), 0);
    return totalFixed === 0 ? 1 : 0.55 + 3.2 * (c / totalFixed);
  };
  const weights = MISTAKE_AREAS.map(areaWeight);
  const wSum = weights.reduce((a, b) => a + b, 0);

  // Middle ring segments
  const middle: React.ReactNode[] = [];
  let angle = 0;
  MISTAKE_AREAS.forEach((area, ai) => {
    const span = (weights[ai] / wSum) * 360;
    const areaCount = area.subs.reduce((x, l) => x + (counts[l] ?? 0), 0);
    // sub split: proportional inside the area, with a floor so all stay tappable
    const subCounts = area.subs.map(l => counts[l] ?? 0);
    const subWeights = area.subs.map((_, i) => areaCount === 0 ? 1 : 0.45 + 2.4 * (subCounts[i] / areaCount));
    const swSum = subWeights.reduce((a, b) => a + b, 0);
    let a0 = angle;
    area.subs.forEach((label, si) => {
      const sSpan = (subWeights[si] / swSum) * span;
      const c = subCounts[si];
      const on = c > 0;
      const shade = [0.88, 0.62, 0.42][si] ?? 0.5;
      const pct = totalFixed > 0 ? Math.round((c / totalFixed) * 100) : 0;
      const mid = a0 + sSpan / 2;
      const display = label === 'Letter recognition' ? DISPLAY[label] : (DISPLAY[label] ?? label);
      middle.push(
        <g key={`m-${label}`} className="mr-seg" onClick={() => onPick(label)}>
          <path d={sector(R_MID0, R_MID1, a0 + GAP / 2, a0 + sSpan - GAP / 2)}
            fill={on ? area.color : '#ffffff'} fillOpacity={on ? shade : 0.9}
            stroke={on ? area.color : '#cbd5e1'} strokeOpacity={0.65} strokeWidth={1} />
          <ArcLabel r={(R_MID0 + R_MID1) / 2} angle={mid}
            text={display} sub={on ? `${pct}%` : undefined}
            fill={on && shade > 0.55 ? '#ffffff' : '#334155'} />
        </g>
      );
      a0 += sSpan;
    });
    angle += span;
  });

  // Outer ring — permanent habit toggles (4 × 90°)
  const outer = PERMANENT_MISTAKES.map((flag, i) => {
    const a0 = i * 90, a1 = (i + 1) * 90;
    const on = permFlags.includes(flag);
    const mid = (a0 + a1) / 2;
    return (
      <g key={`o-${flag}`} className="mr-seg" onClick={() => onToggleFlag(flag)}>
        <path d={sector(R_OUT0, R_OUT1, a0 + GAP / 2, a1 - GAP / 2)}
          fill={on ? '#059669' : '#ffffff'} fillOpacity={on ? 0.85 : 0.85}
          stroke={on ? '#047857' : '#cbd5e1'} strokeOpacity={0.7} strokeWidth={1} />
        <ArcLabel r={(R_OUT0 + R_OUT1) / 2} angle={mid}
          text={`${on ? '✓ ' : ''}${FLAG_DISPLAY[flag]}`} fill={on ? '#ffffff' : '#475569'} size={9.5} />
      </g>
    );
  });

  // Inner ring — the student's own custom mistakes, sized by count
  const customTotal = customCounts.reduce((s, [, c]) => s + c, 0);
  let ia = 0;
  const inner = customCounts.map(([label, c], i) => {
    const span = (c / customTotal) * 360;
    const mid = ia + span / 2;
    const colors = ['#64748b', '#7c3aed', '#0891b2', '#dc2626', '#ca8a04', '#16a34a'];
    const col = colors[i % colors.length];
    const el = (
      <g key={`i-${label}`} className="mr-seg" onClick={() => onPick(label)}>
        <path d={sector(R_IN0, R_IN1, ia + GAP / 2, ia + span - GAP / 2)}
          fill={col} fillOpacity={0.72} stroke={col} strokeOpacity={0.6} strokeWidth={1} />
        {span > 24 && (
          <ArcLabel r={(R_IN0 + R_IN1) / 2} angle={mid}
            text={label.length > 11 ? label.slice(0, 10) + '…' : label}
            sub={`${Math.round((c / customTotal) * 100)}%`} fill="#ffffff" size={8} />
        )}
      </g>
    );
    ia += span;
    return el;
  });

  return (
    <div dir="ltr" className="relative pointer-events-auto" style={{ width: 340, height: 340, maxWidth: '92vw', maxHeight: '92vw' }}>
      <svg viewBox="0 0 340 340" className="w-full h-full" style={{ filter: 'drop-shadow(0 10px 24px rgba(15,23,42,0.30))' }}>
        {/* soft translucent backdrop so the rings float over the Quran text */}
        <circle cx={CX} cy={CY} r={R_OUT1 + 3} fill="#f8fafc" fillOpacity={0.66} />
        <circle cx={CX} cy={CY} r={R_HOLE} fill="#ffffff" fillOpacity={0.97} stroke="#e2e8f0" />
        <style>{`.mr-seg { cursor: pointer; } .mr-seg:hover path { filter: brightness(0.92) saturate(1.35); }`}</style>
        {outer}
        {middle}
        {customCounts.length > 0 && inner}
        {/* recognition helper: show the clicked letter's transliteration under the hole title */}
      </svg>
      {/* Center hole — free-text + cancel */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto flex flex-col items-center gap-1" style={{ width: R_HOLE * 2 - 22 }}>
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 leading-none">{translit}</p>
          <input
            ref={inputRef}
            type="text"
            value={errorText}
            onChange={e => onTextChange(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); onSubmitText(); }
              else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }}
            placeholder="Other…"
            className="w-full text-center text-[11px] bg-transparent text-slate-900 placeholder-slate-400 focus:outline-none border-b border-slate-200 focus:border-teal-400 pb-0.5"
          />
          <div className="flex items-center gap-1 mt-0.5">
            {errorText.trim() && (
              <button type="button" onClick={onSubmitText}
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500 text-white hover:bg-teal-600">Log</button>
            )}
            <button type="button" onClick={onCancel}
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600 hover:bg-slate-300">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MistakeRing;
