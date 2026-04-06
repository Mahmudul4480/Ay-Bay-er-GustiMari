/**
 * NotificationBar
 * ─────────────────────────────────────────────────────────────────────────────
 * Facebook-style in-app notification bell for authenticated users.
 *
 * • Real-time Firestore listener on `users/{userId}/inAppNotifications`
 * • Prominent gradient bell button with ping-glow when unread
 * • Red badge with unread count
 * • Animated dropdown: header, per-item left-accent, sticky "Mark all read" CTA
 * • Clicking a notification opens a glassmorphism detail modal; "Read more" navigates
 */

import React, { memo, useEffect, useRef, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, CheckCheck, Sparkles, X } from 'lucide-react';
import { db } from '../firebaseConfig';
import { cn } from '../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InAppNotification {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: Timestamp | null;
  read: boolean;
  blogId: string;
}

interface NotificationBarProps {
  userId: string;
}

// ── Helper: relative time string ──────────────────────────────────────────────

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Full date + time for the detail modal. */
function formatDateTimeDetailed(ts: Timestamp | null): string {
  if (!ts?.toDate) return '';
  try {
    return ts.toDate().toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

// ── Helper: navigate via hash-router ─────────────────────────────────────────

function navigateTo(url: string) {
  if (!url) return;
  if (url.startsWith('http')) {
    window.location.href = url;
  } else {
    window.location.hash = url.startsWith('#') ? url.slice(1) : url;
  }
}

// ── Helper: notification avatar colour from title char ────────────────────────

const AVATAR_GRADIENTS = [
  'from-pink-500 to-rose-500',
  'from-violet-500 to-purple-600',
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-500',
  'from-cyan-500 to-sky-600',
];

function avatarGradient(title: string): string {
  // charCodeAt(0) returns NaN for empty strings; `||` coerces NaN → 0, `??` does not
  const code = (title.charCodeAt(0) || 0) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[code] ?? AVATAR_GRADIENTS[0];
}

// ── Component ─────────────────────────────────────────────────────────────────

const NotificationBarBase: React.FC<NotificationBarProps> = ({ userId }) => {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<InAppNotification | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Real-time listener ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'users', userId, 'inAppNotifications'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: InAppNotification[] = snapshot.docs.map((d) => ({
          id: d.id,
          title: d.data().title ?? '',
          body: d.data().body ?? '',
          url: d.data().url ?? '',
          createdAt: d.data().createdAt ?? null,
          read: d.data().read ?? false,
          blogId: d.data().blogId ?? '',
        }));
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.read).length);
        setLoading(false);
      },
      (err) => {
        console.error('[NotificationBar] Firestore snapshot error:', err);
        setLoading(false);
      }
    );

    return unsub;
  }, [userId]);

  // ── Lock scroll + Escape when detail modal is open ────────────────────────
  useEffect(() => {
    if (!selectedNotification) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedNotification(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedNotification]);

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const markNotificationRead = async (notif: InAppNotification) => {
    if (notif.read) return;
    try {
      await updateDoc(doc(db, 'users', userId, 'inAppNotifications', notif.id), { read: true });
    } catch (err) {
      console.error('[NotificationBar] Failed to mark notification as read:', err);
    }
  };

  const openNotificationDetail = (notif: InAppNotification) => {
    setIsOpen(false);
    setSelectedNotification(notif);
    void markNotificationRead(notif);
  };

  const closeNotificationModal = () => setSelectedNotification(null);

  const handleReadMoreNavigate = () => {
    const n = selectedNotification;
    if (!n) return;
    const targetUrl = n.url?.trim();
    closeNotificationModal();
    if (targetUrl) navigateTo(targetUrl);
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0 || markingAll) return;
    setMarkingAll(true);
    const batch = writeBatch(db);
    unread.forEach((n) => {
      batch.update(doc(db, 'users', userId, 'inAppNotifications', n.id), { read: true });
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error('[NotificationBar] Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const hasUnread = unreadCount > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative shrink-0">

      {/* ── Bell trigger button ───────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications${hasUnread ? ` — ${unreadCount} unread` : ''}`}
        className={cn(
          'group relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 active:scale-95',
          'bg-gradient-to-br from-indigo-500 to-violet-600',
          'shadow-lg shadow-indigo-500/35',
          'hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/50 hover:brightness-110',
          isOpen && 'scale-95 brightness-110 shadow-xl shadow-indigo-500/50'
        )}
      >
        {/* Ping glow ring — shown when there are unread notifications */}
        {hasUnread && (
          <>
            <span className="absolute inset-0 animate-ping rounded-2xl bg-indigo-400 opacity-30" />
            <span className="absolute inset-0 rounded-2xl ring-2 ring-indigo-300/60" />
          </>
        )}

        {/* Animated bell */}
        <motion.div
          animate={hasUnread ? { rotate: [0, -16, 16, -11, 11, -7, 7, 0] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 4 }}
        >
          <Bell className="h-8 w-8 text-white drop-shadow-sm" />
        </motion.div>

        {/* Unread count badge */}
        <AnimatePresence>
          {hasUnread && (
            <motion.span
              key="badge"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className={cn(
                'absolute -right-1.5 -top-1.5 z-10',
                'flex h-5 min-w-[1.25rem] items-center justify-center rounded-full',
                'bg-red-500 px-1 text-[10px] font-black leading-none text-white',
                'shadow-lg shadow-red-500/50 ring-2 ring-white dark:ring-slate-800'
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="dropdown"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className={cn(
              'absolute right-0 top-14 z-[100]',
              'w-[min(26rem,calc(100vw-1rem))]',
              'overflow-hidden rounded-2xl',
              'border border-slate-200/80 dark:border-slate-700/80',
              'bg-white dark:bg-slate-800',
              'shadow-[0_20px_60px_-10px_rgba(0,0,0,0.25),0_8px_24px_-6px_rgba(99,102,241,0.18)]'
            )}
          >

            {/* Gradient header strip */}
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4">
              {/* Background shimmer */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />

              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <Bell className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Notifications</h3>
                    <p className="text-[10px] font-medium text-indigo-200">
                      {hasUnread
                        ? `${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`
                        : 'All caught up'}
                    </p>
                  </div>
                </div>

                {/* Unread count pill */}
                {hasUnread && (
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-white backdrop-blur-sm">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    LIVE
                  </span>
                )}
              </div>
            </div>

            {/* Notification list */}
            <div className="max-h-[22rem] overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-indigo-500 border-t-transparent" />
                  <p className="text-xs text-slate-400 dark:text-slate-500">Loading notifications…</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-700">
                    <BellOff className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      No notifications yet
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      You'll see blog updates and tips here
                    </p>
                  </div>
                </div>
              ) : (
                <ul>
                  {notifications.map((notif) => (
                    <li
                      key={notif.id}
                      className={cn(
                        'relative border-b border-slate-100 last:border-0 dark:border-slate-700/60',
                        // Left accent bar for unread items
                        !notif.read && 'border-l-[3px] border-l-indigo-500'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openNotificationDetail(notif)}
                        className={cn(
                          'w-full px-4 py-4 text-left transition-all duration-150',
                          'hover:bg-slate-50 dark:hover:bg-slate-700/60',
                          !notif.read
                            ? 'bg-indigo-50/60 hover:bg-indigo-50/90 dark:bg-indigo-900/15 dark:hover:bg-indigo-900/25'
                            : 'bg-white dark:bg-transparent'
                        )}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Avatar circle */}
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-md',
                              'bg-gradient-to-br',
                              avatarGradient(notif.title)
                            )}
                          >
                            {notif.title.charAt(0).toUpperCase() || <Sparkles className="h-4 w-4" />}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={cn(
                                  'text-sm leading-snug',
                                  notif.read
                                    ? 'font-medium text-slate-600 dark:text-slate-300'
                                    : 'font-bold text-slate-800 dark:text-white'
                                )}
                              >
                                {notif.title}
                              </p>
                              {/* Unread dot */}
                              {!notif.read && (
                                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500 shadow-sm shadow-indigo-400" />
                              )}
                            </div>

                            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                              {notif.body}
                            </p>

                            <p
                              className={cn(
                                'mt-2 text-[10px] font-semibold',
                                notif.read
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : 'text-indigo-500 dark:text-indigo-400'
                              )}
                            >
                              {notif.createdAt?.toDate
                                ? timeAgo(notif.createdAt.toDate())
                                : ''}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Sticky footer: mark all read */}
            {notifications.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/80">
                {hasUnread ? (
                  <button
                    onClick={handleMarkAllRead}
                    disabled={markingAll}
                    className={cn(
                      'flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all',
                      'bg-gradient-to-r from-indigo-500 to-violet-600 text-white',
                      'shadow-md shadow-indigo-400/30 hover:brightness-110 hover:shadow-lg',
                      'disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]'
                    )}
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {markingAll ? 'Marking all as read…' : 'Mark all as read'}
                  </button>
                ) : (
                  <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                    {notifications.length} notification{notifications.length !== 1 ? 's' : ''} · all read
                  </p>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detail modal (glass + neon) ───────────────────────────────────── */}
      <AnimatePresence>
        {selectedNotification && (
          <motion.div
            key="notif-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notif-modal-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
          >
            {/* Backdrop — click outside panel closes */}
            <motion.div
              role="presentation"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-xl dark:bg-slate-950/65"
              onClick={closeNotificationModal}
            />

            {/* Panel: gradient neon border + glass fill */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className={cn(
                'relative z-10 w-full max-w-lg overflow-hidden rounded-[1.75rem]',
                'p-[1.5px] shadow-[0_0_60px_-8px_rgba(99,102,241,0.55),0_25px_50px_-12px_rgba(0,0,0,0.45)]',
                'bg-gradient-to-br from-indigo-400/90 via-violet-500/80 to-fuchsia-500/70',
                'dark:from-indigo-500/70 dark:via-violet-600/60 dark:to-fuchsia-600/50'
              )}
            >
              <div
                className={cn(
                  'relative overflow-hidden rounded-[calc(1.75rem-1.5px)]',
                  'border border-white/20 bg-white/75 backdrop-blur-2xl',
                  'dark:border-white/10 dark:bg-slate-900/55'
                )}
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(99,102,241,0.22),transparent)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(139,92,246,0.2),transparent)]" />

                <div className="relative px-5 pb-6 pt-4 sm:px-7 sm:pb-8 sm:pt-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg',
                        'bg-gradient-to-br',
                        avatarGradient(selectedNotification.title)
                      )}
                    >
                      {selectedNotification.title.charAt(0).toUpperCase() || (
                        <Sparkles className="h-5 w-5" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={closeNotificationModal}
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all',
                        'bg-slate-200/80 text-slate-600 hover:bg-slate-300/90 hover:text-slate-900',
                        'dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/20 dark:hover:text-white',
                        'ring-1 ring-slate-300/50 dark:ring-white/10'
                      )}
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <h2
                    id="notif-modal-title"
                    className="pr-2 text-xl font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl"
                  >
                    {selectedNotification.title || 'বিজ্ঞপ্তি'}
                  </h2>

                  <p className="mt-1 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                    {selectedNotification.createdAt?.toDate
                      ? formatDateTimeDetailed(selectedNotification.createdAt)
                      : ''}
                  </p>

                  <div className="mt-4 max-h-[40vh] overflow-y-auto rounded-2xl border border-slate-200/60 bg-white/50 px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-inner dark:border-white/10 dark:bg-slate-800/40 dark:text-slate-200 sm:max-h-[min(40vh,320px)]">
                    {selectedNotification.body || '—'}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedNotification.createdAt?.toDate
                        ? timeAgo(selectedNotification.createdAt.toDate())
                        : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedNotification.url?.trim() ? (
                        <button
                          type="button"
                          title="বিস্তারিত দেখুন"
                          onClick={handleReadMoreNavigate}
                          className={cn(
                            'inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-2xl px-6 py-2.5',
                            'text-sm font-black text-white shadow-lg transition-all active:scale-[0.98]',
                            'bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600',
                            'shadow-indigo-500/35 hover:brightness-110 sm:flex-initial'
                          )}
                        >
                          পড়ুন
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={closeNotificationModal}
                          className={cn(
                            'inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-2xl px-6 py-2.5',
                            'text-sm font-black text-white shadow-lg transition-all active:scale-[0.98]',
                            'bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600',
                            'shadow-indigo-500/35 hover:brightness-110 sm:flex-initial'
                          )}
                        >
                          বন্ধ করুন
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// React.memo: prevents re-renders when the parent (App.tsx) re-renders with the same userId
const NotificationBar = memo(NotificationBarBase);
NotificationBar.displayName = 'NotificationBar';

export default NotificationBar;
