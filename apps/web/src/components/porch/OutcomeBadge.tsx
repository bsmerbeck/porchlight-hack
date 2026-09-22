import type { CallDoc, CallState } from '@porchlight/shared';
import { cn } from '@/lib/utils';
import { STATE_VISUALS, stateKey, type StateKey } from '@/lib/stageState';
import { STATE_ICONS } from './StateBanner';

const BADGE_LABEL: Record<StateKey, string> = {
  idle: 'Idle',
  screening: 'Screening',
  verifying: 'Verifying',
  verified: 'Verified',
  known: 'Known caller',
  scam: 'Scam blocked',
  message: 'Message taken',
  ended: 'Ended',
};

export interface OutcomeBadgeProps {
  /** CallDoc outcome ('verified' | 'scam' | 'screened' | 'known' | 'message'). */
  outcome?: CallDoc['outcome'];
  /** CallDoc state; combined with `outcome` via stateVisual rules (outcome wins). */
  state?: CallState;
  /** Explicit D-02 key; overrides outcome/state. */
  visual?: StateKey;
  /** Override the label text. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Pill badge in the D-02 state color. Pass an `outcome`, a `state`, both, or a `visual` key.
 * With only `outcome: undefined` (call still active) it renders "Screening" (blue).
 */
export function OutcomeBadge({ outcome, state, visual, label, size = 'md', className }: OutcomeBadgeProps) {
  const key: StateKey =
    visual ??
    (outcome === 'screened' && !state
      ? 'ended'
      : stateKey({ state: state ?? (outcome ? 'ended' : 'screening'), outcome }));
  const v = STATE_VISUALS[key];
  const Icon = STATE_ICONS[key];
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border font-semibold',
        size === 'sm' && 'gap-1 px-2 py-0.5 text-xs',
        size === 'md' && 'gap-1.5 px-3 py-1 text-sm',
        size === 'lg' && 'gap-2 px-4 py-1.5 text-lg',
        className,
      )}
      style={{
        color: v.colorVar,
        borderColor: `color-mix(in oklch, ${v.colorVar} 40%, transparent)`,
        backgroundColor: `color-mix(in oklch, ${v.colorVar} 13%, transparent)`,
      }}
    >
      <Icon size={size === 'lg' ? 18 : size === 'md' ? 14 : 12} />
      {label ?? (outcome === 'screened' ? 'Screened' : BADGE_LABEL[key])}
    </span>
  );
}
