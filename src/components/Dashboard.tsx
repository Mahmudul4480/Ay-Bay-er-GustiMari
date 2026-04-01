import React from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, cn } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Wallet, CreditCard, AlertTriangle, Trash2, PieChart as PieChartIcon } from 'lucide-react';
import TransactionForm from './TransactionForm';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';

interface DashboardProps {
  onTabChange?: (tab: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onTabChange }) => {
  const { transactions = [], debts = [] } = useTransactions();
  const { t, language } = useLocalization();
  const { userProfile } = useAuth();
  const [modalType, setModalType] = React.useState<'income' | 'expense' | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  const regularTransactions = transactions.filter(t => !t.debtId);

  const totalIncome = regularTransactions
    .filter(t => t.type === 'income')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = regularTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalLent = debts
    .filter(d => d.type === 'lent' && d.status === 'unpaid')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalBorrowed = debts
    .filter(d => d.type === 'borrowed' && d.status === 'unpaid')
    .reduce((acc, curr) => acc + curr.amount, 0);

  // Formula: Total Balance = (Regular Income - Regular Expenses) - (Money Lent/Paona) + (Money Borrowed/Dena)
  const balance = (totalIncome - totalExpense) - totalLent + totalBorrowed;
  const netDebt = totalBorrowed - totalLent;

  const deleteTransaction = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
      setDeleteConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
    }
  };

  const budgetLimit = userProfile?.budgetLimit || 0;
  const isOverBudget = budgetLimit > 0 && totalExpense >= budgetLimit * 0.8;

  const stats = [
    { id: 'balance', label: t('totalBalance'), value: balance, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'income', label: t('monthlyIncome'), value: totalIncome, icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
    { id: 'expense', label: t('monthlyExpense'), value: totalExpense, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
    { 
      id: 'netDebt', 
      label: t('netDebt'), 
      value: netDebt, 
      icon: CreditCard, 
      color: netDebt > 0 ? 'text-orange-600' : (netDebt < 0 ? 'text-green-600' : 'text-slate-600'), 
      bg: netDebt > 0 ? 'bg-orange-50' : (netDebt < 0 ? 'bg-green-50' : 'bg-slate-50') 
    },
  ];

  const categoryData = regularTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc: any[], curr) => {
      const existing = acc.find(a => a.name === curr.category);
      if (existing) {
        existing.value += curr.amount;
      } else {
        acc.push({ name: curr.category, value: curr.amount });
      }
      return acc;
    }, []);

  const memberExpenseData = regularTransactions
    .filter(t => t.type === 'expense')
    .reduce((acc: any[], curr) => {
      const existing = acc.find(a => a.name === curr.familyMember);
      if (existing) {
        existing.value += curr.amount;
      } else {
        acc.push({ name: curr.familyMember, value: curr.amount });
      }
      return acc;
    }, []);

  const memberIncomeData = regularTransactions
    .filter(t => t.type === 'income')
    .reduce((acc: any[], curr) => {
      const existing = acc.find(a => a.name === curr.familyMember);
      if (existing) {
        existing.value += curr.amount;
      } else {
        acc.push({ name: curr.familyMember, value: curr.amount });
      }
      return acc;
    }, []);

  const COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];

  return (
    <div className="space-y-8">
      {isOverBudget && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/30 p-4 rounded-2xl flex items-center gap-3 text-orange-700 dark:text-orange-400"
        >
          <AlertTriangle className="w-5 h-5" />
          <p className="font-semibold">{t('warningLimit')}</p>
        </motion.div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => {
              if (stat.id === 'income') setModalType('income');
              else if (stat.id === 'expense') setModalType('expense');
              else if (stat.id === 'netDebt' && onTabChange) onTabChange('debts');
            }}
            className={cn(
              "bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-4 transition-colors",
              (stat.id === 'income' || stat.id === 'expense' || stat.id === 'netDebt') && "cursor-pointer hover:shadow-md transition-shadow active:scale-95"
            )}
          >
            <div className={cn("p-4 rounded-2xl", stat.bg, stat.bg.includes('blue') && 'dark:bg-blue-900/20', stat.bg.includes('green') && 'dark:bg-green-900/20', stat.bg.includes('red') && 'dark:bg-red-900/20', stat.bg.includes('orange') && 'dark:bg-orange-900/20', stat.bg.includes('slate') && 'dark:bg-slate-700')}>
              <stat.icon className={cn("w-6 h-6", stat.color, stat.color.includes('blue') && 'dark:text-blue-400', stat.color.includes('green') && 'dark:text-green-400', stat.color.includes('red') && 'dark:text-red-400', stat.color.includes('orange') && 'dark:text-orange-400', stat.color.includes('slate') && 'dark:text-slate-400')} />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{stat.label}</p>
              <p className={cn("text-2xl font-bold", stat.color, stat.color.includes('blue') && 'dark:text-blue-400', stat.color.includes('green') && 'dark:text-green-400', stat.color.includes('red') && 'dark:text-red-400', stat.color.includes('orange') && 'dark:text-orange-400', stat.color.includes('slate') && 'dark:text-slate-400')}>{formatCurrency(stat.value, language)}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors"
        >
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">{t('monthlyExpense')} {t('category')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                  }} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors"
        >
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">{t('expenseByMember')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={memberExpenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {memberExpenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                  }} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors"
        >
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">{t('income')} vs {t('expense')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: 'Total', income: totalIncome, expense: totalExpense }]}>
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                  }} 
                />
                <Legend />
                <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} name={t('income')} />
                <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} name={t('expense')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors"
        >
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">{t('incomeByMember')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={memberIncomeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {memberIncomeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: document.documentElement.classList.contains('dark') ? '#1e293b' : '#fff',
                    color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
                  }} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-700 transition-colors">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">{t('dashboard')} - Recent Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400">{t('date')}</th>
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400">{t('category')}</th>
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400">{t('familyMember')}</th>
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400 text-right">{t('amount')}</th>
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 5).map((tx) => (
                <tr key={tx.id} className="border-b border-slate-50 dark:border-slate-700/50 last:border-0 group">
                  <td className="py-4 text-slate-600 dark:text-slate-400">
                    {tx.date && typeof tx.date.toDate === 'function' 
                      ? tx.date.toDate().toLocaleDateString() 
                      : 'N/A'}
                  </td>
                  <td className="py-4 font-medium text-slate-800 dark:text-white">{tx.category}</td>
                  <td className="py-4 text-slate-500 dark:text-slate-400">{tx.familyMember}</td>
                  <td className={cn("py-4 font-bold text-right", tx.type === 'income' ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, language)}
                  </td>
                  <td className="py-4 text-right">
                    <button 
                      onClick={() => setDeleteConfirmId(tx.id)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {modalType && (
          <TransactionForm 
            onClose={() => setModalType(null)} 
            initialType={modalType} 
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
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
                  onClick={() => deleteTransaction(deleteConfirmId)}
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

export default Dashboard;
