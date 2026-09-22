import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import type { StateKey } from '@/lib/stageState';
import { LampGlow, type LampSize } from './LampGlow';

export interface ReadyStateProps {
  /** Headline, e.g. "Porchlight is watching Margaret's line". */
  title: React.ReactNode;
  /** Secondary line, e.g. "Calls to +1 (401) 555-0100 are screened automatically". */
  subtitle?: React.ReactNode;
  /** Lamp tint (default 'idle' amber, breathing). */
  state?: StateKey;
  /** Lamp size (default 'lg'). */
  lampSize?: LampSize | number;
  /** 'stage' = projector type (56px title), 'phone' = 30px title. */
  size?: 'stage' | 'phone';
  /** Extra content under the subtitle (e.g. member name / passkey status). */
  children?: React.ReactNode;
  className?: string;
}

/** Idle screen: breathing lamp + title + subtitle, centered. Fades in on mount. */
export function ReadyState({
  title,
  subtitle,
  state = 'idle',
  lampSize = 'lg',
  size = 'stage',
  children,
  className,
}: ReadyStateProps) {
  const reduce = useReducedMotion();
  const stage = size === 'stage';
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={cn('flex flex-col items-center justify-center text-center', stage ? 'gap-6' : 'gap-3', className)}
    >
      <LampGlow state={state} size={lampSize} className="text-foreground" />
      <h1 className={cn('font-bold tracking-tight text-balance', stage ? 'text-[56px] leading-tight' : 'text-[30px] leading-tight')}>
        {title}
      </h1>
      {subtitle != null && (
        <p className={cn('max-w-3xl text-muted-foreground text-balance', stage ? 'text-[26px]' : 'text-base')}>{subtitle}</p>
      )}
      {children}
    </motion.div>
  );
}
