import React from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { useMonthSelection } from '../contexts/MonthSelectionContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { addMonthsToMonthKey, getMonthKeyFromDate, parseMonthKey } from '../lib/monthUtils';

interface MonthPickerProps {
  className?: string;
  /** Larger controls + year/month dropdowns for dashboard header */
  variant?: 'default' | 'prominent';
}

const MONTH_NAMES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MonthPicker: React.FC<MonthPickerProps> = ({ className, variant = 'default' }) => {
  const { selectedMonthKey, currentMonthKey, setSelectedMonthKey } = useMonthSelection();
  const { language, t } = useLocalization();

  const parsed = parseMonthKey(selectedMonthKey);
  const currentParsed = parseMonthKey(currentMonthKey);
  const year = parsed?.year ?? new Date().getFullYear();
  const monthIndex = parsed?.monthIndex ?? 0;

  const monthLabel = React.useMemo(() => {
    const p = parseMonthKey(selectedMonthKey);
    if (!p) return selectedMonthKey;
    return new Date(p.year, p.monthIndex, 1).toLocaleString(
      language === 'bn' ? 'bn-BD' : 'en-US',
      { month: 'long', year: 'numeric' }
    );
  }, [selectedMonthKey, language]);

  const prevKey = addMonthsToMonthKey(selectedMonthKey, -1);
  const nextKey = addMonthsToMonthKey(selectedMonthKey, 1);
  const canGoNext = nextKey != null && nextKey <= currentMonthKey;

  const minYear = 2000;
  const maxYear = currentParsed?.year ?? new Date().getFullYear();
  const years = React.useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i),
    [maxYear]
  );

  const applyYearMonth = (y: number, mi: number) => {
    const key = getMonthKeyFromDate(new Date(y, mi, 1));
    if (key > currentMonthKey) {
      setSelectedMonthKey(currentMonthKey);
    } else {
      setSelectedMonthKey(key);
    }
  };

  const onYearChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = Number(e.target.value);
    const endP = parseMonthKey(currentMonthKey);
    if (!endP) return;
    let mi = monthIndex;
    if (y === endP.year && mi > endP.monthIndex) {
      mi = endP.monthIndex;
    }
    applyYearMonth(y, mi);
  };

  const onMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mi = Number(e.target.value);
    const endP = parseMonthKey(currentMonthKey);
    if (!endP) return;
    let y = year;
    if (y === endP.year && mi > endP.monthIndex) {
      applyYearMonth(endP.year, endP.monthIndex);
      return;
    }
    applyYearMonth(y, mi);
  };

  const monthDisabled = (mi: number) => {
    const endP = parseMonthKey(currentMonthKey);
    if (!endP) return false;
    if (year < endP.year) return false;
    return year === endP.year && mi > endP.monthIndex;
  };

  const prominent = variant === 'prominent';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-600 dark:bg-slate-800/80',
        prominent && 'gap-3 p-3 sm:p-4',
        className
      )}
    >
      <button
        type="button"
        onClick={() => prevKey && setSelectedMonthKey(prevKey)}
        disabled={!prevKey}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-white hover:text-slate-900 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
          prominent ? 'h-11 w-11' : 'h-10 w-10'
        )}
        aria-label={t('previousMonth')}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      {prominent ? (
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <label className="sr-only" htmlFor="dashboard-month-select">
            Month
          </label>
          <select
            id="dashboard-month-select"
            value={monthIndex}
            onChange={onMonthChange}
            className="min-w-[7rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {MONTH_NAMES_EN.map((name, mi) => (
              <option key={name} value={mi} disabled={monthDisabled(mi)}>
                {language === 'bn'
                  ? new Date(2000, mi, 1).toLocaleString('bn-BD', { month: 'long' })
                  : name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="dashboard-year-select">
            Year
          </label>
          <select
            id="dashboard-year-select"
            value={year}
            onChange={onYearChange}
            className="min-w-[5rem] rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className="hidden items-center gap-1.5 pl-1 sm:flex">
            <Calendar className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{monthLabel}</span>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 sm:px-2">
          <Calendar className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{monthLabel}</p>
            <label className="sr-only" htmlFor="month-picker-input">
              {t('selectMonth')}
            </label>
            <input
              id="month-picker-input"
              type="month"
              value={selectedMonthKey}
              max={currentMonthKey}
              min="2000-01"
              onChange={(e) => {
                const v = e.target.value;
                if (v) setSelectedMonthKey(v);
              }}
              className="mt-1 w-full max-w-[12rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => nextKey && canGoNext && setSelectedMonthKey(nextKey)}
        disabled={!canGoNext}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-white hover:text-slate-900 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white',
          prominent ? 'h-11 w-11' : 'h-10 w-10'
        )}
        aria-label={t('nextMonth')}
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {selectedMonthKey !== currentMonthKey && (
        <button
          type="button"
          onClick={() => setSelectedMonthKey(currentMonthKey)}
          className={cn(
            'w-full rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 sm:ml-1 sm:w-auto',
            prominent && 'py-2.5 sm:shrink-0'
          )}
        >
          {t('goToCurrentMonth')}
        </button>
      )}
    </div>
  );
};

export default MonthPicker;
