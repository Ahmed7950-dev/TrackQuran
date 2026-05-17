import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface AccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  userEmail: string;
}

const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
  isOpen,
  onClose,
  userName,
  userEmail,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword,     setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status,          setStatus]          = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message,         setMessage]         = useState('');

  if (!isOpen) return null;

  const handleClose = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setStatus('idle');
    setMessage('');
    onClose();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus('error');
      setMessage('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setStatus('error');
      setMessage('Password must be at least 6 characters.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setStatus('success');
      setMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to change password.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Account Settings</h2>
          <button onClick={handleClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Profile info */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-gray-700/50 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-teal-200 dark:bg-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-300 text-xl font-bold flex-shrink-0">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{userName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{userEmail}</p>
            </div>
          </div>

          {/* Change password */}
          <form onSubmit={handleChangePassword} className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Change Password</h3>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 text-sm"
              />
            </div>

            {message && (
              <div className={`text-sm px-3 py-2 rounded-lg ${status === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Saving…' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AccountSettingsModal;
