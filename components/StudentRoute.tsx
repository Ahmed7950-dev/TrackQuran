// components/StudentRoute.tsx
// The "/student" route. Renders the signed-in user's student portal from their
// own student records — independent of profiles.role. This lets a Google account
// that is ALSO a tutor (workspace at "/") open its student side here, and gives
// pure students a stable URL too.

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthProvider';
import { useI18n } from '../context/I18nProvider';
import { loadStudentSession } from '../services/studentRegistrationService';
import { StudentUser } from '../types';
import StudentApp from './StudentApp';

const StudentRoute: React.FC = () => {
  const { logout } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState<'loading' | 'no-session' | 'not-student' | 'ready'>('loading');
  const [user, setUser] = useState<StudentUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!authUser) { setState('no-session'); return; }
      const s = await loadStudentSession(authUser.id);
      if (cancelled) return;
      if (!s) { setState('not-student'); return; }
      setUser({ role: 'student', authUserId: authUser.id, name: s.name, email: authUser.email ?? undefined, quran: s.quran, arabic: s.arabic });
      setState('ready');
    })();
    return () => { cancelled = true; };
  }, []);

  if (state === 'ready' && user) return <StudentApp user={user} onLogout={logout} />;

  // Shared shell for the loading / not-signed-in / not-registered states.
  const message =
    state === 'loading'     ? '…' :
    state === 'no-session'  ? t('register.welcomeSub') :
    /* not-student */         t('register.notRegisteredYet');
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900 text-slate-800 dark:text-slate-200 px-4">
      <div className="max-w-md w-full text-center bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm p-8">
        {state === 'loading' ? (
          <div className="text-4xl animate-pulse">📖</div>
        ) : (
          <>
            <div className="text-5xl mb-4">🙋</div>
            <p className="text-slate-600 dark:text-slate-300">{message}</p>
            <a href="/join" className="mt-6 inline-block px-5 py-2.5 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors">
              {t('register.signInGoogle')}
            </a>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentRoute;
