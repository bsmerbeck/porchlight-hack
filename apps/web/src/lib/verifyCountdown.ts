// Pure countdown arithmetic for the VER-02/04 full-screen Yes/No prompt — no DOM, unit
// testable without a browser. Verify.tsx drives the live countdown from a setInterval that
// calls these on each tick.
const WINDOW_MS = 20_000;

/** Whole seconds remaining in the 20s verify window, clamped to [0, 20]. */
export function computeSecondsLeft(promptedAt: number, now: number): number {
  const elapsed = now - promptedAt;
  const remainingMs = WINDOW_MS - elapsed;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

/** True once the countdown has run out — VER-04's timeout path fires on this. */
export function hasExpired(secondsLeft: number): boolean {
  return secondsLeft <= 0;
}
