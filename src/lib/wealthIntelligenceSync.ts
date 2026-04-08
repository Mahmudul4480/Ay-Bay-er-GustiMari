import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { estimateZakatBdt, vaultTotalBdt, type WealthVault } from './growthFinance';

/**
 * Mirrors vault + app cash + zakat estimates under `users/{userId}/wealth/current` for admin intelligence.
 */
export async function syncUserWealthDocument(
  userId: string,
  vault: WealthVault,
  appCashBalanceBdt: number,
): Promise<void> {
  const vaultTotal = vaultTotalBdt(vault);
  const expectedZakatBdt = estimateZakatBdt(appCashBalanceBdt, vault);
  await setDoc(
    doc(db, 'users', userId, 'wealth', 'current'),
    {
      goldBhori: vault.goldBhori,
      goldGram: vault.goldGram,
      goldPricePerGramBdt: vault.goldPricePerGramBdt,
      savingsFdBdt: vault.savingsFdBdt,
      realEstateBdt: vault.realEstateBdt,
      electronicsBdt: vault.electronicsBdt,
      appCashBalanceBdt,
      vaultTotalBdt: vaultTotal,
      netWorthBdt: Math.max(0, appCashBalanceBdt) + vaultTotal,
      expectedZakatBdt,
      source: 'client',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
