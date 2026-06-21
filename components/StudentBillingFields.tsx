import React from 'react';
import { ALL_TIMEZONES, tzLabel, netEarning } from '../utils/timezones';

export interface StudentBilling {
  timezone?: string;
  hourlyRate?: number;
  studentType?: 'preply' | 'platform';
  preplyPercentage?: number;
}

/**
 * Tutor-only billing/scheduling fields shown in the Add/Edit student modals.
 * Never rendered on the student's side. Computes the tutor's net earning:
 * Preply students have the commission deducted; platform students pay the full
 * rate exactly as entered.
 */
const StudentBillingFields: React.FC<{ value: StudentBilling; onChange: (next: StudentBilling) => void }> = ({ value, onChange }) => {
  const studentType = value.studentType ?? 'preply';
  const pct = value.preplyPercentage ?? 18;
  const rate = value.hourlyRate ?? 0;
  const net = rate > 0 ? netEarning(rate, studentType, pct) : 0;

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400';
  const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Billing & scheduling (private)</p>

      {/* Student type */}
      <div>
        <span className={labelCls}>Student type</span>
        <div className="flex gap-2">
          {(['preply', 'platform'] as const).map(tp => (
            <button
              key={tp}
              type="button"
              onClick={() => onChange({ ...value, studentType: tp })}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                studentType === tp
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white dark:bg-gray-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-gray-600 hover:border-teal-400'
              }`}
            >
              {tp === 'preply' ? 'Preply' : 'Platform'}
            </button>
          ))}
        </div>
      </div>

      {/* Timezone — type to search a city */}
      <div>
        <label className={labelCls}>Timezone / city</label>
        <input
          type="text"
          list="tz-datalist"
          value={value.timezone ?? ''}
          onChange={e => onChange({ ...value, timezone: e.target.value || undefined })}
          placeholder="Type a city, e.g. New York, Riyadh…"
          autoComplete="off"
          className={inputCls}
        />
        <datalist id="tz-datalist">
          {ALL_TIMEZONES.map(tz => <option key={tz} value={tz}>{tzLabel(tz)}</option>)}
        </datalist>
        {value.timezone && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Now: {/* live local time preview */}{(() => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: value.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); } catch { return '—'; } })()}</p>
        )}
      </div>

      {/* Hourly rate + Preply % */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Hourly rate</label>
          <input
            type="number" min={0} step="0.5" inputMode="decimal"
            value={value.hourlyRate ?? ''}
            onChange={e => onChange({ ...value, hourlyRate: e.target.value === '' ? undefined : Number(e.target.value) })}
            placeholder="e.g. 20"
            className={inputCls}
          />
        </div>
        {studentType === 'preply' && (
          <div>
            <label className={labelCls}>Preply %</label>
            <input
              type="number" min={0} max={100} step="1" inputMode="numeric"
              value={value.preplyPercentage ?? 18}
              onChange={e => onChange({ ...value, preplyPercentage: e.target.value === '' ? undefined : Number(e.target.value) })}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* Computed net */}
      {rate > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {studentType === 'preply' ? `You receive (after ${pct}% Preply)` : 'You receive (platform)'}
          </span>
          <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">{net.toFixed(2)} / hr</span>
        </div>
      )}
    </div>
  );
};

export default StudentBillingFields;
