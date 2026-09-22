import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Lightbulb,
  Loader2,
  PhoneOutgoing,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusDot, type StatusTone } from './StatusDot';
import { useOperatorController } from './useOperatorController';
import { useOperatorVisible } from './useOperatorVisible';

/** Shape of the `status/bridge` doc (D-12) plus an optional free-form message. */
export interface OperatorStatus {
  /** Pi lamp reachable (undefined = unknown). */
  piOk?: boolean;
  /** Number of reachable Hue bulbs (undefined = unknown). */
  hueReachable?: number;
  /** Last bridge heartbeat, epoch ms (undefined = never). */
  lastBeat?: number;
  /** Optional one-line status/result message (e.g. "Reset done"). */
  message?: string;
}

export type OperatorAction = 'reset' | 'sim' | 'attack' | 'soundboard' | 'lamp';

export interface OperatorBarProps {
  onReset?: () => void;
  onSim?: () => void;
  onAttack?: () => void;
  /** Soundboard toggle; button hidden if omitted. */
  onSoundboard?: () => void;
  soundboardOn?: boolean;
  /** Lamp test; button hidden if omitted. */
  onLampTest?: () => void;
  status?: OperatorStatus;
  /** Action currently in flight -> that button shows a spinner and all buttons disable. */
  busy?: OperatorAction | null;
  /** Start collapsed to the status pill (default false). */
  defaultCollapsed?: boolean;
  /** If given, shows an X that hides the bar (pair with useOperatorVisible's setVisible(false)). */
  onClose?: () => void;
  className?: string;
  /**
   * 06-D: when true (default) any handler / status / busy / soundboardOn you omit is filled
   * in from the live `useOperatorController()` (resetDemo, simulated scam, attackCall,
   * attackClips soundboard, lamp test, `status/bridge`). Explicit props always win.
   * Set false for a purely presentational bar (e.g. /styleguide).
   */
  connected?: boolean;
  /**
   * 06-D: when true, the bar ignores D-09 visibility and always renders. Default false:
   * the bar gates itself with useOperatorVisible (`?op=1` or press `o` 3x) and shows an X
   * to hide, so `<OperatorBar />` alone is a complete drop-in.
   */
  alwaysVisible?: boolean;
}

const STALE_MS = 60_000;

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function beatLabel(lastBeat: number | undefined, now: number): { tone: StatusTone; text: string } {
  if (!lastBeat) return { tone: 'off', text: 'no beat' };
  const s = Math.max(0, Math.round((now - lastBeat) / 1000));
  const text = s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
  return { tone: now - lastBeat > STALE_MS ? 'bad' : 'ok', text };
}

/**
 * Floating operator console (D-09): dark glass, bottom-right, collapsible, always dark.
 * `<OperatorBar />` with no props is fully wired (live actions + status/bridge) and hides
 * itself until `?op=1` / `o` x3. See `connected` / `alwaysVisible` to opt out.
 */
export function OperatorBar(props: OperatorBarProps) {
  const { connected = true, alwaysVisible = false, onClose } = props;
  const [visible, setVisible] = useOperatorVisible();
  const show = alwaysVisible || visible;
  const live = useOperatorController(connected && show);
  if (!show) return null;
  const pick = <K extends keyof OperatorBarProps>(k: K, fallback: OperatorBarProps[K]) =>
    props[k] !== undefined ? props[k] : connected ? fallback : undefined;
  const status = connected
    ? { ...live.status, ...stripUndefined(props.status ?? {}) }
    : props.status;
  return (
    <OperatorBarView
      {...props}
      onReset={pick('onReset', live.onReset)}
      onSim={pick('onSim', live.onSim)}
      onAttack={pick('onAttack', live.onAttack)}
      onSoundboard={pick('onSoundboard', live.onSoundboard)}
      soundboardOn={pick('soundboardOn', live.soundboardOn)}
      onLampTest={pick('onLampTest', live.onLampTest)}
      busy={props.busy !== undefined ? props.busy : connected ? live.busy : null}
      status={status}
      onClose={
        alwaysVisible && !onClose
          ? undefined
          : () => {
              onClose?.();
              setVisible(false);
            }
      }
    />
  );
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** Presentational bar (the 06-A OperatorBar body). */
function OperatorBarView({
  onReset,
  onSim,
  onAttack,
  onSoundboard,
  soundboardOn,
  onLampTest,
  status,
  busy = null,
  defaultCollapsed = false,
  onClose,
  className,
}: OperatorBarProps) {
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const now = useNow();
  const beat = beatLabel(status?.lastBeat, now);
  const piTone: StatusTone = status?.piOk === undefined ? 'off' : status.piOk ? 'ok' : 'bad';
  const hue = status?.hueReachable;
  const hueTone: StatusTone = hue === undefined ? 'off' : hue > 0 ? 'ok' : 'bad';

  const statusRow = (
    <div className="flex items-center gap-4 text-xs text-white/75">
      <StatusDot tone={piTone} size={8} label="Pi" />
      <StatusDot tone={beat.tone} size={8} label={<span className="tabular">Bridge {beat.text}</span>} />
      <StatusDot tone={hueTone} size={8} label={<span className="tabular">Hue {hue ?? '–'}</span>} />
    </div>
  );

  const disabled = busy != null;
  const btn = (action: OperatorAction, onClick: (() => void) | undefined, icon: React.ReactNode, text: string, danger = false) =>
    onClick ? (
      <button
        type="button"
        key={action}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors',
          'bg-white/8 text-white hover:bg-white/15 disabled:opacity-50',
          'focus-visible:outline-2 focus-visible:outline-[var(--amber)]',
          danger && 'text-[var(--state-scam)]',
        )}
      >
        {busy === action ? <Loader2 size={16} className="animate-spin" /> : icon}
        {text}
      </button>
    ) : null;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'fixed right-4 bottom-4 z-50 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 text-white',
        'bg-[oklch(0.16_0.01_60/0.82)] shadow-[0_24px_60px_-12px_oklch(0_0_0/0.6)] backdrop-blur-xl',
        className,
      )}
      role="region"
      aria-label="Operator controls"
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--amber)]">Operator</span>
        {statusRow}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/10"
            aria-label={collapsed ? 'Expand operator controls' : 'Collapse operator controls'}
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="grid size-7 place-items-center rounded-lg text-white/70 hover:bg-white/10"
              aria-label="Hide operator controls"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-2 border-t border-white/10 px-3 py-3">
              {btn('reset', onReset, <RotateCcw size={16} />, 'Reset everything')}
              {btn('sim', onSim, <FlaskConical size={16} />, 'Simulated scam')}
              {btn('attack', onAttack, <PhoneOutgoing size={16} />, 'Attack call', true)}
              {btn(
                'soundboard',
                onSoundboard,
                soundboardOn ? <Volume2 size={16} /> : <VolumeX size={16} />,
                soundboardOn ? 'Soundboard on' : 'Soundboard off',
              )}
              {btn('lamp', onLampTest, <Lightbulb size={16} />, 'Lamp test')}
            </div>
            {status?.message && <div className="border-t border-white/10 px-3 py-2 text-xs text-white/70">{status.message}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
