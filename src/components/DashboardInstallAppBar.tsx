/**
 * Permanent dashboard strip — install / add-to-home (replaces floating PWA banner).
 */

import React from 'react';
import { motion } from 'motion/react';
import { Check, Copy, Download, RefreshCw, Smartphone } from 'lucide-react';
import { isInAppBrowser } from '../firebaseConfig';
import type { UsePWAReturn } from '../hooks/usePWA';
import { cn } from '../lib/utils';

interface DashboardInstallAppBarProps {
  language: 'en' | 'bn';
  pwa: UsePWAReturn;
}

export default function DashboardInstallAppBar({ language, pwa }: DashboardInstallAppBarProps) {
  const {
    isInstallable,
    isStandalone,
    showIOSInstallGuide,
    showMobileManualInstall,
    installApp,
  } = pwa;

  // Always show in normal browser tabs (not FB/WA WebView, not already installed).
  // Previously we only showed when iOS / mobile manual / beforeinstallprompt — on desktop
  // Chrome those are often all false (narrow window still uses fine pointer), so the bar vanished.
  const show = !isInAppBrowser() && !isStandalone;

  if (!show) return null;

  const bn = language === 'bn';
  const [iosLinkCopied, setIosLinkCopied] = React.useState(false);

  const desktopManualHint =
    !isInstallable && !showIOSInstallGuide && !showMobileManualInstall;

  const showReloadForPrompt =
    !isInstallable && !showIOSInstallGuide && (desktopManualHint || showMobileManualInstall);

  const copySiteLink = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    void (async () => {
      try {
        await navigator.clipboard.writeText(url);
        setIosLinkCopied(true);
        window.setTimeout(() => setIosLinkCopied(false), 2200);
      } catch {
        /* clipboard denied */
      }
    })();
  };

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-indigo-400/35 bg-gradient-to-r from-indigo-950/90 via-violet-950/85 to-slate-950/90',
        'shadow-[0_0_32px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]',
        'dark:border-violet-500/30 dark:from-indigo-950 dark:via-violet-950 dark:to-slate-950'
      )}
      aria-label={
        showIOSInstallGuide
          ? bn
            ? 'iPhone — হোম স্ক্রিনে যোগ করুন'
            : 'Add to Home Screen on iPhone'
          : bn
            ? 'মোবাইল অ্যাপ ইনস্টল'
            : 'Install mobile app'
      }
    >
      <motion.div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'linear', repeatDelay: 0.8 }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -left-6 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-cyan-400/20 blur-2xl"
        animate={{ opacity: [0.35, 0.65, 0.35], scale: [1, 1.15, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -right-4 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-fuchsia-500/25 blur-2xl"
        animate={{ opacity: [0.3, 0.55, 0.3] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        aria-hidden
      />

      <div className="relative flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <motion.div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/40 ring-2 ring-white/20"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden
          >
            <Smartphone className="h-5 w-5" strokeWidth={2.25} />
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black leading-tight text-white sm:text-base">
              {showIOSInstallGuide
                ? bn
                  ? 'iPhone / iPad — হোম স্ক্রিনে যোগ করুন'
                  : 'Add to Home Screen (iPhone & iPad)'
                : bn
                  ? 'মোবাইল অ্যাপ ইনস্টল করুন'
                  : 'Install the mobile app'}
            </p>
            {showIOSInstallGuide ? (
              <div className="mt-2 space-y-2 text-[11px] leading-snug text-indigo-100/90 sm:text-xs">
                <p className="font-semibold text-cyan-100/95">
                  {bn
                    ? 'Apple Safari তে ওয়েবসাইট থেকে সরাসরি “ইনস্টল” বাটন দেয় না — Safari-র নিচের মেনু ব্যবহার করতে হবে।'
                    : 'Safari does not allow a site button to install like Chrome — use Safari’s own toolbar at the bottom.'}
                </p>
                <ol className="list-decimal space-y-1.5 pl-4 font-medium text-indigo-50/95 marker:text-cyan-200">
                  <li>
                    {bn
                      ? 'Safari-র নিচের বারে তীরচিহ্নযুক্ত বর্গক্ষেত্র (Share) আইকনে ট্যাপ করুন — এটি এই পেজের কোনো বাটন নয়।'
                      : 'Tap Share (⊼) in Safari’s bottom bar — not a button on this page.'}
                  </li>
                  <li>
                    {bn
                      ? 'তালিকায় স্ক্রল করে হোম স্ক্রিনে যোগ করুন / Add to Home Screen বেছে নিন।'
                      : 'Scroll the actions and choose Add to Home Screen.'}
                  </li>
                  <li>
                    {bn
                      ? 'শিরোনাম ঠিক করে যোগ করুন ট্যাপ করুন।'
                      : 'Tap Add to confirm.'}
                  </li>
                </ol>
                <p className="text-[10px] text-indigo-200/75 sm:text-[11px]">
                  {bn
                    ? 'Chrome on iOS: একইভাবে ব্রাউজার মেনু → Add to Home Screen।'
                    : 'Chrome on iOS: browser menu → Add to Home Screen (same idea).'}
                </p>
              </div>
            ) : (
            <p className="mt-0.5 text-[11px] leading-snug text-indigo-100/85 sm:text-xs">
              {showMobileManualInstall ? (
                <>
                  {bn
                    ? 'Chrome / Samsung Internet: মেনু (⋮) → Install app বা Add to Home screen।'
                    : 'Chrome / Samsung Internet: Menu (⋮) → Install app or Add to Home screen.'}{' '}
                  <span className="mt-1 block font-semibold text-cyan-100/95">
                    {bn
                      ? 'পপআপ বন্ধ করলে পেজ রিফ্রেশ করে আবার চেষ্টা করুন।'
                      : 'If you dismissed the prompt, refresh and try again.'}
                  </span>
                </>
              ) : isInstallable ? (
                bn
                  ? 'এক ট্যাপে ইনস্টল — হোম স্ক্রিনে দ্রুত খুলবে ও ফুলস্ক্রিন অভিজ্ঞতা।'
                  : 'One tap to install — opens fast from your home screen, full-screen experience.'
              ) : desktopManualHint ? (
                <>
                  {bn
                    ? 'Chrome / Edge: ঠিকানার বারে ইনস্টল (⊕) আইকন, অথবা মেনু (⋮) → অ্যাপ ইনস্টল / Install page as app।'
                    : 'Chrome / Edge: install (⊕) in the address bar, or Menu (⋮) → Install app / Save and share → Install page as app.'}{' '}
                  <span className="mt-1 block font-semibold text-cyan-100/95">
                    {bn
                      ? 'ইনস্টল পপআপ বন্ধ করলে একবার পেজ রিফ্রেশ করুন — তারপর আবার ইনস্টল চেষ্টা করুন।'
                      : 'If you closed the install popup, refresh once — then try Install again.'}
                  </span>
                </>
              ) : (
                (bn
                  ? 'ব্রাউজার মেনু থেকে সাইটটি অ্যাপ হিসেবে ইনস্টল করুন।'
                  : 'Install this site as an app from your browser menu.')
              )}
            </p>
            )}
          </div>
        </div>

        {showIOSInstallGuide ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <motion.button
              type="button"
              onClick={copySiteLink}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-bold text-white sm:w-auto',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
              )}
            >
              {iosLinkCopied ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={2.5} />
              ) : (
                <Copy className="h-4 w-4 shrink-0" strokeWidth={2.5} />
              )}
              {iosLinkCopied
                ? bn
                  ? 'কপি হয়েছে'
                  : 'Copied'
                : bn
                  ? 'লিংক কপি করুন'
                  : 'Copy link'}
            </motion.button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <motion.button
              type="button"
              onClick={() => void installApp()}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className={cn(
                'flex w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black text-white sm:w-auto sm:py-3 sm:pl-5 sm:pr-6',
                'bg-gradient-to-b from-cyan-400 via-indigo-500 to-violet-600',
                'shadow-[0_4px_0_rgb(79,70,229),0_12px_28px_rgba(99,102,241,0.5)]',
                'border border-white/25 transition active:translate-y-0.5 active:shadow-[0_2px_0_rgb(79,70,229)]'
              )}
            >
              <motion.span
                animate={{ y: [0, 2, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Download className="h-4 w-4" strokeWidth={2.5} />
              </motion.span>
              {bn ? 'ইনস্টল' : 'Install'}
            </motion.button>
            {showReloadForPrompt && (
              <motion.button
                type="button"
                onClick={() => window.location.reload()}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/15 px-4 py-3 text-sm font-black text-white sm:w-auto',
                  'shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]'
                )}
              >
                <RefreshCw className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                {bn ? 'পেজ রিফ্রেশ' : 'Reload page'}
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
}
