import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight } from 'lucide-react';
import type { Transaction } from '../hooks/useTransactions';
import { formatCurrency, cn } from '../lib/utils';
import { getTransactionDate } from '../lib/monthUtils';

export type DrillDownVariant = 'income' | 'expense';

function txAmount(tx: { amount: unknown }): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

export interface TransactionDrillDownModalProps {
  open: boolean;
  onClose: () => void;
  variant: DrillDownVariant;
  monthLabel: string;
  /** Dashboard month slice — same scope as KPI totals (caller filters by selected month). */
  monthTransactions: Transaction[];
  language: 'en' | 'bn';
  t: (key: string) => string;
}

export default function TransactionDrillDownModal({
  open,
  onClose,
  variant,
  monthLabel,
  monthTransactions,
  language,
  t,
}: TransactionDrillDownModalProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) setSelectedCategory(null);
  }, [open]);

  React.useEffect(() => {
    if (open) setSelectedCategory(null);
  }, [open, variant]);

  const scoped = React.useMemo(() => {
    return monthTransactions.filter((tx) =>
      variant === 'income'
        ? tx.type === 'income' && !tx.debtId
        : tx.type === 'expense' && !tx.debtId
    );
  }, [monthTransactions, variant]);

  const categorySummaries = React.useMemo(() => {
    const map = new Map<string, number>();
    const uncategorized = t('uncategorized');
    for (const tx of scoped) {
      const raw = tx.category?.trim();
      const name = raw && raw.length > 0 ? raw : uncategorized;
      map.set(name, (map.get(name) ?? 0) + txAmount(tx));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped, t]);

  const detailTransactions = React.useMemo(() => {
    if (!selectedCategory) return [];
    return scoped
      .filter((tx) => {
        const raw = tx.category?.trim();
        const name = raw && raw.length > 0 ? raw : t('uncategorized');
        return name === selectedCategory;
      })
      .sort((a, b) => {
        const ta = getTransactionDate(a)?.getTime() ?? 0;
        const tb = getTransactionDate(b)?.getTime() ?? 0;
        return tb - ta;
      });
  }, [scoped, selectedCategory, t]);

  const isExpense = variant === 'expense';
  const accentGlow = isExpense
    ? 'shadow-[0_0_28px_rgba(244,63,94,0.35),0_12px_32px_rgba(0,0,0,0.2)] hover:shadow-[0_0_36px_rgba(251,113,133,0.55),0_14px_40px_rgba(0,0,0,0.22)]'
    : 'shadow-[0_0_28px_rgba(16,185,129,0.32),0_12px_32px_rgba(0,0,0,0.18)] hover:shadow-[0_0_38px_rgba(52,211,153,0.5),0_14px_40px_rgba(0,0,0,0.2)]';

  const amountClass = isExpense
    ? 'text-rose-600 dark:text-rose-300'
    : 'text-emerald-600 dark:text-emerald-300';

  const categoryCardShell = cn(
    'group relative w-full overflow-hidden rounded-2xl border text-left transition-all duration-300',
    'backdrop-blur-md bg-white/70 dark:bg-slate-800/65',
    'border-white/60 dark:border-slate-600/50',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_24px_rgba(15,23,42,0.08)]',
    'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_28px_rgba(0,0,0,0.45)]',
    accentGlow,
    'active:scale-[0.98] touch-manipulation',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-100 dark:focus-visible:ring-offset-slate-900'
  );

  const formatTxDate = (tx: Transaction) => {
    const d = getTransactionDate(tx);
    if (!d) return '—';
    return d.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const headline =
    variant === 'expense' ? t('monthlyExpense') : t('monthlyIncome');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="drilldown-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drilldown-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex cursor-default items-center justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
          'flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-[1.75rem] border',
          'border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/95',
          'dark:border-slate-600/60 dark:from-slate-900 dark:via-slate-900 dark:to-slate-950',
          'shadow-[0_24px_80px_rgba(15,23,42,0.25),0_0_0_1px_rgba(255,255,255,0.08)_inset]',
          'dark:shadow-[0_28px_90px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.05)]'
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-700/80 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              {t('transactionDrillDownTitle')}
            </p>
            <h2
              id="drilldown-modal-title"
              className="mt-1 truncate text-lg font-black tracking-tight text-slate-900 dark:text-white sm:text-xl"
            >
              {headline}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{monthLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={t('cancel')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-2 sm:px-5 sm:pb-5">
          <AnimatePresence mode="wait" initial={false}>
            {!selectedCategory ? (
              <motion.div
                key="summary"
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 14 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <p className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t('drillDownByCategory')}
                </p>
                {categorySummaries.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                    {t('drillDownEmpty')}
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {categorySummaries.map(([name, total], idx) => (
                      <li key={name}>
                        <motion.button
                          type="button"
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04, type: 'spring', stiffness: 380, damping: 28 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.985 }}
                          onClick={() => setSelectedCategory(name)}
                          className={categoryCardShell}
                        >
                          <span
                            className={cn(
                              'pointer-events-none absolute inset-0 opacity-90',
                              isExpense
                                ? 'bg-gradient-to-br from-rose-500/10 via-transparent to-fuchsia-500/10'
                                : 'bg-gradient-to-br from-emerald-500/12 via-transparent to-cyan-500/10'
                            )}
                            aria-hidden
                          />
                          <span className="relative flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                            <span className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100 sm:text-base">
                                {name}
                              </span>
                              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('category')}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className={cn('text-sm font-black tabular-nums sm:text-base', amountClass)}>
                                {formatCurrency(total, language)}
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 dark:text-slate-500" />
                            </span>
                          </span>
                        </motion.button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-3"
              >
                <div
                  className={cn(
                    'sticky top-0 z-20 -mx-1 flex flex-col gap-2 border-b border-slate-200/70 bg-gradient-to-b from-white/95 via-white/90 to-transparent px-1 pb-3 pt-1',
                    'dark:border-slate-700/70 dark:from-slate-900/95 dark:via-slate-900/88 dark:to-transparent'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={cn(
                      'self-start rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors',
                      'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
                      'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/80'
                    )}
                  >
                    ← {t('drillDownBack')}
                  </button>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t('category')}
                    </p>
                    <p className="truncate text-base font-black text-slate-900 dark:text-white sm:text-lg">
                      {selectedCategory}
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    'overflow-hidden rounded-2xl border',
                    'border-slate-200/90 bg-white/80 shadow-inner dark:border-slate-600/60 dark:bg-slate-800/40'
                  )}
                >
                  <div
                    className={cn(
                      'grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 border-b px-3 py-2 text-[10px] font-bold uppercase tracking-wide',
                      'border-slate-200 bg-slate-50/95 dark:border-slate-600 dark:bg-slate-800/80',
                      isExpense ? 'text-rose-700/90 dark:text-rose-300/90' : 'text-emerald-800/90 dark:text-emerald-300/90'
                    )}
                  >
                    <span>{t('date')}</span>
                    <span className="text-right">{t('amount')}</span>
                  </div>

                  <ul className="divide-y divide-slate-100 dark:divide-slate-700/80">
                    {detailTransactions.map((tx, rowIdx) => (
                      <li
                        key={tx.id}
                        className={cn(
                          'px-3 py-3 sm:px-4',
                          rowIdx % 2 === 0 ? 'bg-white/60 dark:bg-slate-900/25' : 'bg-slate-50/50 dark:bg-slate-800/20'
                        )}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 sm:text-sm">
                            {formatTxDate(tx)}
                          </span>
                          <span className={cn('font-black tabular-nums sm:text-base', amountClass)}>
                            {isExpense ? '−' : '+'}
                            {formatCurrency(txAmount(tx), language)}
                          </span>
                        </div>
                        <dl className="mt-2 space-y-1.5 text-[11px] leading-snug sm:text-xs">
                          <div>
                            <dt className="font-bold text-slate-500 dark:text-slate-400">{t('noteDescriptionLabel')}</dt>
                            <dd className="mt-0.5 text-slate-800 dark:text-slate-100">
                              {tx.note?.trim() ? tx.note : '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-bold text-slate-500 dark:text-slate-400">
                              {isExpense ? t('expenseForWhom') : t('familyMember')}
                            </dt>
                            <dd className="mt-0.5 text-slate-800 dark:text-slate-100">
                              {tx.familyMember?.trim() ? tx.familyMember : '—'}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
