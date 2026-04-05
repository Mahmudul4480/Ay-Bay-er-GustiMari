import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import {
  getDefaultCategoriesForNewUser,
  mergeUniqueCategoryLists,
  UNIVERSAL_EXPENSE_CATEGORIES,
  UNIVERSAL_INCOME_CATEGORIES,
} from '../lib/professionData';

/**
 * Category initialization uses universal lists from `professionData` (single source of truth).
 * Universal expense: Medicine, Hospital, Kacabazar, Sukna Bazar, Family Entertainment,
 * Credit Card Bill, Loan Installment, Shopping, Food, Gift, Utilities, Mobile/Internet, Transport.
 * These are merged into every new user doc and into profession saves (see ProfessionSelector / Settings).
 */

/**
 * Adds universal expense categories to `users/{userId}` only when missing (case-insensitive).
 * Safe for existing users; does not remove or rename existing entries.
 * Pass `existingExpenseCategories` from a snapshot to avoid an extra getDoc.
 */
export async function initializeUniversalCategories(
  userId: string,
  existingExpenseCategories?: string[]
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  let existing: string[];
  if (existingExpenseCategories !== undefined) {
    existing = existingExpenseCategories;
  } else {
    let snap;
    try {
      snap = await getDoc(userRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, `users/${userId}`);
      return;
    }
    if (!snap.exists()) return;
    existing = (snap.data().expenseCategories as string[] | undefined) ?? [];
  }

  const existingLower = new Set(
    existing.map((c) => String(c).trim().toLowerCase()).filter(Boolean)
  );
  const missing = UNIVERSAL_EXPENSE_CATEGORIES.filter(
    (u) => !existingLower.has(u.trim().toLowerCase())
  );
  if (missing.length === 0) return;

  const merged = mergeUniqueCategoryLists([UNIVERSAL_EXPENSE_CATEGORIES, existing]);
  try {
    await updateDoc(userRef, { expenseCategories: merged });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
  }
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userProfile: UserProfile | null;
}

/** Firestore user document shape (subset used in the app) */
export interface UserProfile {
  uid?: string;
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  language?: string;
  budgetLimit?: number;
  phoneNumber?: string;
  onboardingCompleted?: boolean;
  profession?: string;
  familyMembers?: string[];
  incomeCategories?: string[];
  expenseCategories?: string[];
  role?: 'admin' | 'user';
  fixedFinanceRolloverMonth?: string;
  createdAt?: unknown;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, userProfile: null });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
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
            const profile = docSnap.data() as UserProfile;
            setUserProfile(profile);
            void initializeUniversalCategories(user.uid, profile.expenseCategories);
          } else {
            // Create profile if it doesn't exist — universals + starter lists, deduped
            const initialCats = getDefaultCategoriesForNewUser();
            const incomeCategories = mergeUniqueCategoryLists([
              UNIVERSAL_INCOME_CATEGORIES,
              initialCats.income,
            ]);
            const expenseCategories = mergeUniqueCategoryLists([
              UNIVERSAL_EXPENSE_CATEGORIES,
              initialCats.expense,
            ]);
            const newProfile: Record<string, unknown> = {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              language: 'en',
              budgetLimit: 0,
              phoneNumber: '',
              profession: '',
              onboardingCompleted: false,
              familyMembers: ['Self'],
              incomeCategories,
              expenseCategories,
              createdAt: serverTimestamp(),
              role: user.email === 'chotan4480@gmail.com' ? 'admin' : 'user',
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
