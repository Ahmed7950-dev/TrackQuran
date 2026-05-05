import React, { useState } from 'react';
import { useAuth } from '../context/AuthProvider';
import { useI18n } from '../context/I18nProvider';
import Logo from './Logo';

type LoginAs = 'teacher' | 'student';

const LoginPage: React.FC = () => {
    const [loginAs, setLoginAs] = useState<LoginAs>('teacher');
    const [isSignUp, setIsSignUp] = useState(false);
    
    // Teacher fields
    const [teacherName, setTeacherName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Student fields
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [dob, setDob] = useState('');

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, signup, studentLogin, signInWithGoogle } = useAuth();
    const { t } = useI18n();

    const handleTeacherSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            if (isSignUp) {
                if (!teacherName) { setError('Name is required.'); setLoading(false); return; }
                if (password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
                const result = await signup(teacherName, email, password);
                if (result.error) setError(result.error);
            } else {
                const result = await login(email, password);
                if (result.error) setError(result.error);
            }
        } catch (err) { setError('An unexpected error occurred.'); }
        finally { setLoading(false); }
    };
    
    const handleStudentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            const user = await studentLogin(firstName, lastName, dob);
            if (!user) setError(t('login.studentNotFound'));
        } catch (err) { setError('An unexpected error occurred.'); } 
        finally { setLoading(false); }
    }

    const handleGoogleSignIn = async () => {
        setLoading(true);
        try { await signInWithGoogle(); } 
        catch (err) { setError('Could not sign in with Google.'); } 
        finally { setLoading(false); }
    };
    
    const toggleLoginAs = (role: LoginAs) => {
        setLoginAs(role);
        setError('');
    }

    const TeacherForm = (
      <form onSubmit={handleTeacherSubmit} className="space-y-4">
          {isSignUp && (
               <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.nameLabel')}</label>
                  <input id="name" name="name" type="text" required value={teacherName} onChange={e => setTeacherName(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md text-sm shadow-sm placeholder-slate-400 dark:text-white focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500"
                      placeholder={t('login.namePlaceholder')} />
              </div>
          )}
          <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.emailLabel')}</label>
              <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md text-sm shadow-sm placeholder-slate-400 dark:text-white focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500"
                  placeholder={t('login.emailPlaceholder')} />
          </div>
          <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.passwordLabel')}</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md text-sm shadow-sm placeholder-slate-400 dark:text-white focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500"
                  placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div>
              <button type="submit" disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 dark:bg-orange-600 dark:hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-orange-500 disabled:opacity-50">
                  {loading ? '...' : (isSignUp ? t('login.signUpButton') : t('login.signInButton'))}
              </button>
          </div>
      </form>
    );

    const StudentForm = (
        <form onSubmit={handleStudentSubmit} className="space-y-4">
            <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.firstNameLabel')}</label>
                <input id="firstName" type="text" required value={firstName} onChange={e => setFirstName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md text-sm shadow-sm placeholder-slate-400 dark:text-white focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500"
                    placeholder={t('login.firstNamePlaceholder')} />
            </div>
             <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.lastNameLabel')}</label>
                <input id="lastName" type="text" required value={lastName} onChange={e => setLastName(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md text-sm shadow-sm placeholder-slate-400 dark:text-white focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500"
                    placeholder={t('login.lastNamePlaceholder')} />
            </div>
            <div>
              <label htmlFor="student-dob" className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t('login.dobLabel')}</label>
              <input type="date" id="student-dob" required value={dob} onChange={e => setDob(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500 sm:text-sm dark:text-white"
              />
            </div>
             {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
             <div>
                <button type="submit" disabled={loading}
                    className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 dark:bg-orange-600 dark:hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-orange-500 disabled:opacity-50">
                    {loading ? '...' : t('login.studentSignInButton')}
                </button>
            </div>
        </form>
    )

    return (
        <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex flex-col justify-center items-center p-4">
            <div className="max-w-md w-full mx-auto">
                <div className="flex justify-center mb-8">
                    <Logo />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                    <div className="mb-6 p-1 bg-slate-100 dark:bg-gray-700 rounded-lg flex gap-1">
                        <button onClick={() => toggleLoginAs('teacher')} className={`w-1/2 py-2.5 rounded-md text-sm font-semibold transition-colors ${loginAs === 'teacher' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600/50'}`}>{t('login.teacherLogin')}</button>
                        <button onClick={() => toggleLoginAs('student')} className={`w-1/2 py-2.5 rounded-md text-sm font-semibold transition-colors ${loginAs === 'student' ? 'bg-white dark:bg-gray-800 text-teal-600 dark:text-orange-500 shadow' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600/50'}`}>{t('login.studentLogin')}</button>
                    </div>
                    
                    <p className="text-center text-slate-500 dark:text-slate-400 mb-6">{t('login.subtitle')}</p>
                    
                    {loginAs === 'teacher' ? TeacherForm : StudentForm}

                    {loginAs === 'teacher' && (
                        <>
                            <div className="mt-6 relative">
                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-gray-600" /></div>
                                <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-gray-800 text-slate-500 dark:text-slate-400">{t('login.or')}</span></div>
                            </div>
                            <div className="mt-6">
                                <button onClick={handleGoogleSignIn} disabled={loading}
                                    className="w-full inline-flex justify-center items-center py-2.5 px-4 border border-slate-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-600 disabled:opacity-50">
                                    <svg className="w-5 h-5 me-2" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512"><path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 261.8 0 120.5 109.8 11.8 244 11.8c70.4 0 129.5 27.1 175.4 69.1l-63.1 61.9C333.1 119.3 293.8 98.2 244 98.2c-76.4 0-138.3 61.9-138.3 138.3s61.9 138.3 138.3 138.3c88.1 0 112.3-63.7 115.5-98.2H244v-72h244z"></path></svg>
                                    {t('login.googleSignIn')}
                                </button>
                            </div>
                             <div className="mt-6 text-center text-sm">
                                <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="font-medium text-teal-600 hover:text-teal-500 dark:text-orange-500 dark:hover:text-orange-400">
                                    {isSignUp ? t('login.hasAccount') : t('login.noAccount')} {isSignUp ? t('login.signIn') : t('login.signUp')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;