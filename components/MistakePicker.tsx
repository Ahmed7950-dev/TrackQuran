import React from 'react';
import type { MistakeVoice } from '../types';
import { useI18n } from '../context/I18nProvider';
import VoiceNoteButton from './VoiceNoteButton';
import {
  MISTAKE_AREAS, TAJWEED_AREAS, PERMANENT_MISTAKES, FLAG_DISPLAY, buttonMistakeLabel, mistakeLabel,
} from './MistakeRing';
import { currentQuranicFont } from '../utils/quranicMarks';

// ─────────────────────────────────────────────────────────────────────────────
// MistakePicker — the ring that opens when the tutor taps a letter in live
// logging. Redesigned Nov 2026 (the tutor wanted it to stay a ring):
//
//   • ONE ring holds both sets: habits around the letter, reading mistakes in
//     the middle band (variants stacked as before, first outermost), the
//     eleven tajweed rules in the outer band with each rule's own colour on the
//     rim, as on the verse. A tajweed pick logs a tajweed mistake whatever the
//     R/T switch says, so there is nothing to switch first. (R/T still sets the
//     colour of the first mark and where a typed note goes.) On a phone there
//     is no room for two bands: one at a time, with a Reading/Tajweed switch.
//   • On a computer it opens AROUND the letter, with the letter showing
//     through the middle: every option is the same short reach from where the
//     tap was, and the tap can be corrected by tapping a neighbour in the hole.
//     Squeezed against an edge it moves inward and shows the letter instead.
//   • Slices never move. The old ring sized them by how often the student made
//     each mistake; now colour depth says that (white = never, deeper = more),
//     so the same mistake is always in the same place.
//   • The bar under it finds as you type ("ik" → Ikhfa), Enter logs the
//     outlined one; text that matches nothing is logged as a note; Enter on an
//     empty box keeps the mark without a label, as before.
//   • Esc / ✕ remove the mark. A tap anywhere else keeps it without a label.
//
// Stored labels are exactly the old ring's (MISTAKE_AREAS / TAJWEED_AREAS
// subs). Drawn on the "Mistake logging" design canvas.
// ─────────────────────────────────────────────────────────────────────────────

export type MistakeKind = 'reading' | 'tajweed';

interface Option { label: string; kind: MistakeKind; color: string }

const READING_GROUPS: Option[][] = MISTAKE_AREAS.map(a =>
  a.subs.map(label => ({ label, kind: 'reading' as const, color: a.color })));
const TAJWEED_OPTIONS: Option[] = TAJWEED_AREAS.map(a =>
  ({ label: a.subs[0], kind: 'tajweed' as const, color: a.color }));
const ALL_OPTIONS: Option[] = [...READING_GROUPS.flat(), ...TAJWEED_OPTIONS];

/** Labels set on two arcs when the band is thick enough. */
const TWO_LINE: Record<string, [string, string]> = {
  'Ignore vowel': ['Ignore', 'vowel'], 'Weak letter': ['Weak', 'letter'],
  'Idgham w/ ghunnah': ['Idgham', 'w/ ghunnah'], 'Idgham w/o ghunnah': ['Idgham', 'w/o ghunnah'],
  'Oral izhar': ['Oral', 'izhar'], 'Oral idgham': ['Oral', 'idgham'], 'Oral ikhfa': ['Oral', 'ikhfa'],
};

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
const words = (s: string) => fold(s).split(/[\s/?()·,-]+/).filter(Boolean);
/** 0 = the label starts with what was typed, 1 = one of its words does, -1 = no. */
const matchScore = (q: string, display: string, label: string): number => {
  const fq = fold(q.trim());
  if (!fq) return -1;
  if (fold(display).startsWith(fq) || fold(label).startsWith(fq)) return 0;
  if ([...words(display), ...words(label)].some(w => w.startsWith(fq))) return 1;
  return -1;
};

// ── Geometry (viewBox units; 0° = top, clockwise) ──────────────────────────
type Geo = { size: number; hole: number; habits: [number, number]; reading: [number, number]; tajweed: [number, number] | null };
/** Computer: both sets. */
const WIDE: Geo = { size: 540, hole: 62, habits: [68, 86], reading: [94, 178], tajweed: [186, 252] };
/** Phone: one set fills the band. */
const NARROW_GEO: Geo = { size: 430, hole: 58, habits: [62, 80], reading: [86, 212], tajweed: null };
const GAP = 1.6, RGAP = 2.5;

const pt = (c: number, r: number, a: number): [number, number] => {
  const t = ((a - 90) * Math.PI) / 180;
  return [c + r * Math.cos(t), c + r * Math.sin(t)];
};
const sector = (c: number, r0: number, r1: number, a0: number, a1: number): string => {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = pt(c, r1, a0), [x1, y1] = pt(c, r1, a1), [x2, y2] = pt(c, r0, a1), [x3, y3] = pt(c, r0, a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r1},${r1} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} A${r0},${r0} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)} Z`;
};
const annulus = (c: number, r0: number, r1: number): string =>
  `M${c - r1},${c} a${r1},${r1} 0 1 0 ${2 * r1},0 a${r1},${r1} 0 1 0 ${-2 * r1},0 Z ` +
  `M${c - r0},${c} a${r0},${r0} 0 1 1 ${2 * r0},0 a${r0},${r0} 0 1 1 ${-2 * r0},0 Z`;

/** Text along the ring; the bottom half runs reversed so it never reads upside
 *  down. Shrinks to fit the arc, but never below a readable floor. */
const ArcText: React.FC<{ id: string; c: number; r: number; a0: number; a1: number; text: string; fill: string; size: number; weight?: number }> =
  ({ id, c, r, a0, a1, text, fill, size, weight = 700 }) => {
    const mid = (a0 + a1) / 2;
    const flip = mid > 90 && mid < 270;
    const arc = (r * (a1 - a0) * Math.PI) / 180;
    const fs = Math.max(8.5, Math.min(size, (arc - 4) / (text.length * 0.6)));
    const rr = flip ? r + fs * 0.36 : r - fs * 0.36;
    const [x0, y0] = pt(c, rr, flip ? a1 : a0);
    const [x1, y1] = pt(c, rr, flip ? a0 : a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return (
      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <path id={id} d={`M${x0.toFixed(2)},${y0.toFixed(2)} A${rr.toFixed(2)},${rr.toFixed(2)} 0 ${large} ${flip ? 0 : 1} ${x1.toFixed(2)},${y1.toFixed(2)}`} fill="none" />
        <text fill={fill} fontSize={fs} fontWeight={weight}>
          <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">{text}</textPath>
        </text>
      </g>
    );
  };

/** White = the student never made it; the more often, the deeper the colour. */
const fillFor = (color: string, count: number, top: number) => {
  if (count <= 0) return { fill: '#ffffff', opacity: 1, ink: '#334155', stroke: '#dbe2ea' };
  const opacity = 0.42 + 0.58 * Math.min(1, count / top);
  return { fill: color, opacity, ink: opacity >= 0.62 ? '#ffffff' : '#1e293b', stroke: '#ffffff' };
};

interface Props {
  letterKey: string;
  glyph: string;
  translit: string;
  /** The R/T switch: the colour of the mark already on the letter. */
  markType: MistakeKind;
  readingCounts: Record<string, number>;
  tajweedCounts: Record<string, number>;
  permFlags: string[];
  text: string;
  onTextChange: (v: string) => void;
  onPick: (label: string, kind: MistakeKind, display: string) => void;
  onNote: (text: string) => void;
  onMarkOnly: () => void;
  onRemove: () => void;
  onToggleFlag: (flag: string) => void;
  voice?: MistakeVoice | null;
  onVoiceSave?: (blob: Blob, ms: number) => Promise<boolean>;
  onVoiceDelete?: () => void;
}

const BAR_H = 52;
const isNarrow = () => window.innerWidth < 700 || window.innerHeight < 660;

const MistakePicker: React.FC<Props> = ({
  letterKey, glyph, translit, markType, readingCounts, tajweedCounts, permFlags,
  text, onTextChange, onPick, onNote, onMarkOnly, onRemove, onToggleFlag,
  voice, onVoiceSave, onVoiceDelete,
}) => {
  const { language } = useI18n();
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [narrow, setNarrow] = React.useState(isNarrow);
  const [tab, setTab] = React.useState<MistakeKind>(markType);
  const [writing, setWriting] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [place, setPlace] = React.useState<{ left: number; top: number; size: number; barTop: number; centered: boolean } | null>(null);

  const live = React.useRef({ onMarkOnly, onRemove });
  live.current = { onMarkOnly, onRemove };

  const display = (o: Option) => buttonMistakeLabel(o.label, language);
  const q = text.trim();
  const matches = React.useMemo(() => (q
    ? ALL_OPTIONS
      .map((o, i) => ({ o, i, s: matchScore(q, buttonMistakeLabel(o.label, language), o.label) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => a.s - b.s || a.i - b.i)
      .map(x => x.o)
    : []), [q, language]);
  React.useEffect(() => { setActive(0); }, [q]);
  const current = matches.length ? matches[Math.min(active, matches.length - 1)] : undefined;
  const matchSet = new Set(matches.map(m => m.label));

  // On a phone, typing shows the side the first match is on.
  React.useEffect(() => { if (narrow && current) setTab(current.kind); }, [narrow, current]);

  // ── Where it sits ──────────────────────────────────────────────────────
  React.useLayoutEffect(() => {
    const layout = () => {
      const nar = isNarrow();
      setNarrow(nar);
      const vw = window.innerWidth, vh = window.innerHeight;
      if (nar) {
        const size = Math.max(260, Math.min(vw - 12, vh - 140, 430));
        const block = 54 + size + 12 + 60;
        const top = Math.max(8, (vh - block) / 2) + 54;
        setPlace({ left: (vw - size) / 2, top, size, barTop: top + size + 12, centered: false });
        return;
      }
      const size = Math.min(WIDE.size, vh - 32);
      const r = document.getElementById(`letter-${letterKey}`)?.getBoundingClientRect();
      const cx = r ? r.left + r.width / 2 : vw / 2, cy = r ? r.top + r.height / 2 : vh / 2;
      const left = Math.min(Math.max(8, cx - size / 2), vw - size - 8);
      const top = Math.min(Math.max(8, cy - size / 2), vh - size - 8);
      // Pushed in from an edge, the real letter may still sit inside the
      // opening; only when it does not is the letter drawn in the middle.
      const holePx = (WIDE.hole * size) / WIDE.size;
      const off = Math.hypot(cx - (left + size / 2), cy - (top + size / 2));
      const centered = !!r && off + Math.max(r.width, r.height) / 2 <= holePx - 4;
      // The bar goes under the ring, or over it when the ring sits low.
      const barTop = top + size + 8 + BAR_H <= vh - 8 ? top + size + 8 : Math.max(8, top - BAR_H - 8);
      setPlace({ left, top, size, barTop, centered });
    };
    layout();
    let raf = 0;
    const onMove = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [letterKey]);

  // Typing straight away on a computer; never pop the keyboard on a phone.
  // (The bar only exists once the ring has been placed, hence `placed`.)
  const placed = !!place;
  React.useEffect(() => {
    if (placed && (!narrow || writing)) inputRef.current?.focus({ preventScroll: true });
  }, [placed, narrow, writing]);

  // ── Leaving ────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || wrapRef.current?.contains(t)) return;
      // Another letter (or this one, seen through the middle): its own click
      // decides — a neighbour moves the ring there, this one turns yellow.
      if (t.closest?.('[id^="letter-"]')) return;
      if (t.closest?.('[data-mistake-undo]')) return;
      live.current.onMarkOnly();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') live.current.onRemove(); };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const pick = (o: Option) => onPick(o.label, o.kind, display(o));
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!q) onMarkOnly(); else if (current) pick(current); else onNote(q);
    }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && matches.length && (e.key === 'ArrowDown' || e.currentTarget.selectionStart === e.currentTarget.value.length)) {
      e.preventDefault(); setActive(a => (a + 1) % matches.length);
    }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && matches.length && (e.key === 'ArrowUp' || e.currentTarget.selectionStart === e.currentTarget.value.length)) {
      e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length);
    }
  };
  // Keys pressed inside belong to the ring: the page's own shortcuts (space =
  // auto-scroll, Enter swallowed, r/t) must not fire underneath.
  const onWrapKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); onRemove(); }
  };
  const segKey = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  };

  // ── The ring ───────────────────────────────────────────────────────────
  const geo = narrow ? NARROW_GEO : WIDE;
  const c = geo.size / 2;
  const showSolid = narrow || !place?.centered;
  const outerR = (geo.tajweed ?? geo.reading)[1] + 8;
  const topReading = Math.max(1, ...READING_GROUPS.flat().map(o => readingCounts[o.label] ?? 0));
  const topTajweed = Math.max(1, ...TAJWEED_OPTIONS.map(o => tajweedCounts[o.label] ?? 0));
  const segs: React.ReactNode[] = [];

  const segment = (o: Option, r0: number, r1: number, a0: number, a1: number, rim: boolean) => {
    const count = (o.kind === 'reading' ? readingCounts : tajweedCounts)[o.label] ?? 0;
    const look = fillFor(o.color, count, o.kind === 'reading' ? topReading : topTajweed);
    const dim = !!q && !matchSet.has(o.label);
    const isCurrent = !!q && current?.label === o.label;
    const lab = display(o);
    const two = language === 'en' ? TWO_LINE[lab] : undefined;
    const id = `mp${uid}-${o.kind[0]}-${o.label.replace(/[^a-zA-Z]/g, '')}`;
    const mid = (a0 + a1) / 2;
    const flip = mid > 90 && mid < 270;
    const rText1 = rim ? r1 - 5 : r1;
    return (
      <g key={id} className="mp-seg" role="button" tabIndex={0}
        aria-label={`${mistakeLabel(o.label, language)}${count ? `, ${count} so far` : ''}`}
        onClick={() => pick(o)} onKeyDown={segKey(() => pick(o))}
        style={{ pointerEvents: 'auto', opacity: dim ? 0.18 : 1, transition: 'opacity 120ms' }}>
        <title>{mistakeLabel(o.label, language)}{count ? ` · ${count}×` : ''}</title>
        <path d={sector(c, r0, rText1, a0, a1)} fill={look.fill} fillOpacity={look.opacity}
          stroke={isCurrent ? '#0f766e' : look.stroke} strokeWidth={isCurrent ? 3 : 1.5} />
        {rim && <path d={sector(c, r1 - 4, r1, a0, a1)} fill={o.color} />}
        {two && rText1 - r0 >= 36 ? (() => {
          const far = r0 + (rText1 - r0) * 0.67, near = r0 + (rText1 - r0) * 0.33;
          return (
            <>
              <ArcText id={`${id}a`} c={c} r={flip ? near : far} a0={a0} a1={a1} text={two[0]} fill={look.ink} size={11.5} />
              <ArcText id={`${id}b`} c={c} r={flip ? far : near} a0={a0} a1={a1} text={two[1]} fill={look.ink} size={10.5} />
            </>
          );
        })() : (
          <ArcText id={id} c={c} r={(r0 + rText1) / 2} a0={a0} a1={a1} text={lab} fill={look.ink} size={11.5} />
        )}
      </g>
    );
  };

  // Habits, around the letter.
  PERMANENT_MISTAKES.forEach((flag, i) => {
    const a0 = -45 + i * 90 + GAP / 2, a1 = 45 + i * 90 - GAP / 2;
    const on = permFlags.includes(flag);
    const name = language === 'en' ? FLAG_DISPLAY[flag] : mistakeLabel(flag, language);
    segs.push(
      <g key={`h-${flag}`} className="mp-seg" role="switch" aria-checked={on} tabIndex={0} aria-label={mistakeLabel(flag, language)}
        onClick={() => onToggleFlag(flag)} onKeyDown={segKey(() => onToggleFlag(flag))}
        style={{ pointerEvents: 'auto', opacity: q ? 0.25 : 1 }}>
        <title>{mistakeLabel(flag, language)}</title>
        <path d={sector(c, geo.habits[0], geo.habits[1], a0, a1)} fill={on ? '#059669' : '#ffffff'} stroke="#ffffff" strokeWidth={1.5} />
        <ArcText id={`mp${uid}-h${i}`} c={c} r={(geo.habits[0] + geo.habits[1]) / 2} a0={a0} a1={a1}
          text={`${on ? '✓ ' : ''}${name}`} fill={on ? '#ffffff' : '#475569'} size={10.5} />
      </g>,
    );
  });

  const drawReading = (band: [number, number]) => {
    const weights = READING_GROUPS.map(g => 1 + 0.25 * (g.length - 1));
    const unit = 360 / weights.reduce((a, b) => a + b, 0);
    let start = 0;
    READING_GROUPS.forEach((group, gi) => {
      const a0 = start + GAP / 2, a1 = start + weights[gi] * unit - GAP / 2;
      start += weights[gi] * unit;
      const n = group.length;
      const lh = (band[1] - band[0] - RGAP * (n - 1)) / n;
      group.forEach((o, si) => {
        const r1 = band[1] - si * (lh + RGAP);
        segs.push(segment(o, r1 - lh, r1, a0, a1, false));
      });
    });
  };
  const drawTajweed = (band: [number, number]) => {
    const span = 360 / TAJWEED_OPTIONS.length;
    TAJWEED_OPTIONS.forEach((o, i) => {
      segs.push(segment(o, band[0], band[1], i * span + GAP / 2, (i + 1) * span - GAP / 2, true));
    });
  };
  if (geo.tajweed) { drawReading(geo.reading); drawTajweed(geo.tajweed); }
  else if (tab === 'reading') drawReading(geo.reading);
  else drawTajweed(geo.reading);

  const quranFont = `'${currentQuranicFont()}', 'Amiri Quran', serif`;
  const markInk = markType === 'tajweed' ? '#166534' : '#991b1b';
  const ref = letterKey.replace(/^T/, '').split(':').slice(0, 2).join(':');
  const size = place?.size ?? geo.size;

  const hint = !q
    ? <><Kbd>Enter</Kbd> mark only</>
    : current
      ? <><Kbd>Enter</Kbd> <strong className="text-slate-900">{display(current)}</strong></>
      : <><Kbd>Enter</Kbd> note</>;

  const field = (
    <label className="flex-grow min-w-0 flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-[9px] border border-slate-300 bg-slate-50 focus-within:bg-white focus-within:border-teal-500 focus-within:ring-[3px] focus-within:ring-teal-500/20">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="text-slate-500 flex-shrink-0" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.3-4.3" /></svg>
      <input ref={inputRef} value={text} onChange={e => onTextChange(e.target.value)} onKeyDown={onInputKey}
        aria-label="Find a mistake, or write a note" placeholder={narrow ? 'Find, or write a note' : 'Type to find, or a note'}
        className="flex-grow min-w-0 bg-transparent border-0 outline-none text-[13px] text-slate-900 placeholder:text-slate-400" />
      {!narrow && <span className="text-[11px] text-slate-500 whitespace-nowrap">{hint}</span>}
    </label>
  );
  const removeBtn = (
    <button type="button" onClick={onRemove} aria-label="Remove the mark" title="Remove the mark · Esc"
      className={`flex-shrink-0 ${narrow ? 'w-[46px] h-[46px] border border-slate-200' : 'w-9 h-9'} rounded-[9px] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
  const voiceBtn = onVoiceSave && (
    <VoiceNoteButton size="md" voice={voice} onSave={onVoiceSave} onDelete={() => onVoiceDelete?.()} />
  );

  return (
    <div ref={wrapRef} dir="ltr" onKeyDown={onWrapKey} role="dialog" aria-label={`Log a mistake on ${translit}`}
      className="fixed inset-0 z-[9999] pointer-events-none" style={{ visibility: place ? 'visible' : 'hidden' }}>
      <style>{`.mp-seg{cursor:pointer;outline:none}.mp-seg:hover path:first-of-type,.mp-seg:focus-visible path:first-of-type{filter:brightness(.93) saturate(1.35)}.mp-seg:focus-visible path:first-of-type{stroke:#0f766e;stroke-width:3}`}</style>

      {/* A phone gets a dimmed page: a tap on it keeps the mark and closes. */}
      {narrow && <div className="absolute inset-0 bg-slate-900/30 pointer-events-auto" onClick={onMarkOnly} aria-hidden="true" />}

      {narrow && place && (
        <div role="tablist" className="absolute flex gap-1 p-[3px] rounded-xl bg-white shadow-[0_6px_18px_rgba(15,23,42,0.18)] pointer-events-auto"
          style={{ top: place.top - 52, left: '50%', transform: 'translateX(-50%)', width: 260 }}>
          {(['reading', 'tajweed'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`flex-1 h-[38px] rounded-[9px] inline-flex items-center justify-center gap-[7px] text-[14px] ${tab === k
                ? (k === 'reading' ? 'bg-red-100 text-red-800 font-bold' : 'bg-green-100 text-green-800 font-bold')
                : 'text-slate-600 font-semibold'}`}>
              <span className={`w-2 h-2 rounded-full ${k === 'reading' ? 'bg-red-600' : 'bg-green-600'}`} />
              {k === 'reading' ? 'Reading' : 'Tajweed'}
            </button>
          ))}
        </div>
      )}

      <div className="absolute" style={{ left: place?.left ?? 0, top: place?.top ?? 0, width: size, height: size }}>
        <svg viewBox={`0 0 ${geo.size} ${geo.size}`} width={size} height={size}
          style={{ pointerEvents: 'none', fontFamily: 'Inter, system-ui, sans-serif', filter: 'drop-shadow(0 14px 30px rgba(15,23,42,0.28))', overflow: 'visible' }}>
          {/* The band background takes the clicks that fall between slices, so
              they never reach a letter underneath. The middle stays open. */}
          <path d={annulus(c, geo.hole + 1, outerR)} fill="#f4f7fa" fillOpacity={0.95} fillRule="evenodd" style={{ pointerEvents: 'auto' }} />
          {showSolid && <circle cx={c} cy={c} r={geo.hole} fill="#ffffff" style={{ pointerEvents: 'auto' }} />}
          <circle cx={c} cy={c} r={geo.hole} fill="none" stroke="#ffffff" strokeWidth={3} />
          <circle cx={c} cy={c} r={geo.hole + 1.5} fill="none" stroke={markType === 'tajweed' ? '#86efac' : '#fca5a5'} strokeWidth={1.5} />
          {segs}
        </svg>
        {showSolid && (
          <div className="absolute flex flex-col items-center justify-center pointer-events-none text-center"
            style={{ left: '50%', top: '50%', width: (geo.hole * 2 * size) / geo.size, height: (geo.hole * 2 * size) / geo.size, transform: 'translate(-50%,-50%)' }}>
            <span lang="ar" style={{ fontFamily: quranFont, fontSize: Math.round(size * 0.085), lineHeight: 1.25, color: markInk }}>{glyph}</span>
            <span className="text-[11px] font-bold text-slate-700 leading-tight">{translit} · {ref}</span>
          </div>
        )}
      </div>

      {place && !narrow && (
        <div role="toolbar" aria-label="Find, note, mark only or remove"
          className="absolute flex items-center gap-2 p-[7px] rounded-[14px] bg-white border border-slate-200 shadow-[0_12px_30px_rgba(15,23,42,0.16)] pointer-events-auto"
          style={{ left: place.left, top: place.barTop, width: place.size, height: BAR_H }}>
          <span className="flex-shrink-0 flex items-center gap-1.5 pl-1.5 pr-1 text-[13px] font-bold text-slate-900 whitespace-nowrap">
            <span className={`w-2 h-2 rounded-full ${markType === 'tajweed' ? 'bg-green-600' : 'bg-red-600'}`} />
            {translit}<span className="font-medium text-slate-500">{ref}</span>
          </span>
          {field}
          {voiceBtn}
          <button type="button" onClick={onMarkOnly}
            className="flex-shrink-0 h-9 px-2.5 rounded-[9px] border border-slate-300 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap">Mark only</button>
          {removeBtn}
        </div>
      )}

      {place && narrow && (
        <div className="absolute left-4 right-4 flex flex-col gap-2 pointer-events-auto" style={{ top: place.barTop }}>
          {(writing || q) && (
            <div className="flex items-center gap-2 p-1.5 rounded-[14px] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.2)]">
              {field}
              {q && !current && (
                <button type="button" onClick={() => onNote(q)}
                  className="flex-shrink-0 h-9 px-3 rounded-[9px] bg-slate-900 text-white text-[13px] font-bold">Save</button>
              )}
              {q && current && (
                <button type="button" onClick={() => pick(current)}
                  className="flex-shrink-0 h-9 px-3 rounded-[9px] bg-teal-700 text-white text-[13px] font-bold truncate max-w-[45%]">{display(current)}</button>
              )}
            </div>
          )}
          <div className="flex gap-2 p-1.5 rounded-2xl bg-white shadow-[0_10px_28px_rgba(15,23,42,0.2)]">
            <button type="button" onClick={() => setWriting(w => !w)} aria-pressed={writing}
              className="flex-shrink-0 h-[46px] px-3 rounded-[11px] border border-slate-200 bg-white text-[14px] font-semibold text-slate-700 inline-flex items-center gap-1.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16.5 3.9l3.6 3.6L8 19.6 3.6 21l1.4-4.4z" /></svg>
              Write
            </button>
            {voiceBtn}
            <button type="button" onClick={onMarkOnly}
              className="flex-grow h-[46px] rounded-[11px] bg-slate-900 text-white text-[14px] font-bold">Mark only</button>
            {removeBtn}
          </div>
        </div>
      )}
    </div>
  );
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block px-1 py-px mr-0.5 rounded-[5px] border border-slate-300 bg-white text-[10.5px] text-slate-700">{children}</span>
);

export default MistakePicker;
