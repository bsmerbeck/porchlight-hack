// Pitfall 7 (04-RESEARCH.md): there is no Firebase Auth in this project, so "which member is
// this phone?" is solved out-of-band with a plain localStorage pairing — explicitly
// scope-appropriate for a single-demo-household hackathon build (T-04-05, accepted).
const STORAGE_KEY = 'porchlight_member_id';

// 04-POLISH: paired (STORAGE_KEY set) and passkey-enrolled are now tracked separately. A
// phone can be "paired" (knows which member id it's acting as) without having completed the
// actual passkey ceremony on this device — DEMO.md step 4 already describes exactly this
// gap ("confirm they're enrolled [...] if not, they tap Enroll"), so `?member=` alone must
// never let Verify.tsx skip straight to the armed screen.
const ENROLLED_KEY = 'porchlight_passkey_enrolled';

/** Returns the memberId this phone is paired to, or null if unpaired. */
export function getPairedMemberId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-browsing / storage-disabled: treat as unpaired rather than throwing.
    return null;
  }
}

/** Pairs this phone to the given memberId. */
export function setPairedMemberId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // No-op if storage is unavailable — enrollment will simply need to be repeated.
  }
}

/**
 * True once this device has actually completed the passkey ceremony (finishPasskeyRegistration
 * succeeded) — the single source of truth for whether Verify.tsx may skip the "Enroll this
 * phone" screen. Being "paired" (see getPairedMemberId) is necessary but not sufficient.
 */
export function isPasskeyEnrolled(): boolean {
  try {
    return window.localStorage.getItem(ENROLLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Marks this device's passkey enrollment complete. Call only after finishPasskeyRegistration succeeds. */
export function setPasskeyEnrolled(): void {
  try {
    window.localStorage.setItem(ENROLLED_KEY, '1');
  } catch {
    // No-op if storage is unavailable — the enroll gate will simply ask again next load.
  }
}

/**
 * Returns the memberId named by a `?member=` query param, if any — used to pre-select which
 * member the enroll screen targets. This NEVER pairs or enrolls the phone by itself
 * (04-POLISH): a bare `?member=brenden` link must still show "Enroll this phone" so a
 * stranger who finds the URL can't skip the passkey ceremony.
 *
 * `&paired=1` is a documented escape hatch for the VER-05 link-fallback demo path — it
 * pairs the phone (skips the Enroll screen) WITHOUT marking a passkey enrolled, so
 * handleAnswer's WebAuthn attempt naturally falls through to the secure-link token path.
 * Useful for rehearsing the link-fallback flow without re-running the real passkey
 * ceremony on a device. Call once on page load, before reading
 * getPairedMemberId()/isPasskeyEnrolled().
 */
export function recoverPairedMemberIdFromQuery(search: string = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const fromQuery = params.get('member');
  if (!fromQuery) return null;

  if (params.get('paired') === '1') {
    setPairedMemberId(fromQuery);
  }

  return fromQuery;
}
