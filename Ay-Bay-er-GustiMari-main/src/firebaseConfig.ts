import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore, getDocFromServer, doc } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0TpWdNba9OkLieali8mmvYvjTLw8qhYA",
  authDomain: "ay-bay-er-gustimari.firebaseapp.com",
  projectId: "ay-bay-er-gustimari",
  storageBucket: "ay-bay-er-gustimari.firebasestorage.app",
  messagingSenderId: "527277956714",
  appId: "1:527277956714:web:c5cf790b15f8715262b413",
  measurementId: "G-XJ2JN9LG1P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export const auth = getAuth(app);

/** Resolves after LOCAL persistence is enabled (reloads + embedded browsers like Facebook in-app). */
export const authReady = setPersistence(auth, browserLocalPersistence);

export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);

// Test connection to Firestore
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}
testConnection();

export default app;
