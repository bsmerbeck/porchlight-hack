// Pitfall 7 (04-RESEARCH.md): there is no Firebase Auth in this project, so "which member is
// this phone?" is solved out-of-band with a plain localStorage pairing — explicitly
// scope-appropriate for a single-demo-household hackathon build (T-04-05, accepted).
const STORAGE_KEY = 'porchlight_member_id';

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
 * Recovery path (Pitfall 7): if this phone's localStorage was cleared between rehearsals,
 * a `?member=` query param on the URL re-pairs it without re-running the passkey ceremony.
 * Call once on page load, before reading getPairedMemberId().
 */
export function recoverPairedMemberIdFromQuery(search: string = window.location.search): void {
  if (getPairedMemberId()) return;
  const params = new URLSearchParams(search);
  const fromQuery = params.get('member');
  if (fromQuery) {
    setPairedMemberId(fromQuery);
  }
}
