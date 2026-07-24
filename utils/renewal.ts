/**
 * Subscription renewal maths — a fixed 28-day cycle (NOT calendar-monthly).
 *
 * The stored `subscriptionRenewalDate` IS a renewal date, and renewals repeat
 * every 28 days from it: occurrences are date + 28·k for k ≥ 0. A reminder is
 * due 1 day before each occurrence.
 *
 * k starts at 0 deliberately: tutors enter the NEXT renewal they know about,
 * which is usually a future date. Treating the stored date as merely an anchor
 * whose first renewal is a cycle later (k ≥ 1) silently skipped that first
 * renewal — a date set to 26 Jul reported "next: 23 Aug" and fired no reminder
 * on 25 Jul. Past dates still work: the occurrence list rolls forward until it
 * reaches today, so 24 Jun read on 24 Jul gives 19 Aug (24 Jun + 56).
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
 * The next renewal (stored date + 28·k, k ≥ 0) that is today or later, as
 * YYYY-MM-DD. A future stored date is returned as-is; a past one rolls forward
 * in 28-day steps, so the tutor always sees the upcoming renewal and never a
 * stale past one. Returns null for an invalid date.
 */
export function nextRenewalDate(anchorStr: string, from: Date = todayMidnight()): string | null {
  const anchor = parseAnchor(anchorStr);
  if (!anchor) return null;
  const elapsed = daysBetween(anchor, from);
  // Smallest k ≥ 0 with date + 28·k ≥ today  ⇒  k ≥ elapsed / 28.
  const k = Math.max(0, Math.ceil(elapsed / RENEWAL_CYCLE_DAYS));
  return toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + RENEWAL_CYCLE_DAYS * k));
}

/**
 * If TODAY is exactly one day before a renewal (stored date + 28·k − 1, k ≥ 0),
 * return that renewal's date (tomorrow) as YYYY-MM-DD — the occurrence to remind
 * for. Otherwise null. The k = 0 case is what reminds for the very first
 * renewal the tutor entered.
 */
export function renewalReminderOccurrence(anchorStr: string, from: Date = todayMidnight()): string | null {
  const anchor = parseAnchor(anchorStr);
  if (!anchor) return null;
  const elapsed = daysBetween(anchor, from);
  // Reminder days sit at date + 28·k − 1 (k ≥ 0) ⇒ elapsed + 1 ≡ 0 (mod 28).
  // The ≥ −1 guard stops dates further than a day in the future from matching
  // (JS % keeps the sign, so −29 would otherwise pass the modulo test).
  if (elapsed < -1) return null;
  if ((elapsed + 1) % RENEWAL_CYCLE_DAYS !== 0) return null;
  const renewal = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1); // tomorrow
  return toISODate(renewal);
}
