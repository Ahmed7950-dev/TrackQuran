import React, { useState, useEffect, useRef } from 'react';
import { TeacherUser, SupportTicket, SupportMessage } from '../types';
import {
  createSupportTicket,
  getMyTickets,
  getTicketMessages,
  sendSupportMessage,
} from '../services/dataService';
import { supabase } from '../lib/supabase';

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
    open:        'bg-blue-100 text-blue-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    resolved:    'bg-green-100 text-green-700',
  };
  const labels: Record<string, string> = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${styles[status] ?? styles.open}`}>
      {labels[status] ?? status}
    </span>
  );
};

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  currentUser: TeacherUser;
  isOpen: boolean;
  onClose: () => void;
}

type View = 'list' | 'new' | 'thread';

const ContactSupportModal: React.FC<Props> = ({ currentUser, isOpen, onClose }) => {
  const [view,           setView]           = useState<View>('list');
  const [tickets,        setTickets]        = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages,       setMessages]       = useState<SupportMessage[]>([]);
  const [newSubject,     setNewSubject]     = useState('');
  const [newMessage,     setNewMessage]     = useState('');
  const [replyText,      setReplyText]      = useState('');
  const [creating,       setCreating]       = useState(false);
  const [sendingReply,   setSendingReply]   = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef     = useRef<any>(null);

  // Load tickets whenever modal opens
  useEffect(() => {
    if (!isOpen) return;
    setView('list');
    setSelectedTicket(null);
    getMyTickets(currentUser.id).then(setTickets);
  }, [isOpen, currentUser.id]);

  // Subscribe to thread when a ticket is selected
  useEffect(() => {
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    if (!selectedTicket) return;

    getTicketMessages(selectedTicket.id).then(setMessages);

    const ch = supabase.channel(`support-thread-${selectedTicket.id}`);
    ch.on('broadcast', { event: 'new_message' }, () => {
      getTicketMessages(selectedTicket.id).then(setMessages);
    }).subscribe();
    channelRef.current = ch;

    return () => { ch.unsubscribe(); channelRef.current = null; };
  }, [selectedTicket]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── handlers ─────────────────────────────────────────────

  const handleCreate = async () => {
    if (!newSubject.trim() || !newMessage.trim() || creating) return;
    setCreating(true);
    const ticket = await createSupportTicket(currentUser.id, currentUser.name, newSubject.trim(), newMessage.trim());
    setCreating(false);
    if (ticket) {
      setTickets(prev => [ticket, ...prev]);
      setSelectedTicket(ticket);
      setNewSubject('');
      setNewMessage('');
      setView('thread');
    }
  };

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    const body = replyText.trim();
    setReplyText('');
    await sendSupportMessage(selectedTicket.id, currentUser.id, currentUser.name, 'teacher', body);
    // Notify admin in real-time
    channelRef.current?.send({ type: 'broadcast', event: 'new_message', payload: {} });
    const fresh = await getTicketMessages(selectedTicket.id);
    setMessages(fresh);
    setSendingReply(false);
  };

  const openThread = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setMessages([]);
    setView('thread');
  };

  const goBack = () => {
    setView('list');
    setSelectedTicket(null);
    setMessages([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-gray-800 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '90vh', minHeight: '400px' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 dark:border-gray-700 flex-shrink-0">
          {(view === 'thread' || view === 'new') && (
            <button
              onClick={goBack}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 -ml-1 transition-colors"
              aria-label="Back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate">
              {view === 'list'   ? 'Contact Support' :
               view === 'new'   ? 'New Support Ticket' :
               selectedTicket?.subject ?? 'Conversation'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 flex-shrink-0 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── List view ─────────────────────────────────────── */}
        {view === 'list' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* New ticket CTA */}
            <div className="px-5 pt-4 pb-3 flex-shrink-0">
              <button
                onClick={() => setView('new')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-semibold transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Support Ticket
              </button>
            </div>

            {tickets.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-14 h-14 mb-3 text-slate-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
                <p className="font-medium">No tickets yet</p>
                <p className="text-sm mt-1">Create a ticket and the support team will get back to you.</p>
              </div>
            ) : (
              <div className="flex-1 divide-y divide-slate-100 dark:divide-gray-700">
                {tickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => openThread(ticket)}
                    className="w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-medium text-sm text-slate-800 dark:text-slate-100 leading-tight">{ticket.subject}</p>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="text-xs text-slate-400">{timeAgo(ticket.updatedAt)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── New ticket form ────────────────────────────────── */}
        {view === 'new' && (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Subject <span className="text-red-400">*</span>
              </label>
              <input
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                placeholder="Describe your issue in detail — the more context you give, the faster we can help."
                rows={6}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!newSubject.trim() || !newMessage.trim() || creating}
              className="w-full py-3 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Sending…' : 'Send to Support Team'}
            </button>
          </div>
        )}

        {/* ── Thread view ────────────────────────────────────── */}
        {view === 'thread' && selectedTicket && (
          <>
            {/* Status bar */}
            <div className="flex items-center justify-between px-5 py-2 bg-slate-50 dark:bg-gray-900/40 border-b border-slate-100 dark:border-gray-700 flex-shrink-0">
              <StatusBadge status={selectedTicket.status} />
              <p className="text-xs text-slate-400">{new Date(selectedTicket.createdAt).toLocaleDateString()}</p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
              )}
              {messages.map(msg => {
                const isMe = msg.senderRole === 'teacher';
                return (
                  <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${isMe ? 'bg-teal-500' : 'bg-purple-500'}`}>
                      {isMe ? msg.senderName.charAt(0).toUpperCase() : 'A'}
                    </div>
                    <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {!isMe && (
                        <p className="text-xs text-slate-400 mb-1 px-1">Support Team</p>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                        isMe
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

            {/* Reply input */}
            {selectedTicket.status !== 'resolved' ? (
              <div className="px-4 py-3 border-t border-slate-100 dark:border-gray-700 flex gap-2 flex-shrink-0">
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                  placeholder="Type your message… (Enter to send)"
                  rows={2}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-gray-700 border border-slate-200 dark:border-gray-600 rounded-xl text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sendingReply}
                  className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0 self-end"
                  aria-label="Send message"
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
                This ticket has been resolved. Open a new ticket if you need more help.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ContactSupportModal;
