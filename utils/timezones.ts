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

// Extra search terms (country + major/capital cities) for zones whose IANA name
// doesn't match what people search — e.g. New Zealand time is "Pacific/Auckland",
// so a search for "Wellington" or "New Zealand" must still find it. Every IANA
// zone stays in the list; this only improves how they're FOUND.
const TZ_ALIASES: Record<string, string> = {
  'Pacific/Auckland': 'new zealand wellington auckland nz nzst',
  'Pacific/Chatham': 'new zealand chatham',
  'Australia/Sydney': 'australia sydney canberra nsw aest',
  'Australia/Melbourne': 'australia melbourne victoria',
  'Australia/Brisbane': 'australia brisbane queensland',
  'Australia/Perth': 'australia perth western',
  'Australia/Adelaide': 'australia adelaide',
  'Asia/Kolkata': 'india mumbai delhi new delhi bangalore bengaluru chennai hyderabad kolkata pune ist',
  'Asia/Calcutta': 'india mumbai delhi new delhi bangalore bengaluru chennai hyderabad kolkata calcutta pune ist', // legacy name on some systems
  'Asia/Karachi': 'pakistan karachi lahore islamabad rawalpindi',
  'Asia/Dhaka': 'bangladesh dhaka chittagong',
  'Asia/Colombo': 'sri lanka colombo',
  'Asia/Kathmandu': 'nepal kathmandu',
  'Asia/Dubai': 'uae united arab emirates dubai abu dhabi sharjah gulf',
  'Asia/Riyadh': 'saudi arabia riyadh jeddah mecca makkah medina madinah dammam',
  'Asia/Qatar': 'qatar doha',
  'Asia/Kuwait': 'kuwait',
  'Asia/Bahrain': 'bahrain manama',
  'Asia/Muscat': 'oman muscat',
  'Asia/Baghdad': 'iraq baghdad',
  'Asia/Tehran': 'iran tehran',
  'Asia/Jerusalem': 'israel jerusalem tel aviv',
  'Asia/Beirut': 'lebanon beirut',
  'Asia/Amman': 'jordan amman',
  'Asia/Damascus': 'syria damascus',
  'Europe/Istanbul': 'turkey turkiye istanbul ankara izmir',
  'Asia/Jakarta': 'indonesia jakarta',
  'Asia/Singapore': 'singapore',
  'Asia/Kuala_Lumpur': 'malaysia kuala lumpur',
  'Asia/Manila': 'philippines manila',
  'Asia/Bangkok': 'thailand bangkok',
  'Asia/Tokyo': 'japan tokyo osaka',
  'Asia/Seoul': 'south korea seoul',
  'Asia/Shanghai': 'china shanghai beijing shenzhen guangzhou',
  'Asia/Hong_Kong': 'hong kong',
  'Africa/Cairo': 'egypt cairo alexandria',
  'Africa/Casablanca': 'morocco casablanca rabat marrakech',
  'Africa/Algiers': 'algeria algiers',
  'Africa/Tunis': 'tunisia tunis',
  'Africa/Lagos': 'nigeria lagos abuja',
  'Africa/Nairobi': 'kenya nairobi',
  'Africa/Johannesburg': 'south africa johannesburg cape town pretoria durban',
  'Africa/Khartoum': 'sudan khartoum',
  'Europe/London': 'uk united kingdom england britain great britain london manchester birmingham',
  'Europe/Dublin': 'ireland dublin',
  'Europe/Paris': 'france paris',
  'Europe/Berlin': 'germany berlin munich frankfurt hamburg cologne',
  'Europe/Madrid': 'spain madrid barcelona',
  'Europe/Rome': 'italy rome milan naples',
  'Europe/Amsterdam': 'netherlands holland amsterdam rotterdam',
  'Europe/Brussels': 'belgium brussels',
  'Europe/Zurich': 'switzerland zurich geneva',
  'Europe/Vienna': 'austria vienna',
  'Europe/Stockholm': 'sweden stockholm',
  'Europe/Oslo': 'norway oslo',
  'Europe/Moscow': 'russia moscow saint petersburg',
  'Europe/Kyiv': 'ukraine kyiv kiev',
  'Europe/Kiev': 'ukraine kyiv kiev', // legacy name on some systems
  'America/New_York': 'usa united states america new york eastern est edt washington boston atlanta miami philadelphia',
  'America/Chicago': 'usa united states chicago central cst dallas houston austin',
  'America/Denver': 'usa united states denver mountain mst phoenix',
  'America/Los_Angeles': 'usa united states los angeles california san francisco seattle portland pacific pst pdt',
  'America/Toronto': 'canada toronto ontario ottawa montreal eastern',
  'America/Vancouver': 'canada vancouver british columbia',
  'America/Mexico_City': 'mexico mexico city guadalajara',
  'America/Sao_Paulo': 'brazil sao paulo rio de janeiro',
  'America/Argentina/Buenos_Aires': 'argentina buenos aires',
  'America/Buenos_Aires': 'argentina buenos aires', // legacy name on some systems
  'America/Bogota': 'colombia bogota',
  'America/Lima': 'peru lima',
};

/** Lowercased searchable text for a zone: its words + any aliases. */
export function tzSearchText(tz: string): string {
  return (tz.replace(/[/_]/g, ' ') + ' ' + (TZ_ALIASES[tz] ?? '')).toLowerCase();
}

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
