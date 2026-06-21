import React, { useMemo, useRef, useState } from 'react';
import { ALL_TIMEZONES, tzLabel, tzSearchText, currentTimeInZone } from '../utils/timezones';

/**
 * Searchable timezone picker. Type a city or country (e.g. "Wellington",
 * "New Zealand", "Mumbai") and it finds the matching IANA zone — every IANA
 * zone is selectable, matched by name + curated aliases. Stores the IANA id.
 */
const SearchableTimezone: React.FC<{
  value?: string;
  onChange: (tz: string | undefined) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_TIMEZONES.slice(0, 60);
    const tokens = q.split(/\s+/);
    return ALL_TIMEZONES
      .filter(tz => { const s = tzSearchText(tz); return tokens.every(t => s.includes(t)); })
      .slice(0, 60);
  }, [query]);

  const select = (tz: string) => {
    onChange(tz);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? query : (value ?? '')}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        placeholder="Type a city or country, e.g. Wellington"
        autoComplete="off"
        className={className}
      />
      {open && (
        <div
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg"
          onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No timezone matches.</div>
          ) : results.map(tz => (
            <button
              key={tz}
              type="button"
              onClick={() => select(tz)}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 hover:bg-teal-50 dark:hover:bg-teal-900/20 ${tz === value ? 'bg-teal-50 dark:bg-teal-900/20 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}
            >
              <span className="truncate">{tzLabel(tz)}</span>
              <span className="text-xs text-slate-400 flex-shrink-0">{currentTimeInZone(tz)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchableTimezone;
