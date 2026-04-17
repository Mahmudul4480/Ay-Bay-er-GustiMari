import React from 'react';
import { cn } from '../../lib/utils';

export interface WealthNumberFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  className?: string;
  /** Fires on focus / pointer down (mobile) for integrity hints. */
  onFieldInteract?: () => void;
}

/**
 * Large tap target, mobile-first BDT input.
 */
const WealthNumberField: React.FC<WealthNumberFieldProps> = ({
  id,
  label,
  hint,
  value,
  onChange,
  className,
  onFieldInteract,
}) => {
  const display = value > 0 ? String(value) : '';

  return (
    <label htmlFor={id} className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-bold uppercase tracking-wide text-cyan-100/90">
        {label}
      </span>
      {hint ? <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{hint}</span> : null}
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="1"
        placeholder="৳ 0"
        value={display}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onFocus={() => onFieldInteract?.()}
        onPointerDown={() => onFieldInteract?.()}
        className={cn(
          'min-h-[48px] w-full rounded-xl border border-white/20 bg-slate-950/40 px-3.5 py-3 text-base font-bold tabular-nums text-white',
          'shadow-[inset_0_2px_10px_rgba(0,0,0,0.35),0_4px_0_rgba(99,102,241,0.15)] outline-none transition-all',
          'placeholder:text-slate-500 focus:border-cyan-400/55 focus:ring-2 focus:ring-cyan-400/25',
          'focus:shadow-[inset_0_2px_10px_rgba(0,0,0,0.45),0_0_22px_rgba(34,211,238,0.2)]'
        )}
      />
    </label>
  );
};

export default WealthNumberField;
