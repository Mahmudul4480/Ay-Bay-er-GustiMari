/**
 * Capture `beforeinstallprompt` before React mounts. Browsers fire it early; if we only
 * listen inside useEffect, we often miss the event while the omnibox still shows Install.
 */

export type PWAInstallPromptEvent = Event & {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

declare global {
  interface Window {
    __pwaDeferredInstallPrompt?: PWAInstallPromptEvent | null;
  }
}

export const PWA_DEFERRED_CHANGED = 'pwa-deferred-prompt-changed';

function notify() {
  window.dispatchEvent(new CustomEvent(PWA_DEFERRED_CHANGED));
}

export function initPwaInstallCapture(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __pwaInstallCaptureInit?: boolean };
  if (w.__pwaInstallCaptureInit) return;
  w.__pwaInstallCaptureInit = true;

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    window.__pwaDeferredInstallPrompt = e as PWAInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    window.__pwaDeferredInstallPrompt = null;
    notify();
  });
}

export function clearCapturedDeferredPrompt(): void {
  if (typeof window === 'undefined') return;
  window.__pwaDeferredInstallPrompt = null;
  notify();
}

export function getCapturedDeferredPrompt(): PWAInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return window.__pwaDeferredInstallPrompt ?? null;
}
