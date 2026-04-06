/**
 * useNotifications
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles the full FCM lifecycle for a logged-in user:
 *   1. Explicitly registers /firebase-messaging-sw.js (fixes
 *      messaging/failed-service-worker-registration in Chrome & Firefox)
 *   2. Requests browser Notification permission
 *   3. Generates an FCM token (passing serviceWorkerRegistration to getToken)
 *   4. Saves / refreshes the token in Firestore → users/{userId}.fcmToken
 *   5. Listens for foreground messages and shows a native Notification
 *
 * Usage (inside a component that already has an authenticated user):
 *   const { permissionStatus, tokenStatus } = useNotifications(user?.uid);
 */

import { useEffect, useRef, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseMessaging, db } from '../firebaseConfig';

// ── VAPID public key (Firebase Console → Project Settings → Cloud Messaging) ─
const VAPID_KEY =
  'BENgsvmvfY7BtFcIXvRZkDa17oLJOcaGXDI1CaaBjzKP7j091wpf70bE90osY9oV7zm5wUP1pNEH4-053uZLAQA';

// ── Types ────────────────────────────────────────────────────────────────────

export type PermissionStatus =
  | 'idle'          // not yet attempted
  | 'requesting'    // waiting for user response
  | 'granted'       // user approved
  | 'denied'        // user blocked or dismissed permanently
  | 'unsupported';  // browser cannot support notifications

export type TokenStatus =
  | 'idle'     // not yet attempted
  | 'loading'  // fetching token from FCM
  | 'saved'    // token received + written to Firestore
  | 'error';   // any step failed (see console for details)

export interface NotificationState {
  permissionStatus: PermissionStatus;
  tokenStatus: TokenStatus;
  token: string | null;
}

// ── Helper: register the service worker ──────────────────────────────────────
/**
 * Explicitly registers /firebase-messaging-sw.js.
 * Passing this registration to getToken() prevents
 * "messaging/failed-service-worker-registration" in Chrome ≥ 109 and Firefox.
 */
async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    // Register (or get the existing registration — browsers de-duplicate by URL)
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/',
    });
    // Wait until the SW is active so getToken can use it immediately
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('[useNotifications] Service Worker registration failed:', err);
    return null;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useNotifications(userId: string | undefined): NotificationState {
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('idle');
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>('idle');
  const [token, setToken] = useState<string | null>(null);

  // Prevent double-initialisation if the parent re-renders without uid changing
  const runningRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || runningRef.current === userId) return;
    runningRef.current = userId;

    let unsubForeground: (() => void) | undefined;

    const init = async () => {
      // ── Step 1: browser support check ──────────────────────────────────
      if (
        typeof window === 'undefined' ||
        !('Notification' in window) ||
        !('serviceWorker' in navigator)
      ) {
        setPermissionStatus('unsupported');
        console.warn('[useNotifications] Browser does not support notifications or service workers.');
        return;
      }

      // ── Step 2: request notification permission ─────────────────────────
      setPermissionStatus('requesting');

      let permission = Notification.permission;

      if (permission === 'default') {
        try {
          // Must be called in a browser context (not SSR); usually needs no user gesture
          permission = await Notification.requestPermission();
        } catch (err) {
          console.warn('[useNotifications] Notification.requestPermission() threw:', err);
          setPermissionStatus('denied');
          return;
        }
      }

      if (permission !== 'granted') {
        setPermissionStatus('denied');
        console.info('[useNotifications] Notification permission not granted:', permission);
        return;
      }

      setPermissionStatus('granted');

      // ── Step 3: get Firebase Messaging instance ─────────────────────────
      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        // isSupported() returned false — common in Firefox private mode, old Safari, etc.
        setPermissionStatus('unsupported');
        console.warn('[useNotifications] Firebase Messaging is not supported in this browser.');
        return;
      }

      // ── Step 4: register service worker explicitly ──────────────────────
      // This is the most common fix for messaging/failed-service-worker-registration.
      // Even if it fails we still attempt getToken (Chrome sometimes auto-finds the SW).
      const swRegistration = await registerMessagingServiceWorker();

      // ── Step 5: generate FCM token ──────────────────────────────────────
      setTokenStatus('loading');
      let fcmToken: string;

      try {
        fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          // Passing the explicit registration is the key fix:
          ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
        });

        if (!fcmToken) {
          console.warn('[useNotifications] getToken returned empty string.');
          setTokenStatus('error');
          return;
        }

        setToken(fcmToken);
        console.info('[useNotifications] FCM token obtained.');
      } catch (err) {
        console.error('[useNotifications] getToken failed:', err);
        setTokenStatus('error');
        return;
      }

      // ── Step 6: save token to Firestore ────────────────────────────────
      try {
        await updateDoc(doc(db, 'users', userId), {
          fcmToken: fcmToken,
          fcmTokenUpdatedAt: serverTimestamp(),
        });
        setTokenStatus('saved');
        console.info('[useNotifications] FCM token saved to Firestore.');
      } catch (err) {
        // Non-fatal: token was generated; only persistence failed.
        console.error('[useNotifications] Failed to save token to Firestore:', err);
        setTokenStatus('error');
      }

      // ── Step 7: foreground message listener ────────────────────────────
      // Background/closed tab: firebase-messaging-sw.js shows the OS notification.
      // Foreground (this tab active): SW does not run — we must show a Notification
      // or the user only sees the in-app bell after Firestore sync.
      unsubForeground = onMessage(messaging, (payload) => {
        const title =
          payload.notification?.title ?? 'Ay Bay Er GustiMari';
        const body = payload.notification?.body ?? '';
        const data = (payload.data ?? {}) as Record<string, string>;
        const url = data.url ?? data.clickAction ?? '/';

        console.info('[useNotifications] Foreground FCM message:', {
          title,
          body,
          url,
        });

        if (Notification.permission === 'granted' && (title || body)) {
          try {
            const n = new Notification(title, {
              body,
              icon: 'https://i.postimg.cc/K8yGqVdy/logo-png.png',
              tag: 'gustimari-fg',
              data: { url },
            });
            n.onclick = () => {
              window.focus();
              const u = url.startsWith('http')
                ? url
                : `${window.location.origin}${window.location.pathname}${url.startsWith('#') ? url : `#${url}`}`;
              window.location.href = u;
              n.close();
            };
          } catch (e) {
            console.warn('[useNotifications] Foreground Notification() failed:', e);
          }
        }
      });
    };

    void init();

    return () => {
      // Unsubscribe foreground listener on unmount / uid change
      unsubForeground?.();
      // Allow re-initialisation if userId changes (e.g. user switches accounts)
      runningRef.current = null;
    };
  }, [userId]);

  return { permissionStatus, tokenStatus, token };
}
