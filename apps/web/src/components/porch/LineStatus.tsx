import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 06-K: result of the `lineStatus` callable. busy null = unknown (Twilio error / not yet checked). */
export interface LineStatus {
  busy: boolean | null;
  since?: number;
  checkedAt?: number;
}

const UNKNOWN: LineStatus = { busy: null };

// One shared poller per page, however many components subscribe (OperatorBar + /stage header).
let current: LineStatus = UNKNOWN;
const listeners = new Set<(s: LineStatus) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let pollInterval = 4000;
let inFlight = false;

function publish(s: LineStatus) {
  current = s;
  listeners.forEach((l) => l(s));
}

async function pollOnce() {
  if (inFlight) return;
  inFlight = true;
  try {
    const [{ fns }, { httpsCallable }] = await Promise.all([import('@/lib/firebase'), import('firebase/functions')]);
    const res = await httpsCallable<Record<string, never>, LineStatus>(fns, 'lineStatus')({});
    publish({ busy: res.data.busy ?? null, since: res.data.since, checkedAt: res.data.checkedAt ?? Date.now() });
  } catch (err) {
    console.warn('lineStatus unavailable', err);
    publish({ busy: null, checkedAt: Date.now() });
  } finally {
    inFlight = false;
  }
}

function schedule() {
  clearTimeout(timer);
  timer = undefined;
  if (listeners.size === 0 || document.visibilityState !== 'visible') return;
  timer = setTimeout(async () => {
    await pollOnce();
    schedule();
  }, pollInterval);
}

function onVisibility() {
  if (document.visibilityState === 'visible') {
    void pollOnce();
    schedule();
  } else {
    clearTimeout(timer);
    timer = undefined;
  }
}

/** Polls `lineStatus` every pollMs while the page is visible and `enabled`. */
export function useLineStatus(pollMs = 4000, enabled = true): LineStatus {
  const [status, setStatus] = useState<LineStatus>(current);
  useEffect(() => {
    if (!enabled) return;
    pollInterval = pollMs;
    listeners.add(setStatus);
    setStatus(current);
    if (listeners.size === 1) {
      document.addEventListener('visibilitychange', onVisibility);
      if (document.visibilityState === 'visible') void pollOnce();
      schedule();
    }
    return () => {
      listeners.delete(setStatus);
      if (listeners.size === 0) {
        document.removeEventListener('visibilitychange', onVisibility);
        clearTimeout(timer);
        timer = undefined;
      }
    };
  }, [enabled, pollMs]);
  return enabled ? status : UNKNOWN;
}

export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Compact pill: "On call · m:ss" (red) / "Line free" (green) / "Line ?" (grey). */
export function LineStatusPill({ status, className }: { status: LineStatus; className?: string }) {
  const now = useTick(status.busy === true);
  const busy = status.busy;
  const color = busy === true ? 'var(--state-scam)' : busy === false ? 'var(--state-verified)' : undefined;
  const text =
    busy === true ? `On call${status.since ? ` · ${formatElapsed(now - status.since)}` : ''}` : busy === false ? 'Line free' : 'Line ?';
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        busy === null && 'border-white/20 text-white/60',
        className,
      )}
      style={color ? { color, borderColor: `color-mix(in oklch, ${color} 55%, transparent)`, background: `color-mix(in oklch, ${color} 14%, transparent)` } : undefined}
      role="status"
      aria-label={busy === true ? 'Phone line on a call' : busy === false ? 'Phone line free' : 'Phone line status unknown'}
    >
      <Phone size={12} aria-hidden />
      {text}
    </span>
  );
}
