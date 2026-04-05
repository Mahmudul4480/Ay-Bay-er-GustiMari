// Auto-registers the user's FCM token on login and sets up foreground listener
import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getFcmToken,
  saveFcmTokenToFirestore,
  setupForegroundMessageListener,
} from '../lib/fcmUtils';

export function useFcmToken() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let unsubForeground: (() => void) | undefined;

    const init = async () => {
      // Register / refresh token
      const token = await getFcmToken();
      if (token) {
        await saveFcmTokenToFirestore(user.uid, token);
      }
      // Start listening for foreground messages
      unsubForeground = await setupForegroundMessageListener();
    };

    void init();

    return () => {
      unsubForeground?.();
    };
  }, [user?.uid]);
}
