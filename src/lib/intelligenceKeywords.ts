/**
 * Intelligence Keyword Scanner — Bangladesh market signals.
 * Matched tags are merged into `users/{userId}.marketingTags` (string array).
 */

export type IntelligenceBucket =
  | 'premium_banking'
  | 'premium_signal'
  | 'digital_wallet'
  | 'solvency_religious';

export interface IntelligenceRule {
  pattern: RegExp;
  tags: string[];
  bucket: IntelligenceBucket;
}

/** Ordered rules: first match still adds all listed tags; duplicates removed in scan output. */
export const INTELLIGENCE_RULES: IntelligenceRule[] = [
  // ── Premium Banking (institutions) → Blue family in admin UI
  { pattern: /\bcity\s*bank\b/i, tags: ['Premium Banking', 'City Bank User'], bucket: 'premium_banking' },
  { pattern: /\bebl\b|\beastern\s+bank\b/i, tags: ['Premium Banking', 'EBL User'], bucket: 'premium_banking' },
  { pattern: /\bscb\b|standard\s*chartered/i, tags: ['Premium Banking', 'SCB User'], bucket: 'premium_banking' },
  // ── Premium signals (cards / loans) → Gold family
  {
    pattern: /\bamex\b|american\s+express/i,
    tags: ['Premium Banking', 'Amex User', 'Credit Card User'],
    bucket: 'premium_signal',
  },
  { pattern: /credit\s*card/i, tags: ['Credit Card User'], bucket: 'premium_signal' },
  { pattern: /loan\s*repayment/i, tags: ['Loan Repayment'], bucket: 'premium_signal' },
  // ── Digital literacy (MFS)
  { pattern: /\bbkash\b|বিকাশ/i, tags: ['bKash User', 'Digital Wallet User'], bucket: 'digital_wallet' },
  { pattern: /\bnagad\b|নগদ/i, tags: ['Nagad User', 'Digital Wallet User'], bucket: 'digital_wallet' },
  { pattern: /\brocket\b/i, tags: ['Rocket User', 'Digital Wallet User'], bucket: 'digital_wallet' },
  { pattern: /\bupay\b/i, tags: ['Upay User', 'Digital Wallet User'], bucket: 'digital_wallet' },
  // ── Solvency / religious
  { pattern: /\bzakat\b|জাকাত/i, tags: ['Zakat Payer'], bucket: 'solvency_religious' },
  { pattern: /\bdonation\b|\bdonate\b|দান/i, tags: ['Donor'], bucket: 'solvency_religious' },
  { pattern: /as[-\s]?sunnah|assunnah/i, tags: ['As-Sunnah'], bucket: 'solvency_religious' },
  { pattern: /\bcharity\b/i, tags: ['Charity'], bucket: 'solvency_religious' },
  { pattern: /\bhajj\b|হজ্/i, tags: ['Hajj'], bucket: 'solvency_religious' },
  { pattern: /\bumrah\b|উমরাহ/i, tags: ['Umrah'], bucket: 'solvency_religious' },
];

const TAG_TO_BUCKET = new Map<string, IntelligenceBucket>();
for (const r of INTELLIGENCE_RULES) {
  for (const t of r.tags) {
    if (!TAG_TO_BUCKET.has(t)) TAG_TO_BUCKET.set(t, r.bucket);
  }
}

/**
 * Scan free text (category name, note, debt description, etc.) and return unique marketing tags.
 */
export function scanForIntelligence(text: string | null | undefined): string[] {
  const s = String(text ?? '').normalize('NFKC');
  if (!s.trim()) return [];
  const out = new Set<string>();
  for (const rule of INTELLIGENCE_RULES) {
    if (rule.pattern.test(s)) {
      rule.tags.forEach((t) => out.add(t));
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function getIntelligenceBucketForTag(tag: string): IntelligenceBucket {
  return TAG_TO_BUCKET.get(tag) ?? 'premium_banking';
}

/** All tags the scanner can emit (admin filter dropdown). */
export const MARKETING_TAGS_CATALOG: string[] = Array.from(
  new Set(INTELLIGENCE_RULES.flatMap((r) => r.tags)),
).sort((a, b) => a.localeCompare(b));
