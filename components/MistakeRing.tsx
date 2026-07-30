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

const CX = 210, CY = 210;
const R_HOLE = 72, R_IN0 = 76, R_IN1 = 106, R_MID0 = 110, R_MID1 = 176, R_OUT0 = 180, R_OUT1 = 206;

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
 *  text never renders upside down; radii are nudged so the glyphs stay
 *  centered inside the band either way. */
const ArcText: React.FC<{ id: string; r: number; a0: number; a1: number; text: string; fill: string; size?: number; weight?: number }> =
  ({ id, r, a0, a1, text, fill, size = 10, weight = 700 }) => {
    const mid = (a0 + a1) / 2;
    const flip = mid > 90 && mid < 270;             // bottom half → reverse direction
    // Auto-fit: textPath CLIPS text longer than its arc — shrink to fit
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
/** Two-line curved label: name on the outer line, percentage on the inner. */
const ArcLabel2: React.FC<{ id: string; rMid: number; a0: number; a1: number; text: string; sub?: string; fill: string; size?: number }> =
  ({ id, rMid, a0, a1, text, sub, fill, size = 10 }) => (
    <>
      <ArcText id={`${id}-t`} r={sub ? rMid + 6 : rMid} a0={a0} a1={a1} text={text} fill={fill} size={size} />
      {sub && <ArcText id={`${id}-s`} r={rMid - 7} a0={a0} a1={a1} text={sub} fill={fill} size={size - 1} weight={800} />}
    </>
  );

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

  // Middle ring: each area is ONE angular slice in its own hue; its subs
  // stack as concentric layers inside the slice (first sub outermost), the
  // way the tutor sketched it — Stop above, No stop under.
  const middle: React.ReactNode[] = [];
  const RGAP = 1.6;                                  // radial gap between layers
  let angle = 0;
  MISTAKE_AREAS.forEach((area, ai) => {
    const span = (weights[ai] / wSum) * 360;
    const a0 = angle + GAP / 2, a1 = angle + span - GAP / 2;
    const n = area.subs.length;
    const layerH = (R_MID1 - R_MID0 - RGAP * (n - 1)) / n;
    area.subs.forEach((label, si) => {
      const r1 = R_MID1 - si * (layerH + RGAP);      // first sub on top (outer)
      const r0 = r1 - layerH;
      const c = counts[label] ?? 0;
      const on = c > 0;
      const pct = totalFixed > 0 ? Math.round((c / totalFixed) * 100) : 0;
      const display = DISPLAY[label] ?? label;
      middle.push(
        <g key={`m-${label}`} className="mr-seg" onClick={() => onPick(label)}>
          <path d={sector(r0, r1, a0, a1)}
            fill={area.color} fillOpacity={on ? 0.9 - si * 0.18 : 0.14}
            stroke={area.color} strokeOpacity={0.55} strokeWidth={1} />
          <ArcText id={`mr-m-${ai}-${si}`} r={(r0 + r1) / 2} a0={a0} a1={a1}
            text={on ? `${display} · ${pct}%` : display}
            fill={on ? '#ffffff' : '#334155'} size={10.5} />
        </g>
      );
    });
    angle += span;
  });

  // Outer ring — permanent habit toggles (4 × 90°)
  const outer = PERMANENT_MISTAKES.map((flag, i) => {
    const a0 = i * 90, a1 = (i + 1) * 90;
    const on = permFlags.includes(flag);
    return (
      <g key={`o-${flag}`} className="mr-seg" onClick={() => onToggleFlag(flag)}>
        <path d={sector(R_OUT0, R_OUT1, a0 + GAP / 2, a1 - GAP / 2)}
          fill={on ? '#059669' : '#ffffff'} fillOpacity={on ? 0.85 : 0.85}
          stroke={on ? '#047857' : '#cbd5e1'} strokeOpacity={0.7} strokeWidth={1} />
        <ArcText id={`mr-o-${i}`} r={(R_OUT0 + R_OUT1) / 2} a0={a0 + GAP / 2} a1={a1 - GAP / 2}
          text={`${on ? '✓ ' : ''}${FLAG_DISPLAY[flag]}`} fill={on ? '#ffffff' : '#475569'} size={11} />
      </g>
    );
  });

  // Inner ring — the student's own custom mistakes, sized by count
  const customTotal = customCounts.reduce((s, [, c]) => s + c, 0);
  let ia = 0;
  const inner = customCounts.map(([label, c], i) => {
    const span = (c / customTotal) * 360;
    const colors = ['#64748b', '#7c3aed', '#0891b2', '#dc2626', '#ca8a04', '#16a34a'];
    const col = colors[i % colors.length];
    const el = (
      <g key={`i-${label}`} className="mr-seg" onClick={() => onPick(label)}>
        <path d={sector(R_IN0, R_IN1, ia + GAP / 2, ia + span - GAP / 2)}
          fill={col} fillOpacity={0.72} stroke={col} strokeOpacity={0.6} strokeWidth={1} />
        {span > 24 && (
          <ArcLabel2 id={`mr-i-${i}`} rMid={(R_IN0 + R_IN1) / 2} a0={ia + GAP / 2} a1={ia + span - GAP / 2}
            text={label.length > 14 ? label.slice(0, 13) + '…' : label}
            sub={`${Math.round((c / customTotal) * 100)}%`} fill="#ffffff" size={9} />
        )}
      </g>
    );
    ia += span;
    return el;
  });

  return (
    <div dir="ltr" className="relative pointer-events-auto" style={{ width: 420, height: 420, maxWidth: '95vw', maxHeight: '95vw' }}>
      <svg viewBox="0 0 420 420" className="w-full h-full" style={{ filter: 'drop-shadow(0 10px 24px rgba(15,23,42,0.30))' }}>
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
