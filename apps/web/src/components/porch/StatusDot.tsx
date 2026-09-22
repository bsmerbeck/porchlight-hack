import { cn } from '@/lib/utils';
import { STATE_VISUALS, type StateKey } from '@/lib/stageState';

export type StatusTone = 'ok' | 'warn' | 'bad' | 'off';

const TONE_COLOR: Record<StatusTone, string> = {
  ok: 'var(--state-verified)',
  warn: 'var(--state-verifying)',
  bad: 'var(--state-scam)',
  off: 'color-mix(in oklch, currentColor 35%, transparent)',
};

export interface StatusDotProps {
  /** Color by D-02 state key (e.g. 'scam'). */
  state?: StateKey;
  /** Color by health tone (ok=green, warn=amber, bad=red, off=grey). Overrides `state`. */
  tone?: StatusTone;
  /** Raw CSS color. Overrides `tone` and `state`. */
  color?: string;
  /** Adds an expanding pulse ring (disabled under prefers-reduced-motion). */
  pulse?: boolean;
  /** Dot diameter in px (default 10). */
  size?: number;
  /** Optional text rendered after the dot. */
  label?: React.ReactNode;
  className?: string;
}

/** Small colored status indicator, optionally pulsing, optionally labelled. */
export function StatusDot({ state, tone, color, pulse, size = 10, label, className }: StatusDotProps) {
  const c = color ?? (tone ? TONE_COLOR[tone] : STATE_VISUALS[state ?? 'idle'].colorVar);
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
        {pulse && (
          <span
            aria-hidden
            className="animate-pulse-ring absolute inset-0 rounded-full"
            style={{ backgroundColor: c }}
          />
        )}
        <span
          className="relative inline-block rounded-full transition-colors duration-300"
          style={{ width: size, height: size, backgroundColor: c, boxShadow: `0 0 ${size}px ${c}` }}
        />
      </span>
      {label != null && <span className="text-sm leading-none">{label}</span>}
    </span>
  );
}
