// components/AdminPanel.tsx
// ---------------------------------------------------------------------------
// Admin control panel — manage teachers, support tickets, lesson libraries.
// Layout: grouped sidebar + slim top bar + support slide-over.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useRef } from 'react';
import { TeacherUser, Student, SupportTicket, SupportMessage, ArabicStudent } from '../types';
import {
  getAllTeachers, TeacherProfile,
  getStudents,
  deleteTeacherAccount,
  getAllTickets,
  getTicketMessages,
  sendSupportMessage,
  updateTicketStatus,
} from '../services/dataService';
import { getArabicStudents } from '../services/arabicService';
import { supabase } from '../lib/supabase';
import Footer from './Footer';
import TajweedPage from './TajweedPage';
import ArabicLessonPage from './ArabicLessonPage';
import AdminQaedahTab from './AdminQaedahTab';
import AdminLetterAudioTab from './AdminLetterAudioTab';
import AdminWordAudioTab from './AdminWordAudioTab';
import AdminExamsTab from './AdminExamsTab';
import AdminQuranLabTab from './AdminQuranLabTab';
import { useI18n } from '../context/I18nProvider';

// ── helpers ───────────────────────────────────────────────────────────────────

const timeAgo = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    resolved:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  };
  const labels: Record<string, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${styles[status] ?? styles.open}`}>
      {labels[status] ?? status}
    </span>
  );
};

// ── tabs ──────────────────────────────────────────────────────────────────────

type TabId = 'teachers' | 'tajweed' | 'arabic' | 'qaedah' | 'letterAudio' | 'wordAudio' | 'exams' | 'quranLab';

const I = 'w-[18px] h-[18px] flex-shrink-0';

const TAB_ICONS: Record<TabId, React.ReactNode> = {
  teachers: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  tajweed: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  ),
  arabic: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2c0 6-3 9-6 10M6 11c0 3 3 5 9 5M13 21l5-11 5 11M15.5 17h5" />
    </svg>
  ),
  qaedah: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3Z" />
    </svg>
  ),
  exams: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 11 3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  letterAudio: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3ZM19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
    </svg>
  ),
  wordAudio: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3 8 4-16 3 8h5" />
    </svg>
  ),
  quranLab: (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.9} stroke="currentColor" className={I}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v6l-5 9a2 2 0 0 0 1.8 3h12.4a2 2 0 0 0 1.8-3l-5-9V3M8 3h8" />
    </svg>
  ),
};

const TAB_LABEL: Record<TabId, string> = {
  teachers:    'Teachers',
  tajweed:     'Tajweed lessons',
  arabic:      'Arabic lessons',
  qaedah:      'Qaedah',
  exams:       'Exams',
  letterAudio: 'Letter audio',
  wordAudio:   'Word audio',
  quranLab:    'Quran Lab',
};

const TAB_GROUPS: { group: string; items: TabId[] }[] = [
  { group: 'People',  items: ['teachers'] },
  { group: 'Content', items: ['tajweed', 'arabic', 'qaedah', 'exams'] },
  { group: 'Audio',   items: ['letterAudio', 'wordAudio'] },
  { group: 'Labs',    items: ['quranLab'] },
];

// ── types ─────────────────────────────────────────────────────────────────────

interface TeacherStudentData {
  quran: Student[];
  arabic: ArabicStudent[];
  loaded: boolean;
}

interface Props { currentUser: TeacherUser; onLogout: () => void; }

// ── component ─────────────────────────────────────────────────────────────────

const AdminPanel: React.FC<Props> = ({ currentUser, onLogout }) => {
  const { language, setLanguage } = useI18n();

  // Theme
  const [theme, setTheme] = useState<'light' | 'dark' | 'reading'>(() => {
    const s = localStorage.getItem('theme');
    if (s === 'light' || s === 'dark' || s === 'reading') return s as 'light' | 'dark' | 'reading';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.removeAttribute('data-theme');
    if (theme === 'dark') root.classList.add('dark');
    else if (theme === 'reading') root.setAttribute('data-theme', 'reading');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycleTheme = () => setTheme(t => t === 'light' ? 'dark' : t === 'dark' ? 'reading' : 'light');
  const themeIcon = theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '📖';

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>('teachers');
  const [showSupport, setShowSupport] = useState(false);

  // Teachers state
  const [teachers,        setTeachers]        = useState<TeacherProfile[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [teacherStudents, setTeacherStudents] = useState<Record<string, TeacherStudentData>>({});
  const [searchQuery,     setSearchQuery]     = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  // Global student counts
  const [totalQuranStudents,  setTotalQuranStudents]  = useState<number | null>(null);
  const [totalArabicStudents, setTotalArabicStudents] = useState<number | null>(null);

  // Support state
  const [tickets,      setTickets]      = useState<SupportTicket[]>([]);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [messages,     setMessages]     = useState<SupportMessage[]>([]);
  const [replyText,    setReplyText]    = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef     = useRef<any>(null);

  // ── load on mount ─────────────────────────────────────────────────────────
  useEffect(() => {
    getAllTeachers().then(data => {
      setTeachers(data);
      setLoadingTeachers(false);
    });
    getAllTickets().then(setTickets);

    // Total student counts (simple Supabase count queries)
    supabase.from('students').select('id', { count: 'exact', head: true })
      .then(({ count }) => setTotalQuranStudents(count ?? 0));
    supabase.from('arabic_students').select('id', { count: 'exact', head: true })
      .then(({ count }) => setTotalArabicStudents(count ?? 0));
  }, []);

  // ── lazy-load students when teacher row is expanded ───────────────────────
  useEffect(() => {
    if (!expandedId) return;
    const existing = teacherStudents[expandedId];
    if (existing?.loaded) return;
    Promise.all([
      getStudents(expandedId),
      getArabicStudents(expandedId),
    ]).then(([quran, arabic]) => {
      setTeacherStudents(prev => ({ ...prev, [expandedId]: { quran, arabic, loaded: true } }));
    });
  }, [expandedId, teacherStudents]);

  // ── support ticket thread ─────────────────────────────────────────────────
  useEffect(() => {
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    if (!selectedId) return;
    getTicketMessages(selectedId).then(setMessages);
    const ch = supabase.channel(`support-thread-${selectedId}`);
    ch.on('broadcast', { event: 'new_message' }, () => {
      getTicketMessages(selectedId).then(setMessages);
    }).subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── handlers ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await deleteTeacherAccount(id);
    setTeachers(prev => prev.filter(t => t.id !== id));
    if (expandedId === id) setExpandedId(null);
    setConfirmDeleteId(null);
    setDeletingId(null);
  };

  const handleSendReply = async () => {
    if (!selectedId || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    const body = replyText.trim();
    setReplyText('');
    await sendSupportMessage(selectedId, currentUser.id, currentUser.name, 'admin', body);
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: {} });
    const fresh = await getTicketMessages(selectedId);
    setMessages(fresh);
    setTickets(prev => prev.map(t =>
      t.id === selectedId ? { ...t, status: 'in_progress', updatedAt: new Date().toISOString() } : t
    ));
    setSendingReply(false);
  };

  const handleStatusChange = async (status: SupportTicket['status']) => {
    if (!selectedId) return;
    await updateTicketStatus(selectedId, status);
    setTickets(prev => prev.map(t => t.id === selectedId ? { ...t, status } : t));
  };

  // ── derived ───────────────────────────────────────────────────────────────
  const filtered       = teachers.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const selectedTicket = tickets.find(t => t.id === selectedId) ?? null;
  const openCount      = tickets.filter(t => t.status === 'open').length;
  const totalStudents  = (totalQuranStudents ?? 0) + (totalArabicStudents ?? 0);

  // ── shared bits ───────────────────────────────────────────────────────────
  const searchField = (extra: string) => (
    <div className={`relative ${extra}`}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
      </svg>
      <label htmlFor="admin-teacher-search" className="sr-only">Search teachers</label>
      <input
        id="admin-teacher-search"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search teachers…"
        className="w-full h-10 pl-9 pr-3 bg-slate-100 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );

  const navButton = (tab: TabId, onPick?: () => void) => {
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        onClick={() => { setActiveTab(tab); onPick?.(); }}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors ${
          active
            ? 'bg-teal-600 text-white font-bold shadow-sm'
            : 'text-slate-300 hover:bg-white/5 hover:text-white font-semibold'
        }`}
      >
        {TAB_ICONS[tab]}
        <span className="truncate">{TAB_LABEL[tab]}</span>
        {tab === 'teachers' && teachers.length > 0 && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${active ? 'bg-white/25 text-white' : 'bg-white/10 text-slate-300'}`}>
            {teachers.length}
          </span>
        )}
      </button>
    );
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex">

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col bg-[#12202E] px-3 py-5 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 pb-4">
          <span className="w-9 h-9 rounded-xl bg-teal-600 text-white font-extrabold text-sm flex items-center justify-center">LQ</span>
          <span className="leading-tight min-w-0">
            <span className="block text-[15px] font-extrabold text-white truncate">Lisan &amp; Quran</span>
            <span className="block text-[10px] font-bold tracking-[0.14em] text-teal-300">ADMIN</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto space-y-4 pb-3">
          {TAB_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <p className="px-3 pb-1.5 text-[10px] font-extrabold tracking-[0.14em] text-slate-400/80">{group.toUpperCase()}</p>
              <div className="space-y-0.5">{items.map(t => navButton(t))}</div>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-3 border-t border-white/10 flex items-center gap-2.5 px-1">
          <span className="w-8 h-8 rounded-full bg-white/10 text-white text-xs font-extrabold flex items-center justify-center flex-shrink-0">
            {currentUser.name.charAt(0).toUpperCase()}
          </span>
          <span className="leading-tight min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-white truncate">{currentUser.name}</span>
            <span className="block text-[11px] text-slate-400">Admin</span>
          </span>
          <button
            onClick={onLogout}
            title="Log out"
            aria-label="Log out"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ── Main column ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Top bar */}
        <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 sticky top-0 z-40"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="px-4 sm:px-6 lg:px-8 py-2.5 flex items-center gap-3">
            <span className="lg:hidden w-9 h-9 rounded-xl bg-teal-600 text-white font-extrabold text-sm flex items-center justify-center flex-shrink-0">LQ</span>
            <div className="min-w-0 leading-tight">
              <h1 className="font-extrabold text-slate-800 dark:text-slate-100 text-lg sm:text-xl truncate">{TAB_LABEL[activeTab]}</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                {teachers.length} {teachers.length === 1 ? 'account' : 'accounts'}
                {totalStudents > 0 && ` · ${totalStudents} students`}
              </p>
            </div>

            {activeTab === 'teachers' && searchField('hidden lg:block w-72 ml-4')}

            <div className="flex-1" />

            {/* Support inbox button — with open-ticket badge */}
            <button
              onClick={() => setShowSupport(v => !v)}
              className={`relative flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm font-bold border transition-colors ${
                showSupport
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
              </svg>
              <span className="hidden sm:inline">Support</span>
              {openCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-[11px] font-extrabold rounded-full flex items-center justify-center leading-none">
                  {openCount}
                </span>
              )}
            </button>

            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              title={`Theme: ${theme}`}
              aria-label={`Theme: ${theme}`}
              className="w-10 h-10 rounded-xl border border-slate-200 dark:border-gray-700 text-base text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
            >
              {themeIcon}
            </button>

            {/* Logout — sidebar carries it on large screens */}
            <button
              onClick={onLogout}
              aria-label="Log out"
              title="Log out"
              className="lg:hidden w-10 h-10 rounded-xl border border-slate-200 dark:border-gray-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-gray-700 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
            </button>
          </div>

          {/* Mobile / tablet tab strip */}
          <div className="lg:hidden px-2 pb-2 flex gap-1 overflow-x-auto">
            {TAB_GROUPS.flatMap(g => g.items).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={activeTab === tab ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                  activeTab === tab
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'
                }`}
              >
                {TAB_ICONS[tab]}
                {TAB_LABEL[tab]}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-5 space-y-5 flex flex-col">

          {/* ── Teachers Tab ─────────────────────────────────────────────── */}
          {activeTab === 'teachers' && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
                <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-3 py-3 sm:px-5 sm:py-4">
                  <p className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.08em] text-slate-500 dark:text-slate-400 uppercase">Teachers</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">{teachers.length}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-3 py-3 sm:px-5 sm:py-4">
                  <p className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.08em] text-slate-500 dark:text-slate-400 uppercase">Quran students</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-teal-600 dark:text-teal-400 mt-1">{totalQuranStudents ?? '…'}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl px-3 py-3 sm:px-5 sm:py-4">
                  <p className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.08em] text-slate-500 dark:text-slate-400 uppercase">Arabic students</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">{totalArabicStudents ?? '…'}</p>
                </div>
              </div>

              {searchField('lg:hidden')}

              {/* Teacher table */}
              <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-2xl overflow-hidden flex-1">
                <div className="hidden md:grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_96px] gap-3 px-5 py-3 bg-slate-50 dark:bg-gray-900/40 border-b border-slate-200 dark:border-gray-700 text-[11px] font-extrabold tracking-[0.08em] text-slate-500 dark:text-slate-400 uppercase">
                  <span>Teacher</span><span>Students</span><span>Joined</span><span />
                </div>

                {loadingTeachers ? (
                  <div className="text-center py-16 text-slate-400">Loading teachers…</div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">No teachers found.</div>
                ) : filtered.map(teacher => {
                  const isMe       = teacher.id === currentUser.id;
                  const isExpanded = expandedId === teacher.id;
                  const data       = teacherStudents[teacher.id];
                  const confirming = confirmDeleteId === teacher.id;

                  return (
                    <div
                      key={teacher.id}
                      className={`border-b border-slate-100 dark:border-gray-700/70 last:border-b-0 ${
                        confirming ? 'bg-red-50 dark:bg-red-900/10' : isExpanded ? 'bg-teal-50/40 dark:bg-teal-900/10' : ''
                      }`}
                    >
                      <div className="md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,1fr)_96px] md:items-center gap-3 px-4 sm:px-5 py-3.5 flex flex-wrap">
                        {/* Teacher — clickable to expand */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : teacher.id)}
                          className="flex items-center gap-3 min-w-0 text-left flex-1"
                          title="Click to see students"
                        >
                          <span className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                            isExpanded
                              ? 'bg-teal-50 dark:bg-teal-900/30 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300'
                              : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 text-slate-500'
                          }`}>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </span>
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-white text-xs flex-shrink-0 ${isMe ? 'bg-purple-500' : 'bg-teal-600'}`}>
                            {teacher.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{teacher.name}</span>
                              {teacher.role === 'admin' && (
                                <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold rounded">Admin</span>
                              )}
                              {isMe && <span className="text-xs text-slate-400">(you)</span>}
                            </span>
                            <span className="block md:hidden text-xs text-slate-400 mt-0.5">
                              Joined {new Date(teacher.created_at).toLocaleDateString()}
                            </span>
                          </span>
                        </button>

                        {/* Students */}
                        <div className="hidden md:flex gap-1.5 flex-wrap">
                          {data?.loaded ? (
                            <>
                              {data.quran.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-xs font-bold">{data.quran.length} Quran</span>
                              )}
                              {data.arabic.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">{data.arabic.length} Arabic</span>
                              )}
                              {data.quran.length + data.arabic.length === 0 && (
                                <span className="text-xs text-slate-400">No students</span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">click to view</span>
                          )}
                        </div>

                        {/* Joined */}
                        <span className="hidden md:block text-sm text-slate-500 dark:text-slate-400">
                          {new Date(teacher.created_at).toLocaleDateString()}
                        </span>

                        {/* Delete */}
                        <div className="flex md:justify-end items-center gap-2 flex-shrink-0">
                          {!isMe && (
                            confirming ? (
                              <>
                                <span className="text-xs font-bold text-red-700 dark:text-red-300 md:hidden">Delete?</span>
                                <button onClick={() => handleDelete(teacher.id)} disabled={!!deletingId} className="px-3 h-8 bg-red-600 text-white text-xs font-extrabold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                                  {deletingId === teacher.id ? '…' : 'Delete'}
                                </button>
                                <button onClick={() => setConfirmDeleteId(null)} className="px-3 h-8 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-600 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors">
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(teacher.id)}
                                title="Delete teacher account"
                                aria-label={`Delete ${teacher.name}'s account`}
                                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            )
                          )}
                        </div>

                        {confirming && (
                          <p className="hidden md:block md:col-span-4 ps-[76px] text-xs font-bold text-red-700 dark:text-red-300 -mt-1">
                            Delete this account and all of its students?
                          </p>
                        )}
                      </div>

                      {/* Expanded: both Quran + Arabic students */}
                      {isExpanded && (
                        <div className="px-4 sm:px-5 pb-4 md:pl-[76px]">
                          {!data?.loaded ? (
                            <p className="text-sm text-slate-400 py-2">Loading students…</p>
                          ) : (data.quran.length + data.arabic.length) === 0 ? (
                            <p className="text-sm text-slate-400 py-2">No students yet.</p>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              {/* Quran students */}
                              {data.quran.length > 0 && (
                                <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3.5 py-3">
                                  <p className="text-[11px] font-extrabold text-teal-600 dark:text-teal-400 uppercase tracking-[0.08em] mb-2">
                                    Quran students · {data.quran.length}
                                  </p>
                                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                    {data.quran.map(s => {
                                      const dob = s.dob ? new Date(s.dob) : null;
                                      const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
                                      const pages = s.recitationAchievements.reduce((sum, a) => sum + a.pagesCompleted, 0);
                                      return (
                                        <div key={s.id} className="flex items-center gap-3 text-sm px-3 py-2 bg-slate-50 dark:bg-gray-900/40 rounded-lg">
                                          <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                                            {s.name.charAt(0).toUpperCase()}
                                          </div>
                                          <span className="flex-1 font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                                          {age !== null && <span className="text-xs text-slate-400 flex-shrink-0">{age}y</span>}
                                          <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:block">{pages} pages</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {/* Arabic students */}
                              {data.arabic.length > 0 && (
                                <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl px-3.5 py-3">
                                  <p className="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-[0.08em] mb-2">
                                    Arabic students · {data.arabic.length}
                                  </p>
                                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                                    {data.arabic.map(s => (
                                      <div key={s.id} className="flex items-center gap-3 text-sm px-3 py-2 bg-slate-50 dark:bg-gray-900/40 rounded-lg">
                                        <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                                          {s.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="flex-1 font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                                        <span className="text-xs text-slate-400 flex-shrink-0">{s.arabicLevel}</span>
                                        <div className="hidden sm:flex gap-1 flex-shrink-0">
                                          {s.arabicDialects.slice(0, 2).map(d => (
                                            <span key={d} className="text-[10px] px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-full">{d}</span>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Tajweed Lessons Tab ───────────────────────────────────────── */}
          {activeTab === 'tajweed' && (
            <div className="flex-1">
              <TajweedPage students={[]} />
            </div>
          )}

          {/* ── Arabic Lessons Tab ────────────────────────────────────────── */}
          {activeTab === 'arabic' && (
            <div className="flex-1">
              <ArabicLessonPage students={[]} teacherId={currentUser.id} />
            </div>
          )}

          {/* ── Qaedah Tab ───────────────────────────────────────────────── */}
          {activeTab === 'qaedah' && (
            <div className="flex-1">
              <AdminQaedahTab />
            </div>
          )}

          {/* ── Letter Audio Tab ─────────────────────────────────────────── */}
          {activeTab === 'letterAudio' && (
            <div className="flex-1">
              <AdminLetterAudioTab />
            </div>
          )}

          {/* ── Word Audio Tab ───────────────────────────────────────────── */}
          {activeTab === 'wordAudio' && (
            <div className="flex-1">
              <AdminWordAudioTab />
            </div>
          )}

          {/* ── Exams Tab ────────────────────────────────────────────────── */}
          {activeTab === 'exams' && (
            <div className="flex-1">
              <AdminExamsTab adminId={currentUser.id} />
            </div>
          )}

          {/* ── Quran Lab Tab (vowel positions + tutor recitation) ───────── */}
          {activeTab === 'quranLab' && (
            <div className="flex-1">
              <AdminQuranLabTab />
            </div>
          )}
        </main>

        <Footer />
      </div>

      {/* ── Support slide-over ────────────────────────────────────────────── */}
      {showSupport && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/40 z-40"
            onClick={() => setShowSupport(false)}
            aria-hidden="true"
          />
          <aside className="fixed top-0 right-0 z-50 h-screen w-full sm:w-[520px] bg-white dark:bg-gray-800 border-l border-slate-200 dark:border-gray-700 shadow-2xl flex flex-col">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="font-extrabold text-slate-800 dark:text-slate-100">Support</h2>
              {openCount > 0 ? (
                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs font-extrabold rounded-full">{openCount} open</span>
              ) : tickets.length > 0 ? (
                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-extrabold rounded-full">All resolved</span>
              ) : null}
              <span className="text-xs text-slate-400">{tickets.length} total</span>
              <div className="flex-1" />
              <button
                onClick={() => setShowSupport(false)}
                aria-label="Close support"
                className="w-9 h-9 rounded-lg border border-slate-200 dark:border-gray-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Ticket list */}
            <div className="flex-shrink-0 max-h-[38%] overflow-y-auto px-3 py-3 space-y-1.5 border-b border-slate-200 dark:border-gray-700">
              {tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-slate-400 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 mb-2 text-slate-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                  </svg>
                  <p className="text-sm">No tickets yet.</p>
                </div>
              ) : tickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedId(ticket.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors ${
                    selectedId === ticket.id
                      ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-500'
                      : 'bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate leading-tight">{ticket.subject}</p>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="truncate">{ticket.teacherName}</span>
                    <span className="flex-shrink-0">· {timeAgo(ticket.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Thread */}
            {!selectedTicket ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 text-slate-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                </svg>
                <p className="text-sm">Select a ticket to view the conversation</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-gray-700 flex-shrink-0">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{selectedTicket.subject}</p>
                    <p className="text-xs text-slate-400">{selectedTicket.teacherName} · {new Date(selectedTicket.createdAt).toLocaleDateString()}</p>
                  </div>
                  <label className="sr-only" htmlFor="admin-ticket-status">Ticket status</label>
                  <select
                    id="admin-ticket-status"
                    value={selectedTicket.status}
                    onChange={e => handleStatusChange(e.target.value as SupportTicket['status'])}
                    className="flex-shrink-0 px-3 py-1.5 bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-4">Loading messages…</p>}
                  {messages.map(msg => {
                    const isAdmin = msg.senderRole === 'admin';
                    return (
                      <div key={msg.id} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${isAdmin ? 'bg-purple-500' : 'bg-teal-500'}`}>
                          {msg.senderName.charAt(0).toUpperCase()}
                        </div>
                        <div className={`max-w-[72%] flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                          <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${isAdmin ? 'bg-teal-600 text-white rounded-tr-sm' : 'bg-slate-100 dark:bg-gray-700 text-slate-800 dark:text-slate-100 rounded-tl-sm'}`}>
                            {msg.body}
                          </div>
                          <p className="text-xs text-slate-400 mt-1 px-1">{timeAgo(msg.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                {selectedTicket.status !== 'resolved' ? (
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-700 flex gap-2 flex-shrink-0">
                    <label className="sr-only" htmlFor="admin-reply">Reply</label>
                    <textarea
                      id="admin-reply"
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                      placeholder="Type your reply… (Enter to send)"
                      rows={2}
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sendingReply}
                      aria-label="Send reply"
                      className="w-11 h-11 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 transition-colors flex-shrink-0 self-end flex items-center justify-center"
                    >
                      {sendingReply
                        ? <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                      }
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-700 text-center text-xs text-slate-400 flex-shrink-0">
                    Ticket is resolved — change status to reply again.
                  </div>
                )}
              </>
            )}
          </aside>
        </>
      )}
    </div>
  );
};

export default AdminPanel;
