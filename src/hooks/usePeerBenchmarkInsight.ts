import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { useTransactions } from './useTransactions';
import type { PeerBenchmarkPayload } from '../lib/peerBenchmarks';

function txAmt(tx: { amount?: unknown }): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

export type PeerSpendTone = 'save' | 'warn' | 'alert';

export function usePeerBenchmarkInsight() {
  const { user, userProfile } = useAuth();
  const { transactions } = useTransactions();
  const uid = user?.uid;
  const [peerBench, setPeerBench] = useState<PeerBenchmarkPayload | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'peer_benchmarks', 'v1'),
      (snap) => {
        if (!snap.exists()) {
          setPeerBench(null);
          return;
        }
        setPeerBench(snap.data() as PeerBenchmarkPayload);
      },
      () => setPeerBench(null),
    );
    return () => unsub();
  }, []);

  const profession = userProfile?.profession || 'other';

  const myAllTimeSpend = useMemo(() => {
    if (!uid) return 0;
    return transactions
      .filter((t) => t.type === 'expense' && !t.debtId && t.userId === uid)
      .reduce((s, t) => s + txAmt(t), 0);
  }, [transactions, uid]);

  const spendBench = peerBench?.spendByProfession?.[profession];
  const avgPeerSpend = spendBench?.avgTotalSpend;
  const peerSpendN = spendBench?.n ?? 0;

  const peerSpendTone = useMemo<PeerSpendTone | null>(() => {
    if (avgPeerSpend == null || !(avgPeerSpend > 0) || peerSpendN < 1) return null;
    if (myAllTimeSpend < avgPeerSpend) return 'save';
    if (myAllTimeSpend <= avgPeerSpend * 1.15) return 'warn';
    return 'alert';
  }, [avgPeerSpend, myAllTimeSpend, peerSpendN]);

  const peerForProf = peerBench?.byProfession?.[profession];

  return {
    peerBench,
    peerSpendTone,
    avgPeerSpend,
    myAllTimeSpend,
    peerSpendN,
    profession,
    peerForProf: peerForProf ?? null,
  };
}

export function peerSidebarSubtitle(
  language: 'en' | 'bn',
  tone: PeerSpendTone | null,
  avgPeerSpend: number | null,
  peerSpendN: number,
): string {
  if (tone != null && avgPeerSpend != null && peerSpendN >= 1) {
    if (language === 'bn') {
      if (tone === 'save') return 'পিয়ার গড়ের চেয়ে কম খরচ করছেন';
      if (tone === 'warn') return 'পিয়ার গড়ের কাছাকাছি খরচ';
      return 'পিয়ার গড়ের চেয়ে বেশি খরচ';
    }
    if (tone === 'save') return 'You spend below peer average';
    if (tone === 'warn') return 'Near peer average spending';
    return 'Above peer average spending';
  }
  return language === 'bn'
    ? 'বেনামী বেঞ্চমার্ক ও ক্যাটাগরি মিক্স'
    : 'Anonymous benchmarks & category mix';
}

