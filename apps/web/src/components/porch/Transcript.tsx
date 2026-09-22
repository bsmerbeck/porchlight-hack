import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CallTurn } from '@porchlight/shared';
import { cn } from '@/lib/utils';

export interface TranscriptProps {
  /** Conversation turns in order. `role: 'caller' | 'assistant'` (assistant = Porchlight). */
  turns: readonly CallTurn[];
  /** Show a typing shimmer row. `true` = Porchlight is speaking; or pass the role. */
  pending?: boolean | CallTurn['role'];
  /** 'stage' = 30-34px projector type (default), 'compact' = 16px for cards/phone. */
  size?: 'stage' | 'compact';
  /** Show only the last N turns (default: all). Useful on the projector. */
  maxTurns?: number;
  /** Speaker labels. */
  callerLabel?: React.ReactNode;
  assistantLabel?: React.ReactNode;
  /** Applied to the scroll container -- give it a height/max-height so it scrolls. */
  className?: string;
}

/**
 * Chat-style transcript. Caller turns sit left on a neutral surface; Porchlight turns sit
 * right with an amber tint. New turns slide in (<=300ms) and the container auto-scrolls to
 * the newest line. Reduced motion = no slide, instant scroll.
 */
export function Transcript({
  turns,
  pending,
  size = 'stage',
  maxTurns,
  callerLabel = 'Caller',
  assistantLabel = 'Porchlight',
  className,
}: TranscriptProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const shown = maxTurns ? turns.slice(-maxTurns) : turns;
  const stage = size === 'stage';
  const pendingRole: CallTurn['role'] | null = pending === true ? 'assistant' : pending ? pending : null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [turns.length, pendingRole, reduce]);

  return (
    <div ref={ref} className={cn('overflow-y-auto overscroll-contain scroll-smooth', className)}>
      <ol className={cn('flex flex-col', stage ? 'gap-5' : 'gap-2.5')}>
        <AnimatePresence initial={false}>
          {shown.map((t, i) => (
            <motion.li
              key={`${t.at}-${i + (turns.length - shown.length)}`}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <Bubble role={t.role} stage={stage} label={t.role === 'caller' ? callerLabel : assistantLabel}>
                {t.text}
              </Bubble>
            </motion.li>
          ))}
          {pendingRole && (
            <motion.li
              key="pending"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Bubble role={pendingRole} stage={stage} label={pendingRole === 'caller' ? callerLabel : assistantLabel}>
                <span className="porch-shimmer inline-flex items-center gap-1.5 rounded-md px-1" aria-label="speaking">
                  {[0, 1, 2].map((d) => (
                    <motion.span
                      key={d}
                      className={cn('inline-block rounded-full bg-current', stage ? 'size-3' : 'size-1.5')}
                      animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }}
                    />
                  ))}
                </span>
              </Bubble>
            </motion.li>
          )}
        </AnimatePresence>
      </ol>
    </div>
  );
}

function Bubble({
  role,
  stage,
  label,
  children,
}: {
  role: CallTurn['role'];
  stage: boolean;
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  const porch = role === 'assistant';
  return (
    <div className={cn('flex flex-col', porch ? 'items-end text-right' : 'items-start')}>
      <span
        className={cn(
          'mb-1 font-semibold uppercase tracking-[0.14em]',
          stage ? 'text-[16px]' : 'text-[11px]',
          porch ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          'max-w-[85%] rounded-3xl border leading-snug',
          stage ? 'px-7 py-4 text-[32px]' : 'px-3.5 py-2 text-base',
          porch ? 'rounded-tr-md' : 'rounded-tl-md bg-surface-2',
        )}
        style={
          porch
            ? {
                backgroundColor: 'color-mix(in oklch, var(--amber) 14%, transparent)',
                borderColor: 'color-mix(in oklch, var(--amber) 30%, transparent)',
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
