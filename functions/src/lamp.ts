import { onDocumentWritten } from 'firebase-functions/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { CallDoc, HouseholdDoc } from '@porchlight/shared';
import { slugifyName } from '@porchlight/shared';
import { verifyLinkSecret } from './secrets.js';
import { mintVerifyToken } from './verification/verifyLink.js';

const REGION = 'us-central1';

// D-10 / VER-02 / DASH-01: the states that clear a member's realtime prompt back to
// 'none' once a verdict has landed (or the call otherwise ended).
const PROMPT_CLEAR_STATES: ReadonlySet<CallDoc['state']> = new Set(['verified', 'scam', 'ended']);

// First whitespace-delimited token only — lamp/current must never carry more than a first
// name, per the phase's public-read design (T-03-06).
function firstToken(value: string | undefined | null): string | null {
  if (!value) return null;
  const token = value.trim().split(/\s+/)[0];
  return token || null;
}

async function resolveName(after: CallDoc): Promise<string | null> {
  if (after.state === 'verified' && after.verification?.memberId) {
    // 05-ALLOWLIST: an allowlist match already carries its own display name on the call
    // doc (no household lookup needed) -- cheapest and most reliable path first.
    if (after.verification.method === 'allowlist' && after.verification.name) {
      return firstToken(after.verification.name);
    }
    const householdSnap = await getFirestore().doc(`households/${after.householdId}`).get();
    const household = householdSnap.data() as HouseholdDoc | undefined;
    const member = household?.members?.find((m) => m.id === after.verification?.memberId);
    if (member) return firstToken(member.name);
    // 05-ALLOWLIST: member id didn't match a real household member -- it may be an
    // allowlist entry's slug (older doc without verification.name stored). Resolve it
    // the same way matchAllowlist.ts derives it, before falling through further.
    const allowlistEntry = household?.allowlist?.find((a) => slugifyName(a.name) === after.verification?.memberId);
    if (allowlistEntry) return firstToken(allowlistEntry.name);
    // Neither resolved (bad data) — fall through to the claimedIdentity fallback below
    // so the Pi still shows *something* rather than nothing.
  }
  // screening | verifying | scam (and a verified call whose memberId didn't resolve): show the
  // caller's claimed identity, if any — never a full name, never any other call field.
  return firstToken(after.risk?.claimedIdentity);
}

// Mirrors just the fields the Pi lamp needs out of the closed `calls/{id}` collection into a
// narrowly public `lamp/current` doc (firestore.rules: `allow get: if true; allow write: if false`).
// No other call field (transcript, risk detail, phone number) is ever mirrored here — see the
// phase's threat model (T-03-06).
// Phase 4 extends this SAME trigger (not a second onDocumentWritten on calls/{callId}) to
// also fan out prompts/{memberId} (VER-02) and households/{householdId}/feed/{callId}
// (DASH-01/02) — see 04-RESEARCH.md Pattern 3. secrets:[verifyLinkSecret] is required here
// because mintVerifyToken() reads it via verifyLinkSecret.value().
export const mirrorActiveCallToLamp = onDocumentWritten(
  { document: 'calls/{callId}', region: REGION, secrets: [verifyLinkSecret] },
  async (event) => {
    const after = event.data?.after.data() as CallDoc | undefined;
    const db = getFirestore();
    const lampRef = db.doc('lamp/current');
    const callId = event.params.callId;

    if (after) {
      // VER-02: fan the verifying state into the claimed member's realtime prompt doc,
      // carrying a fresh VER-05 single-use token; clear the prompt back to 'none' once a
      // verdict lands (or the call otherwise ends) so the phone's modal dismisses itself.
      if (after.state === 'verifying' && after.verification?.memberId) {
        await db.doc(`prompts/${after.verification.memberId}`).set({
          callId,
          state: 'verifying',
          claimedIdentity: after.risk?.claimedIdentity ?? null,
          promptedAt: after.verification.promptedAt,
          token: mintVerifyToken(callId, after.verification.memberId),
        });
      } else if (PROMPT_CLEAR_STATES.has(after.state) && after.verification?.memberId) {
        await db.doc(`prompts/${after.verification.memberId}`).set({ state: 'none' });
      }

      // DASH-01/02: mirror the full (locked D-05) call doc into the household's public feed
      // — the only other new public-read surface this trigger creates. `calls/{id}` itself
      // stays closed (D-10); `after` here came from a real Firestore read, so it never
      // contains an explicit `undefined` key (the Admin SDK cannot write one) and is safe
      // to `.set()` as-is.
      await db.doc(`households/${after.householdId}/feed/${callId}`).set(after);
    }

    if (!after || after.state === 'ended') {
      // Only clear if this write's callId is the one currently mirrored — avoids a
      // stale/ended call clobbering a newer active call that started after this write's
      // `after` was read.
      const current = (await lampRef.get()).data();
      if (current?.callId === callId) {
        await lampRef.set({
          state: 'idle',
          callId: null,
          name: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      return;
    }

    const name = await resolveName(after);

    await lampRef.set({
      state: after.state,
      callId,
      name,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);
