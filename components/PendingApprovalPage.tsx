// components/PendingApprovalPage.tsx
// ---------------------------------------------------------------------------
// A tutor account that has not been let in yet.
//
// The site is one school: tutors apply at /teach and the admin approves them.
// Until then the account does nothing. Two kinds of people land here:
//  - an applicant who has sent the form: they wait, and can review it;
//  - someone who signed in with Google without ever applying (often a student
//    who meant to sign up): they get the two ways in, student or tutor.
// ---------------------------------------------------------------------------
import React, { useEffect, useState } from 'react';
import Logo from './Logo';
import { getMyApplication } from '../services/tutorApplicationService';

const PendingApprovalPage: React.FC<{ userId: string; name: string; email: string; onLogout: () => void }> =
({ userId, name, email, onLogout }) => {
  // undefined = still checking, null = never applied
  const [applied, setApplied] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let stale = false;
    getMyApplication(userId)
      .then(a => { if (!stale) setApplied(!!a); })
      .catch(() => { if (!stale) setApplied(true); }); // can't tell: show the waiting notice
    return () => { stale = true; };
  }, [userId]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl border border-slate-200 dark:border-gray-700 shadow-sm p-7 sm:p-9 text-center space-y-5">
        <div className="flex justify-center"><Logo /></div>

        {applied === undefined ? (
          <p className="text-sm text-slate-400 py-6">…</p>
        ) : applied ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-3xl">⏳</div>
            <div className="space-y-2">
              <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">Application received</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Thanks{name ? `, ${name}` : ''}. You can sign in as soon as your application is approved.
              </p>
            </div>
            <a href="/teach"
              className="block w-full h-11 leading-[44px] rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-colors">
              View application
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-black text-slate-800 dark:text-slate-100">No account yet</h1>
            <div className="grid grid-cols-1 gap-2.5">
              <a href="/join"
                className="block w-full h-11 leading-[44px] rounded-xl bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 transition-colors">
                Sign up as a student
              </a>
              <a href="/teach"
                className="block w-full h-11 leading-[44px] rounded-xl border border-emerald-700 dark:border-emerald-400 text-emerald-800 dark:text-emerald-300 text-sm font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                Apply to teach
              </a>
            </div>
          </>
        )}

        {email && (
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 break-all">Signed in as {email}</p>
        )}

        <button onClick={onLogout}
          className="w-full h-11 rounded-xl border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
          Sign out
        </button>
      </div>
    </div>
  );
};

export default PendingApprovalPage;
