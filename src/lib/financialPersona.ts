import type { Transaction } from '../hooks/useTransactions';

export type PersonaId = 'saver' | 'gourmet' | 'spender' | 'investor' | 'balanced';

export interface FinancialPersonaResult {
  id: PersonaId;
  label: string;
  labelBn: string;
}

function txAmt(tx: { amount?: unknown }): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Approximate category match on expense lines (all-time). */
function sumExpenseMatching(
  txs: Transaction[],
  keywords: string[],
): number {
  return txs
    .filter((t) => t.type === 'expense' && !t.debtId && t.category)
    .filter((t) => {
      const c = String(t.category).toLowerCase();
      return keywords.some((k) => c.includes(k.toLowerCase()));
    })
    .reduce((s, t) => s + txAmt(t), 0);
}

/**
 * Heuristic persona from lifetime cashflow + category mix (not financial advice).
 */
export function computeFinancialPersona(transactions: Transaction[]): FinancialPersonaResult {
  const income = transactions
    .filter((t) => t.type === 'income' && !t.debtId)
    .reduce((s, t) => s + txAmt(t), 0);
  const expenses = transactions.filter((t) => t.type === 'expense' && !t.debtId);
  const expenseTotal = expenses.reduce((s, t) => s + txAmt(t), 0);

  const food = sumExpenseMatching(transactions, [
    'food',
    'restaurant',
    'dining',
    'bazar',
    'kaca',
    'sukna',
    'grocery',
    'meal',
  ]);
  const shop = sumExpenseMatching(transactions, [
    'shop',
    'shopping',
    'electronics',
    'gadget',
    'fashion',
    'cloth',
    'mobile',
  ]);
  const invest = sumExpenseMatching(transactions, [
    'invest',
    'stock',
    'savings',
    'fd',
    'deposit',
    'bond',
    'fdr',
    'mutual',
  ]);

  const foodRatio = expenseTotal > 0 ? food / expenseTotal : 0;
  const shopRatio = expenseTotal > 0 ? shop / expenseTotal : 0;
  const investRatio = expenseTotal > 0 ? invest / expenseTotal : 0;
  const savingsRate = income > 0 ? (income - expenseTotal) / income : 0;
  const burnRatio = income > 0 ? expenseTotal / income : 0;

  if (income > 0 && savingsRate >= 0.22 && burnRatio <= 0.72) {
    return { id: 'saver', label: 'Saver', labelBn: 'সঞ্চয়কারী' };
  }
  if (foodRatio >= 0.26) {
    return { id: 'gourmet', label: 'Gourmet', labelBn: 'খাদ্যরসিক' };
  }
  if (investRatio >= 0.1) {
    return { id: 'investor', label: 'Investor', labelBn: 'বিনিয়োগকারী' };
  }
  if (shopRatio >= 0.2 || (income > 0 && burnRatio >= 0.9)) {
    return { id: 'spender', label: 'Spender', labelBn: 'খরচকারী' };
  }
  return { id: 'balanced', label: 'Balanced', labelBn: 'ভারসাম্যপূর্ণ' };
}
