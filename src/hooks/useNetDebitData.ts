import { useMemo } from 'react';
import { useTransactions } from './useTransactions';
import type { Debt } from '../contexts/TransactionsContext';

export type DebtRecoveryStatus = 'recoverable' | 'non_recoverable';

/** Normalize Firestore / legacy rows (missing field → recoverable). */
export function getDebtRecoveryStatus(debt: Pick<Debt, 'recoveryStatus'>): DebtRecoveryStatus {
  return debt.recoveryStatus === 'non_recoverable' ? 'non_recoverable' : 'recoverable';
}

function debtAmountBdt(d: Pick<Debt, 'amount'>): number {
  const n = Number(d.amount);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export interface NetDebitZakatSums {
  /** Sum of unpaid receivables (type `lent`) marked recoverable — Zakat-eligible pāwānā. */
  recoverableAssets: number;
  /** Sum of unpaid payables (type `borrowed`) — dena reducing zakatable base. */
  totalPayables: number;
  /** recoverableAssets − totalPayables (informational). */
  netDebitSum: number;
  /** Raw unpaid debts for debugging / UI counts. */
  unpaidDebtCount: number;
}

/**
 * Live Net Debit (debts) aggregates for Zakat and dashboards.
 */
export function useNetDebitData(): NetDebitZakatSums & { debts: Debt[]; debtsLoading: boolean } {
  const { debts = [], loading: debtsLoading } = useTransactions();

  const sums = useMemo((): NetDebitZakatSums => {
    const unpaid = debts.filter((d) => d.status === 'unpaid');

    const recoverableAssets = unpaid
      .filter((d) => d.type === 'lent' && getDebtRecoveryStatus(d) === 'recoverable')
      .reduce((acc, d) => acc + debtAmountBdt(d), 0);

    const totalPayables = unpaid
      .filter((d) => d.type === 'borrowed')
      .reduce((acc, d) => acc + debtAmountBdt(d), 0);

    return {
      recoverableAssets,
      totalPayables,
      netDebitSum: recoverableAssets - totalPayables,
      unpaidDebtCount: unpaid.length,
    };
  }, [debts]);

  return { ...sums, debts, debtsLoading };
}
