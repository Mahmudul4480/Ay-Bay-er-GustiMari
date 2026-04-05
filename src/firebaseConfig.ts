import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";
import { getStorage } from "firebase/storage";

// Import the Firebase configuration from the generated file
import firebaseConfig from "../firebase-applet-config.json";

// Validate configuration before initialization to prevent crashes
export const isConfigValid = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

if (!isConfigValid && typeof window !== 'undefined') {
  console.error(
    "Firebase configuration is missing required values in firebase-applet-config.json. " +
    "Please ensure Firebase setup is complete."
  );
}

// Initialize Firebase only if config is valid, or provide a dummy app to prevent crashes
const app = isConfigValid 
  ? initializeApp(firebaseConfig) 
  : initializeApp({ apiKey: "dummy", projectId: "dummy", appId: "dummy" });

const analytics = isConfigValid && typeof window !== 'undefined' && firebaseConfig.measurementId 
  ? getAnalytics(app) 
  : null;

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

// Use the firestoreDatabaseId if provided in the config, otherwise default
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// ────────────────────────────────────────────────
// Firebase Cloud Messaging (lazy-loaded, browser-only)
// ────────────────────────────────────────────────
let _messaging: Messaging | null = null;

/**
 * Returns the Firebase Messaging instance, or null if the browser doesn't
 * support FCM (e.g. Safari without notification support, service-worker
 * blocked environments, etc.).
 */
export const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (!isConfigValid || typeof window === 'undefined') return null;
  if (_messaging) return _messaging;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    _messaging = getMessaging(app);
    return _messaging;
  } catch (err) {
    console.warn("Firebase Messaging not available:", err);
    return null;
  }
};

export const isInAppBrowser = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  return (
    ua.indexOf('FBAN') > -1 || 
    ua.indexOf('FBAV') > -1 || 
    ua.indexOf('Messenger') > -1 || 
    ua.indexOf('Instagram') > -1 ||
    ua.indexOf('Line') > -1 ||
    ua.indexOf('WhatsApp') > -1
  );
};

export const loginWithGoogle = () => {
  return signInWithPopup(auth, googleProvider);
};

export const logout = () => signOut(auth);

export { analytics };
export default app;
