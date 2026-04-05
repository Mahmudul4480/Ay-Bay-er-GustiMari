import { useEffect, useState } from 'react';
import { getCurrentMonthKey } from '../lib/monthUtils';

/**
 * Tracks the calendar month key (YYYY-MM) in the user's local timezone.
 * Updates periodically and when the tab becomes visible so dashboards stay aligned
 * with the system date across month boundaries.
 */
export function useCurrentMonthKey(): string {
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);

  useEffect(() => {
    const sync = () => setMonthKey(getCurrentMonthKey());
    const id = window.setInterval(sync, 30_000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return monthKey;
}
