import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, language: 'en' | 'bn') {
  const formatter = new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-US', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0,
  });
  return formatter.format(amount);
}

export type CurrencyKpiSegment = { emphasis: 'currency' | 'amount'; text: string };

/**
 * BDT string in display order — currency chunks are small, rest (digits, separators) large.
 * Handles bn-BD where ৳ often follows the number.
 */
export function formatCurrencyKpiSegments(
  amount: number,
  language: 'en' | 'bn'
): CurrencyKpiSegment[] {
  const formatter = new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-US', {
    style: 'currency',
    currency: 'BDT',
    minimumFractionDigits: 0,
  });
  const out: CurrencyKpiSegment[] = [];
  for (const p of formatter.formatToParts(amount)) {
    const emphasis: 'currency' | 'amount' = p.type === 'currency' ? 'currency' : 'amount';
    const last = out[out.length - 1];
    if (last && last.emphasis === emphasis) last.text += p.value;
    else out.push({ emphasis, text: p.value });
  }
  return out;
}
