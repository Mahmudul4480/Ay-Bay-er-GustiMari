import React from 'react';
import { useTransactions } from '../hooks/useTransactions';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuth } from '../contexts/AuthContext';
import GrowthDashboardSections from './growth/GrowthDashboardSections';
import { formatCurrency, formatCurrencyKpiSegments, cn } from '../lib/utils';
import { useMonthSelection } from '../contexts/MonthSelectionContext';
import {
  getMonthKeyFromDate,
  getTransactionDate,
  isTransactionInMonthKey,
  parseMonthKey,
} from '../lib/monthUtils';
import LiveClockDate from './LiveClockDate';
import MonthPicker from './MonthPicker';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  Brush,
  Sector,
} from 'recharts';
import type { PieSectorDataItem } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Wallet, CreditCard, AlertTriangle, Trash2, PieChart as PieChartIcon, Edit2, ArrowRight, X, CalendarX } from 'lucide-react';
import TransactionForm from './TransactionForm';
import { Transaction } from '../hooks/useTransactions';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { computeFinancialPersona, type PersonaId } from '../lib/financialPersona';

const PERSONA_TAG_EN: Record<PersonaId, string> = {
  saver: 'The Saver',
  gourmet: 'The Gourmet',
  investor: 'The Investor',
  spender: 'Smart Spender',
  balanced: 'The Balanced',
};

interface DashboardProps {
  onTabChange?: (tab: string) => void;
}

/** Firestore may deserialize numbers as strings; always coerce before math. */
function txAmount(tx: { amount: unknown }): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Recharts Pie: expand hovered slice (3D lift effect). */
function renderPieActiveShape(props: PieSectorDataItem) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const innerRadius = Number(props.innerRadius ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0) + 12;
  const startAngle = Number(props.startAngle ?? 0);
  const endAngle = Number(props.endAngle ?? 0);
  const fill = typeof props.fill === 'string' ? props.fill : '#3b82f6';
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        style={{
          filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.22))',
          transition: 'transform 0.2s ease',
        }}
      />
    </g>
  );
}

const Dashboard: React.FC<DashboardProps> = ({ onTabChange }) => {
  const { transactions = [], debts = [] } = useTransactions();
  const { t, language } = useLocalization();
  const { userProfile, user } = useAuth();
  const { selectedMonthKey: monthKey, currentMonthKey } = useMonthSelection();
  const isViewingCurrentCalendarMonth = monthKey === currentMonthKey;
  const isHistoryMode = !isViewingCurrentCalendarMonth;
  const chartUid = React.useId().replace(/:/g, '');

  const cardShell = React.useCallback(
    (...extra: (string | boolean | undefined)[]) =>
      cn(
        'neon-card dashboard-card-3d',
        isHistoryMode && 'dashboard-history-card dashboard-history-card-pulse',
        ...extra
      ),
    [isHistoryMode]
  );

  const chartTooltipStyle = React.useCallback((): React.CSSProperties => {
    const dark = document.documentElement.classList.contains('dark');
    return {
      borderRadius: '16px',
      border: 'none',
      boxShadow: dark
        ? '0 22px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)'
        : '0 22px 44px -10px rgba(15,23,42,0.2), 0 10px 24px -6px rgba(59,130,246,0.18)',
      backgroundColor: dark ? '#1e293b' : '#ffffff',
      color: dark ? '#fff' : '#0f172a',
      padding: '12px 16px',
    };
  }, []);
  const [modalType, setModalType] = React.useState<'income' | 'expense' | null>(null);
  const [editingTransaction, setEditingTransaction] = React.useState<Transaction | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [showBalanceBreakdown, setShowBalanceBreakdown] = React.useState(false);

  const monthTransactions = React.useMemo(
    () => transactions.filter((tx) => isTransactionInMonthKey(tx, monthKey)),
    [transactions, monthKey]
  );

  const recentMonthTransactions = React.useMemo(() => {
    const list = monthTransactions.filter((tx) => tx.type === 'income' || tx.type === 'expense');
    const getTime = (tx: Transaction) => getTransactionDate(tx)?.getTime() ?? 0;
    return [...list].sort((a, b) => getTime(b) - getTime(a));
  }, [monthTransactions]);

  // Earned income only — debt-linked transactions (Debt Taken, etc.) excluded
  const totalIncome = monthTransactions
    .filter((t) => t.type === 'income' && !t.debtId)
    .reduce((acc, curr) => acc + txAmount(curr), 0);

  // Actual spending only — debt-linked transactions (Debt Given, Debit Reversal, etc.) excluded
  const totalExpense = monthTransactions
    .filter((t) => t.type === 'expense' && !t.debtId)
    .reduce((acc, curr) => acc + txAmount(curr), 0);

  // Debt in-flows: borrowed money + collected-back lending (both increase cash)
  const debtInflows = monthTransactions
    .filter((t) => (t.type === 'income' && !!t.debtId) || t.type === 'debt_repayment')
    .reduce((acc, t) => acc + txAmount(t), 0);

  // Debt out-flows: money lent out + borrowed money repaid (both decrease cash)
  const debtOutflows = monthTransactions
    .filter((t) => t.type === 'expense' && !!t.debtId)
    .reduce((acc, t) => acc + txAmount(t), 0);

  const totalLent = debts
    .filter((d) => d.type === 'lent' && d.status === 'unpaid')
    .reduce((acc, curr) => acc + txAmount(curr), 0);

  const totalBorrowed = debts
    .filter((d) => d.type === 'borrowed' && d.status === 'unpaid')
    .reduce((acc, curr) => acc + txAmount(curr), 0);

  // True cash balance: all income/debt_repayment add, all expense subtracts
  const balance = monthTransactions.reduce((acc, tx) => {
    const amt = txAmount(tx);
    if (tx.type === 'income' || tx.type === 'debt_repayment') return acc + amt;
    if (tx.type === 'expense') return acc - amt;
    return acc;
  }, 0);
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
  const isOverBudget =
    isViewingCurrentCalendarMonth && budgetLimit > 0 && totalExpense >= budgetLimit * 0.8;

  type KpiVariant = 'balance' | 'income' | 'expense' | 'debt';

  const stats: {
    id: string;
    label: string;
    value: number;
    icon: typeof Wallet;
    kpiVariant: KpiVariant;
  }[] = [
    { id: 'balance', label: t('totalBalance'), value: balance, icon: Wallet, kpiVariant: 'balance' },
    { id: 'income', label: t('monthlyIncome'), value: totalIncome, icon: TrendingUp, kpiVariant: 'income' },
    { id: 'expense', label: t('monthlyExpense'), value: totalExpense, icon: TrendingDown, kpiVariant: 'expense' },
    { id: 'netDebt', label: t('netDebt'), value: netDebt, icon: CreditCard, kpiVariant: 'debt' },
  ];

  const kpiNeoClass: Record<KpiVariant, string> = {
    balance: 'kpi-stat-neo--balance',
    income: 'kpi-stat-neo--income',
    expense: 'kpi-stat-neo--expense',
    debt: 'kpi-stat-neo--debt',
  };

  /** Icons: crisp on neo tiles — light tint in day, white in dark */
  const kpiIconClass: Record<KpiVariant, string> = {
    balance: 'text-sky-700 dark:text-white',
    income: 'text-emerald-800 dark:text-white',
    expense: 'text-rose-700 dark:text-white',
    debt: 'text-amber-800 dark:text-white',
  };

  const kpiLabelClass =
    'text-slate-800 dark:text-white/95 font-bold uppercase tracking-wider [text-shadow:0_1px_0_rgba(255,255,255,0.4)] dark:[text-shadow:0_1px_3px_rgba(0,0,0,0.5)]';

  const kpiCurrencyClass =
    'shrink-0 whitespace-nowrap font-bold leading-none text-slate-700 dark:text-white/90 text-[0.62rem] min-[400px]:text-[0.72rem] sm:text-xs [text-shadow:0_1px_0_rgba(255,255,255,0.35)] dark:[text-shadow:0_1px_4px_rgba(0,0,0,0.55)]';

  const kpiNumberClass =
    'shrink-0 whitespace-nowrap font-black tabular-nums tracking-tight text-slate-900 dark:text-white [text-shadow:0_1px_0_rgba(255,255,255,0.25)] dark:[text-shadow:0_0_20px_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.45)] text-[clamp(0.98rem,3.8vw+0.45rem,2.05rem)] sm:text-[clamp(1.1rem,2.4vw+0.65rem,2.2rem)]';

  const categoryData = monthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((acc: any[], curr) => {
      const existing = acc.find(a => a.name === curr.category);
      if (existing) {
        existing.value += txAmount(curr);
      } else {
        acc.push({ name: curr.category, value: txAmount(curr) });
      }
      return acc;
    }, []);

  const memberExpenseData = monthTransactions
    .filter((t) => t.type === 'expense')
    .reduce((acc: any[], curr) => {
      const existing = acc.find(a => a.name === curr.familyMember);
      if (existing) {
        existing.value += txAmount(curr);
      } else {
        acc.push({ name: curr.familyMember, value: txAmount(curr) });
      }
      return acc;
    }, []);

  const memberIncomeData = monthTransactions
    .filter((t) => t.type === 'income')
    .reduce((acc: any[], curr) => {
      const existing = acc.find(a => a.name === curr.familyMember);
      if (existing) {
        existing.value += txAmount(curr);
      } else {
        acc.push({ name: curr.familyMember, value: txAmount(curr) });
      }
      return acc;
    }, []);

  const COLORS = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899'];

  const trendData = React.useMemo(() => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return [];
    const { year, monthIndex } = parsed;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const daily: { name: string; income: number; expense: number; day: number }[] = Array.from(
      { length: daysInMonth },
      (_, i) => ({
        name: String(i + 1),
        income: 0,
        expense: 0,
        day: i + 1,
      })
    );

    monthTransactions.forEach((curr) => {
      const date = getTransactionDate(curr);
      if (!date || getMonthKeyFromDate(date) !== monthKey) return;
      const day = date.getDate();
      const row = daily[day - 1];
      if (!row) return;
      if (curr.type === 'income') row.income += txAmount(curr);
      else if (curr.type === 'expense') row.expense += txAmount(curr);
    });

    return daily;
  }, [monthTransactions, monthKey]);

  const monthLabel = React.useMemo(() => {
    const parsed = parseMonthKey(monthKey);
    if (!parsed) return monthKey;
    return new Date(parsed.year, parsed.monthIndex, 1).toLocaleString(
      language === 'bn' ? 'bn-BD' : 'en-US',
      { month: 'long', year: 'numeric' }
    );
  }, [monthKey, language]);

  const financialPersona = React.useMemo(
    () => computeFinancialPersona(transactions),
    [transactions]
  );

  const dashboardDisplayName = React.useMemo(() => {
    const fromProfile = userProfile?.displayName?.trim();
    const fromAuth = user?.displayName?.trim();
    const fromEmail = user?.email?.split('@')[0]?.trim();
    const raw = fromProfile || fromAuth || fromEmail;
    if (raw) return raw;
    return language === 'bn' ? 'বন্ধু' : 'there';
  }, [userProfile?.displayName, user?.displayName, user?.email, language]);

  const personaMainLabel =
    language === 'bn'
      ? financialPersona.labelBn
      : PERSONA_TAG_EN[financialPersona.id] ?? financialPersona.label;

  return (
    <div
      className={cn(
        'w-full min-w-0 space-y-6 sm:space-y-8',
        isHistoryMode && 'dashboard-history-root dashboard-history-pulse-wrap rounded-3xl'
      )}
    >
      {/* Month & year — drives all summary metrics and charts below */}
      <section
        className={cardShell(
          'p-4 sm:p-5'
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('monthYearPicker')}
            </h2>
            <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
              {t('monthYearPickerHint')}
            </p>
            {isHistoryMode && (
              <span className="mt-2 inline-flex w-fit items-center rounded-full border border-violet-400/45 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700 shadow-[0_0_20px_rgba(139,92,246,0.25)] dark:border-violet-400/35 dark:bg-violet-500/15 dark:text-violet-200">
                {t('pastDataBadge')}
              </span>
            )}
          </div>
          <MonthPicker variant="prominent" className="w-full sm:max-w-2xl lg:shrink-0" />
        </div>
      </section>

      <div className="flex w-full min-w-0 flex-col gap-4">
        {user && (
          <div className="flex w-full min-w-0 justify-center px-1 sm:justify-start">
            <div className="flex w-full min-w-0 max-w-full flex-row flex-wrap items-center justify-center gap-3 sm:justify-start sm:gap-4">
              <motion.h1
                className="max-w-full min-w-0 text-center text-3xl font-black leading-tight tracking-tight sm:w-auto sm:text-left sm:text-4xl"
                initial={{ opacity: 0, x: -48 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28, mass: 0.85 }}
              >
                <span
                  className="inline-block max-w-full break-words bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent dark:from-violet-400 dark:via-fuchsia-400 dark:to-cyan-300"
                  style={{
                    filter: 'drop-shadow(0 0 24px rgba(168, 85, 247, 0.45)) drop-shadow(0 0 48px rgba(6, 182, 212, 0.25))',
                  }}
                >
                  {language === 'bn'
                    ? `স্বাগতম, ${dashboardDisplayName}!`
                    : `Welcome back, ${dashboardDisplayName}!`}
                </span>
              </motion.h1>

              <motion.div
                className="shrink-0"
                key={financialPersona.id}
                initial={{ opacity: 0, x: 48, scale: 0.92 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{
                  duration: 1.5,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.1,
                }}
              >
                <span
                  className={cn(
                    'relative inline-flex max-w-[min(92vw,14.5rem)] flex-col items-stretch overflow-hidden rounded-lg border',
                    'bg-gradient-to-br from-indigo-600/95 via-violet-600/90 to-fuchsia-600/95',
                    'border-violet-200/70 text-white',
                    'shadow-[0_0_26px_rgba(168,85,247,0.7),0_0_52px_rgba(217,70,239,0.32),inset_0_1px_0_rgba(255,255,255,0.32)]',
                    'ring-1 ring-white/25 ring-offset-2 ring-offset-slate-50 dark:border-violet-400/55 dark:ring-fuchsia-400/35 dark:ring-offset-slate-900',
                    'backdrop-blur-sm sm:max-w-[13.5rem]'
                  )}
                >
                  <span
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/15 via-transparent to-cyan-500/10"
                    aria-hidden
                  />
                  <motion.span
                    className="relative z-20 border-b border-white/20 bg-gradient-to-r from-indigo-700 via-fuchsia-500 to-violet-600 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_18px_rgba(99,102,241,0.45)] sm:py-1.5"
                    animate={{ filter: ['brightness(1)', 'brightness(1.12)', 'brightness(1)'] }}
                    transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <span
                      className="pointer-events-none absolute inset-0 overflow-hidden"
                      aria-hidden
                    >
                      <span className="persona-ribbon-gleam absolute -left-1/4 top-0 block h-full w-[55%] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-90 blur-[0.5px]" />
                    </span>
                    <span className="relative block text-center text-[7px] font-black uppercase leading-tight tracking-[0.14em] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] sm:text-[8px] sm:tracking-[0.18em]">
                      {language === 'bn' ? 'আর্থিক ব্যক্তিত্ব' : 'Financial Personality'}
                    </span>
                  </motion.span>
                  <span className="relative z-10 px-2.5 py-2 text-center sm:px-3 sm:py-2.5">
                    <span className="block min-w-0 break-words text-sm font-black leading-tight tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] sm:text-base">
                      {personaMainLabel}
                    </span>
                  </span>
                </span>
              </motion.div>
            </div>
          </div>
        )}

        <LiveClockDate prominent className="shadow-md" />
        <p className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-left">
          {t('dashboard')} · {monthLabel}
        </p>
      </div>
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
      <div className="grid grid-cols-1 min-w-0 gap-3 min-[480px]:grid-cols-2 min-[480px]:gap-4 lg:grid-cols-4 lg:gap-5">
        {stats.map((stat, i) => {
          const v = stat.kpiVariant;
          const moneySegments = formatCurrencyKpiSegments(stat.value, language);

          return (
            <motion.button
              key={stat.id}
              type="button"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, type: 'spring', stiffness: 260, damping: 26 }}
              whileTap={{ scale: 0.95 }}
              whileHover={{
                y: -10,
                transition: { type: 'spring', stiffness: 380, damping: 22 },
              }}
              onClick={() => {
                if (stat.id === 'balance') setShowBalanceBreakdown(true);
                else if (stat.id === 'income') setModalType('income');
                else if (stat.id === 'expense') setModalType('expense');
                else if (stat.id === 'netDebt' && onTabChange) onTabChange('debts');
              }}
              className={cn(
                'kpi-stat-neo text-left',
                kpiNeoClass[v],
                isHistoryMode && 'kpi-stat-neo--history',
                'w-full min-w-0 cursor-pointer touch-manipulation select-none p-3.5 sm:p-5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-400/80 focus-visible:ring-offset-slate-100 dark:focus-visible:ring-fuchsia-400/55 dark:focus-visible:ring-offset-slate-900'
              )}
            >
              <div className="flex items-start gap-2.5 min-[400px]:gap-3 sm:gap-4">
                <div className={cn('kpi-stat-neo-icon p-2.5 sm:p-3.5')}>
                  <stat.icon
                    className={cn('h-[1.35rem] w-[1.35rem] min-[400px]:h-6 min-[400px]:w-6 sm:h-7 sm:w-7', kpiIconClass[v])}
                    strokeWidth={2.25}
                  />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden pt-0.5">
                  <p
                    className={cn(
                      'text-[9px] leading-tight min-[400px]:text-[10px] sm:text-[11px]',
                      kpiLabelClass
                    )}
                  >
                    {stat.label}
                  </p>
                  {/* Single-line amounts: Bengali digits must not break mid-number; scroll on narrow screens */}
                  <div
                    className="mt-1.5 min-w-0 max-w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
                    style={{ scrollbarGutter: 'stable' }}
                  >
                    <div className="inline-flex min-w-min max-w-none flex-nowrap items-baseline gap-x-0.5 sm:gap-x-1">
                      {moneySegments.map((seg, si) =>
                        seg.emphasis === 'currency' ? (
                          <span key={si} className={kpiCurrencyClass}>
                            {seg.text}
                          </span>
                        ) : (
                          <span key={si} className={kpiNumberClass}>
                            {seg.text}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {user?.uid && (
        <GrowthDashboardSections
          transactions={transactions}
          language={language === 'bn' ? 'bn' : 'en'}
          cardShell={cardShell}
        />
      )}

      <p className="text-center text-xs text-slate-500 dark:text-slate-400 sm:text-left">
        {t('debtTotalsCumulative')}
      </p>

      {/* ── No-data empty state ── */}
      {monthTransactions.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('flex flex-col items-center gap-4 p-10 text-center')}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
            <CalendarX className="h-8 w-8 text-slate-400 dark:text-slate-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200">
              No data for {monthLabel}
            </h3>
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
              No transactions were recorded for this period.
            </p>
          </div>
        </motion.div>
      ) : (
        <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('min-w-0 p-4 sm:p-8 lg:col-span-2')}
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-white sm:text-xl mb-2 sm:mb-6">
            Income &amp; Expense Trends
          </h3>
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400 sm:mb-6 sm:text-sm">
            {t('trendChartSubtitle')} · {monthLabel}
          </p>
          <div className="h-[min(20rem,70vw)] min-h-[220px] w-full min-w-0 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <defs>
                  <linearGradient id={`lineInc-${chartUid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                  <linearGradient id={`lineExp-${chartUid}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#dc2626" />
                    <stop offset="100%" stopColor="#fb7185" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  label={{ value: 'Day of month', position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 11 }}
                />
                <YAxis 
                  tick={{ fill: '#94a3b8' }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `৳${value}`}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value, language), '']}
                  contentStyle={chartTooltipStyle()} 
                  itemStyle={{ fontWeight: 'bold' }}
                />
                <Legend verticalAlign="top" height={36}/>
                <Line 
                  type="monotone" 
                  dataKey="income" 
                  stroke={`url(#lineInc-${chartUid})`}
                  strokeWidth={4} 
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                  name={t('income')} 
                />
                <Line 
                  type="monotone" 
                  dataKey="expense" 
                  stroke={`url(#lineExp-${chartUid})`}
                  strokeWidth={4} 
                  dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7, strokeWidth: 2, stroke: '#fff' }}
                  name={t('expense')} 
                />
                <Brush 
                  dataKey="name" 
                  height={30} 
                  stroke="#3b82f6" 
                  fill={document.documentElement.classList.contains('dark') ? '#1e293b' : '#f8fafc'}
                  travellerWidth={10}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('min-w-0 p-4 sm:p-8')}
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-white sm:text-xl mb-4 sm:mb-6">
            {t('monthlyExpense')} {t('category')}
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{monthLabel}</p>
          <div className="h-[min(16rem,55vw)] min-h-[200px] w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <linearGradient key={i} id={`pie-cat-${chartUid}-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.58} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={categoryData.length ? categoryData : [{ name: '—', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="70%"
                  paddingAngle={categoryData.length ? 5 : 0}
                  dataKey="value"
                  activeShape={renderPieActiveShape}
                >
                  {(categoryData.length ? categoryData : [{ name: '—', value: 1 }]).map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        categoryData.length
                          ? `url(#pie-cat-${chartUid}-${index % COLORS.length})`
                          : '#e2e8f0'
                      }
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={chartTooltipStyle()} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('min-w-0 p-4 sm:p-8')}
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-white sm:text-xl mb-4 sm:mb-6">{t('expenseByMember')}</h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{monthLabel}</p>
          <div className="h-[min(16rem,55vw)] min-h-[200px] w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <linearGradient key={`mex-${i}`} id={`pie-memexp-${chartUid}-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={memberExpenseData.length ? memberExpenseData : [{ name: '—', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="70%"
                  paddingAngle={memberExpenseData.length ? 5 : 0}
                  dataKey="value"
                  activeShape={renderPieActiveShape}
                >
                  {(memberExpenseData.length ? memberExpenseData : [{ name: '—', value: 1 }]).map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        memberExpenseData.length
                          ? `url(#pie-memexp-${chartUid}-${index % COLORS.length})`
                          : '#e2e8f0'
                      }
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={chartTooltipStyle()} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('min-w-0 p-4 sm:p-8')}
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-white sm:text-xl mb-4 sm:mb-6">
            {t('income')} vs {t('expense')}
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{monthLabel}</p>
          <div className="h-[min(16rem,55vw)] min-h-[200px] w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: 'Total', income: totalIncome, expense: totalExpense }]}>
                <defs>
                  <linearGradient id={`barInc-${chartUid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#059669" />
                    <stop offset="100%" stopColor="#6ee7b7" />
                  </linearGradient>
                  <linearGradient id={`barExp-${chartUid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#b91c1c" />
                    <stop offset="100%" stopColor="#fca5a5" />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fill: '#94a3b8' }} />
                <Tooltip
                  cursor={false}
                  wrapperStyle={{ outline: 'none' }}
                  contentStyle={chartTooltipStyle()}
                />
                <Legend />
                <Bar
                  dataKey="income"
                  fill={`url(#barInc-${chartUid})`}
                  radius={[14, 14, 14, 14]}
                  maxBarSize={72}
                  name={t('income')}
                  activeBar={{
                    fill: `url(#barInc-${chartUid})`,
                    radius: 16,
                  }}
                />
                <Bar
                  dataKey="expense"
                  fill={`url(#barExp-${chartUid})`}
                  radius={[14, 14, 14, 14]}
                  maxBarSize={72}
                  name={t('expense')}
                  activeBar={{
                    fill: `url(#barExp-${chartUid})`,
                    radius: 16,
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cardShell('min-w-0 p-4 sm:p-8')}
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-white sm:text-xl mb-4 sm:mb-6">{t('incomeByMember')}</h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{monthLabel}</p>
          <div className="h-[min(16rem,55vw)] min-h-[200px] w-full min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((c, i) => (
                    <linearGradient key={`minc-${i}`} id={`pie-meminc-${chartUid}-${i}`} x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={1} />
                      <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={memberIncomeData.length ? memberIncomeData : [{ name: '—', value: 1 }]}
                  cx="50%"
                  cy="50%"
                  innerRadius="45%"
                  outerRadius="70%"
                  paddingAngle={memberIncomeData.length ? 5 : 0}
                  dataKey="value"
                  activeShape={renderPieActiveShape}
                >
                  {(memberIncomeData.length ? memberIncomeData : [{ name: '—', value: 1 }]).map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        memberIncomeData.length
                          ? `url(#pie-meminc-${chartUid}-${index % COLORS.length})`
                          : '#e2e8f0'
                      }
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={chartTooltipStyle()} 
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className={cardShell('p-4 sm:p-8')}>
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white sm:text-xl">
              {t('dashboard')} — {t('transactions')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{monthLabel}</p>
          </div>
          {onTabChange && (
            <button
              onClick={() => onTabChange('transactions')}
              className="flex items-center justify-center gap-2 self-start rounded-xl bg-blue-50 px-4 py-2 text-sm font-bold text-blue-600 transition-all hover:gap-3 dark:bg-blue-950/40 dark:text-blue-400 sm:self-auto"
            >
              View All <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="hidden min-w-0 overflow-x-auto md:block">
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700">
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400">{t('date')}</th>
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400">{t('category')}</th>
                <th className="pb-4 font-semibold text-slate-600 dark:text-slate-400">{t('familyMember')}</th>
                <th className="pb-4 text-right font-semibold text-slate-600 dark:text-slate-400">{t('amount')}</th>
                <th className="pb-4 text-right font-semibold text-slate-600 dark:text-slate-400">{t('action')}</th>
              </tr>
            </thead>
            <tbody>
              {recentMonthTransactions.slice(0, 5).map((tx) => (
                <tr key={tx.id} className="group border-b border-slate-50 last:border-0 dark:border-slate-700/50">
                  <td className="py-4 text-slate-600 dark:text-slate-400">
                    {tx.date ? (
                      typeof tx.date.toDate === 'function'
                        ? tx.date.toDate().toLocaleDateString()
                        : tx.date instanceof Date
                          ? tx.date.toLocaleDateString()
                          : 'N/A'
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td className="py-4 font-medium text-slate-800 dark:text-white">{tx.category}</td>
                  <td className="py-4 text-slate-500 dark:text-slate-400">{tx.familyMember}</td>
                  <td
                    className={cn(
                      'py-4 text-right font-bold',
                      tx.type === 'expense'
                        ? 'text-red-600 dark:text-red-400'
                        : tx.type === 'debt_repayment'
                          ? 'text-teal-600 dark:text-teal-400'
                          : 'text-green-600 dark:text-green-400'
                    )}
                  >
                    {tx.type === 'expense' ? '-' : '+'}
                    {formatCurrency(txAmount(tx), language)}
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingTransaction(tx)}
                        className="rounded-lg p-2 text-slate-400 transition-all hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(tx.id)}
                        className="rounded-lg p-2 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentMonthTransactions.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No transactions in {monthLabel} yet.
            </p>
          )}
        </div>

        <div className="space-y-3 md:hidden">
          {recentMonthTransactions.slice(0, 5).map((tx) => (
            <div
              key={tx.id}
              className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-900/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-white">{tx.category}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tx.familyMember} ·{' '}
                    {tx.date
                      ? typeof tx.date.toDate === 'function'
                        ? tx.date.toDate().toLocaleDateString()
                        : tx.date instanceof Date
                          ? tx.date.toLocaleDateString()
                          : ''
                      : ''}
                  </p>
                </div>
                <p
                  className={cn(
                    'shrink-0 font-bold',
                    tx.type === 'expense'
                      ? 'text-red-600 dark:text-red-400'
                      : tx.type === 'debt_repayment'
                        ? 'text-teal-600 dark:text-teal-400'
                        : 'text-green-600 dark:text-green-400'
                  )}
                >
                  {tx.type === 'expense' ? '-' : '+'}
                  {formatCurrency(txAmount(tx), language)}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-1">
                <button
                  onClick={() => setEditingTransaction(tx)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteConfirmId(tx.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {recentMonthTransactions.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No transactions in {monthLabel} yet.
            </p>
          )}
        </div>
      </div>
        </>
      )}

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
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Earned Income (+)</span>
                    <span className="text-green-600 dark:text-green-400 font-bold">{formatCurrency(totalIncome, language)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-teal-50 dark:bg-teal-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Debt In-flows (+)</span>
                    <span className="text-teal-600 dark:text-teal-400 font-bold">{formatCurrency(debtInflows, language)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Spent Expense (−)</span>
                    <span className="text-red-600 dark:text-red-400 font-bold">{formatCurrency(totalExpense, language)}</span>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">Debt Out-flows (−)</span>
                    <span className="text-orange-600 dark:text-orange-400 font-bold">{formatCurrency(debtOutflows, language)}</span>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-slate-800 dark:text-white">{t('totalBalance')}</span>
                    <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{formatCurrency(balance, language)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 italic">
                    Balance = (Earned Income + Debt In-flows) − (Expenses + Debt Out-flows)
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
