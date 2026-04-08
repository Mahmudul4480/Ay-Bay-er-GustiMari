import React, { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, CheckCircle, Clock, User, DollarSign, Calendar, X, Phone, ArrowUp, ArrowDown, AlertTriangle, Edit2 } from 'lucide-react';

import { convertBengaliToAscii, sanitizeDecimal } from '../lib/numberUtils';
import { useTransactionFeedback } from '../contexts/TransactionFeedbackContext';
import {
  upsertFinancialNetworkEntry,
  deleteFinancialNetworkByDebtId,
} from '../lib/financialNetworkSync';
import { mergeMarketingTagsFromTexts } from '../lib/marketingTagsSync';

const DebtTracker: React.FC = () => {
  const { debts = [] } = useTransactions();
  const { t, language } = useLocalization();
  const { user } = useAuth();
  const { celebrate } = useTransactionFeedback();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // ── Edit state ──────────────────────────────────────────────────────────────
  const [editingDebt, setEditingDebt] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState({
    personName: '',
    amount: '',
    type: 'lent' as 'lent' | 'borrowed',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    phoneNumber: '',
    isBusiness: false,
  });
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    personName: '',
    amount: '',
    type: 'lent' as 'lent' | 'borrowed',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    phoneNumber: '',
    isBusiness: false,
  });

  const phoneDigitsCount = (raw: string) => String(raw).replace(/\D/g, '').length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user || !formData.personName.trim() || !formData.amount) {
      setError(t('fillAllFields') || 'Please fill all fields');
      return;
    }
    if (phoneDigitsCount(formData.phoneNumber) < 10) {
      setError(t('phoneNumber') ? `${t('phoneNumber')}: at least 10 digits` : 'Contact phone must have at least 10 digits');
      return;
    }

    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum)) {
      setError('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create the debt record
      let debtRef;
      try {
        debtRef = await addDoc(collection(db, 'debts'), {
          userId: user.uid,
          personName: formData.personName.trim(),
          amount: amountNum,
          type: formData.type,
          description: formData.description,
          dueDate: new Date(formData.dueDate),
          status: 'unpaid',
          phoneNumber: formData.phoneNumber.trim(),
          isBusiness: formData.isBusiness,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'debts');
        return;
      }

      try {
        await upsertFinancialNetworkEntry({
          userId: user.uid,
          debtId: debtRef.id,
          contactName: formData.personName.trim(),
          contactPhone: formData.phoneNumber.trim(),
          isBusiness: formData.isBusiness,
          debtType: formData.type,
          amount: amountNum,
        });
      } catch (e) {
        console.error('financial_network sync:', e);
      }

      // 2. Rule A: Instantly adjust balance by creating a transaction
      try {
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          amount: amountNum,
          type: formData.type === 'lent' ? 'expense' : 'income',
          category: formData.type === 'lent' ? 'Debt Given' : 'Debt Taken',
          date: serverTimestamp(),
          note: `${formData.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${formData.personName}`,
          familyMember: 'Self',
          isFixed: false,
          debtId: debtRef.id,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'transactions');
      }

      const debtNote = `${formData.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${formData.personName}`;
      mergeMarketingTagsFromTexts(user.uid, [
        formData.description,
        formData.personName,
        debtNote,
      ]).catch(() => {});

      setIsModalOpen(false);
      setFormData({ 
        personName: '', 
        amount: '', 
        type: 'lent', 
        description: '', 
        dueDate: new Date().toISOString().split('T')[0],
        phoneNumber: '',
        isBusiness: false,
      });
    } catch (err: any) {
      console.error('Error adding debt:', err);
      setError(err.message || 'An error occurred while saving');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  const toggleStatus = async (debt: any, newStatus: 'paid' | 'unpaid') => {
    if (debt.status === newStatus) return;

    try {
      // 1. Update debt status
      try {
        await updateDoc(doc(db, 'debts', debt.id), { status: newStatus });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `debts/${debt.id}`);
        return;
      }

      // 2. Rule B & C: Adjust balance
      // If newStatus is 'paid':
      //   Lent (lent) -> Paid: Got money back (debt_repayment, not income)
      //   Borrowed (borrowed) -> Paid: Returned money (expense)
      // If newStatus is 'unpaid':
      //   Lent (lent) -> Unpaid: Money leaves pocket again (expense)
      //   Borrowed (borrowed) -> Unpaid: Money enters pocket again (debt_repayment)
      
      let transactionType: 'income' | 'expense' | 'debt_repayment';
      let category: string;
      let note: string;

      if (newStatus === 'paid') {
        transactionType = debt.type === 'lent' ? 'debt_repayment' : 'expense';
        category = debt.type === 'lent' ? 'Debit Settlement' : 'Debit Reversal';
        note = debt.type === 'lent' 
          ? `Debit Settlement (Collected from ${debt.personName})` 
          : `Debit Reversal (Pay to ${debt.personName})`;
      } else {
        transactionType = debt.type === 'lent' ? 'expense' : 'debt_repayment';
        category = 'Debt Reversal';
        note = `Reversed debt with ${debt.personName}`;
      }

      try {
        await addDoc(collection(db, 'transactions'), {
          userId: user!.uid,
          amount: debt.amount,
          type: transactionType,
          category,
          date: serverTimestamp(),
          note,
          familyMember: 'Self',
          isFixed: false,
          debtId: debt.id,
          createdAt: serverTimestamp(),
        });
        mergeMarketingTagsFromTexts(user!.uid, [category, note, debt.description, debt.personName]).catch(() => {});
        if (newStatus === 'paid' && debt.type === 'lent') {
          celebrate();
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'transactions');
      }
    } catch (error) {
      console.error('Error updating debt status:', error);
    }
  };

  const deleteDebt = async (debtId: string) => {
    try {
      try {
        await deleteFinancialNetworkByDebtId(debtId);
      } catch (e) {
        console.warn('financial_network delete:', e);
      }
      // 1. Delete the debt record
      try {
        await deleteDoc(doc(db, 'debts', debtId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `debts/${debtId}`);
        return;
      }

      // 2. Delete associated transactions to revert balance
      const q = query(
        collection(db, 'transactions'), 
        where('debtId', '==', debtId)
      );
      
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'transactions');
        return;
      }

      const deletePromises = querySnapshot.docs
        .filter(d => d.data().userId === user!.uid)
        .map(d => {
          try {
            return deleteDoc(d.ref);
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `transactions/${d.id}`);
            return Promise.resolve();
          }
        });
      await Promise.all(deletePromises);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting debt:', error);
    }
  };

  // ── Edit handlers ─────────────────────────────────────────────────────────
  const openEditModal = (debt: any) => {
    setEditingDebt(debt);
    setEditFormData({
      personName: debt.personName,
      amount: String(debt.amount),
      type: debt.type,
      description: debt.description || '',
      dueDate:
        debt.dueDate && typeof debt.dueDate.toDate === 'function'
          ? debt.dueDate.toDate().toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      phoneNumber: debt.phoneNumber || '',
      isBusiness: Boolean(debt.isBusiness),
    });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    const amountNum = parseFloat(editFormData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setEditError('Amount must be a positive number.');
      return;
    }

    if (!editFormData.personName.trim()) {
      setEditError('Person name is required.');
      return;
    }
    if (phoneDigitsCount(editFormData.phoneNumber) < 10) {
      setEditError('Contact phone must have at least 10 digits.');
      return;
    }

    setIsEditSubmitting(true);
    try {
      const debt = editingDebt;

      // 1. Update the debt document
      await updateDoc(doc(db, 'debts', debt.id), {
        personName: editFormData.personName.trim(),
        amount: amountNum,
        type: editFormData.type,
        description: editFormData.description,
        dueDate: new Date(editFormData.dueDate),
        phoneNumber: editFormData.phoneNumber.trim(),
        isBusiness: editFormData.isBusiness,
      });

      try {
        await upsertFinancialNetworkEntry({
          userId: user!.uid,
          debtId: debt.id,
          contactName: editFormData.personName.trim(),
          contactPhone: editFormData.phoneNumber.trim(),
          isBusiness: editFormData.isBusiness,
          debtType: editFormData.type,
          amount: amountNum,
        });
      } catch (e) {
        console.error('financial_network sync (edit):', e);
      }

      // 2. Delete all linked transactions so the balance recalculates correctly
      const q = query(collection(db, 'transactions'), where('debtId', '==', debt.id));
      const snap = await getDocs(q);
      await Promise.all(
        snap.docs
          .filter((d) => d.data().userId === user!.uid)
          .map((d) => deleteDoc(d.ref))
      );

      // 3. Re-create the initial transaction
      await addDoc(collection(db, 'transactions'), {
        userId: user!.uid,
        amount: amountNum,
        type: editFormData.type === 'lent' ? 'expense' : 'income',
        category: editFormData.type === 'lent' ? 'Debt Given' : 'Debt Taken',
        date: serverTimestamp(),
        note: `${editFormData.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${editFormData.personName}`,
        familyMember: 'Self',
        isFixed: false,
        debtId: debt.id,
        createdAt: serverTimestamp(),
      });

      // 4. If the debt was already paid, recreate the settlement transaction too
      if (debt.status === 'paid') {
        const settlementType = editFormData.type === 'lent' ? 'debt_repayment' : 'expense';
        const settlementCategory = editFormData.type === 'lent' ? 'Debit Settlement' : 'Debit Reversal';
        await addDoc(collection(db, 'transactions'), {
          userId: user!.uid,
          amount: amountNum,
          type: settlementType,
          category: settlementCategory,
          date: serverTimestamp(),
          note:
            editFormData.type === 'lent'
              ? `Debit Settlement (Collected from ${editFormData.personName})`
              : `Debit Reversal (Pay to ${editFormData.personName})`,
          familyMember: 'Self',
          isFixed: false,
          debtId: debt.id,
          createdAt: serverTimestamp(),
        });
      }

      {
        const baseNote = `${editFormData.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${editFormData.personName}`;
        const parts: string[] = [editFormData.description, editFormData.personName, baseNote];
        if (debt.status === 'paid') {
          parts.push(
            editFormData.type === 'lent'
              ? `Debit Settlement (Collected from ${editFormData.personName})`
              : `Debit Reversal (Pay to ${editFormData.personName})`,
          );
        }
        mergeMarketingTagsFromTexts(user!.uid, parts).catch(() => {});
      }

      setEditingDebt(null);
    } catch (err: any) {
      setEditError(err.message || 'An error occurred while saving.');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const netDebt = debts.reduce((acc, debt) => {
    if (debt.status === 'paid') return acc;
    return debt.type === 'lent' ? acc + debt.amount : acc - debt.amount;
  }, 0);

  const totalLent = debts.reduce((acc, debt) => {
    if (debt.status === 'paid') return acc;
    return debt.type === 'lent' ? acc + debt.amount : acc;
  }, 0);

  const totalBorrowed = debts.reduce((acc, debt) => {
    if (debt.status === 'paid') return acc;
    return debt.type === 'borrowed' ? acc + debt.amount : acc;
  }, 0);

  const maskPhoneNumber = (phone: string) => {
    if (!phone) return '';
    if (phone.length <= 4) return phone;
    const lastFour = phone.slice(-4);
    const maskedPart = phone.slice(0, -4).replace(/[0-9]/g, 'X');
    return maskedPart + lastFour;
  };

  const filteredAndSortedDebts = debts
    .filter(debt => {
      if (filterStatus === 'all') return true;
      return debt.status === filterStatus;
    })
    .sort((a, b) => {
      const dateA = a.dueDate && typeof a.dueDate.toDate === 'function' ? a.dueDate.toDate().getTime() : 0;
      const dateB = b.dueDate && typeof b.dueDate.toDate === 'function' ? b.dueDate.toDate().getTime() : 0;
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 dark:text-white">{t('debtTracker')}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('debtTotalsCumulative')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center neon-card p-1">
            <button
              onClick={() => setFilterStatus('all')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                filterStatus === 'all' ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              {t('all')}
            </button>
            <button
              onClick={() => setFilterStatus('unpaid')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                filterStatus === 'unpaid' ? "bg-orange-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              {t('unpaid')}
            </button>
            <button
              onClick={() => setFilterStatus('paid')}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                filterStatus === 'paid' ? "bg-green-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"
              )}
            >
              {t('paid')}
            </button>
          </div>

          <button
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-2 neon-card py-3 px-4 font-bold text-slate-600 dark:text-slate-300 transition-all"
          >
            {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            {t('dueDate')}
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white py-3 px-6 rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95"
          >
            <Plus className="w-5 h-5" />
            {t('addTransaction')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="neon-card dashboard-card-3d p-6">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('lent')}</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalLent, language)}</p>
        </div>
        <div className="neon-card dashboard-card-3d p-6">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('borrowed')}</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalBorrowed, language)}</p>
        </div>
        <div className={cn(
          "neon-card dashboard-card-3d p-6",
          netDebt >= 0 
            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30" 
            : "bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-900/30"
        )}>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('netDebt')}</p>
          <p className={cn(
            "text-2xl font-bold",
            netDebt >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"
          )}>
            {formatCurrency(netDebt, language)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAndSortedDebts.map((debt) => (
          <motion.div
            key={debt.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "neon-card dashboard-card-3d p-6 flex flex-col gap-4 relative overflow-hidden",
              debt.status === 'paid' && "opacity-80"
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10",
                debt.type === 'lent' ? "bg-green-500" : "bg-red-500"
              )}
              aria-hidden
            />

              <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                  debt.type === 'lent' ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                )}>
                  {debt.type === 'lent' ? t('lent') : t('borrowed')}
                </div>
                <div className={cn(
                  "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                  debt.status === 'paid' ? "bg-green-500 text-white" : "bg-orange-500 text-white"
                )}>
                  {debt.status === 'paid' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {t(debt.status)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openEditModal(debt); }}
                  className="relative z-20 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/30"
                  aria-label="Edit"
                >
                  <Edit2 className="h-4 w-4 pointer-events-none" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirmId(debt.id);
                  }}
                  className="relative z-20 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                  aria-label={t('delete')}
                >
                  <Trash2 className="h-4 w-4 pointer-events-none" />
                </button>
              </div>
            </div>

            <div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{formatCurrency(debt.amount, language)}</p>
              <div className="flex flex-col gap-1 mt-1">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <User className="w-4 h-4" />
                  <span className="font-medium">{debt.personName}</span>
                </div>
                {debt.phoneNumber && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                    <Phone className="w-3 h-3" />
                    <span>{maskPhoneNumber(debt.phoneNumber)}</span>
                  </div>
                )}
              </div>
            </div>

            {debt.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">"{debt.description}"</p>
            )}

            <div className="pt-4 border-t border-slate-50 dark:border-slate-700 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Calendar className="w-4 h-4" />
                <span>
                  {debt.dueDate && typeof debt.dueDate.toDate === 'function' 
                    ? debt.dueDate.toDate().toLocaleDateString() 
                    : 'N/A'}
                </span>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => toggleStatus(debt, 'paid')}
                  className={cn(
                    "flex-1 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1",
                    debt.status === 'paid' 
                      ? "bg-green-600 text-white shadow-md" 
                      : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('paid')}
                </button>
                <button
                  onClick={() => toggleStatus(debt, 'unpaid')}
                  className={cn(
                    "flex-1 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1",
                    debt.status === 'unpaid' 
                      ? "bg-orange-600 text-white shadow-md" 
                      : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600"
                  )}
                >
                  <Clock className="w-4 h-4" />
                  {t('unpaid')}
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden transition-colors"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('addTransaction')}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {error && (
                <div className="mx-8 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400 text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'lent' })}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-semibold transition-all",
                      formData.type === 'lent' ? "bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
                    )}
                  >
                    {t('lent')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'borrowed' })}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-semibold transition-all",
                      formData.type === 'borrowed' ? "bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
                    )}
                  >
                    {t('borrowed')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('personName')}</label>
                    <input
                      type="text"
                      required
                      value={formData.personName}
                      onChange={(e) => setFormData({ ...formData, personName: e.target.value })}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('phoneNumber')} *</label>
                    <input
                      type="tel"
                      required
                      autoComplete="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                    <p className="text-xs text-slate-400">Minimum 10 digits</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-600 dark:bg-slate-800/50">
                  <input
                    id="add-debt-is-business"
                    type="checkbox"
                    checked={formData.isBusiness}
                    onChange={(e) => setFormData({ ...formData, isBusiness: e.target.checked })}
                    className="peer sr-only"
                  />
                  <label htmlFor="add-debt-is-business" className="flex cursor-pointer items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500',
                        formData.isBusiness
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-slate-700',
                      )}
                    >
                      {formData.isBusiness ? '✓' : ''}
                    </span>
                    <span className="text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-semibold">Business / shop / agency</span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                        Check if money is owed to or from a company, store, or agent (not only an individual). Used for lead scoring.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('amount')}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={formData.amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        const sanitized = sanitizeDecimal(val);
                        console.log('Debt Amount Input:', { val, sanitized });
                        setFormData({ ...formData, amount: sanitized });
                      }}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('dueDate')}</label>
                    <input
                      type="date"
                      required
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('note')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
                  {t('save')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6 transition-colors"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('confirmDelete')}</h3>
                <p className="text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-3 px-6 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={() => deleteDebt(deleteConfirmId)}
                  className="flex-1 py-3 px-6 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 dark:shadow-none"
                >
                  {t('delete')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit Debt Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editingDebt && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isEditSubmitting && setEditingDebt(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 24 }}
              className="relative w-full max-w-lg overflow-hidden rounded-[2rem] shadow-2xl"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(248,250,252,0.97) 100%)',
                boxShadow: '0 32px 80px -10px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.8)',
              }}
            >
              {/* Gradient header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
                    <Edit2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black">Edit Debt Entry</h2>
                    <p className="text-xs text-blue-100">Changes recalculate balance in real-time</p>
                  </div>
                </div>
                <button
                  onClick={() => !isEditSubmitting && setEditingDebt(null)}
                  className="rounded-full p-2 hover:bg-white/15 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {editError && (
                <div className="mx-6 mt-5 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <p className="font-medium">{editError}</p>
                </div>
              )}

              <form onSubmit={handleEditSubmit} className="space-y-5 p-6">
                {/* Type toggle */}
                <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-700">
                  {(['lent', 'borrowed'] as const).map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => setEditFormData((p) => ({ ...p, type: tp }))}
                      className={cn(
                        'flex-1 rounded-xl py-3 text-sm font-bold transition-all',
                        editFormData.type === tp
                          ? tp === 'lent'
                            ? 'bg-white text-green-600 shadow-sm dark:bg-slate-600 dark:text-green-400'
                            : 'bg-white text-red-600 shadow-sm dark:bg-slate-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      )}
                    >
                      {tp === 'lent' ? t('lent') : t('borrowed')}
                    </button>
                  ))}
                </div>

                {/* Name + Phone */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('personName')}</label>
                    <input
                      type="text"
                      required
                      value={editFormData.personName}
                      onChange={(e) => setEditFormData((p) => ({ ...p, personName: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('phoneNumber')} *</label>
                    <input
                      type="tel"
                      required
                      value={editFormData.phoneNumber}
                      onChange={(e) => setEditFormData((p) => ({ ...p, phoneNumber: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/50">
                  <input
                    type="checkbox"
                    checked={editFormData.isBusiness}
                    onChange={(e) => setEditFormData((p) => ({ ...p, isBusiness: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Business / shop / agency counterparty</span>
                </label>

                {/* Amount + Due Date */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('amount')}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      value={editFormData.amount}
                      onChange={(e) => {
                        const v = sanitizeDecimal(e.target.value);
                        // Block leading minus signs
                        if (!v.startsWith('-')) setEditFormData((p) => ({ ...p, amount: v }));
                      }}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('dueDate')}</label>
                    <input
                      type="date"
                      required
                      value={editFormData.dueDate}
                      onChange={(e) => setEditFormData((p) => ({ ...p, dueDate: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    />
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('note')}</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isEditSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 font-bold text-white shadow-lg shadow-blue-500/25 transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                >
                  {isEditSubmitting ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  Save Changes
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DebtTracker;

function Save(props: any) { return <DollarSign {...props} /> }
