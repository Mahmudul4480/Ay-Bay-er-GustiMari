/**
 * Custom PWA install prompt — glass banner (Chrome/Android) or iOS manual steps.
 * Framer Motion = `motion/react` (same as rest of app).
 */

import { motion, AnimatePresence } from 'motion/react';
import { Download, Share2, X } from 'lucide-react';
import { isInAppBrowser } from '../firebaseConfig';
import { usePWA } from '../hooks/usePWA';

export default function InstallPWA() {
  const {
    isInstallable,
    isStandalone,
    showIOSInstallGuide,
    showMobileManualInstall,
    dismissed,
    dismiss,
    installApp,
  } = usePWA();

  const visible =
    !isInAppBrowser() &&
    !isStandalone &&
    !dismissed &&
    (isInstallable || showIOSInstallGuide || showMobileManualInstall);

  if (isStandalone) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label="Install app"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="fixed inset-x-0 bottom-[5.5rem] z-[100] pointer-events-none flex justify-center px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:bottom-8 sm:px-4"
        >
          <div className="pointer-events-auto w-full max-w-lg">
            <div
              className="
                relative overflow-hidden rounded-2xl border border-white/20
                bg-slate-900/75 backdrop-blur-xl shadow-[0_-8px_40px_rgba(0,0,0,0.35)]
                dark:bg-slate-950/80
              "
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-500/10 pointer-events-none" />

              <button
                type="button"
                onClick={dismiss}
                className="absolute right-2 top-2 rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex flex-col gap-3 p-4 pr-12 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-black tracking-tight text-white sm:text-base">
                    অ্যাপটি মোবাইলে ব্যবহার করুন{' '}
                    <span className="font-semibold text-indigo-200">(Install App)</span>
                  </p>
                  {showIOSInstallGuide ? (
                    <p className="text-xs leading-relaxed text-slate-300">
                      <span className="inline-flex items-center gap-1 font-medium text-white">
                        <Share2 className="h-3.5 w-3.5 shrink-0 text-indigo-300" />
                        Safari:
                      </span>{' '}
                      ট্যাপ করুন <strong className="text-white">Share</strong> →{' '}
                      <strong className="text-white">Add to Home Screen</strong>।
                      ক্রোম iOS-এ একই মেনু থেকে হোম স্ক্রিনে যোগ করুন।
                    </p>
                  ) : showMobileManualInstall ? (
                    <p className="text-xs leading-relaxed text-slate-300">
                      <strong className="text-white">Chrome / Samsung Internet:</strong> মেনু{' '}
                      <span className="whitespace-nowrap font-mono text-indigo-200">(⋮)</span> বা{' '}
                      <strong className="text-white">Install app</strong> /{' '}
                      <strong className="text-white">Add to Home screen</strong> বেছে নিন। অন্য
                      ব্রাউজারে অনুরূপ বিকল্প খুঁজুন।
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">
                      হোম স্ক্রিনে যোগ করলে দ্রুত খুলবে ও ফুলস্ক্রিন অভিজ্ঞতা পাবেন।
                    </p>
                  )}
                </div>

                {isInstallable ? (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void installApp()}
                    className="
                      shrink-0 rounded-xl bg-gradient-to-b from-indigo-400 to-indigo-600 px-5 py-3
                      text-sm font-black text-white shadow-[0_4px_0_rgb(67,56,202),0_8px_24px_rgba(99,102,241,0.45)]
                      transition active:translate-y-0.5 active:shadow-[0_2px_0_rgb(67,56,202)]
                      border border-indigo-300/30
                    "
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Download className="h-4 w-4" />
                      Install
                    </span>
                  </motion.button>
                ) : (
                  <p className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-[11px] font-medium leading-snug text-slate-200 sm:max-w-[160px]">
                    {showMobileManualInstall
                      ? 'মেনু থেকে ইন্সটল করুন'
                      : 'উপরের নির্দেশ অনুসরণ করুন'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
