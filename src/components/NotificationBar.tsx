/**
 * NotificationBar
 * ─────────────────────────────────────────────────────────────────────────────
 * Bell dropdown: Firestore in-app notifications + push-permission “system” prompts.
 *
 * • Real-time listener on `users/{userId}/inAppNotifications` (Welcome Back, blogs, etc.)
 * • System row: enable / blocked / requesting push (was Dashboard NotificationBanner)
 * • Badge = unread in-app count + 1 when a system action is pending
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
import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  CheckCircle2,
  Heart,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { db } from '../firebaseConfig';
import { cn } from '../lib/utils';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import { getFcmToken, saveFcmTokenToFirestore } from '../lib/fcmUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InAppNotification {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: Timestamp | null;
  read: boolean;
  blogId: string;
  /** e.g. 'Welcome' for client-side Welcome Back */
  category?: string;
}

interface NotificationBarProps {
  userId: string;
}

const PUSH_DISMISS_KEY = 'gustimari-notif-dismissed';

type PushBannerState =
  | 'hidden'
  | 'idle'
  | 'requesting'
  | 'success'
  | 'denied';

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
  const { language } = useLocalization();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<InAppNotification | null>(null);
  const [pushState, setPushState] = useState<PushBannerState>('hidden');
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );

  const isBn = language === 'bn';

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return;
    }
    if (sessionStorage.getItem(PUSH_DISMISS_KEY)) return;
    const perm = Notification.permission;
    if (perm === 'granted') return;
    if (perm === 'denied') {
      setPushState('denied');
      return;
    }
    setPushState('idle');
  }, []);

  useEffect(() => {
    if (pushState !== 'success') return;
    const t = window.setTimeout(() => {
      setPushState('hidden');
      sessionStorage.setItem(PUSH_DISMISS_KEY, '1');
    }, 4000);
    return () => window.clearTimeout(t);
  }, [pushState]);

  const handlePushEnable = async () => {
    setPushState('requesting');
    try {
      const token = await getFcmToken();
      const uid = user?.uid ?? userId;
      if (token && uid) {
        await saveFcmTokenToFirestore(uid, token);
        setPushState('success');
      } else {
        setPushState(Notification.permission === 'denied' ? 'denied' : 'idle');
      }
    } catch {
      setPushState(Notification.permission === 'denied' ? 'denied' : 'idle');
    }
  };

  const handlePushDismiss = () => {
    setPushState('hidden');
    sessionStorage.setItem(PUSH_DISMISS_KEY, '1');
  };

  const systemAttentionActive =
    pushState === 'idle' || pushState === 'requesting' || pushState === 'denied';
  const systemAttentionCount = systemAttentionActive ? 1 : 0;
  const totalBadgeCount = unreadCount + systemAttentionCount;
  const showBadge = totalBadgeCount > 0;

  // ── Handlers (declared before effects that call close / mark read) ────────

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
  };

  /** Marks read in Firestore, then closes (link row uses "পড়া হয়েছে" for the open-URL action; read state is disabled). */
  const closeNotificationModal = () => {
    setSelectedNotification((current) => {
      if (current) void markNotificationRead(current);
      return null;
    });
  };

  const handleReadMoreNavigate = () => {
    const n = selectedNotification;
    if (!n) return;
    const targetUrl = n.url?.trim();
    if (!targetUrl) return;
    closeNotificationModal();
    navigateTo(targetUrl);
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

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsNarrowViewport(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ── Real-time listener ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, 'users', userId, 'inAppNotifications'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items: InAppNotification[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title ?? '',
            body: data.body ?? '',
            url: data.url ?? '',
            createdAt: data.createdAt ?? null,
            read: data.read ?? false,
            blogId: data.blogId ?? '',
            category: typeof data.category === 'string' ? data.category : undefined,
          };
        });
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
      if (e.key === 'Escape') closeNotificationModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedNotification, closeNotificationModal]);

  // ── Close dropdown on outside click (backdrop is outside containerRef on mobile) ──
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

  // ── Keep open modal in sync when Firestore listener updates the same item ──
  useEffect(() => {
    if (!selectedNotification) return;
    const fresh = notifications.find((n) => n.id === selectedNotification.id);
    if (fresh && fresh.read !== selectedNotification.read) {
      setSelectedNotification(fresh);
    }
  }, [notifications, selectedNotification]);

  // ── Lock body scroll when mobile sheet is open ────────────────────────────
  useEffect(() => {
    if (!isOpen || !isNarrowViewport) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, isNarrowViewport]);

  const hasUnread = unreadCount > 0;

  const dropdownMotionInitial = isNarrowViewport
    ? { opacity: 0, y: 48, scale: 0.96 }
    : { opacity: 0, y: -10, scale: 0.95 };
  const dropdownMotionAnimate = { opacity: 1, y: 0, scale: 1 };
  const dropdownMotionExit = isNarrowViewport
    ? { opacity: 0, y: 32, scale: 0.98 }
    : { opacity: 0, y: -10, scale: 0.95 };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Mobile: dimmed backdrop — outside bell container so outside-click + tap-to-dismiss work */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="notif-dropdown-backdrop"
            role="presentation"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[115] bg-black/40 backdrop-blur-sm sm:hidden"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

    <div ref={containerRef} className="relative shrink-0">

      {/* ── Bell trigger button ───────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Notifications${showBadge ? ` — ${totalBadgeCount} pending` : ''}`}
        className={cn(
          'group relative flex h-12 w-12 items-center justify-center rounded-2xl transition-all duration-200 active:scale-95',
          'bg-gradient-to-br from-indigo-500 to-violet-600',
          'shadow-lg shadow-indigo-500/35',
          'hover:scale-105 hover:shadow-xl hover:shadow-indigo-500/50 hover:brightness-110',
          isOpen && 'scale-95 brightness-110 shadow-xl shadow-indigo-500/50'
        )}
      >
        {/* Ping glow ring — pending in-app or system */}
        {showBadge && (
          <>
            <span className="absolute inset-0 animate-ping rounded-2xl bg-indigo-400 opacity-30" />
            <span className="absolute inset-0 rounded-2xl ring-2 ring-indigo-300/60" />
          </>
        )}

        {/* Animated bell */}
        <motion.div
          animate={showBadge ? { rotate: [0, -16, 16, -11, 11, -7, 7, 0] } : {}}
          transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 4 }}
        >
          <Bell className="h-8 w-8 text-white drop-shadow-sm" />
        </motion.div>

        {/* Total pending: unread in-app + system row */}
        <AnimatePresence>
          {showBadge && (
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
              {totalBadgeCount > 99 ? '99+' : totalBadgeCount > 9 ? '9+' : totalBadgeCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* ── Dropdown / mobile sheet ───────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="dropdown"
            initial={dropdownMotionInitial}
            animate={dropdownMotionAnimate}
            exit={dropdownMotionExit}
            transition={
              isNarrowViewport
                ? { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 }
                : { type: 'spring', stiffness: 380, damping: 32 }
            }
            className={cn(
              'z-[120] overflow-hidden rounded-2xl',
              // Mobile: fixed, centered, within viewport (below app header area)
              'fixed left-1/2 top-[max(5rem,env(safe-area-inset-top))] w-[92vw] max-w-lg -translate-x-1/2',
              // Desktop: anchor to bell
              'sm:absolute sm:inset-auto sm:right-0 sm:top-14 sm:w-[min(26rem,calc(100vw-1rem))] sm:max-w-none sm:translate-x-0',
              // Glass + neon border (Ay-Bay-er-GustiMari aesthetic)
              'border border-white/25 bg-white/10 shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_25px_50px_-12px_rgba(0,0,0,0.45),0_0_40px_-8px_rgba(139,92,246,0.35)]',
              'backdrop-blur-md dark:border-white/15 dark:bg-slate-900/80',
            )}
          >

            {/* Gradient header strip */}
            <div className="relative overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 sm:px-5 sm:py-4">
              {/* Background shimmer */}
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />

              <div className="relative flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                    <Bell className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-white">
                      {isBn ? 'বিজ্ঞপ্তি' : 'Notifications'}
                    </h3>
                    <p className="text-[10px] font-medium text-indigo-200">
                      {showBadge
                        ? isBn
                          ? `${totalBadgeCount}টি অপেক্ষমাণ`
                          : `${totalBadgeCount} pending item${totalBadgeCount !== 1 ? 's' : ''}`
                        : isBn
                          ? 'সব ঠিক আছে'
                          : 'All caught up'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {showBadge && (
                    <span className="hidden items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black tracking-wide text-white backdrop-blur-sm sm:inline-flex">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                      </span>
                      LIVE
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close notifications"
                    className={cn(
                      'flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl',
                      'bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30 active:scale-95',
                      'ring-1 ring-white/30'
                    )}
                  >
                    <X className="h-6 w-6" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>

            {/* In-app list + system (push permission) */}
            <div className="max-h-[70vh] overflow-y-auto overscroll-contain sm:max-h-[22rem]">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10">
                  <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-indigo-400 border-t-transparent" />
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {isBn ? 'লোড হচ্ছে…' : 'Loading notifications…'}
                  </p>
                </div>
              ) : (
                <>
                  {pushState !== 'hidden' && (
                    <div className="border-b border-white/15 bg-indigo-500/10 px-4 py-3 dark:border-white/10 dark:bg-indigo-500/15">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300">
                        {isBn ? 'সিস্টেম' : 'System'}
                      </p>

                      {pushState === 'idle' && (
                        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200/50 bg-white/40 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40 sm:flex-row sm:items-center">
                          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md">
                            <motion.div
                              animate={{ rotate: [0, -14, 14, -10, 10, 0] }}
                              transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.5 }}
                            >
                              <BellRing className="h-5 w-5 text-white" />
                            </motion.div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                              {isBn ? 'Notification চালু করুন' : 'Enable notifications'}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                              {isBn
                                ? 'নতুন টিপস ও আপডেট পেতে'
                                : 'Get tips and updates in your browser'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-stretch">
                            <button
                              type="button"
                              onClick={handlePushEnable}
                              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-2 text-xs font-bold text-white shadow-md active:scale-[0.98]"
                            >
                              {isBn ? 'চালু' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={handlePushDismiss}
                              className="rounded-lg px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-white/30 dark:text-slate-400 dark:hover:bg-white/10"
                            >
                              {isBn ? 'বন্ধ' : 'Dismiss'}
                            </button>
                          </div>
                        </div>
                      )}

                      {pushState === 'requesting' && (
                        <div className="flex items-center gap-3 rounded-xl border border-indigo-200/50 bg-white/40 p-3 dark:border-indigo-500/30 dark:bg-slate-900/40">
                          <Loader2 className="h-6 w-6 shrink-0 animate-spin text-indigo-600 dark:text-indigo-400" />
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {isBn ? 'অনুমতি চলছে…' : 'Requesting permission…'}
                          </p>
                        </div>
                      )}

                      {pushState === 'denied' && (
                        <div className="flex items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/80 p-3 dark:border-amber-500/35 dark:bg-amber-950/30">
                          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                              {isBn ? 'Notification বন্ধ' : 'Notifications blocked'}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                              {isBn
                                ? 'ব্রাউজার সেটিংস থেকে চালু করুন'
                                : 'Enable this site in browser settings'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handlePushDismiss}
                            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-amber-200/50 dark:hover:bg-amber-900/40"
                            aria-label="Dismiss"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {pushState === 'success' && (
                        <div className="relative overflow-hidden rounded-xl border border-emerald-200/60 bg-emerald-50/90 p-3 dark:border-emerald-500/35 dark:bg-emerald-950/35">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
                            <p className="text-sm font-bold text-slate-800 dark:text-white">
                              {isBn ? 'Notification চালু হয়েছে ✅' : 'Notifications enabled ✅'}
                            </p>
                          </div>
                          <motion.div
                            className="absolute bottom-0 left-0 h-0.5 bg-emerald-400"
                            initial={{ width: '100%' }}
                            animate={{ width: '0%' }}
                            transition={{ duration: 4, ease: 'linear' }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {notifications.length === 0 && pushState === 'hidden' ? (
                    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/30 dark:bg-white/10">
                        <BellOff className="h-8 w-8 text-slate-500 dark:text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                          {isBn ? 'কোনো বিজ্ঞপ্তি নেই' : 'No notifications yet'}
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {isBn
                            ? 'ব্লগ ও টিপস এখানে দেখা যাবে'
                            : "You'll see blog updates and tips here"}
                        </p>
                      </div>
                    </div>
                  ) : notifications.length === 0 ? (
                    <p className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      {isBn
                        ? 'আর কোনো সংরক্ষিত বার্তা নেই।'
                        : 'No saved in-app messages beyond the system row above.'}
                    </p>
                  ) : (
                    <>
                      <p className="px-4 pb-1 pt-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {isBn ? 'বার্তা' : 'Messages'}
                      </p>
                      <ul>
                  {notifications.map((notif) => (
                    <li
                      key={notif.id}
                      className={cn(
                        'relative border-b border-white/10 last:border-0 dark:border-white/10',
                        // Left accent bar for unread items
                        !notif.read && 'border-l-[3px] border-l-indigo-500'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => openNotificationDetail(notif)}
                        className={cn(
                          'w-full px-4 py-4 text-left transition-all duration-150',
                          'hover:bg-white/25 dark:hover:bg-white/10',
                          !notif.read
                            ? 'bg-indigo-500/15 hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/25'
                            : 'bg-white/20 dark:bg-white/5'
                        )}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Avatar circle */}
                          <div
                            className={cn(
                              'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white shadow-md',
                              'bg-gradient-to-br',
                              notif.category === 'Welcome'
                                ? 'from-pink-500 to-rose-600'
                                : avatarGradient(notif.title)
                            )}
                          >
                            {notif.category === 'Welcome' ? (
                              <Heart className="h-5 w-5 fill-white/90 text-white" />
                            ) : notif.title.charAt(0) ? (
                              notif.title.charAt(0).toUpperCase()
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                                {notif.category === 'Welcome' && (
                                  <span className="shrink-0 rounded-md bg-pink-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-pink-600 dark:text-pink-300">
                                    Welcome
                                  </span>
                                )}
                                <p
                                  className={cn(
                                    'min-w-0 text-sm leading-snug',
                                    notif.read
                                      ? 'font-medium text-slate-600 dark:text-slate-300'
                                      : 'font-bold text-slate-800 dark:text-white'
                                  )}
                                >
                                  {notif.title}
                                </p>
                              </div>
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
                    </>
                  )}
                </>
              )}
            </div>

            {/* Sticky footer: mark all read */}
            {notifications.length > 0 && (
              <div className="border-t border-white/10 bg-slate-950/20 px-4 py-3 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/40">
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

    </div>

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
                        selectedNotification.category === 'Welcome'
                          ? 'from-pink-500 to-rose-600'
                          : avatarGradient(selectedNotification.title)
                      )}
                    >
                      {selectedNotification.category === 'Welcome' ? (
                        <Heart className="h-6 w-6 fill-white/90 text-white" />
                      ) : selectedNotification.title.charAt(0) ? (
                        selectedNotification.title.charAt(0).toUpperCase()
                      ) : (
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

                  <div className="flex flex-wrap items-center gap-2 pr-2">
                    {selectedNotification.category === 'Welcome' && (
                      <span className="rounded-lg bg-pink-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-pink-600 dark:text-pink-300">
                        Welcome
                      </span>
                    )}
                    <h2
                      id="notif-modal-title"
                      className="text-xl font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl"
                    >
                      {selectedNotification.title || 'বিজ্ঞপ্তি'}
                    </h2>
                  </div>

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
                        selectedNotification.read ? (
                          <button
                            type="button"
                            disabled
                            title="পড়া হয়েছে"
                            className={cn(
                              'inline-flex min-h-[2.75rem] flex-1 cursor-not-allowed items-center justify-center rounded-2xl px-6 py-2.5',
                              'text-sm font-black text-slate-600 dark:text-slate-400',
                              'border border-slate-200/80 bg-slate-100/90 shadow-inner dark:border-white/10 dark:bg-slate-800/80',
                              'sm:flex-initial'
                            )}
                          >
                            পড়া হয়েছে
                          </button>
                        ) : (
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
                            পড়া হয়েছে
                          </button>
                        )
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
    </>
  );
};

// React.memo: prevents re-renders when the parent (App.tsx) re-renders with the same userId
const NotificationBar = memo(NotificationBarBase);
NotificationBar.displayName = 'NotificationBar';

export default NotificationBar;
