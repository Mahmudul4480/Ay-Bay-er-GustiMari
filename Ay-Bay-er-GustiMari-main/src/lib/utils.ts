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
