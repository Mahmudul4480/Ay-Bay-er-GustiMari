/**
 * Tags merged onto `users.marketingTags` for growth features (admin filters & targeting).
 * Keep in sync with filters in AdminDashboard marketing tag dropdown.
 */
export const GROWTH_MARKETING_TAGS = [
  'Persona: Saver',
  'Persona: Gourmet',
  'Persona: Spender',
  'Persona: Investor',
  'Persona: Balanced',
  'Wishlist User',
  'High Purchase Intent',
  'Wealth Vault User',
  'Net Worth Tracker',
  'Zakat Calculator User',
  'Donation Tracker',
] as const;

export function personaMarketingTag(personaLabel: string): string {
  return `Persona: ${personaLabel}`;
}
