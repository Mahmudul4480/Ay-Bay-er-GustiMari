import React from 'react';
import { Clock } from 'lucide-react';
import { useLiveClock } from '../hooks/useLiveClock';
import { cn } from '../lib/utils';

interface LiveClockDateProps {
  className?: string;
  /** Larger typography for dashboard hero placement */
  prominent?: boolean;
}

/**
 * Real-time digital date and time (local system clock), ticking every second.
 * Example: Monday, 15 April 2026 | 10:30:05 AM
 */
const LiveClockDate: React.FC<LiveClockDateProps> = ({ className, prominent }) => {
  const { datePart, timePart, fullLabel } = useLiveClock();

  return (
    <div
      className={cn(
        'w-full max-w-full rounded-2xl border border-slate-200/90 bg-gradient-to-r from-white via-slate-50/80 to-white px-4 py-3 shadow-sm backdrop-blur-sm dark:border-slate-600/80 dark:from-slate-800/95 dark:via-slate-800/90 dark:to-slate-900/95 sm:px-6 sm:py-4',
        prominent && 'sm:py-5',
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={fullLabel}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
              prominent && 'h-11 w-11 sm:h-12 sm:w-12'
            )}
            aria-hidden
          >
            <Clock className={cn('h-5 w-5', prominent && 'sm:h-6 sm:w-6')} />
          </span>
          <p
            className={cn(
              'min-w-0 flex-1 font-semibold leading-snug tracking-tight text-slate-800 dark:text-slate-100',
              prominent ? 'text-base sm:text-lg md:text-xl' : 'text-sm sm:text-base md:text-lg'
            )}
          >
            <span className="break-words">{datePart}</span>
            <span className="mx-1.5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden>
              |
            </span>
            <span className="font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {timePart}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveClockDate;
