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

// ─── Token retrieval ─────────────────────────────────────────────────────────

export async function getFcmToken(): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging) return null;
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return null;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
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
 * Each entry has a single `targetUserId` so a Cloud Function can process
 * them individually and dispatch FCM via the Admin SDK.
 *
 * Returns a batchId string that groups all entries from the same campaign send.
 */
export interface NotificationQueueEntry {
  targetUserId: string;   // one entry per user
  title: string;
  body: string;
  link: string;           // deep link e.g. /#/blog/:id
  blogId: string;
  batchId: string;        // groups all entries from a single send action
  status: 'pending' | 'sent' | 'failed';
  createdAt: ReturnType<typeof serverTimestamp>;
}

export async function queueNotificationsForUsers(
  blogId: string,
  targetUserIds: string[],
  title: string,
  body: string
): Promise<string> {
  const link = `/#/blog/${blogId}`;
  const batchId = `batch_${Date.now()}`;

  // One document per user — Cloud Function picks each up independently
  await Promise.all(
    targetUserIds.map((targetUserId) =>
      addDoc(collection(db, 'notificationQueue'), {
        targetUserId,
        title,
        body,
        link,
        blogId,
        batchId,
        status: 'pending',
        createdAt: serverTimestamp(),
      } satisfies Omit<NotificationQueueEntry, 'createdAt'> & { createdAt: ReturnType<typeof serverTimestamp> })
    )
  );

  return batchId;
}
