import React, { useState } from 'react';
import { useTransactions, Transaction } from '../hooks/useTransactions';
import { useLocalization } from '../contexts/LocalizationContext';
import { db } from '../firebaseConfig';
import { doc, deleteDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import { Edit2, Trash2, Search, Filter, Calendar, User, Tag, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import TransactionForm from './TransactionForm';

const TransactionList: React.FC = () => {
  const { transactions = [], loading } = useTransactions();
  const { t, language } = useLocalization();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'debt_repayment'>('all');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'transactions', id));
      setDeleteConfirmId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${id}`);
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch = 
      tx.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.note.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.familyMember.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || tx.type === filterType;
    
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between neon-card p-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
        </div>
        
        <div className="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-2xl w-full md:w-auto">
          {(['all', 'income', 'expense', 'debt_repayment'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "px-6 py-2 rounded-xl font-semibold transition-all capitalize",
                filterType === type 
                  ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" 
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              {t(type)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredTransactions.length > 0 ? (
            filteredTransactions.map((tx) => (
              <motion.div
                key={tx.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="neon-card p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                    tx.type === 'expense'
                      ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                      : tx.type === 'debt_repayment'
                        ? "bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400"
                        : "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                  )}>
                    {tx.type === 'expense' ? <ArrowDownLeft className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 dark:text-white text-lg">{tx.category}</h3>
                      <span className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg font-medium">
                        {tx.familyMember}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {tx.date ? (
                          typeof tx.date.toDate === 'function' 
                            ? tx.date.toDate().toLocaleDateString() 
                            : (tx.date instanceof Date ? tx.date.toLocaleDateString() : 'N/A')
                        ) : 'N/A'}
                      </div>
                      {tx.note && (
                        <div className="flex items-center gap-1 italic">
                          <Tag className="w-4 h-4" />
                          {tx.note}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-6">
                  <div className={cn(
                    "text-xl font-black",
                    tx.type === 'expense' ? "text-red-600 dark:text-red-400" :
                    tx.type === 'debt_repayment' ? "text-teal-600 dark:text-teal-400" :
                    "text-green-600 dark:text-green-400"
                  )}>
                    {tx.type === 'expense' ? '-' : '+'} {formatCurrency(tx.amount, language)}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingTransaction(tx)}
                      className="p-3 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-2xl transition-colors"
                      title={t('edit')}
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(tx.id)}
                      className="p-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-2xl transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700"
            >
              <div className="bg-slate-100 dark:bg-slate-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-medium">{t('noTransactions')}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
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
                  onClick={() => handleDelete(deleteConfirmId)}
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

export default TransactionList;
