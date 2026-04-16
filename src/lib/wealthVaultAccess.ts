import type { UserProfile } from '../contexts/AuthContext';

/** Wealth Vault + Zakat calculator: available to all signed-in users. */
export function isWealthVaultUnlocked(_profile: UserProfile | null | undefined): boolean {
  return true;
}
