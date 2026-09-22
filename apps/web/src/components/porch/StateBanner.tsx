import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Fingerprint,
  Lamp,
  MessageSquareText,
  PhoneOff,
  ShieldCheck,
  ShieldX,
  UserCheck,
  AudioLines,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATE_VISUALS, type StateKey } from '@/lib/stageState';

export const STATE_ICONS: Record<StateKey, LucideIcon> = {
  idle: Lamp,
  screening: AudioLines,
  verifying: Fingerprint,
  verified: ShieldCheck,
  known: UserCheck,
  scam: ShieldX,
  message: MessageSquareText,
  ended: PhoneOff,
};

export type BannerSize = 'stage' | 'phone' | 'compact';

export interface StateBannerProps {
  /** D-02 state key; drives color, icon and default label. */
  state: StateKey;
  /** Override the default label (e.g. 'SCAM BLOCKED'). */
  label?: React.ReactNode;
  /** Secondary line under the label (e.g. "Brenden confirmed with a passkey"). */
  sub?: React.ReactNode;
  /** 'stage' = 88-120px projector type (default), 'phone' = 34px, 'compact' = 22px inline. */
  size?: BannerSize;
  className?: string;
}

const LABEL_CLS: Record<BannerSize, string> = {
  stage: 'text-[88px] xl:text-[120px] leading-[0.95] tracking-tight',
  phone: 'text-[34px] leading-tight tracking-tight',
  compact: 'text-[22px] leading-tight tracking-wide',
};
const ICON_PX: Record<BannerSize, number> = { stage: 96, phone: 36, compact: 22 };
const SUB_CLS: Record<BannerSize, string> = {
  stage: 'text-[30px] mt-4',
  phone: 'text-lg mt-1',
  compact: 'text-sm mt-0.5',
};

/**
 * Big state headline tinted by the D-02 state color. Crossfades (<=400ms) whenever
 * `state` or `label` changes; verifying pulses its icon. Reduced motion = instant swap.
 */
export function StateBanner({ state, label, sub, size = 'stage', className }: StateBannerProps) {
  const reduce = useReducedMotion();
  const v = STATE_VISUALS[state];
  const Icon = STATE_ICONS[state];
  const text = label ?? v.label;
  const key = `${state}:${typeof text === 'string' ? text : ''}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'relative overflow-hidden rounded-3xl border transition-colors duration-400',
        size === 'stage' ? 'px-12 py-10' : size === 'phone' ? 'px-6 py-5' : 'px-4 py-3',
        className,
      )}
      style={{
        color: v.colorVar,
        borderColor: `color-mix(in oklch, ${v.colorVar} 35%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${v.colorVar} 12%, transparent)`,
        boxShadow: size === 'compact' ? undefined : `0 0 80px -24px ${v.colorVar}`,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0, y: 12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={reduce ? undefined : { opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: reduce ? 0 : 0.3, ease: 'easeOut' }}
          className={cn('flex items-center', size === 'stage' ? 'gap-8' : 'gap-3')}
        >
          <motion.span
            className="shrink-0"
            animate={!reduce && state === 'verifying' ? { scale: [1, 1.12, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
            transition={!reduce && state === 'verifying' ? { duration: 1.2, repeat: Infinity } : { duration: 0 }}
          >
            <Icon size={ICON_PX[size]} strokeWidth={size === 'stage' ? 2.25 : 2} />
          </motion.span>
          <div className="min-w-0">
            <div className={cn('font-extrabold uppercase', LABEL_CLS[size])}>{text}</div>
            {sub != null && <div className={cn('font-medium text-foreground/80', SUB_CLS[size])}>{sub}</div>}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
