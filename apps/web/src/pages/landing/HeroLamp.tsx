import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { LampGlow, STATE_VISUALS, type StateKey } from '@/components/porch';

interface Beat {
  state: StateKey;
  label: string;
  caption: string;
  ms: number;
}

// A scam call, told by the lamp: watching -> screening -> asking family -> blocked.
const BEATS: Beat[] = [
  { state: 'idle', label: 'Watching', caption: "Porchlight is watching Mom's line", ms: 3200 },
  { state: 'screening', label: 'Screening', caption: '"Grandma, it\'s me. I\'m in trouble…"', ms: 2800 },
  { state: 'verifying', label: 'Asking family', caption: 'Sarah gets a tap: "Is this really Jake?"', ms: 2800 },
  { state: 'scam', label: 'Scam blocked', caption: 'Sarah taps No. The lamp turns red.', ms: 3400 },
];

/** Hero visual: animated LampGlow that walks through one scam call. Static idle under reduced motion. */
export function HeroLamp() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % BEATS.length), BEATS[i].ms);
    return () => window.clearTimeout(t);
  }, [i, reduce]);

  const beat = reduce ? BEATS[0] : BEATS[i];
  const color = STATE_VISUALS[beat.state].colorVar;

  return (
    <div className="relative flex flex-col items-center">
      {/* CSS width overrides the SVG width attr so one lamp scales 220px -> 300px. */}
      <LampGlow state={beat.state} size={300} className="h-auto w-[220px] text-foreground md:w-[300px]" />
      <div className="mt-2 flex min-h-[4.5rem] w-full max-w-xs flex-col items-center gap-2 text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-semibold tracking-wide uppercase shadow-soft"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: color, transition: 'background-color 400ms ease' }}
          />
          {beat.label}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={beat.caption}
            className="text-sm text-muted-foreground"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
          >
            {beat.caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
