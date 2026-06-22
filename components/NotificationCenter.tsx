/**
 * NotificationCenter — bell icon with unread badge, dropdown panel with
 * booking notifications. Subscribes to Supabase Realtime for live updates.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  BookingNotification,
  NotificationType,
  getTutorNotifications,
  getStudentNotifications,
  markNotificationRead,
  markAllTutorNotificationsRead,
  markAllStudentNotificationsRead,
} from '../services/notificationService';

// ── Props ─────────────────────────────────────────────────────────────────────

interface NotificationCenterProps {
  teacherId:   string;
  recipient:   'tutor' | 'student';
  /** Required when recipient === 'student' */
  studentId?:  string;
  /** Called when a deep-linkable notification is clicked */
  onNavigate?: (studentId: string, lessonId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function iconForType(type: NotificationType): { emoji: string; color: string } {
  switch (type) {
    case 'booking_requested':             return { emoji: '📅', color: 'text-amber-500' };
    case 'booking_confirmed':             return { emoji: '✅', color: 'text-green-500' };
    case 'booking_declined':              return { emoji: '❌', color: 'text-red-500' };
    case 'booking_cancelled_by_student':
    case 'booking_cancelled_by_tutor':   return { emoji: '🚫', color: 'text-slate-500' };
    case 'exam_unlocked':                return { emoji: '🔓', color: 'text-green-500' };
    case 'exam_submitted':               return { emoji: '📝', color: 'text-amber-500' };
    case 'exam_started':                 return { emoji: '🎯', color: 'text-sky-500' };
    case 'exam_result_published':        return { emoji: '🏆', color: 'text-amber-500' };
    case 'exam_retake_allowed':          return { emoji: '🔄', color: 'text-indigo-500' };
    case 'homework_submitted':           return { emoji: '📋', color: 'text-teal-500' };
    case 'subscription_renewal_reminder': return { emoji: '💳', color: 'text-violet-500' };
    default:                             return { emoji: '🔔', color: 'text-slate-500' };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  teacherId,
  recipient,
  studentId,
  onNavigate,
}) => {
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState<BookingNotification[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    if (!teacherId) return;
    if (recipient === 'tutor') {
      const data = await getTutorNotifications(teacherId);
      setNotifications(data);
    } else {
      if (!studentId) return;
      const data = await getStudentNotifications(teacherId, studentId);
      setNotifications(data);
    }
  }, [teacherId, recipient, studentId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!teacherId) return;
    const channel = supabase
      .channel(`booking_notifications_${teacherId}_${recipient}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'booking_notifications',
          filter: `teacher_id=eq.${teacherId}`,
        },
        () => { fetchNotifications(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [teacherId, recipient, fetchNotifications]);

  // ── Click outside to close ─────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleMarkAllRead = async () => {
    if (recipient === 'tutor') {
      await markAllTutorNotificationsRead(teacherId);
    } else if (studentId) {
      await markAllStudentNotificationsRead(teacherId, studentId);
    }
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handleClickNotification = async (n: BookingNotification) => {
    if (!n.isRead) {
      await markNotificationRead(n.id);
      setNotifications(prev =>
        prev.map(x => x.id === n.id ? { ...x, isRead: true } : x),
      );
    }
    if (n.type === 'homework_submitted' && n.metadata?.lessonId && onNavigate) {
      setOpen(false);
      onNavigate(n.studentId, n.metadata.lessonId);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        className="relative p-2.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute end-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ring-1 ring-black/10 dark:ring-white/10 z-50 overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-gray-700">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-200 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto max-h-[420px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <span className="text-3xl mb-2">🔔</span>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  No notifications yet
                </p>
              </div>
            ) : (
              notifications.map(n => {
                const { emoji, color } = iconForType(n.type);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-slate-100 dark:border-gray-700/50 last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-gray-700/50 ${
                      !n.isRead
                        ? 'bg-amber-50 dark:bg-amber-900/20'
                        : ''
                    }`}
                  >
                    {/* Icon */}
                    <span className={`text-lg flex-shrink-0 mt-0.5 ${color}`}>
                      {emoji}
                    </span>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-bold leading-tight truncate ${!n.isRead ? 'text-slate-900 dark:text-slate-50' : 'text-slate-700 dark:text-slate-200'}`}>
                          {n.title}
                        </p>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {n.body}
                      </p>
                    </div>
                    {/* Unread dot */}
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
