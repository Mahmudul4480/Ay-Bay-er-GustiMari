import React, { useState } from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig';
import { collection, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { formatCurrency, cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, CheckCircle, Clock, User, DollarSign, Calendar, X, Phone, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

import { convertBengaliToAscii, sanitizeDecimal } from '../lib/numberUtils';

const DebtTracker: React.FC = () => {
  const { debts = [] } = useTransactions();
  const { t, language } = useLocalization();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [formData, setFormData] = useState({
    personName: '',
    amount: '',
    type: 'lent' as 'lent' | 'borrowed',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    phoneNumber: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.personName || !formData.amount) return;

    setIsSubmitting(true);
    try {
      // 1. Create the debt record
      let debtRef;
      try {
        debtRef = await addDoc(collection(db, 'debts'), {
          userId: user.uid,
          personName: formData.personName,
          amount: parseFloat(formData.amount),
          type: formData.type,
          description: formData.description,
          dueDate: new Date(formData.dueDate),
          status: 'unpaid',
          phoneNumber: formData.phoneNumber,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'debts');
        return;
      }

      // 2. Rule A: Instantly adjust balance by creating a transaction
      // Lending (lent) = Money leaves pocket (expense)
      // Borrowing (borrowed) = Money enters pocket (income)
      try {
        await addDoc(collection(db, 'transactions'), {
          userId: user.uid,
          amount: parseFloat(formData.amount),
          type: formData.type === 'lent' ? 'expense' : 'income',
          category: formData.type === 'lent' ? 'Debt Given' : 'Debt Taken',
          date: serverTimestamp(),
          note: `${formData.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${formData.personName}`,
          familyMember: 'Self',
          isFixed: false,
          debtId: debtRef.id // Link to debt for future reference if needed
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'transactions');
      }

      setIsModalOpen(false);
      setFormData({ 
        personName: '', 
        amount: '', 
        type: 'lent', 
        description: '', 
        dueDate: new Date().toISOString().split('T')[0],
        phoneNumber: '',
      });
    } catch (error) {
      console.error('Error adding debt:', error);
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
      //   Lent (lent) -> Paid: Got money back (income)
      //   Borrowed (borrowed) -> Paid: Returned money (expense)
      // If newStatus is 'unpaid':
      //   Lent (lent) -> Unpaid: Money leaves pocket again (expense)
      //   Borrowed (borrowed) -> Unpaid: Money enters pocket again (income)
      
      let transactionType: 'income' | 'expense';
      let category: string;
      let note: string;

      if (newStatus === 'paid') {
        transactionType = debt.type === 'lent' ? 'income' : 'expense';
        category = debt.type === 'lent' ? 'Debit Settlement' : 'Debit Reversal';
        note = debt.type === 'lent' 
          ? `Debit Settlement (Collected from ${debt.personName})` 
          : `Debit Reversal (Pay to ${debt.personName})`;
      } else {
        transactionType = debt.type === 'lent' ? 'expense' : 'income';
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
          debtId: debt.id
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'transactions');
      }
    } catch (error) {
      console.error('Error updating debt status:', error);
    }
  };

  const deleteDebt = async (debtId: string) => {
    try {
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
        <h2 className="text-3xl font-bold text-slate-800 dark:text-white">{t('netDebt')}</h2>
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
        <div className="neon-card p-6">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('lent')}</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(totalLent, language)}</p>
        </div>
        <div className="neon-card p-6">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{t('borrowed')}</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalBorrowed, language)}</p>
        </div>
        <div className={cn(
          "neon-card p-6",
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
              "neon-card p-6 flex flex-col gap-4 relative overflow-hidden",
              debt.status === 'paid' && "opacity-80"
            )}
          >
            <div className={cn(
              "absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-10",
              debt.type === 'lent' ? "bg-green-500" : "bg-red-500"
            )} />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
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
              <div className="flex gap-2">
                <button onClick={() => setDeleteConfirmId(debt.id)} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 className="w-5 h-5" />
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
                    <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('phoneNumber')}</label>
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                    />
                  </div>
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
    </div>
  );
};

export default DebtTracker;

function Save(props: any) { return <DollarSign {...props} /> }
