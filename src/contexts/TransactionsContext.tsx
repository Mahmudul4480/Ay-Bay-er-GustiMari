import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { getCurrentMonthKey } from '../lib/monthUtils';
import { applyMonthlyFixedFinanceRollover } from '../services/monthlyFixedFinanceRollover';

export interface Transaction {
  id: string;
  amount: number;
  type: 'income' | 'expense' | 'debt_repayment';
  category: string;
  date: Timestamp;
  note: string;
  familyMember: string;
  userId: string;
  debtId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  /** Set when created by monthly fixed-finance rollover */
  source?: 'fixed_finance_rollover';
  sourceFixedFinanceId?: string;
  rolloverMonthKey?: string;
}

export interface Debt {
  id: string;
  personName: string;
  amount: number;
  type: 'lent' | 'borrowed';
  description: string;
  dueDate: Timestamp;
  status: 'unpaid' | 'paid';
  phoneNumber?: string;
  userId: string;
}

export interface FixedFinance {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  dayOfMonth: number;
  userId: string;
}

export interface TransactionsContextValue {
  transactions: Transaction[];
  debts: Debt[];
  fixedFinances: FixedFinance[];
  loading: boolean;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

/**
 * Single Firestore subscription for transactions, debts, and fixed finances per signed-in user.
 * Mount once under the authenticated app shell so tab switches do not attach duplicate listeners.
 */
export function TransactionsProvider({ children }: { children: React.ReactNode }) {
  const { user, userProfile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [fixedFinances, setFixedFinances] = useState<FixedFinance[]>([]);
  const [loading, setLoading] = useState(true);
  const rolloverInFlight = useRef(false);
  const rolloverRanMonth = useRef<string | null>(null);
  /** Latest fixed finances for rollover — avoids re-running rollover on every fixedFinances snapshot. */
  const fixedFinancesRef = useRef<FixedFinance[]>([]);

  useEffect(() => {
    rolloverRanMonth.current = null;
    rolloverInFlight.current = false;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setDebts([]);
      setFixedFinances([]);
      fixedFinancesRef.current = [];
      setLoading(true);
      return;
    }

    const qTransactions = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid)
    );

    const qDebts = query(
      collection(db, 'debts'),
      where('userId', '==', user.uid)
    );

    const qFixed = query(
      collection(db, 'fixedFinances'),
      where('userId', '==', user.uid)
    );

    let transactionsLoaded = false;
    let debtsLoaded = false;
    let fixedLoaded = false;

    const checkLoading = () => {
      if (transactionsLoaded && debtsLoaded && fixedLoaded) {
        setLoading(false);
      }
    };

    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      const seenIds = new Set<string>();
      const docs: Transaction[] = [];
      snapshot.docs.forEach((d) => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        docs.push({ id: d.id, ...d.data() } as Transaction);
      });

      const getTime = (val: unknown) => {
        if (!val) return 0;
        if (typeof (val as { toMillis?: () => number }).toMillis === 'function')
          return (val as { toMillis: () => number }).toMillis();
        if (val instanceof Date) return val.getTime();
        if (typeof val === 'number') return val;
        const d = new Date(val as string | number);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      };

      docs.sort((a, b) => {
        const timeA = getTime(a.date);
        const timeB = getTime(b.date);

        if (timeA !== timeB) {
          return timeB - timeA;
        }

        const getCreatedTime = (val: unknown) => {
          if (!val) return Date.now() + 1000000;
          return getTime(val);
        };

        const createdA = getCreatedTime(a.createdAt || a.updatedAt);
        const createdB = getCreatedTime(b.createdAt || b.updatedAt);

        return createdB - createdA;
      });

      setTransactions(docs);
      transactionsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
      transactionsLoaded = true;
      checkLoading();
    });

    const unsubscribeDebts = onSnapshot(qDebts, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Debt));
      docs.sort((a, b) => {
        const getTime = (val: unknown) => {
          if (!val) return 0;
          if (typeof (val as { toMillis?: () => number }).toMillis === 'function')
            return (val as { toMillis: () => number }).toMillis();
          if (val instanceof Date) return val.getTime();
          if (typeof val === 'number') return val;
          const d = new Date(val as string | number);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        return getTime(a.dueDate) - getTime(b.dueDate);
      });
      setDebts(docs);
      debtsLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'debts');
      debtsLoaded = true;
      checkLoading();
    });

    const unsubscribeFixed = onSnapshot(qFixed, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FixedFinance));
      fixedFinancesRef.current = list;
      setFixedFinances(list);
      fixedLoaded = true;
      checkLoading();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fixedFinances');
      fixedLoaded = true;
      checkLoading();
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeDebts();
      unsubscribeFixed();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !userProfile || userProfile.onboardingCompleted === false) return;
    if (loading) return;

    const monthKey = getCurrentMonthKey();
    // One rollover per calendar month; user doc flag prevents re-runs after "Reset current month"
    // (rollover tx docs may be deleted but fixedFinanceRolloverMonth stays set for that month).
    if (userProfile.fixedFinanceRolloverMonth === monthKey) {
      rolloverRanMonth.current = monthKey;
      return;
    }
    if (rolloverInFlight.current || rolloverRanMonth.current === monthKey) return;

    rolloverInFlight.current = true;
    let cancelled = false;

    (async () => {
      try {
        await applyMonthlyFixedFinanceRollover(user.uid, fixedFinancesRef.current, monthKey);
        if (!cancelled) rolloverRanMonth.current = monthKey;
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'monthlyFixedFinanceRollover');
      } finally {
        rolloverInFlight.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, userProfile, loading]);

  const value: TransactionsContextValue = { transactions, debts, fixedFinances, loading };

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions(): TransactionsContextValue {
  const ctx = useContext(TransactionsContext);
  if (!ctx) {
    throw new Error('useTransactions must be used within a TransactionsProvider');
  }
  return ctx;
}
