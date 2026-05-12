import React, { useState, useEffect, useRef } from 'react';
import { TeacherUser, Student, SupportTicket, SupportMessage } from '../types';
import {
  getAllTeachers, TeacherProfile,
  getStudents,
  deleteTeacherAccount,
  getAllTickets,
  getTicketMessages,
  sendSupportMessage,
  updateTicketStatus,
} from '../services/dataService';
import { supabase } from '../lib/supabase';
import Logo from './Logo';
import TajweedPage from './TajweedPage';
import ArabicLessonPage from './ArabicLessonPage';

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

// ── component ─────────────────────────────────────────────────────────────────

interface Props { currentUser: TeacherUser; onLogout: () => void; }

const AdminPanel: React.FC<Props> = ({ currentUser, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'teachers' | 'support' | 'tajweed' | 'arabic'>('teachers');

  // ── Teachers state ────────────────────────────────────────
  const [teachers,        setTeachers]        = useState<TeacherProfile[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [teacherStudents, setTeacherStudents] = useState<Record<string, Student[]>>({});
  const [searchQuery,     setSearchQuery]     = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId,      setDeletingId]      = useState<string | null>(null);

  // ── Support state ─────────────────────────────────────────
  const [tickets,         setTickets]         = useState<SupportTicket[]>([]);
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [messages,        setMessages]        = useState<SupportMessage[]>([]);
  const [replyText,       setReplyText]       = useState('');
  const [sendingReply,    setSendingReply]    = useState(false);
  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const channelRef      = useRef<any>(null);

  // ── load on mount ─────────────────────────────────────────
  useEffect(() => {
    getAllTeachers().then(data => { setTeachers(data); setLoadingTeachers(false); });
    getAllTickets().then(setTickets);
  }, []);

  // ── lazy-load students when teacher row is expanded ───────
  useEffect(() => {
    if (!expandedId || teacherStudents[expandedId] !== undefined) return;
    getStudents(expandedId).then(s =>
      setTeacherStudents(prev => ({ ...prev, [expandedId]: s }))
    );
  }, [expandedId, teacherStudents]);

  // ── subscribe to message thread when a ticket is selected ─
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

  // ── auto-scroll messages ──────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── handlers ─────────────────────────────────────────────────────────────────

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

  // ── derived ───────────────────────────────────────────────
  const filtered      = teachers.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedTicket = tickets.find(t => t.id === selectedId) ?? null;
  const openCount      = tickets.filter(t => t.status === 'open').length;

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex flex-col">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3">
          <Logo />
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <h1 className="font-bold text-slate-800 dark:text-slate-100 hidden sm:block">Admin Control Panel</h1>
            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-full">
              Admin
            </span>
          </div>
          <span className="text-sm text-slate-500 dark:text-slate-400 hidden md:block">{currentUser.name}</span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 space-y-6 flex flex-col">

        {/* ── Stats ──────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Teachers', value: teachers.length, color: 'text-slate-800 dark:text-slate-100' },
            { label: 'Support Tickets', value: tickets.length, color: 'text-slate-800 dark:text-slate-100' },
            { label: 'Open Tickets', value: openCount, color: openCount > 0 ? 'text-orange-500' : 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm text-center">
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* ── Tabs ───────────────────────────────────────────── */}
        <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm w-fit flex-wrap">
          {(['teachers', 'support', 'tajweed', 'arabic'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? tab === 'arabic'
                    ? 'bg-amber-500 text-white shadow'
                    : 'bg-teal-600 text-white shadow'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-gray-700'
              }`}
            >
              {tab === 'teachers' ? 'Teachers'
                : tab === 'support' ? 'Support Inbox'
                : tab === 'tajweed' ? 'Tajweed Lessons'
                : 'Arabic Lessons'}
              {tab === 'support' && openCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
                  {openCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Teachers Tab ───────────────────────────────────── */}
        {activeTab === 'teachers' && (
          <div className="space-y-4 flex-1">
            {/* Search */}
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search teachers…"
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm"
              />
            </div>

            {loadingTeachers ? (
              <div className="text-center py-16 text-slate-400">Loading teachers…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-slate-400">No teachers found.</div>
            ) : (
              <div className="space-y-3">
                {filtered.map(teacher => {
                  const isMe       = teacher.id === currentUser.id;
                  const isExpanded = expandedId === teacher.id;
                  const studs      = teacherStudents[teacher.id];

                  return (
                    <div key={teacher.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                      {/* Row */}
                      <div className="flex items-center gap-4 px-5 py-4">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-sm ${isMe ? 'bg-purple-500' : 'bg-teal-500'}`}>
                          {teacher.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{teacher.name}</p>
                            {teacher.role === 'admin' && (
                              <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-bold rounded">Admin</span>
                            )}
                            {isMe && <span className="text-xs text-slate-400">(you)</span>}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Joined {new Date(teacher.created_at).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Expand students */}
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : teacher.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                            </svg>
                            <span className="hidden sm:inline">Students</span>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                              className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                            </svg>
                          </button>

                          {/* Delete (not for self) */}
                          {!isMe && (
                            confirmDeleteId === teacher.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Delete?</span>
                                <button
                                  onClick={() => handleDelete(teacher.id)}
                                  disabled={!!deletingId}
                                  className="px-2.5 py-1 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                                >
                                  {deletingId === teacher.id ? '…' : 'Yes'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2.5 py-1 bg-slate-200 dark:bg-gray-700 text-slate-600 dark:text-slate-300 text-xs rounded-lg hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(teacher.id)}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title="Delete teacher account"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            )
                          )}
                        </div>
                      </div>

                      {/* Expanded student list */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/40 px-5 py-4">
                          {!studs ? (
                            <p className="text-sm text-slate-400 text-center py-2">Loading…</p>
                          ) : studs.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-2">No students yet.</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                                {studs.length} Student{studs.length !== 1 ? 's' : ''}
                              </p>
                              {studs.map(s => {
                                const age   = Math.floor((Date.now() - new Date(s.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                                const pages = s.recitationAchievements.reduce((sum, a) => sum + a.pagesCompleted, 0);
                                return (
                                  <div key={s.id} className="flex items-center gap-3 text-sm px-3 py-2 bg-white dark:bg-gray-800 rounded-lg">
                                    <div className="w-7 h-7 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center font-semibold text-xs flex-shrink-0">
                                      {s.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="flex-1 font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                                    <span className="text-xs text-slate-400 flex-shrink-0">{age}y old</span>
                                    <span className="text-xs text-slate-400 flex-shrink-0 hidden sm:block">{pages} pages</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Support Inbox Tab ───────────────────────────────── */}
        {activeTab === 'support' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: '500px', height: 'calc(100vh - 300px)' }}>

            {/* Ticket list */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden flex flex-col lg:max-h-full">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-700 flex-shrink-0">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                  All Tickets ({tickets.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-gray-700">
                {tickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-slate-400 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-10 h-10 mb-2 text-slate-300">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                    </svg>
                    <p className="text-sm">No tickets yet.</p>
                  </div>
                ) : (
                  tickets.map(ticket => (
                    <button
                      key={ticket.id}
                      onClick={() => setSelectedId(ticket.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors ${
                        selectedId === ticket.id
                          ? 'bg-teal-50 dark:bg-teal-900/20 border-l-[3px] border-teal-500'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-medium text-sm text-slate-800 dark:text-slate-100 truncate leading-tight">{ticket.subject}</p>
                        <StatusBadge status={ticket.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="truncate">{ticket.teacherName}</span>
                        <span className="flex-shrink-0">· {timeAgo(ticket.updatedAt)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Thread view */}
            <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
              {!selectedTicket ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-12 h-12 text-slate-300">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  <p className="text-sm">Select a ticket to view the conversation</p>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-100 dark:border-gray-700 flex-shrink-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{selectedTicket.subject}</p>
                      <p className="text-xs text-slate-400">
                        {selectedTicket.teacherName} · {new Date(selectedTicket.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <select
                      value={selectedTicket.status}
                      onChange={e => handleStatusChange(e.target.value as SupportTicket['status'])}
                      className="flex-shrink-0 px-3 py-1.5 bg-white dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {messages.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-4">Loading messages…</p>
                    )}
                    {messages.map(msg => {
                      const isAdmin = msg.senderRole === 'admin';
                      return (
                        <div key={msg.id} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${isAdmin ? 'bg-purple-500' : 'bg-teal-500'}`}>
                            {msg.senderName.charAt(0).toUpperCase()}
                          </div>
                          <div className={`max-w-[72%] flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                              isAdmin
                                ? 'bg-teal-600 text-white rounded-tr-sm'
                                : 'bg-slate-100 dark:bg-gray-700 text-slate-800 dark:text-slate-100 rounded-tl-sm'
                            }`}>
                              {msg.body}
                            </div>
                            <p className="text-xs text-slate-400 mt-1 px-1">{timeAgo(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply box */}
                  {selectedTicket.status !== 'resolved' ? (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-700 flex gap-2 flex-shrink-0">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                        placeholder="Type your reply… (Enter to send, Shift+Enter for new line)"
                        rows={2}
                        className="flex-1 px-3 py-2 bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sendingReply}
                        className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 self-end"
                        aria-label="Send reply"
                      >
                        {sendingReply ? (
                          <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                          </svg>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-700 text-center text-xs text-slate-400 flex-shrink-0">
                      Ticket is resolved — change status to reply again.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {/* ── Tajweed Lessons Tab ────────────────────────────── */}
        {activeTab === 'tajweed' && (
          <div className="flex-1">
            <TajweedPage students={[]} />
          </div>
        )}

        {/* ── Arabic Lessons Tab ─────────────────────────────── */}
        {activeTab === 'arabic' && (
          <div className="flex-1">
            <ArabicLessonPage students={[]} teacherId={currentUser.id} />
          </div>
        )}

      </main>
    </div>
  );
};

export default AdminPanel;
