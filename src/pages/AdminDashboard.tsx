import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, TrendingUp, TrendingDown, ArrowLeft, User as UserIcon, 
  Download, Filter, Search, ChevronRight, X, CreditCard, 
  Calendar, PieChart as PieChartIcon, BarChart3, Wallet,
  Star, ShieldCheck
} from 'lucide-react';
import { formatCurrency, cn } from '../lib/utils';
import { useLocalization } from '../contexts/LocalizationContext';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import { startOfWeek, format, subWeeks, isWithinInterval } from 'date-fns';

const AdminDashboard: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { language, t } = useLocalization();
  const adminChartUid = React.useId().replace(/:/g, '');

  const chartTooltipStyle = useCallback((): React.CSSProperties => {
    const dark = document.documentElement.classList.contains('dark');
    return {
      borderRadius: '16px',
      border: 'none',
      boxShadow: dark
        ? '0 22px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'
        : '0 22px 44px -10px rgba(15,23,42,0.2), 0 10px 24px -6px rgba(99,102,241,0.2)',
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      color: dark ? '#fff' : '#0f172a',
      padding: '12px 16px',
    };
  }, []);
  const [users, setUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'high_spenders' | 'shoppers' | 'savers'>('all');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userTransactions, setUserTransactions] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (usersSnap) => {
      const usersList = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      const unsubscribeTransactions = onSnapshot(collection(db, 'transactions'), (transactionsSnap) => {
        const transactionsList = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        setTransactions(transactionsList);
        
        const enriched = usersList.map((user: any) => {
          const userTrans = transactionsList.filter((t: any) => t.userId === user.id);
          const income = userTrans.filter((t: any) => t.type === 'income').reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
          const expense = userTrans.filter((t: any) => t.type === 'expense').reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
          
          const expenseCategories: Record<string, number> = {};
          userTrans.filter((t: any) => t.type === 'expense').forEach((t: any) => {
            expenseCategories[t.category] = (expenseCategories[t.category] || 0) + (Number(t.amount) || 0);
          });
          
          const topCategory = Object.entries(expenseCategories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
          const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

          return {
            ...user,
            totalIncome: income,
            totalExpense: expense,
            balance: income - expense,
            transactionCount: userTrans.length,
            topCategory,
            savingsRate,
            subscription: userTrans.length > 15 ? 'Premium' : 'Free'
          };
        });

        setUsers(enriched);
        setLoading(false);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'transactions');
        setLoading(false);
      });

      return () => unsubscribeTransactions();
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
      setLoading(false);
    });

    return () => unsubscribeUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = 
        user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;

      switch (filter) {
        case 'high_spenders': return user.totalExpense > 50000;
        case 'shoppers': return user.topCategory === 'Shopping';
        case 'savers': return user.savingsRate > 20;
        default: return true;
      }
    });
  }, [users, searchTerm, filter]);

  const spendingDistribution = useMemo(() => {
    const categories: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });
    return Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [transactions]);

  const userGrowthData = useMemo(() => {
    const weeks: Record<string, number> = {};
    const now = new Date();
    
    // Initialize last 6 weeks
    for (let i = 5; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i));
      weeks[format(weekStart, 'MMM dd')] = 0;
    }

    users.forEach(user => {
      if (user.createdAt?.toDate) {
        const date = user.createdAt.toDate();
        const weekStart = startOfWeek(date);
        const key = format(weekStart, 'MMM dd');
        if (weeks[key] !== undefined) {
          weeks[key]++;
        }
      }
    });

    return Object.entries(weeks).map(([name, count]) => ({ name, count }));
  }, [users]);

  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Mobile', 'Top Category', 'Total Income', 'Total Expense', 'Balance'];
    const data = filteredUsers.map(u => [
      u.displayName || 'N/A',
      u.email,
      u.phoneNumber || 'N/A',
      u.topCategory,
      u.totalIncome,
      u.totalExpense,
      u.balance
    ]);

    const csvContent = [
      headers.join(','),
      ...data.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `users_marketing_data_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUserClick = async (user: any) => {
    setSelectedUser(user);
    const userTrans = transactions
      .filter(t => t.userId === user.id)
      .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0))
      .slice(0, 5);
    setUserTransactions(userTrans);
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-slate-800 dark:text-white">Marketing Insights</h2>
            <p className="text-slate-500 dark:text-slate-400">Deep dive into user behavior and financial health</p>
          </div>
        </div>
        <button 
          onClick={exportToCSV}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/20 active:scale-95"
        >
          <Download className="w-5 h-5" />
          Export for Ads
        </button>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="admin-chart-card-3d rounded-[2.5rem] border border-slate-200/90 p-6 dark:border-slate-700"
        >
          <div className="flex items-center gap-3 mb-6">
            <PieChartIcon className="w-5 h-5 text-blue-500" />
            <h3 className="font-bold text-slate-800 dark:text-white">Global Spending Distribution</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <linearGradient key={i} id={`adm-pie-${adminChartUid}-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.58} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={spendingDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {spendingDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#adm-pie-${adminChartUid}-${index % COLORS.length})`} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={chartTooltipStyle()}
                  formatter={(value: number) => formatCurrency(value, language)}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="admin-chart-card-3d rounded-[2.5rem] border border-slate-200/90 p-6 dark:border-slate-700"
        >
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="w-5 h-5 text-purple-500" />
            <h3 className="font-bold text-slate-800 dark:text-white">User Growth (Weekly)</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userGrowthData}>
                <defs>
                  <linearGradient id={`adm-bar-${adminChartUid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" />
                    <stop offset="100%" stopColor="#c4b5fd" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }}
                  contentStyle={chartTooltipStyle()}
                />
                <Bar dataKey="count" fill={`url(#adm-bar-${adminChartUid})`} radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input 
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          {[
            { id: 'all', label: 'All Users', icon: Users },
            { id: 'high_spenders', label: 'High Spenders', icon: TrendingUp },
            { id: 'shoppers', label: 'Shoppers', icon: CreditCard },
            { id: 'savers', label: 'Savers', icon: Wallet }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={cn(
                "flex items-center gap-2 px-6 py-4 rounded-2xl font-bold whitespace-nowrap transition-all border",
                filter === f.id 
                  ? "bg-blue-600 border-blue-600 text-white shadow-[0_12px_28px_-4px_rgba(59,130,246,0.45)]" 
                  : "bg-white dark:bg-slate-800 border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.08)]"
              )}
            >
              <f.icon className="w-4 h-4" />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* User Table */}
      <div className="admin-table-card-3d overflow-hidden rounded-[2.5rem] border border-slate-200/90 dark:border-slate-700">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50">
                <th className="p-6 text-sm font-bold text-slate-600 dark:text-slate-400">User Details</th>
                <th className="p-6 text-sm font-bold text-slate-600 dark:text-slate-400">Financial Health</th>
                <th className="p-6 text-sm font-bold text-slate-600 dark:text-slate-400">Top Category</th>
                <th className="p-6 text-sm font-bold text-slate-600 dark:text-slate-400">Activity</th>
                <th className="p-6 text-sm font-bold text-slate-600 dark:text-slate-400">Status</th>
                <th className="p-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filteredUsers.map((user) => (
                <tr 
                  key={user.id} 
                  onClick={() => handleUserClick(user)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer group"
                >
                  <td className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {user.photoURL ? (
                          <img src={user.photoURL} alt="" className="w-12 h-12 rounded-2xl object-cover" />
                        ) : (
                          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
                            <UserIcon className="w-6 h-6 text-slate-400" />
                          </div>
                        )}
                        {user.subscription === 'Premium' && (
                          <div className="absolute -top-1 -right-1 bg-amber-400 rounded-full p-1 border-2 border-white dark:border-slate-800">
                            <Star className="w-2 h-2 text-white fill-current" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-white">{user.displayName || 'Anonymous'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                        {user.phoneNumber && (
                          <p className="text-[10px] text-blue-500 font-medium mt-0.5">{user.phoneNumber}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-green-600">+{formatCurrency(user.totalIncome, language)}</p>
                      <p className="text-sm font-bold text-red-500">-{formatCurrency(user.totalExpense, language)}</p>
                      <p className="text-xs font-medium text-slate-400">Bal: {formatCurrency(user.balance, language)}</p>
                    </div>
                  </td>
                  <td className="p-6">
                    <span className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300">
                      {user.topCategory}
                    </span>
                  </td>
                  <td className="p-6">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{user.transactionCount} txns</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      user.subscription === 'Premium' 
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" 
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                    )}>
                      {user.subscription}
                    </span>
                  </td>
                  <td className="p-6 text-right">
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUser(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                <div className="flex items-center gap-4">
                  {selectedUser.photoURL ? (
                    <img src={selectedUser.photoURL} alt="" className="w-16 h-16 rounded-3xl border-4 border-white/20" />
                  ) : (
                    <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center">
                      <UserIcon className="w-8 h-8 text-white" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-bold">{selectedUser.displayName || 'Anonymous'}</h3>
                    <p className="text-blue-100 text-sm">{selectedUser.email}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-8">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mb-1">Income</p>
                    <p className="text-lg font-black text-green-600">{formatCurrency(selectedUser.totalIncome, language)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mb-1">Expense</p>
                    <p className="text-lg font-black text-red-500">{formatCurrency(selectedUser.totalExpense, language)}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mb-1">Balance</p>
                    <p className="text-lg font-black text-blue-600">{formatCurrency(selectedUser.balance, language)}</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      Recent Activity
                    </h4>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Last 5 Transactions</span>
                  </div>
                  <div className="space-y-3">
                    {userTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            t.type === 'expense' ? "bg-red-100 dark:bg-red-900/30" :
                            t.type === 'debt_repayment' ? "bg-teal-100 dark:bg-teal-900/30" :
                            "bg-green-100 dark:bg-green-900/30"
                          )}>
                            {t.type === 'expense' ? (
                              <TrendingDown className="w-5 h-5 text-red-600" />
                            ) : t.type === 'debt_repayment' ? (
                              <TrendingUp className="w-5 h-5 text-teal-600" />
                            ) : (
                              <TrendingUp className="w-5 h-5 text-green-600" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 dark:text-white">{t.category}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{t.date?.toDate ? format(t.date.toDate(), 'MMM dd, yyyy') : 'N/A'}</p>
                          </div>
                        </div>
                        <p className={cn(
                          "font-black",
                          t.type === 'expense' ? "text-red-500" :
                          t.type === 'debt_repayment' ? "text-teal-600" :
                          "text-green-600"
                        )}>
                          {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount, language)}
                        </p>
                      </div>
                    ))}
                    {userTransactions.length === 0 && (
                      <div className="text-center py-8 text-slate-400 italic">No transactions found for this user.</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  <p className="text-xs text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                    This user is currently on the <span className="font-bold uppercase tracking-widest">{selectedUser.subscription}</span> plan. 
                    {selectedUser.subscription === 'Free' ? ' Consider targeting them with a premium upgrade offer.' : ' They are a valued premium supporter.'}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
