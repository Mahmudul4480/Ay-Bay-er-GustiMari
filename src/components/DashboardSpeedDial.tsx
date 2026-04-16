import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Heart,
  Calculator,
} from 'lucide-react';
import { cn } from '../lib/utils';

export type SpeedDialAction = 'income' | 'expense' | 'debt' | 'wishlist' | 'zakat';

export interface DashboardSpeedDialProps {
  language: 'en' | 'bn';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (action: SpeedDialAction) => void;
}

const dialButtonBase =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-white shadow-lg backdrop-blur-md transition-transform active:scale-95 sm:h-14 sm:w-14';

const dialStyles: Record<
  SpeedDialAction,
  { className: string; labelBn: string; labelEn: string }
> = {
  income: {
    labelBn: 'আয়',
    labelEn: 'Income',
    className: cn(
      dialButtonBase,
      'border-emerald-300/50 bg-gradient-to-b from-emerald-400/90 to-emerald-700/95',
      'shadow-[inset_0_2px_4px_rgba(255,255,255,0.35),inset_0_-3px_8px_rgba(0,0,0,0.15),0_0_22px_rgba(52,211,153,0.55),0_8px_20px_rgba(5,150,105,0.35)]',
    ),
  },
  expense: {
    labelBn: 'ব্যয়',
    labelEn: 'Expense',
    className: cn(
      dialButtonBase,
      'border-rose-300/50 bg-gradient-to-b from-rose-400/90 to-red-700/95',
      'shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),inset_0_-3px_8px_rgba(0,0,0,0.18),0_0_22px_rgba(251,113,133,0.55),0_8px_20px_rgba(220,38,38,0.32)]',
    ),
  },
  debt: {
    labelBn: 'দেনা-পাওনা',
    labelEn: 'Net Debt',
    className: cn(
      dialButtonBase,
      'border-amber-300/50 bg-gradient-to-b from-amber-400/95 to-orange-700/95',
      'shadow-[inset_0_2px_4px_rgba(255,255,255,0.35),inset_0_-3px_8px_rgba(0,0,0,0.15),0_0_22px_rgba(251,191,36,0.55),0_8px_20px_rgba(234,88,12,0.3)]',
    ),
  },
  wishlist: {
    labelBn: 'উইশলিস্ট',
    labelEn: 'Wishlist',
    className: cn(
      dialButtonBase,
      'border-fuchsia-300/45 bg-gradient-to-b from-fuchsia-500/90 to-purple-800/95',
      'shadow-[inset_0_2px_4px_rgba(255,255,255,0.28),inset_0_-3px_8px_rgba(0,0,0,0.2),0_0_24px_rgba(217,70,239,0.5),0_8px_22px_rgba(147,51,234,0.35)]',
    ),
  },
  zakat: {
    labelBn: 'যাকাত ক্যালকুলেটর',
    labelEn: 'Zakat',
    className: cn(
      dialButtonBase,
      'border-amber-200/60 bg-gradient-to-b from-amber-300/95 to-amber-800/95 text-amber-950',
      'shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),inset_0_-3px_8px_rgba(0,0,0,0.12),0_0_26px_rgba(251,191,36,0.65),0_8px_22px_rgba(180,83,9,0.35)]',
    ),
  },
};

const ACTIONS: SpeedDialAction[] = ['income', 'expense', 'debt', 'wishlist', 'zakat'];

const IconFor: React.FC<{ action: SpeedDialAction; className?: string }> = ({ action, className }) => {
  const c = cn('h-5 w-5 sm:h-6 sm:w-6', className);
  switch (action) {
    case 'income':
      return <TrendingUp className={c} strokeWidth={2.25} />;
    case 'expense':
      return <TrendingDown className={c} strokeWidth={2.25} />;
    case 'debt':
      return <CreditCard className={c} strokeWidth={2.25} />;
    case 'wishlist':
      return <Heart className={c} strokeWidth={2.25} />;
    case 'zakat':
      return <Calculator className={c} strokeWidth={2.25} />;
    default:
      return null;
  }
};

/**
 * Multi-action speed dial for dashboard quick entry (income, expense, debt, wishlist, zakat).
 */
const DashboardSpeedDial: React.FC<DashboardSpeedDialProps> = ({ language, open, onOpenChange, onPick }) => {
  const bn = language === 'bn';

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            key="speed-dial-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-label={bn ? 'মেনু বন্ধ করুন' : 'Close quick actions'}
            className="fixed inset-0 z-[42] bg-slate-900/25 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
        )}
      </AnimatePresence>

      <div
        className={cn(
          'fixed z-[45] flex max-h-[min(72vh,calc(100dvh-6rem))] flex-col items-end gap-1.5 overflow-visible',
          'bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]',
          'sm:bottom-8 sm:right-8',
        )}
      >
        <div className="flex min-h-0 flex-col items-end gap-1.5 overflow-y-auto overflow-x-visible pb-1 pr-0.5 [-webkit-overflow-scrolling:touch] sm:gap-2">
          <AnimatePresence>
            {open &&
              ACTIONS.map((action, i) => {
                const meta = dialStyles[action];
                const label = bn ? meta.labelBn : meta.labelEn;
                const stagger = 0.06;
                const arcX = -Math.sin((i + 1) * 0.38) * 14;
                return (
                  <motion.div
                    key={action}
                    initial={{ opacity: 0, scale: 0.4, y: 22, x: 10 }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0,
                      x: arcX,
                    }}
                    exit={{ opacity: 0, scale: 0.45, y: 18, x: 6 }}
                    transition={{
                      type: 'spring',
                      stiffness: 440,
                      damping: 24,
                      delay: i * stagger,
                    }}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={cn(
                        'pointer-events-none max-w-[10.5rem] rounded-xl border border-white/25 bg-white/80 px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-slate-700 shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/75 dark:text-slate-100 sm:max-w-[12rem] sm:text-xs',
                        action === 'zakat' && 'normal-case',
                      )}
                    >
                      {label}
                    </span>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      aria-label={label}
                      className={meta.className}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(action);
                      }}
                    >
                      <IconFor
                        action={action}
                        className={action === 'zakat' ? 'text-amber-950' : undefined}
                      />
                    </motion.button>
                  </motion.div>
                );
              })}
          </AnimatePresence>
        </div>

        <motion.button
          type="button"
          layout
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
          aria-expanded={open}
          aria-label={open ? (bn ? 'বন্ধ করুন' : 'Close menu') : bn ? 'দ্রুত কাজ' : 'Quick actions'}
          onClick={(e) => {
            e.stopPropagation();
            onOpenChange(!open);
          }}
          className={cn(
            'relative mt-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full sm:h-16 sm:w-16',
            'border border-blue-300/50 bg-gradient-to-b from-blue-500 to-blue-700 text-white',
            'shadow-[inset_0_3px_6px_rgba(255,255,255,0.35),inset_0_-4px_10px_rgba(0,0,0,0.2),0_6px_0_rgb(29,78,216),0_0_28px_rgba(59,130,246,0.55),0_14px_32px_rgba(37,99,235,0.35)]',
            'dark:shadow-[inset_0_2px_5px_rgba(255,255,255,0.12),inset_0_-5px_12px_rgba(0,0,0,0.45),0_6px_0_rgb(30,58,138),0_0_34px_rgba(59,130,246,0.45)]',
          )}
        >
          <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
            <Plus className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.5} />
          </motion.span>
        </motion.button>
      </div>
    </>
  );
};

export default DashboardSpeedDial;
