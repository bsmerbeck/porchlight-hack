import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { STATE_VISUALS, type StateKey } from '@/lib/stageState';

export type LampSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_PX: Record<LampSize, number> = { sm: 96, md: 160, lg: 260, xl: 380 };

export interface LampGlowProps {
  /** D-02 state that tints the glow (default 'idle' = amber). */
  state?: StateKey;
  /** Preset ('sm' 96px, 'md' 160, 'lg' 260, 'xl' 380) or explicit width in px. Height = 1.2x. */
  size?: LampSize | number;
  className?: string;
}

/**
 * Animated SVG porch lantern whose glow is tinted by the D-02 state color.
 * idle breathes slowly, verifying pulses, screening shimmers gently, results hold steady.
 * Color changes crossfade (CSS transition on stop-color/fill). Reduced motion = static glow.
 * Replaces the old `components/Lamp.tsx` visually.
 */
export function LampGlow({ state = 'idle', size = 'md', className }: LampGlowProps) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const color = STATE_VISUALS[state].colorVar;
  const width = typeof size === 'number' ? size : SIZE_PX[size];

  const glowAnim = reduce
    ? { opacity: 0.9, scale: 1 }
    : state === 'verifying'
      ? { opacity: [0.55, 1, 0.55], scale: [0.94, 1.06, 0.94] }
      : state === 'idle' || state === 'ended'
        ? { opacity: [0.62, 0.95, 0.62], scale: [0.97, 1.03, 0.97] }
        : state === 'screening'
          ? { opacity: [0.75, 0.95, 0.75], scale: [0.99, 1.02, 0.99] }
          : { opacity: 1, scale: 1.04 };
  const glowTransition = reduce
    ? { duration: 0 }
    : state === 'verifying'
      ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const }
      : state === 'idle' || state === 'ended'
        ? { duration: 5, repeat: Infinity, ease: 'easeInOut' as const }
        : state === 'screening'
          ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const }
          : { duration: 0.4, ease: 'easeOut' as const };

  const stop = (o: number) => ({ stopColor: color, stopOpacity: o, transition: 'stop-color 400ms ease' });

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 240"
      width={width}
      height={width * 1.2}
      className={cn('shrink-0 overflow-visible', className)}
    >
      <defs>
        <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" style={stop(0.95)} />
          <stop offset="45%" style={stop(0.35)} />
          <stop offset="100%" style={stop(0)} />
        </radialGradient>
        <radialGradient id={`glass-${uid}`} cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="white" stopOpacity="0.95" />
          <stop offset="40%" style={stop(1)} />
          <stop offset="100%" style={stop(0.55)} />
        </radialGradient>
      </defs>

      {/* halo */}
      <motion.circle
        cx="100"
        cy="118"
        r="112"
        fill={`url(#halo-${uid})`}
        style={{ transformOrigin: '100px 118px' }}
        animate={glowAnim}
        transition={glowTransition}
      />

      {/* wall bracket */}
      <path d="M22 70h36v10H32v80H22z" fill="currentColor" opacity="0.55" />
      {/* hanging hook */}
      <path d="M58 70h42v8H58z" fill="currentColor" opacity="0.55" />
      <path d="M96 74h8v20h-8z" fill="currentColor" opacity="0.6" />

      {/* cap */}
      <path d="M64 108l36-18 36 18v6H64z" fill="currentColor" opacity="0.8" />
      <path d="M70 114h60v8H70z" fill="currentColor" opacity="0.7" />

      {/* glass */}
      <path
        d="M74 122h52l-6 70H80z"
        fill={`url(#glass-${uid})`}
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="3"
      />
      {/* mullions */}
      <path d="M100 122v70" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" />
      <path d="M77 157h46" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />

      {/* base */}
      <path d="M76 192h48l-6 12H82z" fill="currentColor" opacity="0.8" />
      <path d="M96 204h8v8h-8z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
