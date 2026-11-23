import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { getPageOfAyah } from '../services/dataService';

/**
 * The thin bar beside the verses on the live logging page.
 *
 * The bar is the printed Madani mushaf page's 15 lines as dashes. They slide
 * as the tutor scrolls so that the line being read sits at the bar's middle,
 * which is the middle of the visible Quran area (between the toolbar and the
 * bottom of the screen). Lines up to it are orange, the rest grey, and the
 * pages before and after show faint beyond a gap. The orange is the surah
 * line's under the toolbar, so the two read as one.
 *
 * The page flows its text, so a screen line is not a mushaf line. Every word's
 * mushaf line comes from public/mushaf-lines.json (scripts/build-mushaf-lines.py),
 * keyed by the same word index as the letter ids (`letter-s:a:w:l`).
 * Colours per theme: the .plb-* rules in index.css.
 */

/** [surah - 1][ayah - 1] = [line of the first word, word indexes where the next line starts...] */
type LineData = number[][][];

let linesLoad: Promise<LineData | null> | null = null;
const loadLines = (): Promise<LineData | null> => {
    if (!linesLoad) {
        const load = fetch('/mushaf-lines.json')
            .then(r => (r.ok ? r.json() : null))
            .then(j => (j && Array.isArray(j.lines) ? (j.lines as LineData) : null))
            .catch(() => null);
        linesLoad = load;
        // A failed load may be a passing blip: the next open tries again.
        load.then(d => { if (!d && linesLoad === load) linesLoad = null; });
    }
    return linesLoad;
};

const lineOfWord = (data: LineData, s: number, a: number, w: number): number | null => {
    const e = data[s - 1]?.[a - 1];
    if (!e || !e.length) return null;
    let line = e[0];
    for (let i = 1; i < e.length && w >= e[i]; i++) line++;
    return line;
};

const LINES = 15;
/** L = one line's dash, G = the gap between lines, P = the gap between pages,
 *  inset = bar centre from the Quran box's edge. */
const GEO = {
    wide:  { L: 12, G: 3, P: 14, inset: 24, maxH: 520 },
    phone: { L: 10, G: 3, P: 12, inset: 15, maxH: 480 },
};
const TRACK = 3;           // the same 3px as the surah line under the toolbar
const TOP_GAP = 20;        // air under the toolbar
const BOTTOM_RESERVE = 88; // the round back-to-start button (bottom-6, 48px) and air
const FADE = 'linear-gradient(to bottom, transparent 0%, #000 13%, #000 87%, transparent 100%)';

/** A screen line: its centre (from the Quran box's top) and where its first
 *  word sits on the tape, in px. The bar's middle follows the first word. */
interface ScreenLine { y: number; px: number }
interface Model { lines: ScreenLine[]; base: number; reach: number }
interface View { show: boolean; left: number; top: number; h: number; base: number; page: number; line: number }
const HIDDEN: View = { show: false, left: 0, top: 0, h: 0, base: 0, page: 0, line: 0 };

interface Props {
    /** The Quran box: the verses are measured in it and the bar sits at its right edge. */
    bodyRef: React.RefObject<HTMLElement>;
    /** The sticky toolbar: the reading line is the middle of the space under it. */
    toolbarRef: React.RefObject<HTMLElement>;
    /** Changes whenever the verses may have re-flowed (surah, pages, text size, translation). */
    layoutKey: string;
}

const PageLineBar: React.FC<Props> = ({ bodyRef, toolbarRef, layoutKey }) => {
    const [data, setData] = useState<LineData | null>(null);
    const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
    const [view, setView] = useState<View>(HIDDEN);
    const model = useRef<Model | null>(null);
    const tapeRef = useRef<HTMLDivElement>(null);
    const g = phone ? GEO.phone : GEO.wide;
    const step = g.L + g.G;
    const stride = LINES * step - g.G + g.P;

    useEffect(() => {
        let alive = true;
        loadLines().then(d => { if (alive) setData(d); });
        return () => { alive = false; };
    }, []);

    const measure = (): Model | null => {
        const body = bodyRef.current;
        if (!body || !data) return null;
        const top = body.getBoundingClientRect().top;
        const words: { y: number; page: number; line: number }[] = [];
        let reach = 0;
        // One span per word: its first letter. Turkish keys (T…) carry no number and drop out.
        body.querySelectorAll<HTMLElement>('span[id^="letter-"][id$=":0"]').forEach(el => {
            const [s, a, w] = el.id.slice(7).split(':').map(Number);
            if (!s || !a || !Number.isInteger(w)) return;
            const line = lineOfWord(data, s, a, w);
            if (line == null) return;
            const r = el.getBoundingClientRect();
            if (!r.height) return;
            reach = Math.max(reach, r.height);
            words.push({ y: (r.top + r.bottom) / 2 - top, page: getPageOfAyah(s, a), line });
        });
        if (!words.length) return null;
        // A word's place on the tape: its mushaf line plus how far along that line it is.
        const inLine = new Map<string, number>();
        for (const w of words) { const k = `${w.page}:${w.line}`; inLine.set(k, (inLine.get(k) ?? 0) + 1); }
        const seen = new Map<string, number>();
        const base = words[0].page;
        const lines: ScreenLine[] = [];
        let lineY = -Infinity;
        for (const w of words) {
            const k = `${w.page}:${w.line}`;
            const j = seen.get(k) ?? 0;
            seen.set(k, j + 1);
            if (w.y - lineY > reach * 0.5) {
                lines.push({ y: w.y, px: (w.page - base) * stride + (w.line - 1 + j / (inLine.get(k) ?? 1)) * step });
                lineY = w.y;
            }
        }
        return { lines, base, reach };
    };

    const update = () => {
        const m = model.current;
        const body = bodyRef.current;
        const hide = () => setView(v => (v.show ? { ...v, show: false } : v));
        if (!m || !body) { hide(); return; }
        const vh = window.innerHeight;
        const tb = Math.max(0, toolbarRef.current?.getBoundingClientRect().bottom ?? 0);
        const readY = (tb + vh) / 2;
        const h = Math.floor(Math.min(g.maxH, 2 * Math.min(readY - tb - TOP_GAP, vh - BOTTOM_RESERVE - readY)));
        const box = body.getBoundingClientRect();
        const y = readY - box.top;
        const ls = m.lines;
        const first = ls[0];
        const last = ls[ls.length - 1];
        // Off the verses (the surah's title above, the page buttons below): nothing to show.
        if (h < 120 || y < first.y - m.reach || y > last.y + m.reach) { hide(); return; }
        // The screen line at the bar's middle: the one whose centre is nearest
        // the reading line. The tape and the orange follow that line, and the
        // tape glides between lines (CSS transition).
        let lo = 0;
        let hi = ls.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (ls[mid].y < y) lo = mid + 1; else hi = mid;
        }
        if (lo > 0 && Math.abs(ls[lo - 1].y - y) <= Math.abs(ls[lo].y - y)) lo -= 1;
        const px = ls[lo].px;
        const k = Math.floor(px / stride);
        const line = Math.min(LINES, Math.max(1, Math.floor((px - k * stride) / step) + 1));
        const next: View = {
            show: true,
            left: Math.round(box.right - g.inset - TRACK / 2),
            top: Math.round(readY - h / 2),
            h,
            base: m.base,
            page: m.base + k,
            line,
        };
        if (tapeRef.current) tapeRef.current.style.transform = `translate3d(0, ${(h / 2 - px).toFixed(1)}px, 0)`;
        setView(v => (v.show && v.left === next.left && v.top === next.top && v.h === next.h
            && v.base === next.base && v.page === next.page && v.line === next.line ? v : next));
    };

    const measureRef = useRef(measure);
    measureRef.current = measure;
    const updateRef = useRef(update);
    updateRef.current = update;

    // Measure again whenever the verses may have moved.
    useEffect(() => {
        if (!data) return;
        let raf = 0;
        const rebuild = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { model.current = measureRef.current(); updateRef.current(); });
        };
        rebuild();
        const body = bodyRef.current;
        const ro = body && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(rebuild) : null;
        if (ro && body) ro.observe(body);
        let alive = true;
        document.fonts?.ready.then(() => { if (alive) rebuild(); }).catch(() => {});
        return () => { alive = false; cancelAnimationFrame(raf); ro?.disconnect(); };
    }, [data, layoutKey, phone, bodyRef]);

    // Follow the scroll and the window.
    useEffect(() => {
        let raf = 0;
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateRef.current(); });
        };
        const onResize = () => { setPhone(window.innerWidth < 640); onScroll(); };
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            cancelAnimationFrame(raf);
        };
    }, []);

    // The open page's 15 lines plus two pages either side; colours change only with the line.
    const dashes = useMemo(() => {
        const out: { key: string; top: number; cls: string }[] = [];
        if (!view.page) return out;
        for (let d = -2; d <= 2; d++) {
            const page = view.page + d;
            if (page < 1 || page > 604) continue;
            for (let i = 0; i < LINES; i++) {
                out.push({
                    key: `${page}:${i}`,
                    top: (page - view.base) * stride + i * step,
                    cls: d < 0 ? 'plb-prev' : d > 0 ? 'plb-next' : i < view.line ? 'plb-read' : 'plb-unread',
                });
            }
        }
        return out;
    }, [view.page, view.line, view.base, stride, step]);

    if (typeof document === 'undefined') return null;
    return ReactDOM.createPortal(
        <div
            aria-hidden="true"
            className="fixed z-20 pointer-events-none select-none transition-opacity duration-200"
            style={{ left: view.left, top: view.top, width: TRACK, height: view.h, opacity: view.show ? 1 : 0, visibility: view.h ? 'visible' : 'hidden' }}
        >
            <div className="absolute inset-0 overflow-hidden" style={{ WebkitMaskImage: FADE, maskImage: FADE }}>
                <div ref={tapeRef} className="absolute inset-x-0 top-0 will-change-transform transition-transform duration-200 ease-out">
                    {dashes.map(d => (
                        <div key={d.key} className={`absolute inset-x-0 rounded-full ${d.cls}`} style={{ top: d.top, height: g.L }} />
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
};

export default PageLineBar;
