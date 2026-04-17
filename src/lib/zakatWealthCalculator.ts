/**
 * Wealth Vault — Zakat worksheet (BDT).
 * UI helper only; consult a qualified scholar for Zakat rulings.
 */

export const ZAKAT_WEALTH_FIRESTORE_DOC_ID = 'zakatCalculator' as const;
export const DEFAULT_NISAB_BDT = 85_000;
export const ZAKAT_RATE = 0.025;
export const ZAKAT_CALCULATOR_SOURCE = 'zakat_calculator' as const;
export const ZAKAT_CALCULATOR_VERSION = 1 as const;

/** All currency fields in Bangladesh Taka (BDT). */
export interface ZakatWealthInputs {
  cashInHandBdt: number;
  bankBalanceBdt: number;
  mobileBankingBdt: number;
  goldValueBdt: number;
  silverValueBdt: number;
  shopInventoryBdt: number;
  wholesaleRetailBdt: number;
  lentMoneyBdt: number;
  businessDuesBdt: number;
  shareMarketBdt: number;
  savingsCertificatesBdt: number;
  dpsFdrBdt: number;
  debtsBdt: number;
  nisabBdt: number;
}

export type ZakatWealthFirestorePayload = ZakatWealthInputs & {
  source: typeof ZAKAT_CALCULATOR_SOURCE;
  version: typeof ZAKAT_CALCULATOR_VERSION;
  totalWealthBdt: number;
  zakatDueBdt: number;
};

function n(x: unknown): number {
  const v = Number(x);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function defaultZakatWealthInputs(): ZakatWealthInputs {
  return {
    cashInHandBdt: 0,
    bankBalanceBdt: 0,
    mobileBankingBdt: 0,
    goldValueBdt: 0,
    silverValueBdt: 0,
    shopInventoryBdt: 0,
    wholesaleRetailBdt: 0,
    lentMoneyBdt: 0,
    businessDuesBdt: 0,
    shareMarketBdt: 0,
    savingsCertificatesBdt: 0,
    dpsFdrBdt: 0,
    debtsBdt: 0,
    nisabBdt: DEFAULT_NISAB_BDT,
  };
}

/** Parse Firestore / unknown JSON into strict worksheet state. */
export function parseZakatWealthInputs(raw: unknown): ZakatWealthInputs {
  const d = defaultZakatWealthInputs();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  return {
    cashInHandBdt: n(o.cashInHandBdt),
    bankBalanceBdt: n(o.bankBalanceBdt),
    mobileBankingBdt: n(o.mobileBankingBdt),
    goldValueBdt: n(o.goldValueBdt),
    silverValueBdt: n(o.silverValueBdt),
    shopInventoryBdt: n(o.shopInventoryBdt),
    wholesaleRetailBdt: n(o.wholesaleRetailBdt),
    lentMoneyBdt: n(o.lentMoneyBdt),
    businessDuesBdt: n(o.businessDuesBdt),
    shareMarketBdt: n(o.shareMarketBdt),
    savingsCertificatesBdt: n(o.savingsCertificatesBdt),
    dpsFdrBdt: n(o.dpsFdrBdt),
    debtsBdt: n(o.debtsBdt),
    nisabBdt: o.nisabBdt != null && Number(o.nisabBdt) > 0 ? n(o.nisabBdt) : DEFAULT_NISAB_BDT,
  };
}

export interface ZakatWealthTotals {
  /** Sum of the five asset groups (before debts). */
  grossAssetsBdt: number;
  /** max(0, grossAssetsBdt - debtsBdt). */
  totalWealthBdt: number;
  /** Whether totalWealth meets or exceeds nisab. */
  meetsNisab: boolean;
  /** 2.5% of totalWealth if meetsNisab, else 0. */
  zakatDueBdt: number;
}

export function sumAssetInputs(i: ZakatWealthInputs): number {
  return (
    i.cashInHandBdt +
    i.bankBalanceBdt +
    i.mobileBankingBdt +
    i.goldValueBdt +
    i.silverValueBdt +
    i.shopInventoryBdt +
    i.wholesaleRetailBdt +
    i.lentMoneyBdt +
    i.businessDuesBdt +
    i.shareMarketBdt +
    i.savingsCertificatesBdt +
    i.dpsFdrBdt
  );
}

export function computeZakatWealthTotals(i: ZakatWealthInputs): ZakatWealthTotals {
  const grossAssetsBdt = sumAssetInputs(i);
  const totalWealthBdt = Math.max(0, grossAssetsBdt - i.debtsBdt);
  const meetsNisab = totalWealthBdt >= i.nisabBdt;
  const zakatDueBdt = meetsNisab ? Math.round(totalWealthBdt * ZAKAT_RATE * 100) / 100 : 0;
  return { grossAssetsBdt, totalWealthBdt, meetsNisab, zakatDueBdt };
}
