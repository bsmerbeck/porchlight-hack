// bridge/settle.mjs — pure "settle to ready" timing logic (Phase 6, D-07).
//
// After a terminal verdict (verified / scam / ended) the room holds that colour for
// SETTLE_HOLD_MS measured from `lamp/current.updatedAt`, then the bridge drives the Pi + Hue
// back to idle LOCALLY (Firestore is never written -- lamp/current stays the audit truth).
// Mirrors apps/web's RESULT_HOLD_MS (D-06) so screens and lamp settle together.

export const SETTLE_HOLD_MS = 20_000;

export const TERMINAL_STATES = new Set(['verified', 'scam', 'ended']);

/** Firestore Timestamp | Date | epoch ms | undefined -> epoch ms | null */
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6);
  return null;
}

/**
 * How long until the room should settle to idle.
 * @param {{state?: string, updatedAt?: unknown}} data  lamp/current snapshot data
 * @param {number} now          epoch ms
 * @param {number} receivedAt   epoch ms the snapshot arrived (fallback when updatedAt missing/pending)
 * @returns {number|null}  null = not terminal (no settle); 0 = settle now; >0 = ms to wait
 */
export function settleDelayMs(data, now, receivedAt = now) {
  if (!data || !TERMINAL_STATES.has(data.state)) return null;
  const since = toMillis(data.updatedAt) ?? receivedAt;
  // Clamp to [0, HOLD] so a Mac/server clock skew can never stretch the hold past 20s.
  return Math.min(SETTLE_HOLD_MS, Math.max(0, since + SETTLE_HOLD_MS - now));
}

/** The state the bridge should actually render given the raw doc + whether it has settled. */
export function effectiveState(data, settled) {
  if (!data) return null;
  return settled && TERMINAL_STATES.has(data.state) ? 'idle' : data.state;
}
