import React from 'react';
import { netEarning } from '../utils/timezones';
import SearchableTimezone from './SearchableTimezone';

export interface StudentBilling {
  timezone?: string;
  hourlyRate?: number;
  studentType?: 'preply' | 'platform';
  preplyPercentage?: number;
  /** Preply only — monthly subscription renewal date (recurs on this day each month). */
  subscriptionRenewalDate?: string;
}

/**
 * Tutor-only billing/scheduling fields shown in the Add/Edit student modals.
 * Never rendered on the student's side. Computes the tutor's net earning:
 * Preply students have the commission deducted; platform students pay the full
 * rate exactly as entered.
 */
const StudentBillingFields: React.FC<{ value: StudentBilling; onChange: (next: StudentBilling) => void; showTimezone?: boolean }> = ({ value, onChange, showTimezone = true }) => {
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

      {/* Timezone — type to search a city or country */}
      {showTimezone && (
      <div>
        <label className={labelCls}>Timezone / city</label>
        <SearchableTimezone
          value={value.timezone}
          onChange={tz => onChange({ ...value, timezone: tz })}
          className={inputCls}
        />
        {value.timezone && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Now: {(() => { try { return new Intl.DateTimeFormat('en-GB', { timeZone: value.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); } catch { return '—'; } })()}</p>
        )}
      </div>
      )}

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

      {/* Preply monthly subscription renewal date */}
      {studentType === 'preply' && (
        <div className="p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
          <label className={labelCls}>Monthly subscription renewal date</label>
          <input
            type="date"
            value={value.subscriptionRenewalDate ?? ''}
            onChange={e => onChange({ ...value, subscriptionRenewalDate: e.target.value || undefined })}
            className={inputCls}
          />
          <p className="text-[11px] text-violet-600/80 dark:text-violet-400/80 mt-1">
            You'll get a reminder the day before each monthly renewal.
          </p>
        </div>
      )}

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
