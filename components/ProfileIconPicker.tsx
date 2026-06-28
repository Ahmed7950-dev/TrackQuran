import React, { useState } from 'react';
import LottieIcon from './LottieIcon';
import { AvatarGender, listAvatars } from '../avatarManifest';

/** Pick a bundled animated avatar for a student. Shows a "Select avatar" button;
 *  clicking it opens a modal with every Boys/Girls avatar grouped, at a larger size. */
const ProfileIconPicker: React.FC<{ value?: string; onChange: (src: string | undefined) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const groups: { gender: AvatarGender; label: string }[] = [
    { gender: 'male', label: '👦 Boys' },
    { gender: 'female', label: '👧 Girls' },
  ];

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Profile avatar</label>

      <div className="flex items-center gap-3">
        {value ? (
          <div className="w-12 h-12 rounded-xl border-2 border-teal-500 bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center">
            <LottieIcon src={value} size={38} loop autoplay playOnHover={false} />
          </div>
        ) : (
          <div className="w-12 h-12 rounded-xl border-2 border-dashed border-slate-300 dark:border-gray-600 flex items-center justify-center text-slate-400 text-xl">👤</div>
        )}
        <button type="button" onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold shadow">
          Select avatar
        </button>
        {value && (
          <button type="button" onClick={() => onChange(undefined)}
            className="text-xs font-semibold text-slate-400 hover:text-red-500">Clear</button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Select avatar</h3>
              <button type="button" onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-slate-300 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-6">
              {groups.map(({ gender, label }) => {
                const avatars = listAvatars(gender);
                return (
                  <div key={gender}>
                    <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3">{label}</h4>
                    {avatars.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No avatars available yet.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                        {avatars.map(a => (
                          <button key={a.file} type="button" title={a.name}
                            onClick={() => { onChange(value === a.src ? undefined : a.src); setOpen(false); }}
                            className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${value === a.src ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-300' : 'border-slate-200 dark:border-gray-700 hover:border-teal-300'}`}>
                            <LottieIcon src={a.src} size={72} loop autoplay playOnHover={false} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileIconPicker;
