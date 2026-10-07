// components/PendingApprovalPage.tsx
// ---------------------------------------------------------------------------
// A teacher who has signed up but has not been let in yet.
//
// Signing up stays open — anyone may register. The account simply does nothing
// until an admin approves it, so a stranger who finds the site can no longer
// walk straight into a working teacher workspace.
// ---------------------------------------------------------------------------
import React from 'react';
import Logo from './Logo';

const PendingApprovalPage: React.FC<{ name: string; email: string; onLogout: () => void }> =
({ name, email, onLogout }) => (
  <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex items-center justify-center p-5">
    <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl border border-slate-200 dark:border-gray-700 shadow-sm p-7 sm:p-9 text-center space-y-5">
      <div className="flex justify-center"><Logo /></div>

      <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-3xl">
        ⏳
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">
          Your account is waiting for approval
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Thanks for signing up{name ? `, ${name}` : ''}. A teaching account has to be
          approved before it can be used, so nobody but you ever sees your students.
          You will be able to sign in as soon as that is done.
        </p>
      </div>

      {email && (
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 break-all">
          Signed in as {email}
        </p>
      )}

      <button onClick={onLogout}
        className="w-full h-11 rounded-xl border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
        Sign out
      </button>
    </div>
  </div>
);

export default PendingApprovalPage;
