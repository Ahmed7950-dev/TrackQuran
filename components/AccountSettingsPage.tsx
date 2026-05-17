import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  AvailabilitySlot,
  getTeacherAvailability,
  saveTeacherAvailability,
} from '../services/availabilityService';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const HOUR_HEIGHT_PX = 64;
const HOURS          = Array.from({ length: 25 }, (_, i) => i);
const DAYS           = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ------------------------------------------------------------------ */
/*  Availability drag calendar                                          */
/* ------------------------------------------------------------------ */

interface AvailabilityCalendarProps {
  slots:    Set<string>;           // keys: `${dayOfWeek}-${hour}`
  onChange: (slots: Set<string>) => void;
}

const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({ slots, onChange }) => {
  const isDragging  = useRef(false);
  const dragAction  = useRef<'add' | 'remove'>('add');

  /* End drag on mouseup anywhere */
  useEffect(() => {
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const applyCell = (day: number, hour: number) => {
    const key      = `${day}-${hour}`;
    const next     = new Set(slots);
    if (dragAction.current === 'add') next.add(key);
    else                               next.delete(key);
    onChange(next);
  };

  const handleMouseDown = (day: number, hour: number) => {
    const key         = `${day}-${hour}`;
    dragAction.current = slots.has(key) ? 'remove' : 'add';
    isDragging.current = true;
    applyCell(day, hour);
  };

  const handleMouseEnter = (day: number, hour: number) => {
    if (!isDragging.current) return;
    applyCell(day, hour);
  };

  return (
    <div
      className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-auto select-none"
      style={{ userSelect: 'none' }}
    >
      {/* Header row */}
      <div
        className="grid sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700"
        style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}
      >
        <div className="border-e border-slate-200 dark:border-gray-700" />
        {DAYS.map((d, i) => (
          <div key={i} className="py-3 text-center border-e border-slate-200 dark:border-gray-700 last:border-e-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{d}</p>
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
        {/* Time labels */}
        <div className="border-e border-slate-200 dark:border-gray-700">
          {HOURS.map(h => (
            <div
              key={h}
              style={{ height: `${HOUR_HEIGHT_PX}px` }}
              className="flex items-start justify-end pe-2 pt-1"
            >
              {h < 24 && (
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold">
                  {String(h).padStart(2, '0')}:00
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((_, dayIdx) => (
          <div
            key={dayIdx}
            className="relative border-e border-slate-200 dark:border-gray-700 last:border-e-0"
            style={{ height: `${HOUR_HEIGHT_PX * 25}px` }}
          >
            {HOURS.map(h => {
              const key      = `${dayIdx}-${h}`;
              const selected = slots.has(key);
              return (
                <div
                  key={h}
                  style={{ top: `${h * HOUR_HEIGHT_PX}px`, height: `${HOUR_HEIGHT_PX}px` }}
                  className={`absolute w-full border-t border-slate-100 dark:border-gray-700/60 cursor-pointer transition-colors ${
                    selected
                      ? 'bg-teal-100 dark:bg-teal-900/40 hover:bg-teal-200 dark:hover:bg-teal-900/60'
                      : 'hover:bg-slate-50 dark:hover:bg-gray-700/40'
                  }`}
                  onMouseDown={() => handleMouseDown(dayIdx, h)}
                  onMouseEnter={() => handleMouseEnter(dayIdx, h)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Change Password section                                             */
/* ------------------------------------------------------------------ */

const ChangePasswordSection: React.FC = () => {
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status,          setStatus]          = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message,         setMessage]         = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setStatus('error'); setMessage('Passwords do not match.'); return; }
    if (newPassword.length < 6)          { setStatus('error'); setMessage('Password must be at least 6 characters.'); return; }
    setStatus('loading');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setStatus('error'); setMessage(error.message); }
    else       { setStatus('success'); setMessage('Password changed successfully!'); setNewPassword(''); setConfirmPassword(''); }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div>
        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">New Password</label>
        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="••••••••"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
      </div>
      <div>
        <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Confirm New Password</label>
        <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required placeholder="••••••••"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm" />
      </div>
      {message && (
        <div className={`text-sm px-3 py-2 rounded-lg ${status === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
          {message}
        </div>
      )}
      <button type="submit" disabled={status === 'loading'}
        className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-colors disabled:opacity-50">
        {status === 'loading' ? 'Saving…' : 'Change Password'}
      </button>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/*  Main AccountSettingsPage                                            */
/* ------------------------------------------------------------------ */

export type AccountSection = 'availability' | 'password';

interface AccountSettingsPageProps {
  teacherId:            string;
  userName:             string;
  userEmail:            string;
  onBack:               () => void;
  /** Called after saving so the parent can refresh its availabilitySlots state */
  onAvailabilityChange?: (slots: AvailabilitySlot[]) => void;
}

const SECTIONS: { key: AccountSection; label: string; icon: React.ReactNode }[] = [
  {
    key: 'availability',
    label: 'Set Availability',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
  {
    key: 'password',
    label: 'Change Password',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
];

const AccountSettingsPage: React.FC<AccountSettingsPageProps> = ({
  teacherId,
  userName,
  userEmail,
  onBack,
  onAvailabilityChange,
}) => {
  const [section,   setSection]   = useState<AccountSection>('availability');
  const [slots,     setSlots]     = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saveMsg,   setSaveMsg]   = useState('');

  /* Load existing availability */
  useEffect(() => {
    getTeacherAvailability(teacherId).then(existing => {
      setSlots(new Set(existing.map(s => `${s.dayOfWeek}-${s.hour}`)));
      setLoading(false);
    });
  }, [teacherId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    const slotArray: AvailabilitySlot[] = Array.from(slots).map((key: string) => {
      const [d, h] = key.split('-').map(Number);
      return { dayOfWeek: d, hour: h };
    });
    await saveTeacherAvailability(teacherId, slotArray);
    setSaving(false);
    setSaveMsg('Saved!');
    onAvailabilityChange?.(slotArray);
    setTimeout(() => setSaveMsg(''), 2500);
  };

  const handleClear = () => setSlots(new Set());

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex flex-col">
      {/* Page header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-slate-200 dark:border-gray-700">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <div className="h-5 w-px bg-slate-200 dark:bg-gray-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Account Settings</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{userName} · {userEmail}</p>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-8">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0">
          <nav className="space-y-1">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  section === s.key
                    ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* ── Set Availability ── */}
          {section === 'availability' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Set Availability</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Click or drag over the hours you work. Times are in Istanbul time.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {saveMsg && <span className="text-sm text-green-600 dark:text-green-400 font-medium">{saveMsg}</span>}
                  <button
                    onClick={handleClear}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    Clear all
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {saving ? (
                      <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-teal-100 dark:bg-teal-900/40 border border-teal-300 dark:border-teal-700 inline-block" />
                  Working hours (drag to select)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 inline-block" />
                  Not available
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <svg className="animate-spin w-6 h-6 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                </div>
              ) : (
                <AvailabilityCalendar slots={slots} onChange={setSlots} />
              )}
            </div>
          )}

          {/* ── Change Password ── */}
          {section === 'password' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Change Password</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Update your login password.</p>
              </div>
              <ChangePasswordSection />
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default AccountSettingsPage;
