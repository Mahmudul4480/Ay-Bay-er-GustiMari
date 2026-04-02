import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

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
  : initializeApp({ apiKey: "dummy", projectId: "dummy", appId: "dummy" }); // Minimal dummy config to prevent SDK crashes

const analytics = isConfigValid && typeof window !== 'undefined' && firebaseConfig.measurementId 
  ? getAnalytics(app) 
  : null;

export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

// Use the firestoreDatabaseId if provided in the config, otherwise default
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
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
  return signInWithPopup(auth, googleProvider);
};

export const logout = () => signOut(auth);

export default app;
