import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { db } from '../firebaseConfig';
import { doc, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, TrendingUp, TrendingDown, Plus, Trash2, ArrowRight, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getDefaultCategoriesForProfession,
  mergeUniqueCategoryLists,
  type ProfessionId,
} from '../lib/professionData';

const Onboarding: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { t, language } = useLocalization();
  const [step, setStep] = useState(1);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fixedIncomes, setFixedIncomes] = useState<{ name: string; amount: string }[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<{ name: string; amount: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addIncome = () => setFixedIncomes([...fixedIncomes, { name: '', amount: '' }]);
  const removeIncome = (index: number) => setFixedIncomes(fixedIncomes.filter((_, i) => i !== index));
  const updateIncome = (index: number, field: 'name' | 'amount', value: string) => {
    const newIncomes = [...fixedIncomes];
    newIncomes[index][field] = value;
    setFixedIncomes(newIncomes);
  };

  const addExpense = () => setFixedExpenses([...fixedExpenses, { name: '', amount: '' }]);
  const removeExpense = (index: number) => setFixedExpenses(fixedExpenses.filter((_, i) => i !== index));
  const updateExpense = (index: number, field: 'name' | 'amount', value: string) => {
    const newExpenses = [...fixedExpenses];
    newExpenses[index][field] = value;
    setFixedExpenses(newExpenses);
  };

  const handleFinish = async () => {
    if (!user) return;
    setIsSubmitting(true);
    try {
      // 1. Merge universal + profession defaults, then add fixed-finance category names
      const profId = (userProfile?.profession as ProfessionId) || 'student';
      const base = getDefaultCategoriesForProfession(profId);
      const extraIncome = fixedIncomes.map((i) => i.name.trim()).filter(Boolean);
      const extraExpense = fixedExpenses.map((e) => e.name.trim()).filter(Boolean);
      const newIncomeCategories = mergeUniqueCategoryLists([base.income, extraIncome]);
      const newExpenseCategories = mergeUniqueCategoryLists([base.expense, extraExpense]);

      // 2. Update user profile
      await updateDoc(doc(db, 'users', user.uid), {
        phoneNumber,
        onboardingCompleted: true,
        incomeCategories: newIncomeCategories,
        expenseCategories: newExpenseCategories
      });

      // 3. Add fixed incomes
      for (const income of fixedIncomes) {
        if (income.name && income.amount) {
          await addDoc(collection(db, 'fixedFinances'), {
            userId: user.uid,
            category: income.name,
            amount: parseFloat(income.amount),
            type: 'income',
            dayOfMonth: 1,
            description: 'Initial fixed income',
            createdAt: serverTimestamp()
          });
        }
      }

      // 3. Add fixed expenses
      for (const expense of fixedExpenses) {
        if (expense.name && expense.amount) {
          await addDoc(collection(db, 'fixedFinances'), {
            userId: user.uid,
            category: expense.name,
            amount: parseFloat(expense.amount),
            type: 'expense',
            dayOfMonth: 1,
            description: 'Initial fixed expense',
            createdAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4 transition-colors">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden transition-colors"
      >
        {/* Progress Bar */}
        <div className="h-2 bg-slate-100 dark:bg-slate-700 flex">
          <motion.div
            className="h-full bg-blue-600"
            initial={{ width: '0%' }}
            animate={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="p-8 md:p-12">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Phone className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white">Welcome!</h2>
                  <p className="text-slate-500 dark:text-slate-400">Let's start by adding your mobile number.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Mobile Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g. +880 1XXX XXXXXX"
                    className="w-full p-5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-4 focus:ring-blue-500/20 outline-none dark:text-white text-lg font-medium transition-all"
                  />
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!phoneNumber}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <TrendingUp className="w-10 h-10 text-green-600 dark:text-green-400" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white">Fixed Income</h2>
                  <p className="text-slate-500 dark:text-slate-400">Add your regular monthly income sources.</p>
                </div>

                <div className="space-y-6 max-h-[45vh] overflow-y-auto pr-2 custom-scrollbar">
                  {fixedIncomes.map((income, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <div className="flex-1 space-y-4 p-6 bg-slate-50 dark:bg-slate-700/50 rounded-3xl border border-slate-200 dark:border-slate-600 shadow-sm">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
                            <TrendingUp className="w-3 h-3" /> {t('sourceName')}
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Monthly Salary"
                            value={income.name}
                            onChange={(e) => updateIncome(index, 'name', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 outline-none dark:text-white font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest flex items-center gap-2">
                            <Plus className="w-3 h-3" /> {t('amount')}
                          </label>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={income.amount}
                            onChange={(e) => updateIncome(index, 'amount', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 outline-none dark:text-white text-2xl font-black placeholder:text-slate-400 focus:ring-2 focus:ring-green-500/20 transition-all"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeIncome(index)}
                        className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all mt-4"
                      >
                        <Trash2 className="w-6 h-6" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addIncome}
                    className="w-full py-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-slate-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 font-bold"
                  >
                    <Plus className="w-5 h-5" /> {t('add')} {t('incomeSource')}
                  </button>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 flex items-center justify-center gap-2"
                  >
                    Continue <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-red-50 dark:bg-red-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <TrendingDown className="w-10 h-10 text-red-600 dark:text-red-400" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white">Fixed Expenses</h2>
                  <p className="text-slate-500 dark:text-slate-400">Add your regular monthly bills and expenses.</p>
                </div>

                <div className="space-y-6 max-h-[45vh] overflow-y-auto pr-2 custom-scrollbar">
                  {fixedExpenses.map((expense, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <div className="flex-1 space-y-4 p-6 bg-slate-50 dark:bg-slate-700/50 rounded-3xl border border-slate-200 dark:border-slate-600 shadow-sm">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-2">
                            <TrendingDown className="w-3 h-3" /> {t('sourceName')}
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. House Rent"
                            value={expense.name}
                            onChange={(e) => updateExpense(index, 'name', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 outline-none dark:text-white font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Plus className="w-3 h-3" /> {t('amount')}
                          </label>
                          <input
                            type="number"
                            placeholder="0.00"
                            value={expense.amount}
                            onChange={(e) => updateExpense(index, 'amount', e.target.value)}
                            className="w-full bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 outline-none dark:text-white text-2xl font-black placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 transition-all"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removeExpense(index)}
                        className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-all mt-4"
                      >
                        <Trash2 className="w-6 h-6" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addExpense}
                    className="w-full py-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-slate-500 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all flex items-center justify-center gap-2 font-bold"
                  >
                    <Plus className="w-5 h-5" /> {t('add')} {t('expenseSource')}
                  </button>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    className="flex-1 py-5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 flex items-center justify-center gap-2"
                  >
                    Review <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2">
                  <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-10 h-10 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white">All Set!</h2>
                  <p className="text-slate-500 dark:text-slate-400">Ready to start tracking your finances?</p>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-700 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Phone Number</span>
                    <span className="font-bold dark:text-white">{phoneNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Fixed Incomes</span>
                    <span className="font-bold dark:text-white">{fixedIncomes.length} sources</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Fixed Expenses</span>
                    <span className="font-bold dark:text-white">{fixedExpenses.length} sources</span>
                  </div>
                </div>

                <button
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 dark:shadow-none active:scale-95 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  Finish Setup
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default Onboarding;
