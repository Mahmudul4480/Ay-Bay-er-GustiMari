import type { UserProfile } from '../contexts/AuthContext';
import { isRamadanSeason } from './ramadan';

/** Wealth Vault + auto-zakat: open for Premium subscribers or everyone during Ramadan. */
export function isWealthVaultUnlocked(profile: UserProfile | null | undefined): boolean {
  if (profile?.isPremium === true) return true;
  return isRamadanSeason();
}
