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
    if (!user) return;

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
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      // Sort by date desc
      docs.sort((a, b) => {
        const getTime = (val: any) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (val instanceof Date) return val.getTime();
          if (typeof val === 'number') return val;
          const d = new Date(val);
          return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        return getTime(b.date) - getTime(a.date);
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
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt));
      // Sort by dueDate asc
      docs.sort((a, b) => {
        const getTime = (val: any) => {
          if (!val) return 0;
          if (typeof val.toMillis === 'function') return val.toMillis();
          if (val instanceof Date) return val.getTime();
          if (typeof val === 'number') return val;
          const d = new Date(val);
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
      setFixedFinances(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FixedFinance)));
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

  return { transactions, debts, fixedFinances, loading };
};
