import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { db } from '../firebaseConfig';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion } from 'motion/react';
import { X, Save, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

import { Transaction } from '../hooks/useTransactions';
import { useTransactionFeedback } from '../contexts/TransactionFeedbackContext';

interface TransactionFormProps {
  onClose: () => void;
  initialType?: 'income' | 'expense';
  transaction?: Transaction;
}

import { convertBengaliToAscii, sanitizeDecimal } from '../lib/numberUtils';

const TransactionForm: React.FC<TransactionFormProps> = ({ onClose, initialType, transaction }) => {
  const { user, userProfile } = useAuth();
  const { t } = useLocalization();
  const { celebrate, gloom } = useTransactionFeedback();
  const [amount, setAmount] = useState(transaction ? transaction.amount.toString() : '');
  const [type, setType] = useState<'income' | 'expense' | 'debt_repayment'>(
    transaction ? transaction.type : (initialType || 'expense')
  );
  const [category, setCategory] = useState(transaction ? transaction.category : '');
  const [newCategory, setNewCategory] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [date, setDate] = useState(transaction ? transaction.date.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState(transaction ? transaction.note : '');
  const [familyMember, setFamilyMember] = useState(transaction ? transaction.familyMember : 'Self');
  const [newMember, setNewMember] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const finalCategory = isAddingCategory ? newCategory : category;
    const finalMember = isAddingMember ? newMember : familyMember;

    if (!user || !amount || !finalCategory) {
      setError(t('fillAllFields') || 'Please fill all fields');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
      setError('Please enter a valid amount');
      return;
    }

    if (!userProfile) {
      setError(t('profileLoading') || 'Profile loading...');
      return;
    }

    setIsSubmitting(true);
    try {
      let savedCategory = finalCategory;
      let savedMember = finalMember;

      // Update user profile if new category/member added
      if (isAddingCategory && newCategory.trim()) {
        const field = type === 'income' || type === 'debt_repayment' ? 'incomeCategories' : 'expenseCategories';
        const currentCategories = userProfile[field] || [];
        const trimmed = newCategory.trim();
        if (!currentCategories.includes(trimmed)) {
          const updatedCategories = [...currentCategories, trimmed];
          try {
            await updateDoc(doc(db, 'users', user.uid), { [field]: updatedCategories });
            savedCategory = trimmed;
          } catch (err) {
            console.error('Error updating categories:', err);
            // Continue with the typed category even if update fails
            savedCategory = trimmed;
          }
        }
      }

      if (isAddingMember && newMember.trim()) {
        const currentMembers = userProfile.familyMembers || ['Self'];
        const trimmed = newMember.trim();
        if (!currentMembers.includes(trimmed)) {
          const updatedMembers = [...currentMembers, trimmed];
          try {
            await updateDoc(doc(db, 'users', user.uid), { familyMembers: updatedMembers });
            savedMember = trimmed;
          } catch (err) {
            console.error('Error updating members:', err);
            savedMember = trimmed;
          }
        }
      }

      const transactionData = {
        userId: user.uid,
        amount: amountNum,
        type,
        category: savedCategory,
        date: new Date(date),
        note,
        familyMember: savedMember,
        updatedAt: serverTimestamp(),
      };

      try {
        if (transaction) {
          await updateDoc(doc(db, 'transactions', transaction.id), transactionData);
        } else {
          await addDoc(collection(db, 'transactions'), {
            ...transactionData,
            createdAt: serverTimestamp(),
          });
          if (type === 'income') celebrate();
          else if (type === 'expense') gloom();
        }
        onClose();
      } catch (err) {
        handleFirestoreError(err, transaction ? OperationType.UPDATE : OperationType.CREATE, transaction ? `transactions/${transaction.id}` : 'transactions');
      }
    } catch (err: any) {
      console.error('Error saving transaction:', err);
      setError(err.message || 'An error occurred while saving');
    } finally {
      setIsSubmitting(false);
    }
  };

  const baseCategories =
    type === 'income' || type === 'debt_repayment'
      ? (userProfile?.incomeCategories || [])
      : (userProfile?.expenseCategories || []);
  const categories =
    category && !baseCategories.includes(category)
      ? [category, ...baseCategories]
      : baseCategories;

  const familyMembers = userProfile?.familyMembers || ['Self'];

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden transition-colors"
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('addTransaction')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full text-slate-400">
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
          {type === 'debt_repayment' ? (
            <div className="flex p-1 bg-teal-50 dark:bg-teal-900/20 rounded-2xl border border-teal-100 dark:border-teal-800">
              <div className="flex-1 py-3 rounded-xl font-semibold text-center text-teal-700 dark:text-teal-300">
                {t('debt_repayment')}
              </div>
            </div>
          ) : (
            <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-2xl">
              <button
                type="button"
                onClick={() => setType('income')}
                className={cn(
                  "flex-1 py-3 rounded-xl font-semibold transition-all",
                  type === 'income' ? "bg-white dark:bg-slate-600 text-green-600 dark:text-green-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
                )}
              >
                {t('income')}
              </button>
              <button
                type="button"
                onClick={() => setType('expense')}
                className={cn(
                  "flex-1 py-3 rounded-xl font-semibold transition-all",
                  type === 'expense' ? "bg-white dark:bg-slate-600 text-red-600 dark:text-red-400 shadow-sm" : "text-slate-500 dark:text-slate-400"
                )}
              >
                {t('expense')}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('amount')}</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => {
                  const val = e.target.value;
                  const sanitized = sanitizeDecimal(val);
                  console.log('Amount Input:', { val, sanitized });
                  setAmount(sanitized);
                }}
                placeholder="0.00"
                className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('category')}</label>
              {!isAddingCategory ? (
                <select
                  required
                  value={category}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') setIsAddingCategory(true);
                    else setCategory(e.target.value);
                  }}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="ADD_NEW" className="text-blue-600 dark:text-blue-400 font-bold">+ {t('addCategory')}</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="New Category Name"
                    className="flex-1 p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                  />
                  <button type="button" onClick={() => setIsAddingCategory(false)} className="p-4 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('date')}</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('familyMember')}</label>
              {!isAddingMember ? (
                <select
                  value={familyMember}
                  onChange={(e) => {
                    if (e.target.value === 'ADD_NEW') setIsAddingMember(true);
                    else setFamilyMember(e.target.value);
                  }}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                >
                  {familyMembers.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="ADD_NEW" className="text-blue-600 dark:text-blue-400 font-bold">+ {t('addMember')}</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newMember}
                    onChange={(e) => setNewMember(e.target.value)}
                    placeholder="Member Name"
                    className="flex-1 p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
                  />
                  <button type="button" onClick={() => setIsAddingMember(false)} className="p-4 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">{t('note')}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none dark:text-white"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 px-6 rounded-2xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-4 px-6 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 flex items-center justify-center gap-2"
            >
              {isSubmitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
              {t('save')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default TransactionForm;
