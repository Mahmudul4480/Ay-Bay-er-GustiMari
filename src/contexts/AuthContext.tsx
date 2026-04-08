import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import {
  getDefaultCategoriesForNewUser,
  mergeUniqueCategoryLists,
  UNIVERSAL_EXPENSE_CATEGORIES,
  UNIVERSAL_INCOME_CATEGORIES,
} from '../lib/professionData';
import { detectClientDevice } from '../lib/deviceDetection';
import { getUserLocation } from '../services/locationService';

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
  /** Canonical completion flag (Firestore). */
  onboardingCompleted?: boolean;
  /** Legacy / mistaken field name — read-only fallback in routing. */
  onboardingComplete?: boolean;
  profession?: string;
  familyMembers?: string[];
  incomeCategories?: string[];
  expenseCategories?: string[];
  role?: 'admin' | 'user';
  fixedFinanceRolloverMonth?: string;
  forceRelogin?: boolean;
  hideFromAdminList?: boolean;
  adminRemovedAt?: unknown;
  createdAt?: unknown;
  /** Last dashboard/session activity; used for Welcome Back (>= 7 days inactive). */
  lastActive?: unknown;
  /** Set once per browser session on first profile sync after sign-in (admin list sort). */
  lastLoginAt?: unknown;
  /** Client OS/browser snapshot; updated with lastLoginAt each new session. */
  deviceInfo?: {
    os?: string;
    browser?: string;
    accessType?: string;
    deviceBrand?: string;
    lastSeen?: unknown;
  };
  /** Admin-only: AI new-user welcome push was queued. */
  aiWelcomeSent?: boolean;
  aiWelcomeSentAt?: unknown;
  /** IP-based coarse location (ipapi.co); updated at most once per browser session. */
  locationIntelligence?: {
    ip?: string;
    city?: string;
    region?: string;
    postal?: string;
    lastUpdated?: string;
  };
  /** Paid tier — unlocks Wealth Vault + auto-zakat outside Ramadan (admin-set). */
  isPremium?: boolean;
  /** Spending-derived persona (synced from Dashboard). */
  financialPersona?: {
    id?: string;
    label?: string;
    labelBn?: string;
    updatedAt?: unknown;
  };
  wishlist?: unknown[];
  wishlistUpdatedAt?: unknown;
  wealthVault?: Record<string, unknown>;
  wealthVaultUpdatedAt?: unknown;
  donations?: unknown[];
  donationsUpdatedAt?: unknown;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, userProfile: null });
const FORCE_RELOGIN_NOTICE_KEY = 'force-relogin-notice';

function sessionLocationIntelKey(uid: string) {
  return `gustimari_locationIntel_${uid}`;
}

/** True when setup is complete (supports legacy `onboardingComplete` field name). */
export function isOnboardingComplete(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.onboardingCompleted === true) return true;
  return profile.onboardingComplete === true;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLoginStampedForUid = useRef<string | null>(null);
  const lastKnownAuthUid = useRef<string | null>(null);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous profile listener if it exists
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      setUser(user);
      if (!user) {
        if (lastKnownAuthUid.current) {
          const prevUid = lastKnownAuthUid.current;
          sessionStorage.removeItem(`gustimari_lastLogin_${prevUid}`);
          sessionStorage.removeItem(sessionLocationIntelKey(prevUid));
          lastKnownAuthUid.current = null;
        }
        lastLoginStampedForUid.current = null;
        setUserProfile(null);
        setLoading(false);
        return;
      }

      lastKnownAuthUid.current = user.uid;
      setUserProfile(null);
      setLoading(true);
      const userDocRef = doc(db, 'users', user.uid);
      unsubscribeProfile = onSnapshot(
        userDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const profile = docSnap.data() as UserProfile;

            if (profile.forceRelogin) {
              sessionStorage.setItem(
                FORCE_RELOGIN_NOTICE_KEY,
                'Your session was reset by the admin. Please sign in again.'
              );
              updateDoc(userDocRef, { forceRelogin: false }).catch((err) => {
                console.error('Failed to clear forceRelogin flag:', err);
              });
              signOut(auth).catch((err) => {
                console.error('Forced sign-out failed:', err);
              });
              setUserProfile(null);
              setLoading(false);
              return;
            }

            setUserProfile(profile);

            // One lastLoginAt write per browser session per uid (admin sorts by recent login).
            if (lastLoginStampedForUid.current !== user.uid) {
              const sessKey = `gustimari_lastLogin_${user.uid}`;
              if (!sessionStorage.getItem(sessKey)) {
                sessionStorage.setItem(sessKey, '1');
                lastLoginStampedForUid.current = user.uid;
                const { os, browser, accessType, deviceBrand } = detectClientDevice();
                void updateDoc(userDocRef, {
                  lastLoginAt: serverTimestamp(),
                  deviceInfo: {
                    os,
                    browser,
                    accessType,
                    deviceBrand,
                    lastSeen: serverTimestamp(),
                  },
                }).catch((err) => {
                  console.warn('[Auth] lastLoginAt / deviceInfo update skipped:', err);
                });
              } else {
                lastLoginStampedForUid.current = user.uid;
              }
            }

            if (profile.hideFromAdminList) {
              updateDoc(userDocRef, {
                hideFromAdminList: false,
                adminRemovedAt: null,
              }).catch((err) => {
                console.error('Failed to restore admin-list visibility:', err);
              });
            }

            void initializeUniversalCategories(user.uid, profile.expenseCategories);

            // IP / geo snapshot once per tab session (sessionStorage) to limit ipapi calls.
            const locKey = sessionLocationIntelKey(user.uid);
            if (!sessionStorage.getItem(locKey)) {
              sessionStorage.setItem(locKey, '1');
              void (async () => {
                const loc = await getUserLocation();
                if (!loc) return;
                try {
                  // setDoc + merge: only touches top-level keys we send; other profile fields stay intact.
                  await setDoc(
                    userDocRef,
                    {
                      locationIntelligence: {
                        ip: loc.ip,
                        city: loc.city,
                        region: loc.region,
                        postal: loc.postalCode,
                        lastUpdated: new Date().toISOString(),
                      },
                    },
                    { merge: true },
                  );
                } catch (err) {
                  console.warn('[Auth] locationIntelligence update skipped:', err);
                }
              })();
            }

            setLoading(false);
          } else {
            // Create profile only if missing — never merge default arrays/flags onto an
            // existing doc (late setDoc used to overwrite onboardingCompleted, profession,
            // phoneNumber, and category lists after redirect or parallel writes).
            const initialCats = getDefaultCategoriesForNewUser();
            const incomeCategories = mergeUniqueCategoryLists([
              UNIVERSAL_INCOME_CATEGORIES,
              initialCats.income,
            ]);
            const expenseCategories = mergeUniqueCategoryLists([
              UNIVERSAL_EXPENSE_CATEGORIES,
              initialCats.expense,
            ]);
            const { os, browser, accessType, deviceBrand } = detectClientDevice();
            const newProfile: Record<string, unknown> = {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              language: 'en',
              budgetLimit: 0,
              familyMembers: ['Self'],
              incomeCategories,
              expenseCategories,
              createdAt: serverTimestamp(),
              role: user.email === 'chotan4480@gmail.com' ? 'admin' : 'user',
              deviceInfo: {
                os,
                browser,
                accessType,
                deviceBrand,
                lastSeen: serverTimestamp(),
              },
            };
            void (async () => {
              try {
                await runTransaction(db, async (transaction) => {
                  const snap = await transaction.get(userDocRef);
                  if (snap.exists()) return;
                  transaction.set(userDocRef, newProfile);
                });
                const snap = await getDoc(userDocRef);
                if (snap.exists()) {
                  setUserProfile(snap.data() as UserProfile);
                }
              } catch (err) {
                handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
                try {
                  const snap = await getDoc(userDocRef);
                  if (snap.exists()) {
                    setUserProfile(snap.data() as UserProfile);
                  }
                } catch {
                  /* ignore */
                }
              } finally {
                setLoading(false);
              }
            })();
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          setLoading(false);
        },
      );
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
