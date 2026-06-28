import React, { useEffect, useRef, useState } from 'react';
import LottieIcon from './LottieIcon';
import { listProfileIcons, uploadProfileIcon, deleteProfileIcon, ProfileIcon, IconGender } from '../services/profileIconService';

/** Animated-profile-icon picker for the add/edit student modal. Icons are grouped
 *  Boys / Girls; the tutor can upload a Lottie JSON into either group. */
const ProfileIconPicker: React.FC<{ value?: string; onChange: (url: string | undefined) => void }> = ({ value, onChange }) => {
  const [icons, setIcons] = useState<Record<IconGender, ProfileIcon[]>>({ boys: [], girls: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<IconGender | null>(null);
  const fileRefs = { boys: useRef<HTMLInputElement>(null), girls: useRef<HTMLInputElement>(null) };

  const refresh = () => { setLoading(true); listProfileIcons().then(setIcons).finally(() => setLoading(false)); };
  useEffect(refresh, []);

  const onFile = async (gender: IconGender, file?: File | null) => {
    if (!file) return;
    setBusy(gender);
    try {
      const icon = await uploadProfileIcon(file, gender);
      await listProfileIcons().then(setIcons);
      onChange(icon.url); // auto-select the just-uploaded icon
    } catch (e) {
      console.error('profile icon upload failed', e);
      alert('Upload failed — make sure it is a Lottie .json file.');
    } finally {
      setBusy(null);
    }
  };

  const Group: React.FC<{ gender: IconGender; label: string }> = ({ gender, label }) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <button type="button" onClick={() => fileRefs[gender].current?.click()} disabled={busy === gender}
          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 disabled:opacity-50">
          {busy === gender ? 'Uploading…' : '+ Upload'}
        </button>
        <input ref={fileRefs[gender]} type="file" accept=".json,application/json" className="hidden"
          onChange={e => { onFile(gender, e.target.files?.[0]); e.currentTarget.value = ''; }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {icons[gender].length === 0 && <p className="text-xs text-slate-400 italic">No {label.toLowerCase()} icons yet.</p>}
        {icons[gender].map(icon => (
          <div key={icon.path} className="relative group">
            <button type="button" onClick={() => onChange(value === icon.url ? undefined : icon.url)}
              className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all ${value === icon.url ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-300' : 'border-slate-200 dark:border-gray-700 hover:border-teal-300'}`}
              title={icon.name}>
              <LottieIcon src={icon.url} size={44} loop autoplay playOnHover={false} />
            </button>
            <button type="button"
              onClick={async () => { await deleteProfileIcon(icon.path); if (value === icon.url) onChange(undefined); refresh(); }}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Delete">×</button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile icon</label>
        {value && (
          <button type="button" onClick={() => onChange(undefined)} className="text-xs font-semibold text-slate-400 hover:text-red-500">Clear</button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-slate-400">Loading icons…</p>
      ) : (
        <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
          <Group gender="boys" label="Boys" />
          <Group gender="girls" label="Girls" />
        </div>
      )}
    </div>
  );
};

export default ProfileIconPicker;
