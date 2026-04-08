/**
 * LQI (Lead Quality Index) — marketing lead scoring for admin analytics.
 * Pure functions; no Firestore imports.
 */

export type LeadTier = 'gold' | 'silver' | 'standard';

export interface FinancialNetworkDoc {
  userId: string;
  debtId?: string;
  contactName?: string;
  contactPhone?: string;
  isBusiness?: boolean;
  debtType?: string;
  amount?: number;
}

/** Expense category labels that suggest higher-value users. */
const HIGH_VALUE_CATEGORY_PATTERNS: RegExp[] = [
  /investment/i,
  /real\s*estate|realestate|property|land|plot/i,
  /premium\s*software|software|saas|subscription.*pro/i,
  /mutual\s*fund|stock|share|trading|crypto|bond/i,
  /gold|jewel/i,
  /business|startup|inventory/i,
  /vehicle|car\s*loan|auto/i,
];

/** Creditor / counterparty names suggesting bank, MFS, or agency. */
const BANK_OR_AGENCY_PATTERNS: RegExp[] = [
  /\b(bank|bkash|nagad|rocket|upay|mfs|nfc|visa|mastercard|emi\s*card)\b/i,
  /\b(agency|ltd|limited|plc|inc|shop|store|mart|plaza|showroom)\b/i,
  /ব্যাংক|এজেন্সি|লিমিটেড|শপ|স্টোর/i,
];

export function categoryHighValueScore(categoryLabels: string[]): number {
  let hits = 0;
  for (const cat of categoryLabels) {
    const c = String(cat || '');
    if (!c.trim()) continue;
    if (HIGH_VALUE_CATEGORY_PATTERNS.some((re) => re.test(c))) hits++;
  }
  return Math.min(25, 8 + hits * 6);
}

export function incomeTierScore(monthlyIncome: number): number {
  const x = Number(monthlyIncome) || 0;
  if (x <= 0) return 4;
  if (x < 15_000) return 8;
  if (x < 40_000) return 14;
  if (x < 100_000) return 20;
  if (x < 250_000) return 26;
  return 30;
}

/** Last 30d transaction count for this user (any type with a date). */
export function consistencyScore(txCountLast30Days: number, isPowerSegment: boolean): number {
  let s = 6;
  if (txCountLast30Days >= 1) s = 14;
  if (txCountLast30Days >= 4) s = 20;
  if (txCountLast30Days >= 10) s = 26;
  if (txCountLast30Days >= 20) s = 30;
  if (isPowerSegment) s = Math.min(30, s + 4);
  return Math.min(30, s);
}

export function creditorProfileScore(network: FinancialNetworkDoc[]): number {
  if (!network.length) return 4;
  let s = 8;
  const businessCount = network.filter((n) => n.isBusiness === true).length;
  s += Math.min(10, businessCount * 4);
  for (const n of network) {
    const name = String(n.contactName || '');
    if (BANK_OR_AGENCY_PATTERNS.some((re) => re.test(name))) {
      s += 5;
      break;
    }
  }
  return Math.min(15, s);
}

export function computeLqi(input: {
  monthlyIncome: number;
  txCountLast30Days: number;
  isPowerSegment: boolean;
  expenseCategoryLabels: string[];
  financialNetwork: FinancialNetworkDoc[];
}): number {
  const a = incomeTierScore(input.monthlyIncome);
  const b = consistencyScore(input.txCountLast30Days, input.isPowerSegment);
  const c = categoryHighValueScore(input.expenseCategoryLabels);
  const d = creditorProfileScore(input.financialNetwork);
  return Math.max(1, Math.min(100, Math.round(a + b + c + d)));
}

export function leadTierFromLqi(lqi: number): LeadTier {
  if (lqi >= 72) return 'gold';
  if (lqi >= 48) return 'silver';
  return 'standard';
}

export function isMerchantProspect(network: FinancialNetworkDoc[]): boolean {
  if (network.some((n) => n.isBusiness === true)) return true;
  return network.some((n) => BANK_OR_AGENCY_PATTERNS.some((re) => re.test(String(n.contactName || ''))));
}

export const LEAD_BADGE_LABELS: Record<LeadTier, string> = {
  gold: 'Gold Lead',
  silver: 'Silver Lead',
  standard: '—',
};

export function merchantProspectLabel(): string {
  return 'Merchant Prospect';
}
