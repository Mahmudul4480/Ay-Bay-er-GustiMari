import { doc, writeBatch, Timestamp, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { FixedFinance } from '../hooks/useTransactions';
import { dateForScheduledDayInMonth, parseMonthKey } from '../lib/monthUtils';

export const ROLLOVER_SOURCE = 'fixed_finance_rollover' as const;

export function rolloverTransactionId(userId: string, fixedFinanceId: string, monthKey: string): string {
  return `${userId}_ff_${fixedFinanceId}_${monthKey}`;
}

/**
 * Creates one transaction per fixed finance for the given month (idempotent doc IDs)
 * and sets `fixedFinanceRolloverMonth` on the user doc. Call only when
 * `userProfile.fixedFinanceRolloverMonth !== monthKey`.
 */
export async function applyMonthlyFixedFinanceRollover(
  userId: string,
  fixedFinances: FixedFinance[],
  monthKey: string
): Promise<void> {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw new Error(`Invalid monthKey: ${monthKey}`);

  const { year, monthIndex } = parsed;

  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists() && userSnap.data()?.fixedFinanceRolloverMonth === monthKey) {
    return;
  }

  if (fixedFinances.length === 0) {
    await updateDoc(userRef, { fixedFinanceRolloverMonth: monthKey });
    return;
  }

  const batch = writeBatch(db);

  for (const f of fixedFinances) {
    const txRef = doc(db, 'transactions', rolloverTransactionId(userId, f.id, monthKey));
    const scheduled = dateForScheduledDayInMonth(year, monthIndex, f.dayOfMonth ?? 1);
    const t = (f.type ?? 'expense') === 'income' ? 'income' : 'expense';

    batch.set(txRef, {
      userId,
      amount: Number(f.amount) || 0,
      type: t,
      category: f.category || 'General',
      date: Timestamp.fromDate(scheduled),
      note: f.description ? `Fixed: ${f.description}` : 'Fixed finance (monthly)',
      familyMember: 'Self',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      source: ROLLOVER_SOURCE,
      sourceFixedFinanceId: f.id,
      rolloverMonthKey: monthKey,
    });
  }

  batch.update(userRef, { fixedFinanceRolloverMonth: monthKey });

  await batch.commit();
}
