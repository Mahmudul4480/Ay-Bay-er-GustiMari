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
import { updateUserIntelligence } from '../lib/userIntelligence';
import { mergeMarketingTagsFromTexts } from '../lib/marketingTagsSync';

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
          if (type === 'income') {
            celebrate();
          } else if (type === 'expense') {
            gloom();
            // Fire-and-forget: update user intelligence for admin targeting
            updateUserIntelligence(user.uid, savedCategory, amountNum, isAddingCategory).catch(
              (err) => console.warn('user_intelligence update failed:', err),
            );
          }
        }
        mergeMarketingTagsFromTexts(user.uid, [savedCategory, note]).catch(() => {});
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

  const REMOVED_CATEGORIES = ['Other', 'Other Income'];

  const baseCategories = (
    type === 'income' || type === 'debt_repayment'
      ? (userProfile?.incomeCategories || [])
      : (userProfile?.expenseCategories || [])
  ).filter((c) => !REMOVED_CATEGORIES.includes(c));

  const categories =
    category && !baseCategories.includes(category) && !REMOVED_CATEGORIES.includes(category)
      ? [category, ...baseCategories]
      : baseCategories;

  const familyMembers = userProfile?.familyMembers || ['Self'];

  const fieldPad = 'p-3 sm:p-4 min-h-[44px]';
  const stackGap = 'space-y-2 sm:space-y-3';
  const gridGap = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-3 pt-4 backdrop-blur-sm sm:items-center sm:p-4 sm:pt-4"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        className={cn(
          'flex max-h-[min(90vh,100dvh)] w-full max-w-lg flex-col overflow-hidden rounded-[1.75rem] transition-colors',
          'border border-indigo-400/35 bg-white/95 shadow-[0_0_0_1px_rgba(99,102,241,0.2),0_0_48px_-8px_rgba(99,102,241,0.35),0_25px_50px_-12px_rgba(0,0,0,0.35)]',
          'backdrop-blur-md dark:border-indigo-500/30 dark:bg-slate-900/95'
        )}
      >
        {/* Sticky header — stays visible while body scrolls */}
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between gap-3 border-b border-indigo-200/40 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-indigo-500/30 dark:bg-slate-900/90">
          <h2 className="min-w-0 flex-1 text-lg font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            {t('addTransaction')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={t('cancel')}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {error && (
          <div className="shrink-0 border-b border-red-200/50 bg-red-50/90 px-4 py-3 dark:border-red-900/40 dark:bg-red-950/40">
            <div className="flex items-start gap-2 rounded-xl border border-red-200/80 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Scrollable fields */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2 sm:px-6 sm:py-4">
            <div className={cn(stackGap, 'pb-2')}>
              {type === 'debt_repayment' ? (
                <div className="flex rounded-2xl border border-teal-200/80 bg-teal-50/90 p-1 dark:border-teal-800 dark:bg-teal-900/25">
                  <div className="flex-1 rounded-xl py-2.5 text-center text-sm font-semibold text-teal-800 dark:text-teal-300 sm:py-3">
                    {t('debt_repayment')}
                  </div>
                </div>
              ) : (
                <div className="flex rounded-2xl bg-slate-100/90 p-1 dark:bg-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={cn(
                      'flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all sm:py-3',
                      type === 'income'
                        ? 'bg-white text-green-600 shadow-sm dark:bg-slate-600 dark:text-green-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {t('income')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={cn(
                      'flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all sm:py-3',
                      type === 'expense'
                        ? 'bg-white text-red-600 shadow-sm dark:bg-slate-600 dark:text-red-400'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {t('expense')}
                  </button>
                </div>
              )}

              <div className={gridGap}>
                <div className={stackGap}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 sm:text-sm sm:normal-case sm:tracking-normal">
                    {t('amount')}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(e) => {
                      const val = e.target.value;
                      const sanitized = sanitizeDecimal(val);
                      setAmount(sanitized);
                    }}
                    placeholder="0.00"
                    className={cn(
                      fieldPad,
                      'w-full rounded-2xl border border-slate-200 bg-slate-50 text-lg font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                    )}
                  />
                </div>
                <div className={stackGap}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 sm:text-sm sm:normal-case sm:tracking-normal">
                    {t('category')}
                  </label>
                  {!isAddingCategory ? (
                    <select
                      required
                      value={category}
                      onChange={(e) => {
                        if (e.target.value === 'ADD_NEW') setIsAddingCategory(true);
                        else setCategory(e.target.value);
                      }}
                      className={cn(
                        fieldPad,
                        'w-full rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                      )}
                    >
                      <option value="">Select Category</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="ADD_NEW" className="font-bold text-blue-600 dark:text-blue-400">
                        + {t('addCategory')}
                      </option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="New Category Name"
                        className={cn(
                          fieldPad,
                          'min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setIsAddingCategory(false)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-slate-400"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={gridGap}>
                <div className={stackGap}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 sm:text-sm sm:normal-case sm:tracking-normal">
                    {t('date')}
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={cn(
                      fieldPad,
                      'w-full rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                    )}
                  />
                </div>
                <div className={stackGap}>
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 sm:text-sm sm:normal-case sm:tracking-normal">
                    {t('familyMember')}
                  </label>
                  {!isAddingMember ? (
                    <select
                      value={familyMember}
                      onChange={(e) => {
                        if (e.target.value === 'ADD_NEW') setIsAddingMember(true);
                        else setFamilyMember(e.target.value);
                      }}
                      className={cn(
                        fieldPad,
                        'w-full rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                      )}
                    >
                      {familyMembers.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="ADD_NEW" className="font-bold text-blue-600 dark:text-blue-400">
                        + {t('addMember')}
                      </option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newMember}
                        onChange={(e) => setNewMember(e.target.value)}
                        placeholder="Member Name"
                        className={cn(
                          fieldPad,
                          'min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white'
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setIsAddingMember(false)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-slate-400"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={stackGap}>
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400 sm:text-sm sm:normal-case sm:tracking-normal">
                  {t('note')}
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note..."
                  className={cn(
                    fieldPad,
                    'h-20 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white sm:h-24'
                  )}
                />
              </div>
            </div>
          </div>

          {/* Sticky footer — Save always reachable */}
          <div
            className="sticky bottom-0 z-20 shrink-0 border-t border-indigo-200/40 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-indigo-500/25 dark:bg-slate-900/85"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl font-bold text-slate-600 transition-all hover:bg-slate-100 active:scale-[0.98] dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'flex min-h-[48px] flex-[1.15] items-center justify-center gap-2 rounded-2xl font-bold text-white transition-all active:scale-[0.98]',
                  'bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600',
                  'shadow-[0_4px_0_rgb(67,56,163),0_12px_32px_rgba(99,102,241,0.45)]',
                  'ring-2 ring-indigo-400/40 ring-offset-2 ring-offset-white dark:ring-offset-slate-900',
                  'hover:brightness-110 disabled:opacity-60'
                )}
              >
                {isSubmitting ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-5 w-5" />
                )}
                {t('save')}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default TransactionForm;
