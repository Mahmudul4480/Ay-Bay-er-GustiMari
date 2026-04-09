/**
 * PWA install flow — captures `beforeinstallprompt` (Chrome, Edge, Samsung Internet, etc.)
 * and exposes a programmatic install. iOS Safari does not fire this event; use
 * `showIOSInstallGuide` for Share → Add to Home Screen instructions.
 */

import { useCallback, useEffect, useState } from 'react';
import { isMobileOrTabletBrowserClient } from '../lib/deviceDetection';
import {
  type PWAInstallPromptEvent,
  PWA_DEFERRED_CHANGED,
  clearCapturedDeferredPrompt,
  getCapturedDeferredPrompt,
} from '../lib/pwaInstallCapture';

const DISMISS_KEY = 'pwa-install-banner-dismissed';

export type { PWAInstallPromptEvent };

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const mm = window.matchMedia?.('(display-mode: standalone)');
  if (mm?.matches) return true;
  // iOS Safari when launched from home screen
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ may report as Mac
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export interface UsePWAReturn {
  /** Set after `beforeinstallprompt` — native install is available. */
  deferredPrompt: PWAInstallPromptEvent | null;
  isInstallable: boolean;
  /** True when the app is already installed (standalone / home screen). */
  isStandalone: boolean;
  /** iOS: no `beforeinstallprompt` — show manual “Add to Home Screen” steps. */
  showIOSInstallGuide: boolean;
  /** Android / tablet: no deferred prompt yet — show browser menu install steps. */
  showMobileManualInstall: boolean;
  /** User tapped “Later” — persisted in sessionStorage-style localStorage. */
  dismissed: boolean;
  dismiss: () => void;
  /** Triggers the browser install sheet; no-op if no deferred prompt. */
  installApp: () => Promise<void>;
}

export function usePWA(): UsePWAReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<PWAInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? getCapturedDeferredPrompt() : null
  );

  /** React state can lag behind `window.__pwaDeferredInstallPrompt` — merge every render for UI + installApp. */
  const effectiveDeferredPrompt =
    deferredPrompt ?? (typeof window !== 'undefined' ? getCapturedDeferredPrompt() : null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplay);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
    const onChange = () => setIsStandalone(isStandaloneDisplay());
    const mql = window.matchMedia?.('(display-mode: standalone)');
    mql?.addEventListener?.('change', onChange);
    return () => mql?.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const sync = () => setDeferredPrompt(getCapturedDeferredPrompt());
    sync();
    window.addEventListener(PWA_DEFERRED_CHANGED, sync);
    return () => window.removeEventListener(PWA_DEFERRED_CHANGED, sync);
  }, []);

  /** Late `beforeinstallprompt` (e.g. after SW ready) — nudge React state without waiting for user interaction. */
  useEffect(() => {
    const id = window.setInterval(() => {
      const w = getCapturedDeferredPrompt();
      if (w) setDeferredPrompt((prev) => prev ?? w);
    }, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 15000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, []);

  const installApp = useCallback(async () => {
    const ev = getCapturedDeferredPrompt() ?? deferredPrompt;
    if (!ev) return;
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch (err) {
      console.warn('[usePWA] install prompt failed:', err);
    } finally {
      clearCapturedDeferredPrompt();
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const isInstallable = effectiveDeferredPrompt !== null;
  const showIOSInstallGuide =
    !isStandalone && isIOSDevice() && !isInstallable;
  /**
   * Many mobile browsers never fire `beforeinstallprompt` (or fire late). Desktop Chrome
   * often fires it immediately — that’s why the bar appeared only on desktop before.
   */
  const showMobileManualInstall =
    !isStandalone &&
    !isInstallable &&
    !showIOSInstallGuide &&
    isMobileOrTabletBrowserClient();

  return {
    deferredPrompt: effectiveDeferredPrompt,
    isInstallable,
    isStandalone,
    showIOSInstallGuide,
    showMobileManualInstall,
    dismissed,
    dismiss,
    installApp,
  };
}
