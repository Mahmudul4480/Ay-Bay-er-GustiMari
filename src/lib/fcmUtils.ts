// ─────────────────────────────────────────────────────────────────────────────
// FCM utilities — permission, token management, notification dispatch
// ─────────────────────────────────────────────────────────────────────────────
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFirebaseMessaging, db } from '../firebaseConfig';

// The VAPID public key from Firebase Console → Project Settings → Cloud Messaging
export const VAPID_KEY =
  'BENgsvmvfY7BtFcIXvRZkDa17oLJOcaGXDI1CaaBjzKP7j091wpf70bE90osY9oV7zm5wUP1pNEH4-053uZLAQA';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

// ─── Permission ──────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  const result = await Notification.requestPermission();
  return result as NotificationPermissionStatus;
}

// ─── Service worker registration (explicit, avoids failed-service-worker-registration) ──

async function getMessagingSwRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('SW registration failed:', err);
    return null;
  }
}

// ─── Token retrieval ─────────────────────────────────────────────────────────

export async function getFcmToken(): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return null;
    // Explicitly pass serviceWorkerRegistration to prevent
    // messaging/failed-service-worker-registration in Chrome ≥ 109 and Firefox
    const swReg = await getMessagingSwRegistration();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      ...(swReg ? { serviceWorkerRegistration: swReg } : {}),
    });
    return token || null;
  } catch (err) {
    console.warn('getFcmToken failed:', err);
    return null;
  }
}

// ─── Persist token in Firestore ───────────────────────────────────────────────

export async function saveFcmTokenToFirestore(userId: string, token: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', userId), {
      fcmToken: token,
      fcmTokenUpdatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('saveFcmTokenToFirestore failed:', err);
  }
}

// ─── Foreground message listener ─────────────────────────────────────────────
/**
 * Call once after the app mounts. When a push arrives while the tab is
 * in the foreground (the SW won't show it), this shows a browser notification.
 */
export async function setupForegroundMessageListener(): Promise<() => void> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return () => {};

  const unsub = onMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'Ay Bay Er GustiMari';
    const body  = payload.notification?.body  ?? '';
    const url   = (payload.data as Record<string, string>)?.url ?? '/';

    if (Notification.permission === 'granted') {
      const n = new Notification(title, {
        body,
        icon: 'https://i.postimg.cc/K8yGqVdy/logo-png.png',
        tag: 'gustimari-fg',
        data: { url },
      });
      n.onclick = () => {
        window.focus();
        window.location.hash = url.startsWith('#') ? url.slice(1) : url;
        n.close();
      };
    }
  });

  return unsub;
}

// ─── Browser Notification (for admin "Send Preview") ─────────────────────────
/**
 * Directly shows a browser Notification — no FCM round-trip.
 * Perfect for the admin "Send Preview" button.
 */
export async function sendBrowserPreviewNotification(
  title: string,
  body: string,
  url: string
): Promise<boolean> {
  const permission = await requestNotificationPermission();
  if (permission !== 'granted') return false;
  try {
    const n = new Notification(title, {
      body,
      icon: 'https://i.postimg.cc/K8yGqVdy/logo-png.png',
      tag: 'gustimari-preview',
      requireInteraction: false,
    });
    n.onclick = () => {
      window.focus();
      window.location.hash = url.startsWith('/') ? url : `/${url}`;
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

// ─── Queue notification for other users (Firestore queue) ────────────────────
/**
 * Creates one Firestore document per target user in `notificationQueue`.
 * Each entry has a single `userId` so a Cloud Function can process them
 * individually and dispatch FCM via the Admin SDK.
 *
 * Schema matches what the Cloud Function (processNotificationQueue) expects:
 *   userId       — who to notify
 *   blogId       — which blog to link to
 *   title        — notification title
 *   message      — notification body text
 *   clickAction  — full URL with hash route, e.g. …/#/blog/:blogId (matches in-app `/blog/:id`)
 *   status       — 'pending' until the Cloud Function processes it
 *   batchId      — groups all entries from a single campaign send
 *   createdAt    — server-side timestamp
 *
 * Returns a batchId string that groups all entries from the same campaign send.
 */
export interface NotificationQueueEntry {
  userId: string;          // one entry per user
  blogId: string;
  title: string;
  message: string;         // notification body shown on device
  clickAction: string;     // deep-link e.g. https://domain.com/#/blog/:id
  batchId: string;         // groups all entries from a single send action
  status: 'pending' | 'sent' | 'failed';
  createdAt: ReturnType<typeof serverTimestamp>;
}

export async function queueNotificationsForUsers(
  blogId: string,
  targetUserIds: string[],
  title: string,
  message: string,
): Promise<string> {
  const clickAction = `${window.location.origin}${window.location.pathname}#/blog/${blogId}`;
  const batchId = `batch_${Date.now()}`;

  // One document per user — Cloud Function picks each up independently
  await Promise.all(
    targetUserIds.map((userId) =>
      addDoc(collection(db, 'notificationQueue'), {
        userId,
        blogId,
        title,
        message,
        clickAction,
        batchId,
        status: 'pending',
        createdAt: serverTimestamp(),
      } satisfies Omit<NotificationQueueEntry, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> }),
    ),
  );

  return batchId;
}

/**
 * Bulk manual notifications (no blog): same `batchId`, `blogId: 'manual'`, home `clickAction`.
 */
export async function queueManualNotificationsForUsers(
  targetUserIds: string[],
  title: string,
  message: string,
): Promise<string> {
  if (targetUserIds.length === 0) return `batch_${Date.now()}`;
  const batchId = `batch_${Date.now()}`;
  const clickAction = `${window.location.origin}${window.location.pathname}#/`;
  await Promise.all(
    targetUserIds.map((userId) =>
      addDoc(collection(db, 'notificationQueue'), {
        userId,
        blogId: 'manual',
        title,
        message,
        clickAction,
        batchId,
        status: 'pending',
        createdAt: serverTimestamp(),
      } satisfies Omit<NotificationQueueEntry, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> }),
    ),
  );
  return batchId;
}

/**
 * Queues a single notification for one user (same schema as `queueNotificationsForUsers`).
 * Use when no blog exists: `blogId` is stored as `manual` and the tap target is the app home (`#/`).
 */
export async function queueNotificationForUser(
  userId: string,
  title: string,
  message: string,
  options?: { blogId?: string | null },
): Promise<string> {
  const rawBlogId = options?.blogId?.trim();
  const hasBlog = Boolean(rawBlogId && rawBlogId !== 'manual');
  const blogId = hasBlog ? rawBlogId! : 'manual';
  const clickAction = hasBlog
    ? `${window.location.origin}${window.location.pathname}#/blog/${blogId}`
    : `${window.location.origin}${window.location.pathname}#/`;
  const batchId = `batch_${Date.now()}`;

  await addDoc(collection(db, 'notificationQueue'), {
    userId,
    blogId,
    title,
    message,
    clickAction,
    batchId,
    status: 'pending',
    createdAt: serverTimestamp(),
  } satisfies Omit<NotificationQueueEntry, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> });

  return batchId;
}
