/**
 * processNotificationQueue
 * ──────────────────────────────────────────────────────────────────────────────
 * Firestore-triggered Cloud Function (v2).
 *
 * Trigger : New document created in `notificationQueue/{docId}`
 * Purpose : Read the queued entry, look up the target user's FCM token from
 *           `users/{userId}`, send an FCM push notification via Admin SDK,
 *           write `users/{userId}/inAppNotifications` for the in-app bell UI,
 *           then update the queue doc to `status: "sent"` (or `"failed"`).
 *
 * Document schema (notificationQueue/{docId}):
 *   userId       – string  – Firestore UID of the recipient
 *   blogId       – string  – Firestore doc ID of the blog post
 *   title        – string  – notification title
 *   message      – string  – notification body shown on device
 *   clickAction  – string  – deep-link URL the user lands on after tapping
 *   batchId      – string  – groups all docs from one campaign send
 *   status       – "pending" | "sent" | "failed"
 *   createdAt    – Timestamp
 */

import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

// ── Admin SDK initialisation ──────────────────────────────────────────────────
// When deployed to Firebase, `initializeApp()` with no arguments automatically
// picks up the project credentials from the runtime environment.
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueEntry {
  userId: string;
  blogId: string;
  title: string;
  message: string;
  clickAction: string;
  batchId: string;
  status: "pending" | "sent" | "failed";
  createdAt: admin.firestore.Timestamp;
}

// ── Helper: mark queue doc terminal ──────────────────────────────────────────

async function markStatus(
  docRef: admin.firestore.DocumentReference,
  status: "sent" | "failed",
  extra?: Record<string, unknown>
): Promise<void> {
  await docRef.update({
    status,
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
}

// ── Cloud Function ────────────────────────────────────────────────────────────

export const processNotificationQueue = onDocumentCreated(
  {
    document: "notificationQueue/{docId}",
    // Run in the same region as your Firestore instance.
    // Change to "us-central1" if your Firestore is US-based.
    region: "asia-south1",
    // Retry on failure so transient errors don't silently drop notifications.
    retry: true,
  },
  async (event) => {
    const snap = event.data;

    // Guard: snapshot missing (shouldn't happen with onDocumentCreated, but be safe)
    if (!snap) {
      logger.warn("processNotificationQueue: event.data is undefined, skipping.");
      return;
    }

    const docRef = snap.ref;
    const data = snap.data() as QueueEntry;

    // ── 1. Skip docs that are already processed ─────────────────────────────
    // Happens if a retry fires after a previous run already succeeded.
    if (data.status !== "pending") {
      logger.info(`Skipping doc ${docRef.id}: status is already "${data.status}".`);
      return;
    }

    const { userId, title, message, clickAction, blogId } = data;

    logger.info(`Processing notification for user=${userId}, blog=${blogId}, doc=${docRef.id}`);

    // ── 2. Validate required fields ─────────────────────────────────────────
    if (!userId || !title || !message || !clickAction) {
      logger.error("Missing required fields in queue entry.", { docId: docRef.id, data });
      await markStatus(docRef, "failed", { error: "Missing required fields." });
      return;
    }

    // ── 3. Fetch the user's FCM token from Firestore ─────────────────────────
    let fcmToken: string | undefined;
    try {
      const userSnap = await db.collection("users").doc(userId).get();
      if (!userSnap.exists) {
        logger.warn(`User document not found for userId=${userId}`);
        await markStatus(docRef, "failed", { error: "User document not found." });
        return;
      }

      const userData = userSnap.data() as { fcmToken?: string; displayName?: string };
      fcmToken = userData?.fcmToken;

      if (!fcmToken) {
        logger.warn(`No FCM token for userId=${userId}. User may not have enabled notifications.`);
        // Not a hard failure — user simply hasn't granted permission yet.
        await markStatus(docRef, "failed", {
          error: "No FCM token registered for this user.",
        });
        return;
      }
    } catch (err) {
      logger.error("Error fetching user document.", { userId, err });
      await markStatus(docRef, "failed", { error: String(err) });
      return;
    }

    // ── 4. Send FCM push notification ────────────────────────────────────────
    const fcmMessage: admin.messaging.Message = {
      token: fcmToken,
      notification: {
        title,
        body: message,
      },
      // `data` payload is delivered even when the app is in the background.
      // The service-worker can read these to open the correct deep-link.
      // FCM `data` values must be strings (web + Admin SDK).
      data: {
        blogId: String(blogId ?? ""),
        url: String(clickAction ?? ""),
        clickAction: String(clickAction ?? ""),
      },
      webpush: {
        notification: {
          title,
          body: message,
          icon: "https://i.postimg.cc/K8yGqVdy/logo-png.png",
          badge: "https://i.postimg.cc/K8yGqVdy/logo-png.png",
          renotify: true,
          requireInteraction: true,
          // Vibration pattern (ms) for supported browsers / devices
          vibrate: [200, 100, 200],
        },
        fcmOptions: {
          // Opens this URL when the user taps the notification
          link: clickAction,
        },
        headers: {
          // Urgent priority so the notification arrives immediately
          Urgency: "high",
        },
      },
      android: {
        priority: "high",
        notification: {
          title,
          body: message,
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
          icon: "ic_launcher",
          channelId: "high_importance_channel",
          sound: "default",
          vibrateTimingsMillis: [0, 500, 200, 500],
          notificationCount: 1,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            alert: { title, body: message },
            sound: "default",
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    };

    try {
      const response = await messaging.send(fcmMessage);

      // ── 5. In-app notification (users/{userId}/inAppNotifications) ────────
      // Written immediately after a successful FCM send. Sub-collection is
      // created automatically on first .add(). Failure is logged but does not
      // revert the queue doc to failed (push already succeeded).
      try {
        await db
          .collection("users")
          .doc(userId)
          .collection("inAppNotifications")
          .add({
            title,
            body: message,
            url: clickAction,
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            blogId: blogId ?? "",
          });
        logger.info(`In-app notification saved for userId=${userId}`, {
          docId: docRef.id,
        });
      } catch (inAppErr) {
        logger.error("Failed to save in-app notification to Firestore.", {
          userId,
          docId: docRef.id,
          err: String(inAppErr),
        });
      }

      logger.info(`Notification sent successfully. messageId=${response}`, {
        userId,
        docId: docRef.id,
      });
      await markStatus(docRef, "sent", { fcmMessageId: response });
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code ?? "";
      const errMsg = String(err);

      logger.error("FCM send failed.", { userId, fcmToken, errCode, errMsg });

      // If the token is invalid/unregistered, remove it from the user doc
      // so we don't keep trying to send to a dead token.
      if (
        errCode === "messaging/invalid-registration-token" ||
        errCode === "messaging/registration-token-not-registered" ||
        errCode === "messaging/unregistered"
      ) {
        logger.info(`Removing stale FCM token for userId=${userId}`);
        await db.collection("users").doc(userId).update({
          fcmToken: admin.firestore.FieldValue.delete(),
          fcmTokenRemovedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await markStatus(docRef, "failed", { error: errMsg, fcmErrorCode: errCode });
    }
  }
);
