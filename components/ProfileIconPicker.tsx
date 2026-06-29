import React, { useState, useEffect, useCallback } from 'react';
import LottieIcon from './LottieIcon';
import { AvatarGender, listAvatars } from '../avatarManifest';
import { CustomAvatar, listCustomAvatars, addCustomAvatar, deleteCustomAvatar } from '../services/customAvatarService';

/** Pick an animated avatar for a student. Shows a "Select avatar" button; the
 *  modal lists the tutor's own pasted Lottie icons plus the bundled Boys/Girls
 *  sets, all at a larger size. Tutors can paste their own Lottie JSON to save a
 *  reusable icon. */
const ProfileIconPicker: React.FC<{ value?: string; onChange: (src: string | undefined) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<CustomAvatar[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(false);

  // Add-your-own form state
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setLoadingCustom(true);
    listCustomAvatars().then(setCustom).finally(() => setLoadingCustom(false));
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const groups: { gender: AvatarGender; label: string }[] = [
    { gender: 'male', label: '👦 Boys' },
    { gender: 'female', label: '👧 Girls' },
  ];

  const handleSave = async () => {
    setError('');
    if (!jsonText.trim()) { setError('Paste the Lottie JSON first.'); return; }
    setSaving(true);
    try {
      const added = await addCustomAvatar(name, jsonText);
      setCustom(prev => [added, ...prev]);
      onChange(added.url);          // auto-select the new icon
      setShowAdd(false); setName(''); setJsonText('');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the icon.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, icon: CustomAvatar) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${icon.name}"? This removes it for all students.`)) return;
    if (value === icon.url) onChange(undefined);
    setCustom(prev => prev.filter(c => c.id !== icon.id));
    await deleteCustomAvatar(icon.id);
  };

  const tile = (key: string, src: string, title: string, onClick: () => void, extra?: React.ReactNode) => (
    <div key={key} className="relative group">
      <button type="button" title={title} onClick={onClick}
        className={`w-full aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${value === src ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 ring-2 ring-teal-300' : 'border-slate-200 dark:border-gray-700 hover:border-teal-300'}`}>
        <LottieIcon src={src} size={72} loop autoplay playOnHover={false} />
      </button>
      {extra}
    </div>
  );

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
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-gray-700">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white">Select avatar</h3>
              <button type="button" onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-500 dark:text-slate-300 text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-6">
              {/* ── My icons (tutor's own pasted Lottie) ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300">⭐ My icons</h4>
                  <button type="button" onClick={() => { setShowAdd(s => !s); setError(''); }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/50">
                    {showAdd ? '✕ Cancel' : '+ Add your own'}
                  </button>
                </div>

                {showAdd && (
                  <div className="mb-4 p-3 rounded-xl border border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 space-y-2">
                    <input value={name} onChange={e => setName(e.target.value)} maxLength={40}
                      placeholder="Icon name (optional)"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-400" />
                    <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} rows={5}
                      placeholder='Paste the full Lottie JSON here, e.g. {"v":"5.7.0","fr":60, ... }'
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-mono text-slate-700 dark:text-slate-200 focus:outline-none focus:border-teal-400" />
                    {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={handleSave} disabled={saving}
                        className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold">
                        {saving ? 'Saving…' : 'Save icon'}
                      </button>
                    </div>
                  </div>
                )}

                {loadingCustom ? (
                  <p className="text-xs text-slate-400 italic">Loading your icons…</p>
                ) : custom.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No custom icons yet — paste a Lottie JSON to save one and reuse it for any student.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                    {custom.map(c => tile(c.id, c.url, c.name, () => { onChange(value === c.url ? undefined : c.url); setOpen(false); },
                      <button type="button" title="Delete icon" onClick={e => handleDelete(e, c)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">×</button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Bundled Boys / Girls ── */}
              {groups.map(({ gender, label }) => {
                const avatars = listAvatars(gender);
                return (
                  <div key={gender}>
                    <h4 className="text-sm font-bold text-slate-600 dark:text-slate-300 mb-3">{label}</h4>
                    {avatars.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No avatars available yet.</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-3">
                        {avatars.map(a => tile(a.file, a.src, a.name, () => { onChange(value === a.src ? undefined : a.src); setOpen(false); }))}
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
