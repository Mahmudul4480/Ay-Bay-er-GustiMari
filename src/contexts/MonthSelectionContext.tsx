import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { getCurrentMonthKey } from '../lib/monthUtils';
import { useCurrentMonthKey } from '../hooks/useCurrentMonthKey';

const STORAGE_KEY = 'aybay_selected_month_key';

function readStoredMonthKey(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && /^(\d{4})-(\d{2})$/.test(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function clampMonthKey(key: string, maxKey: string): string {
  return key > maxKey ? maxKey : key;
}

export interface MonthSelectionContextValue {
  /** Month shown on Dashboard / Transaction list (YYYY-MM), never after current calendar month */
  selectedMonthKey: string;
  /** Live calendar month (YYYY-MM), updates when the month rolls */
  currentMonthKey: string;
  setSelectedMonthKey: (key: string) => void;
}

const MonthSelectionContext = createContext<MonthSelectionContextValue | null>(null);

export function MonthSelectionProvider({ children }: { children: React.ReactNode }) {
  const currentMonthKey = useCurrentMonthKey();
  const [selectedMonthKey, setSelectedMonthKeyState] = useState(() => {
    const stored = readStoredMonthKey();
    const now = getCurrentMonthKey();
    if (stored) return clampMonthKey(stored, now);
    return now;
  });

  useEffect(() => {
    setSelectedMonthKeyState((prev) => clampMonthKey(prev, currentMonthKey));
  }, [currentMonthKey]);

  const setSelectedMonthKey = useCallback(
    (key: string) => {
      const k = clampMonthKey(key, currentMonthKey);
      setSelectedMonthKeyState(k);
      try {
        localStorage.setItem(STORAGE_KEY, k);
      } catch {
        /* ignore */
      }
    },
    [currentMonthKey]
  );

  const value = useMemo(
    (): MonthSelectionContextValue => ({
      selectedMonthKey,
      currentMonthKey,
      setSelectedMonthKey,
    }),
    [selectedMonthKey, currentMonthKey, setSelectedMonthKey]
  );

  return (
    <MonthSelectionContext.Provider value={value}>{children}</MonthSelectionContext.Provider>
  );
}

export function useMonthSelection(): MonthSelectionContextValue {
  const ctx = useContext(MonthSelectionContext);
  if (!ctx) {
    throw new Error('useMonthSelection must be used within a MonthSelectionProvider');
  }
  return ctx;
}
