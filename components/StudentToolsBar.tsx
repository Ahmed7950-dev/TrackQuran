import React, { useEffect, useRef, useState } from 'react';
import StudentProfileIcon from './StudentProfileIcon';

/**
 * The student tools bar — the thin sticky strip under the header that carries
 * every tool belonging to ONE student.
 *
 * It used to show the tools and not the student. That reads fine on the main
 * page, where the name is on the card right below it, and badly everywhere
 * else: in Qaedah, in Media, in Mistakes Study, in an open Quran session,
 * nothing on the screen said whose lesson this was. So the bar now opens with
 * the student — avatar, name, and a green dot on the avatar while a Quran
 * session is running — and the tools follow to the right of a hairline.
 *
 * Two rules hold the layout together:
 *   • the student never scrolls. The name block sits OUTSIDE the scrolling
 *     strip, so on a phone you can run through the tools with the student
 *     still in view.
 *   • the tools are one family. Every tool is the same pill: the page you are
 *     on is filled in the app's accent, Quran — which opens a live session
 *     rather than a page — is filled in green. The old bar mixed underlined
 *     tabs with one square green block and looked like two bars fighting.
 *
 * Colours are plain Tailwind utilities on purpose: `reading` and `amber`
 * restyle the app by restating those exact classes (see index.html), so a
 * hand-written hex here would be the one thing in the bar that ignores the
 * theme.
 */

export type ToolsTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** A count worth showing on the pill. Zero and undefined both show nothing. */
  badge?: number;
  /** 'primary' is Quran: an action (open the session), not a page.
   *  'homework' keeps its violet so the badge and the pill agree. */
  tone?: 'default' | 'homework' | 'primary';
};

type Props = {
  studentName: string;
  profileIcon?: string;
  tabs: ToolsTab[];
  /** The tool currently open, or null when none of them is. */
  activeId: string | null;
  onSelect: (id: string) => void;
  /** True while a Quran logging session is open — the dot on the avatar. */
  inSession?: boolean;
  /** Where the sticky bar comes to rest: the measured header height. */
  stickyTop: number;
  /** App measures this bar to place the surah nav below it. */
  barRef?: React.RefObject<HTMLDivElement>;
};

/** How far the strip can still scroll each way, so an edge is only faded when
 *  something is actually hidden behind it. */
function useScrollEdges(ref: React.RefObject<HTMLElement>): { start: boolean; end: boolean } {
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const left = Math.abs(el.scrollLeft);                    // RTL reports it negative
      const max = el.scrollWidth - el.clientWidth;
      setEdges(prev => {
        const next = { start: left > 4, end: left < max - 4 };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    read();
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', read); ro.disconnect(); };
  }, [ref]);
  return edges;
}

const PILL = 'group relative flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg ' +
             'text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 ' +
             'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50';

const REST = 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:text-slate-800 ' +
             'dark:hover:bg-gray-700/70 dark:hover:text-slate-100';

/** The page you are on. Teal by day, the app's orange by night. */
const ON_DEFAULT = 'bg-teal-100/70 text-teal-800 ring-1 ring-teal-600/20 ' +
                   'dark:bg-orange-400/15 dark:text-orange-300 dark:ring-orange-400/30';

const ON_HOMEWORK = 'bg-violet-100/70 text-violet-800 ring-1 ring-violet-600/20 ' +
                    'dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/30';

/** Quran, the live session: filled while it runs, tinted while it waits. */
const QURAN_ON = 'bg-green-500 text-white shadow-sm';
const QURAN_OFF = 'bg-green-50 text-green-700 ring-1 ring-green-600/20 hover:bg-green-100 ' +
                  'dark:bg-green-900/30 dark:text-green-300 dark:ring-green-400/20 dark:hover:bg-green-900/50';

const StudentToolsBar: React.FC<Props> = ({
  studentName, profileIcon, tabs, activeId, onSelect, inSession = false, stickyTop, barRef,
}) => {
  const stripRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const edges = useScrollEdges(stripRef);

  // On a phone the open tool is usually off the end of the strip. Bring it into
  // view — `block: 'nearest'` so the page itself never moves.
  //
  // Watching the strip's own width is not enough: the Lottie icon and the web
  // font land after the first paint and widen the row underneath the scroll
  // that just happened, which is how the open tool ended up off-screen again.
  useEffect(() => {
    const el = activeRef.current, strip = stripRef.current, row = navRef.current;
    if (!el || !strip || !row) return;
    const bring = () => {
      const a = el.getBoundingClientRect(), s = strip.getBoundingClientRect();
      if (a.left >= s.left - 1 && a.right <= s.right + 1) return;   // already in view
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    };
    bring();
    const ro = new ResizeObserver(bring);
    ro.observe(row);
    return () => ro.disconnect();
  }, [activeId]);

  // Fade only the side that has something behind it.
  const fade = edges.start || edges.end
    ? `linear-gradient(to right, transparent 0, #000 ${edges.start ? '26px' : '0px'},` +
      ` #000 calc(100% - ${edges.end ? '26px' : '0px'}), transparent 100%)`
    : undefined;

  return (
    <div
      ref={barRef}
      className="sticky z-[35] bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 shadow-sm no-print"
      style={{ top: stickyTop }}
    >
      <div className="flex items-stretch">
        {/* ── Whose lesson this is ── */}
        <div className="flex items-center gap-2.5 flex-shrink-0 ps-3 pe-2.5 py-1.5" title={studentName}>
          <span className="relative flex-shrink-0 rounded-full p-[2px] bg-gradient-to-br from-teal-400 to-emerald-600 dark:from-orange-400 dark:to-amber-600">
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full overflow-hidden bg-white dark:bg-gray-800">
              {profileIcon
                ? <StudentProfileIcon src={profileIcon} size={28} mode="always" />
                : <span className="text-[13px] font-extrabold text-teal-700 dark:text-orange-300">
                    {studentName.charAt(0).toUpperCase()}
                  </span>}
            </span>
            {inSession && (
              <span
                aria-label="Quran session open"
                className="absolute -bottom-px -end-px w-3 h-3 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-800"
              />
            )}
          </span>
          <span className="max-w-[108px] sm:max-w-[190px] truncate text-[14px] sm:text-[15px] font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            {studentName}
          </span>
        </div>

        <span className="w-px self-stretch my-2 bg-slate-200 dark:bg-gray-700 flex-shrink-0" />

        {/* ── What you can do with them ── */}
        <div
          ref={stripRef}
          className="flex-1 min-w-0 overflow-x-auto scrollbar-none"
          style={{ scrollbarWidth: 'none', maskImage: fade, WebkitMaskImage: fade }}
        >
          <nav ref={navRef} className="flex items-center gap-0.5 w-max mx-auto px-1.5 py-1.5">
            {tabs.map(tab => {
              const on = activeId === tab.id;
              const primary = tab.tone === 'primary';
              const look = primary
                ? (on ? QURAN_ON : QURAN_OFF)
                : on ? (tab.tone === 'homework' ? ON_HOMEWORK : ON_DEFAULT)
                     : REST;
              return (
                <button
                  key={tab.id}
                  ref={on ? activeRef : undefined}
                  onClick={() => onSelect(tab.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`${PILL} ${look} ${primary ? 'font-bold' : ''}`}
                >
                  {tab.icon}
                  {tab.label}
                  {!!tab.badge && tab.badge > 0 && (
                    <span className={`min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-extrabold leading-none inline-flex items-center justify-center text-white ${
                      tab.tone === 'homework' ? 'bg-violet-600' : 'bg-rose-500'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default StudentToolsBar;
