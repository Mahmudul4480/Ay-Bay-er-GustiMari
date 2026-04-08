import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth, isOnboardingComplete } from '../contexts/AuthContext';

const WELCOME_IMAGE = 'https://i.postimg.cc/KFrrzxzv/welcome.png';

/**
 * Full-screen welcome overlay — shows user's name + welcome illustration.
 * Auto-hides after 4s; runs again on every login or full refresh.
 */
const WelcomeOverlay: React.FC = () => {
  const { user, loading, userProfile } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const shouldShow =
    !loading &&
    !!user &&
    isOnboardingComplete(userProfile);

  const displayName =
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'there';

  useEffect(() => {
    if (!shouldShow) return;
    setDismissed(false);
    // Start fade-out at 3600 ms so the 400 ms exit animation finishes exactly at 4 s
    const t = window.setTimeout(() => setDismissed(true), 3600);
    return () => window.clearTimeout(t);
  }, [shouldShow, user?.uid]);

  const visible = shouldShow && !dismissed;

  if (!shouldShow) return null;

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="welcome-overlay"
          className="pointer-events-none fixed inset-0 z-[200] flex items-end justify-center p-4 pb-8 sm:items-center sm:pb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.38 }}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/35 to-transparent dark:from-slate-950/80"
            aria-hidden
          />
          <motion.div
            className="relative z-10 flex max-w-lg flex-col items-center gap-4"
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
          >
            <motion.div
              className="relative rounded-3xl border border-white/30 bg-white/95 px-6 py-4 text-center shadow-2xl shadow-violet-500/20 backdrop-blur-md dark:border-violet-400/25 dark:bg-slate-900/90"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.35 }}
            >
              <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-xl">
                Welcome {displayName}!
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                Your personalized dashboard is ready.
              </p>
              <div
                className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-white/30 bg-white/95 dark:border-violet-400/25 dark:bg-slate-900/90"
                aria-hidden
              />
            </motion.div>

            <motion.div
              className="relative drop-shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08, type: 'spring', stiffness: 220, damping: 20 }}
            >
              <div className="relative h-[min(52vh,420px)] w-[min(85vw,320px)] sm:h-[420px] sm:w-[320px]">
                <img
                  src={WELCOME_IMAGE}
                  alt=""
                  className="h-full w-full object-contain object-bottom [filter:drop-shadow(0_12px_24px_rgba(99,102,241,0.35))]"
                  draggable={false}
                />
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeOverlay;
