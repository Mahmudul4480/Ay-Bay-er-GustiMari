import type { Transaction } from '../hooks/useTransactions';

function txAmt(tx: { amount?: unknown }): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Average share of wallet (0–1) peers in the same profession allocate to each category (all-time). */
export type ProfessionCategoryBench = Record<string, { avgShare: number; n: number }>;

/** All-time expense totals averaged across users in the same profession (expense only, no debt-linked rows). */
export interface ProfessionSpendBench {
  /** Mean of each peer’s all-time total expense in this profession */
  avgTotalSpend: number;
  /** Peers with at least one qualifying expense */
  n: number;
}

export interface PeerBenchmarkPayload {
  byProfession: Record<string, ProfessionCategoryBench>;
  /** Present after admin sync with an up-to-date client build. */
  spendByProfession?: Record<string, ProfessionSpendBench>;
  updatedAt?: unknown;
}

export function buildPeerBenchmarkPayload(
  transactions: Transaction[],
  rawUsers: { id: string; profession?: string }[],
): PeerBenchmarkPayload {
  const profByUid = new Map(rawUsers.map((u) => [u.id, u.profession || 'other']));

  const userCat: Record<string, Record<string, number>> = {};
  const userTotal: Record<string, number> = {};

  transactions.forEach((t) => {
    if (t.type !== 'expense' || t.debtId || !t.userId || !t.category) return;
    const uid = t.userId;
    const cat = String(t.category);
    const amt = txAmt(t);
    if (!userCat[uid]) userCat[uid] = {};
    userCat[uid][cat] = (userCat[uid][cat] || 0) + amt;
    userTotal[uid] = (userTotal[uid] || 0) + amt;
  });

  const shareSums: Record<string, Record<string, number>> = {};
  const shareCounts: Record<string, Record<string, number>> = {};

  Object.entries(userCat).forEach(([uid, cats]) => {
    const prof = profByUid.get(uid) || 'other';
    const tot = userTotal[uid] || 0;
    if (tot <= 0) return;
    Object.entries(cats).forEach(([cat, val]) => {
      const share = val / tot;
      if (!shareSums[prof]) shareSums[prof] = {};
      if (!shareCounts[prof]) shareCounts[prof] = {};
      shareSums[prof][cat] = (shareSums[prof][cat] || 0) + share;
      shareCounts[prof][cat] = (shareCounts[prof][cat] || 0) + 1;
    });
  });

  const byProfession: Record<string, ProfessionCategoryBench> = {};
  Object.entries(shareSums).forEach(([prof, cats]) => {
    const bench: ProfessionCategoryBench = {};
    Object.entries(cats).forEach(([cat, sum]) => {
      const n = Math.max(1, shareCounts[prof]?.[cat] || 1);
      bench[cat] = { avgShare: sum / n, n };
    });
    byProfession[prof] = bench;
  });

  const spendByProfession: Record<string, ProfessionSpendBench> = {};
  const spendAgg = new Map<string, { sum: number; n: number }>();
  Object.entries(userTotal).forEach(([uid, tot]) => {
    if (!(tot > 0)) return;
    const prof = profByUid.get(uid) || 'other';
    const cur = spendAgg.get(prof) ?? { sum: 0, n: 0 };
    cur.sum += tot;
    cur.n += 1;
    spendAgg.set(prof, cur);
  });
  spendAgg.forEach((v, prof) => {
    spendByProfession[prof] = {
      avgTotalSpend: v.sum / v.n,
      n: v.n,
    };
  });

  return { byProfession, spendByProfession };
}
