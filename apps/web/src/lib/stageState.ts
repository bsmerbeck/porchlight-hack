import type { CallDoc } from '@porchlight/shared';

/**
 * D-06: one source of truth for "what's on screen". Every surface (stage, verify, app,
 * sim) derives its view from the Firestore feed through this pure function, so a refresh
 * rebuilds exactly the same view.
 */
export const RESULT_HOLD_MS = 20_000;

export type StageMode = 'ready' | 'live' | 'result';

/** Minimal shape needed from a feed doc (CallDoc + optional top-level updatedAt). */
export type StageCallLike = Pick<CallDoc, 'state' | 'startedAt'> &
  Partial<Pick<CallDoc, 'endedAt' | 'outcome' | 'verification'>> & {
    updatedAt?: number;
  };

export interface StageState<T extends StageCallLike = StageCallLike> {
  mode: StageMode;
  call?: T;
}

export function isLiveCall(c: StageCallLike): boolean {
  return c.state === 'screening' || c.state === 'verifying';
}

/** Terminal = verified | scam | ended state, or a known/message outcome. */
export function isTerminalCall(c: StageCallLike): boolean {
  return (
    c.state === 'verified' ||
    c.state === 'scam' ||
    c.state === 'ended' ||
    c.outcome === 'known' ||
    c.outcome === 'message'
  );
}

/** When the call reached its terminal state: endedAt ?? answeredAt ?? updatedAt ?? startedAt. */
export function terminalAt(c: StageCallLike): number {
  return c.endedAt ?? c.verification?.answeredAt ?? c.updatedAt ?? c.startedAt;
}

/**
 * - live   = newest (by startedAt) call whose state is screening | verifying
 * - result = newest terminal call whose terminalAt is within `holdMs` of `now`
 * - ready  = otherwise
 */
export function deriveStageState<T extends StageCallLike>(
  feedDocs: readonly T[],
  now: number,
  holdMs: number = RESULT_HOLD_MS,
): StageState<T> {
  let live: T | undefined;
  let result: T | undefined;
  for (const c of feedDocs) {
    if (isLiveCall(c)) {
      if (!live || c.startedAt > live.startedAt) live = c;
    } else if (isTerminalCall(c)) {
      const at = terminalAt(c);
      if (now - at <= holdMs && (!result || at > terminalAt(result))) result = c;
    }
  }
  if (live) return { mode: 'live', call: live };
  if (result) return { mode: 'result', call: result };
  return { mode: 'ready' };
}

/** D-02 visual keys. 'ended' = a plain hang-up/screened call (neutral amber). */
export type StateKey =
  | 'idle'
  | 'screening'
  | 'verifying'
  | 'verified'
  | 'known'
  | 'scam'
  | 'message'
  | 'ended';

export interface StateVisual {
  key: StateKey;
  label: string;
  /** CSS color expression, e.g. `var(--state-scam)`. */
  colorVar: string;
}

export const STATE_VISUALS: Record<StateKey, StateVisual> = {
  idle: { key: 'idle', label: 'WATCHING', colorVar: 'var(--state-idle)' },
  screening: { key: 'screening', label: 'SCREENING', colorVar: 'var(--state-screening)' },
  verifying: { key: 'verifying', label: 'VERIFYING…', colorVar: 'var(--state-verifying)' },
  verified: { key: 'verified', label: 'VERIFIED', colorVar: 'var(--state-verified)' },
  known: { key: 'known', label: 'KNOWN CALLER', colorVar: 'var(--state-known)' },
  scam: { key: 'scam', label: 'SCAM BLOCKED', colorVar: 'var(--state-scam)' },
  message: { key: 'message', label: 'MESSAGE TAKEN', colorVar: 'var(--state-message)' },
  ended: { key: 'ended', label: 'CALL ENDED', colorVar: 'var(--state-idle)' },
};

/** Resolve the D-02 key for a call (outcome wins over state). Undefined call = idle. */
export function stateKey(call?: Pick<StageCallLike, 'state' | 'outcome'> | null): StateKey {
  if (!call) return 'idle';
  if (call.outcome === 'known') return 'known';
  if (call.outcome === 'message') return 'message';
  if (call.outcome === 'scam' || call.state === 'scam') return 'scam';
  if (call.outcome === 'verified' || call.state === 'verified') return 'verified';
  if (call.state === 'verifying') return 'verifying';
  if (call.state === 'screening') return 'screening';
  if (call.state === 'ended') return 'ended';
  return 'idle';
}

/** Map state + outcome to `{key, label, colorVar}` per D-02. */
export function stateVisual(call?: Pick<StageCallLike, 'state' | 'outcome'> | null): StateVisual {
  return STATE_VISUALS[stateKey(call)];
}
