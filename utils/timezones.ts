// All IANA timezones (hundreds of cities). Falls back to a curated list on the
// rare runtime without Intl.supportedValuesOf.
const FALLBACK_TZS = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul',
  'Asia/Riyadh', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Jakarta', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
  'Africa/Cairo', 'Africa/Casablanca', 'Africa/Nairobi',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo',
];

export const ALL_TIMEZONES: string[] = (() => {
  try {
    // @ts-expect-error supportedValuesOf is newer than the lib types
    const zones = Intl.supportedValuesOf?.('timeZone') as string[] | undefined;
    if (zones && zones.length) return zones;
  } catch { /* ignore */ }
  return FALLBACK_TZS;
})();

/** Human label for a tz option, e.g. "America/New_York (GMT-04:00)". */
export function tzLabel(tz: string): string {
  const off = tzOffsetLabel(tz);
  return off ? `${tz.replace(/_/g, ' ')} (${off})` : tz.replace(/_/g, ' ');
}

/** "GMT+03:00" style offset for a tz, or '' if it can't be determined. */
export function tzOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value ?? '';
  } catch { return ''; }
}

/** Current local time in `tz`, e.g. "14:35". Empty string if tz invalid. */
export function currentTimeInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date());
  } catch { return ''; }
}

/**
 * The tutor's net earning for one lesson at `hourlyRate`: Preply students have
 * the commission deducted; platform students pay the full rate.
 */
export function netEarning(hourlyRate: number, studentType: 'preply' | 'platform' | undefined, preplyPercentage: number | undefined): number {
  if (studentType === 'platform') return hourlyRate;
  const pct = preplyPercentage ?? 18;
  return hourlyRate * (1 - pct / 100);
}
