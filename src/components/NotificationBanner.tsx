/**
 * NotificationBanner
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows at the top of the Dashboard to guide users through enabling push
 * notifications.
 *
 * States:
 *  idle       → "Enable Notifications" prompt with animated bell
 *  requesting → spinner while permission dialog is open / token being fetched
 *  success    → green "Notifications enabled ✅" card (auto-dismisses in 4 s)
 *  denied     → soft "Blocked" info card (dismissible per-session)
 *
 * Won't render at all if Notification.permission === 'granted' on mount —
 * the useNotifications hook in App.tsx already handles that silently.
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, CheckCircle2, Loader2, X, BellRing } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { getFcmToken, saveFcmTokenToFirestore } from '../lib/fcmUtils';

// ── Types ─────────────────────────────────────────────────────────────────────

type BannerState =
  | 'hidden'       // already granted on mount, or unsupported, or user dismissed
  | 'idle'         // permission is 'default' → show enable prompt
  | 'requesting'   // waiting for permission + token
  | 'success'      // just enabled — show for 4 s then hide
  | 'denied';      // browser permission is blocked

// ── Session-level dismiss key ─────────────────────────────────────────────────
const DISMISS_KEY = 'gustimari-notif-dismissed';

// ── Component ─────────────────────────────────────────────────────────────────

export const NotificationBanner: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLocalization();
  const [bannerState, setBannerState] = useState<BannerState>('hidden');

  // ── Determine initial state ──────────────────────────────────────────────
  useEffect(() => {
    // Hard requirements
    if (
      typeof window === 'undefined' ||
      !('Notification' in window) ||
      !('serviceWorker' in navigator)
    ) return; // stays 'hidden'

    // User already dismissed this session
    if (sessionStorage.getItem(DISMISS_KEY)) return;

    const perm = Notification.permission;
    if (perm === 'granted') return;       // token handled silently by useNotifications
    if (perm === 'denied') { setBannerState('denied'); return; }
    setBannerState('idle');               // 'default' → show the prompt
  }, []);

  // ── Auto-dismiss after success ───────────────────────────────────────────
  useEffect(() => {
    if (bannerState !== 'success') return;
    const t = window.setTimeout(() => {
      setBannerState('hidden');
      sessionStorage.setItem(DISMISS_KEY, '1');
    }, 4000);
    return () => window.clearTimeout(t);
  }, [bannerState]);

  // ── Handle "Enable" click ────────────────────────────────────────────────
  const handleEnable = async () => {
    setBannerState('requesting');
    try {
      const token = await getFcmToken(); // → requests permission internally + gets token
      if (token && user?.uid) {
        await saveFcmTokenToFirestore(user.uid, token);
        setBannerState('success');
      } else {
        // Permission was denied by the user in the dialog
        setBannerState(Notification.permission === 'denied' ? 'denied' : 'idle');
      }
    } catch {
      setBannerState(Notification.permission === 'denied' ? 'denied' : 'idle');
    }
  };

  const handleDismiss = () => {
    setBannerState('hidden');
    sessionStorage.setItem(DISMISS_KEY, '1');
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const isBn = language === 'bn';

  return (
    <AnimatePresence mode="wait">
      {bannerState !== 'hidden' && (
        <motion.div
          key={bannerState}
          initial={{ opacity: 0, y: -14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="w-full"
        >
          {/* ── IDLE: enable prompt ───────────────────────────────────── */}
          {bannerState === 'idle' && (
            <div className="relative flex items-center gap-4 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 shadow-sm dark:border-indigo-700/40 dark:from-indigo-950/40 dark:to-violet-950/40">
              {/* Animated bell */}
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-300/30 dark:shadow-indigo-900/40">
                <motion.div
                  animate={{ rotate: [0, -18, 18, -12, 12, -6, 6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3 }}
                >
                  <BellRing className="h-6 w-6 text-white" />
                </motion.div>
                {/* Live ping dot */}
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-violet-500" />
                </span>
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {isBn ? 'Notification চালু করুন' : 'Enable Notifications'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {isBn
                    ? 'নতুন টিপস ও আপডেট পেতে notification চালু করুন'
                    : 'Get notified about new financial tips and updates'}
                </p>
              </div>

              {/* Enable button */}
              <button
                onClick={handleEnable}
                className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-indigo-300/30 transition-all hover:from-indigo-400 hover:to-violet-500 active:scale-95 dark:shadow-indigo-900/30"
              >
                {isBn ? 'চালু করুন' : 'Enable'}
              </button>

              {/* Dismiss */}
              <button
                onClick={handleDismiss}
                className="ml-1 shrink-0 rounded-full p-1 text-slate-400 transition-all hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* ── REQUESTING: loading ───────────────────────────────────── */}
          {bannerState === 'requesting' && (
            <div className="flex items-center gap-4 rounded-2xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50 to-violet-50 p-4 shadow-sm dark:border-indigo-700/40 dark:from-indigo-950/40 dark:to-violet-950/40">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-300/30 dark:shadow-indigo-900/40">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {isBn ? 'অনুমতি নেওয়া হচ্ছে…' : 'Setting up notifications…'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {isBn
                    ? 'Browser-এ permission দিন'
                    : 'Please allow the browser permission prompt'}
                </p>
              </div>
            </div>
          )}

          {/* ── SUCCESS: granted ──────────────────────────────────────── */}
          {bannerState === 'success' && (
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 shadow-sm dark:border-emerald-700/40 dark:from-emerald-950/40 dark:to-teal-950/40">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-300/30 dark:shadow-emerald-900/40">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 18 }}
                >
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </motion.div>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {isBn ? 'Notification চালু হয়েছে ✅' : 'Notifications Enabled ✅'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {isBn
                    ? 'এখন থেকে নতুন টিপস এলে notification পাবেন'
                    : "You'll now receive alerts for new tips and updates"}
                </p>
              </div>
              {/* Progress bar showing time-to-dismiss */}
              <motion.div
                className="absolute bottom-0 left-0 h-0.5 rounded-full bg-emerald-400"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 4, ease: 'linear' }}
              />
            </div>
          )}

          {/* ── DENIED: blocked ───────────────────────────────────────── */}
          {bannerState === 'denied' && (
            <div className="relative flex items-center gap-4 rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm dark:border-amber-700/40 dark:from-amber-950/40 dark:to-orange-950/40">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-300/30 dark:shadow-amber-900/40">
                <BellOff className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {isBn ? 'Notification বন্ধ আছে' : 'Notifications Blocked'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {isBn
                    ? 'Browser settings থেকে এই সাইটের notification চালু করুন'
                    : 'Enable notifications for this site in your browser settings'}
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="ml-1 shrink-0 rounded-full p-1 text-slate-400 transition-all hover:bg-amber-200/60 dark:hover:bg-amber-800/40"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationBanner;
