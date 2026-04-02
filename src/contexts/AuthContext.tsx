import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface AuthContextType {
// ... (rest of the interface)
  user: User | null;
  loading: boolean;
  userProfile: any | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, userProfile: null });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous profile listener if it exists
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(user);
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          } else {
            // Create profile if it doesn't exist
            const newProfile = {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              language: 'en',
              budgetLimit: 0,
              phoneNumber: '',
              onboardingCompleted: false,
              familyMembers: ['Self'],
              incomeCategories: ['Salary', 'Business', 'Gift', 'Investment', 'Other'],
              expenseCategories: ['Food', 'Rent', 'Utilities', 'Transport', 'Entertainment', 'Health', 'Education', 'Shopping', 'Other'],
              createdAt: serverTimestamp(),
              role: user.email === 'chotan4480@gmail.com' ? 'admin' : 'user'
            };
            setDoc(userDocRef, newProfile).catch(err => {
              handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
            });
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          setLoading(false);
        });
      } else {
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, userProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
