import { cn } from '@/lib/utils';

export type LampColor = 'amber' | 'green' | 'red';

const GLOW_COLOR: Record<LampColor, string> = {
  amber: 'oklch(0.85 0.17 75)',
  green: 'oklch(0.75 0.19 145)',
  red: 'oklch(0.65 0.22 25)',
};

interface LampProps {
  /** Glow color — amber (default) is the landing page; Phase 3's /stage reuses this for green/red. */
  color?: LampColor;
  className?: string;
}

/**
 * Inline SVG porch lamp: a low-opacity silhouette (post + shade) behind a
 * breathing radial-gradient glow. No image asset — keeps the landing page
 * bundle light for bad venue Wi-Fi.
 */
export function Lamp({ color = 'amber', className }: LampProps) {
  const glowId = `lamp-glow-${color}`;
  const glowColor = GLOW_COLOR[color];

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 240"
      className={cn('lamp-glow w-48 md:w-72', className)}
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="36%" r="55%">
          <stop offset="0%" stopColor={glowColor} stopOpacity="1" />
          <stop offset="55%" stopColor={glowColor} stopOpacity="0.45" />
          <stop offset="100%" stopColor={glowColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="90" r="95" fill={`url(#${glowId})`} />
      {/* shade */}
      <path
        d="M52 62c0-27 21-49 48-49s48 22 48 49l12 34H40z"
        fill="currentColor"
        opacity="0.28"
      />
      {/* post + base */}
      <path
        d="M94 96h12v118H94zM58 226h84l-9-16H67z"
        fill="currentColor"
        opacity="0.28"
      />
    </svg>
  );
}
