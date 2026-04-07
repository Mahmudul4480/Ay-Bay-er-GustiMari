/**
 * Welcome back modal for users inactive >= 7 days — neon glass + motion.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

interface WelcomeBackModalProps {
  open: boolean;
  onClose: () => void;
}

const WelcomeBackModal: React.FC<WelcomeBackModalProps> = ({ open, onClose }) => {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-back-title"
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="presentation"
            aria-hidden
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-lg dark:bg-slate-950/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.92 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                type: 'spring',
                stiffness: 420,
                damping: 26,
                mass: 0.85,
              },
            }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="relative z-10 w-full max-w-md"
          >
            <div
              className="
                rounded-[1.75rem] p-[1.5px]
                shadow-[0_0_50px_-6px_rgba(99,102,241,0.65),0_25px_55px_-12px_rgba(0,0,0,0.5)]
                bg-gradient-to-br from-cyan-400/90 via-indigo-500/85 to-fuchsia-500/75
                dark:from-cyan-500/50 dark:via-indigo-600/55 dark:to-fuchsia-600/45
              "
            >
              <div
                className="
                  relative overflow-hidden rounded-[calc(1.75rem-1.5px)]
                  border border-white/25 bg-slate-900/80 backdrop-blur-2xl
                  px-6 pb-7 pt-8 sm:px-8 sm:pb-8 sm:pt-10
                "
              >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-30%,rgba(99,102,241,0.35),transparent_55%)]" />
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-cyan-500/15 blur-3xl" />

                <div className="relative flex flex-col items-center text-center">
                  <motion.div
                    initial={{ scale: 0.5, rotate: -12 }}
                    animate={{
                      scale: 1,
                      rotate: 0,
                      transition: {
                        type: 'spring',
                        stiffness: 500,
                        damping: 14,
                        delay: 0.08,
                      },
                    }}
                    className="
                      mb-5 flex h-20 w-20 items-center justify-center rounded-3xl
                      bg-gradient-to-br from-pink-400 via-rose-500 to-orange-400
                      text-4xl shadow-[0_12px_0_rgb(190,24,93),0_20px_40px_rgba(236,72,153,0.45)]
                      ring-2 ring-white/30
                    "
                    aria-hidden
                  >
                    <span className="drop-shadow-lg">😊</span>
                  </motion.div>

                  <div className="mb-2 flex items-center justify-center gap-2">
                    <Heart className="h-5 w-5 fill-pink-400 text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" />
                    <h2
                      id="welcome-back-title"
                      className="text-xl font-black tracking-tight text-white sm:text-2xl"
                    >
                      আবার স্বাগতম!
                    </h2>
                    <Heart className="h-5 w-5 fill-pink-400 text-pink-400 drop-shadow-[0_0_8px_rgba(244,114,182,0.8)]" />
                  </div>

                  <p className="mb-8 max-w-sm text-sm leading-relaxed text-slate-300">
                    আপনি এক সপ্তাহের বেশি ব্যবহার করেননি — আবার দেখে আমরা খুশি। আপনার{' '}
                    <span className="font-semibold text-indigo-200">আয়-ব্যয়ের হিসাব</span> আজই
                    আপডেট রাখুন।
                  </p>

                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onClose}
                    className="
                      w-full max-w-xs rounded-2xl bg-gradient-to-b from-indigo-400 to-indigo-600
                      py-3.5 text-base font-black text-white shadow-[0_6px_0_rgb(55,48,163),0_14px_35px_rgba(99,102,241,0.5)]
                      transition active:translate-y-0.5 active:shadow-[0_3px_0_rgb(55,48,163)]
                      border border-indigo-300/30
                    "
                  >
                    ধন্যবাদ
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeBackModal;
