import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, getDocFromServer, doc } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

// Use the firestoreDatabaseId if provided in the config
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || "(default)");
export const googleProvider = new GoogleAuthProvider();

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
  if (isInAppBrowser()) {
    // We'll handle the UI message in the component, but let's keep the function safe
    return signInWithPopup(auth, googleProvider);
  }
  return signInWithPopup(auth, googleProvider);
};
export const logout = () => signOut(auth);

export default app;
