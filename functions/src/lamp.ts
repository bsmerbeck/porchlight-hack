import { onDocumentWritten } from 'firebase-functions/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { CallDoc, HouseholdDoc } from '@porchlight/shared';

const REGION = 'us-central1';

// First whitespace-delimited token only — lamp/current must never carry more than a first
// name, per the phase's public-read design (T-03-06).
function firstToken(value: string | undefined | null): string | null {
  if (!value) return null;
  const token = value.trim().split(/\s+/)[0];
  return token || null;
}

async function resolveName(after: CallDoc): Promise<string | null> {
  if (after.state === 'verified' && after.verification?.memberId) {
    const householdSnap = await getFirestore().doc(`households/${after.householdId}`).get();
    const household = householdSnap.data() as HouseholdDoc | undefined;
    const member = household?.members?.find((m) => m.id === after.verification?.memberId);
    if (member) return firstToken(member.name);
    // Member id didn't resolve (bad data) — fall through to the claimedIdentity fallback below
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
export const mirrorActiveCallToLamp = onDocumentWritten({ document: 'calls/{callId}', region: REGION }, async (event) => {
  const after = event.data?.after.data() as CallDoc | undefined;
  const db = getFirestore();
  const lampRef = db.doc('lamp/current');

  if (!after || after.state === 'ended') {
    // Only clear if this write's callId is the one currently mirrored — avoids a stale/ended
    // call clobbering a newer active call that started after this write's `after` was read.
    const current = (await lampRef.get()).data();
    if (current?.callId === event.params.callId) {
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
    callId: event.params.callId,
    name,
    updatedAt: FieldValue.serverTimestamp(),
  });
});
