import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// .env ফাইল থেকে কনফিগারেশন লোড করা হচ্ছে
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const auth = getAuth(app);

// Persistence সেট করা
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Failed to set auth persistence:", err);
});

export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// গুগল অথোরাইজেশন এর জন্য ডোমেইন ইস্যু এড়াতে কিছু অতিরিক্ত কনফিগারেশন
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const isInAppBrowser = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
  return /FBAN|FBAV|Messenger|Instagram|Line|WhatsApp/i.test(ua);
};

export const loginWithGoogle = () => {
  // যদি লোকালহোস্ট বা ভেরসেল ডোমেইন অথোরাইজড ডোমেইন লিস্টে থাকে, তবে এটি কাজ করবে
  return signInWithPopup(auth, googleProvider);
};

export const logout = () => signOut(auth);

export default app;
