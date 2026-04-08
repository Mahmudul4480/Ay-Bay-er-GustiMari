import { isWithinInterval, parseISO, startOfDay } from 'date-fns';

/**
 * Inclusive Gregorian [start, end] when Ramadan typically falls (local calendar day).
 * Extend this list each year for Bangladesh / South Asia–oriented UX.
 */
const RAMADAN_GREGORIAN: readonly { start: string; end: string }[] = [
  { start: '2024-03-12', end: '2024-04-09' },
  { start: '2025-03-01', end: '2025-03-29' },
  { start: '2026-02-19', end: '2026-03-20' },
  { start: '2027-02-08', end: '2027-03-09' },
  { start: '2028-01-28', end: '2028-02-26' },
  { start: '2029-01-16', end: '2029-02-14' },
  { start: '2030-01-05', end: '2030-02-03' },
];

export function isRamadanSeason(date: Date = new Date()): boolean {
  const d = startOfDay(date);
  return RAMADAN_GREGORIAN.some(({ start, end }) =>
    isWithinInterval(d, {
      start: startOfDay(parseISO(start)),
      end: startOfDay(parseISO(end)),
    }),
  );
}
