import { useEffect, useState } from 'react';
import { format } from 'date-fns';

export interface LiveClockState {
  /** e.g. "Monday, 15 April 2026" */
  datePart: string;
  /** e.g. "10:30:05 AM" */
  timePart: string;
  /** Combined for screen readers */
  fullLabel: string;
}

/**
 * Updates every second with the live system date/time (local timezone).
 */
export function useLiveClock(): LiveClockState {
  const [state, setState] = useState<LiveClockState>(() => formatClockParts(new Date()));

  useEffect(() => {
    const tick = () => setState(formatClockParts(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return state;
}

function formatClockParts(now: Date): LiveClockState {
  const datePart = format(now, 'EEEE, d MMMM yyyy');
  const timePart = format(now, 'hh:mm:ss a');
  return {
    datePart,
    timePart,
    fullLabel: `${datePart} | ${timePart}`,
  };
}
