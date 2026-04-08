/**
 * Irregular user = last app open (lastActive) was >= 7 days ago.
 * On Dashboard: Welcome Back modal + in-app notification + lastActive refresh.
 *
 * All user-doc writes use `updateDoc` / `batch.update` with only `lastActive` (and
 * notification subcollection docs) — never `setDoc` without merge, so phoneNumber,
 * profession, and onboarding flags cannot be wiped by this hook.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Timestamp } from 'firebase/firestore';

const WELCOME_TITLE = 'আবার ফিরে আসার জন্য ধন্যবাদ!';
const WELCOME_BODY =
  'আপনাকে আবার পেয়ে আমরা আনন্দিত। আপনার আয়-ব্যয়ের হিসাব আজই আপডেট করুন!';
const WELCOME_CATEGORY = 'Welcome';
const MS_PER_DAY = 86_400_000;
const IRREGULAR_DAYS = 7;

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof (value as Timestamp).toDate === 'function') {
    try {
      return (value as Timestamp).toDate();
    } catch {
      return null;
    }
  }
  if (value instanceof Date) return value;
  return null;
}

export interface UseWelcomeBackResult {
  showWelcomeModal: boolean;
  closeWelcomeModal: () => void;
  welcomeBackReady: boolean;
}

export function useWelcomeBack(userId: string | undefined): UseWelcomeBackResult {
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [ready, setReady] = useState(false);
  const cancelledRef = useRef(false);

  const closeWelcomeModal = useCallback(() => {
    setShowWelcomeModal(false);
  }, []);

  useEffect(() => {
    if (!userId) {
      setReady(true);
      return;
    }

    cancelledRef.current = false;

    const run = async () => {
      try {
        const userRef = doc(db, 'users', userId);
        const snap = await getDoc(userRef);
        if (cancelledRef.current || !snap.exists()) {
          setReady(true);
          return;
        }

        const lastDate = toDate(snap.data().lastActive);

        if (!lastDate) {
          await updateDoc(userRef, { lastActive: serverTimestamp() });
          setReady(true);
          return;
        }

        const daysSince = (Date.now() - lastDate.getTime()) / MS_PER_DAY;

        if (daysSince < IRREGULAR_DAYS) {
          await updateDoc(userRef, { lastActive: serverTimestamp() });
          setReady(true);
          return;
        }

        // >= 7 days — irregular. Dedupe Strict Mode / double effect using a key tied to
        // this inactivity period (lastActive ms). Next absence period gets a new key.
        const periodKey = `welcome-back-${userId}-${lastDate.getTime()}`;
        if (sessionStorage.getItem(periodKey) === '1') {
          await updateDoc(userRef, { lastActive: serverTimestamp() });
          setReady(true);
          return;
        }

        sessionStorage.setItem(periodKey, '1');

        try {
          const batch = writeBatch(db);
          const notifRef = doc(collection(db, 'users', userId, 'inAppNotifications'));
          batch.set(notifRef, {
            title: WELCOME_TITLE,
            body: WELCOME_BODY,
            url: `${window.location.origin}${window.location.pathname}#/`,
            read: false,
            blogId: '',
            category: WELCOME_CATEGORY,
            createdAt: serverTimestamp(),
          });
          batch.update(userRef, { lastActive: serverTimestamp() });
          await batch.commit();
        } catch (e) {
          sessionStorage.removeItem(periodKey);
          throw e;
        }

        if (!cancelledRef.current) {
          setShowWelcomeModal(true);
        }
      } catch (e) {
        console.error('[useWelcomeBack]', e);
      } finally {
        setReady(true);
      }
    };

    void run();

    return () => {
      cancelledRef.current = true;
    };
  }, [userId]);

  return {
    showWelcomeModal,
    closeWelcomeModal,
    welcomeBackReady: ready,
  };
}
