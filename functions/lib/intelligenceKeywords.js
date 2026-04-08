"use strict";
/**
 * Keep in sync with `src/lib/intelligenceKeywords.ts` (app bundle).
 * Used by Cloud Functions to merge marketingTags when writes bypass the web client.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTELLIGENCE_RULES = void 0;
exports.scanForIntelligence = scanForIntelligence;
exports.INTELLIGENCE_RULES = [
    { pattern: /\bcity\s*bank\b/i, tags: ["Premium Banking", "City Bank User"], bucket: "premium_banking" },
    { pattern: /\bebl\b|\beastern\s+bank\b/i, tags: ["Premium Banking", "EBL User"], bucket: "premium_banking" },
    { pattern: /\bscb\b|standard\s*chartered/i, tags: ["Premium Banking", "SCB User"], bucket: "premium_banking" },
    {
        pattern: /\bamex\b|american\s+express/i,
        tags: ["Premium Banking", "Amex User", "Credit Card User"],
        bucket: "premium_signal",
    },
    { pattern: /credit\s*card/i, tags: ["Credit Card User"], bucket: "premium_signal" },
    { pattern: /loan\s*repayment/i, tags: ["Loan Repayment"], bucket: "premium_signal" },
    { pattern: /\bbkash\b|বিকাশ/i, tags: ["bKash User", "Digital Wallet User"], bucket: "digital_wallet" },
    { pattern: /\bnagad\b|নগদ/i, tags: ["Nagad User", "Digital Wallet User"], bucket: "digital_wallet" },
    { pattern: /\brocket\b/i, tags: ["Rocket User", "Digital Wallet User"], bucket: "digital_wallet" },
    { pattern: /\bupay\b/i, tags: ["Upay User", "Digital Wallet User"], bucket: "digital_wallet" },
    { pattern: /\bzakat\b|জাকাত/i, tags: ["Zakat Payer"], bucket: "solvency_religious" },
    { pattern: /\bdonation\b|\bdonate\b|দান/i, tags: ["Donor"], bucket: "solvency_religious" },
    { pattern: /as[-\s]?sunnah|assunnah/i, tags: ["As-Sunnah"], bucket: "solvency_religious" },
    { pattern: /\bcharity\b/i, tags: ["Charity"], bucket: "solvency_religious" },
    { pattern: /\bhajj\b|হজ্/i, tags: ["Hajj"], bucket: "solvency_religious" },
    { pattern: /\bumrah\b|উমরাহ/i, tags: ["Umrah"], bucket: "solvency_religious" },
];
function scanForIntelligence(text) {
    const s = String(text ?? "").normalize("NFKC");
    if (!s.trim())
        return [];
    const out = new Set();
    for (const rule of exports.INTELLIGENCE_RULES) {
        if (rule.pattern.test(s)) {
            rule.tags.forEach((t) => out.add(t));
        }
    }
    return [...out].sort((a, b) => a.localeCompare(b));
}
//# sourceMappingURL=intelligenceKeywords.js.map