import { startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

/** e.g. "2026-04" in local timezone */
export function getMonthKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function getCurrentMonthKey(): string {
  return getMonthKeyFromDate(new Date());
}

export function parseMonthKey(monthKey: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, monthIndex: month - 1 };
}

/** Shift a YYYY-MM key by a number of months (negative = past). */
export function addMonthsToMonthKey(monthKey: string, deltaMonths: number): string | null {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return null;
  const d = new Date(parsed.year, parsed.monthIndex + deltaMonths, 1);
  return getMonthKeyFromDate(d);
}

/** Clamp scheduled day to a valid calendar day in that month */
export function dateForScheduledDayInMonth(year: number, monthIndex: number, dayOfMonth: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const day = Math.min(Math.max(1, Math.floor(dayOfMonth)), lastDay);
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

export function isDateInMonth(d: Date, monthKey: string): boolean {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return false;
  const start = startOfMonth(new Date(parsed.year, parsed.monthIndex, 1));
  const end = endOfMonth(start);
  return isWithinInterval(d, { start, end });
}

export function isTransactionInCurrentMonth(
  dateVal: { toDate?: () => Date } | Date | null | undefined,
  now: Date = new Date()
): boolean {
  const d =
    dateVal && typeof (dateVal as { toDate?: () => Date }).toDate === 'function'
      ? (dateVal as { toDate: () => Date }).toDate()
      : dateVal instanceof Date
        ? dateVal
        : null;
  if (!d || isNaN(d.getTime())) return false;
  return isDateInMonth(d, getMonthKeyFromDate(now));
}

export function getTransactionDate(
  tx: { date?: { toDate?: () => Date } | Date | null }
): Date | null {
  const raw = tx.date;
  if (!raw) return null;
  const d =
    typeof (raw as { toDate?: () => Date }).toDate === 'function'
      ? (raw as { toDate: () => Date }).toDate()
      : raw instanceof Date
        ? raw
        : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

export function isTransactionInMonthKey(
  tx: { date?: { toDate?: () => Date } | Date | null },
  monthKey: string
): boolean {
  const d = getTransactionDate(tx);
  if (!d) return false;
  return isDateInMonth(d, monthKey);
}
