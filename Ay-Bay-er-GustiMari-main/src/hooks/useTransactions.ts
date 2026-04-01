import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

export interface Transaction {
// ... (rest of the interface)
  id: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: Timestamp;
  note: string;
  familyMember: string;
  userId: string;
  debtId?: string;
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

export const useTransactions = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [fixedFinances, setFixedFinances] = useState<FixedFinance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setDebts([]);
      setFixedFinances([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const qTransactions = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const qDebts = query(
      collection(db, 'debts'),
      where('userId', '==', user.uid),
      orderBy('dueDate', 'asc')
    );

    const qFixed = query(
      collection(db, 'fixedFinances'),
      where('userId', '==', user.uid)
    );

    let pending = 3;
    const markInitialLoadOnce = (seen: { current: boolean }) => {
      if (seen.current) return;
      seen.current = true;
      pending -= 1;
      if (pending <= 0) setLoading(false);
    };
    const txSeen = { current: false };
    const debtsSeen = { current: false };
    const fixedSeen = { current: false };

    const unsubscribeTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
      markInitialLoadOnce(txSeen);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    const unsubscribeDebts = onSnapshot(qDebts, (snapshot) => {
      setDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt)));
      markInitialLoadOnce(debtsSeen);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'debts');
    });

    const unsubscribeFixed = onSnapshot(qFixed, (snapshot) => {
      setFixedFinances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FixedFinance)));
      markInitialLoadOnce(fixedSeen);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'fixedFinances');
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeDebts();
      unsubscribeFixed();
    };
  }, [user]);

  return { transactions, debts, fixedFinances, loading };
};
