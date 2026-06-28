import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, Progress, RecitationAchievement, MemorizationAchievement, TafsirReview, ArabicStudent, QuranHomework } from './types';
import Dashboard from './components/Dashboard';
import StudentDetailPage from './components/StudentDetailPage';
import StudentProgressPage from './components/StudentProgressPage';
// FIX: Import 'calculateVersesAndPages' from dataService to resolve reference errors.
import { getStudents, saveStudent, deleteStudent, getTajweedRules, saveTajweedRules, calculateVersesAndPages, downloadBackup, restoreBackup, getStudentReportId, updateQuranHomeworkInReport, syncStudentDataInReport, setStudentApprovalStatus, createOrUpdateSharedReport } from './services/dataService';
import { computeReportRanks } from './services/rankingService';
import { supabase } from './lib/supabase';
import { getArabicStudents, saveArabicStudent, deleteArabicStudent, getVocabWordCountsByLesson, setArabicStudentApprovalStatus, ensureShareTokenById } from './services/arabicService';
import { getCustomVocabWordCountsForStudents } from './services/vocabularyService';
import { QURAN_METADATA, POINTS_PER_WORD } from './constants';
import { useI18n } from './context/I18nProvider';
import Footer from './components/Footer';
import Logo from './components/Logo';
import AddStudentModal from './components/AddStudentModal';
import { useAuth } from './context/AuthProvider';
import StudentViewOnlyPage from './components/StudentViewOnlyPage';
import MistakesReviewPage from './components/MistakesReviewPage';
import LettersTrainerPage from './components/LettersTrainerPage';
import AlphabetTrainerPage from './components/AlphabetTrainerPage';
import QaedahPage from './components/QaedahPage';
import AdminPanel from './components/AdminPanel';
import ContactSupportModal from './components/ContactSupportModal';
import AboutUsPage from './components/AboutUsPage';
import LandingPage from './components/LandingPage';
import TajweedPage from './components/TajweedPage';
import SubjectSelectionPage from './components/SubjectSelectionPage';
import VocabularyPracticePage from './components/VocabularyPracticePage';
import ArabicDashboard from './components/ArabicDashboard';
import ArabicStudentDetailPage from './components/ArabicStudentDetailPage';
import ArabicStudentPortal from './components/ArabicStudentPortal';
import FamilyLinkPage from './components/FamilyLinkPage';
import UnifiedStudentPortal from './components/UnifiedStudentPortal';
import LottieIcon from './components/LottieIcon';
import PricingPage from './components/PricingPage';
import TermsOfServicePage from './components/TermsOfServicePage';
import PrivacyPolicyPage from './components/PrivacyPolicyPage';
import RefundPolicyPage from './components/RefundPolicyPage';
import StudentRegisterPage from './components/StudentRegisterPage';
import StudentApp from './components/StudentApp';
import StudentRoute from './components/StudentRoute';
import { ensureSubscriptionRenewalReminder } from './services/notificationService';
import AirplaneGame from './components/AirplaneGame';
import FamilyLinkModal from './components/FamilyLinkModal';
import CalendarPage from './components/CalendarPage';
import GCalOAuthCallback from './components/GCalOAuthCallback';
import AccountSettingsPage from './components/AccountSettingsPage';
import NotificationCenter from './components/NotificationCenter';
import { getStoredToken, wasConnected, silentRefresh, scheduleAutoRefresh, cancelAutoRefresh } from './services/googleCalendarService';
import { getTeacherAvailability, AvailabilitySlot } from './services/availabilityService';

const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'reading'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'reading') {
      return saved;
    }
    // Check system preference for initial theme
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      // Remove all theme classes/attributes
      root.classList.remove('dark');
      root.removeAttribute('data-theme');
      
      if (theme === 'dark') {
        root.classList.add('dark');
      } else if (theme === 'reading') {
        root.setAttribute('data-theme', 'reading');
      }
      // 'light' mode is the default, no class needed
    };

    applyTheme();
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    // Cycle through: light -> reading -> dark -> light
    if (theme === 'light') {
      setTheme('reading');
    } else if (theme === 'reading') {
      setTheme('dark');
    } else {
      setTheme('light');
    }
  };

  return { currentTheme: theme, toggleTheme };
};

const QURANIC_FONTS = [
  { name: 'Hafs', displayName: 'Hafs' },
  { name: 'Amiri Regular', displayName: 'Amiri Regular' },
  { name: 'Elgharib KFGQPCHafs V10', displayName: 'Elgharib KFGQPCHafs V10' },
  { name: 'Elgharib HAFSTharwatEmara', displayName: 'Elgharib HAFSTharwatEmara' },
  { name: 'UthmanTN v2-0', displayName: 'UthmanTN v2-0' },
  { name: 'Uthmanic HAFS v22', displayName: 'Uthmanic HAFS v22' },
] as const;

const useQuranicFont = () => {
  const [font, setFont] = useState<string>(() => {
    return localStorage.getItem('quranicFont') || 'Hafs';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--quranic-font', font);
    localStorage.setItem('quranicFont', font);
  }, [font]);

  return { currentFont: font, setFont, fonts: QURANIC_FONTS };
};

/**
 * Wrapper that renders the public marketing landing page.
 * When the user clicks "Sign in" or any CTA, the AuthModal overlay slides in
 * on top. After successful auth the
 * AuthProvider updates currentUser, the parent App re-renders and
 * immediately shows the dashboard — the landing page unmounts automatically.
 */
// ── Beautiful branded auth modal (shown over the landing page) ────────────────
const AuthModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, signup, signInWithGoogle } = useAuth();
  const { t } = useI18n();

  const isDark = document.documentElement.classList.contains('dark');
  const bg        = isDark ? '#0d1f17' : '#FAF6EC';
  const cardBg    = isDark ? '#142012' : '#FFFDF8';
  const green     = '#0E4A2B';
  const greenDeep = '#08321E';
  const gold      = '#C9A24A';
  const goldSoft  = '#E1C588';
  const ink       = isDark ? '#e8ead6' : '#1A2B22';
  const inkMuted  = isDark ? '#8a9e8f' : '#5C6B62';
  const border    = isDark ? '#1f3828' : '#E5DFCE';
  const inputBg   = isDark ? '#0f1e15' : '#fff';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (isSignUp) {
        if (!name) { setError('Name is required.'); setLoading(false); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
        const r = await signup(name, email, password);
        if (r.error) setError(r.error);
      } else {
        const r = await login(email, password);
        if (r.error) setError(r.error);
      }
    } catch { setError('An unexpected error occurred.'); }
    finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try { await signInWithGoogle(); }
    catch { setError('Could not sign in with Google.'); }
    finally { setLoading(false); }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,50,30,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: 'relative', width: '100%', maxWidth: 420, background: cardBg, borderRadius: 24, boxShadow: '0 32px 80px rgba(8,50,30,0.35)', border: `1px solid ${border}`, overflow: 'hidden' }}>

        {/* Top green band with logo */}
        <div style={{ background: greenDeep, padding: '28px 32px 24px', textAlign: 'center', position: 'relative' }}>
          {/* Subtle star pattern overlay */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.07 }} preserveAspectRatio="xMidYMid slice">
            <defs>
              <pattern id="modal-star" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
                <polygon points="25,4 28,18 42,18 31,27 35,41 25,33 15,41 19,27 8,18 22,18" fill={gold} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#modal-star)" />
          </svg>
          <div style={{ position: 'relative' }}>
            <img src="/TQ LOGO DM.png" alt="Lisan & Quran" style={{ height: 52, width: 'auto', margin: '0 auto' }} />
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgba(250,246,236,0.65)', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.04em' }}>
              {isSignUp ? t('login.signUp') : t('login.signIn')} · Lisan &amp; Quran
            </p>
          </div>
        </div>

        {/* Close button */}
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', color: goldSoft, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>
          ✕
        </button>

        {/* Form body */}
        <div style={{ padding: '28px 32px 32px' }}>

          {/* Tab switch */}
          <div style={{ display: 'flex', background: isDark ? '#0f1e15' : '#F2EBD9', borderRadius: 12, padding: 4, marginBottom: 24, gap: 4 }}>
            {[false, true].map(su => (
              <button key={String(su)} onClick={() => { setIsSignUp(su); setError(''); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                  background: isSignUp === su ? green : 'transparent',
                  color: isSignUp === su ? '#fff' : inkMuted,
                  boxShadow: isSignUp === su ? '0 2px 8px rgba(14,74,43,0.25)' : 'none',
                }}>
                {su ? t('login.signUp') : t('login.signIn')}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSignUp && (
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkMuted, marginBottom: 6, letterSpacing: '0.04em', fontFamily: "'DM Sans', sans-serif" }}>{t('login.nameLabel')}</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder={t('login.namePlaceholder')}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${border}`, background: inputBg, color: ink, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                  onFocus={e => e.target.style.borderColor = green} onBlur={e => e.target.style.borderColor = border}
                />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkMuted, marginBottom: 6, letterSpacing: '0.04em', fontFamily: "'DM Sans', sans-serif" }}>{t('login.emailLabel')}</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={t('login.emailPlaceholder')} autoComplete="email"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${border}`, background: inputBg, color: ink, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = green} onBlur={e => e.target.style.borderColor = border}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: inkMuted, marginBottom: 6, letterSpacing: '0.04em', fontFamily: "'DM Sans', sans-serif" }}>{t('login.passwordLabel')}</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${border}`, background: inputBg, color: ink, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = green} onBlur={e => e.target.style.borderColor = border}
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#b91c1c', fontFamily: "'DM Sans', sans-serif" }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', background: green, color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: '0 6px 20px rgba(14,74,43,0.3)', opacity: loading ? 0.7 : 1, transition: 'all 0.15s', marginTop: 2 }}>
              {loading ? '…' : (isSignUp ? t('login.signUpButton') : t('login.signInButton'))}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: border }} />
            <span style={{ fontSize: 12, color: inkMuted, fontFamily: "'DM Sans', sans-serif" }}>{t('login.or')}</span>
            <div style={{ flex: 1, height: 1, background: border }} />
          </div>

          {/* Google */}
          <button onClick={handleGoogle} disabled={loading}
            style={{ width: '100%', padding: '11px', borderRadius: 12, border: `1.5px solid ${border}`, background: inputBg, color: ink, fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 488 512"><path fill="#4285F4" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 261.8 0 120.5 109.8 11.8 244 11.8c70.4 0 129.5 27.1 175.4 69.1l-63.1 61.9C333.1 119.3 293.8 98.2 244 98.2c-76.4 0-138.3 61.9-138.3 138.3s61.9 138.3 138.3 138.3c88.1 0 112.3-63.7 115.5-98.2H244v-72h244z"/></svg>
            {t('login.googleSignIn')}
          </button>

          {/* Student sign-up — this modal signs in tutors; students register at /join */}
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${border}`, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: inkMuted, fontFamily: "'DM Sans', sans-serif", margin: '0 0 10px' }}>{t('login.studentPrompt')}</p>
            <a href="/join"
              style={{ display: 'inline-flex', width: '100%', boxSizing: 'border-box', justifyContent: 'center', alignItems: 'center', padding: '11px', borderRadius: 12, border: `1.5px solid ${isDark ? goldSoft : green}`, background: 'transparent', color: isDark ? goldSoft : green, fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", textDecoration: 'none' }}>
              {t('login.studentCta')}
            </a>
          </div>

          {/* Quranic verse */}
          <p style={{ textAlign: 'center', marginTop: 22, fontFamily: "'Amiri', serif", fontSize: 16, color: gold, direction: 'rtl' }}>
            وَقُل رَّبِّ زِدْنِي عِلْمًا
          </p>
        </div>
      </div>
    </div>
  );
};

const LandingPageWithAuth: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  return (
    <>
      <LandingPage onOpenAuth={() => setShowAuthModal(true)} />
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
};

// ── Hover-expandable left sidebar (student detail / progress pages only) ────
interface SidebarItem { tab: string; icon: string; label: string; badge?: number; }
const ToolsSidebar: React.FC<{
  items: SidebarItem[];
  activeTab: string;
  onSelect: (tab: string) => void;
  headerHeight: number;
}> = ({ items, activeTab, onSelect, headerHeight }) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div
      className="hidden md:flex fixed left-0 z-[35] select-none no-print flex-col"
      style={{ top: headerHeight, bottom: 0 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        className={`flex flex-col flex-1 bg-white dark:bg-gray-800 shadow-xl rounded-tr-2xl border border-l-0 border-b-0 border-slate-200 dark:border-gray-700 overflow-hidden transition-[width] duration-200 ease-in-out ${expanded ? 'w-48' : 'w-11'}`}
      >
        {/* Nav items */}
        <div className="flex flex-col gap-1 pt-3">
          {items.map(item => {
            const isActive = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                onClick={() => onSelect(item.tab === activeTab ? 'main' : item.tab)}
                title={!expanded ? item.label : undefined}
                className={`relative flex items-center gap-3 px-3 py-3 whitespace-nowrap transition-colors text-left w-full ${
                  isActive
                    ? 'text-teal-600 dark:text-orange-400 bg-teal-50 dark:bg-orange-900/20 font-medium'
                    : 'text-slate-400 dark:text-slate-500 hover:text-teal-600 dark:hover:text-orange-400 hover:bg-slate-50 dark:hover:bg-gray-700'
                }`}
              >
                {/* Dot indicator */}
                <span className={`flex-shrink-0 w-5 flex items-center justify-center`}>
                  <span className={`rounded-full transition-all duration-200 ${
                    isActive
                      ? 'w-2.5 h-2.5 bg-teal-500 dark:bg-orange-400 shadow-sm'
                      : 'w-2 h-2 bg-slate-300 dark:bg-slate-600 group-hover:bg-teal-400'
                  }`} />
                </span>
                <span className={`text-sm overflow-hidden transition-opacity duration-150 ${expanded ? 'opacity-100 delay-75' : 'opacity-0'}`}>
                  {item.label}
                </span>
                {(item.badge ?? 0) > 0 && (
                  <span className={`absolute flex items-center justify-center min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold ${expanded ? 'right-2 top-1/2 -translate-y-1/2' : 'top-1 right-1'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * If TOMORROW is a monthly renewal day for the given renewal date, return
 * tomorrow's date as YYYY-MM-DD (the occurrence to remind for); else null.
 * Recurs on the stored day-of-month, clamped for shorter months, and never
 * fires before the very first renewal date.
 */
function renewalReminderOccurrence(renewalDateStr: string): string | null {
  const stored = new Date(renewalDateStr + 'T00:00:00');
  if (isNaN(stored.getTime())) return null;
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const daysInTomorrowMonth = new Date(tomorrow.getFullYear(), tomorrow.getMonth() + 1, 0).getDate();
  const effectiveDay = Math.min(stored.getDate(), daysInTomorrowMonth);
  if (tomorrow.getDate() !== effectiveDay) return null;
  const storedMidnight = new Date(stored.getFullYear(), stored.getMonth(), stored.getDate());
  if (tomorrow < storedMidnight) return null; // don't remind before the first renewal
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  return `${tomorrow.getFullYear()}-${mm}-${dd}`;
}

const App: React.FC = () => {
  // ── Google Calendar OAuth2 callback — must be checked first ────────────────
  if (window.location.pathname === '/gcal-callback') return <GCalOAuthCallback />;

  // ── Student self-registration wizard — handles its own Google sign-in ────────
  if (window.location.pathname === '/join') return <StudentRegisterPage />;

  // ── Logged-in student portal — works for pure students AND tutors who also
  //    registered as a student with the same Google account ───────────────────
  if (window.location.pathname === '/student') return <StudentRoute />;


  // ── Public policy / pricing pages — no auth required ─────────────────────────
  if (window.location.pathname === '/pricing') return <PricingPage />;
  if (window.location.pathname === '/terms')   return <TermsOfServicePage />;
  if (window.location.pathname === '/privacy') return <PrivacyPolicyPage />;
  if (window.location.pathname === '/refunds') return <RefundPolicyPage />;

  // ── Arabic student portal — no auth required ─────────────────────────────────
  const arabicShareToken = (() => {
    const m = window.location.pathname.match(/^\/arabic\/s\/([a-f0-9-]{36})$/i);
    return m ? m[1] : null;
  })();
  if (arabicShareToken) return <ArabicStudentPortal token={arabicShareToken} />;

  // ── Unified portal (paired Quran + Arabic profiles) — no auth required ────
  const portalPairToken = (() => {
    const m = window.location.pathname.match(/^\/portal\/([a-f0-9-]{36})$/i);
    return m ? m[1] : null;
  })();
  if (portalPairToken) return <UnifiedStudentPortal token={portalPairToken} />;

  // ── Family progress link — no auth required ───────────────────────────────
  const familyLinkId = (() => {
    const m = window.location.pathname.match(/^\/family\/([a-f0-9-]{36})$/i);
    return m ? m[1] : null;
  })();
  if (familyLinkId) return <FamilyLinkPage linkId={familyLinkId} />;

  // ── Letter Flight online 2P — no auth required ────────────────────────────
  const letterFlightRoomId = (() => {
    const m = window.location.pathname.match(/^\/letter-flight\/([a-f0-9-]{36})$/i);
    return m ? m[1] : null;
  })();
  if (letterFlightRoomId) return (
    <AirplaneGame
      letters={[]}
      letterForm="isolated"
      roomId={letterFlightRoomId}
      playerRole="2"
      onExit={() => { window.location.href = '/'; }}
    />
  );

  const { currentUser, loading, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  // Navigation state is persisted to localStorage (see effect below) so a page
  // refresh keeps you on the same student / tab instead of dropping back to the list.
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(() => localStorage.getItem('nav_selectedStudentId'));
  // Tracks homework updates made by the student so they persist within the session
  // without needing to expose setCurrentUser from AuthProvider.
  const [studentHomeworkUpdates, setStudentHomeworkUpdates] = useState<QuranHomework[] | null>(null);
  // Verse key the tutor's Quran view should jump to (homework "go to" button)
  const [quranHomeworkJump, setQuranHomeworkJump] = useState<string | null>(null);
  const [sessionStudentId, setSessionStudentId] = useState<string | null>(null);
  const [tajweedRules, setTajweedRules] = useState<string[]>([]);
  const { currentTheme, toggleTheme } = useTheme();
  const { currentFont, setFont, fonts } = useQuranicFont();
  const { t, language } = useI18n();

  // ── Subject mode: 'quran' | 'arabic' | null (null = show selector) ─────────
  const [subjectMode, setSubjectMode] = useState<'quran' | 'arabic' | null>(() => {
    const saved = localStorage.getItem('subjectMode');
    if (saved === 'quran' || saved === 'arabic') return saved;
    return null;
  });

  const handleSelectSubject = (mode: 'quran' | 'arabic') => {
    setSubjectMode(mode);
    localStorage.setItem('subjectMode', mode);
  };

  // ── Arabic students ───────────────────────────────────────────────────────
  const [arabicStudents, setArabicStudents] = useState<ArabicStudent[]>([]);
  const [selectedArabicStudentId, setSelectedArabicStudentId] = useState<string | null>(() => localStorage.getItem('nav_selectedArabicStudentId'));
  const [arabicVocabCounts, setArabicVocabCounts] = useState<Record<string, number>>({});
  const [hwDeepLink, setHwDeepLink] = useState<{ studentId: string; lessonId: string } | null>(null);

  const handleAddArabicStudent = async (student: ArabicStudent) => {
    setArabicStudents(prev => {
      const idx = prev.findIndex(s => s.id === student.id);
      return idx >= 0 ? prev.map(s => s.id === student.id ? student : s) : [...prev, student];
    });
    if (currentUser?.role === 'teacher') await saveArabicStudent(currentUser.id, student);
  };
  const handleUpdateArabicStudent = async (student: ArabicStudent) => {
    setArabicStudents(prev => prev.map(s => s.id === student.id ? student : s));
    if (currentUser?.role === 'teacher') await saveArabicStudent(currentUser.id, student);
  };
  const handleDeleteArabicStudent = async (studentId: string) => {
    setArabicStudents(prev => prev.filter(s => s.id !== studentId));
    setSelectedArabicStudentId(null);
    if (currentUser?.role === 'teacher') await deleteArabicStudent(currentUser.id, studentId);
  };

  const [isFamilyLinkModalOpen,    setIsFamilyLinkModalOpen]    = useState(false);
  const [isAddStudentModalOpen,    setIsAddStudentModalOpen]    = useState(false);
  const [isUserMenuOpen,           setIsUserMenuOpen]           = useState(false);
  const [isFontMenuOpen,           setIsFontMenuOpen]           = useState(false);
  const [isContactSupportOpen,     setIsContactSupportOpen]     = useState(false);
  const [isMobileNavOpen,          setIsMobileNavOpen]          = useState(false);
  const [gcalToken,                setGcalToken]                = useState<string | null>(() => getStoredToken());
  const [availabilitySlots,        setAvailabilitySlots]        = useState<AvailabilitySlot[]>([]);
  const [pendingBookingCount,      setPendingBookingCount]      = useState(0);

  // Attempt a silent re-auth whenever the token is missing but user was previously connected.
  // This covers: page load after expiry, token cleared mid-session by a 401, and tab resume.
  useEffect(() => {
    if (gcalToken) return; // token is fine
    if (!wasConnected()) return; // never connected — nothing to do
    silentRefresh(
      token => setGcalToken(token),
      ()    => { /* could not get token silently — Connect button stays visible */ },
    );
  // Re-run when gcalToken transitions to null so mid-session expiry is handled too
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcalToken]);

  // Re-attempt silent refresh whenever the browser tab becomes visible again.
  // This recovers from the OS/browser throttling setTimeout while the tab was hidden.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !getStoredToken() && wasConnected()) {
        silentRefresh(
          token => setGcalToken(token),
          ()    => { /* still can't refresh silently */ },
        );
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Proactively refresh the token ~5 min before it expires.
  // On expiry (timer fires late), try silent re-auth before falling back to null.
  useEffect(() => {
    if (gcalToken) {
      scheduleAutoRefresh(
        token => setGcalToken(token),
        ()    => {
          // Auto-refresh timed out — try one more silent re-auth before clearing
          silentRefresh(
            token => setGcalToken(token),
            ()    => setGcalToken(null),
          );
        },
      );
    } else {
      cancelAutoRefresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gcalToken]);

  // Load teacher availability slots whenever the logged-in teacher changes
  useEffect(() => {
    if (currentUser?.role === 'teacher') {
      getTeacherAvailability(currentUser.id).then(setAvailabilitySlots);
    } else {
      setAvailabilitySlots([]);
    }
  }, [currentUser]);
  const [currentStudentView, setCurrentStudentView] = useState<'details' | 'mistakes'>(
    () => (localStorage.getItem('nav_currentStudentView') === 'mistakes' ? 'mistakes' : 'details'),
  );
  type ActiveTab = 'main' | 'lettersTrainer' | 'alphabetTrainer' | 'qaedah' | 'aboutUs' | 'tajweed' | 'vocabulary' | 'calendar' | 'accountSettings' | 'homework';
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const saved = localStorage.getItem('nav_activeTab');
    const allowed: ActiveTab[] = ['main', 'lettersTrainer', 'alphabetTrainer', 'qaedah', 'aboutUs', 'tajweed', 'vocabulary', 'calendar', 'accountSettings', 'homework'];
    return saved && (allowed as string[]).includes(saved) ? (saved as ActiveTab) : 'main';
  });
  const importInputRef = useRef<HTMLInputElement>(null);

  // Persist navigation state so a refresh restores the same student / tab / view
  // (subjectMode is persisted separately in its own initializer).
  useEffect(() => {
    if (selectedStudentId) localStorage.setItem('nav_selectedStudentId', selectedStudentId);
    else localStorage.removeItem('nav_selectedStudentId');
  }, [selectedStudentId]);
  useEffect(() => {
    if (selectedArabicStudentId) localStorage.setItem('nav_selectedArabicStudentId', selectedArabicStudentId);
    else localStorage.removeItem('nav_selectedArabicStudentId');
  }, [selectedArabicStudentId]);
  useEffect(() => { localStorage.setItem('nav_currentStudentView', currentStudentView); }, [currentStudentView]);
  useEffect(() => { localStorage.setItem('nav_activeTab', activeTab); }, [activeTab]);

  // Measure the sticky header so the tools bar sits exactly below it
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(68);
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setHeaderHeight(entry.contentRect.height));
    ro.observe(headerRef.current);
    setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, [currentUser]);

  // Measure the thin tools bar height so the surah nav sits exactly below it
  const thinBarRef = useRef<HTMLDivElement>(null);
  const [thinBarHeight, setThinBarHeight] = useState(40);
  useEffect(() => {
    const el = thinBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setThinBarHeight(entry.contentRect.height));
    ro.observe(el);
    setThinBarHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  // Debounce timer for shared-report sync (avoids hammering DB on rapid updates)
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Subscribed Realtime channel for the current live session. Kept alive so
  // broadcasts (buzz, letter_focus) go through WebSocket, not the REST fallback.
  const liveSessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!sessionStudentId || !currentUser || currentUser.role !== 'teacher') {
      liveSessionChannelRef.current?.unsubscribe();
      liveSessionChannelRef.current = null;
      return;
    }
    const teacherId = currentUser.id;
    let active = true;
    getStudentReportId(teacherId, sessionStudentId).then(reportId => {
      if (!active || !reportId) return;
      const ch = supabase.channel(`report-plays-${reportId}`);
      ch.subscribe();
      liveSessionChannelRef.current = ch;
    });
    return () => {
      active = false;
      liveSessionChannelRef.current?.unsubscribe();
      liveSessionChannelRef.current = null;
    };
  }, [sessionStudentId]);

  const handleExportBackup = () => {
    try {
      downloadBackup();
    } catch (e) {
      console.error(e);
      alert(t('userMenu.exportFailed'));
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!window.confirm(t('userMenu.importConfirm'))) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const result = restoreBackup(parsed, 'replace');
        alert(t('userMenu.importSuccess').replace('{count}', String(result.restoredKeys)));
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert(t('userMenu.importFailed') + '\n' + (err instanceof Error ? err.message : ''));
      }
    };
    reader.onerror = () => alert(t('userMenu.importFailed'));
    reader.readAsText(file);
  };


  // State for live session tracking
  const [progress, setProgress] = useState<{[key: string]: Progress}>({});

  // Load data from Supabase / localStorage when the logged-in teacher changes.
  // Depends on id + role only — NOT the full currentUser object — so a token
  // refresh (which creates a new object reference but same id/role) never
  // triggers a redundant re-fetch that could return empty and clear the list.
  const currentUserId   = currentUser?.role === 'teacher' || currentUser?.role === 'admin' ? (currentUser as { id: string }).id : null;
  const currentUserRole = currentUser?.role ?? null;
  useEffect(() => {
    if (currentUserRole !== 'teacher' || !currentUserId) {
      setStudents([]);
      setTajweedRules([]);
      setArabicStudents([]);
      return;
    }
    const teacherId = currentUserId;
    getStudents(teacherId).then(students => {
      setStudents(students);
      // Preply subscription reminders: notify the tutor the day before each
      // monthly renewal (deduped per occurrence in the service).
      for (const s of students) {
        if (s.studentType !== 'preply' || !s.subscriptionRenewalDate) continue;
        const occ = renewalReminderOccurrence(s.subscriptionRenewalDate);
        if (occ) ensureSubscriptionRenewalReminder({ teacherId, studentId: s.id, studentName: s.name, renewalDate: occ });
      }
    });
    getTajweedRules(teacherId).then(setTajweedRules);
    // Fetch arabic students then compute total vocab counts (lesson words + custom list words)
    Promise.all([
      getArabicStudents(teacherId),
      getVocabWordCountsByLesson(),
    ]).then(async ([students, lessonWordCounts]) => {
      setArabicStudents(students);
      const customCounts = await getCustomVocabWordCountsForStudents(students.map(s => s.id));
      const totals: Record<string, number> = {};
      for (const s of students) {
        const lessonWords = s.completedLessonIds.reduce((sum, lid) => sum + (lessonWordCounts[lid] ?? 0), 0);
        totals[s.id] = lessonWords + (customCounts[s.id] ?? 0);
      }
      setArabicVocabCounts(totals);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentUserRole]);
  
  // Initialize progress from recitation achievements
  useEffect(() => {
    const initialProgress: {[key: string]: Progress} = {};
    students.forEach(student => {
      if (student.recitationAchievements.length > 0) {
        const lastAchievement = [...student.recitationAchievements].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        initialProgress[student.id] = { surah: lastAchievement.endSurah, ayah: lastAchievement.endAyah };
      }
    });
    setProgress(initialProgress);
  }, [students]);

  // Close font menu when clicking outside
  useEffect(() => {
    if (!isFontMenuOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      const button = target.closest('[aria-label="Select Quranic font"]');
      const dropdown = target.closest('.font-menu-dropdown');
      
      if (!button && !dropdown) {
        setIsFontMenuOpen(false);
      }
    };
    
    // Use setTimeout to ensure this runs after the current event loop
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside, true);
    };
  }, [isFontMenuOpen]);


  const handleSaveTajweedRules = (updatedRules: string[]) => {
    if (currentUser?.role !== 'teacher') return;
    setTajweedRules(updatedRules);
    saveTajweedRules(currentUser.id, updatedRules); // async, fire & forget
  }

  const handleAddStudent = (student: Omit<Student, 'id' | 'mistakes'>) => {
    const newStudent: Student = {
      id: crypto.randomUUID(),
      name: student.name,
      dob: student.dob || undefined,
      ageCategory: student.ageCategory,
      recitationAchievements: student.recitationAchievements || [],
      memorizationAchievements: [],
      attendance: student.attendance || [],
      masteredTajweedRules: student.masteredTajweedRules || [],
      tafsirReviews: student.tafsirReviews || [],
      tafsirMemorizationReviews: [],
      mistakes: {},
      timezone: student.timezone,
      hourlyRate: student.hourlyRate,
      studentType: student.studentType,
      preplyPercentage: student.preplyPercentage,
    };
    setStudents(prev => [...prev, newStudent]);
    if (currentUser?.role === 'teacher') {
      saveStudent(currentUser.id, newStudent); // async, fire & forget
    }
    setIsAddStudentModalOpen(false);
  };

  // ── Self-registered student join requests (Quran) ──────────────────────────
  const handleApproveStudent = async (studentId: string) => {
    if (currentUser?.role !== 'teacher') return;
    await setStudentApprovalStatus(currentUser.id, studentId, 'active');
    // Provision the student's portal source (the shared report) so it loads as
    // soon as they sign in — they have no shareable link of their own.
    const stu = students.find(s => s.id === studentId);
    if (stu) {
      await createOrUpdateSharedReport(currentUser.id, stu.id, stu.name, {
        studentName: stu.name,
        generatedAt: new Date().toISOString(),
        mistakes: stu.mistakes || {},
        quranHomework: stu.quranHomework || [],
        ranks: computeReportRanks(stu, students),
        quranicFont: localStorage.getItem('quranicFont') || 'Hafs',
        studentProgress: {
          recitationAchievements: stu.recitationAchievements || [],
          memorizationAchievements: stu.memorizationAchievements || [],
          attendance: stu.attendance || [],
          masteredTajweedRules: stu.masteredTajweedRules || [],
          dob: stu.dob,
          tafsirReviews: stu.tafsirReviews || [],
          tafsirMemorizationReviews: stu.tafsirMemorizationReviews || [],
        },
      });
    }
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, approvalStatus: 'active' } : s));
  };
  const handleRejectStudent = async (studentId: string) => {
    if (currentUser?.role !== 'teacher') return;
    await setStudentApprovalStatus(currentUser.id, studentId, 'rejected');
    setStudents(prev => prev.map(s => s.id === studentId ? { ...s, approvalStatus: 'rejected' } : s));
  };
  const handleApproveArabicStudent = async (studentId: string) => {
    if (currentUser?.role !== 'teacher') return;
    await setArabicStudentApprovalStatus(currentUser.id, studentId, 'active');
    // Provision a share token so the signed-in student's Arabic portal loads.
    await ensureShareTokenById(studentId);
    setArabicStudents(prev => prev.map(s => s.id === studentId ? { ...s, approvalStatus: 'active' } : s));
  };
  const handleRejectArabicStudent = async (studentId: string) => {
    if (currentUser?.role !== 'teacher') return;
    await setArabicStudentApprovalStatus(currentUser.id, studentId, 'rejected');
    setArabicStudents(prev => prev.map(s => s.id === studentId ? { ...s, approvalStatus: 'rejected' } : s));
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    if (currentUser?.role === 'teacher') {
      saveStudent(currentUser.id, updatedStudent); // async, fire & forget

      // ── Auto-sync shared report ───────────────────────────────────────────
      // Debounce so rapid taps (e.g. marking several mistakes) only trigger
      // one DB round-trip, then broadcast so any already-open student portal
      // refreshes its mistakes/progress immediately without a page reload.
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = setTimeout(async () => {
        const reportId = await getStudentReportId(currentUser.id, updatedStudent.id);
        if (!reportId) return; // no shared report exists yet — nothing to sync
        await syncStudentDataInReport(reportId, updatedStudent);
        // Live-broadcast to an open portal ONLY through the already-subscribed
        // session channel for this same student. Spinning up a throwaway,
        // unsubscribed channel just to send() triggers Supabase's REST-fallback
        // deprecation warning — and it isn't needed: the report is already
        // persisted above, so any open portal refreshes on its next load.
        if (liveSessionChannelRef.current && sessionStudentId === updatedStudent.id) {
          liveSessionChannelRef.current.send({
            type: 'broadcast',
            event: 'report_updated',
            payload: {
              mistakes: updatedStudent.mistakes ?? {},
              quranHomework: updatedStudent.quranHomework ?? [],
              studentProgress: {
                recitationAchievements: updatedStudent.recitationAchievements ?? [],
                memorizationAchievements: updatedStudent.memorizationAchievements ?? [],
                attendance: updatedStudent.attendance ?? [],
                masteredTajweedRules: updatedStudent.masteredTajweedRules ?? [],
                dob: updatedStudent.dob,
                tafsirReviews: updatedStudent.tafsirReviews ?? [],
                tafsirMemorizationReviews: updatedStudent.tafsirMemorizationReviews ?? [],
              },
            },
          });
        }
      }, 1500); // 1.5-second debounce window
    }
  };

  const handleDeleteStudent = (studentId: string) => {
    setStudents(prev => prev.filter(s => s.id !== studentId));
    setSelectedStudentId(null);
    setSessionStudentId(null);
    deleteStudent(studentId); // async, fire & forget
  };

  const handleUpdateProgress = async (studentId: string, surah: number, ayah: number) => {
    setProgress(prev => ({ ...prev, [studentId]: { surah, ayah } }));
    // Also add a recitation achievement to persist this progress
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    let points = 0;
    try {
        const response = await fetch(`https://api.quran.com/api/v4/verses/by_key/${surah}:${ayah}?fields=text_uthmani`);
        if (response.ok) {
            const data = await response.json();
            const text = data.verse?.text_uthmani || '';
            const words = text.split(' ').length;
            points = words * POINTS_PER_WORD;
        }
    } catch(e) {
        console.error("Could not fetch verse for points calculation", e);
        const avgWords = 15;
        points = avgWords * POINTS_PER_WORD;
    }

    const newAchievement: RecitationAchievement = {
      id: `rec-live-${Date.now()}`,
      date: new Date().toISOString(),
      startSurah: surah,
      startAyah: ayah,
      endSurah: surah,
      endAyah: ayah,
      readingQuality: 8, // Default quality for live tracking
      tajweedQuality: 8,
      pagesCompleted: 0,
      versesCompleted: 1,
      pointsEarned: points,
    };
    const updatedStudent = {
      ...student,
      recitationAchievements: [...student.recitationAchievements, newAchievement],
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleCycleMistakeLevel = (studentId: string, surah: number, ayah: number, wordIndex: number, letterIndex?: number, errorType?: 'tajweed' | 'reading', errorText?: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // Support both old word-based keys and new letter-based keys
    const key = letterIndex !== undefined 
      ? `${surah}:${ayah}:${wordIndex}:${letterIndex}`
      : `${surah}:${ayah}:${wordIndex}`;
    
    const studentMistakes = student.mistakes || {};
    
    if (letterIndex !== undefined) {
      // Letter-based mistake (new format)
      const newStudentMistakes = { ...studentMistakes };
      if (errorType) {
        // Colored mistake: red (reading) or green (tajweed), comment optional
        newStudentMistakes[key] = {
          level: 1,
          date: new Date().toISOString(),
          errorType,
          ...(errorText?.trim() ? { errorText: errorText.trim() } : {}),
        };
      } else {
        // No errorType = yellow acknowledged marker (persists across page reloads)
        newStudentMistakes[key] = { level: 1, date: new Date().toISOString() };
      }
      const updatedStudent = { ...student, mistakes: newStudentMistakes };
      handleUpdateStudent(updatedStudent);
      return;
    }

    // Old word-based system (for backward compatibility)
    const currentLevel = studentMistakes[key]?.level || 0;
    const nextLevel = (currentLevel + 1) % 6;

    const newStudentMistakes = { ...studentMistakes };
    if (nextLevel === 0) {
      delete newStudentMistakes[key];
    } else {
      newStudentMistakes[key] = { level: nextLevel, date: new Date().toISOString() };
    }

    const updatedStudent = { ...student, mistakes: newStudentMistakes };
    handleUpdateStudent(updatedStudent);
  };
  
  const handleClearMistake = (studentId: string, surah: number, ayah: number, wordIndex: number, letterIndex?: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    // Support both old word-based keys and new letter-based keys
    const key = letterIndex !== undefined 
      ? `${surah}:${ayah}:${wordIndex}:${letterIndex}`
      : `${surah}:${ayah}:${wordIndex}`;
    
    const studentMistakes = student.mistakes || {};
    if (!studentMistakes[key]) return;

    const newStudentMistakes = { ...studentMistakes };
    delete newStudentMistakes[key];

    const updatedStudent = { ...student, mistakes: newStudentMistakes };
    handleUpdateStudent(updatedStudent);
  };

  const handleLogRecitationRange = (studentId: string, range: { start: Progress; end: Progress }, quality: number = 8, isRevision: boolean = false) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const { verses, pages } = calculateVersesAndPages(range.start.surah, range.start.ayah, range.end.surah, range.end.ayah);
    const avgWordsPerVerse = 15;
    const points = isRevision ? 0 : verses * avgWordsPerVerse * POINTS_PER_WORD;

    const newAchievement: RecitationAchievement = {
      id: `rec-live-${Date.now()}`,
      date: new Date().toISOString(),
      startSurah: range.start.surah,
      startAyah: range.start.ayah,
      endSurah: range.end.surah,
      endAyah: range.end.ayah,
      readingQuality: quality,
      tajweedQuality: quality,
      pagesCompleted: pages,
      versesCompleted: verses,
      pointsEarned: points,
      isRevision,
    };

    const updatedStudent = {
      ...student,
      recitationAchievements: [...student.recitationAchievements, newAchievement],
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleRemoveRecitationAchievement = (studentId: string, achievementId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const updatedStudent = {
      ...student,
      recitationAchievements: student.recitationAchievements.filter(ach => ach.id !== achievementId),
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleLogMemorizationRange = (studentId: string, range: { start: Progress; end: Progress }, quality: number = 9, isRevision: boolean = false) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const { verses, pages } = calculateVersesAndPages(range.start.surah, range.start.ayah, range.end.surah, range.end.ayah);

    const newAchievement: MemorizationAchievement = {
      id: `mem-live-${Date.now()}`,
      date: new Date().toISOString(),
      startSurah: range.start.surah,
      startAyah: range.start.ayah,
      endSurah: range.end.surah,
      endAyah: range.end.ayah,
      memorizationQuality: quality,
      pagesCompleted: pages,
      versesCompleted: verses,
      isRevision,
    };

    const updatedStudent = {
      ...student,
      memorizationAchievements: [...student.memorizationAchievements, newAchievement],
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleRemoveMemorizationAchievement = (studentId: string, achievementId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const updatedStudent = {
      ...student,
      memorizationAchievements: student.memorizationAchievements.filter(ach => ach.id !== achievementId),
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleLogTafseerRange = (studentId: string, range: { start: Progress; end: Progress }) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;

    const newReview: TafsirReview = {
      id: `tafseer-live-${Date.now()}`,
      date: new Date().toISOString(),
      surah: range.start.surah,
      startSurah: range.start.surah,
      startAyah: range.start.ayah,
      endSurah: range.end.surah,
      endAyah: range.end.ayah,
    };

    const updatedStudent = {
      ...student,
      tafsirReviews: [...(student.tafsirReviews || []), newReview],
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleRemoveTafseerRange = (studentId: string, reviewId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const updatedStudent = {
      ...student,
      tafsirReviews: (student.tafsirReviews || []).filter(r => r.id !== reviewId),
    };
    handleUpdateStudent(updatedStudent);
  };

  const handleLogHomework = async (studentId: string, range: { start: Progress; end: Progress }, note: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || currentUser?.role !== 'teacher') return;
    const newHomework: QuranHomework = {
      id: `hw-${Date.now()}`,
      startSurah: range.start.surah,
      startAyah:  range.start.ayah,
      endSurah:   range.end.surah,
      endAyah:    range.end.ayah,
      note:       note || undefined,
      assignedAt: new Date().toISOString(),
      isDone:     false,
    };
    const updatedHomework = [...(student.quranHomework || []), newHomework];
    const updatedStudent = { ...student, quranHomework: updatedHomework };
    handleUpdateStudent(updatedStudent);

    // Also push into the shared report so students see it immediately on their portal
    const reportId = await getStudentReportId(currentUser.id, studentId);
    if (reportId) {
      await updateQuranHomeworkInReport(reportId, updatedHomework);
      // Broadcast so the student's already-open portal updates live
      supabase.channel(`report-plays-${reportId}`).send({
        type: 'broadcast',
        event: 'homework_assigned',
        payload: { quranHomework: updatedHomework },
      });
    }
  };

  // Mark a homework item done (tutor side) and push it to the student's portal.
  const handleMarkHomeworkDone = async (studentId: string, homeworkId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || currentUser?.role !== 'teacher') return;
    const updatedHomework = (student.quranHomework || []).map(hw =>
      hw.id === homeworkId ? { ...hw, isDone: true } : hw);
    handleUpdateStudent({ ...student, quranHomework: updatedHomework });
    const reportId = await getStudentReportId(currentUser.id, studentId);
    if (reportId) {
      await updateQuranHomeworkInReport(reportId, updatedHomework);
      supabase.channel(`report-plays-${reportId}`).send({
        type: 'broadcast', event: 'homework_assigned', payload: { quranHomework: updatedHomework },
      });
    }
  };

  // Broadcast a real-time "buzz" to the student's open portal when the tutor
  // presses Ctrl during a live session. Fire-and-forget — no UI feedback needed.
  const handleMistakeBuzz = () => {
    liveSessionChannelRef.current?.send({
      type: 'broadcast',
      event: 'mistake_buzz',
      payload: { ts: Date.now() },
    });
  };

  // Broadcast a letter focus to the student's open portal when the tutor
  // long-presses a letter. Student's screen scrolls to and highlights that letter.
  const handleLetterFocus = (letterKey: string) => {
    liveSessionChannelRef.current?.send({
      type: 'broadcast',
      event: 'letter_focus',
      payload: { letterKey },
    });
  };

  // Broadcast real-time cursor position (C key mode). null = cursor mode off.
  const handleCursorMove = (letterKey: string | null) => {
    liveSessionChannelRef.current?.send({
      type: 'broadcast',
      event: letterKey ? 'cursor_move' : 'cursor_off',
      payload: letterKey ? { letterKey } : {},
    });
  };

  const handleBack = () => {
    // If the user navigated to a tool page from the sidebar, go back to the
    // student page rather than all the way back to the dashboard.
    if (activeTab !== 'main') {
      setActiveTab('main');
    } else if (sessionStudentId) {
      setSessionStudentId(null);
    } else if (currentStudentView === 'mistakes') {
      setCurrentStudentView('details');
    } else if (selectedStudentId) {
      setSelectedStudentId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-slate-100 dark:bg-gray-900">
        <Logo />
      </div>
    );
  }

  if (!currentUser) {
    // Show marketing landing page with an inline auth modal overlay
    return <LandingPageWithAuth />;
  }
  
  // Student home — a self-registered, signed-in student (profiles.role=student).
  if (currentUser.role === 'student') {
    return <StudentApp user={currentUser} onLogout={logout} />;
  }

  // Admin View — isolated panel, no student management
  if (currentUser.role === 'admin') {
    return <AdminPanel currentUser={currentUser} onLogout={logout} />;
  }

  // ── Subject selection (shown once after login until user picks a mode) ─────
  if (subjectMode === null) {
    return <SubjectSelectionPage onSelect={handleSelectSubject} />;
  }

  // ── Arabic section ────────────────────────────────────────────────────────
  if (subjectMode === 'arabic') {
    const selectedArabicStudent = arabicStudents.find(s => s.id === selectedArabicStudentId) ?? null;
    return (
      <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
        {/* Arabic header */}
        <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
            <button onClick={() => { setSelectedArabicStudentId(null); }} className="cursor-pointer hover:opacity-80 transition-opacity" aria-label="Return to Arabic dashboard">
              <Logo />
            </button>
            <span className="hidden sm:block text-sm font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</span>
            {/* Nav links — same as Quran section */}
            <nav className="flex-1 hidden md:flex justify-center items-center gap-6">
              <button
                onClick={() => setActiveTab(tab => tab === 'aboutUs' ? 'main' : 'aboutUs')}
                className={`text-sm font-medium transition-colors ${activeTab === 'aboutUs' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
              >{t('header.aboutUs')}</button>
              <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500 transition-colors">{t('header.contactUs')}</a>
              <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">{t('header.supportUs')}</a>
              <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" />
              <button
                onClick={() => setActiveTab(tab => tab === 'calendar' ? 'main' : 'calendar')}
                className={`relative text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
              >
                Calendar
                {pendingBookingCount > 0 && (
                  <span className="absolute -top-1.5 -end-3 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {pendingBookingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab(tab => tab === 'vocabulary' ? 'main' : 'vocabulary')}
                className={`text-sm font-medium transition-colors ${activeTab === 'vocabulary' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
              >Vocabulary</button>
              {/* Switch to Quran */}
              <button
                onClick={() => { handleSelectSubject('quran'); setSelectedArabicStudentId(null); setActiveTab('main'); }}
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500 transition-colors"
              >{t('header.switchToQuran')}</button>
            </nav>
            <div className="flex-1 md:hidden" />
            <div className="flex items-center gap-2">
              {/* Mobile hamburger — Arabic section */}
              <button
                onClick={() => setIsMobileNavOpen(o => !o)}
                className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Toggle navigation"
              >
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  {isMobileNavOpen
                    ? <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    : <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  }
                </svg>
              </button>
              <NotificationCenter
                teacherId={currentUser.id}
                recipient="tutor"
                onNavigate={(sid, lid) => {
                  setSelectedArabicStudentId(sid);
                  setActiveTab('main');
                  setHwDeepLink({ studentId: sid, lessonId: lid });
                }}
              />
              <button onClick={toggleTheme} aria-label="Toggle theme" className="p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                {currentTheme === 'dark' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
                ) : currentTheme === 'reading' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" /></svg>
                )}
              </button>
              {/* Arabic user menu — same as Quran section */}
              <div className="relative">
                <button onClick={() => setIsUserMenuOpen(o => !o)} className="flex items-center gap-2 p-1.5 rounded-full bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
                  <span className="w-7 h-7 bg-amber-200 dark:bg-amber-800 text-amber-700 dark:text-amber-300 rounded-full flex items-center justify-center font-bold text-sm">{currentUser.name.charAt(0).toUpperCase()}</span>
                  <span className="hidden sm:inline text-sm font-semibold text-slate-700 dark:text-slate-200 pe-2">{currentUser.name}</span>
                </button>
                {isUserMenuOpen && (
                  <div className="absolute end-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                    <div className="py-1">
                      <button onClick={() => { setIsUserMenuOpen(false); setActiveTab('accountSettings'); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                        Account Settings
                      </button>
                      {gcalToken ? (
                        <button onClick={() => { setIsUserMenuOpen(false); import('./services/googleCalendarService').then(m => { m.disconnectGoogleCalendar(); setGcalToken(null); }); }} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                          <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                          Disconnect Google Calendar
                        </button>
                      ) : (
                        <button onClick={() => { setIsUserMenuOpen(false); setActiveTab('calendar'); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                          <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                          Connect Google Calendar
                        </button>
                      )}
                      <div className="border-t border-slate-200 dark:border-gray-700 my-1" />
                      <button onClick={() => { setIsUserMenuOpen(false); setIsContactSupportOpen(true); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>
                        {t('userMenu.contactSupport')}
                      </button>
                      <div className="border-t border-slate-200 dark:border-gray-700 my-1" />
                      <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                        {t('userMenu.logout')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Mobile nav drawer — Arabic section */}
          {isMobileNavOpen && (
            <div className="md:hidden border-t border-slate-100 dark:border-gray-700">
              <nav className="flex flex-col py-2">
                <button onClick={() => { setActiveTab(tab => tab === 'aboutUs' ? 'main' : 'aboutUs'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'aboutUs' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>{t('header.aboutUs')}</button>
                <button onClick={() => { setActiveTab(tab => tab === 'calendar' ? 'main' : 'calendar'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>
                  <span>Calendar</span>
                  {pendingBookingCount > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingBookingCount}</span>}
                </button>
                <button onClick={() => { setActiveTab(tab => tab === 'vocabulary' ? 'main' : 'vocabulary'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'vocabulary' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>Vocabulary</button>
                <div className="mx-5 my-1 border-t border-slate-100 dark:border-gray-700" />
                <button onClick={() => { handleSelectSubject('quran'); setSelectedArabicStudentId(null); setActiveTab('main'); setIsMobileNavOpen(false); }} className="flex items-center gap-3 px-5 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">{t('header.switchToQuran')}</button>
              </nav>
            </div>
          )}
        </header>
        <main className="container mx-auto flex-grow p-4 sm:p-6 lg:p-8">
          {activeTab === 'accountSettings' ? (
            <AccountSettingsPage
              teacherId={currentUser.id}
              userName={currentUser.name}
              userEmail={currentUser.email ?? ''}
              onBack={() => setActiveTab('main')}
              onAvailabilityChange={setAvailabilitySlots}
            />
          ) : activeTab === 'aboutUs' ? (
            <AboutUsPage />
          ) : activeTab === 'calendar' ? (
            <CalendarPage
              gcalToken={gcalToken}
              onTokenChange={setGcalToken}
              availabilitySlots={availabilitySlots}
              teacherId={currentUser.id}
              onPendingCountChange={setPendingBookingCount}
              arabicStudents={arabicStudents}
              quranStudents={students}
            />
          ) : activeTab === 'vocabulary' ? (
            selectedArabicStudent ? (
              <VocabularyPracticePage studentId={selectedArabicStudent.id} />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <p className="text-4xl mb-4">📚</p>
                <p className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">Vocabulary Practice</p>
                <p className="text-slate-500 dark:text-slate-400">Select a student from the dashboard to view their vocabulary lists.</p>
              </div>
            )
          ) : selectedArabicStudent ? (
            <ArabicStudentDetailPage
              student={selectedArabicStudent}
              teacherId={currentUser.id}
              onBack={() => setSelectedArabicStudentId(null)}
              onUpdateStudent={handleUpdateArabicStudent}
              onDeleteStudent={handleDeleteArabicStudent}
              vocabCount={arabicVocabCounts[selectedArabicStudent.id] ?? 0}
              hwDeepLink={hwDeepLink?.studentId === selectedArabicStudent.id ? hwDeepLink : null}
              onHwDeepLinkConsumed={() => setHwDeepLink(null)}
            />
          ) : (
            <ArabicDashboard
              teacherId={currentUser.id}
              students={arabicStudents}
              vocabCounts={arabicVocabCounts}
              onAddStudent={handleAddArabicStudent}
              onSelectStudent={id => { setSelectedArabicStudentId(id); setActiveTab('main'); }}
              onUpdateStudent={handleUpdateArabicStudent}
              onFamilyLinks={() => setIsFamilyLinkModalOpen(true)}
              onApproveStudent={handleApproveArabicStudent}
              onRejectStudent={handleRejectArabicStudent}
            />
          )}
        </main>
        <div className="no-print"><Footer /></div>
        <FamilyLinkModal
          isOpen={isFamilyLinkModalOpen}
          onClose={() => setIsFamilyLinkModalOpen(false)}
          teacherId={currentUser.id}
          quranStudents={students}
          arabicStudents={arabicStudents}
          onUpdateArabicStudent={handleUpdateArabicStudent}
        />
      </div>
    );
  }

  // Teacher View (Quran)
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;
  const sessionStudent = students.find((s) => s.id === sessionStudentId) || null;
  const isDetailedView = !!selectedStudentId || !!sessionStudentId;

  return (
    <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
      <header ref={headerRef} className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 no-print">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
            <button
                onClick={() => {
                    setSelectedStudentId(null);
                    setSessionStudentId(null);
                    setCurrentStudentView('details');
                    setActiveTab('main');
                }}
                className="cursor-pointer hover:opacity-80 transition-opacity"
                aria-label="Return to dashboard"
            >
                <Logo />
            </button>
            <nav className="flex-1 hidden md:flex justify-center items-center gap-6">
                <button
                    onClick={() => { setCurrentStudentView('details'); setActiveTab(t => t === 'aboutUs' ? 'main' : 'aboutUs'); }}
                    className={`text-sm font-medium transition-colors ${activeTab === 'aboutUs' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                >{t('header.aboutUs')}</button>
                <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500 transition-colors">{t('header.contactUs')}</a>
                <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">{t('header.supportUs')}</a>
                <div className="h-4 w-px bg-slate-200 dark:bg-slate-600" />
                <button
                    onClick={() => { setCurrentStudentView('details'); setActiveTab(t => t === 'calendar' ? 'main' : 'calendar'); }}
                    className={`relative text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                >
                  Calendar
                  {pendingBookingCount > 0 && (
                    <span className="absolute -top-1.5 -end-3 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {pendingBookingCount}
                    </span>
                  )}
                </button>
                {/* Switch to Arabic */}
                <button
                    onClick={() => { handleSelectSubject('arabic'); setSelectedStudentId(null); setSessionStudentId(null); setActiveTab('main'); }}
                    className="text-sm font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                    style={{ fontFamily: 'Amiri Regular, serif' }}
                >العربية</button>
            </nav>
            <div className="flex items-center gap-2">
                {/* Mobile hamburger — visible only below md */}
                <button
                    onClick={() => setIsMobileNavOpen(o => !o)}
                    className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Toggle navigation"
                >
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                        {isMobileNavOpen
                            ? <path d="M4 4L18 18M18 4L4 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            : <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        }
                    </svg>
                </button>
                {isDetailedView && (
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
                        aria-label="Go back"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                        </svg>
                        <span className="hidden sm:inline">{t('common.back')}</span>
                    </button>
                )}
                <NotificationCenter
                  teacherId={currentUser.id}
                  recipient="tutor"
                  onNavigate={(sid, lid) => {
                    setSelectedArabicStudentId(sid);
                    setActiveTab('main');
                    setHwDeepLink({ studentId: sid, lessonId: lid });
                  }}
                />
                <button onClick={toggleTheme} aria-label="Toggle theme" className="p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                {currentTheme === 'dark' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
                ) : currentTheme === 'reading' ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25c0 5.385 4.365 9.75 9.75 9.75 2.572 0 4.921-.994 6.697-2.648Z" /></svg>
                )}
                </button>
                <div className="relative">
                    <button onClick={() => setIsFontMenuOpen(!isFontMenuOpen)} aria-label="Select Quranic font" className="p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors">
                        <span className="font-quranic text-xl" style={{ fontFamily: 'Amiri Regular' }}>ع</span>
                    </button>
                    {isFontMenuOpen && (
                        <div className="absolute end-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50 font-menu-dropdown">
                            <div className="py-1">
                                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{t('common.quranicFont')}</div>
                                {fonts.map((fontOption) => (
                                    <button
                                        key={fontOption.name}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFont(fontOption.name);
                                            setIsFontMenuOpen(false);
                                        }}
                                        className={`font-option-button w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                                            currentFont === fontOption.name
                                                ? 'bg-teal-50 dark:bg-orange-900/20 text-teal-700 dark:text-orange-400 font-medium'
                                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <span className="font-quranic" style={{ fontFamily: fontOption.name }}>{fontOption.displayName}</span>
                                        {currentFont === fontOption.name && (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="relative">
                    <button onClick={() => setIsUserMenuOpen(o => !o)} className="flex items-center gap-2 p-1.5 rounded-full bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors">
                        <span className="w-7 h-7 bg-teal-200 dark:bg-orange-800 text-teal-700 dark:text-orange-300 rounded-full flex items-center justify-center font-bold text-sm">{currentUser.name.charAt(0).toUpperCase()}</span>
                        <span className="hidden sm:inline text-sm font-semibold text-slate-700 dark:text-slate-200 pe-2">{currentUser.name}</span>
                    </button>
                    {isUserMenuOpen && (
                        <div className="absolute end-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                            <div className="py-1">
                                {/* Account Settings */}
                                <button onClick={() => { setIsUserMenuOpen(false); setActiveTab('accountSettings'); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                                    Account Settings
                                </button>
                                {/* Google Calendar connect / disconnect */}
                                {gcalToken ? (
                                    <button onClick={() => { setIsUserMenuOpen(false); import('./services/googleCalendarService').then(m => { m.disconnectGoogleCalendar(); setGcalToken(null); }); }} className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                                        <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                        Disconnect Google Calendar
                                    </button>
                                ) : (
                                    <button onClick={() => { setIsUserMenuOpen(false); setActiveTab('calendar'); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                        <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                        Connect Google Calendar
                                    </button>
                                )}
                                <div className="border-t border-slate-200 dark:border-gray-700 my-1" />
                                <button onClick={() => { setIsUserMenuOpen(false); setIsContactSupportOpen(true); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>
                                    {t('userMenu.contactSupport')}
                                </button>
                                <div className="border-t border-slate-200 dark:border-gray-700 my-1" />
                                <button onClick={logout} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                                    {t('userMenu.logout')}
                                </button>
                            </div>
                        </div>
                    )}
                    <input
                        ref={importInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={handleImportBackup}
                    />
                </div>
            </div>
        </div>
        {/* Mobile nav drawer — teacher/quran */}
        {isMobileNavOpen && (
          <div className="md:hidden border-t border-slate-100 dark:border-gray-700">
            <nav className="flex flex-col py-2">
              <button onClick={() => { setCurrentStudentView('details'); setActiveTab(t => t === 'aboutUs' ? 'main' : 'aboutUs'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'aboutUs' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>{t('header.aboutUs')}</button>
              <button onClick={() => { setCurrentStudentView('details'); setActiveTab(t => t === 'calendar' ? 'main' : 'calendar'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'calendar' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>
                <span>Calendar</span>
                {pendingBookingCount > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{pendingBookingCount}</span>}
              </button>
              <button onClick={() => { setActiveTab('lettersTrainer'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'lettersTrainer' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>🔡 {t('header.lettersTrainer')}</button>
              <button onClick={() => { setActiveTab('alphabetTrainer'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'alphabetTrainer' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>🔤 {t('header.alphabetTrainer')}</button>
              <button onClick={() => { setActiveTab('qaedah'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'qaedah' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>📖 Qaedah</button>
              <button onClick={() => { setCurrentStudentView('details'); setActiveTab(t => t === 'tajweed' ? 'main' : 'tajweed'); setIsMobileNavOpen(false); }} className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${activeTab === 'tajweed' ? 'text-teal-600 dark:text-orange-500 bg-teal-50 dark:bg-orange-900/10' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-gray-700'}`}>{t('header.tajweed')}</button>
              <div className="mx-5 my-1 border-t border-slate-100 dark:border-gray-700" />
              <button onClick={() => { handleSelectSubject('arabic'); setSelectedStudentId(null); setSessionStudentId(null); setActiveTab('main'); setIsMobileNavOpen(false); }} className="flex items-center gap-3 px-5 py-3 text-sm font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" style={{ fontFamily: 'Amiri Regular, serif' }}>العربية</button>
            </nav>
          </div>
        )}
      </header>
      {/* ── Thin student-tools bar — visible on all student pages (detail + session) ── */}
      {isDetailedView && ['main', 'lettersTrainer', 'alphabetTrainer', 'qaedah', 'tajweed', 'homework'].includes(activeTab) && (() => {
        const activeHwCount = (sessionStudent ?? selectedStudent)?.quranHomework?.filter(hw => !hw.isDone).length ?? 0;
        const tabs = [
          { id: 'tajweed',         label: t('header.tajweed'),          icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg> },
          { id: 'qaedah',          label: 'Qaedah',                     icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg> },
          { id: 'alphabetTrainer', label: t('header.alphabetTrainer'),  icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.255 3A23.933 23.933 0 0 1 21 12c0 3.183-.62 6.22-1.745 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.89M8.25 8.885l-1.993.007a.75.75 0 0 0-.75.75v0a.75.75 0 0 0 .75.75H8.25" /></svg> },
          { id: 'quran',           label: 'Quran',                      icon: <LottieIcon src="/al-quran.json" size={20} /> },
          { id: 'lettersTrainer',  label: t('header.lettersTrainer'),   icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg> },
          { id: 'homework',        label: 'Homework',                   icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>, badge: activeHwCount },
        ] as const;
        return (
          <div
            ref={thinBarRef}
            className="sticky z-[35] bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 shadow-sm no-print"
            style={{ top: headerHeight }}
          >
            <div className="flex items-center justify-center overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
              {tabs.map(tab => {
                // The "Quran" tab opens the live logging session (what the old green
                // button did) rather than switching activeTab. It's the primary action,
                // so it gets a distinct highlighted pill — active while the session is open.
                if (tab.id === 'quran') {
                  const quranActive = !!sessionStudentId;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        if (sessionStudentId) { setSessionStudentId(null); return; }
                        const sid = (selectedStudent ?? sessionStudent)?.id ?? null;
                        if (!sid) return;
                        setCurrentStudentView('details');
                        setActiveTab('main');
                        setSessionStudentId(sid);
                      }}
                      className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 my-1.5 mx-1 rounded-none text-sm font-bold transition-all whitespace-nowrap ${
                        quranActive
                          ? 'bg-green-500 text-white'
                          : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  );
                }
                return (
                <button
                  key={tab.id}
                  onClick={() => { setCurrentStudentView('details'); setActiveTab(activeTab === tab.id ? 'main' : tab.id); }}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? tab.id === 'homework'
                        ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                        : 'border-teal-600 text-teal-600 dark:border-orange-500 dark:text-orange-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {'badge' in tab && tab.badge > 0 && (
                    <span className="bg-violet-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        );
      })()}
      <main className={`flex-grow ${sessionStudent && activeTab === 'main' ? 'p-0' : 'container mx-auto p-4 sm:p-6 lg:p-8'}`}>
        {activeTab === 'accountSettings' ? (
          <AccountSettingsPage
            teacherId={currentUser.id}
            userName={currentUser.name}
            userEmail={currentUser.email ?? ''}
            onBack={() => setActiveTab('main')}
            onAvailabilityChange={setAvailabilitySlots}
          />
        ) : activeTab === 'lettersTrainer' ? (
          <LettersTrainerPage
            preSelectedStudent={
              selectedStudent ? { id: selectedStudent.id, name: selectedStudent.name } :
              sessionStudent  ? { id: sessionStudent.id,  name: sessionStudent.name  } :
              undefined
            }
          />
        ) : activeTab === 'alphabetTrainer' ? (
          <AlphabetTrainerPage />
        ) : activeTab === 'qaedah' ? (
          <QaedahPage />
        ) : activeTab === 'aboutUs' ? (
          <AboutUsPage />
        ) : activeTab === 'tajweed' ? (
          <TajweedPage students={students} preSelectedStudentId={(sessionStudentId ?? selectedStudentId) ?? undefined} />
        ) : activeTab === 'calendar' ? (
          <CalendarPage
            gcalToken={gcalToken}
            onTokenChange={setGcalToken}
            availabilitySlots={availabilitySlots}
            teacherId={currentUser.id}
            onPendingCountChange={setPendingBookingCount}
            quranStudents={students}
            arabicStudents={arabicStudents}
          />
        ) : activeTab === 'homework' && (sessionStudent ?? selectedStudent) ? (() => {
          const hw_student = sessionStudent ?? selectedStudent!;
          const hw_all  = hw_student.quranHomework ?? [];
          const hw_active = hw_all.filter(hw => !hw.isDone);
          const hw_done   = hw_all.filter(hw =>  hw.isDone);
          const fmtRange = (hw: QuranHomework) => {
            const s = QURAN_METADATA.find(m => m.number === hw.startSurah)?.transliteratedName ?? `Surah ${hw.startSurah}`;
            const e = QURAN_METADATA.find(m => m.number === hw.endSurah)?.transliteratedName   ?? `Surah ${hw.endSurah}`;
            if (hw.startSurah === hw.endSurah && hw.startAyah === hw.endAyah) return `${s} : ${hw.startAyah}`;
            return `${s} ${hw.startAyah} → ${e} ${hw.endAyah}`;
          };
          const removeHomework = async (homeworkId: string) => {
            const updated = hw_all.filter(hw => hw.id !== homeworkId);
            handleUpdateStudent({ ...hw_student, quranHomework: updated });
            const reportId = await getStudentReportId(currentUser.id, hw_student.id);
            if (reportId) {
              await updateQuranHomeworkInReport(reportId, updated);
              supabase.channel(`report-plays-${reportId}`).send({ type: 'broadcast', event: 'homework_assigned', payload: { quranHomework: updated } });
            }
          };
          // Open the Quran view at this homework's verses.
          const goToHomework = (hw: QuranHomework) => {
            if (!sessionStudent) setSessionStudentId(hw_student.id);
            setActiveTab('main');
            const key = `${hw.startSurah}:${hw.startAyah}`;
            setQuranHomeworkJump(key);
            setTimeout(() => setQuranHomeworkJump(null), 800); // reset so repeat taps re-fire
          };
          return (
            <div className="max-w-2xl mx-auto space-y-8 py-2">
              {/* Active homework */}
              <section>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <span className="text-xl">📝</span> Current Homework
                  {hw_active.length > 0 && <span className="bg-violet-600 text-white text-xs font-bold rounded-full px-2 py-0.5">{hw_active.length}</span>}
                </h2>
                {hw_active.length === 0 ? (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                    <p className="text-3xl mb-2">🎉</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">All caught up!</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">No pending homework assigned.</p>
                  </div>
                ) : hw_active.map((hw, idx) => (
                  <div key={hw.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-violet-100 dark:border-violet-900/40 shadow-sm overflow-hidden mb-3">
                    <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                    <div className="p-4 sm:p-5">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="text-xs font-bold text-violet-500 dark:text-violet-400 uppercase tracking-wide mt-0.5">#{idx + 1}</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmtRange(hw)}</span>
                      </div>
                      {hw.note ? (
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2 whitespace-pre-wrap bg-slate-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">{hw.note}</p>
                      ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1">No instructions.</p>
                      )}
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                        Assigned {new Date(hw.assignedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {hw.isDone && ' · ✅ Done'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => goToHomework(hw)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/30 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-bold hover:bg-violet-100 dark:hover:bg-violet-800/50 transition-colors"
                        >
                          📖 Go to homework
                        </button>
                        <button
                          onClick={() => handleMarkHomeworkDone(hw_student.id, hw.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-900/30 border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 text-xs font-bold hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors"
                        >
                          ✓ Done
                        </button>
                        <button
                          onClick={() => removeHomework(hw.id)}
                          className="ms-auto text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium transition-colors"
                        >
                          🗑 Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
              {/* Completed history */}
              <section>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <span className="text-xl">✅</span> Completed
                  {hw_done.length > 0 && <span className="bg-slate-400 dark:bg-slate-600 text-white text-xs font-bold rounded-full px-2 py-0.5">{hw_done.length}</span>}
                </h2>
                {hw_done.length === 0 ? (
                  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center">
                    <p className="text-sm text-slate-400 dark:text-slate-500 italic">Completed homework will appear here.</p>
                  </div>
                ) : hw_done.map((hw, idx) => (
                  <div key={hw.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden mb-3 opacity-75">
                    <div className="h-1 bg-gradient-to-r from-teal-400 to-emerald-400" />
                    <div className="p-4 sm:p-5 flex items-start gap-3">
                      <span className="text-xl mt-0.5 flex-shrink-0">✅</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">#{hw_done.length - idx}</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 line-through decoration-slate-300 dark:decoration-slate-600">{fmtRange(hw)}</span>
                        </div>
                        {hw.note && <p className="text-xs text-slate-400 dark:text-slate-500 italic mt-1 truncate">{hw.note}</p>}
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                          Assigned {new Date(hw.assignedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          );
        })() : sessionStudent ? (
          <StudentProgressPage
            student={sessionStudent}
            students={students}
            jumpToVerseKey={quranHomeworkJump}
            notesStudentId={sessionStudent.id}
            studentProgress={progress[sessionStudent.id]}
            studentMistakes={sessionStudent.mistakes || {}}
            recitationAchievements={sessionStudent.recitationAchievements || []}
            memorizationAchievements={sessionStudent.memorizationAchievements || []}
            onUpdateProgress={handleUpdateProgress}
            onCycleMistakeLevel={handleCycleMistakeLevel}
            onClearMistake={handleClearMistake}
            onLogRecitationRange={handleLogRecitationRange}
            onRemoveRecitationAchievement={handleRemoveRecitationAchievement}
            onLogMemorizationRange={handleLogMemorizationRange}
            onRemoveMemorizationAchievement={handleRemoveMemorizationAchievement}
            onLogTafseerRange={handleLogTafseerRange}
            onRemoveTafseerRange={handleRemoveTafseerRange}
            onLogHomework={handleLogHomework}
            homeworkRanges={(sessionStudent.quranHomework ?? []).filter(hw => !hw.isDone)}
            toolbarStickyTop={headerHeight + thinBarHeight}
            onGoBack={() => setSessionStudentId(null)}
            onMistakeBuzz={handleMistakeBuzz}
            onLetterFocus={handleLetterFocus}
            onCursorMove={handleCursorMove}
          />
        ) : selectedStudent ? (
          currentStudentView === 'mistakes' ? (
            <MistakesReviewPage student={selectedStudent} onBack={() => setCurrentStudentView('details')} teacherId={currentUser?.role === 'teacher' ? currentUser.id : undefined} onStudentUpdate={handleUpdateStudent} />
          ) : (
            <StudentDetailPage 
              student={selectedStudent} 
              students={students}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onStartSession={setSessionStudentId}
              quranMetadata={QURAN_METADATA}
              tajweedRules={tajweedRules}
              onUpdateTajweedRules={handleSaveTajweedRules}
              onReviewMistakes={() => setCurrentStudentView('mistakes')}
              teacherId={currentUser?.role === 'teacher' ? currentUser.id : undefined}
            />
          )
        ) : (
          <Dashboard
            students={students}
            onSelectStudent={(id) => { setSelectedStudentId(id); setCurrentStudentView('details'); }}
            quranMetadata={QURAN_METADATA}
            onFamilyLinks={() => setIsFamilyLinkModalOpen(true)}
            onAddStudent={() => setIsAddStudentModalOpen(true)}
            teacherId={currentUser?.role === 'teacher' ? currentUser.id : undefined}
            onApproveStudent={handleApproveStudent}
            onRejectStudent={handleRejectStudent}
          />
        )}
      </main>

      <AddStudentModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        onAddStudent={(name, dob, ageCategory, billing) => handleAddStudent({ name, dob, ageCategory, ...billing, recitationAchievements: [], memorizationAchievements: [], attendance: [], masteredTajweedRules: [], tafsirReviews: [], tafsirMemorizationReviews: [] })}
      />

      <ContactSupportModal
        currentUser={currentUser}
        isOpen={isContactSupportOpen}
        onClose={() => setIsContactSupportOpen(false)}
      />

      <FamilyLinkModal
        isOpen={isFamilyLinkModalOpen}
        onClose={() => setIsFamilyLinkModalOpen(false)}
        teacherId={currentUser.id}
        quranStudents={students}
        arabicStudents={arabicStudents}
        onUpdateArabicStudent={handleUpdateArabicStudent}
      />

      <div className="no-print">
        <Footer />
      </div>
    </div>
  );
};

export default App;