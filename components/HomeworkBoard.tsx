// ─────────────────────────────────────────────────────────────────────────────
// HomeworkBoard — the monthly board, in its two readings.
//
//   StudentHomeworkBoard  the best five, his own place among them, and one
//                         sentence telling him where to aim next. He sees it
//                         twice over a piece of homework: when he hands it in
//                         (`scored` false — it is with his teacher and has not
//                         counted yet) and when the teacher passes it, which
//                         is the moment it counts and the one that may claim a
//                         climb.
//   TutorHomeworkBoard    the same month in the tutor's Homework tab, beside
//                         the student's own homework: every student, the ones
//                         who have sent nothing included, and a month he can
//                         step back through.
//
// The two look nothing alike on purpose. The student's is the recitation
// page's own cream-and-gold mushaf, drawn with that page's palette so it does
// not arrive as a different app; the tutor's is a panel in his dashboard, in
// all four of its themes.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import {
  TOP_N, fetchBoard, firstName, isThisMonth, monthLabel, monthName, nextMonthName,
  ordinal, ordinalSuffix, rankBoard, standingOf,
  type BoardEntry, type RankedEntry, type Standing,
} from '../services/homeworkBoardService';
import { MOVE_LABEL, cheerFor, moveOf, type CheerCtx } from '../utils/leaderboardCheer';

const SERIF = "'Cormorant Garamond', Georgia, serif";

/* ── Shared ────────────────────────────────────────────────────────────── */

/** What a student is shown instead of his own name. */
const YOU = 'You';

/** The standing as the sentences need it. */
const ctxOf = (s: Standing): CheerCtx => ({
  rank: s.me?.rank ?? 0,
  sent: s.me?.sent ?? 0,
  total: s.all.length,
  movedUp: s.scored ? s.movedUp : 0,
  passed: s.scored && s.passed[0] ? firstName(s.passed[0].name) : null,
  aheadName: s.ahead ? firstName(s.ahead.name) : null,
  toNext: s.toNext,
  behindName: s.behind ? firstName(s.behind.name) : null,
  behindGap: s.me && s.behind ? s.me.sent - s.behind.sent : 0,
  fifthName: s.all[TOP_N - 1] ? firstName(s.all[TOP_N - 1].name) : null,
  toTop5: s.toTop5,
  firstEver: s.scored && s.rankBefore === null,
});

const arrowUp = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
  </svg>
);

const star = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.6l2.7 5.9 6.3.7-4.7 4.3 1.3 6.2L12 16.6l-5.6 3.1 1.3-6.2L3 9.2l6.3-.7z" />
  </svg>
);

const clock = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" />
  </svg>
);

const dot = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="5" />
  </svg>
);

/* ── The student's screen ──────────────────────────────────────────────── */

/** The tokens this screen borrows from the page it opens over. */
export interface BoardPalette {
  page: string; card: string; cardBorder: string; ink: string; muted: string;
  gold: string; goldInk: string; goldSoft: string; goldHalo: string;
  primary: string; onPrimary: string; track: string; hint: string; hintInk: string;
  chipIdleBorder: string; chipIdleInk: string; ghost: string; ghostBorder: string; ghostInk: string;
}

export const StudentHomeworkBoard: React.FC<{
  palette: BoardPalette;
  standing: Standing;
  month: Date;
  display: string;
  body: string;
  /** Out of here, to the page he came from. */
  onBack: () => void;
  /** Stay and look at the homework he has just sent. */
  onStay?: () => void;
}> = ({ palette: P, standing, month, display, body, onBack, onStay }) => {
  const me = standing.me;
  const c = useMemo(() => ctxOf(standing), [standing]);
  const cheer = useMemo(() => cheerFor(c), [c]);
  const move = moveOf(c);
  const top = standing.top;
  const best = top[0]?.sent ?? 1;
  /** Below the five, his own row is shown under them, after a gap. */
  const below = me && me.rank > TOP_N ? me : null;

  /** Nothing finished this month yet — he is not on the board at all. */
  const fifth = standing.all[TOP_N - 1] ?? null;
  const toJoin = fifth ? fifth.sent + 1 : 1;

  const moveChip = !me
    ? { bg: P.goldHalo, ink: P.goldInk, icon: dot(12), label: 'Not on the board yet' }
    : !standing.scored
    ? { bg: P.goldHalo, ink: P.goldInk, icon: clock(13), label: 'With your teacher' }
    : {
        up: { bg: P.hint, ink: P.hintInk, icon: arrowUp(14), label: MOVE_LABEL.up(c) },
        held: { bg: P.goldHalo, ink: P.goldInk, icon: me.rank === 1 ? star(14) : dot(12), label: MOVE_LABEL.held(c) },
        new: { bg: P.goldHalo, ink: P.goldInk, icon: star(14), label: MOVE_LABEL.new(c) },
      }[move];

  // What the hero says. Only the scored reading may claim a climb; the other
  // two say where he stands and what the next step is, and nothing more.
  const headline = !me
    ? 'The board is waiting for you.'
    : cheer.headline;
  const line = !me
    ? (fifth
      ? `Finish ${toJoin} this month and you are in the five.`
      : 'Finish one this month and the board is yours to open.')
    : cheer.line;

  const row = (r: RankedEntry, mine: boolean) => (
    <div key={r.studentId}
      style={{
        background: mine ? P.goldSoft : 'transparent',
        boxShadow: mine ? `inset 0 0 0 2px ${P.gold}` : 'none',
      }}
      className="rounded-2xl px-3 py-2.5 flex items-center gap-3">
      <span aria-hidden="true"
        style={{
          borderColor: r.rank === 1 || mine ? P.gold : P.chipIdleBorder,
          background: r.rank === 1 ? P.gold : 'transparent',
          color: r.rank === 1 ? P.onPrimary : mine ? P.goldInk : P.chipIdleInk,
          fontFamily: display,
        }}
        className="w-[30px] h-[30px] flex-shrink-0 rounded-full border-2 flex items-center justify-center text-[15px] font-bold">
        {r.rank}
      </span>
      <span className="flex-grow min-w-0 flex flex-col gap-1.5">
        <span style={{ color: P.ink, fontWeight: mine ? 800 : 600 }}
          className="text-[15px] truncate">
          {mine ? YOU : firstName(r.name)}
        </span>
        <span style={{ background: P.track }} className="block h-1.5 rounded-full">
          <span style={{ width: `${Math.max(6, Math.round((r.sent / best) * 100))}%`, background: mine ? P.gold : P.primary }}
            className="block h-1.5 rounded-full" />
        </span>
      </span>
      <span style={{ fontFamily: display, color: mine ? P.goldInk : P.ink }}
        className="flex-shrink-0 text-[19px] font-semibold tabular-nums">
        {r.sent}
      </span>
    </div>
  );

  return (
    <div style={{ background: P.page, color: P.ink, fontFamily: body }}
      className="min-h-[100dvh] w-full flex justify-center">
      <div className="w-full max-w-[460px] px-5 pt-7 pb-6 flex flex-col gap-4">

        <div className="flex items-baseline justify-between gap-3">
          <p style={{ color: P.goldInk }} className="m-0 text-[11px] font-extrabold uppercase tracking-[0.14em]">
            Homework board
          </p>
          <p style={{ color: P.muted }} className="m-0 text-xs font-bold">{monthName(month)}</p>
        </div>

        <div style={{ background: P.card, border: `1px solid ${P.cardBorder}` }}
          className="rounded-[26px] px-5 py-5 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <span aria-hidden="true"
              style={{
                borderColor: P.gold,
                background: me?.rank === 1 ? P.gold : P.goldSoft,
                color: me?.rank === 1 ? P.onPrimary : P.goldInk,
                fontFamily: display,
              }}
              className="w-[68px] h-[68px] flex-shrink-0 rounded-full border-[3px] flex items-baseline justify-center gap-px">
              <span className="text-[34px] font-semibold leading-none">{me?.rank ?? '—'}</span>
              <span style={{ fontFamily: body }} className="text-[13px] font-bold">
                {me ? ordinalSuffix(me.rank) : ''}
              </span>
            </span>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span style={{ background: moveChip.bg, color: moveChip.ink }}
                className="self-start inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1 text-[12.5px] font-extrabold">
                {moveChip.icon}
                {moveChip.label}
              </span>
              <p style={{ color: P.muted }} className="m-0 text-[13.5px] font-semibold">
                {c.sent} finished this month
                {standing.scored && standing.rankBefore && standing.rankBefore !== c.rank
                  ? ` · ${ordinal(standing.rankBefore)} before this one`
                  : ''}
              </p>
            </div>
          </div>
          <div>
            <p style={{ fontFamily: display, color: P.ink }}
              className="m-0 mb-1.5 text-[25px] leading-[1.18] font-semibold">
              {headline}
            </p>
            <p style={{ color: P.muted }} className="m-0 text-[14.5px] leading-[1.45]">{line}</p>
          </div>
          {!standing.scored && (
            <p style={{ background: P.goldHalo, color: P.goldInk }}
              className="m-0 rounded-2xl px-3.5 py-2.5 text-[13.5px] font-semibold leading-[1.4]">
              The one you have just sent is with your teacher. It joins the board the moment he
              marks it right.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <p style={{ color: P.muted }} className="m-0 text-[11px] font-extrabold uppercase tracking-[0.12em]">
            Top five this month
          </p>
          <div style={{ background: P.card, border: `1px solid ${P.cardBorder}` }}
            className="rounded-[22px] p-[7px] flex flex-col gap-0.5">
            {top.map(r => row(r, r.studentId === me?.studentId))}
            {below && (
              <>
                <div className="flex items-center gap-2 px-3 pt-0.5">
                  <span aria-hidden="true" style={{ color: P.chipIdleInk }}
                    className="text-[13px] font-extrabold tracking-[0.3em]">···</span>
                  <span style={{ color: P.muted }} className="text-[11.5px] font-bold">
                    lower down the board
                  </span>
                </div>
                {row(below, true)}
              </>
            )}
          </div>
          <p style={{ color: P.muted }} className="m-0 text-[12.5px] leading-[1.4]">
            A homework counts once, when your teacher marks it right — however many times it goes
            back and forth. Everyone starts level again on the 1st of {nextMonthName(month)}.
          </p>
        </div>

        <div className="flex-grow" />

        {/* The way out never scrolls away: on a tall screen the spacer above
            puts it at the foot of the page, on a short one it sticks there. */}
        <div style={{ background: P.page }} className="sticky bottom-0 -mx-5 px-5 pt-3 pb-1">
          <button onClick={onBack} type="button"
            style={{ background: P.primary, color: P.onPrimary }}
            className="w-full min-h-[56px] rounded-[18px] flex items-center justify-center gap-2.5 text-base font-extrabold">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
            </svg>
            Back to my page
          </button>
          {onStay && (
            <button onClick={onStay} type="button"
              style={{ color: P.muted }}
              className="w-full min-h-[44px] text-[14px] font-bold">
              {standing.scored ? 'See the homework' : 'See the homework I just sent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── The tutor's panel ─────────────────────────────────────────────────── */

export const TutorHomeworkBoard: React.FC<{
  teacherId: string;
  /** The active roster, so a student who has sent nothing is still listed. */
  roster: Array<{ id: string; name: string }>;
  /** The student whose Homework tab this is. */
  highlightStudentId?: string;
}> = ({ teacherId, roster, highlightStudentId }) => {
  const [month, setMonth] = useState(() => new Date());
  const [rows, setRows] = useState<BoardEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    fetchBoard(teacherId, month).then(r => {
      if (dead) return;
      setRows(r);
      setLoading(false);
    });
    return () => { dead = true; };
  }, [teacherId, month.getFullYear(), month.getMonth()]);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Every student of the roster, whether or not he sent anything. */
  const all = useMemo<RankedEntry[]>(() => {
    const sent = new Map((rows ?? []).map(r => [r.studentId, r]));
    const merged: BoardEntry[] = roster.map(s => {
      const r = sent.get(s.id);
      return { studentId: s.id, name: s.name || r?.name || '', sent: r?.sent ?? 0, items: r?.items ?? 0, lastAt: r?.lastAt ?? '' };
    });
    // Anyone who sent something but is no longer on the roster still counts.
    for (const r of rows ?? []) if (!merged.some(m => m.studentId === r.studentId)) merged.push(r);
    return rankBoard(merged);
  }, [rows, roster]);

  const total = all.reduce((n, r) => n + r.sent, 0);
  const doers = all.filter(r => r.sent > 0).length;
  const best = all[0]?.sent ?? 0;
  const step = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const current = isThisMonth(month);

  const arrow = (d: 'left' | 'right') => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );

  return (
    <section className="rounded-3xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-5 py-4 flex flex-col gap-3.5">
      {/* Narrow, the stepper drops to its own line rather than breaking the
          title across two — it wraps as a block, the title never does. */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5">
        <h2 className="text-[22px] whitespace-nowrap text-slate-900 dark:text-slate-100 leading-tight"
          style={{ fontFamily: SERIF, fontWeight: 700 }}>
          Homework board
        </h2>
        <div className="flex items-center gap-1.5">
          <button onClick={() => step(-1)} type="button" aria-label="Previous month"
            className="w-9 h-9 flex-shrink-0 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            {arrow('left')}
          </button>
          <span className="min-w-[6.75rem] text-center text-[13.5px] font-extrabold text-slate-800 dark:text-slate-100">
            {monthLabel(month)}
          </span>
          <button onClick={() => step(1)} type="button" aria-label="Next month" disabled={current}
            className="w-9 h-9 flex-shrink-0 rounded-xl border border-slate-200 dark:border-gray-600 bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-40">
            {arrow('right')}
          </button>
        </div>
      </div>

      <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">
        {loading ? 'Counting…'
          : rows === null ? 'The board could not be read just now.'
          : `${all.length} student${all.length === 1 ? '' : 's'} · ${total} finished · ${doers} on the board`}
      </p>

      {!loading && rows !== null && (
        <div className="flex flex-col gap-0.5">
          {all.map((r, i) => {
            const mine = r.studentId === highlightStudentId;
            const none = r.sent === 0;
            return (
              <React.Fragment key={r.studentId}>
                {i === TOP_N && (
                  <div className="flex items-center gap-2.5 pt-2 pb-1">
                    <span className="h-px flex-grow bg-slate-200 dark:bg-gray-700" />
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                      students see to here
                    </span>
                    <span className="h-px flex-grow bg-slate-200 dark:bg-gray-700" />
                  </div>
                )}
                <div className={`rounded-xl px-2.5 py-2 flex items-center gap-2.5 ${
                  mine ? 'bg-amber-50 dark:bg-amber-900/25 ring-2 ring-amber-500' : ''}`}>
                  <span aria-hidden="true"
                    style={{ fontFamily: SERIF }}
                    className={`w-7 h-7 flex-shrink-0 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
                      i === 0 ? 'bg-amber-600 border-amber-600 text-white'
                        : mine ? 'border-amber-500 text-amber-800 dark:text-amber-200'
                        : 'border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300'}`}>
                    {r.rank}
                  </span>
                  <span className="flex-grow min-w-0 flex flex-col gap-1.5">
                    <span className={`text-sm truncate ${mine ? 'font-extrabold' : 'font-semibold'} ${
                      none ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                      {r.name || 'A student'}
                    </span>
                    <span className="block h-1.5 rounded-full bg-slate-200 dark:bg-gray-700">
                      <span className={`block h-1.5 rounded-full ${mine ? 'bg-amber-500' : 'bg-emerald-600'}`}
                        style={{ width: best ? `${Math.round((r.sent / best) * 100)}%` : '0%' }} />
                    </span>
                  </span>
                  <span style={{ fontFamily: SERIF }}
                    className={`flex-shrink-0 text-[19px] font-bold tabular-nums ${
                      none ? 'text-slate-400 dark:text-slate-500'
                        : mine ? 'text-amber-800 dark:text-amber-200'
                        : 'text-slate-900 dark:text-slate-100'}`}>
                    {r.sent}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      <p className="text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
        Students see the top five and their own place when they hand homework in, and again when
        you pass it. A recitation counts when you mark it Passed — once for the whole homework,
        however many times you send it back; a letter hunt counts when it is handed in. From the
        1st of the month.
      </p>
    </section>
  );
};

/* ── What the recitation page needs to show the student's screen ───────── */

/**
 * The standing for one student, or null when the board could not be read.
 *
 * `scored` is true when the homework in hand has already counted — the tutor
 * has just passed it — and the screen may say what it did to his place. It is
 * false the moment he hands one in, when the board is simply where he stands
 * while his teacher looks at it; he is shown that even with nothing finished
 * this month yet, because it tells him what the board is and what it takes.
 */
export async function studentStanding(
  teacherId: string, studentId: string, opts: { scored?: boolean } = {},
): Promise<Standing | null> {
  const rows = await fetchBoard(teacherId, new Date());
  if (!rows) return null;
  const scored = opts.scored !== false;
  const s = standingOf(rows, studentId, scored);
  return scored && !s.me ? null : s;
}
