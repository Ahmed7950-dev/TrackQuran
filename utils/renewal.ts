/**
 * Subscription renewal maths — a fixed 28-day cycle (NOT calendar-monthly).
 *
 * The stored `subscriptionRenewalDate` is the ANCHOR: the first renewal date the
 * tutor sets. Renewals then recur every 28 days after it (anchor + 28·k, k ≥ 1),
 * and a reminder is due 1 day before each one. So if the anchor is 24 Jun, the
 * renewals are 22 Jul, 19 Aug, 16 Sep, … and the reminders land on 21 Jul,
 * 18 Aug, 15 Sep, … The anchor date itself is treated as "already renewed" — the
 * first reminder is one full cycle later.
 */

export const RENEWAL_CYCLE_DAYS = 28;

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD string to a local-midnight Date, or null if invalid. */
function parseAnchor(anchorStr: string): Date | null {
  const d = new Date(anchorStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local midnight for "today". */
function todayMidnight(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Whole days between two local-midnight dates (DST-safe via rounding). */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * The next renewal date (anchor + 28·k, k ≥ 1) that is today or later, as
 * YYYY-MM-DD. Auto-advances every 28 days so the tutor always sees the upcoming
 * renewal, never a stale past one. Returns null for an invalid anchor.
 */
export function nextRenewalDate(anchorStr: string, from: Date = todayMidnight()): string | null {
  const anchor = parseAnchor(anchorStr);
  if (!anchor) return null;
  const elapsed = daysBetween(anchor, from);
  // Smallest k ≥ 1 with anchor + 28·k ≥ today  ⇒  k ≥ elapsed / 28.
  const k = Math.max(1, Math.ceil(elapsed / RENEWAL_CYCLE_DAYS));
  return toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + RENEWAL_CYCLE_DAYS * k));
}

/**
 * If TODAY is exactly one day before a renewal (anchor + 28·k − 1, k ≥ 1),
 * return that renewal's date (tomorrow) as YYYY-MM-DD — the occurrence to remind
 * for. Otherwise null. Never fires before the first full cycle after the anchor.
 */
export function renewalReminderOccurrence(anchorStr: string, from: Date = todayMidnight()): string | null {
  const anchor = parseAnchor(anchorStr);
  if (!anchor) return null;
  const elapsed = daysBetween(anchor, from);
  // Reminder days sit at anchor + 28·k − 1 (k ≥ 1) ⇒ elapsed ≡ 27 (mod 28), elapsed ≥ 27.
  if (elapsed < RENEWAL_CYCLE_DAYS - 1) return null;
  if (elapsed % RENEWAL_CYCLE_DAYS !== RENEWAL_CYCLE_DAYS - 1) return null;
  const renewal = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1); // tomorrow
  return toISODate(renewal);
}
