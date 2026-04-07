/**
 * PWA install flow — captures `beforeinstallprompt` (Chrome, Edge, Samsung Internet, etc.)
 * and exposes a programmatic install. iOS Safari does not fire this event; use
 * `showIOSInstallGuide` for Share → Add to Home Screen instructions.
 */

import { useCallback, useEffect, useState } from 'react';

const DISMISS_KEY = 'pwa-install-banner-dismissed';

/** Narrow type for the deferred install event (not in all TS lib DOM typings). */
export interface PWAInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

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
  /** User tapped “Later” — persisted in sessionStorage-style localStorage. */
  dismissed: boolean;
  dismiss: () => void;
  /** Triggers the browser install sheet; no-op if no deferred prompt. */
  installApp: () => Promise<void>;
}

export function usePWA(): UsePWAReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<PWAInstallPromptEvent | null>(null);
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
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as PWAInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installApp = useCallback(async () => {
    const ev = deferredPrompt;
    if (!ev) return;
    try {
      await ev.prompt();
      await ev.userChoice;
    } catch (err) {
      console.warn('[usePWA] install prompt failed:', err);
    } finally {
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

  const isInstallable = deferredPrompt !== null;
  const showIOSInstallGuide =
    !isStandalone && isIOSDevice() && !isInstallable;

  return {
    deferredPrompt,
    isInstallable,
    isStandalone,
    showIOSInstallGuide,
    dismissed,
    dismiss,
    installApp,
  };
}
