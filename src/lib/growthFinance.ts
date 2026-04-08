import type { Transaction } from '../hooks/useTransactions';

/** 1 ভরি ≈ 11.664 g (common jewelers’ conversion; adjustable via user price field). */
export const GRAMS_PER_BHORI = 11.664;

export interface WishlistItem {
  id: string;
  name: string;
  category: string;
  price: number;
  imageUrl?: string;
  createdAt?: string;
}

export interface WealthVault {
  goldBhori: number;
  goldGram: number;
  goldPricePerGramBdt: number;
  savingsFdBdt: number;
  realEstateBdt: number;
  electronicsBdt: number;
}

export interface DonationEntry {
  id: string;
  amount: number;
  note?: string;
  createdAt?: string;
}

export function txAmt(tx: { amount?: unknown }): number {
  const n = Number(tx.amount);
  return Number.isFinite(n) ? n : 0;
}

/** Same cash formula as dashboard month balance, over all transactions. */
export function computeAllTimeCashBalance(transactions: Transaction[]): number {
  return transactions.reduce((acc, tx) => {
    const amt = txAmt(tx);
    if (tx.type === 'income' || tx.type === 'debt_repayment') return acc + amt;
    if (tx.type === 'expense') return acc - amt;
    return acc;
  }, 0);
}

export function goldMetalValueBdt(vault: WealthVault): number {
  const g = Math.max(0, Number(vault.goldBhori) || 0) * GRAMS_PER_BHORI + Math.max(0, Number(vault.goldGram) || 0);
  const p = Math.max(0, Number(vault.goldPricePerGramBdt) || 0);
  return g * p;
}

export function vaultTotalBdt(vault: WealthVault): number {
  return (
    goldMetalValueBdt(vault) +
    Math.max(0, Number(vault.savingsFdBdt) || 0) +
    Math.max(0, Number(vault.realEstateBdt) || 0) +
    Math.max(0, Number(vault.electronicsBdt) || 0)
  );
}

/**
 * Rough Zakat estimate (2.5%) on cash + gold + FD/savings + real estate.
 * Electronics excluded (common conservative simplification; not a fatwa).
 */
export function estimateZakatBdt(cashBdt: number, vault: WealthVault): number {
  const zakatable =
    Math.max(0, cashBdt) +
    goldMetalValueBdt(vault) +
    Math.max(0, Number(vault.savingsFdBdt) || 0) +
    Math.max(0, Number(vault.realEstateBdt) || 0);
  return zakatable * 0.025;
}

export function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const defaultWealthVault = (): WealthVault => ({
  goldBhori: 0,
  goldGram: 0,
  goldPricePerGramBdt: 18000,
  savingsFdBdt: 0,
  realEstateBdt: 0,
  electronicsBdt: 0,
});

export function parseWealthVault(raw: unknown): WealthVault {
  const d = defaultWealthVault();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  return {
    goldBhori: Math.max(0, Number(o.goldBhori) || 0),
    goldGram: Math.max(0, Number(o.goldGram) || 0),
    goldPricePerGramBdt: Math.max(0, Number(o.goldPricePerGramBdt) || d.goldPricePerGramBdt),
    savingsFdBdt: Math.max(0, Number(o.savingsFdBdt) || 0),
    realEstateBdt: Math.max(0, Number(o.realEstateBdt) || 0),
    electronicsBdt: Math.max(0, Number(o.electronicsBdt) || 0),
  };
}
