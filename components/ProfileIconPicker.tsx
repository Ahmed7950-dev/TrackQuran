import React, { useState } from 'react';
import LottieIcon from './LottieIcon';
import { AvatarGender, listAvatars, genderFromSrc } from '../avatarManifest';

/** Pick a bundled animated avatar for a student: choose Boys/Girls, then an icon. */
const ProfileIconPicker: React.FC<{ value?: string; onChange: (src: string | undefined) => void }> = ({ value, onChange }) => {
  const [gender, setGender] = useState<AvatarGender>(genderFromSrc(value));
  const avatars = listAvatars(gender);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile avatar</label>
        {value && <button type="button" onClick={() => onChange(undefined)} className="text-xs font-semibold text-slate-400 hover:text-red-500">Clear</button>}
      </div>

      {/* Gender toggle */}
      <div className="flex rounded-full bg-slate-100 dark:bg-gray-700 p-1 w-max">
        {(['male', 'female'] as AvatarGender[]).map(g => (
          <button key={g} type="button" onClick={() => setGender(g)}
            className={`px-4 py-1 rounded-full text-xs font-bold transition-colors ${gender === g ? 'bg-teal-600 text-white shadow' : 'text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-white'}`}>
            {g === 'male' ? '👦 Boys' : '👧 Girls'}
          </button>
        ))}
      </div>

      {/* Avatar grid */}
      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
        {avatars.length === 0 && <p className="text-xs text-slate-400 italic">No {gender === 'male' ? 'boys' : 'girls'} avatars available yet.</p>}
        {avatars.map(a => (
          <button key={a.file} type="button" onClick={() => onChange(value === a.src ? undefined : a.src)} title={a.name}
            className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center transition-all ${value === a.src ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-300' : 'border-slate-200 dark:border-gray-700 hover:border-teal-300'}`}>
            <LottieIcon src={a.src} size={44} loop autoplay playOnHover={false} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProfileIconPicker;
