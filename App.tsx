import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, Progress, RecitationAchievement, MemorizationAchievement } from './types';
import Dashboard from './components/Dashboard';
import StudentDetailPage from './components/StudentDetailPage';
import StudentProgressPage from './components/StudentProgressPage';
// FIX: Import 'calculateVersesAndPages' from dataService to resolve reference errors.
import { getStudents, saveStudent, deleteStudent, getTajweedRules, saveTajweedRules, calculateVersesAndPages, downloadBackup, restoreBackup } from './services/dataService';
import { QURAN_METADATA, POINTS_PER_WORD } from './constants';
import { useI18n } from './context/I18nProvider';
import Footer from './components/Footer';
import Logo from './components/Logo';
import AddStudentModal from './components/AddStudentModal';
import { useAuth } from './context/AuthProvider';
import LoginPage from './components/LoginPage';
import StudentViewOnlyPage from './components/StudentViewOnlyPage';
import MistakesReviewPage from './components/MistakesReviewPage';
import LettersTrainerPage from './components/LettersTrainerPage';
import AlphabetTrainerPage from './components/AlphabetTrainerPage';
import SharedReportPage from './components/SharedReportPage';
import AdminPanel from './components/AdminPanel';
import ContactSupportModal from './components/ContactSupportModal';
import AboutUsPage from './components/AboutUsPage';

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

const App: React.FC = () => {
  // ── Shared report route — no auth required ──────────────────────────────────
  const sharedReportId = (() => {
    const m = window.location.pathname.match(/^\/report\/([a-f0-9-]{36})$/i);
    return m ? m[1] : null;
  })();
  if (sharedReportId) return <SharedReportPage reportId={sharedReportId} />;

  const { currentUser, loading, logout } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [sessionStudentId, setSessionStudentId] = useState<string | null>(null);
  const [tajweedRules, setTajweedRules] = useState<string[]>([]);
  const { currentTheme, toggleTheme } = useTheme();
  const { currentFont, setFont, fonts } = useQuranicFont();
  const { t, language } = useI18n();
  
  const [isAddStudentModalOpen,    setIsAddStudentModalOpen]    = useState(false);
  const [isUserMenuOpen,           setIsUserMenuOpen]           = useState(false);
  const [isFontMenuOpen,           setIsFontMenuOpen]           = useState(false);
  const [isContactSupportOpen,     setIsContactSupportOpen]     = useState(false);
  const [currentStudentView, setCurrentStudentView] = useState<'details' | 'mistakes'>('details');
  const [activeTab, setActiveTab] = useState<'main' | 'lettersTrainer' | 'alphabetTrainer' | 'aboutUs'>('main');
  const importInputRef = useRef<HTMLInputElement>(null);

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

  // Load data from Supabase when the logged-in teacher changes
  useEffect(() => {
    if (currentUser?.role !== 'teacher') {
      setStudents([]);
      setTajweedRules([]);
      return;
    }
    const teacherId = currentUser.id;
    getStudents(teacherId).then(setStudents);
    getTajweedRules(teacherId).then(setTajweedRules);
  }, [currentUser]);
  
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
      id: `student-${Date.now()}`,
      name: student.name,
      dob: student.dob,
      recitationAchievements: student.recitationAchievements || [],
      memorizationAchievements: [],
      attendance: student.attendance || [],
      masteredTajweedRules: student.masteredTajweedRules || [],
      tafsirReviews: student.tafsirReviews || [],
      tafsirMemorizationReviews: [],
      mistakes: {},
    };
    setStudents(prev => [...prev, newStudent]);
    if (currentUser?.role === 'teacher') {
      saveStudent(currentUser.id, newStudent); // async, fire & forget
    }
    setIsAddStudentModalOpen(false);
  };

  const handleUpdateStudent = (updatedStudent: Student) => {
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    if (currentUser?.role === 'teacher') {
      saveStudent(currentUser.id, updatedStudent); // async, fire & forget
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
    
    if (letterIndex !== undefined && errorType && errorText) {
      // New letter-based mistake with error type and text
      const newStudentMistakes = { ...studentMistakes };
      newStudentMistakes[key] = { 
        level: 1, 
        date: new Date().toISOString(),
        errorType,
        errorText
      };
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

  const handleLogRecitationRange = (studentId: string, range: { start: Progress; end: Progress }) => {
    // This is a simplified async wrapper because the original function was not async
    // but the underlying call should ideally be.
    (async () => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;

        // Note: `getVersesInRange` is async but not awaited here, which could lead to race conditions.
        // For simplicity of this change, we'll keep the structure but ideally this should be refactored.
        const { verses, pages } = calculateVersesAndPages(range.start.surah, range.start.ayah, range.end.surah, range.end.ayah);
        const avgWordsPerVerse = 15;
        const points = verses * avgWordsPerVerse * POINTS_PER_WORD;

        const newAchievement: RecitationAchievement = {
          id: `rec-live-${Date.now()}`,
          date: new Date().toISOString(),
          startSurah: range.start.surah,
          startAyah: range.start.ayah,
          endSurah: range.end.surah,
          endAyah: range.end.ayah,
          readingQuality: 8,
          tajweedQuality: 8,
          pagesCompleted: pages,
          versesCompleted: verses,
          pointsEarned: points,
        };

        const updatedStudent = {
          ...student,
          recitationAchievements: [...student.recitationAchievements, newAchievement],
        };
        handleUpdateStudent(updatedStudent);
    })();
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
  
  const handleLogMemorizationRange = (studentId: string, range: { start: Progress; end: Progress }) => {
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
      memorizationQuality: 9, // Default quality for live tracking
      pagesCompleted: pages,
      versesCompleted: verses,
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

  const handleBack = () => {
    if (sessionStudentId) {
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
    return <LoginPage />;
  }
  
  // Student View-Only Page
  if (currentUser.role === 'student') {
    const allStudentsForTeacher = getStudents(currentUser.teacherId);
    const tajweedRulesForTeacher = getTajweedRules(currentUser.teacherId);

    return (
       <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
          <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 no-print">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
                <button onClick={() => setActiveTab('main')} className="cursor-pointer hover:opacity-80 transition-opacity" aria-label="Return to main">
                    <Logo />
                </button>
                <nav className="flex-1 hidden md:flex justify-center items-center gap-6">
                    <button
                        onClick={() => setActiveTab(t => t === 'aboutUs' ? 'main' : 'aboutUs')}
                        className={`text-sm font-medium transition-colors ${activeTab === 'aboutUs' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                    >{t('header.aboutUs')}</button>
                    <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500 transition-colors">{t('header.contactUs')}</a>
                    <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">{t('header.supportUs')}</a>
                    <button
                        onClick={() => setActiveTab(t => t === 'lettersTrainer' ? 'main' : 'lettersTrainer')}
                        className={`text-sm font-medium transition-colors ${activeTab === 'lettersTrainer' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                    >{t('header.lettersTrainer')}</button>
                    <button
                        onClick={() => setActiveTab(t => t === 'alphabetTrainer' ? 'main' : 'alphabetTrainer')}
                        className={`text-sm font-medium transition-colors ${activeTab === 'alphabetTrainer' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                    >{t('header.alphabetTrainer')}</button>
                </nav>
                <div className="flex items-center gap-4">
                    <span className="font-semibold text-slate-700 dark:text-slate-200 hidden sm:block">{currentUser.student.name}</span>
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
                                    <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Quranic Font</div>
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
                    <button onClick={logout} className="px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-2 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                        <span className="hidden sm:inline">{t('userMenu.logout')}</span>
                    </button>
                </div>
            </div>
          </header>
          <main className="container mx-auto flex-grow p-4 sm:p-6 lg:p-8">
              {activeTab === 'lettersTrainer' ? (
                <LettersTrainerPage />
              ) : activeTab === 'alphabetTrainer' ? (
                <AlphabetTrainerPage />
              ) : activeTab === 'aboutUs' ? (
                <AboutUsPage />
              ) : (
                <StudentViewOnlyPage
                  student={currentUser.student}
                  students={allStudentsForTeacher}
                  quranMetadata={QURAN_METADATA}
                  tajweedRules={tajweedRulesForTeacher}
                />
              )}
          </main>
          <div className="no-print">
            <Footer />
          </div>
      </div>
    );
  }

  // Admin View — isolated panel, no student management
  if (currentUser.role === 'admin') {
    return <AdminPanel currentUser={currentUser} onLogout={logout} />;
  }

  // Teacher View
  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;
  const sessionStudent = students.find((s) => s.id === sessionStudentId) || null;
  const isDetailedView = !!selectedStudentId || !!sessionStudentId;

  return (
    <div className="bg-slate-100 dark:bg-gray-900 min-h-screen font-sans text-slate-800 dark:text-slate-200 transition-colors duration-300 flex flex-col">
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40 no-print">
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
                    onClick={() => { setSelectedStudentId(null); setSessionStudentId(null); setCurrentStudentView('details'); setActiveTab(t => t === 'aboutUs' ? 'main' : 'aboutUs'); }}
                    className={`text-sm font-medium transition-colors ${activeTab === 'aboutUs' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                >{t('header.aboutUs')}</button>
                <a href="#" className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500 transition-colors">{t('header.contactUs')}</a>
                <a href="#" className="text-sm font-medium text-white bg-teal-600 dark:bg-orange-600 hover:bg-teal-700 dark:hover:bg-orange-700 transition-colors px-3 py-1 rounded-full">{t('header.supportUs')}</a>
                <button
                    onClick={() => setActiveTab(t => t === 'lettersTrainer' ? 'main' : 'lettersTrainer')}
                    className={`text-sm font-medium transition-colors ${activeTab === 'lettersTrainer' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                >{t('header.lettersTrainer')}</button>
                <button
                    onClick={() => setActiveTab(t => t === 'alphabetTrainer' ? 'main' : 'alphabetTrainer')}
                    className={`text-sm font-medium transition-colors ${activeTab === 'alphabetTrainer' ? 'text-teal-600 dark:text-orange-500' : 'text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-orange-500'}`}
                >{t('header.alphabetTrainer')}</button>
            </nav>
            <div className="flex items-center gap-2">
                {!isDetailedView && (
                    <button
                        onClick={() => setIsAddStudentModalOpen(true)}
                        className="px-4 py-2.5 bg-teal-600 dark:bg-orange-600 text-white font-semibold rounded-lg shadow-sm hover:bg-teal-700 dark:hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 dark:focus:ring-orange-500 transition-all flex items-center justify-center gap-2"
                        >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        <span className="hidden sm:inline">{t('dashboard.addStudent')}</span>
                    </button>
                )}
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
                                <div className="px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Quranic Font</div>
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
                        <div className="absolute end-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                            <div className="py-1">
                                <button onClick={() => { setIsUserMenuOpen(false); handleExportBackup(); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                                    {t('userMenu.exportBackup')}
                                </button>
                                <button onClick={() => { setIsUserMenuOpen(false); importInputRef.current?.click(); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 9 12 4.5m0 0L16.5 9M12 4.5v12" /></svg>
                                    {t('userMenu.importBackup')}
                                </button>
                                <div className="border-t border-slate-200 dark:border-gray-700 my-1" />
                                <button onClick={() => { setIsUserMenuOpen(false); setIsContactSupportOpen(true); }} className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-gray-700 flex items-center gap-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>
                                    Contact Support
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
      </header>
      <main className="container mx-auto flex-grow p-4 sm:p-6 lg:p-8">
        {activeTab === 'lettersTrainer' ? (
          <LettersTrainerPage />
        ) : activeTab === 'alphabetTrainer' ? (
          <AlphabetTrainerPage />
        ) : activeTab === 'aboutUs' ? (
          <AboutUsPage />
        ) : sessionStudent ? (
          <StudentProgressPage
            student={sessionStudent}
            students={students}
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
            onGoBack={() => setSessionStudentId(null)}
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
            />
          )
        ) : (
          <Dashboard
            students={students}
            onSelectStudent={(id) => { setSelectedStudentId(id); setCurrentStudentView('details'); }}
            quranMetadata={QURAN_METADATA}
          />
        )}
      </main>

      <AddStudentModal
        isOpen={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        onAddStudent={(name, dob) => handleAddStudent({ name, dob, recitationAchievements: [], memorizationAchievements: [], attendance: [], masteredTajweedRules: [], tafsirReviews: [], tafsirMemorizationReviews: [] })}
      />

      <ContactSupportModal
        currentUser={currentUser}
        isOpen={isContactSupportOpen}
        onClose={() => setIsContactSupportOpen(false)}
      />

      <div className="no-print">
        <Footer />
      </div>
    </div>
  );
};

export default App;