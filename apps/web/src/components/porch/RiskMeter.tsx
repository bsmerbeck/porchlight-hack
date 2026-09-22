import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { CreditCard, EyeOff, Gavel, Timer, VenetianMask, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { Tactic } from '@porchlight/shared';
import { cn } from '@/lib/utils';

export const TACTIC_META: Record<Tactic, { label: string; icon: LucideIcon }> = {
  urgency: { label: 'Urgency', icon: Timer },
  secrecy: { label: 'Secrecy', icon: EyeOff },
  payment_method: { label: 'Odd payment', icon: CreditCard },
  authority_bail: { label: 'Bail / authority', icon: Gavel },
  impersonation: { label: 'Impersonation', icon: VenetianMask },
};

/** Green below 40, amber 40-69, red 70+ (matches the scam threshold used on /stage). */
export function riskColor(score: number): string {
  if (score >= 70) return 'var(--state-scam)';
  if (score >= 40) return 'var(--state-verifying)';
  return 'var(--state-verified)';
}

export interface RiskMeterProps {
  /** Risk score 0-100 (clamped). */
  score: number;
  /** Detected tactics; rendered as chips with icons. Unknown strings get a generic icon. */
  tactics?: readonly (Tactic | string)[];
  /** 'stage' = projector scale (number ~96px, 18px chips), 'compact' = cards/phone. */
  size?: 'stage' | 'compact';
  /** Label above the bar (default "Scam risk"). Pass null to hide. */
  label?: React.ReactNode;
  className?: string;
}

/**
 * Spring-animated risk bar + tabular number + tactic chips. Fill color ramps
 * green -> amber -> red. Reduced motion = jumps straight to the value.
 */
export function RiskMeter({ score, tactics = [], size = 'stage', label = 'Scam risk', className }: RiskMeterProps) {
  const reduce = useReducedMotion();
  const target = Math.max(0, Math.min(100, Math.round(score || 0)));
  const spring = useSpring(target, { stiffness: 140, damping: 22, mass: 0.8 });
  const width = useTransform(spring, (v) => `${Math.max(0, Math.min(100, v))}%`);
  const shown = useTransform(spring, (v) => Math.round(v));

  useEffect(() => {
    if (reduce) spring.jump(target);
    else spring.set(target);
  }, [target, reduce, spring]);

  const color = riskColor(target);
  const stage = size === 'stage';

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end justify-between gap-4">
        {label != null && (
          <span className={cn('font-semibold uppercase tracking-[0.14em] text-muted-foreground', stage ? 'text-[18px]' : 'text-xs')}>
            {label}
          </span>
        )}
        <span className={cn('tabular font-black leading-none', stage ? 'text-[96px]' : 'text-3xl')} style={{ color, transition: 'color 300ms' }}>
          <motion.span>{shown}</motion.span>
          <span className={cn('font-semibold text-muted-foreground', stage ? 'text-[32px]' : 'text-base')}>/100</span>
        </span>
      </div>
      <div
        className={cn('relative mt-3 w-full overflow-hidden rounded-full bg-muted', stage ? 'h-6' : 'h-3')}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={target}
        aria-label="Scam risk"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width, backgroundColor: color, boxShadow: `0 0 24px ${color}`, transition: 'background-color 300ms' }}
        />
      </div>
      {tactics.length > 0 && (
        <ul className={cn('flex flex-wrap', stage ? 'mt-5 gap-3' : 'mt-3 gap-2')}>
          <AnimatePresence initial={false}>
            {tactics.map((t) => {
              const meta = TACTIC_META[t as Tactic] ?? { label: String(t).replace(/_/g, ' '), icon: AlertTriangle };
              const Icon = meta.icon;
              return (
                <motion.li
                  key={t}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, scale: 0.8, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                  className={cn(
                    'inline-flex items-center rounded-full border font-semibold',
                    stage ? 'gap-2 px-4 py-2 text-[18px]' : 'gap-1.5 px-2.5 py-1 text-xs',
                  )}
                  style={{
                    color: 'var(--state-scam)',
                    borderColor: 'color-mix(in oklch, var(--state-scam) 40%, transparent)',
                    backgroundColor: 'color-mix(in oklch, var(--state-scam) 12%, transparent)',
                  }}
                >
                  <Icon size={stage ? 20 : 14} />
                  {meta.label}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
