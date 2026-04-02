import React from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, cn } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Wallet, CreditCard, AlertTriangle, Trash2, PieChart as PieChartIcon, Edit2, ArrowRight, X } from 'lucide-react';
import TransactionForm from './TransactionForm';
import { Transaction } from '../hooks/useTransactions';
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
  const [editingTransaction, setEditingTransaction] = React.useState<Transaction | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [showBalanceBreakdown, setShowBalanceBreakdown] = React.useState(false);

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

  const trendData = regularTransactions.reduce((acc: any[], curr) => {
    const date = curr.date && typeof curr.date.toDate === 'function' ? curr.date.toDate() : new Date();
    const month = date.toLocaleString('default', { month: 'short', year: '2-digit' });
    const existing = acc.find(a => a.name === month);
    if (existing) {
      if (curr.type === 'income') existing.income += curr.amount;
      else existing.expense += curr.amount;
    } else {
      acc.push({ 
        name: month, 
        income: curr.type === 'income' ? curr.amount : 0, 
        expense: curr.type === 'expense' ? curr.amount : 0,
        timestamp: date.getTime() 
      });
    }
    return acc;
  }, []).sort((a, b) => a.timestamp - b.timestamp);

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
              if (stat.id === 'balance') setShowBalanceBreakdown(true);
              else if (stat.id === 'income') setModalType('income');
              else if (stat.id === 'expense') setModalType('expense');
              else if (stat.id === 'netDebt' && onTabChange) onTabChange('debts');
            }}
            className={cn(
              "neon-card p-6 flex items-center gap-4 transition-all",
              (stat.id === 'balance' || stat.id === 'income' || stat.id === 'expense' || stat.id === 'netDebt') && "cursor-pointer active:scale-95"
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
          className="neon-card p-8 lg:col-span-2"
        >
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">Income & Expense Trends</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `৳${value}`}
                />
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
                <Line 
                  type="monotone" 
                  dataKey="income" 
                  stroke="#10b981" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#10b981' }}
                  activeDot={{ r: 6 }}
                  name={t('income')} 
                />
                <Line 
                  type="monotone" 
                  dataKey="expense" 
                  stroke="#ef4444" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#ef4444' }}
                  activeDot={{ r: 6 }}
                  name={t('expense')} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="neon-card p-8"
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
          className="neon-card p-8"
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
          className="neon-card p-8"
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
          className="neon-card p-8"
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

      <div className="neon-card p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white">{t('dashboard')} - Recent Transactions</h3>
          {onTabChange && (
            <button 
              onClick={() => onTabChange('transactions')}
              className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold hover:gap-3 transition-all"
            >
              View All <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
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
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => setEditingTransaction(tx)}
                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-400 hover:text-blue-500 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirmId(tx.id)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Balance Breakdown Modal */}
      <AnimatePresence>
        {showBalanceBreakdown && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden transition-colors"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">{t('totalBalance')} Details</h2>
                <button onClick={() => setShowBalanceBreakdown(false)} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">{t('monthlyIncome')} (+)</span>
                    <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(totalIncome, language)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">{t('monthlyExpense')} (-)</span>
                    <span className="text-red-600 dark:text-red-400 font-bold">{formatCurrency(totalExpense, language)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">{t('lent')} / Paona (-)</span>
                    <span className="text-orange-600 dark:text-orange-400 font-bold">{formatCurrency(totalLent, language)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">{t('borrowed')} / Dena (+)</span>
                    <span className="text-blue-600 dark:text-blue-400 font-bold">{formatCurrency(totalBorrowed, language)}</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-slate-800 dark:text-white">{t('totalBalance')}</span>
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{formatCurrency(balance, language)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 italic">
                    Formula: (Income - Expense) - Lent + Borrowed
                  </p>
                </div>

                <button
                  onClick={() => setShowBalanceBreakdown(false)}
                  className="w-full py-4 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalType && (
          <TransactionForm 
            onClose={() => setModalType(null)} 
            initialType={modalType} 
          />
        )}
        {editingTransaction && (
          <TransactionForm 
            transaction={editingTransaction}
            onClose={() => setEditingTransaction(null)} 
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
